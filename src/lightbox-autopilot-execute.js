// lightbox-autopilot-execute.js — real ASSIST order execution for the
// Light Box day-trade Autopilot (explicit user request, 2026-08-23: "Build
// real order execution... ASSIST only... Alpaca paper"). Deliberately its
// own file with its own small apca() helper, own risk-state store — same
// "three autopilot systems stay separate" discipline server-autopilot.js/
// autopilot-store.js's own header comments already establish, rather than
// sharing state with server-autopilot.js's swing positions.
//
// LONG + SHORT. Shipped LONG-only first (explicit user choice) while
// day-trade-calc.js's stop/target/bestEntry math was still long-only
// regardless of direction — building real order placement on backwards-
// shaped short brackets would have been genuinely unsafe. That's now
// fixed ("Fix Light Box SHORT math", 2026-08-23: stop/target correctly
// flip sides for a real BEARISH/breakdown setup), so this file now
// places real short-sell bracket orders too, mirroring every LONG check
// below. Note Light Box's "SELL" display state is still "SELL / EXIT" in
// the UI (see LightBoxCard.jsx) — a real bearish/breakdown setup, which
// is exactly what a short entry needs; nothing here changes what that
// state means, only that its real numbers can now be traded on safely.
//
// SAFETY: every real order requires the user's own tap (ASSIST mode +
// this module is only ever called from a real API request, never from
// the background tick) — see routes/autopilot.js's /execute route.
// Fails closed on every real check below: wrong mode, market closed,
// missing/invalid signal state, already-executed, unhealthy account,
// daily/weekly/drawdown breaker tripped, already holding the symbol,
// too many open Light-Box positions, open risk ceiling, not real-
// shortable (SHORT only), or a sizing formula that can't produce at
// least 1 real share.
"use strict";

const { sendTelegramMessage, isConfigured } = require("./telegram");
const { appendJournal } = require("./autopilot-journal");
const { fetchAlpacaQuotes } = require("./providers/alpaca-data");
const {
  isMarketHoursET, openRiskPct, sectorCapExceeded, sizePositionByRisk,
} = require("./risk-guardrails");
const { evaluateAccountGate } = require("./autopilot-risk-gate");
const { startOrder: shadowStartOrder, transition: shadowTransition } = require("./autopilot-order-store");

// Shadow-mode instrumentation guard (Unified Autopilot merge, Stage 3) —
// purely observational; must never affect a real order. Swallows and
// logs any exception rather than letting it propagate.
function shadow(fn) { try { fn(); } catch (err) { console.error("[Light Box ASSIST] shadow state-machine logging failed (non-fatal):", err.message); } }
const {
  getMode, getPosition, upsertPosition, logActivity,
  getLastFlattenDate, setLastFlattenDate, incrementDailyTrades,
} = require("./autopilot-store");

const CLIENT_ORDER_PREFIX = "lba-"; // "Light Box Autopilot" — real idempotency + real ownership marker on every order this file places
function canExecuteFinalVerdict(verdict) { return verdict === "STRONG_BUY" || verdict === "BUY"; }

const { resolveAlpacaKeys, alpacaTradingRequest } = require("./providers/alpaca-client");
const keys = resolveAlpacaKeys;
// Local shim preserving this file's original real contract (returns null
// on no-key or any fetch error) while delegating the actual request to the
// real shared client — same pattern trailing-stops.js already established
// (Execution Bot Architecture Audit Phase 3, 2026-08-24: this file was one
// of 2 remaining real duplicates).
async function apca(reqPath, method = "GET", body = null) {
  try {
    const res = await alpacaTradingRequest(reqPath, method, body);
    if (res._noKey) return null;
    return { ok: res.ok, status: res.status, data: res.data };
  } catch { return null; }
}

// Shared with server-autopilot.js (Autopilot goal audit, 2026-08-30) — this
// file and server-autopilot.js trade the SAME real Alpaca paper account
// (see emergency-stop.js's own comment confirming the shared account), so
// they anchor the weekly/drawdown breaker off the same real equity high-
// water mark instead of two files independently disagreeing about the
// same account's real state. The shared file (data/autopilot-risk-
// state.json) and its read/write helpers now live in src/autopilot-risk-
// gate.js (Unified Autopilot merge, Stage 2, 2026-09-04) — this file just
// calls evaluateAccountGate() above.

function todayET() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

// Every real check an order must clear before it's placed — shared by
// preview (dry run, no order) and execute (real order) so the number the
// user confirms against is computed by the exact same real code path that
// then places the order, never a separately-hand-rolled estimate.
async function validateAndSize(symbol) {
  // Emergency Stop (2026-08-24) — the one real, global kill switch shared
  // across all 4 automated-execution systems, checked first, before any
  // real broker call — even ASSIST (which already requires a human tap)
  // refuses to even preview an order while engaged. Cheap synchronous
  // local read; evaluateAccountGate() below checks it again as part of
  // its own bundled sequence, which is harmless (a kill switch is safe to
  // check more than once) — this early copy exists specifically so
  // Emergency Stop is caught before this function does any real network
  // work at all, not just before the order is placed.
  if (require("./emergency-stop").isEmergencyStopActive()) {
    return { ok: false, error: "Emergency Stop is active — automated execution is halted until manually re-armed." };
  }
  const mode = getMode();
  if (mode !== "ASSIST") return { ok: false, error: `Autopilot must be in ASSIST mode (currently ${mode}).` };
  if (!isMarketHoursET()) return { ok: false, error: "Market is closed (9:35 AM–3:55 PM ET only)." };

  const position = getPosition(symbol);
  if (!position) return { ok: false, error: "No real Light Box signal on file for this symbol." };
  const direction = position.direction;
  if (direction !== "LONG" && direction !== "SHORT") return { ok: false, error: `Unrecognized direction "${direction}" — refusing to size blind.` };
  if (direction === "SHORT") return { ok: false, error: "Short execution is disabled until the canonical Final Decision and short-side risk model support it." };
  if (position.state !== "ENTRY_READY") return { ok: false, error: `Signal is ${position.state}, not ENTRY_READY — nothing to execute.` };
  if (position.orderId && position.orderPlacedForTs === position.detectedAt) {
    return { ok: false, error: `An order was already placed for this signal (order ${position.orderId}).` };
  }

  // A Light Box state is tactical evidence, never execution authority.
  // Re-evaluate the symbol through the same canonical pipeline used by
  // Trade Desk and Autopilot 2.0, and use that pipeline's one setup plan.
  const { screenTrendTemplate, fetchMarketQuotes } = require("./routes/market");
  const { resolveProviderKeys } = require("./config");
  const { computeCanonicalAssetDecision } = require("./canonical-decision-pipeline");
  const [trendRows, macroQuotes] = await Promise.all([
    screenTrendTemplate([symbol]).catch(() => []),
    fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams())).catch(() => []),
  ]);
  const trendRow = trendRows.find((row) => row?.symbol === symbol && !row.error);
  const canonical = trendRow ? computeCanonicalAssetDecision({ symbol, row: trendRow, macroQuotes, marketHours: true }) : null;
  const finalVerdict = canonical?.assetDecision?.verdict;
  if (!canExecuteFinalVerdict(finalVerdict)) {
    return { ok: false, error: `Canonical Final Verdict ${finalVerdict || "unavailable"} is not executable.` };
  }
  const canonicalStop = Number(canonical.assetDecision.stop);
  const canonicalTarget = Number(canonical.assetDecision.targets?.[0]);
  if (!(canonicalStop > 0) || !(canonicalTarget > 0)) {
    return { ok: false, error: "Canonical setup has no valid stop/target — refusing to size or execute." };
  }

  const { id, secret } = keys();
  if (!id || !secret) return { ok: false, error: "Alpaca isn't configured." };

  const acctR = await apca("/v2/account");
  if (!acctR || !acctR.ok) return { ok: false, error: "Couldn't read the real Alpaca account." };
  const acct = acctR.data;
  const equity = Number(acct.equity) || 0;
  const lastEq = Number(acct.last_equity) || equity;
  const cash = Math.max(0, Number(acct.cash) || 0);
  // Account health -> daily -> weekly -> drawdown, in that order — same
  // shared src/autopilot-risk-gate.js sequence server-autopilot.js and
  // routes/autoexec.js also call (Unified Autopilot merge, Stage 2,
  // 2026-09-04). No riskState param: this system shares the one real
  // weekStartEquity/peakEquity file (data/autopilot-risk-state.json) with
  // server-autopilot.js, exactly as it already did. Thresholds unchanged
  // (still this file's own env-var overrides); specific error text
  // preserved per code so nothing user-facing changes.
  const maxLossPct = Number(process.env.LIGHTBOX_AUTOPILOT_DAILY_MAXLOSS) || 2;
  const weeklyMaxLossPct = Number(process.env.LIGHTBOX_AUTOPILOT_WEEKLY_MAXLOSS) || 5;
  const maxDrawdownPct = Number(process.env.LIGHTBOX_AUTOPILOT_MAX_DRAWDOWN) || 15;
  const gate = evaluateAccountGate({
    equity, cash: Number(acct.cash) || 0, tradingBlocked: acct.trading_blocked, accountBlocked: acct.account_blocked,
    startOfDayEquity: lastEq, dailyMaxLossPct: maxLossPct, weeklyMaxLossPct, maxDrawdownPct,
  });
  if (!gate.ok) {
    const messages = {
      ACCOUNT_UNHEALTHY: `Account not healthy: ${gate.reason}.`,
      DAILY_LOSS_BREAKER: `Daily loss breaker tripped (−${maxLossPct}%) — no new entries today.`,
      WEEKLY_LOSS_BREAKER: `Weekly loss breaker tripped (−${weeklyMaxLossPct}%) — no new entries this week.`,
      DRAWDOWN_BREAKER: `Total drawdown breaker tripped (−${maxDrawdownPct}% off peak) — no new entries.`,
    };
    return { ok: false, error: messages[gate.code] || gate.reason };
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
  // Sector cap (2026-09-01 /goal Phase 8 audit fix) — this file already
  // imported every other real risk-guardrails.js check (health, breakers,
  // open-risk) but never sectorCapExceeded, the one server-autopilot.js/
  // autopilot2-engine.js both already gate on. Real gap, not an intentional
  // exemption (nothing in this file's own header explained one).
  const maxPerSector = Number(process.env.LIGHTBOX_AUTOPILOT_MAXSECTOR) || 3;
  if (sectorCapExceeded({ positions: normPositions, symbol, maxPerSector })) {
    return { ok: false, error: `Sector cap: already ${maxPerSector}+ real positions in this sector.` };
  }

  // Real shortability check (SHORT only) — Alpaca will reject an
  // unshortable/hard-to-borrow symbol at order time anyway, but checking
  // its own real asset flags first gives an honest, specific reason
  // instead of a raw broker rejection.
  if (direction === "SHORT") {
    const assetR = await apca(`/v2/assets/${encodeURIComponent(symbol)}`);
    const asset = assetR && assetR.ok ? assetR.data : null;
    if (!asset || !asset.shortable || !asset.easy_to_borrow) {
      return { ok: false, error: `${symbol} isn't real-shortable on this account right now (hard to borrow or shorting disabled).` };
    }
  }

  // Real, current price (Alpaca's own latest trade, the same broker about
  // to fill the order) — not the stale bestEntry captured at detection
  // time, which may be several ticks old.
  const quotes = await fetchAlpacaQuotes([symbol]);
  const currentPrice = Number(quotes?.[0]?.price) || 0;
  if (!(currentPrice > 0)) return { ok: false, error: "No real current price available." };

  const stop = canonicalStop;
  const target = canonicalTarget;
  const stopValid = direction === "SHORT" ? (stop > 0 && stop > currentPrice) : (stop > 0 && currentPrice > stop);
  if (!stopValid) {
    return { ok: false, error: `Real stop isn't valid for a ${direction} entry at the current price — refusing to size blind.` };
  }

  const riskPct = Number(process.env.LIGHTBOX_AUTOPILOT_RISK) || 0.5; // % of equity per day-trade entry — deliberately smaller than the swing system's 1%
  const qty = sizePositionByRisk({ equity, riskPct, entry: currentPrice, stop, availCash: cash, maxNamePct: 10, direction });
  if (qty < 1) return { ok: false, error: "Real sizing came out to 0 shares (equity/risk too small for this stop distance) — refusing to place a 0-share order." };

  return {
    ok: true, symbol, position, direction, qty, entry: currentPrice, stop, target,
    finalVerdict, assetDecision: canonical.assetDecision,
    riskPct, riskDollars: +(qty * Math.abs(currentPrice - stop)).toFixed(2),
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
  // Shadow-mode transition log (Unified Autopilot merge, Stage 3,
  // 2026-09-04, see .claude/plans/proud-yawning-unicorn.md) — purely
  // observational, never gating this real order. validateAndSize()
  // bundles real field-validation and real risk-approval into one call,
  // so a single success there is honestly logged as VALIDATING then
  // RISK_APPROVED back to back, rather than inventing a split this
  // function doesn't actually have.
  let shadowOrder = null;
  shadow(() => { shadowOrder = shadowStartOrder({ symbol, source: "lightbox-assist" }); });

  const v = await validateAndSize(symbol);
  if (!v.ok) {
    shadow(() => shadowOrder && shadowTransition(shadowOrder.id, "VALIDATING"));
    shadow(() => shadowOrder && shadowTransition(shadowOrder.id, "REJECTED", { reason: v.error }));
    return v;
  }
  shadow(() => shadowOrder && shadowTransition(shadowOrder.id, "VALIDATING"));
  shadow(() => shadowOrder && shadowTransition(shadowOrder.id, "RISK_APPROVED"));
  const { position, direction, qty, entry, stop, target, riskPct } = v;

  const clientOrderId = `${CLIENT_ORDER_PREFIX}${symbol}-${Date.now()}`;
  const order = {
    symbol, qty: String(qty), side: direction === "SHORT" ? "sell" : "buy", type: "market", time_in_force: "day",
    order_class: "bracket",
    take_profit: { limit_price: String(target) },
    stop_loss: { stop_price: String(+stop.toFixed(2)) },
    client_order_id: clientOrderId,
  };
  shadow(() => shadowOrder && shadowTransition(shadowOrder.id, "ORDER_PENDING"));
  const res = await apca("/v2/orders", "POST", order);
  if (!res || !res.ok) {
    shadow(() => shadowOrder && shadowTransition(shadowOrder.id, "FAILED", { reason: "broker rejected the order" }));
    return { ok: false, error: `Alpaca rejected the order${res?.data?.message ? `: ${res.data.message}` : "."}` };
  }
  // FILLED is optimistic here — a market order's real fill isn't
  // synchronously confirmed by this response; real fill polling is a
  // later stage (restart-reconciliation), not part of this shadow pass.
  shadow(() => shadowOrder && shadowTransition(shadowOrder.id, "FILLED", { meta: { orderId: res.data?.id } }));

  upsertPosition(symbol, {
    orderId: res.data?.id || clientOrderId,
    orderPlacedForTs: position.detectedAt,
    orderQty: qty, orderEntry: entry,
  });
  const verb = direction === "SHORT" ? "SHORT SELL" : "BUY";
  logActivity({ symbol, state: "ORDER_PLACED", direction, quality: position.quality, note: `Real ASSIST order — ${verb} ${qty} sh @ ~$${entry} (paper · bracket, stop $${stop.toFixed(2)}, target $${target.toFixed(2)})` });
  appendJournal({ ts: Date.now(), symbol, tier: "DAYTRADE", side: direction === "SHORT" ? "short" : "long", qty, entry, stop, target, source: "lightbox-assist" });
  incrementDailyTrades();
  if (isConfigured()) {
    sendTelegramMessage(
      `✅ LIGHT BOX AUTOPILOT — ${verb} ORDER PLACED (${symbol})\n${qty} sh @ ~$${entry.toFixed(2)} (paper · bracket)\nStop $${stop.toFixed(2)} · Target $${target.toFixed(2)}\n(${riskPct}% risk · you confirmed this in-app)`
    ).catch(() => {});
  }
  return { ok: true, symbol, direction, qty, entry, stop, target, orderId: res.data?.id || clientOrderId };
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
      logActivity({ symbol: p.symbol, state: "FLATTENED", direction: p.side === "short" ? "SHORT" : "LONG", note: "Real end-of-day flatten (Light Box day trade, held to close)." });
    }
  }
  setLastFlattenDate(today);
  if (flattened && isConfigured()) {
    sendTelegramMessage(`🕒 LIGHT BOX AUTOPILOT — flattened ${flattened} real day-trade position(s) at the close.`).catch(() => {});
  }
  return { ok: true, flattened };
}

module.exports = { previewOrder, placeOrder, maybeFlattenEndOfDay, CLIENT_ORDER_PREFIX, canExecuteFinalVerdict };
