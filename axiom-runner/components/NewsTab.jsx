import { useState, useEffect } from "react";

// News Engine, options platform redesign Phase 12. Two additive features
// on top of the existing flat headline list (untouched): a real
// page-level per-symbol grouped view (real aggregateSentimentForSymbol,
// batched via POST /api/agent/sentiment-by-symbols — the same real
// keyword-scoring function /sentiment-by-symbol already used, no new
// formula), and a real "market-moving only" filter (real |score|>=3 on
// the existing -5..5 keyword-sentiment scale, POST /api/agent/sentiment's
// new `marketMoving` field — not a fabricated "impact" model).
export default function NewsTab({
  C, MONO, newsSymFilter, setNewsSymFilter, newsSentFilter, setNewsSentFilter,
  refreshNews, newsLoading, newsData, scoreNewsSentiment, newsSentLoading,
  watchlistSymbols, newsSentiments, setTerminalSymbol, setActiveTab, setQuickLogModal, setWatchlistSymbols,
}) {
  const [viewMode, setViewMode] = useState("headlines"); // headlines | bysymbol | intel
  const [symbolSentiment, setSymbolSentiment] = useState({}); // symbol -> {sentiment, score, oneLiner, bulls, bears, total}
  const [symbolLoading, setSymbolLoading] = useState(false);
  const [marketMovingOnly, setMarketMovingOnly] = useState(false);
  const [marketMovingMap, setMarketMovingMap] = useState({}); // headline title -> bool
  const [marketMovingLoading, setMarketMovingLoading] = useState(false);

  // ── News Intelligence layer (2026-08-19, explicit user spec) — additive
  // third view mode, self-contained (own fetch/state, does not touch the
  // parent's newsData/refreshNews plumbing the two existing views above
  // use). Reads the real, background-ingested, catalyst/impact/sentiment/
  // confirmation-scored feed from GET /api/news/feed and GET /api/news/
  // ticker/:symbol (src/news/*, src/routes/news-intel.js) — a genuinely
  // different real data source from the raw /api/market/news headlines
  // the existing views show, so it's a new view rather than a retrofit of
  // those two.
  const [newsStatus, setNewsStatus] = useState(null); // {status, reason?}
  const [intelRows, setIntelRows] = useState([]);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelCategory, setIntelCategory] = useState("ALL");
  const [intelSentiment, setIntelSentiment] = useState("ALL");
  const [intelFreshness, setIntelFreshness] = useState(null); // minutes, null = no filter
  const [intelMinImpact, setIntelMinImpact] = useState(0);
  const [tickerLookup, setTickerLookup] = useState("");
  const [tickerIntel, setTickerIntel] = useState(null);
  const [tickerIntelLoading, setTickerIntelLoading] = useState(false);

  useEffect(() => {
    if (viewMode !== "intel") return;
    let alive = true;
    fetch("/api/news/status").then(r => r.json()).then(d => { if (alive) setNewsStatus(d); }).catch(() => {});
    return () => { alive = false; };
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "intel") return;
    let alive = true;
    setIntelLoading(true);
    const params = new URLSearchParams();
    if (intelCategory !== "ALL") params.set("category", intelCategory);
    if (intelSentiment !== "ALL") params.set("sentiment", intelSentiment);
    if (intelFreshness != null) params.set("sinceMinutes", String(intelFreshness));
    if (intelMinImpact > 0) params.set("minImpact", String(intelMinImpact));
    params.set("limit", "60");
    fetch(`/api/news/feed?${params.toString()}`).then(r => r.json())
      .then(d => { if (alive && d.ok) setIntelRows(d.rows || []); })
      .catch(() => {}).finally(() => { if (alive) setIntelLoading(false); });
    return () => { alive = false; };
  }, [viewMode, intelCategory, intelSentiment, intelFreshness, intelMinImpact]);

  const runTickerLookup = () => {
    const sym = tickerLookup.trim().toUpperCase();
    if (!sym) return;
    setTickerIntelLoading(true);
    fetch(`/api/news/ticker/${encodeURIComponent(sym)}`).then(r => r.json())
      .then(d => setTickerIntel(d))
      .catch(() => setTickerIntel(null))
      .finally(() => setTickerIntelLoading(false));
  };

  const IMPACT_COLOR = (score) => score >= 90 ? "#0d9465" : score >= 80 ? "#22c55e" : score >= 70 ? "#d6a312" : score >= 60 ? "#f59e0b" : C.textDim;
  const IMPACT_LABEL = (score) => score >= 90 ? "EXTREME" : score >= 80 ? "HIGH" : score >= 70 ? "SIGNIFICANT" : score >= 60 ? "MODERATE" : "LOW";
  const SENTIMENT_COLOR = (s) => (s === "STRONGLY_BULLISH" || s === "BULLISH") ? C.green : (s === "STRONGLY_BEARISH" || s === "BEARISH") ? C.red : C.textDim;
  const VERDICT_META = {
    STRONG_BULLISH_CONFIRMATION: { icon: "🟢", label: "STRONG BULLISH CONFIRMATION", color: "#0d9465" },
    BULLISH_CATALYST: { icon: "🟢", label: "BULLISH CATALYST", color: "#22c55e" },
    WATCH: { icon: "🟡", label: "WATCH", color: "#d6a312" },
    WAIT_FOR_CONFIRMATION: { icon: "🟡", label: "WAIT FOR CONFIRMATION", color: "#d6a312" },
    CONFLICTING_SIGNAL: { icon: "🟠", label: "CONFLICTING SIGNAL", color: "#f59e0b" },
    BEARISH_CATALYST: { icon: "🔴", label: "BEARISH CATALYST", color: "#c8282a" },
    HIGH_RISK: { icon: "🔴", label: "HIGH RISK", color: "#c8282a" },
  };
  const CATEGORY_CHIPS = ["ALL", "EARNINGS", "GUIDANCE", "ANALYST_UPGRADE", "ANALYST_DOWNGRADE", "M&A", "FDA", "AI", "CONTRACT", "MACRO", "OTHER"];
  const FRESHNESS_CHIPS = [["1m", 1], ["5m", 5], ["15m", 15], ["1h", 60], ["Today", 24 * 60]];
  const chipBtn = (active) => ({
    fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 6, cursor: "pointer",
    border: `1px solid ${active ? C.accent : C.border}`, background: active ? `${C.accent}18` : C.card, color: active ? C.accent : C.textSec,
  });

  // Real per-symbol grouped sentiment — fetched once per distinct symbol
  // set whenever the "BY SYMBOL" view is opened or newsData changes while
  // that view is active.
  useEffect(() => {
    if (viewMode !== "bysymbol" || !newsData.length) return;
    const groups = {};
    newsData.forEach(n => {
      const sym = String(n.ticker || "").toUpperCase();
      if (!sym) return;
      (groups[sym] = groups[sym] || []).push(n.title || n.headline || "");
    });
    if (!Object.keys(groups).length) return;
    setSymbolLoading(true);
    fetch("/api/agent/sentiment-by-symbols", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups }),
    }).then(r => r.json()).then(d => { if (d.ok) setSymbolSentiment(d.results || {}); })
      .catch(() => {}).finally(() => setSymbolLoading(false));
  }, [viewMode, newsData]);

  // Real market-moving flag per headline — fetched whenever the toggle is
  // switched on (or newsData changes while it's on).
  useEffect(() => {
    if (!marketMovingOnly || !newsData.length) return;
    const headlines = newsData.map(n => n.title || n.headline || "");
    setMarketMovingLoading(true);
    fetch("/api/agent/sentiment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headlines }),
    }).then(r => r.json()).then(d => {
      if (!d.ok) return;
      const map = {};
      (d.results || []).forEach(r => { if (headlines[r.i - 1]) map[headlines[r.i - 1]] = !!r.marketMoving; });
      setMarketMovingMap(map);
    }).catch(() => {}).finally(() => setMarketMovingLoading(false));
  }, [marketMovingOnly, newsData]);

  // Real audit finding (2026-08-04, duplicate-mount sweep): this crude
  // 10-word bull/bear heuristic used to be copy-pasted separately inside
  // the filter callback AND the map callback below (two copies that could
  // silently diverge) — now one shared function. It's also now ONLY the
  // pre-scoring fallback: once the real deterministic engine
  // (aggregateSentimentForSymbol/scoreSentiment, via the "🤖 AI SENTIMENT"
  // button) has scored a headline, both the filter and the display badge
  // prefer that real score instead — previously a scored headline could
  // show two disagreeing sentiment badges (this crude heuristic's uppercase
  // label AND the real AI badge) with no indication one was a rough guess.
  const crudeSentiment = (n) => {
    const bullish = ["beat","surge","upgrade","growth","record","bull","rally","wins","strong","expands"];
    const bearish = ["miss","drop","downgrade","cuts","probe","lawsuit","bear","weak","fall","slump"];
    const txt = (String(n.title || "") + " " + String(n.summary || "")).toLowerCase();
    const bs = bullish.filter(w => txt.includes(w)).length;
    const be = bearish.filter(w => txt.includes(w)).length;
    return bs > be ? "bullish" : be > bs ? "bearish" : "neutral";
  };
  const aiSentFor = (n) => newsSentiments[n.title || n.headline || ""];
  const sentimentFor = (n) => {
    const ai = aiSentFor(n);
    return ai ? (ai.s === "bull" ? "bullish" : ai.s === "bear" ? "bearish" : "neutral") : crudeSentiment(n);
  };

  // Analyst upgrade/downgrade "big news" flag (2026-08-04, explicit user
  // request) — same real upWords/downWords list axiom-live.jsx's
  // analyzeNewsIntelligence already uses for the Dashboard's BUY/UPGRADE
  // and SELL/DOWNGRADE panels, reused verbatim here rather than inventing
  // a second keyword set that could quietly diverge from it. Distinct from
  // crudeSentiment/aiSentFor above — those grade general bullish/bearish
  // tone, this flags the specific "an analyst changed their rating" event,
  // which moves stocks regardless of the rest of the headline's tone.
  const upWords = ["upgrade", "upgrades", "outperform", "overweight", "buy rating", "raises target", "initiates buy"];
  const downWords = ["downgrade", "downgrades", "underperform", "underweight", "sell rating", "cuts target", "reduces target"];
  const ratingChangeFor = (n) => {
    const txt = (String(n.title || "") + " " + String(n.summary || "")).toLowerCase();
    if (upWords.some(w => txt.includes(w))) return "upgrade";
    if (downWords.some(w => txt.includes(w))) return "downgrade";
    return null;
  };

  const symbolGroups = {};
  newsData.forEach(n => {
    const sym = String(n.ticker || "").toUpperCase();
    if (!sym) return;
    (symbolGroups[sym] = symbolGroups[sym] || []).push(n);
  });
  const sortedSymbols = Object.keys(symbolGroups).sort((a, b) => symbolGroups[b].length - symbolGroups[a].length);

  return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                NEWS DESK — LIVE HEADLINES
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={newsSymFilter}
                  onChange={(e) => setNewsSymFilter(e.target.value.toUpperCase())}
                  placeholder="Filter symbol…"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "5px 8px", width: 120, borderRadius: 6 }}
                />
                <select
                  value={newsSentFilter}
                  onChange={(e) => setNewsSentFilter(e.target.value)}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "5px 8px", borderRadius: 6 }}
                >
                  <option value="all">All Sentiment</option>
                  <option value="bullish">Bullish</option>
                  <option value="bearish">Bearish</option>
                  <option value="neutral">Neutral</option>
                  <option value="wl">WL Only</option>
                  <option value="upgrade">📈 Upgrades</option>
                  <option value="downgrade">📉 Downgrades</option>
                </select>
                <button
                  onClick={refreshNews}
                  disabled={newsLoading}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                >
                  {newsLoading ? "LOADING..." : `REFRESH (${newsData.length})`}
                </button>
                <button
                  onClick={scoreNewsSentiment}
                  disabled={newsSentLoading || !newsData.length}
                  title="Score each headline's sentiment (deterministic keyword scoring, not a Claude call)"
                  style={{ border: `1px solid ${C.accent}44`, background: `${C.accent}11`, color: newsSentLoading ? C.textDim : C.accent, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: newsSentLoading || !newsData.length ? "default" : "pointer" }}
                >
                  {newsSentLoading ? "🤖 SCORING…" : "🤖 AI SENTIMENT"}
                </button>
                <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
                  <button onClick={() => setViewMode("headlines")}
                    style={{ border: "none", background: viewMode === "headlines" ? C.accent : C.surface, color: viewMode === "headlines" ? "#fff" : C.text, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 10px", cursor: "pointer" }}>
                    HEADLINES
                  </button>
                  <button onClick={() => setViewMode("bysymbol")}
                    style={{ border: "none", background: viewMode === "bysymbol" ? C.accent : C.surface, color: viewMode === "bysymbol" ? "#fff" : C.text, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 10px", cursor: "pointer" }}>
                    BY SYMBOL
                  </button>
                  <button onClick={() => setViewMode("intel")}
                    title="Catalyst classification, impact score, and price/volume-confirmed verdicts — a real background-scored feed, distinct from the raw headlines above"
                    style={{ border: "none", background: viewMode === "intel" ? C.accent : C.surface, color: viewMode === "intel" ? "#fff" : C.text, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 10px", cursor: "pointer" }}>
                    🧠 INTEL
                  </button>
                </div>
                <label title="Only show headlines whose real keyword-sentiment magnitude is |score| ≥ 3 on the -5..5 scale" style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 12, color: C.textDim, cursor: "pointer" }}>
                  <input type="checkbox" checked={marketMovingOnly} onChange={e => setMarketMovingOnly(e.target.checked)} />
                  {marketMovingLoading ? "SCORING…" : "MARKET-MOVING ONLY"}
                </label>
              </div>
            </div>
            {viewMode === "bysymbol" && (
              <div style={{ display: "grid", gap: 10 }}>
                {symbolLoading && <div style={{ color: C.textDim, fontSize: 13, fontFamily: MONO }}>Scoring real per-symbol sentiment…</div>}
                {!symbolLoading && sortedSymbols.length === 0 && <div style={{ color: C.textDim, fontSize: 13 }}>No headlines loaded yet.</div>}
                {!symbolLoading && sortedSymbols
                  .filter(sym => !newsSymFilter || sym.includes(newsSymFilter))
                  .map(sym => {
                    const s = symbolSentiment[sym];
                    const sentColor = s?.sentiment === "positive" ? C.green : s?.sentiment === "negative" ? C.red : C.textDim;
                    return (
                      <div key={sym} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${sentColor}`, borderRadius: 6, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button onClick={() => { setTerminalSymbol(sym); try { localStorage.setItem("mterminal_load_sym", sym); } catch {} setActiveTab("mterminal"); }}
                              style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 13, cursor: "pointer", padding: 0, fontWeight: 700 }}>
                              {sym}
                            </button>
                            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{symbolGroups[sym].length} headline{symbolGroups[sym].length === 1 ? "" : "s"}</span>
                            {s && (
                              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: sentColor, background: `${sentColor}18`, borderRadius: 5, padding: "2px 6px", textTransform: "uppercase" }}>
                                {s.sentiment} ({s.score > 0 ? "+" : ""}{s.score})
                              </span>
                            )}
                          </div>
                        </div>
                        {s && <div style={{ fontSize: 13, color: C.text, marginBottom: 6 }}>{s.oneLiner}</div>}
                        <div style={{ display: "grid", gap: 4 }}>
                          {symbolGroups[sym].slice(0, 3).map((n, i) => (
                            <a key={i} href={n.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.textSec, textDecoration: "none" }}>
                              · {n.title}
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
            {viewMode === "intel" && (
              <div>
                {newsStatus && newsStatus.status !== "OK" && (
                  <div style={{ marginBottom: 10, border: `1px solid ${newsStatus.status === "STALE" ? "#d6a312" : "#c8282a"}55`, borderRadius: 8, padding: "8px 12px", background: `${newsStatus.status === "STALE" ? "#d6a312" : "#c8282a"}0f`, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: newsStatus.status === "STALE" ? "#d6a312" : "#c8282a" }}>
                    NEWS STATUS: {newsStatus.status}{newsStatus.reason ? ` — ${newsStatus.reason}` : ""}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                  <input value={tickerLookup} onChange={(e) => setTickerLookup(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && runTickerLookup()}
                    placeholder="Ticker Intelligence — e.g. NVDA"
                    style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "5px 8px", width: 180, borderRadius: 6 }} />
                  <button onClick={runTickerLookup} disabled={tickerIntelLoading}
                    style={chipBtn(false)}>{tickerIntelLoading ? "LOOKING UP…" : "LOOK UP"}</button>
                  {tickerIntel && <button onClick={() => { setTickerIntel(null); setTickerLookup(""); }} style={chipBtn(false)}>CLEAR</button>}
                </div>

                {tickerIntel && tickerIntel.status === "DEGRADED" && (
                  <div style={{ marginBottom: 14, fontFamily: MONO, fontSize: 12, color: C.textDim }}>News store unavailable right now.</div>
                )}
                {tickerIntel && tickerIntel.ok && tickerIntel.status !== "DEGRADED" && (
                  <div style={{ marginBottom: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.accent, marginBottom: 4 }}>{tickerIntel.ticker} NEWS INTELLIGENCE</div>
                    {tickerIntel.articleCount === 0 ? (
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>No real recent articles tracked for this symbol yet.</div>
                    ) : (
                      <>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textSec, marginBottom: 4 }}>{tickerIntel.articleCount} relevant article{tickerIntel.articleCount === 1 ? "" : "s"}</div>
                        <div style={{ display: "flex", gap: 14, fontFamily: MONO, fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: C.green }}>Bullish: {tickerIntel.bullish}</span>
                          <span style={{ color: C.red }}>Bearish: {tickerIntel.bearish}</span>
                          <span style={{ color: C.textDim }}>Avg Impact: {tickerIntel.avgImpact}</span>
                        </div>
                        {tickerIntel.latestHeadline && <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 4 }}>Latest catalyst: {tickerIntel.latestCatalyst || "—"} — "{tickerIntel.latestHeadline}"</div>}
                        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: SENTIMENT_COLOR(tickerIntel.trend === "BULLISH" ? "BULLISH" : tickerIntel.trend === "BEARISH" ? "BEARISH" : "NEUTRAL") }}>
                          NEWS TREND: {tickerIntel.trend === "BULLISH" ? "🟢" : tickerIntel.trend === "BEARISH" ? "🔴" : "⚪"} {tickerIntel.trend}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginRight: 4 }}>CATEGORY</span>
                    {CATEGORY_CHIPS.map((c) => (
                      <button key={c} onClick={() => setIntelCategory(c)} style={chipBtn(intelCategory === c)}>{c}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginRight: 4 }}>SENTIMENT</span>
                    {["ALL", "STRONGLY_BULLISH", "BULLISH", "NEUTRAL", "BEARISH", "STRONGLY_BEARISH"].map((s) => (
                      <button key={s} onClick={() => setIntelSentiment(s)} style={chipBtn(intelSentiment === s)}>{s}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginRight: 4 }}>FRESHNESS</span>
                    <button onClick={() => setIntelFreshness(null)} style={chipBtn(intelFreshness == null)}>ANY</button>
                    {FRESHNESS_CHIPS.map(([label, mins]) => (
                      <button key={label} onClick={() => setIntelFreshness(mins)} style={chipBtn(intelFreshness === mins)}>{label}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginRight: 4 }}>HIGH IMPACT</span>
                    <button onClick={() => setIntelMinImpact(intelMinImpact > 0 ? 0 : 80)} style={chipBtn(intelMinImpact > 0)}>≥80 ONLY</button>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {intelLoading && <div style={{ color: C.textDim, fontSize: 13, fontFamily: MONO }}>Loading real scored news feed…</div>}
                  {!intelLoading && !intelRows.length && <div style={{ color: C.textDim, fontSize: 13, fontFamily: MONO }}>No real news items matching these filters yet.</div>}
                  {!intelLoading && intelRows.map((r) => {
                    const verdict = VERDICT_META[r.verdict] || null;
                    const impactColor = IMPACT_COLOR(r.impact_score || 0);
                    let confirmation = null;
                    try { confirmation = r.confirmation ? (typeof r.confirmation === "string" ? JSON.parse(r.confirmation) : r.confirmation) : null; } catch { confirmation = null; }
                    return (
                      <div key={r.id || r.dedupe_key} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${impactColor}`, borderRadius: 6, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.accent }}>{r.ticker}</span>
                            {(r.impact_score || 0) >= 80 && (
                              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: impactColor }}>🔥 {IMPACT_LABEL(r.impact_score)} IMPACT</span>
                            )}
                          </div>
                          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: "#fff", background: impactColor, borderRadius: 5, padding: "2px 7px" }}>{r.impact_score ?? "—"}</span>
                        </div>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 6 }}>
                          {r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{r.headline}</a> : r.headline}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 6 }}>
                          <span style={{ color: SENTIMENT_COLOR(r.sentiment), fontWeight: 700 }}>{r.sentiment || "—"}</span>
                          <span>Catalyst: {r.category || "OTHER"}</span>
                          <span>Freshness: {r.freshness_score ?? "—"}</span>
                          <span>Price Confirmation: {confirmation && confirmation.available ? (confirmation.confirmed === true ? "YES" : confirmation.confirmed === false ? "NO" : "N/A") : "—"}</span>
                          <span>{r.source}</span>
                        </div>
                        {verdict && (
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: verdict.color, marginBottom: r.url ? 4 : 0 }}>
                            VERDICT: {verdict.icon} {verdict.label}
                          </div>
                        )}
                        {r.url && (
                          <a href={r.url} target="_blank" rel="noreferrer" style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>[View Source]</a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {viewMode === "headlines" && (
            <div style={{ display: "grid", gap: 10 }}>
              {newsData
                .filter((n) => {
                  if (newsSymFilter && !String(n.ticker || "").toUpperCase().includes(newsSymFilter)) return false;
                  if (marketMovingOnly && !marketMovingMap[n.title || n.headline || ""]) return false;
                  if (newsSentFilter === "wl") {
                    if (!watchlistSymbols.includes(String(n.ticker || "").toUpperCase())) return false;
                  } else if (newsSentFilter === "upgrade" || newsSentFilter === "downgrade") {
                    if (ratingChangeFor(n) !== newsSentFilter) return false;
                  } else if (newsSentFilter !== "all") {
                    if (sentimentFor(n) !== newsSentFilter) return false;
                  }
                  return true;
                })
                .map((n, i) => {
                  const aiSent = aiSentFor(n);
                  const sent = sentimentFor(n);
                  const sentColor = sent === "bullish" ? C.green : sent === "bearish" ? C.red : C.textDim;
                  const onWatchlist = watchlistSymbols.includes(n.ticker);
                  const ratingChange = ratingChangeFor(n);
                  // AI sentiment badge (from Claude scoring)
                  const aiColor = aiSent?.s === "bull" ? C.green : aiSent?.s === "bear" ? C.red : C.textDim;
                  const aiLabel = aiSent?.s === "bull" ? "🟢 AI BULL" : aiSent?.s === "bear" ? "🔴 AI BEAR" : aiSent ? "⚪ AI NEUTRAL" : null;
                  const sentBorderColor = sent === "bullish" ? C.green : sent === "bearish" ? C.red : C.border;
                  return (
                    <div key={`${n.ticker}-${i}`} style={{ background: C.card, border: `1px solid ${aiSent ? (aiSent.s === "bull" ? `${C.green}44` : aiSent.s === "bear" ? `${C.red}44` : C.border) : C.border}`, borderLeft: `4px solid ${sentBorderColor}`, borderRadius: 6, padding: 12, position: "relative" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button onClick={() => { setTerminalSymbol(n.ticker); try { localStorage.setItem("mterminal_load_sym", n.ticker); } catch {} setActiveTab("mterminal"); }}
                            style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, cursor: "pointer", padding: 0, fontWeight: 700 }}>
                            {n.ticker}
                          </button>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>· {n.publisher}</span>
                          {/* Crude keyword-heuristic badge — pre-scoring
                              fallback only. Once the real AI sentiment
                              (aiLabel below) has scored this headline, show
                              only that — previously both rendered together
                              and could disagree with no explanation. */}
                          {!aiSent && <span style={{ fontFamily: MONO, fontSize: 12, color: sentColor, fontWeight: 700, textTransform: "uppercase" }}>{sent}</span>}
                          {aiLabel && (
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: aiColor, background: `${aiColor}18`, borderRadius: 5, padding: "2px 6px" }}>
                              {aiLabel}{aiSent?.score != null ? ` (${aiSent.score > 0 ? "+" : ""}${aiSent.score})` : ""}
                            </span>
                          )}
                          {/* Analyst rating-change "big news" flag
                              (2026-08-04) — separate axis from bullish/
                              bearish tone above: this specifically flags a
                              real analyst upgrade/downgrade, which moves
                              stocks on its own regardless of the rest of
                              the headline's wording. Purple so it never
                              gets read as a 3rd sentiment color next to
                              green/red. */}
                          {ratingChange && (
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#8b5cf6", background: "#8b5cf618", borderRadius: 5, padding: "2px 6px" }}>
                              {ratingChange === "upgrade" ? "🎯 UPGRADE" : "🎯 DOWNGRADE"}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                            {n.publishedAt ? new Date(n.publishedAt).toLocaleString() : ""}
                          </span>
                          {n.ticker && (
                            <React.Fragment>
                              <button
                                onClick={() => setQuickLogModal({ symbol: n.ticker, price: 0, entry: "", stopLoss: "", target: "", size: "", side: sent === "bearish" ? "SELL" : "BUY", timeframe: "1D", style: "News", notes: n.title || "", score: sent === "bullish" ? 72 : 55, chg: 0, rvol: 0 })}
                                style={{ border: `1px solid ${C.accent}44`, background: C.surface, color: C.accent, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                                LOG
                              </button>
                              <button
                                onClick={() => setWatchlistSymbols(prev => onWatchlist ? prev.filter(s => s !== n.ticker) : Array.from(new Set([...prev, n.ticker])))}
                                title={onWatchlist ? `Remove ${n.ticker} from watchlist` : `Add ${n.ticker} to watchlist`}
                                style={{ border: `1px solid ${onWatchlist ? C.red : C.green}55`, background: onWatchlist ? C.redBg : C.greenBg, color: onWatchlist ? C.red : C.green, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                                {onWatchlist ? "−WL" : "+WL"}
                              </button>
                              <button
                                onClick={async () => {
                                  const icon = sent === "bullish" ? "🟢" : sent === "bearish" ? "🔴" : "⚪";
                                  const msg = `${icon} *${n.ticker}* — ${sent.toUpperCase()} News\n_${(n.title || "").slice(0, 120)}_\n${n.publisher || ""}`;
                                  try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                                }}
                                title="Push to Telegram"
                                style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                                PUSH
                              </button>
                            </React.Fragment>
                          )}
                        </div>
                      </div>
                      <a href={n.link} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 4 }}>{n.title}</div>
                        {n.summary ? <div style={{ fontSize: 12, color: C.textSec }}>{n.summary}</div> : null}
                      </a>
                    </div>
                  );
                })}
              {!newsData.length && <div style={{ color: C.textDim, fontSize: 13 }}>No headlines loaded yet.</div>}
            </div>
            )}
          </div>
  );
}
