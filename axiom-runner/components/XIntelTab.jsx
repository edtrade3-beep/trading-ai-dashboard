import { useState, useEffect, useMemo } from "react";
import { cardStyle, buttonChrome } from "./ui-helpers.js";

// X INTELLIGENCE ENGINE — src/x-intel-ai.js. NOT the X API, NOT scraping —
// see that file's header for the full explanation. Real mechanism: Claude
// web_search finds real news coverage of what watched accounts/people/orgs
// have said, same proven pattern as Command Center's event feed, just
// watchlist-scoped and schema-richer (per-item market impact, full AI
// summary, four scores). Every item carries a real, clickable source URL.
//
// Genuinely NOT available through this method (shown once, honestly, not
// per-item): per-post like/reply/repost/view counts, images/video, exact
// original post timestamps. There is no free, ToS-compliant way to get
// those without the official X API.

const CATEGORY_COLOR = {
  "Breaking News": "#c8282a", Politics: "#7c5cff", Tariffs: "#c8282a", Earnings: "#22c55e",
  AI: "#2563eb", Semiconductor: "#2563eb", Crypto: "#f59e0b", Inflation: "#d6a312",
  InterestRates: "#d6a312", FederalReserve: "#7c5cff", Acquisition: "#0d9465",
  Healthcare: "#0d9465", Energy: "#0d9465", Consumer: "#f59e0b", Macro: "#94a3b8", Other: "#94a3b8",
};

function SectionLabel({ icon, text, color, C, MONO }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color, letterSpacing: "0.05em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
      <span>{icon}</span><span>{text}</span>
    </div>
  );
}

function ItemCard({ it, C, MONO, SANS }) {
  const [open, setOpen] = useState(false);
  const col = CATEGORY_COLOR[it.category] || C.textDim;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: "11px 13px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>@{it.entityUsername}</span>
          <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: col, background: `${col}18`, borderRadius: 5, padding: "2px 6px" }}>{it.category.toUpperCase()}</span>
        </div>
        <div style={{ display: "flex", gap: 8, fontFamily: MONO, fontSize: 10, color: C.textDim }}>
          <span>IMPACT <b style={{ color: it.scores.impactScore > 80 ? C.red : it.scores.impactScore > 50 ? C.amber : C.textDim }}>{it.scores.impactScore}</b></span>
          <span>{new Date(it.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }} onClick={() => setOpen((v) => !v)}>{it.aiSummary.oneLine}</div>
      {open && (
        <>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.5, marginBottom: 6 }}>{it.aiSummary.executive}</div>
          {it.aiSummary.whyItMatters && <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.text, marginBottom: 3 }}><b style={{ color: C.accent }}>Why it matters:</b> {it.aiSummary.whyItMatters}</div>}
          {it.aiSummary.possibleReaction && <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.text, marginBottom: 3 }}><b style={{ color: C.amber }}>Possible reaction:</b> {it.aiSummary.possibleReaction}</div>}
          {it.aiSummary.risks && <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.text, marginBottom: 3 }}><b style={{ color: C.red }}>Risks:</b> {it.aiSummary.risks}</div>}
          {it.aiSummary.opportunities && <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.text, marginBottom: 6 }}><b style={{ color: C.green }}>Opportunities:</b> {it.aiSummary.opportunities}</div>}
        </>
      )}
      {it.marketImpact?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {it.marketImpact.map((m) => (
            <span key={m.symbol} title={m.reasoning} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
              background: m.direction === "bullish" ? `${C.green}15` : `${C.red}15`, color: m.direction === "bullish" ? C.green : C.red }}>
              {m.direction === "bullish" ? "▲" : "▼"} {m.symbol} {m.confidence}%
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <a href={it.sourceCitation} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, fontSize: 10, color: C.accent }}>source ↗</a>
        <span onClick={() => setOpen((v) => !v)} style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, cursor: "pointer" }}>{open ? "▲ less" : "▼ more"}</span>
      </div>
    </div>
  );
}

function TrackRecordSection({ tr, C, MONO, SANS }) {
  if (!tr) return null;
  return (
    <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
      <SectionLabel icon="📋" text="TRACK RECORD — REAL, CODE-GRADED OUTCOMES" color={C.accent} C={C} MONO={MONO} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 10 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: tr.hitRatePct == null ? C.textDim : tr.hitRatePct >= 55 ? C.green : tr.hitRatePct >= 40 ? C.amber : C.red }}>
            {tr.hitRatePct == null ? "—" : `${tr.hitRatePct}%`}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>HIT RATE ({tr.closedCount} closed)</div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>{tr.openCount}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>OPEN / IN PROGRESS</div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>{tr.totalGenerated}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>TOTAL CALLS LOGGED</div>
        </div>
      </div>
      {tr.recent?.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tr.recent.slice(0, 10).map((p) => {
            const statusCol = p.status === "hit" ? C.green : p.status === "stopped" ? C.red : p.status === "expired" ? C.textDim : C.amber;
            return (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: MONO, fontSize: 11, padding: "6px 10px", background: C.surface, borderRadius: 6 }}>
                <span style={{ color: C.text, fontWeight: 700 }}>{p.symbol} <span style={{ color: C.textDim, fontWeight: 400 }}>{p.direction}</span></span>
                <span style={{ color: statusCol, fontWeight: 800 }}>{p.status.toUpperCase()}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No market-impact calls graded yet — fills in as real scans log new predictions.</div>
      )}
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginTop: 8 }}>
        Direction-only grading (±3% real price band from the captured entry price) — not a specific price target, since X-sourced calls are directional, not defined-risk trade setups.
      </div>
    </div>
  );
}

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
      <SectionLabel icon="👁️" text={`WATCHLIST (${watchlist.length})`} color={C.accent} C={C} MONO={MONO} />
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
      {/* Flows with the page rather than a small nested scroll box — a
          capped-height inner scroller here made newly-added entries
          (appended at the end) invisible unless you scrolled inside that
          small box specifically, easy to miss especially on mobile.
          Confirmed live: 16 real accounts a user added were fully present
          in the data but looked "missing" for exactly this reason. */}
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

export default function XIntelTab({ C, MONO, SANS }) {
  const [items, setItems] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [trackRecord, setTrackRecord] = useState(null);
  const [state, setState] = useState("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [search, setSearch] = useState({ symbol: "", entity: "", keyword: "" });
  const [searchResults, setSearchResults] = useState(null);

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
      if (d.ok) { setRefreshMsg(`Scanned ${d.scanned} accounts, ${d.newItemsCount} new item${d.newItemsCount === 1 ? "" : "s"}.`); loadFeed(); loadWatchlist(); loadTrackRecord(); }
      else setRefreshMsg(d.error || "Refresh failed");
    }).catch((e) => setRefreshMsg(e.message)).finally(() => setRefreshing(false));
  };

  const runSearch = () => {
    const qs = new URLSearchParams();
    if (search.symbol) qs.set("symbol", search.symbol);
    if (search.entity) qs.set("entity", search.entity);
    if (search.keyword) qs.set("keyword", search.keyword);
    fetch(`/api/x-intel/search?${qs.toString()}`).then((r) => r.json()).then((d) => setSearchResults(d.ok ? d.items : []));
  };

  const filteredItems = useMemo(() => categoryFilter === "ALL" ? items : items.filter((it) => it.category === categoryFilter), [items, categoryFilter]);

  // Grouped by real sentiment (bullish/bearish/neutral) instead of just
  // reverse-chronological — bullish and bearish surface first since those
  // are the actionable calls; neutral (no real directional read) is kept
  // but shown last and de-emphasized, not hidden.
  const groupedBySentiment = useMemo(() => {
    const groups = { bullish: [], bearish: [], neutral: [] };
    for (const it of filteredItems) (groups[it.sentiment] || groups.neutral).push(it);
    return groups;
  }, [filteredItems]);

  const trendingTopics = useMemo(() => {
    const counts = {};
    items.forEach((it) => { counts[it.category] = (counts[it.category] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [items]);

  const mostMentioned = useMemo(() => {
    const counts = {};
    items.forEach((it) => (it.marketImpact || []).forEach((m) => {
      counts[m.symbol] = counts[m.symbol] || { count: 0, bullish: 0, bearish: 0 };
      counts[m.symbol].count++;
      counts[m.symbol][m.direction]++;
    }));
    return Object.entries(counts).sort((a, b) => b[1].count - a[1].count).slice(0, 12);
  }, [items]);

  const avgConfidence = useMemo(() => {
    const vals = items.map((it) => it.scores?.confidenceScore).filter((v) => Number.isFinite(v));
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }, [items]);

  const breakingCount = items.filter((it) => it.category === "Breaking News").length;

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
        ℹ️ Sourced from real news coverage of public statements (Claude web search) — no X API, no scraping. Per-post like/reply/repost/view counts, images, and video aren't available through this method.
      </div>

      {refreshMsg && <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent }}>{refreshMsg}</div>}

      {showWatchlist && <WatchlistPanel C={C} MONO={MONO} SANS={SANS} watchlist={watchlist} reload={loadWatchlist} />}

      {/* Stats row: Trending Topics / Most Mentioned / AI Confidence */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        <div style={{ ...cardStyle(C, { background: C.card }), padding: 14 }}>
          <SectionLabel icon="🔥" text="TRENDING TOPICS" color={C.amber} C={C} MONO={MONO} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {trendingTopics.length ? trendingTopics.map(([cat, n]) => (
              <span key={cat} onClick={() => setCategoryFilter(cat)} style={{ cursor: "pointer", fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: `${CATEGORY_COLOR[cat] || C.textDim}15`, color: CATEGORY_COLOR[cat] || C.textDim }}>{cat} {n}</span>
            )) : <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No items yet</span>}
          </div>
        </div>
        <div style={{ ...cardStyle(C, { background: C.card }), padding: 14 }}>
          <SectionLabel icon="📌" text="MOST MENTIONED STOCKS" color={C.accent} C={C} MONO={MONO} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {mostMentioned.length ? mostMentioned.map(([sym, d]) => (
              <span key={sym} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: d.bullish >= d.bearish ? `${C.green}15` : `${C.red}15`, color: d.bullish >= d.bearish ? C.green : C.red }}>{sym} ×{d.count}</span>
            )) : <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No items yet</span>}
          </div>
        </div>
        <div style={{ ...cardStyle(C, { background: C.card }), padding: 14 }}>
          <SectionLabel icon="🎯" text="AI CONFIDENCE" color={C.purple} C={C} MONO={MONO} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 900, color: avgConfidence == null ? C.textDim : avgConfidence >= 70 ? C.green : avgConfidence >= 45 ? C.amber : C.red }}>{avgConfidence ?? "—"}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>avg over {items.length} recent items · {breakingCount} breaking</span>
          </div>
        </div>
      </div>

      {/* Heat Map — mentioned tickers colored by aggregate bullish/bearish */}
      {mostMentioned.length > 0 && (
        <div style={{ ...cardStyle(C, { background: C.card }), padding: 14 }}>
          <SectionLabel icon="🗺️" text="HEAT MAP" color={C.accent} C={C} MONO={MONO} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 6 }}>
            {mostMentioned.map(([sym, d]) => {
              const net = d.bullish - d.bearish;
              const col = net > 0 ? C.green : net < 0 ? C.red : C.textDim;
              const intensity = Math.min(1, (Math.abs(net) + 1) / (d.count + 1));
              return (
                <div key={sym} style={{ textAlign: "center", padding: "10px 4px", borderRadius: 6, background: `${col}${Math.round(intensity * 40).toString(16).padStart(2, "0")}`, border: `1px solid ${col}44` }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: col }}>{sym}</div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{d.count}x</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Track Record — AI Learning: real, code-graded outcomes for every
          real-symbol market-impact call this engine has made. */}
      <TrackRecordSection tr={trackRecord} C={C} MONO={MONO} SANS={SANS} />

      {/* Search */}
      <div style={{ ...cardStyle(C, { background: C.card }), padding: 14 }}>
        <SectionLabel icon="🔍" text="SEARCH" color={C.textSec} C={C} MONO={MONO} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input value={search.symbol} onChange={(e) => setSearch((s) => ({ ...s, symbol: e.target.value.toUpperCase() }))} placeholder="Stock symbol…"
            style={{ fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "6px 10px", width: 130 }} />
          <input value={search.entity} onChange={(e) => setSearch((s) => ({ ...s, entity: e.target.value }))} placeholder="Person / account…"
            style={{ fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "6px 10px", width: 150 }} />
          <input value={search.keyword} onChange={(e) => setSearch((s) => ({ ...s, keyword: e.target.value }))} placeholder="Keyword / topic…"
            style={{ fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "6px 10px", width: 160 }} />
          <button onClick={runSearch} style={buttonChrome(C, { padding: "6px 16px", fontSize: 12, fontWeight: 800, background: C.accent, color: "#fff", border: "none" })}>SEARCH</button>
          {searchResults && <button onClick={() => setSearchResults(null)} style={buttonChrome(C, { padding: "6px 12px", fontSize: 12, background: "transparent", color: C.textDim, border: `1px solid ${C.border}` })}>✕ clear</button>}
        </div>
        {searchResults && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {searchResults.length ? searchResults.map((it) => <ItemCard key={it.id} it={it} C={C} MONO={MONO} SANS={SANS} />) : <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No matching items.</div>}
          </div>
        )}
      </div>

      {/* Live Feed / category-filterable */}
      <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <SectionLabel icon="📡" text="LIVE FEED" color={C.accent} C={C} MONO={MONO} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["ALL", "Breaking News", "Politics", "CEOs", "FederalReserve"].filter((c) => c === "ALL" || items.some((it) => it.category === c)).map((c) => (
              <button key={c} onClick={() => setCategoryFilter(c)} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                border: `1px solid ${categoryFilter === c ? C.accent : C.border}`, background: categoryFilter === c ? `${C.accent}18` : "transparent", color: categoryFilter === c ? C.accent : C.textDim }}>{c}</button>
            ))}
          </div>
        </div>
        {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", padding: 30 }}>Loading…</div>}
        {state === "ok" && filteredItems.length === 0 && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", padding: 30 }}>No items in this category yet.</div>}
        {(state === "empty" || (state === "ok" && items.length === 0)) && (
          <div style={{ textAlign: "center", padding: 30 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.text, fontWeight: 700, marginBottom: 6 }}>No items yet — click Refresh to scan the watchlist</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Each scan searches real news coverage for recent statements from your watched accounts.</div>
          </div>
        )}
        {filteredItems.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {groupedBySentiment.bullish.length > 0 && (
              <div>
                <SectionLabel icon="▲" text={`BULLISH (${groupedBySentiment.bullish.length})`} color={C.green} C={C} MONO={MONO} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {groupedBySentiment.bullish.slice(0, 20).map((it) => <ItemCard key={it.id} it={it} C={C} MONO={MONO} SANS={SANS} />)}
                </div>
              </div>
            )}
            {groupedBySentiment.bearish.length > 0 && (
              <div>
                <SectionLabel icon="▼" text={`BEARISH (${groupedBySentiment.bearish.length})`} color={C.red} C={C} MONO={MONO} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {groupedBySentiment.bearish.slice(0, 20).map((it) => <ItemCard key={it.id} it={it} C={C} MONO={MONO} SANS={SANS} />)}
                </div>
              </div>
            )}
            {groupedBySentiment.neutral.length > 0 && (
              <div style={{ opacity: 0.7 }}>
                <SectionLabel icon="○" text={`NEUTRAL — no clear directional read (${groupedBySentiment.neutral.length})`} color={C.textDim} C={C} MONO={MONO} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {groupedBySentiment.neutral.slice(0, 10).map((it) => <ItemCard key={it.id} it={it} C={C} MONO={MONO} SANS={SANS} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
