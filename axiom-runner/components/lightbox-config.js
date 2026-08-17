// lightbox-config.js — shared thresholds/timing for the Live Trade Light
// Box (LightBoxTab.jsx, LightBoxCard.jsx). Keep confirmBars/timeframe in
// sync with the server's src/lightbox-config.js. Colors are deliberately
// NOT hardcoded here — this app's own convention (see GreenLightTab.jsx's
// sigBg/sigCol helpers) is to always derive semantic color from the theme
// object (C.green/C.amber/C.red) passed into every component, never a
// literal hex baked into a config file, so Light Box stays correct across
// this app's theme system instead of fighting it. Only the glow's
// intensity (numeric, theme-independent) lives here as config.
export const LIGHTBOX_DEFAULTS = {
  confirmBars: 3,        // default; user-adjustable via Settings, sent to /api/market/lightbox
  pollMs: 25000,         // client poll cadence — the route reads persisted state (cheap), safe to poll faster than the underlying ~55s scan cache
  timeframe: "15m",
  glowBlur: 26,           // px
  glowSpread: 4,          // px
  pulseMs: 1500,          // how long the on-change pulse animation plays
};

// GREEN/YELLOW/RED (the signal engine's internal vocabulary, matching every
// other GREEN/YELLOW/RED surface in this app) → BUY/WAIT/SELL (Light Box's
// display vocabulary, per the explicit spec).
export const SIGNAL_TO_STATE = { GREEN: "BUY", YELLOW: "WAIT", RED: "SELL" };

// state ("BUY"|"WAIT"|"SELL") -> the matching theme color token key on C.
// 2026-08-17: switched from a green/amber/red traffic light to match a
// reference design the user provided — a single blue accent for BUY/WAIT
// (badge, border, progress bar) with only the SELL/EXIT card's border
// breaking to the app's strongest neutral ink color. Explicit, informed
// tradeoff (confirmed via AskUserQuestion): BUY and WAIT now read the same
// color at a glance, distinguished only by the state text/badge itself,
// not by card color — the opposite of the original "green=BUY, amber=
// WAIT, red=SELL, one-second glance" spec. If that one-second-glance
// requirement matters again later, this is the one map to change back.
export const STATE_COLOR_KEY = { BUY: "accent", WAIT: "accent", SELL: "text" };
// Progress bar fill is always this same blue accent regardless of state,
// matching the reference (every example card had a blue bar).
export const BAR_COLOR_KEY = "accent";
