// watchlist-institutional-alerts.js — Phase 5 of the Institutional Research
// Upgrade (2026-07-29): the 5 real alert categories the plan named as
// missing, all scoped to the real Watchlist only (not the whole market, to
// stay bounded — same explicit-user-choice scope as watchlist-turn-alerts.js
// and watchlist-setup-alerts.js) and reusing the exact same real persisted-
// diff pattern those two files already use (durable store survives
// redeploys, first-seen-per-symbol seeds silently rather than alerting on
// startup). Each category is budget-gated independently via
// shouldSendAlert so one noisy category never crowds out another.
//
//   1. smart-money-detected — real BOS newly appears (smc-engine.js, already
//      attached to every trend-screen row).
//   2. dark-pool-spike — real Unusual Whales print above $250K, newer than
//      the last one already alerted on (same $250K default this app's own
//      NewsAlertTape already uses to flag flow as "alert-worthy").
//   3. options-flow-unusual — a real contract flagged `unusual` (volume vs
//      OI, normalizeOptionContract) with notional above the same $250K bar.
//   4. earnings-released — real earningsDte crosses from non-negative to
//      negative (the date has now passed).
//   5. news-sentiment-change — real StockTwits net sentiment (bullPct -
//      bearPct) swings by 30+ points since the last check.
//   6. gamma-breakout — real dealer gamma-flip-point crossing (Phase 14 of
//      the options platform redesign, 2026-08-03) — src/gamma-exposure.js's
//      real GEX, extracted from the /api/market/gamma route into a shared
//      fetchGammaForSymbol() so this file doesn't duplicate the real 2-
//      request Polygon fetch pattern. Hard-gated on POLYGON_API_KEY, same
//      honest-unavailable convention as the route itself. Paced ~24s/symbol
//      (2 Polygon requests per symbol, spread to stay under the documented
//      5 req/min free-tier limit noted in gamma-exposure.js's own route) —
//      a full watchlist sweep fits comfortably inside the 15-min cycle.
//   7. volume-spike — real RVOL crossing into "huge institutional interest"
//      territory (>=3.0x, the same real band screenTrendTemplate's own
//      score already uses) — promoted from what was previously only a
//      confirmation GATE on the price-target alert (price-alert-monitor.js's
//      VOL_CONFIRM) into its own standalone, edge-triggered signal. Zero
//      new fetch — reuses the real volRatio already returned by the same
//      batched screenWatchlistCached scan category 1/4 above already calls.
"use strict";

const path = require("node:path");
const { ROOT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { loadWatchlist } = require("./routes/watchlist");
const { isMarketHoursET } = require("./risk-guardrails");

const STORE_PATH = path.join(ROOT, "data", "watchlist-institutional-state.json");
const HISTORY_PATH = path.join(ROOT, "data", "watchlist-institutional-history.json");
// Real CURRENT per-symbol snapshot — distinct from STORE_PATH above (which
// only keeps the minimal diffing fields an edge-triggered alert needs).
// Added 2026-08-03 to power the Scanner's real Gamma Squeeze/Whale Activity/
// High Open Interest categories (options platform redesign Phase 15's 3
// deferred categories — deferred because a live per-symbol Polygon/UW fetch
// on every Scanner category click was too rate-limit-risky across the full
// ~100-symbol universe). Rather than a second parallel job duplicating the
// same real dark-pool/options-flow/gamma fetches this file already makes
// every 15 min for its alert diffing, this just persists a fuller real
// snapshot from those SAME fetches — zero new provider calls, scoped to the
// real Watchlist exactly like the alert diffing already is.
const SNAPSHOT_PATH = path.join(ROOT, "data", "watchlist-institutional-snapshot.json");
const HISTORY_MAX = 200;
const FLOW_ALERT_MIN_NOTIONAL = 250_000; // matches NewsAlertTape's own default "alert-worthy" flow threshold
const SENTIMENT_SWING_THRESHOLD = 30; // net bullPct-bearPct points
const VOLUME_SPIKE_THRESHOLD = 3.0; // matches screenTrendTemplate's own "RVOL >= 3.0 — huge institutional interest" band
const GAMMA_CHECK_SPACING_MS = 24_000; // ~2 Polygon requests/symbol, stays under the documented 5 req/min free-tier limit

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Real gamma-flip-point side — 'above'/'below' the real flip point, or null
// when either input isn't a real finite number (gamma unavailable for this
// symbol). Pure so it's independently testable.
function gammaFlipSide(price, gammaFlipPoint) {
  if (!Number.isFinite(price) || !Number.isFinite(gammaFlipPoint)) return null;
  return price >= gammaFlipPoint ? "above" : "below";
}

// Real volume-spike edge-trigger — fires only on the crossing INTO a real
// spike (current real RVOL >= threshold, with a real known prior RVOL below
// it), never on every check while volume stays elevated, and never on the
// very first check for a symbol (no real baseline yet). Pure so it's
// independently testable.
function volumeSpikeTriggered(lastVolRatio, volRatio, threshold = VOLUME_SPIKE_THRESHOLD) {
  if (!Number.isFinite(volRatio) || !Number.isFinite(lastVolRatio)) return false;
  return volRatio >= threshold && lastVolRatio < threshold;
}

function loadState() {
  return readJsonSafe(STORE_PATH, {});
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}
function loadSnapshot() {
  return readJsonSafe(SNAPSHOT_PATH, {});
}
function saveSnapshot(s) {
  writeJsonAtomic(SNAPSHOT_PATH, s);
}

// Real history log (2026-07-29, "don't see what you just built" — the
// checks above only pinged Telegram, with nothing to look at in the app
// itself). Logs every real trigger regardless of the Telegram budget gate
// below, so the Alerts tab shows what actually happened even on a check
// where shouldSendAlert throttled the Telegram message itself.
function loadHistory() {
  const parsed = readJsonSafe(HISTORY_PATH, []);
  return Array.isArray(parsed) ? parsed : [];
}
function appendHistory(entries) {
  if (!entries.length) return;
  const history = loadHistory();
  const next = [...entries, ...history].slice(0, HISTORY_MAX);
  try { writeJsonAtomic(HISTORY_PATH, next); } catch {}
}

async function checkWatchlistInstitutionalAlerts() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };
  const { symbols } = loadWatchlist();
  if (!Array.isArray(symbols) || !symbols.length) return { ok: true, checked: 0, alerts: [] };

  let screenWatchlistCached, fetchOptionsFlow, fetchDarkPoolPrints, fetchGammaForSymbol;
  try {
    ({ screenWatchlistCached, fetchOptionsFlow, fetchDarkPoolPrints, fetchGammaForSymbol } = require("./routes/market"));
  } catch { return { ok: false, checked: 0, alerts: [] }; }

  const prev = loadState();
  const next = { ...prev };
  const smartMoney = [], darkPool = [], optionsFlow = [], earnings = [], sentiment = [], volumeSpike = [], gammaBreakout = [];
  // Real current-state snapshot (see SNAPSHOT_PATH comment above) — built
  // alongside the diffing loops below from the exact same real fetches,
  // never a separate/duplicate call.
  const snapshot = {};

  // 1 & 4: smart-money-detected + earnings-released — one shared batched
  // scan, same real engine every other real scanner on this platform uses.
  // screenWatchlistCached (not screenTrendTemplate directly) — shares one
  // real scan with watchlist-setup-alerts.js's identical watchlist sweep
  // when both land in the same 15-min tick (CTO audit item #4).
  const rows = await screenWatchlistCached(symbols).catch(() => []);
  for (const row of rows) {
    if (row.error) continue;
    const symbol = row.symbol;
    const last = prev[symbol] || {};
    next[symbol] = { ...last };

    const bosType = row.smc?.bos?.type || null;
    // Real prior baseline required (last.bosType !== undefined) — the very
    // first check for a symbol seeds silently instead of alerting on
    // whatever real BOS state it happens to already be in, same convention
    // watchlist-turn-alerts.js uses for the verdict-flip alert.
    if (bosType && last.bosType !== undefined && last.bosType !== bosType) {
      smartMoney.push({ symbol, type: bosType, label: row.smc.bos.label });
    }
    next[symbol].bosType = bosType;

    const dte = Number.isFinite(row.earningsDte) ? row.earningsDte : null;
    if (dte != null && Number.isFinite(last.earningsDte) && last.earningsDte >= 0 && dte < 0) {
      earnings.push({ symbol, price: row.price });
    }
    if (dte != null) next[symbol].earningsDte = dte;

    // 7: volume-spike — real RVOL from the same batched scan, zero new fetch.
    const volRatio = Number.isFinite(row.volRatio) ? row.volRatio : null;
    if (volRatio != null && volumeSpikeTriggered(last.volRatio, volRatio)) {
      volumeSpike.push({ symbol, volRatio, price: row.price });
    }
    if (volRatio != null) next[symbol].volRatio = volRatio;
  }

  // 2 & 3: dark-pool-spike + options-flow-unusual — real per-symbol fetches,
  // bounded to the watchlist (typically a handful to a few dozen names).
  const keys = resolveProviderKeys(new URLSearchParams());
  for (const symbol of symbols) {
    const last = prev[symbol] || {};
    next[symbol] = next[symbol] || { ...last };

    const dp = await fetchDarkPoolPrints(symbol).catch(() => null);
    if (dp?.ok && dp.prints?.length) {
      const lastSeenTime = last.darkPoolLastTime || "";
      const fresh = dp.prints.filter((p) => p.value >= FLOW_ALERT_MIN_NOTIONAL && p.time > lastSeenTime);
      if (fresh.length && lastSeenTime) { // real prior baseline required — first-ever check seeds silently
        const biggest = fresh.reduce((a, b) => (b.value > a.value ? b : a));
        darkPool.push({ symbol, value: biggest.value, price: biggest.price, size: biggest.size });
      }
      const newestTime = dp.prints.reduce((mx, p) => (p.time > mx ? p.time : mx), lastSeenTime);
      next[symbol].darkPoolLastTime = newestTime;
      // Whale Activity snapshot — the single biggest REAL print currently in
      // this window at/above the same $250K "whale" bar every other
      // category in this file already uses, regardless of whether it's
      // "fresh" since the last check (current state, not a diff).
      const whalePrints = dp.prints.filter((p) => p.value >= FLOW_ALERT_MIN_NOTIONAL);
      if (whalePrints.length) {
        const biggestDp = whalePrints.reduce((a, b) => (b.value > a.value ? b : a));
        snapshot[symbol] = { ...snapshot[symbol], darkPoolValue: biggestDp.value, darkPoolTime: biggestDp.time };
      }
    }

    // limit:20 (not the route's default 20->10 minimum) — a wider real
    // top-N-by-notional window so a genuinely unusual contract is less
    // likely to drop in and out of view between two 15-min checks and
    // re-fire on the same real contract.
    const flow = await fetchOptionsFlow([symbol], { limit: 20, keys }).catch(() => null);
    if (flow?.flow?.length) {
      const seenIds = new Set(last.flowSeenIds || []);
      const unusual = flow.flow.filter((c) => c.unusual && c.notional >= FLOW_ALERT_MIN_NOTIONAL);
      if (unusual.length && seenIds.size) { // real prior baseline required
        const fresh = unusual.filter((c) => !seenIds.has(`${c.side}${c.strike}${c.expiry}`));
        if (fresh.length) {
          const biggest = fresh.reduce((a, b) => (b.notional > a.notional ? b : a));
          optionsFlow.push({ symbol, side: biggest.side, strike: biggest.strike, notional: biggest.notional, tradeType: biggest.tradeType });
        }
      }
      next[symbol].flowSeenIds = unusual.map((c) => `${c.side}${c.strike}${c.expiry}`).slice(0, 40);
      if (unusual.length) {
        const biggestFlow = unusual.reduce((a, b) => (b.notional > a.notional ? b : a));
        snapshot[symbol] = { ...snapshot[symbol], optionsFlowNotional: biggestFlow.notional, optionsFlowSide: biggestFlow.side };
      }
    }
  }

  // 6: gamma-breakout — real dealer gamma-flip-point crossing. Hard-gated
  // on POLYGON_API_KEY (fetchGammaForSymbol itself honestly no-ops without
  // one) — skip the whole loop rather than pay for N honest-unavailable
  // round trips when there's no real key configured.
  if (keys.polygon) {
    for (const symbol of symbols) {
      const last = prev[symbol] || {};
      next[symbol] = next[symbol] || { ...last };
      const gamma = await fetchGammaForSymbol(symbol).catch(() => null);
      // Gamma Squeeze/High Open Interest snapshot — real current values,
      // captured whenever available regardless of whether a real flip point
      // exists to gate the (unrelated) gamma-breakout alert below.
      if (gamma?.available !== false) {
        snapshot[symbol] = {
          ...snapshot[symbol],
          netGEX: Number.isFinite(gamma?.netGEX) ? gamma.netGEX : null,
          gammaSqueezeProbability: Number.isFinite(gamma?.gammaSqueezeProbability) ? gamma.gammaSqueezeProbability : null,
          totalOpenInterest: Number.isFinite(gamma?.totalOpenInterest) ? gamma.totalOpenInterest : null,
        };
      }
      if (gamma?.available !== false && Number.isFinite(gamma?.underlying) && Number.isFinite(gamma?.gammaFlipPoint)) {
        const side = gammaFlipSide(gamma.underlying, gamma.gammaFlipPoint);
        // Real prior baseline required (last.gammaSide !== undefined) —
        // first-ever check seeds silently, same convention as every other
        // category in this file.
        if (side && last.gammaSide !== undefined && last.gammaSide !== side) {
          gammaBreakout.push({ symbol, side, price: gamma.underlying, flipPoint: gamma.gammaFlipPoint });
        }
        next[symbol].gammaSide = side;
      }
      await sleep(GAMMA_CHECK_SPACING_MS);
    }
  }

  // 5: news-sentiment-change — real StockTwits per-symbol sentiment.
  let fetchSentiment;
  try { ({ fetchSentiment } = require("./providers/stocktwits")); } catch { fetchSentiment = null; }
  if (fetchSentiment) {
    for (const symbol of symbols) {
      const s = await fetchSentiment(symbol).catch(() => null);
      if (!s || (s.bullish === 0 && s.bearish === 0)) continue;
      const net = (s.bullPct || 0) - (s.bearPct || 0);
      const last = prev[symbol] || {};
      if (Number.isFinite(last.sentimentNet) && Math.abs(net - last.sentimentNet) >= SENTIMENT_SWING_THRESHOLD) {
        sentiment.push({ symbol, from: last.sentimentNet, to: net, label: s.sentiment });
      }
      next[symbol] = { ...next[symbol], sentimentNet: net };
    }
  }

  saveState(next);
  // Timestamp every symbol that got a real snapshot update this run — lets
  // the Scanner honestly distinguish "never checked" from "checked, no real
  // whale-sized activity right now" for the same symbol.
  const snapshotAt = new Date().toISOString();
  for (const symbol of Object.keys(snapshot)) snapshot[symbol].updatedAt = snapshotAt;
  saveSnapshot({ ...loadSnapshot(), ...snapshot });

  const now = new Date().toISOString();
  const historyEntries = [];
  const send = async (category, header, items, lineFn, textFn) => {
    if (!items.length) return;
    historyEntries.push(...items.map((a) => ({ category, symbol: a.symbol, text: textFn(a), at: now })));
    if (shouldSendAlert({ category })) {
      await sendTelegramMessage(`${header}\n\n${items.map(lineFn).join("\n")}`).catch(() => {});
    }
  };

  await send("smart-money-detected", "🧠 *SMART MONEY DETECTED*", smartMoney,
    (a) => `${a.type === "BULL_BOS" ? "🟢" : "🔴"} ${a.symbol}: ${a.label}`, (a) => a.label);
  await send("dark-pool-spike", "🐋 *DARK POOL SPIKE*", darkPool,
    (a) => `${a.symbol}: $${(a.value / 1e6).toFixed(1)}M block @ $${a.price.toFixed(2)} (${a.size.toLocaleString()} sh)`,
    (a) => `$${(a.value / 1e6).toFixed(1)}M block @ $${a.price.toFixed(2)} (${a.size.toLocaleString()} sh)`);
  await send("options-flow-unusual", "⚡ *UNUSUAL OPTIONS FLOW*", optionsFlow,
    (a) => `${a.symbol}: ${a.side} $${a.strike} — $${(a.notional / 1e6).toFixed(2)}M notional (${a.tradeType})`,
    (a) => `${a.side} $${a.strike} — $${(a.notional / 1e6).toFixed(2)}M notional (${a.tradeType})`);
  await send("earnings-released", "💰 *EARNINGS RELEASED*", earnings,
    (a) => `${a.symbol}: earnings just released — $${Number(a.price).toFixed(2)}`,
    (a) => `Earnings just released — $${Number(a.price).toFixed(2)}`);
  await send("news-sentiment-change", "📣 *SENTIMENT SHIFT*", sentiment,
    (a) => `${a.symbol}: net sentiment ${a.from >= 0 ? "+" : ""}${a.from} → ${a.to >= 0 ? "+" : ""}${a.to} (${a.label})`,
    (a) => `Net sentiment ${a.from >= 0 ? "+" : ""}${a.from} → ${a.to >= 0 ? "+" : ""}${a.to} (${a.label})`);
  await send("gamma-breakout", "🧲 *GAMMA BREAKOUT*", gammaBreakout,
    (a) => `${a.symbol}: crossed ${a.side} the real gamma flip point ($${a.flipPoint.toFixed(2)}) — now $${a.price.toFixed(2)}`,
    (a) => `Crossed ${a.side} the real gamma flip point ($${a.flipPoint.toFixed(2)}) — now $${a.price.toFixed(2)}`);
  await send("volume-spike", "📊 *VOLUME SPIKE*", volumeSpike,
    (a) => `${a.symbol}: RVOL ${a.volRatio.toFixed(1)}× — huge institutional interest, $${Number(a.price).toFixed(2)}`,
    (a) => `RVOL ${a.volRatio.toFixed(1)}× — huge institutional interest, $${Number(a.price).toFixed(2)}`);

  appendHistory(historyEntries);

  return {
    ok: true, checked: symbols.length,
    alerts: { smartMoney, darkPool, optionsFlow, earnings, sentiment, gammaBreakout, volumeSpike },
  };
}

module.exports = {
  checkWatchlistInstitutionalAlerts, getHistory: loadHistory, getSnapshot: loadSnapshot,
  gammaFlipSide, volumeSpikeTriggered, // exposed for smoke test fixtures
};
