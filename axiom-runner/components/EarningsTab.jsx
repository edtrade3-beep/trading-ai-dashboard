export default function EarningsTab({
  C, MONO, earningsUpdatedAt, setEarningsRefreshTick, earningsLoading, earningsRows,
  watchlistSymbols, setTerminalSymbol, setActiveTab, setQuickLogModal, setWatchlistSymbols,
}) {
  return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                EARNINGS CALENDAR — WATCHLIST + LEADERS
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                  {earningsUpdatedAt ? `Updated ${earningsUpdatedAt}` : "Not loaded"}
                </span>
                <button
                  onClick={() => setEarningsRefreshTick((n) => n + 1)}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                >
                  {earningsLoading ? "UPDATING..." : "REFRESH"}
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>TODAY / TOMORROW</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C.amber }}>
                  {earningsRows.filter((e) => Number.isFinite(e.dayDiff) && e.dayDiff >= 0 && e.dayDiff <= 1).length}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>NEXT 7D</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C.green }}>
                  {earningsRows.filter((e) => Number.isFinite(e.dayDiff) && e.dayDiff >= 0 && e.dayDiff <= 7).length}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>NEXT 14D</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C.accent }}>
                  {earningsRows.filter((e) => Number.isFinite(e.dayDiff) && e.dayDiff >= 0 && e.dayDiff <= 14).length}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>UNKNOWN DATE</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C.red }}>
                  {earningsRows.filter((e) => !e.earningsDate).length}
                </div>
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "130px 160px 130px 120px 120px 1fr auto", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                <span>SYMBOL</span>
                <span>EARN DATE</span>
                <span>COUNTDOWN</span>
                <span>CHG%</span>
                <span>SCORE</span>
                <span>PRICE</span>
                <span></span>
              </div>
              <div style={{ maxHeight: "58vh", overflow: "auto" }}>
                {earningsRows.map((e) => {
                  const isSoon = Number.isFinite(e.dayDiff) && e.dayDiff >= 0 && e.dayDiff <= 7;
                  const dateLabel = e.earningsDate ? new Date(e.earningsDate).toLocaleDateString() : "TBD";
                  const chg = Number(e.chg || 0);
                  const onWl = watchlistSymbols.includes(e.symbol);
                  const px = Number(e.price || 0);
                  return (
                    <div key={`earn-row-${e.symbol}`} style={{ display: "grid", gridTemplateColumns: "130px 160px 130px 120px 120px 1fr auto", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, background: isSoon ? `${C.amber}0D` : C.card, alignItems: "center" }}>
                      <button onClick={() => { setTerminalSymbol(e.symbol); try { localStorage.setItem("mterminal_load_sym", e.symbol); } catch {} setActiveTab("mterminal"); }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", padding: 0, textAlign: "left" }}>{e.symbol}</button>
                      <span style={{ fontSize: 12, color: C.textSec }}>{dateLabel}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: isSoon ? C.amber : C.textSec }}>{e.timing}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: chg >= 0 ? C.green : C.red, fontWeight: 700 }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700 }}>{Math.round(Number(e.score || 0))}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>${px.toFixed(2)}</span>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          onClick={() => setQuickLogModal({ symbol: e.symbol, price: px, entry: px.toFixed(2), stopLoss: "", target: "", size: "", side: chg >= 0 ? "BUY" : "SELL", timeframe: "1D", style: "Earnings", notes: `Earnings ${dateLabel}${e.timing ? " " + e.timing : ""}`, score: Math.round(Number(e.score || 65)), chg, rvol: 0 })}
                          style={{ border: `1px solid ${C.accent}44`, background: C.surface, color: C.accent, borderRadius: 6, padding: "4px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>LOG</button>
                        <button
                          onClick={() => setWatchlistSymbols(prev => onWl ? prev.filter(s => s !== e.symbol) : Array.from(new Set([...prev, e.symbol])))}
                          style={{ border: `1px solid ${onWl ? C.red : C.green}55`, background: C.surface, color: onWl ? C.red : C.green, borderRadius: 6, padding: "4px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                          {onWl ? "−WL" : "+WL"}
                        </button>
                        <button
                          onClick={async () => {
                            const msg = `📅 *${e.symbol}* Earnings ${e.timing ? e.timing : dateLabel}\nPrice: $${px.toFixed(2)}  CHG: ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%  Score: ${Math.round(Number(e.score || 0))}`;
                            try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                          }}
                          style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 6, padding: "4px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }} title="Push to Telegram">PUSH</button>
                      </div>
                    </div>
                  );
                })}
                {!earningsRows.length && !earningsLoading && (
                  <div style={{ padding: 14, fontSize: 12, color: C.textDim }}>No earnings rows yet. Click REFRESH.</div>
                )}
                {earningsLoading && (
                  <div style={{ padding: 14, fontSize: 12, color: C.textDim }}>Loading earnings calendar...</div>
                )}
              </div>
            </div>
          </div>
  );
}
