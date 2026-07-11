import { useState, useEffect } from "react";

export default function DipBuyTab({ C, MONO, SANS, watchlistData, macroData, openDeepDiveFor }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [expandedTicker, setExpandedTicker] = useState(null);

  // Get SPY data from watchlist or macro
  const spyQ = (watchlistData || []).find(w => w.symbol === "SPY") ||
               (macroData || []).find(m => m.symbol === "SPY");
  const spyChg = Number(spyQ?.changesPercentage || spyQ?.delta1d || 0);
  const isBloodDay = spyChg <= -0.5;

  const DIP_UNIVERSE = [
    // Mega cap quality
    "AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AMD","AVGO",
    // Financials
    "JPM","BAC","GS","V","MA",
    // Growth / AI
    "PLTR","SNOW","CRWD","NET","DDOG","MSTR","COIN",
    // ETFs for broad dip
    "QQQ","SPY","IWM","ARKK","SOXL",
    // High quality small/mid
    "SOFI","UPST","AFRM","RBLX","LYFT","UBER",
    // Energy / defensives
    "XOM","CVX","XLF","XLK","XLE",
  ];

  async function runScan() {
    setLoading(true);
    setResults([]);
    try {
      const all = [...new Set([
        ...(watchlistData || []).map(w => w.symbol).filter(Boolean),
        ...DIP_UNIVERSE
      ])].slice(0, 60);

      // Batch fetch candles for each symbol
      const batches = [];
      for (let i = 0; i < all.length; i += 8) batches.push(all.slice(i, i + 8));

      const scored = [];
      for (const batch of batches) {
        const results2 = await Promise.allSettled(
          batch.map(sym =>
            fetch(`/api/market/chart?symbol=${sym}&interval=1d&range=90d`)
              .then(r => r.json()).then(d => ({ sym, data: d }))
          )
        );
        for (const r of results2) {
          if (r.status !== "fulfilled") continue;
          const { sym, data } = r.value;
          const bars = (data?.chart?.result?.[0]?.indicators?.quote?.[0]) || {};
          const ts   = data?.chart?.result?.[0]?.timestamp || [];
          const meta = data?.chart?.result?.[0]?.meta || {};
          const closes = (bars.close || []).filter(v => v > 0);
          const vols   = bars.volume || [];
          if (closes.length < 10) continue;

          // Use last 2 closes for today's change (more reliable than meta fields)
          const px       = Number(meta.regularMarketPrice || closes.at(-1));
          const prev1    = closes.at(-2) || px;
          const prev2    = Number(meta.chartPreviousClose) || prev1;
          // Use whichever gives a bigger move (chart prev close often more accurate)
          const prevClose = Math.abs(px - prev2) > Math.abs(px - prev1) ? prev2 : prev1;
          const todayChg  = prevClose > 0 && prevClose !== px ? ((px - prevClose) / prevClose * 100) : 0;
          const hi52  = Number(meta.fiftyTwoWeekHigh  || 0) || Math.max(...closes.slice(-252));
          const lo52  = Number(meta.fiftyTwoWeekLow   || 0) || Math.min(...closes.slice(-252));
          const vol   = Number(meta.regularMarketVolume || vols.filter(v=>v>0).at(-1) || 0);
          const avgVol = vols.slice(-20).filter(v => v > 0).reduce((a, b) => a + b, 0) / (vols.slice(-20).filter(v=>v>0).length || 1);
          const rvol  = avgVol > 0 ? vol / avgVol : 1;

          // EMAs
          const ema9  = (() => { const k=2/10; let e=closes[0]; for(let i=1;i<closes.length;i++) e=closes[i]*k+e*(1-k); return e; })();
          const ema21 = (() => { const k=2/22; let e=closes[0]; for(let i=1;i<closes.length;i++) e=closes[i]*k+e*(1-k); return e; })();
          const ma50  = closes.length >= 10 ? closes.slice(-Math.min(50, closes.length)).reduce((a,b)=>a+b,0)/Math.min(50,closes.length) : px;
          const ma200 = closes.length >= 10 ? closes.slice(-Math.min(200,closes.length)).reduce((a,b)=>a+b,0)/Math.min(200,closes.length) : px;

          // RSI 14
          let gains=0,losses=0;
          const rsiLen = Math.min(14, closes.length-1);
          for(let i=closes.length-rsiLen;i<closes.length;i++){const d=closes[i]-closes[i-1];d>0?gains+=d:losses+=Math.abs(d);}
          const rsi = losses===0?100:Math.round(100-100/(1+(gains/rsiLen)/(losses/rsiLen)));

          // Score
          let score = 0;
          const signals = [];

          // Down today — still award points even if todayChg is 0 on a blood day
          if (todayChg < -2)       { score += 20; signals.push(`Down ${Math.abs(todayChg).toFixed(1)}% — deep dip`); }
          else if (todayChg < -1)  { score += 15; signals.push(`Down ${Math.abs(todayChg).toFixed(1)}% today`); }
          else if (todayChg < -0.3){ score += 8;  signals.push(`Down ${Math.abs(todayChg).toFixed(1)}% today`); }
          // On a blood day (SPY < -1%) all stocks get base points even if data is stale
          else if (spyChg < -1)    { score += 5;  signals.push(`Market sell-off day`); }
          else continue;

          // RSI
          if (rsi < 30)      { score += 25; signals.push(`RSI ${rsi} 🔥 oversold`); }
          else if (rsi < 40) { score += 18; signals.push(`RSI ${rsi} — oversold`); }
          else if (rsi < 50) { score += 12; signals.push(`RSI ${rsi} — cooling off`); }
          else if (rsi < 60) { score += 5;  signals.push(`RSI ${rsi}`); }

          // Near 52W support
          const fromLo52 = lo52 > 0 ? ((px - lo52) / lo52 * 100) : 50;
          if (fromLo52 < 5)        { score += 20; signals.push(`Near 52W low — major support`); }
          else if (fromLo52 < 15)  { score += 12; signals.push(`Near 52W support zone`); }
          else if (fromLo52 < 30)  { score += 6;  signals.push(`Support zone`); }

          // MA bounce zones
          const distMa50 = ma50 > 0 ? ((px - ma50) / ma50 * 100) : 50;
          if (Math.abs(distMa50) < 2)          { score += 15; signals.push(`Testing 50D MA — key bounce zone`); }
          else if (distMa50 > -5 && distMa50 < 5) { score += 8; signals.push(`Near 50D MA`); }
          if (px > ma200)                       { score += 10; signals.push(`Above 200D MA — uptrend intact ✅`); }
          else                                  { score += 3;  signals.push(`Below 200D — higher risk`); }

          // Volume
          if (rvol > 2)       { score += 15; signals.push(`Volume ${rvol.toFixed(1)}x — buyers stepping in`); }
          else if (rvol > 1.3){ score += 8;  signals.push(`Above avg volume`); }

          // Trend
          if (ema9 > ema21 && px > ma50)  { score += 10; signals.push(`Trend intact — pullback only`); }
          else if (ema9 > ema21)           { score += 5;  signals.push(`EMA bullish`); }

          // Upside potential
          const fromHi52 = hi52 > 0 ? ((hi52 - px) / hi52 * 100) : 0;
          if (fromHi52 > 40)  { score += 8; signals.push(`${fromHi52.toFixed(0)}% below 52W high — big upside`); }
          else if (fromHi52 > 20) { score += 4; signals.push(`${fromHi52.toFixed(0)}% below 52W high`); }

          if (score < 12) continue; // very low bar — show everything with any signal

          // Stop and targets
          const stop    = Math.min(px * 0.97, ma50 * 0.98);
          const risk    = px - stop;
          const target1 = px + risk * 1.5;
          const target2 = px + risk * 3;

          scored.push({ sym, px, todayChg, rsi, rvol, score, signals,
            hi52, lo52, fromLo52, fromHi52, ma50, ma200, ema9, ema21,
            stop: Math.round(stop*100)/100,
            t1:   Math.round(target1*100)/100,
            t2:   Math.round(target2*100)/100,
            rr:   Math.round((risk > 0 ? (target1-px)/risk : 0)*100)/100,
          });
        }
      }

      scored.sort((a,b) => b.score - a.score);
      setResults(scored);
      setLastScan(new Date());
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { runScan(); }, []);

  const gradeColor = score => score >= 70 ? C.green : score >= 50 ? C.amber : C.red;
  const gradeLabel = score => score >= 70 ? "A+" : score >= 55 ? "A" : score >= 40 ? "B+" : "B";

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>
            🩸 DIP BUY OPPORTUNITIES
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginTop: 4 }}>
            Stocks with the best risk/reward during today's sell-off
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          {lastScan && <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
            Scanned {lastScan.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
          </span>}
          <button onClick={runScan} disabled={loading}
            style={{ background: C.accent, color:"#fff", border:"none", borderRadius:8,
              fontFamily:MONO, fontSize:12, fontWeight:700, padding:"8px 16px", cursor:"pointer" }}>
            {loading ? "⏳ SCANNING…" : "🔄 RESCAN"}
          </button>
        </div>
      </div>

      {/* Market context */}
      <div style={{ display:"flex", gap:12, marginBottom:16, flexWrap:"wrap" }}>
        <div style={{ padding:"10px 16px", borderRadius:8,
          background: isBloodDay ? `${C.red}15` : `${C.green}15`,
          border:`1px solid ${isBloodDay ? C.red : C.green}44`, display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>{isBloodDay ? "🩸" : "🟢"}</span>
          <div>
            <div style={{ fontFamily:MONO, fontSize:11, color:C.textDim }}>SPY TODAY</div>
            <div style={{ fontFamily:MONO, fontSize:16, fontWeight:900, color: spyChg >= 0 ? C.green : C.red }}>
              {spyChg >= 0 ? "+" : ""}{spyChg.toFixed(2)}%
            </div>
          </div>
          <div style={{ fontFamily:SANS, fontSize:12, color: isBloodDay ? C.red : C.green, marginLeft:8 }}>
            {isBloodDay ? "🩸 BLOOD DAY — best dip setups below" : "Green day — fewer dips, be selective"}
          </div>
        </div>
        <div style={{ padding:"10px 16px", borderRadius:8, background:C.surface, border:`1px solid ${C.border}`,
          fontFamily:SANS, fontSize:12, color:C.textSec, display:"flex", alignItems:"center", gap:8 }}>
          <span>💡</span>
          <span>Buy the dip rule: only enter if RSI &lt; 50, price near support, and overall trend intact (above 200D MA)</span>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign:"center", padding:"48px 0", fontFamily:MONO, fontSize:14, color:C.textDim }}>
          ⏳ Scanning {DIP_UNIVERSE.length}+ stocks for dip setups…
        </div>
      )}

      {!loading && results.length === 0 && (
        <div style={{ textAlign:"center", padding:"48px 0" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🩸</div>
          <div style={{ fontFamily:MONO, fontSize:16, color:C.text, marginBottom:8 }}>
            {isBloodDay ? "No quality dip setups found yet — market may be in freefall" : "Market not red enough for dip buys"}
          </div>
          <div style={{ fontFamily:SANS, fontSize:13, color:C.textDim }}>
            {isBloodDay ? "Wait for RSI to reach oversold or price to hit key support" : "Come back when SPY is down 1%+ for best setups"}
          </div>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {results.map((r, i) => (
            <div key={r.sym}
              style={{ background: C.card, border:`1px solid ${expandedTicker===r.sym ? C.accent : C.border}`,
                borderLeft:`4px solid ${gradeColor(r.score)}`, borderRadius:10, overflow:"hidden",
                cursor:"pointer" }}
              onClick={() => setExpandedTicker(expandedTicker===r.sym ? null : r.sym)}>

              {/* Row */}
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", flexWrap:"wrap" }}>
                <div style={{ fontFamily:MONO, fontSize:13, color:C.textDim, minWidth:24 }}>#{i+1}</div>
                <div style={{ minWidth:80 }}>
                  <div style={{ fontFamily:MONO, fontSize:16, fontWeight:900, color:C.text }}>{r.sym}</div>
                  <div style={{ fontFamily:MONO, fontSize:12, color:C.red }}>{r.todayChg.toFixed(2)}% today</div>
                </div>
                <div style={{ fontFamily:MONO, fontSize:18, fontWeight:700, color:C.text, minWidth:80 }}>
                  ${r.px.toFixed(2)}
                </div>
                <div style={{ background:`${gradeColor(r.score)}18`, border:`1px solid ${gradeColor(r.score)}44`,
                  borderRadius:6, padding:"4px 10px", textAlign:"center", minWidth:60 }}>
                  <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim }}>SCORE</div>
                  <div style={{ fontFamily:MONO, fontSize:16, fontWeight:900, color:gradeColor(r.score) }}>
                    {gradeLabel(r.score)} {r.score}
                  </div>
                </div>
                <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                  {[
                    ["RSI",   r.rsi,               r.rsi < 30 ? C.green : r.rsi < 45 ? C.amber : C.text],
                    ["RVOL",  `${r.rvol.toFixed(1)}x`, r.rvol > 1.5 ? C.green : C.text],
                    ["STOP",  `$${r.stop}`,         C.red],
                    ["T1",    `$${r.t1}`,            C.green],
                    ["R:R",   `${r.rr}x`,            r.rr >= 1.5 ? C.green : C.amber],
                  ].map(([l,v,col]) => (
                    <div key={l} style={{ textAlign:"center" }}>
                      <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim }}>{l}</div>
                      <div style={{ fontFamily:MONO, fontSize:12, fontWeight:700, color:col }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
                  <button onClick={e => {
                    e.stopPropagation();
                    openDeepDiveFor(r.sym, { price: r.px || 0, changePercent: r.todayChg || 0,
                      yearHigh: r.hi52, yearLow: r.lo52, priceAvg50: r.ma50, priceAvg200: r.ma200 });
                  }} style={{ background:`${C.accent}15`, border:`1px solid ${C.accent}44`,
                    color:C.accent, borderRadius:6, padding:"4px 10px",
                    fontFamily:MONO, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                    DEEP DIVE
                  </button>
                  <span style={{ fontFamily:MONO, fontSize:11, color:C.textDim }}>
                    {expandedTicker===r.sym ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              {/* Expanded detail */}
              {expandedTicker === r.sym && (
                <div style={{ padding:"0 16px 16px", borderTop:`1px solid ${C.border}` }}>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12, marginTop:12 }}>

                    {/* Why buy */}
                    <div style={{ background:C.surface, borderRadius:8, padding:12, border:`1px solid ${C.green}33` }}>
                      <div style={{ fontFamily:MONO, fontSize:11, fontWeight:900, color:C.green, marginBottom:8 }}>
                        ✅ WHY BUY THIS DIP
                      </div>
                      {r.signals.map((s,si) => (
                        <div key={si} style={{ fontFamily:SANS, fontSize:12, color:C.textSec,
                          padding:"3px 0", display:"flex", gap:6 }}>
                          <span style={{ color:C.green }}>•</span>{s}
                        </div>
                      ))}
                    </div>

                    {/* Trade plan */}
                    <div style={{ background:C.surface, borderRadius:8, padding:12, border:`1px solid ${C.border}` }}>
                      <div style={{ fontFamily:MONO, fontSize:11, fontWeight:900, color:C.accent, marginBottom:8 }}>
                        🎯 TRADE PLAN
                      </div>
                      {[
                        ["Entry",  `$${r.px.toFixed(2)} or better`,  C.text],
                        ["Stop",   `$${r.stop} (−${Math.abs(((r.stop-r.px)/r.px)*100).toFixed(1)}%)`, C.red],
                        ["T1",     `$${r.t1} (+${((r.t1-r.px)/r.px*100).toFixed(1)}%)`,  C.green],
                        ["T2",     `$${r.t2} (+${((r.t2-r.px)/r.px*100).toFixed(1)}%)`,  C.green],
                        ["R:R",    `${r.rr}x`,                       r.rr>=1.5 ? C.green : C.amber],
                        ["Exit rule", "Sell 50% at T1, hold rest for T2", C.textSec],
                      ].map(([l,v,col]) => (
                        <div key={l} style={{ display:"flex", justifyContent:"space-between",
                          padding:"4px 0", borderBottom:`1px solid ${C.border}` }}>
                          <span style={{ fontFamily:SANS, fontSize:12, color:C.textDim }}>{l}</span>
                          <span style={{ fontFamily:MONO, fontSize:12, fontWeight:700, color:col }}>{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Key levels */}
                    <div style={{ background:C.surface, borderRadius:8, padding:12, border:`1px solid ${C.border}` }}>
                      <div style={{ fontFamily:MONO, fontSize:11, fontWeight:900, color:C.cyan, marginBottom:8 }}>
                        📊 KEY LEVELS
                      </div>
                      {[
                        ["52W High", `$${r.hi52.toFixed(2)}`, C.red],
                        ["50D MA",   `$${r.ma50.toFixed(2)}`, r.px > r.ma50 ? C.green : C.red],
                        ["200D MA",  `$${r.ma200.toFixed(2)}`,r.px > r.ma200 ? C.green : C.red],
                        ["52W Low",  `$${r.lo52.toFixed(2)}`, C.green],
                        ["From 52W High", `−${r.fromHi52.toFixed(1)}%`, C.text],
                        ["From 52W Low",  `+${r.fromLo52.toFixed(1)}%`, C.text],
                      ].map(([l,v,col]) => (
                        <div key={l} style={{ display:"flex", justifyContent:"space-between",
                          padding:"4px 0", borderBottom:`1px solid ${C.border}` }}>
                          <span style={{ fontFamily:SANS, fontSize:12, color:C.textDim }}>{l}</span>
                          <span style={{ fontFamily:MONO, fontSize:12, fontWeight:700, color:col }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop:10, padding:"8px 12px", background:`${C.amber}10`,
                    border:`1px solid ${C.amber}33`, borderRadius:8,
                    fontFamily:SANS, fontSize:12, color:C.amber, fontWeight:600 }}>
                    ⚠️ Only buy dips in uptrends (above 200D MA). Never catch a falling knife without a stop loss. Size 25–50% of normal position.
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
