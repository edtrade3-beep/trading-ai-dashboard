// final-trade-gate.js — Final Trade Validation Engine, display/policy
// overlay (2026-08-23, explicit user report: a Stage 4 downtrend with a
// real 35/100 Entry Score was showing "WAIT" instead of a hard block).
//
// NOT a new scoring/evidence engine — composes real, already-computed
// evidence from whichever real decision function fits the caller's real
// data-richness tier (simple-decision.js's computeSimpleDecision for the
// Workspace's MTF-equipped read, btc-hpc-scan.js's classifyDeepScanDecision
// for the Scanner's daily-only read — ai-actions.js's own header comment
// explains why these two real vocabularies deliberately stay separate,
// not merged) into ONE shared 6-state display vocabulary:
// 🟢 BUY / 🟡 EARLY WATCH / 🟠 WAIT FOR BREAKOUT / 🔵 HOLD / 🔴 AVOID /
// 🟣 EXIT.
//
// computeSimpleDecision already got its own real fix this same phase (a
// genuine AVOID state, Stage 4 / entry-score / critical-flag hard gates)
// — for source "simple" below, this module is a pure relabel of an
// already-correct real decision, never re-deriving it. classifyDeepScan-
// Decision was deliberately NOT touched (it has other real consumers this
// phase doesn't reach: watchlist-setup-alerts.js, best-opportunities-
// alerts.js, watchlist-sniper-alerts.js, watchlist-turn-alerts.js, the
// BTC+HPC scan) — so for source "deepscan" this module applies the SAME
// new hard gates (Stage 4, entry-score floor, critical red flags)
// directly, since nothing else does for that vocabulary yet.
//
// REDUCE (simple-decision.js's real "take partial profit" state) is a
// disclosed, deliberate exception — classifySimple returns null for it,
// and callers keep REDUCE's own real label/color rather than have it
// force-mapped into one of the 6 (folding it into HOLD would silently
// lose real, actionable information the 6 states have no honest
// equivalent for).

export const FINAL_GATE_META = {
  BUY: { icon: "🟢", label: "BUY", color: "#0d9465" },
  EARLY_WATCH: { icon: "🟡", label: "EARLY WATCH", color: "#d6a312" },
  WAIT_FOR_BREAKOUT: { icon: "🟠", label: "WAIT FOR BREAKOUT", color: "#e08a1e" },
  HOLD: { icon: "🔵", label: "HOLD", color: "#2563eb" },
  AVOID: { icon: "🔴", label: "AVOID", color: "#c8282a" },
  // Distinct violet, not AVOID's red — reuses ai-actions.js's existing
  // ROTATE token rather than inventing a new color. Safe: AVOID (pre-
  // entry) and EXIT (has-position) are mutually exclusive branches in
  // computeSimpleDecision, so there's no ambiguity about which applies.
  EXIT: { icon: "🟣", label: "EXIT", color: "#6d5dd3" },
};

// WAIT_FOR_BREAKOUT when the real blocking reason is specifically about
// price/timing confirmation (15M confirmation still needed, or a real
// entry zone already computed and just not yet triggered); EARLY_WATCH
// when the setup itself is still developing (1H setup, regime, R:R,
// etc.) — both real WAIT sub-cases already present in computeSimpleDeci-
// sion's own reasoning, never independently re-derived here.
function splitWait({ why, entryZone } = {}) {
  const text = String(why || "");
  if (/15M confirmation/.test(text) || (entryZone && entryZone !== "BLOCKED")) return "WAIT_FOR_BREAKOUT";
  return "EARLY_WATCH";
}

function classifySimple(input) {
  switch (input.decision) {
    case "START_SMALL":
    case "ADD":
      return "BUY";
    case "HOLD":
      return "HOLD";
    case "AVOID":
      return "AVOID";
    case "EXIT":
      return "EXIT";
    case "WAIT":
      return splitWait(input);
    default:
      return null; // REDUCE and any unrecognized value — caller keeps its own real label
  }
}

function classifyDeepscan(input) {
  const { decision, stage, entryScore, criticalFlagCount } = input;
  if (Number(criticalFlagCount) > 0) return "AVOID";
  if (stage != null && String(stage).startsWith("Stage 4")) return "AVOID";
  if (entryScore != null && entryScore < 75) return "AVOID";
  switch (decision) {
    case "A_PLUS_EARLY_BUY":
    case "BUY":
    case "PULLBACK_BUY":
      return "BUY";
    case "EXTENDED":
      return "WAIT_FOR_BREAKOUT";
    case "WAIT":
      return "EARLY_WATCH";
    case "AVOID":
      return "AVOID";
    default:
      return null;
  }
}

// input: { source: "simple", decision, why, entryZone } (computeSimpleDe-
// cision's own output, spread in) OR { source: "deepscan", decision,
// stage, entryScore, criticalFlagCount } (classifyDeepScanDecision's
// decision plus the 3 real inputs it doesn't itself see). Returns null
// for REDUCE / any unrecognized input — never a guessed state.
export function classifyFinalTradeGate(input = {}) {
  const state = input.source === "deepscan" ? classifyDeepscan(input) : classifySimple(input);
  if (state == null) return null;
  return { state, ...FINAL_GATE_META[state] };
}

// Dynamic "why not buy" reasons list. source "simple" reuses
// computeSimpleDecision's own already-real why/redFlags (never
// re-derived); source "deepscan" assembles the equivalent from the 3
// real inputs classifyDeepScanDecision itself doesn't see, plus its own
// real reason text.
export function buildWhyNotBuy(input = {}) {
  if (input.source === "deepscan") {
    const reasons = [];
    if (Number(input.criticalFlagCount) > 0) reasons.push(`${input.criticalFlagCount} critical red flag${input.criticalFlagCount > 1 ? "s" : ""} active`);
    if (input.stage != null && String(input.stage).startsWith("Stage 4")) reasons.push("Stage 4 downtrend");
    if (input.entryScore != null && input.entryScore < 75) reasons.push(`Entry Score ${input.entryScore}/100 — below the 75 floor`);
    if (input.reason) reasons.push(input.reason);
    return reasons;
  }
  if (Array.isArray(input.redFlags) && input.redFlags.length) return input.redFlags.map((f) => f.label);
  if (input.why) return [input.why];
  return [];
}
