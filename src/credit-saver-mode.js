// credit-saver-mode.js — real, persisted budget-mode state. Re-evaluated
// every time real usage is logged (see anthropic.js's instrumentation
// calling checkAndUpdateMode() after each real call). Not cosmetic: the
// real callers this session cares about most (command-center-ai.js,
// advisor-ai.js) read getMode() at call time and reduce their real
// maxSearches when in "saver" — see each file's own comment at the read
// site for the exact real reduction. x-intel-ai.js no longer reads this
// at all — X Intel was migrated off Anthropic entirely (2026-07) and now
// tracks its own separate real budget in x-api-usage-store.js.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { getMonthEndProjection } = require("./anthropic-usage-store");

const STATE_PATH = path.join(ROOT, "data", "credit-saver-mode.json");
const BUDGET_USD = 25;
// Hysteresis: enter Saver Mode the moment real projected month-end spend
// exceeds the full budget (the spec's literal trigger), but only return to
// Normal once projection drops back under 90% of budget — not the instant
// it dips below 100%. Without this gap, a single day's variance right at
// the boundary could flip the mode back and forth on every usage log,
// which would itself be a form of the "unnecessary churn" this whole
// system exists to avoid.
const EXIT_SAFETY_MARGIN = 0.9;

function load() {
  return readJsonSafe(STATE_PATH, { mode: "normal", enteredAt: null, reason: null });
}
function save(state) { writeJsonAtomic(STATE_PATH, state); }

function getMode() { return load().mode; }
function getState() { return load(); }

// Call after logging real usage (or on a light periodic check) — real,
// re-evaluated decision, not a one-time flag a human has to flip back.
function checkAndUpdateMode() {
  const state = load();
  const projection = getMonthEndProjection();
  if (state.mode === "normal" && projection > BUDGET_USD) {
    const next = { mode: "saver", enteredAt: new Date().toISOString(), reason: `Projected month-end spend $${projection.toFixed(2)} exceeds the $${BUDGET_USD} budget.` };
    save(next);
    return next;
  }
  if (state.mode === "saver" && projection <= BUDGET_USD * EXIT_SAFETY_MARGIN) {
    const next = { mode: "normal", enteredAt: new Date().toISOString(), reason: `Projected month-end spend $${projection.toFixed(2)} back under ${Math.round(EXIT_SAFETY_MARGIN * 100)}% of the $${BUDGET_USD} budget.` };
    save(next);
    return next;
  }
  return state;
}

module.exports = { getMode, getState, checkAndUpdateMode, BUDGET_USD, EXIT_SAFETY_MARGIN };
