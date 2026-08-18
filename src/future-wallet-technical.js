// future-wallet-technical.js — Future Wallet 100 Phases 5+6: Technical
// Score + the VCP engine. Combined (same as Phases 3+4) since both write
// into the same fw_technical_scores row per symbol.
//
// Reuses screenTrendTemplate (src/routes/market.js, already exported for
// aplus-score-history.js's daily job) rather than reimplementing anything
// — it already runs the real Minervini 8-point trend template, the real
// VCP engine (vcpReport/vcpBreakoutEngine), and SPY-relative momentum, with
// its own proven bounded-concurrency worker pool (6 at a time) fetching
// bars only once per symbol. No new rate-limit-safety code needed here;
// that's already handled inside screenTrendTemplate itself.
//
// technical_score is a real, honest 0-100 rescale of the Minervini
// template's own passCount (0-8) — reusing an existing, already-trusted
// real trend-strength read from elsewhere in this app, not a new invented
// rubric. vcp_score/vcp_verdict/vcp_risk_state come straight from the real
// VCP engine's own output (vcpReport, via screenTrendTemplate's row).
"use strict";

const { getPool } = require("./atomic-write");

function requirePool() {
  const pool = getPool();
  if (!pool) throw new Error("future-wallet-technical: Postgres pool not ready");
  return pool;
}

async function runTechnicalScreen(symbols) {
  const pool = requirePool();
  const uniq = [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];

  let screenTrendTemplate;
  try { ({ screenTrendTemplate } = require("./routes/market")); } catch (e) {
    throw new Error("future-wallet-technical: could not load screenTrendTemplate — " + (e && e.message));
  }

  const rows = await screenTrendTemplate(uniq);
  const results = [];
  for (const r of rows) {
    if (r.error) { results.push({ symbol: r.symbol, ok: false, reason: r.error }); continue; }
    try {
      const technicalScore = Number.isFinite(r.passCount) ? Math.round((r.passCount / 8) * 100) : null;
      await pool.query(
        `INSERT INTO fw_technical_scores (symbol, technical_score, vcp_score, vcp_verdict, vcp_risk_state, breakout_status, support, resistance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [r.symbol, technicalScore, r.vcpScore ?? null, r.vcpVerdict ?? null, r.riskState ?? null, r.state ?? null, r.contractionLow ?? null, r.pivot ?? null]
      );
      results.push({ symbol: r.symbol, ok: true });
    } catch (e) {
      results.push({ symbol: r.symbol, ok: false, reason: String((e && e.message) || e) });
    }
  }
  const ok = results.filter((x) => x.ok);
  return { requested: uniq.length, computed: ok.length, failed: results.length - ok.length, failedDetail: results.filter((x) => !x.ok) };
}

async function getLatestTechnicalScores() {
  const pool = requirePool();
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (symbol) *
    FROM fw_technical_scores
    ORDER BY symbol, as_of DESC
  `);
  return rows;
}

module.exports = { runTechnicalScreen, getLatestTechnicalScores };
