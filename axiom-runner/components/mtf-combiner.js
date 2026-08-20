// mtf-combiner.js — client-side twin of src/mtf-combiner.js. Pure,
// dependency-free math (no server-only requires), so it's hand-ported
// here rather than fetched — same "small, stable, kept in sync via this
// header comment" discipline as day-trade-calc.js/trading-utils.js and
// sniper-decision.js's server/client copies. KEEP IN SYNC: any formula
// change goes in both files.

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

const DEFAULT_WEIGHTS = { "1D": 0.25, "4H": 0.20, "1H": 0.20, "15M": 0.25, "5M": 0.10 };
const ORDER = ["1D", "4H", "1H", "15M", "5M"];

export function normalizeRead(tf, raw, weights) {
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

export function computeMtfAlignment(reads, weights = DEFAULT_WEIGHTS) {
  const norm = ORDER.map((tf) => normalizeRead(tf, reads?.[tf], weights));
  const known = norm.filter((r) => r.known);
  const knownWeight = known.reduce((s, r) => s + r.weight, 0);
  const weightedSum = known.reduce((s, r) => s + r.value * r.weight, 0);
  const score = knownWeight > 0 ? Math.round(((weightedSum / knownWeight) + 1) / 2 * 100) : null;

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

export { DEFAULT_WEIGHTS };
