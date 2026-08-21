// anti-chase.js — client-side twin of src/atr-risk-engine.js's
// computeAntiChase ONLY (the ATR stop/target half of that file needs real
// server-fetched bars via atrAt and stays server-only). computeAntiChase
// itself is pure, dependency-free math — real input (extensionPct) is
// already computed server-side by buildTrendTemplate as row.abovePivotPct,
// already available client-side on every trend-screen row, so this needs
// zero new fetches. KEEP IN SYNC: any threshold/band change goes in both
// files. See src/atr-risk-engine.js for the full design rationale.
//
// Added 2026-08-21 (Unified Trading System phase 3) so Discover
// (RhProScanner.jsx) and Smart Scan (SmartScanTab.jsx) can pass a REAL
// antiChase band into computeEntryPlan's ev.antiChase — Workspace already
// did this (MarketTerminalTab.jsx); those two never had it, so
// entry-engine.js's real anti-chase gate silently fell back to a cruder
// flat 10% cutoff for them instead of the real graduated bands.

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

const ANTI_CHASE_DEFAULTS = { normalMax: 3, cautionMax: 5, extendedMax: 8 };

export function computeAntiChase(extensionPct, opts = {}) {
  const o = { ...ANTI_CHASE_DEFAULTS, ...opts };
  if (!Number.isFinite(extensionPct)) return { band: null, label: null, extensionPct: null };
  if (extensionPct <= 0) {
    return { band: "NOT_YET_BROKEN_OUT", label: "Price hasn't reached the breakout level yet — no chase risk.", extensionPct: round2(extensionPct) };
  }
  if (extensionPct <= o.normalMax) {
    return { band: "NORMAL", label: `Normal — ${extensionPct.toFixed(1)}% above the breakout`, extensionPct: round2(extensionPct) };
  }
  if (extensionPct <= o.cautionMax) {
    return { band: "CAUTION", label: `Caution — ${extensionPct.toFixed(1)}% above the breakout`, extensionPct: round2(extensionPct), waitingFor: "A pullback toward the breakout level, or continued consolidation." };
  }
  if (extensionPct <= o.extendedMax) {
    return { band: "EXTENDED", label: `Extended — ${extensionPct.toFixed(1)}% above the breakout`, extensionPct: round2(extensionPct), waitingFor: "A real pullback or retest before adding — this is already a stretched entry." };
  }
  return { band: "DO_NOT_CHASE", label: `Do not chase — ${extensionPct.toFixed(1)}% above the breakout`, extensionPct: round2(extensionPct), waitingFor: "A pullback, retest, or a fresh base — this entry is too extended to chase now." };
}

export { ANTI_CHASE_DEFAULTS };
