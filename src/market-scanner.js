const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./config");
const { fetchYahooBars } = require("./providers/yahoo");
const { computeEMA, computeRSI } = require("./indicators");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { fetchTrending: stTrending }  = require("./providers/stocktwits");
const { fetchAllNews, fetchFinanceNews } = require("./providers/reddit-news");
const { round2, withTimeout } = require("./utils");

const CONFIG_PATH = path.join(ROOT, "data", "scanner-config.json");

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_SYMBOLS = [
  // ── Broad market & volatility
  "SPY","QQQ","IWM","DIA","MDY","VTI","RSP",
  "^VIX","UVXY","SVXY",

  // ── Sector ETFs (all 11 SPDR sectors)
  "XLK","XLF","XLE","XLV","XLI","XLY","XLP","XLU","XLRE","XLB","XLC",
  // Sector variants
  "SOXX","SMH","IGV","ARKK","ARKG","ARKW",

  // ── Bonds & rates
  "TLT","IEF","SHY","HYG","LQD","JNK","BND","TIP","EMB",

  // ── Dollar, commodities & metals
  "UUP","GLD","SLV","GDX","GDXJ","USO","UNG","DBA","PDBC","CPER",

  // ── International
  "EEM","EFA","FXI","EWZ","EWJ","EWG","EWU","INDA","KWEB","VWO",

  // ── Crypto
  "BTC-USD","ETH-USD","SOL-USD","BNB-USD","XRP-USD",
  "IBIT","FBTC","GBTC","MSTR",

  // ── Mega-cap tech
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","GOOG","TSLA","AVGO","ORCL",
  "AMD","QCOM","INTC","TXN","MU","AMAT","LRCX","KLAC","ADI","MRVL",
  "SNPS","CDNS","ON","MPWR","ACLS","ENTG",

  // ── Software & cloud
  "CRM","ADBE","INTU","NOW","WDAY","HUBS","DDOG","SNOW","PLTR","PANW",
  "CRWD","FTNT","ZS","NET","OKTA","ESTC","MDB","TEAM",
  "GTLB","PATH","AI","SMCI","ARM","HOOD","COIN","RBLX","U",

  // ── Internet & media
  "NFLX","UBER","LYFT","ABNB","BKNG","EXPE","TRIP","YELP","PINS","SNAP",
  "RDDT","TWLO","ZM","DOCU","BOX","DBX","WIX","SHOP","ETSY","EBAY",

  // ── Financials & fintech
  "JPM","BAC","WFC","GS","MS","C","USB","PNC","TFC","COF","AXP",
  "V","MA","PYPL","XYZ","AFRM","SOFI","ALLY","BK","STT",
  "BLK","SCHW","ICE","CME","SPGI","MCO","MSCI","NDAQ","FIS","FISV",

  // ── Healthcare & biotech
  "LLY","UNH","JNJ","ABBV","MRK","PFE","ABT","BMY","AMGN","GILD",
  "BIIB","REGN","VRTX","ISRG","MRNA","BNTX","DXCM","IDXX","IQV",
  "TMO","DHR","A","ZBH","BSX","MDT","SYK","EW","BDX","HOLX",

  // ── Energy
  "XOM","CVX","COP","SLB","HAL","MPC","VLO","PSX","OXY","EOG",
  "DVN","FANG","APA","KMI","WMB","OKE","BKR","NOV",

  // ── Consumer discretionary
  "HD","MCD","NKE","SBUX","LOW","TJX","BKNG","MAR","HLT","RCL",
  "CCL","F","GM","AZO","ORLY","TSCO","ROST","BBY","TGT",

  // ── Consumer staples
  "COST","WMT","PG","KO","PEP","MDLZ","GIS","PM","MO","KMB","CL",

  // ── Industrials & defense
  "GE","HON","CAT","DE","BA","RTX","LMT","NOC","GD","ITW",
  "MMM","EMR","ETN","PH","ROK","AME","FTV","IR","CARR","OTIS",

  // ── Materials
  "LIN","APD","SHW","FCX","NEM","NUE","CF","MOS","ALB","DOW","DD","STLD","PPG",

  // ── Utilities
  "NEE","DUK","SO","D","AEP","EXC","SRE","ED","FE","AWK",

  // ── Real estate
  "AMT","PLD","CCI","EQIX","PSA","SPG","O","VICI","AVB","EQR",
];

const DEFAULT_CONFIG = {
  enabled: true,
  symbols: DEFAULT_SYMBOLS,
  intervalMinutes: 15,   // background scan every 15 min
  buyScoreMin: 85,       // A+ entry only — score ≥ 85
  sellScoreMax: 15,      // Strong exit only — score ≤ 15
  minRvol: 2.0,          // Requires genuine volume surge (2× average)
  cooldownHours: 12,     // Never re-alert same symbol within 12 hours
  marketHoursOnly: false,// OFF — crypto + AH stocks run 24/7
  concurrency: 16,
};

// ── Alert tiers ──────────────────────────────────────────────────────────────
// Tier 1 — FIRE ALERT (standalone immediate message): very high conviction only
const FIRE_BUY_SCORE  = 88;   // score ≥ 88 → fire alert
const FIRE_SELL_SCORE = 12;   // score ≤ 12 → fire alert
const FIRE_MAX_PER_SCAN = 1;  // max 1 fire alert per scan

// Tier 2 — SUMMARY SIGNAL (appears in scheduled scan summary): standard entry/exit
// Uses buyScoreMin / sellScoreMax from config (65/35)

// Tier 3 — SCHEDULED CONTEXT REPORTS: macro, watchlist, plan, midday, power hour, close
// These are always sent at their scheduled times regardless of signals

// ── Config ────────────────────────────────────────────────────────────────────

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
  } catch { return { ...DEFAULT_CONFIG }; }
}

function saveConfig(updates) {
  const merged = { ...loadConfig(), ...updates };
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

// ── State ─────────────────────────────────────────────────────────────────────

const cooldownMap   = new Map(); // "NVDA:BUY" → timestamp
const lastSignalMap = new Map(); // "NVDA"     → "BUY"|"SELL"

// Hard minimum gap between alerts for the same symbol:signal
const MIN_ALERT_GAP_MS = 120 * 60_000; // 120 minutes hard floor between any alert for same symbol

let lastRunAt      = null;
let lastRunResults = [];
let scanCount      = 0;
let isRunning      = false;

// ── Macro regime state ────────────────────────────────────────────────────────

let lastMacroRegime    = null;  // "RISK-ON" | "RISK-OFF" | "NEUTRAL"
let lastMacroAlertedAt = 0;     // timestamp of last regime Telegram alert
const MACRO_COOLDOWN_MS = 2 * 3600_000; // re-alert same regime at most every 2h

// Key macro instruments and which direction signals risk-on vs risk-off
const RISK_ON_INSTRUMENTS  = new Set(["SPY","QQQ","IWM","HYG","EEM","XLY","SVXY"]);
const RISK_OFF_INSTRUMENTS = new Set(["TLT","IEF","SHY","GLD","UVXY","UUP"]);

function computeMacroRegime(analysisMap) {
  let score = 0;
  const bullFactors = [];
  const bearFactors = [];

  const g = sym => analysisMap.get(sym);

  // ── Equities (SPY, QQQ, IWM)
  for (const sym of ["SPY","QQQ","IWM"]) {
    const a = g(sym);
    if (!a) continue;
    if (a.composite >= 62)      { score += 2; bullFactors.push(`${sym} ↑`); }
    else if (a.composite <= 38) { score -= 2; bearFactors.push(`${sym} ↓`); }
  }

  // ── Bonds — rising bonds = risk-off
  for (const sym of ["TLT","IEF"]) {
    const a = g(sym);
    if (!a) continue;
    if (a.composite >= 62)      { score -= 2; bearFactors.push(`${sym} rallying (rates ↓)`); }
    else if (a.composite <= 38) { score += 1; bullFactors.push(`${sym} selling off (rates ↑)`); }
  }

  // ── Credit spreads — HYG up = risk-on, HYG down = stress
  const hyg = g("HYG");
  if (hyg) {
    if (hyg.composite >= 60)      { score += 2; bullFactors.push("HYG (credit) strong"); }
    else if (hyg.composite <= 35) { score -= 2; bearFactors.push("HYG (credit) weak"); }
  }

  // ── Volatility — UVXY up = risk-off
  const uvxy = g("UVXY");
  if (uvxy) {
    if (uvxy.composite >= 60)      { score -= 3; bearFactors.push("VIX spiking"); }
    else if (uvxy.composite <= 35) { score += 1; bullFactors.push("VIX low"); }
  }

  // ── Dollar — strong dollar often signals risk-off stress
  const uup = g("UUP");
  if (uup) {
    if (uup.composite >= 70)      { score -= 1; bearFactors.push("DXY strong"); }
    else if (uup.composite <= 35) { score += 1; bullFactors.push("DXY weak"); }
  }

  // ── Gold — rising gold = risk-off / inflation hedge
  const gld = g("GLD");
  if (gld) {
    if (gld.composite >= 65)      { score -= 1; bearFactors.push("Gold ↑ (hedge demand)"); }
    else if (gld.composite <= 35) { score += 1; bullFactors.push("Gold ↓"); }
  }

  // ── EM — risk proxy
  const eem = g("EEM");
  if (eem) {
    if (eem.composite >= 62)      { score += 1; bullFactors.push("EM strong"); }
    else if (eem.composite <= 38) { score -= 1; bearFactors.push("EM weak"); }
  }

  // ── Cyclicals vs Defensives (XLY vs XLP)
  const xly = g("XLY"), xlp = g("XLP");
  if (xly && xlp) {
    if (xly.composite > xlp.composite + 20)      { score += 2; bullFactors.push("Cyclicals > Defensives"); }
    else if (xlp.composite > xly.composite + 20) { score -= 2; bearFactors.push("Defensives > Cyclicals"); }
  }

  const regime = score >= 4 ? "RISK-ON" : score <= -4 ? "RISK-OFF" : "NEUTRAL";
  return { regime, score, bullFactors, bearFactors };
}

// ── Market hours (ET) ─────────────────────────────────────────────────────────

function isDuringMarketHours() {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date());
    // fmt: "Tue, 09:45"
    const [wd, time] = fmt.split(", ");
    if (wd === "Sat" || wd === "Sun") return false;
    const [hh, mm] = time.split(":").map(Number);
    const mins = hh * 60 + mm;
    return mins >= 9 * 60 + 25 && mins <= 16 * 60 + 5;
  } catch { return true; }
}

// ── Per-symbol analysis (single v8 bar fetch gives everything we need) ────────

async function analyzeSymbol(symbol) {
  const bars = await withTimeout(fetchYahooBars(symbol, "6mo", "1d"), 12000, []);
  if (bars.length < 30) return null;

  const closes  = bars.map(b => b.close);
  const highs   = bars.map(b => b.high);
  const lows    = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume || 0);

  const cur  = bars[bars.length - 1];
  const prev = bars[bars.length - 2];

  // Price metrics
  const price   = round2(cur.close);
  const chgPct  = prev.close > 0 ? round2((cur.close - prev.close) / prev.close * 100) : 0;

  // Volume / RVOL from actual bars (20-day average)
  const avgVol  = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const rvol    = avgVol > 0 ? round2(cur.volume / avgVol) : 1;

  // Technical indicators
  const ema9  = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  const ema50 = computeEMA(closes, Math.min(50, closes.length));
  const rsi   = computeRSI(closes, 14);

  // 52-week range from bar history
  const yearSlice = closes.slice(-252);
  const yearHigh  = Math.max(...yearSlice);
  const yearLow   = Math.min(...yearSlice);
  const yearPos   = yearHigh > yearLow ? (price - yearLow) / (yearHigh - yearLow) : 0.5;

  // 20-bar support / resistance
  const support    = round2(Math.min(...lows.slice(-20)));
  const resistance = round2(Math.max(...highs.slice(-20)));

  // Trend
  let trend;
  if (price > ema9 && ema9 > ema21 && ema21 > ema50)      trend = "Uptrend";
  else if (price < ema9 && ema9 < ema21 && ema21 < ema50)  trend = "Downtrend";
  else if (price > ema21)                                   trend = "Weak Uptrend";
  else                                                       trend = "Weak Downtrend";

  const emaAligned = ema9 > ema21 ? "↑" : "↓";

  // ── Composite score ──────────────────────────────────────────────────────────
  let tech = 50;

  // Trend
  if (trend === "Uptrend")           tech += 18;
  else if (trend === "Weak Uptrend") tech += 6;
  else if (trend === "Downtrend")    tech -= 18;
  else                               tech -= 6;

  // Daily change
  if (chgPct > 3)         tech += 20;
  else if (chgPct > 1.5)  tech += 12;
  else if (chgPct > 0.5)  tech += 6;
  else if (chgPct > 0)    tech += 2;
  else if (chgPct > -1)   tech -= 4;
  else if (chgPct > -2)   tech -= 12;
  else                    tech -= 20;

  // RSI position
  if (rsi >= 55 && rsi <= 70)        tech += 10;
  else if (rsi >= 45 && rsi < 55)    tech += 4;
  else if (rsi > 70 && rsi <= 80)    tech -= 4;
  else if (rsi > 80)                 tech -= 14;
  else if (rsi < 30)                 tech += 8;  // oversold bounce potential
  else if (rsi < 40)                 tech -= 6;

  // RVOL
  if (rvol >= 2.0 && chgPct > 0)    tech += 16;
  else if (rvol >= 1.5 && chgPct > 0) tech += 10;
  else if (rvol >= 1.2 && chgPct > 0) tech += 5;
  else if (rvol >= 1.5 && chgPct < 0) tech -= 10;
  else if (rvol >= 1.2 && chgPct < 0) tech -= 5;

  // 52-week position
  if (yearPos > 0.90)       tech += 10;
  else if (yearPos > 0.75)  tech += 5;
  else if (yearPos < 0.15)  tech -= 10;
  else if (yearPos < 0.30)  tech -= 4;

  const composite = Math.round(Math.max(0, Math.min(100, tech)));

  return {
    symbol, price, chgPct, rvol, rsi: round2(rsi),
    ema9: round2(ema9), ema21: round2(ema21), ema50: round2(ema50),
    trend, emaAligned, support, resistance, yearPos: round2(yearPos),
    composite,
  };
}

// ── Signal determination ──────────────────────────────────────────────────────

function determineSignal(a, cfg) {
  const { composite, rsi, rvol, chgPct, trend, emaAligned } = a;

  // Hard gate — no alert without real volume participation
  if (rvol < 1.0) return null;

  // BUY: momentum
  const isMomentumBuy =
    composite >= cfg.buyScoreMin &&
    rsi >= 45 && rsi <= 75 &&
    trend !== "Downtrend" &&
    (rvol >= cfg.minRvol || emaAligned === "↑");

  // BUY: oversold bounce
  const isOversoldBounce =
    rsi <= 32 && chgPct > 0 && composite >= 52 && trend !== "Downtrend";

  // BUY: breakout
  const isBreakout =
    composite >= cfg.buyScoreMin + 5 &&
    rsi >= 52 && rsi <= 78 &&
    rvol >= 1.5 && emaAligned === "↑";

  // SELL: weakness
  const isWeakness =
    composite <= cfg.sellScoreMax &&
    (trend === "Downtrend" || trend === "Weak Downtrend") &&
    (rvol >= cfg.minRvol || rsi <= 42);

  // SELL: overbought distribution
  const isDistribution =
    rsi >= 75 && chgPct < 0 && rvol >= 1.3 && trend !== "Uptrend";

  // SELL: breakdown
  const isBreakdown =
    composite <= cfg.sellScoreMax + 5 &&
    rsi <= 40 && rvol >= 1.4 && emaAligned === "↓";

  if (isMomentumBuy || isOversoldBounce || isBreakout)   return "BUY";
  if (isWeakness    || isDistribution   || isBreakdown)  return "SELL";
  return null;
}

// ── Duplicate guard ───────────────────────────────────────────────────────────

function isDuplicate(symbol, signal, cooldownHours) {
  const key  = `${symbol}:${signal}`;
  const last = cooldownMap.get(key);
  if (last) {
    const elapsed   = Date.now() - last;
    const minGap    = MIN_ALERT_GAP_MS;                    // 15 min hard floor
    const configured = cooldownHours * 3600_000;           // configured cooldown
    if (elapsed < Math.max(minGap, configured)) return true;
  }
  // Same-direction block: only applies within 4× the cooldown window
  // (prevents re-alert while signal is still active, but clears eventually)
  if (lastSignalMap.get(symbol) === signal) {
    const last2 = cooldownMap.get(key);
    if (last2 && Date.now() - last2 < cooldownHours * 4 * 3600_000) return true;
  }
  return false;
}

function recordSignal(symbol, signal) {
  cooldownMap.set(`${symbol}:${signal}`, Date.now());
  lastSignalMap.set(symbol, signal);
  cooldownMap.delete(`${symbol}:${signal === "BUY" ? "SELL" : "BUY"}`);
}

// ── Telegram alert formatter ──────────────────────────────────────────────────

function formatScanAlert(a, signal) {
  const isBuy  = signal === "BUY";
  const e      = isBuy ? "🟢" : "🔴";
  const chg    = `${a.chgPct >= 0 ? "+" : ""}${a.chgPct.toFixed(2)}%`;
  const chgE   = a.chgPct >= 0 ? "📈" : "📉";
  const time   = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });

  // Risk levels + percentages so you instantly know your risk
  let stop, target, stopPct, tgtPct;
  if (isBuy) {
    const risk = round2(Math.max(a.price - a.support, 0.01));
    stop    = a.support;
    target  = round2(a.price + risk * 2);
    stopPct = round2((stop   - a.price) / a.price * 100);  // negative
    tgtPct  = round2((target - a.price) / a.price * 100);  // positive
  } else {
    const risk = round2(Math.max(a.resistance - a.price, 0.01));
    stop    = a.resistance;
    target  = round2(a.price - risk * 2);
    stopPct = round2((stop   - a.price) / a.price * 100);  // positive (stop is above)
    tgtPct  = round2((target - a.price) / a.price * 100);  // negative (target is below)
  }

  // RSI label
  const rsiLabel = a.rsi >= 70 ? " ⚠️ overbought"
                 : a.rsi <= 30 ? " ⚡ oversold"
                 : "";

  // Trend arrow
  const trendArrow = a.trend === "Uptrend"        ? "↑↑ Strong"
                   : a.trend === "Weak Uptrend"   ? "↑  Weak"
                   : a.trend === "Downtrend"       ? "↓↓ Strong"
                   :                                "↓  Weak";

  return [
    `${e} ${isBuy ? "ENTRY" : "EXIT"} ALERT`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `${a.symbol}   ${chgE} $${a.price}  ${chg}`,
    `Score  ${a.composite}/100   RSI ${a.rsi}${rsiLabel}`,
    `RVOL   ${a.rvol}x   Trend ${trendArrow}`,
    ``,
    `🎯 ${isBuy ? "Entry " : "Exit  "}  $${a.price}`,
    `🛑 Stop    $${stop}   (${stopPct}%)`,
    `🏆 Target  $${target}  (${tgtPct > 0 ? "+" : ""}${tgtPct}%)`,
    `   R:R  1 : 2`,
    ``,
    `⏰ ${time} ET`,
  ].join("\n");
}

// ── Concurrency-limited parallel runner ───────────────────────────────────────

async function runWithConcurrency(tasks, limit) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]().catch(err => ({ error: err.message }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// ── Core scan ─────────────────────────────────────────────────────────────────

async function runScan(options = {}) {
  const { scheduledLabel = null } = options;
  if (isRunning) return { skipped: true, reason: "scan already in progress" };
  const cfg = loadConfig();
  if (!cfg.enabled) return { skipped: true, reason: "scanner disabled" };
  if (cfg.marketHoursOnly && !isDuringMarketHours()) {
    return { skipped: true, reason: "outside market hours" };
  }

  const weekend = isWeekend();

  isRunning = true;
  const hits   = [];
  const errors = [];
  let symbolsScanned = 0;

  try {
    let symbols = (cfg.symbols || DEFAULT_SYMBOLS)
      .map(s => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 500);

    // Weekend: crypto-only — stock market is closed
    if (weekend) symbols = symbols.filter(isCryptoSymbol);

    symbolsScanned = symbols.length;

    const concurrency = Math.max(1, Math.min(16, cfg.concurrency || 8));

    // Fetch + analyze all symbols in parallel (capped concurrency)
    const tasks = symbols.map(sym => () => analyzeSymbol(sym));
    const results = await runWithConcurrency(tasks, concurrency);

    // Build analysis map for macro regime computation
    const analysisMap = new Map();
    for (let i = 0; i < symbols.length; i++) {
      const a = results[i];
      if (a && !a.error) analysisMap.set(symbols[i], a);
    }

    // ── Macro regime alert — ONLY fires on a genuine regime CHANGE ────────────
    // e.g. RISK-OFF → RISK-ON or RISK-ON → RISK-OFF. No periodic repeat messages.
    // Skipped on weekends — stock indices are closed, regime is meaningless.
    if (telegramConfigured() && !weekend) {
      const macro = computeMacroRegime(analysisMap);
      if (macro.regime !== lastMacroRegime) {
        const prev = lastMacroRegime || "UNKNOWN";
        lastMacroRegime    = macro.regime;
        lastMacroAlertedAt = Date.now();

        const e    = macro.regime === "RISK-ON" ? "🟢" : macro.regime === "RISK-OFF" ? "🔴" : "⚪";
        const time = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });

        const spyA  = analysisMap.get("SPY"),  hygA = analysisMap.get("HYG");
        const uvxyA = analysisMap.get("UVXY"), gldA = analysisMap.get("GLD");

        const snap = [
          spyA  ? `SPY Score ${spyA.composite}  ${spyA.trend}` : null,
          hygA  ? `HYG Score ${hygA.composite}`                 : null,
          uvxyA ? `VIX proxy Score ${uvxyA.composite}`          : null,
          gldA  ? `GLD Score ${gldA.composite}`                 : null,
        ].filter(Boolean).join("  |  ");

        sendTelegramMessage(
          `${e} REGIME SHIFT\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${prev}  →  ${macro.regime}\n` +
          `Score: ${macro.score > 0 ? "+" : ""}${macro.score}\n\n` +
          `${snap}\n\n` +
          (macro.bullFactors.length ? `📈 ${macro.bullFactors.slice(0,3).join("  •  ")}\n` : "") +
          (macro.bearFactors.length ? `📉 ${macro.bearFactors.slice(0,3).join("  •  ")}\n` : "") +
          `\n⏰ ${time} ET`
        ).catch(() => {});
      } else {
        // Regime unchanged — just update in memory silently
        lastMacroRegime = macro.regime;
      }
    }

    // ── Per-symbol signals ──────────────────────────────────────────────────
    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      const a   = results[i];
      if (!a || a.error) {
        if (a?.error) errors.push(`${sym}: ${a.error}`);
        continue;
      }

      const signal = determineSignal(a, cfg);
      if (!signal) continue;
      if (isDuplicate(sym, signal, cfg.cooldownHours)) continue;

      recordSignal(sym, signal);
      hits.push({
        symbol: sym, signal,
        composite: a.composite, price: a.price,
        rsi: a.rsi, rvol: a.rvol, chgPct: a.chgPct, trend: a.trend,
        support: a.support, resistance: a.resistance,
        ema9: a.ema9, ema21: a.ema21,
      });
    }

    // ── ALERT DISPATCH ────────────────────────────────────────────────────────
    // Two paths depending on whether this is a scheduled scan or a background interval scan.

    if (scheduledLabel) {
      // ── PATH A: SCHEDULED SCAN ─────────────────────────────────────────────
      // Send ONE compact summary. High-conviction signals get 🔥 tag inside the
      // summary — they do NOT get a separate standalone message. No duplicates.
      const time  = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
      const buys  = hits.filter(h => h.signal === "BUY")
                        .sort((a,b) => b.composite - a.composite).slice(0, 2);
      const sells = hits.filter(h => h.signal === "SELL")
                        .sort((a,b) => a.composite - b.composite).slice(0, 2);

      if ((buys.length || sells.length) && telegramConfigured()) {
        let msg = `📡 ${scheduledLabel.toUpperCase()}\n`;
        msg    += `⏰ ${time} ET  •  ${symbols.length} symbols\n`;
        msg    += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        if (buys.length) {
          msg += `\n🟢 ENTRIES (${buys.length} new)\n`;
          for (const h of buys) {
            const fire    = h.composite >= FIRE_BUY_SCORE ? "🔥" : "  ";
            const chg     = `${h.chgPct >= 0 ? "+" : ""}${h.chgPct.toFixed(2)}%`;
            const risk    = round2(Math.max(h.price - h.support, 0.01));
            const tgt     = round2(h.price + risk * 2);
            const stopPct = round2((h.support - h.price) / h.price * 100);
            const tgtPct  = round2((tgt - h.price) / h.price * 100);
            msg += `${fire} ${h.symbol.padEnd(6)} $${h.price}  ${chg}  [${h.composite}]\n`;
            msg += `   🛑 $${h.support} (${stopPct}%)  →  🏆 $${tgt} (+${tgtPct}%)\n`;
          }
        }

        if (sells.length) {
          msg += `\n🔴 EXITS (${sells.length} new)\n`;
          for (const h of sells) {
            const fire    = h.composite <= FIRE_SELL_SCORE ? "🔥" : "  ";
            const chg     = `${h.chgPct >= 0 ? "+" : ""}${h.chgPct.toFixed(2)}%`;
            const risk    = round2(Math.max(h.resistance - h.price, 0.01));
            const tgt     = round2(h.price - risk * 2);
            const stopPct = round2((h.resistance - h.price) / h.price * 100);
            const tgtPct  = round2((tgt - h.price) / h.price * 100);
            msg += `${fire} ${h.symbol.padEnd(6)} $${h.price}  ${chg}  [${h.composite}]\n`;
            msg += `   🛑 $${h.resistance} (+${stopPct}%)  →  🏆 $${tgt} (${tgtPct}%)\n`;
          }
        }

        msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━`;
        sendTelegramMessage(msg.trim()).catch(() => {});
      }
      // No signals → stay silent. Don't send "no new signals" noise.

    } else {
      // ── PATH B: 15-MIN INTERVAL SCAN — Best/Worst Trades Summary ──────────
      // Sends a compact snapshot of the top 3 buy signals (best trades) and
      // top 3 sell/exit signals (worst trades) found this cycle.
      // 🔥 marks any signal that also qualifies as a fire-level alert (≥75 / ≤25).
      if (telegramConfigured()) {
        const buys  = hits
          .filter(h => h.signal === "BUY")
          .sort((a, b) => b.composite - a.composite)
          .slice(0, 2);
        const sells = hits
          .filter(h => h.signal === "SELL")
          .sort((a, b) => a.composite - b.composite)
          .slice(0, 2);

        // PATH B only fires when at least one signal is fire-level (🔥)
        const hasFireBuy  = buys.some(h  => h.composite >= FIRE_BUY_SCORE);
        const hasFireSell = sells.some(h => h.composite <= FIRE_SELL_SCORE);
        if ((buys.length || sells.length) && (hasFireBuy || hasFireSell)) {
          const time = new Date().toLocaleTimeString("en-US", {
            timeZone: "America/New_York", hour: "2-digit", minute: "2-digit",
          });

          let msg = weekend
            ? `🪙 WEEKEND CRYPTO SCAN  •  ${symbolsScanned} symbols\n`
            : `📊 15-MIN SCAN  •  ${symbolsScanned} symbols\n`;
          msg    += `⏰ ${time} ET\n`;
          msg    += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

          if (buys.length) {
            msg += `\n🟢 BEST ENTRIES (${buys.length})\n`;
            for (const h of buys) {
              const fire    = h.composite >= FIRE_BUY_SCORE ? "🔥 " : "   ";
              const chg     = `${h.chgPct >= 0 ? "+" : ""}${h.chgPct.toFixed(2)}%`;
              const risk    = Math.max(h.price - h.support, 0.01);
              const tgt     = round2(h.price + risk * 2);
              const stp     = round2(h.support);
              const stpPct  = round2((stp - h.price) / h.price * 100);
              const tgtPct  = round2((tgt - h.price) / h.price * 100);
              msg += `${fire}${h.symbol}  $${h.price}  ${chg}  Score ${h.composite}\n`;
              msg += `      Stop $${stp} (${stpPct}%)  →  Target $${tgt} (+${tgtPct}%)\n`;
            }
          }

          if (sells.length) {
            msg += `\n🔴 EXIT SIGNALS (${sells.length})\n`;
            for (const h of sells) {
              const fire    = h.composite <= FIRE_SELL_SCORE ? "🔥 " : "   ";
              const chg     = `${h.chgPct >= 0 ? "+" : ""}${h.chgPct.toFixed(2)}%`;
              const risk    = Math.max(h.resistance - h.price, 0.01);
              const tgt     = round2(h.price - risk * 2);
              const stp     = round2(h.resistance);
              const stpPct  = round2((stp - h.price) / h.price * 100);
              const tgtPct  = round2((tgt - h.price) / h.price * 100);
              msg += `${fire}${h.symbol}  $${h.price}  ${chg}  Score ${h.composite}\n`;
              msg += `      Stop $${stp} (+${stpPct > 0 ? stpPct : -stpPct}%)  →  Target $${tgt} (${tgtPct}%)\n`;
            }
          }

          sendTelegramMessage(msg.trim()).catch(() => {});
        }
        // Nothing found this cycle → stay silent (cooldowns/duplicates filtered already)
      }
    }

  } finally {
    isRunning = false;
    scanCount++;
    lastRunAt = new Date().toISOString();
    // Keep last non-empty result set so /top and /status always show the most recent signals
    if (hits.length > 0) lastRunResults = hits;
  }

  return { hits, errors, scannedAt: lastRunAt, symbolsChecked: symbolsScanned, signalCount: hits.length };
}

// ── Status ────────────────────────────────────────────────────────────────────

function getScannerStatus() {
  const cfg = loadConfig();
  return {
    enabled: cfg.enabled,
    config: cfg,
    lastRunAt,
    lastHits: lastRunResults,
    scanCount,
    isRunning,
    telegramConfigured: telegramConfigured(),
    cooldownEntries: Array.from(cooldownMap.entries()).map(([k, ts]) => ({
      key: k,
      expiresAt: new Date(ts + cfg.cooldownHours * 3600_000).toISOString(),
    })),
    lastSignals: Object.fromEntries(lastSignalMap),
    macroRegime: lastMacroRegime,
    lastMacroAlertedAt: lastMacroAlertedAt ? new Date(lastMacroAlertedAt).toISOString() : null,
  };
}

// ── 30-min macro report ───────────────────────────────────────────────────────
// Fetches SPY QQQ IWM TLT VIX GLD HYG DXY and sends a full market overview

async function sendMacroReport() {
  if (!telegramConfigured()) return;

  const KEY_SYMBOLS = ["SPY","QQQ","IWM","TLT","^VIX","GLD","HYG","UUP","XLY","XLP","IWM","UVXY","EEM"];
  const KEY_LABEL   = { SPY:"SPY", QQQ:"QQQ", IWM:"IWM", TLT:"TLT", "^VIX":"VIX",
                         GLD:"GLD", HYG:"HYG", UUP:"DXY", XLY:"XLY", XLP:"XLP",
                         UVXY:"UVXY", EEM:"EEM" };

  // Fetch all in parallel
  const settled = await Promise.allSettled(KEY_SYMBOLS.map(s => analyzeSymbol(s)));
  const aMap    = new Map();
  KEY_SYMBOLS.forEach((s, i) => {
    if (settled[i].status === "fulfilled" && settled[i].value) aMap.set(s, settled[i].value);
  });

  const macro = computeMacroRegime(aMap);
  const e     = macro.regime === "RISK-ON" ? "🟢" : macro.regime === "RISK-OFF" ? "🔴" : "⚪";
  const time  = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit"
  });

  const row = (sym, lbl) => {
    const a = aMap.get(sym);
    if (!a) return null;
    const arrow = a.chgPct >= 0 ? "+" : "";
    const bar   = a.composite >= 65 ? "strong" : a.composite <= 35 ? "weak" : "neutral";
    return `${(lbl||sym).padEnd(5)} $${String(a.price).padStart(8)}  ${(arrow+a.chgPct.toFixed(2)+"%").padStart(7)}  Score ${a.composite}  ${bar}`;
  };

  // ── Build market narrative ──────────────────────────────────────────────────
  const spy  = aMap.get("SPY"),  qqq = aMap.get("QQQ"), iwm = aMap.get("IWM");
  const vix  = aMap.get("^VIX"), tlt = aMap.get("TLT"),  gld = aMap.get("GLD");
  const hyg  = aMap.get("HYG"),  uup = aMap.get("UUP");
  const xly  = aMap.get("XLY"),  xlp = aMap.get("XLP");

  const narrativeParts = [];

  // Regime sentence
  if (macro.regime === "RISK-ON") {
    narrativeParts.push("Market is in RISK-ON mode — money is flowing into equities, credit and cyclicals.");
  } else if (macro.regime === "RISK-OFF") {
    narrativeParts.push("Market is in RISK-OFF mode — investors are rotating into defensives, bonds and cash.");
  } else {
    narrativeParts.push("Market is NEUTRAL — mixed signals, no strong directional conviction.");
  }

  // Equity breadth
  if (spy && qqq && iwm) {
    const all3up   = spy.chgPct > 0.3  && qqq.chgPct > 0.3  && iwm.chgPct > 0.3;
    const all3down = spy.chgPct < -0.3 && qqq.chgPct < -0.3 && iwm.chgPct < -0.3;
    const techLead = qqq.chgPct > spy.chgPct + 0.5;
    const smLag    = iwm.chgPct < spy.chgPct - 0.8;
    if (all3up)        narrativeParts.push("Broad rally — SPY, QQQ and IWM all rising together (healthy tape).");
    else if (all3down) narrativeParts.push("Broad selloff — all major indices in the red.");
    else if (techLead) narrativeParts.push("Tech (QQQ) leading the market — growth/momentum favored.");
    else if (smLag)    narrativeParts.push("Small caps (IWM) lagging — risk appetite limited to large caps.");
  }

  // Volatility
  if (vix) {
    if (vix.chgPct >  8) narrativeParts.push(`VIX surging +${vix.chgPct.toFixed(1)}% — fear is elevated, expect choppy action.`);
    else if (vix.chgPct < -5) narrativeParts.push(`VIX falling ${vix.chgPct.toFixed(1)}% — complacency rising, market calming down.`);
    if (vix.price > 30) narrativeParts.push("VIX above 30 — high-fear environment, position size down.");
    else if (vix.price < 15) narrativeParts.push("VIX below 15 — low volatility, breakouts more reliable.");
  }

  // Credit / bonds
  if (hyg && tlt) {
    if (hyg.chgPct > 0.3 && tlt.chgPct < 0) narrativeParts.push("Credit (HYG) up while bonds sell off — classic risk-on rotation.");
    else if (hyg.chgPct < -0.3 && tlt.chgPct > 0.3) narrativeParts.push("Credit weakening + bonds rallying — flight-to-safety in play.");
  }

  // Gold / Dollar
  if (gld && uup) {
    if (gld.chgPct > 0.5 && uup.chgPct > 0.3) narrativeParts.push("Gold and dollar both up — stagflation/uncertainty hedge in demand.");
    else if (gld.chgPct > 0.5) narrativeParts.push("Gold rising — inflation hedge / safe haven buying.");
    else if (uup.chgPct > 0.5) narrativeParts.push("Dollar strengthening — headwind for commodities and EM.");
  }

  // Cyclicals vs defensives
  if (xly && xlp) {
    if (xly.chgPct > xlp.chgPct + 1) narrativeParts.push("Cyclicals (XLY) beating defensives (XLP) — growth trade on.");
    else if (xlp.chgPct > xly.chgPct + 1) narrativeParts.push("Defensives (XLP) outpacing cyclicals — caution in the market.");
  }

  // What to watch
  const watchList = [];
  if (vix && vix.price > 20) watchList.push("VIX > 20 (elevated fear)");
  if (spy && Math.abs(spy.chgPct) > 1.5) watchList.push(`SPY big move ${spy.chgPct >= 0 ? "+" : ""}${spy.chgPct.toFixed(1)}%`);
  if (hyg && hyg.chgPct < -0.5) watchList.push("HYG credit stress");
  if (gld && gld.chgPct > 1) watchList.push("Gold breakout");

  const narrative = narrativeParts.slice(0, 4).join(" ");

  const lines = [
    `${e} MACRO REPORT — ${time} ET`,
    `Regime: ${macro.regime}  (score ${macro.score > 0 ? "+" : ""}${macro.score})`,
    "",
    narrative,
    "",
    "── EQUITIES ──────────────",
    row("SPY"),
    row("QQQ"),
    row("IWM"),
    row("XLY","XLY"), row("XLP","XLP"),
    "",
    "── MACRO ─────────────────",
    row("TLT"),
    row("^VIX","VIX"),
    row("GLD"),
    row("HYG"),
    row("UUP","DXY"),
    row("EEM"),
    "",
    macro.bullFactors.length ? "Bull: " + macro.bullFactors.slice(0, 4).join(", ") : null,
    macro.bearFactors.length ? "Bear: " + macro.bearFactors.slice(0, 4).join(", ") : null,
    watchList.length ? "\nWatch: " + watchList.join(" | ") : null,
  ].filter(s => s !== null).join("\n");

  await sendTelegramMessage(lines);
  lastMacroRegime    = macro.regime;
  lastMacroAlertedAt = Date.now();
  console.log(`[Scanner] Macro report sent: ${macro.regime} score ${macro.score}`);
}


// ── Scheduled scan times (ET, M–F) ───────────────────────────────────────────
const SCHEDULED_SCAN_TIMES_ET = [
  "06:45",  // Macro Pre-Market
  "07:00",  // Pre-Market Scan 1
  "07:30",  // Pre-Market Watchlist
  "08:30",  // Pre-Open Scan
  "09:20",  // Opening Plan
  "09:45",  // Opening Range Scan
  "10:30",  // A+ Setup Scan
  "12:00",  // Midday Market Reset
  "13:30",  // Continuation Scan
  "14:45",  // Institutional / Late-Day Scan
  "15:45",  // Power Hour + Next-Day Watchlist
  "16:15",  // After-Close Report
];

const SCHEDULED_LABEL_MAP = {
  "06:45": "Macro Pre-Market",
  "07:00": "Pre-Market Scan",
  "07:30": "Pre-Market Watchlist",
  "08:30": "Pre-Open Scan",
  "09:20": "Opening Plan",
  "09:45": "Opening Range",
  "10:30": "A+ Setup",
  "12:00": "Midday Reset",
  "13:30": "Continuation",
  "14:45": "Institutional/Late-Day",
  "15:45": "Power Hour",
  "16:15": "After-Close Report",
};

// ── Specialized scheduled report helpers ──────────────────────────────────────

async function fetchAnalysisMap(symbols) {
  const settled = await Promise.allSettled(symbols.map(s => analyzeSymbol(s)));
  const aMap = new Map();
  symbols.forEach((s, i) => {
    if (settled[i].status === "fulfilled" && settled[i].value) aMap.set(s, settled[i].value);
  });
  return aMap;
}

function symRow(a, lbl) {
  if (!a) return null;
  const arrow = a.chgPct >= 0 ? "+" : "";
  const bar   = a.composite >= 65 ? "strong" : a.composite <= 35 ? "weak" : "neutral";
  return `${(lbl || a.symbol).padEnd(6)} $${String(a.price).padStart(9)}  ${(arrow + a.chgPct.toFixed(2) + "%").padStart(7)}  Score ${a.composite}  ${bar}`;
}

// 6:45 AM ─ Macro Pre-Market: futures proxies, VIX, bonds, commodities, BTC
async function sendMacroPreMarket() {
  if (!telegramConfigured()) return;
  const syms = ["SPY","QQQ","IWM","^VIX","TLT","GLD","UUP","USO","BTC-USD","HYG","UVXY","EEM"];
  const aMap  = await fetchAnalysisMap(syms);
  const macro = computeMacroRegime(aMap);
  const e     = macro.regime === "RISK-ON" ? "🟢" : macro.regime === "RISK-OFF" ? "🔴" : "⚪";
  const time  = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });

  const spy = aMap.get("SPY"), qqq = aMap.get("QQQ"), iwm = aMap.get("IWM");
  const vix = aMap.get("^VIX"), tlt = aMap.get("TLT"), gld = aMap.get("GLD");
  const uup = aMap.get("UUP"), uso = aMap.get("USO"), btc = aMap.get("BTC-USD");
  const hyg = aMap.get("HYG"), eem = aMap.get("EEM");

  const yieldDir = tlt ? (tlt.chgPct < -0.2 ? "yields RISING" : tlt.chgPct > 0.2 ? "yields FALLING" : "yields flat") : "";
  const vixMood  = !vix ? "" : vix.price > 30 ? "HIGH FEAR — size down" : vix.price > 22 ? "elevated" : vix.price < 15 ? "calm, breakouts work" : "normal";

  const bias = macro.regime === "RISK-ON"  ? "Lean LONG. Buy dips on leading sectors."
             : macro.regime === "RISK-OFF" ? "Lean DEFENSIVE. Tighten stops, avoid chasing."
             :                               "NEUTRAL. Wait for open confirmation before sizing up.";

  const lines = [
    `🌅 MACRO PRE-MARKET — ${time} ET`,
    `${e} Regime: ${macro.regime}  (score ${macro.score > 0 ? "+" : ""}${macro.score})`,
    `Bias: ${bias}`,
    "",
    "── OVERNIGHT SNAPSHOT ───────────────",
    symRow(spy, "SPY"),
    symRow(qqq, "QQQ"),
    symRow(iwm, "IWM"),
    vix  ? `VIX    $${vix.price}  ${vix.chgPct >= 0 ? "+" : ""}${vix.chgPct.toFixed(2)}%  ${vixMood}`  : null,
    tlt  ? `TLT    $${tlt.price}  ${tlt.chgPct >= 0 ? "+" : ""}${tlt.chgPct.toFixed(2)}%  ${yieldDir}` : null,
    symRow(hyg, "HYG"),
    symRow(gld, "GOLD"),
    symRow(uup, "DXY"),
    symRow(uso, "OIL"),
    symRow(btc, "BTC"),
    symRow(eem, "EM"),
    "",
    macro.bullFactors.length ? "Bull: " + macro.bullFactors.slice(0, 4).join(", ") : null,
    macro.bearFactors.length ? "Bear: " + macro.bearFactors.slice(0, 4).join(", ") : null,
    vix && vix.price > 25 ? "\nVIX > 25 — reduce position size today" : null,
  ].filter(s => s !== null).join("\n");

  // Append overnight Reddit finance headlines (best-effort)
  let fullMsg = lines;
  try {
    const news = await withTimeout(fetchFinanceNews({ postsPerSub: 2 }), 15_000, null);
    if (news?.length) {
      const top = news.slice(0, 6);
      fullMsg += "\n\n── OVERNIGHT REDDIT HEADLINES ───────\n";
      for (const p of top) {
        const score = p.score > 0 ? ` ⬆️${p.score > 999 ? (p.score/1000).toFixed(1)+"k" : p.score}` : "";
        fullMsg += `[${p.label}]${score} ${p.title.slice(0, 90)}\n`;
      }
    }
  } catch { /* ignore */ }

  await sendTelegramMessage(fullMsg);
  console.log(`[Scanner] Macro Pre-Market report sent`);
}

// 7:30 AM ─ Pre-Market Watchlist: top gappers, key levels, news movers
async function sendPreMarketWatchlist() {
  if (!telegramConfigured()) return;
  const syms = [
    "SPY","QQQ","IWM",
    "NVDA","TSLA","AAPL","META","AMZN","MSFT","GOOGL","AMD",
    "PLTR","COIN","MSTR","SMCI","ARM","HOOD","SOFI","CRWD","NET",
    "BTC-USD","ETH-USD","IBIT",
  ];
  const aMap = await fetchAnalysisMap(syms);
  const time = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });

  const all      = [...aMap.values()];
  const topRvol  = [...all].sort((a, b) => b.rvol - a.rvol).slice(0, 6);
  const topBull  = [...all].filter(a => a.composite >= 58).sort((a, b) => b.composite - a.composite).slice(0, 5);
  const topBear  = [...all].filter(a => a.composite <= 42).sort((a, b) => a.composite - b.composite).slice(0, 3);
  const spy = aMap.get("SPY"), qqq = aMap.get("QQQ");

  let msg = `📋 PRE-MARKET WATCHLIST — ${time} ET\n\n`;

  msg += "── HIGH ACTIVITY (RVOL) ─────────────\n";
  for (const a of topRvol) {
    const chg = `${a.chgPct >= 0 ? "+" : ""}${a.chgPct.toFixed(2)}%`;
    msg += `${a.symbol.padEnd(8)} $${a.price}  ${chg}  RVOL ${a.rvol}x\n`;
  }

  msg += "\n── BULLISH SETUPS ───────────────────\n";
  for (const a of topBull) {
    const chg = `${a.chgPct >= 0 ? "+" : ""}${a.chgPct.toFixed(2)}%`;
    msg += `${a.symbol.padEnd(8)} $${a.price}  ${chg}  Score ${a.composite}  Res $${a.resistance}\n`;
  }

  if (topBear.length) {
    msg += "\n── BEARISH / AVOID ──────────────────\n";
    for (const a of topBear) {
      const chg = `${a.chgPct >= 0 ? "+" : ""}${a.chgPct.toFixed(2)}%`;
      msg += `${a.symbol.padEnd(8)} $${a.price}  ${chg}  Score ${a.composite}  Sup $${a.support}\n`;
    }
  }

  msg += "\n── KEY LEVELS ───────────────────────\n";
  if (spy) msg += `SPY  $${spy.price}  Sup $${spy.support} / Res $${spy.resistance}\n`;
  if (qqq) msg += `QQQ  $${qqq.price}  Sup $${qqq.support} / Res $${qqq.resistance}\n`;

  // StockTwits trending — best effort, never blocks the report
  try {
    const twits = await withTimeout(stTrending(12), 8_000, null);
    if (twits?.length) {
      msg += "\n── STOCKTWITS TRENDING ──────────────\n";
      for (const t of twits.slice(0, 10)) {
        msg += `${t.symbol.padEnd(8)} ${t.title.slice(0, 28)}\n`;
      }
      msg += "Full sentiment: /twits  or  /twits NVDA\n";
    }
  } catch { /* ignore */ }

  // Reddit pre-market headlines — finance + tech
  try {
    const news = await withTimeout(fetchAllNews({ postsPerSub: 2 }), 15_000, null);
    if (news?.length) {
      msg += "\n── REDDIT PRE-MARKET HEADLINES ──────\n";
      const dedup = [];
      const seen  = new Set();
      for (const p of news) {
        const key = p.title.slice(0, 35).toLowerCase();
        if (!seen.has(key)) { seen.add(key); dedup.push(p); }
        if (dedup.length >= 8) break;
      }
      for (const p of dedup) {
        const score = p.score > 0 ? ` ⬆️${p.score > 999 ? (p.score/1000).toFixed(1)+"k" : p.score}` : "";
        msg += `[${p.label}]${score} ${p.title.slice(0, 85)}\n`;
      }
      msg += "Full feed: /news  |  /news wsb  |  /news tech";
    }
  } catch { /* ignore */ }

  await sendTelegramMessage(msg.trim());
  console.log(`[Scanner] Pre-Market Watchlist sent`);
}

// 9:20 AM ─ Opening Plan: final bias, top 5, no-trade zones, key levels
async function sendOpeningPlan() {
  if (!telegramConfigured()) return;
  const syms = [
    "SPY","QQQ","IWM","^VIX",
    "NVDA","TSLA","AAPL","META","AMZN","MSFT","GOOGL","AMD",
    "PLTR","COIN","MSTR","SMCI","ARM","HOOD","SOFI","CRWD",
    "XLK","XLF","XLE",
  ];
  const aMap  = await fetchAnalysisMap(syms);
  const macro = computeMacroRegime(aMap);
  const e     = macro.regime === "RISK-ON" ? "🟢" : macro.regime === "RISK-OFF" ? "🔴" : "⚪";
  const time  = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
  const vix   = aMap.get("^VIX");
  const spy   = aMap.get("SPY"), qqq = aMap.get("QQQ");

  const all      = [...aMap.values()];
  const top5     = [...all].filter(a => a.composite >= 60 && a.trend !== "Downtrend")
                            .sort((a, b) => b.composite - a.composite).slice(0, 5);
  const noTrade  = [...all]
    .filter(a => (a.rsi > 73 && a.rvol < 1.2) || (a.composite > 52 && a.composite < 62 && a.rvol < 0.9))
    .slice(0, 3);

  const biasText = macro.regime === "RISK-ON"  ? "BULLISH — buy dips, hold winners"
                 : macro.regime === "RISK-OFF" ? "BEARISH — reduce longs, short bounces"
                 :                               "NEUTRAL — range trade, no chasing";

  const vixNote = !vix ? "" : vix.price > 25 ? `VIX ${vix.price} — choppy, size DOWN` :
                               vix.price < 15 ? `VIX ${vix.price} — calm, breakouts reliable` :
                               `VIX ${vix.price}`;

  let msg = `📌 OPENING PLAN — ${time} ET\n`;
  msg += `${e} Bias: ${biasText}\n`;
  if (vixNote) msg += `${vixNote}\n`;

  msg += "\n── TOP 5 TO WATCH ───────────────────\n";
  if (top5.length) {
    for (const a of top5) {
      const chg = `${a.chgPct >= 0 ? "+" : ""}${a.chgPct.toFixed(2)}%`;
      msg += `${a.symbol.padEnd(8)} $${a.price}  ${chg}  Score ${a.composite}  Entry > $${a.resistance}\n`;
    }
  } else {
    msg += "No high-conviction setups — wait for open confirmation\n";
  }

  if (noTrade.length) {
    msg += "\n── NO-TRADE ZONES ───────────────────\n";
    for (const a of noTrade) {
      msg += `${a.symbol.padEnd(8)} RSI ${a.rsi}  RVOL ${a.rvol}x — wait for pullback\n`;
    }
  }

  msg += "\n── KEY LEVELS ───────────────────────\n";
  if (spy) msg += `SPY  $${spy.price}  Sup $${spy.support} / Res $${spy.resistance}\n`;
  if (qqq) msg += `QQQ  $${qqq.price}  Sup $${qqq.support} / Res $${qqq.resistance}\n`;

  await sendTelegramMessage(msg.trim());
  console.log(`[Scanner] Opening Plan sent`);
}

// 12:00 PM ─ Midday Reset: trend strength, sector rotation, reversal risk
async function sendMiddayReset() {
  if (!telegramConfigured()) return;
  const syms = ["SPY","QQQ","IWM","^VIX","HYG","TLT","XLK","XLF","XLE","XLV","XLI","XLY","XLP","XLU"];
  const aMap = await fetchAnalysisMap(syms);
  const time = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });

  const spy = aMap.get("SPY"), qqq = aMap.get("QQQ"), iwm = aMap.get("IWM");
  const vix = aMap.get("^VIX"), hyg = aMap.get("HYG"), tlt = aMap.get("TLT");

  const trendStr = !spy ? "N/A"
    : spy.composite >= 70 ? "STRONG UPTREND"
    : spy.composite >= 55 ? "Moderate Uptrend"
    : spy.composite <= 30 ? "STRONG DOWNTREND"
    : spy.composite <= 45 ? "Moderate Downtrend" : "CHOPPY / RANGE";

  const revRisk = (vix && vix.chgPct > 10) ? "HIGH"
               : (spy && Math.abs(spy.chgPct) > 1.8) ? "HIGH"
               : (vix && vix.price > 22) ? "MEDIUM" : "LOW";

  const sectorMeta = [
    ["XLK","Tech"],["XLF","Finance"],["XLE","Energy"],["XLV","Health"],
    ["XLI","Industrial"],["XLY","Cyclicals"],["XLP","Staples"],["XLU","Utilities"],
  ];
  const sectors = sectorMeta
    .map(([sym, name]) => ({ name, a: aMap.get(sym) }))
    .filter(s => s.a)
    .sort((a, b) => b.a.chgPct - a.a.chgPct);

  // Failed move: was strong morning then fading (RSI dropped, rvol fading)
  const failedMoves = [...aMap.values()]
    .filter(a => a.composite >= 60 && a.chgPct < 0 && a.rvol > 1.2)
    .slice(0, 3);

  let msg = `🔄 MIDDAY RESET — ${time} ET\n`;
  msg += `Trend: ${trendStr}  |  Reversal Risk: ${revRisk}\n`;
  if (spy) msg += `SPY ${spy.chgPct >= 0 ? "+" : ""}${spy.chgPct.toFixed(2)}%`;
  if (qqq) msg += `  QQQ ${qqq.chgPct >= 0 ? "+" : ""}${qqq.chgPct.toFixed(2)}%`;
  if (iwm) msg += `  IWM ${iwm.chgPct >= 0 ? "+" : ""}${iwm.chgPct.toFixed(2)}%`;
  msg += "\n";

  msg += "\n── SECTOR ROTATION ──────────────────\n";
  for (const s of sectors) {
    const d   = s.a.chgPct >= 0 ? "+" : "";
    const lbl = s.a.composite >= 65 ? "LEADING" : s.a.composite <= 35 ? "LAGGING" : "neutral";
    msg += `${s.name.padEnd(12)} ${d}${s.a.chgPct.toFixed(2)}%  Score ${s.a.composite}  ${lbl}\n`;
  }

  if (hyg && tlt) {
    msg += "\n── CREDIT / BONDS ───────────────────\n";
    msg += `HYG ${hyg.chgPct >= 0 ? "+" : ""}${hyg.chgPct.toFixed(2)}%  TLT ${tlt.chgPct >= 0 ? "+" : ""}${tlt.chgPct.toFixed(2)}%`;
    if (hyg.chgPct > 0.3 && tlt.chgPct < 0) msg += "  → Risk-on rotation";
    else if (hyg.chgPct < -0.3 && tlt.chgPct > 0.3) msg += "  → Flight to safety";
    msg += "\n";
  }

  if (failedMoves.length) {
    msg += "\n── FAILED MOVES (reversal risk) ─────\n";
    for (const a of failedMoves) {
      msg += `${a.symbol.padEnd(8)} $${a.price}  ${a.chgPct.toFixed(2)}%  Score ${a.composite} but fading\n`;
    }
  }

  if (revRisk === "HIGH") msg += "\nALERT: High reversal risk — tighten stops, avoid new entries";

  await sendTelegramMessage(msg.trim());
  console.log(`[Scanner] Midday Reset sent`);
}

// 3:45 PM ─ Power Hour + Next-Day Watchlist
async function sendPowerHourWatchlist() {
  if (!telegramConfigured()) return;
  const syms = [
    "SPY","QQQ","IWM",
    "NVDA","TSLA","AAPL","META","AMZN","MSFT","GOOGL","AMD",
    "PLTR","COIN","MSTR","SMCI","ARM","HOOD","SOFI","CRWD","NET","DDOG",
  ];
  const aMap  = await fetchAnalysisMap(syms);
  const macro = computeMacroRegime(aMap);
  const time  = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });

  const all         = [...aMap.values()];
  const strongClose = [...all].filter(a => a.composite >= 65 && a.trend !== "Downtrend" && a.rvol >= 1.0)
                              .sort((a, b) => b.composite - a.composite).slice(0, 5);
  const weakClose   = [...all].filter(a => a.composite <= 35 && a.rvol >= 1.0)
                              .sort((a, b) => a.composite - b.composite).slice(0, 3);
  const spy = aMap.get("SPY"), qqq = aMap.get("QQQ");

  let msg = `⚡ POWER HOUR + NEXT-DAY WATCHLIST — ${time} ET\n\n`;

  msg += "── STRONG CLOSES (swing long ideas) ─\n";
  if (strongClose.length) {
    for (const a of strongClose) {
      const chg  = `${a.chgPct >= 0 ? "+" : ""}${a.chgPct.toFixed(2)}%`;
      const risk = round2(Math.max(a.price - a.support, 0.01));
      const tgt  = round2(a.price + risk * 2);
      msg += `${a.symbol.padEnd(8)} $${a.price}  ${chg}  Score ${a.composite}  Tgt $${tgt}  Stop $${a.support}\n`;
    }
  } else { msg += "No strong closes — choppy session\n"; }

  if (weakClose.length) {
    msg += "\n── WEAK CLOSES (avoid / watch short) ─\n";
    for (const a of weakClose) {
      const chg = `${a.chgPct >= 0 ? "+" : ""}${a.chgPct.toFixed(2)}%`;
      msg += `${a.symbol.padEnd(8)} $${a.price}  ${chg}  Score ${a.composite}  avoid tomorrow\n`;
    }
  }

  msg += "\n── TOMORROW KEY LEVELS ──────────────\n";
  if (spy) msg += `SPY  $${spy.price}  Sup $${spy.support} / Res $${spy.resistance}\n`;
  if (qqq) msg += `QQQ  $${qqq.price}  Sup $${qqq.support} / Res $${qqq.resistance}\n`;

  const e = macro.regime === "RISK-ON" ? "🟢" : macro.regime === "RISK-OFF" ? "🔴" : "⚪";
  msg += `\nOverall regime: ${e} ${macro.regime}`;

  await sendTelegramMessage(msg.trim());
  console.log(`[Scanner] Power Hour Watchlist sent`);
}

// 4:15 PM ─ After-Close Report: full recap + tomorrow setup
async function sendAfterCloseReport() {
  if (!telegramConfigured()) return;
  const syms = [
    "SPY","QQQ","IWM","DIA",
    "XLK","XLF","XLE","XLV","XLY","XLP",
    "^VIX","TLT","HYG","GLD","UUP","BTC-USD",
  ];
  const aMap  = await fetchAnalysisMap(syms);
  const macro = computeMacroRegime(aMap);
  const e     = macro.regime === "RISK-ON" ? "🟢" : macro.regime === "RISK-OFF" ? "🔴" : "⚪";
  const time  = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });

  const spy = aMap.get("SPY"), qqq = aMap.get("QQQ"), iwm = aMap.get("IWM"), dia = aMap.get("DIA");
  const vix = aMap.get("^VIX"), tlt = aMap.get("TLT"), hyg = aMap.get("HYG");
  const gld = aMap.get("GLD"), btc = aMap.get("BTC-USD");

  const sectorMeta = [["XLK","Tech"],["XLF","Finance"],["XLE","Energy"],["XLV","Health"],["XLY","Cyclicals"],["XLP","Staples"]];
  const sectors = sectorMeta.map(([s, n]) => ({ name: n, a: aMap.get(s) })).filter(s => s.a)
                             .sort((a, b) => b.a.chgPct - a.a.chgPct);

  const recentBuys  = lastRunResults.filter(h => h.signal === "BUY").slice(0, 4);
  const recentSells = lastRunResults.filter(h => h.signal === "SELL").slice(0, 4);

  let msg = `📊 AFTER-CLOSE REPORT — ${time} ET\n`;
  msg += `${e} Regime: ${macro.regime}  (score ${macro.score > 0 ? "+" : ""}${macro.score})\n`;

  msg += "\n── TODAY'S CLOSE ────────────────────\n";
  if (spy) msg += `SPY  ${spy.chgPct >= 0 ? "+" : ""}${spy.chgPct.toFixed(2)}%`;
  if (qqq) msg += `  QQQ  ${qqq.chgPct >= 0 ? "+" : ""}${qqq.chgPct.toFixed(2)}%`;
  if (iwm) msg += `  IWM  ${iwm.chgPct >= 0 ? "+" : ""}${iwm.chgPct.toFixed(2)}%`;
  if (dia) msg += `  DIA  ${dia.chgPct >= 0 ? "+" : ""}${dia.chgPct.toFixed(2)}%`;
  msg += "\n";
  if (vix) msg += `VIX ${vix.price}  ${vix.chgPct >= 0 ? "+" : ""}${vix.chgPct.toFixed(2)}%\n`;

  msg += "\n── SECTOR PERFORMANCE ───────────────\n";
  for (const s of sectors) {
    const d   = s.a.chgPct >= 0 ? "+" : "";
    const lbl = s.a.composite >= 65 ? "LEADING" : s.a.composite <= 35 ? "LAGGING" : "neutral";
    msg += `${s.name.padEnd(12)} ${d}${s.a.chgPct.toFixed(2)}%  ${lbl}\n`;
  }

  if (recentBuys.length || recentSells.length) {
    msg += "\n── TODAY'S BEST SIGNALS ─────────────\n";
    for (const h of recentBuys)  msg += `🟢 ${h.symbol}  $${h.price}  BUY  Score ${h.composite}\n`;
    for (const h of recentSells) msg += `🔴 ${h.symbol}  $${h.price}  EXIT  Score ${h.composite}\n`;
  }

  msg += "\n── TOMORROW KEY LEVELS ──────────────\n";
  if (spy) msg += `SPY  $${spy.price}  Sup $${spy.support} / Res $${spy.resistance}\n`;
  if (qqq) msg += `QQQ  $${qqq.price}  Sup $${qqq.support} / Res $${qqq.resistance}\n`;
  if (btc) msg += `BTC  $${btc.price}  ${btc.chgPct >= 0 ? "+" : ""}${btc.chgPct.toFixed(2)}%\n`;

  msg += "\n── OVERNIGHT WATCH ──────────────────\n";
  if (tlt) msg += `Bonds (TLT)  $${tlt.price}  ${tlt.chgPct >= 0 ? "+" : ""}${tlt.chgPct.toFixed(2)}%  ${tlt.chgPct < -0.2 ? "(yields rising)" : "(yields falling)"}\n`;
  if (hyg) msg += `Credit (HYG) $${hyg.price}  ${hyg.chgPct >= 0 ? "+" : ""}${hyg.chgPct.toFixed(2)}%\n`;
  if (gld) msg += `Gold         $${gld.price}  ${gld.chgPct >= 0 ? "+" : ""}${gld.chgPct.toFixed(2)}%\n`;

  const outlook = macro.regime === "RISK-ON"  ? "Outlook: Bullish bias tomorrow. Focus on longs off support."
               : macro.regime === "RISK-OFF" ? "Outlook: Cautious. Watch for gap-down, reduce exposure."
               :                               "Outlook: Mixed. Wait for open direction before committing.";
  msg += "\n" + outlook;

  // StockTwits end-of-day trending
  try {
    const twits = await withTimeout(stTrending(12), 8_000, null);
    if (twits?.length) {
      msg += "\n\n── STOCKTWITS EOD TRENDING ──────────\n";
      for (const t of twits.slice(0, 8)) {
        msg += `${t.symbol.padEnd(8)} ${t.title.slice(0, 28)}\n`;
      }
      msg += "/twits SYMBOL for crowd sentiment\n";
    }
  } catch { /* ignore */ }

  // Reddit EOD discussion — what the community is talking about after close
  try {
    const news = await withTimeout(fetchAllNews({ postsPerSub: 2 }), 15_000, null);
    if (news?.length) {
      msg += "\n── REDDIT EOD DISCUSSION ────────────\n";
      const dedup = [];
      const seen  = new Set();
      for (const p of news) {
        const key = p.title.slice(0, 35).toLowerCase();
        if (!seen.has(key)) { seen.add(key); dedup.push(p); }
        if (dedup.length >= 6) break;
      }
      for (const p of dedup) {
        const score = p.score > 0 ? ` ⬆️${p.score > 999 ? (p.score/1000).toFixed(1)+"k" : p.score}` : "";
        msg += `[${p.label}]${score} ${p.title.slice(0, 85)}\n`;
      }
      msg += "/news wsb  /news stocks  /news tech  /news ai";
    }
  } catch { /* ignore */ }

  await sendTelegramMessage(msg.trim());
  console.log(`[Scanner] After-Close Report sent`);
}

// ─────────────────────────────────────────────────────────────────────────────

// Symbols that trade 24/7 — the only ones sent on weekends
const CRYPTO_SYMBOLS = new Set([
  "BTC-USD","ETH-USD","SOL-USD","BNB-USD","XRP-USD","DOGE-USD","ADA-USD",
  "IBIT","FBTC","GBTC","MSTR","COIN","HOOD",
]);

function isCryptoSymbol(sym) {
  return CRYPTO_SYMBOLS.has(sym.toUpperCase());
}

function getEtTime() {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date());
    const [wd, time] = fmt.split(", ");
    return { wd, time };
  } catch { return { wd: "Mon", time: "00:00" }; }
}

function isWeekend() {
  const { wd } = getEtTime();
  return wd === "Sat" || wd === "Sun";
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let lastScheduledRunAt = 0;
let lastScheduledTimeLabel = "";  // prevents double-firing within the same minute

function startMarketScanner() {
  const cfg = loadConfig();

  // First scan 90s after startup (let server settle)
  const t = setTimeout(() => {
    lastScheduledRunAt = Date.now();
    runScan().catch(() => {});
  }, 90_000);
  if (t.unref) t.unref();

  // ── Interval-based scan (every N minutes, 24/7 for crypto + AH) ───────────
  const iv = setInterval(() => {
    const cur = loadConfig();
    if (!cur.enabled) return;
    const ms = Math.max(1, cur.intervalMinutes || 5) * 60_000;
    if (Date.now() - lastScheduledRunAt >= ms) {
      lastScheduledRunAt = Date.now();
      runScan().catch(() => {});
    }
  }, 60_000);
  if (iv.unref) iv.unref();

  // ── Time-based scan: fire at specific ET clock times M-F ──────────────────
  const tv = setInterval(() => {
    const { wd, time } = getEtTime();
    if (wd === "Sat" || wd === "Sun") return;
    if (!SCHEDULED_SCAN_TIMES_ET.includes(time)) return;
    if (time === lastScheduledTimeLabel) return; // already fired this minute
    lastScheduledTimeLabel = time;
    lastScheduledRunAt = Date.now();

    const label = SCHEDULED_LABEL_MAP[time] || time;
    console.log(`[Scanner] Scheduled: ${label} — ${time} ET`);

    // Dispatch to specialized report or standard entry/exit scan
    if (time === "06:45") {
      // 6:45 AM — Macro Pre-Market: futures, VIX, bonds, gold, BTC
      sendMacroPreMarket().catch(() => {});

    } else if (time === "07:30") {
      // 7:30 AM — Pre-Market Watchlist: gappers, volume, key levels
      sendPreMarketWatchlist().catch(() => {});

    } else if (time === "09:20") {
      // 9:20 AM — Opening Plan: final bias, top 5, no-trade zones
      sendOpeningPlan().catch(() => {});

    } else if (time === "12:00") {
      // 12:00 PM — Midday Reset: trend, sector rotation, reversal risk
      sendMiddayReset().catch(() => {});

    } else if (time === "15:45") {
      // 3:45 PM — Power Hour + Next-Day Watchlist
      sendPowerHourWatchlist().catch(() => {});

    } else if (time === "16:15") {
      // 4:15 PM — After-Close Report: full recap + tomorrow levels
      sendAfterCloseReport().catch(() => {});

    } else {
      // 9:45, 10:30, 13:30, 14:45 — Full entry/exit signal scan
      if (telegramConfigured()) {
        sendTelegramMessage(`⏰ ${label} Scan — ${time} ET`).catch(() => {});
      }
      runScan({ scheduledLabel: label }).catch(() => {});
    }
  }, 30_000); // check every 30s so we never miss a minute
  if (tv.unref) tv.unref();

  const timeStr = SCHEDULED_SCAN_TIMES_ET.join(", ");
  console.log(`[Scanner] Started — ${cfg.intervalMinutes}min interval + scheduled ET: ${timeStr}`);
}

module.exports = { startMarketScanner, runScan, getScannerStatus, sendMacroReport, loadConfig, saveConfig, DEFAULT_SYMBOLS, analyzeSymbol, computeMacroRegime, SCHEDULED_SCAN_TIMES_ET };
