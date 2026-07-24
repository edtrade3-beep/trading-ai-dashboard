// alpaca-client.js — real, shared Alpaca PAPER trading-API REST client.
// Extracted from 3 independent copies of the same real logic found during
// the Quick Trade Engine build: routes/alpaca.js's alpaca(), trailing-
// stops.js's apca(), and providers/alpaca-data.js's separate key resolver
// (that file hits a different real host — data.alpaca.markets, not
// paper-api.alpaca.markets — so only its key-resolution logic, not its
// full request wrapper, is genuinely shared with this one; scoped
// accordingly rather than forcing two different real APIs into one
// wrapper that doesn't actually fit both).
//
// PAPER only — never live. Same real constraint the pre-extraction copies
// already enforced; keep it here as the one place that could ever change it.
const BASE = "https://paper-api.alpaca.markets";

function resolveAlpacaKeys() {
  return {
    id: process.env.ALPACA_KEY_ID || process.env.ALPACA_API_KEY_ID || "",
    secret: process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET_KEY || "",
  };
}

function isAlpacaConfigured() {
  const { id, secret } = resolveAlpacaKeys();
  return Boolean(id && secret);
}

// Real trading-API request. Response shape is a real superset of what both
// pre-extraction copies used (ok/status/data, plus the legacy _ok/_status
// aliases routes/alpaca.js's existing call sites already read) so neither
// caller needed its own response-shape adaptation beyond what's noted at
// each call site.
async function alpacaTradingRequest(path, method = "GET", body = null) {
  const { id, secret } = resolveAlpacaKeys();
  if (!id || !secret) return { ok: false, status: 0, data: null, _ok: false, _status: 0, _noKey: true };
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "APCA-API-KEY-ID": id,
      "APCA-API-SECRET-KEY": secret,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data, _ok: r.ok, _status: r.status };
}

module.exports = { BASE, resolveAlpacaKeys, isAlpacaConfigured, alpacaTradingRequest };
