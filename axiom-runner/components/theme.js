// Shared design tokens — color themes, fonts, layout constants.
// Single source of truth so every tab/component (whether still in the
// axiom-live.jsx monolith or split out under components/) reads the same
// objects. `C` is a mutable singleton: App() does Object.assign(C, THEME_*)
// on theme switch, and every importer of this module shares that one object
// by reference, so the mutation is visible everywhere without re-rendering
// plumbing.

export const THEME_LIGHT = {
  // Backgrounds — clean bright white page with faint-grey cards (no foggy haze)
  bg:         "#ffffff",
  surface:    "#ffffff",
  card:       "#fbfcfe",
  cardHover:  "#eef4fb",
  // Borders
  border:     "#c8d6e8",
  borderLit:  "#afc4db",
  // Text — dark navy-grey instead of near-black, much gentler on eyes
  text:       "#1e2d3d",   // dark navy-grey — readable but not harsh black
  textSec:    "#3d5068",   // medium navy-grey — secondary info
  textDim:    "#4a6070",   // darker than before — no more unreadable light gray
  // Brand accent
  accent:     "#2563eb",
  accentGlow: "rgba(37,99,235,0.16)",
  // Semantic — slightly softer than pure saturated
  green:      "#0d9465",   // slightly muted emerald
  greenBg:    "rgba(13,148,101,0.10)",
  greenLight: "#4fa87e",   // mild/tentative bullish — lighter than `green`, for multi-tier bias scales
  red:        "#c8282a",   // slightly softer red
  redBg:      "rgba(200,40,42,0.10)",
  redLight:   "#d9636a",   // mild/tentative bearish — lighter than `red`, for multi-tier bias scales
  amber:      "#c96f00",   // warm amber
  amberBg:    "rgba(201,111,0,0.10)",
  cyan:       "#0882a8",
  purple:     "#6d32cc",
  // Standard card elevation — a subtle ambient lift, same pattern already
  // used ad-hoc in SoccerWatchTab/CryptoTab/SecFilingsTab, promoted to a
  // shared token so every card can opt in consistently instead of each
  // component hand-rolling its own shadow value.
  shadow:     "0 1px 3px rgba(15,23,42,0.07), 0 1px 2px rgba(15,23,42,0.05)",
};
export const THEME_DARK = {
  // Backgrounds — warm dark slate, easier on eyes than cold navy
  bg:         "#0f1318",   // warm near-black (slight warm tint, not blue-cold)
  surface:    "#161c24",   // warm dark surface
  card:       "#1c2530",   // card — slightly lighter, warm undertone
  cardHover:  "#222f3e",   // hover — clearly different but not jarring
  // Borders — warm subtle, not harsh
  border:     "#2a3545",
  borderLit:  "#374860",
  // Text — warm cream hierarchy (not cold blue-white)
  text:       "#e8dcc8",   // warm cream — much easier than blue-white over hours
  textSec:    "#9aaa95",   // warm mid-grey — secondary info
  textDim:    "#5a6b70",   // muted warm — hints, captions
  // Accent — softer sky blue (less electric, still clear)
  accent:     "#5b9cf6",
  accentGlow: "rgba(91,156,246,0.22)",
  // Semantic — muted, professional (not neon)
  green:      "#2ec27e",   // natural green — readable, not neon
  greenBg:    "rgba(46,194,126,0.12)",
  greenLight: "#8fd9ae",   // mild/tentative bullish — lighter than `green`, for multi-tier bias scales
  red:        "#e05c6a",   // warm coral-red — easier than harsh bright red
  redBg:      "rgba(224,92,106,0.12)",
  redLight:   "#eb98a0",   // mild/tentative bearish — lighter than `red`, for multi-tier bias scales
  amber:      "#f0a830",   // warm amber
  amberBg:    "rgba(240,168,48,0.13)",
  cyan:       "#42c9d8",   // teal-cyan — softer
  purple:     "#a57ff0",   // soft violet
  // Standard card elevation — see THEME_LIGHT.shadow for rationale.
  shadow:     "0 1px 3px rgba(0,0,0,0.32), 0 1px 2px rgba(0,0,0,0.26)",
};
export const C = { ...THEME_DARK };

// SANS  — clean system UI font for navigation, labels, body copy
export const SANS = `'Inter', system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
// MONO  — true monospace for prices, tickers, percentages, scores — much crisper digits
export const MONO = `'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Roboto Mono', 'Courier New', monospace`;
export const NUM = `'Oswald', 'Inter', system-ui, sans-serif`;   // bold condensed display font for headline numbers
export const LAYOUT = {
  pageMaxWidth: "100%",
  contentPadding: "14px 18px 24px",
  gridGap: 12,
  sidebarWidth: 220,   // persistent left nav (Sidebar.jsx), desktop/tablet only
};
