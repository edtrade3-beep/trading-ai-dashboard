// Persistent left sidebar nav. Collapsed 2026-08-09 (sidebar/IA redesign)
// from the prior 11-item flat list down to 7, then grew back to 19 real
// top-level rows over the following month as new features each got their
// own permanent slot. Collapsed again 2026-09-05 ("combine tabs minimize
// tabs") down to a 7-item rail. Collapsed further 2026-09-15, in two
// steps, both same-day: first a "restructure around AI Trade Desk as the
// main workspace" master prompt (Market/News/Search dropped — their real
// content was already rendered inline inside AI Trade Desk, genuinely
// redundant; "Trade Desk"/"AI Agent" relabeled to "AI Trade Desk"/
// "Agent"; that prompt's own strict success criteria named AI TRADE DESK
// / AGENT / DEALERSHIP / JOURNAL / SETTINGS as the only 5 rows), then a
// direct, more specific follow-up instruction — "REMOVE DEALERSHIP AND
// AGENT COMPLETELY" — which drops two of that same prompt's own named
// rows; the later, more specific instruction took precedence over the
// earlier one rather than being read as a conflict to resolve by asking.
// Current rail: AI Trade Desk, Crypto, Autopilot, Journal, Car Business,
// Story AI, Islamic, Settings. Crypto/Autopilot/Car Business/Story
// AI/Islamic were never addressed by either 2026-09-15 prompt and stay
// visible — each was added by its own separate, explicit user request
// (Car Business has its own standing "DO NOT MIX WITH THE TRADING
// ENGINE" rule from 2026-08-30), so their continued presence isn't
// silence-as-authorization, it's simply outside what either prompt asked
// about.
//
// Every dropped item is a demotion, never a deletion — the exact same
// "hide, don't delete" pattern this file already used repeatedly
// (Discover, Sniper AI, Light Box, Market/Crypto/Calendar, Curbline,
// Market/News/Search): the real component/route/data is completely
// untouched, only the permanent rail row disappears, replaced by a
// one-keystroke command-palette path (axiom-live.jsx's runPaletteCommand
// `toTab` alias table). See each dropped item's own comment below for its
// specific palette keyword.
export const SIDEBAR_ITEMS = [
  // AI Trade Desk — one unified screen (2026-08-25, explicit user request:
  // top status strip + Discover-search|Chart|Cortex 3-pane + a bottom
  // module dock, all without leaving the page). Relabeled "Trade Desk" ->
  // "AI Trade Desk" (2026-09-15, "restructure around AI Trade Desk as the
  // main workspace" master prompt) — a straight rename, activeTab
  // unchanged ("trade-desk"), never a second/new tab; the spec's own
  // explicit rule ("Do not create both 'Trade Desk' and 'AI Trade Desk'")
  // is why this is a relabel, not an addition. TradeDeskTab.jsx already
  // renders MarketCommandCenter (market regime/macro), WhatChangedStrip,
  // and TopOpportunities inline — the spec's own MARKET/TODAY'S
  // OPPORTUNITIES/WHAT CHANGED sections were already real and live here
  // before this rename, not newly built for it.
  { id: "trade-desk", label: "AI Trade Desk", icon: "🎛️", tab: "trade-desk" },

  // "Market" row dropped from the rail (2026-09-15, same master prompt:
  // "Market must live inside AI Trade Desk... do not create or retain a
  // separate Market tab"). Same real component/data (activeTab
  // "dashboard") — DashboardTab.jsx is untouched, still reachable via the
  // existing MARKET command-palette alias (axiom-live.jsx), same "hide,
  // don't delete" convention this file already used 15+ times before
  // (Discover/Sniper AI/Portfolio/Alerts/Research/Market Wrap/Curbline/
  // etc.). AI Trade Desk's own MarketCommandCenter+MarketSentimentCard
  // (rendered inline, see above) already cover this row's real content —
  // this genuinely was redundant, not just consolidated for its own sake.

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

  // News dropped from the rail again (2026-09-15 master prompt: fold News
  // into AI Trade Desk rather than keep it as a separate research
  // destination). Same real component/data (activeTab "news") — still
  // reachable via the existing NEWS command-palette alias, and AI Trade
  // Desk's own module dock already has a real "NEWS" module (ANALYSIS
  // group) plus MarketCommandCenter's onOpenNews handoff — this row's
  // content was already duplicated inside AI Trade Desk, not newly folded
  // in for this change.

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
  // visible through the 2026-09-05 nav consolidation (explicit user
  // choice) and the 2026-09-15 AI-Trade-Desk restructure (not mentioned
  // by that prompt — see the top-of-file note) rather than demoted to the
  // palette — a real day-to-day business tool, not a trading-workflow
  // surface, so it doesn't compete for a trading nav slot but still
  // shouldn't require a command-palette lookup for daily use.
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

  // Dealership row removed from the rail completely (2026-09-15, explicit
  // user instruction: "REMOVE DEALERSHIP AND AGENT COMPLETELY" — this
  // directly reverses this same day's earlier master prompt, which had
  // listed Dealership as one of the 5 required top-level tabs; treated as
  // the user's own later, more specific instruction taking precedence).
  // The real dealer portal itself (src/dealership/routes.js/fb-hub.js,
  // client/dealer/index.html) is completely untouched — it's a genuinely
  // separate app/bundle, not part of this React SPA, so there was never a
  // component to delete here, only this row. Two other real, pre-existing
  // paths to it are untouched and still work: the top-bar "DIXIE" link
  // (axiom-live.jsx, opens /dealer in a new tab) and the mobile menu's
  // own "DIXIE" button — neither was added for this change, both already
  // existed independently of this sidebar row.

  // Search dropped from the rail (2026-09-15 master prompt: "Search
  // should be removed completely as a tab... Search is an ACTION, not a
  // destination"). SearchTab.jsx was already a thin wrapper around
  // CommandSearchPanel — the exact same real search+Opportunity-Inbox
  // component AI Trade Desk's own left column already renders inline
  // (TradeDeskTab.jsx, both the 3-pane view and the "search" view mode) —
  // so this row was already 100% redundant with AI Trade Desk itself, not
  // merely similar. SearchTab.jsx stays on disk, untouched, still
  // reachable via the existing SEARCH command-palette alias.

  // Agent row removed from the rail completely (2026-09-15, explicit user
  // instruction: "REMOVE DEALERSHIP AND AGENT COMPLETELY" — same later,
  // more specific instruction overriding this same day's earlier master
  // prompt, which had listed Agent as one of the 5 required top-level
  // tabs). AgentTab.jsx and every real backing route (including the new
  // /api/agent/command tool-calling work, same day) are completely
  // untouched — this removes only the permanent rail row. Still one
  // keystroke away via the existing AGENT/AI command-palette aliases
  // (axiom-live.jsx), which already existed before Agent was ever
  // promoted to a permanent row (2026-09-13) — same "hide, don't delete"
  // convention as every other row dropped from this file.

  // Story AI — Arabic AI storytelling studio (2026-09-07, explicit user
  // request: "add a completely new major tab... self-contained module").
  // Same explicit-exception placement as Car Business/Dealership above: a
  // genuinely separate, non-trading vertical that still deserves a
  // permanent one-keystroke slot rather than a palette-only lookup.
  // StoryAiTab.jsx and every src/story-ai-*.js service behind it are
  // fully additive — zero shared state with any trading route/engine.
  { id: "storyai", label: "Story AI", icon: "🎬", tab: "storyai" },

  // Islamic — unified hub (2026-09-10, explicit user request: rebuild the
  // Islamic tab with a full Zakat Calculator as its centerpiece). Same
  // "non-trading vertical, permanent slot" placement as Car Business/
  // Dealership/Story AI above. Prayer times ("athan") and Quran
  // ("quran") remain reachable standalone too — this is a new hub, not a
  // replacement, same "hide, don't delete" discipline as everything else
  // demoted from the rail.
  { id: "islamic", label: "Islamic", icon: "🕌", tab: "islamic" },

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
                borderRadius: 8, padding: collapsed ? "10px 0" : "10px 12px", marginBottom: 2,
                fontFamily: SANS, fontSize: 14, fontWeight: isActive ? 700 : 500,
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
            borderRadius: 8, padding: "10px 12px", marginBottom: 6, fontFamily: SANS, fontSize: 14, fontWeight: 500,
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
