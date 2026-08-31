// market-wrap-engine.js — pure, deterministic helpers for the daily 4:30
// PM ET Market Wrap (explicit user request, 2026-08-31: "i also want to
// do research about stock markets update daily at 4:30 pm i want deep
// scan deep analysis what stocks moving up or down what big news what
// big events how healthy is spy and qqq and other ETF and also sectors
// what next move"). Same split as research-intel-engine.js: zero AI
// calls here — market-wrap-ai.js's job — kept separate so this half is
// unit-testable.
//
// Real-grounding discipline (car-business-engine.js's own VIN-grounding
// pattern, applied here to symbols/prices): the AI is given REAL movers
// (symbol/price/changePct, from a real quote fetch) and REAL sector
// rotation data (symbol/name/change/status, from the already-computed
// real sectorRotation) as ground truth, and its job is ONLY to explain
// WHY (a "reason"/"note" narrative) — never to restate or invent the
// number itself. mergeMoverReasons/mergeSectorNotes below always use the
// REAL number from the real input, matching an AI-supplied reason onto
// it by symbol; an AI reason for a symbol that isn't in the real input
// set is silently dropped, never fabricated into a new real-looking row.
"use strict";

const HEALTH_VERDICTS = ["STRONG", "HEALTHY", "NEUTRAL", "WEAK", "AT_RISK"];
const NEWS_IMPACTS = ["HIGH", "MEDIUM", "LOW"];

function clampPct(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

function strList(raw, max, maxLen) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, max).map((x) => String(x || "").slice(0, maxLen)).filter(Boolean);
}

// {verdict, reason} for spyHealth/qqqHealth — honest default (NEUTRAL,
// not a fabricated STRONG/WEAK) when the AI's verdict is missing or
// outside the real enum.
function sanitizeHealth(raw) {
  if (!raw || typeof raw !== "object") return { verdict: "NEUTRAL", reason: "" };
  return {
    verdict: HEALTH_VERDICTS.includes(raw.verdict) ? raw.verdict : "NEUTRAL",
    reason: String(raw.reason || "").slice(0, 300),
  };
}

// Real movers (symbol/price/changePct) merged with the AI's real-symbol-
// matched reasons — the real number always wins, the AI only ever adds
// color. `aiReasons` may be malformed/missing entirely (honest empty
// reason), but `realMovers` (already real, already sorted) is always
// what's returned, in the same order.
function mergeMoverReasons(realMovers, aiReasons) {
  if (!Array.isArray(realMovers)) return [];
  const bySymbol = new Map();
  if (Array.isArray(aiReasons)) {
    for (const r of aiReasons) {
      const symbol = String(r?.symbol || "").trim().toUpperCase();
      if (!symbol || bySymbol.has(symbol)) continue;
      bySymbol.set(symbol, String(r?.reason || "").slice(0, 220));
    }
  }
  return realMovers.map((m) => ({
    symbol: m.symbol,
    price: Number.isFinite(Number(m.price)) ? Number(m.price) : null,
    changePct: clampPct(m.changesPercentage ?? m.changePct),
    reason: bySymbol.get(String(m.symbol || "").toUpperCase()) || "",
  }));
}

// Same real-number-wins merge for sector health — realSectors already
// carries the real sym/name/change/status from sectorRotation.ranked;
// the AI only supplies `note`.
function mergeSectorNotes(realSectors, aiNotes) {
  if (!Array.isArray(realSectors)) return [];
  const bySymbol = new Map();
  if (Array.isArray(aiNotes)) {
    for (const n of aiNotes) {
      const sector = String(n?.sector || "").trim().toUpperCase();
      if (!sector || bySymbol.has(sector)) continue;
      bySymbol.set(sector, String(n?.note || "").slice(0, 220));
    }
  }
  return realSectors.map((s) => ({
    sector: s.sym,
    name: s.name || null,
    changePct: clampPct(s.change),
    status: s.status || null,
    note: bySymbol.get(String(s.sym || "").toUpperCase()) || "",
  }));
}

function sanitizeNewsItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const headline = String(raw.headline || "").slice(0, 200);
  if (!headline) return null;
  return {
    headline,
    summary: String(raw.summary || "").slice(0, 300),
    impact: NEWS_IMPACTS.includes(raw.impact) ? raw.impact : "MEDIUM",
  };
}
function sanitizeBigNews(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map(sanitizeNewsItem).filter(Boolean);
}

function sanitizeOutlook(raw) {
  if (!raw || typeof raw !== "object") return { note: "", watchFor: [] };
  return {
    note: String(raw.note || "").slice(0, 500),
    watchFor: strList(raw.watchFor, 6, 160),
  };
}

module.exports = {
  HEALTH_VERDICTS, NEWS_IMPACTS,
  sanitizeHealth, mergeMoverReasons, mergeSectorNotes, sanitizeBigNews, sanitizeOutlook,
};
