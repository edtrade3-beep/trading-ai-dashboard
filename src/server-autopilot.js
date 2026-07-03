// Server-side autopilot — trades A+ buy-points on the Alpaca PAPER account even
// when NO browser is open. OFF unless SERVER_AUTOPILOT="on". LONGS ONLY (shorts
// stay browser-side for safety). Mirrors the client guards: market-hours only,
// daily-loss breaker, max positions, total open-risk ceiling, no re-buying a
// symbol already held. PAPER only — never live.
const { sendTelegramMessage, isConfigured } = require("./telegram");
const { PORT } = require("./config");

const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
const APCA = "https://paper-api.alpaca.markets";
function keys() {
  return {
    id: process.env.ALPACA_KEY_ID || process.env.ALPACA_API_KEY_ID || "",
    secret: process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET_KEY || "",
  };
}
async function apca(path, method = "GET", body = null) {
  const { id, secret } = keys();
  if (!id || !secret) return null;
  try {
    const r = await fetch(`${APCA}${path}`, {
      method,
      headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data: j };
  } catch { return null; }
}
async function getJson(path) { try { const r = await fetch(`${BASE()}${path}`); return await r.json(); } catch { return null; }
}

function isMarketHoursET() {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); if (day < 1 || day > 5) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 9 * 60 + 35 && mins <= 15 * 60 + 55;   // 9:35–15:55 ET
}

async function runServerAutopilot() {
  if ((process.env.SERVER_AUTOPILOT || "").toLowerCase() !== "on") return;
  const { id, secret } = keys();
  if (!id || !secret) return;
  if (!isMarketHoursET()) return;

  const acctR = await apca("/v2/account");
  if (!acctR || !acctR.ok) return;
  const acct = acctR.data;
  const equity   = Number(acct.equity) || 0;
  const lastEq   = Number(acct.last_equity) || equity;
  const buyPower = Number(acct.buying_power) || 0;
  if (equity <= 0) return;

  // Daily-loss circuit breaker: stop opening new trades after −2% on the day.
  if ((equity - lastEq) / lastEq <= -0.02) return;

  const posR = await apca("/v2/positions");
  const positions = (posR && posR.ok && Array.isArray(posR.data)) ? posR.data : [];
  const held = new Set(positions.map(p => p.symbol));
  const maxPos = Number(process.env.SERVER_AUTOPILOT_MAXPOS) || 12;
  if (positions.length >= maxPos) return;

  // Total open-risk ceiling (Σ |qty|×entry×5% assumed stop) ≤ 6% of equity.
  const openRisk = positions.reduce((s, p) => s + Math.abs(Number(p.qty) || 0) * (Number(p.avg_entry_price) || 0) * 0.05, 0);
  const maxRiskPct = Number(process.env.SERVER_AUTOPILOT_MAXRISK) || 6;
  if ((openRisk / equity) * 100 >= maxRiskPct) return;

  // Find A+ buy-points from the watchlist screen.
  let syms = [];
  try { syms = (require("./settings-store").loadSettings() || {}).watchlistSymbols || []; } catch {}
  syms = syms.filter(Boolean).slice(0, 40);
  if (!syms.length) return;
  const screen = await getJson(`/api/market/trend-screen?symbols=${encodeURIComponent(syms.join(","))}`);
  const rows = ((screen && screen.results) || [])
    .filter(r => !r.error && r.atBuyPoint && r.volConfirmed && !held.has(r.symbol) && Number(r.entry) > 0 && Number(r.stop) > 0 && Number(r.entry) > Number(r.stop))
    .sort((a, b) => (b.passCount - a.passCount) || ((b.rsRating || 0) - (a.rsRating || 0)));
  if (!rows.length) return;

  const riskPct = Number(process.env.SERVER_AUTOPILOT_RISK) || 1;   // % of equity per trade
  let slots = maxPos - positions.length;
  let placed = 0;
  for (const r of rows) {
    if (slots <= 0) break;
    const entry = Number(r.entry), stop = Number(r.stop);
    const target = Number(r.target2) > entry ? Number(r.target2) : +(entry + (entry - stop) * 2).toFixed(2);
    const riskPerShare = Math.max(0.01, entry - stop);
    let qty = Math.floor((equity * (riskPct / 100)) / riskPerShare);
    qty = Math.min(qty, Math.floor(buyPower / entry));      // don't exceed buying power
    if (qty < 1) continue;
    const order = {
      symbol: r.symbol, qty: String(qty), side: "buy", type: "market", time_in_force: "day",
      order_class: "bracket",
      take_profit: { limit_price: String(target) },
      stop_loss: { stop_price: String(+stop.toFixed(2)) },
    };
    const res = await apca("/v2/orders", "POST", order);
    if (res && res.ok) {
      slots--; placed++;
      if (isConfigured()) sendTelegramMessage(
        `🤖 SERVER AUTOPILOT — BUY ${r.symbol}\n${qty} sh @ ~$${entry} (paper · bracket)\nStop $${stop} · Target $${target}\n(placed with no browser open · ${riskPct}% risk)`
      ).catch(() => {});
    }
  }
  if (placed) console.log(`[Server autopilot] placed ${placed} order(s)`);
}

module.exports = { runServerAutopilot };
