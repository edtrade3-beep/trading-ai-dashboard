// lightbox-autopilot-execute.js — real ASSIST order execution for the
// Light Box day-trade Autopilot (explicit user request, 2026-08-23: "Build
// real order execution... ASSIST only... Alpaca paper"). Deliberately its
// own file with its own small apca() helper, own risk-state store — same
// "three autopilot systems stay separate" discipline server-autopilot.js/
// autopilot-store.js's own header comments already establish, rather than
// sharing state with server-autopilot.js's swing positions.
//
// SCOPE: LONG entries only. Investigation before this file was written
// found Light Box's "SELL" state is actually "SELL / EXIT" (see
// LightBoxCard.jsx) — an exit/avoid signal, not a real short-entry signal
// — and day-trade-calc.js's stop/target/bestEntry formulas are long-only
// math regardless of direction. Building real order placement on top of
// that would place backwards-shaped short brackets. Explicit user choice:
// ship LONG-only now; SHORT stays alert-only until that's fixed as its
// own task.
//
// SAFETY: every real order requires the user's own tap (ASSIST mode +
// this module is only ever called from a real API request, never from
// the background tick) — see routes/autopilot.js's /execute route.
// Fails closed on every real check below: wrong mode, market closed,
// missing/invalid signal state, already-executed, unhealthy account,
// daily/weekly/drawdown breaker tripped, already holding the symbol,
// too many open Light-Box positions, open risk ceiling, or a sizing
// formula that can't produce at least 1 real share.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { sendTelegramMessage, isConfigured } = require("./telegram");
const { appendJournal } = require("./autopilot-journal");
const { fetchAlpacaQuotes } = require("./providers/alpaca-data");
const {
  isMarketHoursET, weekAnchorET, checkAccountHealth, dailyLossBreakerTripped,
  weeklyLossBreakerTripped, totalDrawdownBreakerTripped, openRiskPct, sizePositionByRisk,
} = require("./risk-guardrails");
const {
  getMode, getPosition, upsertPosition, logActivity,
  getLastFlattenDate, setLastFlattenDate, incrementDailyTrades,
} = require("./autopilot-store");

const CLIENT_ORDER_PREFIX = "lba-"; // "Light Box Autopilot" — real idempotency + real ownership marker on every order this file places
const APCA = "https://paper-api.alpaca.markets";

function keys() {
  return {
    id: process.env.ALPACA_KEY_ID || process.env.ALPACA_API_KEY_ID || "",
    secret: process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET_KEY || "",
  };
}
async function apca(reqPath, method = "GET", body = null) {
  const { id, secret } = keys();
  if (!id || !secret) return null;
  try {
    const r = await fetch(`${APCA}${reqPath}`, {
      method,
      headers: { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data: j };
  } catch { return null; }
}

const RISK_STATE_PATH = path.join(ROOT, "data", "lightbox-autopilot-risk-state.json");
const DEFAULT_RISK_STATE = { weekAnchorDate: "", weekStartEquity: 0, peakEquity: 0 };
function readRiskState() { return { ...DEFAULT_RISK_STATE, ...readJsonSafe(RISK_STATE_PATH, null) }; }
function writeRiskState(state) { writeJsonAtomic(RISK_STATE_PATH, state); }

function todayET() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

// Every real check an order must clear before it's placed — shared by
// preview (dry run, no order) and execute (real order) so the number the
// user confirms against is computed by the exact same real code path that
// then places the order, never a separately-hand-rolled estimate.
async function validateAndSize(symbol) {
  const mode = getMode();
  if (mode !== "ASSIST") return { ok: false, error: `Autopilot must be in ASSIST mode (currently ${mode}).` };
  if (!isMarketHoursET()) return { ok: false, error: "Market is closed (9:35 AM–3:55 PM ET only)." };

  const position = getPosition(symbol);
  if (!position) return { ok: false, error: "No real Light Box signal on file for this symbol." };
  if (position.direction !== "LONG") return { ok: false, error: "Only LONG entries support real order execution right now — SHORT stays alert-only (see this file's header)." };
  if (position.state !== "ENTRY_READY") return { ok: false, error: `Signal is ${position.state}, not ENTRY_READY — nothing to execute.` };
  if (position.orderId && position.orderPlacedForTs === position.detectedAt) {
    return { ok: false, error: `An order was already placed for this signal (order ${position.orderId}).` };
  }

  const { id, secret } = keys();
  if (!id || !secret) return { ok: false, error: "Alpaca isn't configured." };

  const acctR = await apca("/v2/account");
  if (!acctR || !acctR.ok) return { ok: false, error: "Couldn't read the real Alpaca account." };
  const acct = acctR.data;
  const equity = Number(acct.equity) || 0;
  const lastEq = Number(acct.last_equity) || equity;
  const cash = Math.max(0, Number(acct.cash) || 0);
  const health = checkAccountHealth({ equity, cash: Number(acct.cash) || 0, tradingBlocked: acct.trading_blocked, accountBlocked: acct.account_blocked });
  if (!health.ok) return { ok: false, error: `Account not healthy: ${health.reason}.` };

  const maxLossPct = Number(process.env.LIGHTBOX_AUTOPILOT_DAILY_MAXLOSS) || 2;
  if (dailyLossBreakerTripped({ equity, startOfDayEquity: lastEq, maxLossPct })) {
    return { ok: false, error: `Daily loss breaker tripped (−${maxLossPct}%) — no new entries today.` };
  }

  const riskState = readRiskState();
  const weekAnchor = weekAnchorET();
  if (riskState.weekAnchorDate !== weekAnchor) { riskState.weekAnchorDate = weekAnchor; riskState.weekStartEquity = equity; }
  if (equity > (riskState.peakEquity || 0)) riskState.peakEquity = equity;
  writeRiskState(riskState);
  const weeklyMaxLossPct = Number(process.env.LIGHTBOX_AUTOPILOT_WEEKLY_MAXLOSS) || 5;
  const maxDrawdownPct = Number(process.env.LIGHTBOX_AUTOPILOT_MAX_DRAWDOWN) || 15;
  if (weeklyLossBreakerTripped({ equity, weekStartEquity: riskState.weekStartEquity, maxLossPct: weeklyMaxLossPct })) {
    return { ok: false, error: `Weekly loss breaker tripped (−${weeklyMaxLossPct}%) — no new entries this week.` };
  }
  if (totalDrawdownBreakerTripped({ equity, peakEquity: riskState.peakEquity, maxDrawdownPct })) {
    return { ok: false, error: `Total drawdown breaker tripped (−${maxDrawdownPct}% off peak) — no new entries.` };
  }

  const posR = await apca("/v2/positions");
  const positions = (posR && posR.ok && Array.isArray(posR.data)) ? posR.data : [];
  if (positions.some((p) => p.symbol === symbol)) {
    return { ok: false, error: `Already holding a position in ${symbol}.` };
  }
  const ordR = await apca("/v2/orders?status=open&limit=200");
  const openOrders = (ordR && ordR.ok && Array.isArray(ordR.data)) ? ordR.data : [];
  const ownOpenOrders = openOrders.filter((o) => String(o.client_order_id || "").startsWith(CLIENT_ORDER_PREFIX));
  const maxPos = Number(process.env.LIGHTBOX_AUTOPILOT_MAXPOS) || 3;
  if (ownOpenOrders.length >= maxPos) {
    return { ok: false, error: `Already at the Light Box Autopilot position cap (${maxPos}).` };
  }
  const normPositions = positions.map((p) => ({ symbol: p.symbol, qty: p.qty, avgEntryPrice: p.avg_entry_price }));
  const maxRiskPct = Number(process.env.LIGHTBOX_AUTOPILOT_MAXRISK) || 3;
  if (openRiskPct({ positions: normPositions, equity }) >= maxRiskPct) {
    return { ok: false, error: `Open-risk ceiling reached (≥${maxRiskPct}% of equity across all real open positions).` };
  }

  // Real, current price (Alpaca's own latest trade, the same broker about
  // to fill the order) — not the stale bestEntry captured at detection
  // time, which may be several ticks old.
  const quotes = await fetchAlpacaQuotes([symbol]);
  const currentPrice = Number(quotes?.[0]?.price) || 0;
  if (!(currentPrice > 0)) return { ok: false, error: "No real current price available." };

  const stop = Number(position.stop);
  const target = Number(position.target);
  if (!(stop > 0) || !(currentPrice > stop)) return { ok: false, error: "Real stop isn't valid for a LONG entry at the current price — refusing to size blind." };

  const riskPct = Number(process.env.LIGHTBOX_AUTOPILOT_RISK) || 0.5; // % of equity per day-trade entry — deliberately smaller than the swing system's 1%
  const qty = sizePositionByRisk({ equity, riskPct, entry: currentPrice, stop, availCash: cash, maxNamePct: 10 });
  if (qty < 1) return { ok: false, error: "Real sizing came out to 0 shares (equity/risk too small for this stop distance) — refusing to place a 0-share order." };

  return {
    ok: true, symbol, position, qty, entry: currentPrice, stop, target,
    riskPct, riskDollars: +(qty * (currentPrice - stop)).toFixed(2),
    estCost: +(qty * currentPrice).toFixed(2),
  };
}

// Real preview, zero side effects — no order placed. What the ASSIST
// confirm UI shows the user before they tap a second time.
async function previewOrder(symbol) {
  const v = await validateAndSize(symbol);
  if (!v.ok) return v;
  const { position, ...rest } = v;
  return { ok: true, ...rest };
}

// Real order placement. Re-runs the exact same validateAndSize as preview
// (never trusts client-supplied qty/price) so nothing can go stale between
// the preview tap and the confirm tap.
async function placeOrder(symbol) {
  const v = await validateAndSize(symbol);
  if (!v.ok) return v;
  const { position, qty, entry, stop, target, riskPct } = v;

  const clientOrderId = `${CLIENT_ORDER_PREFIX}${symbol}-${Date.now()}`;
  const order = {
    symbol, qty: String(qty), side: "buy", type: "market", time_in_force: "day",
    order_class: "bracket",
    take_profit: { limit_price: String(target) },
    stop_loss: { stop_price: String(+stop.toFixed(2)) },
    client_order_id: clientOrderId,
  };
  const res = await apca("/v2/orders", "POST", order);
  if (!res || !res.ok) {
    return { ok: false, error: `Alpaca rejected the order${res?.data?.message ? `: ${res.data.message}` : "."}` };
  }

  upsertPosition(symbol, {
    orderId: res.data?.id || clientOrderId,
    orderPlacedForTs: position.detectedAt,
    orderQty: qty, orderEntry: entry,
  });
  logActivity({ symbol, state: "ORDER_PLACED", direction: "LONG", quality: position.quality, note: `Real ASSIST order — ${qty} sh @ ~$${entry} (paper · bracket, stop $${stop.toFixed(2)}, target $${target.toFixed(2)})` });
  appendJournal({ ts: Date.now(), symbol, tier: "DAYTRADE", side: "long", qty, entry, stop, target, source: "lightbox-assist" });
  incrementDailyTrades();
  if (isConfigured()) {
    sendTelegramMessage(
      `✅ LIGHT BOX AUTOPILOT — ORDER PLACED (${symbol})\n${qty} sh @ ~$${entry.toFixed(2)} (paper · bracket)\nStop $${stop.toFixed(2)} · Target $${target.toFixed(2)}\n(${riskPct}% risk · you confirmed this in-app)`
    ).catch(() => {});
  }
  return { ok: true, symbol, qty, entry, stop, target, orderId: res.data?.id || clientOrderId };
}

// Real end-of-day flatten — closes any still-open position this module
// itself opened (client_order_id prefix lba-) once per real trading day,
// in a 15:50–16:10 ET window. Deliberately narrower/later than
// isMarketHoursET's own 9:35–15:55 cutoff and called BEFORE that
// gate in autopilot-tick.js, so a position opened right before the close
// still gets flattened even though the rest of that tick's normal
// detection logic is about to skip (outside market hours). Scoped to
// Light-Box-opened positions only — never touches server-autopilot.js's
// swing positions, which share the same real Alpaca paper account.
async function maybeFlattenEndOfDay() {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); if (day < 1 || day > 5) return { ok: true, skipped: "weekend" };
  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins < 15 * 60 + 50 || mins > 16 * 60 + 10) return { ok: true, skipped: "outside flatten window" };

  const today = todayET();
  if (getLastFlattenDate() === today) return { ok: true, skipped: "already flattened today" };

  const { id, secret } = keys();
  if (!id || !secret) { setLastFlattenDate(today); return { ok: true, skipped: "Alpaca not configured" }; }

  const posR = await apca("/v2/positions");
  const positions = (posR && posR.ok && Array.isArray(posR.data)) ? posR.data : [];
  const ordR = await apca("/v2/orders?status=open&limit=200");
  const openOrders = (ordR && ordR.ok && Array.isArray(ordR.data)) ? ordR.data : [];
  const ownSymbols = new Set(
    openOrders.filter((o) => String(o.client_order_id || "").startsWith(CLIENT_ORDER_PREFIX)).map((o) => o.symbol)
  );

  let flattened = 0;
  for (const p of positions) {
    if (!ownSymbols.has(p.symbol)) continue; // not opened by this module — never touch server-autopilot.js's swing positions
    const res = await apca(`/v2/positions/${encodeURIComponent(p.symbol)}`, "DELETE");
    if (res && res.ok) {
      flattened++;
      logActivity({ symbol: p.symbol, state: "FLATTENED", direction: "LONG", note: "Real end-of-day flatten (Light Box day trade, held to close)." });
    }
  }
  setLastFlattenDate(today);
  if (flattened && isConfigured()) {
    sendTelegramMessage(`🕒 LIGHT BOX AUTOPILOT — flattened ${flattened} real day-trade position(s) at the close.`).catch(() => {});
  }
  return { ok: true, flattened };
}

module.exports = { previewOrder, placeOrder, maybeFlattenEndOfDay, CLIENT_ORDER_PREFIX };
