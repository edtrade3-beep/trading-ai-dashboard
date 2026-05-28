// ── agent.js — Rule-based AI features (no API key required) ────────────────
const { writeJson, readRequestBody } = require("../utils");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("../telegram");

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt2  = (n) => Number(n || 0).toFixed(2);
const fmt1  = (n) => Number(n || 0).toFixed(1);
const fmtPct= (n) => `${Number(n || 0) >= 0 ? "+" : ""}${fmt1(n)}%`;
const now   = () => new Date().toISOString();
const fmtDate = () => new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

// ── Sentiment keyword scoring ─────────────────────────────────────────────────
const BULL_WORDS = ["rally","soar","surge","gain","beat","record","breakthrough","upgrade","buy","strong","bullish","positive","growth","profit","exceed","outperform","expansion","recovery","momentum","opportunity","peak","high","upside","optimism","approve","acquisition","partnership","launch","approval","contract","revenue","earnings beat","raised","rebound","breakout","accumulate"];
const BEAR_WORDS = ["crash","fall","drop","decline","miss","loss","warning","cut","downgrade","sell","weak","bearish","negative","recession","concern","risk","fear","low","danger","debt","bankruptcy","probe","investigation","lawsuit","fine","penalty","recall","delay","miss","below","hurt","slump","plunge","plummet","tank","layoff","downside","dilution","shortfall","suspended","cancel","fraud","default"];

function scoreSentiment(text) {
  const t = (text || "").toLowerCase();
  let score = 0;
  BULL_WORDS.forEach(w => { if (t.includes(w)) score += 1; });
  BEAR_WORDS.forEach(w => { if (t.includes(w)) score -= 1; });
  if (score > 0) return { s: "bull", score: Math.min(score, 5) };
  if (score < 0) return { s: "bear", score: Math.max(score, -5) };
  return { s: "neutral", score: 0 };
}

// ── Technical pattern detection ───────────────────────────────────────────────
function sma(arr, n) {
  if (arr.length < n) return null;
  const slice = arr.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}
function ema(arr, n) {
  if (arr.length < n) return null;
  const k = 2 / (n + 1);
  let e = arr.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const recent = closes.slice(-period - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}
function detectPatterns(bars) {
  if (!bars || bars.length < 20) return [];
  const closes = bars.map(b => b.close);
  const highs   = bars.map(b => b.high);
  const lows    = bars.map(b => b.low);
  const vols    = bars.map(b => b.volume || 0);
  const patterns = [];
  const last    = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  // Moving averages
  const ma20  = sma(closes, 20);
  const ma50  = sma(closes, Math.min(50, closes.length));
  const ma200 = closes.length >= 200 ? sma(closes, 200) : null;

  if (ma50 && ma200) {
    const prevMa50  = sma(closes.slice(0, -1), Math.min(50, closes.length - 1));
    const prevMa200 = sma(closes.slice(0, -1), Math.min(200, closes.length - 1));
    if (prevMa50 < prevMa200 && ma50 > ma200) patterns.push("⚡ GOLDEN CROSS — 50MA just crossed above 200MA (strong bullish signal)");
    if (prevMa50 > prevMa200 && ma50 < ma200) patterns.push("💀 DEATH CROSS — 50MA just crossed below 200MA (strong bearish signal)");
    if (ma50 > ma200) patterns.push("✅ Uptrend structure: 50MA above 200MA");
    else patterns.push("❌ Downtrend structure: 50MA below 200MA");
  }
  if (ma20) {
    if (last > ma20) patterns.push(`📈 Price above 20-day MA ($${fmt2(ma20)}) — short-term bullish`);
    else patterns.push(`📉 Price below 20-day MA ($${fmt2(ma20)}) — short-term bearish`);
  }

  // RSI
  const rsi = calcRSI(closes);
  if (rsi != null) {
    if (rsi > 70) patterns.push(`🔥 RSI OVERBOUGHT (${fmt1(rsi)}) — consider taking profits or waiting for pullback`);
    else if (rsi < 30) patterns.push(`🧊 RSI OVERSOLD (${fmt1(rsi)}) — potential bounce setup`);
    else if (rsi > 50 && rsi <= 60) patterns.push(`📊 RSI healthy momentum zone (${fmt1(rsi)})`);
    else if (rsi < 50 && rsi >= 40) patterns.push(`📊 RSI neutral/weak (${fmt1(rsi)})`);
  }

  // Volume analysis
  const avgVol = vols.length >= 20 ? sma(vols, 20) : null;
  const lastVol = vols[vols.length - 1];
  if (avgVol && lastVol > 0) {
    const rvol = lastVol / avgVol;
    if (rvol > 2) patterns.push(`🔊 HIGH VOLUME (${fmt1(rvol)}x avg) — strong interest, confirms move`);
    else if (rvol < 0.5) patterns.push(`🔇 LOW VOLUME (${fmt1(rvol)}x avg) — weak conviction`);
  }

  // Support/resistance (simplified: recent highs/lows)
  const recent20Highs = highs.slice(-20);
  const recent20Lows  = lows.slice(-20);
  const resistance = Math.max(...recent20Highs);
  const support    = Math.min(...recent20Lows);
  const distToRes  = ((resistance - last) / last * 100);
  const distToSup  = ((last - support) / last * 100);
  patterns.push(`🔴 Resistance: $${fmt2(resistance)} (${fmt1(distToRes)}% above)`);
  patterns.push(`🟢 Support: $${fmt2(support)} (${fmt1(distToSup)}% below)`);

  // Double bottom detection (simplified)
  const lows5 = lows.slice(-30);
  const minLow = Math.min(...lows5);
  const minIdx1 = lows5.indexOf(minLow);
  const secondLow = Math.min(...lows5.slice(minIdx1 + 3));
  if (Math.abs(secondLow - minLow) / minLow < 0.02 && last > minLow * 1.03) {
    patterns.push("🔄 Possible DOUBLE BOTTOM — two similar lows with price recovering");
  }

  // Candlestick: Bullish Engulfing
  if (bars.length >= 2) {
    const cur  = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    if (prev.close < prev.open && cur.close > cur.open && cur.open < prev.close && cur.close > prev.open) {
      patterns.push("🕯 BULLISH ENGULFING — today's green candle engulfs yesterday's red candle");
    }
    if (prev.close > prev.open && cur.close < cur.open && cur.open > prev.close && cur.close < prev.open) {
      patterns.push("🕯 BEARISH ENGULFING — today's red candle engulfs yesterday's green candle");
    }
    // Hammer / shooting star
    const body  = Math.abs(cur.close - cur.open);
    const lower = Math.min(cur.close, cur.open) - cur.low;
    const upper = cur.high - Math.max(cur.close, cur.open);
    if (lower > body * 2 && upper < body * 0.5) patterns.push("🔨 HAMMER candle — potential bullish reversal");
    if (upper > body * 2 && lower < body * 0.5) patterns.push("🌠 SHOOTING STAR — potential bearish reversal");
  }

  // Trend context
  const ema9Val  = ema(closes, 9);
  const ema21Val = ema(closes, 21);
  if (ema9Val && ema21Val) {
    if (ema9Val > ema21Val && last > ema9Val) patterns.push("🚀 EMA9 > EMA21 with price above both — STRONG UPTREND");
    else if (ema9Val < ema21Val && last < ema9Val) patterns.push("🔻 EMA9 < EMA21 with price below both — STRONG DOWNTREND");
  }

  return patterns;
}

// ── Halal screening (AAOIFI rules) ───────────────────────────────────────────
const HARAM_SECTORS = ["banks","banking","insurance","financials","financial services","savings","loans","consumer finance","capital markets","thrifts","mortgage","crypto","cryptocurrency","gambling","betting","casino","alcohol","beverages","distillers","tobacco","weapons","defense","aerospace & defense","adult","pornography"];
const HALAL_NOTES = {
  banks: "Financial services / interest-based banking",
  banking: "Interest-based lending institution",
  insurance: "Conventional insurance involves gharar (uncertainty)",
  gambling: "Gambling is explicitly haram",
  alcohol: "Alcohol production/distribution is haram",
  tobacco: "Scholars differ; majority say haram or makrooh",
  weapons: "Weapons manufacturing for offensive use is questionable",
  "aerospace & defense": "Defense sector — review for offensive weapons exposure",
};

function halalScreening(ticker, fundamentals) {
  const sector   = (fundamentals?.sector    || "").toLowerCase();
  const industry = (fundamentals?.industry  || "").toLowerCase();
  const name     = (fundamentals?.name      || ticker).toLowerCase();

  let score = 100;
  const issues = [];
  const passes = [];

  // 1. Sector check
  let sectorFlag = false;
  for (const bad of HARAM_SECTORS) {
    if (sector.includes(bad) || industry.includes(bad)) {
      issues.push(`⛔ SECTOR: ${HALAL_NOTES[bad] || `${fundamentals?.sector} sector is non-compliant`}`);
      score -= 50;
      sectorFlag = true;
      break;
    }
  }
  if (!sectorFlag) passes.push(`✅ Sector (${fundamentals?.sector || "N/A"}) appears permissible`);

  // 2. Debt ratio
  const mktCap   = Number(fundamentals?.marketCap || 0);
  const debt     = Number(fundamentals?.totalDebt || 0);
  if (mktCap > 0 && debt > 0) {
    const debtRatio = debt / mktCap;
    if (debtRatio > 0.33) {
      issues.push(`⚠️ DEBT: Debt/Market Cap = ${(debtRatio * 100).toFixed(0)}% (AAOIFI limit: 33%). Excessive debt may involve interest.`);
      score -= 20;
    } else {
      passes.push(`✅ Debt/Market Cap = ${(debtRatio * 100).toFixed(0)}% (within 33% limit)`);
    }
  } else if (mktCap > 0) {
    passes.push("✅ No significant debt reported");
  }

  // 3. Cash & near-cash (to avoid interest income from excess cash)
  const cash = Number(fundamentals?.totalCash || 0);
  if (mktCap > 0 && cash > 0) {
    const cashRatio = cash / mktCap;
    if (cashRatio > 0.33) {
      issues.push(`⚠️ CASH: Cash/Market Cap = ${(cashRatio * 100).toFixed(0)}% (AAOIFI limit: 33%). High cash may earn interest income.`);
      score -= 10;
    } else {
      passes.push(`✅ Cash/Market Cap = ${(cashRatio * 100).toFixed(0)}% (within 33% limit)`);
    }
  }

  // 4. Revenue from non-compliant sources (proxy: interest income)
  const revenue = Number(fundamentals?.revenue || 0);
  const interestIncome = Number(fundamentals?.interestIncome || 0);
  if (revenue > 0 && interestIncome > 0) {
    const intRatio = interestIncome / revenue;
    if (intRatio > 0.05) {
      issues.push(`⚠️ INTEREST INCOME: ${(intRatio * 100).toFixed(1)}% of revenue (AAOIFI limit: 5%). Consider purification.`);
      score -= 15;
    } else {
      passes.push(`✅ Interest income < 5% of revenue`);
    }
  }

  // 5. Profitability indicator
  const pe = Number(fundamentals?.trailingPE || 0);
  if (pe > 0 && pe < 200) passes.push(`✅ Profitable company (P/E: ${pe.toFixed(1)}x)`);

  score = Math.max(0, Math.min(100, score));

  let verdict;
  if (score >= 70 && issues.length === 0) verdict = "HALAL ✅";
  else if (score >= 70 && issues.length > 0) verdict = "HALAL — with conditions ✅⚠️";
  else if (score >= 40) verdict = "DOUBTFUL ⚠️";
  else verdict = "NON-COMPLIANT ❌";

  const report = [
    `TICKER: ${ticker.toUpperCase()}`,
    `COMPANY: ${fundamentals?.name || ticker}`,
    `SECTOR: ${fundamentals?.sector || "N/A"} | ${fundamentals?.industry || "N/A"}`,
    "",
    `VERDICT: ${verdict}`,
    `COMPLIANCE SCORE: ${score}`,
    "",
    "COMPLIANCE ANALYSIS",
    ...passes,
    ...(issues.length > 0 ? ["", "ISSUES IDENTIFIED", ...issues] : []),
    "",
    "DISCLAIMER",
    "This is an automated screening based on publicly available financial data and AAOIFI guidelines. It does not constitute a fatwa. For investment decisions, consult a qualified Islamic finance scholar.",
  ].join("\n");

  return { ticker: ticker.toUpperCase(), verdict, score, report, screenedAt: now() };
}

// ── Pre-market briefing generator ─────────────────────────────────────────────
function generateBriefing(ctx) {
  const regime   = ctx.regime   || "Unknown";
  const macro    = ctx.macro    || {};
  const watchlist= ctx.watchlist || [];
  const earnings = ctx.earnings || [];
  const date     = fmtDate();

  const spyChg   = macro.spyChange    ? fmtPct(macro.spyChange)    : "N/A";
  const qqqChg   = macro.qqqChange    ? fmtPct(macro.qqqChange)    : "N/A";
  const vix      = macro.vix          ? fmt1(macro.vix)            : "N/A";
  const dxy      = macro.dxy          ? fmt2(macro.dxy)            : "N/A";
  const yields10 = macro.yields10     ? fmt2(macro.yields10)       : "N/A";

  const vixNote = Number(macro.vix || 0) > 25
    ? "⚠️ VIX ELEVATED — reduce size, widen stops"
    : Number(macro.vix || 0) > 18
    ? "⚡ VIX MODERATE — normal risk management"
    : "✅ VIX LOW — conditions favor momentum plays";

  const topPlays = watchlist
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5)
    .map(w => `  • ${w.ticker}${w.score ? ` (Score: ${Math.round(w.score)})` : ""}${w.zone ? ` — Entry: $${w.zone.e1}` : ""}${w.thesis ? ` | ${w.thesis}` : ""}`)
    .join("\n");

  const earningsToday = earnings.filter(e => {
    const d = new Date(e.date || e.reportDate || "");
    const today = new Date();
    return d.toDateString() === today.toDateString() || Math.abs(d - today) < 2 * 86400000;
  }).map(e => `  • ${e.ticker || e.symbol}: EPS Est. $${e.epsEstimated || "—"} | Rev Est. ${e.revenueEstimated ? `$${(e.revenueEstimated / 1e9).toFixed(2)}B` : "—"}`).join("\n");

  const regimeStrategy = {
    "Risk-On":    "STRATEGY: Favor momentum + growth. Chase breakouts. Add to winners.",
    "Goldilocks": "STRATEGY: Broad participation. Run diversified longs. Momentum favored.",
    "Risk-Off":   "STRATEGY: Reduce exposure. Defensive sectors (XLU/XLV/GLD). Tighten stops.",
    "Defensive":  "STRATEGY: Cash is a position. Only A+ setups. Protect capital.",
    "Stagflation":"STRATEGY: Real assets (commodities, energy). Avoid high-multiple growth.",
  };
  const strategy = regimeStrategy[regime] || "STRATEGY: Follow the trend. Size appropriately for current volatility.";

  const lines = [
    `🌅 PRE-MARKET BRIEFING — ${date}`,
    `${"─".repeat(50)}`,
    "",
    `📊 MACRO ENVIRONMENT`,
    `Regime: ${regime}  |  ${vixNote}`,
    `SPY: ${spyChg}  |  QQQ: ${qqqChg}  |  VIX: ${vix}`,
    dxy !== "N/A" ? `DXY: ${dxy}  |  10Y Yield: ${yields10}%` : "",
    "",
    `🎯 TOP SETUPS TODAY`,
    topPlays || "  (Run Scanner first to populate watchlist)",
    "",
    earningsToday ? `📅 EARNINGS THIS SESSION\n${earningsToday}\n` : "",
    `💡 ${strategy}`,
    "",
    `${"─".repeat(50)}`,
    `Generated: ${new Date().toLocaleTimeString()} local time`,
  ].filter(s => s !== "").join("\n");

  return lines;
}

// ── Journal statistics review ─────────────────────────────────────────────────
function reviewJournal(trades) {
  if (!trades || trades.length < 1) {
    return { review: "Not enough trade data. Log at least 1 trade to see your review.", stats: {} };
  }

  const closed = trades.filter(t => t.exitPrice && t.exitDate);
  if (closed.length < 1) {
    return { review: "No closed trades found. Close some positions to generate a review.", stats: {} };
  }

  const pnls    = closed.map(t => ((Number(t.exitPrice) - Number(t.entryPrice)) * Number(t.shares || 1)) * (t.direction === "short" ? -1 : 1));
  const wins    = pnls.filter(p => p > 0);
  const losses  = pnls.filter(p => p < 0);
  const winRate = (wins.length / closed.length * 100).toFixed(1);
  const avgWin  = wins.length > 0   ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
  const rr      = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : "∞";
  const totalPnl= pnls.reduce((a, b) => a + b, 0);
  const bestTrade  = closed[pnls.indexOf(Math.max(...pnls))];
  const worstTrade = closed[pnls.indexOf(Math.min(...pnls))];

  // Day of week analysis
  const dowPnl = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [] };
  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  closed.forEach((t, i) => {
    const d = new Date(t.exitDate);
    const dayName = DAYS[d.getDay()];
    if (dowPnl[dayName]) dowPnl[dayName].push(pnls[i]);
  });
  const bestDay  = Object.entries(dowPnl).filter(([,v]) => v.length > 0).sort((a, b) => b[1].reduce((x,y)=>x+y,0) - a[1].reduce((x,y)=>x+y,0))[0];
  const worstDay = Object.entries(dowPnl).filter(([,v]) => v.length > 0).sort((a, b) => a[1].reduce((x,y)=>x+y,0) - b[1].reduce((x,y)=>x+y,0))[0];

  // Suggestions
  const suggestions = [];
  if (Number(winRate) < 40) suggestions.push("📌 Win rate below 40% — review entry criteria. Are you entering too early or chasing?");
  if (avgLoss > avgWin) suggestions.push("📌 Average loss exceeds average win — cut losers faster. Consider tighter stops.");
  if (Number(rr) < 1.5 && Number(winRate) < 55) suggestions.push("📌 R:R below 1.5 with win rate under 55% — mathematically challenged. Improve setup quality.");
  if (wins.length > 0 && losses.length > 0 && avgWin > avgLoss * 3) suggestions.push("💪 Excellent R:R! You let winners run. Maintain this discipline.");
  if (Number(winRate) >= 60) suggestions.push("✅ Solid win rate. Focus on maximizing your winners to improve overall edge.");
  if (closed.length < 10) suggestions.push("📊 More data needed for statistically significant conclusions (need 10+ trades).");
  if (suggestions.length === 0) suggestions.push("✅ Your trading metrics look balanced. Keep following your system.");

  const review = [
    `📊 TRADING PERFORMANCE REVIEW`,
    `${closed.length} closed trades analyzed`,
    ``,
    `CORE METRICS`,
    `Win Rate:     ${winRate}% (${wins.length}W / ${losses.length}L)`,
    `Avg Win:      $${fmt2(avgWin)}`,
    `Avg Loss:     $${fmt2(avgLoss)}`,
    `Reward:Risk:  ${rr}:1`,
    `Total P&L:    ${totalPnl >= 0 ? "+" : ""}$${fmt2(totalPnl)}`,
    ``,
    bestTrade ? `BEST TRADE:  ${bestTrade.ticker} | +$${fmt2(Math.max(...pnls))}` : "",
    worstTrade? `WORST TRADE: ${worstTrade.ticker} | -$${fmt2(Math.abs(Math.min(...pnls)))}` : "",
    ``,
    bestDay  ? `BEST DAY:    ${bestDay[0]} ($${fmt2(bestDay[1].reduce((a,b)=>a+b,0))} avg P&L)` : "",
    worstDay ? `WORST DAY:   ${worstDay[0]} ($${fmt2(worstDay[1].reduce((a,b)=>a+b,0))} avg P&L)` : "",
    ``,
    `COACHING NOTES`,
    ...suggestions,
  ].filter(s => s !== "").join("\n");

  return {
    review,
    stats: { winRate: Number(winRate), avgWin, avgLoss, rr, totalPnl, tradesAnalyzed: closed.length },
    generatedAt: now(),
  };
}

// ── Trade setup (rule-based) ──────────────────────────────────────────────────
function buildTradeSetup(body) {
  const { ticker, score, signal, signals = [], rsiVal, macdBull,
          livePrice, liveChg, ref, fundamentals, news = [] } = body;
  const price = Number(livePrice || 0);
  const rsi   = Number(rsiVal || 50);
  const chg   = Number(liveChg || 0);

  const bias = (score >= 70 || signal === "LONG") ? "LONG" : (score <= 30 || signal === "SHORT") ? "SHORT" : "NEUTRAL";
  const conviction = score >= 80 ? "HIGH" : score >= 60 ? "MODERATE" : "LOW";

  const stop    = ref?.stop    || price * (bias === "LONG" ? 0.95 : 1.05);
  const target1 = ref?.trigger || price * (bias === "LONG" ? 1.08 : 0.92);
  const target2 = price * (bias === "LONG" ? 1.15 : 0.85);
  const entry1  = ref?.e1 || price;
  const rr      = price > 0 ? Math.abs(target1 - price) / Math.abs(price - stop) : 0;

  const bullSignals = signals.filter(s => s.bull).map(s => s.txt);
  const bearSignals = signals.filter(s => !s.bull).map(s => s.txt);

  const newsHeadlines = news.slice(0, 3).map(n => `• ${n.title || n.headline || ""}`).join("\n");

  const plan = [
    `TRADE SETUP — ${ticker.toUpperCase()}`,
    `${"═".repeat(40)}`,
    ``,
    `BIAS: ${bias}  |  CONVICTION: ${conviction}  |  AI SCORE: ${score}/100`,
    ``,
    `ENTRY`,
    `  Primary entry:  $${fmt2(entry1)}`,
    ref?.e2 ? `  Better entry:   $${fmt2(ref.e2)}` : "",
    ref?.e3 ? `  Deep value:     $${fmt2(ref.e3)}` : "",
    ``,
    `LEVELS`,
    `  Hard stop:   $${fmt2(stop)}   (risk: ${fmt1(Math.abs(price - stop) / price * 100)}%)`,
    `  Target 1:    $${fmt2(target1)}   (reward: ${fmt1(Math.abs(target1 - price) / price * 100)}%)`,
    `  Target 2:    $${fmt2(target2)}   (full target)`,
    `  R:R ratio:   ${rr.toFixed(2)}:1 ${rr >= 2 ? "✅" : rr >= 1.5 ? "⚠️" : "❌"}`,
    ``,
    `TECHNICALS`,
    `  RSI ${fmt1(rsi)}  ${rsi > 70 ? "(OVERBOUGHT — wait for pullback)" : rsi < 30 ? "(OVERSOLD — bounce candidate)" : "(normal range)"}`,
    `  MACD: ${macdBull ? "Bullish ✅" : "Bearish ❌"}`,
    bullSignals.length ? `  Bullish signals: ${bullSignals.join(", ")}` : "",
    bearSignals.length ? `  Risk factors:    ${bearSignals.join(", ")}` : "",
    ``,
    fundamentals?.sector ? `SECTOR: ${fundamentals.sector}  |  Industry: ${fundamentals.industry || "—"}` : "",
    fundamentals?.marketCap ? `Market Cap: $${(fundamentals.marketCap / 1e9).toFixed(2)}B  |  P/E: ${fundamentals.trailingPE ? fundamentals.trailingPE.toFixed(1) + "x" : "N/A"}` : "",
    ``,
    newsHeadlines ? `RECENT NEWS\n${newsHeadlines}` : "",
    ``,
    `PLAN`,
    bias === "LONG"
      ? `Enter ${ticker} long near $${fmt2(entry1)}. Stop below $${fmt2(stop)}. First target $${fmt2(target1)} (${fmt1(Math.abs(target1 - price) / price * 100)}% gain). Trail stop after 5% gain.`
      : bias === "SHORT"
      ? `Enter ${ticker} short near $${fmt2(entry1)}. Cover above $${fmt2(stop)}. First target $${fmt2(target1)} (${fmt1(Math.abs(target1 - price) / price * 100)}% down).`
      : `Mixed signals on ${ticker}. Wait for cleaner setup or reduce size. Bias unclear.`,
    ``,
    `Position sizing: Risk no more than 1-2% of portfolio on this trade.`,
  ].filter(s => s !== "").join("\n");

  return { output: plan, ticker: ticker.toUpperCase(), bias, conviction, generatedAt: now() };
}

// ── Macro scenario (rule-based templates) ────────────────────────────────────
const MACRO_TEMPLATES = {
  rate:       { keys: ["rate","fed","fomc","hike","cut","interest","pivot"], impact: "Rate Changes" },
  inflation:  { keys: ["inflation","cpi","pce","price pressure","deflation"], impact: "Inflation" },
  recession:  { keys: ["recession","gdp","slowdown","contraction","economic"], impact: "Growth/Recession" },
  dollar:     { keys: ["dollar","dxy","usd","currency","forex"], impact: "Dollar/Currency" },
  commodity:  { keys: ["oil","gold","commodity","energy","crude","wheat"], impact: "Commodities" },
  china:      { keys: ["china","prc","taiwan","tariff","trade war"], impact: "China/Trade" },
  banking:    { keys: ["bank","credit","svb","liquidity","lending"], impact: "Banking/Credit" },
};

const SECTOR_SENSITIVITY = {
  "Rate Changes":    { pos: ["XLU","XLF","TLT","GLD","BND"], neg: ["ARKK","XLK","growth","tech","REIT"] },
  "Inflation":       { pos: ["GLD","XLE","XLB","commodity","energy"], neg: ["TLT","bonds","XLY","consumer"] },
  "Growth/Recession":{ pos: ["XLU","XLV","staples","GLD","TLT"], neg: ["XLK","XLY","XLF","cyclicals"] },
  "Dollar/Currency": { pos: ["domestic","staples","utilities"], neg: ["multinationals","emerging","commodities"] },
  "Commodities":     { pos: ["XLE","XLB","energy","materials"], neg: ["airlines","transports","consumer"] },
  "China/Trade":     { pos: ["domestic","XLV","XLU"], neg: ["AAPL","tech hardware","NVDA supply chain"] },
  "Banking/Credit":  { pos: ["XLV","staples","quality"], neg: ["XLF","regional banks","XLY","growth"] },
};

function analyzeScenario(scenario, holdings) {
  const s = (scenario || "").toLowerCase();
  let matched = null;
  for (const [key, meta] of Object.entries(MACRO_TEMPLATES)) {
    if (meta.keys.some(k => s.includes(k))) { matched = meta; break; }
  }

  const sensitivity = matched ? SECTOR_SENSITIVITY[matched.impact] : null;
  const holdingsStr = (holdings || []).slice(0, 8).map(h => `  • ${h.ticker} ($${fmt2(h.value)})`).join("\n");

  const analysis = [
    `🌐 MACRO SCENARIO ANALYSIS`,
    ``,
    `SCENARIO: "${scenario}"`,
    matched ? `Identified as: ${matched.impact} scenario` : "General macro scenario",
    ``,
    `MARKET IMPACT FRAMEWORK`,
    sensitivity ? [
      `Likely BENEFICIARIES:  ${sensitivity.pos.join(", ")}`,
      `Likely HEADWINDS FOR:  ${sensitivity.neg.join(", ")}`,
    ].join("\n") : "Assess sector rotation based on risk appetite.",
    ``,
    holdingsStr ? `YOUR PORTFOLIO EXPOSURE\n${holdingsStr}` : "Add positions to Portfolio for personalized impact analysis.",
    ``,
    `TRADING IMPLICATIONS`,
    sensitivity
      ? `Consider rotating toward ${sensitivity.pos.slice(0, 3).join(", ")} and reducing ${sensitivity.neg.slice(0, 3).join(", ")} exposure.`
      : "Monitor regime shift. Tighten stops and reduce leverage until clarity.",
    ``,
    `RISK MANAGEMENT`,
    `• Size down positions by 25-50% during macro uncertainty`,
    `• Use defined risk (spreads, stops) rather than naked exposure`,
    `• Cash is a position — it's OK to wait for clarity`,
    `• Focus on quality names with strong balance sheets`,
    ``,
    `DISCLAIMER: Rule-based analysis only. Not financial advice.`,
  ].filter(Boolean).join("\n");

  return { analysis, scenario, detectedType: matched?.impact || "General", generatedAt: now() };
}

// ── Earnings call highlights (text extraction) ────────────────────────────────
function extractEarningsHighlights(transcript) {
  const text = (transcript || "").slice(0, 12000);
  const lines = text.split(/[\n.!?]+/).map(l => l.trim()).filter(Boolean);

  // Key metrics
  const revenue   = lines.find(l => /revenue|sales|top.?line/i.test(l) && /\$|billion|million|\d+%/.test(l));
  const eps       = lines.find(l => /eps|earnings per share|diluted/i.test(l) && /\$|\d+%/.test(l));
  const guidance  = lines.find(l => /guidance|outlook|forecast|full.?year/i.test(l));
  const beat      = lines.find(l => /beat|exceeded|above|stronger/i.test(l));
  const miss      = lines.find(l => /miss|below|disappointed|weaker|lower/i.test(l));

  // Sentiment score
  const fullSent = scoreSentiment(text);
  const bullCount = BULL_WORDS.reduce((acc, w) => acc + (text.toLowerCase().split(w).length - 1), 0);
  const bearCount = BEAR_WORDS.reduce((acc, w) => acc + (text.toLowerCase().split(w).length - 1), 0);
  const sentiment = bullCount > bearCount ? "📈 POSITIVE" : bearCount > bullCount ? "📉 NEGATIVE" : "↔️ MIXED";

  const firstParas = lines.slice(0, 6).join(". ");

  const summary = [
    `📞 EARNINGS CALL SUMMARY`,
    ``,
    `OVERALL TONE: ${sentiment}`,
    `Positive signals: ${bullCount} | Negative signals: ${bearCount}`,
    ``,
    `KEY EXTRACTS`,
    revenue   ? `Revenue: "${revenue.slice(0, 120)}"` : "",
    eps       ? `EPS:     "${eps.slice(0, 120)}"` : "",
    guidance  ? `Guidance: "${guidance.slice(0, 150)}"` : "",
    beat      ? `✅ Beat: "${beat.slice(0, 120)}"` : "",
    miss      ? `❌ Miss: "${miss.slice(0, 120)}"` : "",
    ``,
    `OPENING REMARKS (first 500 chars)`,
    firstParas.slice(0, 500),
    ``,
    `TIP: For deeper AI summarization, paste key sections from the transcript above.`,
  ].filter(Boolean).join("\n");

  return { summary, sentiment: fullSent.s, generatedAt: now() };
}

// ── Session recap (statistical) ──────────────────────────────────────────────
function generateSessionRecap(trades, regime) {
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  if (!trades || trades.length === 0) {
    return {
      recap: `📋 SESSION RECAP — ${date}\n\nNo trades logged today. Markets ${regime || "active"}.`,
      generatedAt: now()
    };
  }

  const pnls = trades.map(t => ((Number(t.exitPrice || t.entryPrice) - Number(t.entryPrice)) * Number(t.shares || 1)));
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  const wins  = pnls.filter(p => p > 0).length;
  const total = trades.length;

  const recap = [
    `📋 SESSION RECAP — ${date}`,
    ``,
    `RESULT: ${totalPnl >= 0 ? "📈 PROFITABLE" : "📉 NET LOSS"} Day`,
    `Total P&L: ${totalPnl >= 0 ? "+" : ""}$${fmt2(totalPnl)}`,
    `Trades: ${total}  |  Wins: ${wins}  |  Win Rate: ${(wins/total*100).toFixed(0)}%`,
    ``,
    `TRADES TODAY`,
    ...trades.map((t, i) => `  ${i + 1}. ${t.ticker} — ${pnls[i] >= 0 ? "+" : ""}$${fmt2(pnls[i])} (${t.entryPrice ? `@$${t.entryPrice}` : ""})`),
    ``,
    `NOTES`,
    totalPnl > 0 ? "✅ Positive session — stick to your rules that worked today." : "📌 Negative session — review each trade. Was the thesis valid at entry?",
    `Regime today: ${regime || "Unknown"}`,
    total >= 5 ? "⚠️ High trade count — are you overtrading? Quality > quantity." : "",
    ``,
    `Generated: ${new Date().toLocaleTimeString()}`,
  ].filter(Boolean).join("\n");

  return { recap, totalPnl, winRate: wins/total*100, tradesCount: total, generatedAt: now() };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════
async function handleAgent(req, res, requestUrl) {
  const { pathname } = requestUrl;

  // ── POST /api/agent — main market analysis ───────────────────────────────
  if (pathname === "/api/agent" && req.method === "POST") {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { error: "Invalid JSON" }); }
    const briefing = generateBriefing({ macro: body, regime: body.regime, watchlist: body.topLongs || [], earnings: [] });
    return writeJson(res, 200, { output: briefing, generatedAt: now() });
  }

  // ── POST /api/agent/trade-setup ──────────────────────────────────────────
  if (pathname === "/api/agent/trade-setup" && req.method === "POST") {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { error: "Invalid JSON" }); }
    const result = buildTradeSetup(body);
    if (telegramConfigured() && result.bias !== "NEUTRAL") {
      sendTelegramMessage(`🎯 Trade Setup: ${result.ticker} ${result.bias}\n${result.output.slice(0, 600)}`).catch(() => {});
    }
    return writeJson(res, 200, result);
  }

  // ── POST /api/agent/premarket ────────────────────────────────────────────
  if (pathname === "/api/agent/premarket" && req.method === "POST") {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { error: "Invalid JSON" }); }
    const briefing = generateBriefing(body);
    if (telegramConfigured()) sendTelegramMessage(`🌅 Pre-Market Briefing\n\n${briefing.slice(0, 1400)}`).catch(() => {});
    return writeJson(res, 200, { briefing, generatedAt: now() });
  }

  // ── POST /api/agent/journal-review ──────────────────────────────────────
  if (pathname === "/api/agent/journal-review" && req.method === "POST") {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { error: "Invalid JSON" }); }
    const result = reviewJournal(body.trades || body);
    return writeJson(res, 200, result);
  }

  // ── POST /api/agent/sentiment ────────────────────────────────────────────
  if (pathname === "/api/agent/sentiment" && req.method === "POST") {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { error: "Invalid JSON" }); }
    const items = Array.isArray(body) ? body : (body.items || []);
    const results = items.map(item => ({ ...item, ...scoreSentiment(item.s || item.text || "") }));
    return writeJson(res, 200, results);
  }

  // ── POST /api/agent/halal ────────────────────────────────────────────────
  if (pathname === "/api/agent/halal" && req.method === "POST") {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { error: "Invalid JSON" }); }
    const { ticker, fundamentals } = body;
    if (!ticker) return writeJson(res, 400, { error: "ticker required" });
    const result = halalScreening(ticker, fundamentals || {});
    return writeJson(res, 200, result);
  }

  // ── POST /api/agent/pattern ──────────────────────────────────────────────
  if (pathname === "/api/agent/pattern" && req.method === "POST") {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { error: "Invalid JSON" }); }
    const { ticker, bars } = body;
    if (!bars || bars.length < 10) return writeJson(res, 422, { error: "Need at least 10 bars for pattern analysis" });
    const patterns = detectPatterns(bars);
    const closes   = bars.map(b => b.close);
    const last     = closes[closes.length - 1];
    const chg1d    = closes.length > 1 ? (last - closes[closes.length - 2]) / closes[closes.length - 2] * 100 : 0;
    const chg20d   = closes.length > 20 ? (last - closes[closes.length - 21]) / closes[closes.length - 21] * 100 : 0;
    const analysis = [
      `📊 PATTERN ANALYSIS — ${(ticker || "").toUpperCase()}`,
      `Price: $${fmt2(last)}  |  1-day: ${fmtPct(chg1d)}  |  20-day: ${fmtPct(chg20d)}`,
      `Analyzed ${bars.length} bars`,
      ``,
      `DETECTED PATTERNS`,
      ...patterns,
      ``,
      `SUMMARY`,
      patterns.filter(p => p.includes("✅") || p.includes("🚀") || p.includes("🔨")).length >= 2
        ? "Multiple bullish signals aligned. Favorable risk/reward for longs."
        : patterns.filter(p => p.includes("❌") || p.includes("💀") || p.includes("🌠")).length >= 2
        ? "Multiple bearish signals. Consider reducing exposure or waiting."
        : "Mixed signals. Wait for clearer pattern confirmation before sizing in.",
    ].join("\n");
    return writeJson(res, 200, { analysis, ticker: (ticker || "").toUpperCase(), patterns, generatedAt: now() });
  }

  // ── POST /api/agent/macro-scenario ──────────────────────────────────────
  if (pathname === "/api/agent/macro-scenario" && req.method === "POST") {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { error: "Invalid JSON" }); }
    const result = analyzeScenario(body.scenario, body.holdings);
    return writeJson(res, 200, result);
  }

  // ── POST /api/agent/earnings-call ────────────────────────────────────────
  if (pathname === "/api/agent/earnings-call" && req.method === "POST") {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { error: "Invalid JSON" }); }
    const result = extractEarningsHighlights(body.transcript);
    return writeJson(res, 200, result);
  }

  // ── POST /api/agent/session-recap ────────────────────────────────────────
  if (pathname === "/api/agent/session-recap" && req.method === "POST") {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { error: "Invalid JSON" }); }
    const result = generateSessionRecap(body.trades, body.macroRegime);
    if (telegramConfigured()) sendTelegramMessage(`📋 Session Recap\n\n${result.recap.slice(0, 1200)}`).catch(() => {});
    return writeJson(res, 200, result);
  }

  return writeJson(res, 404, { error: "Unknown agent endpoint." });
}

module.exports = handleAgent;
