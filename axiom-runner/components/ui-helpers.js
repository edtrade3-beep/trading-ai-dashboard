// Small style/format helpers factored out of the Day Trade tab (and reusable
// anywhere else that wants them) — dedupes the card/button chrome and
// change-coloring logic that used to be re-typed inline at every call site.
import { MONO } from "./theme.js";

// The "bordered card" chrome repeated across panel wrappers: 1px border in
// the theme border color, rounded corners, clipped overflow.
export function cardStyle(C, { radius = 12, background } = {}) {
  return {
    border: `1px solid ${C.border}`,
    borderRadius: radius,
    overflow: "hidden",
    background: background ?? C.bg,
  };
}

// Small mono-font pill button. Pass only what differs from the plain/inactive
// look (border/background/color, or size overrides).
export function buttonChrome(C, { fontSize = 11, fontWeight = 700, padding = "4px 10px", radius = 6, border = C.border, background = "transparent", color = C.textDim } = {}) {
  return { fontFamily: MONO, fontSize, fontWeight, padding, borderRadius: radius, cursor: "pointer", border: `1px solid ${border}`, background, color };
}

// Green/red/neutral by sign — the standard up/down coloring used throughout
// the scanner tables.
export function colorForChange(C, v) {
  return v == null ? C.textDim : v > 0 ? "#0d9465" : v < 0 ? "#c8282a" : C.text;
}

export function formatPct(v) {
  return v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(2) + "%";
}
