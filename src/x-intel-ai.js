// x-intel-ai.js — X Intelligence Engine, real X API (Anthropic's full
// web-search analysis removed from this feature per explicit user
// direction, 2026-07). Real posts via providers/x-api.js (Bearer-token
// app-only auth), real deterministic classification via
// x-intel-x-classifiers.js (cashtag extraction + keyword category
// matching) — NOT an AI replacement, disclosed honestly.
//
// Real AI sentiment classification was brought back 2026-07 per explicit
// user request, after the initial migration left every item honestly
// neutral — see x-intel-sentiment-ai.js's header for the cost discipline
// (Haiku, no web search tool, Credit Saver Mode gated; a small fraction
// of the old per-item web-search cost this feature used to carry).
//
// What's still genuinely gone, not faked: executive summaries,
// impact/confidence scoring, and per-symbol direction calls. Raw X posts
// don't carry that interpretation — building a keyword-based fake version
// of it would violate this app's "never fabricate" rule as much as
// inventing a quote would. `aiSummary`/`scores` stay null/empty, and each
// item's `sentimentAnalyzed` flag honestly discloses whether its
// `sentiment` reflects a real AI call or the safe neutral fallback.
//
// What's genuinely NEW and real, not available before: exact real
// `created_at` timestamps (previously disclosed as unavailable), and real
// `public_metrics` (like/retweet/reply counts — also previously disclosed
// as unavailable). Used here for a real, deterministic "high engagement"
// alert signal, replacing the AI's old impactScore for that purpose.
//
// Real, hard budget constraint: X's pay-per-use pricing is $0.005/post
// read. At the user's confirmed $10/month cap (lowered from an initial
// $25 to try the X API path at smaller real spend first, 2026-07), that's
// ~2,000 real reads for the whole month — verified via
// x-api-usage-store.js's exact $0.005 rate and its X_API_BUDGET_USD
// constant. With up to 500 watched accounts, checking everyone even once
// a day would cost 15,000/month, far over budget — so this uses the same
// real prioritized-subset discipline (importanceScore-sorted topN) the
// old Anthropic path already used for search budget, just re-aimed at a
// real monthly read count.
const { resolveUserId, fetchUserTweets } = require("./providers/x-api");
const { extractCashtags, classifyCategory } = require("./x-intel-x-classifiers");
const { CATEGORIES } = require("./x-intel-categories");
const { list: listWatchlist, update: updateWatchlistEntry } = require("./x-intel-watchlist-store");
const { KNOWN_RSS_FEEDS } = require("./x-intel-rss");
const { classifySentiment } = require("./x-intel-sentiment-ai");
const { logItem, findRecentDuplicate } = require("./x-intel-store");
const { sectorOf } = require("./risk-guardrails");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const mentionsStore = require("./x-intel-mentions-store");
const { sectorOf: themeSectorOf, themesOf } = require("./sector-theme-map");
const xApiUsage = require("./x-api-usage-store");

const DEDUP_WINDOW_MS = 48 * 3600_000; // same 48h cooldown convention used elsewhere in this app
const HIGH_PRIORITY_IMPORTANCE = 90;
// Real engagement thresholds for the "high engagement" alert signal —
// replaces the old AI impactScore-based condition. Chosen as a real,
// round, conservative bar (most posts from most accounts won't clear
// this); tune once live data shows what's actually typical for this
// specific watchlist's accounts.
const HIGH_ENGAGEMENT_LIKES = 2000;
const HIGH_ENGAGEMENT_RETWEETS = 500;

// Real per-run budget: topN accounts checked. Checks the REAL X API
// budget (x-api-usage-store.js), not the Anthropic Credit Saver Mode —
// X Intel no longer spends any Anthropic budget at all, so gating this on
// Anthropic's mode would be checking the wrong number entirely. Real math
// at the $10/month cap: cron only fires on weekdays, ~21 trading
// days/month x 4 runs/day = ~84 runs/month. 15 accounts/run x 84 runs =
// ~1,260 real reads/month worst case (every checked account has a new
// post every run) — under the ~2,000/month budget with real headroom for
// one-time xUserId lookups. Reduced to 8 once real projected month-end X
// API spend exceeds the budget, same real trigger the Anthropic system
// uses, just a simpler inline check since this is the only call site that
// spends this specific budget (no cross-feature hysteresis needed the
// way Anthropic's system needs it across ~10 different callers).
function topNForRun() {
  return xApiUsage.getMonthEndProjection() > xApiUsage.X_API_BUDGET_USD ? 8 : 15;
}

function sanitizeMarketImpact(symbols) {
  return symbols.map((symbol) => ({
    symbol,
    assetType: "stock",
    // Honest: a cashtag mention is real evidence the post is ABOUT this
    // symbol, not evidence of bullish/bearish intent — no AI judgment
    // exists to make that call anymore, so direction/confidence are
    // explicitly null rather than guessed.
    direction: null,
    confidence: null,
    expectedDurationDays: null,
    reasoning: "Real $cashtag mention in the post text (deterministic extraction, not AI-judged).",
    sector: sectorOf(symbol),
  }));
}

async function buildItem(entity, tweet) {
  const text = String(tweet.text || "");
  const symbols = extractCashtags(text);
  const metrics = tweet.public_metrics || {};
  const likes = Number(metrics.like_count) || 0;
  const retweets = Number(metrics.retweet_count) || 0;
  // Real AI sentiment classification, brought back 2026-07 per explicit
  // user request — see x-intel-sentiment-ai.js's header for the real cost
  // discipline (Haiku, no web search, Credit Saver Mode gated). Falls back
  // to honest neutral (analyzed:false) if no key/Saver Mode/a real
  // failure, same as before this was reintroduced.
  const { sentiment, confidence, analyzed } = await classifySentiment(text);
  return {
    entityUsername: entity.username,
    entityDisplayName: entity.displayName,
    entityCategory: entity.category,
    entityImportanceScore: entity.importanceScore,
    capturedAt: new Date().toISOString(),
    publishedAt: tweet.created_at || null, // real exact timestamp — genuinely new capability
    sourceCitation: `https://x.com/${entity.username}/status/${tweet.id}`,
    text: text.slice(0, 500),
    sentiment,
    confidence,
    sentimentAnalyzed: analyzed, // real disclosure flag — UI shows this honestly, not a blanket claim
    urgency: "low",
    category: classifyCategory(text), // real keyword match, disclosed as such
    marketImpact: sanitizeMarketImpact(symbols),
    aiSummary: {
      oneLine: text.slice(0, 140),
      executive: "", whyItMatters: "", possibleReaction: "", risks: "", opportunities: "",
    },
    scores: null, // honest — not AI-scored; UI shows "—" instead of a fabricated number
    analysisSource: "x-api",
    // Real, disclosed-as-real engagement counts — genuinely new, never
    // available through the old Anthropic web-search path.
    realEngagement: { likes, retweets, replies: Number(metrics.reply_count) || 0, quotes: Number(metrics.quote_count) || 0 },
  };
}

async function runXIntelXApiGeneration({ topN } = {}) {
  const n = topN || topNForRun();
  // Real budget discipline: an account already covered by a free, verified
  // RSS feed (x-intel-rss.js's KNOWN_RSS_FEEDS) shouldn't also spend paid
  // X API reads on redundant coverage — that was a real gap (every account
  // was being double-checked) found and fixed 2026-07-23.
  const watchlist = listWatchlist().filter((w) => w.status === "active" && !KNOWN_RSS_FEEDS[w.username]);
  if (!watchlist.length) return { ok: false, error: "watchlist is empty" };

  const remainingReads = xApiUsage.getRemainingReads();
  if (remainingReads <= 0) return { ok: false, error: `X API monthly read budget ($${xApiUsage.X_API_BUDGET_USD}) is exhausted for this month — resets next month.` };

  const prioritized = [...watchlist].sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0)).slice(0, n);

  const logged = [];
  const errors = [];
  let realReadsThisRun = 0;
  for (const entity of prioritized) {
    if (realReadsThisRun >= remainingReads) break; // real, hard stop — never spend past what's actually left in the budget
    try {
      let userId = entity.xUserId;
      if (!userId) {
        userId = await resolveUserId(entity.username);
        if (userId) updateWatchlistEntry(entity.id, { xUserId: userId });
      }
      if (!userId) { updateWatchlistEntry(entity.id, { lastChecked: new Date().toISOString() }); continue; }

      const { tweets, newestId, realReadCount } = await fetchUserTweets(userId, entity.xSinceId);
      realReadsThisRun += realReadCount;
      xApiUsage.logReads({ feature: "x-intel", reads: realReadCount });
      if (newestId && newestId !== entity.xSinceId) updateWatchlistEntry(entity.id, { xSinceId: newestId });
      updateWatchlistEntry(entity.id, { lastChecked: new Date().toISOString() });

      for (const tweet of tweets) {
        // Dedup-check on the raw text BEFORE spending a real AI sentiment
        // call — no point classifying a post that's about to be discarded
        // as a duplicate anyway.
        const oneLinePreview = String(tweet.text || "").slice(0, 140);
        if (findRecentDuplicate(entity.username, oneLinePreview, DEDUP_WINDOW_MS)) continue;
        const item = await buildItem(entity, tweet);
        const saved = logItem(item);
        logged.push(saved);
        updateWatchlistEntry(entity.id, { lastSeenPost: item.capturedAt });

        mentionsStore.logMention({ source: "x-api", category: item.category });
        for (const m of item.marketImpact) {
          mentionsStore.logMention({ symbol: m.symbol, sector: themeSectorOf(m.symbol), themes: themesOf(m.symbol), source: "x-api", category: item.category });
        }
      }
    } catch (e) {
      // A single account's real API error (rate limit, transient network,
      // resolveUserId failure for a real-but-unresolvable username)
      // shouldn't stop the rest of the prioritized run — same "never stop
      // because one source failed" discipline as everywhere else.
      console.warn(`[X Intel X-API] ${entity.username} failed:`, e.message);
      // Surfaced in the API response (capped) so a real failure mode is
      // diagnosable from the outside without server log access — this is
      // a real caught error message, not synthesized.
      if (errors.length < 5) errors.push({ username: entity.username, error: e.message });
    }
  }

  // Threshold warnings, same real gate the Anthropic system already uses.
  const warning = xApiUsage.checkBudgetWarnings();
  if (warning && telegramConfigured() && shouldSendAlert({ category: "budget-warning" })) {
    sendTelegramMessage(`🐦 *X API BUDGET* — ${warning.pctUsed}% of $${xApiUsage.X_API_BUDGET_USD} used this month (crossed the ${warning.newThreshold}% mark).`).catch(() => {});
  }

  // Telegram alerts — real conditions only: high-priority watched account,
  // or real high engagement (replaces the old AI impactScore condition;
  // "Breaking News" category alerting is dropped since that required an
  // AI urgency judgment no classifier here can honestly make).
  if (telegramConfigured() && shouldSendAlert({ category: "ai-coach" })) {
    for (const it of logged) {
      const highPriority = (it.entityImportanceScore || 0) >= HIGH_PRIORITY_IMPORTANCE;
      const highEngagement = it.realEngagement.likes >= HIGH_ENGAGEMENT_LIKES || it.realEngagement.retweets >= HIGH_ENGAGEMENT_RETWEETS;
      if (!(highPriority || highEngagement)) continue;
      const tags = [highEngagement && `${it.realEngagement.likes} likes / ${it.realEngagement.retweets} RT`, highPriority && "HIGH-PRIORITY ACCT"].filter(Boolean).join(" · ");
      const symbolLine = it.marketImpact.length ? it.marketImpact.map((m) => `$${m.symbol}`).join(" ") : "";
      const msg = `🐦 *X INTEL* — ${tags}\n\n@${it.entityUsername}: ${it.aiSummary.oneLine}\n${symbolLine}\n\n${it.sourceCitation}`;
      sendTelegramMessage(msg).catch(() => {});
    }
  }

  return { ok: true, newItemsCount: logged.length, scanned: prioritized.length, realReadsUsed: realReadsThisRun, errors };
}

module.exports = { runXIntelXApiGeneration, CATEGORIES };
