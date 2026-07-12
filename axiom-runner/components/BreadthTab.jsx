export default function BreadthTab({
  C, MONO, breadthData, fetchBreadth, breadthLoading,
}) {
        const card = (extra = {}) => ({ background: C.card, border: "1px solid " + C.border, borderRadius: 10, ...extra });
        const bd = breadthData;
        const sm = bd ? bd.summary : null;
        return (
          <div style={{ padding:"0 0 40px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ fontFamily:MONO, fontSize:13, fontWeight:900, color:C.text, letterSpacing:2 }}>MARKET BREADTH DASHBOARD</div>
                <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginTop:3 }}>11 S&P sector ETFs — advance/decline, 50MA, 200MA analysis</div>
              </div>
              <button onClick={fetchBreadth} disabled={breadthLoading}
                style={{ fontFamily:MONO, fontSize:11, fontWeight:700, background:breadthLoading?C.surface:C.accent, border:"none", color:breadthLoading?C.textDim:"#fff", borderRadius:6, padding:"9px 18px", cursor:breadthLoading?"default":"pointer" }}>
                {breadthLoading ? "LOADING..." : "REFRESH"}
              </button>
            </div>

            {breadthLoading && <div style={{ ...card({padding:60, textAlign:"center"}) }}><span style={{ fontFamily:MONO, fontSize:12, color:C.textDim }}>Fetching sector data...</span></div>}

            {bd && !breadthLoading && !bd.error && sm && (() => {
              const adColor    = sm.advancingPct >= 70 ? C.green : sm.advancingPct >= 50 ? "#22c55e" : sm.advancingPct >= 30 ? C.amber : C.red;
              const ab50Color  = sm.above50Pct  >= 60 ? C.green : sm.above50Pct  >= 40 ? C.amber : C.red;
              const ab200Color = sm.above200Pct >= 60 ? C.green : sm.above200Pct >= 40 ? C.amber : C.red;
              const adRatioColor = sm.adRatio >= 2 ? C.green : sm.adRatio >= 1 ? C.amber : C.red;
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                    {[
                      { label:"ADVANCING",   value:sm.advancingPct+"%",  sub:sm.decliningPct+"% declining", color:adColor },
                      { label:"ABOVE 50MA",  value:sm.above50Pct+"%",    sub:"of sectors",                  color:ab50Color },
                      { label:"ABOVE 200MA", value:sm.above200Pct+"%",   sub:"of sectors",                  color:ab200Color },
                      { label:"A/D RATIO",   value:sm.adRatio+"x",       sub:"adv / dec",                   color:adRatioColor },
                    ].map((item,i) => (
                      <div key={i} style={{ ...card({padding:18, textAlign:"center"}), borderTop:"3px solid " + item.color }}>
                        <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginBottom:6, letterSpacing:1 }}>{item.label}</div>
                        <div style={{ fontFamily:MONO, fontSize:26, fontWeight:900, color:item.color }}>{item.value}</div>
                        <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginTop:4 }}>{item.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ ...card({padding:0}), overflow:"hidden" }}>
                    <div style={{ fontFamily:MONO, fontSize:11, fontWeight:800, color:C.text, padding:"14px 16px", borderBottom:"1px solid " + C.border }}>MAJOR INDICES</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)" }}>
                      {(bd.indices||[]).map((idx, i) => {
                        const chgColor = idx.change>0?C.green:idx.change<0?C.red:C.textSec;
                        return (
                          <div key={i} style={{ padding:"14px 16px", borderRight:i<3?"1px solid " + C.border + "22":"none" }}>
                            <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim }}>{idx.name}</div>
                            <div style={{ fontFamily:MONO, fontSize:16, fontWeight:800, color:C.text, marginTop:2 }}>${idx.price}</div>
                            <div style={{ fontFamily:MONO, fontSize:11, fontWeight:700, color:chgColor }}>{idx.change>0?"+":""}{idx.change}%</div>
                            <div style={{ fontFamily:MONO, fontSize:9, color:idx.above50?C.green:C.red, marginTop:4 }}>{idx.above50?"Above 50MA":"Below 50MA"}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ ...card({padding:0}), overflow:"hidden" }}>
                    <div style={{ fontFamily:MONO, fontSize:11, fontWeight:800, color:C.text, padding:"14px 16px", borderBottom:"1px solid " + C.border }}>SECTOR BREAKDOWN</div>
                    <div style={{ display:"grid", gridTemplateColumns:"80px 1fr 70px 70px 80px 80px 90px", gap:0, padding:"8px 16px", borderBottom:"1px solid " + C.border + "33" }}>
                      {["ETF","SECTOR","PRICE","TODAY","vs 50MA","vs 200MA","STATUS"].map(h=>(
                        <div key={h} style={{ fontFamily:MONO, fontSize:9, color:C.textDim, fontWeight:700 }}>{h}</div>
                      ))}
                    </div>
                    {(bd.sectors||[]).map((s, si) => {
                      const chgColor = s.change>0?C.green:s.change<0?C.red:C.textSec;
                      const vs50  = s.ma50  ? Number(((s.price-s.ma50 )/s.ma50 )*100).toFixed(1) : null;
                      const vs200 = s.ma200 ? Number(((s.price-s.ma200)/s.ma200)*100).toFixed(1) : null;
                      const stColor = s.status==="Bullish"?C.green:s.status==="Bearish"?C.red:C.amber;
                      return (
                        <div key={si} style={{ display:"grid", gridTemplateColumns:"80px 1fr 70px 70px 80px 80px 90px", gap:0, padding:"11px 16px", borderBottom:"1px solid " + C.border + "22", alignItems:"center" }}>
                          <div style={{ fontFamily:MONO, fontSize:11, fontWeight:800, color:C.accent }}>{s.sym}</div>
                          <div style={{ fontFamily:MONO, fontSize:10, color:C.textSec }}>{s.name}</div>
                          <div style={{ fontFamily:MONO, fontSize:11, fontWeight:700, color:C.text }}>${s.price}</div>
                          <div style={{ fontFamily:MONO, fontSize:11, fontWeight:700, color:chgColor }}>{s.change>0?"+":""}{s.change}%</div>
                          <div style={{ fontFamily:MONO, fontSize:10, color:vs50!=null?(Number(vs50)>=0?C.green:C.red):C.textDim }}>{vs50!=null?(Number(vs50)>=0?"+":"")+vs50+"%":"--"}</div>
                          <div style={{ fontFamily:MONO, fontSize:10, color:vs200!=null?(Number(vs200)>=0?C.green:C.red):C.textDim }}>{vs200!=null?(Number(vs200)>=0?"+":"")+vs200+"%":"--"}</div>
                          <div style={{ fontFamily:MONO, fontSize:9, fontWeight:700, color:stColor, background:stColor+"22", borderRadius:4, padding:"3px 7px", textAlign:"center" }}>{s.status}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {bd && bd.error && <div style={{ ...card({padding:30}), color:C.red, fontFamily:MONO, fontSize:12 }}>Error: {bd.error}</div>}
            {!bd && !breadthLoading && (
              <div style={{ ...card({padding:60, textAlign:"center"}) }}>
                <div style={{ fontFamily:MONO, fontSize:32, marginBottom:12 }}>&#128202;</div>
                <div style={{ fontFamily:MONO, fontSize:13, fontWeight:700, color:C.text }}>Click REFRESH to load sector breadth data</div>
                <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginTop:6 }}>Tracks 11 S&P sector ETFs vs their 50MA and 200MA</div>
              </div>
            )}
          </div>
        );
}
