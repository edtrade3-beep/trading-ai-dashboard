// Shared client-side dedup for GET /api/market/quote — 11 independent
// components (TradeDeskTab, MarketTerminalTab, HoldingsTab, PortfolioTab,
// QuickTradePanel, RiskTrafficLight, terminal-panels, TradePlannerTab,
// RhProApex, DashboardTab, axiom-live's ticker refresh) each ran their own
// setInterval fetch against this endpoint (CTO audit finding). Several
// overlap heavily on symbols (SPY/QQQ/VIX show up in half of them) and on
// timing (many intervals are multiples of a common cadence), so near-
// simultaneous calls for the identical symbol set were common.
//
// This does NOT unify every caller onto one interval or one symbol set —
// RiskTrafficLight's 15s "panic detection" cadence is deliberately faster
// than the rest for a real safety reason, and every caller's own symbol
// list stays exactly as-is. It only collapses truly duplicate concurrent
// requests (identical symbols string, within a short window) into one real
// network call, sharing the in-flight promise — the same principle as the
// server's own `cached()` helper in src/utils.js, just with a TTL short
// enough (4s) to only ever catch same-tick duplicates, never to change any
// component's actual data freshness.
const _quoteStore = new Map();
const QUOTE_DEDUP_TTL_MS = 4000;

export function fetchSharedQuotes(symbolsParam) {
  const key = String(symbolsParam);
  const now = Date.now();
  const hit = _quoteStore.get(key);
  if (hit && now - hit.ts < QUOTE_DEDUP_TTL_MS) return hit.promise;
  const promise = fetch(`/api/market/quote?symbols=${encodeURIComponent(key)}`)
    .then(r => r.json())
    .catch((err) => { _quoteStore.delete(key); throw err; });
  _quoteStore.set(key, { ts: now, promise });
  return promise;
}
