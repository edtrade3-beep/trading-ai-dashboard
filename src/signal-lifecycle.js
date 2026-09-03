"use strict";
// Trade GPS (2026-09-03) — pre-entry state machine + signal expiration.
// Every OTHER piece of this platform's canonical pipeline already exists
// (opportunity-engine.js's tier/stage, position-decision-engine.js's real
// post-entry HOLD/TRAIL/TAKE_PARTIAL/EXIT machine); this file is the one
// genuinely new piece — no pre-entry SCANNING/SETUP_FORMING/ARMED/
// ENTER_NOW/CANCELLED vocabulary or signal-expiration/TTL concept existed
// anywhere in the repo before this (confirmed via repo-wide audit).
//
// Pure, deterministic, zero network/AI. Derives its state entirely from
// the real opportunity-engine.js fields already computed upstream
// (tier/entryStage/executableEntry/invalidation) — never recomputes a
// competing verdict, matching this platform's "one engine" discipline.
//
// Real mapping from existing vocabulary (opportunity-engine.js):
//   tier: DEVELOPING | ACTIONABLE | WAIT | EXTENDED | INVALIDATED
//   entryStage (entryPlan.stage): FOUNDATION | EARLY | RETEST | BREAKOUT |
//     CONFIRMATION | STRUCTURE_BROKEN | FAILED_BREAKOUT | NONE
//   executableEntry: a real, immediate, right-now entry price, or null
//     everywhere it isn't genuinely actionable yet (entry-engine.js's own
//     honest-null discipline — never fabricated as "actionable now").

const PRE_ENTRY_STATES = new Set(["SCANNING", "SETUP_FORMING", "ARMED", "ENTER_NOW", "CANCELLED"]);

// Real, disclosed policy defaults — not fabricated market data. Options
// decay faster (theta, faster underlying moves against a defined-risk
// structure) than a swing-oriented stock setup, so a real option signal's
// window to act is deliberately shorter. Env-overridable like every other
// real limit in this codebase.
const SIGNAL_TTL_DEFAULTS_MS = {
  STOCK: Number(process.env.TRADE_GPS_TTL_STOCK_MS) || 30 * 60_000,
  OPTION: Number(process.env.TRADE_GPS_TTL_OPTION_MS) || 5 * 60_000,
};

function computeSignalState({
  opportunityStage = null, tier = null, entryStage = null,
  entry = null, executableEntry = null, currentPrice = null,
  createdAtMs = null, ttlMs = null, invalidation = null, nowMs = Date.now(),
} = {}) {
  // Honest null: nothing to derive a state from at all.
  if (!Number.isFinite(nowMs)) {
    return { state: null, expiresAtMs: null, expired: null, reason: "missing real timestamp" };
  }

  const hasCreated = Number.isFinite(createdAtMs) && Number.isFinite(ttlMs) && ttlMs > 0;
  const expiresAtMs = hasCreated ? createdAtMs + ttlMs : null;
  const expired = hasCreated ? nowMs >= expiresAtMs : false;

  // Invalidation breach — the real stop-loss-before-entry level from
  // entry-engine.js's computeEntryZones. A real current price trading
  // through it means the setup's own real thesis already failed; never
  // stays actionable regardless of how fresh the signal otherwise is.
  const invalidationBreached = Number.isFinite(invalidation) && Number.isFinite(currentPrice)
    ? currentPrice <= invalidation
    : false;

  if (tier === "INVALIDATED" || tier === "EXTENDED" || entryStage === "FAILED_BREAKOUT" || entryStage === "STRUCTURE_BROKEN") {
    return { state: "CANCELLED", expiresAtMs, expired, reason: "opportunity tier/entry-stage invalidated the setup" };
  }
  if (invalidationBreached) {
    return { state: "CANCELLED", expiresAtMs, expired, reason: `price breached invalidation level ${invalidation}` };
  }
  if (expired) {
    return { state: "CANCELLED", expiresAtMs, expired, reason: "signal expired — TTL elapsed with no confirmed entry" };
  }

  // Real, immediate, right-now trigger — entry-engine.js's own
  // executableEntry is null everywhere except a genuinely actionable
  // stage (BREAKOUT/RETEST/CONFIRMATION near pivot), so its mere presence
  // IS the "enter now" signal; no separate price-distance check needed.
  if (tier === "ACTIONABLE" && Number.isFinite(executableEntry)) {
    return { state: "ENTER_NOW", expiresAtMs, expired, reason: "real executable entry is live" };
  }
  // Actionable tier reached, real pivot/entry zone identified, but the
  // real trigger (breakout/retest confirmation) hasn't fired yet — wait
  // for it, don't chase.
  if (tier === "ACTIONABLE" && Number.isFinite(entry)) {
    return { state: "ARMED", expiresAtMs, expired, reason: "setup qualified — waiting for the real entry trigger" };
  }
  if (tier === "DEVELOPING" || opportunityStage === "DEVELOPING" || opportunityStage === "EMERGING") {
    return { state: "SETUP_FORMING", expiresAtMs, expired, reason: "a real setup is forming, not yet qualified" };
  }
  if (tier === "WAIT" || opportunityStage === "DORMANT" || opportunityStage == null) {
    return { state: "SCANNING", expiresAtMs, expired, reason: "no real qualifying setup yet" };
  }

  return { state: null, expiresAtMs, expired, reason: "insufficient real data to determine signal state" };
}

// Real persisted "first seen in this state" tracking — deliberately NOT
// wired into buildAssetDecision()'s bulk per-symbol scan path (that
// function runs for every row in a 100+-symbol scan; a real file
// read+write per symbol per scan would reintroduce the exact thundering-
// herd I/O cost this session already found and fixed elsewhere in this
// pipeline). Reserved for narrow, single-symbol contexts — the ONE symbol
// Trade Desk is actively showing, or the small set Autopilot 2.0 is
// actually considering entering — where a real per-symbol read+write is
// cheap and the actual expiration countdown the spec requires needs a
// real, persisted creation timestamp that survives a redeploy.
const path = require("node:path");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const CREATED_AT_FILE = path.join(__dirname, "../data/signal-created-at.json");
const STALE_AFTER_MS = 24 * 60 * 60_000; // never meaningful past a day — pruned opportunistically

function loadCreatedAtStore() {
  return readJsonSafe(CREATED_AT_FILE, {});
}

// Returns the real first-seen timestamp for this symbol's CURRENT
// pre-entry state, persisting a new one whenever the state is new or has
// changed since the last real observation — a fresh state deserves a
// fresh TTL window, not one inherited from a different prior state.
function getOrSetSignalCreatedAt(symbol, state, nowMs = Date.now()) {
  if (!symbol || !state) return null;
  const store = loadCreatedAtStore();
  const hit = store[symbol];
  if (hit && hit.state === state && Number.isFinite(hit.createdAtMs)) return hit.createdAtMs;
  for (const k of Object.keys(store)) {
    if (!Number.isFinite(store[k]?.createdAtMs) || nowMs - store[k].createdAtMs > STALE_AFTER_MS) delete store[k];
  }
  store[symbol] = { state, createdAtMs: nowMs };
  writeJsonAtomic(CREATED_AT_FILE, store);
  return nowMs;
}

module.exports = { computeSignalState, SIGNAL_TTL_DEFAULTS_MS, PRE_ENTRY_STATES, getOrSetSignalCreatedAt };
