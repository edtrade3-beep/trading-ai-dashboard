export default function SeasonalityTab({
  C, MONO, seasonData, seasonInput, setSeasonInput, fetchSeasonality, seasonLoading, seasonTicker,
}) {
        const card = (extra = {}) => ({ background: C.card, border: "1px solid " + C.border, borderRadius: 10, ...extra });
        const sd = seasonData;
        const maxAbsMonth = sd && sd.months ? Math.max.apply(null, sd.months.map(function(m){ return Math.abs(m.avgReturn||0); }).concat([0.01])) : 1;
        const maxAbsDow   = sd && sd.daysOfWeek ? Math.max.apply(null, sd.daysOfWeek.map(function(d){ return Math.abs(d.avgReturn||0); }).concat([0.01])) : 1;
        return (
          <div style={{ padding:"0 0 40px" }}>
            <div style={{ fontFamily:MONO, fontSize:13, fontWeight:900, color:C.text, letterSpacing:2, marginBottom:16 }}>SEASONALITY CHARTS</div>
            <div style={{ display:"flex", gap:10, marginBottom:20, alignItems:"center", flexWrap:"wrap" }}>
              <input
                value={seasonInput}
                onChange={function(e){ setSeasonInput(e.target.value.toUpperCase()); }}
                onKeyDown={function(e){ if(e.key==="Enter") fetchSeasonality(seasonInput); }}
                placeholder="Ticker (e.g. AAPL)"
                style={{ fontFamily:MONO, fontSize:12, background:C.surface, border:"1px solid " + C.border, color:C.text, borderRadius:6, padding:"9px 14px", width:160 }}
              />
              <button onClick={function(){ fetchSeasonality(seasonInput); }} disabled={seasonLoading}
                style={{ fontFamily:MONO, fontSize:11, fontWeight:700, background:seasonLoading?C.surface:C.accent, border:"none", color:seasonLoading?C.textDim:"#fff", borderRadius:6, padding:"9px 20px", cursor:seasonLoading?"default":"pointer" }}>
                {seasonLoading?"LOADING...":"ANALYZE"}
              </button>
              {["SPY","QQQ","AAPL","NVDA","MSFT","TSLA","GLD"].map(function(t){
                return (
                  <button key={t} onClick={function(){ setSeasonInput(t); fetchSeasonality(t); }}
                    style={{ fontFamily:MONO, fontSize:10, background:seasonTicker===t?C.accent+"22":C.surface, border:"1px solid " + (seasonTicker===t?C.accent:C.border), color:seasonTicker===t?C.accent:C.textDim, borderRadius:4, padding:"6px 10px", cursor:"pointer" }}>
                    {t}
                  </button>
                );
              })}
            </div>

            {seasonLoading && <div style={{ ...card({padding:60, textAlign:"center"}) }}><span style={{ fontFamily:MONO, fontSize:12, color:C.textDim }}>Fetching 5-year daily data...</span></div>}

            {sd && !seasonLoading && !sd.error && (() => {
              const validMonths = sd.months.filter(function(m){ return m.avgReturn!=null; });
              const bestMonth  = validMonths.slice().sort(function(a,b){ return b.avgReturn-a.avgReturn; })[0];
              const worstMonth = validMonths.slice().sort(function(a,b){ return a.avgReturn-b.avgReturn; })[0];
              const validDow   = (sd.daysOfWeek||[]).filter(function(d){ return d.avgReturn!=null; });
              const bestDow    = validDow.slice().sort(function(a,b){ return b.avgReturn-a.avgReturn; })[0];
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                    {[
                      { label:"TICKER",      value:sd.ticker,            sub:sd.dataPoints+" bars (5y)",                                                  color:C.accent },
                      { label:"BEST MONTH",  value:bestMonth?bestMonth.month:"--",   sub:bestMonth?(bestMonth.avgReturn>=0?"+":"")+bestMonth.avgReturn+"% avg":"", color:C.green  },
                      { label:"WORST MONTH", value:worstMonth?worstMonth.month:"--", sub:worstMonth?(worstMonth.avgReturn>=0?"+":"")+worstMonth.avgReturn+"% avg":"", color:C.red },
                      { label:"BEST DOW",    value:bestDow?bestDow.day:"--",         sub:bestDow?(bestDow.avgReturn>=0?"+":"")+bestDow.avgReturn+"% avg":"",   color:C.green  },
                    ].map(function(item,i){
                      return (
                        <div key={i} style={{ ...card({padding:18, textAlign:"center"}), borderTop:"3px solid " + item.color }}>
                          <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginBottom:6, letterSpacing:1 }}>{item.label}</div>
                          <div style={{ fontFamily:MONO, fontSize:22, fontWeight:900, color:item.color }}>{item.value}</div>
                          <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginTop:4 }}>{item.sub}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ ...card({padding:20}) }}>
                    <div style={{ fontFamily:MONO, fontSize:11, fontWeight:800, color:C.text, marginBottom:16 }}>MONTHLY SEASONALITY (5-year avg daily returns)</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(12,1fr)", gap:6 }}>
                      {sd.months.map(function(m, mi){
                        var pct = m.avgReturn != null ? m.avgReturn : 0;
                        var intensity = Math.min(1, Math.abs(pct) / maxAbsMonth);
                        var alpha = (0.15 + intensity * 0.65).toFixed(2);
                        var bg = pct > 0 ? "rgba(34,197,94," + alpha + ")" : "rgba(239,68,68," + alpha + ")";
                        var textCol = intensity > 0.5 ? "#fff" : pct > 0 ? C.green : C.red;
                        return (
                          <div key={mi} style={{ background:bg, borderRadius:8, padding:"12px 6px", textAlign:"center" }}>
                            <div style={{ fontFamily:MONO, fontSize:10, fontWeight:800, color:textCol }}>{m.month}</div>
                            <div style={{ fontFamily:MONO, fontSize:13, fontWeight:900, color:textCol, marginTop:4 }}>{m.avgReturn!=null?(m.avgReturn>=0?"+":"")+m.avgReturn+"%":"--"}</div>
                            <div style={{ fontFamily:MONO, fontSize:8, color:textCol, opacity:0.8, marginTop:3 }}>{m.winRate!=null?m.winRate+"% win":""}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ ...card({padding:20}) }}>
                    <div style={{ fontFamily:MONO, fontSize:11, fontWeight:800, color:C.text, marginBottom:16 }}>DAY-OF-WEEK SEASONALITY</div>
                    <div style={{ display:"flex", gap:12, alignItems:"flex-end", height:140, paddingBottom:4 }}>
                      {(sd.daysOfWeek||[]).filter(function(d){ return ["Mon","Tue","Wed","Thu","Fri"].includes(d.day); }).map(function(d, di){
                        var pct = d.avgReturn != null ? d.avgReturn : 0;
                        var barH = Math.max(4, Math.abs(pct) / maxAbsDow * 90);
                        var barColor = pct >= 0 ? C.green : C.red;
                        return (
                          <div key={di} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                            <div style={{ fontFamily:MONO, fontSize:10, fontWeight:700, color:barColor }}>{pct>=0?"+":""}{pct}%</div>
                            <div style={{ width:"100%", height:barH, background:barColor, borderRadius:"4px 4px 0 0", opacity:0.85 }} />
                            <div style={{ fontFamily:MONO, fontSize:11, color:C.textSec, fontWeight:700 }}>{d.day}</div>
                            <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim }}>{d.winRate}% win</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginTop:8 }}>Based on {sd.dataPoints} trading days (5 years)</div>
                  </div>
                </div>
              );
            })()}

            {sd && sd.error && <div style={{ ...card({padding:30}), color:C.red, fontFamily:MONO, fontSize:12 }}>Error: {sd.error}</div>}
            {!sd && !seasonLoading && (
              <div style={{ ...card({padding:60, textAlign:"center"}) }}>
                <div style={{ fontFamily:MONO, fontSize:32, marginBottom:12 }}>&#128197;</div>
                <div style={{ fontFamily:MONO, fontSize:13, fontWeight:700, color:C.text }}>Enter a ticker and click ANALYZE</div>
                <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginTop:6 }}>Shows avg daily returns by month and day-of-week over 5 years</div>
              </div>
            )}
          </div>
        );
}
