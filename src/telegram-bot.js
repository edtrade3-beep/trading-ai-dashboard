/**
 * Telegram Bot — command handler with long-polling
 *
 * Commands:
 *   /help              — all commands
 *   /market            — live macro snapshot (Risk On/Off, SPY QQQ VIX)
 *   /scan              — run market scan right now
 *   /status            — scanner status
 *   /top               — top BUY signals from last scan
 *   /worst             — top SELL signals from last scan
 *   /price AAPL        — live quote (alias: /p)
 *   /alert AAPL above 200 [note]
 *   /alerts            — list active price alerts (alias: /pa)
 *   /cancel <id>       — cancel a price alert
 *   /watchlist         — live quotes for saved watchlist (alias: /wl)
 *   /scanner on|off    — enable/disable auto-scanner
 *   /scanner interval 5
 *   /scanner symbols
 *   /deals [query]     — top deals from the deals finder
 */

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require("./config");
const { sendTelegramMessage, isConfigured }     = require("./telegram");
const { runScan, getScannerStatus, sendMacroReport, saveConfig, analyzeSymbol, computeMacroRegime, SCHEDULED_SCAN_TIMES_ET } = require("./market-scanner");
const { loadPriceAlerts, savePriceAlerts }       = require("./price-alert-store");
const { loadSettings }                           = require("./settings-store");
const { fetchYahooBars, fetchYahooChartMeta, fetchYahooQuoteBatch } = require("./providers/yahoo");
const { fetchTrending: stTrending, fetchSentiment: stSentiment }    = require("./providers/stocktwits");
const { fetchFinanceNews, fetchTechNews, fetchAllNews, fetchSubreddit: fetchRedditSub, FINANCE_SUBS, TECH_SUBS } = require("./providers/reddit-news");
const { withTimeout, round2 }                    = require("./utils");

const API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ── Pro Bot State ──────────────────────────────────────────────────────────────
// Alert level: "quiet" (≥90+BOS only) | "normal" (≥88+BOS, default) | "all"
let alertLevel   = "normal";
// Batch queue: holds pending scan alerts to group into one message
let batchQueue    = [];       // { symbol, signal, score, chgPct, rvol, trend }
let batchTimer    = null;
const BATCH_WAIT  = 300_000; // 5 minutes — collect signals then send ONE message
const BATCH_LIMIT = 2;       // max 2 signals per batch
// Daily alert budget — reset at midnight ET
let dailyAlertCount = 0;
let dailyAlertDate  = "";
const MAX_DAILY_ALERTS = 2;  // hard cap: max 2 alerts per day

function checkDailyBudget() {
  const today = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  if (today !== dailyAlertDate) { dailyAlertDate = today; dailyAlertCount = 0; }
  return dailyAlertCount < MAX_DAILY_ALERTS;
}
function incrementDailyCount() { dailyAlertCount++; }

// Quiet hours: alerts only 10:00am–2:30pm ET (prime window only) + no weekends
function isQuietHours() {
  const etStr  = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const et     = new Date(etStr);
  const h      = et.getHours(), m = et.getMinutes(), day = et.getDay();
  if (day === 0 || day === 6) return true;                      // weekend
  if (h > 14 || (h === 14 && m >= 30)) return true;            // after 2:30 PM
  if (h < 10) return true;                                      // before 10:00 AM (skip open volatility)
  return false;
}

// Check if alert passes the current level filter
function passesAlertLevel(score, hasBOS) {
  if (alertLevel === "off")    return false;
  if (alertLevel === "quiet")  return score >= 93 && hasBOS;  // extreme A+ only
  if (alertLevel === "normal") return score >= 90 && hasBOS;  // require BOS + 90+
  return score >= 85 && hasBOS; // "all" mode still needs BOS + 85+
}

// Add to batch queue and schedule a grouped send
function queueBatchAlert(item) {
  if (isQuietHours()) return;
  if (!checkDailyBudget()) return; // daily cap reached
  if (!passesAlertLevel(item.score || 50, item.hasBOS)) return;
  // Dedup: don't add same symbol twice in same batch
  if (batchQueue.some(q => q.symbol === item.symbol)) return;
  batchQueue.push(item);
  if (batchTimer) return; // already scheduled
  batchTimer = setTimeout(async () => {
    batchTimer = null;
    if (!batchQueue.length) return;
    if (!checkDailyBudget()) return;
    const items  = batchQueue.splice(0).slice(0, BATCH_LIMIT);
    incrementDailyCount();
    const time   = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
    const header = `⚡ SCAN UPDATE — ${time} ET  (${MAX_DAILY_ALERTS - dailyAlertCount} alerts left today)`;
    const divider = "━━━━━━━━━━━━━━━━━━";
    const rows = items.map(s => {
      const icon = s.signal === "BUY" ? "🟢" : s.signal === "SELL" ? "🔴" : "🟡";
      const bos  = s.hasBOS ? " BOS✓" : "";
      return `${icon} ${s.symbol.padEnd(6)} ${String(s.score).padStart(3)}/100  ${s.signal}  ${s.chgPct > 0 ? "+" : ""}${s.chgPct?.toFixed(1)}%  ${s.rvol?.toFixed(1)}×${bos}`;
    });
    await reply([header, divider, ...rows, divider].join("\n")).catch(() => {});
  }, BATCH_WAIT);
}

// Module exports for scanner to call
function enqueueScanAlert(item) { queueBatchAlert(item); }
function getAlertLevel()        { return alertLevel; }

// ── Core send ─────────────────────────────────────────────────────────────────
async function reply(text) {
  if (!TELEGRAM_CHAT_ID) return;
  try {
    const res  = await fetch(`${API}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: String(text) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) console.error("[TgBot] send failed:", json.description, "| text:", String(text).slice(0,60));
    return json;
  } catch (err) {
    console.error("[TgBot] send error:", err.message);
  }
}

// ── Live quote helper ─────────────────────────────────────────────────────────
async function fetchLiveQuote(symbol) {
  try {
    const [meta, bars] = await Promise.all([
      fetchYahooChartMeta(symbol),
      fetchYahooBars(symbol, "2mo", "1d").catch(() => []),
    ]);
    if (!meta) return null;
    const price   = Number(meta.regularMarketPrice || 0);
    const prev    = Number(meta.previousClose || meta.chartPreviousClose || price);
    const chgPct  = prev > 0 ? (price - prev) / prev * 100 : 0;
    const vol     = Number(meta.regularMarketVolume || 0);
    let rvol = null;
    if (bars.length >= 22) {
      const vols = bars.map(b => b.volume || 0);
      const avg  = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
      rvol = avg > 0 ? round2(vol / avg) : null;
    }
    return { symbol: symbol.toUpperCase(), price, chgPct, vol, rvol };
  } catch { return null; }
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdHelp() {
  return reply(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "   DIXIE AM TRADING BOT\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "\n📊 MARKET & SCANNER\n" +
    "/market       macro snapshot — Risk On/Off, SPY QQQ VIX\n" +
    "/scan         run full market scan right now\n" +
    "/top          top BUY signals from last scan\n" +
    "/worst        top SELL/EXIT signals from last scan\n" +
    "/status       scanner status, last run, regime\n" +
    "/scanner on   enable auto-scan\n" +
    "/scanner off  disable auto-scan\n" +
    "/scanner interval 5   set interval (minutes)\n" +
    "/scanner symbols      list all scanned symbols\n" +
    "\n🕐 AUTO-SCAN SCHEDULE (M–F ET)\n" +
    "  6:45  Macro Pre-Market\n" +
    "  7:30  Pre-Market Watchlist\n" +
    "  9:20  Opening Plan\n" +
    "  9:45  Opening Range Scan\n" +
    " 10:30  A+ Setup Scan\n" +
    " 12:00  Midday Reset\n" +
    "  1:30  Continuation Scan\n" +
    "  2:45  Institutional Scan\n" +
    "  3:45  Power Hour + Next-Day\n" +
    "  4:15  After-Close Report\n" +
    "\n💲 PRICES & QUOTES\n" +
    "/price AAPL           live quote  (alias: /p)\n" +
    "/p AAPL MSFT NVDA     multi-quote up to 5\n" +
    "/watchlist            live quotes for saved watchlist  (/wl)\n" +
    "\n🔔 PRICE ALERTS\n" +
    "/alert AAPL above 200         set alert\n" +
    "/alert NVDA below 500 note    set alert with note\n" +
    "/alerts               list active alerts  (/pa)\n" +
    "/cancel <id>          cancel an alert\n" +
    "\n🔍 DEEP DIVE (Fundamentals + Technicals + Projection)\n" +
    "/deep AAPL            full analysis  (alias: /dive, /analyze)\n" +
    "AAPL                  just type any ticker — auto deep dive\n" +
    "\n📈 STOCKTWITS SENTIMENT\n" +
    "/twits                top 10 trending + crowd sentiment\n" +
    "/twits NVDA           bullish/bearish% + message previews\n" +
    "\n📰 REDDIT NEWS\n" +
    "/news                 all finance + tech subs combined\n" +
    "/wsb                  r/wallstreetbets — meme stocks & DD\n" +
    "/stocks               r/stocks — earnings & analysis\n" +
    "/invest               r/investing — macro & fundamentals\n" +
    "/dd                   r/SecurityAnalysis — deep research\n" +
    "/options              r/options — options plays\n" +
    "/finance              r/finance — broader finance news\n" +
    "/tech                 r/technology — big tech news\n" +
    "/ai                   r/artificial — AI & ML news\n" +
    "/ml                   r/MachineLearning\n" +
    "\n🛒 DEALS\n" +
    "/deals                top deals from Reddit + SlickDeals\n" +
    "/deals laptop         search specific product\n" +
    "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "/help — show this page"
  );
}

async function cmdMarket() {
  await reply("Fetching macro snapshot + market narrative…");
  try {
    await withTimeout(sendMacroReport(), 60_000, null);
  } catch (err) {
    return reply("Error fetching macro: " + err.message);
  }
}

// ── Deep dive: fundamentals + technicals + projection ─────────────────────────
async function cmdDeep(args) {
  const symbol = (args[0] || "").toUpperCase().trim();
  if (!symbol || !/^[A-Z0-9.\-^]{1,10}$/.test(symbol)) {
    return reply("Usage: /deep AAPL\nOr just type a ticker: NVDA");
  }
  await reply(`Deep diving ${symbol}…`);

  try {
    // ── Parallel fetch: technical analysis + Yahoo quote summary
    const [tech, quotes, summaryRes] = await Promise.allSettled([
      withTimeout(analyzeSymbol(symbol), 20_000, null),
      withTimeout(fetchYahooQuoteBatch([symbol]), 10_000, []),
      withTimeout(
        fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,defaultKeyStatistics,financialData,summaryProfile`, {
          headers: { "User-Agent": "Mozilla/5.0" }
        }).then(r => r.json()).catch(() => null),
        15_000, null
      ),
    ]);

    const t   = tech.status   === "fulfilled" ? tech.value   : null;
    const q   = (quotes.status === "fulfilled" ? (quotes.value || []) : [])[0] || null;
    const raw = summaryRes.status === "fulfilled" ? summaryRes.value?.quoteSummary?.result?.[0] : null;

    // ── Fundamentals from Yahoo quoteSummary ─────────────────────────────────
    const priceData = raw?.price || {};
    const stats     = raw?.defaultKeyStatistics || {};
    const finData   = raw?.financialData || {};
    const profile   = raw?.summaryProfile || {};

    const price      = t?.price || Number(priceData.regularMarketPrice?.raw || q?.regularMarketPrice || 0);
    const chgPct     = t?.chgPct ?? Number(priceData.regularMarketChangePercent?.raw || 0) * 100;
    const mcapRaw    = Number(priceData.marketCap?.raw || 0);
    const mcap       = mcapRaw > 1e12 ? `$${(mcapRaw/1e12).toFixed(2)}T`
                     : mcapRaw > 1e9  ? `$${(mcapRaw/1e9).toFixed(1)}B`
                     : mcapRaw > 0    ? `$${(mcapRaw/1e6).toFixed(0)}M` : "—";
    const pe         = Number(priceData.trailingPE?.raw || stats.trailingPE?.raw || 0);
    const fwdPe      = Number(stats.forwardPE?.raw || finData.currentPrice?.raw || 0);
    const eps        = Number(stats.trailingEps?.raw || 0);
    const epsGrowth  = Number(finData.earningsGrowth?.raw || 0);
    const revGrowth  = Number(finData.revenueGrowth?.raw || 0);
    const grossMgn   = Number(finData.grossMargins?.raw || 0);
    const debtEq     = Number(stats.debtToEquity?.raw || 0);
    const roe        = Number(finData.returnOnEquity?.raw || 0);
    const beta       = Number(stats.beta?.raw || q?.beta || 0);
    const sector     = profile.sector || priceData.sector || q?.sector || "—";
    const industry   = profile.industry || "—";
    const name       = priceData.longName || priceData.shortName || q?.longName || symbol;
    const exchg      = priceData.exchangeName || q?.fullExchangeName || "—";
    const analysts   = Number(finData.numberOfAnalystOpinions?.raw || 0);
    const targetMean = Number(finData.targetMeanPrice?.raw || 0);
    const recKey     = finData.recommendationKey || "";
    const recLabel   = { strongbuy:"Strong Buy", buy:"Buy", hold:"Hold", sell:"Sell", strongsell:"Strong Sell" }[recKey] || recKey || "—";

    // ── Technical (from analyzeSymbol) ───────────────────────────────────────
    const techLines = t ? [
      `Price:    $${price.toFixed(2)}  ${chgPct >= 0 ? "+" : ""}${chgPct.toFixed(2)}%`,
      `Trend:    ${t.trend}  (EMA ${t.emaAligned})`,
      `Score:    ${t.composite}/100`,
      `RSI:      ${t.rsi}  ${t.rsi > 70 ? "(overbought)" : t.rsi < 30 ? "(oversold)" : "(normal)"}`,
      `RVOL:     ${t.rvol}x`,
      `EMA9:     $${t.ema9}   EMA21: $${t.ema21}   EMA50: $${t.ema50}`,
      `Support:  $${t.support}   Resistance: $${t.resistance}`,
      `52W Pos:  ${(t.yearPos * 100).toFixed(0)}% of range`,
    ].join("\n") : `Price: $${price.toFixed(2)}  ${chgPct >= 0 ? "+" : ""}${chgPct.toFixed(2)}%\n(Technical analysis unavailable)`;

    // ── Fundamental lines ────────────────────────────────────────────────────
    const fundLines = [
      `Market Cap: ${mcap}  |  Beta: ${beta > 0 ? beta.toFixed(2) : "—"}`,
      pe    > 0 ? `P/E: ${pe.toFixed(1)}  Forward P/E: ${fwdPe > 0 ? fwdPe.toFixed(1) : "—"}` : null,
      eps   !== 0 ? `EPS: $${eps.toFixed(2)}  EPS Growth: ${(epsGrowth*100).toFixed(1)}%` : null,
      revGrowth !== 0 ? `Rev Growth: ${(revGrowth*100).toFixed(1)}%  Gross Margin: ${(grossMgn*100).toFixed(1)}%` : null,
      roe   !== 0 ? `ROE: ${(roe*100).toFixed(1)}%  Debt/Equity: ${debtEq > 0 ? debtEq.toFixed(2) : "—"}` : null,
      analysts > 0 ? `Analysts: ${analysts}  Target: $${targetMean.toFixed(2)}  Rating: ${recLabel}` : null,
      `Sector: ${sector}  |  ${industry}`,
      `Exchange: ${exchg}`,
    ].filter(Boolean).join("\n");

    // ── Projection / narrative ───────────────────────────────────────────────
    const projLines = [];
    if (t) {
      // Bias
      if (t.composite >= 75) projLines.push("BULLISH BIAS — strong momentum setup.");
      else if (t.composite >= 62) projLines.push("CAUTIOUSLY BULLISH — setup forming, wait for confirmation.");
      else if (t.composite <= 38) projLines.push("BEARISH — weakness confirmed, avoid long entries.");
      else projLines.push("NEUTRAL — no clear edge, watch for breakout or breakdown.");

      // RSI signal
      if (t.rsi > 75)  projLines.push("RSI overbought — risk of pullback, don't chase.");
      if (t.rsi < 30)  projLines.push("RSI oversold — potential bounce setup forming.");

      // RVOL
      if (t.rvol >= 2.0 && t.chgPct > 0) projLines.push("High RVOL on up day — institutional buying likely.");
      if (t.rvol >= 1.5 && t.chgPct < 0) projLines.push("High RVOL on down day — distribution risk.");

      // 52W position
      if (t.yearPos > 0.92)  projLines.push("Near 52W high — potential breakout zone, watch for volume surge.");
      if (t.yearPos < 0.15)  projLines.push("Near 52W low — deep value or downtrend, needs catalyst.");

      // EMA
      if (t.trend === "Uptrend") projLines.push("EMA stack bullish (9>21>50) — trend is your friend.");
      if (t.trend === "Downtrend") projLines.push("EMA stack bearish (9<21<50) — selling into bounces is smarter.");

      // Analyst target
      if (targetMean > 0 && price > 0) {
        const upside = ((targetMean - price) / price * 100);
        if (upside > 10)  projLines.push(`Analyst target $${targetMean.toFixed(2)} = ${upside.toFixed(1)}% upside.`);
        if (upside < -10) projLines.push(`Analyst target $${targetMean.toFixed(2)} = ${Math.abs(upside).toFixed(1)}% downside from here.`);
      }
    }

    // ── 15-Minute Entry / Exit / Stop ────────────────────────────────────────
    const r2 = n => Math.round(n * 100) / 100;
    const isBull = t ? t.composite >= 62 : false;
    const isBear = t ? t.composite <= 38 : false;
    const atr    = price * 0.025; // ~2.5% of price as ATR proxy

    const entry  = isBull ? r2(price)            : isBear ? r2(price)            : null;
    const stop   = isBull ? r2(price - atr*1.5)  : isBear ? r2(price + atr*1.5)  : null;
    const t1     = isBull ? r2(price + atr*2)    : isBear ? r2(price - atr*2)    : null;
    const t2     = isBull ? r2(price + atr*3.5)  : isBear ? r2(price - atr*3.5)  : null;
    const rr     = stop && entry ? r2(Math.abs((t1-entry)/(entry-stop))) : null;

    const direction = isBull ? "BULLISH 🟢" : isBear ? "BEARISH 🔴" : "NEUTRAL 〰️";

    const tradeBlock = (entry && stop) ? [
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🎯 15-MIN TRADE SETUP`,
      `Direction: ${direction}`,
      ``,
      `Entry:  $${entry}  (current price)`,
      `Stop:   $${stop}  (${isBull ? "-" : "+"}${Math.abs(r2((stop-entry)/entry*100))}%)`,
      `T1:     $${t1}`,
      `T2:     $${t2}`,
      `R:R:    ${rr}:1`,
      ``,
      isBull
        ? `✅ BUY if price holds above $${stop} with volume`
        : isBear
        ? `🔴 SHORT/AVOID — price likely falls to $${t1}`
        : `〰️ WAIT — no clear directional edge right now`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `⚠️ Not financial advice. Use stops. Manage risk.`,
    ] : [];

    const msg = [
      `📊 ${name} (${symbol})`,
      `━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `⚡ TECHNICAL ANALYSIS`,
      techLines,
      ``,
      `📋 FUNDAMENTAL ANALYSIS`,
      fundLines,
      ``,
      `🧠 VERDICT`,
      projLines.join(" ") || "Insufficient data for projection.",
      ...tradeBlock,
    ].join("\n");

    return reply(msg);
  } catch (err) {
    return reply(`Deep dive error for ${symbol}: ${err.message}`);
  }
}

async function cmdScan() {
  await reply("Running scan…");
  try {
    const result = await withTimeout(runScan(), 90_000, null);
    if (!result)                return reply("Scan timed out.");
    if (result.skipped)         return reply(`Scan skipped: ${result.reason}`);
    const buys  = (result.hits || []).filter(h => h.signal === "BUY").length;
    const sells = (result.hits || []).filter(h => h.signal === "SELL").length;
    const errs  = result.errors?.length ? `  (${result.errors.length} errors)` : "";
    return reply(`Scan done — ${result.symbolsChecked} symbols${errs}\n🟢 ${buys} BUY  🔴 ${sells} SELL`);
  } catch (err) {
    return reply("Scan failed: " + err.message);
  }
}

async function cmdStatus() {
  const st  = getScannerStatus();
  const cfg = st.config;
  const lastET = st.lastRunAt
    ? new Date(st.lastRunAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }) + " ET"
    : "Never";
  const regime = st.macroRegime || "Unknown";
  const re     = regime === "RISK-ON" ? "🟢" : regime === "RISK-OFF" ? "🔴" : "⚪";
  const onOff  = cfg.enabled ? "✅ ON" : "❌ OFF";

  let msg = `📊 SCANNER STATUS\n`;
  msg    += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg    += `Status   ${onOff}\n`;
  msg    += `Regime   ${re} ${regime}\n`;
  msg    += `Interval ${cfg.intervalMinutes} min  •  Cooldown ${cfg.cooldownHours}h\n`;
  msg    += `Symbols  ${(cfg.symbols||[]).length}  •  Scans run: ${st.scanCount}\n`;
  msg    += `Last run ${lastET}\n`;

  if (st.lastHits?.length) {
    msg += `\nRecent signals:\n`;
    for (const h of st.lastHits.slice(0, 5)) {
      const e   = h.signal === "BUY" ? "🟢" : "🔴";
      const chg = h.chgPct != null ? ` ${h.chgPct >= 0 ? "+" : ""}${Number(h.chgPct).toFixed(2)}%` : "";
      msg += `${e} ${h.symbol}  $${h.price}${chg}  [${h.composite}]\n`;
    }
  } else {
    msg += `\nNo signals yet — run /scan`;
  }

  return reply(msg.trim());
}

async function cmdTop() {
  const { lastHits } = getScannerStatus();
  const buys = (lastHits || []).filter(h => h.signal === "BUY").slice(0, 6);
  if (!buys.length) return reply("No BUY signals from last scan.\nRun /scan to get fresh signals.");
  let msg = "🟢 TOP ENTRIES — Last Scan\n";
  msg    += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
  for (const h of buys) {
    const chg     = h.chgPct != null ? `${h.chgPct >= 0 ? "+" : ""}${Number(h.chgPct).toFixed(2)}%` : "—";
    const risk    = h.support    ? round2(Math.max(h.price - h.support, 0.01))    : null;
    const tgt     = risk ? round2(h.price + risk * 2) : null;
    const tgtPct  = tgt  ? round2((tgt - h.price) / h.price * 100) : null;
    msg += `\n🟢 ${h.symbol}   $${h.price}  ${chg}  [${h.composite}]\n`;
    if (tgt) msg += `   🛑 $${h.support}  →  🏆 $${tgt} (+${tgtPct}%)  •  RSI ${h.rsi}  RVOL ${h.rvol}x\n`;
    else     msg += `   RSI ${h.rsi}  RVOL ${h.rvol}x\n`;
  }
  return reply(msg.trim());
}

async function cmdWorst() {
  const { lastHits } = getScannerStatus();
  const sells = (lastHits || []).filter(h => h.signal === "SELL").slice(0, 6);
  if (!sells.length) return reply("No SELL signals from last scan.\nRun /scan to get fresh signals.");
  let msg = "🔴 TOP EXITS — Last Scan\n";
  msg    += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
  for (const h of sells) {
    const chg     = h.chgPct != null ? `${h.chgPct >= 0 ? "+" : ""}${Number(h.chgPct).toFixed(2)}%` : "—";
    const risk    = h.resistance ? round2(Math.max(h.resistance - h.price, 0.01)) : null;
    const tgt     = risk ? round2(h.price - risk * 2) : null;
    const tgtPct  = tgt  ? round2((tgt - h.price) / h.price * 100) : null;
    msg += `\n🔴 ${h.symbol}   $${h.price}  ${chg}  [${h.composite}]\n`;
    if (tgt) msg += `   🛑 $${h.resistance}  →  🏆 $${tgt} (${tgtPct}%)  •  RSI ${h.rsi}  RVOL ${h.rvol}x\n`;
    else     msg += `   RSI ${h.rsi}  RVOL ${h.rvol}x\n`;
  }
  return reply(msg.trim());
}

async function cmdPrice(args) {
  const symbols = args.slice(0, 5).map(s => s.toUpperCase()).filter(s => /^[A-Z0-9.\-^]{1,12}$/.test(s));
  if (!symbols.length) return reply("Usage: /price AAPL  or  /price AAPL MSFT NVDA");
  try {
    const quotes = await withTimeout(Promise.all(symbols.map(fetchLiveQuote)), 20000, []);
    const lines  = (quotes || []).filter(Boolean).map(q => {
      const arrow  = q.chgPct >= 0 ? "+" : "";
      const rvolStr = q.rvol != null ? `  RVOL ${q.rvol}x` : "";
      return `${q.symbol}  $${q.price.toFixed(2)}  ${arrow}${q.chgPct.toFixed(2)}%${rvolStr}`;
    });
    if (!lines.length) return reply("Could not fetch quotes. Try again shortly.");
    return reply(lines.join("\n"));
  } catch (err) { return reply("Quote error: " + err.message); }
}

async function cmdAlert(args) {
  const sym = (args[0] || "").toUpperCase();
  if (!sym || !/^[A-Z0-9.\-]{1,10}$/.test(sym))
    return reply("Usage: /alert AAPL above 200\n       /alert NVDA below 500 stop loss");
  let dir = (args[1] || "").toLowerCase();
  if (dir === ">" || dir === "above") dir = "above";
  else if (dir === "<" || dir === "below") dir = "below";
  else return reply('Direction must be "above" or "below".\nExample: /alert AAPL above 200');
  const targetPrice = Number(args[2]);
  if (!targetPrice || targetPrice <= 0) return reply("Price must be a positive number.");
  const note  = args.slice(3).join(" ").slice(0, 200).trim();
  const alert = {
    id: `pa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    symbol: sym, targetPrice, direction: dir, note,
    status: "active", createdAt: new Date().toISOString(), triggeredAt: null,
  };
  const alerts = loadPriceAlerts();
  if (alerts.filter(a => a.status === "active").length >= 50)
    return reply("Max 50 active alerts reached. Cancel some first with /alerts then /cancel <id>.");
  alerts.unshift(alert);
  savePriceAlerts(alerts);
  const de = dir === "above" ? "📈" : "📉";
  return reply(`${de} Alert set: ${sym} ${dir} $${targetPrice}${note ? "\n" + note : ""}\nID: ${alert.id}`);
}

async function cmdAlerts() {
  const active = loadPriceAlerts().filter(a => a.status === "active");
  if (!active.length) return reply("No active price alerts.\nSet one with: /alert AAPL above 200");
  const lines = active.slice(0, 15).map(a => {
    const e = a.direction === "above" ? "📈" : "📉";
    return `${e} ${a.symbol} ${a.direction} $${a.targetPrice}${a.note ? "  " + a.note : ""}\n  ID: ${a.id.slice(0, 20)}`;
  });
  const extra = active.length > 15 ? `\n...and ${active.length - 15} more` : "";
  return reply(`Active Alerts (${active.length})\n\n${lines.join("\n\n")}${extra}`);
}

async function cmdCancel(args) {
  const partial = (args[0] || "").trim();
  if (!partial) return reply("Usage: /cancel <id>\nGet IDs from /alerts");
  const alerts = loadPriceAlerts();
  const idx    = alerts.findIndex(a => a.id === partial || a.id.startsWith(partial));
  if (idx === -1)                    return reply(`No alert found with ID "${partial}"`);
  if (alerts[idx].status !== "active") return reply(`Alert already ${alerts[idx].status}.`);
  alerts[idx].status = "cancelled";
  savePriceAlerts(alerts);
  return reply(`Cancelled: ${alerts[idx].symbol} ${alerts[idx].direction} $${alerts[idx].targetPrice}`);
}

async function cmdWatchlist() {
  const settings = loadSettings();
  const symbols  = (settings.watchlistSymbols || []).slice(0, 20);
  if (!symbols.length) return reply("No watchlist saved. Add symbols from the trading platform.");
  try {
    const quotes = await withTimeout(Promise.all(symbols.map(fetchLiveQuote)), 25000, []);
    const lines  = symbols.map((sym, i) => {
      const q = (quotes || [])[i];
      if (!q) return `${sym} —`;
      const arrow = q.chgPct >= 0 ? "+" : "";
      return `${q.symbol}  $${q.price.toFixed(2)}  ${arrow}${q.chgPct.toFixed(2)}%`;
    });
    return reply(`Watchlist (${symbols.length})\n\n${lines.join("\n")}`);
  } catch (err) { return reply(`Watchlist: ${symbols.join(", ")}\n(Fetch error: ${err.message})`); }
}

async function cmdScanner(args) {
  const sub = (args[0] || "").toLowerCase();
  if (sub === "on" || sub === "off") {
    saveConfig({ enabled: sub === "on" });
    return reply(sub === "on" ? "Auto-scanner enabled" : "Auto-scanner disabled");
  }
  if (sub === "interval") {
    const mins = Math.max(1, Math.min(1440, Number(args[1]) || 5));
    saveConfig({ intervalMinutes: mins });
    return reply(`Scan interval set to ${mins} minute${mins === 1 ? "" : "s"}`);
  }
  if (sub === "symbols") {
    const st   = getScannerStatus();
    const syms = (st.config.symbols || []);
    return reply(`Scanned symbols (${syms.length}):\n${syms.slice(0, 60).join(", ")}${syms.length > 60 ? "..." : ""}`);
  }
  return reply(
    "Scanner commands:\n" +
    "/scanner on           — enable\n" +
    "/scanner off          — disable\n" +
    "/scanner interval 5   — set interval (minutes)\n" +
    "/scanner symbols      — list all symbols"
  );
}

async function cmdDeals(args) {
  const query = args.join(" ").trim();
  await reply(query ? `Searching deals: "${query}"…` : "Fetching top deals…");
  try {
    const params = new URLSearchParams({ q: query, category: "general" });
    const base   = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
    const res    = await fetch(`${base}/api/deals/search?${params}`, {
      signal: AbortSignal.timeout(20000),
    });
    const data   = await res.json().catch(() => ({}));
    const results = (data.results || []).slice(0, 6);
    if (!results.length) return reply("No deals found. Try: /deals laptop");
    let msg = `Top Deals${query ? ' for "' + query + '"' : ""} (${results.length})\n\n`;
    for (const d of results) {
      msg += `${d.price ? d.price + "  " : ""}${d.title.slice(0, 70)}\n`;
      msg += `  ${d.source}  ${d.link.slice(0, 60)}\n\n`;
    }
    return reply(msg.trim());
  } catch (err) { return reply("Deals error: " + err.message); }
}

// ── Reddit Finance / Stock / Tech News ───────────────────────────────────────

async function cmdNews(args) {
  const sub = (args[0] || "").toLowerCase();

  // Map shorthand aliases to subreddit names
  const aliases = {
    wsb:    "wallstreetbets",
    stocks: "stocks",
    invest: "investing",
    market: "StockMarket",
    finance:"finance",
    dd:     "SecurityAnalysis",
    options:"options",
    tech:   "technology",
    ai:     "artificial",
    ml:     "MachineLearning",
  };
  const resolvedSub = aliases[sub] || sub;

  await reply(resolvedSub ? `Fetching r/${resolvedSub} news…` : "Fetching Reddit finance + tech news…");

  try {
    let posts;

    if (resolvedSub) {
      // Single subreddit
      posts = await withTimeout(fetchRedditSub(resolvedSub, "hot", 10), 20_000, []);
    } else if (sub === "finance" || sub === "f") {
      posts = await withTimeout(fetchFinanceNews({ postsPerSub: 3 }), 25_000, []);
    } else if (sub === "tech" || sub === "t") {
      posts = await withTimeout(fetchTechNews({ postsPerSub: 4 }), 25_000, []);
    } else {
      // Default: top posts from all finance + tech subs
      posts = await withTimeout(fetchAllNews({ postsPerSub: 3 }), 30_000, []);
    }

    if (!posts?.length) {
      return reply(
        "Could not fetch Reddit news — Reddit sometimes blocks cloud servers.\n" +
        "Try again in a few minutes, or use a specific sub:\n" +
        "/news wsb  /news stocks  /news tech  /news ai"
      );
    }

    // De-duplicate by title similarity and cap at 12
    const seen  = new Set();
    const dedup = [];
    for (const p of posts) {
      const key = p.title.slice(0, 40).toLowerCase();
      if (!seen.has(key)) { seen.add(key); dedup.push(p); }
      if (dedup.length >= 12) break;
    }

    // Build message
    const time = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
    let msg = resolvedSub
      ? `📰 r/${resolvedSub} — ${time} ET\n\n`
      : `📰 Reddit Finance + Tech News — ${time} ET\n\n`;

    for (const p of dedup) {
      const score    = p.score > 0 ? ` ⬆️${p.score > 999 ? (p.score/1000).toFixed(1)+"k" : p.score}` : "";
      const comments = p.comments > 0 ? ` 💬${p.comments}` : "";
      const flair    = p.flair ? ` [${p.flair.slice(0,15)}]` : "";
      msg += `[${p.label}]${flair}${score}${comments}\n`;
      msg += `${p.title.slice(0, 120)}\n`;
      msg += `${p.url.slice(0, 80)}\n\n`;
    }

    msg += "── Subs: /news wsb  /news stocks  /news tech  /news ai  /news dd";
    return reply(msg.trim());

  } catch (err) {
    return reply(`Reddit news error: ${err.message}`);
  }
}

// ── StockTwits: trending + per-symbol sentiment ───────────────────────────────

async function cmdTwits(args) {
  const sym = (args[0] || "").toUpperCase().replace(/[^A-Z0-9.\-^]/g, "");

  if (sym) {
    // ── Per-symbol deep sentiment ──────────────────────────────────────────
    await reply(`Fetching StockTwits sentiment for ${sym}…`);
    try {
      const s = await withTimeout(stSentiment(sym), 15_000, null);
      if (!s) return reply(`No StockTwits data for ${sym} — try again.`);

      const e       = s.sentiment === "BULLISH" ? "🟢" : s.sentiment === "BEARISH" ? "🔴" : "⚪";
      const filled  = Math.round(s.bullPct / 10);
      const bar     = "█".repeat(filled) + "░".repeat(10 - filled);
      const biasMsg = s.sentiment === "BULLISH" ? "Crowd is bullish — aligned with momentum plays."
                    : s.sentiment === "BEARISH" ? "Crowd is bearish — watch for short setups or avoid longs."
                    : "Crowd is split — mixed conviction, wait for confirmation.";

      let msg = `${e} StockTwits — ${sym}\n`;
      msg += `Sentiment: ${s.sentiment}\n`;
      msg += `🟢 Bullish: ${s.bullish} (${s.bullPct}%)  🔴 Bearish: ${s.bearish} (${s.bearPct}%)\n`;
      msg += `⚪ Neutral: ${s.neutral}  |  Total: ${s.total} messages\n`;
      msg += `[${bar}] ${s.bullPct}% Bulls\n\n`;
      msg += `Signal: ${biasMsg}\n`;

      if (s.previews.length) {
        msg += "\nRecent messages:\n" + s.previews.join("\n");
      }

      return reply(msg.trim());
    } catch (err) {
      return reply(`StockTwits error for ${sym}: ${err.message}`);
    }

  } else {
    // ── Trending list + quick sentiment for top 10 ─────────────────────────
    await reply("Fetching StockTwits trending…");
    try {
      const trending = await withTimeout(stTrending(20), 12_000, null);
      if (!trending?.length) return reply("StockTwits trending unavailable — try again later.");

      // Grab sentiment for top 10 in parallel (each is cached 3 min)
      const top10  = trending.slice(0, 10);
      const sentArr = await Promise.allSettled(
        top10.map(t => withTimeout(stSentiment(t.symbol), 10_000, null))
      );

      let msg = "📈 StockTwits Trending\n\n";
      for (let i = 0; i < top10.length; i++) {
        const t = top10[i];
        const s = sentArr[i].status === "fulfilled" ? sentArr[i].value : null;
        const e = !s ? "⚪"
                : s.sentiment === "BULLISH" ? "🟢"
                : s.sentiment === "BEARISH" ? "🔴" : "⚪";
        const sentStr = s && s.total > 0 ? ` ${e} ${s.bullPct}%🟢 ${s.bearPct}%🔴` : ` ${e} no sentiment`;
        msg += `${String(i + 1).padStart(2)}. ${t.symbol.padEnd(8)} ${t.title.slice(0, 22).padEnd(22)}${sentStr}\n`;
      }

      msg += "\nTip: /twits NVDA — detailed sentiment + recent messages";
      return reply(msg.trim());
    } catch (err) {
      return reply(`StockTwits error: ${err.message}`);
    }
  }
}

// ── Command dispatcher ────────────────────────────────────────────────────────
const COMMANDS = {
  start:     () => cmdHelp(),
  help:      () => cmdHelp(),
  h:         () => cmdHelp(),
  market:    () => cmdMarket(),
  macro:     () => cmdMarket(),
  m:         () => cmdMarket(),
  scan:      () => cmdScan(),
  run:       () => cmdScan(),
  status:    () => cmdStatus(),
  st:        () => cmdStatus(),
  top:       () => cmdTop(),
  best:      () => cmdTop(),
  worst:     (a) => cmdWorst(a),
  sell:      (a) => cmdWorst(a),
  price:     (a) => cmdPrice(a),
  p:         (a) => cmdPrice(a),
  q:         (a) => cmdPrice(a),
  deep:      (a) => cmdDeep(a),
  dive:      (a) => cmdDeep(a),
  analyze:   (a) => cmdDeep(a),
  alert:     (a) => cmdAlert(a),
  alerts:    () => cmdAlerts(),
  pa:        () => cmdAlerts(),
  cancel:    (a) => cmdCancel(a),
  watchlist: () => cmdWatchlist(),
  wl:        () => cmdWatchlist(),
  scanner:   (a) => cmdScanner(a),
  news:      (a) => cmdNews(a),
  wsb:       ()  => cmdNews(["wallstreetbets"]),

  // ── New Pro Commands ──────────────────────────────────────────────────────
  score: async (args) => {
    const sym = (args[0] || "").toUpperCase();
    if (!sym) return reply("Usage: /score NVDA");
    await reply(`⌛ Analysing ${sym}…`);
    try {
      const bars = await fetchYahooBars(sym, "3mo", "1d").catch(() => []);
      if (!bars.length) return reply(`No data for ${sym}`);
      const { detectBOSChoCh, detectOrderBlocks, detectFVGs, computeVolumeProfile } = require("./smc-engine");
      const q = await fetchYahooQuoteBatch([sym]).catch(() => []);
      const quote = q[0] || {};
      const price = round2(Number(quote.regularMarketPrice || bars.at(-1)?.close || 0));
      const { bos, choch } = detectBOSChoCh(bars);
      const obs = detectOrderBlocks(bars);
      const fvgs = detectFVGs(bars);
      const vp  = computeVolumeProfile(bars);
      const chgPct = round2(Number(quote.regularMarketChangePercent || 0));
      const lines = [
        `📊 ${sym} ANALYSIS — $${price}  ${chgPct >= 0 ? "+" : ""}${chgPct}%`,
        `━━━━━━━━━━━━━━━━━━━━`,
        bos   ? `📐 ${bos.label} @ $${bos.level}` : "📐 No BOS yet",
        choch ? `⚠ ${choch.label}` : "",
        obs.length ? `🔲 OBs: ${obs.map(o => `${o.type === "BULL_OB" ? "🟢" : "🔴"}$${o.bot}-$${o.top}`).join("  ")}` : "",
        fvgs.length ? `🕳 FVGs: ${fvgs.slice(0,3).map(f => `${f.type === "BULL_FVG" ? "▲" : "▼"}$${f.bot}-$${f.top}`).join("  ")}` : "",
        vp.vpoc ? `📊 VPOC $${vp.vpoc}  VAH $${vp.vah}  VAL $${vp.val}` : "",
        `━━━━━━━━━━━━━━━━━━━━`,
        bos?.type === "BULL_BOS"
          ? `✅ ACTIONABLE — Bull BOS confirmed. Watch for pullback to OB.`
          : `👁 WATCH — No BOS yet. Wait for structure break above swing high.`,
      ].filter(Boolean).join("\n");
      await reply(lines);
    } catch (e) { await reply(`Error: ${e.message}`); }
  },

  smc: async (args) => { return COMMANDS.score(args); }, // alias

  // ── /today — morning summary with top setups + regime ──────────────────────
  today: async () => {
    const status = getScannerStatus();
    const hits   = status.lastHits || [];
    const buys   = hits.filter(h => h.signal === "BUY" || h.composite >= 75).slice(0, 5);
    const sells  = hits.filter(h => h.signal === "SELL" || h.composite <= 35).slice(0, 3);
    const et = new Date().toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

    if (!hits.length) return reply(`No scan data yet. Run /scan first.\n${et} ET`);

    const lines = [
      `📅 TODAY — ${et} ET`,
      `━━━━━━━━━━━━━━━━━━━━`,
    ];
    if (buys.length) {
      lines.push(`🟢 TOP SETUPS TO WATCH`);
      buys.forEach(h => lines.push(`  ${h.symbol.padEnd(6)} ${String(h.composite||h.score||0).padStart(2)}/100  ${h.trend}  RVOL ${h.rvol?.toFixed(1)}x`));
      lines.push("");
    }
    if (sells.length) {
      lines.push(`🔴 AVOID`);
      sells.forEach(h => lines.push(`  ${h.symbol.padEnd(6)} ${String(h.composite||h.score||0).padStart(2)}/100  ${h.trend}`));
      lines.push("");
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`Use /score TICKER for full SMC analysis`);
    await reply(lines.join("\n"));
  },

  // ── Quick aliases ─────────────────────────────────────────────────────────────
  c:    (args) => COMMANDS.price(args),  // /c NVDA = quick price
  q:    (args) => COMMANDS.price(args),  // /q NVDA = quick price
  t:    ()     => COMMANDS.today(),      // /t = today's setups

  // ── /regime — current market regime ─────────────────────────────────────────
  regime: async () => {
    try {
      const r = await fetch("http://localhost:" + (process.env.PORT || 3000) + "/api/market/distribution");
      const d = await r.json();
      if (!d.ok) return reply("Regime data unavailable. Try again.");
      const et = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
      const lines = [
        `🌍 MARKET REGIME — ${et} ET`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `Regime: ${d.alert} (Risk Score: ${d.riskScore}/100)`,
        d.vix > 0 ? `VIX: ${d.vix} — ${d.vix > 25 ? "ELEVATED FEAR" : d.vix > 18 ? "above normal" : "calm"}` : "",
        ``,
      ];
      if (d.topInflows?.length) {
        lines.push(`⬆ INSTITUTIONS BUYING:`);
        d.topInflows.slice(0,3).forEach(s => {
          const top = s.topStocks?.[0];
          lines.push(`  ${s.name} ${s.chg >= 0 ? "+" : ""}${s.chg.toFixed(1)}%${top ? ` (${top.sym} ${top.chg >= 0 ? "+" : ""}${top.chg.toFixed(1)}%)` : ""}`);
        });
      }
      if (d.topOutflows?.length) {
        lines.push(`⬇ INSTITUTIONS SELLING:`);
        d.topOutflows.slice(0,3).forEach(s => {
          lines.push(`  ${s.name} ${s.chg.toFixed(1)}%`);
        });
      }
      lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      const highW = (d.warnings||[]).filter(w => w.level === "HIGH");
      if (highW.length) highW.forEach(w => lines.push(`⚠ ${w.sig}`));
      await reply(lines.filter(Boolean).join("\n"));
    } catch (e) { await reply("Error: " + e.message); }
  },

  top5: async () => {
    const status = getScannerStatus();
    const hits   = (status.lastHits || []).filter(h => h.signal === "BUY").slice(0, 5);
    if (!hits.length) return reply("No recent BUY signals. Run /scan first.");
    const time = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
    const rows = hits.map((h, i) =>
      `${i+1}. ${h.symbol.padEnd(6)}  ${h.composite}/100  +${h.chgPct?.toFixed(1)}%  RVOL ${h.rvol?.toFixed(1)}×`
    );
    await reply([`🏆 TOP 5 BUY SETUPS — ${time} ET`, "━━━━━━━━━━━━━━━━", ...rows, "━━━━━━━━━━━━━━━━", "Tip: Type a ticker for full SMC analysis"].join("\n"));
  },

  brief: async () => {
    await reply("⌛ Generating morning briefing… (takes 20-30s)");
    try {
      const { sendMacroReport } = require("./market-scanner");
      await sendMacroReport();
    } catch (e) { await reply(`Error: ${e.message}`); }
  },

  mute: async (args) => {
    const level = (args[0] || "").toLowerCase();
    if (level === "quiet") { alertLevel = "quiet"; return reply("🔕 QUIET MODE — Only score≥85 + BOS"); }
    if (level === "all")   { alertLevel = "all";   return reply("🔔🔔🔔 ALL ALERTS enabled"); }
    if (level === "off")   { alertLevel = "off";   return reply("🚫 ALERTS OFF — /mute on to resume"); }
    if (level === "on")    { alertLevel = "normal"; return reply("🔔 NORMAL — Score≥72 alerts"); }
    return reply(`🎚 ALERT LEVELS\n━━━━━━━━━━━━━━\n/mute quiet  1-2/day (score≥85+BOS)\n/mute on     normal mode (default)\n/mute all    everything\n/mute off    total silence\n\nCurrent: ${alertLevel.toUpperCase()}`);
  },

  // ── Status: show current bot settings ──────────────────────────────────────
  status: async () => {
    const status = getScannerStatus();
    const et = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
    const quietNow = isQuietHours();
    const lines = [
      `📊 BOT STATUS — ${et} ET`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `Alert Level: ${alertLevel.toUpperCase()}`,
      `Quiet Hours: ${quietNow ? "🔕 ACTIVE (4:30pm-7am ET)" : "✅ OFF (market hours)"}`,
      `Scanner: ${status.config?.enabled ? "✅ RUNNING" : "❌ STOPPED"}`,
      `Interval: ${status.config?.intervalMinutes || 15}min`,
      `Last scan: ${status.lastRunAt ? new Date(status.lastRunAt).toLocaleTimeString() : "never"}`,
      `Signals: ${(status.lastHits || []).length} from last scan`,
      ``,
      `Commands: /help  /scan  /top5  /score NVDA`,
      `/mute  /pause Xh  /status  /wl`,
    ];
    return reply(lines.join("\n"));
  },

  // ── Pause alerts for X hours ────────────────────────────────────────────────
  pause: async (args) => {
    const hrs = Math.max(0.5, Math.min(24, Number(args[0]) || 4));
    const prev = alertLevel;
    alertLevel = "off";
    setTimeout(() => { alertLevel = prev; }, hrs * 3600_000);
    return reply(`⏸ ALERTS PAUSED for ${hrs}h — resumes at ${new Date(Date.now() + hrs * 3600_000).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })} ET`);
  },

  resume: async () => {
    alertLevel = "normal";
    return reply("▶ ALERTS RESUMED — Normal mode (score≥72)");
  },

  // ── Watchlist management ─────────────────────────────────────────────────────
  wl: async (args) => {
    const { loadSettings, saveSettings } = require("./settings-store");
    const settings = loadSettings() || {};
    const wl = Array.isArray(settings.watchlistSymbols) ? settings.watchlistSymbols : [];
    const action = (args[0] || "").toLowerCase();
    const sym    = (args[1] || "").toUpperCase();
    if (action === "add" && sym) {
      if (!wl.includes(sym)) { wl.push(sym); settings.watchlistSymbols = wl; saveSettings(settings); }
      return reply(`✅ ${sym} added to watchlist\nWatchlist (${wl.length}): ${wl.join(", ")}`);
    }
    if ((action === "remove" || action === "rm") && sym) {
      const idx = wl.indexOf(sym);
      if (idx >= 0) { wl.splice(idx, 1); settings.watchlistSymbols = wl; saveSettings(settings); }
      return reply(`❌ ${sym} removed\nWatchlist (${wl.length}): ${wl.join(", ")}`);
    }
    // Show watchlist with live prices
    if (!wl.length) return reply("Your watchlist is empty.\n/wl add NVDA  to add a stock");
    const quotes = await fetchYahooQuoteBatch(wl.slice(0, 20)).catch(() => []);
    const rows = wl.map(s => {
      const q = quotes.find(x => String(x.symbol||"").toUpperCase() === s);
      if (!q) return `${s.padEnd(6)} —`;
      const px  = round2(Number(q.regularMarketPrice || 0));
      const chg = round2(Number(q.regularMarketChangePercent || 0));
      return `${s.padEnd(6)} $${px}  ${chg >= 0 ? "+" : ""}${chg}%`;
    });
    return reply(`📋 WATCHLIST (${wl.length})\n━━━━━━━━━━━━━━\n${rows.join("\n")}\n\n/wl add NVDA  |  /wl remove NVDA`);
  },

  // ── /adol22 — trigger ADOL22 scan or show last result ───────────────────────
  adol22: async (args) => {
    const { loadSettings } = require("./settings-store");
    const { runAdol22, loadHistory } = require("./adol22-scanner");

    if (args[0] === "scan" || args[0] === "run") {
      await reply("🔴 ADOL22 scanning 35 symbols…\nChecking 15m patterns + 7 confirmations.\nResults arrive here in ~60 seconds.");
      const s  = loadSettings() || {};
      const wl = Array.isArray(s.watchlistSymbols) ? s.watchlistSymbols : [];
      global._adol22Manual = true;
      runAdol22(wl).catch(e => reply(`Scan error: ${e.message}`));
      return;
    }

    // Show recent history
    const hist = loadHistory().slice(0, 5);

    if (!hist.length) {
      // Auto-trigger scan
      await reply([
        "🔴 ADOL22 — No signals in history yet.",
        "",
        "Starting a scan now… (~60 seconds)",
        "You will receive an alert here if an A+ setup (80%+) is found.",
        "If no setup found, you will be told that too.",
        "",
        "Also runs automatically every 15 min during market hours.",
      ].join("\n"));
      const s  = loadSettings() || {};
      const wl = Array.isArray(s.watchlistSymbols) ? s.watchlistSymbols : [];
      global._adol22Manual = true;
      runAdol22(wl).catch(() => {});
      return;
    }

    const lines = ["🔴 ADOL22 — LAST SIGNALS", "━━━━━━━━━━━━━━━━━━━━"];
    hist.forEach(h => {
      const t = h.savedAt ? new Date(h.savedAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }) : "";
      lines.push(`\n${h.type === "BULL" ? "🟢 BULL" : "🔴 BEAR"} — ${h.sym}`);
      lines.push(`Pattern: ${h.pattern}`);
      lines.push(`Entry: $${h.price}  Confidence: ${h.confidence}%`);
      if (t) lines.push(`Time: ${t} ET`);
      if (h.reasons) lines.push(h.reasons.slice(0, 2).join(" · "));
    });
    lines.push("\n━━━━━━━━━━━━━━━━━━━━");
    lines.push("/adol22 scan — run new scan now");
    await reply(lines.join("\n"));
  },

  // ── /plan TICKER — full AI trade plan with entry/stop/target ─────────────────
  plan: async (args) => {
    const sym = (args[0] || "").toUpperCase();
    if (!sym) return reply("Usage: /plan NVDA");
    await reply(`⚙️ Building trade plan for ${sym}…`);
    try {
      const { fetchYahooQuoteBatch } = require("./providers/yahoo");
      const { detectBOSChoCh, detectOrderBlocks, detectFVGs } = require("./smc-engine");
      const bars  = await fetchYahooBars(sym, "3mo", "1d").catch(() => []);
      const q     = await fetchYahooQuoteBatch([sym]).catch(() => []);
      const quote = q[0] || {};
      const price = Number(quote.regularMarketPrice || bars.at(-1)?.close || 0);
      if (!price) return reply(`No data for ${sym}`);
      const { bos } = detectBOSChoCh(bars);
      const obs  = detectOrderBlocks(bars);
      const fvgs = detectFVGs(bars);
      const ma50  = Number(quote.fiftyDayAverage || 0);
      const ma200 = Number(quote.twoHundredDayAverage || 0);
      const rsi   = (() => { if (bars.length < 14) return 50; const cl = bars.map(b => b.close); const g = [], l = []; for (let i = 1; i < cl.length; i++) { const d = cl[i]-cl[i-1]; d > 0 ? g.push(d) : l.push(Math.abs(d)); } const ag = g.slice(-14).reduce((a,b)=>a+b,0)/14; const al = l.slice(-14).reduce((a,b)=>a+b,0)/14; return al === 0 ? 100 : Math.round(100-(100/(1+ag/al))); })();
      const stop  = ma50 > 0 && ma50 < price ? round2(ma50 * 0.97) : round2(price * 0.97);
      const t1    = round2(price * 1.08);
      const t2    = round2(price * 1.15);
      const rr    = round2((t1 - price) / (price - stop));
      const bullBOS = bos?.type === "BULL_BOS";
      const bestOB  = obs.filter(o => o.type === "BULL_OB").sort((a,b) => b.bot - a.bot)[0];
      const regime  = price > ma200 && price > ma50 ? "BULL" : price < ma200 ? "BEAR" : "MIXED";
      const signal  = bullBOS && rsi < 70 && price > ma50 ? "BUY" : rsi > 70 ? "AVOID (overbought)" : !bullBOS ? "WAIT (no Bull BOS)" : "WATCH";
      const lines = [
        `📋 TRADE PLAN — ${sym}`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `Signal: ${signal}`,
        `Regime: ${regime}`,
        ``,
        `💰 LEVELS`,
        `Entry:  $${round2(price)}  (current)`,
        bestOB ? `Better: $${bestOB.bot}-$${bestOB.top}  (order block)` : "",
        `Stop:   $${stop}  (-${round2((price-stop)/price*100)}%)`,
        `T1:     $${t1}   (+8%)`,
        `T2:     $${t2}   (+15%)`,
        `R:R     ${rr}:1`,
        ``,
        `📊 TECHNICAL`,
        `RSI: ${rsi}  |  ${rsi < 30 ? "🔥 Oversold" : rsi > 70 ? "⚠ Overbought" : "Neutral"}`,
        `EMA: ${price > ma50 ? "Above 50MA ✅" : "Below 50MA ❌"}`,
        bos ? `BOS: ${bos.label} @ $${bos.level}` : "BOS: None yet",
        fvgs.length ? `FVG: $${fvgs[0]?.bot}-$${fvgs[0]?.top}` : "",
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        signal === "BUY"
          ? `✅ ACTIONABLE: Enter near $${round2(price)}, stop $${stop}, target $${t1}`
          : `👁 ${signal}: Wait for better conditions`,
        `\n⚠️ Not financial advice. Manage risk.`,
      ].filter(Boolean).join("\n");
      await reply(lines);
    } catch (e) { await reply(`Plan error: ${e.message}`); }
  },

  // ── /best — top 3 actionable setups RIGHT NOW ─────────────────────────────
  best: async () => {
    await reply("🔍 Finding best setups right now…");
    try {
      const status = getScannerStatus();
      const hits   = (status.results || status.lastHits || [])
        .filter(r => r.signal === "STRONG BUY" || r.signal === "BUY" || r.score >= 70)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      if (!hits.length) return reply("No confirmed setups right now.\nRun /scan to refresh, or try /wl for watchlist.");
      const lines = ["⚡ TOP 3 SETUPS NOW", "━━━━━━━━━━━━━━━━━━━━"];
      for (const h of hits) {
        const price = round2(Number(h.quote?.price || 0));
        const chg   = round2(Number(h.quote?.changePercent || 0));
        const t1    = round2(price * 1.08);
        const stop  = round2(price * 0.97);
        lines.push(`\n${h.signal === "STRONG BUY" ? "🔥" : "✅"} ${h.ticker}  $${price}  ${chg >= 0 ? "+" : ""}${chg}%`);
        lines.push(`Score: ${h.score}/100  |  Signal: ${h.signal}`);
        lines.push(`Entry: $${price}  Stop: $${stop}  T1: $${t1}`);
        lines.push(`Type /plan ${h.ticker} for full analysis`);
      }
      lines.push("\n━━━━━━━━━━━━━━━━━━━━");
      lines.push("⚠️ Not financial advice. Do not chase.");
      await reply(lines.join("\n"));
    } catch (e) { await reply(`Error: ${e.message}`); }
  },

  // ── /risk — quick portfolio risk check ────────────────────────────────────
  risk: async () => {
    try {
      const { loadSettings } = require("./settings-store");
      const s  = loadSettings() || {};
      const wl = Array.isArray(s.watchlistSymbols) ? s.watchlistSymbols : [];
      const { fetchYahooQuoteBatch } = require("./providers/yahoo");
      const quotes = wl.length ? await fetchYahooQuoteBatch(wl.slice(0, 15)).catch(() => []) : [];
      const movers = quotes
        .map(q => ({ sym: q.symbol, chg: round2(Number(q.regularMarketChangePercent || 0)), price: round2(Number(q.regularMarketPrice || 0)) }))
        .sort((a, b) => a.chg - b.chg);
      const losers  = movers.filter(m => m.chg <= -3);
      const gainers = movers.filter(m => m.chg >= 3);
      const vixQ    = await fetchYahooQuoteBatch(["^VIX"]).catch(() => []);
      const vix     = round2(Number(vixQ[0]?.regularMarketPrice || 0));
      const lines   = [
        "⚠️ RISK CHECK",
        "━━━━━━━━━━━━━━━━━━━━",
        `VIX: ${vix} ${vix > 25 ? "🔴 FEAR — reduce size" : vix > 18 ? "🟡 Caution" : "🟢 Calm"}`,
        "",
        losers.length  ? `🔴 Down 3%+: ${losers.map(m  => `${m.sym} ${m.chg}%`).join("  ")}` : "🟢 No big losers",
        gainers.length ? `🟢 Up 3%+:   ${gainers.map(m => `${m.sym} +${m.chg}%`).join("  ")}` : "",
        "",
        vix > 25 ? "⚡ ACTION: High fear — cut size 50%, tighten stops" :
        vix > 18 ? "👁 CAUTION: Elevated VIX — normal size, tight stops" :
                   "✅ NORMAL: Market calm — trade your plan",
        "",
        "Use /plan TICKER for specific levels",
      ].filter(Boolean).join("\n");
      await reply(lines);
    } catch (e) { await reply(`Risk check error: ${e.message}`); }
  },

  // ── /morning — full morning brief with action items ───────────────────────
  morning: async () => {
    await reply("🌅 Generating morning brief…");
    try {
      const { sendMacroReport } = require("./market-scanner");
      await sendMacroReport();
      // Also show compression + best setups
      const status = getScannerStatus();
      const buys = (status.results || []).filter(r => r.score >= 70).slice(0, 3);
      if (buys.length) {
        const lines = ["\n⚡ MORNING WATCHLIST", "━━━━━━━━━━━━━━━━━━━━"];
        buys.forEach(h => {
          const p = round2(Number(h.quote?.price || 0));
          lines.push(`${h.ticker} $${p} — Score ${h.score} — ${h.signal}`);
          lines.push(`Stop: $${round2(p*0.97)}  T1: $${round2(p*1.08)}`);
          lines.push("");
        });
        lines.push("Type /plan TICKER for full trade plan");
        await reply(lines.join("\n"));
      }
    } catch (e) { await reply(`Morning brief error: ${e.message}`); }
  },

  // ── /squeeze — top squeeze candidates ────────────────────────────────────
  squeeze: async () => {
    await reply("🔥 Finding squeeze setups…");
    try {
      const r = await withTimeout(
        fetch(`${process.env.RENDER_EXTERNAL_URL || "http://localhost:3000"}/api/scanner/squeeze`).then(r => r.json()),
        15000, null
      ).catch(() => null);
      if (!r?.results?.length) return reply("No squeeze data. Run platform scan first.");
      const top = r.results.filter(s => s.score >= 45).slice(0, 5);
      const lines = ["🔥 TOP SQUEEZE SETUPS", "━━━━━━━━━━━━━━━━━━━━"];
      top.forEach(s => {
        lines.push(`\n${s.grade} ${s.sym}  $${s.price}  ${s.chg1d >= 0 ? "+" : ""}${s.chg1d}%`);
        lines.push(`SI: ${s.siPct > 0 ? s.siPct+"%" : "—"}  Days Cover: ${s.siDays > 0 ? s.siDays+"d" : "—"}  Score: ${s.score}`);
      });
      lines.push("\n/plan TICKER for full trade plan");
      await reply(lines.join("\n"));
    } catch (e) { await reply(`Error: ${e.message}`); }
  },

  // ── /close — end of day checklist ────────────────────────────────────────
  close: async () => {
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const h  = et.getHours(), m = et.getMinutes();
    const minsToClose = Math.max(0, (16 * 60) - (h * 60 + m));
    const lines = [
      `⏰ END OF DAY CHECKLIST`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `${minsToClose > 0 ? `${minsToClose} minutes until close` : "Market is closed"}`,
      ``,
      `✅ Before close:`,
      `□ Review open positions — are stops in place?`,
      `□ Cut any position that broke its stop`,
      `□ Take partial profits on +8% positions`,
      `□ No new entries after 3:30 PM`,
      `□ Journal every trade you took today`,
      ``,
      `📊 After close:`,
      `□ Log P&L in your 30-day challenge`,
      `□ Note what went well / what went wrong`,
      `□ Set tomorrow's watchlist (/wl)`,
      ``,
      `⚠️ Do not chase. Wait for confirmation. Manage risk.`,
    ].join("\n");
    await reply(lines);
  },

  // ── /Help ─────────────────────────────────────────────────────────────────────
  // (override the default help to be cleaner)
  help: async () => reply([
    "⚡ AXIOM TRADING BOT",
    "━━━━━━━━━━━━━━━━━━━━",
    "🎯 TRADE WITHOUT OPENING THE PLATFORM:",
    "",
    "/adol22        — candle pattern scanner (last signals)",
    "/adol22 scan   — run ADOL22 scan right now",
    "/plan NVDA     — full trade plan: entry/stop/target/R:R",
    "/best          — top 3 actionable setups right now",
    "/risk          — risk check: VIX + big movers + action",
    "/squeeze       — top squeeze/5X candidates",
    "/morning       — full morning brief + setups",
    "/close         — end of day checklist",
    "",
    "📊 ANALYSIS:",
    "/score NVDA    — SMC analysis + signals",
    "NVDA           — type any ticker for instant deep dive",
    "/price AAPL    — live quote",
    "",
    "🔍 SCANNER:",
    "/scan          — run full market scan",
    "/top5          — top 5 buy setups",
    "/today         — today's summary",
    "/regime        — market regime",
    "",
    "🔔 ALERTS:",
    "/mute          — set alert level",
    "/pause 4h      — pause for 4 hours",
    "/resume        — resume alerts",
    "/status        — bot settings",
    "",
    "📋 WATCHLIST:",
    "/wl            — watchlist prices",
    "/wl add NVDA   — add ticker",
    "/wl remove NVDA",
    "/alert AAPL above 200",
    "",
    "⚠️ Not financial advice. Manage risk.",
  ].join("\n")),
};

async function dispatch(text) {
  const clean = String(text || "").trim();

  // ── Bare ticker detection (e.g. "AAPL" or "NVDA" without a slash) ──────────
  if (!clean.startsWith("/")) {
    const upper = clean.toUpperCase();
    // Single word, 1–6 uppercase letters/digits/dots, no spaces
    if (/^[A-Z][A-Z0-9.\-]{0,8}$/.test(upper) && upper.length >= 1) {
      console.log(`[TgBot] Bare ticker detected: ${upper} — running deep dive`);
      return cmdDeep([upper]).catch(err =>
        reply(`Deep dive error: ${err.message}`)
      );
    }
    return; // ignore non-command, non-ticker messages
  }

  const withoutAt = clean.replace(/^(\/\w+)@\w+/, "$1");
  const parts = withoutAt.slice(1).split(/\s+/);
  const cmd   = (parts[0] || "").toLowerCase();
  const args  = parts.slice(1);
  const handler = COMMANDS[cmd];
  if (!handler) {
    return reply(`Unknown command: /${cmd}\nType /help for all commands.\nTip: Just type a ticker like AAPL for a deep dive.`);
  }
  try {
    await handler(args);
  } catch (err) {
    console.error(`[TgBot] /${cmd} error:`, err.message);
    await reply(`Error running /${cmd}: ${err.message}`).catch(() => {});
  }
}

// ── Long-poll ─────────────────────────────────────────────────────────────────
let _offset   = 0;
let _polling  = false;
let _pollFails = 0;

async function deleteWebhook() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res  = await fetch(`${API}/deleteWebhook?drop_pending_updates=false`);
      const json = await res.json().catch(() => ({}));
      if (json.ok) { console.log("[TgBot] Webhook cleared — polling mode active."); return; }
      console.warn(`[TgBot] deleteWebhook attempt ${attempt}:`, json.description);
    } catch (err) {
      console.warn(`[TgBot] deleteWebhook attempt ${attempt} error:`, err.message);
    }
    await new Promise(r => setTimeout(r, 2000 * attempt));
  }
}

async function pollOnce() {
  const res = await fetch(
    `${API}/getUpdates?offset=${_offset}&timeout=25&allowed_updates=%5B%22message%22%5D`,
    { signal: AbortSignal.timeout(35_000) }
  );
  const data = await res.json();

  if (!data?.ok) {
    console.warn("[TgBot] getUpdates not ok:", data?.description || JSON.stringify(data).slice(0, 100));
    _pollFails++;
    // If 409 conflict — another process is polling. Back off, then try deleteWebhook again.
    if (data?.error_code === 409) {
      console.warn("[TgBot] 409 conflict — clearing webhook and waiting 10s");
      await deleteWebhook();
      await new Promise(r => setTimeout(r, 10_000));
    }
    return;
  }
  _pollFails = 0;

  if (!Array.isArray(data.result) || !data.result.length) return;
  console.log(`[TgBot] ${data.result.length} update(s)`);

  for (const update of data.result) {
    _offset = update.update_id + 1;
    const msg = update.message;
    if (!msg) continue;

    const incomingChatId = String(msg.chat?.id ?? "");
    const configuredId   = String(TELEGRAM_CHAT_ID || "").trim();

    console.log(`[TgBot] from ${incomingChatId}: "${(msg.text || "").slice(0, 60)}"`);

    if (configuredId && incomingChatId !== configuredId) {
      console.warn(`[TgBot] Ignored — from ${incomingChatId}, expected ${configuredId}`);
      // Help the owner re-link: reply to the unconfigured chat with its own ID so they
      // can set TELEGRAM_CHAT_ID correctly (safe — only echoes the sender's own chat id).
      try {
        await fetch(`${API}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: incomingChatId,
            text: `👋 Your Telegram chat ID is:\n\n${incomingChatId}\n\nThis bot is currently linked to a different chat (${configuredId}). To receive alerts here, set TELEGRAM_CHAT_ID = ${incomingChatId} in the Render environment and redeploy.`,
          }),
        });
      } catch {}
      continue;
    }

    dispatch(msg.text || "").catch(err => console.error("[TgBot] dispatch:", err.message));
  }
}

async function registerCommands() {
  try {
    const cmds = [
      { command: "market",    description: "Macro snapshot — Risk On/Off, SPY QQQ VIX" },
      { command: "scan",      description: "Run full market scan now" },
      { command: "top",       description: "Top BUY signals from last scan" },
      { command: "worst",     description: "Top SELL signals from last scan" },
      { command: "status",    description: "Scanner status + last run" },
      { command: "price",     description: "Live quote — /price AAPL MSFT" },
      { command: "watchlist", description: "Watchlist with live prices" },
      { command: "alert",     description: "Set price alert — /alert AAPL above 200" },
      { command: "alerts",    description: "List active price alerts" },
      { command: "cancel",    description: "Cancel alert — /cancel <id>" },
      { command: "adol22",    description: "ADOL22 scanner — /adol22 | /adol22 scan" },
      { command: "plan",      description: "Full trade plan — /plan NVDA (entry/stop/target)" },
      { command: "best",      description: "Top 3 actionable setups right now" },
      { command: "risk",      description: "Risk check — VIX + movers + action" },
      { command: "squeeze",   description: "Top squeeze/5X candidates" },
      { command: "morning",   description: "Morning brief + today's setups" },
      { command: "close",     description: "End of day checklist" },
      { command: "score",     description: "SMC analysis — /score NVDA" },
      { command: "top5",      description: "Top 5 setups from last scan" },
      { command: "today",     description: "Today's top setups + regime summary" },
      { command: "regime",    description: "Current market regime + money flow" },
      { command: "wl",        description: "Watchlist — /wl | /wl add NVDA | /wl remove NVDA" },
      { command: "mute",      description: "Alert level — /mute quiet|on|all|off" },
      { command: "pause",     description: "Pause alerts — /pause 4h" },
      { command: "resume",    description: "Resume alerts" },
      { command: "status",    description: "Bot settings + scanner status" },
      { command: "help",      description: "All commands" },
    ];
    const res  = await fetch(`${API}/setMyCommands`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: cmds }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.ok) console.log("[TgBot] Commands registered with BotFather.");
    else console.warn("[TgBot] setMyCommands failed:", json.description);
  } catch (err) { console.warn("[TgBot] setMyCommands error:", err.message); }
}

function startTelegramBot() {
  if (!isConfigured()) {
    console.log("[TgBot] Telegram not configured — bot polling disabled.");
    return;
  }
  _polling = true;

  async function loop() {
    if (!_polling) return;
    try {
      await pollOnce();
    } catch (err) {
      console.warn("[TgBot] poll error:", err.message);
      _pollFails++;
    }
    // Back off if repeated failures
    const delay = _pollFails >= 5 ? 15_000 : _pollFails >= 2 ? 5_000 : 1_000;
    if (_polling) setTimeout(loop, delay);
  }

  deleteWebhook()
    .then(() => registerCommands())
    .then(() => {
      loop().catch(() => {});
      console.log("[TgBot] Polling started. Send /help to your bot.");
    })
    .catch(() => {
      loop().catch(() => {});
    });
}

function stopTelegramBot() { _polling = false; }

module.exports = { startTelegramBot, stopTelegramBot, enqueueScanAlert, isQuietHours, getAlertLevel, checkDailyBudget, incrementDailyCount };
