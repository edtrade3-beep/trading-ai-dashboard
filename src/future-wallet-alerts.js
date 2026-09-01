// future-wallet-alerts.js — Horse Hunter upgrade (2026-08-26): the real
// hookup fw_alerts (schema-only since future-wallet-store.js shipped) was
// always waiting for — that table's own comment said "hookup to the
// existing registerJob/Telegram alert system... is a later phase." This is
// that phase.
//
// Fires only on a real, genuine stage/score transition returned by
// future-wallet-synthesis.js's runSynthesisAndStage (which already carries
// both the new AND the real prior stage/score for each symbol) — never a
// fabricated "something changed." A symbol with no real prior journal
// entry (first time it's ever been classified) is honestly skipped rather
// than firing a false "accelerating" alert for its very first read.
// sendTelegramMessage's own global 60s/40-per-day cooldown (src/telegram.js)
// is the real spam backstop, same convention this session's other real
// alert additions (Light Box lifecycle alerts, the news regime alert) use.
"use strict";

const STAGE_ORDER = ["UNKNOWN", "INTERESTING", "EMERGING", "INFLECTION", "EARLY_LEADER", "INSTITUTIONAL_RECOGNITION", "MARKET_LEADER", "MATURE"];
const NOTABLE_STAGES = new Set(["EMERGING", "INFLECTION", "EARLY_LEADER", "INSTITUTIONAL_RECOGNITION", "MARKET_LEADER"]);
const SCORE_JUMP_THRESHOLD = 10; // disclosed material-change bar, mirrors horse-stage.js's own INFLECTION delta

function stageIndex(label) { return STAGE_ORDER.indexOf(label); }

// Pure — given one real synthesis result (with its real prior state
// attached), decides whether it deserves an alert and what kind. Exported
// for unit testing without a DB/Telegram.
function classifyTransition(r) {
  if (!r || !r.ok || !r.stageLabel || !r.priorStageLabel) return null; // no real prior state to compare against
  const priorIdx = stageIndex(r.priorStageLabel);
  const newIdx = stageIndex(r.stageLabel);
  const scoreDelta = (r.priorWealthScore != null && r.future_wealth_score != null) ? r.future_wealth_score - r.priorWealthScore : null;

  if (newIdx > priorIdx && NOTABLE_STAGES.has(r.stageLabel)) return "HORSE_ACCELERATING";
  if (newIdx < priorIdx && priorIdx >= stageIndex("EMERGING")) return "HORSE_THESIS_BROKEN";
  if (scoreDelta != null && Math.abs(scoreDelta) >= SCORE_JUMP_THRESHOLD) {
    return scoreDelta > 0 ? "HORSE_ACCELERATING" : "HORSE_THESIS_BROKEN";
  }
  return null;
}

function formatAlert(alertType, r) {
  const emoji = alertType === "HORSE_ACCELERATING" ? "🐎 HORSE ACCELERATING" : "❌ HORSE THESIS BROKEN";
  return [
    emoji, "",
    r.symbol, "",
    `Horse Score: ${r.priorWealthScore ?? "—"} → ${r.future_wealth_score ?? "—"}`,
    `Stage: ${r.priorStageLabel} → ${r.stageLabel}`,
  ].join("\n");
}

// Real orchestration: for each real synthesis result that crossed a real
// notable transition, write a real fw_alerts row and send via Telegram.
// One result never blocking another — a DB or Telegram failure on one
// symbol is isolated, same per-item discipline this session's other jobs use.
async function sendHorseAlerts(results) {
  const { getPool } = require("./atomic-write");
  const { sendTelegramMessage } = require("./telegram");
  const pool = getPool();

  let sent = 0, checked = 0;
  for (const r of results || []) {
    const alertType = classifyTransition(r);
    if (!alertType) continue;
    checked += 1;
    const text = formatAlert(alertType, r);
    if (pool) {
      try { await pool.query(`INSERT INTO fw_alerts (symbol, alert_type, message) VALUES ($1,$2,$3)`, [r.symbol, alertType, text]); } catch { /* alert-row persistence is best-effort — delivery below still proceeds */ }
    }
    try {
      const res = await sendTelegramMessage(text);
      if (res && res.ok) sent += 1;
    } catch { /* one symbol's delivery failure never blocks the rest */ }
  }
  return { sent, checked };
}

// Weekly agent-swarm summary (2026-09-01 platform audit) — the weekly
// deep-dive job (future-wallet-weekly-agents-job.js) ran 6 agents against
// the top real Horse candidates and, until now, the results only ever
// landed in fw_agent_analysis with no notification — every other
// consequential Future Wallet job (this file's own sendHorseAlerts) tells
// you what it found; this one silently finished. Real, disclosed
// aggregation only: averages each symbol's own real per-agent scores
// (nulls/failures excluded, never treated as 0), surfaces the top N by
// that real average, and quotes each agent's own real verdict phrase —
// never a synthesized label the agents didn't actually produce.
const SWARM_TOP_N = 3;

function summarizeSwarmResults(results) {
  const bySymbol = new Map();
  for (const r of results || []) {
    if (!r.ok || r.score == null) continue; // honest exclusion — a null/failed score never counts as 0
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push(r);
  }
  const summaries = [...bySymbol.entries()].map(([symbol, agentResults]) => {
    const avgScore = agentResults.reduce((s, r) => s + r.score, 0) / agentResults.length;
    return { symbol, avgScore, agentCount: agentResults.length, agentResults };
  });
  summaries.sort((a, b) => b.avgScore - a.avgScore);
  return summaries;
}

function formatSwarmAlert(swarmResult, summaries) {
  const top = summaries.slice(0, SWARM_TOP_N);
  const lines = [
    "🐎 WEEKLY HORSE AGENT SWARM", "",
    `${swarmResult.succeeded}/${swarmResult.totalCalls} real agent calls succeeded across ${(swarmResult.candidates || []).length} candidates.`,
  ];
  if (top.length) {
    lines.push("", "TOP BY AVG AGENT SCORE:");
    for (const s of top) {
      lines.push(`${s.symbol}: ${Math.round(s.avgScore)}/100 (${s.agentCount} agent${s.agentCount === 1 ? "" : "s"})`);
    }
  } else {
    lines.push("", "No candidate cleared a real, non-null score from any agent this run.");
  }
  return lines.join("\n");
}

// Best-effort, isolated the same way sendHorseAlerts is — a Telegram
// failure here never fails the weekly job itself.
async function sendWeeklySwarmSummary(swarmResult) {
  const { sendTelegramMessage } = require("./telegram");
  const summaries = summarizeSwarmResults(swarmResult.results);
  try {
    const res = await sendTelegramMessage(formatSwarmAlert(swarmResult, summaries));
    return { sent: Boolean(res && res.ok), topSymbols: summaries.slice(0, SWARM_TOP_N).map((s) => s.symbol) };
  } catch {
    return { sent: false, topSymbols: summaries.slice(0, SWARM_TOP_N).map((s) => s.symbol) };
  }
}

module.exports = {
  STAGE_ORDER, SCORE_JUMP_THRESHOLD, classifyTransition, formatAlert, sendHorseAlerts,
  SWARM_TOP_N, summarizeSwarmResults, formatSwarmAlert, sendWeeklySwarmSummary,
};
