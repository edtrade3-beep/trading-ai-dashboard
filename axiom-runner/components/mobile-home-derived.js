// mobile-home-derived.js — small, pure, disclosed derivations for the
// Mobile Home Grid's "Risk Level" / "Today's Focus" summary cards
// (2026-08-23, mobile nav redesign). Both read off real computeRegime
// output (trade-planner-scoring.js / market-helpers.js's score/vixVal) —
// neither is a fabricated number or static copy, but neither maps to an
// existing single field elsewhere in this codebase either, so both are
// new, small, honest rule-based labels rather than re-derivations of
// something that already exists. Pure, dependency-free — no server twin
// needed (mobile-only, client-side).

// Risk Level — real VIX-based bands. Thresholds are a disclosed,
// adjustable judgment call (no existing "risk level" field anywhere in
// this codebase to match against), not a fitted or backtested model.
export function deriveRiskLevel(vixVal) {
  if (!Number.isFinite(vixVal)) return { label: "UNKNOWN", color: "#94a3b8", note: "VIX data unavailable" };
  if (vixVal < 15) return { label: "LOW", color: "#0d9465", note: "Calm conditions" };
  if (vixVal <= 25) return { label: "MODERATE", color: "#d6a312", note: "Manage risk wisely" };
  return { label: "HIGH", color: "#c8282a", note: "Elevated volatility" };
}

// Today's Focus — a small, honest, rule-based label off real
// regime.score/vixVal (never a static/decorative string). Disclosed
// judgment call: no existing computed field in this codebase maps to
// this concept directly.
export function deriveTodaysFocus(regime) {
  const score = Number(regime?.score);
  const vix = Number(regime?.vixVal);
  if (!Number.isFinite(score)) return { label: "STAY SELECTIVE", note: "Discipline. Patience. Profit." };
  if (score >= 75 && (!Number.isFinite(vix) || vix < 20)) return { label: "QUALITY SETUPS", note: "Discipline. Patience. Profit." };
  if (score < 40) return { label: "CAPITAL PRESERVATION", note: "Protect first, trade second." };
  return { label: "STAY SELECTIVE", note: "Discipline. Patience. Profit." };
}
