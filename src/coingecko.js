"use strict";
/**
 * coingecko.js
 * Real market-wide BTC dominance — CoinGecko's public /global endpoint,
 * no API key, no paid tier. Replaces the app's own BTC/(BTC+ETH+SOL)
 * proxy (computed from only the 3 coins this app tracks) with the real
 * figure across the entire tracked crypto market.
 */

const URL = "https://api.coingecko.com/api/v3/global";
const CACHE_TTL_MS = 30 * 60 * 1000; // dominance moves slowly; 30min is fresh enough

let cache = null; // { btcDominance, ethDominance, fetchedAt }

async function fetchBtcDominance() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;

  const res = await fetch(URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const json = await res.json();
  const pct = json?.data?.market_cap_percentage;
  const btcDominance = Number(pct?.btc);
  const ethDominance = Number(pct?.eth);
  if (!Number.isFinite(btcDominance)) throw new Error("No btc dominance in CoinGecko response");

  cache = {
    btcDominance: Number(btcDominance.toFixed(2)),
    ethDominance: Number.isFinite(ethDominance) ? Number(ethDominance.toFixed(2)) : null,
    fetchedAt: Date.now(),
  };
  return cache;
}

module.exports = { fetchBtcDominance };
