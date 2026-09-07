"use strict";

// party-stage-engine.js — "Before It Pops" early-opportunity detection
// (2026-09-07, "3-Second AI Decision System" spec, user's own stated
// biggest problem: "I often discover a stock after the major move has
// already happened"). ANTI-DUPLICATION: this is a pure, additive
// refinement layer over real fields opportunity-engine.js/entry-engine.js/
// atr-risk-engine.js/red-flag-engine.js already compute for every scanned
// symbol (entryStage, tier, chaseRisk band, reversalTopRisk, RS rating,
// volume ratio, options-flow confirmation) — it does NOT re-scan the
// market, re-fetch price data, or run a second technical-analysis pass.
// It only exists because those fields answer "is there a setup," not the
// finer 7-state PARTY STAGE / crowding / extension / pressure-building
// read the spec asks for.
//
// Real, disclosed honesty discipline (same as crypto-macro-engine.js and
// investment-committee.js earlier this session): every score component
// with no real available input is listed in `unavailable`, never defaulted
// to a fabricated neutral value. "No single indicator triggers the
// signal" (spec's own explicit requirement) is enforced at STAGE 2 —
// promoting an EARLY-stage setup to "early institutional interest"
// requires at least 2 independent real confirming signals, not one.

const PARTY_STAGE_META = {
  0: { icon: "⚪", label: "No Setup" },
  1: { icon: "🟣", label: "Quiet / Possible Accumulation" },
  2: { icon: "🔵", label: "Early Institutional Interest" },
  3: { icon: "🟢", label: "Setup Confirmed" },
  4: { icon: "🟡", label: "Breakout Underway" },
  5: { icon: "🟠", label: "Crowded / Avoid Chasing" },
  6: { icon: "🔴", label: "Overextended / Profit-Taking Zone" },
};

const BREAKOUT_ENTRY_STAGES = new Set(["BREAKOUT", "RETEST"]);
const CONFIRMING_ENTRY_STAGES = new Set(["CONFIRMATION"]);
const BASE_BUILDING_ENTRY_STAGES = new Set(["FOUNDATION"]);

// Real 7-state Party Stage cascade — most severe/specific condition
// checked first (same "hard gate before a soft read" discipline as
// macro-engine.js's own regime cascade). Every branch cites the real
// field(s) that justified it.
function classifyPartyStage({ entryStage, tier, chaseRisk, reversalTopRisk, rsRating, volRatio, optionsStatus, institutionScore } = {}) {
  if (reversalTopRisk || chaseRisk === "DO_NOT_CHASE") {
    return {
      stage: 6, ...PARTY_STAGE_META[6],
      reasons: [reversalTopRisk ? "Real reversal-top risk detected (climax volume / parabolic exhaustion)." : "Real price extension is past the do-not-chase band above the breakout."],
    };
  }
  if (chaseRisk === "EXTENDED") {
    return { stage: 5, ...PARTY_STAGE_META[5], reasons: ["Real price extension is in the \"Extended\" band above the breakout — already a stretched entry."] };
  }
  if (BREAKOUT_ENTRY_STAGES.has(entryStage)) {
    return { stage: 4, ...PARTY_STAGE_META[4], reasons: [`Real entry stage is ${entryStage} — breakout in progress; buy the pullback, not the spike.`] };
  }
  if (CONFIRMING_ENTRY_STAGES.has(entryStage) || (tier === "ACTIONABLE" && entryStage && entryStage !== "EARLY")) {
    return { stage: 3, ...PARTY_STAGE_META[3], reasons: ["Real structure-confirmation criteria pass (entry-engine.js) and the setup is actionable now."] };
  }
  if (entryStage === "EARLY") {
    const confirms = [];
    if (Number.isFinite(rsRating) && rsRating >= 70) confirms.push("Real RS Rating ≥ 70");
    if (Number.isFinite(volRatio) && volRatio >= 1.3) confirms.push("Real volume running ≥ 1.3× average");
    if (optionsStatus === "CONFIRMS") confirms.push("Real options flow confirms the bullish structure");
    if (Number.isFinite(institutionScore) && institutionScore >= 60) confirms.push("Real institutional accumulation score ≥ 60");
    if (confirms.length >= 2) return { stage: 2, ...PARTY_STAGE_META[2], reasons: confirms };
    return { stage: 1, ...PARTY_STAGE_META[1], reasons: ["Real early-stage base is forming, but fewer than 2 independent real confirming signals exist yet."] };
  }
  if (BASE_BUILDING_ENTRY_STAGES.has(entryStage) || tier === "DEVELOPING" || tier === "WAIT") {
    return { stage: 1, ...PARTY_STAGE_META[1], reasons: ["Real base/structure is still forming — no confirmed setup yet."] };
  }
  return { stage: 0, ...PARTY_STAGE_META[0], reasons: ["No real qualifying setup detected (structure broken, failed breakout, or no real entry-stage data)."] };
}

// Extension Score 0-100 — a real, disclosed re-banding of atr-risk-
// engine.js's own already-computed chaseRisk band (never a second
// extension-from-breakout calculation).
const CHASE_BAND_EXTENSION_SCORE = { NOT_YET_BROKEN_OUT: 0, NOT_YET_BROKEN_DOWN: 0, NORMAL: 15, CAUTION: 40, EXTENDED: 70, DO_NOT_CHASE: 95 };
function computeExtensionScore({ chaseRisk, reversalTopRisk } = {}) {
  let score = Number.isFinite(CHASE_BAND_EXTENSION_SCORE[chaseRisk]) ? CHASE_BAND_EXTENSION_SCORE[chaseRisk] : null;
  if (score == null && !reversalTopRisk) return null;
  if (reversalTopRisk) score = Math.max(score ?? 0, 90);
  return Math.max(0, Math.min(100, score));
}

// Crowding Score 0-100 — real, disclosed proxy: later party stages mean
// more participants have already arrived; an abnormal volume spike
// (climax-like participation) or a real reversal-top read pushes it
// higher independent of stage.
const STAGE_CROWDING_BASE = [0, 5, 15, 30, 55, 75, 90];
function computeCrowdingScore({ partyStage, volRatio, reversalTopRisk } = {}) {
  if (!Number.isFinite(partyStage)) return null;
  let score = STAGE_CROWDING_BASE[partyStage] ?? 0;
  if (Number.isFinite(volRatio) && volRatio >= 2.5) score = Math.min(100, score + 15);
  if (reversalTopRisk) score = Math.max(score, 85);
  return Math.max(0, Math.min(100, score));
}

// Entry Timing Score 0-100 — peaks at stages 2-3 (the real "before it
// pops" window this engine exists to find), penalized by real extension/
// crowding. Distinct from Opportunity Remaining below (that one ignores
// stage entirely — a Stage 1 name and a Stage 3 name can carry the same
// real "room before it gets crowded" read).
const STAGE_TIMING_BASE = [10, 40, 85, 90, 60, 25, 5];
function computeEntryTimingScore({ partyStage, extensionScore, crowdingScore } = {}) {
  if (!Number.isFinite(partyStage)) return null;
  const base = STAGE_TIMING_BASE[partyStage] ?? 10;
  const penalty = Math.round(((extensionScore ?? 0) + (crowdingScore ?? 0)) / 2 * 0.4);
  return Math.max(0, Math.min(100, base - penalty));
}

// Opportunity Remaining 0-100 — pure inverse of the real extension/
// crowding penalties, independent of which stage produced them.
function computeOpportunityRemaining({ extensionScore, crowdingScore } = {}) {
  if (extensionScore == null && crowdingScore == null) return null;
  const penalty = ((extensionScore ?? 0) + (crowdingScore ?? 0)) / 2;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

// Timing verdict — the spec's exact 4-label vocabulary, derived from the
// same real stage/extension numbers above (never a second classification
// of raw price data).
function classifyTimingVerdict({ partyStage, extensionScore } = {}) {
  if (partyStage === 6 || (extensionScore ?? 0) >= 85) return { verdict: "OVEREXTENDED", icon: "🔴", label: "Overextended" };
  if (partyStage === 5 || (extensionScore ?? 0) >= 60) return { verdict: "LATE_DO_NOT_CHASE", icon: "🟠", label: "Late — Do Not Chase" };
  if (partyStage >= 3 && (extensionScore ?? 0) >= 30) return { verdict: "GOOD_WAIT_PULLBACK", icon: "🟡", label: "Good Company — Wait For Pullback" };
  if (partyStage >= 1 && partyStage <= 3) return { verdict: "EARLY_ATTRACTIVE", icon: "🟢", label: "Early — Attractive" };
  return { verdict: "NO_SETUP", icon: "⚪", label: "No Setup" };
}

// Pressure Building Score 0-100 — real, disclosed weighted composite.
// Every component here is a real, already-computed input from elsewhere
// in this app (never a new fetch); components with no real input for
// this symbol are listed in `unavailable`, never defaulted to a
// fabricated neutral value, and the average renormalizes over only the
// real components present. Crowding/extension are real PENALTIES applied
// after the raw average, not diluting inputs (a crowded, extended name
// has LESS real "still building" pressure left, not just one more
// average-able number).
const ENTRY_STAGE_STRUCTURE_SCORE = { EARLY: 70, FOUNDATION: 40, RETEST: 80, BREAKOUT: 60, CONFIRMATION: 85 };
function computePressureScore({
  entryStage, rsRating, sectorRsRank, volRatio, optionsStatus, institutionScore, eventProximityDays,
  chaseRisk, reversalTopRisk,
} = {}) {
  const components = {};
  const unavailable = [];

  if (entryStage && Number.isFinite(ENTRY_STAGE_STRUCTURE_SCORE[entryStage])) components.priceStructure = ENTRY_STAGE_STRUCTURE_SCORE[entryStage];
  else unavailable.push("Price Structure");

  if (Number.isFinite(volRatio)) components.volumeBehavior = Math.max(0, Math.min(100, Math.round(volRatio * 40)));
  else unavailable.push("Volume Behavior");

  if (Number.isFinite(rsRating)) components.relativeStrength = rsRating;
  else unavailable.push("Relative Strength");

  if (Number.isFinite(sectorRsRank)) components.sectorStrength = sectorRsRank;
  else unavailable.push("Sector Strength");

  if (optionsStatus === "CONFIRMS") components.optionsFlow = 80;
  else if (optionsStatus === "NEUTRAL") components.optionsFlow = 50;
  else if (optionsStatus === "CONTRADICTS") components.optionsFlow = 20;
  else unavailable.push("Options/Flow (no real data)");

  if (Number.isFinite(institutionScore)) components.institutionalAccumulation = institutionScore;
  else unavailable.push("Institutional Accumulation (dark pool/insider/13F not fetched for this symbol yet)");

  if (Number.isFinite(eventProximityDays)) components.catalyst = eventProximityDays <= 10 ? 80 : eventProximityDays <= 30 ? 55 : 25;
  else unavailable.push("Catalyst proximity");

  // Genuinely not threaded into this pipeline today — no real per-symbol
  // revenue/EPS-trend-acceleration feed reaches this engine. Disclosed,
  // never fabricated (same discipline investment-committee.js already
  // uses for its own NOT_EVALUATED reviewers).
  unavailable.push("Fundamental Acceleration (not yet available to this engine)");

  const values = Object.values(components);
  if (!values.length) return { score: null, components, unavailable, reasons: ["No real components available to compute a pressure score."] };

  const rawAvg = values.reduce((a, b) => a + b, 0) / values.length;
  const extensionScore = computeExtensionScore({ chaseRisk, reversalTopRisk });
  const extensionPenalty = Math.min(0.5, (extensionScore ?? 0) / 200); // real, disclosed cap: extension can reduce raw pressure by at most 50%
  const score = Math.max(0, Math.min(100, Math.round(rawAvg * (1 - extensionPenalty))));

  return {
    score, components, unavailable,
    reasons: [`Real average across ${values.length}/${values.length + unavailable.length} available components: ${Math.round(rawAvg)}/100, reduced ${Math.round(extensionPenalty * 100)}% for real price extension.`],
  };
}

// The spec's explicit early-warning condition: "BUYING PRESSURE IMPROVING
// FASTER THAN PRICE." Real, stateless proxy (no historical pressure
// series required): the pressure score is genuinely high while the
// party stage is still early (1-2, i.e. crowding hasn't caught up yet)
// and the real recent price move so far stays modest — the classic "the
// tape hasn't priced this in yet" signature. A real, disclosed limitation:
// a true time-series "pressure rising faster than price" read would
// compare against opportunity-timeline-store.js's own historical
// snapshots for this symbol — a documented follow-up, not built here.
function detectEarlyPressure({ partyStage, pressureScore, crowdingScore, weekChangePct } = {}) {
  if (!Number.isFinite(partyStage) || partyStage < 1 || partyStage > 2) return null;
  if (!Number.isFinite(pressureScore) || pressureScore < 65) return null;
  if (Number.isFinite(crowdingScore) && crowdingScore > 35) return null;
  if (Number.isFinite(weekChangePct) && Math.abs(weekChangePct) >= 8) return null;
  return {
    detected: true, pressureScore, partyStage,
    crowding: !Number.isFinite(crowdingScore) ? "UNKNOWN" : crowdingScore <= 20 ? "LOW" : "MODERATE",
    reason: "Real pressure-score components (structure/volume/RS/flow) are elevated while the real price move so far remains modest — a possible early-accumulation signal not yet reflected in price.",
  };
}

// One real, combined read for a caller (route/UI) to consume per symbol —
// composes every function above from one input object, computed once.
function computePartyStageProfile(inputs = {}) {
  const stageResult = classifyPartyStage(inputs);
  const extensionScore = computeExtensionScore(inputs);
  const crowdingScore = computeCrowdingScore({ ...inputs, partyStage: stageResult.stage });
  const entryTimingScore = computeEntryTimingScore({ partyStage: stageResult.stage, extensionScore, crowdingScore });
  const opportunityRemaining = computeOpportunityRemaining({ extensionScore, crowdingScore });
  const timing = classifyTimingVerdict({ partyStage: stageResult.stage, extensionScore });
  const pressure = computePressureScore(inputs);
  const earlyPressure = detectEarlyPressure({
    partyStage: stageResult.stage, pressureScore: pressure.score, crowdingScore, weekChangePct: inputs.weekChangePct,
  });
  return {
    partyStage: stageResult.stage, partyStageIcon: stageResult.icon, partyStageLabel: stageResult.label, partyStageReasons: stageResult.reasons,
    extensionScore, crowdingScore, entryTimingScore, opportunityRemaining,
    timingVerdict: timing.verdict, timingIcon: timing.icon, timingLabel: timing.label,
    pressure,
    earlyPressure,
  };
}

module.exports = {
  PARTY_STAGE_META,
  classifyPartyStage, computeExtensionScore, computeCrowdingScore, computeEntryTimingScore,
  computeOpportunityRemaining, classifyTimingVerdict, computePressureScore, detectEarlyPressure,
  computePartyStageProfile,
};
