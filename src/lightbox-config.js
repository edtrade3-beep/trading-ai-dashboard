// lightbox-config.js — shared thresholds/timing for the Live Trade Light
// Box feature (src/lightbox-engine.js, src/lightbox-state-store.js). Keep
// in sync with the client's axiom-runner/components/lightbox-config.js.
// Plain duplicated constants rather than the byte-parity dual-file pattern
// trading-utils.js/greenlight-calc.js use — these are flat values with no
// branching logic, so a value drift is a trivial diffable typo, not the
// kind of subtle behavioral drift that pattern exists to catch.
"use strict";

const LIGHTBOX_DEFAULTS = {
  // Consecutive genuinely-new daytrade-scan refreshes (gated on the scan's
  // own generatedAt, not raw HTTP polls — see lightbox-engine.js) that must
  // agree before a state change is confirmed. The scan itself is cached
  // ~55s server-side, so confirmBars=3 means roughly 2-5 real minutes of
  // sustained agreement, the closest practical approximation of "N bars"
  // without building real 15m-bar-close scheduling.
  confirmBars: 3,
  confirmBarsMin: 1,
  confirmBarsMax: 10,
  timeframe: "15m",
  maxTransitions: 200, // ring buffer cap for the persisted state-change log
};

// GREEN/YELLOW/RED (computeDayTradeSignal's own vocabulary, matching every
// other GREEN/YELLOW/RED surface in this app) → BUY/WAIT/SELL (Light Box's
// outward-facing display vocabulary, per the explicit spec). Used only when
// building the API response / transition-log strings — the persisted store
// and engine keep GREEN/YELLOW/RED internally.
const SIGNAL_TO_STATE = { GREEN: "BUY", YELLOW: "WAIT", RED: "SELL" };

module.exports = { LIGHTBOX_DEFAULTS, SIGNAL_TO_STATE };
