// day-trade-config.js — real, configurable defaults for the Day Trade
// signal engine (2026-08-19, "Fix Trading Signal Logic — A+ Score vs
// Entry Trigger", explicit user request: "Set a configurable minimum...
// Make this threshold configurable from Settings"). Same small-config-
// module shape as lightbox-config.js's LIGHTBOX_DEFAULTS — the one
// already-proven pattern in this codebase for a background-job-consumed
// numeric threshold.
"use strict";

const DAY_TRADE_DEFAULTS = {
  minBuyScore: 60,
  minBuyScoreMin: 0,
  minBuyScoreMax: 100,
};

module.exports = { DAY_TRADE_DEFAULTS };
