// Alpaca PAPER trading bridge — keys stay server-side, orders go to the paper API only.
// Set ALPACA_KEY_ID and ALPACA_SECRET_KEY in the environment (use PAPER keys).
const { writeJson } = require("../utils");
const { tierStats, appendJournal, readJournal } = require("../autopilot-journal");
const { computeLearningGates } = require("../learning-engine");
const { sectorOf } = require("../risk-guardrails");
const { resolveAlpacaKeys, alpacaTradingRequest } = require("../providers/alpaca-client");

// keys()/alpaca() now thin aliases over the real shared client
// (src/providers/alpaca-client.js) — extracted 2026-07 after finding this
// exact same real logic independently duplicated 3x across this file,
// trailing-stops.js, and providers/alpaca-data.js (Quick Trade Engine
// build). Every call site below is unchanged — the shared client returns
// the identical {_ok, _status, data, _noKey} shape this file already reads.
const keys = resolveAlpacaKeys;
const alpaca = alpacaTradingRequest;

async function readBody(req) {
  let body = ""; for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || "{}"); } catch { return {}; }
}

// Closed round-trip trades with realized P&L — built from FILL activities via FIFO matching.
// Shared by /api/alpaca/closed-trades and /api/alpaca/tier-stats so the FIFO logic lives once.
async function getClosedTrades() {
  // Alpaca caps the activities endpoint at 100 per page — page through (newest first) up to ~500 fills.
  let raw = [];
  let pageToken = null;
  for (let page = 0; page < 5; page++) {
    const qs = `/v2/account/activities?activity_types=FILL&page_size=100&direction=desc${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`;
    const a = await alpaca(qs);
    if (!a._ok) {
      if (page === 0) return { ok: false, trades: [], error: a.data?.message || "activities error" };
      break; // keep what we have if a later page fails
    }
    const batch = Array.isArray(a.data) ? a.data : [];
    raw = raw.concat(batch);
    if (batch.length < 100) break;          // last page
    pageToken = batch[batch.length - 1].id;  // next page starts after the last id
  }
  const fills = raw
    .map(f => ({ symbol: f.symbol, side: f.side, qty: Math.abs(Number(f.qty) || 0), price: Number(f.price) || 0, at: f.transaction_time }))
    .filter(f => f.symbol && f.qty > 0 && f.price > 0)
    .sort((x, y) => new Date(x.at) - new Date(y.at)); // oldest first

  // FIFO match: opens (buy for long, sell_short for short) vs closes. Produce realized round trips.
  const lots = {};   // symbol -> array of open lots { qty, price, side:'long'|'short', at }
  const trades = [];
  for (const f of fills) {
    const sym = f.symbol;
    lots[sym] = lots[sym] || [];
    const open = lots[sym];
    const isBuy = f.side === "buy";
    // Determine if this fill opens or closes against existing inventory.
    const opposite = open.length && ((isBuy && open[0].side === "short") || (!isBuy && open[0].side === "long"));
    if (!open.length || !opposite) {
      open.push({ qty: f.qty, price: f.price, side: isBuy ? "long" : "short", at: f.at });
      continue;
    }
    let remaining = f.qty;
    while (remaining > 0 && open.length && ((isBuy && open[0].side === "short") || (!isBuy && open[0].side === "long"))) {
      const lot = open[0];
      const matched = Math.min(remaining, lot.qty);
      const entry = lot.price, exit = f.price;
      const pnl = lot.side === "long" ? (exit - entry) * matched : (entry - exit) * matched;
      trades.push({ symbol: sym, side: lot.side, qty: matched, entry, exit, pnl, openedAt: lot.at, closedAt: f.at });
      lot.qty -= matched; remaining -= matched;
      if (lot.qty <= 1e-9) open.shift();
    }
    if (remaining > 0) open.push({ qty: remaining, price: f.price, side: isBuy ? "long" : "short", at: f.at });
  }
  trades.sort((x, y) => new Date(y.closedAt) - new Date(x.closedAt)); // newest first
  return { ok: true, trades };
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
        lastEquity: Number(d.last_equity),  // prior close — for today's change
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

  // Closed round-trip trades with realized P&L — built from FILL activities via FIFO matching.
  // Powers the My Trades "report card" (win rate, expectancy, edge check) on real Alpaca fills,
  // and the tier-stats endpoint below (which joins these against the setup-tagged journal).
  if (pathname === "/api/alpaca/closed-trades" && req.method === "GET") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key", trades: [] });
    const { ok, trades, error } = await getClosedTrades();
    if (!ok) return writeJson(res, 200, { ok: false, trades: [], error });
    return writeJson(res, 200, { ok: true, trades });
  }

  // Per-setup-tier win rate — joins closed trades against the tagged journal
  // (autopilot-journal.js) via tierStats(), so you can see which tiers/setups
  // actually make money vs which just look good. Powers the My Trades tier
  // breakdown; same join Telegram's weekly/monthly AI reviews already use.
  if (pathname === "/api/alpaca/tier-stats" && req.method === "GET") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key", tiers: [] });
    const { ok, trades, error } = await getClosedTrades();
    if (!ok) return writeJson(res, 200, { ok: false, tiers: [], error });
    const byTier = tierStats(trades);
    const tiers = Object.entries(byTier).map(([tier, s]) => ({
      tier,
      n: s.n,
      wins: s.wins,
      winRate: s.n ? Math.round((s.wins / s.n) * 100) : 0,
      pnl: Math.round(s.pnl),
      avgR: s.rN ? +(s.rSum / s.rN).toFixed(2) : null,
    })).sort((a, b) => (b.avgR ?? -Infinity) - (a.avgR ?? -Infinity));
    return writeJson(res, 200, { ok: true, tiers, totalTrades: trades.length });
  }

  // Learning Engine — real tier/sector allow-gates derived from the same
  // closed-trade + setup-tagged-journal join as tier-stats above, via
  // src/learning-engine.js. Read by both autopilot buy loops (server-side
  // directly; the client fetches this route) before opening new positions —
  // this is the actual "use these statistics to improve future rankings"
  // feedback loop the Green Light AI spec asks for. Cut-only: a tier/sector
  // can only ever be paused by a real, sufficiently-sampled losing edge,
  // never boosted by a good streak.
  if (pathname === "/api/alpaca/learning-gates" && req.method === "GET") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key", tierGates: {}, sectorGates: {} });
    const { ok, trades, error } = await getClosedTrades();
    if (!ok) return writeJson(res, 200, { ok: false, tierGates: {}, sectorGates: {}, error });
    const { tierGates, sectorGates } = computeLearningGates(trades);
    return writeJson(res, 200, { ok: true, tierGates, sectorGates, totalTrades: trades.length });
  }

  if (pathname === "/api/alpaca/positions" && req.method === "GET") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key", positions: [] });
    const a = await alpaca("/v2/positions");
    if (!a._ok) return writeJson(res, 200, { ok: false, positions: [], error: a.data?.message });
    // Positions don't carry an open time — derive it from the most recent OPENING fill per symbol.
    const openedAt = {};
    try {
      const act = await alpaca("/v2/account/activities?activity_types=FILL&page_size=100&direction=desc");
      if (act._ok && Array.isArray(act.data)) {
        for (const f of act.data) {                       // newest first → first match = latest entry
          const sym = f.symbol; if (!sym || openedAt[sym]) continue;
          openedAt[sym] = f.transaction_time;
        }
      }
    } catch { /* best-effort */ }
    const positions = (a.data || []).map(p => ({
      symbol: p.symbol, qty: Number(p.qty), avgEntry: Number(p.avg_entry_price),
      current: Number(p.current_price), marketValue: Number(p.market_value),
      unrealizedPL: Number(p.unrealized_pl), unrealizedPLpc: Number(p.unrealized_plpc) * 100, side: p.side,
      openedAt: openedAt[p.symbol] || null,
    }));
    // Real planned stop/target overlay (2026-08-14, live R-multiple readout)
    // — same real autopilot-journal.js entries trade-autopsy.js already
    // joins against CLOSED trades, applied here to OPEN positions instead:
    // the journal buy closest in time to this position's own real opening
    // fill (openedAt above), within a 24h window (autopilot/tagged buys are
    // journaled at the moment of the fill, so a same-day match is the real
    // plan — a much older or unrelated entry is never guessed as the plan
    // for a different open lot). Positions with no real match (manual/
    // untagged buys, or opened before this journal existed) simply don't
    // get plannedStop/plannedTarget — honestly omitted, never fabricated.
    try {
      const journal = readJournal();
      for (const pos of positions) {
        if (!pos.openedAt) continue;
        const openTs = new Date(pos.openedAt).getTime();
        const match = journal
          .filter(j => j.symbol === pos.symbol && Math.abs(j.ts - openTs) < 24 * 3600_000)
          .sort((x, y) => Math.abs(x.ts - openTs) - Math.abs(y.ts - openTs))[0];
        if (match && match.entry > 0 && match.stop > 0) {
          pos.plannedEntry = match.entry;
          pos.plannedStop = match.stop;
          pos.plannedTarget = match.target > 0 ? match.target : null;
        }
      }
    } catch { /* best-effort — real P&L above still returns even if this overlay fails */ }

    // Real day-trade weighted-engine overlay ("AM Trading — Final Trading
    // Logic Redesign" Phase 2+3, explicit user request 2026-08-19) —
    // ADVISORY ONLY, never auto-executes (explicit user choice). For each
    // real open position, fetch real 15-min intraday data + SPY/QQQ/VIX
    // and run the same Phase 1 weighted engine Light Box uses, then
    // classify HOLD/TRAIL/TAKE_PARTIAL/EXIT via position-decision-engine.js.
    // A real open-position list is small (a handful, not Light Box's
    // 50-symbol grid), so a fresh per-symbol fetch here is safe. A symbol
    // with no real day-trade data (illiquid, no real intraday bars) simply
    // doesn't get dayTradeState — honestly omitted, never fabricated, same
    // convention as the plannedStop/plannedTarget overlay above.
    if (positions.length) {
      try {
        const { fetchDayTradeScanRows, fetchMarketQuotes } = require("./market");
        const engine = require("../daytrade-console-engine");
        const { computePositionState } = require("../position-decision-engine");
        const { resolveProviderKeys } = require("../config");

        const symbols = positions.map((p) => p.symbol);
        const providerKeys = resolveProviderKeys(new URLSearchParams());
        // SPY/QQQ only — VIX isn't consumed here (this overlay's Market
        // dimension is the same real SPY-only proxy day-trade-calc.js
        // uses, not the full computeRegime). "^VIX" is deliberately
        // omitted: it diverges from this codebase's own established
        // fetchMarketQuotes convention (see market.js line ~1922, which
        // uses "VIXY" instead) and isn't needed anyway.
        const [scanResult, macroRows] = await Promise.all([
          fetchDayTradeScanRows(symbols).catch(() => ({ rows: [] })),
          fetchMarketQuotes(["SPY", "QQQ"], providerKeys).catch(() => []),
        ]);
        const spyRow = (macroRows || []).find((m) => m.symbol === "SPY");
        const spyChg = spyRow ? Number(spyRow.changesPercentage || 0) : null;
        const qqqRow = (macroRows || []).find((m) => m.symbol === "QQQ");
        const qqqChg = qqqRow ? Number(qqqRow.changesPercentage || 0) : null;
        const rowsBySymbol = new Map((scanResult.rows || []).map((r) => [r.symbol, r]));

        for (const pos of positions) {
          const row = rowsBySymbol.get(pos.symbol);
          if (!row || spyChg == null) continue; // honest — dayTradeState left absent

          const marketScore = Math.max(0, Math.min(100, 50 + spyChg * 30));
          const trendStackScore = engine.computeTrendScore(row.price, row.vwap, row.ema9 ?? null, row.ema21 ?? null, row.ema50 ?? null);
          const orb = engine.computeOrbScore({ price: row.price, orHigh: row.orHigh ?? null, orLow: row.orLow ?? null, rvol: row.rvol, aboveVwap: row.aboveVwap, bull15: row.bull15, marketBullish: spyChg > -0.1 });
          const vwapScore = engine.computeVwapScore(row.price, row.vwap, null);
          const momentumScore = engine.computeMomentumScore({ rsi: row.rsi15m ?? null, roc: row.roc15m ?? null, macdHistogram: row.macdHistogram15m ?? null, priceMomentumPct: null, rvol: row.rvol, trendStackScore });
          const volumeScore = engine.computeVolumeScore(row.rvol);
          const rs = engine.computeRelativeStrength(row.chgPct, spyChg, qqqChg, null);
          const priceActionScore = engine.computePriceActionScore(row.priceAction || {});
          const minerviniScore = engine.computeMinerviniScore(null);
          const vcpScore = engine.computeVcpScore(null);

          const subscores = { orb: orb.score, vwap: vwapScore, momentum: momentumScore, volume: volumeScore, relativeStrength: rs.score, market: marketScore, priceAction: priceActionScore, minervini: minerviniScore, vcp: vcpScore };
          const mixed = engine.computeMixedSignals(subscores);
          const master = engine.computeMasterScore(subscores);

          // Same real R-multiple math ActivePositionsCard.jsx already
          // computes and displays — reused as-is (not side-inverted) so
          // this overlay's rNow/rTarget never disagrees with what's
          // already shown for the same position.
          const risk = (pos.plannedEntry > 0 && pos.plannedStop > 0) ? Math.abs(pos.plannedEntry - pos.plannedStop) : null;
          const rNow = risk ? (Number(pos.current || 0) - pos.plannedEntry) / risk : null;
          const rTarget = (risk && pos.plannedTarget > 0) ? (pos.plannedTarget - pos.plannedEntry) / risk : null;

          // currentPrice/stopPrice (Master Build Spec §18, 2026-08-22) —
          // both already real, already computed above for rNow/rTarget —
          // zero new fetches. Powers the HARD_EXIT real stop-breach check.
          const decision = computePositionState({ side: pos.side, gainPct: pos.unrealizedPLpc, mixedVerdict: mixed.verdict, mixedReason: mixed.reason, rNow, rTarget, currentPrice: pos.current, stopPrice: pos.plannedStop });
          pos.dayTradeState = decision.state;
          pos.dayTradeReason = decision.reason;
          pos.dayTradeScore = master.score;
        }
      } catch { /* best-effort overlay — real positions/P&L above still return even if this fails */ }
    }

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
      // Real stop/limit price — Alpaca already returns these, they were just
      // never mapped through. Needed to actually see how much room an open
      // stop order gives before it fires (not just whether one exists).
      stopPrice: o.stop_price ? Number(o.stop_price) : null,
      limitPrice: o.limit_price ? Number(o.limit_price) : null,
    }));
    return writeJson(res, 200, { ok: true, orders });
  }

  // Place an order. Body: { symbol, qty, side, type?, limit_price?, stop_loss?, take_profit? }
  // Crypto (explicit user request, 2026-08-03): a pair like "BTC/USD" is
  // detected by the real "/" the client sends (never guessed/inferred from a
  // symbol list) — Alpaca's crypto trading goes through this same paper-api
  // client/endpoint, just with a slash-bearing symbol, fractional qty
  // (whole-share floor below would silently zero out e.g. 0.01 BTC), and gtc
  // time-in-force (crypto has no daily session close, so Alpaca rejects "day").
  if (pathname === "/api/alpaca/order" && req.method === "POST") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key" });
    const b = await readBody(req);
    const rawSymbol = String(b.symbol || "").toUpperCase();
    const isCrypto = rawSymbol.includes("/");
    const symbol = isCrypto ? rawSymbol.replace(/[^A-Z0-9/]/g, "") : rawSymbol.replace(/[^A-Z.]/g, "");
    const qty = isCrypto
      ? Math.max(0, Math.round((Number(b.qty) || 0) * 1e8) / 1e8)
      : Math.max(0, Math.floor(Number(b.qty) || 0));
    const side = b.side === "sell" ? "sell" : "buy";
    if (!symbol || qty <= 0) return writeJson(res, 400, { ok: false, error: "symbol and qty required" });
    // LONGS ONLY — a sell may only close/trim shares/coins you actually hold.
    // A sell with no long position (or one larger than the position) would
    // open/increase a SHORT, so it is rejected here. This blocks shorting at
    // the source no matter which caller (autopilot, mean-rev, manual) sends it.
    if (side === "sell") {
      const posRes = await alpaca(`/v2/positions/${encodeURIComponent(symbol)}`);
      const heldLong = posRes._ok ? Math.max(0, isCrypto ? (Number(posRes.data?.qty) || 0) : Math.floor(Number(posRes.data?.qty) || 0)) : 0;
      if (heldLong <= 0) return writeJson(res, 200, { ok: false, error: `Shorting disabled — no long position in ${symbol} to sell (long-only).` });
      if (qty > heldLong) return writeJson(res, 200, { ok: false, error: `Long-only: can sell at most ${heldLong} ${isCrypto ? "" : "sh "}of ${symbol} (would open a short).` });
    }
    const order = {
      symbol, qty: String(qty), side,
      type: b.type || "market",
      time_in_force: b.time_in_force || (isCrypto ? "gtc" : "day"),
      // Idempotency: Alpaca rejects a duplicate client_order_id, so a retry or a
      // double-fire can't place the same order twice. Caller may pass one; else
      // derive a stable id from symbol+side+qty+minute.
      client_order_id: String(b.client_order_id || `dm-${symbol}-${side}-${qty}-${Math.floor(Date.now() / 60000)}`).slice(0, 128),
    };
    if (b.limit_price) order.limit_price = String(b.limit_price);
    // Bracket order: attach stop loss + take profit if provided (works for long buys and short sells)
    if (b.stop_loss || b.take_profit) {
      order.order_class = "bracket";
      if (b.take_profit) order.take_profit = { limit_price: String(b.take_profit) };
      if (b.stop_loss) order.stop_loss = { stop_price: String(b.stop_loss) };
    }
    // Standalone protective stop on an already-open position — distinct from
    // the bracket case above (which only applies to a NEW entry order).
    // Alpaca expects stop_price as a top-level field, not nested, for a
    // plain type:"stop" order. Existing long-only guard above already
    // covers this (side:"sell" already validated against real held qty).
    if (order.type === "stop" && b.stop_price) order.stop_price = String(b.stop_price);
    const a = await alpaca("/v2/orders", "POST", order);
    if (!a._ok) return writeJson(res, 200, { ok: false, error: a.data?.message || "order rejected", status: a._status });
    // Opt-in setup tagging — same real journal server-autopilot.js already
    // writes to (autopilot-journal.js), joined against real closed-trade P&L
    // by tierStats()/the Learning Engine. `b.setupTag` is caller-declared (the
    // client AutoPilotEngine.jsx passes its real computeGreenLight() grade
    // for aPlus-mode buys); untagged callers (manual trades, Quick Trade,
    // mean-rev) are simply never journaled here, unchanged from before.
    if (side === "buy" && b.setupTag) {
      appendJournal({
        ts: Date.now(), symbol, tier: String(b.setupTag).slice(0, 16), side: "long", qty,
        entry: Number(b.entry) || 0, stop: Number(b.stop_loss) || 0, target: Number(b.take_profit) || 0,
        source: "client", sector: sectorOf(symbol),
      });
    }
    return writeJson(res, 200, { ok: true, order: { id: a.data.id, symbol: a.data.symbol, qty: Number(a.data.qty), side: a.data.side, status: a.data.status } });
  }

  // Place a SIMPLE option order. Body: { underlying, type: "call"|"put", qty, underlyingPx }
  // Finds a near-dated (~2–5 wk) ATM contract and buys it at market. Requires options enabled on the paper account.
  if (pathname === "/api/alpaca/option-order" && req.method === "POST") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key" });
    // OPTIONS DISABLED — opening option positions is turned off for safety (the
    // naked-short options blowup). Long stocks only. Closing existing options via
    // /api/alpaca/liquidate-options still works.
    return writeJson(res, 200, { ok: false, error: "Options trading is disabled (long stocks only)." });
  }

  // Close a full position (market sell everything). Allows option (OCC) and crypto pair symbols too.
  if (pathname === "/api/alpaca/close" && req.method === "POST") {
    if (!configured) return writeJson(res, 200, { ok: false, reason: "no-alpaca-key" });
    const b = await readBody(req);
    const rawCloseSymbol = String(b.symbol || "").toUpperCase();
    const symbol = rawCloseSymbol.includes("/") ? rawCloseSymbol.replace(/[^A-Z0-9/]/g, "") : rawCloseSymbol.replace(/[^A-Z0-9.]/g, "");  // keep digits for options
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

module.exports = { handleAlpaca, getClosedTrades };
