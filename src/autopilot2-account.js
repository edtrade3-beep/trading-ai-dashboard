// autopilot2-account.js — ADOL22 Autopilot 2.0: a real internal $100,000
// simulated paper brokerage account. Every fill is a real, instant
// market-order-style simulation against a fresh real quote (bid/ask-aware
// when the quote has real bid/ask, an honest disclosed default spread
// otherwise) — never a fabricated price, and a missing real quote refuses
// the fill rather than guessing one. There is deliberately no pending/
// working-order state (every "order" fills synchronously against a live
// quote) — restart recovery is just reloading this persisted ledger,
// nothing to reconcile.
//
// Phase 2a (2026-08-27) adds real CALL option positions alongside stocks
// in the SAME openPositions array (discriminated by `assetType`) — one
// real equity curve across both asset classes, matching the spec's own
// "CORE ACCOUNT" framing. Puts are Phase 2b (see the plan).
"use strict";
const path = require("node:path");
const { ROOT, PORT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { fetchQuoteBatchWithFallback } = require("./providers/yahoo");

const ACCOUNT_PATH = path.join(ROOT, "data", "autopilot2-account.json");
const STARTING_CAPITAL = 100_000;
const DEFAULT_SPREAD_PCT = 0.0005; // 5bps — real, disclosed default when no real bid/ask is available
const MAX_CLOSED_TRADES = 500; // same retention cap convention as meanrev-paper.js
const CONTRACT_MULTIPLIER = 100; // real, standard US equity option contract size

// Real self-loopback JSON fetch — same established convention
// quick-trade-service.js/routes/ai-hub.js already use for a background
// job to reuse a route's own real computation (here: GET /api/market/
// options, whose chain-building logic lives inline in the route handler,
// not worth refactoring out just for this reuse).
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(p) {
  try { const r = await fetch(`${BASE()}${p}`); return await r.json(); } catch { return null; }
}

// Real option chain for one symbol/expiry — thin wrapper over the real
// route so both this file's mark-to-market and autopilot2-expression.js's
// contract selection share one real fetch path. Returns null (never a
// guessed chain) on any real failure.
async function fetchOptionsChain(symbol, expiry) {
  const qs = expiry ? `?symbol=${encodeURIComponent(symbol)}&expiry=${encodeURIComponent(expiry)}` : `?symbol=${encodeURIComponent(symbol)}`;
  const chain = await getJson(`/api/market/options${qs}`);
  return chain && chain.ok !== false ? chain : null;
}

function etDateStr(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

function freshAccount() {
  const now = new Date().toISOString();
  return {
    startingCapital: STARTING_CAPITAL,
    cash: STARTING_CAPITAL,
    realizedPnl: 0,
    dailyStartEquity: STARTING_CAPITAL,
    dailyStartDate: null,
    peakEquity: STARTING_CAPITAL,
    weekStartEquity: STARTING_CAPITAL,
    weekAnchorDate: null,
    openPositions: [],
    closedTrades: [],
    createdAt: now,
    resetAt: now,
  };
}

function loadAccount() {
  return readJsonSafe(ACCOUNT_PATH, null) || freshAccount();
}

function saveAccount(account) {
  writeJsonAtomic(ACCOUNT_PATH, account);
}

// Real fill price — bid/ask-aware when the quote has real bid/ask (BUY
// fills at the real ask, SELL at the real bid, same convention a real
// market order actually crosses), an honest disclosed default spread off
// the last price otherwise. Never a naive mid-price fill (spec §34: "Do
// not use impossible fills").
function realFillPrice(quoteRow, side) {
  const price = Number(quoteRow?.regularMarketPrice || 0);
  if (!(price > 0)) return null;
  const bid = Number(quoteRow?.bid), ask = Number(quoteRow?.ask);
  if (side === "BUY" && Number.isFinite(ask) && ask > 0) return ask;
  if (side === "SELL" && Number.isFinite(bid) && bid > 0) return bid;
  return side === "BUY" ? price * (1 + DEFAULT_SPREAD_PCT) : price * (1 - DEFAULT_SPREAD_PCT);
}

function rollDailyStart(account, equity) {
  const today = etDateStr();
  if (account.dailyStartDate !== today) { account.dailyStartDate = today; account.dailyStartEquity = equity; }
}

function rollWeeklyStart(account, equity) {
  const { weekAnchorET } = require("./risk-guardrails");
  const anchor = weekAnchorET();
  if (account.weekAnchorDate !== anchor) { account.weekAnchorDate = anchor; account.weekStartEquity = equity; }
}

// Real mark-to-market snapshot — fetches current real quotes/chains for
// every open position, computes real unrealized P&L, real equity, real
// drawdown off the real persisted all-time peak, real portfolio heat (Σ
// real dollar risk ÷ equity, using each position's own real stored
// riskDollars — the same real max-loss figure computed at entry for both
// stocks (entry-to-stop) and calls (full premium paid), not re-derived),
// and real sector exposure. A position whose real quote/contract can't be
// re-matched right now keeps its last real known price rather than being
// silently dropped from equity — disclosed via `stalePricing`, never
// hidden. CALL positions' real market value/exposure use the real premium
// paid (capital committed), not a delta-adjusted notional — a real,
// disclosed simplification (see the plan).
async function getAccountSnapshot() {
  const account = loadAccount();
  const { sectorOf } = require("./risk-guardrails");

  const stockPositions = account.openPositions.filter((p) => p.assetType !== "CALL");
  const optionPositions = account.openPositions.filter((p) => p.assetType === "CALL");

  const stockSymbols = stockPositions.map((p) => p.symbol);
  const quotes = stockSymbols.length ? await fetchQuoteBatchWithFallback(stockSymbols).catch(() => []) : [];
  const quoteBySymbol = new Map(quotes.map((q) => [String(q.symbol || "").toUpperCase(), q]));

  // One real chain fetch per unique (symbol, expiry) among held calls —
  // never one fetch per position, so multiple contracts on the same real
  // expiry share a single real chain read.
  const chainKeys = [...new Set(optionPositions.map((p) => `${p.symbol}|${p.expiry}`))];
  const chainByKey = new Map();
  for (const key of chainKeys) {
    const [sym, exp] = key.split("|");
    chainByKey.set(key, await fetchOptionsChain(sym, exp).catch(() => null));
  }

  let marketValue = 0, unrealizedPnl = 0;
  const stalePricing = [];
  const sectorExposure = {};

  const pricedStocks = stockPositions.map((p) => {
    const q = quoteBySymbol.get(p.symbol);
    const livePrice = Number(q?.regularMarketPrice);
    const currentPrice = Number.isFinite(livePrice) && livePrice > 0 ? livePrice : p.lastKnownPrice;
    if (!(Number.isFinite(livePrice) && livePrice > 0)) stalePricing.push(p.symbol);
    else p.lastKnownPrice = livePrice; // persist the freshest real price we actually saw
    const posValue = currentPrice * p.qty;
    const posUnrealized = (currentPrice - p.entryPrice) * p.qty;
    marketValue += posValue;
    unrealizedPnl += posUnrealized;
    const sector = sectorOf(p.symbol) || "OTHER";
    sectorExposure[sector] = (sectorExposure[sector] || 0) + posValue;
    return { ...p, currentPrice, unrealizedPnl: posUnrealized, unrealizedPnlPct: p.entryPrice > 0 ? ((currentPrice / p.entryPrice) - 1) * 100 : null };
  });

  const pricedOptions = optionPositions.map((p) => {
    const chain = chainByKey.get(`${p.symbol}|${p.expiry}`);
    const contract = chain?.calls?.find((c) => c.contractSymbol === p.contractSymbol);
    const liveBid = Number(contract?.bid);
    const currentPrice = Number.isFinite(liveBid) && liveBid > 0 ? liveBid : p.lastKnownPrice;
    if (!(Number.isFinite(liveBid) && liveBid > 0)) stalePricing.push(p.contractSymbol);
    else p.lastKnownPrice = liveBid;
    const posValue = currentPrice * p.qty * p.contractMultiplier;
    const posUnrealized = (currentPrice - p.entryPrice) * p.qty * p.contractMultiplier;
    marketValue += posValue;
    unrealizedPnl += posUnrealized;
    const sector = sectorOf(p.symbol) || "OTHER";
    sectorExposure[sector] = (sectorExposure[sector] || 0) + posValue;
    return { ...p, currentPrice, currentUnderlying: chain?.underlying ?? null, dte: contract?.dte ?? null, unrealizedPnl: posUnrealized, unrealizedPnlPct: p.entryPrice > 0 ? ((currentPrice / p.entryPrice) - 1) * 100 : null };
  });

  const positions = [...pricedStocks, ...pricedOptions];

  const equity = account.cash + marketValue;
  rollDailyStart(account, equity);
  rollWeeklyStart(account, equity);
  if (equity > account.peakEquity) account.peakEquity = equity;
  saveAccount(account); // persists any daily/weekly rollover + updated lastKnownPrice + peak — cheap, idempotent

  const riskDollars = account.openPositions.reduce((s, p) => s + Math.max(0, Number(p.riskDollars) || 0), 0);

  return {
    cash: account.cash,
    equity,
    marketValue,
    realizedPnl: account.realizedPnl,
    unrealizedPnl,
    dailyPnl: equity - account.dailyStartEquity,
    totalPnl: equity - account.startingCapital,
    drawdownPct: account.peakEquity > 0 ? ((equity - account.peakEquity) / account.peakEquity) * 100 : 0,
    peakEquity: account.peakEquity,
    dailyStartEquity: account.dailyStartEquity,
    weekStartEquity: account.weekStartEquity,
    portfolioHeatPct: equity > 0 ? (riskDollars / equity) * 100 : 0,
    sectorExposure,
    openPositions: positions,
    closedTrades: account.closedTrades,
    stalePricing,
  };
}

// Real, instant simulated fill — refuses (never fabricates) if there's no
// real current quote, insufficient real cash, or a duplicate open position
// in the same symbol (spec §38: "Never duplicate trades").
async function openPosition({ symbol, qty, stop, target, riskDollars, opportunitySnapshot, assetType = "STOCK" }) {
  symbol = String(symbol || "").trim().toUpperCase();
  if (!symbol || !(qty > 0)) return { ok: false, error: "invalid symbol/qty" };
  const account = loadAccount();
  if (account.openPositions.some((p) => p.symbol === symbol)) {
    return { ok: false, error: `already holding an open position in ${symbol} — duplicate entry blocked` };
  }

  const [quote] = await fetchQuoteBatchWithFallback([symbol]).catch(() => []);
  const entryPrice = realFillPrice(quote, "BUY");
  if (!(entryPrice > 0)) return { ok: false, error: `no real current quote available for ${symbol} — refusing to fabricate a fill` };

  const cost = entryPrice * qty;
  if (cost > account.cash) return { ok: false, error: `insufficient real cash — need $${cost.toFixed(2)}, have $${account.cash.toFixed(2)}` };

  const position = {
    // assetType "CRYPTO" (2026-08-30) shares this exact same STOCK-shaped
    // position record and mark-to-market path (getAccountSnapshot's
    // pricedStocks branch, below) — the arithmetic (currentPrice * qty) is
    // asset-agnostic and correct for a fractional crypto qty too; only the
    // label differs, for the UI and for callers that need to branch on it
    // (partialClosePosition's fractional-vs-whole-unit rounding).
    id: `${symbol}-${Date.now()}`, assetType, symbol, qty, entryPrice, entryAt: new Date().toISOString(),
    stop, target, lastKnownPrice: entryPrice,
    riskDollars: riskDollars ?? Math.max(0, (entryPrice - stop) * qty),
    opportunitySnapshot: opportunitySnapshot || null,
  };
  account.cash -= cost;
  account.openPositions.push(position);
  saveAccount(account);
  return { ok: true, position };
}

// Real, instant simulated CALL fill — same refuse-don't-fabricate
// discipline as openPosition, priced off the real contract premium
// (`entryPremium`, already resolved by autopilot2-expression.js's real
// chain fetch/ranking) rather than re-fetching here, since the caller
// just picked this exact real contract off a live chain a moment ago.
// Real cash debit = premium x contracts x 100 (the real standard US
// equity option multiplier).
async function openOptionPosition({ symbol, strike, expiry, contractSymbol, qty, entryPremium, underlyingAtEntry, opportunitySnapshot }) {
  symbol = String(symbol || "").trim().toUpperCase();
  if (!symbol || !(qty > 0) || !(entryPremium > 0) || !contractSymbol) return { ok: false, error: "invalid option fill inputs" };
  const account = loadAccount();
  if (account.openPositions.some((p) => p.symbol === symbol)) {
    return { ok: false, error: `already holding an open position in ${symbol} — duplicate entry blocked` };
  }
  const cost = entryPremium * qty * CONTRACT_MULTIPLIER;
  if (cost > account.cash) return { ok: false, error: `insufficient real cash — need $${cost.toFixed(2)}, have $${account.cash.toFixed(2)}` };

  const position = {
    id: `${contractSymbol}-${Date.now()}`, assetType: "CALL", symbol, optionType: "call",
    strike, expiry, contractSymbol, contractMultiplier: CONTRACT_MULTIPLIER, qty,
    entryPrice: entryPremium, // same field name as stocks — everything downstream (P&L math) treats it uniformly
    underlyingAtEntry: underlyingAtEntry ?? null,
    entryAt: new Date().toISOString(), lastKnownPrice: entryPremium,
    riskDollars: cost, // a long call's real max loss is the full real premium paid
    opportunitySnapshot: opportunitySnapshot || null,
  };
  account.cash -= cost;
  account.openPositions.push(position);
  saveAccount(account);
  return { ok: true, position };
}

// Real CALL close — real cash credit = premium x contracts x 100.
// `exitPremium` lets a caller that already has a fresh real quote for
// this exact contract in hand skip a second fetch; otherwise re-fetches
// the real chain and matches by contractSymbol. A contract that can no
// longer be matched (expired/delisted) refuses rather than fabricates —
// the caller (autopilot2-engine.js) should already be closing ahead of
// real expiration via the DTE floor, so this should be rare.
async function closeOptionPosition(id, { exitPremium, reason } = {}) {
  const account = loadAccount();
  const idx = account.openPositions.findIndex((p) => p.id === id);
  if (idx === -1) return { ok: false, error: `no open position with id ${id}` };
  const position = account.openPositions[idx];

  let fillPremium = Number(exitPremium);
  if (!(fillPremium > 0)) {
    const chain = await fetchOptionsChain(position.symbol, position.expiry);
    const contract = chain?.calls?.find((c) => c.contractSymbol === position.contractSymbol);
    fillPremium = Number(contract?.bid) > 0 ? Number(contract.bid) : null;
  }
  if (!(fillPremium > 0)) return { ok: false, error: `no real current quote available for ${position.contractSymbol} — refusing to fabricate an exit fill` };

  const proceeds = fillPremium * position.qty * position.contractMultiplier;
  const realizedPnl = (fillPremium - position.entryPrice) * position.qty * position.contractMultiplier;
  const rMultiple = position.riskDollars > 0 ? realizedPnl / position.riskDollars : null;
  const holdingMinutes = Math.round((Date.now() - new Date(position.entryAt).getTime()) / 60000);

  account.cash += proceeds;
  account.realizedPnl += realizedPnl;
  account.openPositions.splice(idx, 1);
  const closedTrade = { ...position, exitPrice: fillPremium, exitAt: new Date().toISOString(), exitReason: reason || "MANUAL", realizedPnl, rMultiple, holdingMinutes };
  account.closedTrades.push(closedTrade);
  account.closedTrades = account.closedTrades.slice(-MAX_CLOSED_TRADES);
  saveAccount(account);
  return { ok: true, closedTrade };
}

// Full close — real P&L off the real entry fill, real R-multiple off the
// original real stop distance. `exitPrice` lets a caller that already has
// a fresh real quote in hand skip a second fetch; otherwise fetches one.
async function closePosition(id, { exitPrice, reason } = {}) {
  const account = loadAccount();
  const idx = account.openPositions.findIndex((p) => p.id === id);
  if (idx === -1) return { ok: false, error: `no open position with id ${id}` };
  const position = account.openPositions[idx];

  let fillPrice = Number(exitPrice);
  if (!(fillPrice > 0)) {
    const [quote] = await fetchQuoteBatchWithFallback([position.symbol]).catch(() => []);
    fillPrice = realFillPrice(quote, "SELL");
  }
  if (!(fillPrice > 0)) return { ok: false, error: `no real current quote available for ${position.symbol} — refusing to fabricate an exit fill` };

  const proceeds = fillPrice * position.qty;
  const realizedPnl = (fillPrice - position.entryPrice) * position.qty;
  const riskPerShare = position.entryPrice - position.stop;
  const rMultiple = riskPerShare > 0 ? (fillPrice - position.entryPrice) / riskPerShare : null;
  const holdingMinutes = Math.round((Date.now() - new Date(position.entryAt).getTime()) / 60000);

  account.cash += proceeds;
  account.realizedPnl += realizedPnl;
  account.openPositions.splice(idx, 1);
  const closedTrade = { ...position, exitPrice: fillPrice, exitAt: new Date().toISOString(), exitReason: reason || "MANUAL", realizedPnl, rMultiple, holdingMinutes };
  account.closedTrades.push(closedTrade);
  account.closedTrades = account.closedTrades.slice(-MAX_CLOSED_TRADES);
  saveAccount(account);
  return { ok: true, closedTrade };
}

// Real partial-close quantity, extracted for direct unit testing (no
// network/file I/O). CRYPTO (2026-08-30): real fractional qty —
// Math.floor to a whole unit would either sell 0 (silently no-op a real
// partial-close) or, worse, force-floor-then-max(1,...) into selling a
// whole 1 unit when the real held qty is a small fraction (e.g. 0.05
// BTC) — a real oversell bug. Rounds to the same real precision used at
// entry instead; every other assetType keeps the original whole-unit
// floor unchanged.
function computePartialCloseQty(position, fraction) {
  return position.assetType === "CRYPTO"
    ? Math.floor(position.qty * fraction * 10 ** 6) / 10 ** 6
    : Math.max(1, Math.floor(position.qty * fraction));
}

// Partial close (spec §23 profit management) — sells a real fraction of
// the position at a real current quote, books real partial realized P&L,
// leaves the remainder open with its original stop/target untouched.
async function partialClosePosition(id, { fraction = 0.5, reason } = {}) {
  const account = loadAccount();
  const idx = account.openPositions.findIndex((p) => p.id === id);
  if (idx === -1) return { ok: false, error: `no open position with id ${id}` };
  const position = account.openPositions[idx];
  const sellQty = computePartialCloseQty(position, fraction);
  if (!(sellQty > 0) || sellQty >= position.qty) return closePosition(id, { reason });

  const [quote] = await fetchQuoteBatchWithFallback([position.symbol]).catch(() => []);
  const fillPrice = realFillPrice(quote, "SELL");
  if (!(fillPrice > 0)) return { ok: false, error: `no real current quote available for ${position.symbol} — refusing to fabricate a fill` };

  const proceeds = fillPrice * sellQty;
  const realizedPnl = (fillPrice - position.entryPrice) * sellQty;
  account.cash += proceeds;
  account.realizedPnl += realizedPnl;
  position.qty -= sellQty;
  saveAccount(account);
  return { ok: true, soldQty: sellQty, fillPrice, realizedPnl, remainingQty: position.qty };
}

// Real stop-trail (spec §14/§19 TRAIL) — raises (never lowers) a real
// open position's stop to lock in real gains. Silently no-ops a lower
// value so a stale/late call can never loosen risk.
function updateStop(id, newStop) {
  const account = loadAccount();
  const position = account.openPositions.find((p) => p.id === id);
  if (!position) return { ok: false, error: `no open position with id ${id}` };
  if (!(newStop > position.stop)) return { ok: false, error: "new stop is not tighter than the current real stop — ignored" };
  position.stop = newStop;
  saveAccount(account);
  return { ok: true, stop: newStop };
}

// Real, explicit, destructive reset back to a fresh $100k (spec §31) —
// only reachable via its own confirmed call, never automatic.
function resetAccount({ confirm } = {}) {
  if (!confirm) return { ok: false, error: "reset requires explicit confirm:true — a real destructive action" };
  saveAccount(freshAccount());
  return { ok: true };
}

module.exports = {
  STARTING_CAPITAL, CONTRACT_MULTIPLIER,
  loadAccount, saveAccount, getAccountSnapshot,
  openPosition, closePosition, partialClosePosition, updateStop, resetAccount,
  openOptionPosition, closeOptionPosition, fetchOptionsChain,
  realFillPrice, computePartialCloseQty,
};
