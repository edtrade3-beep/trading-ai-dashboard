// src/news/store.js — dedicated Postgres table for news items, NOT the
// generic kv_store JSONB blob (src/atomic-write.js). Real finding before
// writing this: the generic KV store's own comments explicitly warn it's
// "not for generic high-volume item storage," citing a real prior OOM
// incident from an unbounded per-item store shaped exactly like news
// ingestion (hundreds of items/day). Same "dedicated table over the one
// shared pool" pattern src/future-wallet-store.js and
// src/dealership/photo-store.js already established, for the same reason.
//
// DB-only by design, same as future-wallet-store.js: if DATABASE_URL isn't
// configured, this module stays inert (no table, every query returns an
// honest empty/unavailable result) rather than half-emulating a relational
// store on disk — news feed/dedup/aggregation genuinely need real SQL, not
// a growing JSON array.
"use strict";

const { getPool } = require("../atomic-write");

const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const RETENTION_DAYS = 14; // real bound — a rolling 2-week news history is plenty for a trading feed, keeps the table small

let pool = null;

async function initNewsStore() {
  if (!DATABASE_URL) return; // no DB configured — stays inert, rest of the app unaffected
  pool = getPool();
  if (!pool) throw new Error("news/store: DATABASE_URL is set but atomic-write's shared pool isn't ready — check init order in server.js");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS news_items (
      id SERIAL PRIMARY KEY,
      dedupe_key TEXT UNIQUE NOT NULL,
      ticker TEXT NOT NULL,
      headline TEXT NOT NULL,
      source TEXT, url TEXT, summary TEXT,
      published_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      category TEXT, catalyst_weight INT,
      sentiment TEXT, sentiment_score INT,
      impact_score INT, freshness_score INT,
      confirmation JSONB, verdict TEXT, news_signal TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS news_items_ticker_idx ON news_items (ticker, published_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS news_items_published_idx ON news_items (published_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS news_items_impact_idx ON news_items (impact_score DESC)`);
}

function isReady() { return !!pool; }

// Batch upsert — ON CONFLICT DO NOTHING on the real dedupe key, so a
// re-ingested duplicate (same headline/source/ticker within the retention
// window) never creates a second row or inflates any aggregate.
async function insertNewsItems(items) {
  if (!pool || !items.length) return { inserted: 0, insertedItems: [] };
  let inserted = 0;
  const insertedItems = []; // the real, still-in-memory enriched items that were genuinely new this tick (rowCount 0 = ON CONFLICT hit an existing story) — lets callers (e.g. the regime-news alert) fire on truly-new stories only, never re-alerting a duplicate
  for (const item of items) {
    const res = await pool.query(
      `INSERT INTO news_items
        (dedupe_key, ticker, headline, source, url, summary, published_at, received_at,
         category, catalyst_weight, sentiment, sentiment_score, impact_score, freshness_score,
         confirmation, verdict, news_signal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        item.dedupeKey, item.ticker, item.headline, item.source || null, item.url || null, item.summary || null,
        item.publishedAt || null, item.receivedAt,
        item.category || null, item.catalystWeight ?? null,
        item.sentiment || null, item.sentimentScore ?? null,
        item.impactScore ?? null, item.freshnessScore ?? null,
        item.confirmation ? JSON.stringify(item.confirmation) : null,
        item.verdict || null, item.newsSignal || null,
      ]
    );
    if (res.rowCount > 0) { inserted += 1; insertedItems.push(item); }
  }
  return { inserted, insertedItems };
}

async function getFeed({ ticker, category, sentiment, minImpact, sinceMinutes, limit = 50 } = {}) {
  if (!pool) return { ok: false, reason: "DEGRADED", rows: [] };
  const clauses = [];
  const params = [];
  if (ticker) { params.push(ticker.toUpperCase()); clauses.push(`ticker = $${params.length}`); }
  if (category && category !== "ALL") { params.push(category); clauses.push(`category = $${params.length}`); }
  if (sentiment && sentiment !== "ALL") { params.push(sentiment); clauses.push(`sentiment = $${params.length}`); }
  if (Number.isFinite(minImpact)) { params.push(minImpact); clauses.push(`impact_score >= $${params.length}`); }
  if (Number.isFinite(sinceMinutes)) { params.push(sinceMinutes); clauses.push(`received_at >= now() - ($${params.length} || ' minutes')::interval`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(Math.max(1, Math.min(200, limit)));
  const { rows } = await pool.query(
    `SELECT * FROM news_items ${where} ORDER BY received_at DESC LIMIT $${params.length}`,
    params
  );
  return { ok: true, rows };
}

async function getTickerAggregation(ticker, { sinceMinutes } = {}) {
  if (!pool) return { ok: false, reason: "DEGRADED" };
  const params = [String(ticker).toUpperCase()];
  let sinceClause = "";
  if (Number.isFinite(sinceMinutes)) {
    params.push(sinceMinutes);
    sinceClause = `AND received_at >= now() - ($${params.length} || ' minutes')::interval`;
  }
  const { rows } = await pool.query(
    `SELECT * FROM news_items WHERE ticker = $1 ${sinceClause} ORDER BY received_at DESC LIMIT 25`,
    params
  );
  if (!rows.length) return { ok: true, ticker, articleCount: 0, bullish: 0, bearish: 0, avgImpact: null, latestCatalyst: null, trend: "NO_MATERIAL_NEWS" };
  const bullish = rows.filter((r) => r.sentiment === "BULLISH" || r.sentiment === "STRONGLY_BULLISH").length;
  const bearish = rows.filter((r) => r.sentiment === "BEARISH" || r.sentiment === "STRONGLY_BEARISH").length;
  const avgImpact = Math.round(rows.reduce((s, r) => s + (r.impact_score || 0), 0) / rows.length);
  const trend = bullish > bearish ? "BULLISH" : bearish > bullish ? "BEARISH" : "MIXED";
  return {
    ok: true, ticker, articleCount: rows.length, bullish, bearish, avgImpact,
    latestCatalyst: rows[0].category, latestHeadline: rows[0].headline, trend, rows,
  };
}

async function pruneOld() {
  if (!pool) return { pruned: 0 };
  const res = await pool.query(`DELETE FROM news_items WHERE received_at < now() - ($1 || ' days')::interval`, [RETENTION_DAYS]);
  return { pruned: res.rowCount };
}

async function getStatus(providerOk) {
  if (!DATABASE_URL) return { status: "DEGRADED", reason: "No database configured for news storage." };
  if (!pool) return { status: "DEGRADED", reason: "News store not yet initialized." };
  if (!providerOk) return { status: "DEGRADED", reason: "News provider fetch failed on the last ingestion tick." };
  const { rows } = await pool.query(`SELECT MAX(received_at) AS latest FROM news_items`);
  const latest = rows[0] && rows[0].latest;
  if (!latest) return { status: "OK", reason: "No news ingested yet." };
  const ageMin = (Date.now() - new Date(latest).getTime()) / 60000;
  if (ageMin > 30) return { status: "STALE", reason: `Last successful ingestion was ${Math.round(ageMin)} minutes ago.` };
  return { status: "OK", latestAt: latest };
}

module.exports = { initNewsStore, isReady, insertNewsItems, getFeed, getTickerAggregation, pruneOld, getStatus };
