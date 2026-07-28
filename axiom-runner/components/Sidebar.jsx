// Persistent left sidebar nav — replaces the old two-tier top pill-bar +
// SubNavBar (deleted — confirmed dead code, never rendered anywhere once
// this file took over) with a single flat list, per the approved
// dashboard-redesign plan. Everything not listed here stays reachable via
// the command palette, same "hide, don't delete" convention SubNavBar
// used to document before this file replaced it.
//
// Ordered to match a real trading day's flow, not the order features
// shipped in — grouped via each item's `section` field. Sidebar.jsx groups
// by this field to show section labels; the mobile nav grid (axiom-live.jsx)
// still just flat-maps the array in order, so the same trading-flow
// ordering benefits it too even without visible section headers there.
export const SIDEBAR_ITEMS = [
  // 1. OVERVIEW — where the day starts: the single general landing page.
  { id: "dashboard", label: "Dashboard",     icon: "🏠", tab: "dashboard", section: "Overview" },

  // 2. AI DESK — pared down 2026-07-28 per a real platform-declutter audit
  // ("scan my platform... too many tools non needed"): CEO AI is the one
  // real daily-briefing surface now (also the app's default landing tab).
  // Command Center / Advisor AI answered the same "what should I do"
  // question as CEO AI with different branding — hidden from the sidebar
  // rather than deleted (still reachable via the command palette:
  // COMMANDCENTER / ADVISORAI / CIO), same "hide, don't delete" convention
  // as everything else not listed in this file.
  { id: "ceo-ai",    label: "CEO AI",        icon: "🧠", tab: "ceo-ai", section: "AI Desk" },
  { id: "x-intel", label: "X Intelligence", icon: "🐦", tab: "x-intel", badge: "NEW", section: "AI Desk" },

  // 3. PRO AI — the "Robinhood Pro AI" cluster (RhPro*): a real, separate
  // scoring/analysis system (rhScore — Trend Template + RS + timing +
  // volume) from A+ Score/Green Light/Smart Scan elsewhere in this app,
  // same "keep parallel scoring systems separate" rule. Pro Dashboard /
  // Trade Pro AI removed from the sidebar in the same 2026-07-28 declutter
  // pass — both are more "what should I do" bias/briefing cards
  // (Trade Pro AI is also a paid ~15c-per-run generation), redundant with
  // CEO AI; still reachable via the command palette (DECK / APEX).
  // rhpro-journal is deliberately NOT added here — its own file comment
  // says it's intentionally orphaned, superseded by the journal embedded
  // live inside GreenLightTab.
  { id: "rhpro-scan",   label: "Sniper Scanner", icon: "🔭", tab: "rhpro-scan",  section: "Pro AI" },
  // Pro Watchlists removed 2026-07-28 (declutter pass, part 2) — its
  // categorized AI-ranked lists (Top Picks/Breakout/Pullback/etc) are the
  // same real job Sniper Scanner already does, and Sniper Scanner is now
  // the more complete version post-Phase-3 (dual Stock Quality/Trade Setup
  // scores, real Win%, SMC signals). Still reachable via the command
  // palette (WATCHLISTS).
  // Sector Heat / Pro Coach removed from the sidebar 2026-07-28. Pro Coach
  // per "remove ai trading coach" — the real trading-mistake-pattern
  // analytics tab, RhProCoach.jsx, distinct from the unrelated life-coaching
  // "Coach" tab below, which stays; reachable via the palette (AICOACH).
  // Sector Heat condensed into CEO AI (see below) — reachable via the
  // palette (SECTORHEAT) for the full heat grid + RRG quadrants.

  // 4. RESEARCH & INTEL — gathering real market data before deciding
  // anything: news, positioning. Market (single-symbol chart +
  // fundamentals/earnings/analyst/news/SMC panels), Market Pulse, and
  // Market Health were all combined 2026-07-28 (explicit user request) —
  // Market via a real 📈 chart link on every Sniper Scanner row (same
  // MarketTerminalTab component, not a duplicate); Market Pulse and Market
  // Health as real condensed report summaries embedded directly in CEO AI
  // (same real components/data via a new `compact` prop, not rebuilt).
  // All three stay reachable via the command palette (TERMINAL /
  // MARKETPULSE / MARKETHEALTH) for their full standalone versions.
  { id: "news",      label: "News",          icon: "📰", tab: "news", section: "Research & Intel" },
  { id: "cot",       label: "COT",           icon: "🏦", tab: "cot", section: "Research & Intel" },

  // 5. OPPORTUNITIES — turning research into real candidate trades.
  // Green Light was the app's original default landing tab (until it was
  // changed to X Intelligence, 2026-07) — it never had its own sidebar
  // entry or command-palette alias because it never needed one before;
  // that made it completely unreachable the moment it stopped being the
  // default. Real regression, found live ("WHERE IS THE GREEN LIGHT
  // TRADE") and fixed here — same real BUY-zone signal engine ai-coach.js's
  // 7am Telegram scan and the AutoPilot engines already run on.
  { id: "greenlight", label: "Green Light", icon: "🟢", tab: "greenlight", section: "Opportunities" },
  { id: "best-opportunities", label: "Best Opportunities", icon: "🔥", tab: "best-opportunities", section: "Opportunities" },
  // Predictions removed from the sidebar 2026-07-28 (explicit user request)
  // — its real computePrediction engine now shows inline with every
  // stock's analysis (Market Terminal, Sniper Scanner, Pro Watchlists)
  // instead of needing its own tab. Still reachable via the command
  // palette (PREDICTIONS) for the full multi-symbol filterable view.
  // Watchlist / Fibonacci removed the same pass (explicit user request) —
  // still reachable via the palette (QUOTES / FIBONACCI).
  { id: "flow",      label: "Options Flow",  icon: "📊", tab: "flow", section: "Opportunities" },

  // 6. PORTFOLIO & RISK — what's actually on, and how much room is left.
  // Capital Allocation / Mission Status removed from the sidebar 2026-07-28
  // (explicit user request) — still reachable via the palette
  // (CAPITALALLOCATION / MISSIONSTATUS).
  { id: "portfolio-tab", label: "Portfolio", icon: "💼", tab: "portfolio-tab", section: "Portfolio & Risk" },

  // 7. ASSISTANT — callable at any point in the flow, kept as its own
  // section rather than forced into research or portfolio.
  { id: "copilot",   label: "AI Copilot",    icon: "🤖", tab: null, badge: "NEW", section: "Assistant" },

  // 8. REVIEW & GROWTH — after the trading day: coaching, notification
  // tuning, and ongoing education.
  { id: "coach",     label: "Coach",         icon: "🧭", tab: "coach", section: "Review & Growth" },
  { id: "alerts",    label: "Alerts",        icon: "🔔", tab: "alerts", section: "Review & Growth" },
  { id: "learn",     label: "Learn",         icon: "🎓", tab: "education", section: "Review & Growth" },

  // 9. PERSONAL — not part of the trading flow, deliberately last.
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
