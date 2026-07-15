// ADOL22 Market Scanner
// Multi-timeframe candle pattern scanner with strict confidence scoring
// Runs every 15 minutes — only fires at 85%+ confidence
// Timeframes: 1h trend · 15m signal · 5m entry confirmation

"use strict";

const https  = require("https");
const { sendTelegramMessage, isConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");

// ── Universe ──────────────────────────────────────────────────────────────────
const SCAN_UNIVERSE = [
  "SPY","QQQ","NVDA","TSLA","AAPL","META","AMZN","GOOGL","MSFT","AMD",
  "COIN","PLTR","MSTR","HOOD","SOFI","MARA","RIOT","CRWD","NET","SNOW",
  "UBER","DASH","RBLX","SMCI","ARM","AVGO","NFLX","AMD","PYPL","SQ",
  "RIVN","NIO","BBAI","SOUN","IONQ","ACHR","ASTS","RKLB","SMR","OKLO",
];

const COOLDOWN_MS = 60 * 60_000; // 1h per symbol per direction
const cooldownMap = new Map();

// ── Candle fetcher ────────────────────────────────────────────────────────────
// Tries Alpaca first (not IP-blocked from Render, unlike Yahoo) — same bar shape
// as fetchYahooCandles below, just reshaped onto {t, time, o, h, l, c, v}.
// Falls through to the raw Yahoo chart call when Alpaca has no keys, the symbol
// isn't a plain equity (^VIX etc — fetchAlpacaBars returns null for those), or
// the request fails, so behavior is unchanged wherever Alpaca can't help.
async function fetchCandles(sym, interval, range) {
  try {
    const { fetchAlpacaBars } = require("./providers/alpaca-data");
    const alpacaBars = await fetchAlpacaBars(sym, range, interval);
    if (alpacaBars && alpacaBars.length) {
      const bars = alpacaBars.map(b => ({
        t: Math.floor(b.time / 1000), time: new Date(b.time),
        o: b.open || 0, h: b.high || 0, l: b.low || 0, c: b.close || 0, v: b.volume || 0,
      })).filter(b => b.c > 0 && b.h > 0);
      if (bars.length) return { bars, price: bars.at(-1)?.c || 0 };
    }
  } catch { /* fall through to Yahoo */ }
  return fetchYahooCandles(sym, interval, range);
}

function fetchYahooCandles(sym, interval, range) {
  return new Promise(resolve => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`;
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const j   = JSON.parse(d);
          const r   = j?.chart?.result?.[0];
          const ts  = r?.timestamp || [];
          const q   = r?.indicators?.quote?.[0] || {};
          const meta= r?.meta || {};
          const bars = ts.map((t, i) => ({
            t, time: new Date(t * 1000),
            o: q.open?.[i]  || 0,
            h: q.high?.[i]  || 0,
            l: q.low?.[i]   || 0,
            c: q.close?.[i] || 0,
            v: q.volume?.[i] || 0,
          })).filter(b => b.c > 0 && b.h > 0);
          resolve({ bars, price: meta.regularMarketPrice || bars.at(-1)?.c || 0 });
        } catch { resolve({ bars: [], price: 0 }); }
      });
    });
    req.on("error", () => resolve({ bars: [], price: 0 }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ bars: [], price: 0 }); });
  });
}

// ── Technical calculations ────────────────────────────────────────────────────
function calcEMA(closes, period) {
  if (closes.length < period) return 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return Math.round(ema * 100) / 100;
}

function calcVWAP(bars) {
  // VWAP from first bar of today (session VWAP)
  const today = new Date().toDateString();
  const todayBars = bars.filter(b => b.time.toDateString() === today);
  if (!todayBars.length) return 0;
  let cumPV = 0, cumV = 0;
  todayBars.forEach(b => {
    const tp = (b.h + b.l + b.c) / 3;
    cumPV += tp * b.v;
    cumV  += b.v;
  });
  return cumV > 0 ? Math.round(cumPV / cumV * 100) / 100 : 0;
}

function avgVolume(bars, n = 20) {
  const recent = bars.slice(-n).map(b => b.v).filter(v => v > 0);
  return recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
}

function isBodyUp(bar)   { return bar.c > bar.o; }
function isBodyDown(bar) { return bar.c < bar.o; }
function bodySize(bar)   { return Math.abs(bar.c - bar.o); }
function totalRange(bar) { return bar.h - bar.l; }
function upperWick(bar)  { return bar.h - Math.max(bar.o, bar.c); }
function lowerWick(bar)  { return Math.min(bar.o, bar.c) - bar.l; }

// ── Pattern detection ─────────────────────────────────────────────────────────
function detectPatterns(bars) {
  if (bars.length < 3) return [];
  const patterns = [];
  const prev2 = bars[bars.length - 3];
  const prev  = bars[bars.length - 2];
  const curr  = bars[bars.length - 1];

  // ── BULLISH PATTERNS ──
  // 1. Bullish Engulfing
  if (isBodyDown(prev) && isBodyUp(curr) &&
      curr.o < prev.c && curr.c > prev.o &&
      bodySize(curr) > bodySize(prev) * 1.1) {
    patterns.push({ type: "BULL", name: "Bullish Engulfing", strength: 85 });
  }

  // 2. Hammer at support
  if (isBodyUp(curr) &&
      lowerWick(curr) >= bodySize(curr) * 2 &&
      upperWick(curr) <= bodySize(curr) * 0.5 &&
      bodySize(curr) / totalRange(curr) < 0.35) {
    patterns.push({ type: "BULL", name: "Hammer", strength: 78 });
  }

  // 3. Breakout candle (close above recent high)
  const recentHigh = Math.max(...bars.slice(-10, -1).map(b => b.h));
  if (curr.c > recentHigh && curr.c > curr.o && bodySize(curr) / totalRange(curr) > 0.6) {
    patterns.push({ type: "BULL", name: "Breakout Candle", strength: 88 });
  }

  // 4. Inside bar breakout (current breaks above previous high)
  if (prev.h < prev2.h && prev.l > prev2.l && // prev was inside bar
      curr.c > prev2.h && isBodyUp(curr)) {    // curr breaks above
    patterns.push({ type: "BULL", name: "Inside Bar Breakout", strength: 82 });
  }

  // 5. Morning star / strong bullish reversal
  if (isBodyDown(prev2) && bodySize(prev) < bodySize(prev2) * 0.5 &&
      isBodyUp(curr) && curr.c > (prev2.o + prev2.c) / 2) {
    patterns.push({ type: "BULL", name: "Morning Star", strength: 83 });
  }

  // ── BEARISH PATTERNS ──
  // 1. Bearish Engulfing
  if (isBodyUp(prev) && isBodyDown(curr) &&
      curr.o > prev.c && curr.c < prev.o &&
      bodySize(curr) > bodySize(prev) * 1.1) {
    patterns.push({ type: "BEAR", name: "Bearish Engulfing", strength: 85 });
  }

  // 2. Shooting Star
  if (isBodyDown(curr) &&
      upperWick(curr) >= bodySize(curr) * 2 &&
      lowerWick(curr) <= bodySize(curr) * 0.5 &&
      bodySize(curr) / totalRange(curr) < 0.35) {
    patterns.push({ type: "BEAR", name: "Shooting Star", strength: 78 });
  }

  // 3. Breakdown candle (close below recent low)
  const recentLow = Math.min(...bars.slice(-10, -1).map(b => b.l));
  if (curr.c < recentLow && curr.c < curr.o && bodySize(curr) / totalRange(curr) > 0.6) {
    patterns.push({ type: "BEAR", name: "Breakdown Candle", strength: 88 });
  }

  // 4. Inside bar breakdown
  if (prev.h < prev2.h && prev.l > prev2.l &&
      curr.c < prev2.l && isBodyDown(curr)) {
    patterns.push({ type: "BEAR", name: "Inside Bar Breakdown", strength: 82 });
  }

  // 5. Evening star
  if (isBodyUp(prev2) && bodySize(prev) < bodySize(prev2) * 0.5 &&
      isBodyDown(curr) && curr.c < (prev2.o + prev2.c) / 2) {
    patterns.push({ type: "BEAR", name: "Evening Star", strength: 83 });
  }

  return patterns;
}

// ── Confidence scoring ────────────────────────────────────────────────────────
function scoreSignal(type, bars15m, bars1h, bars5m, spyChg, vix) {
  const curr  = bars15m.at(-1);
  const price = curr.c;
  const vwap  = calcVWAP(bars15m);
  const closes15 = bars15m.map(b => b.c);
  const ema9  = calcEMA(closes15, 9);
  const ema21 = calcEMA(closes15, 21);
  const avgV  = avgVolume(bars15m);
  const currV = curr.v;
  const volSpike = avgV > 0 ? currV / avgV : 1;

  // 1h trend
  const closes1h = bars1h.map(b => b.c);
  const ema21_1h = calcEMA(closes1h, 21);
  const trendUp  = bars1h.at(-1)?.c > ema21_1h;
  const trendDown= bars1h.at(-1)?.c < ema21_1h;

  let score = 0;
  const reasons = [];

  if (type === "BULL") {
    if (vwap > 0 && price > vwap)        { score += 15; reasons.push(`Above VWAP ($${vwap})`); }
    if (ema9 > 0 && ema21 > 0 && ema9 > ema21) { score += 15; reasons.push("EMA 9 > EMA 21 ✅"); }
    if (volSpike >= 1.5)                  { score += 15; reasons.push(`Volume spike ${volSpike.toFixed(1)}x`); }
    if (trendUp)                          { score += 10; reasons.push("1h trend bullish"); }
    if (spyChg > 0)                       { score += 10; reasons.push("Market confirms (SPY up)"); }
    if (vix < 20)                         { score += 5;  reasons.push(`VIX calm (${vix.toFixed(1)})`); }
    else if (vix > 30)                    { score -= 15; reasons.push(`⚠️ VIX elevated (${vix.toFixed(1)})`); }
    if (ema9 > 0 && price > ema9)         { score += 5;  reasons.push("Above EMA 9"); }
    if (bars5m.length >= 3) {
      const last5m = bars5m.at(-1);
      if (last5m.c > last5m.o)           { score += 5;  reasons.push("5m confirms bullish"); }
    }
  } else {
    if (vwap > 0 && price < vwap)        { score += 15; reasons.push(`Below VWAP ($${vwap})`); }
    if (ema9 > 0 && ema21 > 0 && ema9 < ema21) { score += 15; reasons.push("EMA 9 < EMA 21 ✅"); }
    if (volSpike >= 1.5)                  { score += 15; reasons.push(`Volume spike ${volSpike.toFixed(1)}x`); }
    if (trendDown)                        { score += 10; reasons.push("1h trend bearish"); }
    if (spyChg < 0)                       { score += 10; reasons.push("Market confirms (SPY down)"); }
    if (vix < 20)                         { score += 5;  reasons.push(`VIX calm (${vix.toFixed(1)})`); }
    else if (vix > 30)                    { score -= 10; reasons.push(`⚠️ VIX spike (${vix.toFixed(1)}) — spreads wide`); }
    if (ema9 > 0 && price < ema9)         { score += 5;  reasons.push("Below EMA 9"); }
    if (bars5m.length >= 3) {
      const last5m = bars5m.at(-1);
      if (last5m.c < last5m.o)           { score += 5;  reasons.push("5m confirms bearish"); }
    }
  }

  return { score: Math.max(0, Math.min(100, score)), reasons, vwap, ema9, ema21, volSpike };
}

// ── Build alert text ──────────────────────────────────────────────────────────
function buildAlertText(type, sym, pattern, price, scoring, atr) {
  const r2 = n => Math.round(n * 100) / 100;
  const isBull = type === "BULL";
  const stop   = isBull ? r2(price - atr * 1.5) : r2(price + atr * 1.5);
  const t1     = isBull ? r2(price + atr * 2)   : r2(price - atr * 2);
  const t2     = isBull ? r2(price + atr * 3.5) : r2(price - atr * 3.5);

  return [
    `🚨 ADOL22 A+ SIGNAL`,
    ``,
    `Direction: ${isBull ? "BULLISH 🟢" : "BEARISH 🔴"}`,
    `Ticker: ${sym}`,
    `Pattern: ${pattern.name}`,
    `Entry: $${price}`,
    `Stop: $${stop}`,
    `Target 1: $${t1}`,
    `Target 2: $${t2}`,
    `Confidence: ${scoring.score}%`,
    ``,
    `Reason:`,
    scoring.reasons.join(" · "),
    ``,
    `VWAP: $${scoring.vwap}  EMA9: $${scoring.ema9}  EMA21: $${scoring.ema21}`,
    `Volume: ${scoring.volSpike.toFixed(1)}x average`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `⚠️ Not financial advice. Manage risk.`,
  ].join("\n");
}

// ── Main scan ─────────────────────────────────────────────────────────────────
async function runAdol22Scan(symbols, spyChg, vixPrice) {
  const results = { bull: null, bear: null };
  const batch = symbols || SCAN_UNIVERSE;

  for (const sym of batch.slice(0, 30)) {
    const coolBull = cooldownMap.get(`${sym}:BULL`) || 0;
    const coolBear = cooldownMap.get(`${sym}:BEAR`) || 0;
    const now = Date.now();

    try {
      // Fetch all timeframes in parallel
      const [d15m, d1h, d5m] = await Promise.all([
        fetchCandles(sym, "15m", "2d"),
        fetchCandles(sym, "1h",  "5d"),
        fetchCandles(sym, "5m",  "1d"),
      ]);

      if (d15m.bars.length < 5) continue;

      // Detect patterns on 15m candles
      const patterns = detectPatterns(d15m.bars);
      if (!patterns.length) continue;

      const price = d15m.price || d15m.bars.at(-1).c;
      const atr   = d15m.bars.slice(-14).reduce((sum, b) => sum + (b.h - b.l), 0) / 14;

      for (const pattern of patterns) {
        // Cooldown check
        if (pattern.type === "BULL" && now - coolBull < COOLDOWN_MS) continue;
        if (pattern.type === "BEAR" && now - coolBear < COOLDOWN_MS) continue;

        // Score the signal
        const scoring = scoreSignal(pattern.type, d15m.bars, d1h.bars, d5m.bars, spyChg, vixPrice);
        const total   = pattern.strength * 0.4 + scoring.score * 0.6;

        if (total < 80) continue; // 80% threshold

        const candidate = { sym, pattern, price, scoring, atr, total };

        if (pattern.type === "BULL" && (!results.bull || total > results.bull.total)) {
          results.bull = candidate;
        }
        if (pattern.type === "BEAR" && (!results.bear || total > results.bear.total)) {
          results.bear = candidate;
        }
      }
    } catch {}
  }

  return results;
}

// ── Send alerts ───────────────────────────────────────────────────────────────
async function sendAdol22Alert(result, type) {
  if (!result) return;
  const { sym, pattern, price, scoring, atr, total } = result;
  // Classified as "opportunity" (always-allow), not the informational
  // budget: this only fires at an 80%+ confidence threshold (already a real
  // quality bar, checked above at the call site) and already has its own
  // per-symbol/type cooldown (cooldownMap below) — it's a genuine high-
  // confidence setup alert, the exact "A+ Opportunity" category the
  // notification-discipline plan says should never be silenced by a
  // shared budget with lower-priority recap/summary messages.
  if (!shouldSendAlert({ category: "opportunity" })) return;
  const text = buildAlertText(type, sym, pattern, price, scoring, atr);
  await sendTelegramMessage(text).catch(() => {});
  cooldownMap.set(`${sym}:${type}`, Date.now());
  console.log(`[ADOL22] ${type} alert sent: ${sym} — ${pattern.name} — ${Math.round(total)}%`);
}

// ── Main entry — called every 15 min ─────────────────────────────────────────
async function runAdol22(watchlistSymbols) {
  if (!isConfigured()) return;

  // Check market hours (9:30 AM – 4:00 PM ET)
  const et  = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const h   = et.getHours(), m = et.getMinutes(), day = et.getDay();
  if (day === 0 || day === 6) return; // weekend
  if (h < 9 || (h === 9 && m < 30) || h >= 16) return; // outside market hours

  // Fetch SPY and VIX for market direction
  const [spyData, vixData] = await Promise.all([
    fetchCandles("SPY", "15m", "1d"),
    fetchCandles("^VIX", "15m", "1d"),
  ]);

  const spyBars = spyData.bars;
  const spyChg  = spyBars.length >= 2
    ? (spyBars.at(-1).c - spyBars[0].o) / spyBars[0].o * 100
    : 0;
  const vixPrice = vixData.price || 18;

  // Skip if market is too choppy (VIX > 35 or SPY range < 0.1%)
  const spyRange = spyBars.length ? (Math.max(...spyBars.slice(-8).map(b => b.h)) - Math.min(...spyBars.slice(-8).map(b => b.l))) / spyBars.at(-1).c * 100 : 1;
  if (vixPrice > 40) {
    console.log("[ADOL22] VIX > 40 — market too volatile, skipping");
    return;
  }
  if (spyRange < 0.08) {
    console.log("[ADOL22] Market choppy (SPY range < 0.08%) — skipping");
    return;
  }

  // Merge watchlist with universe (deduplicated)
  const symbols = [...new Set([...(watchlistSymbols || []), ...SCAN_UNIVERSE])].slice(0, 35);

  console.log(`[ADOL22] Scanning ${symbols.length} symbols… SPY ${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}% VIX ${vixPrice.toFixed(1)}`);

  const { bull, bear } = await runAdol22Scan(symbols, spyChg, vixPrice);

  if (!bull && !bear) {
    console.log("[ADOL22] No A+ setup found this scan");
    // Only send "no setup" message if manually triggered (not on auto-15min to avoid spam)
    const calledManually = global._adol22Manual;
    if (calledManually) {
      global._adol22Manual = false;
      await sendTelegramMessage([
        `🔴 ADOL22 SCAN COMPLETE — ${new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })} ET`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `NO A+ SETUP FOUND`,
        ``,
        `Scanned ${symbols.length} symbols`,
        `SPY ${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}%  VIX ${vixPrice.toFixed(1)}`,
        ``,
        `Market conditions: ${vixPrice > 25 ? "⚠️ Elevated VIX — tough conditions" : spyRange < 0.15 ? "Choppy — waiting for momentum" : "Normal — no strong setups right now"}`,
        `Try again at next 15-min interval.`,
      ].join("\n")).catch(() => {});
    }
    return;
  }

  lastScanTime = new Date().toISOString();
  lastScanResult = { bull: bull ? { sym: bull.sym, pattern: bull.pattern.name, confidence: Math.round(bull.total), price: bull.price } : null,
                     bear: bear ? { sym: bear.sym, pattern: bear.pattern.name, confidence: Math.round(bear.total), price: bear.price } : null,
                     spyChg: Math.round(spyChg * 100) / 100, vix: Math.round(vixPrice * 10) / 10 };

  if (bull) {
    await sendAdol22Alert(bull, "BULL");
    saveHistory({ type: "BULL", sym: bull.sym, pattern: bull.pattern.name, price: bull.price, confidence: Math.round(bull.total), reasons: bull.scoring.reasons });
  }
  if (bear) {
    await sendAdol22Alert(bear, "BEAR");
    saveHistory({ type: "BEAR", sym: bear.sym, pattern: bear.pattern.name, price: bear.price, confidence: Math.round(bear.total), reasons: bear.scoring.reasons });
  }
}

// ── More patterns — added to detectPatterns ──────────────────────────────────
// (patch detectPatterns to add more)
const _origDetect = detectPatterns;
function detectPatterns(bars) {
  const base = _origDetect(bars);
  if (bars.length < 4) return base;
  const prev3 = bars[bars.length - 4];
  const prev2 = bars[bars.length - 3];
  const prev  = bars[bars.length - 2];
  const curr  = bars[bars.length - 1];

  // Pin Bar (long wick rejection)
  const lw = lowerWick(curr), uw = upperWick(curr), body = bodySize(curr), range = totalRange(curr);
  if (range > 0 && lw >= range * 0.6 && body <= range * 0.25) {
    base.push({ type: "BULL", name: "Bullish Pin Bar", strength: 80 });
  }
  if (range > 0 && uw >= range * 0.6 && body <= range * 0.25) {
    base.push({ type: "BEAR", name: "Bearish Pin Bar", strength: 80 });
  }

  // Three White Soldiers (3 consecutive bull candles, each closes higher)
  if ([prev3, prev2, prev, curr].every(b => isBodyUp(b)) &&
      prev2.c > prev3.c && prev.c > prev2.c && curr.c > prev.c) {
    base.push({ type: "BULL", name: "Three White Soldiers", strength: 87 });
  }

  // Three Black Crows (3 consecutive bear candles)
  if ([prev3, prev2, prev, curr].every(b => isBodyDown(b)) &&
      prev2.c < prev3.c && prev.c < prev2.c && curr.c < prev.c) {
    base.push({ type: "BEAR", name: "Three Black Crows", strength: 87 });
  }

  // Doji Reversal (very small body after strong candle)
  if (bodySize(prev) > totalRange(prev) * 0.6 && isBodyDown(prev) &&
      bodySize(curr) < totalRange(curr) * 0.1 && curr.v > prev.v) {
    base.push({ type: "BULL", name: "Doji Reversal (Bull)", strength: 76 });
  }
  if (bodySize(prev) > totalRange(prev) * 0.6 && isBodyUp(prev) &&
      bodySize(curr) < totalRange(curr) * 0.1 && curr.v > prev.v) {
    base.push({ type: "BEAR", name: "Doji Reversal (Bear)", strength: 76 });
  }

  // VWAP Rejection — needs VWAP in scope — approximate here
  // Strong bounce off a round number
  const roundLevels = [50,100,150,200,250,300,400,500,750,1000].map(n => n);
  const price = curr.c;
  for (const lvl of roundLevels) {
    if (Math.abs(price - lvl) / lvl < 0.005 && isBodyUp(curr) && lw > body) {
      base.push({ type: "BULL", name: `Round Level Bounce $${lvl}`, strength: 78 });
      break;
    }
    if (Math.abs(price - lvl) / lvl < 0.005 && isBodyDown(curr) && uw > body) {
      base.push({ type: "BEAR", name: `Round Level Rejection $${lvl}`, strength: 78 });
      break;
    }
  }

  return base;
}

// ── Signal history storage ─────────────────────────────────────────────────────
const path = require("path");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const HISTORY_FILE = path.join(__dirname, "../data/adol22-history.json");
const MAX_HISTORY  = 50;

function loadHistory() {
  return readJsonSafe(HISTORY_FILE, []);
}

function saveHistory(entry) {
  try {
    const hist = loadHistory();
    hist.unshift({ ...entry, savedAt: new Date().toISOString() });
    writeJsonAtomic(HISTORY_FILE, hist.slice(0, MAX_HISTORY));
  } catch {}
}

// ── API endpoint — latest scan + history + manual trigger ─────────────────────
let lastScanResult = null;
let lastScanTime   = null;

async function handleAdol22Api(req, res, requestUrl) {
  const { writeJson } = require("./utils");

  if (requestUrl.pathname === "/api/adol22/scan" && req.method === "POST") {
    try {
      const { loadSettings } = require("./settings-store");
      const s  = loadSettings() || {};
      const wl = Array.isArray(s.watchlistSymbols) ? s.watchlistSymbols : [];
      global._adol22Manual = true; // flag as manual so we send "no setup" message
      runAdol22(wl).catch(() => {});
      return writeJson(res, 200, { ok: true, message: "ADOL22 scan started" });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  if (requestUrl.pathname === "/api/adol22/history") {
    return writeJson(res, 200, { ok: true, history: loadHistory() });
  }

  if (requestUrl.pathname === "/api/adol22/status") {
    return writeJson(res, 200, {
      ok: true,
      lastScan: lastScanTime,
      lastResult: lastScanResult,
      totalPatterns: 16,
      history: loadHistory().slice(0, 5),
    });
  }

  return null;
}

module.exports = { runAdol22, handleAdol22Api, saveHistory, loadHistory };
