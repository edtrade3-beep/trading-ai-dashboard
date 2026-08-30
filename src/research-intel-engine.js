// research-intel-engine.js — pure, deterministic helpers for the Research
// Intelligence layer (upgrade-search, 2026-08-30). Sanitizes the AI's raw
// JSON output into safe, bounded shapes and computes the real, code-graded
// diff/notification logic. Zero AI calls in this file — that's
// research-intel-ai.js's job (mirrors command-center-ai.js's own split:
// deterministic flags/scores computed here, AI enrichment layered on by the
// caller). Kept separate specifically so this half is unit-testable.
"use strict";

// The fixed set of narrative dimensions this app tracks explicitly (spec's
// own example list: "FED CUTS -> HIKE RISK", "SOFT LANDING -> RECESSION
// RISK", "AI BOOM -> AI CAPEX BUBBLE", etc.). A FIXED key set, not an AI-
// invented one, so "did dimension X shift" is always a real, checkable
// string comparison against yesterday's stored value for that exact key —
// never a fuzzy match across differently-worded dimensions.
const NARRATIVE_DIMENSIONS = [
  "fed-policy-direction",
  "growth-inflation-regime",
  "ai-narrative",
  "consumer-health",
  "fiscal-stance",
  "labor-market",
];

const RESEARCH_CATEGORIES = ["market", "economy", "fed-rates", "fiscal-debt", "politics-policy", "technology"];
const CLASSIFICATIONS = ["EARLY_OPPORTUNITY", "DEVELOPING", "CONFIRMED", "CROWDED", "LATE_DO_NOT_CHASE", "NEGATIVE_CATALYST"];
const DATA_QUALITIES = ["FACT", "DATA", "RESEARCH", "ESTIMATE", "ANALYSIS", "SPECULATION"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"];
const CARD_STATUSES = ["NEW", "STRENGTHENED", "WEAKENED", "INVALIDATED", "UNCHANGED"];
const POLICY_STATUSES = ["rhetoric", "proposed", "confirmed"];

function clamp01to100(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
}

function strList(raw, max, maxLen) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, max).map((x) => String(x || "").slice(0, maxLen)).filter(Boolean);
}

// Real card-status default: an item the AI didn't explicitly tag (or tagged
// with something outside the real enum) is treated as NEW rather than
// silently dropped or mislabeled UNCHANGED — a genuinely new finding should
// never be hidden by an honest-degrade default.
function sanitizeCard(raw) {
  if (!raw || typeof raw !== "object") return null;
  const headline = String(raw.headline || "").slice(0, 160);
  if (!headline) return null;
  return {
    headline,
    category: RESEARCH_CATEGORIES.includes(raw.category) ? raw.category : "market",
    classification: CLASSIFICATIONS.includes(raw.classification) ? raw.classification : "DEVELOPING",
    whatChanged: String(raw.whatChanged || "").slice(0, 300),
    whyItMatters: String(raw.whyItMatters || "").slice(0, 300),
    marketExpectation: String(raw.marketExpectation || "").slice(0, 260),
    mispriced: String(raw.mispriced || "").slice(0, 260),
    beneficiaries: strList(raw.beneficiaries, 8, 40),
    losers: strList(raw.losers, 8, 40),
    timing: String(raw.timing || "").slice(0, 60),
    opportunity: clamp01to100(raw.opportunity),
    confidence: clamp01to100(raw.confidence),
    risk: RISK_LEVELS.includes(raw.risk) ? raw.risk : null,
    confirms: String(raw.confirms || "").slice(0, 220),
    invalidates: String(raw.invalidates || "").slice(0, 220),
    sources: strList(raw.sources, 6, 80),
    dataQuality: DATA_QUALITIES.includes(raw.dataQuality) ? raw.dataQuality : "ANALYSIS",
    policyStatus: POLICY_STATUSES.includes(raw.policyStatus) ? raw.policyStatus : null,
    priorHeadline: raw.priorHeadline ? String(raw.priorHeadline).slice(0, 160) : null,
    status: CARD_STATUSES.includes(raw.status) ? raw.status : "NEW",
  };
}

function sanitizeCards(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map(sanitizeCard).filter(Boolean);
}

function sanitizeTechDiscovery(raw) {
  if (!raw || typeof raw !== "object") return null;
  const technology = String(raw.technology || "").slice(0, 120);
  if (!technology) return null;
  return {
    technology,
    maturity: String(raw.maturity || "").slice(0, 100),
    problemSolved: String(raw.problemSolved || "").slice(0, 260),
    whyNow: String(raw.whyNow || "").slice(0, 260),
    marketSize: String(raw.marketSize || "").slice(0, 160),
    adoptionTimeline: String(raw.adoptionTimeline || "").slice(0, 100),
    publicCompanies: strList(raw.publicCompanies, 10, 60),
    supplyChain: strList(raw.supplyChain, 10, 60),
    winners: strList(raw.winners, 8, 60),
    losers: strList(raw.losers, 8, 60),
    risks: strList(raw.risks, 6, 200),
    sources: strList(raw.sources, 6, 80),
    priorHeadline: raw.priorHeadline ? String(raw.priorHeadline).slice(0, 160) : null,
    status: CARD_STATUSES.includes(raw.status) ? raw.status : "NEW",
  };
}

function sanitizeTechDiscoveries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map(sanitizeTechDiscovery).filter(Boolean);
}

// Real narrative-shift sanitizer + the actual shift determination — the AI
// proposes today's state per dimension, but "did it shift" is a real,
// deterministic string comparison against yesterday's STORED value for
// that same fixed dimension key, not the AI's own self-reported "shifted"
// flag (which could be honestly mistaken or inconsistent run to run).
function sanitizeNarrativeShifts(raw, priorDimensions) {
  if (!Array.isArray(raw)) return [];
  const prior = priorDimensions && typeof priorDimensions === "object" ? priorDimensions : {};
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const dimension = NARRATIVE_DIMENSIONS.includes(item.dimension) ? item.dimension : null;
    if (!dimension || seen.has(dimension)) continue; // one real read per dimension, first wins
    seen.add(dimension);
    const state = String(item.state || "").slice(0, 60);
    if (!state) continue;
    const priorState = prior[dimension] || null;
    const shifted = !!priorState && priorState.toLowerCase() !== state.toLowerCase();
    out.push({
      dimension, state, priorState,
      shifted,
      whyItMatters: String(item.whyItMatters || "").slice(0, 260),
    });
  }
  return out;
}

// The real next snapshot of narrative-dimension state, for tomorrow's diff
// — plain key:value, independent of whatever prose the AI wrote this run.
function dimensionsToSnapshot(narrativeShifts) {
  const snap = {};
  for (const s of narrativeShifts) snap[s.dimension] = s.state;
  return snap;
}

// Real cross-run lookup — attaches the classification the matched prior-day
// card actually had (by exact-normalized-headline match against
// priorHeadline, which the AI supplies when it recognizes a continuation),
// so "EARLY -> CONFIRMED" promotion (spec trigger #8) is checked against a
// real stored prior value, never an AI self-report of its own promotion.
function normHeadline(h) { return String(h || "").trim().toLowerCase(); }
function attachPriorClassification(cards, priorCards) {
  const byHeadline = new Map((priorCards || []).map((c) => [normHeadline(c.headline), c.classification]));
  return cards.map((c) => {
    const priorClassification = c.priorHeadline ? byHeadline.get(normHeadline(c.priorHeadline)) || null : null;
    return { ...c, priorClassification };
  });
}

// The real, spec-scoped notification gate (spec's 8 numbered triggers) —
// deterministic, computed from the sanitized+diffed output, never from raw
// AI text. Returns [] when nothing qualifies (most days), same "don't
// notify on ordinary news" discipline as the rest of this alert system.
function computeNotificationTriggers({ narrativeShifts, cards, techDiscoveries, invalidatedCount }) {
  const triggers = [];
  for (const s of narrativeShifts) {
    if (s.shifted) triggers.push({ kind: "NARRATIVE_SHIFT", detail: `${s.dimension}: ${s.priorState} -> ${s.state}`, whyItMatters: s.whyItMatters });
  }
  for (const c of cards) {
    if (c.status === "INVALIDATED") triggers.push({ kind: "RESEARCH_INVALIDATED", detail: c.headline });
    // EARLY -> CONFIRMED promotion (spec trigger #8) is only detectable when
    // this exact headline/topic was tracked yesterday as EARLY_OPPORTUNITY
    // and reads CONFIRMED today — real cross-run state, not a same-run guess.
    if (c.status !== "NEW" && c.classification === "CONFIRMED" && c.priorClassification === "EARLY_OPPORTUNITY") {
      triggers.push({ kind: "EARLY_BECAME_CONFIRMED", detail: c.headline });
    }
    if (c.status === "NEW" && (c.category === "fed-rates" || c.category === "economy") && (c.opportunity ?? 0) >= 60) {
      triggers.push({ kind: "FED_OUTLOOK_MATERIAL", detail: c.headline });
    }
    if (c.status === "NEW" && c.category === "politics-policy" && (c.opportunity ?? 0) >= 55) {
      triggers.push({ kind: "POLICY_MATERIAL", detail: c.headline });
    }
    if (c.status === "NEW" && (c.opportunity ?? 0) >= 70 && c.risk !== "HIGH") {
      triggers.push({ kind: "SECTOR_OR_STOCK_CATALYST", detail: c.headline });
    }
  }
  for (const t of techDiscoveries) {
    if (t.status === "NEW") triggers.push({ kind: "NEW_TECHNOLOGY_THEME", detail: t.technology });
  }
  return triggers;
}

module.exports = {
  NARRATIVE_DIMENSIONS, RESEARCH_CATEGORIES, CLASSIFICATIONS, DATA_QUALITIES, RISK_LEVELS, CARD_STATUSES, POLICY_STATUSES,
  sanitizeCards, sanitizeTechDiscoveries, sanitizeNarrativeShifts, dimensionsToSnapshot,
  attachPriorClassification, computeNotificationTriggers,
};
