// Mean-reversion (oversold-bounce) backtest sweep on REAL Yahoo daily bars.
// Classic Connors-style: buy oversold dips in a long-term uptrend, sell the bounce.
// Causal (no lookahead), walk-forward split, slippage modeled. node scripts/meanrev.js
const UNIVERSE = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","AVGO","TSLA","AMD","NFLX",
  "CRM","ORCL","ADBE","NOW","PANW","CRWD","PLTR","SNOW","MU","QCOM",
  "ANET","MRVL","SMCI","ARM","COIN","UBER","ABNB","SHOP","INTU","LRCX",
  "LLY","V","MA","JPM","COST","WMT","HD","AXP","GE","CAT",
  "XOM","CVX","BA","DIS","NKE","PEP","KO","MCD","UNH","TXN",
];
const SLIP=0.0005, OOS_SPLIT=0.5;
async function yahoo(sym){const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=3y&interval=1d`,{headers:{"User-Agent":"Mozilla/5.0"}});if(!r.ok)return null;const res=(await r.json())?.chart?.result?.[0];if(!res)return null;const t=res.timestamp||[],q=res.indicators?.quote?.[0]||{};const bars=[];for(let i=0;i<t.length;i++){const o=q.open?.[i],h=q.high?.[i],l=q.low?.[i],c=q.close?.[i],v=q.volume?.[i];if([o,h,l,c].some(x=>x==null))continue;bars.push({t:t[i]*1000,o,h,l,c,v:v||0});}return bars.length>260?bars:null;}
const sma=(a,i,n)=>{if(i<n-1)return null;let s=0;for(let k=i-n+1;k<=i;k++)s+=a[k].c;return s/n;};
function rsi(arr,i,n){if(i<n)return null;let g=0,l=0;for(let k=i-n+1;k<=i;k++){const d=arr[k].c-arr[k-1].c;if(d>0)g+=d;else l-=d;}const rs=l===0?100:g/l;return 100-100/(1+rs);}
function atr(arr,i,n=14){if(i<n)return null;let s=0;for(let k=i-n+1;k<=i;k++){const tr=Math.max(arr[k].h-arr[k].l,Math.abs(arr[k].h-arr[k-1].c),Math.abs(arr[k].l-arr[k-1].c));s+=tr;}return s/n;}
function stat(tr){if(!tr.length)return null;const w=tr.filter(t=>t.r>0);const rSum=tr.reduce((s,t)=>s+t.r,0);const gp=w.reduce((s,t)=>s+t.r,0),gl=Math.abs(tr.filter(t=>t.r<=0).reduce((s,t)=>s+t.r,0));return{n:tr.length,win:Math.round(w.length/tr.length*100),exp:rSum/tr.length,pf:gl>0?gp/gl:(gp>0?99:0),net:rSum};}

function sim(data,splitT,cfg){
  const trades=[];
  for(const s of data){const{bars}=s;let pos=null;
    for(let i=210;i<bars.length-1;i++){const b=bars[i];
      if(pos){pos.bars++;let exit=null;
        if(b.l<=pos.stop)exit=pos.stop;
        else{const ma5=sma(bars,i,5);
          if(cfg.exit==="ma5"&&ma5!=null&&b.c>ma5)exit=b.c;
          else if(cfg.exit==="rsi"&&rsi(bars,i,2)>70)exit=b.c;
        }
        if(exit==null&&pos.bars>=cfg.timeStop)exit=b.c;
        if(exit!=null){const fill=exit*(1-SLIP);trades.push({r:(fill-pos.entry)/(pos.entry-pos.stop0),oos:pos.entryT>=splitT});pos=null;}
        if(pos)continue;
      }
      const ma200=sma(bars,i,200),ma50=sma(bars,i,50);if(!ma200)continue;
      const price=b.c,r2=rsi(bars,i,2),a=atr(bars,i);if(r2==null||a==null)continue;
      const uptrend = price>ma200 && (!cfg.need50 || (ma50!=null&&price>ma50));
      if(uptrend && r2<cfg.rsiIn){const nx=bars[i+1];const entry=nx.o*(1+SLIP);const stop0=entry-cfg.stopATR*a;if(entry<=stop0)continue;pos={entry,stop0,stop:stop0,entryT:nx.t,bars:0};}
    }
  }
  return trades;
}
(async function(){
  console.log("Fetching data (real Yahoo, 3y)…");
  const spy=await yahoo("SPY");if(!spy){console.log("Yahoo blocked.");return;}
  const data=[];for(const sym of UNIVERSE){const bars=await yahoo(sym);if(!bars)continue;data.push({sym,bars});}
  console.log(`Loaded ${data.length} symbols.`);
  const splitT=spy[Math.floor(spy.length*OOS_SPLIT)].t;
  const configs=[];
  for(const rsiIn of [5,10,15])for(const need50 of [false,true])for(const stopATR of [2,3])for(const exit of ["ma5","rsi"])for(const timeStop of [5,10])
    configs.push({rsiIn,need50,stopATR,exit,timeStop});
  const rows=[];
  for(const cfg of configs){const tr=sim(data,splitT,cfg);rows.push({cfg,oos:stat(tr.filter(t=>t.oos)),is:stat(tr.filter(t=>!t.oos))});}
  rows.sort((a,b)=>((b.oos?.exp||-9)-(a.oos?.exp||-9)));
  const name=c=>`RSI2<${c.rsiIn} ${c.need50?">50&200":">200"} stop${c.stopATR} ${c.exit} t${c.timeStop}`.padEnd(30);
  console.log("\n===== MEAN-REVERSION CONFIGS, ranked by OUT-OF-SAMPLE expectancy =====");
  console.log("config                         | OOS: n   win  exp    pf   | IS: exp   pf");
  for(const r of rows){const o=r.oos,is=r.is;console.log(`${name(r.cfg)}| ${String(o?.n||0).padStart(4)} ${String((o?.win||0)+"%").padStart(4)} ${(o?o.exp.toFixed(2):" - ").padStart(6)}R ${(o?o.pf.toFixed(2):" -").padStart(5)} | ${(is?is.exp.toFixed(2):" -").padStart(5)}R ${(is?is.pf.toFixed(2):" -").padStart(5)}`);}
  const robust=rows.filter(r=>r.oos&&r.oos.exp>0.05&&r.oos.pf>=1.2&&r.is&&r.is.exp>0&&r.oos.n>=40);
  const posOOS=rows.filter(r=>r.oos&&r.oos.exp>0);
  console.log(`\n${posOOS.length}/${rows.length} configs positive out-of-sample.`);
  console.log(`${robust.length}/${rows.length} ROBUST (OOS exp>0.05R, PF>=1.2, n>=40, AND positive in-sample).`);
  console.log(robust.length>=3?"\n=> A robust mean-reversion edge region MAY exist — see top rows.":"\n=> NO robust mean-reversion edge either.");
})();
