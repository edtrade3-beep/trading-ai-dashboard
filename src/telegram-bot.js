/**
 * Telegram Bot — long-polling command handler
 *
 * Security: only processes messages from the configured TELEGRAM_CHAT_ID.
 * Polling: uses getUpdates with timeout=25 (long-poll). Runs as a background
 * loop; errors are caught and logged without crashing the server.
 *
 * Commands:
 *   /help              — list all commands
 *   /scan              — run market scan immediately
 *   /status            — scanner status + last hits
 *   /price AAPL        — live quote (alias: /p)
 *   /alert AAPL above 200 [note]  — set price alert
 *   /alerts            — list active price alerts (alias: /pa)
 *   /cancel <id>       — cancel a price alert
 *   /scanner on|off    — enable / disable auto-scanner
 *   /scanner interval 5 — set scan interval in minutes
 *   /top               — top signals from last scan
 *   /watchlist         — show saved watchlist symbols
 */

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require("./config");
const { sendTelegramMessage, isConfigured }     = require("./telegram");
const { runScan, getScannerStatus, saveConfig } = require("./market-scanner");
const { loadPriceAlerts, savePriceAlerts }       = require("./price-alert-store");
const { loadSettings }                           = require("./settings-store");
const { fetchYahooBars, fetchYahooChartMeta }    = require("./providers/yahoo");
const { withTimeout, round2 }                    = require("./utils");

// Fetch live price data using v8 chart API (v7 quote batch is blocked)
async function fetchLiveQuote(symbol) {
  try {
    const [meta, bars] = await Promise.all([
      fetchYahooChartMeta(symbol),
      fetchYahooBars(symbol, "2mo", "1d").catch(() => []),
    ]);
    if (!meta) return null;
    const price = Number(meta.regularMarketPrice || 0);
    const prev  = Number(meta.previousClose || meta.chartPreviousClose || price);
    const chgPct = prev > 0 ? ((price - prev) / prev * 100) : 0;
    const vol   = Number(meta.regularMarketVolume || 0);
    // RVOL from bars if available
    let rvol = null;
    if (bars.length >= 22) {
      const vols = bars.map(b => b.volume || 0);
      const avgVol = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
      rvol = avgVol > 0 ? round2(vol / avgVol) : null;
    }
    return { symbol: symbol.toUpperCase(), price, chgPct, vol, rvol };
  } catch {
    return null;
  }
}

// ── Telegram API helper ───────────────────────────────────────────────────────

const API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function tgCall(method, params = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json().catch(() => ({ ok: false }));
}

async function reply(text) {
  // Send as plain text — no parse_mode so special characters never break delivery
  const url = `${API}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: String(text) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) console.error("[TgBot] sendMessage failed:", json.description || JSON.stringify(json));
    return json;
  } catch (err) {
    console.error("[TgBot] sendMessage error:", err.message);
  }
}

// ── Command handlers ──────────────────────────────────────────────────────────

async function cmdHelp() {
  return reply(
    "Dixie AM Trading Bot 🤖\n\n" +
    "/scan — run market scan now\n" +
    "/status — scanner status + last signals\n" +
    "/top — top BUY/SELL from last scan\n" +
    "/price AAPL — live quote (or /p AAPL MSFT)\n" +
    "/alert AAPL above 200 — set price alert\n" +
    "/alert NVDA below 500 stop loss — with note\n" +
    "/alerts — list active price alerts\n" +
    "/cancel <id> — cancel an alert\n" +
    "/watchlist — show saved watchlist\n" +
    "/scanner on — enable auto-scan\n" +
    "/scanner off — disable auto-scan\n" +
    "/scanner interval 3 — set scan interval (min)\n" +
    "/scanner symbols — list scanned symbols\n" +
    "/help — this message"
  );
}

async function cmdScan() {
  await reply("🔍 Running scan…");
  try {
    const result = await withTimeout(runScan(), 90_000, null);
    if (!result) return reply("⚠️ Scan timed out.");
    if (result.skipped) return reply(`⏭️ Scan skipped: ${result.reason}`);
    const buys  = (result.hits || []).filter(h => h.signal === "BUY");
    const sells = (result.hits || []).filter(h => h.signal === "SELL");
    const errStr = result.errors?.length ? `\n⚠️ ${result.errors.length} error(s)` : "";
    return reply(
      `✅ Scan complete\n` +
      `🟢 ${buys.length} BUY  |  🔴 ${sells.length} SELL\n` +
      `Checked ${result.symbolsChecked || 0} symbols${errStr}`
    );
  } catch (err) {
    return reply(`❌ Scan failed: ${err.message}`);
  }
}

async function cmdStatus() {
  const st = getScannerStatus();
  const cfg = st.config;
  const enabledStr = cfg.enabled ? "✅ Enabled" : "❌ Disabled";
  const lastStr = st.lastRunAt ? new Date(st.lastRunAt).toUTCString() : "Never";

  // Show last hits OR remembered signals from lastSignals map
  let hitsStr;
  if (st.lastHits.length) {
    hitsStr = st.lastHits.slice(0, 6).map(h =>
      `  ${h.signal === "BUY" ? "🟢" : "🔴"} ${h.symbol} ${h.signal} @ $${Number(h.price).toFixed(2)}  Score ${h.composite}`
    ).join("\n");
  } else {
    const sigs = Object.entries(st.lastSignals || {});
    hitsStr = sigs.length
      ? sigs.slice(0, 6).map(([sym, sig]) => `  ${sig === "BUY" ? "🟢" : "🔴"} ${sym} ${sig}`).join("\n")
      : "  No signals yet";
  }

  const regimeEmoji = st.macroRegime === "RISK-ON" ? "🟢" : st.macroRegime === "RISK-OFF" ? "🔴" : "⚪";
  const regimeStr   = st.macroRegime ? `${regimeEmoji} ${st.macroRegime}` : "Unknown";

  return reply(
    `📡 Scanner Status\n` +
    `${enabledStr}  |  Every ${cfg.intervalMinutes} min\n` +
    `Symbols: ${(cfg.symbols || []).length}  |  Cooldown: ${cfg.cooldownHours}h\n` +
    `Last run: ${lastStr}\n` +
    `Scans run: ${st.scanCount}\n\n` +
    `Macro Regime: ${regimeStr}\n\n` +
    `Active signals:\n${hitsStr}`
  );
}

async function cmdTop() {
  const st = getScannerStatus();
  const hits = st.lastHits || [];
  if (!hits.length) return reply("No signals from last scan yet. Run /scan first.");
  const lines = hits.slice(0, 10).map(h => {
    const e = h.signal === "BUY" ? "🟢" : "🔴";
    const rsi  = h.rsi  != null ? `  RSI ${Number(h.rsi).toFixed(0)}` : "";
    const rvol = h.rvol != null ? `  RVOL ${Number(h.rvol).toFixed(1)}x` : "";
    return `${e} ${h.symbol} ${h.signal} @ $${Number(h.price).toFixed(2)}  Score ${h.composite}${rsi}${rvol}`;
  });
  return reply(`Top Signals — Last Scan\n\n${lines.join("\n")}`);
}

async function cmdPrice(args) {
  const symbols = args
    .slice(0, 5)
    .map(s => s.toUpperCase())
    .filter(s => /^[A-Z0-9.\-^]{1,12}$/.test(s));
  if (!symbols.length) return reply("Usage: /price AAPL  or  /price AAPL MSFT NVDA");

  try {
    const quotes = await withTimeout(
      Promise.all(symbols.map(sym => fetchLiveQuote(sym))),
      15000,
      []
    );
    const lines = quotes
      .filter(Boolean)
      .map(q => {
        const arrow = q.chgPct >= 0 ? "▲" : "▼";
        const rvolStr = q.rvol != null ? `  RVOL ${q.rvol}x` : "";
        return `${q.symbol}  $${q.price.toFixed(2)}  ${arrow} ${q.chgPct >= 0 ? "+" : ""}${q.chgPct.toFixed(2)}%${rvolStr}`;
      });
    if (!lines.length) return reply("⚠️ Could not fetch quotes. Try again shortly.");
    return reply(lines.join("\n"));
  } catch (err) {
    return reply(`❌ Quote error: ${err.message}`);
  }
}

async function cmdAlert(args) {
  // /alert AAPL above 200 [optional note...]
  // /alert AAPL > 200 stop hit
  const sym = (args[0] || "").toUpperCase();
  if (!sym || !/^[A-Z0-9.\-]{1,10}$/.test(sym)) {
    return reply("Usage: /alert AAPL above 200\n       /alert NVDA below 500 stop loss");
  }

  let dir = (args[1] || "").toLowerCase();
  if (dir === ">" || dir === "above") dir = "above";
  else if (dir === "<" || dir === "below") dir = "below";
  else return reply(`Direction must be "above" or "below". Example:\n/alert AAPL above 200`);

  const targetPrice = Number(args[2]);
  if (!targetPrice || targetPrice <= 0) return reply("Price must be a positive number. Example:\n/alert AAPL above 200");

  const note = args.slice(3).join(" ").slice(0, 200).trim();
  const alert = {
    id: `pa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    symbol: sym,
    targetPrice,
    direction: dir,
    note,
    status: "active",
    createdAt: new Date().toISOString(),
    triggeredAt: null,
  };

  const alerts = loadPriceAlerts();
  if (alerts.filter(a => a.status === "active").length >= 50) {
    return reply("Maximum 50 active alerts reached. Cancel some first with /alerts then /cancel <id>.");
  }
  alerts.unshift(alert);
  savePriceAlerts(alerts);

  const dirEmoji = dir === "above" ? "📈" : "📉";
  const noteStr  = note ? `\n${note}` : "";
  return reply(`${dirEmoji} Alert set: ${sym} ${dir} $${targetPrice}${noteStr}\nID: ${alert.id}`);
}

async function cmdAlerts() {
  const all    = loadPriceAlerts();
  const active = all.filter(a => a.status === "active");
  if (!active.length) return reply("No active price alerts. Set one with:\n/alert AAPL above 200");

  const lines = active.slice(0, 15).map(a => {
    const e = a.direction === "above" ? "📈" : "📉";
    const note = a.note ? `  ${a.note}` : "";
    return `${e} ${a.symbol} ${a.direction} $${a.targetPrice}${note}\n  ID: ${a.id.slice(0, 20)}`;
  });
  const extra = active.length > 15 ? `\n...and ${active.length - 15} more` : "";
  return reply(`Active Price Alerts (${active.length})\n\n${lines.join("\n\n")}${extra}`);
}

async function cmdCancel(args) {
  const partial = (args[0] || "").trim();
  if (!partial) return reply("Usage: /cancel <id>\nGet IDs from /alerts");

  const alerts = loadPriceAlerts();
  const idx = alerts.findIndex(a => a.id === partial || a.id.startsWith(partial));
  if (idx === -1) return reply(`No alert found with ID starting with "${partial}"`);

  const a = alerts[idx];
  if (a.status !== "active") return reply(`Alert "${partial}" is already ${a.status}.`);

  alerts[idx].status = "cancelled";
  savePriceAlerts(alerts);
  return reply(`✅ Cancelled: ${a.symbol} ${a.direction} $${a.targetPrice}`);
}

async function cmdWatchlist() {
  const settings = loadSettings();
  const symbols  = (settings.watchlistSymbols || []).slice(0, 20);
  if (!symbols.length) return reply("No watchlist saved. Add symbols from the trading platform.");

  try {
    const quotes = await withTimeout(
      Promise.all(symbols.map(sym => fetchLiveQuote(sym))),
      20000,
      []
    );
    const lines = symbols.map((sym, i) => {
      const q = quotes[i];
      if (!q) return `• ${sym} —`;
      const arrow = q.chgPct >= 0 ? "▲" : "▼";
      return `• ${sym}  $${q.price.toFixed(2)}  ${arrow} ${q.chgPct >= 0 ? "+" : ""}${q.chgPct.toFixed(2)}%`;
    });
    return reply(`Watchlist (${symbols.length})\n\n${lines.join("\n")}`);
  } catch (err) {
    return reply(`Watchlist: ${symbols.join(", ")}\n(Price fetch error: ${err.message})`);
  }
}

async function cmdScanner(args) {
  const sub = (args[0] || "").toLowerCase();

  if (sub === "on" || sub === "off") {
    const enabled = sub === "on";
    saveConfig({ enabled });
    return reply(enabled ? "✅ Auto-scanner enabled" : "❌ Auto-scanner disabled");
  }

  if (sub === "interval") {
    const mins = Math.max(1, Math.min(1440, Number(args[1]) || 3));
    saveConfig({ intervalMinutes: mins });
    return reply(`⏱️ Scan interval set to ${mins} minute${mins === 1 ? "" : "s"}`);
  }

  if (sub === "symbols") {
    const st = getScannerStatus();
    const syms = (st.config.symbols || []).join(", ");
    return reply(`Scan symbols (${(st.config.symbols || []).length}):\n${syms}`);
  }

  return reply(
    "Scanner commands:\n" +
    "• /scanner on — enable\n" +
    "• /scanner off — disable\n" +
    "• /scanner interval 3 — set interval\n" +
    "• /scanner symbols — list symbols"
  );
}

// ── Command dispatcher ────────────────────────────────────────────────────────

const COMMANDS = {
  start:     () => cmdHelp(),
  help:      () => cmdHelp(),
  scan:      () => cmdScan(),
  run:       () => cmdScan(),
  status:    () => cmdStatus(),
  top:       () => cmdTop(),
  price:     (args) => cmdPrice(args),
  p:         (args) => cmdPrice(args),
  alert:     (args) => cmdAlert(args),
  alerts:    () => cmdAlerts(),
  pa:        () => cmdAlerts(),
  cancel:    (args) => cmdCancel(args),
  watchlist: () => cmdWatchlist(),
  wl:        () => cmdWatchlist(),
  scanner:   (args) => cmdScanner(args),
};

async function dispatch(text) {
  const clean = String(text || "").trim();
  if (!clean.startsWith("/")) return; // ignore non-commands

  // Strip bot mention (e.g. /scan@MyBotName → /scan)
  const withoutAt = clean.replace(/^(\/\w+)@\w+/, "$1");
  const parts  = withoutAt.slice(1).split(/\s+/);
  const cmd    = (parts[0] || "").toLowerCase();
  const args   = parts.slice(1);

  const handler = COMMANDS[cmd];
  if (!handler) {
    return reply(`Unknown command: /${cmd}\nType /help for a list of commands.`);
  }

  try {
    await handler(args);
  } catch (err) {
    console.error(`[TgBot] Command /${cmd} error:`, err.message);
    await reply(`❌ Error running /${cmd}: ${err.message}`).catch(() => {});
  }
}

// ── Long-poll loop ────────────────────────────────────────────────────────────

let _offset = 0;
let _polling = false;

async function deleteWebhook() {
  try {
    const res  = await fetch(`${API}/deleteWebhook?drop_pending_updates=false`);
    const json = await res.json().catch(() => ({}));
    if (json.ok) console.log("[TgBot] Webhook cleared — polling mode active.");
    else console.warn("[TgBot] deleteWebhook:", json.description || JSON.stringify(json));
  } catch (err) {
    console.warn("[TgBot] deleteWebhook error:", err.message);
  }
}

async function pollOnce() {
  let data;
  try {
    const res = await fetch(
      `${API}/getUpdates?offset=${_offset}&timeout=25&allowed_updates=["message"]`,
      { signal: AbortSignal.timeout(32_000) }
    );
    data = await res.json();
  } catch (err) {
    console.warn("[TgBot] getUpdates error:", err.message);
    return;
  }

  if (!data?.ok) {
    console.warn("[TgBot] getUpdates not ok:", data?.description || JSON.stringify(data));
    return;
  }
  if (!Array.isArray(data.result) || data.result.length === 0) return;

  console.log(`[TgBot] ${data.result.length} update(s) received`);

  for (const update of data.result) {
    _offset = update.update_id + 1;

    const msg = update.message;
    if (!msg) continue;

    const incomingChatId = String(msg.chat?.id ?? "");
    const configuredId   = String(TELEGRAM_CHAT_ID || "").trim();

    // Log every message so mismatches are visible in server logs
    console.log(`[TgBot] msg from chat ${incomingChatId}: ${(msg.text || "").slice(0, 80)}`);

    // If TELEGRAM_CHAT_ID is set, only respond to that chat
    if (configuredId && incomingChatId !== configuredId) {
      console.warn(`[TgBot] Ignored — chat ${incomingChatId} != configured ${configuredId}`);
      continue;
    }

    await dispatch(msg.text || "").catch((err) => {
      console.error("[TgBot] dispatch error:", err.message);
    });
  }
}

const BOT_COMMANDS = [
  { command: "scan",     description: "Run market scan now" },
  { command: "status",   description: "Scanner status + last signals" },
  { command: "top",      description: "Top BUY/SELL from last scan" },
  { command: "price",    description: "Live quote — /price AAPL" },
  { command: "alert",    description: "Set price alert — /alert AAPL above 200" },
  { command: "alerts",   description: "List active price alerts" },
  { command: "cancel",   description: "Cancel alert — /cancel <id>" },
  { command: "watchlist",description: "Show saved watchlist" },
  { command: "scanner",  description: "Scanner control — on / off / interval 3" },
  { command: "help",     description: "List all commands" },
];

async function registerCommands() {
  try {
    const res = await fetch(`${API}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: BOT_COMMANDS }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.ok) console.log("[TgBot] Commands registered with BotFather.");
    else console.warn("[TgBot] setMyCommands failed:", json.description || JSON.stringify(json));
  } catch (err) {
    console.warn("[TgBot] setMyCommands error:", err.message);
  }
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
    } catch {
      // absorb all errors — never crash the server
    }
    // getUpdates already waited up to 25s; pause 1s then re-poll
    if (_polling) setTimeout(loop, 1000);
  }

  // 1. Delete any existing webhook so getUpdates works
  // 2. Register slash commands with BotFather
  // 3. Start polling loop
  deleteWebhook()
    .then(() => registerCommands())
    .then(() => {
      loop().catch(() => {});
      console.log("[TgBot] Telegram bot polling started. Send /help in your chat.");
    })
    .catch(() => {
      loop().catch(() => {});
    });
}

function stopTelegramBot() {
  _polling = false;
}

module.exports = { startTelegramBot, stopTelegramBot };
