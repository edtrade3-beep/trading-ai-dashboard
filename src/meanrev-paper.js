// Forward paper-tracker for the CONCENTRATED mean-reversion signal — the one
// strategy that showed a real (if marginal) out-of-sample edge in the audit.
// It places NO orders. It simulates entries/exits on daily bars and logs
// hypothetical P&L so you can watch whether the edge holds forward. Zero risk.
// Enable with MEANREV_PAPER=on. Runs once/day after the close.
const path = require("node:path");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { sendTelegramMessage, isConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { isOn } = require("./utils");

const STATE_PATH = path.join(__dirname, "..", "data", "meanrev-paper.json");
const UNIVERSE = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","AVGO","TSLA","AMD","NFLX",
  "CRM","ORCL","ADBE","NOW","PANW","CRWD","PLTR","SNOW","MU","QCOM",
  "ANET","MRVL","SMCI","ARM","COIN","UBER","ABNB","SHOP","INTU","LRCX",
  "LLY","V","MA","JPM","COST","WMT","HD","AXP","GE","CAT",
];
// Best audited config: RSI2<10 · within 4% of a rising 50-MA · RVOL≥1.3 · 2×ATR stop · exit on close>MA5 or 12-day time stop.
const CFG = { rsiIn: 10, near: 0.04, rvol: 1.3, stopATR: 2, timeStop: 12 };

async function yahoo(sym) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1y&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const res = (await r.json())?.chart?.result?.[0]; if (!res) return null;
    const t = res.timestamp || [], q = res.indicators?.quote?.[0] || {}; const bars = [];
    for (let i = 0; i < t.length; i++) { const o=q.open?.[i],h=q.high?.[i],l=q.low?.[i],c=q.close?.[i],v=q.volume?.[i]; if ([o,h,l,c].some(x=>x==null)) continue; bars.push({ t:t[i]*1000,o,h,l,c,v:v||0 }); }
    return bars.length > 210 ? bars : null;
  } catch { return null; }
}
const sma = (a,i,n) => { if (i<n-1) return null; let s=0; for (let k=i-n+1;k<=i;k++) s+=a[k].c; return s/n; };
const vavg = (a,i,n) => { if (i<n-1) return null; let s=0; for (let k=i-n+1;k<=i;k++) s+=a[k].v; return s/n; };
function rsi(a,i,n){if(i<n)return null;let g=0,l=0;for(let k=i-n+1;k<=i;k++){const d=a[k].c-a[k-1].c;if(d>0)g+=d;else l-=d;}const rs=l===0?100:g/l;return 100-100/(1+rs);}
function atr(a,i,n=14){if(i<n)return null;let s=0;for(let k=i-n+1;k<=i;k++){const tr=Math.max(a[k].h-a[k].l,Math.abs(a[k].h-a[k-1].c),Math.abs(a[k].l-a[k-1].c));s+=tr;}return s/n;}

function load() { return readJsonSafe(STATE_PATH, { open: {}, closed: [] }); }
function save(st) { try { writeJsonAtomic(STATE_PATH, st); } catch {} }

async function runMeanrevPaper() {
  if (!isOn(process.env.MEANREV_PAPER)) return;
  const st = load();
  let opened = 0, closedNow = 0;
  for (const sym of UNIVERSE) {
    const bars = await yahoo(sym); if (!bars) continue;
    const i = bars.length - 1, b = bars[i];
    const ma200 = sma(bars, i, 200), ma50 = sma(bars, i, 50), ma50p = sma(bars, i - 20, 50), ma5 = sma(bars, i, 5);
    const a = atr(bars, i), av = vavg(bars, i, 20), r2 = rsi(bars, i, 2);
    if (!ma200 || !ma50 || !ma50p || !a || !av || r2 == null) continue;

    const pos = st.open[sym];
    if (pos) {
      let exit = null, why = "";
      if (b.l <= pos.stop) { exit = pos.stop; why = "stop"; }
      else if (ma5 != null && b.c > ma5) { exit = b.c; why = "bounce (>MA5)"; }
      else if ((pos.days || 0) + 1 >= CFG.timeStop) { exit = b.c; why = "time"; }
      if (exit != null) {
        const r = (exit - pos.entry) / (pos.entry - pos.stop0);
        st.closed.push({ sym, entry: pos.entry, exit, r, why, closedAt: b.t });
        delete st.open[sym]; closedNow++;
      } else { pos.days = (pos.days || 0) + 1; pos.stop = pos.stop; }
      continue;
    }
    const rvol = b.v / av;
    const uptrend = b.c > ma200 && ma50 > ma50p;
    const atSupport = Math.abs(b.c - ma50) / ma50 <= CFG.near;
    if (uptrend && atSupport && rvol >= CFG.rvol && r2 < CFG.rsiIn) {
      const entry = b.c, stop0 = entry - CFG.stopATR * a;
      if (entry > stop0) { st.open[sym] = { entry, stop0, stop: stop0, openedAt: b.t, days: 0 }; opened++; }
    }
  }
  st.closed = st.closed.slice(-500);
  save(st);
  if (opened || closedNow) console.log(`[Meanrev paper] +${opened} entries · ${closedNow} exits · ${Object.keys(st.open).length} open`);
}

function summaryLine() {
  const st = load();
  const c = st.closed || [];
  if (!c.length) return `📄 MEAN-REV PAPER — ${Object.keys(st.open).length} open · no closed trades yet.`;
  const wins = c.filter(t => t.r > 0);
  const net = c.reduce((s, t) => s + t.r, 0);
  const gp = wins.reduce((s, t) => s + t.r, 0), gl = Math.abs(c.filter(t => t.r <= 0).reduce((s, t) => s + t.r, 0));
  const pf = gl > 0 ? gp / gl : (gp > 0 ? 99 : 0);
  return `📄 MEAN-REV PAPER (forward test, no real orders)\n${c.length} closed · ${Math.round(wins.length / c.length * 100)}% win · ${(net / c.length).toFixed(2)}R avg · PF ${pf.toFixed(2)} · net ${net.toFixed(1)}R\nOpen now: ${Object.keys(st.open).length}\n\n(Watching whether the audited edge holds. Not tradeable until PF≥1.3 & +0.1R hold forward.)`;
}
async function sendMeanrevSummary() {
  if (!isOn(process.env.MEANREV_PAPER) || !isConfigured()) return;
  if (!shouldSendAlert({ category: "recap" })) return;
  await sendTelegramMessage(summaryLine()).catch(() => {});
}

module.exports = { runMeanrevPaper, sendMeanrevSummary, summaryLine };
