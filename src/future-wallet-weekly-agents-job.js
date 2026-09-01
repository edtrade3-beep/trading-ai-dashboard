// future-wallet-weekly-agents-job.js — Horse Hunter upgrade (2026-08-26)
// Tier B2: promotes the agent swarm from purely on-demand to a real, but
// deliberately bounded, automatic cadence — weekly, and only for the real
// top Horse candidates, never the full ~100-symbol universe and never
// daily. Real cost discipline: 10 symbols x 6 agents = 60 real Claude
// calls/week against the app's shared $25/mo Anthropic budget, same
// "small pilot first" scope the agent swarm itself launched under
// (future-wallet-agents.js's own 2026-08-18 header comment).
//
// Gated once-per-real-week via fw_agent_analysis' own MAX(run_at) — same
// "check real persisted state" idea the daily refresh job uses.
"use strict";

const { getPool } = require("./atomic-write");
const { runAgentSwarm } = require("./future-wallet-agents");
const { ANTHROPIC_API_KEY } = require("./config");

const CANDIDATE_COUNT = 10; // bounded — real Claude cost per symbol x 6 agents
const WEALTH_SCORE_BAR = 60; // disclosed "worth a closer look" threshold, same tier future-wallet-synthesis.js's ENTRY/wealth strong-score bar uses
const MIN_DAYS_BETWEEN_RUNS = 7;

async function alreadyRanThisWeek(pool) {
  const { rows } = await pool.query(`SELECT MAX(run_at) AS latest FROM fw_agent_analysis`);
  const latest = rows[0] && rows[0].latest;
  if (!latest) return false;
  const days = (Date.now() - new Date(latest).getTime()) / 86_400_000;
  return days < MIN_DAYS_BETWEEN_RUNS;
}

// Real top-N by the actual CIO-synthesized Wealth Score (fw_scores,
// future-wallet-synthesis.js) — a fuller real signal than the pre-
// synthesis rankScore future-wallet-agents.js's own selectCandidates uses,
// now that real synthesis exists.
async function selectTopHorseCandidates(pool, n) {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (symbol) symbol, future_wealth_score
    FROM fw_scores
    WHERE future_wealth_score >= $1
    ORDER BY symbol, as_of DESC
  `, [WEALTH_SCORE_BAR]);
  return rows
    .sort((a, b) => Number(b.future_wealth_score) - Number(a.future_wealth_score))
    .slice(0, n)
    .map((r) => r.symbol);
}

async function runWeeklyAgentSwarm() {
  const pool = getPool();
  if (!pool) return { ok: true, skipped: "no database configured" };
  if (!ANTHROPIC_API_KEY) return { ok: true, skipped: "no Anthropic API key configured" };
  if (await alreadyRanThisWeek(pool)) return { ok: true, skipped: "agent swarm already ran within the last 7 days" };

  const symbols = await selectTopHorseCandidates(pool, CANDIDATE_COUNT);
  if (!symbols.length) return { ok: true, skipped: "no real Horse candidates clear the wealth-score bar yet — run the daily refresh first" };

  const result = await runAgentSwarm({ symbols, apiKey: ANTHROPIC_API_KEY });

  // Real Telegram summary (2026-09-01 platform audit) — this job previously
  // ran a real 60-call agent swarm and never told anyone what it found.
  // Best-effort: a notification failure never fails the real analysis run.
  try {
    const { sendWeeklySwarmSummary } = require("./future-wallet-alerts");
    await sendWeeklySwarmSummary(result);
  } catch { /* best-effort, same isolation as sendHorseAlerts */ }

  return { ok: true, candidates: symbols, ...result };
}

module.exports = { runWeeklyAgentSwarm, CANDIDATE_COUNT, WEALTH_SCORE_BAR, MIN_DAYS_BETWEEN_RUNS };
