const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'axiom-runner/axiom-live.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// ─── 1. State variables (after ailabSection line) ───────────────────────────
const stateAnchor = `  const [ailabSection,  setAilabSection]  = useState("pattern");`;
const newState = `  const [ailabSection,  setAilabSection]  = useState("pattern");
  // Fear & Greed
  const [fearGreedData,    setFearGreedData]    = useState(null);
  const [fearGreedLoading, setFearGreedLoading] = useState(false);
  // Market Breadth
  const [breadthData,    setBreadthData]    = useState(null);
  const [breadthLoading, setBreadthLoading] = useState(false);
  // Seasonality
  const [seasonTicker,  setSeasonTicker]  = useState("SPY");
  const [seasonInput,   setSeasonInput]   = useState("SPY");
  const [seasonData,    setSeasonData]    = useState(null);
  const [seasonLoading, setSeasonLoading] = useState(false);`;
if (!c.includes(stateAnchor)) { console.error("State anchor not found"); process.exit(1); }
c = c.replace(stateAnchor, newState);

// ─── 2. Fetch functions (after computeOptions closes, before loadPriceAlertList) ──
const fnAnchor = `  const loadPriceAlertList = useCallback(async () => {`;
const newFns = `
  // ── Fear & Greed Meter ────────────────────────────────────────────────────
  async function fetchFearGreed() {
    setFearGreedLoading(true); setFearGreedData(null);
    try {
      const res  = await fetch("/api/market/feargreed");
      const data = res.ok ? await res.json() : { error: "Failed to load" };
      setFearGreedData(data);
    } catch(e) { setFearGreedData({ error: e.message }); }
    setFearGreedLoading(false);
  }

  // ── Market Breadth ────────────────────────────────────────────────────────
  async function fetchBreadth() {
    setBreadthLoading(true); setBreadthData(null);
    try {
      const res  = await fetch("/api/market/breadth");
      const data = res.ok ? await res.json() : { error: "Failed to load" };
      setBreadthData(data);
    } catch(e) { setBreadthData({ error: e.message }); }
    setBreadthLoading(false);
  }

  // ── Seasonality ───────────────────────────────────────────────────────────
  async function fetchSeasonality(ticker) {
    const sym = (ticker || seasonTicker || "SPY").toUpperCase();
    setSeasonLoading(true); setSeasonData(null); setSeasonTicker(sym);
    try {
      const res  = await fetch("/api/market/seasonality?ticker=" + encodeURIComponent(sym));
      const data = res.ok ? await res.json() : { error: "Failed to load" };
      setSeasonData(data);
    } catch(e) { setSeasonData({ error: e.message }); }
    setSeasonLoading(false);
  }

  const loadPriceAlertList = useCallback(async () => {`;
if (!c.includes(fnAnchor)) { console.error("Function anchor not found"); process.exit(1); }
c = c.replace(fnAnchor, newFns);

// ─── 3. NAV_GROUPS — add new tabs to MARKETS group ───────────────────────────
const navAnchor = `{ id: "markets",   label: "MARKETS",   tabs: ["news", "earnings", "macro", "sectors", "rotation", "calendar", "analyst", "ipo"] },`;
const navNew    = `{ id: "markets",   label: "MARKETS",   tabs: ["news", "earnings", "macro", "sectors", "rotation", "calendar", "analyst", "ipo", "feargreed", "breadth", "seasonality"] },`;
if (!c.includes(navAnchor)) { console.error("NAV anchor not found"); process.exit(1); }
c = c.replace(navAnchor, navNew);

// ─── 4. Tab render blocks (before the Global Quran audio comment) ─────────────
const tabAnchor = `      {/* Global Quran audio element — stays mounted across all tab switches */}`;

const newTabs = `
      {/* ── Fear & Greed Meter ─────────────────────────────────────────── */}
      {activeTab === "feargreed" && (() => {
        const fg = fearGreedData;
        const scoreColor = fg
          ? fg.score <= 25 ? C.red
          : fg.score <= 45 ? C.amber
          : fg.score <= 55 ? C.textSec
          : fg.score <= 75 ? "#22c55e"
          : C.green
          : C.accent;
        return (
          <div style={{ padding: "0 0 40px" }}>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ fontFamily:MONO, fontSize:13, fontWeight:900, color:C.text, letterSpacing:2 }}>😨 FEAR & GREED METER</div>
                <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginTop:3 }}>Composite index from 6 market signals — updated on demand</div>
              </div>
              <button onClick={fetchFearGreed} disabled={fearGreedLoading}
                style={{ fontFamily:MONO, fontSize:11, fontWeight:700, background:fearGreedLoading?C.surface:C.accent, border:"none", color:fearGreedLoading?C.textDim:"#fff", borderRadius:6, padding:"9px 18px", cursor:fearGreedLoading?"default":"pointer" }}>
                {fearGreedLoading ? "LOADING…" : "REFRESH"}
              </button>
            </div>

            {fearGreedLoading && (
              <div style={{ ...card({padding:60, textAlign:"center"}) }}>
                <div style={{ fontFamily:MONO, fontSize:12, color:C.textDim }}>Fetching market data…</div>
              </div>
            )}

            {fg && !fearGreedLoading && !fg.error && (() => {
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {/* Big gauge card */}
                  <div style={{ ...card({padding:"40px 30px"}), textAlign:"center", borderTop:`4px solid ${scoreColor}` }}>
                    <div style={{ fontFamily:MONO, fontSize:72, fontWeight:900, color:scoreColor, lineHeight:1 }}>{fg.score}</div>
                    <div style={{ fontFamily:MONO, fontSize:22, fontWeight:800, color:scoreColor, marginTop:8, letterSpacing:3 }}>{fg.label}</div>
                    <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginTop:10 }}>VIX: {fg.vix} · {new Date(fg.fetchedAt).toLocaleTimeString()}</div>
                    {/* Gradient bar */}
                    <div style={{ marginTop:20, position:"relative" }}>
                      <div style={{ height:10, borderRadius:5, background:"linear-gradient(to right, #ef4444, #f97316, #eab308, #22c55e, #16a34a)", width:"100%" }} />
                      <div style={{ position:"absolute", top:-4, left:`${fg.score}%`, transform:"translateX(-50%)", width:18, height:18, borderRadius:"50%", background:scoreColor, border:"3px solid #fff", boxShadow:"0 0 8px " + scoreColor }} />
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontFamily:MONO, fontSize:9, color:C.textDim, marginTop:4 }}>
                      <span>EXTREME FEAR</span><span>FEAR</span><span>NEUTRAL</span><span>GREED</span><span>EXTREME GREED</span>
                    </div>
                  </div>
                  {/* Components table */}
                  <div style={{ ...card({padding:0}), overflow:"hidden" }}>
                    <div style={{ fontFamily:MONO, fontSize:11, fontWeight:800, color:C.text, padding:"14px 16px", borderBottom:`1px solid ${C.border}` }}>COMPONENT BREAKDOWN</div>
                    {(fg.components||[]).map((comp, ci) => {
                      const cColor = comp.score<=25?C.red:comp.score<=45?C.amber:comp.score<=55?C.textSec:comp.score<=75?"#22c55e":C.green;
                      return (
                        <div key={ci} style={{ display:"grid", gridTemplateColumns:"1fr 60px 180px 80px", gap:12, padding:"12px 16px", borderBottom:`1px solid ${C.border}22`, alignItems:"center" }}>
                          <div>
                            <div style={{ fontFamily:MONO, fontSize:11, fontWeight:700, color:C.text }}>{comp.name}</div>
                            <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginTop:2 }}>{comp.detail}</div>
                          </div>
                          <div style={{ fontFamily:MONO, fontSize:18, fontWeight:900, color:cColor, textAlign:"right" }}>{comp.score}</div>
                          <div style={{ position:"relative", height:6, background:C.surface, borderRadius:3 }}>
                            <div style={{ position:"absolute", left:0, top:0, height:6, borderRadius:3, width:comp.score+"%", background:cColor }} />
                          </div>
                          <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, textAlign:"right" }}>{comp.weight}% weight</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {fg?.error && <div style={{ ...card({padding:30, textAlign:"center"}), color:C.red, fontFamily:MONO, fontSize:12 }}>Error: {fg.error}</div>}
            {!fg && !fearGreedLoading && (
              <div style={{ ...card({padding:60, textAlign:"center"}) }}>
                <div style={{ fontFamily:MONO, fontSize:32, marginBottom:12 }}>😨</div>
                <div style={{ fontFamily:MONO, fontSize:13, fontWeight:700, color:C.text }}>Click REFRESH to compute the Fear & Greed score</div>
                <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginTop:6 }}>Scores 6 signals: VIX level · SPY momentum · RSI · 52w range · TLT · HYG</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Market Breadth Dashboard ────────────────────────────────────── */}
      {activeTab === "breadth" && (() => {
        const bd = breadthData;
        const sm = bd?.summary;
        return (
          <div style={{ padding:"0 0 40px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ fontFamily:MONO, fontSize:13, fontWeight:900, color:C.text, letterSpacing:2 }}>📊 MARKET BREADTH DASHBOARD</div>
                <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginTop:3 }}>11 S&P sector ETFs — advance/decline, 50MA, 200MA analysis</div>
              </div>
              <button onClick={fetchBreadth} disabled={breadthLoading}
                style={{ fontFamily:MONO, fontSize:11, fontWeight:700, background:breadthLoading?C.surface:C.accent, border:"none", color:breadthLoading?C.textDim:"#fff", borderRadius:6, padding:"9px 18px", cursor:breadthLoading?"default":"pointer" }}>
                {breadthLoading ? "LOADING…" : "REFRESH"}
              </button>
            </div>

            {breadthLoading && <div style={{ ...card({padding:60, textAlign:"center"}) }}><span style={{ fontFamily:MONO, fontSize:12, color:C.textDim }}>Fetching sector data…</span></div>}

            {bd && !breadthLoading && !bd.error && (() => {
              const adColor = sm.advancingPct >= 70 ? C.green : sm.advancingPct >= 50 ? "#22c55e" : sm.advancingPct >= 30 ? C.amber : C.red;
              const ab50Color  = sm.above50Pct  >= 60 ? C.green : sm.above50Pct  >= 40 ? C.amber : C.red;
              const ab200Color = sm.above200Pct >= 60 ? C.green : sm.above200Pct >= 40 ? C.amber : C.red;
              const adRatioColor = sm.adRatio >= 2 ? C.green : sm.adRatio >= 1 ? C.amber : C.red;
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {/* Summary cards */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                    {[
                      { label:"ADVANCING", value:sm.advancingPct+"%", sub:sm.decliningPct+"% declining", color:adColor },
                      { label:"ABOVE 50MA",  value:sm.above50Pct+"%",  sub:"of sectors", color:ab50Color },
                      { label:"ABOVE 200MA", value:sm.above200Pct+"%", sub:"of sectors", color:ab200Color },
                      { label:"A/D RATIO",   value:sm.adRatio+"x",     sub:"adv / dec",  color:adRatioColor },
                    ].map((item,i) => (
                      <div key={i} style={{ ...card({padding:18, textAlign:"center"}), borderTop:"3px solid "+item.color }}>
                        <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginBottom:6, letterSpacing:1 }}>{item.label}</div>
                        <div style={{ fontFamily:MONO, fontSize:26, fontWeight:900, color:item.color }}>{item.value}</div>
                        <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginTop:4 }}>{item.sub}</div>
                      </div>
                    ))}
                  </div>
                  {/* Indices row */}
                  <div style={{ ...card({padding:0}), overflow:"hidden" }}>
                    <div style={{ fontFamily:MONO, fontSize:11, fontWeight:800, color:C.text, padding:"14px 16px", borderBottom:`1px solid ${C.border}` }}>MAJOR INDICES</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:0 }}>
                      {(bd.indices||[]).map((idx, i) => {
                        const chgColor = idx.change>0?C.green:idx.change<0?C.red:C.textSec;
                        return (
                          <div key={i} style={{ padding:"14px 16px", borderRight:i<3?`1px solid ${C.border}22`:"none" }}>
                            <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim }}>{idx.name}</div>
                            <div style={{ fontFamily:MONO, fontSize:16, fontWeight:800, color:C.text, marginTop:2 }}>${idx.price}</div>
                            <div style={{ fontFamily:MONO, fontSize:11, fontWeight:700, color:chgColor }}>{idx.change>0?"+":""}{idx.change}%</div>
                            <div style={{ fontFamily:MONO, fontSize:9, color:idx.above50?C.green:C.red, marginTop:4 }}>{idx.above50?"▲ Above 50MA":"▼ Below 50MA"}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Sector table */}
                  <div style={{ ...card({padding:0}), overflow:"hidden" }}>
                    <div style={{ fontFamily:MONO, fontSize:11, fontWeight:800, color:C.text, padding:"14px 16px", borderBottom:`1px solid ${C.border}` }}>SECTOR BREAKDOWN</div>
                    <div style={{ display:"grid", gridTemplateColumns:"80px 1fr 70px 80px 80px 80px 90px", gap:0, padding:"8px 16px", borderBottom:`1px solid ${C.border}33` }}>
                      {["ETF","SECTOR","PRICE","TODAY","vs 50MA","vs 200MA","STATUS"].map(h=>(
                        <div key={h} style={{ fontFamily:MONO, fontSize:9, color:C.textDim, fontWeight:700 }}>{h}</div>
                      ))}
                    </div>
                    {(bd.sectors||[]).map((s, si) => {
                      const chgColor = s.change>0?C.green:s.change<0?C.red:C.textSec;
                      const vs50  = s.ma50  ? round2(((s.price-s.ma50 )/s.ma50 )*100) : null;
                      const vs200 = s.ma200 ? round2(((s.price-s.ma200)/s.ma200)*100) : null;
                      const stColor = s.status==="Bullish"?C.green:s.status==="Bearish"?C.red:C.amber;
                      return (
                        <div key={si} style={{ display:"grid", gridTemplateColumns:"80px 1fr 70px 80px 80px 80px 90px", gap:0, padding:"11px 16px", borderBottom:`1px solid ${C.border}22`, alignItems:"center" }}>
                          <div style={{ fontFamily:MONO, fontSize:11, fontWeight:800, color:C.accent }}>{s.sym}</div>
                          <div style={{ fontFamily:MONO, fontSize:10, color:C.textSec }}>{s.name}</div>
                          <div style={{ fontFamily:MONO, fontSize:11, fontWeight:700, color:C.text }}>${s.price}</div>
                          <div style={{ fontFamily:MONO, fontSize:11, fontWeight:700, color:chgColor }}>{s.change>0?"+":""}{s.change}%</div>
                          <div style={{ fontFamily:MONO, fontSize:10, color:vs50!=null?(vs50>=0?C.green:C.red):C.textDim }}>{vs50!=null?(vs50>=0?"+":"")+vs50+"%":"—"}</div>
                          <div style={{ fontFamily:MONO, fontSize:10, color:vs200!=null?(vs200>=0?C.green:C.red):C.textDim }}>{vs200!=null?(vs200>=0?"+":"")+vs200+"%":"—"}</div>
                          <div style={{ fontFamily:MONO, fontSize:9, fontWeight:700, color:stColor, background:stColor+"22", borderRadius:4, padding:"3px 7px", textAlign:"center" }}>{s.status}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {bd?.error && <div style={{ ...card({padding:30}), color:C.red, fontFamily:MONO, fontSize:12 }}>Error: {bd.error}</div>}
            {!bd && !breadthLoading && (
              <div style={{ ...card({padding:60, textAlign:"center"}) }}>
                <div style={{ fontFamily:MONO, fontSize:32, marginBottom:12 }}>📊</div>
                <div style={{ fontFamily:MONO, fontSize:13, fontWeight:700, color:C.text }}>Click REFRESH to load sector breadth data</div>
                <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginTop:6 }}>Tracks 11 S&P sector ETFs vs their 50MA and 200MA</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Seasonality Charts ──────────────────────────────────────────── */}
      {activeTab === "seasonality" && (() => {
        const sd = seasonData;
        const maxAbsMonth = sd?.months ? Math.max(...sd.months.map(m=>Math.abs(m.avgReturn||0)), 0.01) : 1;
        const maxAbsDow   = sd?.daysOfWeek ? Math.max(...sd.daysOfWeek.map(d=>Math.abs(d.avgReturn||0)), 0.01) : 1;
        return (
          <div style={{ padding:"0 0 40px" }}>
            <div style={{ fontFamily:MONO, fontSize:13, fontWeight:900, color:C.text, letterSpacing:2, marginBottom:16 }}>📅 SEASONALITY CHARTS</div>
            {/* Ticker input */}
            <div style={{ display:"flex", gap:10, marginBottom:20, alignItems:"center", flexWrap:"wrap" }}>
              <input
                value={seasonInput}
                onChange={e=>setSeasonInput(e.target.value.toUpperCase())}
                onKeyDown={e=>e.key==="Enter"&&fetchSeasonality(seasonInput)}
                placeholder="Ticker (e.g. AAPL)"
                style={{ fontFamily:MONO, fontSize:12, background:C.surface, border:`1px solid ${C.border}`, color:C.text, borderRadius:6, padding:"9px 14px", width:160 }}
              />
              <button onClick={()=>fetchSeasonality(seasonInput)} disabled={seasonLoading}
                style={{ fontFamily:MONO, fontSize:11, fontWeight:700, background:seasonLoading?C.surface:C.accent, border:"none", color:seasonLoading?C.textDim:"#fff", borderRadius:6, padding:"9px 20px", cursor:seasonLoading?"default":"pointer" }}>
                {seasonLoading?"LOADING…":"ANALYZE"}
              </button>
              {["SPY","QQQ","AAPL","NVDA","MSFT","TSLA","GLD"].map(t=>(
                <button key={t} onClick={()=>{setSeasonInput(t);fetchSeasonality(t);}}
                  style={{ fontFamily:MONO, fontSize:10, background:seasonTicker===t?C.accent+"22":C.surface, border:`1px solid ${seasonTicker===t?C.accent:C.border}`, color:seasonTicker===t?C.accent:C.textDim, borderRadius:4, padding:"6px 10px", cursor:"pointer" }}>
                  {t}
                </button>
              ))}
            </div>

            {seasonLoading && <div style={{ ...card({padding:60, textAlign:"center"}) }}><span style={{ fontFamily:MONO, fontSize:12, color:C.textDim }}>Fetching 5-year daily data…</span></div>}

            {sd && !seasonLoading && !sd.error && (() => {
              const bestMonth  = [...sd.months].filter(m=>m.avgReturn!=null).sort((a,b)=>b.avgReturn-a.avgReturn)[0];
              const worstMonth = [...sd.months].filter(m=>m.avgReturn!=null).sort((a,b)=>a.avgReturn-b.avgReturn)[0];
              const bestDow    = [...sd.daysOfWeek].filter(d=>d.avgReturn!=null).sort((a,b)=>b.avgReturn-a.avgReturn)[0];
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {/* Summary cards */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                    {[
                      { label:"TICKER",       value:sd.ticker,                                   sub:sd.dataPoints+" daily bars (5y)",    color:C.accent },
                      { label:"BEST MONTH",   value:bestMonth?.month||"—",                       sub:(bestMonth?.avgReturn>=0?"+":"")+bestMonth?.avgReturn+"% avg", color:C.green },
                      { label:"WORST MONTH",  value:worstMonth?.month||"—",                      sub:(worstMonth?.avgReturn>=0?"+":"")+worstMonth?.avgReturn+"% avg", color:C.red },
                      { label:"BEST DOW",     value:bestDow?.day||"—",                            sub:(bestDow?.avgReturn>=0?"+":"")+bestDow?.avgReturn+"% avg",   color:C.green },
                    ].map((item,i)=>(
                      <div key={i} style={{ ...card({padding:18, textAlign:"center"}), borderTop:"3px solid "+item.color }}>
                        <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginBottom:6, letterSpacing:1 }}>{item.label}</div>
                        <div style={{ fontFamily:MONO, fontSize:22, fontWeight:900, color:item.color }}>{item.value}</div>
                        <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginTop:4 }}>{item.sub}</div>
                      </div>
                    ))}
                  </div>
                  {/* Monthly heatmap */}
                  <div style={{ ...card({padding:20}) }}>
                    <div style={{ fontFamily:MONO, fontSize:11, fontWeight:800, color:C.text, marginBottom:16 }}>MONTHLY SEASONALITY — {sd.ticker} (5-year avg daily returns)</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(12,1fr)", gap:6 }}>
                      {sd.months.map((m, mi) => {
                        const pct = m.avgReturn ?? 0;
                        const intensity = Math.min(1, Math.abs(pct) / maxAbsMonth);
                        const bg = pct > 0
                          ? \`rgba(34,197,94,\${0.15 + intensity * 0.65})\`
                          : \`rgba(239,68,68,\${0.15 + intensity * 0.65})\`;
                        const textCol = intensity > 0.5 ? "#fff" : pct > 0 ? C.green : C.red;
                        return (
                          <div key={mi} style={{ background:bg, borderRadius:8, padding:"12px 6px", textAlign:"center" }}>
                            <div style={{ fontFamily:MONO, fontSize:10, fontWeight:800, color:textCol }}>{m.month}</div>
                            <div style={{ fontFamily:MONO, fontSize:13, fontWeight:900, color:textCol, marginTop:4 }}>{pct!=null?(pct>=0?"+":"")+pct+"%":"—"}</div>
                            <div style={{ fontFamily:MONO, fontSize:8, color:textCol+"cc", marginTop:3 }}>{m.winRate!=null?m.winRate+"% win":""}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Day-of-week bars */}
                  <div style={{ ...card({padding:20}) }}>
                    <div style={{ fontFamily:MONO, fontSize:11, fontWeight:800, color:C.text, marginBottom:16 }}>DAY-OF-WEEK SEASONALITY</div>
                    <div style={{ display:"flex", gap:12, alignItems:"flex-end", height:120 }}>
                      {sd.daysOfWeek.filter(d=>["Mon","Tue","Wed","Thu","Fri"].includes(d.day)).map((d, di) => {
                        const pct = d.avgReturn ?? 0;
                        const barH = Math.max(4, Math.abs(pct) / maxAbsDow * 90);
                        const barColor = pct >= 0 ? C.green : C.red;
                        return (
                          <div key={di} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                            <div style={{ fontFamily:MONO, fontSize:10, fontWeight:700, color:barColor }}>{pct>=0?"+":""}{pct}%</div>
                            <div style={{ width:"100%", height:barH, background:barColor, borderRadius:"4px 4px 0 0", opacity:0.85 }} />
                            <div style={{ fontFamily:MONO, fontSize:10, color:C.textSec, fontWeight:700 }}>{d.day}</div>
                            <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim }}>{d.winRate}%</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginTop:10 }}>Win rate shown below each bar · Based on {sd.dataPoints} trading days</div>
                  </div>
                </div>
              );
            })()}

            {sd?.error && <div style={{ ...card({padding:30}), color:C.red, fontFamily:MONO, fontSize:12 }}>Error: {sd.error}</div>}
            {!sd && !seasonLoading && (
              <div style={{ ...card({padding:60, textAlign:"center"}) }}>
                <div style={{ fontFamily:MONO, fontSize:32, marginBottom:12 }}>📅</div>
                <div style={{ fontFamily:MONO, fontSize:13, fontWeight:700, color:C.text }}>Enter a ticker and click ANALYZE</div>
                <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginTop:6 }}>Shows average daily returns by month and day-of-week over 5 years</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Global Quran audio element — stays mounted across all tab switches */}`;

if (!c.includes(tabAnchor)) { console.error("Tab anchor not found"); process.exit(1); }
c = c.replace(tabAnchor, newTabs);

fs.writeFileSync(filePath, c);
console.log('axiom-live.jsx updated, new size:', c.length);
