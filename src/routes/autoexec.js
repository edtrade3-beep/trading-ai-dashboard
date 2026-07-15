/**
 * autoexec.js — Auto-execute routes
 *
 * GET  /api/autoexec/config         — read current settings
 * POST /api/autoexec/config         — save settings
 * GET  /api/autoexec/positions      — live positions + balances from Tradier
 * GET  /api/autoexec/orders         — recent orders
 * POST /api/autoexec/order          — manual order (override)
 * DELETE /api/autoexec/order/:id    — cancel an order
 * GET  /api/autoexec/pending             — list pending trades (assistant mode)
 * POST /api/autoexec/pending/:id/approve — approve + place a pending trade
 * POST /api/autoexec/pending/:id/reject  — reject a pending trade
 */

const path = require("node:path");
const { ROOT } = require("../config");
const { writeJson } = require("../utils");
const { writeJsonAtomic, readJsonSafe } = require("../atomic-write");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("../telegram");
const broker = require("../tradier-broker");
const {
  isMarketHoursET, checkAccountHealth, dailyLossBreakerTripped, openRiskPct,
  sectorCapExceeded, sizePositionByRisk,
} = require("../risk-guardrails");

const CONFIG_PATH = path.join(ROOT, "data", "autoexec-config.json");
const PENDING_PATH = path.join(ROOT, "data", "pending-trades.json");

const DEFAULT_CONFIG = {
  // mode: "off" | "observer" | "assistant" | "autopilot"
  //   off       — no scoring, no orders, no notifications (was enabled:false)
  //   observer  — runs the full pipeline, never places an order, just reports
  //               what it would have done (Execution AI's "Observer" mode)
  //   assistant — runs the full pipeline, proposes a trade and waits for
  //               explicit approval via /api/autoexec/pending instead of
  //               placing it automatically ("Assistant" mode)
  //   autopilot — places the order automatically, exactly as this always did
  //               (was enabled:true)
  mode:           "off",
  positionSize:   500,         // $ per trade — fallback only, used if risk-based sizing can't be computed
  maxPositions:   3,           // max open auto positions at once
  maxDailyLoss:   200,         // stop trading for the day if realized loss exceeds this ($)
  scoreThreshold: 88,          // minimum composite score to auto-execute
  rvolThreshold:  2.0,         // minimum RVOL
  orderType:      "market",    // "market" or "limit"
  limitSlippage:  0.02,        // for limit orders: place limit this % above ask (buy) or below bid (sell)
  allowShorts:    false,       // sell-side auto-execute (requires margin account)
  riskPct:        1,           // % of equity risked per trade (entry-to-stop), same default as the Alpaca autopilot
  maxRiskPct:     6,           // total open risk ceiling, % of equity — matches server-autopilot.js
  maxPerSector:   3,           // sector-correlation cap — matches server-autopilot.js
  maxNamePct:     20,          // max % of equity in any one name — matches server-autopilot.js
  tradedToday:    [],          // symbols auto-traded today (reset each day)
  lastResetDate:  "",          // YYYY-MM-DD of last daily reset
  startOfDayEquity: 0,         // equity snapshot at the first reset of the day (Tradier has no last_equity field)
};

function readConfig() {
  const raw = readJsonSafe(CONFIG_PATH, null);
  if (!raw) return { ...DEFAULT_CONFIG };
  const cfg = { ...DEFAULT_CONFIG, ...raw };
  // Back-compat: existing configs on disk only have the old `enabled`
  // boolean, not `mode` — translate once rather than losing the user's
  // current on/off state on first load after this change.
  if (raw.mode === undefined && raw.enabled !== undefined) {
    cfg.mode = raw.enabled ? "autopilot" : "off";
  }
  return cfg;
}

function writeConfig(cfg) {
  writeJsonAtomic(CONFIG_PATH, cfg);
}

function readPending() {
  const raw = readJsonSafe(PENDING_PATH, []);
  return Array.isArray(raw) ? raw : [];
}

function writePending(list) {
  writeJsonAtomic(PENDING_PATH, list);
}

// ── Daily reset (tradedToday list clears each calendar day, and we snapshot
// start-of-day equity for the daily-loss breaker — Tradier's balances API has
// no Alpaca-style last_equity field, so we have to persist our own). ────────
async function maybeResetDaily(cfg) {
  const today = new Date().toISOString().slice(0, 10);
  if (cfg.lastResetDate !== today) {
    cfg.tradedToday  = [];
    cfg.lastResetDate = today;
    const balances = await broker.getBalances().catch(() => null);
    cfg.startOfDayEquity = Number(balances && balances.totalEquity) || 0;
    writeConfig(cfg);
  }
  return cfg;
}

// Normalize Tradier's {symbol, quantity, costBasis} into the {symbol, qty,
// avgEntryPrice} shape risk-guardrails.js expects.
function normalizePositions(positions) {
  return (positions || []).map(p => ({
    symbol: p.symbol, qty: p.quantity,
    avgEntryPrice: p.quantity ? Math.abs(p.costBasis / p.quantity) : 0,
  }));
}

// Shared account-safety check — used by both the automated scanner-triggered
// path AND the manual override, so neither can place an order on a blown,
// restricted, or already-over-the-daily-loss-limit account. Tradier's
// balances API doesn't expose blocked/restricted flags the way Alpaca's
// does, so tradingBlocked/accountBlocked are always false here — the real
// protection is the equity/cash/daily-loss checks, which Tradier does give us.
async function checkTradeGuardrails(cfg) {
  const balances = await broker.getBalances().catch(() => null);
  const equity = Number(balances && balances.totalEquity) || 0;
  const cash = balances ? Number(balances.totalCash) || 0 : null;
  const health = checkAccountHealth({ equity, cash, tradingBlocked: false, accountBlocked: false });
  if (!health.ok) return { ok: false, reason: health.reason, balances, equity };
  if (dailyLossBreakerTripped({ equity, startOfDayEquity: cfg.startOfDayEquity, maxLossAbs: cfg.maxDailyLoss })) {
    return { ok: false, reason: "daily loss limit reached", balances, equity };
  }
  return { ok: true, reason: null, balances, equity };
}

// ── Exported for market-scanner.js to call ───────────────────────────────────
async function maybeAutoExecute({ symbol, signal, composite, price, support, resistance, rvol }) {
  if (!broker.isConfigured()) return null;
  if (!isMarketHoursET()) return null;

  let cfg = readConfig();
  cfg = await maybeResetDaily(cfg);

  if (cfg.mode === "off" || !cfg.mode) return null;
  if (composite < cfg.scoreThreshold) return null;
  if (rvol < cfg.rvolThreshold) return null;

  // Only buy signals unless allowShorts is on
  if (signal === "SELL" && !cfg.allowShorts) return null;

  // Already traded this symbol today
  if (cfg.tradedToday.includes(symbol)) return null;

  const guard = await checkTradeGuardrails(cfg);
  if (!guard.ok) return null;
  const { equity, balances } = guard;

  // Check max open positions
  let positions = [];
  try { positions = await broker.getPositions(); } catch { return null; }
  const autoPositions = positions.filter(p => (cfg.tradedToday || []).includes(p.symbol));
  if (autoPositions.length >= cfg.maxPositions) return null;

  const normPositions = normalizePositions(positions);

  // Total open-risk ceiling — same math/defaults as the Alpaca autopilot.
  if (openRiskPct({ positions: normPositions, equity }) >= cfg.maxRiskPct) return null;

  // Sector-correlation cap — same math/defaults as the Alpaca autopilot.
  if (sectorCapExceeded({ positions: normPositions, symbol, maxPerSector: cfg.maxPerSector })) return null;

  const side = signal === "BUY" ? "buy" : "sell";

  // Risk-based sizing for the long (BUY) path — entry/stop come from the
  // scanner's support level, same convention market-scanner.js already uses
  // for its Telegram "Stop $X" message. If a valid stop can't be derived,
  // skip the trade rather than fall back to flat/risk-blind sizing.
  let qty;
  if (side === "buy") {
    const availCash = Number(balances && balances.totalCash) || 0;
    qty = sizePositionByRisk({ equity, riskPct: cfg.riskPct, entry: price, stop: support, availCash, maxNamePct: cfg.maxNamePct });
    if (qty < 1) return null;
  } else {
    // Shorts are opt-in (allowShorts) and rare — flat position-size fallback.
    qty = Math.max(1, Math.floor(cfg.positionSize / price));
  }

  let orderPrice = null;
  if (cfg.orderType === "limit") {
    // Buy slightly above current price, sell slightly below
    orderPrice = side === "buy"
      ? Math.round(price * (1 + cfg.limitSlippage) * 100) / 100
      : Math.round(price * (1 - cfg.limitSlippage) * 100) / 100;
  }

  const orderOpts = { side, symbol, quantity: qty, type: cfg.orderType, price: orderPrice, duration: "day" };

  // Observer mode — run the exact same scoring/guardrail pipeline as
  // autopilot, but never place the order. Reports what it WOULD have done.
  if (cfg.mode === "observer") {
    cfg.tradedToday = [...(cfg.tradedToday || []), symbol];
    writeConfig(cfg);
    const msg = `👁 OBSERVER — would have ${side.toUpperCase()} ${qty} ${symbol} @ ~$${price} (score ${composite}, RVOL ${rvol.toFixed ? rvol.toFixed(1) : rvol}) — no order placed (Observer mode).`;
    console.log(`[autoexec] ${msg}`);
    if (telegramConfigured()) sendTelegramMessage(msg).catch(() => {});
    return { observed: true, autoTriggered: true, score: composite, rvol, symbol, side, qty, price };
  }

  // Assistant mode — propose the trade and wait for explicit approval via
  // /api/autoexec/pending instead of placing it automatically.
  if (cfg.mode === "assistant") {
    cfg.tradedToday = [...(cfg.tradedToday || []), symbol];
    writeConfig(cfg);
    const pending = readPending();
    const entry = { id: `${symbol}-${Date.now()}`, symbol, side, qty, price, orderOpts, score: composite, rvol, proposedAt: Date.now(), status: "pending" };
    pending.push(entry);
    writePending(pending);
    const msg = `🟡 ASSISTANT — proposed ${side.toUpperCase()} ${qty} ${symbol} @ ~$${price} (score ${composite}, RVOL ${rvol.toFixed ? rvol.toFixed(1) : rvol}). Approve in the app (Pending Approval) or via POST /api/autoexec/pending/${entry.id}/approve.`;
    console.log(`[autoexec] ${msg}`);
    if (telegramConfigured()) sendTelegramMessage(msg).catch(() => {});
    return { proposed: true, id: entry.id, autoTriggered: true, score: composite, rvol, symbol, side, qty, price };
  }

  // Autopilot mode — unchanged from the original always-on behavior.
  try {
    const result = await broker.placeEquityOrder(orderOpts);

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
    const cfg = await maybeResetDaily(readConfig());
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
    const allowed = ["mode","positionSize","maxPositions","maxDailyLoss","scoreThreshold",
                     "rvolThreshold","orderType","limitSlippage","allowShorts",
                     "riskPct","maxRiskPct","maxPerSector","maxNamePct"];
    for (const k of allowed) {
      if (updates[k] !== undefined) cfg[k] = updates[k];
    }
    // Back-compat: a UI still sending the old `enabled` boolean maps it to
    // mode (off/autopilot) unless the request also explicitly set `mode`.
    if (updates.mode === undefined && updates.enabled !== undefined) {
      cfg.mode = updates.enabled ? "autopilot" : "off";
    }
    if (!["off", "observer", "assistant", "autopilot"].includes(cfg.mode)) cfg.mode = "off";
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

  // POST /api/autoexec/order  — manual order (override)
  // Skips the auto-path's score/RVOL/dedupe triggers on purpose — this is a
  // deliberate manual trade — but still runs the same account-health and
  // daily-loss-breaker checks the automated path uses. A human placing a
  // manual order on a blown or already-over-the-daily-limit account is
  // exactly the scenario those checks exist to prevent.
  if (pathname === "/api/autoexec/order" && method === "POST") {
    if (!broker.isConfigured()) return writeJson(res, 503, { error: "Tradier not configured." });
    let body = "";
    for await (const chunk of req) body += chunk;
    let opts;
    try { opts = JSON.parse(body); } catch { return writeJson(res, 400, { error: "Invalid JSON" }); }

    const cfg = await maybeResetDaily(readConfig());
    const guard = await checkTradeGuardrails(cfg);
    if (!guard.ok) return writeJson(res, 403, { error: `Blocked by risk guardrails: ${guard.reason}` });

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

  // GET /api/autoexec/pending — list trades proposed by Assistant mode, awaiting approval.
  if (pathname === "/api/autoexec/pending" && method === "GET") {
    return writeJson(res, 200, { pending: readPending().filter(p => p.status === "pending") });
  }

  // POST /api/autoexec/pending/:id/approve — places the order via the SAME
  // guardrail-checked path the manual-override endpoint uses (re-checked
  // fresh, not trusted from when it was proposed — the account/market could
  // have changed since).
  if (pathname.startsWith("/api/autoexec/pending/") && pathname.endsWith("/approve") && method === "POST") {
    if (!broker.isConfigured()) return writeJson(res, 503, { error: "Tradier not configured." });
    const id = pathname.split("/")[4];
    const pending = readPending();
    const entry = pending.find(p => p.id === id && p.status === "pending");
    if (!entry) return writeJson(res, 404, { error: "Pending trade not found (already approved, rejected, or expired)." });

    const cfg = await maybeResetDaily(readConfig());
    const guard = await checkTradeGuardrails(cfg);
    if (!guard.ok) return writeJson(res, 403, { error: `Blocked by risk guardrails: ${guard.reason}` });

    try {
      const result = await broker.placeEquityOrder(entry.orderOpts);
      entry.status = "approved";
      entry.resolvedAt = Date.now();
      writePending(pending);
      if (telegramConfigured()) sendTelegramMessage(`✅ APPROVED — ${entry.side.toUpperCase()} ${entry.qty} ${entry.symbol} placed.`).catch(() => {});
      return writeJson(res, 200, { ok: true, result });
    } catch (e) {
      return writeJson(res, 400, { error: e.message });
    }
  }

  // POST /api/autoexec/pending/:id/reject — discard a proposed trade, no order placed.
  if (pathname.startsWith("/api/autoexec/pending/") && pathname.endsWith("/reject") && method === "POST") {
    const id = pathname.split("/")[4];
    const pending = readPending();
    const entry = pending.find(p => p.id === id && p.status === "pending");
    if (!entry) return writeJson(res, 404, { error: "Pending trade not found (already approved, rejected, or expired)." });
    entry.status = "rejected";
    entry.resolvedAt = Date.now();
    writePending(pending);
    return writeJson(res, 200, { ok: true });
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleAutoExec, maybeAutoExecute };
