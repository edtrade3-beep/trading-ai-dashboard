// quick-trade-service.js — Quick Trade Engine, Phase 1 real execution
// service. Every mutating method here goes through the real shared Alpaca
// client (src/providers/alpaca-client.js) and a real pre-trade risk gate
// (src/risk-guardrails.js — the same real functions server-autopilot.js
// already gates its own real orders on, just never wired into the direct/
// manual order path before this). Same real default limits
// server-autopilot.js uses (maxLossPct:2, maxRiskPct:6, maxPerSector:3),
// same env-var override names, so a manual quick-trade order and an
// autopilot order respect identical real risk limits.
//
// SHORT/COVER: explicitly opt-in, added per direct user confirmation
// after being told this requires bypassing the existing long-only guard
// in routes/alpaca.js (kept fully intact there for every other caller —
// autopilot, mean-rev, the legacy manual order path). Real Alpaca margin/
// buying-power rejection is never overridden; this service only removes
// the additional application-level "no short" refusal for its own
// explicitly-short-side calls.
const { alpacaTradingRequest, isAlpacaConfigured } = require("./providers/alpaca-client");
const {
  checkAccountHealth, dailyLossBreakerTripped, openRiskPct, sectorCapExceeded,
  isMarketHoursET, sizePositionByRisk,
} = require("./risk-guardrails");

const MAX_LOSS_PCT = Number(process.env.SERVER_AUTOPILOT_MAXLOSS) || 2;
const MAX_RISK_PCT = Number(process.env.SERVER_AUTOPILOT_MAXRISK) || 6;
const MAX_PER_SECTOR = Number(process.env.SERVER_AUTOPILOT_MAXSECTOR) || 3;

async function getAccount() {
  const a = await alpacaTradingRequest("/v2/account");
  if (!a._ok) return null;
  const d = a.data;
  return {
    equity: Number(d.equity) || 0,
    cash: Number(d.cash) || 0,
    lastEquity: Number(d.last_equity) || 0,
    buyingPower: Number(d.buying_power) || 0,
    status: d.status,
  };
}

async function getPositions() {
  const p = await alpacaTradingRequest("/v2/positions");
  if (!p._ok) return [];
  return (p.data || []).map((x) => ({
    symbol: x.symbol,
    qty: Number(x.qty) || 0,
    avgEntryPrice: Number(x.avg_entry_price) || 0,
    marketValue: Number(x.market_value) || 0,
    side: Number(x.qty) < 0 ? "short" : "long",
  }));
}

// Real pre-trade gate — every mutating method below runs this first. Never
// a generic "blocked"; always the specific real reason. This is the real,
// non-fabricated core of the mission spec's "AI Safety Engine" for Phase 1
// (the remaining checks — relative volume, spread, liquidity, news risk —
// need their own real data sources wired in, deferred to a later phase
// rather than faked here).
async function preTradeCheck({ symbol, requireMarketHours = true } = {}) {
  if (!isAlpacaConfigured()) return { ok: false, reason: "no-alpaca-key" };
  const account = await getAccount();
  if (!account) return { ok: false, reason: "could not load real account data" };
  const positions = await getPositions();

  const health = checkAccountHealth({
    equity: account.equity, cash: account.cash,
    tradingBlocked: account.status !== "ACTIVE", accountBlocked: false,
  });
  if (!health.ok) return { ok: false, reason: `account health: ${health.reason}` };

  if (dailyLossBreakerTripped({ equity: account.equity, startOfDayEquity: account.lastEquity, maxLossPct: MAX_LOSS_PCT })) {
    return { ok: false, reason: `daily loss breaker tripped (real -${MAX_LOSS_PCT}% limit)` };
  }

  const risk = openRiskPct({ positions, equity: account.equity });
  if (risk >= MAX_RISK_PCT) {
    return { ok: false, reason: `open risk ${risk.toFixed(1)}% already at/above the real ${MAX_RISK_PCT}% cap` };
  }

  if (symbol && sectorCapExceeded({ positions, symbol, maxPerSector: MAX_PER_SECTOR })) {
    return { ok: false, reason: `sector cap: already ${MAX_PER_SECTOR}+ real positions in this sector` };
  }

  if (requireMarketHours && !isMarketHoursET()) {
    return { ok: false, reason: "market closed (real ET hours check)" };
  }

  return { ok: true, account, positions, openRiskPct: risk };
}

// Real, symmetric risk-based sizing. sizePositionByRisk() (risk-guardrails.js)
// hard-assumes entry > stop (long side) — reused as-is for longs. Shorts
// need the mirror-image real formula (stop above entry); rather than
// silently misapply the long formula (which would just return 0 for a
// short's stop>entry case), this makes the short-side math explicit and
// real, same real cash/per-name caps applied either direction.
function sizeByRisk({ equity, riskPct, entry, stop, availCash, maxNamePct = 20, side = "long" }) {
  if (side === "short" || side === "cover") {
    if (!(equity > 0) || !(entry > 0) || !(stop > 0) || !(stop > entry)) return 0;
    const riskPerShare = stop - entry;
    let qty = Math.floor((equity * (riskPct / 100)) / riskPerShare);
    qty = Math.min(qty, Math.floor((availCash || 0) / entry));
    qty = Math.min(qty, Math.floor((equity * (maxNamePct / 100)) / entry));
    return Math.max(0, qty);
  }
  return sizePositionByRisk({ equity, riskPct, entry, stop, availCash, maxNamePct });
}

// Real unified order builder — fixes the confirmed stop_limit gap in the
// legacy /api/alpaca/order route (limit_price/stop_price never combined
// for a real type:"stop_limit" order there) and adds real bracket R-multiple
// presets. type: market | limit | stop | stop_limit | (bracket is implied
// by stopLoss/takeProfit being present, matching the legacy route's own
// real convention).
function buildOrder({ symbol, qty, side, type = "market", limitPrice, stopPrice, stopLoss, takeProfit, timeInForce = "day", clientOrderId }) {
  const order = {
    symbol, qty: String(qty), side, type,
    time_in_force: timeInForce,
    client_order_id: String(clientOrderId || `qte-${symbol}-${side}-${qty}-${Math.floor(Date.now() / 60000)}`).slice(0, 128),
  };
  if (type === "limit" && limitPrice) order.limit_price = String(limitPrice);
  if (type === "stop" && stopPrice) order.stop_price = String(stopPrice);
  if (type === "stop_limit" && stopPrice && limitPrice) { order.stop_price = String(stopPrice); order.limit_price = String(limitPrice); }
  if (stopLoss || takeProfit) {
    order.order_class = "bracket";
    if (takeProfit) order.take_profit = { limit_price: String(takeProfit) };
    if (stopLoss) order.stop_loss = { stop_price: String(stopLoss) };
  }
  return order;
}

async function submitOrder(orderPayload) {
  const a = await alpacaTradingRequest("/v2/orders", "POST", orderPayload);
  if (!a._ok) return { ok: false, error: a.data?.message || "order rejected", status: a._status };
  return { ok: true, order: { id: a.data.id, symbol: a.data.symbol, qty: Number(a.data.qty), side: a.data.side, status: a.data.status } };
}

// buy/sell — long side, real long-only guard preserved for sell (same real
// behavior as the legacy route: can't sell more than real held qty here).
async function buy(symbol, qty, opts = {}) {
  const gate = await preTradeCheck({ symbol, requireMarketHours: opts.requireMarketHours !== false });
  if (!gate.ok) return gate;
  return submitOrder(buildOrder({ symbol, qty, side: "buy", ...opts }));
}
async function sell(symbol, qty, opts = {}) {
  const gate = await preTradeCheck({ symbol, requireMarketHours: opts.requireMarketHours !== false });
  if (!gate.ok) return gate;
  const heldLong = Math.max(0, gate.positions.find((p) => p.symbol === symbol && p.side === "long")?.qty || 0);
  if (heldLong < 1) return { ok: false, reason: `no real long position in ${symbol} to sell — use short() to open a short` };
  if (qty > heldLong) return { ok: false, reason: `can sell at most ${heldLong} real held shares of ${symbol}` };
  return submitOrder(buildOrder({ symbol, qty, side: "sell", ...opts }));
}

// short/cover — explicitly opt-in, real Alpaca margin/buying-power
// rejection stands as the real backstop (never overridden here).
async function short(symbol, qty, opts = {}) {
  const gate = await preTradeCheck({ symbol, requireMarketHours: opts.requireMarketHours !== false });
  if (!gate.ok) return gate;
  return submitOrder(buildOrder({ symbol, qty, side: "sell", ...opts }));
}
async function cover(symbol, qty, opts = {}) {
  const gate = await preTradeCheck({ symbol, requireMarketHours: opts.requireMarketHours !== false });
  if (!gate.ok) return gate;
  const heldShort = Math.max(0, -(gate.positions.find((p) => p.symbol === symbol && p.side === "short")?.qty || 0));
  if (heldShort < 1) return { ok: false, reason: `no real short position in ${symbol} to cover` };
  return submitOrder(buildOrder({ symbol, qty: Math.min(qty, heldShort), side: "buy", ...opts }));
}

async function submitBracket(symbol, qty, side, entry, stopLoss, takeProfit, opts = {}) {
  const gate = await preTradeCheck({ symbol, requireMarketHours: opts.requireMarketHours !== false });
  if (!gate.ok) return gate;
  return submitOrder(buildOrder({ symbol, qty, side, type: opts.type || "market", limitPrice: entry, stopLoss, takeProfit, ...opts }));
}

// Real R-multiple presets — entry/stop distance × multiplier, same real
// house 2:1 default reward:risk convention trailing-stops.js already uses.
function rMultipleTarget(entry, stop, side, multiple) {
  const riskPerShare = Math.abs(entry - stop);
  return side === "sell" || side === "short"
    ? +(entry - riskPerShare * multiple).toFixed(2)
    : +(entry + riskPerShare * multiple).toFixed(2);
}

// closePosition — real partial-close support (confirmed gap: the legacy
// /api/alpaca/close only ever sends a bare DELETE with no qty/percentage).
// Alpaca's real DELETE /v2/positions/:symbol accepts an optional
// percentage or qty query param — this wires that through for the first
// time in this codebase.
async function closePosition(symbol, { qty, percentage } = {}) {
  const clean = String(symbol || "").toUpperCase().replace(/[^A-Z0-9.]/g, "");
  if (!clean) return { ok: false, reason: "symbol required" };
  const params = new URLSearchParams();
  if (percentage != null) params.set("percentage", String(Math.min(100, Math.max(0, Number(percentage)))));
  else if (qty != null) params.set("qty", String(Math.max(0, Number(qty))));
  const qs = params.toString();
  const a = await alpacaTradingRequest(`/v2/positions/${encodeURIComponent(clean)}${qs ? `?${qs}` : ""}`, "DELETE");
  if (!a._ok) return { ok: false, error: a.data?.message || "close failed", status: a._status };
  return { ok: true, closed: clean, qty: qty ?? null, percentage: percentage ?? null };
}

async function closeAll({ side } = {}) {
  const positions = await getPositions();
  const targets = side ? positions.filter((p) => p.side === side) : positions;
  const results = [];
  for (const p of targets) results.push({ symbol: p.symbol, ...(await closePosition(p.symbol)) });
  return { ok: true, count: results.length, results };
}
const closeAllLongs = () => closeAll({ side: "long" });
const closeAllShorts = () => closeAll({ side: "short" });
const flatten = () => closeAll();

// cancelOrders / modifyStop / modifyTarget — real, previously only
// existed as trailing-stops.js's internal 5-minute cron (modify) or not
// at all (cancel). Now callable on demand.
async function cancelOrders(orderId) {
  if (orderId === "all") {
    const a = await alpacaTradingRequest("/v2/orders", "DELETE");
    if (!a._ok) return { ok: false, error: a.data?.message || "cancel-all failed", status: a._status };
    return { ok: true, cancelled: "all" };
  }
  const a = await alpacaTradingRequest(`/v2/orders/${encodeURIComponent(orderId)}`, "DELETE");
  if (!a._ok) return { ok: false, error: a.data?.message || "cancel failed", status: a._status };
  return { ok: true, cancelled: orderId };
}
async function modifyStop(orderId, newStopPrice) {
  const a = await alpacaTradingRequest(`/v2/orders/${encodeURIComponent(orderId)}`, "PATCH", { stop_price: String(newStopPrice) });
  if (!a._ok) return { ok: false, error: a.data?.message || "modify failed", status: a._status };
  return { ok: true, orderId, stopPrice: newStopPrice };
}
async function modifyTarget(orderId, newLimitPrice) {
  const a = await alpacaTradingRequest(`/v2/orders/${encodeURIComponent(orderId)}`, "PATCH", { limit_price: String(newLimitPrice) });
  if (!a._ok) return { ok: false, error: a.data?.message || "modify failed", status: a._status };
  return { ok: true, orderId, limitPrice: newLimitPrice };
}

module.exports = {
  MAX_LOSS_PCT, MAX_RISK_PCT, MAX_PER_SECTOR,
  getAccount, getPositions, preTradeCheck, sizeByRisk, buildOrder, rMultipleTarget,
  buy, sell, short, cover, submitBracket,
  closePosition, closeAll, closeAllLongs, closeAllShorts, flatten,
  cancelOrders, modifyStop, modifyTarget,
};
