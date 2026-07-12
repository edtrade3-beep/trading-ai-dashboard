export default function SocialTab({
  C, MONO, SANS, socialInput, setSocialInput, fetchSocialSentiment, socialLoading, socialTicker, socialData,
}) {
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });
        const SOC_TICKERS = ["TSLA","GME","AMC","BBAI","PLTR","NVDA","AAPL","MSTR","SMCI","RKLB"];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...card({ padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.cyan }}>💬 SOCIAL SENTIMENT</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>StockTwits bull/bear + Reddit WallStreetBets mentions</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
                <input value={socialInput} onChange={e => setSocialInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter" && socialInput.trim()) fetchSocialSentiment(socialInput.trim()); }}
                  placeholder="Ticker…"
                  style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "7px 12px", width: 120, outline: "none" }} />
                <button onClick={() => socialInput.trim() && fetchSocialSentiment(socialInput.trim())} disabled={socialLoading}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: socialLoading ? C.surface : C.cyan, border: "none", color: socialLoading ? C.textDim : "#000", borderRadius: 6, padding: "9px 16px", cursor: socialLoading ? "default" : "pointer" }}>
                  {socialLoading ? "LOADING…" : "FETCH"}
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SOC_TICKERS.map(t => (
                <button key={t} onClick={() => { setSocialInput(t); fetchSocialSentiment(t); }}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: socialTicker === t && socialData ? `${C.cyan}22` : C.surface, border: `1px solid ${socialTicker === t && socialData ? C.cyan : C.border}`, color: socialTicker === t && socialData ? C.cyan : C.textDim, borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>{t}</button>
              ))}
            </div>
            {socialLoading && <div style={{ ...card({ padding: 40, textAlign: "center" }) }}><span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Fetching social data…</span></div>}
            {socialData && !socialLoading && (() => {
              // Backend returns { ok, ticker, stocktwits: {bullPct(0-100), total, messages,...}, redditMentions }
              const stwits  = socialData.stocktwits || {};
              const bullPct = stwits.bullPct ?? 50;   // already 0-100
              const bearPct = 100 - bullPct;
              const total   = stwits.total   ?? 0;
              const msgs    = stwits.messages ?? [];
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Gauge row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                    <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.green}` }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 900, color: C.green }}>{bullPct.toFixed(0)}%</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>🟢 BULLISH</div>
                    </div>
                    <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.red}` }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 900, color: C.red }}>{bearPct.toFixed(0)}%</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>🔴 BEARISH</div>
                    </div>
                    <div style={{ ...card({ padding: 18, textAlign: "center" }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 900, color: C.text }}>{total}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>TOTAL POSTS</div>
                    </div>
                    {socialData.redditMentions != null && (
                      <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.amber}` }) }}>
                        <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 900, color: C.amber }}>{socialData.redditMentions}</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>WSB MENTIONS</div>
                      </div>
                    )}
                  </div>
                  {/* Sentiment bar */}
                  <div style={{ ...card({ padding: "12px 16px" }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 8 }}>SENTIMENT DISTRIBUTION — {total > 0 ? `${total} posts analyzed` : "no sentiment data"}</div>
                    <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden" }}>
                      <div style={{ width: `${bullPct}%`, background: C.green, minWidth: bullPct > 0 ? 4 : 0 }} />
                      <div style={{ flex: 1, background: C.red }} />
                    </div>
                  </div>
                  {/* Recent messages */}
                  {msgs.length > 0 && (
                    <div style={{ ...card({ padding: 16 }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.cyan, marginBottom: 10 }}>RECENT POSTS — {stwits.symbol || socialData.ticker}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {msgs.slice(0, 8).map((m, i) => (
                          <div key={i} style={{ padding: "10px 12px", background: C.surface, borderRadius: 6, borderLeft: `3px solid ${m.sentiment === "Bullish" ? C.green : m.sentiment === "Bearish" ? C.red : C.border}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: m.sentiment === "Bullish" ? C.green : m.sentiment === "Bearish" ? C.red : C.textDim }}>
                                {m.sentiment === "Bullish" ? "🟢" : m.sentiment === "Bearish" ? "🔴" : "⚪"} {m.user}
                              </span>
                              <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{m.likes > 0 ? `❤ ${m.likes}` : ""}</span>
                            </div>
                            <div style={{ fontFamily: SANS, fontSize: 12, color: C.text, lineHeight: 1.5 }}>{m.body?.slice(0, 200)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            {!socialData && !socialLoading && (
              <div style={{ ...card({ padding: 60, textAlign: "center" }) }}>
                <div style={{ fontFamily: MONO, fontSize: 32, marginBottom: 12 }}>💬</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>Enter a ticker to see social sentiment</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 6 }}>StockTwits real-time bull/bear ratio + Reddit WSB mentions</div>
              </div>
            )}
          </div>
        );
}
