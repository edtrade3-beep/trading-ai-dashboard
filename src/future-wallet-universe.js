// future-wallet-universe.js — Future Wallet 100 Phase 2: seed the stock
// universe. Per the user's own explicit build order (spec section 37):
// "Do NOT begin with 5,000 stocks... Start with approximately 100 stocks.
// Prove the entire pipeline." Real real profile data (company/exchange/
// country/sector/industry/market cap/currency) is fetched per symbol via
// the existing fetchFmpFundamentals provider (src/providers/fmp.js) — no
// invented company metadata, and a symbol whose FMP profile can't be
// fetched is skipped rather than inserted with fabricated fields.
"use strict";

const { getPool } = require("./atomic-write");
const { FMP_API_KEY } = require("./config");
const { fetchFmpFundamentals } = require("./providers/fmp");

// Real, curated ~100-symbol seed list — a server-side (CommonJS) copy of
// axiom-runner/components/market-helpers.js's SCAN_UNIVERSE (client ES
// module, can't be required from here), snapshotted 2026-08-17. Same
// "hand-ported dual-file" convention this app already uses everywhere a
// value needs to exist on both sides of the client/server boundary (e.g.
// trading-utils.js/greenlight-calc.js). If SCAN_UNIVERSE changes later,
// re-sync this list by hand — it's a plain array, not shared logic, so a
// drift is a visible diff, not a subtle bug.
const SEED_UNIVERSE = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","AVGO","TSLA","AMD","NFLX",
  "CRM","ORCL","ADBE","NOW","PANW","CRWD","PLTR","SNOW","MU","QCOM",
  "ANET","MRVL","SMCI","ARM","LRCX","TSM","INTC","TXN","ON","KLAC",
  "NET","DDOG","ZS","APP","FTNT","S","TEAM","WDAY","INTU",
  "COIN","HOOD","V","MA","JPM","GS","MS","BLK","SCHW","SOFI","AXP",
  "COST","HD","NKE","SBUX","UBER","ABNB","SHOP","LULU","WMT","CVNA",
  "CAT","LMT","RTX","NOC","GE","BA","DE",
  "XOM","CVX","OXY","VRT","NEE","CCJ","CEG","SMR","OKLO","WMB",
  "LLY","UNH","ISRG","REGN","VRTX",
  "DELL","MARA","RIOT","RKLB","ASTS","IONQ","SOUN","CLSK","CIFR","WULF","IREN","RDDT",
  "PYPL","DIS","KO","PEP","MCD","IBM",
];

function requirePool() {
  const pool = getPool();
  if (!pool) throw new Error("future-wallet-universe: Postgres pool not ready — DATABASE_URL must be set and initFutureWalletStore() must have run");
  return pool;
}

// Fetches real profile data for one symbol and upserts fw_universe.
// Returns { ticker, ok, reason? } so the caller can report a real,
// per-symbol success/skip count rather than a single opaque "done".
async function seedOneSymbol(pool, ticker) {
  if (!FMP_API_KEY) return { ticker, ok: false, reason: "FMP_API_KEY not configured" };
  const data = await fetchFmpFundamentals(ticker, FMP_API_KEY).catch(() => null);
  if (!data || !data.name) return { ticker, ok: false, reason: "no real profile data returned" };
  await pool.query(
    `INSERT INTO fw_universe (ticker, company, exchange, country, sector, industry, market_cap, currency, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (ticker) DO UPDATE SET
       company = EXCLUDED.company, exchange = EXCLUDED.exchange, country = EXCLUDED.country,
       sector = EXCLUDED.sector, industry = EXCLUDED.industry, market_cap = EXCLUDED.market_cap,
       currency = EXCLUDED.currency, updated_at = now()`,
    [ticker, data.name, data.exchange, data.country, data.sector, data.industry, data.marketCap || null, data.currency]
  );
  return { ticker, ok: true };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Real incident, 2026-08-17: an earlier version of this batched 12 symbols
// concurrently, matching fetchDayTradeScanRows' own convention — but that
// function fires 2 requests/symbol, while fetchFmpFundamentals fires 6
// (quote+profile+ratios+key-metrics+growth+price-target in parallel), so
// 12-symbol batches meant up to 72 simultaneous FMP requests. Live testing
// showed a consistent ~50/100 failure rate that didn't improve across
// several retries spaced minutes apart — consistent with a burst/
// concurrency cap, not a simple per-minute window. Fixed on two axes
// (spec section 34's explicit "rate-limit protection" requirement): much
// smaller batches (3 symbols = up to 18 concurrent FMP requests) and a
// real delay between batches, plus one retry for any symbol whose first
// attempt failed (spec section 33: transient provider failures get one
// retry before being marked genuinely unavailable).
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 1500;

async function seedFutureWalletUniverse(symbols = SEED_UNIVERSE) {
  const pool = requirePool();
  const uniq = [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
  const results = [];
  for (let i = 0; i < uniq.length; i += BATCH_SIZE) {
    const chunk = uniq.slice(i, i + BATCH_SIZE);
    const done = await Promise.all(chunk.map((sym) => seedOneSymbol(pool, sym).catch((e) => ({ ticker: sym, ok: false, reason: String(e && e.message || e) }))));
    results.push(...done);
    if (i + BATCH_SIZE < uniq.length) await sleep(BATCH_DELAY_MS);
  }

  // One retry pass for whatever failed — a real transient burst/rate-limit
  // hit is exactly the case a single retry (with the batch already spread
  // out in time) should recover; a symbol that fails twice is reported as
  // genuinely unavailable, never silently dropped.
  const firstFailures = results.filter((r) => !r.ok);
  if (firstFailures.length) {
    await sleep(BATCH_DELAY_MS);
    for (let i = 0; i < firstFailures.length; i += BATCH_SIZE) {
      const chunk = firstFailures.slice(i, i + BATCH_SIZE);
      const retried = await Promise.all(chunk.map((f) => seedOneSymbol(pool, f.ticker).catch((e) => ({ ticker: f.ticker, ok: false, reason: String(e && e.message || e) }))));
      for (const r of retried) {
        const idx = results.findIndex((x) => x.ticker === r.ticker);
        if (idx !== -1) results[idx] = r;
      }
      if (i + BATCH_SIZE < firstFailures.length) await sleep(BATCH_DELAY_MS);
    }
  }
  const ok = results.filter((r) => r.ok);
  const skipped = results.filter((r) => !r.ok);
  return { requested: uniq.length, seeded: ok.length, skipped: skipped.length, skippedDetail: skipped };
}

async function getUniverse() {
  const pool = requirePool();
  const { rows } = await pool.query("SELECT ticker, company, exchange, country, sector, industry, market_cap, currency, updated_at FROM fw_universe ORDER BY ticker");
  return rows;
}

module.exports = { SEED_UNIVERSE, seedFutureWalletUniverse, getUniverse };
