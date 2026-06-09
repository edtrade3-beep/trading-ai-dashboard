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
      } });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
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
    // Bracket order: attach stop loss + take profit if provided (entry must be buy/market or limit)
    if (side === "buy" && (b.stop_loss || b.take_profit)) {
      order.order_class = "bracket";
      if (b.take_profit) order.take_profit = { limit_price: String(b.take_profit) };
      if (b.stop_loss) order.stop_loss = { stop_price: String(b.stop_loss) };
    }
    const a = await alpaca("/v2/orders", "POST", order);
    if (!a._ok) return writeJson(res, 200, { ok: false, error: a.data?.message || "order rejected", status: a._status });
    return writeJson(res, 200, { ok: true, order: { id: a.data.id, symbol: a.data.symbol, qty: Number(a.data.qty), side: a.data.side, status: a.data.status } });
  }

  // Close a full position (market sell everything)
  if (pathname === "/api/alpaca/close" && req.method === "POST") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key" });
    const b = await readBody(req);
    const symbol = String(b.symbol || "").toUpperCase().replace(/[^A-Z.]/g, "");
    if (!symbol) return writeJson(res, 400, { ok: false, error: "symbol required" });
    const a = await alpaca(`/v2/positions/${encodeURIComponent(symbol)}`, "DELETE");
    if (!a._ok) return writeJson(res, 200, { ok: false, error: a.data?.message || "close failed", status: a._status });
    return writeJson(res, 200, { ok: true, closed: symbol });
  }

  return writeJson(res, 404, { ok: false, error: "Unknown Alpaca endpoint" });
}

module.exports = { handleAlpaca };
