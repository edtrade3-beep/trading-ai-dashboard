// ── Regime Strategy Banner ── shows on scanner/watchlist tabs
const REGIME_BANNER_TABS = ["scanner", "early", "smartscan", "screener", "fivex", "shortint"];

export default function RegimeStrategyBanner({ C, MONO, activeTab, regime }) {
  if (!REGIME_BANNER_TABS.includes(activeTab) || !regime || regime === "Loading…") return null;
  const isRiskOff  = regime === "Risk-Off" || regime === "Defensive";
  const isRiskOn   = regime === "Risk-On" || regime === "Growth" || regime === "Goldilocks";
  const bannerColor = isRiskOff ? C.red : isRiskOn ? C.green : C.amber;
  const bannerBg    = isRiskOff ? C.redBg : isRiskOn ? C.greenBg : C.amberBg;
  const icon  = isRiskOff ? "⚠️" : isRiskOn ? "🟢" : "🟡";
  const strategy = isRiskOff
    ? "RISK-OFF MODE: Reduce size, prefer hedges/shorts, tighten stops on longs. Avoid chasing."
    : isRiskOn
    ? "RISK-ON MODE: Lean long on high-RS names with confirmation. Momentum favors buyers."
    : "NEUTRAL REGIME: Trade selective A+ setups only. No edge in low-conviction names.";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", marginBottom: 12,
      background: bannerBg, border: `1px solid ${bannerColor}44`, borderRadius: 8, borderLeft: `3px solid ${bannerColor}` }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <div>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: bannerColor, letterSpacing: "0.06em" }}>REGIME: {regime.toUpperCase()}</span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec, marginLeft: 12 }}>{strategy}</span>
      </div>
    </div>
  );
}
