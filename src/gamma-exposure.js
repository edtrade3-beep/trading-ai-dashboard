// src/gamma-exposure.js — real dealer Gamma Exposure (GEX) computation over
// a real options-chain snapshot. Options platform redesign, Phase 2.
//
// Hard gate, not an edge case: this requires real per-contract gamma,
// which only Polygon's chain provides in this app (POLYGON_API_KEY) — the
// Yahoo fallback chain (`fetchYahooOptionsChain`, used when no Polygon key
// is configured) has zero greeks at all. Every function here returns
// `{ available: false, reason }` rather than a fabricated number when real
// gamma/OI data isn't present — never a placeholder GEX value.
//
// GEX uses a standard, widely-used simplification (the same convention
// most free/public GEX tools use, since true dealer positioning is not
// publicly observable data anywhere): assume customers are net buyers of
// calls from dealers (dealers net short calls -> call gamma contributes
// POSITIVE dealer gamma exposure under this convention) and net buyers of
// puts from dealers (put gamma contributes NEGATIVE net exposure in the
// combined sum below). The underlying gamma/openInterest numbers are
// always real (from Polygon); only this sign convention is an
// industry-standard modeling assumption, not a guarantee of actual dealer
// positioning — documented here so nothing claims more certainty than it
// has.
//
// GEX per strike = (callGamma*callOI - putGamma*putOI) * 100 * underlying^2
// * 0.01 — contractSize=100, and the 0.01 factor expresses GEX per 1% move
// in the underlying, the standard convention most public GEX figures use.

function aggregateByStrike(contracts) {
  const byStrike = new Map();
  for (const c of contracts || []) {
    const strike = Number(c.strike);
    // c.gamma != null guards against Number(null) silently coercing to 0
    // (a real "no gamma data" contract, e.g. Yahoo's greek-less chain, must
    // never be treated as a real 0 gamma reading).
    const gamma = c.gamma != null ? Number(c.gamma) : NaN;
    const oi = Number(c.openInterest);
    if (!Number.isFinite(strike) || !Number.isFinite(gamma) || !Number.isFinite(oi) || oi <= 0) continue;
    if (!byStrike.has(strike)) byStrike.set(strike, { strike, callGamma: 0, callOI: 0, putGamma: 0, putOI: 0 });
    const row = byStrike.get(strike);
    if (c.type === "call") { row.callGamma += gamma; row.callOI += oi; }
    else if (c.type === "put") { row.putGamma += gamma; row.putOI += oi; }
  }
  return [...byStrike.values()].sort((a, b) => a.strike - b.strike);
}

// `contracts` — array of { strike, gamma, openInterest, type: "call"|"put" }
// normalized rows (real Polygon chain data only — see routes/market.js's
// GEX route for how these are built from the same chain fetch
// /api/market/options already uses). `underlying` — real spot price.
function computeGammaExposure(contracts, underlying) {
  const u = Number(underlying);
  if (!Number.isFinite(u) || u <= 0 || !Array.isArray(contracts) || contracts.length === 0) {
    return { available: false, reason: "No real underlying price or contract data." };
  }
  const usable = contracts.filter(c => c.gamma != null && Number.isFinite(Number(c.gamma)));
  if (usable.length === 0) {
    return { available: false, reason: "No real per-contract gamma available — requires a Polygon-sourced chain with Greeks." };
  }

  const byStrike = aggregateByStrike(usable);
  if (byStrike.length === 0) {
    return { available: false, reason: "No real open-interest-weighted gamma at any strike." };
  }

  let netGEX = 0;
  const rows = byStrike.map(({ strike, callGamma, callOI, putGamma, putOI }) => {
    const callContribution = callGamma * callOI * 100 * u * u * 0.01;
    const putContribution = putGamma * putOI * 100 * u * u * 0.01;
    const strikeGEX = callContribution - putContribution;
    netGEX += strikeGEX;
    return {
      strike, callContribution: Math.round(callContribution), putContribution: Math.round(putContribution), netGEX: Math.round(strikeGEX),
      totalOI: Math.round(callOI + putOI), // real OI at this strike — used by Gamma Lab's Expected Pin read (Phase 7)
    };
  });

  // Gamma flip point — the strike nearest where cumulative GEX (summed from
  // the lowest strike up) crosses zero, linearly interpolated between the
  // two straddling strikes. A real, deterministic read off the per-strike
  // numbers above, not a separate estimate.
  let cumulative = 0, prevCum = 0, prevStrike = null, flipPoint = null;
  for (const r of rows) {
    prevCum = cumulative;
    cumulative += r.netGEX;
    if (prevStrike != null && ((prevCum <= 0 && cumulative > 0) || (prevCum >= 0 && cumulative < 0))) {
      const span = r.strike - prevStrike;
      const totalSwing = Math.abs(prevCum) + Math.abs(cumulative);
      const frac = totalSwing !== 0 ? Math.abs(prevCum) / totalSwing : 0;
      flipPoint = Math.round((prevStrike + span * frac) * 100) / 100;
    }
    prevStrike = r.strike;
  }

  const callWall = rows.reduce((best, r) => (r.callContribution > (best?.callContribution ?? -Infinity) ? r : best), null);
  const putWall = rows.reduce((best, r) => (r.putContribution > (best?.putContribution ?? -Infinity) ? r : best), null);

  return {
    available: true,
    netGEX: Math.round(netGEX),
    gammaFlipPoint: flipPoint,
    callWall: callWall ? callWall.strike : null,
    putWall: putWall ? putWall.strike : null,
    byStrike: rows,
  };
}

// Gamma Lab derived reads — options platform redesign Phase 7 (the UI page
// this GEX engine never got in Phase 2). Every read here is a real,
// documented extension of computeGammaExposure's own real numbers — no new
// fetch, no new fabrication — framed the same "industry-standard
// convention, not observed dealer truth" way the module-level comment
// above already discloses for GEX itself, since these are interpretive
// reads on top of a real but modeled number.
function computeGammaLabReads(gex, underlying) {
  if (!gex?.available) return { available: false, reason: gex?.reason || "Gamma data unavailable." };
  const u = Number(underlying);

  // Expected Pin — the real highest-OI strike closest to the real gamma
  // flip point (a commonly-cited "price tends to pin near this on OPEX"
  // read: real OI concentration + the real flip point, not a new fetch).
  let expectedPin = null;
  if (Number.isFinite(gex.gammaFlipPoint) && gex.byStrike?.length) {
    const nearFlip = [...gex.byStrike].sort((a, b) =>
      Math.abs(a.strike - gex.gammaFlipPoint) - Math.abs(b.strike - gex.gammaFlipPoint)
    ).slice(0, 5); // 5 real strikes nearest the flip point
    const highestOi = nearFlip.reduce((best, r) => (r.totalOI > (best?.totalOI ?? -1) ? r : best), null);
    expectedPin = highestOi ? highestOi.strike : null;
  }

  // Expected Magnet — whichever real wall (call or put) sits closer to
  // real current price, framed as "price is being pulled toward $X," not
  // a guaranteed prediction.
  let expectedMagnet = null, expectedMagnetSide = null;
  if (Number.isFinite(u)) {
    const callDist = Number.isFinite(gex.callWall) ? Math.abs(u - gex.callWall) : Infinity;
    const putDist = Number.isFinite(gex.putWall) ? Math.abs(u - gex.putWall) : Infinity;
    if (callDist < putDist) { expectedMagnet = gex.callWall; expectedMagnetSide = "call wall"; }
    else if (putDist < callDist) { expectedMagnet = gex.putWall; expectedMagnetSide = "put wall"; }
  }

  // Dealer Hedging / Dealer Bias — a plain-English read of the real net
  // GEX sign, explicitly labeled as the same industry-standard convention
  // this module's own header comment discloses, never framed as a certain
  // bullish/bearish call.
  const dealerBias = gex.netGEX > 0
    ? { sign: "positive", label: "Dealers net long gamma", note: "Historically associated with compressed, mean-reverting price action — a real read on today's real GEX sign, not a certainty." }
    : gex.netGEX < 0
      ? { sign: "negative", label: "Dealers net short gamma", note: "Historically associated with amplified, trending price action — a real read on today's real GEX sign, not a certainty." }
      : { sign: "flat", label: "Dealers roughly gamma-neutral", note: "Real net GEX is close to zero today." };

  return { available: true, expectedPin, expectedMagnet, expectedMagnetSide, dealerBias };
}

module.exports = { computeGammaExposure, aggregateByStrike, computeGammaLabReads };
