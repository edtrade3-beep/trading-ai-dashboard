// Presentation-only metadata for the canonical AssetDecision vocabulary.
// The server owns the decision; this file never calculates or changes it.
export const FINAL_VERDICT_META = {
  STRONG_BUY: { icon: "🟢", label: "STRONG BUY", color: "#0d9465" },
  BUY: { icon: "🟢", label: "BUY", color: "#0d9465" },
  WATCH: { icon: "🟡", label: "WATCH", color: "#d6a312" },
  WAIT: { icon: "⚪", label: "WAIT", color: "#8a94a6" },
  HOLD: { icon: "🔵", label: "HOLD", color: "#2563eb" },
  REDUCE: { icon: "🟠", label: "REDUCE", color: "#e08a1e" },
  EXIT: { icon: "🟣", label: "EXIT", color: "#6d5dd3" },
  AVOID: { icon: "🔴", label: "AVOID", color: "#c8282a" },
  // Compatibility labels for historical snapshots/legacy payloads. These
  // aliases are presentation-only; the server canonical vocabulary remains
  // the eight values above.
  EARLY_BUY: { icon: "🟢", label: "BUY", color: "#0d9465" },
  AVOID_LONG: { icon: "🔴", label: "AVOID", color: "#c8282a" },
  TAKE_PROFIT: { icon: "🟠", label: "REDUCE", color: "#e08a1e" },
};

export const OPPORTUNITY_STAGE_LABELS = {
  DORMANT: "Dormant", DEVELOPING: "Developing", EMERGING: "Emerging",
  ACTIONABLE: "Actionable", CONFIRMED: "Confirmed", EXTENDED: "Extended",
  EXHAUSTED: "Exhausted", INVALIDATED: "Invalidated",
};
