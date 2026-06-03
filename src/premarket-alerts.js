// Pre-market Telegram alerts — fires at 7:00 AM and 9:00 AM Eastern Time every weekday.
// Uses the same gap-scan universe as the Gap Scanner tab.
// No new dependencies — pure Node.js + existing platform modules.

const { fetchYahooQuoteBatch } = require("./providers/yahoo");
const { sendTelegramMessage, isConfigured } = require("./telegram");

const GAP_UNIVERSE = [
  "NVDA","TSLA","AAPL","META","AMZN","GOOGL","MSFT","AMD","NFLX","COIN",
  "SMCI","ARM","PLTR","RIVN","SOFI","MARA","RIOT","HOOD","RBLX",
  "UPST","AFRM","DKNG","SNOW","PATH","AI","CRWD","ZS","PANW","NET",
  "BBAI","SERV","SMR","LUNR","ASTS","RKLB","SOUN","RGTI","IONQ","ACHR",
  "MSTR","IBIT","CLSK","IREN","HUT",
  "SYM","OKLO","NNE","RDW","APLD","CORZ","VST","CEG","GEV","CCJ",
  "SPY","QQQ","IWM","UVXY",
  "UBER","LYFT","SNAP","PINS","RDDT","ABNB","DASH",
  "HIMS","RXRX","MRNA","BNTX",
  "BABA","JD","NIO","XPEV","LI",
];

function round2(n) { return Math.round(n * 100) / 100; }

// Return current time in US Eastern (handles DST automatically)
function nowET() {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(etStr);
}

function isWeekday() {
  const day = nowET().getDay(); // 0=Sun, 6=Sat
  return day >= 1 && day <= 5;
}

async function runPreMarketAlert(label) {
  if (!isConfigured()) {
    console.log(`[PreMarket] Telegram not configured — skipping ${label} alert`);
    return;
  }
  console.log(`[PreMarket] Running ${label} ET alert…`);
  try {
    const CHUNK = 20;
    const chunks = [];
    for (let i = 0; i < GAP_UNIVERSE.length; i += CHUNK)
      chunks.push(GAP_UNIVERSE.slice(i, i + CHUNK));
    const settled = await Promise.allSettled(chunks.map(c => fetchYahooQuoteBatch(c)));
    const raw = settled.flatMap(r => r.status === "fulfilled" ? r.value : []);

    const gappers = raw
      .filter(q => q && q.regularMarketPreviousClose)
      .map(q => {
        const sym       = String(q.symbol || "").toUpperCase();
        const prevClose = Number(q.regularMarketPreviousClose || 0);
        const prePrice  = Number(q.preMarketPrice || 0);
        const openPrice = Number(q.regularMarketOpen || q.regularMarketPrice || 0);
        const refPrice  = prePrice > 0 ? prePrice : openPrice;
        const gapPct    = prevClose > 0 ? round2((refPrice - prevClose) / prevClose * 100)
                        : round2(Number(q.regularMarketChangePercent || 0));
        const vol       = Number(q.regularMarketVolume || 0);
        const avgVol    = Number(q.averageDailyVolume3Month || q.averageDailyVolume10Day || 1);
        const rvol      = avgVol > 0 ? round2(vol / avgVol) : 0;
        return { sym, gapPct, rvol, price: round2(refPrice || Number(q.regularMarketPrice || 0)), hasPreMkt: prePrice > 0 };
      })
      .filter(s => Math.abs(s.gapPct) >= 1)
      .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct));

    const gapUp   = gappers.filter(s => s.gapPct >= 1).slice(0, 6);
    const gapDown = gappers.filter(s => s.gapPct <= -1).slice(0, 4);

    if (!gapUp.length && !gapDown.length) {
      console.log("[PreMarket] No meaningful gappers found — not sending alert");
      return;
    }

    const date = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
    const fmt = s => {
      const arrow = s.gapPct > 0 ? "🟢" : "🔴";
      const pre   = s.hasPreMkt ? " [PRE]" : "";
      return `${arrow} ${s.sym}${pre}  ${s.gapPct > 0 ? "+" : ""}${s.gapPct}%  $${s.price}  rvol ${s.rvol}x`;
    };

    const lines = [
      `⚡ PRE-MARKET GAPS — ${label} ET`,
      `📅 ${date}`,
      `━━━━━━━━━━━━━━━━━━━━`,
    ];
    if (gapUp.length) {
      lines.push(`🔼 GAP UP`);
      gapUp.map(fmt).forEach(r => lines.push(r));
      lines.push("");
    }
    if (gapDown.length) {
      lines.push(`🔽 GAP DOWN`);
      gapDown.map(fmt).forEach(r => lines.push(r));
      lines.push("");
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`${gappers.length} gappers from ${GAP_UNIVERSE.length} symbols`);
    lines.push(`Type /today for top setups · /score TICKER for analysis`);
    const msg = lines.join("\n");

    await sendTelegramMessage(msg);
    console.log(`[PreMarket] ${label} alert sent — ${gappers.length} gappers`);
  } catch (e) {
    console.error(`[PreMarket] ${label} alert failed:`, e.message);
  }
}

// ── Scheduler ────────────────────────────────────────────────────────────────
// Check every minute whether it's time to fire. Tracks last fired date so it
// only fires once per day per slot even if the server restarts mid-day.
const fired = { "7am": null, "9am": null };

function checkAlertTime() {
  if (!isWeekday()) return;
  const et   = nowET();
  const h    = et.getHours();
  const m    = et.getMinutes();
  const today = `${et.getFullYear()}-${et.getMonth()}-${et.getDate()}`;

  // Only 9:00 AM — the most actionable time (30 min before open)
  // 7:00 AM removed: too early, most traders aren't watching yet
  if (h === 9 && m === 0 && fired["9am"] !== today) {
    fired["9am"] = today;
    runPreMarketAlert("9:00 AM").catch(() => {});
  }
}

function startPreMarketAlerts() {
  setInterval(checkAlertTime, 60_000); // check every minute
  console.log("[PreMarket] Pre-market alert active — 9:00 AM ET weekdays only");
}

module.exports = { startPreMarketAlerts, runPreMarketAlert };
