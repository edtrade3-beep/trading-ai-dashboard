// routes/paper-positions.js — Position Manager / AI Exit Engine, options
// platform redesign Phase 11. Thin GET/POST wrappers over
// paper-positions-store.js + position-manager-engine.js, same shape as
// routes/command-center.js. Paper positions only (confirmed decision) —
// this never places a real order; Alpaca's server-side block
// (routes/alpaca.js) stays untouched.
const { writeJson, round2 } = require("../utils");
const {
  openPosition, closePosition, getPosition, listOpenPositions, listClosedPositions, updatePositionPricing,
} = require("../paper-positions-store");
const { computePositionPnl, computeExitSignals } = require("../position-manager-engine");
const { fetchYahooOptionsChain } = require("../providers/yahoo");
const { rankContracts } = require("../options-math");

// Real re-fetch of the position's own chain (Polygon-preferred via the
// same pattern /api/market/options uses, Yahoo-fallback) to find the
// exact contract by strike+type, then recompute real P/L + exit signals.
// Never invents a premium when the real fetch/match fails — the position
// is returned unchanged with its last real priced snapshot instead.
async function repriceOne(position) {
  const polyKey = process.env.POLYGON_API_KEY || "";
  let underlying = null, contract = null;

  try {
    if (polyKey) {
      const PH = { "Accept": "application/json" };
      const snapRes = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${position.symbol}?apiKey=${polyKey}`, { headers: PH });
      const snapJson = snapRes?.ok ? await snapRes.json().catch(() => ({})) : {};
      underlying = round2(snapJson?.ticker?.lastTrade?.p || snapJson?.ticker?.day?.c || snapJson?.ticker?.prevDay?.c || 0);

      const url = `https://api.polygon.io/v3/snapshot/options/${position.symbol}?limit=250&expiration_date=${position.expiry}&apiKey=${polyKey}`;
      const res = await fetch(url, { headers: PH });
      if (res?.ok) {
        const json = await res.json().catch(() => ({}));
        const results = json?.results || [];
        const match = results.find(r =>
          r.details?.contract_type === position.type &&
          Number(r.details?.strike_price) === Number(position.strike)
        );
        if (match) {
          const day = match.day || {}, g = match.greeks || {};
          contract = {
            lastPrice: round2(day.last_price || day.close || 0),
            bid: round2(match.last_quote?.bid || 0), ask: round2(match.last_quote?.ask || 0),
            iv: round2((match.implied_volatility || 0) * 100),
            delta: g.delta != null ? round2(g.delta) : null,
            gamma: g.gamma != null ? round2(g.gamma) : null,
            theta: g.theta != null ? round2(g.theta) : null,
            vega: g.vega != null ? round2(g.vega) : null,
          };
        }
      }
    } else {
      const chain = await fetchYahooOptionsChain(position.symbol, position.expiry);
      underlying = chain.underlying;
      const pool = position.type === "call" ? chain.calls : chain.puts;
      const match = (pool || []).find(c => Number(c.strike) === Number(position.strike));
      // Yahoo's chain has no greeks — honest null, never a guess.
      if (match) contract = { lastPrice: match.lastPrice, bid: match.bid, ask: match.ask, iv: match.iv, delta: null, gamma: null, theta: null, vega: null };
    }
  } catch (err) {
    console.error("[paper-positions] reprice fetch error:", err?.message);
  }

  if (!contract) return position;

  const premium = contract.lastPrice > 0 ? contract.lastPrice : (contract.bid + contract.ask) / 2;
  if (!(premium > 0)) return position;

  const exitSignals = computeExitSignals(
    { ...position, currentPremium: premium },
    { ivRank: null, daysToEarnings: null, delta: contract.delta }
  );
  // Real per-contract Greeks (Polygon-only, honest null on Yahoo fallback)
  // — persisted so Phase 13's portfolio-level Greeks aggregation can sum
  // them across open positions with zero new fetches.
  const greeks = { delta: contract.delta, gamma: contract.gamma, theta: contract.theta, vega: contract.vega };
  return updatePositionPricing(position.id, { currentPremium: premium, currentUnderlying: underlying, exitSignals, greeks });
}

function serialize(position) {
  const { pnl, pnlPct } = computePositionPnl(position);
  return { ...position, pnl, pnlPct };
}

async function handlePaperPositions(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  if (pathname === "/api/paper-positions" && req.method === "GET") {
    const open = listOpenPositions().map(serialize);
    const closed = listClosedPositions().map(serialize);
    return writeJson(res, 200, { ok: true, open, closed });
  }

  if (pathname === "/api/paper-positions/open" && req.method === "POST") {
    const body = await new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
    });
    const { symbol, type, strike, expiry, contractSymbol, qty, entryPremium, entryUnderlying, entryAiScore, entryStrategy, entryMarketBias } = body;
    if (!symbol || !strike || !expiry || !(Number(entryPremium) > 0)) {
      return writeJson(res, 400, { ok: false, error: "symbol, strike, expiry, and a real entryPremium are required." });
    }
    const position = openPosition({ symbol, type, strike, expiry, contractSymbol, qty, entryPremium, entryUnderlying, entryAiScore, entryStrategy, entryMarketBias });
    return writeJson(res, 200, { ok: true, position: serialize(position) });
  }

  const closeMatch = pathname.match(/^\/api\/paper-positions\/([^/]+)\/close$/);
  if (closeMatch && req.method === "POST") {
    const body = await new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
    });
    const position = getPosition(closeMatch[1]);
    if (!position) return writeJson(res, 404, { ok: false, error: "Position not found." });
    const exitPremium = Number(body.exitPremium) > 0 ? Number(body.exitPremium) : position.currentPremium;
    const closed = closePosition(closeMatch[1], { exitPremium, exitReason: body.exitReason || "manual" });
    // Journal auto-logging happens client-side (rhpro-journal.jsx's store
    // is browser localStorage, not server state) — the client calls
    // rhSaveJournal() itself right after this response, using the same
    // real closed-position fields returned here. No server-side write.
    return writeJson(res, 200, { ok: true, position: serialize(closed) });
  }

  const repriceMatch = pathname.match(/^\/api\/paper-positions\/([^/]+)\/reprice$/);
  if (repriceMatch && req.method === "POST") {
    const position = getPosition(repriceMatch[1]);
    if (!position) return writeJson(res, 404, { ok: false, error: "Position not found." });
    if (position.status !== "open") return writeJson(res, 200, { ok: true, position: serialize(position) });
    const repriced = await repriceOne(position);
    return writeJson(res, 200, { ok: true, position: serialize(repriced) });
  }

  return writeJson(res, 404, { ok: false, error: "Not found." });
}

// Periodic intraday reprice job — server.js's scheduler calls this every
// 15 min during market hours (same standalone setInterval pattern
// watchlist-institutional-alerts.js already uses, not the once-daily
// _sent!==today loop — this needs to run repeatedly all session, not
// once at close). Reuses the exact same repriceOne() the on-demand route
// above uses — one repricing implementation, two callers. Sends a real
// Telegram alert (already-established shouldSendAlert/sendTelegramMessage
// plumbing, "stop-trigger" category — always-allow, no new budget system)
// only when a real position's exitScore just crossed into "Exit Now".
async function repriceAllOpenPositions() {
  const { isMarketHoursET } = require("../risk-guardrails");
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };

  const open = listOpenPositions();
  let repriced = 0, alerted = 0;
  for (const position of open) {
    const before = position.exitSignals?.recommendation;
    const updated = await repriceOne(position);
    repriced++;
    const after = updated?.exitSignals?.recommendation;
    if (after === "Exit Now" && before !== "Exit Now") {
      try {
        const { shouldSendAlert } = require("../telegram-bot");
        const { sendTelegramMessage } = require("../telegram");
        if (shouldSendAlert({ category: "stop-trigger" })) {
          const { pnl, pnlPct } = computePositionPnl(updated);
          await sendTelegramMessage(
            `⚠️ PAPER POSITION EXIT SIGNAL\n${updated.symbol} ${updated.type?.toUpperCase()} $${updated.strike} exp ${updated.expiry}\nReal P/L: ${pnl != null ? `$${pnl} (${pnlPct}%)` : "n/a"}\nReal AI Exit Score: ${updated.exitSignals?.exitScore}/100 — Exit Now\n${(updated.exitSignals?.reasons || []).join("; ")}`
          ).catch(() => {});
          alerted++;
        }
      } catch (err) {
        console.error("[paper-positions] exit alert failed:", err?.message);
      }
    }
  }
  return { ok: true, repriced, alerted };
}

module.exports = { handlePaperPositions, repriceOne, repriceAllOpenPositions };
