// Shared client-side cache + dedup for GET /api/market/trend-screen?withDecision=1
// — the one place Trade Desk/Cortex/Dashboard/Scanner/Holdings/Autopilot UI
// consumers should read a per-symbol canonical AssetDecision from, instead of
// each independently fetching/computing its own. Same dedup principle as
// quote-store.js's fetchSharedQuotes (that file's own comment has the fuller
// rationale): collapse identical concurrent requests into one shared
// in-flight promise, and reuse a settled result inside a real freshness
// window instead of refetching on every render/remount.
//
// This is a pure fetch/cache layer over the existing canonical API contract
// — it never computes, derives, or fabricates a verdict, score, or price
// itself. A symbol with no resolved decision yet is represented honestly
// (loading:true, assetDecision:null), never with a fallback number.

const _decisionCache = new Map(); // normalized symbol -> { entry, ts, promise }

// Real freshness window: long enough that ticker switching back to a
// recently-viewed symbol or a tab remount doesn't refire a real network
// request, short enough that a stale canonical decision never silently
// outlives a real market move. Independent of DEDUP_WINDOW_MS below, which
// only exists to collapse same-tick duplicate calls, not to define
// freshness.
const DECISION_TTL_MS = 30_000;
// Same same-tick-duplicate collapse window as quote-store.js's
// QUOTE_DEDUP_TTL_MS — short enough to only ever catch truly simultaneous
// callers (e.g. Trade Desk and Cortex both mounting for the same symbol in
// the same tick), never to change a caller's real data freshness.
const DEDUP_WINDOW_MS = 4000;

function normalizeSymbol(sym) {
  return String(sym || "").trim().toUpperCase();
}

function emptyEntry(symbol) {
  return { symbol, assetDecision: null, marketRegime: null, dataHealth: null, fetchedAt: null, loading: true, error: null };
}

// Synchronous read of the last-known entry (or an honest loading
// placeholder if nothing has resolved yet) — for a consumer that wants to
// paint immediately without awaiting a promise (e.g. a skeleton state).
export function getCachedDecision(symbol) {
  const key = normalizeSymbol(symbol);
  const hit = _decisionCache.get(key);
  return hit?.entry || emptyEntry(key);
}

// True once a resolved entry exists but has aged past the freshness
// window — the signal a consumer should use to show a stale-data warning
// rather than silently trusting an old verdict.
export function isDecisionStale(symbol) {
  const key = normalizeSymbol(symbol);
  const entry = _decisionCache.get(key)?.entry;
  if (!entry?.fetchedAt) return false;
  return Date.now() - entry.fetchedAt > DECISION_TTL_MS;
}

// Fetches (or reuses an in-flight/fresh-enough cached) canonical decision
// for one real symbol. Resolves with the same shape getCachedDecision
// returns. Never rejects — a network/parse failure resolves to an honest
// { error } entry so callers don't need their own try/catch.
export function fetchDecision(symbol) {
  const key = normalizeSymbol(symbol);
  if (!key) return Promise.resolve(emptyEntry(""));

  const now = Date.now();
  const hit = _decisionCache.get(key);

  // A request for this exact symbol is already in flight — share it
  // rather than firing a second one.
  if (hit?.promise) return hit.promise;

  // A settled result is still inside the real freshness window — reuse it.
  if (hit?.entry && !hit.entry.loading && !hit.entry.error && now - hit.ts < DECISION_TTL_MS) {
    return Promise.resolve(hit.entry);
  }

  const promise = fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(key)}&withDecision=1`)
    .then((r) => {
      if (!r.ok) throw new Error(`trend-screen ${r.status}`);
      return r.json();
    })
    .then((data) => {
      const row = Array.isArray(data?.results) ? data.results.find((x) => normalizeSymbol(x?.symbol) === key) : null;
      // A row can legitimately exist with no assetDecision (e.g. no real
      // opportunity/regime data to build one from yet) — that is honestly
      // an "unavailable" state for any verdict-consuming caller, not a
      // silent null, so it must set `error` too rather than only doing so
      // when the row itself is entirely missing.
      let error = null;
      if (!row) error = "no real data returned for symbol";
      else if (row.error) error = row.error;
      else if (!row.assetDecision) error = "canonical decision unavailable";
      const entry = {
        symbol: key,
        assetDecision: row?.assetDecision || null,
        marketRegime: row?.marketRegime || data?.marketRegime || null,
        dataHealth: row?.dataHealth || data?.dataHealth || null,
        fetchedAt: Date.now(),
        loading: false,
        error,
      };
      _decisionCache.set(key, { entry, ts: Date.now(), promise: null });
      return entry;
    })
    .catch((err) => {
      const entry = { symbol: key, assetDecision: null, marketRegime: null, dataHealth: null, fetchedAt: Date.now(), loading: false, error: err.message };
      _decisionCache.set(key, { entry, ts: Date.now(), promise: null });
      return entry;
    });

  _decisionCache.set(key, { entry: hit?.entry || emptyEntry(key), ts: now, promise });
  return promise;
}

// Test-only escape hatch — production callers never need this, the module
// state is meant to persist for the life of the page.
export function _resetDecisionCacheForTests() {
  _decisionCache.clear();
}
