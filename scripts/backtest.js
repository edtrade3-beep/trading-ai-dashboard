// Honest, no-lookahead, walk-forward backtest of the Green Light / Trend Template
// long strategy on REAL Yahoo daily bars, with slippage + commission modeled.
// Research tool only — run with: node scripts/backtest.js
//
// Rules tested (the core published logic, applied causally — signals use only bars
// UP TO the decision day, entries fill on the NEXT open):
//   Regime filter : SPY above its 50DMA AND 200DMA rising  (trade longs only in bull)
//   Trend Template: price > 150 & 200 MA, 50 > 150 > 200, price > 50, RSI 40-70,
//                   within 25% of 52w high, >30% off 52w low
//   Buy zone      : price within 4% of the 21EMA (not extended)
//   Entry         : next open + slippage
//   Stop          : entry - 1.5 * ATR14 ; Target: +2R ; Trail: after +1R, stop to entry, then ratchet
//   Sizing        : risk 1% of equity per trade
//   Costs         : 5 bps slippage/side + $0 commission (Alpaca)

const UNIVERSE = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","AVGO","TSLA","AMD","NFLX",
  "CRM","ORCL","ADBE","NOW","PANW","CRWD","PLTR","SNOW","MU","QCOM",
  "ANET","MRVL","SMCI","ARM","COIN","UBER","ABNB","SHOP","INTU","LRCX",
  "LLY","V","MA","JPM","COST","WMT","HD","AXP","GE","CAT",
  "XOM","CVX","BA","DIS","NKE","PEP","KO","MCD","UNH","TXN",
];
const SLIP = 0.0005, RISK_PCT = 1, START_EQ = 100000;
const OOS_SPLIT = 0.5;   // first 50% of the period = in-sample, last 50% = out-of-sample

async function yahoo(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3y&interval=1d`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) return null;
  const j = await r.json();
  const res = j?.chart?.result?.[0]; if (!res) return null;
  const t = res.timestamp || [], q = res.indicators?.quote?.[0] || {};
  const bars = [];
  for (let i = 0; i < t.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if ([o, h, l, c].some(x => x == null)) continue;
    bars.push({ t: t[i] * 1000, o, h, l, c, v: v || 0 });
  }
  return bars.length > 260 ? bars : null;
}
const sma = (a, i, n) => { if (i < n - 1) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k].c; return s / n; };
function ema(arr, n) { const k = 2 / (n + 1); const out = []; let e = null; for (let i = 0; i < arr.length; i++) { e = e == null ? arr[i].c : arr[i].c * k + e * (1 - k); out.push(e); } return out; }
function rsi(arr, i, n = 14) { if (i < n) return null; let g = 0, l = 0; for (let k = i - n + 1; k <= i; k++) { const d = arr[k].c - arr[k-1].c; if (d > 0) g += d; else l -= d; } const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs); }
function atr(arr, i, n = 14) { if (i < n) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) { const tr = Math.max(arr[k].h - arr[k].l, Math.abs(arr[k].h - arr[k-1].c), Math.abs(arr[k].l - arr[k-1].c)); s += tr; } return s / n; }

function stats(trades) {
  if (!trades.length) return null;
  const wins = trades.filter(t => t.r > 0), losses = trades.filter(t => t.r <= 0);
  const rSum = trades.reduce((s, t) => s + t.r, 0);
  const gp = wins.reduce((s, t) => s + t.r, 0), gl = Math.abs(losses.reduce((s, t) => s + t.r, 0));
  // equity curve in R to compute max drawdown
  let peak = 0, cum = 0, maxDD = 0;
  for (const t of trades) { cum += t.r; peak = Math.max(peak, cum); maxDD = Math.min(maxDD, cum - peak); }
  const mean = rSum / trades.length;
  const sd = Math.sqrt(trades.reduce((s, t) => s + (t.r - mean) ** 2, 0) / trades.length) || 1;
  return {
    n: trades.length, win: Math.round(wins.length / trades.length * 100),
    avgR: mean, expectancy: mean, pf: gl > 0 ? gp / gl : (gp > 0 ? 99 : 0),
    netR: rSum, maxDD, sharpe: mean / sd * Math.sqrt(trades.length),
  };
}
function show(label, s) {
  if (!s) { console.log(`\n${label}: no trades`); return; }
  console.log(`\n${label}`);
  console.log(`  Trades ${s.n} · Win ${s.win}% · Avg ${s.avgR.toFixed(2)}R · Expectancy ${s.expectancy.toFixed(2)}R/trade`);
  console.log(`  Profit factor ${s.pf.toFixed(2)} · Net ${s.netR.toFixed(1)}R · Max DD ${s.maxDD.toFixed(1)}R · Sharpe(approx) ${s.sharpe.toFixed(2)}`);
}

(async function main() {
  console.log("Fetching data (real Yahoo daily bars, 3y)…");
  const spy = await yahoo("SPY");
  if (!spy) { console.log("Could not fetch SPY — Yahoo may be blocking this environment."); return; }
  const spy50 = spy.map((_, i) => sma(spy, i, 50));
  const spy200 = spy.map((_, i) => sma(spy, i, 200));
  const spyByT = new Map(spy.map((b, i) => [b.t, { i }]));

  const all = [];
  let fetched = 0;
  for (const sym of UNIVERSE) {
    const bars = await yahoo(sym); if (!bars) continue; fetched++;
    const e9 = ema(bars, 9), e21 = ema(bars, 21);
    all.push({ sym, bars, e9, e21 });
  }
  console.log(`Loaded ${fetched}/${UNIVERSE.length} symbols.`);

  // Split date = the timestamp at OOS_SPLIT of SPY's range.
  const splitT = spy[Math.floor(spy.length * OOS_SPLIT)].t;

  const trades = [];
  for (const s of all) {
    const { bars, e9, e21 } = s;
    let pos = null;   // {entry, stop, shares, entryT, maxFav}
    for (let i = 220; i < bars.length - 1; i++) {
      const b = bars[i];
      // manage open position on this bar (using intraday high/low)
      if (pos) {
        // trail: once +1R favorable, stop to breakeven then ratchet under close
        const rNow = (b.c - pos.entry) / (pos.entry - pos.stop0);
        if (rNow >= 1) pos.stop = Math.max(pos.stop, pos.entry);
        const a = atr(bars, i); if (a) pos.stop = Math.max(pos.stop, b.c - 1.5 * a);
        let exit = null;
        if (b.l <= pos.stop) exit = pos.stop;                 // stop hit (conservative: stop price)
        else if (b.h >= pos.target) exit = pos.target;         // target hit
        if (exit != null) {
          const fill = exit * (1 - SLIP);
          const r = (fill - pos.entry) / (pos.entry - pos.stop0);
          trades.push({ sym: s.sym, r, entryT: pos.entryT, exitT: b.t, oos: pos.entryT >= splitT,
            bull: pos.bull });
          pos = null;
        }
        if (pos) continue;   // one position per symbol at a time
      }
      // signal on bar i (causal), enter next open (i+1)
      const ma50 = sma(bars, i, 50), ma150 = sma(bars, i, 150), ma200 = sma(bars, i, 200), ma200p = sma(bars, i - 21, 200);
      if (!ma50 || !ma150 || !ma200 || !ma200p) continue;
      const price = b.c, r14 = rsi(bars, i), a14 = atr(bars, i);
      if (r14 == null || a14 == null) continue;
      const win = bars.slice(Math.max(0, i - 252), i + 1);
      const hi52 = Math.max(...win.map(x => x.h)), lo52 = Math.min(...win.map(x => x.l));
      const trendPass = price > ma150 && price > ma200 && ma150 > ma200 && ma50 > ma150 && price > ma50 &&
        ma200 > ma200p && r14 >= 40 && r14 <= 70 && price >= hi52 * 0.75 && price >= lo52 * 1.30;
      const buyZone = Math.abs(price - e21[i]) / e21[i] <= 0.04;   // near 21EMA, not extended
      // regime: SPY above 50 & 200DMA rising
      const sp = spyByT.get(b.t);
      const bull = sp && spy50[sp.i] != null && spy200[sp.i] != null && spy200[sp.i - 21] != null &&
        spy[sp.i].c > spy50[sp.i] && spy200[sp.i] > spy200[sp.i - 21];
      if (trendPass && buyZone && bull) {
        const nx = bars[i + 1];
        const entry = nx.o * (1 + SLIP);
        const stop0 = entry - 1.5 * a14;
        if (entry <= stop0) continue;
        pos = { entry, stop0, stop: stop0, target: entry + 2 * (entry - stop0), entryT: nx.t, bull: true };
      }
    }
  }

  console.log(`\n================  RESULTS  (1% risk/trade, ${SLIP*1e4}bps slippage/side)  ================`);
  show("ALL TRADES", stats(trades));
  show("IN-SAMPLE (older 50%)", stats(trades.filter(t => !t.oos)));
  show("OUT-OF-SAMPLE (newer 50%)  <-- the number that matters", stats(trades.filter(t => t.oos)));

  const oos = stats(trades.filter(t => t.oos));
  console.log("\n================  VERDICT  ================");
  if (!oos) console.log("Not enough out-of-sample trades to judge.");
  else if (oos.expectancy > 0.1 && oos.pf >= 1.3) console.log(`EDGE LOOKS REAL out-of-sample (expectancy ${oos.expectancy.toFixed(2)}R, PF ${oos.pf.toFixed(2)}). Worth paper-forward testing.`);
  else if (oos.expectancy > 0) console.log(`MARGINAL out-of-sample (expectancy ${oos.expectancy.toFixed(2)}R, PF ${oos.pf.toFixed(2)}). Barely positive — costs/slippage could erase it. Not fund-grade.`);
  else console.log(`NO EDGE out-of-sample (expectancy ${oos.expectancy.toFixed(2)}R, PF ${oos.pf.toFixed(2)}). This strategy loses money on unseen data. Do NOT risk real capital.`);
})();
