"use strict";
// Trade Navigator Stage 3 (2026-09-03) — "Why is this moving right now?"
// A pure aggregator over real, already-computed signals — never a second
// scoring engine, never a new fetch. Reads the exact same real per-bucket
// breakdown am-core-engine.js's computeCoreScore already produces
// (opportunity.breakdown), plus the real anti-chase/entry-stage read
// already on the opportunity object. Ranks whichever real categories are
// present by real magnitude and returns the top 1-2 as a plain-English
// reason — it never guesses an importance order when the underlying
// number doesn't exist.
//
// Honest, disclosed v1 scope: newsSignal, sectorRotation, and
// institutionalRead are real, already-computed signals ELSEWHERE in this
// codebase (src/news/scorer.js, src/sector-rotation-engine.js,
// src/watchlist-institutional-alerts.js) but none of them flow into the
// canonical opportunity object today — wiring them in is a genuinely new
// per-symbol fetch, out of scope for this additive stage (matches the
// same two-step pattern this session already used for tradeStructure's
// real option-chain/IV-rank wiring: build the real parameter surface now,
// fill it in later). Passed as null here until a caller wires them up —
// this function already accepts and would rank them the moment they are.
// Premarket-specific volume has no real data source anywhere in this
// codebase at all (confirmed, not merely unwired).

const CATEGORY_LABELS = {
  technical: (v) => `Technical ${v}`,
  trend: () => "Trend confirmation",
  relativeStrength: () => "Relative strength leadership",
  regime: () => "Favorable market regime (SPY/QQQ)",
  options: () => "Options activity confirms the move",
  volume: () => "Volume confirmation",
  catalyst: () => "Fundamentals (EPS growth)",
  news: (v) => `Breaking news: ${v}`,
  sectorRotation: (v) => `Sector rotation: ${v}`,
  institutional: (v) => "Unusual institutional activity",
};

// Real anti-chase band + entry stage -> a real, disclosed technical
// magnitude (0-100) and a short real descriptor — never a fabricated
// "breakout" label when the underlying real read says otherwise.
function technicalRead({ antiChaseBand, entryStage } = {}) {
  const stageLabel = entryStage === "BREAKOUT" ? "breakout"
    : entryStage === "RETEST" ? "retest holding"
    : entryStage === "CONFIRMATION" ? "confirmation" : null;
  if (!stageLabel) return null;
  const magnitude = antiChaseBand === "NOT_YET_BROKEN_OUT" || antiChaseBand === "NORMAL" ? 80
    : antiChaseBand === "CAUTION" ? 55 : 30; // EXTENDED/DO_NOT_CHASE — real signal, but chased too far to lead with
  return { magnitude, label: stageLabel };
}

function computeWhyNow({
  breakdown = null, breakdownMax = null, antiChaseBand = null, entryStage = null,
  newsSignal = null, sectorRotation = null, institutionalRead = null,
} = {}) {
  const candidates = [];

  const tech = technicalRead({ antiChaseBand, entryStage });
  if (tech) candidates.push({ category: "technical", magnitude: tech.magnitude, label: CATEGORY_LABELS.technical(tech.label) });

  if (breakdown && breakdownMax) {
    const norm = (key) => {
      const raw = Number(breakdown[key]);
      const max = Number(breakdownMax[key]);
      return Number.isFinite(raw) && Number.isFinite(max) && max > 0 ? Math.round((raw / max) * 100) : null;
    };
    const trendMagnitude = [norm("trend"), norm("momentum")].filter(Number.isFinite);
    if (trendMagnitude.length) candidates.push({ category: "trend", magnitude: Math.round(trendMagnitude.reduce((a, b) => a + b, 0) / trendMagnitude.length), label: CATEGORY_LABELS.trend() });
    const rs = norm("relativeStrength");
    if (Number.isFinite(rs)) candidates.push({ category: "relativeStrength", magnitude: rs, label: CATEGORY_LABELS.relativeStrength() });
    const regime = norm("regime");
    if (Number.isFinite(regime)) candidates.push({ category: "regime", magnitude: regime, label: CATEGORY_LABELS.regime() });
    const options = norm("optionsConfirmation");
    if (Number.isFinite(options)) candidates.push({ category: "options", magnitude: options, label: CATEGORY_LABELS.options() });
    const volume = norm("volume");
    if (Number.isFinite(volume)) candidates.push({ category: "volume", magnitude: volume, label: CATEGORY_LABELS.volume() });
    const catalyst = norm("catalyst");
    if (Number.isFinite(catalyst)) candidates.push({ category: "catalyst", magnitude: catalyst, label: CATEGORY_LABELS.catalyst() });
  }

  // Real, future-ready slots — honestly null today (see header), ranked
  // exactly like every other category the moment a caller supplies them.
  if (newsSignal && Number.isFinite(newsSignal.magnitude)) candidates.push({ category: "news", magnitude: newsSignal.magnitude, label: CATEGORY_LABELS.news(newsSignal.summary || "material headline") });
  if (sectorRotation && Number.isFinite(sectorRotation.magnitude)) candidates.push({ category: "sectorRotation", magnitude: sectorRotation.magnitude, label: CATEGORY_LABELS.sectorRotation(sectorRotation.sector || "leading sector") });
  if (institutionalRead && Number.isFinite(institutionalRead.magnitude)) candidates.push({ category: "institutional", magnitude: institutionalRead.magnitude, label: CATEGORY_LABELS.institutional() });

  if (!candidates.length) return { primary: null, secondary: [] };
  candidates.sort((a, b) => b.magnitude - a.magnitude);
  return { primary: candidates[0], secondary: candidates.slice(1, 3) };
}

module.exports = { computeWhyNow, technicalRead };
