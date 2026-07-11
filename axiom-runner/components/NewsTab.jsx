export default function NewsTab({
  C, MONO, newsSymFilter, setNewsSymFilter, newsSentFilter, setNewsSentFilter,
  refreshNews, newsLoading, newsData, scoreNewsSentiment, newsSentLoading,
  watchlistSymbols, newsSentiments, setTerminalSymbol, setActiveTab, setQuickLogModal, setWatchlistSymbols,
}) {
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
                  title="AI-score each headline with Claude"
                  style={{ border: `1px solid ${C.accent}44`, background: `${C.accent}11`, color: newsSentLoading ? C.textDim : C.accent, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: newsSentLoading || !newsData.length ? "default" : "pointer" }}
                >
                  {newsSentLoading ? "🤖 SCORING…" : "🤖 AI SENTIMENT"}
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {newsData
                .filter((n) => {
                  if (newsSymFilter && !String(n.ticker || "").toUpperCase().includes(newsSymFilter)) return false;
                  if (newsSentFilter === "wl") {
                    if (!watchlistSymbols.includes(String(n.ticker || "").toUpperCase())) return false;
                  } else if (newsSentFilter !== "all") {
                    const bullish = ["beat","surge","upgrade","growth","record","bull","rally","wins","strong","expands"];
                    const bearish = ["miss","drop","downgrade","cuts","probe","lawsuit","bear","weak","fall","slump"];
                    const txt = (String(n.title || "") + " " + String(n.summary || "")).toLowerCase();
                    const bs = bullish.filter(w => txt.includes(w)).length;
                    const be = bearish.filter(w => txt.includes(w)).length;
                    const sent = bs > be ? "bullish" : be > bs ? "bearish" : "neutral";
                    if (sent !== newsSentFilter) return false;
                  }
                  return true;
                })
                .map((n, i) => {
                  const bullish = ["beat","surge","upgrade","growth","record","bull","rally","wins","strong","expands"];
                  const bearish = ["miss","drop","downgrade","cuts","probe","lawsuit","bear","weak","fall","slump"];
                  const txt = (String(n.title || "") + " " + String(n.summary || "")).toLowerCase();
                  const bs = bullish.filter(w => txt.includes(w)).length;
                  const be = bearish.filter(w => txt.includes(w)).length;
                  const sent = bs > be ? "bullish" : be > bs ? "bearish" : "neutral";
                  const sentColor = sent === "bullish" ? C.green : sent === "bearish" ? C.red : C.textDim;
                  const onWatchlist = watchlistSymbols.includes(n.ticker);
                  // AI sentiment badge (from Claude scoring)
                  const aiSent = newsSentiments[n.title || ""];
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
                          <span style={{ fontFamily: MONO, fontSize: 12, color: sentColor, fontWeight: 700, textTransform: "uppercase" }}>{sent}</span>
                          {aiLabel && (
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: aiColor, background: `${aiColor}18`, borderRadius: 5, padding: "2px 6px" }}>
                              {aiLabel}{aiSent?.score != null ? ` (${aiSent.score > 0 ? "+" : ""}${aiSent.score})` : ""}
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
          </div>
  );
}
