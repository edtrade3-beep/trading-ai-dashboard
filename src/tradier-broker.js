/**
 * tradier-broker.js
 * Tradier brokerage API — order placement, positions, account balances.
 * Uses the PAPER (sandbox) endpoint by default; set TRADIER_LIVE=true to trade live.
 *
 * Env vars:
 *   TRADIER_API_KEY      — your Tradier token
 *   TRADIER_ACCOUNT_ID   — your Tradier account number
 *   TRADIER_LIVE         — "true" to use live endpoint (default: paper/sandbox)
 */

const LIVE = process.env.TRADIER_LIVE === "true";
const BASE = LIVE
  ? "https://api.tradier.com/v1"
  : "https://sandbox.tradier.com/v1";

function getKey() {
  return (process.env.TRADIER_API_KEY || "").trim();
}

function getAccountId() {
  return (process.env.TRADIER_ACCOUNT_ID || "").trim();
}

function isConfigured() {
  return !!(getKey() && getAccountId());
}

async function tradierFetch(path, method = "GET", body = null) {
  const key = getKey();
  if (!key) throw new Error("TRADIER_API_KEY not set");

  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  };

  if (body) {
    opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
    opts.body = new URLSearchParams(body).toString();
  }

  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) throw new Error(`Tradier ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return json;
}

// ── Account ───────────────────────────────────────────────────────────────────

async function getBalances() {
  const acct = getAccountId();
  if (!acct) throw new Error("TRADIER_ACCOUNT_ID not set");
  const data = await tradierFetch(`/accounts/${acct}/balances`);
  const b = data?.balances;
  return {
    accountNumber: b?.account_number,
    type: b?.account_type,
    totalEquity: b?.total_equity,
    totalCash: b?.total_cash,
    marketValue: b?.market_value,
    buyingPower: b?.margin?.stock_buying_power ?? b?.cash?.cash_available ?? null,
  };
}

async function getPositions() {
  const acct = getAccountId();
  if (!acct) throw new Error("TRADIER_ACCOUNT_ID not set");
  const data = await tradierFetch(`/accounts/${acct}/positions`);
  const raw = data?.positions?.position;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(p => ({
    symbol:       p.symbol,
    quantity:     Number(p.quantity),
    costBasis:    Number(p.cost_basis),
    dateAcquired: p.date_acquired,
  }));
}

async function getOrders() {
  const acct = getAccountId();
  if (!acct) throw new Error("TRADIER_ACCOUNT_ID not set");
  const data = await tradierFetch(`/accounts/${acct}/orders`);
  const raw = data?.orders?.order;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(o => ({
    id:       o.id,
    symbol:   o.symbol,
    side:     o.side,
    quantity: Number(o.quantity),
    type:     o.type,
    status:   o.status,
    price:    o.price || null,
    filled:   o.avg_fill_price || null,
    created:  o.create_date,
  }));
}

// ── Orders ────────────────────────────────────────────────────────────────────

/**
 * Place an equity order.
 * @param {object} opts
 * @param {"buy"|"sell"} opts.side
 * @param {string} opts.symbol
 * @param {number} opts.quantity   — number of shares
 * @param {"market"|"limit"} opts.type
 * @param {number} [opts.price]    — required for limit orders
 * @param {"day"|"gtc"} [opts.duration]
 */
async function placeEquityOrder({ side, symbol, quantity, type = "market", price = null, duration = "day" }) {
  const acct = getAccountId();
  if (!acct) throw new Error("TRADIER_ACCOUNT_ID not set");
  if (!["buy", "sell"].includes(side)) throw new Error(`Invalid side: ${side}`);
  if (!symbol || !quantity || quantity <= 0) throw new Error("symbol and quantity required");

  const body = {
    class:    "equity",
    symbol:   symbol.toUpperCase(),
    side,
    quantity: String(Math.round(quantity)),
    type,
    duration,
  };
  if (type === "limit") {
    if (!price) throw new Error("limit order requires price");
    body.price = String(price);
  }

  const data = await tradierFetch(`/accounts/${acct}/orders`, "POST", body);
  const order = data?.order;
  return {
    orderId: order?.id,
    status:  order?.status,
    symbol:  symbol.toUpperCase(),
    side,
    quantity,
    type,
    price,
    live: LIVE,
  };
}

/**
 * Cancel an open order.
 */
async function cancelOrder(orderId) {
  const acct = getAccountId();
  if (!acct) throw new Error("TRADIER_ACCOUNT_ID not set");
  return tradierFetch(`/accounts/${acct}/orders/${orderId}`, "DELETE");
}

/**
 * Get a live quote for a symbol.
 */
async function getQuote(symbol) {
  const data = await tradierFetch(`/markets/quotes?symbols=${encodeURIComponent(symbol)}&greeks=false`);
  const q = data?.quotes?.quote;
  if (!q) return null;
  return { symbol: q.symbol, price: q.last || q.ask || q.bid, bid: q.bid, ask: q.ask, volume: q.volume };
}

module.exports = {
  isConfigured,
  getBalances,
  getPositions,
  getOrders,
  placeEquityOrder,
  cancelOrder,
  getQuote,
  LIVE,
};
