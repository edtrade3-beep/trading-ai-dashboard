// curbline-intel-engine.js — pure sanitizers for the daily Curbline
// Intel scan (explicit user request, 2026-08-31: "I WANT LIKE IDEAS
// BUISNESS SIDE UPDATE 8:30 EVERY MORNING DEEP SCAN DEEP ANALYSIS",
// scope narrowed via AskUserQuestion to "Curbline's market specifically
// ... competitors, what independent dealers are actually paying for
// ads/leads today, pricing benchmarks"). No real internal numeric feed
// grounds this one (unlike market-wrap-engine.js's real mover/sector
// data) — the AI's job here IS the real web-research itself. These
// sanitizers only enforce the same "cap array length, drop malformed
// items, honest empty default, never crash" discipline every other
// engine file in this app uses.
"use strict";

function str(v, max) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function sanitizeSummary(raw) {
  return str(raw, 900);
}

function sanitizeCompetitors(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c === "object" && str(c.name, 80))
    .slice(0, 8)
    .map((c) => ({
      name: str(c.name, 80),
      whatTheyDo: str(c.whatTheyDo, 240),
      pricingNote: str(c.pricingNote, 160),
      strength: str(c.strength, 200),
      weakness: str(c.weakness, 200),
    }));
}

function sanitizeSpendNote(raw) {
  if (!raw || typeof raw !== "object") return { note: "", typicalMonthlyRange: "" };
  return {
    note: str(raw.note, 500),
    typicalMonthlyRange: str(raw.typicalMonthlyRange, 80),
  };
}

function sanitizePricingRecommendation(raw) {
  if (!raw || typeof raw !== "object") return { note: "", suggestedPrice: "" };
  return {
    note: str(raw.note, 500),
    suggestedPrice: str(raw.suggestedPrice, 60),
  };
}

function sanitizeIdeaList(raw, keyA, keyB, max) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object" && str(r[keyA], 200))
    .slice(0, max)
    .map((r) => ({ [keyA]: str(r[keyA], 200), [keyB]: str(r[keyB], 300) }));
}

function sanitizeOpportunities(raw) {
  return sanitizeIdeaList(raw, "idea", "reason", 6);
}

function sanitizeRisks(raw) {
  return sanitizeIdeaList(raw, "risk", "reason", 6);
}

function sanitizeWatchFor(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((w) => str(w, 160)).filter(Boolean).slice(0, 6);
}

module.exports = {
  sanitizeSummary,
  sanitizeCompetitors,
  sanitizeSpendNote,
  sanitizePricingRecommendation,
  sanitizeOpportunities,
  sanitizeRisks,
  sanitizeWatchFor,
};
