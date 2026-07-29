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
const HISTORY_MAX = 200;
const FLOW_ALERT_MIN_NOTIONAL = 250_000; // matches NewsAlertTape's own default "alert-worthy" flow threshold
const SENTIMENT_SWING_THRESHOLD = 30; // net bullPct-bearPct points

function loadState() {
  return readJsonSafe(STORE_PATH, {});
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
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

  let screenTrendTemplate, fetchOptionsFlow, fetchDarkPoolPrints;
  try {
    ({ screenTrendTemplate, fetchOptionsFlow, fetchDarkPoolPrints } = require("./routes/market"));
  } catch { return { ok: false, checked: 0, alerts: [] }; }

  const prev = loadState();
  const next = { ...prev };
  const smartMoney = [], darkPool = [], optionsFlow = [], earnings = [], sentiment = [];

  // 1 & 4: smart-money-detected + earnings-released — one shared batched
  // scan, same real engine every other real scanner on this platform uses.
  const rows = await screenTrendTemplate(symbols).catch(() => []);
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

  appendHistory(historyEntries);

  return {
    ok: true, checked: symbols.length,
    alerts: { smartMoney, darkPool, optionsFlow, earnings, sentiment },
  };
}

module.exports = { checkWatchlistInstitutionalAlerts, getHistory: loadHistory };
