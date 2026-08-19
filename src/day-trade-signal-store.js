// day-trade-signal-store.js — persisted MIN_BUY_SCORE (2026-08-19, "Fix
// Trading Signal Logic" spec). Same real pattern lightbox-state-store.js's
// setConfirmBars already uses: a small dedicated JSON file via
// writeJsonAtomic/readJsonSafe, NOT the generic data/settings.json — that
// file is never read by any background job today (confirmed before
// writing this), so a value that a background job (the Day Trade Telegram
// alert, Light Box's tick) needs to read must live in its own dedicated
// store like this one.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { DAY_TRADE_DEFAULTS } = require("./day-trade-config");

const STORE_PATH = path.join(ROOT, "data", "day-trade-config.json");

function getMinBuyScore() {
  const s = readJsonSafe(STORE_PATH, {});
  const n = Number(s.minBuyScore);
  return Number.isFinite(n) ? n : DAY_TRADE_DEFAULTS.minBuyScore;
}

function setMinBuyScore(n) {
  const clamped = Math.max(DAY_TRADE_DEFAULTS.minBuyScoreMin, Math.min(DAY_TRADE_DEFAULTS.minBuyScoreMax, Math.round(Number(n))));
  if (!Number.isFinite(clamped)) return getMinBuyScore();
  writeJsonAtomic(STORE_PATH, { minBuyScore: clamped });
  return clamped;
}

module.exports = { getMinBuyScore, setMinBuyScore };
