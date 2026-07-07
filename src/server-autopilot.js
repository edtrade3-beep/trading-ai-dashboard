// Server-side autopilot — trades A+ buy-points on the Alpaca PAPER account even
// when NO browser is open. OFF unless SERVER_AUTOPILOT="on". LONGS ONLY (shorts
// stay browser-side for safety). Mirrors the client guards: market-hours only,
// daily-loss breaker, max positions, total open-risk ceiling, no re-buying a
// symbol already held. PAPER only — never live.
const { sendTelegramMessage, isConfigured } = require("./telegram");
const { PORT } = require("./config");
const { appendJournal } = require("./autopilot-journal");
const { isOn } = require("./utils");

// Curated liquid market leaders — the kind of names the Trend Template works best
// on. Added to your watchlist so there are always candidates to find trades.
const LEADERS = [
  "NVDA","MSFT","AAPL","AMZN","META","GOOGL","AVGO","TSLA","AMD","NFLX",
  "CRM","ORCL","ADBE","NOW","PANW","CRWD","PLTR","SNOW","MU","QCOM",
  "ANET","MRVL","SMCI","ARM","COIN","HOOD","UBER","ABNB","SHOP","INTU",
  "LLY","V","MA","JPM","COST","WMT","HD","AXP","GE","CAT",
];

// Sector map for correlation control — don't load up on highly-correlated names.
const SECTORS = {
  NVDA:"semi",AMD:"semi",AVGO:"semi",MU:"semi",QCOM:"semi",ANET:"semi",MRVL:"semi",SMCI:"semi",ARM:"semi",TXN:"semi",LRCX:"semi",
  MSFT:"software",ORCL:"software",CRM:"software",ADBE:"software",NOW:"software",PANW:"software",CRWD:"software",PLTR:"software",SNOW:"software",INTU:"software",
  AAPL:"tech-hw",AMZN:"internet",META:"internet",GOOGL:"internet",NFLX:"internet",UBER:"internet",ABNB:"internet",SHOP:"internet",COIN:"crypto",TSLA:"auto",
  LLY:"health",UNH:"health",V:"fintech",MA:"fintech",AXP:"fintech",JPM:"bank",
  COST:"retail",WMT:"retail",HD:"retail",NKE:"retail",MCD:"retail",PEP:"staples",KO:"staples",
  XOM:"energy",CVX:"energy",GE:"industrial",CAT:"industrial",BA:"industrial",DIS:"media",
};

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
  if (!isOn(process.env.SERVER_AUTOPILOT)) return;
  const { id, secret } = keys();
  if (!id || !secret) return;
  if (!isMarketHoursET()) return;

  const acctR = await apca("/v2/account");
  if (!acctR || !acctR.ok) return;
  const acct = acctR.data;
  const equity   = Number(acct.equity) || 0;
  const lastEq   = Number(acct.last_equity) || equity;
  // Size off CASH, not buying_power — buying_power includes margin (borrowed
  // money). Cash-only means the account can never lever up on the long side.
  const cash     = Math.max(0, Number(acct.cash) || 0);
  const buyPower = cash;
  // Account health gate — never trade a blown, debit, or restricted account.
  if (equity <= 0) return;                                   // negative/zero equity (blown account)
  if ((Number(acct.cash) || 0) < 0) return;                 // margin debit — sitting in borrowed money
  if (equity < 500) return;                                  // too small to trade sanely
  if (acct.trading_blocked || acct.account_blocked) return; // Alpaca has restricted the account

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

  // Universe = your watchlist + a curated set of liquid market leaders, so there
  // are always enough candidates to find trades (more opportunities = more trades).
  let syms = [];
  try { syms = (require("./settings-store").loadSettings() || {}).watchlistSymbols || []; } catch {}
  syms = [...new Set([...syms, ...LEADERS].filter(Boolean))].slice(0, 60);
  if (!syms.length) return;
  const screen = await getJson(`/api/market/trend-screen?symbols=${encodeURIComponent(syms.join(","))}`);
  const eligible = ((screen && screen.results) || [])
    .filter(r => !r.error && !held.has(r.symbol) && Number(r.entry) > 0 && Number(r.stop) > 0 && Number(r.entry) > Number(r.stop))
    // Tier A = strong buy-point with volume confirmation (full size).
    // Tier B = A+ trend, actionable, not extended — a good setup (half size). More trades.
    .map(r => {
      const tierA = r.atBuyPoint && r.volConfirmed;
      const tierB = (r.passCount >= 7 && r.actionable && !r.extended) || r.atBuyPoint;
      return { ...r, tier: tierA ? "A" : (tierB ? "B" : null) };
    })
    .filter(r => r.tier)
    .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "A" ? -1 : 1) || (b.passCount - a.passCount) || ((b.rsRating || 0) - (a.rsRating || 0)));
  if (!eligible.length) return;

  const riskPct = Number(process.env.SERVER_AUTOPILOT_RISK) || 1;   // % of equity per FULL-size trade
  // Sector-correlation cap: don't hold more than N positions in one sector.
  const maxPerSector = Number(process.env.SERVER_AUTOPILOT_MAXSECTOR) || 3;
  const sectorCount = {};
  for (const p of positions) { const s = SECTORS[p.symbol] || "other"; sectorCount[s] = (sectorCount[s] || 0) + 1; }
  let slots = maxPos - positions.length;
  let placed = 0;
  let availCash = buyPower;   // running cash budget — decremented as buys are placed
  for (const r of eligible) {
    if (slots <= 0) break;
    const sec = SECTORS[r.symbol] || "other";
    if ((sectorCount[sec] || 0) >= maxPerSector) continue;   // already too concentrated in this sector
    const entry = Number(r.entry), stop = Number(r.stop);
    const target = Number(r.target2) > entry ? Number(r.target2) : +(entry + (entry - stop) * 2).toFixed(2);
    const riskPerShare = Math.max(0.01, entry - stop);
    const riskFrac = (r.tier === "A" ? riskPct : riskPct * 0.5) / 100;   // Tier B trades at half size
    let qty = Math.floor((equity * riskFrac) / riskPerShare);
    qty = Math.min(qty, Math.floor(availCash / entry));         // cash only — no margin, no double-spend
    qty = Math.min(qty, Math.floor((equity * 0.20) / entry));   // ≤20% of equity in any one name
    if (qty < 1) continue;
    const order = {
      symbol: r.symbol, qty: String(qty), side: "buy", type: "market", time_in_force: "day",
      order_class: "bracket",
      take_profit: { limit_price: String(target) },
      stop_loss: { stop_price: String(+stop.toFixed(2)) },
      // Idempotency: one buy per symbol per day — a retry can't duplicate it.
      client_order_id: `sap-${r.symbol}-${new Date().toISOString().slice(0, 10)}`,
    };
    const res = await apca("/v2/orders", "POST", order);
    if (res && res.ok) {
      slots--; placed++; availCash -= qty * entry; sectorCount[sec] = (sectorCount[sec] || 0) + 1;
      // Journal the setup tags so we can later see which setups actually win.
      appendJournal({ ts: Date.now(), symbol: r.symbol, tier: r.tier, side: "long", qty,
        entry, stop, target, passCount: r.passCount, rsRating: r.rsRating || null, source: "server" });
      if (isConfigured()) sendTelegramMessage(
        `🤖 SERVER AUTOPILOT — BUY ${r.symbol} (Tier ${r.tier})\n${qty} sh @ ~$${entry} (paper · bracket)\nStop $${stop} · Target $${target}\n(no browser needed · ${(riskFrac * 100).toFixed(2)}% risk)`
      ).catch(() => {});
    }
  }
  if (placed) console.log(`[Server autopilot] placed ${placed} order(s)`);
}

module.exports = { runServerAutopilot };
