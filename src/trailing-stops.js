// Server-side trailing stops for Alpaca PAPER longs. Once a position is up enough,
// ratchet its stop UP as price rises so winners that run get protected — the stop
// only ever moves up, never down. Runs even with no browser open. PAPER only.
const ACTIVATE_PCT = Number(process.env.TRAIL_ACTIVATE_PCT) || 4;   // start trailing after +4%
const TRAIL_PCT    = Number(process.env.TRAIL_PCT) || 3;           // keep stop 3% below the high price

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
  if ((process.env.SERVER_AUTOPILOT || "").toLowerCase() !== "on") return;   // tied to server autopilot
  const { id, secret } = keys();
  if (!id || !secret || !isMarketHoursET()) return;

  const posR = await apca("/v2/positions");
  const positions = (posR && posR.ok && Array.isArray(posR.data)) ? posR.data : [];
  const ordR = await apca("/v2/orders?status=open&limit=200&nested=true");
  const orders = (ordR && ordR.ok && Array.isArray(ordR.data)) ? ordR.data : [];

  // Flatten bracket legs so we can find each position's stop order.
  const allOrders = [];
  for (const o of orders) { allOrders.push(o); if (Array.isArray(o.legs)) allOrders.push(...o.legs); }

  let raised = 0;
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
    if (!stopOrder) continue;
    const curStop = Number(stopOrder.stop_price);
    if (!(newStop > curStop + 0.01)) continue;         // only ever raise the stop, with a small buffer

    const res = await apca(`/v2/orders/${stopOrder.id}`, "PATCH", { stop_price: String(newStop) });
    if (res && res.ok) raised++;
  }
  if (raised) console.log(`[Trailing stops] raised ${raised} stop(s)`);
}

module.exports = { runTrailingStops };
