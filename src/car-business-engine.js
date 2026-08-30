// car-business-engine.js — pure, deterministic helpers for the Car Business
// Intelligence layer (2026-08-30 explicit user goal: "CAR BUSINESS... Help
// me become significantly more successful and profitable in the car
// business over the next 24 months... DO NOT MIX IT WITH THE TRADING
// ENGINE. DO NOT CREATE DUPLICATE AI ENGINES."). Same split as
// research-intel-engine.js: zero AI calls here (that's car-business-ai.js's
// job) — sanitizes the AI's raw JSON into safe, bounded shapes and computes
// the real, code-graded diff/notification logic. Kept separate specifically
// so this half is unit-testable.
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
const BUY_CLASSIFICATIONS = ["BUY_AGGRESSIVELY", "BUY", "SELECTIVE", "WATCH", "AVOID"];
const CARD_STATUSES = ["NEW", "STRENGTHENED", "WEAKENED", "INVALIDATED", "UNCHANGED"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"];
const DATA_QUALITIES = ["FACT", "DATA", "RESEARCH", "ESTIMATE", "ANALYSIS", "SPECULATION"];

function clamp0to100(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
}
function strList(raw, max, maxLen) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, max).map((x) => String(x || "").slice(0, maxLen)).filter(Boolean);
}

// Real market-section sanitizer (spec section 1: AUTO MARKET — new/used/
// wholesale/auctions/EV/hybrid/ICE/etc, each with a 🟢/🟡/🟠/🔴 verdict).
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

// Real inventory-scoring sanitizer (spec section 4: rank the DEALER'S OWN
// REAL current lot, not invented vehicles — the AI is given the real
// inventory list as grounding and asked to score each real VIN).
function sanitizeInventoryScores(raw, realVins) {
  if (!Array.isArray(raw)) return [];
  const known = new Set((realVins || []).map((v) => String(v || "").toUpperCase()));
  return raw.slice(0, 200).map((r) => {
    if (!r || typeof r !== "object") return null;
    const vin = String(r.vin || "").toUpperCase().slice(0, 17);
    // Never score a vehicle that isn't actually on the real lot — the AI
    // must ground every score in the real inventory it was handed, never
    // invent a VIN.
    if (!vin || !known.has(vin)) return null;
    return {
      vin,
      score: clamp0to100(r.score),
      classification: BUY_CLASSIFICATIONS.includes(r.classification) ? r.classification : "WATCH",
      reason: String(r.reason || "").slice(0, 240),
      expectedGross: Number.isFinite(Number(r.expectedGross)) ? Math.round(Number(r.expectedGross)) : null,
      expectedDaysToSell: Number.isFinite(Number(r.expectedDaysToSell)) ? Math.round(Number(r.expectedDaysToSell)) : null,
      action: String(r.action || "").slice(0, 120),
    };
  }).filter(Boolean);
}

// Real opportunity-card sanitizer (spec sections 11/13: daily opportunity
// board) — same shape discipline as research-intel-engine.js's sanitizeCards.
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
    if (s.classification === "BUY_AGGRESSIVELY" && (s.score ?? 0) >= 85) {
      triggers.push({ kind: "STRONG_LOT_VEHICLE", detail: `${s.vin}: ${s.reason}` });
    }
  }
  return triggers;
}

module.exports = {
  BUSINESS_DIMENSIONS, SECTION_CLASSIFICATIONS, OPPORTUNITY_CLASSIFICATIONS, BUY_CLASSIFICATIONS, CARD_STATUSES, RISK_LEVELS, DATA_QUALITIES,
  sanitizeMarketSections, sanitizeInventoryScores, sanitizeOpportunityCards, sanitizeDimensions, dimensionsToSnapshot,
  computeNotificationTriggers,
};
