// x-intel-ai.js — X Intelligence Engine synthesis, without the X API.
//
// Real constraint, stated once here rather than re-litigated at every call
// site: there is no free, ToS-compliant way to scrape or monitor X.com
// directly (X's Terms of Service explicitly prohibit scraping, X actively
// blocks/bans/sues scrapers, and bridges like Nitter are the same
// violation one layer removed — confirmed via the plan reviewed with the
// user before this file was written). What this file actually does
// instead: the exact same real web_search-grounding mechanism already
// proven in command-center-ai.js/advisor-ai.js — Claude searches real news
// coverage of what a watched public figure/account/org said, and every
// item logged carries a real source citation. This is watchlist-scoped and
// schema-richer than Command Center's general event feed, not a
// duplicate of it.
//
// Never available through this method (disclosed, not faked): per-post
// like/reply/repost/view counts, images/video, the exact original post
// timestamp (only when real coverage of it was published). No field for
// any of these exists in the schema below.
const { callAnthropicWithSearch } = require("./anthropic");
const { list: listWatchlist, update: updateWatchlistEntry } = require("./x-intel-watchlist-store");
const { logItem, findRecentDuplicate } = require("./x-intel-store");
const { logPrediction } = require("./predictions-store");
const { sectorOf } = require("./risk-guardrails");
const { fetchYahooQuoteBatch } = require("./providers/yahoo");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();

const CATEGORIES = [
  "Breaking News", "Politics", "Tariffs", "Earnings", "AI", "Semiconductor",
  "Crypto", "Inflation", "InterestRates", "FederalReserve", "Acquisition",
  "Healthcare", "Energy", "Consumer", "Macro", "Other",
];

const DEDUP_WINDOW_MS = 48 * 3600_000; // same 48h cooldown convention used elsewhere in this app
const HIGH_PRIORITY_IMPORTANCE = 90; // Telegram-alert condition 3: watched high-priority account

function clamp0to100(n, fallback = null) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : fallback;
}

function sanitizeMarketImpact(raw, watchedByUsername) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((m) => {
    const direction = m?.direction === "bearish" ? "bearish" : m?.direction === "bullish" ? "bullish" : null;
    const symbol = String(m?.symbol || "").toUpperCase().trim();
    if (!symbol || !direction) return null;
    return {
      symbol,
      assetType: ["stock", "etf", "index", "commodity", "sector"].includes(m?.assetType) ? m.assetType : "stock",
      direction,
      confidence: clamp0to100(m?.confidence, 50),
      expectedDurationDays: Number.isFinite(Number(m?.expectedDurationDays)) ? Math.max(1, Math.min(60, Math.round(Number(m.expectedDurationDays)))) : 5,
      reasoning: String(m?.reasoning || "").slice(0, 220),
      sector: sectorOf(symbol),
    };
  }).filter(Boolean);
}

function sanitizeItem(raw, watchedByUsername) {
  // Strip a leading "@" before lookup — the prompt shows accounts as
  // "@realDonaldTrump", so the model's echoed entityUsername very likely
  // includes it, but watchedByUsername's keys (from the real watchlist
  // store) never do. Confirmed live: without this, every item silently
  // failed this match and got dropped (0 items logged across 12 scanned
  // accounts on the very first production run).
  const rawUsername = String(raw?.entityUsername || "").replace(/^@/, "").toLowerCase();
  const entity = watchedByUsername.get(rawUsername);
  if (!entity) return null; // AI referenced an entity not actually on the watchlist — drop, don't guess
  const oneLine = String(raw?.aiSummary?.oneLine || "").slice(0, 140);
  const sourceCitation = String(raw?.sourceCitation || "").trim();
  if (!oneLine || !sourceCitation || !/^https?:\/\//.test(sourceCitation)) return null; // no real citation — drop rather than log an ungrounded item
  const category = CATEGORIES.includes(raw?.category) ? raw.category : "Other";
  return {
    entityUsername: entity.username,
    entityDisplayName: entity.displayName,
    entityCategory: entity.category,
    entityImportanceScore: entity.importanceScore,
    capturedAt: new Date().toISOString(),
    sourceCitation,
    text: String(raw?.text || "").slice(0, 500),
    sentiment: ["bullish", "bearish", "neutral"].includes(raw?.sentiment) ? raw.sentiment : "neutral",
    confidence: clamp0to100(raw?.confidence, 50),
    urgency: ["low", "medium", "high"].includes(raw?.urgency) ? raw.urgency : "low",
    category,
    marketImpact: sanitizeMarketImpact(raw?.marketImpact, watchedByUsername),
    aiSummary: {
      oneLine,
      executive: String(raw?.aiSummary?.executive || "").slice(0, 400),
      whyItMatters: String(raw?.aiSummary?.whyItMatters || "").slice(0, 300),
      possibleReaction: String(raw?.aiSummary?.possibleReaction || "").slice(0, 250),
      risks: String(raw?.aiSummary?.risks || "").slice(0, 250),
      opportunities: String(raw?.aiSummary?.opportunities || "").slice(0, 250),
    },
    scores: {
      impactScore: clamp0to100(raw?.scores?.impactScore, 30),
      confidenceScore: clamp0to100(raw?.scores?.confidenceScore, 50),
      urgencyScore: clamp0to100(raw?.scores?.urgencyScore, 20),
      aiRating: clamp0to100(raw?.scores?.aiRating, 50),
    },
  };
}

const SYSTEM = `You are the X Intelligence Engine for a real trading desk. You do NOT have access to the X/Twitter API or any scraper — your only tool is real web search. Search real news coverage (Reuters, Bloomberg, CNBC, AP, and similar) for genuinely NEW public statements or posts attributed to the specific watched accounts/people/orgs given to you below, published very recently (last 24-48 hours). For each REAL item you find with a real, citable source URL:

- text: a real quote or accurate paraphrase of what was actually said — never invent a quote.
- sentiment (bullish/bearish/neutral), confidence 0-100 that this is genuinely market-relevant, urgency (low/medium/high), category (exactly one of: ${CATEGORIES.join("/")}).
- marketImpact: array of real, specific stocks/ETFs/indexes/commodities/sectors this plausibly affects — for each: assetType, direction (bullish/bearish only), confidence 0-100, expectedDurationDays (how long the effect plausibly persists), reasoning (one clipped fact, not a sentence).
- aiSummary: oneLine (under 15 words), executive (2-3 sentences), whyItMatters, possibleReaction, risks, opportunities — all short and concrete, grounded in the real search result.
- scores: impactScore/confidenceScore/urgencyScore/aiRating, each 0-100, each a real assessment not a filler number.

CRITICAL: only report items you can genuinely cite with a real URL from your search — never fabricate a post, quote, or statement. If a watched account has nothing new and real to report, simply omit it. Do not pad the list to hit a target count. entityUsername must be the exact username WITHOUT the "@" symbol (e.g. "realDonaldTrump", not "@realDonaldTrump").

Return JSON ONLY, no text outside it:
{"items":[{"entityUsername":"...","sourceCitation":"https://...","text":"...","sentiment":"bullish|bearish|neutral","confidence":0-100,"urgency":"low|medium|high","category":"...","marketImpact":[{"symbol":"...","assetType":"stock|etf|index|commodity|sector","direction":"bullish|bearish","confidence":0-100,"expectedDurationDays":N,"reasoning":"..."}],"aiSummary":{"oneLine":"...","executive":"...","whyItMatters":"...","possibleReaction":"...","risks":"...","opportunities":"..."},"scores":{"impactScore":0-100,"confidenceScore":0-100,"urgencyScore":0-100,"aiRating":0-100}}]}`;

// 40, not the original 12 — confirmed live: with a 32-account watchlist and
// several default entries scored 85+, the top-12 cutoff permanently
// excluded 20 real accounts (including 14 of 16 the user had just added)
// from ever being scanned, no matter how many times the watchlist was
// refreshed. Raising this doesn't meaningfully raise cost — maxSearches
// (below) is what actually bounds the number of real web searches per
// run, not how many accounts are listed in the prompt.
async function runXIntelGeneration({ topN = 40 } = {}) {
  if (!KEY()) return { ok: false, error: "ANTHROPIC_API_KEY not set" };

  const watchlist = listWatchlist().filter((w) => w.status === "active");
  if (!watchlist.length) return { ok: false, error: "watchlist is empty" };

  // Bounded fan-out, prioritized — same discipline every real-data scan in
  // this app already uses (advisor-ai.js's holdingFund fetch, etc.).
  const prioritized = [...watchlist].sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0)).slice(0, topN);
  const watchedByUsername = new Map(prioritized.map((w) => [w.username.toLowerCase(), w]));

  const watchlistLines = prioritized.map((w) => `@${w.username} (${w.displayName}, ${w.category}, importance ${w.importanceScore})`).join("\n");
  const prompt = `WATCHED ACCOUNTS/ENTITIES (search for real recent statements/coverage of each; skip any with nothing new and real to report):\n${watchlistLines}\n\nSearch now and return the JSON.`;

  let raw;
  try {
    raw = await callAnthropicWithSearch(prompt + "\n\n" + SYSTEM, KEY(), { model: "claude-sonnet-4-6", maxTokens: 8000, maxSearches: 4 });
  } catch (e) {
    return { ok: false, error: `AI call failed: ${e.message}` };
  }

  let parsed;
  try {
    const m = (raw || "").match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : raw);
  } catch {
    return { ok: false, error: "AI response was not valid JSON" };
  }

  const candidates = (Array.isArray(parsed.items) ? parsed.items : []).map((r) => sanitizeItem(r, watchedByUsername)).filter(Boolean);

  // Dedup against the rolling 48h window before logging anything.
  const newItems = candidates.filter((it) => !findRecentDuplicate(it.entityUsername, it.aiSummary.oneLine, DEDUP_WINDOW_MS));

  // Real current prices for every symbol mentioned, once, batched — the
  // "entry" reference point for grading (see predictions-store.js usage
  // below). Not a fabricated price target: it's the real price at capture
  // time, and grading is direction-only against a disclosed % band, never
  // a specific invented price level.
  const allSymbols = [...new Set(newItems.flatMap((it) => it.marketImpact.map((m) => m.symbol)))];
  let quotes = [];
  if (allSymbols.length) { try { quotes = await fetchYahooQuoteBatch(allSymbols); } catch { quotes = []; } }
  const priceBySymbol = {};
  for (const q of quotes) {
    const p = Number(q.regularMarketPrice);
    if (Number.isFinite(p) && p > 0) priceBySymbol[String(q.symbol || "").toUpperCase()] = p;
  }

  const GRADING_BAND_PCT = 0.03; // disclosed direction-confirmation threshold, not a price prediction

  const logged = [];
  for (const it of newItems) {
    const saved = logItem(it);
    logged.push(saved);

    // Update the watchlist entry's real lastSeenPost/lastChecked.
    const entry = watchedByUsername.get(it.entityUsername.toLowerCase());
    if (entry) {
      try { updateWatchlistEntry(entry.id, { lastSeenPost: it.capturedAt, lastChecked: new Date().toISOString() }); } catch {}
    }

    // Log each real-symbol market-impact call into the shared predictions
    // ledger — same real, code-graded (not AI self-graded) accuracy
    // tracking Command Center's trade ideas already use.
    for (const m of it.marketImpact) {
      const price = priceBySymbol[m.symbol];
      if (!price) continue; // no real current price — don't log an ungradeable prediction
      const direction = m.direction === "bullish" ? "LONG" : "SHORT";
      const band = price * GRADING_BAND_PCT;
      try {
        logPrediction({
          symbol: m.symbol,
          direction,
          entry: Math.round(price * 100) / 100,
          stop: Math.round((direction === "LONG" ? price - band : price + band) * 100) / 100,
          target1: Math.round((direction === "LONG" ? price + band : price - band) * 100) / 100,
          confidence: m.confidence,
          holdingPeriodDays: m.expectedDurationDays,
          generatedAt: it.capturedAt,
          source: "x-intel",
        });
      } catch {}
    }
  }

  // Mark every checked entity's lastChecked even when nothing new was
  // found — real evidence the scan ran, not just silence.
  for (const w of prioritized) {
    if (!logged.some((it) => it.entityUsername === w.username)) {
      try { updateWatchlistEntry(w.id, { lastChecked: new Date().toISOString() }); } catch {}
    }
  }

  // Telegram alerts — exactly the spec's three OR conditions.
  if (telegramConfigured() && shouldSendAlert({ category: "ai-coach" })) {
    for (const it of logged) {
      const highPriority = (it.entityImportanceScore || 0) >= HIGH_PRIORITY_IMPORTANCE;
      const breaking = it.category === "Breaking News";
      const highImpact = it.scores.impactScore > 80;
      if (!(highPriority || breaking || highImpact)) continue;
      const tags = [breaking && "BREAKING", highImpact && `IMPACT ${it.scores.impactScore}`, highPriority && "HIGH-PRIORITY ACCT"].filter(Boolean).join(" · ");
      const impactLines = it.marketImpact.slice(0, 3).map((m) => `${m.direction === "bullish" ? "🟢" : "🔴"} ${m.symbol} (${m.confidence}%)`).join(" ");
      const msg = `🐦 *X INTEL* — ${tags}\n\n@${it.entityUsername}: ${it.aiSummary.oneLine}\n${impactLines}\n\n${it.sourceCitation}`;
      sendTelegramMessage(msg).catch(() => {});
    }
  }

  return { ok: true, newItemsCount: logged.length, scanned: prioritized.length };
}

module.exports = { runXIntelGeneration, CATEGORIES };
