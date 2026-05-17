// Simple in-memory token bucket rate limiter, per IP address.
// Buckets are pruned every 10 minutes to prevent unbounded memory growth.

const buckets = new Map();

const WINDOW_MS = 60 * 1000;   // 1 minute window
const MAX_REQUESTS = 60;        // 60 requests per IP per minute on market routes

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS * 10) buckets.delete(ip);
  }
}, 10 * 60 * 1000).unref();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function checkRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  let bucket = buckets.get(ip);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = { windowStart: now, count: 0 };
    buckets.set(ip, bucket);
  }

  bucket.count += 1;
  return bucket.count <= MAX_REQUESTS;
}

module.exports = { checkRateLimit };
