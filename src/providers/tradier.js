const { fetchJsonSafe, round2 } = require("../utils");

function nextFridayIso() {
  const d = new Date();
  const day = d.getUTCDay();
  const add = (5 - day + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

function normalizeTradierOptionContract(symbol, raw) {
  const side = String(raw?.option_type || "").toUpperCase() === "CALL" ? "CALL" : "PUT";
  const strike = Number(raw?.strike);
  const volume = Number(raw?.volume || 0);
  const openInterest = Number(raw?.open_interest || 0);
  const lastPrice = Number(raw?.last || raw?.mark || raw?.bid || 0);
  if (!Number.isFinite(strike) || strike <= 0) return null;
  const notional = lastPrice > 0 ? lastPrice * Math.max(volume, 0) * 100 : 0;
  let tradeType = volume >= 1200 ? "BLOCK" : volume >= 200 ? "SWEEP" : "TAPE";
  if (notional >= 500000 && volume >= 300) tradeType = "DARKPOOL";
  return {
    symbol,
    side,
    strike: round2(strike),
    volume: Math.max(0, Math.round(volume)),
    openInterest: Math.max(0, Math.round(openInterest)),
    lastPrice: round2(lastPrice),
    notional: round2(notional),
    expiry: raw?.expiration_date || null,
    tradeType,
    unusual: volume >= 50 && volume > openInterest * 1.2,
    estimated: false,
  };
}

async function fetchTradierOptionsFlowForSymbol(symbol, expirationIso, tradierKey) {
  const url = `https://api.tradier.com/v1/markets/options/chains?symbol=${encodeURIComponent(symbol)}&expiration=${encodeURIComponent(expirationIso)}&greeks=false`;
  const payload = await fetchJsonSafe(url, {
    Authorization: `Bearer ${tradierKey}`,
    Accept: "application/json",
  });
  const contracts = payload?.options?.option;
  const list = Array.isArray(contracts) ? contracts : (contracts ? [contracts] : []);
  if (!list.length) return null;

  const normalized = list
    .map((raw) => normalizeTradierOptionContract(symbol, raw))
    .filter(Boolean)
    .sort((a, b) => (b.notional || 0) - (a.notional || 0));
  if (!normalized.length) return null;

  const calls = normalized.filter((x) => x.side === "CALL");
  const puts = normalized.filter((x) => x.side === "PUT");
  const callNotional = calls.reduce((acc, x) => acc + (x.notional || 0), 0);
  const putNotional = puts.reduce((acc, x) => acc + (x.notional || 0), 0);
  const callPutRatio = putNotional > 0 ? round2(callNotional / putNotional) : (callNotional > 0 ? 9.99 : 0);
  return {
    symbol,
    expiration: expirationIso,
    callPutRatio,
    flowRows: normalized.slice(0, 14),
  };
}

async function fetchTradierOptionsFlow(symbols, tradierKey) {
  if (!tradierKey || !symbols.length) return [];
  const exp = nextFridayIso();
  const rows = await Promise.all(symbols.map((symbol) => fetchTradierOptionsFlowForSymbol(symbol, exp, tradierKey)));
  return rows.filter(Boolean);
}

module.exports = { fetchTradierOptionsFlow, fetchTradierOptionsFlowForSymbol, normalizeTradierOptionContract, nextFridayIso };
