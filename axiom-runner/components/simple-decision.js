// simple-decision.js — client-side twin of src/simple-decision.js. Pure,
// dependency-free math, hand-ported here rather than fetched — same
// "small, stable, kept in sync via this header comment" discipline as
// mtf-combiner.js / entry-engine.js's own client twins. KEEP IN SYNC: any
// formula change goes in both files. See src/simple-decision.js for the
// full design rationale (the "5-Second Rule" simplification, why each
// classification maps the way it does).

import { sortByPriority } from "./decision-priority.js";

const DECISION_META = {
  START_SMALL: { icon: "🟢", label: "START SMALL", color: "#0d9465" },
  ADD: { icon: "🟢", label: "ADD", color: "#0d9465" },
  HOLD: { icon: "🟢", label: "HOLD", color: "#0d9465" },
  WAIT: { icon: "🟡", label: "WAIT", color: "#d6a312" },
  REDUCE: { icon: "🟠", label: "REDUCE", color: "#e08a1e" },
  EXIT: { icon: "🔴", label: "EXIT", color: "#c8282a" },
};

export function classifyStructure4h(swing4hState) {
  if (swing4hState === "STRONG" || swing4hState === "DEVELOPING") return "HEALTHY";
  if (swing4hState === "WEAK") return "REPAIRING";
  if (swing4hState === "BROKEN") return "BROKEN";
  return null;
}

export function classifySetup1h(early1h) {
  if (!early1h || early1h.dataInsufficient || early1h.score == null) return null;
  const trend = early1h.rsiTrend || {};
  if (early1h.score >= 60 || (trend.direction === "up" && trend.accelerating === true)) return "READY";
  if (trend.direction === "up" || early1h.score >= 30) return "IMPROVING";
  return "WEAK";
}

export function classifyTiming15m(entry15mStatus) {
  if (entry15mStatus == null) return null;
  return entry15mStatus === "CONFIRMED" ? "READY" : "NOT_READY";
}

function zoneString(zone) {
  if (!Array.isArray(zone) || zone.some((v) => !Number.isFinite(v))) return null;
  return zone[0] === zone[1] ? `$${zone[0].toFixed(2)}` : `$${zone[0].toFixed(2)}–$${zone[1].toFixed(2)}`;
}

const REGULAR_FLAG_PRIORITY = {
  weakVolume: { key: "MOMENTUM_VOLUME", label: "1H volume to strengthen" },
  fallingRS: { key: "RELATIVE_STRENGTH", label: "relative strength to improve" },
  belowVwap: { key: "MOMENTUM_VOLUME", label: "price to reclaim VWAP" },
};

export function computeSimpleDecision(ev = {}) {
  const trend = ev.dailyBias || null;
  const structure = classifyStructure4h(ev.swing4hState);
  const setup = classifySetup1h(ev.early1h);
  const timing = classifyTiming15m(ev.entry15mStatus);
  const entryPlan = ev.entryPlan || {};
  const pivot = entryPlan.pivot ?? null;
  const stop = entryPlan.stop ?? null;
  const target = entryPlan.target1 ?? null;
  const reads = { trend, structure, setup, timing };

  const redFlags = Array.isArray(ev.redFlags) ? ev.redFlags : [];
  const criticalRedFlags = redFlags.filter((f) => f.critical);
  const regularRedFlags = redFlags.filter((f) => !f.critical);

  const base = (decision, why, next, entryZone) => ({
    decision, ...DECISION_META[decision], why, next, entryZone, pivot, stop, target, ...reads,
    redFlagCount: redFlags.length, criticalFlagCount: criticalRedFlags.length, redFlags,
  });

  if (ev.hasPosition) {
    if (ev.dayTradeState === "EXIT") return base("EXIT", ev.dayTradeReason || "Thesis invalidated.", "Exit the position.", null);
    if (ev.dayTradeState === "TAKE_PARTIAL") return base("REDUCE", ev.dayTradeReason || "Target reached or momentum fading.", "Take partial profit.", null);
    if (ev.dayTradeState === "TRAIL" || ev.dayTradeState === "HOLD") return base("HOLD", ev.dayTradeReason || "Structure intact, thesis still confirmed.", "Hold.", null);
    if (structure === "BROKEN") return base("EXIT", "4H structure broken.", "Exit — thesis invalidated.", null);
    if (entryPlan.doNotChaseZone?.band === "DO_NOT_CHASE") return base("REDUCE", "Price extended.", "Take partial profit, protect gains.", null);
    return base("HOLD", "Trend and structure intact.", "Hold.", null);
  }

  if (structure === "BROKEN") {
    return base("WAIT", "4H structure is broken.", "Wait for 4H repair + 15M confirmation.", "BLOCKED");
  }
  if (entryPlan.doNotChaseZone?.band === "DO_NOT_CHASE") {
    return base("WAIT", "Price is extended — do not chase.", "Wait for a pullback or retest.", "BLOCKED");
  }
  if (criticalRedFlags.length) {
    const names = criticalRedFlags.map((f) => f.label).join(", ");
    return base("WAIT", `Critical red flag: ${names}.`, `Resolve: ${names}.`, "BLOCKED");
  }

  const rrOk = Number.isFinite(ev.rr) ? ev.rr >= 1.5 : null;
  const setupOk = setup === "READY" || setup === "IMPROVING";
  const timingOk = timing === "READY";
  const trendOk = trend !== "BEARISH";
  const structureOk = structure === "HEALTHY" || structure === "REPAIRING";
  const regimeOk = ev.marketRegime == null ? true : ev.marketRegime !== "RISK_OFF";

  if (entryPlan.entryPrice != null && regimeOk && trendOk && structureOk && setupOk && timingOk && rrOk !== false) {
    const zone = zoneString(
      entryPlan.stage === "EARLY" ? entryPlan.earlyEntryZone
        : entryPlan.stage === "CONFIRMATION" ? entryPlan.confirmationEntryZone
        : entryPlan.stage === "RETEST" ? entryPlan.retestZone
        : [entryPlan.entryPrice, entryPlan.entryPrice]
    );
    return base("START_SMALL", "Trend, structure, setup, and entry timing all confirm.", "START SMALL.", zone);
  }

  const missingFactors = [];
  if (!regimeOk) missingFactors.push({ key: "MARKET_REGIME", label: "market regime to turn risk-on" });
  if (rrOk === false) missingFactors.push({ key: "RISK_INVALIDATION", label: "a better risk/reward" });
  if (!structureOk) missingFactors.push({ key: "MARKET_STRUCTURE", label: "4H structure to repair" });
  if (!trendOk) missingFactors.push({ key: "TREND", label: "daily trend to turn constructive" });
  if (!setupOk) missingFactors.push({ key: "ENTRY_QUALITY", label: "1H setup to improve" });
  if (!timingOk) missingFactors.push({ key: "ENTRY_QUALITY", label: "15M confirmation" });
  for (const f of regularRedFlags) {
    const mapped = REGULAR_FLAG_PRIORITY[f.key];
    if (mapped) missingFactors.push(mapped);
  }
  const missing = sortByPriority(missingFactors).map((f) => f.label);
  if (!missing.length) missing.push("more real evidence");
  const zone = zoneString(entryPlan.earlyEntryZone);
  return base("WAIT", `Need: ${missing.join(", ")}.`, `Wait for ${missing.join(" + ")}.`, zone || "BLOCKED");
}

export { DECISION_META };
