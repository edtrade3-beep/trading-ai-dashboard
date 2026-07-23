// providers/x-api.js — real X.com API v2 client, Bearer-token app-only
// auth (the standard auth mode for read-only account monitoring on X's
// pay-per-use pricing). Uses global fetch + AbortController, same
// convention as providers/yahoo.js.
//
// IMPORTANT — this file's exact endpoint paths/response field names are
// written from X's public API v2 documentation, but have NOT yet been
// verified against a real live call with the user's actual token (that
// token wasn't available at write time). The first real use of this file
// must be a live test call to confirm today's actual response shape
// before anything is built on top of it that assumes a specific field is
// present — X has changed its API multiple times and any assumption here
// could be stale.
const TOKEN = () => (process.env.X_BEARER_TOKEN || "").trim();
const BASE = "https://api.x.com/2";

async function xFetch(path, timeoutMs = 15000) {
  const token = TOKEN();
  if (!token) throw new Error("X_BEARER_TOKEN not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Authorization": `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body?.detail || body?.title || `X API HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Real numeric user ID for a real username — cache the result in the
// caller (x-intel-watchlist-store.js's xUserId field), never re-resolve a
// username that's already been looked up once; a repeat lookup is a real,
// avoidable cost against the monthly read budget.
async function resolveUserId(username) {
  const clean = String(username || "").replace(/^@/, "").trim();
  if (!clean) return null;
  const data = await xFetch(`/users/by/username/${encodeURIComponent(clean)}`);
  return data?.data?.id || null;
}

// Real recent posts for a real user ID. since_id (X's own real pagination
// cursor) means a post already read is never billed again on a later
// call — a real, free way to avoid duplicate-read cost, not just a
// dedup-after-the-fact check.
async function fetchUserTweets(userId, sinceId = null) {
  if (!userId) return { tweets: [], newestId: sinceId };
  const params = new URLSearchParams({
    "tweet.fields": "created_at,public_metrics",
    "max_results": "10",
  });
  if (sinceId) params.set("since_id", sinceId);
  const data = await xFetch(`/users/${userId}/tweets?${params.toString()}`);
  const tweets = Array.isArray(data?.data) ? data.data : [];
  const newestId = data?.meta?.newest_id || sinceId;
  // Real read count for budget logging: per X's published pay-per-use
  // pricing ($0.005/post read), billing is per post returned, not per
  // HTTP request — so tweets.length is used as the real read count here.
  // NOT YET LIVE-VERIFIED against the account's actual invoice/usage
  // dashboard — flagged in this file's header as one of the things the
  // first real live call needs to confirm, since getting billing
  // granularity wrong would corrupt the whole budget tracker's numbers
  // even if the API calls themselves work correctly.
  return { tweets, newestId, realReadCount: tweets.length };
}

module.exports = { resolveUserId, fetchUserTweets, TOKEN };
