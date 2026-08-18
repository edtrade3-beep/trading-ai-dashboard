// future-wallet-store.js — Postgres schema for the Future Wallet 100
// module (explicit user request, 2026-08-17: a quant screen -> 15-agent
// AI swarm -> red team -> investment committee pipeline that scores
// companies on two separate axes — long-term Future Wealth Score vs.
// right-now Current Entry Score). This is PHASE 1 ONLY (database schema),
// per the user's own explicit build order: no data population, no quant
// calculations, no agents, no AI calls, no dashboard here — just the
// tables, so later phases build on a schema that doesn't need repeated
// ALTER TABLEs (no migration framework exists in this app).
//
// DB-only by design — unlike most of this app's data/*.json stores (which
// have a file-mode fallback via atomic-write.js), Future Wallet's data is
// inherently relational (agent-analysis rows per symbol per run, ranked
// list membership, time-series scores) and doesn't fit the generic KV-blob
// shape the rest of the app uses. If DATABASE_URL isn't configured, this
// module simply stays inert (no tables, isReady() false) rather than
// half-emulating a relational store on disk.
//
// Reuses the ONE shared, bounded pg.Pool from src/atomic-write.js's
// initPgStore() (getPool()) — never creates its own pool. Same real
// reasoning src/dealership/photo-store.js already documents: two separate
// unbounded pools against the same DATABASE_URL was a real contributor to
// a production Postgres connection-error incident (2026-08-16).
"use strict";

const { getPool } = require("./atomic-write");

const DATABASE_URL = (process.env.DATABASE_URL || "").trim();

let pool = null;

// Call once from server.js's boot chain, AFTER atomic-write's
// initPgStore() has resolved (same sequencing initPhotoStore() already
// requires) — this needs initPgStore's pool to already exist. Fails
// loudly (throws) if DATABASE_URL is set but the schema can't be created,
// same fail-fast contract the rest of this app's Postgres bootstrap uses,
// rather than silently booting with a half-broken store.
async function initFutureWalletStore() {
  if (!DATABASE_URL) return; // no DB configured — module stays inert
  pool = getPool();
  if (!pool) throw new Error("future-wallet-store: DATABASE_URL is set but atomic-write's shared pool isn't ready — check init order in server.js");

  // fw_universe — the stock universe (ticker/company/exchange/sector/
  // market cap). Seeded from a real existing curated list in a later
  // phase (Phase 2), not here.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fw_universe (
      ticker TEXT PRIMARY KEY,
      company TEXT,
      exchange TEXT,
      country TEXT,
      sector TEXT,
      industry TEXT,
      market_cap NUMERIC,
      currency TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // fw_quant_metrics — one row per symbol per snapshot. Every metric is
  // nullable: NULL means "unavailable," never a fabricated value (spec
  // sections 5/32). `sources` records {field: {source, timestamp,
  // confidence}} for the fields that are actually populated.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fw_quant_metrics (
      symbol TEXT NOT NULL REFERENCES fw_universe(ticker),
      as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
      price NUMERIC, market_cap NUMERIC, volume NUMERIC, avg_volume NUMERIC,
      atr NUMERIC, rsi NUMERIC, ma50 NUMERIC, ma100 NUMERIC, ma200 NUMERIC,
      relative_strength NUMERIC, week52_high NUMERIC, week52_low NUMERIC,
      distance_from_high NUMERIC, volume_ratio NUMERIC, momentum NUMERIC,
      trend_score NUMERIC, volatility NUMERIC, beta NUMERIC,
      revenue_growth NUMERIC, eps_growth NUMERIC, eps_acceleration NUMERIC,
      gross_margin NUMERIC, operating_margin NUMERIC, net_margin NUMERIC,
      fcf NUMERIC, fcf_growth NUMERIC, roic NUMERIC, roe NUMERIC,
      debt_equity NUMERIC, cash NUMERIC, net_debt NUMERIC,
      shares_outstanding NUMERIC, share_dilution NUMERIC,
      pe NUMERIC, forward_pe NUMERIC, peg NUMERIC, price_sales NUMERIC,
      ev_sales NUMERIC, ev_ebitda NUMERIC, fcf_yield NUMERIC,
      sources JSONB,
      PRIMARY KEY (symbol, as_of)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS fw_quant_metrics_symbol_asof ON fw_quant_metrics (symbol, as_of DESC)`);

  // fw_technical_scores — Technical Score + the real existing VCP engine's
  // output (src/routes/market.js's vcpReport), one row per symbol per snapshot.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fw_technical_scores (
      symbol TEXT NOT NULL REFERENCES fw_universe(ticker),
      as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
      technical_score NUMERIC,
      vcp_score NUMERIC,
      vcp_verdict TEXT,
      vcp_risk_state TEXT,
      breakout_status TEXT,
      support NUMERIC,
      resistance NUMERIC,
      PRIMARY KEY (symbol, as_of)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS fw_technical_scores_symbol_asof ON fw_technical_scores (symbol, as_of DESC)`);

  // fw_future_potential — the long-term Future Potential Score (TAM,
  // moat, secular growth, etc.). Sub-scores live in `components` (JSONB)
  // rather than one column each, since this one is agent-driven/
  // qualitative, not a fixed quant formula like fw_quant_metrics.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fw_future_potential (
      symbol TEXT NOT NULL REFERENCES fw_universe(ticker),
      as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
      future_potential_score NUMERIC,
      components JSONB,
      PRIMARY KEY (symbol, as_of)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS fw_future_potential_symbol_asof ON fw_future_potential (symbol, as_of DESC)`);

  // fw_agent_analysis — one row per (symbol, agent, run). Where every
  // named agent's (Market/Fundamental/Growth/Valuation/Moat/Technical/
  // VCP/Institutional/Catalyst/Macro/Risk/Bear/RedTeam/Portfolio/CIO)
  // independent output lands before synthesis. data_quality carries the
  // spec's required FACT/ESTIMATE/ASSUMPTION/UNKNOWN distinction per row.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fw_agent_analysis (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL REFERENCES fw_universe(ticker),
      agent_name TEXT NOT NULL,
      run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      score NUMERIC,
      verdict TEXT,
      reasoning TEXT,
      data_quality TEXT,
      model_used TEXT,
      raw_response JSONB
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS fw_agent_analysis_symbol_agent_run ON fw_agent_analysis (symbol, agent_name, run_at DESC)`);

  // fw_scores — the CIO's final synthesized row. Future Wealth Score,
  // Current Entry Score, and Risk Score are always kept as separate
  // columns, never combined into one number (explicit spec requirement).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fw_scores (
      symbol TEXT NOT NULL REFERENCES fw_universe(ticker),
      as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
      future_wealth_score NUMERIC,
      current_entry_score NUMERIC,
      risk_score NUMERIC,
      verdict TEXT,
      committee_reasoning TEXT,
      PRIMARY KEY (symbol, as_of)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS fw_scores_symbol_asof ON fw_scores (symbol, as_of DESC)`);

  // fw_lists — ranked membership in the curated Future Wallet lists
  // (Top 100/25/10/5 and the 5 named 20-company buckets).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fw_lists (
      id SERIAL PRIMARY KEY,
      list_name TEXT NOT NULL,
      symbol TEXT NOT NULL REFERENCES fw_universe(ticker),
      rank INTEGER,
      as_of TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS fw_lists_name_rank ON fw_lists (list_name, rank)`);

  // fw_thesis_history — schema now, continuous-monitoring logic (spec
  // section 29) is a later phase.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fw_thesis_history (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL REFERENCES fw_universe(ticker),
      as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
      status TEXT,
      notes TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS fw_thesis_history_symbol_asof ON fw_thesis_history (symbol, as_of DESC)`);

  // fw_alerts — schema now, hookup to the existing registerJob/Telegram
  // alert system (spec section 30) is a later phase.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fw_alerts (
      id SERIAL PRIMARY KEY,
      symbol TEXT REFERENCES fw_universe(ticker),
      alert_type TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      acknowledged BOOLEAN NOT NULL DEFAULT false
    )
  `);

  console.log("[future-wallet-store] Postgres schema ready (9 tables).");
}

function isReady() { return pool !== null; }

module.exports = { initFutureWalletStore, isReady };
