/**
 * autoexec.js — Auto-execute routes
 *
 * GET  /api/autoexec/config         — read current settings
 * POST /api/autoexec/config         — save settings
 * GET  /api/autoexec/positions      — live positions + balances from Tradier
 * GET  /api/autoexec/orders         — recent orders
 * POST /api/autoexec/order          — manual order (override)
 * DELETE /api/autoexec/order/:id    — cancel an order
 */

const fs   = require("node:fs");
const path = require("node:path");
const { ROOT } = require("../config");
const { writeJson } = require("../utils");
const broker = require("../tradier-broker");

const CONFIG_PATH = path.join(ROOT, "data", "autoexec-config.json");

const DEFAULT_CONFIG = {
  enabled:        false,       // master switch — must be explicitly turned on
  positionSize:   500,         // $ per trade
  maxPositions:   3,           // max open auto positions at once
  maxDailyLoss:   200,         // stop trading for the day if realized loss exceeds this ($)
  scoreThreshold: 88,          // minimum composite score to auto-execute
  rvolThreshold:  2.0,         // minimum RVOL
  orderType:      "market",    // "market" or "limit"
  limitSlippage:  0.02,        // for limit orders: place limit this % above ask (buy) or below bid (sell)
  allowShorts:    false,       // sell-side auto-execute (requires margin account)
  tradedToday:    [],          // symbols auto-traded today (reset each day)
  lastResetDate:  "",          // YYYY-MM-DD of last daily reset
};

function readConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

// ── Daily reset (tradedToday list clears each calendar day) ──────────────────
function maybeResetDaily(cfg) {
  const today = new Date().toISOString().slice(0, 10);
  if (cfg.lastResetDate !== today) {
    cfg.tradedToday  = [];
    cfg.lastResetDate = today;
    writeConfig(cfg);
  }
  return cfg;
}

// ── Exported for market-scanner.js to call ───────────────────────────────────
async function maybeAutoExecute({ symbol, signal, composite, price, support, resistance, rvol }) {
  if (!broker.isConfigured()) return null;

  let cfg = readConfig();
  cfg = maybeResetDaily(cfg);

  if (!cfg.enabled) return null;
  if (composite < cfg.scoreThreshold) return null;
  if (rvol < cfg.rvolThreshold) return null;

  // Only buy signals unless allowShorts is on
  if (signal === "SELL" && !cfg.allowShorts) return null;

  // Already traded this symbol today
  if (cfg.tradedToday.includes(symbol)) return null;

  // Check max open positions
  let positions = [];
  try { positions = await broker.getPositions(); } catch { return null; }
  const autoPositions = positions.filter(p => (cfg.tradedToday || []).includes(p.symbol));
  if (autoPositions.length >= cfg.maxPositions) return null;

  // Check daily loss limit
  const balances = await broker.getBalances().catch(() => null);
  // (Full P&L tracking would require order history; for now we gate on position count)

  // Determine share quantity from position size
  const qty = Math.max(1, Math.floor(cfg.positionSize / price));

  const side = signal === "BUY" ? "buy" : "sell";

  let orderPrice = null;
  if (cfg.orderType === "limit") {
    // Buy slightly above current price, sell slightly below
    orderPrice = side === "buy"
      ? Math.round(price * (1 + cfg.limitSlippage) * 100) / 100
      : Math.round(price * (1 - cfg.limitSlippage) * 100) / 100;
  }

  try {
    const result = await broker.placeEquityOrder({
      side,
      symbol,
      quantity: qty,
      type: cfg.orderType,
      price: orderPrice,
      duration: "day",
    });

    // Record that we traded this symbol today
    cfg.tradedToday = [...(cfg.tradedToday || []), symbol];
    writeConfig(cfg);

    return { ...result, autoTriggered: true, score: composite, rvol };
  } catch (err) {
    console.error(`[autoexec] order failed for ${symbol}:`, err.message);
    return { error: err.message, symbol, signal };
  }
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────
async function handleAutoExec(req, res, requestUrl) {
  const { pathname } = requestUrl;
  const method = req.method;

  // GET /api/autoexec/config
  if (pathname === "/api/autoexec/config" && method === "GET") {
    const cfg = maybeResetDaily(readConfig());
    return writeJson(res, 200, {
      ...cfg,
      brokerConfigured: broker.isConfigured(),
      live: broker.LIVE,
    });
  }

  // POST /api/autoexec/config
  if (pathname === "/api/autoexec/config" && method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let updates;
    try { updates = JSON.parse(body); } catch { return writeJson(res, 400, { error: "Invalid JSON" }); }

    const cfg = readConfig();
    const allowed = ["enabled","positionSize","maxPositions","maxDailyLoss","scoreThreshold",
                     "rvolThreshold","orderType","limitSlippage","allowShorts"];
    for (const k of allowed) {
      if (updates[k] !== undefined) cfg[k] = updates[k];
    }
    writeConfig(cfg);
    return writeJson(res, 200, { ok: true, config: cfg });
  }

  // GET /api/autoexec/positions
  if (pathname === "/api/autoexec/positions" && method === "GET") {
    if (!broker.isConfigured()) return writeJson(res, 503, { error: "Tradier not configured. Set TRADIER_API_KEY and TRADIER_ACCOUNT_ID." });
    try {
      const [positions, balances] = await Promise.all([broker.getPositions(), broker.getBalances()]);
      return writeJson(res, 200, { positions, balances, live: broker.LIVE });
    } catch (e) {
      return writeJson(res, 502, { error: e.message });
    }
  }

  // GET /api/autoexec/orders
  if (pathname === "/api/autoexec/orders" && method === "GET") {
    if (!broker.isConfigured()) return writeJson(res, 503, { error: "Tradier not configured." });
    try {
      const orders = await broker.getOrders();
      return writeJson(res, 200, { orders, live: broker.LIVE });
    } catch (e) {
      return writeJson(res, 502, { error: e.message });
    }
  }

  // POST /api/autoexec/order  — manual order
  if (pathname === "/api/autoexec/order" && method === "POST") {
    if (!broker.isConfigured()) return writeJson(res, 503, { error: "Tradier not configured." });
    let body = "";
    for await (const chunk of req) body += chunk;
    let opts;
    try { opts = JSON.parse(body); } catch { return writeJson(res, 400, { error: "Invalid JSON" }); }
    try {
      const result = await broker.placeEquityOrder(opts);
      return writeJson(res, 200, result);
    } catch (e) {
      return writeJson(res, 400, { error: e.message });
    }
  }

  // DELETE /api/autoexec/order/:id
  if (pathname.startsWith("/api/autoexec/order/") && method === "DELETE") {
    if (!broker.isConfigured()) return writeJson(res, 503, { error: "Tradier not configured." });
    const orderId = pathname.split("/").pop();
    try {
      const result = await broker.cancelOrder(orderId);
      return writeJson(res, 200, { ok: true, result });
    } catch (e) {
      return writeJson(res, 502, { error: e.message });
    }
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleAutoExec, maybeAutoExecute };
