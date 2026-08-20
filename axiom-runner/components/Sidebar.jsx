// Persistent left sidebar nav. Collapsed 2026-08-09 (sidebar/IA redesign)
// from the prior 11-item flat list — Dashboard/Market/Scanner/Watchlists/
// Charts/Options Flow/Portfolio/Crypto/News/Calendar/Journal — down to the
// 7 real "what deserves a permanent nav slot" surfaces below, plus Settings.
// Every dropped item is a merge or a demotion, never a deletion:
//   - Scanner + Watchlists + Options Flow → merged into one Discover
//     destination (same 3 real components, unchanged, now sharing one
//     PageSubNav header — see axiom-live.jsx around the rhpro-scan/
//     rhpro-lists/flow activeTab blocks) instead of competing for 3
//     separate nav rows that all answered the same question ("what should
//     I trade").
//   - Green Light/My Trades → promoted OUT of hiding (was reachable only
//     via the GREENLIGHT palette alias or buried in a Dashboard sub-tab)
//     into its own top-level Autopilot destination — this app already had
//     a real broker-status/risk-engine/pause-resume control surface, it
//     just had no front door.
//   - Market / Crypto / Calendar dropped from the visible rail — not
//     deleted, still fully real and still one keystroke away via the
//     Command Palette (MARKET / CRYPTO / CALENDAR). Home's Market Status
//     block already surfaces the daily-relevant slice of Market/Calendar
//     (regime, next event) so most day-to-day need for those two doesn't
//     require leaving Home at all; Crypto is a distinct vertical, not one
//     of the 7 core trading-workflow questions, same reasoning Bloomberg-
//     style terminals give FX/commodities their own desk rather than a
//     permanent rail slot next to equities.
// Single flat list, no section grouping — 7 items don't need one.
export const SIDEBAR_ITEMS = [
  { id: "dashboard", label: "Home",       icon: "🏠", tab: "dashboard" },

  // Cortex — "ask anything" intelligence layer (2026-08-11, explicit user
  // request: "AM CORTEX — AI TRADING INTELLIGENCE ENGINE"). A genuinely new
  // front door, not a Discover sub-view — it answers free-text questions
  // ("why is X moving", "find undervalued stocks") by routing to this
  // app's real existing engines (Sniper Decision, A+ Score, Institutional
  // Grade, Future/Value scoring), never a second chatbot (that's
  // TradingCopilot, unchanged). Given its own top-level slot despite the
  // "7 real surfaces" rule above because it's the single largest,
  // most-requested feature of its kind so far — same reasoning Autopilot
  // got promoted out of hiding for.
  { id: "cortex", label: "Cortex", icon: "🧠", tab: "cortex" },

  // Discover — "what should I trade?" Scan is the primary/default view;
  // Watchlists and Options Flow are one click away via the shared
  // PageSubNav rendered at the top of all three real activeTab blocks
  // (rhpro-scan / rhpro-lists / flow — ids kept exactly as-is so every
  // existing palette alias, localStorage handoff, and Dashboard sub-tab
  // mount pointing at them keeps working unchanged). alsoActive is what
  // keeps this row highlighted while on any of the 3 sub-views.
  { id: "discover",  label: "Discover",   icon: "🎯", tab: "rhpro-scan", alsoActive: ["rhpro-lists", "flow"] },

  // Smart Scan — AI-scored momentum + SMC structure + trend quality scanner
  // (SmartScanTab.jsx), promoted from keyboard-shortcut-only ("s") into a
  // real sidebar row (2026-08-13, explicit user request after asking how
  // to find candidates quickly). Distinct real component from Discover
  // above (RhProScanner.jsx) — kept as its own row rather than merged in,
  // same "don't force two different real tools to share one nav slot"
  // reasoning Discover's own merge above didn't apply here. Its per-row
  // verdict now reuses the real Cortex Verdict (2026-08-13 fix), so this
  // and Cortex below are the two-step real workflow: scan here, confirm
  // there.
  { id: "smartscan", label: "Smart Scan", icon: "🔍", tab: "smartscan" },

  // Workspace — Market Terminal, relabeled (was "Charts") to match what it
  // actually is now: the one per-symbol page (chart + decision + trade
  // plan + institutional summary + AI explanation + options + news +
  // financials + journal notes). Same activeTab id ("mterminal") so every
  // chart-link/localStorage handoff across the app keeps working.
  { id: "charts",    label: "Workspace",  icon: "📈", tab: "mterminal" },

  // Portfolio — "how am I performing?" Unchanged from before.
  { id: "portfolio", label: "Portfolio",  icon: "💼", tab: "portfolio-tab" },

  // Autopilot — "what is the AI doing for me?" Real broker connection
  // status, risk engine, pause/resume, open positions (GreenLightTab +
  // MyTradesTab, axiom-live.jsx activeTab "greenlight") — this already
  // existed and was already fully wired, it just never had a sidebar row
  // of its own before. Still reachable via the palette (GREENLIGHT/GREEN).
  { id: "autopilot", label: "Autopilot",  icon: "🤖", tab: "greenlight" },

  // News — "what changed?" Unchanged from before.
  { id: "news",      label: "News",       icon: "📰", tab: "news" },

  // Journal — "what can I improve?" The real manual trade log
  // (RhProJournal). Unchanged from before; see axiom-live.jsx's JOURNAL
  // palette alias (2026-08-08) for why this and the palette/hotkey now
  // agree on what "journal" means everywhere in the app.
  { id: "journal",   label: "Journal",    icon: "📓", tab: "rhpro-journal" },

  // Light Box — "is it BUY, WAIT, or SELL, right now?" (2026-08-16,
  // explicit user request: a full-card color-coded signal grid meant to be
  // read in one second). Given its own permanent row rather than staying
  // palette-only, same reasoning Cortex/Smart Scan were promoted for —
  // explicit standalone request, meant as a primary trading surface, not a
  // sub-view of an existing tab.
  { id: "lightbox",  label: "Light Box",  icon: "🚦", tab: "lightbox" },

  // Future Wallet — the real Future Wallet 100 market-regime + candidate-
  // research report (2026-08-16 build, 2026-08-17 explicit request to
  // surface it "in my platform" after it existed only as a separate
  // published artifact). Given a real row, same as Light Box above —
  // explicit standalone request confirmed via AskUserQuestion, not a
  // sub-view of an existing tab.
  { id: "futurewallet", label: "Future Wallet", icon: "💰", tab: "futurewallet" },

  // BTC + HPC Deep Scan — real BTC regime + a ranked scan of the real
  // BTC-mining/HPC-hosting pivot universe (IREN/WULF/CORZ/CIFR/RIOT),
  // explicit user request (2026-08-20). Given its own row, same reasoning
  // as Light Box/Future Wallet above — a genuinely new standalone
  // analytical surface, not a sub-view of an existing tab.
  { id: "btc-hpc",   label: "BTC + HPC",   icon: "₿",  tab: "btc-hpc" },

  // Settings — not one of the 7 "question" surfaces (it doesn't answer a
  // daily trading question, it configures the app), kept as a permanent
  // utility row rather than folded into the palette so account/risk/coach
  // settings stay one click away.
  { id: "settings",  label: "Settings",   icon: "⚙️", tab: "settings" },
];

// AI Copilot stays a floating modal launcher (open-ai-copilot event →
// TradingCopilot.jsx), not a sidebar row — it already wasn't an activeTab
// route before this redesign, and the spec's 11-item list doesn't include
// it as a nav destination either. Reachable from Dashboard's
// AiCopilotLauncherCard.
//
// CEO AI / Command Center / Alerts dropped from the sidebar rows rather
// than kept — per the approved redesign plan, CEO AI's brief + Command
// Center's real Sector Rotation/Portfolio Risk Summary sections are
// slated to redistribute into Dashboard's new 4-card grid (Phase 4 of
// the redesign), and Alerts into a Dashboard/Portfolio panel — that
// embedding work hasn't landed yet as of this file's rewrite, so for now
// these are palette-only (CEO-AI is still the default landing tab
// regardless of sidebar
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
          const isActive = activeTab === item.tab || (item.alsoActive || []).includes(activeTab);
          const badgeCount = item.id === "discover" ? scannerBadge : null;
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
