// Server-side trailing stops for Alpaca PAPER longs. Once a position is up enough,
// ratchet its stop UP as price rises so winners that run get protected — the stop
// only ever moves up, never down. Also extends the bracket's target leg (also
// only ever up) to preserve the platform's own house 2:1 reward:risk rule
// (the same ratio already stated in Trading Copilot's system prompt) measured
// off the newly-raised stop, so a winner that's earned a tighter stop also
// earns more room to run rather than getting capped at its original target.
// Runs even with no browser open. PAPER only.
const { isOn } = require("./utils");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const ACTIVATE_PCT = Number(process.env.TRAIL_ACTIVATE_PCT) || 4;   // start trailing after +4%
const TRAIL_PCT    = Number(process.env.TRAIL_PCT) || 3;           // keep stop 3% below the high price
const TARGET_R_MULTIPLE = Number(process.env.TRAIL_TARGET_R) || 2; // extend target to this multiple of the new stop's risk distance

const APCA = "https://paper-api.alpaca.markets";
function keys() {
  return {
    id: process.env.ALPACA_KEY_ID || process.env.ALPACA_API_KEY_ID || "",
    secret: process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET_KEY || "",
  };
}
async function apca(pathStr, method = "GET", body = null) {
  const { id, secret } = keys();
  if (!id || !secret) return null;
  try {
    const r = await fetch(`${APCA}${pathStr}`, {
      method,
      headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data: j };
  } catch { return null; }
}
function isMarketHoursET() {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); if (day < 1 || day > 5) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 9 * 60 + 35 && mins <= 15 * 60 + 55;
}

async function runTrailingStops() {
  if (!isOn(process.env.SERVER_AUTOPILOT)) return;   // tied to server autopilot
  const { id, secret } = keys();
  if (!id || !secret || !isMarketHoursET()) return;

  const posR = await apca("/v2/positions");
  const positions = (posR && posR.ok && Array.isArray(posR.data)) ? posR.data : [];
  const ordR = await apca("/v2/orders?status=open&limit=200&nested=true");
  const orders = (ordR && ordR.ok && Array.isArray(ordR.data)) ? ordR.data : [];

  // Flatten bracket legs so we can find each position's stop order.
  const allOrders = [];
  for (const o of orders) { allOrders.push(o); if (Array.isArray(o.legs)) allOrders.push(...o.legs); }

  const changes = [];
  for (const p of positions) {
    if (Number(p.qty) <= 0) continue;                 // longs only
    const entry = Number(p.avg_entry_price), price = Number(p.current_price);
    if (!(entry > 0) || !(price > 0)) continue;
    const gainPct = (price / entry - 1) * 100;
    if (gainPct < ACTIVATE_PCT) continue;             // not yet in profit enough to trail

    const newStop = +(price * (1 - TRAIL_PCT / 100)).toFixed(2);
    // find this symbol's open STOP order (the protective sell-stop leg)
    const stopOrder = allOrders.find(o => o.symbol === p.symbol && o.side === "sell" &&
      (o.type === "stop" || o.order_type === "stop" || o.stop_price != null));
    // ...and its TARGET order (the bracket's take-profit limit leg) — same
    // detection heuristic as the stop leg above, just for limit_price.
    const targetOrder = allOrders.find(o => o.symbol === p.symbol && o.side === "sell" && o !== stopOrder &&
      (o.type === "limit" || o.order_type === "limit" || o.limit_price != null));

    let change = null;

    if (stopOrder) {
      const curStop = Number(stopOrder.stop_price);
      if (newStop > curStop + 0.01) {                 // only ever raise the stop, with a small buffer
        const res = await apca(`/v2/orders/${stopOrder.id}`, "PATCH", { stop_price: String(newStop) });
        if (res && res.ok) {
          change = { symbol: p.symbol, gainPct, oldStop: curStop, newStop };
        }
      }
    }

    if (targetOrder) {
      const curTarget = Number(targetOrder.limit_price);
      const newTarget = +(price + (price - newStop) * TARGET_R_MULTIPLE).toFixed(2);
      if (newTarget > curTarget + 0.01) {              // only ever raise the target, same rule as the stop
        const res = await apca(`/v2/orders/${targetOrder.id}`, "PATCH", { limit_price: String(newTarget) });
        if (res && res.ok) {
          change = change || { symbol: p.symbol, gainPct };
          change.oldTarget = curTarget; change.newTarget = newTarget;
        }
      }
    }

    if (change) changes.push(change);
  }

  if (changes.length) {
    console.log(`[Trailing stops] adjusted ${changes.length} position(s)`);
    if (telegramConfigured()) {
      const lines = changes.map(c => {
        const bits = [`${c.symbol} +${c.gainPct.toFixed(1)}%`];
        if (c.newStop != null) bits.push(`stop $${c.oldStop}→$${c.newStop}`);
        if (c.newTarget != null) bits.push(`target $${c.oldTarget}→$${c.newTarget}`);
        return bits.join(" · ");
      });
      await sendTelegramMessage(`📈 TRAILING STOPS — winner(s) running, protection raised:\n${lines.join("\n")}`);
    }
  }
}

module.exports = { runTrailingStops };
