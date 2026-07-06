// Parameter sweep over the Green Light long strategy on REAL Yahoo daily bars.
// Fetches data once, then tests many exit/entry/stop configs causally (no lookahead,
// walk-forward split). Goal: find a configuration with a ROBUST out-of-sample edge —
// or prove none exists. Run: node scripts/sweep.js
const UNIVERSE = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","AVGO","TSLA","AMD","NFLX",
  "CRM","ORCL","ADBE","NOW","PANW","CRWD","PLTR","SNOW","MU","QCOM",
  "ANET","MRVL","SMCI","ARM","COIN","UBER","ABNB","SHOP","INTU","LRCX",
  "LLY","V","MA","JPM","COST","WMT","HD","AXP","GE","CAT",
  "XOM","CVX","BA","DIS","NKE","PEP","KO","MCD","UNH","TXN",
];
const SLIP = 0.0005, OOS_SPLIT = 0.5;
async function yahoo(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=3y&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) return null; const res = (await r.json())?.chart?.result?.[0]; if (!res) return null;
  const t = res.timestamp || [], q = res.indicators?.quote?.[0] || {}; const bars = [];
  for (let i = 0; i < t.length; i++) { const o=q.open?.[i],h=q.high?.[i],l=q.low?.[i],c=q.close?.[i],v=q.volume?.[i]; if ([o,h,l,c].some(x=>x==null)) continue; bars.push({ t:t[i]*1000,o,h,l,c,v:v||0 }); }
  return bars.length > 260 ? bars : null;
}
const sma = (a,i,n) => { if (i<n-1) return null; let s=0; for (let k=i-n+1;k<=i;k++) s+=a[k].c; return s/n; };
function ema(arr,n){const k=2/(n+1);const out=[];let e=null;for(let i=0;i<arr.length;i++){e=e==null?arr[i].c:arr[i].c*k+e*(1-k);out.push(e);}return out;}
function rsi(arr,i,n=14){if(i<n)return null;let g=0,l=0;for(let k=i-n+1;k<=i;k++){const d=arr[k].c-arr[k-1].c;if(d>0)g+=d;else l-=d;}const rs=l===0?100:g/l;return 100-100/(1+rs);}
function atr(arr,i,n=14){if(i<n)return null;let s=0;for(let k=i-n+1;k<=i;k++){const tr=Math.max(arr[k].h-arr[k].l,Math.abs(arr[k].h-arr[k-1].c),Math.abs(arr[k].l-arr[k-1].c));s+=tr;}return s/n;}
function stat(trades){ if(!trades.length) return null; const w=trades.filter(t=>t.r>0); const rSum=trades.reduce((s,t)=>s+t.r,0); const gp=w.reduce((s,t)=>s+t.r,0),gl=Math.abs(trades.filter(t=>t.r<=0).reduce((s,t)=>s+t.r,0)); return { n:trades.length, win:Math.round(w.length/trades.length*100), exp:rSum/trades.length, pf:gl>0?gp/gl:(gp>0?99:0), net:rSum }; }

function simulate(data, spy, spy50, spy200, spyByT, splitT, cfg) {
  const trades = [];
  for (const s of data) {
    const { bars, e21 } = s; let pos = null;
    for (let i = 220; i < bars.length - 1; i++) {
      const b = bars[i];
      if (pos) {
        pos.bars++;
        const a = atr(bars, i);
        if (cfg.exit === "trail" && a) { const rNow=(b.c-pos.entry)/(pos.entry-pos.stop0); if (rNow>=1) pos.stop=Math.max(pos.stop,pos.entry); pos.stop = Math.max(pos.stop, b.c - cfg.trail * a); }
        let exit = null;
        if (b.l <= pos.stop) exit = pos.stop;
        else if (cfg.exit === "target" && b.h >= pos.target) exit = pos.target;
        if (exit == null && cfg.timeStop && pos.bars >= cfg.timeStop) exit = b.c;   // time stop at close
        if (exit != null) { const fill=exit*(1-SLIP); trades.push({ r:(fill-pos.entry)/(pos.entry-pos.stop0), oos: pos.entryT>=splitT }); pos=null; }
        if (pos) continue;
      }
      const ma50=sma(bars,i,50),ma150=sma(bars,i,150),ma200=sma(bars,i,200),ma200p=sma(bars,i-21,200);
      if(!ma50||!ma150||!ma200||!ma200p)continue;
      const price=b.c,r14=rsi(bars,i),a14=atr(bars,i); if(r14==null||a14==null)continue;
      const win=bars.slice(Math.max(0,i-252),i+1); const hi52=Math.max(...win.map(x=>x.h)),lo52=Math.min(...win.map(x=>x.l));
      const trendPass = price>ma150&&price>ma200&&ma150>ma200&&ma50>ma150&&price>ma50&&ma200>ma200p&&r14>=40&&r14<=70&&price>=hi52*0.75&&price>=lo52*1.30;
      const prior20High = Math.max(...bars.slice(i-20,i).map(x=>x.h));
      const entryOk = cfg.entry==="pullback" ? Math.abs(price-e21[i])/e21[i]<=0.04 : price>=prior20High;
      const sp=spyByT.get(b.t);
      const bull = sp&&spy50[sp.i]!=null&&spy200[sp.i]!=null&&spy200[sp.i-21]!=null&&spy[sp.i].c>spy50[sp.i]&&spy200[sp.i]>spy200[sp.i-21];
      if (trendPass && entryOk && bull) {
        const nx=bars[i+1]; const entry=nx.o*(1+SLIP); const stop0=entry-cfg.stopATR*a14; if(entry<=stop0)continue;
        pos={ entry, stop0, stop:stop0, target: entry+cfg.targetR*(entry-stop0), entryT:nx.t, bars:0 };
      }
    }
  }
  return trades;
}

(async function(){
  console.log("Fetching data once (real Yahoo, 3y)…");
  const spy=await yahoo("SPY"); if(!spy){console.log("Yahoo blocked.");return;}
  const spy50=spy.map((_,i)=>sma(spy,i,50)), spy200=spy.map((_,i)=>sma(spy,i,200));
  const spyByT=new Map(spy.map((b,i)=>[b.t,{i}]));
  const data=[]; for(const sym of UNIVERSE){const bars=await yahoo(sym); if(!bars)continue; data.push({sym,bars,e21:ema(bars,21)});}
  console.log(`Loaded ${data.length} symbols.`);
  const splitT=spy[Math.floor(spy.length*OOS_SPLIT)].t;

  const configs=[];
  for(const entry of ["pullback","breakout"])
   for(const stopATR of [1.5,2.5])
    for(const timeStop of [0,40]){
      for(const targetR of [2,3,4]) configs.push({entry,stopATR,timeStop,exit:"target",targetR});
      for(const trail of [2.5,3.5]) configs.push({entry,stopATR,timeStop,exit:"trail",targetR:99,trail});
    }
  const rows=[];
  for(const cfg of configs){
    const tr=simulate(data,spy,spy50,spy200,spyByT,splitT,cfg);
    const oos=stat(tr.filter(t=>t.oos)), is=stat(tr.filter(t=>!t.oos));
    rows.push({cfg,oos,is});
  }
  rows.sort((a,b)=>((b.oos?.exp||-9)-(a.oos?.exp||-9)));
  const name=c=>`${c.entry.padEnd(8)} stop${c.stopATR} ${c.exit==="target"?`tgt${c.targetR}R`:`trail${c.trail}`}${c.timeStop?` t${c.timeStop}`:""}`.padEnd(30);
  console.log("\n===== ALL CONFIGS, ranked by OUT-OF-SAMPLE expectancy =====");
  console.log("config                          | OOS: n  win  exp    pf   | IS: exp   pf");
  for(const r of rows){ const o=r.oos,is=r.is;
    console.log(`${name(r.cfg)} | ${String(o?.n||0).padStart(4)} ${String((o?.win||0)+"%").padStart(4)} ${(o?o.exp.toFixed(2):"  - ").padStart(6)}R ${(o?o.pf.toFixed(2):"  -").padStart(5)} | ${(is?is.exp.toFixed(2):"  -").padStart(5)}R ${(is?is.pf.toFixed(2):"  -").padStart(5)}`);
  }
  const posOOS=rows.filter(r=>r.oos&&r.oos.exp>0);
  const robust=rows.filter(r=>r.oos&&r.oos.exp>0.05&&r.oos.pf>=1.2&&r.is&&r.is.exp>0);
  console.log(`\n${posOOS.length}/${rows.length} configs positive out-of-sample.`);
  console.log(`${robust.length}/${rows.length} configs ROBUST (OOS exp>0.05R, PF>=1.2, AND positive in-sample).`);
  console.log(robust.length>=3 ? "\n=> A robust edge region MAY exist — see the top rows. Worth deeper validation." : "\n=> NO robust edge region. Positive results (if any) look like noise/luck, not a real edge.");
})();
