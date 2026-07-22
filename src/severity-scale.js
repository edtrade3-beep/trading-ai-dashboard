// One shared 5-tier severity scale for the X Intelligence Engine.
//
// Before this file, at least 4 different severity ladders existed with
// different tier counts/names: distribution-risk's DANGER/CAUTION/WATCH/
// NORMAL (routes/market.js), VIX regime's Low/Normal/Elevated/Panic
// (advisor-ai.js classifyVolRegime), fear&greed's EXTREME FEAR/FEAR/NEUTRAL/
// GREED/EXTREME GREED (routes/market.js), and the user's own spec asking for
// two DIFFERENT 5-tier names in the same document (Module 8's "NORMAL/WATCH/
// ELEVATED/HIGH/EXTREME" vs the UI section's "🟢 NORMAL 🟡 WATCH 🟠 CAUTION
// 🔴 HIGH RISK ⚫ PANIC"). Shipping two different unlabeled scales in one UI
// is confusing, so this file is the single scale everything new maps onto —
// the UI-icon version, since it already has real emoji defined and "PANIC"
// matches the existing VIX-regime "Panic" label already used elsewhere.
//
// This does NOT change any existing scorer's internal math or its own
// exported label (e.g. distribution-risk keeps returning "DANGER" from its
// own function) — toSeverityLevel() is a pure display-layer mapping other
// code can optionally use to render a consistent badge.

const LEVELS = [
  { level: "NORMAL",   emoji: "🟢", min: 0 },
  { level: "WATCH",    emoji: "🟡", min: 20 },
  { level: "CAUTION",  emoji: "🟠", min: 40 },
  { level: "HIGH RISK", emoji: "🔴", min: 65 },
  { level: "PANIC",    emoji: "⚫", min: 85 },
];

// score: a real 0-100 value from any existing scorer (distribution riskScore,
// an unusual-activity ratio scaled to 0-100, etc.) — this file makes no
// assumption about how the score was computed, only how to label it.
function toSeverityLevel(score) {
  if (!Number.isFinite(score)) return null;
  const clamped = Math.max(0, Math.min(100, score));
  let match = LEVELS[0];
  for (const l of LEVELS) { if (clamped >= l.min) match = l; }
  return { level: match.level, emoji: match.emoji, score: clamped };
}

module.exports = { LEVELS, toSeverityLevel };
