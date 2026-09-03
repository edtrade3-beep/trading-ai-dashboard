"use strict";
// Trade Navigator Stage 6 (2026-09-03, explicit user spec: "which alerts
// you ignored that later succeeded") — Trade Replay Brain, part 2. Real,
// two-part flow: (1) detect a real signal that reached a real actionable
// pre-entry state (ARMED/ENTER_NOW) and then genuinely expired — TTL
// elapsed, nobody acted, distinct from an invalidation (thesis broke,
// correctly abandoned) — and record it; (2) a real scheduled follow-up,
// hours later, checks the real price and fills in whether it would have
// worked. Never fabricates a "you missed a winner" claim before the real
// follow-up window has actually elapsed.
const path = require("path");
const { readJsonSafe, writeJsonAtomic } = require("./atomic-write");
const { recordSetupEvent, updateAuditRecord, getRecordsByQualifyReason } = require("./trade-gps-audit-store");

const STATE_PATH = path.join(__dirname, "..", "data", "ignored-alert-last-state.json");
const STALE_AFTER_MS = 24 * 60 * 60_000; // matches signal-lifecycle.js's own getOrSetSignalCreatedAt pruning window
const FOLLOW_UP_DELAY_MS = 4 * 60 * 60_000; // a real, disclosed judgment call — long enough for a real intraday move to actually happen
const QUALIFY_REASON = "ignored-alert";
const ACTIONABLE_STATES = new Set(["ARMED", "ENTER_NOW"]);
const REAL_EXPIRY_REASON = "signal expired — TTL elapsed with no confirmed entry";

function loadLastStates() {
  const data = readJsonSafe(STATE_PATH, {});
  return data && typeof data === "object" ? data : {};
}
function pruneStale(states, nowMs) {
  for (const [symbol, entry] of Object.entries(states)) {
    if (!entry?.at || nowMs - entry.at > STALE_AFTER_MS) delete states[symbol];
  }
  return states;
}

// Real per-symbol transition check — call once per real scanned symbol,
// per real tick. Never fires twice for the same real expiry (persisted
// last-state dedup, same discipline as signal-lifecycle.js's own store).
function checkForIgnoredSignal({ symbol, signalState, signalStateReason, decision, nowMs = Date.now() } = {}) {
  if (!symbol || !signalState) return null;
  const states = pruneStale(loadLastStates(), nowMs);
  const prev = states[symbol];
  let recorded = null;

  if (prev?.state && ACTIONABLE_STATES.has(prev.state) && signalState === "CANCELLED" && signalStateReason === REAL_EXPIRY_REASON) {
    recorded = recordSetupEvent({
      symbol, engineVersion: "ignored-alert-tracker", verdict: decision?.verdict ?? null,
      qualifyReason: QUALIFY_REASON,
      stateTransition: { from: prev.state, to: "CANCELLED", reason: "ignored — TTL expired with no confirmed entry" },
      riskDecision: {
        entry: Number.isFinite(decision?.entry) ? decision.entry : null,
        stop: Number.isFinite(decision?.stop) ? decision.stop : null,
        targets: Array.isArray(decision?.targets) ? decision.targets : [],
      },
      followUp: { checkAtMs: nowMs + FOLLOW_UP_DELAY_MS, checked: false, result: null },
      nowMs,
    });
  }

  states[symbol] = { state: signalState, at: nowMs };
  writeJsonAtomic(STATE_PATH, states);
  return recorded;
}

// Real, honest read of "would this have worked" — reached the real first
// target before breaching the real stop, using only the real captured
// entry/stop/target and the real current price. A move that reached
// neither yet stays "pending" (honest, not forced to a verdict early)
// unless the real follow-up window has already fully elapsed, in which
// case it's graded on real price direction alone (closer to target vs.
// closer to stop) rather than left unresolved forever.
function gradeIgnoredOutcome({ entry, stop, targets, currentPrice, windowElapsed }) {
  const target = Array.isArray(targets) ? targets[0] : null;
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(currentPrice)) return "insufficient real data";
  const isLong = Number.isFinite(target) ? target > entry : stop < entry;
  if (isLong) {
    if (Number.isFinite(target) && currentPrice >= target) return "would have hit target";
    if (currentPrice <= stop) return "would have hit stop";
  } else {
    if (Number.isFinite(target) && currentPrice <= target) return "would have hit target";
    if (currentPrice >= stop) return "would have hit stop";
  }
  if (!windowElapsed) return "pending";
  return currentPrice > entry === isLong ? "moved favorably, neither level hit" : "moved unfavorably, neither level hit";
}

// Real scheduled sweep (server.js's own registerJob convention) — checks
// every real pending ignored-alert record whose real follow-up window has
// arrived, fetches real current prices in one real batch call, grades
// each, and persists the real result. Best-effort: a real quote fetch
// failure for one symbol never blocks the rest of the real sweep.
async function runIgnoredAlertFollowUps({ nowMs = Date.now() } = {}) {
  const { fetchQuoteBatchWithFallback } = require("./providers/yahoo");
  const pending = getRecordsByQualifyReason(QUALIFY_REASON).filter((r) => r.followUp && !r.followUp.checked && r.followUp.checkAtMs <= nowMs);
  if (!pending.length) return { checked: 0 };

  const symbols = [...new Set(pending.map((r) => r.symbol))];
  const quotes = await fetchQuoteBatchWithFallback(symbols).catch(() => []);
  const priceBySymbol = new Map(quotes.map((q) => [String(q.symbol || "").toUpperCase(), Number(q.regularMarketPrice)]));

  let checked = 0;
  for (const r of pending) {
    const currentPrice = priceBySymbol.get(String(r.symbol).toUpperCase());
    if (!Number.isFinite(currentPrice)) continue; // honest skip — real quote unavailable this sweep, retried next one
    const result = gradeIgnoredOutcome({
      entry: r.riskDecision?.entry, stop: r.riskDecision?.stop, targets: r.riskDecision?.targets, currentPrice, windowElapsed: true,
    });
    updateAuditRecord(r.id, { followUp: { ...r.followUp, checked: true, result, checkedAtMs: nowMs, priceAtCheck: currentPrice } });
    checked++;
  }
  return { checked };
}

module.exports = {
  checkForIgnoredSignal, runIgnoredAlertFollowUps, gradeIgnoredOutcome,
  QUALIFY_REASON, FOLLOW_UP_DELAY_MS, STATE_PATH,
};
