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

// Real usability fix (2026-09-18, explicit user report: "App on phone
// hard to use" — text/buttons too small, layout cramped, navigation
// confusing). PRIME (axiom-live.jsx's own default landing tab since the
// "AI Trade Desk — PRIME" rollout, Sidebar.jsx's own first row) had NO
// presence anywhere on this grid — a mobile user who ever left it had no
// direct way back except the 3-tap Bottom Nav "More" sheet. Rendered as
// its own full-width featured card below, separate from NAV_CARDS' 2-col
// grid, since it's the platform's one designated daily-workflow hub, not
// a peer of the other 12 destinations.
const PRIME_CARD = { id: "prime", label: "AI Trade Desk — PRIME", icon: "🎯", tab: "prime", desc: "Your one daily workflow — Top 5 Elite, 500-Stock Tournament, Selected Trade Plan & risk guardrails in one screen" };

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
  { id: "photobanners", label: "Photo Banners", icon: "🎨", tab: "photobanners", desc: "AI-suggested banner overlays on your photos" },
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
  const primeActive = activeTab === PRIME_CARD.tab;

  return (
    <div style={{ padding: "12px 12px 90px" }}>
      <button
        onClick={() => setActiveTab(PRIME_CARD.tab)}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
          background: primeActive ? `${C.accent}18` : `${C.accent}0d`,
          border: `1px solid ${primeActive ? C.accent : `${C.accent}55`}`,
          borderRadius: 14, padding: "16px 14px", cursor: "pointer", marginBottom: 14, minHeight: 76,
        }}
      >
        <span style={{ fontSize: 28, flexShrink: 0 }}>{PRIME_CARD.icon}</span>
        <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <span style={{ fontFamily: SANS, fontSize: 15.5, fontWeight: 900, color: primeActive ? C.accent : C.text }}>{PRIME_CARD.label}</span>
          <span style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.35 }}>{PRIME_CARD.desc}</span>
        </span>
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
        {NAV_CARDS.map((item) => {
          const isActive = activeTab === item.tab;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.tab)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 5, textAlign: "left",
                background: isActive ? `${C.accent}14` : C.card,
                border: `1px solid ${isActive ? C.accent : C.border}`,
                borderRadius: 12, padding: "16px 13px", cursor: "pointer", minHeight: 100,
              }}
            >
              <span style={{ fontSize: 24 }}>{item.icon}</span>
              <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 800, color: isActive ? C.accent : C.text }}>{item.label}</span>
              <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, lineHeight: 1.35 }}>{item.desc}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(98px, 1fr))", gap: 10 }}>
        <RegimeCard C={C} MONO={MONO} SANS={SANS} regime={regime} />
        <RiskCard C={C} MONO={MONO} SANS={SANS} risk={risk} />
        <FocusCard C={C} MONO={MONO} SANS={SANS} focus={focus} />
      </div>
    </div>
  );
}
