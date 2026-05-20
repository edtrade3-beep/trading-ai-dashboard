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
const { withTimeout, round2 }                    = require("./utils");

const API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

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
    "Dixie AM Trading Bot\n\n" +
    "MARKET\n" +
    "/market      — macro snapshot (Risk On/Off, SPY QQQ VIX)\n" +
    "/scan        — run full market scan now\n" +
    "/top         — top BUY signals from last scan\n" +
    "/worst       — top SELL signals from last scan\n" +
    "/status      — scanner status + last run\n" +
    "\nPRICES\n" +
    "/price AAPL  — live quote  (or /p AAPL MSFT NVDA)\n" +
    "/watchlist   — live quotes for your watchlist  (/wl)\n" +
    "\nALERTS\n" +
    "/alert AAPL above 200    — set price alert\n" +
    "/alert NVDA below 500 stop loss\n" +
    "/alerts      — list active price alerts  (/pa)\n" +
    "/cancel <id> — cancel an alert\n" +
    "\nDEALS\n" +
    "/deals [query] — top deals (Reddit + SlickDeals + more)\n" +
    "\nSCANNER CONTROL\n" +
    "/scanner on          — enable auto-scan\n" +
    "/scanner off         — disable auto-scan\n" +
    "/scanner interval 5  — set scan interval (minutes)\n" +
    "/scanner symbols     — list scanned symbols\n" +
    "\nAuto-scans M-F ET: 7:00, 9:45, 12:30, 14:45, 15:45\n" +
    "\nDEEP DIVE\n" +
    "/deep AAPL   — full fundamental + technical + projection\n" +
    "AAPL         — just type a ticker symbol\n" +
    "\n/help — this message"
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

    const msg = [
      `DEEP DIVE: ${name} (${symbol})`,
      "═".repeat(32),
      "",
      "TECHNICALS",
      techLines,
      "",
      "FUNDAMENTALS",
      fundLines,
      "",
      "PROJECTION",
      projLines.join(" ") || "Insufficient data for projection.",
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
  const lastStr = st.lastRunAt ? new Date(st.lastRunAt).toUTCString() : "Never";
  const e   = cfg.enabled ? "Enabled" : "Disabled";

  let hitsStr;
  if (st.lastHits?.length) {
    hitsStr = st.lastHits.slice(0, 5).map(h =>
      `  ${h.signal === "BUY" ? "🟢" : "🔴"} ${h.symbol} ${h.signal} @ $${Number(h.price).toFixed(2)}  Score ${h.composite}`
    ).join("\n");
  } else {
    hitsStr = "  No signals yet";
  }

  const regime = st.macroRegime || "Unknown";
  const re     = regime === "RISK-ON" ? "🟢" : regime === "RISK-OFF" ? "🔴" : "⚪";

  return reply(
    `Scanner: ${e}  every ${cfg.intervalMinutes} min\n` +
    `Symbols: ${(cfg.symbols||[]).length}  |  Cooldown: ${cfg.cooldownHours}h\n` +
    `Scans run: ${st.scanCount}  |  Last: ${lastStr}\n` +
    `Macro: ${re} ${regime}\n\n` +
    `Last signals:\n${hitsStr}`
  );
}

async function cmdTop() {
  const { lastHits } = getScannerStatus();
  const buys = (lastHits || []).filter(h => h.signal === "BUY").slice(0, 8);
  if (!buys.length) return reply("No BUY signals from last scan. Run /scan first.");
  const lines = buys.map(h => {
    const chg = h.chgPct != null ? ` ${h.chgPct >= 0 ? "+" : ""}${Number(h.chgPct).toFixed(2)}%` : "";
    return `🟢 ${h.symbol} @ $${Number(h.price).toFixed(2)}${chg}  Score ${h.composite}  RSI ${h.rsi}  RVOL ${h.rvol}x`;
  });
  return reply("Top BUY — Last Scan\n\n" + lines.join("\n"));
}

async function cmdWorst() {
  const { lastHits } = getScannerStatus();
  const sells = (lastHits || []).filter(h => h.signal === "SELL").slice(0, 8);
  if (!sells.length) return reply("No SELL signals from last scan. Run /scan first.");
  const lines = sells.map(h => {
    const chg = h.chgPct != null ? ` ${h.chgPct >= 0 ? "+" : ""}${Number(h.chgPct).toFixed(2)}%` : "";
    return `🔴 ${h.symbol} @ $${Number(h.price).toFixed(2)}${chg}  Score ${h.composite}  RSI ${h.rsi}  RVOL ${h.rvol}x`;
  });
  return reply("Top SELL — Last Scan\n\n" + lines.join("\n"));
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
  deals:     (a) => cmdDeals(a),
  d:         (a) => cmdDeals(a),
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
      { command: "deals",     description: "Top deals — /deals laptop" },
      { command: "scanner",   description: "Scanner control — on / off / interval 5" },
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

module.exports = { startTelegramBot, stopTelegramBot };
