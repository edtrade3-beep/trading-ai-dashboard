export default function FearGreedTab({
  C, MONO, fearGreedData, fetchFearGreed, fearGreedLoading,
}) {
        const card = (extra = {}) => ({ background: C.card, border: "1px solid " + C.border, borderRadius: 10, ...extra });
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
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ fontFamily:MONO, fontSize:13, fontWeight:900, color:C.text, letterSpacing:2 }}>FEAR & GREED METER</div>
                <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginTop:3 }}>Composite index from 6 market signals — VIX, Momentum, RSI, Range, TLT, HYG</div>
              </div>
              <button onClick={fetchFearGreed} disabled={fearGreedLoading}
                style={{ fontFamily:MONO, fontSize:11, fontWeight:700, background:fearGreedLoading?C.surface:C.accent, border:"none", color:fearGreedLoading?C.textDim:"#fff", borderRadius:6, padding:"9px 18px", cursor:fearGreedLoading?"default":"pointer" }}>
                {fearGreedLoading ? "LOADING..." : "REFRESH"}
              </button>
            </div>

            {fearGreedLoading && (
              <div style={{ ...card({padding:60, textAlign:"center"}) }}>
                <div style={{ fontFamily:MONO, fontSize:12, color:C.textDim }}>Fetching market data...</div>
              </div>
            )}

            {fg && !fearGreedLoading && !fg.error && (() => {
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  <div style={{ ...card({padding:"40px 30px"}), textAlign:"center", borderTop:"4px solid " + scoreColor }}>
                    <div style={{ fontFamily:MONO, fontSize:72, fontWeight:900, color:scoreColor, lineHeight:1 }}>{fg.score}</div>
                    <div style={{ fontFamily:MONO, fontSize:22, fontWeight:800, color:scoreColor, marginTop:8, letterSpacing:3 }}>{fg.label}</div>
                    <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginTop:10 }}>VIX: {fg.vix} &nbsp;·&nbsp; {new Date(fg.fetchedAt).toLocaleTimeString()}</div>
                    <div style={{ marginTop:20, position:"relative" }}>
                      <div style={{ height:10, borderRadius:5, background:"linear-gradient(to right, #ef4444, #f97316, #eab308, #22c55e, #16a34a)", width:"100%" }} />
                      <div style={{ position:"absolute", top:-4, left:fg.score+"%", transform:"translateX(-50%)", width:18, height:18, borderRadius:"50%", background:scoreColor, border:"3px solid #fff", boxShadow:"0 0 8px " + scoreColor }} />
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontFamily:MONO, fontSize:9, color:C.textDim, marginTop:6 }}>
                      <span>EXTREME FEAR</span><span>FEAR</span><span>NEUTRAL</span><span>GREED</span><span>EXTREME GREED</span>
                    </div>
                  </div>
                  <div style={{ ...card({padding:0}), overflow:"hidden" }}>
                    <div style={{ fontFamily:MONO, fontSize:11, fontWeight:800, color:C.text, padding:"14px 16px", borderBottom:"1px solid " + C.border }}>COMPONENT BREAKDOWN</div>
                    {(fg.components||[]).map((comp, ci) => {
                      const cColor = comp.score<=25?C.red:comp.score<=45?C.amber:comp.score<=55?C.textSec:comp.score<=75?"#22c55e":C.green;
                      return (
                        <div key={ci} style={{ display:"grid", gridTemplateColumns:"1fr 60px 180px 80px", gap:12, padding:"12px 16px", borderBottom:"1px solid " + C.border + "22", alignItems:"center" }}>
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

            {fg && fg.error && <div style={{ ...card({padding:30, textAlign:"center"}), color:C.red, fontFamily:MONO, fontSize:12 }}>Error: {fg.error}</div>}
            {!fg && !fearGreedLoading && (
              <div style={{ ...card({padding:60, textAlign:"center"}) }}>
                <div style={{ fontFamily:MONO, fontSize:32, marginBottom:12 }}>&#128561;</div>
                <div style={{ fontFamily:MONO, fontSize:13, fontWeight:700, color:C.text }}>Click REFRESH to compute the Fear & Greed score</div>
                <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginTop:6 }}>Scores 6 signals: VIX level · SPY momentum · RSI · 52w range · TLT · HYG</div>
              </div>
            )}
          </div>
        );
}
