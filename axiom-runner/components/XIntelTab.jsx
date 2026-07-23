import { useState, useEffect } from "react";
import { cardStyle, buttonChrome } from "./ui-helpers.js";
import XIntelOverview from "./XIntelOverview.jsx";
import XIntelSocial from "./XIntelSocial.jsx";
import XIntelTrend from "./XIntelTrend.jsx";
import XIntelMacro from "./XIntelMacro.jsx";
import XIntelRegime from "./XIntelRegime.jsx";
import XIntelWatchlist from "./XIntelWatchlist.jsx";
import XIntelAlerts from "./XIntelAlerts.jsx";
import XIntelHeatmap from "./XIntelHeatmap.jsx";
import XIntelBudget from "./XIntelBudget.jsx";

// X INTELLIGENCE ENGINE v2 — src/x-intel-ai.js + src/x-intel-engine.js. NOT
// the X API, NOT scraping — see x-intel-ai.js's header for the full
// explanation. Real mechanism: Claude web_search finds real news coverage
// of what watched accounts/people/orgs have said, same proven pattern as
// Command Center's event feed, just watchlist-scoped and schema-richer.
//
// Restructured this session from one flat page into a shell + internal
// sub-navigation (Overview/Social/Trend/Macro/Regime/Watchlist/Alerts/
// Heatmap) — one tab, not ten sidebar tabs, matching the precedent set
// when Market Health grew large earlier this session: it became one
// well-organized tab, not several. X Intel's data is also highly
// cross-referential (one Fed item touches News, Macro, Influencer, and
// Breaking simultaneously), so keeping it one tab keeps related context
// together. See /Users/adol/.claude/plans/refactored-mixing-quilt.md for
// the full consolidation rationale (three other regime/macro scorers and
// two real heatmaps already existed elsewhere in this codebase — this
// build reuses/surfaces them rather than duplicating).
//
// Genuinely NOT available through this method (shown once, honestly, not
// per-item): per-post like/reply/repost/view counts, images/video, exact
// original post timestamps. There is no free, ToS-compliant way to get
// those without the official X API.

// Labels deliberately distinct from the global Sidebar's own "Watchlist"
// and "Alerts" nav items (Sidebar.jsx — both point to entirely different
// pages: the account's real stock watchlist and the global Alert Center).
// Reusing those exact words here read ambiguous even in an automated
// click test, real evidence a human glancing at the sidebar could
// plausibly click the wrong one expecting X-Intel-scoped content.
const SUB_TABS = [
  { key: "overview", label: "Overview", icon: "📡" },
  { key: "social", label: "Social", icon: "💬" },
  { key: "trend", label: "Trend", icon: "📈" },
  { key: "macro", label: "Macro", icon: "🌐" },
  { key: "regime", label: "Regime", icon: "🎚️" },
  { key: "watchlist", label: "Rankings", icon: "🎯" },
  { key: "alerts", label: "Signals", icon: "🔔" },
  { key: "heatmap", label: "Heatmap", icon: "🗺️" },
  { key: "budget", label: "Budget", icon: "💳" },
];

function WatchlistPanel({ C, MONO, SANS, watchlist, reload }) {
  const [form, setForm] = useState({ username: "", displayName: "", category: "Custom", importanceScore: 50, reliabilityScore: 50 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const addEntry = () => {
    if (!form.username.trim()) return;
    setBusy(true); setErr(null);
    fetch("/api/x-intel/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      .then((r) => r.json()).then((d) => {
        if (d.ok) { setForm({ username: "", displayName: "", category: "Custom", importanceScore: 50, reliabilityScore: 50 }); reload(); }
        else setErr(d.error || "Failed to add");
      }).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  const removeEntry = (id) => {
    fetch(`/api/x-intel/watchlist?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => reload());
  };
  return (
    <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.accent, marginBottom: 10 }}>👁️ WATCHLIST ({watchlist.length})</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="username"
          style={{ fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "6px 10px", width: 120 }} />
        <input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} placeholder="display name"
          style={{ fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "6px 10px", width: 140 }} />
        <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          style={{ fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "6px 10px" }}>
          {["Politics", "CEOs", "FederalReserve", "Companies", "FinancialNews", "HedgeFunds", "Crypto", "Custom"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={addEntry} disabled={busy} style={buttonChrome(C, { padding: "6px 14px", fontSize: 12, fontWeight: 800, background: C.accent, color: "#fff", border: "none" })}>+ ADD</button>
      </div>
      {err && <div style={{ fontFamily: MONO, fontSize: 11, color: C.red, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {watchlist.map((w) => (
          <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: MONO, fontSize: 11.5, padding: "6px 10px", background: C.surface, borderRadius: 6 }}>
            <span style={{ color: C.text }}>@{w.username} <span style={{ color: C.textDim }}>· {w.category} · imp {w.importanceScore}</span></span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: C.textDim, fontSize: 10 }}>{w.lastChecked ? `checked ${new Date(w.lastChecked).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "never checked"}</span>
              <span onClick={() => removeEntry(w.id)} style={{ color: C.red, cursor: "pointer" }}>✕</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function XIntelTab({ C, MONO, SANS, macroData, setActiveTab }) {
  const [items, setItems] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [trackRecord, setTrackRecord] = useState(null);
  const [state, setState] = useState("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [subTab, setSubTab] = useState("overview");

  const loadFeed = () => {
    fetch("/api/x-intel/feed?limit=150").then((r) => r.json()).then((d) => {
      if (d.ok) { setItems(d.items || []); setState("ok"); } else setState("empty");
    }).catch(() => setState("error"));
  };
  const loadWatchlist = () => {
    fetch("/api/x-intel/watchlist").then((r) => r.json()).then((d) => { if (d.ok) setWatchlist(d.watchlist || []); }).catch(() => {});
  };
  const loadTrackRecord = () => {
    fetch("/api/x-intel/track-record").then((r) => r.json()).then((d) => { if (d.ok) setTrackRecord(d); }).catch(() => {});
  };

  useEffect(() => { loadFeed(); loadWatchlist(); loadTrackRecord(); }, []);

  const refresh = () => {
    setRefreshing(true); setRefreshMsg(null);
    fetch("/api/x-intel/refresh", { method: "POST" }).then((r) => r.json()).then((d) => {
      const rssPart = d.rss?.ok ? `Free RSS: ${d.rss.newItemsCount} new (${d.rss.feedsPolled?.length || 0} official feeds).` : `Free RSS: failed (${d.rss?.error || "unknown"}).`;
      const aiPart = d.ai?.ok ? `AI search: scanned ${d.ai.scanned}, ${d.ai.newItemsCount} new.` : `AI search: ${d.ai?.error || "failed"}.`;
      setRefreshMsg(`${rssPart} ${aiPart}`);
      if (d.ok) { loadFeed(); loadWatchlist(); loadTrackRecord(); }
    }).catch((e) => setRefreshMsg(e.message)).finally(() => setRefreshing(false));
  };

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 900, color: C.text }}>🐦 X INTELLIGENCE ENGINE</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            Real news coverage of watched accounts, AI-classified with market impact — not the X API, not scraping
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowWatchlist((v) => !v)} style={buttonChrome(C, { padding: "9px 16px", fontSize: 12, fontWeight: 800, background: showWatchlist ? C.accent : C.card, color: showWatchlist ? "#fff" : C.textSec, border: `1px solid ${C.border}` })}>
            👁️ WATCHLIST
          </button>
          <button onClick={refresh} disabled={refreshing} style={buttonChrome(C, { padding: "9px 18px", fontSize: 12, fontWeight: 800, background: refreshing ? C.surface : C.gold, color: refreshing ? C.textDim : "#fff", border: "none" })}>
            {refreshing ? "SCANNING…" : "↻ REFRESH"}
          </button>
        </div>
      </div>

      <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, background: `${C.textDim}0a`, borderRadius: 8, padding: "8px 12px" }}>
        ℹ️ Two real sources, no X API, no scraping: (1) free official RSS feeds (Fed, White House, SEC, NVIDIA, Apple, OpenAI) — real press releases, not AI-analyzed, shown as-is with a 🆓 RSS badge; (2) AI web search for everyone else — real news coverage of public statements, with sentiment/market-impact analysis. Per-post like/reply/repost/view counts, images, and video aren't available through either method.
      </div>

      {refreshMsg && <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent }}>{refreshMsg}</div>}

      {showWatchlist && <WatchlistPanel C={C} MONO={MONO} SANS={SANS} watchlist={watchlist} reload={loadWatchlist} />}

      {/* Horizontal-scroll, single row — NOT flexWrap. The original
          flexWrap version wrapped to a 2nd row on mobile at exactly the
          screen position the fixed FAB cluster occupies, confirmed live
          via screenshot — obscuring the Trend tab button entirely. This
          overflowX:"auto"/whiteSpace:"nowrap" pattern is now the standard
          applied to every tab's internal sub-nav in this codebase
          (DashboardTab/AdvisorAiTab/MarketTerminalTab) as part of the
          2026-07-22 site reorganization, replacing the old dead
          SubNavBar.jsx (deleted — confirmed never rendered anywhere). */}
      <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none", borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
        {SUB_TABS.map((t) => (
          <button key={t.key} onClick={() => setSubTab(t.key)} style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
            whiteSpace: "nowrap", flexShrink: 0, minHeight: 40,
            border: `1px solid ${subTab === t.key ? C.accent : C.border}`, background: subTab === t.key ? `${C.accent}18` : "transparent", color: subTab === t.key ? C.accent : C.textDim }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {subTab === "overview" && <XIntelOverview C={C} MONO={MONO} SANS={SANS} items={items} state={state} trackRecord={trackRecord} />}
      {subTab === "social" && <XIntelSocial C={C} MONO={MONO} SANS={SANS} items={items} />}
      {subTab === "trend" && <XIntelTrend C={C} MONO={MONO} SANS={SANS} />}
      {subTab === "macro" && <XIntelMacro C={C} MONO={MONO} SANS={SANS} macroData={macroData} />}
      {subTab === "regime" && <XIntelRegime C={C} MONO={MONO} SANS={SANS} />}
      {subTab === "watchlist" && <XIntelWatchlist C={C} MONO={MONO} SANS={SANS} />}
      {subTab === "alerts" && <XIntelAlerts C={C} MONO={MONO} SANS={SANS} />}
      {subTab === "heatmap" && <XIntelHeatmap C={C} MONO={MONO} SANS={SANS} items={items} setActiveTab={setActiveTab} />}
      {subTab === "budget" && <XIntelBudget C={C} MONO={MONO} SANS={SANS} />}
    </div>
  );
}
