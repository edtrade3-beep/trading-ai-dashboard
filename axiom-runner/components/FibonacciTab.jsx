import { useState } from "react";

export default function FibonacciTab({
  C, MONO, SANS, fibInput, setFibInput, fibTicker, setFibTicker, fetchFibonacci, fibLoading, fibError, fibData,
}) {
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });

        // Why is it moving — same real /api/market/ai-why (Claude + web_search)
        // BestOpportunities/HoldingsTab/OpenStockTab already use, on-demand
        // only. No day-change% is computed here (this tab only tracks the
        // 90-day swing range), so it's called with just symbol + last price,
        // same as OpenStockTab does when day change isn't available.
        const [whyOpen, setWhyOpen] = useState(false);
        const [whyState, setWhyState] = useState("idle"); // idle | loading | ok | err
        const [whyReply, setWhyReply] = useState("");
        const askWhy = () => {
          if (whyOpen) { setWhyOpen(false); return; }
          setWhyOpen(true);
          if (whyState === "ok") return; // already fetched for this ticker
          setWhyState("loading");
          fetch("/api/market/ai-why", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol: fibData.ticker, price: fibData.lastPrice }),
          }).then(r => r.json()).then(j => {
            if (j.ok) { setWhyReply(j.reply); setWhyState("ok"); } else setWhyState("err");
          }).catch(() => setWhyState("err"));
        };

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...card({ padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>🌀 FIBONACCI CALCULATOR</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 3 }}>Auto-detects swing high/low from 90-day daily candles</div>
              </div>
              <input value={fibInput} onChange={e => setFibInput(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === "Enter") { setFibTicker(fibInput.trim() || "SPY"); fetchFibonacci(fibInput.trim() || "SPY"); setWhyOpen(false); setWhyState("idle"); } }}
                placeholder="Ticker…"
                style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, background: C.surface, border: `1px solid ${C.accent}`, color: C.text, borderRadius: 6, padding: "7px 12px", width: 130, outline: "none" }} />
              <button onClick={() => { const t = fibInput.trim() || "SPY"; setFibTicker(t); fetchFibonacci(t); setWhyOpen(false); setWhyState("idle"); }} disabled={fibLoading}
                style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: fibLoading ? C.surface : C.accent, border: "none", color: fibLoading ? C.textDim : "#fff", borderRadius: 6, padding: "9px 18px", cursor: fibLoading ? "default" : "pointer" }}>
                {fibLoading ? "LOADING…" : "CALCULATE"}
              </button>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["SPY","NVDA","AAPL","TSLA","BBAI","PLTR"].map(t => (
                  <button key={t} onClick={() => { setFibInput(t); setFibTicker(t); fetchFibonacci(t); setWhyOpen(false); setWhyState("idle"); }}
                    style={{ fontFamily: MONO, fontSize: 12, background: fibTicker === t ? `${C.accent}22` : C.surface, border: `1px solid ${fibTicker === t ? C.accent : C.border}`, color: fibTicker === t ? C.accent : C.textDim, borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>{t}</button>
                ))}
              </div>
            </div>

            {fibError && (
              <div style={{ ...card({ padding: 16 }), borderLeft: `3px solid ${C.red}` }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Error: {fibError}</span>
              </div>
            )}

            {fibData && (
              <>
                {/* Summary */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                  {[
                    { l: "TICKER",     v: fibData.ticker,                              c: C.accent },
                    { l: "SWING HIGH", v: "$" + fibData.swingHigh.toFixed(2),          c: C.green },
                    { l: "SWING LOW",  v: "$" + fibData.swingLow.toFixed(2),           c: C.red },
                    { l: "RANGE",      v: "$" + (fibData.swingHigh - fibData.swingLow).toFixed(2), c: C.text },
                    { l: "LAST CLOSE", v: "$" + fibData.lastPrice.toFixed(2),          c: C.text },
                    { l: "POSITION",   v: (((fibData.lastPrice - fibData.swingLow) / (fibData.swingHigh - fibData.swingLow)) * 100).toFixed(1) + "% of range", c: C.amber },
                  ].map(stat => (
                    <div key={stat.l} style={{ ...card({ padding: "10px 14px" }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 4, letterSpacing: "0.06em" }}>{stat.l}</div>
                      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: stat.c }}>{stat.v}</div>
                    </div>
                  ))}
                </div>

                {/* Why is it moving */}
                <div style={{ ...card({ padding: 0, overflow: "hidden" }) }}>
                  <button onClick={askWhy}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      padding: "12px 16px", background: whyOpen ? `${C.accent}10` : "transparent", border: "none", cursor: "pointer" }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, letterSpacing: "0.05em" }}>
                      🤖 WHY IS {fibData.ticker} MOVING?{whyState === "loading" ? "…" : ""}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{whyOpen ? "▲" : "▼"}</span>
                  </button>
                  {whyOpen && (
                    <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.border}` }}>
                      {whyState === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, paddingTop: 12 }}>Searching real news &amp; filings…</div>}
                      {whyState === "err" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, paddingTop: 12 }}>Couldn't fetch a reason — try again.</div>}
                      {whyState === "ok" && <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.6, paddingTop: 12 }}>{whyReply}</div>}
                    </div>
                  )}
                </div>

                {/* Levels table */}
                <div style={{ ...card({ overflow: "hidden" }) }}>
                  <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textDim, letterSpacing: "0.06em" }}>
                    FIBONACCI LEVELS — {fibData.ticker}
                  </div>
                  {fibData.levels.map((lvl, i) => {
                    const isCurrent = fibData.lastPrice >= lvl.price - (fibData.swingHigh - fibData.swingLow) * 0.02
                      && fibData.lastPrice <= lvl.price + (fibData.swingHigh - fibData.swingLow) * 0.02;
                    const above = fibData.lastPrice > lvl.price;
                    const dist = Math.abs(fibData.lastPrice - lvl.price);
                    const distPct = ((dist / fibData.lastPrice) * 100).toFixed(1);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 16px",
                        borderTop: i > 0 ? `1px solid ${C.border}33` : "none",
                        background: isCurrent ? `${C.amber}18` : lvl.isKey ? `${C.accent}08` : "transparent" }}>
                        {/* Level indicator bar */}
                        <div style={{ width: 4, height: 28, borderRadius: 2, flexShrink: 0,
                          background: lvl.isExt ? C.purple : lvl.isKey ? C.amber : lvl.ratio === 0 || lvl.ratio === 1 ? C.textDim : C.border }} />
                        <div style={{ flex: "1 1 90px", minWidth: 90 }}>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: lvl.isKey ? C.amber : lvl.isExt ? C.purple : C.textSec }}>
                            {lvl.label} {isCurrent && <span style={{ color: C.amber }}>◄ PRICE IS HERE</span>}
                          </div>
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: lvl.isKey ? C.amber : C.text, minWidth: 90, textAlign: "right" }}>
                          ${lvl.price.toFixed(2)}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: above ? C.green : C.red, minWidth: 70, textAlign: "right" }}>
                          {above ? "▼ " : "▲ "}{distPct}% away
                        </div>
                        {/* Mini price bar visualization */}
                        <div style={{ width: 80, height: 8, background: C.border, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                          <div style={{ width: `${Math.min(100, lvl.ratio * 100)}%`, height: "100%",
                            background: lvl.isKey ? C.amber : C.accent, borderRadius: 6 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {!fibData && !fibLoading && !fibError && (
              <div style={{ ...card({ padding: 40 }), textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🌀</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 6 }}>Enter a ticker and click Calculate</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Automatically finds swing high/low over last 90 days and draws all key Fibonacci levels</div>
              </div>
            )}
          </div>
        );
}
