const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src/routes/market.js');
let content = fs.readFileSync(filePath, 'utf8');

const newEndpoints = `
  // GET /api/market/feargreed
  if (pathname === "/api/market/feargreed" && req.method === "GET") {
    try {
      const [spyBars, vixBars, tltBars, hygBars] = await Promise.all([
        withTimeout(fetchYahooBars("SPY",  "1y",  "1d"), 12000, []),
        withTimeout(fetchYahooBars("^VIX", "3mo", "1d"), 10000, []),
        withTimeout(fetchYahooBars("TLT",  "3mo", "1d"), 10000, []),
        withTimeout(fetchYahooBars("HYG",  "3mo", "1d"), 10000, []),
      ]);
      const { computeRSI } = require("../indicators");
      const vix = vixBars.at(-1)?.close ?? 20;
      const vixScore = Math.max(0, Math.min(100, Math.round(100 - ((vix - 10) / 35) * 100)));
      const spyCloses = spyBars.map(b => b.close);
      const spyCurrent = spyCloses.at(-1) ?? 0;
      const spy125 = spyCloses.length >= 125
        ? spyCloses.slice(-125).reduce((a, b) => a + b, 0) / 125 : spyCurrent;
      const spyMaDiff = spy125 > 0 ? ((spyCurrent - spy125) / spy125) * 100 : 0;
      const momentumScore = Math.max(0, Math.min(100, Math.round(50 + spyMaDiff * 8)));
      const spyRsi = spyCloses.length >= 15 ? computeRSI(spyCloses, 14) : 50;
      const rsiScore = Math.max(0, Math.min(100, Math.round(spyRsi)));
      const slice252 = spyCloses.slice(-252);
      const spy52h = Math.max(...slice252), spy52l = Math.min(...slice252);
      const rangeScore = spy52h > spy52l
        ? Math.round(((spyCurrent - spy52l) / (spy52h - spy52l)) * 100) : 50;
      const tltCloses = tltBars.map(b => b.close);
      const tlt20 = tltCloses.length >= 20 ? tltCloses.slice(-20).reduce((a,b)=>a+b,0)/20 : (tltCloses.at(-1)??0);
      const tltCur = tltCloses.at(-1) ?? tlt20;
      const tltDiff = tlt20 > 0 ? ((tltCur - tlt20) / tlt20) * 100 : 0;
      const safeHavenScore = Math.max(0, Math.min(100, Math.round(50 - tltDiff * 10)));
      const hygCloses = hygBars.map(b => b.close);
      const hyg20 = hygCloses.length >= 20 ? hygCloses.slice(-20).reduce((a,b)=>a+b,0)/20 : (hygCloses.at(-1)??0);
      const hygCur = hygCloses.at(-1) ?? hyg20;
      const hygDiff = hyg20 > 0 ? ((hygCur - hyg20) / hyg20) * 100 : 0;
      const junkScore = Math.max(0, Math.min(100, Math.round(50 + hygDiff * 20)));
      const composite = Math.round(
        vixScore*0.30 + momentumScore*0.25 + rsiScore*0.15 +
        rangeScore*0.15 + safeHavenScore*0.08 + junkScore*0.07
      );
      const fgLabel = composite<=25?"EXTREME FEAR":composite<=45?"FEAR":composite<=55?"NEUTRAL":composite<=75?"GREED":"EXTREME GREED";
      const sign = n => n >= 0 ? "+" : "";
      return writeJson(res, 200, {
        ok:true, fetchedAt:new Date().toISOString(),
        score:composite, label:fgLabel, vix:round2(vix),
        components:[
          {name:"VIX Level",         score:vixScore,       weight:30, detail:"VIX at " + round2(vix)},
          {name:"Market Momentum",   score:momentumScore,  weight:25, detail:"SPY " + sign(spyMaDiff) + round2(spyMaDiff) + "% vs 125d MA"},
          {name:"RSI (14)",          score:rsiScore,       weight:15, detail:"SPY RSI = " + round2(spyRsi)},
          {name:"52-Week Range",     score:rangeScore,     weight:15, detail:"SPY at " + rangeScore + "% of 52w range"},
          {name:"Safe Haven Demand", score:safeHavenScore, weight:8,  detail:"TLT " + sign(tltDiff) + round2(tltDiff) + "% (20d)"},
          {name:"Junk Bond Demand",  score:junkScore,      weight:7,  detail:"HYG " + sign(hygDiff) + round2(hygDiff) + "% (20d)"},
        ],
      });
    } catch(err) {
      return writeJson(res, 422, {error:err?.message||"Fear & Greed fetch failed"});
    }
  }

  // GET /api/market/breadth
  if (pathname === "/api/market/breadth" && req.method === "GET") {
    const SECTORS = [
      {sym:"XLK",name:"Technology"},{sym:"XLF",name:"Financials"},{sym:"XLE",name:"Energy"},
      {sym:"XLV",name:"Health Care"},{sym:"XLI",name:"Industrials"},{sym:"XLY",name:"Cons. Discret."},
      {sym:"XLP",name:"Cons. Staples"},{sym:"XLRE",name:"Real Estate"},{sym:"XLU",name:"Utilities"},
      {sym:"XLB",name:"Materials"},{sym:"XLC",name:"Comm. Services"},
    ];
    const INDICES = [
      {sym:"SPY",name:"S&P 500"},{sym:"QQQ",name:"Nasdaq 100"},
      {sym:"IWM",name:"Russell 2000"},{sym:"DIA",name:"Dow Jones"},
    ];
    const all = [...SECTORS, ...INDICES];
    const barsArr = await Promise.allSettled(
      all.map(({sym}) => withTimeout(fetchYahooBars(sym,"1y","1d"),9000,[]))
    );
    const results = all.map(({sym,name},i) => {
      const bars = barsArr[i].status==="fulfilled" ? barsArr[i].value : [];
      if (bars.length < 2) return {sym,name,price:0,change:0,ma50:null,ma200:null,above50:null,above200:null,pos52w:50,status:"N/A"};
      const closes = bars.map(b=>b.close);
      const cur=closes.at(-1), prev=closes.at(-2);
      const change = prev ? round2(((cur-prev)/prev)*100) : 0;
      const ma50  = closes.length>=50  ? round2(closes.slice(-50).reduce((a,b)=>a+b,0)/50)  : null;
      const ma200 = closes.length>=200 ? round2(closes.slice(-200).reduce((a,b)=>a+b,0)/200): null;
      const s252=closes.slice(-252), h52=Math.max(...s252), l52=Math.min(...s252);
      const pos52w = h52>l52 ? round2(((cur-l52)/(h52-l52))*100) : 50;
      const above50=ma50!=null?cur>ma50:null, above200=ma200!=null?cur>ma200:null;
      const status=(above200&&above50&&change>0)?"Bullish":(!above200||change<-0.5)?"Bearish":"Neutral";
      return {sym,name,price:round2(cur),change,ma50,ma200,above50,above200,pos52w,status};
    });
    const sectors=results.slice(0,SECTORS.length), indices=results.slice(SECTORS.length);
    const tot=sectors.length;
    const adv=sectors.filter(s=>s.change>0).length;
    const ab50=sectors.filter(s=>s.above50).length;
    const ab200=sectors.filter(s=>s.above200).length;
    return writeJson(res,200,{
      ok:true,fetchedAt:new Date().toISOString(),
      summary:{
        advancingPct:round2((adv/tot)*100), decliningPct:round2(((tot-adv)/tot)*100),
        above50Pct:round2((ab50/tot)*100), above200Pct:round2((ab200/tot)*100),
        adRatio:round2(adv/Math.max(1,tot-adv)),
      },
      sectors, indices,
    });
  }

  // GET /api/market/seasonality?ticker=SPY
  if (pathname === "/api/market/seasonality" && req.method === "GET") {
    const sticker=(searchParams.get("ticker")||"SPY").trim().toUpperCase();
    const sbars = await withTimeout(fetchYahooBars(sticker,"5y","1d"),18000,[]);
    if (sbars.length<10) return writeJson(res,422,{error:"No data for " + sticker});
    const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const monthly=Array.from({length:12},()=>[]);
    const weekly =Array.from({length:7 },()=>[]);
    for (let i=1;i<sbars.length;i++) {
      const ret=((sbars[i].close-sbars[i-1].close)/sbars[i-1].close)*100;
      if (!Number.isFinite(ret)) continue;
      const d=new Date(sbars[i].time*1000);
      monthly[d.getMonth()].push(ret);
      weekly[d.getDay()].push(ret);
    }
    const monthlyAvg=monthly.map((rets,i)=>({
      month:MONTHS[i],
      avgReturn:rets.length?round2(rets.reduce((a,b)=>a+b,0)/rets.length):null,
      count:rets.length,
      winRate:rets.length?round2((rets.filter(r=>r>0).length/rets.length)*100):null,
    }));
    const dowAvg=weekly.map((rets,i)=>({
      day:DAYS[i],
      avgReturn:rets.length?round2(rets.reduce((a,b)=>a+b,0)/rets.length):null,
      count:rets.length,
      winRate:rets.length?round2((rets.filter(r=>r>0).length/rets.length)*100):null,
    })).filter(d=>d.count>0);
    return writeJson(res,200,{ok:true,ticker:sticker,fetchedAt:new Date().toISOString(),dataPoints:sbars.length,months:monthlyAvg,daysOfWeek:dowAvg});
  }

`;

const anchor = `  // GET /api/market/candles?ticker=BBAI&timeframe=1D`;
if (!content.includes(anchor)) { console.error("Anchor not found!"); process.exit(1); }
content = content.replace(anchor, newEndpoints + anchor);
fs.writeFileSync(filePath, content);
console.log('market.js updated, new size:', content.length);
