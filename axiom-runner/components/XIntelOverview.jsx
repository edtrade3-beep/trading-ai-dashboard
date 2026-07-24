import { useState, useMemo } from "react";
import { cardStyle, buttonChrome } from "./ui-helpers.js";

// OVERVIEW — Modules 1 (Live News) + 3 (Breaking Events, folded in — a
// dedicated Breaking sub-tab would just re-slice the same feed by one
// category filter) + 9 (AI Reasoning, surfaced per-item via scores/
// marketImpact). This is almost entirely the original XIntelTab.jsx's
// content, unchanged, moved here as part of the v2 restructure into
// sub-navigation (Trend/Social/Macro/Regime/Watchlist/Alerts/Heatmap now
// live in their own files).

const CATEGORY_COLOR = {
  "Breaking News": "#c8282a", Politics: "#7c5cff", Tariffs: "#c8282a", Earnings: "#22c55e",
  AI: "#2563eb", Semiconductor: "#2563eb", Crypto: "#f59e0b", Inflation: "#d6a312",
  InterestRates: "#d6a312", FederalReserve: "#7c5cff", Acquisition: "#0d9465",
  Healthcare: "#0d9465", Energy: "#0d9465", Consumer: "#f59e0b", Macro: "#94a3b8", Other: "#94a3b8",
  BankFailure: "#c8282a", CreditDowngrade: "#c8282a", Hack: "#c8282a", ExchangeOutage: "#c8282a", CEOResignation: "#d97706",
};

function SectionLabel({ icon, text, color, C, MONO }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color, letterSpacing: "0.05em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
      <span>{icon}</span><span>{text}</span>
    </div>
  );
}

function ItemCard({ it, C, MONO, SANS, setActiveTab, setTerminalSymbol }) {
  const canOpen = setActiveTab && setTerminalSymbol;
  const openSymbol = (symbol) => { setTerminalSymbol(symbol); try { localStorage.setItem("mterminal_load_sym", symbol); } catch {} setActiveTab("mterminal"); };
  const [open, setOpen] = useState(false);
  const col = CATEGORY_COLOR[it.category] || C.textDim;
  const isRss = it.analysisSource === "rss";
  const isXApi = it.analysisSource === "x-api";
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: "11px 13px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>@{it.entityUsername}</span>
          <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: col, background: `${col}18`, borderRadius: 5, padding: "2px 6px" }}>{it.category.toUpperCase()}</span>
          {isRss && <span title="Real official RSS feed — deterministic category tagging, no market-impact call made" style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, background: `${C.textDim}18`, borderRadius: 5, padding: "2px 6px" }}>🆓 RSS</span>}
          {isXApi && <span title="Real X.com post — deterministic cashtag/category extraction, no AI direction/confidence judgment made" style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, background: `${C.textDim}18`, borderRadius: 5, padding: "2px 6px" }}>🐦 X API</span>}
          {it.sentimentAnalyzed ? (
            <span title="Real AI sentiment classification (Claude Haiku)" style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, borderRadius: 5, padding: "2px 6px",
              color: it.sentiment === "bullish" ? C.green : it.sentiment === "bearish" ? C.red : C.textDim,
              background: it.sentiment === "bullish" ? `${C.green}18` : it.sentiment === "bearish" ? `${C.red}18` : `${C.textDim}18` }}>
              {it.sentiment === "bullish" ? "▲" : it.sentiment === "bearish" ? "▼" : "○"} {it.sentiment.toUpperCase()}{it.confidence != null ? ` ${it.confidence}%` : ""}
            </span>
          ) : (
            (isRss || isXApi) && <span title="No AI sentiment call was made for this item (missing API key, Credit Saver Mode, or a real failure) — shown as neutral, not guessed" style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: C.textDim, opacity: 0.7 }}>· unanalyzed</span>
          )}
          {isXApi && (it.realEngagement?.likes > 0 || it.realEngagement?.retweets > 0) && (
            <span title="Real engagement counts from X" style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: C.textDim }}>
              ♥ {it.realEngagement.likes} · ↻ {it.realEngagement.retweets}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, fontFamily: MONO, fontSize: 10, color: C.textDim }}>
          {it.scores && <span>IMPACT <b style={{ color: it.scores.impactScore > 80 ? C.red : it.scores.impactScore > 50 ? C.amber : C.textDim }}>{it.scores.impactScore}</b></span>}
          {it.publishedAt ? (
            <span title="Real published date from the source feed">{new Date(it.publishedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
          ) : (
            <span>{new Date(it.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          )}
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
            <span key={m.symbol} title={canOpen ? `Open ${m.symbol}` : m.reasoning}
              onClick={canOpen ? (e) => { e.stopPropagation(); openSymbol(m.symbol); } : undefined}
              style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 5, cursor: canOpen ? "pointer" : "default",
              background: m.direction == null ? `${C.textDim}15` : m.direction === "bullish" ? `${C.green}15` : `${C.red}15`,
              color: m.direction == null ? C.textDim : m.direction === "bullish" ? C.green : C.red }}>
              {m.direction == null ? "●" : m.direction === "bullish" ? "▲" : "▼"} {m.symbol}{m.confidence != null ? ` ${m.confidence}%` : ""}
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

function TrackRecordSection({ tr, C, MONO, SANS, setActiveTab, setTerminalSymbol }) {
  const canOpen = setActiveTab && setTerminalSymbol;
  const openSymbol = (symbol) => { setTerminalSymbol(symbol); try { localStorage.setItem("mterminal_load_sym", symbol); } catch {} setActiveTab("mterminal"); };
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
              <div key={p.id} onClick={canOpen ? () => openSymbol(p.symbol) : undefined}
                title={canOpen ? `Open ${p.symbol}` : undefined}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: MONO, fontSize: 11, padding: "6px 10px", background: C.surface, borderRadius: 6, cursor: canOpen ? "pointer" : "default" }}>
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

export default function XIntelOverview({ C, MONO, SANS, items, state, trackRecord, setActiveTab, setTerminalSymbol }) {
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [sentimentFilter, setSentimentFilter] = useState("ALL");
  const [search, setSearch] = useState({ symbol: "", entity: "", keyword: "" });
  const [searchResults, setSearchResults] = useState(null);

  const runSearch = () => {
    const qs = new URLSearchParams();
    if (search.symbol) qs.set("symbol", search.symbol);
    if (search.entity) qs.set("entity", search.entity);
    if (search.keyword) qs.set("keyword", search.keyword);
    fetch(`/api/x-intel/search?${qs.toString()}`).then((r) => r.json()).then((d) => setSearchResults(d.ok ? d.items : []));
  };

  const filteredItems = useMemo(() => {
    let out = categoryFilter === "ALL" ? items : items.filter((it) => it.category === categoryFilter);
    if (sentimentFilter !== "ALL") out = out.filter((it) => it.sentiment === sentimentFilter);
    return out;
  }, [items, categoryFilter, sentimentFilter]);

  const sentimentCounts = useMemo(() => {
    const base = categoryFilter === "ALL" ? items : items.filter((it) => it.category === categoryFilter);
    return { bullish: base.filter((it) => it.sentiment === "bullish").length, bearish: base.filter((it) => it.sentiment === "bearish").length, neutral: base.filter((it) => it.sentiment === "neutral").length };
  }, [items, categoryFilter]);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
              <span key={sym} onClick={setActiveTab && setTerminalSymbol ? () => { setTerminalSymbol(sym); try { localStorage.setItem("mterminal_load_sym", sym); } catch {} setActiveTab("mterminal"); } : undefined}
                title={setActiveTab ? `Open ${sym}` : undefined}
                style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6, cursor: setActiveTab ? "pointer" : "default",
                  background: d.bullish >= d.bearish ? `${C.green}15` : `${C.red}15`, color: d.bullish >= d.bearish ? C.green : C.red }}>{sym} ×{d.count}</span>
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

      <TrackRecordSection tr={trackRecord} C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} />

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
            {searchResults.length ? searchResults.map((it) => <ItemCard key={it.id} it={it} C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} />) : <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No matching items.</div>}
          </div>
        )}
      </div>

      <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <SectionLabel icon="📡" text="LIVE FEED" color={C.accent} C={C} MONO={MONO} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["ALL", "Breaking News", "Politics", "CEOs", "FederalReserve"].filter((c) => c === "ALL" || items.some((it) => it.category === c)).map((c) => (
              <button key={c} onClick={() => setCategoryFilter(c)} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                border: `1px solid ${categoryFilter === c ? C.accent : C.border}`, background: categoryFilter === c ? `${C.accent}18` : "transparent", color: categoryFilter === c ? C.accent : C.textDim }}>{c}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {[
            { key: "ALL", label: "ALL", col: C.textSec },
            { key: "bullish", label: `▲ BULLISH (${sentimentCounts.bullish})`, col: C.green },
            { key: "bearish", label: `▼ BEARISH (${sentimentCounts.bearish})`, col: C.red },
            { key: "neutral", label: `○ NEUTRAL (${sentimentCounts.neutral})`, col: C.textDim },
          ].map(({ key, label, col }) => (
            <button key={key} onClick={() => setSentimentFilter(key)} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              border: `1px solid ${sentimentFilter === key ? col : C.border}`, background: sentimentFilter === key ? `${col}18` : "transparent", color: sentimentFilter === key ? col : C.textDim }}>{label}</button>
          ))}
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
                  {groupedBySentiment.bullish.slice(0, 20).map((it) => <ItemCard key={it.id} it={it} C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} />)}
                </div>
              </div>
            )}
            {groupedBySentiment.bearish.length > 0 && (
              <div>
                <SectionLabel icon="▼" text={`BEARISH (${groupedBySentiment.bearish.length})`} color={C.red} C={C} MONO={MONO} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {groupedBySentiment.bearish.slice(0, 20).map((it) => <ItemCard key={it.id} it={it} C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} />)}
                </div>
              </div>
            )}
            {groupedBySentiment.neutral.length > 0 && (
              <div style={{ opacity: 0.7 }}>
                <SectionLabel icon="○" text={`NEUTRAL — no clear directional read (${groupedBySentiment.neutral.length})`} color={C.textDim} C={C} MONO={MONO} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {groupedBySentiment.neutral.slice(0, 10).map((it) => <ItemCard key={it.id} it={it} C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
