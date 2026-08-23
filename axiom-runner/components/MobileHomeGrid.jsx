// MobileHomeGrid.jsx — mobile-only Home screen (2026-08-23 mobile nav
// redesign, explicit user reference image: "I want this interface"). A
// 2-column icon+title+description card grid for primary navigation, plus
// 3 real-data summary cards (Market Regime / Risk Level / Today's
// Focus). Replaces DashboardTab's desktop-dense render on mobile only —
// desktop/tablet keep DashboardTab unchanged (axiom-live.jsx gates on
// isMobile at the call site, not inside this file).
//
// Descriptions below mirror each destination's own real, already-
// established purpose (Sidebar.jsx's own header comments) rather than
// copying the reference image's text verbatim — the reference described
// Light Box as "Market heatmap & sector strength," which is a real
// mismatch with what Light Box actually is (a color-coded BUY/WAIT/SELL
// signal grid, sniper-decision.js/entry-engine.js-backed) — corrected
// here rather than silently reproduced, per this app's real-data-only
// discipline.
import { computeRegime } from "./market-helpers.js";
import { deriveRiskLevel, deriveTodaysFocus } from "./mobile-home-derived.js";

const NAV_CARDS = [
  { id: "dashboard", label: "Home", icon: "🏠", tab: "dashboard", desc: "Market overview & today's summary" },
  { id: "cortex", label: "Cortex", icon: "🧠", tab: "cortex", desc: "AI market intelligence & analysis" },
  { id: "discover", label: "Discover", icon: "🎯", tab: "rhpro-scan", desc: "Smart scanner & opportunities" },
  { id: "portfolio", label: "Portfolio", icon: "💼", tab: "portfolio-tab", desc: "Holdings, performance & analytics" },
  { id: "autopilot", label: "Autopilot", icon: "🤖", tab: "greenlight", desc: "Automated trading & risk controls" },
  { id: "news", label: "News", icon: "📰", tab: "news", desc: "Market news & real-time updates" },
  { id: "journal", label: "Journal", icon: "📓", tab: "rhpro-journal", desc: "Trade logs & personal notes" },
  { id: "lightbox", label: "Light Box", icon: "🚦", tab: "lightbox", desc: "Color-coded BUY / WAIT / SELL signal grid" },
  { id: "futurewallet", label: "Future Wallet", icon: "💰", tab: "futurewallet", desc: "Market regime & long-term candidate research" },
  { id: "btc-hpc", label: "BTC + HPC", icon: "₿", tab: "btc-hpc", desc: "Crypto regime & HPC-hosting/mining scan" },
  { id: "settings", label: "Settings", icon: "⚙️", tab: "settings", desc: "Preferences, API, security & more" },
];

function RegimeCard({ C, MONO, SANS, regime }) {
  const bullish = Number(regime?.score) >= 55;
  const color = bullish ? C.green : Number(regime?.score) >= 40 ? C.amber : C.red;
  const label = regime?.label === "GREEN" ? "RISK ON" : regime?.label === "RED" ? "RISK OFF" : regime?.label || "—";
  return (
    <div style={{ background: `${color}12`, border: `1px solid ${color}44`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>MARKET REGIME</div>
      <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 900, color, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec }}>● {bullish ? "Bullish Environment" : Number(regime?.score) >= 40 ? "Mixed Environment" : "Defensive Environment"}</div>
    </div>
  );
}

function RiskCard({ C, MONO, SANS, risk }) {
  return (
    <div style={{ background: `${risk.color}12`, border: `1px solid ${risk.color}44`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>RISK LEVEL</div>
      <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 900, color: risk.color, marginBottom: 4 }}>{risk.label}</div>
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec }}>● {risk.note}</div>
    </div>
  );
}

function FocusCard({ C, MONO, SANS, focus }) {
  return (
    <div style={{ background: `${C.accent}12`, border: `1px solid ${C.accent}44`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>TODAY'S FOCUS</div>
      <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 900, color: C.accent, marginBottom: 4 }}>{focus.label}</div>
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec }}>● {focus.note}</div>
    </div>
  );
}

export default function MobileHomeGrid({ C, MONO, SANS, macroData, activeTab, setActiveTab }) {
  const regime = computeRegime(macroData);
  const risk = deriveRiskLevel(regime?.vixVal);
  const focus = deriveTodaysFocus(regime);

  return (
    <div style={{ padding: "4px 2px 90px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 14 }}>
        {NAV_CARDS.map((item) => {
          const isActive = activeTab === item.tab;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.tab)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, textAlign: "left",
                background: isActive ? `${C.accent}14` : C.card,
                border: `1px solid ${isActive ? C.accent : C.border}`,
                borderRadius: 12, padding: "14px 12px", cursor: "pointer", minHeight: 88,
              }}
            >
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: isActive ? C.accent : C.text }}>{item.label}</span>
              <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, lineHeight: 1.3 }}>{item.desc}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", gap: 10 }}>
        <RegimeCard C={C} MONO={MONO} SANS={SANS} regime={regime} />
        <RiskCard C={C} MONO={MONO} SANS={SANS} risk={risk} />
        <FocusCard C={C} MONO={MONO} SANS={SANS} focus={focus} />
      </div>
    </div>
  );
}
