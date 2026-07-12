import { computeRegime, computeAPlusScore, computeNextAction } from "./market-helpers.js";

export default function TradePlannerTab({ C, MONO, SANS, macroData }) {
  const [input,   setInput]   = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result,  setResult]  = React.useState(null);
  const [error,   setError]   = React.useState("");
  const [account, setAccount] = React.useState(10000);
  const [riskPct, setRiskPct] = React.useState(1);
  const regime = computeRegime(macroData);

  const r2 = n => Math.round(n * 100) / 100;
  const pct = (a, b) => b > 0 ? r2((a - b) / b * 100) : 0;
  const fmtPct = n => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

  const analyze = async (symOverride) => {
    const sym = (symOverride || input).trim().toUpperCase().replace(/[^A-Z0-9.^-]/g, "").slice(0, 10);
    if (!sym) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const resp = await fetch(`/api/market/chart?symbol=${encodeURIComponent(sym)}&interval=1d&range=90d`);
      if (!resp.ok) throw new Error(`Server error ${resp.status}`);
      const json = await resp.json();
      const r    = json?.chart?.result?.[0];
      if (!r) throw new Error("No data for " + sym);
      const meta  = r.meta || {};
      const ts    = r.timestamp || [];
      const q     = r.indicators?.quote?.[0] || {};
      const bars  = ts.map((t, i) => ({ c: q.close?.[i]||0, h: q.high?.[i]||0, l: q.low?.[i]||0, v: q.volume?.[i]||0 })).filter(b => b.c > 0);
      if (bars.length < 14) throw new Error("Not enough data");

      const price  = meta.regularMarketPrice || bars.at(-1).c;
      const chg    = meta.regularMarketChangePercent || 0;
      const closes = bars.map(b => b.c);

      const ema = (n, arr) => { const k=2/(n+1); let e=arr.slice(0,n).reduce((s,v)=>s+v,0)/n; for(let i=n;i<arr.length;i++) e=arr[i]*k+e*(1-k); return r2(e); };
      const ema9=ema(9,closes), ema21=ema(21,closes), ema50=ema(Math.min(50,closes.length),closes);

      let atrSum=0;
      for(let i=bars.length-14;i<bars.length;i++) { const p=bars[i-1]?.c||bars[i].c; atrSum+=Math.max(bars[i].h-bars[i].l,Math.abs(bars[i].h-p),Math.abs(bars[i].l-p)); }
      const atr=r2(atrSum/14);

      let gains=0,losses=0;
      for(let i=bars.length-14;i<bars.length;i++){const d=bars[i].c-(bars[i-1]?.c||0);d>0?gains+=d:losses+=Math.abs(d);}
      const rsi=r2(losses===0?100:100-100/(1+gains/14/(losses/14)));

      const trend=price>ema50&&ema50>ema21?'STRONG BULL':price>ema21?'BULL':price<ema21?'BEAR':'NEUTRAL';
      const trendCol=trend.includes('BULL')?C.green:trend==='BEAR'?C.red:C.amber;

      const stopLoss=r2(Math.max(price-atr*1.5, price*0.97, ema21<price?ema21*0.99:price*0.97));
      const riskPerShare=r2(price-stopLoss);
      const riskAmt=account*(riskPct/100);
      const shares=riskPerShare>0?Math.floor(riskAmt/riskPerShare):0;
      const t1=r2(price+riskPerShare*1.5), t2=r2(price+riskPerShare*2.5), t3=r2(price+riskPerShare*4);

      // Best-effort: same trend-template screen the Terminal/Watchlists/Scanner use, so this
      // gets the identical A+ Score + Next Action language as the rest of the app. If it fails
      // (symbol not covered, request error), the rest of the plan above still renders fine.
      let aplus = null, next = null;
      try {
        const tsResp = await fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(sym)}`);
        const tsJson = tsResp.ok ? await tsResp.json() : null;
        const tsRow = (tsJson?.results || []).find(x => x && !x.error && x.symbol === sym);
        if (tsRow) { aplus = computeAPlusScore(tsRow, regime); next = computeNextAction(tsRow); }
      } catch {}

      setResult({ sym, price, chg, ema9, ema21, ema50, atr, rsi, trend, trendCol,
        stopLoss, riskPerShare, riskAmt, shares, cost:r2(shares*price), t1, t2, t3, aplus, next });
    } catch(e) { setError(e.message||"Failed to fetch data"); }
    setLoading(false);
  };

  // Pick up a symbol handed off from Sniper Scanner / Best Opportunities (same
  // mterminal_load_sym convention used sitewide for "send this symbol elsewhere",
  // just a dedicated key so a chart-only pick doesn't also trigger a full plan).
  React.useEffect(() => {
    let pending = null;
    try { pending = localStorage.getItem("tradeplanner_load_sym"); if (pending) localStorage.removeItem("tradeplanner_load_sym"); } catch {}
    if (pending) { setInput(pending); analyze(pending); }
  }, []); // eslint-disable-line

  const card = { background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:16 };
  const numCard = (label,val,sub,col) => (
    <div style={{...card, textAlign:"center", borderTop:`3px solid ${col}`}}>
      <div style={{fontFamily:MONO,fontSize:9,color:C.textDim,fontWeight:800,letterSpacing:"0.1em",marginBottom:6}}>{label}</div>
      <div style={{fontFamily:MONO,fontSize:22,fontWeight:900,color:col,lineHeight:1}}>{val}</div>
      {sub&&<div style={{fontFamily:SANS,fontSize:11,color:C.textDim,marginTop:5}}>{sub}</div>}
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div>
        <div style={{fontFamily:MONO,fontSize:16,fontWeight:900,color:C.text}}>🎯 TRADE PLANNER</div>
        <div style={{fontFamily:SANS,fontSize:12,color:C.textDim,marginTop:2}}>Enter any ticker — get stop loss, exit strategy, and 3 price targets instantly</div>
      </div>
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <input value={input} onChange={e=>setInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&analyze()}
          placeholder="Enter ticker — e.g. NVDA, TSLA, AMD"
          style={{flex:1,minWidth:200,padding:"12px 16px",fontFamily:MONO,fontSize:15,fontWeight:700,
            background:C.surface,border:`2px solid ${C.accent}`,color:C.text,borderRadius:10,outline:"none"}}/>
        <button onClick={analyze} disabled={loading}
          style={{fontFamily:MONO,fontSize:13,fontWeight:900,padding:"12px 28px",borderRadius:10,border:"none",
            background:loading?C.surface:C.accent,color:loading?C.textDim:"#fff",cursor:loading?"default":"pointer"}}>
          {loading?"⏳ Analyzing…":"📊 ANALYZE"}
        </button>
        <span style={{fontFamily:MONO,fontSize:11,color:C.textDim}}>Account $</span>
        <input type="number" value={account} onChange={e=>setAccount(Number(e.target.value))}
          style={{width:80,padding:"8px",fontFamily:MONO,fontSize:12,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,textAlign:"right"}}/>
        <span style={{fontFamily:MONO,fontSize:11,color:C.textDim}}>Risk %</span>
        <input type="number" value={riskPct} onChange={e=>setRiskPct(Number(e.target.value))} min="0.5" max="5" step="0.5"
          style={{width:50,padding:"8px",fontFamily:MONO,fontSize:12,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,textAlign:"right"}}/>
      </div>
      {error&&<div style={{padding:14,background:`${C.red}12`,border:`1px solid ${C.red}33`,borderRadius:8,fontFamily:MONO,fontSize:13,color:C.red}}>⚠ {error}</div>}
      {result&&(
        <>
          <div style={{...card,borderLeft:`4px solid ${result.trendCol}`,display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
            <div>
              <div style={{fontFamily:MONO,fontSize:22,fontWeight:900,color:C.text}}>{result.sym}</div>
              <div style={{fontFamily:MONO,fontSize:14,fontWeight:700,color:result.chg>=0?C.green:C.red,marginTop:2}}>
                ${result.price.toFixed(2)} {result.chg>=0?"+":""}{result.chg.toFixed(2)}%
              </div>
            </div>
            {[["TREND",result.trend,result.trendCol],["RSI",result.rsi.toFixed(0),result.rsi<30?C.green:result.rsi>70?C.red:C.textDim],
              ["EMA 9/21",result.ema9>result.ema21?"▲ BULLISH":"▼ BEARISH",result.ema9>result.ema21?C.green:C.red],
              ["ATR",`$${result.atr}`,C.textDim]].map(([k,v,col])=>(
              <div key={k} style={{textAlign:"center"}}>
                <div style={{fontFamily:MONO,fontSize:9,color:C.textDim,marginBottom:2}}>{k}</div>
                <div style={{fontFamily:MONO,fontSize:12,fontWeight:800,color:col}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{...card,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",borderTop:`3px solid ${regime.color}`}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontFamily:MONO,fontSize:9,color:C.textDim,fontWeight:800,letterSpacing:"0.08em",marginBottom:4}}>MARKET REGIME</div>
              <div style={{fontFamily:MONO,fontSize:16,fontWeight:900,color:regime.color}}>{regime.label} {regime.score}/100</div>
            </div>
            {result.aplus && (
              <div style={{textAlign:"center"}}>
                <div style={{fontFamily:MONO,fontSize:9,color:C.textDim,fontWeight:800,letterSpacing:"0.08em",marginBottom:4}}>A+ SCORE</div>
                <div title={result.aplus.reasons.join(" · ")} style={{fontFamily:MONO,fontSize:16,fontWeight:900,color:result.aplus.score>=80?C.green:result.aplus.score>=60?C.amber:C.red,cursor:"help"}}>{result.aplus.score}/100</div>
              </div>
            )}
            {result.next && (
              <div style={{textAlign:"center"}}>
                <div style={{fontFamily:MONO,fontSize:9,color:C.textDim,fontWeight:800,letterSpacing:"0.08em",marginBottom:4}}>NEXT ACTION</div>
                <div title={result.next.reason} style={{fontFamily:MONO,fontSize:13,fontWeight:900,color:result.next.color,border:`1px solid ${result.next.color}`,borderRadius:5,padding:"2px 10px",cursor:"help",display:"inline-block"}}>{result.next.action}</div>
              </div>
            )}
            <div style={{fontFamily:SANS,fontSize:12,color:C.textSec,flex:1,minWidth:200}}>
              {regime.score>=75?"✅ Market conditions favor this trade working out.":regime.score>=55?"⚠️ Mixed market — be selective, this setup needs to be strong on its own.":"🛑 Weak market — breakouts fail more often here. Consider a smaller size or skipping."}
              {!result.aplus && " (A+ Score unavailable for this symbol — not in the trend-template universe.)"}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
            {numCard("ENTRY PRICE",`$${result.price.toFixed(2)}`,"Current price — buy here",C.accent)}
            {numCard("STOP LOSS 🛑",`$${result.stopLoss}`,`${fmtPct(pct(result.stopLoss,result.price))} · ATR-based`,C.red)}
            {numCard("TARGET 1 🎯",`$${result.t1}`,`${fmtPct(pct(result.t1,result.price))} · 1.5R · Take 50%`,C.green)}
            {numCard("TARGET 2 🚀",`$${result.t2}`,`${fmtPct(pct(result.t2,result.price))} · 2.5R · Take 25%`,"#22c55e")}
            {numCard("TARGET 3 💎",`$${result.t3}`,`${fmtPct(pct(result.t3,result.price))} · 4R · Let run`,C.accent)}
          </div>
          <div style={{...card,borderTop:`3px solid ${C.accent}`}}>
            <div style={{fontFamily:MONO,fontSize:11,fontWeight:900,color:C.textDim,letterSpacing:"0.1em",marginBottom:12}}>
              💰 POSITION SIZING — ${account.toLocaleString()} account · {riskPct}% risk = ${result.riskAmt.toFixed(0)} max loss
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10}}>
              {[["SHARES",result.shares,"to buy",C.text],["COST",`$${result.cost.toLocaleString()}`,"total",C.text],
                ["MAX LOSS",`$${result.riskAmt.toFixed(0)}`,`${riskPct}% account`,C.red],
                ["RISK/SHARE",`$${result.riskPerShare}`,"entry minus stop",C.amber],
                ["PROFIT T1",`$${r2(result.shares*(result.t1-result.price))}`,`${result.shares} shares`,C.green],
                ["PROFIT T2",`$${r2(result.shares*(result.t2-result.price))}`,"full position","#22c55e"]].map(([l,v,s,col])=>(
                <div key={l} style={{background:C.surface,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                  <div style={{fontFamily:MONO,fontSize:9,color:C.textDim,marginBottom:4}}>{l}</div>
                  <div style={{fontFamily:MONO,fontSize:16,fontWeight:900,color:col}}>{v}</div>
                  <div style={{fontFamily:SANS,fontSize:10,color:C.textDim,marginTop:2}}>{s}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{...card,borderTop:`3px solid ${C.green}`}}>
            <div style={{fontFamily:MONO,fontSize:11,fontWeight:900,color:C.textDim,letterSpacing:"0.1em",marginBottom:12}}>🗺 EXIT STRATEGY</div>
            {[{step:"1",action:"ENTER",price:`$${result.price.toFixed(2)}`,detail:`Buy ${result.shares} shares — max risk $${result.riskAmt.toFixed(0)}`,col:C.accent},
              {step:"2",action:"STOP LOSS",price:`$${result.stopLoss}`,detail:"If price drops here → SELL ALL. No exceptions.",col:C.red},
              {step:"3",action:"TARGET 1",price:`$${result.t1}`,detail:`Sell 50% (${Math.floor(result.shares/2)} shares) → move stop to breakeven`,col:C.green},
              {step:"4",action:"TARGET 2",price:`$${result.t2}`,detail:`Sell 25% more → trail stop up`,col:"#22c55e"},
              {step:"5",action:"TARGET 3",price:`$${result.t3}`,detail:"Let remaining 25% run to final target",col:C.accent},
            ].map(s=>(
              <div key={s.step} style={{display:"flex",alignItems:"center",gap:14,padding:"10px 0",borderBottom:`1px solid ${C.border}22`}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:`${s.col}20`,border:`2px solid ${s.col}`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontFamily:MONO,fontSize:12,fontWeight:900,color:s.col,flexShrink:0}}>{s.step}</div>
                <div style={{minWidth:90,flexShrink:0}}>
                  <div style={{fontFamily:MONO,fontSize:10,color:s.col,fontWeight:900}}>{s.action}</div>
                  <div style={{fontFamily:MONO,fontSize:14,fontWeight:900,color:C.text}}>{s.price}</div>
                </div>
                <div style={{fontFamily:SANS,fontSize:12,color:C.textSec,lineHeight:1.5}}>{s.detail}</div>
              </div>
            ))}
            <div style={{marginTop:12,padding:"10px 12px",background:`${C.amber}10`,border:`1px solid ${C.amber}33`,
              borderRadius:8,fontFamily:SANS,fontSize:12,color:C.amber,fontWeight:600}}>
              ⚠️ Not financial advice. Always use stop losses. Never risk more than you can afford to lose.
            </div>
          </div>

          {/* ── OPTIONS RECOMMENDATION ── */}
          {(() => {
            const isBull = result.trend.includes('BULL') && result.ema9 > result.ema21 && result.rsi < 70;
            const isBear = result.trend === 'BEAR' && result.ema9 < result.ema21 && result.rsi > 30;
            const isNeutral = !isBull && !isBear;
            const direction = isNeutral ? 'NO CLEAR SIGNAL' : isBull ? 'BUY CALLS 🟢' : 'BUY PUTS 🔴';
            const dirColor  = isNeutral ? C.textDim : isBull ? C.green : C.red;
            const dirBg     = isNeutral ? C.card : isBull ? `${C.green}10` : `${C.red}10`;

            // Strike calculation
            const price   = result.price;
            const itmStrike  = price >= 100 ? Math.round(price/5)*5   : Math.round(price);
            const otmCall    = price >= 100 ? itmStrike + 5  : itmStrike + Math.ceil(price*0.03);
            const otmPut     = price >= 100 ? itmStrike - 5  : itmStrike - Math.ceil(price*0.03);

            // Confidence signals
            const signals = [];
            if (isBull) {
              if (result.ema9 > result.ema21)       signals.push("✅ EMA 9 above 21 — bullish trend");
              if (result.rsi >= 45 && result.rsi <= 65) signals.push(`✅ RSI ${result.rsi.toFixed(0)} — sweet spot`);
              if (result.trend === 'STRONG BULL')    signals.push("✅ Strong uptrend confirmed");
            } else if (isBear) {
              if (result.ema9 < result.ema21)        signals.push("✅ EMA 9 below 21 — bearish trend");
              if (result.rsi > 65)                   signals.push(`✅ RSI ${result.rsi.toFixed(0)} — overbought`);
              if (result.trend === 'BEAR')           signals.push("✅ Downtrend confirmed");
            } else {
              signals.push("Mixed signals — no clear direction");
              signals.push("Wait for EMA alignment or RSI extreme");
            }

            return (
              <div style={{...card, borderTop:`3px solid ${dirColor}`, background:dirBg}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                  <div>
                    <div style={{fontFamily:MONO,fontSize:11,fontWeight:900,color:C.textDim,letterSpacing:"0.1em",marginBottom:4}}>
                      📈 OPTIONS RECOMMENDATION
                    </div>
                    <div style={{fontFamily:MONO,fontSize:20,fontWeight:900,color:dirColor}}>{direction}</div>
                  </div>
                </div>

                {/* Evidence */}
                <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
                  {signals.map((s,i)=>(<div key={i} style={{fontFamily:SANS,fontSize:12,color:dirColor}}>{s}</div>))}
                </div>

                {!isNeutral && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                    {[
                      ["DIRECTION",   isBull?"CALL OPTIONS":"PUT OPTIONS",  "",                                dirColor],
                      ["STRIKE",      isBull?`$${otmCall} (1 OTM)`:
                                             `$${otmPut} (1 OTM)`,         `or $${itmStrike} ATM`,            dirColor],
                      ["EXPIRATION",  "21–35 days out",                     "Never buy weeklies",              C.textDim],
                      ["MAX LOSS",    "100% of premium",                    "Size: 1–2% of account max",       C.red],
                      ["EXIT PROFIT", "+50% to +80%",                       "Don't get greedy",                C.green],
                      ["EXIT LOSS",   "If stock breaks stop",               `Below $${result.stopLoss}`,       C.red],
                    ].map(([l,v,s,col])=>(
                      <div key={l} style={{background:C.surface,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                        <div style={{fontFamily:MONO,fontSize:9,color:C.textDim,marginBottom:4}}>{l}</div>
                        <div style={{fontFamily:MONO,fontSize:13,fontWeight:800,color:col}}>{v}</div>
                        {s&&<div style={{fontFamily:SANS,fontSize:10,color:C.textDim,marginTop:2}}>{s}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Earnings warning */}
                <div style={{padding:"8px 12px",background:`${C.amber}10`,border:`1px solid ${C.amber}33`,
                  borderRadius:8,fontFamily:SANS,fontSize:11,color:C.amber,fontWeight:600}}>
                  ⚠️ Never buy options within 7 days of earnings — IV crush will destroy value even if you're right.
                  {isNeutral && " Wait for a clear Bull BOS or Bear BOS before buying options."}
                </div>
              </div>
            );
          })()}
        </>
      )}
      {!result&&!loading&&!error&&(
        <div style={{...card,textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:48,marginBottom:16}}>🎯</div>
          <div style={{fontFamily:MONO,fontSize:16,fontWeight:900,color:C.text,marginBottom:8}}>Enter a ticker above</div>
          <div style={{fontFamily:SANS,fontSize:13,color:C.textDim,maxWidth:400,margin:"0 auto",lineHeight:1.7}}>
            Type any stock symbol and press ANALYZE.<br/>
            You'll get stop loss, 3 price targets, position sizing,<br/>and a step-by-step exit strategy.
          </div>
        </div>
      )}
    </div>
  );
}
