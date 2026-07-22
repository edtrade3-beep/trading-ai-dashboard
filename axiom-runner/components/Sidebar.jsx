// Persistent left sidebar nav — replaces the old two-tier top pill-bar +
// SubNavBar with a single flat list, per the approved dashboard-redesign
// plan. Everything not listed here stays reachable via the command palette
// exactly as it already was when SubNavBar trimmed these same tabs from
// visibility (see the "hide, don't delete" comments in SubNavBar.jsx).
//
// Ordered to match a real trading day's flow, not the order features
// shipped in — grouped via each item's `section` field. Sidebar.jsx groups
// by this field to show section labels; the mobile nav grid (axiom-live.jsx)
// still just flat-maps the array in order, so the same trading-flow
// ordering benefits it too even without visible section headers there.
export const SIDEBAR_ITEMS = [
  // 1. OVERVIEW — where the day starts: the big picture and the AI's
  // top-level call before anything else.
  { id: "dashboard", label: "Dashboard",     icon: "🏠", tab: "dashboard", section: "Overview" },
  { id: "ceo-ai",    label: "CEO AI",        icon: "🧠", tab: "ceo-ai", section: "Overview" },
  { id: "command-center", label: "Command Center", icon: "🛰️", tab: "command-center", badge: "NEW", section: "Overview" },

  // 2. RESEARCH & INTEL — gathering real information before deciding
  // anything: regime/sentiment, charts, news, positioning, deep research.
  { id: "market-pulse", label: "Market Pulse", icon: "📈", tab: "market-pulse", section: "Research & Intel" },
  { id: "market",    label: "Market",        icon: "🌐", tab: "mterminal", section: "Research & Intel" },
  { id: "x-intel", label: "X Intelligence", icon: "🐦", tab: "x-intel", badge: "NEW", section: "Research & Intel" },
  { id: "advisor-ai", label: "Advisor AI",   icon: "🏛️", tab: "advisor-ai", badge: "NEW", section: "Research & Intel" },
  { id: "news",      label: "News",          icon: "📰", tab: "news", section: "Research & Intel" },
  { id: "cot",       label: "COT",           icon: "🏦", tab: "cot", section: "Research & Intel" },

  // 3. OPPORTUNITIES — turning research into real candidate trades.
  { id: "best-opportunities", label: "Best Opportunities", icon: "🔥", tab: "best-opportunities", section: "Opportunities" },
  { id: "watchlist", label: "Watchlist",     icon: "⭐", tab: "quotes", section: "Opportunities" },
  { id: "flow",      label: "Options Flow",  icon: "📊", tab: "flow", section: "Opportunities" },
  { id: "fibonacci", label: "Fibonacci",     icon: "🌀", tab: "fibonacci", section: "Opportunities" },

  // 4. PORTFOLIO & RISK — what's actually on, and how much room is left.
  { id: "portfolio-tab", label: "Portfolio", icon: "💼", tab: "portfolio-tab", section: "Portfolio & Risk" },
  { id: "capital-allocation", label: "Capital Allocation", icon: "💰", tab: "capital-allocation", section: "Portfolio & Risk" },
  { id: "mission-status", label: "Mission Status", icon: "🎯", tab: "mission-status", section: "Portfolio & Risk" },

  // 5. ASSISTANT — callable at any point in the flow, kept as its own
  // section rather than forced into research or portfolio.
  { id: "copilot",   label: "AI Copilot",    icon: "🤖", tab: null, badge: "NEW", section: "Assistant" },

  // 6. REVIEW & GROWTH — after the trading day: coaching, notification
  // tuning, and ongoing education.
  { id: "coach",     label: "Coach",         icon: "🧭", tab: "coach", section: "Review & Growth" },
  { id: "alerts",    label: "Alerts",        icon: "🔔", tab: "alerts", section: "Review & Growth" },
  { id: "learn",     label: "Learn",         icon: "🎓", tab: "education", section: "Review & Growth" },

  // 7. PERSONAL — not part of the trading flow, deliberately last.
  { id: "quran",     label: "Quran",         icon: "☪️", tab: "quran", section: "Personal" },
];
// Scanner/Journal removed from the visible sidebar (2026-07-17, user
// request) — still fully reachable via the command palette (SCANNER/
// JOURNAL), same "hide, don't delete" convention as everything else not
// listed above.

// Icon-only rail width when collapsed — wide enough for the 16px icon +
// its own 9-10px horizontal padding without the button feeling cramped.
export const SIDEBAR_COLLAPSED_WIDTH = 56;

export default function Sidebar({ C, MONO, SANS, activeTab, setActiveTab, topOffset, width, bottomOffset, scannerBadge, setPaletteOpen, rootRef, collapsed, onToggleCollapsed }) {
  return (
    <div ref={rootRef} style={{
      position: "fixed", top: topOffset, left: 0, bottom: bottomOffset || 0, width,
      background: C.surface, borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", zIndex: 39, overflowY: "auto", overflowX: "hidden",
      transition: "width 0.15s ease",
    }}>
      <div style={{ flex: 1, padding: collapsed ? "10px 6px" : "10px 8px" }}>
        {/* Collapse/expand toggle — always the first row so it's never
            scrolled out of view regardless of how many tabs are listed. */}
        <button
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-end",
            gap: 8, border: "none", cursor: "pointer", background: "transparent", color: C.textDim,
            borderRadius: 8, padding: "7px 10px", marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 14 }}>{collapsed ? "»" : "«"}</span>
        </button>
        {SIDEBAR_ITEMS.map((item, i) => {
          const isActive = item.tab && activeTab === item.tab;
          const badgeCount = item.id === "scanner" ? scannerBadge : null;
          const showSectionLabel = item.section && item.section !== SIDEBAR_ITEMS[i - 1]?.section;
          return (
            <React.Fragment key={item.id}>
            {showSectionLabel && (
              <div style={{
                fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: C.textDim,
                padding: collapsed ? "10px 0 4px" : "12px 10px 4px", textTransform: "uppercase",
                textAlign: collapsed ? "center" : "left", opacity: 0.65,
              }}>
                {collapsed ? "·" : item.section}
              </div>
            )}
            <button
              onClick={() => {
                if (item.tab) setActiveTab(item.tab);
                else if (item.id === "copilot") window.dispatchEvent(new Event("open-ai-copilot"));
              }}
              title={collapsed ? item.label : undefined}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                justifyContent: collapsed ? "center" : "flex-start",
                border: "none", textAlign: "left", cursor: "pointer",
                background: isActive ? `${C.accent}18` : "transparent",
                color: isActive ? C.accent : C.textSec,
                borderRadius: 8, padding: collapsed ? "9px 0" : "9px 10px", marginBottom: 2,
                fontFamily: SANS, fontSize: 13, fontWeight: isActive ? 700 : 500,
                position: "relative",
              }}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
              {!collapsed && item.badge && (
                <span style={{ background: C.accent, color: "#fff", borderRadius: 5, padding: "1px 6px", fontFamily: MONO, fontSize: 9, fontWeight: 800 }}>{item.badge}</span>
              )}
              {!collapsed && badgeCount ? (
                <span style={{ background: C.green, color: "#fff", borderRadius: 10, padding: "2px 6px", fontFamily: MONO, fontSize: 10, fontWeight: 800 }}>{badgeCount}</span>
              ) : null}
              {collapsed && (item.badge || badgeCount) && (
                <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: "50%", background: item.badge ? C.accent : C.green }} />
              )}
            </button>
            </React.Fragment>
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
          title={collapsed ? "Settings" : undefined}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            justifyContent: collapsed ? "center" : "flex-start",
            border: "none", textAlign: "left", cursor: "pointer", background: "transparent", color: C.textSec,
            borderRadius: 8, padding: "9px 10px", marginBottom: 6, fontFamily: SANS, fontSize: 13, fontWeight: 500,
          }}
        >
          <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>⚙️</span>
          {!collapsed && <span>Settings</span>}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", justifyContent: collapsed ? "center" : "flex-start" }}>
          <img src="/axiom-runner/assets/avatar.jpg" alt="" title={collapsed ? "AM Trader" : undefined}
            style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", objectPosition: "center 15%", border: `2px solid ${C.accent}`, flexShrink: 0 }} />
          {!collapsed && <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>AM Trader</span>}
        </div>
      </div>
    </div>
  );
}
