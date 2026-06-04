// Monitor extras: Futures, Pre-Market Movers, Event Countdowns
// All use Yahoo Finance (already in the platform) — no new dependencies

const { fetchJsonSafe, withTimeout, writeJson } = require("../utils");

const CACHE = {};
const TTL   = 4 * 60 * 1000; // 4 min

function cached(key, ttl, fn) {
  const c = CACHE[key];
  if (c && Date.now() - c.ts < ttl) return Promise.resolve(c.data);
  return fn().then(data => { CACHE[key] = { data, ts: Date.now() }; return data; });
}

// ── Futures ───────────────────────────────────────────────────────────────────
const FUTURES_SYMBOLS = [
  { sym: "ES",  yahoo: "ES=F",  label: "S&P 500" },
  { sym: "NQ",  yahoo: "NQ=F",  label: "Nasdaq" },
  { sym: "RTY", yahoo: "RTY=F", label: "Russell" },
  { sym: "YM",  yahoo: "YM=F",  label: "Dow" },
  { sym: "GC",  yahoo: "GC=F",  label: "Gold" },
  { sym: "CL",  yahoo: "CL=F",  label: "Oil" },
];

async function fetchFutures() {
  return cached("futures", TTL, async () => {
    const syms = FUTURES_SYMBOLS.map(f => f.yahoo).join(",");
    const url  = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketChange`;
    const data = await withTimeout(fetchJsonSafe(url), 8000, null);
    const quotes = data?.quoteResponse?.result || [];
    return FUTURES_SYMBOLS.map(f => {
      const q   = quotes.find(r => r.symbol === f.yahoo) || {};
      const price = Number(q.regularMarketPrice || 0);
      const chg   = Number(q.regularMarketChangePercent || 0);
      return { sym: f.sym, label: f.label, price, chg };
    }).filter(f => f.price > 0);
  });
}

// ── Pre-Market Movers ─────────────────────────────────────────────────────────
const PM_UNIVERSE = [
  "NVDA","TSLA","AAPL","META","AMZN","GOOGL","MSFT","AMD","NFLX","COIN",
  "SMCI","PLTR","MSTR","RIVN","SOFI","MARA","RIOT","HOOD","RBLX","UPST",
  "AFRM","DKNG","SNOW","CRWD","NET","BBAI","SOUN","RGTI","IONQ","ACHR",
  "IBIT","SPY","QQQ","IWM","UVXY","ASTS","RKLB","OKLO","SMR",
];

async function fetchPreMarketMovers() {
  return cached("preMktMovers", TTL, async () => {
    const CHUNK = 20;
    const chunks = [];
    for (let i = 0; i < PM_UNIVERSE.length; i += CHUNK)
      chunks.push(PM_UNIVERSE.slice(i, i + CHUNK));

    const results = await Promise.allSettled(chunks.map(c => {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${c.join(",")}&fields=regularMarketPrice,regularMarketChangePercent,preMarketPrice,preMarketChangePercent,regularMarketPreviousClose`;
      return withTimeout(fetchJsonSafe(url), 8000, null);
    }));

    const quotes = results.flatMap(r =>
      r.status === "fulfilled" ? (r.value?.quoteResponse?.result || []) : []
    );

    const now = new Date();
    const etHour = Number(new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getHours());
    const isPreMkt = etHour < 9 || (etHour === 9 && new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getMinutes() < 30);

    const movers = quotes
      .map(q => {
        const sym   = String(q.symbol || "").toUpperCase();
        const prev  = Number(q.regularMarketPreviousClose || 0);
        let chg = 0;
        if (isPreMkt && q.preMarketPrice && prev > 0) {
          chg = (Number(q.preMarketPrice) - prev) / prev * 100;
        } else {
          chg = Number(q.regularMarketChangePercent || 0);
        }
        const price = isPreMkt && q.preMarketPrice ? Number(q.preMarketPrice) : Number(q.regularMarketPrice || 0);
        return { sym, chg: Math.round(chg * 100) / 100, price: Math.round(price * 100) / 100 };
      })
      .filter(m => Math.abs(m.chg) >= 1 && m.price > 0)
      .sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))
      .slice(0, 10);

    return movers;
  });
}

// ── Event Countdowns ──────────────────────────────────────────────────────────
// Key macro events — updated manually each quarter
// Days until each event, computed at runtime from fixed dates

const FIXED_EVENTS = [
  // FOMC meetings 2025-2026
  { name: "FOMC",    dates: ["2025-07-30","2025-09-17","2025-10-29","2025-12-10","2026-01-28","2026-03-18","2026-04-29","2026-06-17","2026-07-29","2026-09-16","2026-10-28","2026-12-09"] },
  // CPI releases (approx 2nd/3rd Wed each month)
  { name: "CPI",     dates: ["2025-07-11","2025-08-12","2025-09-10","2025-10-14","2025-11-12","2025-12-10","2026-01-14","2026-02-11","2026-03-11","2026-04-10","2026-05-13","2026-06-10","2026-07-14"] },
  // Jobs Report (1st Friday each month)
  { name: "Jobs",    dates: ["2025-07-04","2025-08-01","2025-09-05","2025-10-03","2025-11-07","2025-12-05","2026-01-09","2026-02-06","2026-03-06","2026-04-03","2026-05-08","2026-06-05","2026-07-10"] },
  // GDP (advance estimate, last Thurs of Jan/Apr/Jul/Oct)
  { name: "GDP",     dates: ["2025-07-30","2025-10-30","2026-01-29","2026-04-30","2026-07-30"] },
  // PCE (last Fri of each month approx)
  { name: "PCE",     dates: ["2025-07-25","2025-08-29","2025-09-26","2025-10-31","2025-11-26","2025-12-19","2026-01-30","2026-02-27","2026-03-27","2026-04-30","2026-05-29","2026-06-26"] },
];

function getEventCountdowns() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const events = [];
  for (const ev of FIXED_EVENTS) {
    const next = ev.dates
      .map(d => { const dt = new Date(d); dt.setHours(0,0,0,0); return dt; })
      .filter(d => d >= today)
      .sort((a, b) => a - b)[0];
    if (!next) continue;
    const days = Math.round((next - today) / 86400000);
    events.push({ name: ev.name, date: next.toISOString().slice(0, 10), days });
  }
  return events.sort((a, b) => a.days - b.days).slice(0, 5);
}

// ── Route handler ─────────────────────────────────────────────────────────────
async function handleMonitorExtras(req, res, pathname) {
  if (pathname === "/api/market/futures") {
    try {
      const futures = await fetchFutures();
      return writeJson(res, 200, { ok: true, futures });
    } catch (e) {
      return writeJson(res, 200, { ok: false, futures: [], error: e.message });
    }
  }
  if (pathname === "/api/market/premarket-movers") {
    try {
      const movers = await fetchPreMarketMovers();
      return writeJson(res, 200, { ok: true, movers });
    } catch (e) {
      return writeJson(res, 200, { ok: false, movers: [], error: e.message });
    }
  }
  if (pathname === "/api/market/event-countdowns") {
    const events = getEventCountdowns();
    return writeJson(res, 200, { ok: true, events });
  }
  return null;
}

module.exports = { handleMonitorExtras };
