// future-wallet-daily-job.js — Horse Hunter upgrade (2026-08-26): the real
// "continuous" piece Future Wallet never had. Before this, every phase
// (quant screen, technical screen, future-potential, agent swarm) was
// manually POST-triggered from FutureWalletTab.jsx's buttons — server.js
// only ever called initFutureWalletStore() at boot. This orchestrates the
// existing real pipeline once per real trading day: quant -> technical ->
// future-potential -> (bounded institutional enrichment) -> CIO synthesis
// + stage classify + journal write (future-wallet-synthesis.js's
// runSynthesisAndStage, which folds A1/A2/A3 together — see that file's
// header for why the ordering has to be one per-symbol pass).
//
// Gated once-per-real-day via fw_quant_metrics' own MAX(as_of) — same
// "check real persisted state, not an in-memory flag" idea
// morning-digest.js already uses (there via a JSON file; here via
// Postgres, since Future Wallet is DB-only). registerJob's own interval
// (server.js) just needs to be frequent enough to catch the day rolling
// over; the gate is what keeps the expensive real work to once/day.
"use strict";

const { getPool } = require("./atomic-write");
const { getUniverse } = require("./future-wallet-universe");
const { runQuantScreen } = require("./future-wallet-quant");
const { runTechnicalScreen } = require("./future-wallet-technical");
const { runFuturePotentialScoring, getLatestFuturePotential } = require("./future-wallet-potential");
const { runSynthesisAndStage, fetchInstitutionScoresForTopSymbols } = require("./future-wallet-synthesis");
const { sendHorseAlerts } = require("./future-wallet-alerts");

function todayET() {
  return new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
}

async function alreadyRanToday(pool) {
  const { rows } = await pool.query(`SELECT MAX(as_of) AS latest FROM fw_quant_metrics`);
  const latest = rows[0] && rows[0].latest;
  if (!latest) return false;
  return new Date(latest).toLocaleDateString("en-US", { timeZone: "America/New_York" }) === todayET();
}

async function runFutureWalletDailyRefresh({ force = false } = {}) {
  const pool = getPool();
  if (!pool) return { ok: true, skipped: "no database configured" };
  if (!force && await alreadyRanToday(pool)) return { ok: true, skipped: "already refreshed today" };

  const universe = await getUniverse();
  const symbols = universe.map((r) => r.ticker);
  if (!symbols.length) return { ok: true, skipped: "empty universe — seed it first" };

  // Each real phase is isolated — one phase's failure (e.g. a provider
  // outage) never blocks the others from running with whatever real data
  // they can still get, same per-item/per-phase isolation discipline used
  // throughout this session's other background jobs.
  const quant = await runQuantScreen(symbols).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
  const technical = await runTechnicalScreen(symbols).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
  const potential = await runFuturePotentialScoring(symbols).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));

  let institutionScores = {};
  try {
    const latest = await getLatestFuturePotential();
    const ranked = latest
      .filter((r) => r.future_potential_score != null)
      .sort((a, b) => b.future_potential_score - a.future_potential_score)
      .map((r) => r.symbol);
    institutionScores = await fetchInstitutionScoresForTopSymbols(ranked);
  } catch { /* institutional enrichment is best-effort, never blocks synthesis */ }

  const synthesis = await runSynthesisAndStage(symbols, { institutionScores }).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));

  let alerts = { sent: 0 };
  try { alerts = await sendHorseAlerts(synthesis?.results || []); } catch { /* alert delivery is best-effort, never fails the refresh */ }

  return {
    ok: true, symbols: symbols.length,
    quant: { computed: quant.computed ?? 0, failed: quant.failed ?? null },
    technical: { computed: technical.computed ?? 0, failed: technical.failed ?? null },
    potential: { scored: potential.scored ?? 0, failed: potential.failed ?? null },
    institutionSymbols: Object.keys(institutionScores).length,
    synthesis: { scored: synthesis.scored ?? 0, failed: synthesis.failed ?? null },
    alerts,
  };
}

module.exports = { runFutureWalletDailyRefresh };
