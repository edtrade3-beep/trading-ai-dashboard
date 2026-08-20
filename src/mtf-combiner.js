"use strict";

// mtf-combiner.js — MTF_ALIGNMENT_SCORE, MTF Decision System Phase 2
// (2026-08-20). Confirmed via the Phase 1/2 architecture audit: nothing
// in this codebase combines multiple timeframes into one alignment read
// today — genuinely new. Honors the spec's explicit hierarchy
// (1D > 4H > 1H > 15M > 5M) via weights, and its explicit "do NOT
// blindly average, never hide conflicts" instruction — a same-sign
// disagreement between a higher and lower timeframe is surfaced
// explicitly, not smoothed away into one number.

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// Suggested starting weights from the spec — centralized here, not
// scattered, so they're the one place to tune later against real
// backtested results (Phase 7).
const DEFAULT_WEIGHTS = { "1D": 0.25, "4H": 0.20, "1H": 0.20, "15M": 0.25, "5M": 0.10 };
const ORDER = ["1D", "4H", "1H", "15M", "5M"];

// Normalizes each timeframe's own native vocabulary (BULLISH/NEUTRAL/
// BEARISH, STRONG/DEVELOPING/WEAK/BROKEN, a 0-100 EARLY score, CONFIRMED/
// APPROACHING/NOT_READY/INVALIDATED, a retest true/false) into one
// -1..+1 bullishness scale so genuinely different concepts can combine
// into a single real number without pretending they're the same thing.
function normalizeRead(tf, raw, weights) {
  const weight = weights[tf] ?? DEFAULT_WEIGHTS[tf] ?? 0;
  if (raw == null) return { tf, known: false, value: null, label: "not available", weight };
  if (tf === "1D") {
    const value = raw === "BULLISH" ? 1 : raw === "BEARISH" ? -1 : 0;
    return { tf, known: true, value, label: raw, weight };
  }
  if (tf === "4H") {
    const value = raw === "STRONG" ? 1 : raw === "DEVELOPING" ? 0.4 : raw === "BROKEN" ? -1 : raw === "WEAK" ? -0.3 : null;
    return { tf, known: value != null, value, label: raw, weight };
  }
  if (tf === "1H") {
    const value = Number.isFinite(raw) ? round2((raw - 50) / 50) : null;
    return { tf, known: value != null, value, label: Number.isFinite(raw) ? `${raw}/100` : "not available", weight };
  }
  if (tf === "15M") {
    const m = { CONFIRMED: 1, APPROACHING: 0.4, NOT_READY: -0.2, INVALIDATED: -1 };
    const value = m[raw] ?? null;
    return { tf, known: value != null, value, label: raw, weight };
  }
  if (tf === "5M") {
    const value = raw === true ? 1 : raw === false ? -0.5 : null;
    return { tf, known: value != null, value, label: raw === true ? "retest confirmed" : raw === false ? "retest failed" : "not available", weight };
  }
  return { tf, known: false, value: null, label: "unknown", weight };
}

// reads: { "1D": "BULLISH"|"NEUTRAL"|"BEARISH"|null,
//          "4H": "STRONG"|"DEVELOPING"|"WEAK"|"BROKEN"|null,
//          "1H": number(0-100)|null,
//          "15M": "CONFIRMED"|"APPROACHING"|"NOT_READY"|"INVALIDATED"|null,
//          "5M": true|false|null }
function computeMtfAlignment(reads, weights = DEFAULT_WEIGHTS) {
  const norm = ORDER.map((tf) => normalizeRead(tf, reads?.[tf], weights));
  const known = norm.filter((r) => r.known);
  const knownWeight = known.reduce((s, r) => s + r.weight, 0);
  const weightedSum = known.reduce((s, r) => s + r.value * r.weight, 0);
  // Renormalized over only the KNOWN timeframes — an unavailable
  // timeframe contributes zero confidence, not zero bullishness. Blending
  // an unknown in as a neutral 0 would silently understate real
  // alignment whenever a timeframe (e.g. 5M) just isn't wired up yet.
  const score = knownWeight > 0 ? Math.round(((weightedSum / knownWeight) + 1) / 2 * 100) : null;

  // Conflict = a higher-authority timeframe reads clearly one direction
  // (|value| >= 0.4) while a lower one reads clearly the other — not
  // just "not identical." The spec's own example: 1D+4H+1H bullish, 15M
  // red -> "wait for 15M confirmation," a normal in-progress state, not a
  // conflict; 1D+4H bearish, 1H+15M bullish -> a real conflict, "short-
  // term bounce against the primary trend."
  const conflicts = [];
  for (let i = 0; i < ORDER.length; i++) {
    for (let j = i + 1; j < ORDER.length; j++) {
      const hi = norm[i], lo = norm[j];
      if (!hi.known || !lo.known) continue;
      const hiSign = Math.sign(hi.value), loSign = Math.sign(lo.value);
      if (hiSign !== 0 && loSign !== 0 && hiSign !== loSign && Math.abs(hi.value) >= 0.4 && Math.abs(lo.value) >= 0.4) {
        conflicts.push({ higher: hi.tf, higherLabel: hi.label, lower: lo.tf, lowerLabel: lo.label });
      }
    }
  }

  const conflictNote = conflicts.length
    ? `${conflicts[0].higher} (${conflicts[0].higherLabel}) disagrees with ${conflicts[0].lower} (${conflicts[0].lowerLabel}) — the higher timeframe has authority here. Treat this as a move against the primary trend, not a normal entry.`
    : null;

  return { score, reads: norm, conflicts, conflictNote, knownCount: known.length };
}

module.exports = { computeMtfAlignment, normalizeRead, DEFAULT_WEIGHTS };
