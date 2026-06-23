// Alpaca PAPER trading bridge — keys stay server-side, orders go to the paper API only.
// Set ALPACA_KEY_ID and ALPACA_SECRET_KEY in the environment (use PAPER keys).
const { writeJson } = require("../utils");

const BASE = "https://paper-api.alpaca.markets"; // PAPER only — never live

function keys() {
  return {
    id: process.env.ALPACA_KEY_ID || process.env.ALPACA_API_KEY_ID || "",
    secret: process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET_KEY || "",
  };
}

async function alpaca(path, method = "GET", body = null) {
  const { id, secret } = keys();
  if (!id || !secret) return { _noKey: true };
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "APCA-API-KEY-ID": id,
      "APCA-API-SECRET-KEY": secret,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { _status: r.status, _ok: r.ok, ...((json && typeof json === "object") ? { data: json } : { data: json }) };
}

async function readBody(req) {
  let body = ""; for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || "{}"); } catch { return {}; }
}

async function handleAlpaca(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;
  const { id, secret } = keys();
  const configured = Boolean(id && secret);

  // Status / account
  if (pathname === "/api/alpaca/account" && req.method === "GET") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key", configured: false });
    try {
      const a = await alpaca("/v2/account");
      if (a._noKey) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key" });
      if (!a._ok) return writeJson(res, 200, { ok: false, error: a.data?.message || "account error", status: a._status });
      const d = a.data;
      return writeJson(res, 200, { ok: true, configured: true, account: {
        status: d.status, equity: Number(d.equity), cash: Number(d.cash),
        buyingPower: Number(d.buying_power), portfolioValue: Number(d.portfolio_value),
        currency: d.currency, paper: true,
        optionsApprovedLevel: d.options_approved_level != null ? Number(d.options_approved_level) : null,
        optionsTradingLevel: d.options_trading_level != null ? Number(d.options_trading_level) : null,
        optionsBuyingPower: d.options_buying_power != null ? Number(d.options_buying_power) : null,
      } });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  // Portfolio history — equity curve + P&L for the Alpaca paper account.
  // Query: period (default 1M), timeframe (default 1D). Used by the My Trades performance split.
  if (pathname === "/api/alpaca/history" && req.method === "GET") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key" });
    const period = (searchParams.get("period") || "1M").replace(/[^0-9A-Za-z]/g, "");
    const timeframe = (searchParams.get("timeframe") || "1D").replace(/[^0-9A-Za-z]/g, "");
    const a = await alpaca(`/v2/account/portfolio/history?period=${period}&timeframe=${timeframe}&extended_hours=false`);
    if (!a._ok) return writeJson(res, 200, { ok: false, error: a.data?.message || "history error", status: a._status });
    const d = a.data || {};
    const equity = (d.equity || []).filter(v => v != null);
    const base = Number(d.base_value) || (equity.length ? equity[0] : 0);
    const last = equity.length ? equity[equity.length - 1] : base;
    const totalPL = last - base;
    return writeJson(res, 200, { ok: true,
      base, equity, timestamps: d.timestamp || [],
      profitLoss: d.profit_loss || [], totalPL,
      totalPLpc: base ? (totalPL / base) * 100 : 0,
    });
  }

  if (pathname === "/api/alpaca/positions" && req.method === "GET") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key", positions: [] });
    const a = await alpaca("/v2/positions");
    if (!a._ok) return writeJson(res, 200, { ok: false, positions: [], error: a.data?.message });
    const positions = (a.data || []).map(p => ({
      symbol: p.symbol, qty: Number(p.qty), avgEntry: Number(p.avg_entry_price),
      current: Number(p.current_price), marketValue: Number(p.market_value),
      unrealizedPL: Number(p.unrealized_pl), unrealizedPLpc: Number(p.unrealized_plpc) * 100, side: p.side,
    }));
    return writeJson(res, 200, { ok: true, positions });
  }

  if (pathname === "/api/alpaca/orders" && req.method === "GET") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key", orders: [] });
    const status = searchParams.get("status") || "all";
    const a = await alpaca(`/v2/orders?status=${encodeURIComponent(status)}&limit=50&direction=desc`);
    if (!a._ok) return writeJson(res, 200, { ok: false, orders: [], error: a.data?.message });
    const orders = (a.data || []).map(o => ({
      id: o.id, symbol: o.symbol, qty: Number(o.qty), side: o.side, type: o.type,
      status: o.status, filledAvg: o.filled_avg_price ? Number(o.filled_avg_price) : null,
      submittedAt: o.submitted_at,
    }));
    return writeJson(res, 200, { ok: true, orders });
  }

  // Place an order. Body: { symbol, qty, side, type?, limit_price?, stop_loss?, take_profit? }
  if (pathname === "/api/alpaca/order" && req.method === "POST") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key" });
    const b = await readBody(req);
    const symbol = String(b.symbol || "").toUpperCase().replace(/[^A-Z.]/g, "");
    const qty = Math.max(0, Math.floor(Number(b.qty) || 0));
    const side = b.side === "sell" ? "sell" : "buy";
    if (!symbol || qty < 1) return writeJson(res, 400, { ok: false, error: "symbol and qty required" });
    const order = {
      symbol, qty: String(qty), side,
      type: b.type || "market",
      time_in_force: b.time_in_force || "day",
    };
    if (b.limit_price) order.limit_price = String(b.limit_price);
    // Bracket order: attach stop loss + take profit if provided (works for long buys and short sells)
    if (b.stop_loss || b.take_profit) {
      order.order_class = "bracket";
      if (b.take_profit) order.take_profit = { limit_price: String(b.take_profit) };
      if (b.stop_loss) order.stop_loss = { stop_price: String(b.stop_loss) };
    }
    const a = await alpaca("/v2/orders", "POST", order);
    if (!a._ok) return writeJson(res, 200, { ok: false, error: a.data?.message || "order rejected", status: a._status });
    return writeJson(res, 200, { ok: true, order: { id: a.data.id, symbol: a.data.symbol, qty: Number(a.data.qty), side: a.data.side, status: a.data.status } });
  }

  // Place a SIMPLE option order. Body: { underlying, type: "call"|"put", qty, underlyingPx }
  // Finds a near-dated (~2–5 wk) ATM contract and buys it at market. Requires options enabled on the paper account.
  if (pathname === "/api/alpaca/option-order" && req.method === "POST") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key" });
    const b = await readBody(req);
    const underlying = String(b.underlying || "").toUpperCase().replace(/[^A-Z.]/g, "");
    const type = b.type === "put" ? "put" : "call";
    const qty = Math.max(1, Math.floor(Number(b.qty) || 1));
    const px = Number(b.underlyingPx) || 0;
    if (!underlying) return writeJson(res, 400, { ok: false, error: "underlying required" });
    try {
      const today = new Date();
      const gte = new Date(today.getTime() + 12 * 86400000).toISOString().slice(0, 10);
      const lte = new Date(today.getTime() + 45 * 86400000).toISOString().slice(0, 10);
      const cAll = await alpaca(`/v2/options/contracts?underlying_symbols=${underlying}&type=${type}&style=american&status=active&expiration_date_gte=${gte}&expiration_date_lte=${lte}&limit=200`);
      if (!cAll._ok) return writeJson(res, 200, { ok: false, error: cAll.data?.message || "contracts lookup failed (is options trading enabled on the paper account?)", status: cAll._status });
      const contracts = cAll.data?.option_contracts || [];
      if (!contracts.length) return writeJson(res, 200, { ok: false, error: "no contracts found in window" });
      // nearest expiration first
      const minExp = contracts.reduce((m, c) => c.expiration_date < m ? c.expiration_date : m, contracts[0].expiration_date);
      const near = contracts.filter(c => c.expiration_date === minExp);
      // strike closest to underlying price (ATM)
      const pick = near.reduce((best, c) => {
        const d = Math.abs(Number(c.strike_price) - px);
        return (!best || d < best.d) ? { c, d } : best;
      }, null);
      const contract = pick?.c;
      if (!contract) return writeJson(res, 200, { ok: false, error: "no ATM contract" });
      const order = await alpaca("/v2/orders", "POST", {
        symbol: contract.symbol, qty: String(qty), side: "buy", type: "market", time_in_force: "day",
      });
      if (!order._ok) return writeJson(res, 200, { ok: false, error: order.data?.message || "option order rejected", status: order._status });
      return writeJson(res, 200, { ok: true, order: { id: order.data.id, symbol: order.data.symbol, qty: Number(order.data.qty), status: order.data.status, strike: contract.strike_price, expiry: contract.expiration_date } });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  // Close a full position (market sell everything). Allows option (OCC) symbols too.
  if (pathname === "/api/alpaca/close" && req.method === "POST") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key" });
    const b = await readBody(req);
    const symbol = String(b.symbol || "").toUpperCase().replace(/[^A-Z0-9.]/g, "");  // keep digits for options
    if (!symbol) return writeJson(res, 400, { ok: false, error: "symbol required" });
    const a = await alpaca(`/v2/positions/${encodeURIComponent(symbol)}`, "DELETE");
    if (!a._ok) return writeJson(res, 200, { ok: false, error: a.data?.message || "close failed", status: a._status });
    return writeJson(res, 200, { ok: true, closed: symbol });
  }

  // Liquidate only OPTION positions (keeps shares). Server-side so symbols aren't mangled.
  if (pathname === "/api/alpaca/liquidate-options" && req.method === "POST") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key" });
    const pos = await alpaca("/v2/positions");
    if (!pos._ok) return writeJson(res, 200, { ok: false, error: pos.data?.message || "positions error" });
    const isOption = s => /\d{6}[CP]\d{8}$/.test(s);
    const opts = (pos.data || []).filter(p => isOption(p.symbol));
    let closed = 0, failed = 0, pnl = 0; const errs = [];
    for (const p of opts) {
      pnl += Number(p.unrealized_pl || 0);
      const c = await alpaca(`/v2/positions/${encodeURIComponent(p.symbol)}`, "DELETE");
      if (c._ok) closed++; else { failed++; errs.push(`${p.symbol}: ${c.data?.message || c._status}`); }
    }
    return writeJson(res, 200, { ok: true, total: opts.length, closed, failed, pnl: Math.round(pnl), errs: errs.slice(0, 5) });
  }

  return writeJson(res, 404, { ok: false, error: "Unknown Alpaca endpoint" });
}

module.exports = { handleAlpaca };
