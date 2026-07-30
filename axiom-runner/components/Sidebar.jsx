// Persistent left sidebar nav. Rebuilt 2026-07-29 for the institutional
// redesign ("Less noise. Better decisions.") to the user's exact 11-item
// spec — Dashboard/Market/Scanner/Watchlists/Charts/Options Flow/
// Portfolio/News/Calendar/Journal/Settings — replacing the prior
// declutter-pass sidebar (CEO AI/X Intel/Market Terminal/Macro/COT/AI
// Copilot/Coach/Alerts/Learn/Quran). Nothing was deleted: every dropped
// destination is folded into one of the 11 new items below (real content,
// same components, reused unchanged) and stays independently reachable via
// the command palette, same "hide, don't delete" convention this app has
// used all along. Single flat list, no section grouping — the spec's 11
// items are already a complete, ordered flow (Dashboard → Market →
// Scanner → Watchlists → Charts → Options Flow → Portfolio → News →
// Calendar → Journal → Settings), so extra section headers would just add
// noise back in.
export const SIDEBAR_ITEMS = [
  { id: "dashboard", label: "Dashboard",     icon: "🏠", tab: "dashboard" },

  // Market — new composite (axiom-live.jsx, activeTab "market") folding
  // Macro (10Y/2Y/Brent/BTC-dominance, econ calendar), COT positioning,
  // Sector Heat (RhProHeatMap), and Breadth (MarketHealthTab) into one
  // destination via an in-page sub-nav. Each sub-tab is the exact same
  // real component/data previously reachable standalone — still is, via
  // the palette (MACRO / COT / SECTORHEAT / MARKETHEALTH).
  { id: "market",    label: "Market",        icon: "🌐", tab: "market" },

  // Scanner — re-promotes Sniper Scanner (RhProScanner) to top-level nav.
  // This reverses a 2026-07-28 decision that moved it into Dashboard as a
  // sub-tab ("remove sniper tab since you put it in dashboard") —
  // intentional here per the redesign spec's explicit "Scanner" nav item,
  // not a silent re-reversal; the Dashboard sub-tab mount stays too (same
  // component, no duplicate data/logic). Still reachable via the palette
  // (SNIPER).
  { id: "scanner",   label: "Scanner",       icon: "🎯", tab: "rhpro-scan" },

  // Watchlists — re-promotes Pro Watchlists (removed from the sidebar
  // 2026-07-28 as redundant with Sniper Scanner) per the redesign spec's
  // explicit "Watchlists" nav item. Still reachable via the palette
  // (WATCHLISTS).
  { id: "watchlists", label: "Watchlists",   icon: "⭐", tab: "rhpro-lists" },

  // Charts — Market Terminal, renamed to match the redesign spec's label
  // (its per-symbol chart becomes the large interactive chart section of
  // the redesigned stock-analysis page). Same activeTab id ("mterminal")
  // so every existing chart-link/localStorage handoff across the app
  // (Sniper Scanner, Best Opportunities, Green Light, Flow, Insider,
  // DarkPool, etc.) keeps working unchanged.
  { id: "charts",    label: "Charts",        icon: "📈", tab: "mterminal" },

  // Options Flow — re-promotes FlowTab (was Dashboard's "OPTIONS FLOW"
  // sub-tab only) to top-level nav per the redesign spec. Same component/
  // data, still reachable both places (Dashboard sub-tab kept, palette
  // alias FLOW kept) — no duplicate fetch, React just mounts the same
  // component at two routes.
  { id: "flow",      label: "Options Flow",  icon: "🔀", tab: "flow" },

  // Portfolio — re-promotes the real PortfolioSnapshotCard +
  // ActivePositionsCard (was Dashboard's "PORTFOLIO" sub-tab only), now
  // also folding in real Portfolio Risk (PortfolioRiskCard, previously
  // only reachable under the hidden mission-status palette destination) so
  // risk has one canonical home instead of two. Still reachable via the
  // palette (PORTFOLIOTAB / MISSIONSTATUS for the fuller mission view).
  { id: "portfolio", label: "Portfolio",     icon: "💼", tab: "portfolio-tab" },

  // News — re-promotes NewsTab (was Dashboard's "NEWS & EVENTS" sub-tab
  // only) to top-level nav per the redesign spec. Still reachable via the
  // palette (NEWS).
  { id: "news",      label: "News",          icon: "📰", tab: "news" },

  // Calendar — new composite (axiom-live.jsx, activeTab "calendar")
  // folding Economic Events (CalendarTab, already real — a TradingView
  // economic-calendar embed), Fed/FOMC (FedWatchTab, was Dashboard-only),
  // and Earnings (EarningsTab, was palette-only) into one destination via
  // an in-page sub-nav. Still reachable via the palette (FEDWATCH is now
  // this page; EARNINGS for the standalone view).
  { id: "calendar",  label: "Calendar",      icon: "📅", tab: "calendar" },

  // Journal — promotes the real manual trade journal (RhProJournal,
  // localStorage-backed: date/symbol/side/shares/entry/exit/notes/P&L),
  // previously orphaned from all nav. It also used to be double-mounted
  // (a second live copy embedded inside GreenLightTab) — retired 2026-07-29
  // in favor of this one canonical destination plus a redirect link from
  // Green Light, same "exactly one mount point" convention as everything
  // else consolidated this session. Distinct from the unrelated
  // AI-coaching-log JournalTab (Morning Game Plan / Trade Coach / Weekly
  // Review), which stays palette-only (JOURNAL) — different feature that
  // happens to share the word "journal", not touched by this redesign.
  { id: "journal",   label: "Journal",       icon: "📓", tab: "rhpro-journal" },

  // Settings — new composite (axiom-live.jsx, activeTab "settings")
  // folding Coach (life-coaching, distinct from the unrelated trading-
  // mistake-analytics RhProCoach which stays palette-only via AICOACH),
  // Learn (EducationTab), Quran, and Account & Risk (ToolsTab — the real
  // account-size/risk% inputs backed by the same axiom_acct_size/
  // axiom_risk_pct localStorage keys TradeExtrasPanel reads on Charts;
  // previously only reachable via the palette, TOOLS, with no visible nav
  // slot) into one destination via an in-page sub-nav.
  { id: "settings",  label: "Settings",      icon: "⚙️", tab: "settings" },
];

// AI Copilot stays a floating modal launcher (open-ai-copilot event →
// TradingCopilot.jsx), not a sidebar row — it already wasn't an activeTab
// route before this redesign, and the spec's 11-item list doesn't include
// it as a nav destination either. Reachable from Dashboard's
// AiCopilotLauncherCard.
//
// CEO AI / Command Center / X Intelligence / Alerts dropped from the
// sidebar rows rather than kept — per the approved redesign plan, CEO AI's
// brief + Command Center's real Sector Rotation/Portfolio Risk Summary
// sections are slated to redistribute into Dashboard's new 4-card grid
// (Phase 4 of the redesign), X Intelligence into a News sub-tab, and
// Alerts into a Dashboard/Portfolio panel — that embedding work hasn't
// landed yet as of this file's rewrite, so for now all four are palette-
// only (CEO-AI is still the default landing tab regardless of sidebar
// presence; COMMANDCENTER / XINTEL / ALERTS for their full standalone
// views) until Phase 4 gives them a real embedded home.

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
        {SIDEBAR_ITEMS.map((item) => {
          const isActive = activeTab === item.tab;
          const badgeCount = item.id === "scanner" ? scannerBadge : null;
          return (
            <button key={item.id}
              onClick={() => setActiveTab(item.tab)}
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
              {!collapsed && badgeCount ? (
                <span style={{ background: C.green, color: "#fff", borderRadius: 10, padding: "2px 6px", fontFamily: MONO, fontSize: 10, fontWeight: 800 }}>{badgeCount}</span>
              ) : null}
              {collapsed && badgeCount ? (
                <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: "50%", background: C.green }} />
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
        {/* Command palette launcher — relabeled from "Settings" (2026-07-29)
            now that Settings is a real sidebar destination above (Coach/
            Learn/Quran/Account & Risk); this stays as the quick way to
            reach any of the ~100 other palette-only destinations without
            typing the CMD shortcut. */}
        <button
          onClick={() => setPaletteOpen(true)}
          title={collapsed ? "Command Palette" : undefined}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            justifyContent: collapsed ? "center" : "flex-start",
            border: "none", textAlign: "left", cursor: "pointer", background: "transparent", color: C.textSec,
            borderRadius: 8, padding: "9px 10px", marginBottom: 6, fontFamily: SANS, fontSize: 13, fontWeight: 500,
          }}
        >
          <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>⌨️</span>
          {!collapsed && <span>Command Palette</span>}
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
