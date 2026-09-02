"use strict";

const EVENT_RISK_VERSION = "event-risk-v1";

// Uses only explicit provider-supplied event fields. Missing dates remain
// UNKNOWN and never become a fabricated risk or clearance.
function computeEventRisk({ earningsDte = null, events = [], nowMs = Date.now(), blockWithinDays = 2 } = {}) {
  const normalized = Array.isArray(events) ? events.filter((e) => e && e.timestamp != null).map((e) => ({
    type: String(e.type || "EVENT"), timestamp: Number(e.timestamp), name: e.name || null,
  })).filter((e) => Number.isFinite(e.timestamp)) : [];
  const earnings = Number(earningsDte);
  const hasEarnings = earningsDte !== null && earningsDte !== undefined && earningsDte !== "" && Number.isFinite(earnings);
  const imminentEarnings = hasEarnings && earnings >= 0 && earnings <= blockWithinDays;
  const imminent = normalized.filter((e) => e.timestamp >= nowMs && e.timestamp <= nowMs + blockWithinDays * 86400000);
  const blockers = [];
  if (imminentEarnings) blockers.push(`Earnings in ${earnings} day${earnings === 1 ? "" : "s"} — new exposure blocked.`);
  for (const e of imminent) blockers.push(`${e.name || e.type} is imminent — new exposure blocked.`);
  return {
    score: blockers.length ? 90 : (hasEarnings && earnings >= 0 && earnings <= 10 ? 45 : 0),
    blocksNewExposure: blockers.length > 0,
    reason: blockers[0] || null,
    blockers,
    events: normalized,
    earningsDte: hasEarnings ? earnings : null,
    timestamp: nowMs,
    engineVersion: EVENT_RISK_VERSION,
  };
}

module.exports = { EVENT_RISK_VERSION, computeEventRisk };
