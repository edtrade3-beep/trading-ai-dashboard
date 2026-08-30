// Compact, read-only Market Mode indicator for the persistent Top Bar —
// visible on every page in the app, which is exactly why this can't run
// its own independent regime formula (Central Opportunity & Options
// Engine goal, 2026-08-30: "independent decision engines producing
// separate conclusions" — this pill used to be the most-visible real
// example, disagreeing with whatever the canonical engine driving every
// actual trading verdict elsewhere in the app happened to compute).
// market-helpers.js's own header on computeMarketBias already discloses
// this exact duplication (3 independent regime formulas: computeRegime,
// DashboardTab.jsx's computeRegimeLabel, and this pill's own former
// SPY/QQQ/VIXY/TLT/UUP/HYG weighted score) but only ever built a
// confidence-reconciliation layer OVER them, never made one the real
// source of truth. This pill now defers to computeRegime — the one
// already wired into am-core-engine.js/opportunity-engine.js's real
// verdicts via regimeToEntryVocabulary — mapped onto this pill's existing
// 3-state RISK ON/CAUTION/RISK OFF vocabulary, instead of its own former
// formula. Deliberately NOT importing RiskTrafficLight.jsx: that
// component is a genuinely different tool (a fast 15s-poll panic
// detector with its own real Telegram/sound alerts, clearly labeled as
// such, not a general market-mode summary) and keeps its own formula —
// same "ratified second, labeled engine" judgment already made for the
// day-trade vertical earlier this session, not an oversight.
import { computeRegime } from "./market-helpers.js";

export default function CompactMarketMode({ C, MONO, macroData, setActiveTab }) {
  const has = (macroData || []).some((m) => m.symbol === "SPY");
  const regime = has ? computeRegime(macroData) : null;
  const light = !regime ? "—" : regime.label === "GREEN" ? "GREEN" : regime.label === "RED" ? "RED" : "YELLOW";
  const score = regime?.score ?? null;
  const cfg = {
    GREEN: { c: "#16a34a", icon: "🟢", title: "RISK ON" },
    YELLOW: { c: "#e0982f", icon: "🟡", title: "CAUTION" },
    RED: { c: "#dc2626", icon: "🔴", title: "RISK OFF" },
    "—": { c: C.textDim, icon: "⚪", title: "…" },
  }[light];

  return (
    <button
      onClick={() => setActiveTab && setActiveTab("dashboard")}
      title={`Market Mode: ${cfg.title} (${light === "—" ? "—" : score}/100) — open Dashboard → More for full detail`}
      style={{
        display: "flex", alignItems: "center", gap: 6, background: `${cfg.c}12`,
        border: `1px solid ${cfg.c}55`, borderRadius: 999, padding: "4px 10px",
        cursor: "pointer", flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 12, lineHeight: 1 }}>{cfg.icon}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: cfg.c, letterSpacing: "0.04em" }}>{cfg.title}</span>
    </button>
  );
}
