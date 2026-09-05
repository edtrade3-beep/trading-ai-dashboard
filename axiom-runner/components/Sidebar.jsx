// Persistent left sidebar nav. Collapsed 2026-08-09 (sidebar/IA redesign)
// from the prior 11-item flat list down to 7, then grew back to 19 real
// top-level rows over the following month as new features each got their
// own permanent slot. Collapsed again 2026-09-05 (explicit user request:
// "combine tabs minimize tabs," completing the nav-consolidation item from
// this session's original platform-architect audit) down to the 5-tab spec
// (TRADE DESK / MARKET / AUTOPILOT / JOURNAL / SETTINGS) plus 2 explicit
// exceptions the user asked to keep visible (Car Business + Dealership —
// real day-to-day dealership-business tools, not part of the trading
// workflow, with their own standing requirement to never read as a
// sub-view of the trading tabs).
//
// Every dropped item is a demotion, never a deletion — the exact same
// "hide, don't delete" pattern this file already used 7 times before
// (Discover, Sniper AI, Light Box, Market/Crypto/Calendar, Curbline): the
// real component/route/data is completely untouched, only the permanent
// rail row disappears, replaced by a one-keystroke command-palette path
// (axiom-live.jsx's runPaletteCommand `toTab` alias table). See each
// dropped item's own comment below for its specific palette keyword.
//
// "Dashboard" is relabeled "Market" here (2026-09-05) — it's now the one
// real MARKET destination in the 5-tab spec, unchanged underneath.
// Single flat list, no section grouping — 7 items don't need one.
export const SIDEBAR_ITEMS = [
  // Trade Desk — one unified screen (2026-08-25, explicit user request:
  // top status strip + Discover-search|Chart|Cortex 3-pane + a bottom
  // module dock, all without leaving the page). New, additive tab —
  // TradeDeskTab.jsx. Named "Trade Desk," not "Command Center," to avoid
  // colliding with the real, separate, already-shipped AI Market Command
  // Center (CommandCenterTab.jsx, activeTab "command-center").
  { id: "trade-desk", label: "Trade Desk", icon: "🎛️", tab: "trade-desk" },

  // "Market" (2026-09-05 nav consolidation) — a straight relabel of the
  // former "Market Overview" row, activeTab unchanged ("dashboard"). This
  // is the one real MARKET destination the 5-tab spec asks for; the
  // palette's own MARKET keyword now points here too (repointed from
  // "market"/Economy, see the ECONOMY alias below for where that went) —
  // same "sidebar label matches palette word" convention as the
  // 2026-07-29 PORTFOLIO/SCANNER repoint.
  { id: "dashboard", label: "Market", icon: "🏠", tab: "dashboard" },

  // Crypto — restored to the rail (2026-09-05, explicit user request: "add
  // crypto to tabs"), reversing the 2026-08-09 decision that dropped it as
  // "a distinct vertical, not one of the core trading-workflow questions."
  // Same real component/data as before (activeTab "crypto") — it never
  // moved, it just had no permanent row; the existing CRYPTO command-
  // palette alias still works too, now redundant with this row the same
  // way every other sidebar tab's alias is.
  { id: "crypto", label: "Crypto", icon: "🪙", tab: "crypto" },

  // Trade Navigator dropped from the rail (2026-09-05 nav consolidation).
  // TradeNavigatorTab.jsx (activeTab "trade-navigator") is fully untouched
  // — one keystroke away via the new NAVIGATOR command-palette alias.

  // Scanner dropped from the rail (2026-09-05 nav consolidation). Same
  // real component (activeTab "scanner") — already reachable via the
  // existing OLDSCANNER command-palette alias (distinct from SCANNER,
  // which points at Discover's own ranked scan).

  // Economy dropped from the rail (2026-09-05 nav consolidation). Same
  // real component (activeTab "market") — reachable via the new ECONOMY
  // command-palette alias now that MARKET itself points at the row above.

  // Cortex dropped from the rail (2026-09-05 nav consolidation).
  // CortexTab (activeTab "cortex") is fully untouched — one keystroke
  // away via the new CORTEX command-palette alias.

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

  // Portfolio dropped from the rail (2026-09-05 nav consolidation). Same
  // real component (activeTab "portfolio-tab") — already reachable via
  // the existing PORTFOLIO command-palette alias.

  // Autopilot — "what is the AI doing for me?" Real broker connection
  // status, risk engine, pause/resume, open positions (GreenLightTab +
  // MyTradesTab, axiom-live.jsx activeTab "greenlight"), plus the Unified
  // Autopilot panel (2026-09-05) showing the shared order log/
  // reconciliation status across server-autopilot.js/lightbox-autopilot-
  // execute.js. Still reachable via the palette (GREENLIGHT/GREEN).
  { id: "autopilot", label: "Autopilot",  icon: "🤖", tab: "greenlight" },

  // ADOL22 Autopilot 2.0 dropped from the rail (2026-09-05 nav
  // consolidation). A genuinely different real destination from
  // "Autopilot" above — a real internal $100k simulated paper account run
  // by its own fully autonomous scan->enter->manage->exit loop
  // (autopilot2-engine.js), deliberately kept a separate ledger from the
  // real Alpaca account (see .claude/plans/proud-yawning-unicorn.md's
  // Unified Autopilot merge — only the risk-gate vocabulary is shared).
  // Same real component (activeTab "autopilot2") — already reachable via
  // the existing AUTOPILOT2/ADOL22AUTOPILOT command-palette aliases.

  // News dropped from the rail (2026-09-05 nav consolidation). Same real
  // component (activeTab "news") — already reachable via the existing
  // NEWS command-palette alias.

  { id: "journal", label: "Journal", icon: "📓", tab: "journal" },
  // Journal remains a direct destination so historical trade records stay
  // discoverable; its existing component and data path are unchanged.

  // Alerts dropped from the rail (2026-09-05 nav consolidation). Same
  // real component (activeTab "alerts") — already reachable via the
  // existing ALERTS command-palette alias.

  // Light Box dropped from the rail (2026-08-25, explicit user request:
  // "link light box to as a branch to trade desk as well as discover as
  // branch not as a tab") — same real LightBoxTab.jsx now reached through
  // Trade Desk's "LIGHT BOX" dock button. Not deleted — still fully real
  // and reachable via the existing LIGHTBOX/LIGHTS command-palette
  // aliases, same "hide, don't delete" treatment as Discover/Sniper AI/
  // Journal above.

  // Future Wallet dropped from the rail (2026-09-05 nav consolidation).
  // Same real component (activeTab "futurewallet") — already reachable
  // via the existing FUTUREWALLET/WALLET command-palette aliases.

  // Photo Banners dropped from the rail (2026-09-05 nav consolidation).
  // Same real component (activeTab "photobanners") — reachable via the
  // new PHOTOBANNERS command-palette alias.

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

  // Research dropped from the rail (2026-09-05 nav consolidation). Same
  // real component (activeTab "research") — already reachable via the
  // existing RESEARCH/MACRORESEARCH command-palette aliases.

  // Market Wrap dropped from the rail (2026-09-05 nav consolidation).
  // Same real component (activeTab "marketwrap") — reachable via the new
  // MARKETWRAP command-palette alias.

  // Car Business — a completely separate automotive-business decision
  // system, explicit user /goal (2026-08-30: "Create a NEW standalone
  // CAR BUSINESS tab... DO NOT MIX IT WITH THE TRADING ENGINE."). Kept
  // visible alongside the 5-tab trading rail (2026-09-05 nav
  // consolidation, explicit user choice) rather than demoted to the
  // palette — a real day-to-day business tool, not a trading-workflow
  // surface, so it doesn't compete for one of the 5 trading slots but
  // still shouldn't require a command-palette lookup for daily use.
  // Reuses this app's real dealer backend (inventory-store.js,
  // dealership/fb-hub.js's CRM) rather than duplicating it — no
  // am-core-engine.js/opportunity-engine.js involved.
  { id: "carbusiness", label: "Car Business", icon: "🚗", tab: "carbusiness" },

  // Curbline dropped from the rail (2026-09-01 platform audit) — same
  // "hide, don't delete" convention as Market/Crypto/Calendar/Sniper AI
  // above. It's still a concept preview for a productized version of Car
  // Business's Facebook Ad Maker (explicit user request 2026-08-31), but
  // per its own header comment it's a static pitch page only — no multi-
  // tenant backend exists yet, so it never calls a real API. CurblineTab.jsx
  // and the real curbline-intel-*.js engine behind its one working feature
  // (the daily competitor-intel scan) are untouched — still reachable via
  // the CURBLINE command-palette alias (axiom-live.jsx). Revisit a real
  // sidebar row once/if it gets a real multi-tenant backend.

  // Dealership — the real, already-built operational dealer portal
  // (inventory management, AI CRM inbox, photo tools, price beater —
  // src/dealership/routes.js/fb-hub.js). Explicit user request (2026-08-30:
  // "Add dealership tab under new tab"), placed directly under Car
  // Business since the two are closely related (Car Business is the AI
  // research/strategy layer, this is the day-to-day operational tool it
  // reasons about). Kept visible in the 2026-09-05 nav consolidation for
  // the same explicit-exception reasoning as Car Business above. A
  // genuinely separate app/bundle (client/dealer/index.html, not part of
  // this React app) — real full-page navigation via `href`, opened in a
  // new tab so the trading platform's own session/state isn't lost, same
  // convention as any real cross-app link.
  { id: "dealership", label: "Dealership", icon: "🏪", href: "/dealer" },

  // Settings — not one of the 5 "question" surfaces (it doesn't answer a
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
// CEO AI / Command Center remain palette-first specialist surfaces. Alerts
// now has a direct sidebar row; its existing standalone route is unchanged.
// Note (2026-09-01 platform audit): this comment previously
// claimed CEO-AI was "still the default landing tab regardless of
// sidebar presence" — the real default (axiom-live.jsx's activeTab
// useState initializer) is "trade-desk", not "ceo-ai". Corrected here so
// a future reader doesn't trust the stale claim.

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
