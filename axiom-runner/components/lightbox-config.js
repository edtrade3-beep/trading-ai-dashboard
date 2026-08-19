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
  confirmBars: 2,        // default (2026-08-19: lowered from 3 — see src/lightbox-config.js); user-adjustable via Settings, sent to /api/market/lightbox
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
// Reverted 2026-08-17 back to the original green/amber/red traffic light
// (explicit user request) — briefly tried a single blue accent to match a
// reference design, but the user wants the real one-second-glance
// distinction back: BUY/WAIT/SELL each get their own real color again.
export const STATE_COLOR_KEY = { BUY: "green", WAIT: "amber", SELL: "red" };
// Progress bar fill matches the card's own state color (not a fixed accent).
export const BAR_COLOR_KEY = null;
