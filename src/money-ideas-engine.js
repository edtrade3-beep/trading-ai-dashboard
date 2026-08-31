// money-ideas-engine.js — pure sanitizers for the Curbline "Money Ideas"
// scan (explicit user request, 2026-08-31: "ALSO I WANT CURBLINE FOR
// IDEAS TO MAKE MONEY AWAY FROM CARF BUISNESS AND TRADING" — additive to
// the existing Curbline Intel dealer-market scan, deliberately broader:
// real AI-powered ways to make money that are NOT car-dealership-specific
// (Curbline's own product) and NOT trading/investing (this whole app's
// other half). Same "cap array length, drop malformed items, honest
// empty default, never crash" discipline as curbline-intel-engine.js.
"use strict";

const DIFFICULTIES = ["LOW", "MEDIUM", "HIGH"];

function str(v, max) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function sanitizeDifficulty(raw) {
  const v = String(raw || "").toUpperCase();
  return DIFFICULTIES.includes(v) ? v : "MEDIUM";
}

function sanitizeIdeas(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i) => i && typeof i === "object" && str(i.idea, 120))
    .slice(0, 8)
    .map((i) => ({
      idea: str(i.idea, 120),
      whyNow: str(i.whyNow, 300),
      howToStart: str(i.howToStart, 300),
      realExample: str(i.realExample, 200),
      difficulty: sanitizeDifficulty(i.difficulty),
      timeToFirstDollar: str(i.timeToFirstDollar, 60),
    }));
}

function sanitizeTrends(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === "object" && str(t.trend, 120))
    .slice(0, 6)
    .map((t) => ({ trend: str(t.trend, 120), note: str(t.note, 260) }));
}

function sanitizeWatchFor(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((w) => str(w, 160)).filter(Boolean).slice(0, 6);
}

module.exports = { DIFFICULTIES, sanitizeDifficulty, sanitizeIdeas, sanitizeTrends, sanitizeWatchFor };
