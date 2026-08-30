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

  // Trade Desk — one unified screen (2026-08-25, explicit user request:
  // top status strip + Discover-search|Chart|Cortex 3-pane + a bottom
  // module dock, all without leaving the page). New, additive tab —
  // TradeDeskTab.jsx. Named "Trade Desk," not "Command Center," to avoid
  // colliding with the real, separate, already-shipped AI Market Command
  // Center (CommandCenterTab.jsx, activeTab "command-center").
  { id: "trade-desk", label: "Trade Desk", icon: "🎛️", tab: "trade-desk" },

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

  // Discover dropped from the rail (2026-08-25, explicit user request: "i
  // want discover inside trade desk linked not as a tab on side"). The
  // real, full ScanTerminalHub.jsx is now reached through Trade Desk's
  // "DISCOVER" bottom-dock button instead of a standalone sidebar row —
  // same real component, same real data, no rewrite. Not deleted — "rhpro-
  // scan" and its sub-views (rhpro-lists/flow/smartscan/mterminal) stay
  // fully real and reachable via the command palette (DISCOVER — new
  // alias added alongside the existing SCANNER/BREAKOUTS/BESTOPP/EARLY —
  // plus WATCHLISTS/FLOW/TERMINAL/CHARTS for the sub-views individually),
  // and every existing internal caller that lands on these activeTab
  // values directly (MoversTab's openDeepDiveFor, etc.) is untouched.

  // Sniper AI dropped from the rail (2026-08-25, "remove duplicate tabs" —
  // Trade Desk's left panel now shows this exact same real ranked scan,
  // /api/market/sniper-scan, as quick-access, making a dedicated rail slot
  // redundant). Not deleted — same "hide, don't delete" convention as
  // Market/Crypto/Calendar above: SniperAITab.jsx and its activeTab
  // "sniper-ai" are fully intact, still one keystroke away via the
  // existing SNIPER command-palette alias.

  // Portfolio — "how am I performing?" Unchanged from before.
  { id: "portfolio", label: "Portfolio",  icon: "💼", tab: "portfolio-tab" },

  // Autopilot — "what is the AI doing for me?" Real broker connection
  // status, risk engine, pause/resume, open positions (GreenLightTab +
  // MyTradesTab, axiom-live.jsx activeTab "greenlight") — this already
  // existed and was already fully wired, it just never had a sidebar row
  // of its own before. Still reachable via the palette (GREENLIGHT/GREEN).
  { id: "autopilot", label: "Autopilot",  icon: "🤖", tab: "greenlight" },

  // ADOL22 Autopilot 2.0 (Phase 1, 2026-08-27) — a genuinely different
  // real destination from "Autopilot" above: a real internal $100k
  // simulated paper account run by its own fully autonomous scan->enter
  // ->manage->exit loop (autopilot2-engine.js), separate from the
  // existing Green Light system (which trades the real Alpaca paper
  // account). Given its own row rather than folded into "Autopilot"
  // above, same "genuinely new standalone tool" reasoning as Future
  // Wallet/Photo Banners below — explicit distinct icon (🚀, matching the
  // user's own spec header) so the two "Autopilot"-named rows are never
  // confused for the same destination.
  { id: "autopilot2", label: "Autopilot 2.0", icon: "🚀", tab: "autopilot2" },

  // News — "what changed?" Unchanged from before.
  { id: "news",      label: "News",       icon: "📰", tab: "news" },

  // Journal removed completely (2026-08-25, explicit user request: "remove
  // journal completely") — no sidebar row, no palette alias, no hotkey.
  // RhProJournal.jsx and any real historical trade-journal data are
  // untouched; see axiom-live.jsx's palette-alias section for the full
  // removal note.

  // Light Box dropped from the rail (2026-08-25, explicit user request:
  // "link light box to as a branch to trade desk as well as discover as
  // branch not as a tab") — same real LightBoxTab.jsx now reached through
  // Trade Desk's "LIGHT BOX" dock button. Not deleted — still fully real
  // and reachable via the existing LIGHTBOX/LIGHTS command-palette
  // aliases, same "hide, don't delete" treatment as Discover/Sniper AI/
  // Journal above.

  // Future Wallet — the real Future Wallet 100 market-regime + candidate-
  // research report (2026-08-16 build, 2026-08-17 explicit request to
  // surface it "in my platform" after it existed only as a separate
  // published artifact). Given a real row, same as Light Box above —
  // explicit standalone request confirmed via AskUserQuestion, not a
  // sub-view of an existing tab.
  { id: "futurewallet", label: "Future Wallet", icon: "💰", tab: "futurewallet" },

  // Photo Banners — explicit user request (2026-08-26: "build tab so i can
  // give image and ask to add banners by ai"). Given its own row, same
  // reasoning as Light Box/Future Wallet above — a genuinely new
  // standalone tool, not a sub-view of an existing tab.
  { id: "photobanners", label: "Photo Banners", icon: "🎨", tab: "photobanners" },

  // BTC + HPC Deep Scan dropped from the rail (2026-08-30, explicit user
  // request: "i want btc+hpc inside future wallet as a sub tab use same
  // set up same engine as future wallet"). The real BTC-mining/HPC-hosting
  // pivot universe (12 tickers) is now folded directly into Future
  // Wallet's own real universe/quant/technical/potential/agent pipeline —
  // a "🪙 BTC + HPC" filter toggle inside FutureWalletTab.jsx, not a
  // second engine. BtcHpcScanCard.jsx and its real /api/market/btc-hpc-
  // scan|deep routes are left on disk, unreferenced (same "leave the file,
  // drop the front door" treatment prior merges in this file used) — the
  // BTCHPC/HPC command-palette aliases now point at Future Wallet instead.

  // Research — macro/valuation/AI-capex research report, explicit user
  // request (2026-08-30: "put it inside platform in research tab") after a
  // 5-stream live-research pass was synthesized into a published artifact.
  // Given its own row, same reasoning as Future Wallet above — a genuinely
  // new standalone report surfaced in-app, not a sub-view of an existing
  // tab. A point-in-time snapshot (ResearchTab.jsx), not a live data
  // pipeline into am-core-engine.js/opportunity-engine.js — the user
  // explicitly chose "Research report" over "live platform integration"
  // when asked.
  { id: "research",  label: "Research",    icon: "🧭",  tab: "research" },

  // Car Business — a completely separate automotive-business decision
  // system, explicit user /goal (2026-08-30: "Create a NEW standalone
  // CAR BUSINESS tab... DO NOT MIX IT WITH THE TRADING ENGINE."). Given
  // its own top-level row for exactly that reason — it must never read
  // as a sub-view of the trading tabs. Reuses this app's real dealer
  // backend (inventory-store.js, dealership/fb-hub.js's CRM) rather than
  // duplicating it; no am-core-engine.js/opportunity-engine.js involved.
  { id: "carbusiness", label: "Car Business", icon: "🚗", tab: "carbusiness" },

  // Dealership — the real, already-built operational dealer portal
  // (inventory management, AI CRM inbox, photo tools, price beater —
  // src/dealership/routes.js/fb-hub.js) has existed since before this
  // session but was only ever reachable via a direct URL (/dealer),
  // never a sidebar row. Explicit user request (2026-08-30: "Add
  // dealership tab under new tab"), placed directly under Car Business
  // since the two are closely related (Car Business is the AI research/
  // strategy layer, this is the day-to-day operational tool it reasons
  // about). A genuinely separate app/bundle (client/dealer/index.html,
  // not part of this React app) — real full-page navigation via `href`,
  // opened in a new tab so the trading platform's own session/state
  // isn't lost, same convention as any real cross-app link.
  { id: "dealership", label: "Dealership", icon: "🏪", href: "/dealer" },

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
          // href items (e.g. "Dealership") are a real, separate app/bundle
          // outside this React SPA — a genuine full-page navigation
          // (rendered as <a>, opened in a new tab so this app's own
          // session/state isn't lost), never setActiveTab. Never "active"
          // by definition — activeTab has no route it could ever match.
          const isExternal = !!item.href;
          const isActive = !isExternal && (activeTab === item.tab || (item.alsoActive || []).includes(activeTab));
          // Moved from the now-removed "discover" row (2026-08-25) — same
          // real count (scanner rows scoring >=70), now surfaced on Trade
          // Desk since that's where Discover itself moved to.
          const badgeCount = item.id === "trade-desk" ? scannerBadge : null;
          const Tag = isExternal ? "a" : "button";
          return (
            <Tag key={item.id}
              {...(isExternal ? { href: item.href, target: "_blank", rel: "noopener noreferrer" } : { onClick: () => setActiveTab(item.tab) })}
              title={collapsed ? item.label : undefined}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                justifyContent: collapsed ? "center" : "flex-start",
                border: "none", textAlign: "left", cursor: "pointer", textDecoration: "none",
                background: isActive ? `${C.accent}18` : "transparent",
                color: isActive ? C.accent : C.textSec,
                borderRadius: 8, padding: collapsed ? "9px 0" : "9px 10px", marginBottom: 2,
                fontFamily: SANS, fontSize: 13, fontWeight: isActive ? 700 : 500,
                position: "relative", boxSizing: "border-box",
              }}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
              {!collapsed && isExternal ? <span style={{ fontSize: 11, color: C.textDim }}>↗</span> : null}
              {!collapsed && badgeCount ? (
                <span style={{ background: C.green, color: "#fff", borderRadius: 10, padding: "2px 6px", fontFamily: MONO, fontSize: 10, fontWeight: 800 }}>{badgeCount}</span>
              ) : null}
              {collapsed && badgeCount ? (
                <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: "50%", background: C.green }} />
              ) : null}
            </Tag>
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
