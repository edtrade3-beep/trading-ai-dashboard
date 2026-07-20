// AI TAKE — a real Claude call over the real upcoming earnings calendar
// (real report dates, implied expected move, trailing vs. forward EPS —
// never a number the model typed): what to do, what to avoid, and why.
// Same "real data in, judgment out" pattern as CotTab's AiTakeSection.
// Sourced from the richer /api/market/earnings-calendar dataset (real
// expected-move/EPS figures) rather than this tab's own simpler on-screen
// rows, same as insider-ai-take.js using the fuller underlying purchase
// data than what the visible table renders.
function AiTakeSection({ C, MONO, SANS }) {
  const [take, setTake] = React.useState(null);
  const [state, setState] = React.useState("loading"); // loading | ok | empty | error
  const [generating, setGenerating] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/market/earnings-calendar/ai-take").then(r => r.json()).then(d => {
      if (d && d.ok && d.take) { setTake(d.take); setState("ok"); }
      else setState("empty");
    }).catch(() => setState("error"));
  }, []);

  const generate = () => {
    setGenerating(true);
    fetch("/api/market/earnings-calendar/ai-take/refresh", { method: "POST" }).then(r => r.json()).then(d => {
      if (d && d.ok && d.take) { setTake(d.take); setState("ok"); }
      else setState("error");
    }).catch(() => setState("error")).finally(() => setGenerating(false));
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.accent}44`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: "0.08em" }}>
          🤖 AI TAKE — WHAT TO DO
        </div>
        <button onClick={generate} disabled={generating}
          style={{ background: generating ? C.surface : `${C.accent}1a`, border: `1px solid ${C.accent}55`, color: generating ? C.textDim : C.accent,
            fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 5, cursor: generating ? "not-allowed" : "pointer" }}>
          {generating ? "⏳ THINKING…" : take ? "↻ NEW TAKE" : "GENERATE TAKE"}
        </button>
      </div>

      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {state === "error" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Couldn't generate a take — check ANTHROPIC_API_KEY is set, and that there's earnings coming up in the next 14 days.</div>}
      {state === "empty" && !generating && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Click "GENERATE TAKE" for an honest AI read on what's coming up in the next 14 days — what to do, what to avoid, and why.</div>
      )}

      {take && state === "ok" && (
        <>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 14 }}>{take.overallTake}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.green, letterSpacing: "0.06em", marginBottom: 8 }}>✅ DO</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(take.doThis || []).map((d, i) => (
                  <div key={i} style={{ background: `${C.green}0c`, border: `1px solid ${C.green}33`, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{d.action}</div>
                    <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginTop: 3, lineHeight: 1.4 }}>{d.why}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.red, letterSpacing: "0.06em", marginBottom: 8 }}>🚫 AVOID</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(take.avoidThis || []).map((d, i) => (
                  <div key={i} style={{ background: `${C.red}0c`, border: `1px solid ${C.red}33`, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{d.action}</div>
                    <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginTop: 3, lineHeight: 1.4 }}>{d.why}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {take.watchFor && (
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, lineHeight: 1.5, fontStyle: "italic", borderTop: `1px solid ${C.border}55`, paddingTop: 8 }}>
              👁 Watch for: {take.watchFor}
            </div>
          )}
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 8 }}>
            AI-synthesized from the real earnings calendar (expected move, EPS estimates) — not financial advice, cross-check before acting.
          </div>
        </>
      )}
    </div>
  );
}

export default function EarningsTab({
  C, MONO, SANS, earningsUpdatedAt, setEarningsRefreshTick, earningsLoading, earningsRows,
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

            <AiTakeSection C={C} MONO={MONO} SANS={SANS} />

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
