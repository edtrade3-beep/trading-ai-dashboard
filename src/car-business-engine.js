// car-business-engine.js — pure, deterministic helpers for the Car Business
// Intelligence layer. Zero AI calls here (that's car-business-ai.js's job)
// — sanitizes the AI's raw JSON into safe, bounded shapes and computes the
// real, code-graded diff/notification/synthesis logic. Kept separate
// specifically so this half is unit-testable.
//
// Upgraded 2026-08-30 (explicit user /goal: "upgrade CAR BUSINESS... into a
// dealership PROFIT + INTELLIGENCE SYSTEM... DO NOT create another AI
// engine.") — every new function below is either a sanitizer for one of
// car-business-ai.js's (now 3, still all the same callAnthropicWithSearch
// chokepoint) calls, or a REAL, DISCLOSED, deterministic formula (matching
// command-center-ai.js's own "formula with visible inputs, not another AI
// opinion" discipline for computeCommandScore/computeRiskStance) — never a
// 4th AI call just to synthesize what the other 3 already produced.
"use strict";

// Fixed narrative dimensions this app tracks explicitly for the car
// business (mirrors research-intel-engine.js's NARRATIVE_DIMENSIONS
// pattern) — a FIXED key set so "did dimension X shift" is always a real
// string comparison against yesterday's stored value, never a fuzzy match.
const BUSINESS_DIMENSIONS = [
  "auto-market", // BULLISH/NEUTRAL/BEARISH
  "credit-environment", // EASING/NORMAL/TIGHT
  "used-market", // STRONG/NORMAL/WEAK
  "new-market", // STRONG/NORMAL/WEAK
  "inventory-stance", // BUY/SELECTIVE/REDUCE
  "pricing-direction", // RAISING/STABLE/FALLING
  "dealer-environment", // IMPROVING/STABLE/DETERIORATING
];

const SECTION_CLASSIFICATIONS = ["STRONG", "NORMAL", "WEAKENING", "HIGH_RISK"];
const OPPORTUNITY_CLASSIFICATIONS = ["EARLY", "DEVELOPING", "CONFIRMED", "CROWDED", "LATE", "AVOID"];
// Spec's exact §1 vocabulary (2026-08-30 upgrade) — renamed from the prior
// BUY_AGGRESSIVELY/BUY pair. UNDERPRICED_OPPORTUNITY is deliberately the
// top tier, distinct from STRONG_BUY: a real, disclosed mispricing read
// (the AI found evidence THIS specific unit is priced below real
// comparable market value), not just "this category sells well."
const BUY_CLASSIFICATIONS = ["UNDERPRICED_OPPORTUNITY", "STRONG_BUY", "SELECTIVE", "WATCH", "AVOID"];
const TURN_VERDICTS = ["FAST_TURN", "NORMAL", "SLOW", "EXIT_RISK"];
const DEAD_INVENTORY_ACTIONS = ["HOLD", "PRICE_CUT", "PROMOTE", "REPOSITION", "WHOLESALE", "EXIT"];
const CARD_STATUSES = ["NEW", "STRENGTHENED", "WEAKENED", "INVALIDATED", "UNCHANGED"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"];
const DATA_QUALITIES = ["FACT", "DATA", "RESEARCH", "ESTIMATE", "ANALYSIS", "SPECULATION"];
const REGULATION_FLAGS = ["ACTION_REQUIRED", "WATCH", "NO_MATERIAL_IMPACT"];
const FUTURE_IMPACTS = ["CREATE_PROFIT", "DESTROY_PROFIT", "MIXED"];
const FINAL_VERDICTS = ["EXPAND", "BUY_SELECTIVELY", "HOLD", "REDUCE_RISK", "DEFENSIVE"];
const LEARNING_VERDICTS = ["CORRECT", "PARTIALLY_CORRECT", "WRONG", "TOO_EARLY", "TOO_LATE", "MISSED_OPPORTUNITY", "UNKNOWN"];

function clamp0to100(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
}
function strList(raw, max, maxLen) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, max).map((x) => String(x || "").slice(0, maxLen)).filter(Boolean);
}

// Real market-section sanitizer (AUTO MARKET / FINANCE / FTC-REGULATION —
// each with a STRONG/NORMAL/WEAKENING/HIGH_RISK verdict).
function sanitizeMarketSections(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 16).map((s) => {
    if (!s || typeof s !== "object") return null;
    const category = String(s.category || "").slice(0, 60);
    if (!category) return null;
    return {
      category,
      classification: SECTION_CLASSIFICATIONS.includes(s.classification) ? s.classification : "NORMAL",
      summary: String(s.summary || "").slice(0, 300),
      dataQuality: DATA_QUALITIES.includes(s.dataQuality) ? s.dataQuality : "ANALYSIS",
      sources: strList(s.sources, 5, 80),
    };
  }).filter(Boolean);
}

// Real inventory-scoring sanitizer — ranks the DEALER'S OWN REAL current
// lot, never an invented vehicle. daysOnLot is computed HERE from the real
// inventory record's own real createdAt (never AI-estimated — this app
// already knows the real answer). turnVerdict/deadInventoryAction are the
// AI's real read, but daysOnLot itself is ground truth handed back for the
// UI to show alongside it.
function sanitizeInventoryScores(raw, realVehiclesByVin) {
  if (!Array.isArray(raw)) return [];
  const known = realVehiclesByVin instanceof Map ? realVehiclesByVin : new Map();
  return raw.slice(0, 200).map((r) => {
    if (!r || typeof r !== "object") return null;
    const vin = String(r.vin || "").toUpperCase().slice(0, 17);
    // Never score a vehicle that isn't actually on the real lot — the AI
    // must ground every score in the real inventory it was handed, never
    // invent a VIN.
    const real = known.get(vin);
    if (!vin || !real) return null;
    const daysOnLot = Number.isFinite(Number(real.createdAt))
      ? Math.max(0, Math.round((Date.now() - Number(real.createdAt)) / 86_400_000))
      : null;
    return {
      vin,
      score: clamp0to100(r.score),
      classification: BUY_CLASSIFICATIONS.includes(r.classification) ? r.classification : "WATCH",
      reason: String(r.reason || "").slice(0, 240),
      expectedGross: Number.isFinite(Number(r.expectedGross)) ? Math.round(Number(r.expectedGross)) : null,
      expectedDaysToSell: Number.isFinite(Number(r.expectedDaysToSell)) ? Math.round(Number(r.expectedDaysToSell)) : null,
      turnVerdict: TURN_VERDICTS.includes(r.turnVerdict) ? r.turnVerdict : null,
      deadInventoryAction: DEAD_INVENTORY_ACTIONS.includes(r.deadInventoryAction) ? r.deadInventoryAction : null,
      daysOnLot,
      action: String(r.action || "").slice(0, 120),
    };
  }).filter(Boolean);
}

// Real opportunity-card sanitizer (daily opportunity board) — same shape
// discipline as research-intel-engine.js's sanitizeCards.
function sanitizeOpportunityCards(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((c) => {
    if (!c || typeof c !== "object") return null;
    const headline = String(c.headline || "").slice(0, 160);
    if (!headline) return null;
    return {
      headline,
      classification: OPPORTUNITY_CLASSIFICATIONS.includes(c.classification) ? c.classification : "DEVELOPING",
      whyNow: String(c.whyNow || "").slice(0, 260),
      buyPrice: String(c.buyPrice || "").slice(0, 60),
      targetRetail: String(c.targetRetail || "").slice(0, 60),
      expectedGross: String(c.expectedGross || "").slice(0, 60),
      expectedDaysToTurn: String(c.expectedDaysToTurn || "").slice(0, 60),
      customer: String(c.customer || "").slice(0, 160),
      leadSource: String(c.leadSource || "").slice(0, 120),
      risk: RISK_LEVELS.includes(c.risk) ? c.risk : null,
      confidence: clamp0to100(c.confidence),
      priorHeadline: c.priorHeadline ? String(c.priorHeadline).slice(0, 160) : null,
      status: CARD_STATUSES.includes(c.status) ? c.status : "NEW",
    };
  }).filter(Boolean);
}

// §2/§3 — "What should I buy tomorrow" + the Buy-Price Engine, folded
// together (the buy-price fields live per-recommendation, which is the
// practical realization of a "target buy/max buy/target list" engine
// without a separate, disconnected calculator).
function sanitizeBuyRecommendations(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((r) => {
    if (!r || typeof r !== "object") return null;
    const vehicle = String(r.vehicle || "").slice(0, 120);
    if (!vehicle) return null;
    return {
      vehicle,
      year: String(r.year || "").slice(0, 20),
      mileageRange: String(r.mileageRange || r.mileage || "").slice(0, 60),
      trim: String(r.trim || "").slice(0, 60),
      targetBuy: String(r.targetBuy || "").slice(0, 40),
      maxBuy: String(r.maxBuy || "").slice(0, 40),
      expectedRetail: String(r.expectedRetail || "").slice(0, 40),
      expectedGross: String(r.expectedGross || "").slice(0, 40),
      expectedDaysToTurn: String(r.expectedDaysToTurn || "").slice(0, 40),
      competition: String(r.competition || "").slice(0, 160),
      demandScore: clamp0to100(r.demandScore),
      financingDifficulty: RISK_LEVELS.includes(r.financingDifficulty) ? r.financingDifficulty : null,
      repairRisk: RISK_LEVELS.includes(r.repairRisk) ? r.repairRisk : null,
      confidence: clamp0to100(r.confidence),
      whyNow: String(r.whyNow || "").slice(0, 260),
    };
  }).filter(Boolean);
}

function sanitizeAvoidList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((r) => {
    if (!r || typeof r !== "object") return null;
    const vehicle = String(r.vehicle || "").slice(0, 120);
    if (!vehicle) return null;
    return { vehicle, reason: String(r.reason || "").slice(0, 220) };
  }).filter(Boolean);
}

// §7 — Customer Intelligence.
function sanitizeCustomerSegments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((s) => {
    if (!s || typeof s !== "object") return null;
    const segment = String(s.segment || "").slice(0, 80);
    if (!segment) return null;
    return {
      segment,
      wants: String(s.wants || "").slice(0, 200),
      priceRange: String(s.priceRange || "").slice(0, 60),
      paymentRange: String(s.paymentRange || "").slice(0, 60),
      downPayment: String(s.downPayment || "").slice(0, 60),
      creditProfile: String(s.creditProfile || "").slice(0, 120),
      commonObjection: String(s.commonObjection || "").slice(0, 200),
      bestVehicle: String(s.bestVehicle || "").slice(0, 120),
      bestChannel: String(s.bestChannel || "").slice(0, 80),
    };
  }).filter(Boolean);
}

// §8 — Lead Engine. realData is computed HERE (never AI-claimed) — true
// only for channels this app actually has real tracked lead counts for
// (currently just Facebook, via fb-hub.js's CRM). Every other channel's
// row is real general market research about that channel, honestly
// labeled as not this dealership's own measured performance.
function sanitizeLeadChannels(raw, realChannelsWithData) {
  if (!Array.isArray(raw)) return [];
  const real = new Set((realChannelsWithData || []).map((c) => String(c).toLowerCase()));
  return raw.slice(0, 14).map((c) => {
    if (!c || typeof c !== "object") return null;
    const channel = String(c.channel || "").slice(0, 60);
    if (!channel) return null;
    const hasRealData = real.has(channel.toLowerCase());
    return {
      channel,
      hasRealData,
      leadCount: hasRealData && Number.isFinite(Number(c.leadCount)) ? Math.round(Number(c.leadCount)) : null,
      notes: String(c.notes || "").slice(0, 220),
    };
  }).filter(Boolean);
}

// §9 — Lead -> Door -> Sale funnel. stageCounts must be the REAL counts
// this code already computed from the real CRM (never AI-invented numbers)
// — the AI only interprets which real gap is biggest and what to do about it.
function sanitizeFunnelRead(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    biggestLeak: String(raw.biggestLeak || "").slice(0, 200),
    topActions: strList(raw.topActions, 3, 160),
  };
}

// §10 — Finance / Consumer Stress.
function sanitizeFinanceRead(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    summary: String(raw.summary || "").slice(0, 400),
    verdict: ["EASING", "NORMAL", "TIGHT"].includes(raw.verdict) ? raw.verdict : "NORMAL",
    sources: strList(raw.sources, 5, 80),
  };
}

// §11 — FTC / Regulation.
function sanitizeRegulationFlags(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((r) => {
    if (!r || typeof r !== "object") return null;
    const summary = String(r.summary || "").slice(0, 260);
    if (!summary) return null;
    return {
      flag: REGULATION_FLAGS.includes(r.flag) ? r.flag : "WATCH",
      summary,
      source: String(r.source || "").slice(0, 120),
    };
  }).filter(Boolean);
}

// §12 — Automotive Future Scanner.
function sanitizeFutureScan(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((r) => {
    if (!r || typeof r !== "object") return null;
    const technology = String(r.technology || "").slice(0, 100);
    if (!technology) return null;
    return {
      technology,
      impact: FUTURE_IMPACTS.includes(r.impact) ? r.impact : "MIXED",
      summary: String(r.summary || "").slice(0, 260),
    };
  }).filter(Boolean);
}

// §4 — Local Market Gap (real web-search-grounded read — complementary to,
// not a replacement for, the existing precise single-VIN /api/dealer/
// price-beat comps tool already in the dealer portal).
function sanitizeLocalMarketGap(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    summary: String(raw.summary || "").slice(0, 400),
    underservedSegments: strList(raw.underservedSegments, 6, 120),
    sources: strList(raw.sources, 5, 80),
  };
}

// §13 — 24-Month Forecast, compact (one real narrative per case rather than
// a full 4-horizon x 3-case matrix — see car-business-ai.js's own header
// for why that full matrix is a disclosed, deliberate v1 scope cut).
function sanitizeForecast(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    baseCase: String(raw.baseCase || "").slice(0, 400),
    bullCase: String(raw.bullCase || "").slice(0, 260),
    bearCase: String(raw.bearCase || "").slice(0, 260),
  };
}

function sanitizeDimensions(raw, priorDimensions) {
  if (!Array.isArray(raw)) return [];
  const prior = priorDimensions && typeof priorDimensions === "object" ? priorDimensions : {};
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const dimension = BUSINESS_DIMENSIONS.includes(item.dimension) ? item.dimension : null;
    if (!dimension || seen.has(dimension)) continue;
    seen.add(dimension);
    const state = String(item.state || "").slice(0, 40);
    if (!state) continue;
    const priorState = prior[dimension] || null;
    const shifted = !!priorState && priorState.toLowerCase() !== state.toLowerCase();
    out.push({ dimension, state, priorState, shifted, whyItMatters: String(item.whyItMatters || "").slice(0, 260) });
  }
  return out;
}

function dimensionsToSnapshot(dims) {
  const snap = {};
  for (const d of dims) snap[d.dimension] = d.state;
  return snap;
}

// The real, spec-scoped notification gate — only real, disclosed triggers,
// same "don't notify on ordinary research" discipline as
// research-intel-engine.js's computeNotificationTriggers.
function computeNotificationTriggers({ dimensions, opportunities, inventoryScores }) {
  const triggers = [];
  for (const d of dimensions) {
    if (d.shifted) triggers.push({ kind: "BUSINESS_SHIFT", detail: `${d.dimension}: ${d.priorState} -> ${d.state}`, whyItMatters: d.whyItMatters });
  }
  for (const o of opportunities) {
    if (o.status === "INVALIDATED") triggers.push({ kind: "OPPORTUNITY_INVALIDATED", detail: o.headline });
    if (o.status === "NEW" && (o.classification === "EARLY" || o.classification === "DEVELOPING") && (o.confidence ?? 0) >= 60) {
      triggers.push({ kind: "NEW_OPPORTUNITY", detail: o.headline });
    }
  }
  for (const s of inventoryScores) {
    if ((s.classification === "UNDERPRICED_OPPORTUNITY" || s.classification === "STRONG_BUY") && (s.score ?? 0) >= 85) {
      triggers.push({ kind: "STRONG_LOT_VEHICLE", detail: `${s.vin}: ${s.reason}` });
    }
    if (s.deadInventoryAction && s.deadInventoryAction !== "HOLD") {
      triggers.push({ kind: "DEAD_INVENTORY_ACTION", detail: `${s.vin}: ${s.deadInventoryAction} — ${s.reason}` });
    }
  }
  return triggers;
}

// ── §14 Daily Command Center + ONE FINAL VERDICT — real, deterministic
// synthesis of everything the 3 real AI calls already produced. NOT a 4th
// AI call: every field here is a direct pick from an already-sanitized
// real array, same "formula with visible inputs" discipline as
// command-center-ai.js's computeCommandScore/computeRiskStance.
function computeFinalVerdict(dimensions) {
  // Real, disclosed +1/-1 scoring per dimension state — a documented
  // judgment call (which states count as headwind vs tailwind), not a
  // precise science. 5 tiers map to the spec's exact vocabulary.
  const POSITIVE = new Set(["BULLISH", "EASING", "STRONG", "BUY", "RAISING", "IMPROVING"]);
  const NEGATIVE = new Set(["BEARISH", "TIGHT", "WEAK", "REDUCE", "FALLING", "DETERIORATING"]);
  let score = 0;
  for (const d of dimensions) {
    if (POSITIVE.has(d.state)) score += 1;
    else if (NEGATIVE.has(d.state)) score -= 1;
  }
  let verdict;
  if (score >= 4) verdict = "EXPAND";
  else if (score >= 2) verdict = "BUY_SELECTIVELY";
  else if (score >= -1) verdict = "HOLD";
  else if (score >= -3) verdict = "REDUCE_RISK";
  else verdict = "DEFENSIVE";
  return { verdict, score, inputs: dimensions.map((d) => ({ dimension: d.dimension, state: d.state, weight: POSITIVE.has(d.state) ? 1 : NEGATIVE.has(d.state) ? -1 : 0 })) };
}

function computeCommandCenter({ dimensions, opportunities, buyRecommendations, inventoryScores, customerSegments, leadChannels, futureScan, forecast, biggestRisk }) {
  const topOpp = [...opportunities].sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1))[0] || null;
  const topBuys = [...buyRecommendations].sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1)).slice(0, 3);
  const priceRangeVehicle = topBuys[0];
  const topSegment = customerSegments[0] || null;
  const realChannel = leadChannels.find((c) => c.hasRealData) || leadChannels[0] || null;
  const topFuture = futureScan.find((f) => f.impact === "CREATE_PROFIT") || futureScan[0] || null;
  const marketShift = dimensions.find((d) => d.shifted) || null;

  return {
    marketChange: marketShift ? `${marketShift.dimension}: ${marketShift.priorState} → ${marketShift.state}` : "No dimension shift today.",
    bestOpportunity: topOpp?.headline || null,
    vehiclesToBuy: topBuys.map((b) => b.vehicle),
    bestPriceRange: priceRangeVehicle ? `${priceRangeVehicle.targetBuy} – ${priceRangeVehicle.maxBuy}` : null,
    bestCustomerSegment: topSegment?.segment || null,
    bestLeadChannel: realChannel?.channel || null,
    howToGetCustomersIn: topSegment?.bestChannel || null,
    biggestRisk: biggestRisk || null,
    futureTechnology: topFuture?.technology || null,
    twentyFourMonthOutlook: forecast?.baseCase || null,
    finalVerdict: computeFinalVerdict(dimensions),
  };
}

// ── §15 Learning System — real predicted-vs-actual grading. Compares a
// STORED PAST inventory-score prediction against the CURRENT real
// inventory record (soldPrice/soldAt if sold, real elapsed days if not) —
// never fabricated, never re-derived from a guess. Grading only fires once
// enough real time has passed to fairly judge the prediction (see
// MIN_GRADE_AGE_DAYS) — an ungraded-too-soon prediction is honestly
// reported as not-yet-gradable, never forced into a verdict.
const MIN_GRADE_AGE_DAYS = 3;

function gradeInventoryPrediction(pastScore, realVehicle, predictedAtMs) {
  const now = Date.now();
  const daysSincePrediction = (now - predictedAtMs) / 86_400_000;
  if (!realVehicle) {
    return { vin: pastScore.vin, verdict: "UNKNOWN", reason: "Vehicle no longer in real inventory records — outcome not tracked." };
  }
  const predictedDays = pastScore.expectedDaysToSell;
  const wasBuyCall = pastScore.classification === "UNDERPRICED_OPPORTUNITY" || pastScore.classification === "STRONG_BUY";

  if (Number(realVehicle.soldPrice) > 0) {
    const soldAtMs = Number(realVehicle.soldAt) || null;
    const daysToSell = soldAtMs ? Math.round((soldAtMs - predictedAtMs) / 86_400_000) : null;
    if (daysToSell != null && Number.isFinite(predictedDays)) {
      if (daysToSell <= predictedDays * 1.3) return { vin: pastScore.vin, verdict: "CORRECT", reason: `Sold in ${daysToSell}d — predicted ${predictedDays}d.` };
      if (daysToSell <= predictedDays * 2) return { vin: pastScore.vin, verdict: "PARTIALLY_CORRECT", reason: `Sold in ${daysToSell}d — slower than the predicted ${predictedDays}d.` };
      return { vin: pastScore.vin, verdict: "TOO_LATE", reason: `Sold in ${daysToSell}d — well past the predicted ${predictedDays}d.` };
    }
    return { vin: pastScore.vin, verdict: wasBuyCall ? "CORRECT" : "PARTIALLY_CORRECT", reason: "Sold; no comparable predicted timeline on file." };
  }

  // Still on the real lot, unsold.
  if (daysSincePrediction < MIN_GRADE_AGE_DAYS) {
    return { vin: pastScore.vin, verdict: "TOO_EARLY", reason: "Not enough real time has passed to grade this prediction yet." };
  }
  const graceDays = Number.isFinite(predictedDays) ? predictedDays : 30;
  if (wasBuyCall && daysSincePrediction > graceDays * 1.5) {
    return { vin: pastScore.vin, verdict: "WRONG", reason: `Predicted a fast mover (${predictedDays ?? "n/a"}d) — still on the real lot after ${Math.round(daysSincePrediction)}d.` };
  }
  if (pastScore.classification === "AVOID" && daysSincePrediction > graceDays) {
    return { vin: pastScore.vin, verdict: "CORRECT", reason: "Correctly flagged as slow — still real real unsold inventory." };
  }
  return { vin: pastScore.vin, verdict: "TOO_EARLY", reason: "Still on the real lot; outcome not yet resolved." };
}

// pastEntries: real stored car-business-store.js history entries (each
// with .inventoryScores + .at, the real generation timestamp). Only grades
// entries old enough to fairly judge (MIN_GRADE_AGE_DAYS), and only the
// most recent gradable snapshot per VIN (a vehicle scored on multiple past
// days isn't double-counted — the freshest real prediction wins).
function gradeLearningHistory(pastEntries, currentInventory) {
  const byVin = new Map((currentInventory || []).map((v) => [String(v.vin || "").toUpperCase(), v]));
  const now = Date.now();
  const latestGradeableByVin = new Map();
  for (const entry of pastEntries || []) {
    const atMs = entry.at ? new Date(entry.at).getTime() : null;
    if (!atMs || (now - atMs) / 86_400_000 < MIN_GRADE_AGE_DAYS) continue;
    for (const s of entry.inventoryScores || []) {
      const existing = latestGradeableByVin.get(s.vin);
      if (!existing || atMs > existing.atMs) latestGradeableByVin.set(s.vin, { score: s, atMs });
    }
  }
  const graded = [];
  for (const [vin, { score, atMs }] of latestGradeableByVin) {
    const result = gradeInventoryPrediction(score, byVin.get(vin), atMs);
    graded.push({ ...result, classification: score.classification, predictedAt: new Date(atMs).toISOString() });
  }
  return graded;
}

module.exports = {
  BUSINESS_DIMENSIONS, SECTION_CLASSIFICATIONS, OPPORTUNITY_CLASSIFICATIONS, BUY_CLASSIFICATIONS,
  TURN_VERDICTS, DEAD_INVENTORY_ACTIONS, CARD_STATUSES, RISK_LEVELS, DATA_QUALITIES,
  REGULATION_FLAGS, FUTURE_IMPACTS, FINAL_VERDICTS, LEARNING_VERDICTS, MIN_GRADE_AGE_DAYS,
  sanitizeMarketSections, sanitizeInventoryScores, sanitizeOpportunityCards,
  sanitizeBuyRecommendations, sanitizeAvoidList, sanitizeCustomerSegments, sanitizeLeadChannels,
  sanitizeFunnelRead, sanitizeFinanceRead, sanitizeRegulationFlags, sanitizeFutureScan,
  sanitizeLocalMarketGap, sanitizeForecast,
  sanitizeDimensions, dimensionsToSnapshot, computeNotificationTriggers,
  computeFinalVerdict, computeCommandCenter,
  gradeInventoryPrediction, gradeLearningHistory,
};
