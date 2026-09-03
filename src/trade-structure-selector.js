"use strict";
// Trade GPS (2026-09-03) — the stock-vs-option structure selector. The
// one genuinely new decision logic this whole feature adds (confirmed
// via repo-wide audit: zero existing spread-selection logic anywhere).
// Deliberately pure and reusable (not Trade-GPS-only), matching this
// platform's "no second engine" mandate — a real selection FUNCTION over
// data the canonical pipeline/caller already has, not a new engine.
//
// Pure math over an already-fetched real option chain, same philosophy
// as options-math.js's own header comment: no fetches, no fabrication,
// null/honest-fallback on missing real data. The caller is responsible
// for fetching the real chain (this file never calls a provider).
const { spreadPct, liquidityScore, dteFromExpiry, theta, breakEven, expectedMove, rankContracts } = require("./options-math");

// Documented judgment calls, not standard-industry constants — same
// convention as options-math.js's own liquidityScore weights.
const MIN_LIQUIDITY = 40;
const MAX_SPREAD_PCT = 10;
const HIGH_IV_RANK = 60;
const DEFAULT_MAX_STALE_MINUTES = 15;
const CONTRACT_MULTIPLIER = 100;

function contractPremium(c) {
  const bid = Number(c?.bid), ask = Number(c?.ask);
  if (Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid && bid > 0) return (bid + ask) / 2;
  return Number.isFinite(Number(c?.lastPrice)) ? Number(c.lastPrice) : null;
}

function enrichContract(c, { underlying, isCall, maxStaleMinutes }) {
  const dte = Number.isFinite(c?.dte) ? c.dte : dteFromExpiry(c?.expiry);
  const spread = spreadPct({ bid: c?.bid, ask: c?.ask });
  const liquidity = liquidityScore({ bid: c?.bid, ask: c?.ask, openInterest: c?.openInterest, volume: c?.volume });
  // Real quote-freshness check (spec's own explicit "available live quote
  // freshness" requirement) — a contract with no disclosed real age is
  // treated as stale (fail-closed), never assumed fresh.
  const stale = !Number.isFinite(c?.quoteAgeMinutes) || c.quoteAgeMinutes > maxStaleMinutes;
  const premium = contractPremium(c);
  return { ...c, dte, spread, liquidity, stale, premium };
}

// Compares stock vs. call vs. put vs. call-spread vs. put-spread vs.
// no-trade for one real ticker, per the spec's own explicit rule set.
// direction: "LONG" (call-side structures) or "SHORT" (put-side).
function selectTradeStructure({
  symbol = null, price = null, direction = "LONG",
  stopDistance = null, targetDistance = null,
  optionChain = [], ivRank = null, tradeGpsScore = null,
  maxStaleMinutes = DEFAULT_MAX_STALE_MINUTES,
} = {}) {
  const rejectedAlternatives = [];
  if (!symbol || !Number.isFinite(price) || price <= 0) {
    return { structure: "NO_TRADE", reason: "missing real symbol/price", rejectedAlternatives };
  }

  const isCall = direction !== "SHORT";
  const sideLabel = isCall ? "CALL" : "PUT";
  const spreadLabel = isCall ? "CALL_SPREAD" : "PUT_SPREAD";

  const candidates = (optionChain || [])
    .filter((c) => c && c.isCall === isCall)
    .map((c) => enrichContract(c, { underlying: price, isCall, maxStaleMinutes }));

  const eligible = candidates.filter((c) => {
    if (c.stale) { rejectedAlternatives.push({ structure: sideLabel, strike: c.strike, reason: `stale real quote (${Number.isFinite(c.quoteAgeMinutes) ? c.quoteAgeMinutes + "min" : "unknown age"})` }); return false; }
    if (!Number.isFinite(c.liquidity) || c.liquidity < MIN_LIQUIDITY) { rejectedAlternatives.push({ structure: sideLabel, strike: c.strike, reason: `poor real liquidity (${c.liquidity ?? "n/a"}/100)` }); return false; }
    if (c.spread != null && c.spread > MAX_SPREAD_PCT) { rejectedAlternatives.push({ structure: sideLabel, strike: c.strike, reason: `wide real spread (${c.spread}%)` }); return false; }
    if (!Number.isFinite(c.dte) || c.dte <= 0) { rejectedAlternatives.push({ structure: sideLabel, strike: c.strike, reason: "no valid real DTE" }); return false; }
    if (!Number.isFinite(c.premium) || c.premium <= 0) { rejectedAlternatives.push({ structure: sideLabel, strike: c.strike, reason: "no real tradable premium (bid/ask/last all missing)" }); return false; }
    return true;
  });

  if (!eligible.length) {
    return {
      structure: "STOCK",
      reason: candidates.length
        ? "every real option contract failed the liquidity/spread/freshness/DTE gate — real stock preferred"
        : "no real option chain data available — real stock preferred",
      rejectedAlternatives,
    };
  }

  const ranked = rankContracts(eligible, { underlying: price, isCall, aiTradeScore: tradeGpsScore?.score ?? null });
  const best = ranked[0];
  const bestTheta = theta({ iv: best.iv, strike: best.strike, underlying: price, dte: best.dte, isCall });
  const bestBreakEven = breakEven({ strike: best.strike, premium: best.premium, isCall });
  const bestExpectedMove = expectedMove({ iv: best.iv, underlying: price, dte: best.dte });
  const bestMaxLoss = Math.round(best.premium * CONTRACT_MULTIPLIER * 100) / 100;

  // Prefer a real defined-risk spread when IV is elevated (naked premium
  // genuinely overpriced) or the real target is limited relative to the
  // real stop (a spread caps cost for a bounded real move) — spec's own
  // explicit preference rule.
  const preferSpread = (Number.isFinite(ivRank) && ivRank >= HIGH_IV_RANK) ||
    (Number.isFinite(targetDistance) && Number.isFinite(stopDistance) && stopDistance > 0 && targetDistance < stopDistance * 1.5);

  if (preferSpread) {
    // Spread-leg selection is deliberately independent of rankContracts'
    // general-purpose naked-option ranking (which optimizes for real
    // POP/liquidity/alignment, not "closest real strike to the money") —
    // a real vertical debit spread's long leg is the closest-to-the-money
    // real eligible strike, with the short leg the next real strike
    // further OTM in the same real expiry. Relying on rankContracts'
    // "best" here can pick the FURTHER-OTM contract as best, leaving no
    // real further-OTM leg to build a spread against.
    const strikeSorted = [...eligible].sort((a, b) => (isCall ? a.strike - b.strike : b.strike - a.strike));
    const longLeg = strikeSorted[0];
    const shortLeg = strikeSorted.find((c) => c.expiry === longLeg.expiry && c.strike !== longLeg.strike) || null;
    if (shortLeg) {
      const longTheta = theta({ iv: longLeg.iv, strike: longLeg.strike, underlying: price, dte: longLeg.dte, isCall });
      const longExpectedMove = expectedMove({ iv: longLeg.iv, underlying: price, dte: longLeg.dte });
      const netDebit = Math.max(0, longLeg.premium - shortLeg.premium);
      const width = Math.abs(shortLeg.strike - longLeg.strike);
      return {
        structure: spreadLabel,
        reason: `elevated IV or limited real target favors a defined-risk ${spreadLabel === "CALL_SPREAD" ? "call" : "put"} spread over naked premium`,
        contract: longLeg,
        spreadLegs: { long: longLeg, short: shortLeg },
        breakEven: isCall ? Math.round((longLeg.strike + netDebit) * 100) / 100 : Math.round((longLeg.strike - netDebit) * 100) / 100,
        theta: longTheta, expectedMove: longExpectedMove,
        maxLoss: Math.round(netDebit * CONTRACT_MULTIPLIER * 100) / 100,
        maxGain: Math.round((width - netDebit) * CONTRACT_MULTIPLIER * 100) / 100,
        rejectedAlternatives: [...rejectedAlternatives, { structure: sideLabel, reason: "elevated IV/limited real target — defined-risk spread preferred over naked premium" }],
      };
    }
    rejectedAlternatives.push({ structure: spreadLabel, reason: "no real further-OTM contract available in the same expiry to build a spread" });
  }

  return {
    structure: sideLabel,
    reason: "best real liquid contract clears every real gate — naked premium preferred over stock/spread",
    contract: best, breakEven: bestBreakEven, theta: bestTheta, expectedMove: bestExpectedMove,
    maxLoss: bestMaxLoss,
    rejectedAlternatives,
  };
}

module.exports = { selectTradeStructure, MIN_LIQUIDITY, MAX_SPREAD_PCT, HIGH_IV_RANK, DEFAULT_MAX_STALE_MINUTES, CONTRACT_MULTIPLIER };
