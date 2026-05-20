const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./config");
const { fetchYahooBars } = require("./providers/yahoo");
const { computeEMA, computeRSI } = require("./indicators");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
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
  intervalMinutes: 5,    // scan every 5 min
  buyScoreMin: 62,       // was 68 — lowered so more signals fire
  sellScoreMax: 38,      // was 35 — widened
  minRvol: 1.0,
  cooldownHours: 2,      // re-alert same symbol after 2h
  marketHoursOnly: false, // OFF — run scans 24/7 (crypto + AH stocks)
  concurrency: 16,
};

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
  const last = cooldownMap.get(`${symbol}:${signal}`);
  if (last && Date.now() - last < cooldownHours * 3600_000) return true;
  if (lastSignalMap.get(symbol) === signal) return true;
  return false;
}

function recordSignal(symbol, signal) {
  cooldownMap.set(`${symbol}:${signal}`, Date.now());
  lastSignalMap.set(symbol, signal);
  cooldownMap.delete(`${symbol}:${signal === "BUY" ? "SELL" : "BUY"}`);
}

// ── Telegram alert formatter ──────────────────────────────────────────────────

function formatScanAlert(a, signal) {
  const e    = signal === "BUY" ? "🟢" : "🔴";
  const chg  = `${a.chgPct >= 0 ? "+" : ""}${a.chgPct.toFixed(2)}%`;
  const time = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
  return [
    `${e} ${signal} — ${a.symbol} @ $${a.price}`,
    `Score: ${a.composite}/100  RSI: ${a.rsi}  RVOL: ${a.rvol}x`,
    `Trend: ${a.trend}  Change: ${chg}`,
    `EMA9/21: ${a.emaAligned}  Support: $${a.support}  Res: $${a.resistance}`,
    `${time} ET`,
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

async function runScan() {
  if (isRunning) return { skipped: true, reason: "scan already in progress" };
  const cfg = loadConfig();
  if (!cfg.enabled) return { skipped: true, reason: "scanner disabled" };
  if (cfg.marketHoursOnly && !isDuringMarketHours()) {
    return { skipped: true, reason: "outside market hours" };
  }

  isRunning = true;
  const hits   = [];
  const errors = [];
  let symbolsScanned = 0;

  try {
    const symbols = (cfg.symbols || DEFAULT_SYMBOLS)
      .map(s => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 500);
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

    // ── Macro regime alert ──────────────────────────────────────────────────
    if (telegramConfigured()) {
      const macro = computeMacroRegime(analysisMap);
      const regimeChanged = macro.regime !== lastMacroRegime;
      const cooldownExpired = Date.now() - lastMacroAlertedAt > MACRO_COOLDOWN_MS;

      if (regimeChanged || (macro.regime !== "NEUTRAL" && cooldownExpired)) {
        lastMacroRegime    = macro.regime;
        lastMacroAlertedAt = Date.now();

        const e     = macro.regime === "RISK-ON" ? "🟢" : macro.regime === "RISK-OFF" ? "🔴" : "⚪";
        const label = regimeChanged ? `REGIME SHIFT → ${macro.regime}` : `MACRO: ${macro.regime}`;
        const time  = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });

        const spyA = analysisMap.get("SPY"),  tltA = analysisMap.get("TLT");
        const uvxyA = analysisMap.get("UVXY"), uupA = analysisMap.get("UUP");
        const hygA  = analysisMap.get("HYG"),  gldA = analysisMap.get("GLD");

        const snap = [
          spyA  ? `SPY ${spyA.trend}  Score ${spyA.composite}`   : null,
          tltA  ? `TLT Score ${tltA.composite}  RSI ${tltA.rsi}` : null,
          uvxyA ? `UVXY Score ${uvxyA.composite}`                 : null,
          hygA  ? `HYG Score ${hygA.composite}`                   : null,
          uupA  ? `DXY Score ${uupA.composite}`                   : null,
          gldA  ? `GLD Score ${gldA.composite}`                   : null,
        ].filter(Boolean).join("\n");

        const factors = [
          macro.bullFactors.length ? `Bull: ${macro.bullFactors.join(", ")}` : null,
          macro.bearFactors.length ? `Bear: ${macro.bearFactors.join(", ")}` : null,
        ].filter(Boolean).join("\n");

        sendTelegramMessage(
          `${e} ${label}  (score ${macro.score > 0 ? "+" : ""}${macro.score})\n\n` +
          `${snap}\n\n${factors}\n${time} ET`
        ).catch(() => {});
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
      });
    }

    // ── Send one grouped Telegram summary (not one msg per signal) ──────────
    if (hits.length > 0 && telegramConfigured()) {
      const time  = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
      const buys  = hits.filter(h => h.signal === "BUY")
                        .sort((a,b) => b.composite - a.composite).slice(0, 5);
      const sells = hits.filter(h => h.signal === "SELL")
                        .sort((a,b) => a.composite - b.composite).slice(0, 5);

      let msg = `📡 SCAN — ${time} ET  (${symbols.length} symbols)\n`;

      if (buys.length) {
        msg += `\n🟢 TOP BUY (${buys.length} new)\n`;
        for (const h of buys) {
          const chg = `${h.chgPct >= 0 ? "+" : ""}${h.chgPct.toFixed(2)}%`;
          msg += `${h.symbol}  $${h.price}  ${chg}  Score ${h.composite}  RSI ${h.rsi}  RVOL ${h.rvol}x\n`;
        }
      }
      if (sells.length) {
        msg += `\n🔴 TOP SELL (${sells.length} new)\n`;
        for (const h of sells) {
          const chg = `${h.chgPct >= 0 ? "+" : ""}${h.chgPct.toFixed(2)}%`;
          msg += `${h.symbol}  $${h.price}  ${chg}  Score ${h.composite}  RSI ${h.rsi}  RVOL ${h.rvol}x\n`;
        }
      }
      sendTelegramMessage(msg.trim()).catch(() => {});
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

  const lines = [
    `${e} MACRO REPORT — ${time} ET`,
    `Regime: ${macro.regime}  (score ${macro.score > 0 ? "+" : ""}${macro.score})`,
    "",
    "── EQUITIES ──────────────────",
    row("SPY"),
    row("QQQ"),
    row("IWM"),
    row("XLY","XLY"), row("XLP","XLP"),
    "",
    "── MACRO INSTRUMENTS ─────────",
    row("TLT"),
    row("^VIX","VIX"),
    row("GLD"),
    row("HYG"),
    row("UUP","DXY"),
    row("EEM"),
    "",
    macro.bullFactors.length ? "Bull: " + macro.bullFactors.slice(0, 4).join(", ") : null,
    macro.bearFactors.length ? "Bear: " + macro.bearFactors.slice(0, 4).join(", ") : null,
  ].filter(s => s !== null).join("\n");

  await sendTelegramMessage(lines);
  lastMacroRegime    = macro.regime;
  lastMacroAlertedAt = Date.now();
  console.log(`[Scanner] Macro report sent: ${macro.regime} score ${macro.score}`);
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let lastScheduledRunAt = 0;

function startMarketScanner() {
  const cfg = loadConfig();

  // First scan 30s after startup
  const t = setTimeout(() => {
    lastScheduledRunAt = Date.now();
    runScan().catch(() => {});
  }, 30_000);
  if (t.unref) t.unref();

  // Tick every 60s; re-reads config so interval changes apply without restart
  const iv = setInterval(() => {
    const cur = loadConfig();
    if (!cur.enabled) return;
    const ms = Math.max(1, cur.intervalMinutes || 3) * 60_000;
    if (Date.now() - lastScheduledRunAt >= ms) {
      lastScheduledRunAt = Date.now();
      runScan().catch(() => {});
    }
  }, 60_000);
  if (iv.unref) iv.unref();

  console.log(`[Scanner] Started — ${cfg.intervalMinutes}min interval, ${(cfg.symbols || DEFAULT_SYMBOLS).length} symbols`);
}

module.exports = { startMarketScanner, runScan, getScannerStatus, sendMacroReport, loadConfig, saveConfig, DEFAULT_SYMBOLS };
