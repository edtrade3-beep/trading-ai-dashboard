// Persistent left sidebar nav — replaces the old two-tier top pill-bar +
// SubNavBar with a single flat list, per the approved dashboard-redesign
// plan. Everything not listed here stays reachable via the command palette
// exactly as it already was when SubNavBar trimmed these same tabs from
// visibility (see the "hide, don't delete" comments in SubNavBar.jsx).
export const SIDEBAR_ITEMS = [
  { id: "dashboard", label: "Dashboard",     icon: "🏠", tab: "dashboard" },
  { id: "ceo-ai",    label: "CEO AI",        icon: "🧠", tab: "ceo-ai" },
  { id: "best-opportunities", label: "Best Opportunities", icon: "🔥", tab: "best-opportunities" },
  { id: "portfolio-tab", label: "Portfolio", icon: "💼", tab: "portfolio-tab" },
  { id: "capital-allocation", label: "Capital Allocation", icon: "💰", tab: "capital-allocation" },
  { id: "mission-status", label: "Mission Status", icon: "🎯", tab: "mission-status" },
  { id: "market-pulse", label: "Market Pulse", icon: "📈", tab: "market-pulse" },
  { id: "market",    label: "Market",        icon: "🌐", tab: "mterminal" },
  { id: "watchlist", label: "Watchlist",     icon: "⭐", tab: "quotes" },
  { id: "copilot",   label: "AI Copilot",    icon: "🤖", tab: null, badge: "NEW" },
  { id: "advisor-ai", label: "Advisor AI",   icon: "🏛️", tab: "advisor-ai", badge: "NEW" },
  { id: "flow",      label: "Options Flow",  icon: "📊", tab: "flow" },
  { id: "cot",       label: "COT",           icon: "🏦", tab: "cot" },
  { id: "news",      label: "News",          icon: "📰", tab: "news" },
  { id: "alerts",    label: "Alerts",        icon: "🔔", tab: "alerts" },
  { id: "coach",     label: "Coach",         icon: "🧭", tab: "coach" },
  { id: "learn",     label: "Learn",         icon: "🎓", tab: "education" },
  { id: "quran",     label: "Quran",         icon: "☪️", tab: "quran" },
];
// Scanner/Journal/Portfolio removed from the visible sidebar (2026-07-17,
// user request) — still fully reachable via the command palette (SCANNER/
// JOURNAL/PORTFOLIO), same "hide, don't delete" convention as everything
// else not listed above.

export default function Sidebar({ C, MONO, SANS, activeTab, setActiveTab, topOffset, width, bottomOffset, scannerBadge, setPaletteOpen, rootRef }) {
  return (
    <div ref={rootRef} style={{
      position: "fixed", top: topOffset, left: 0, bottom: bottomOffset || 0, width,
      background: C.surface, borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", zIndex: 39, overflowY: "auto",
    }}>
      <div style={{ flex: 1, padding: "10px 8px" }}>
        {SIDEBAR_ITEMS.map(item => {
          const isActive = item.tab && activeTab === item.tab;
          const badgeCount = item.id === "scanner" ? scannerBadge : null;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.tab) setActiveTab(item.tab);
                else if (item.id === "copilot") window.dispatchEvent(new Event("open-ai-copilot"));
              }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                border: "none", textAlign: "left", cursor: "pointer",
                background: isActive ? `${C.accent}18` : "transparent",
                color: isActive ? C.accent : C.textSec,
                borderRadius: 8, padding: "9px 10px", marginBottom: 2,
                fontFamily: SANS, fontSize: 13, fontWeight: isActive ? 700 : 500,
              }}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span style={{ background: C.accent, color: "#fff", borderRadius: 5, padding: "1px 6px", fontFamily: MONO, fontSize: 9, fontWeight: 800 }}>{item.badge}</span>
              )}
              {badgeCount ? (
                <span style={{ background: C.green, color: "#fff", borderRadius: 10, padding: "2px 6px", fontFamily: MONO, fontSize: 10, fontWeight: 800 }}>{badgeCount}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {/* Bottom: Settings (opens the command palette — every control already
          lives there) + a static profile chip. No Logout — there's no
          login/session concept in this single-user app, so a fake logout
          button would just be broken. */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px" }}>
        <button
          onClick={() => setPaletteOpen(true)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            border: "none", textAlign: "left", cursor: "pointer", background: "transparent", color: C.textSec,
            borderRadius: 8, padding: "9px 10px", marginBottom: 6, fontFamily: SANS, fontSize: 13, fontWeight: 500,
          }}
        >
          <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>⚙️</span>
          <span>Settings</span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
          <img src="/axiom-runner/assets/avatar.jpg" alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", objectPosition: "center 15%", border: `2px solid ${C.accent}`, flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>AM Trader</span>
        </div>
      </div>
    </div>
  );
}
