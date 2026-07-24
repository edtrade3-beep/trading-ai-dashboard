// Quick Trade Engine — Phase 1 HTTP layer. Thin wrapper over
// quick-trade-service.js: every mutating route here runs the real
// pre-trade risk gate (account health, daily loss breaker, open risk,
// sector cap, market hours) before touching the real Alpaca paper API.
// All POST routes are added to router.js's API_AUTH_TOKEN gate.
const { writeJson, readRequestBody } = require("../utils");
const svc = require("../quick-trade-service");

async function readBody(req) {
  try { return JSON.parse((await readRequestBody(req)) || "{}"); } catch { return {}; }
}

function cleanSymbol(s) {
  return String(s || "").trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");
}

async function handleQuickTrade(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  // GET /api/quick-trade/precheck?symbol=X&riskPct=&entry=&stop=&side=&maxNamePct=
  // Real risk-gate status + (when sizing params are given) a real suggested
  // quantity — the panel's single source of truth for sizing math instead of
  // a duplicated client-side copy of sizePositionByRisk.
  if (pathname === "/api/quick-trade/precheck" && req.method === "GET") {
    const symbol = cleanSymbol(searchParams.get("symbol"));
    const gate = await svc.preTradeCheck({ symbol: symbol || undefined, requireMarketHours: searchParams.get("requireMarketHours") !== "false" });
    if (!gate.ok) return writeJson(res, 200, { ok: false, reason: gate.reason });

    const riskPct = Number(searchParams.get("riskPct"));
    const entry = Number(searchParams.get("entry"));
    const stop = Number(searchParams.get("stop"));
    let sizing = null;
    if (riskPct > 0 && entry > 0 && stop > 0) {
      const side = searchParams.get("side") === "short" ? "short" : "long";
      const maxNamePct = Number(searchParams.get("maxNamePct")) || 20;
      const qty = svc.sizeByRisk({ equity: gate.account.equity, riskPct, entry, stop, availCash: gate.account.cash, maxNamePct, side });
      const riskPerShare = Math.abs(entry - stop);
      sizing = { qty, riskPerShare, positionValue: +(qty * entry).toFixed(2), dollarRisk: +(qty * riskPerShare).toFixed(2) };
    }

    return writeJson(res, 200, {
      ok: true,
      account: gate.account,
      openRiskPct: gate.openRiskPct,
      positionCount: gate.positions.length,
      sizing,
    });
  }

  // POST /api/quick-trade/order
  // Body: { symbol, qty, side: buy|sell|short|cover, type?, limitPrice?, stopPrice?,
  //         stopLoss?, takeProfit?, timeInForce?, clientOrderId?, requireMarketHours? }
  if (pathname === "/api/quick-trade/order" && req.method === "POST") {
    const b = await readBody(req);
    const symbol = cleanSymbol(b.symbol);
    const qty = Math.max(0, Math.floor(Number(b.qty) || 0));
    const side = ["buy", "sell", "short", "cover"].includes(b.side) ? b.side : null;
    if (!symbol || qty < 1) return writeJson(res, 400, { ok: false, error: "symbol and qty (>=1) are required" });
    if (!side) return writeJson(res, 400, { ok: false, error: "side must be buy, sell, short, or cover" });

    const opts = {
      type: b.type || "market",
      limitPrice: b.limitPrice,
      stopPrice: b.stopPrice,
      stopLoss: b.stopLoss,
      takeProfit: b.takeProfit,
      timeInForce: b.timeInForce || "day",
      clientOrderId: b.clientOrderId,
      requireMarketHours: b.requireMarketHours !== false,
    };

    const fn = { buy: svc.buy, sell: svc.sell, short: svc.short, cover: svc.cover }[side];
    const result = await fn(symbol, qty, opts);
    return writeJson(res, 200, result);
  }

  // POST /api/quick-trade/close  Body: { symbol, qty?, percentage? }
  if (pathname === "/api/quick-trade/close" && req.method === "POST") {
    const b = await readBody(req);
    const symbol = cleanSymbol(b.symbol);
    if (!symbol) return writeJson(res, 400, { ok: false, error: "symbol required" });
    const result = await svc.closePosition(symbol, { qty: b.qty, percentage: b.percentage });
    return writeJson(res, 200, result);
  }

  // Panic buttons — no body required.
  if (pathname === "/api/quick-trade/close-all" && req.method === "POST") {
    return writeJson(res, 200, await svc.closeAll());
  }
  if (pathname === "/api/quick-trade/close-all-longs" && req.method === "POST") {
    return writeJson(res, 200, await svc.closeAllLongs());
  }
  if (pathname === "/api/quick-trade/close-all-shorts" && req.method === "POST") {
    return writeJson(res, 200, await svc.closeAllShorts());
  }
  if (pathname === "/api/quick-trade/flatten" && req.method === "POST") {
    return writeJson(res, 200, await svc.flatten());
  }

  // POST /api/quick-trade/cancel  Body: { orderId }  ("all" cancels every open order)
  if (pathname === "/api/quick-trade/cancel" && req.method === "POST") {
    const b = await readBody(req);
    const orderId = String(b.orderId || "").trim();
    if (!orderId) return writeJson(res, 400, { ok: false, error: "orderId required" });
    return writeJson(res, 200, await svc.cancelOrders(orderId));
  }

  // POST /api/quick-trade/modify-stop  Body: { orderId, stopPrice }
  if (pathname === "/api/quick-trade/modify-stop" && req.method === "POST") {
    const b = await readBody(req);
    const orderId = String(b.orderId || "").trim();
    const stopPrice = Number(b.stopPrice);
    if (!orderId || !(stopPrice > 0)) return writeJson(res, 400, { ok: false, error: "orderId and stopPrice (>0) required" });
    return writeJson(res, 200, await svc.modifyStop(orderId, stopPrice));
  }

  // POST /api/quick-trade/modify-target  Body: { orderId, limitPrice }
  if (pathname === "/api/quick-trade/modify-target" && req.method === "POST") {
    const b = await readBody(req);
    const orderId = String(b.orderId || "").trim();
    const limitPrice = Number(b.limitPrice);
    if (!orderId || !(limitPrice > 0)) return writeJson(res, 400, { ok: false, error: "orderId and limitPrice (>0) required" });
    return writeJson(res, 200, await svc.modifyTarget(orderId, limitPrice));
  }

  return writeJson(res, 404, { ok: false, error: "Unknown quick-trade endpoint" });
}

module.exports = { handleQuickTrade };
