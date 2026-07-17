// Compact, read-only Market Mode indicator for the persistent Top Bar.
// Deliberately NOT importing RiskTrafficLight.jsx itself: that component
// owns real side effects (Telegram regime-flip alerts, panic-detector
// alerts, sound/vibration) tied to its own mount lifecycle, and since this
// bar is mounted globally on every page, reusing it here would run a
// second copy of that alerting logic everywhere instead of only where the
// user opened the full Market Mode & Flow panel (Dashboard → More). This
// is the same score/light formula, read-only, no fetch of its own — reuses
// whatever macroData the app already has loaded.
const RISK_SYMS = ["SPY", "QQQ", "VIXY", "TLT", "UUP", "HYG"];

export default function CompactMarketMode({ C, MONO, macroData, setActiveTab }) {
  const v = (sym) => Number((macroData || []).find((m) => m.symbol === sym)?.changesPercentage || 0);
  const has = (macroData || []).some((m) => m.symbol === "SPY");
  const spy = v("SPY"), qqq = v("QQQ"), vixy = v("VIXY"), tlt = v("TLT"), uup = v("UUP"), hyg = v("HYG");
  let score = 50 + spy * 8 + qqq * 6 - vixy * 3 + tlt * 2 - uup * 3 + hyg * 4;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const prevLight = (typeof localStorage !== "undefined" && localStorage.getItem("axiom_risklight")) || "YELLOW";
  let light;
  if (!has) light = "—";
  else if (score >= 65 || (prevLight === "GREEN" && score >= 60)) light = "GREEN";
  else if (score < 40 || (prevLight === "RED" && score < 45)) light = "RED";
  else light = "YELLOW";
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
