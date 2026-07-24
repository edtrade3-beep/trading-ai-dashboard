// x-intel-rss.js — free path for X Intel's official/company accounts.
// Zero AI cost: these orgs publish real, free, public RSS feeds directly,
// which is both cheaper AND faster than waiting for AI web search to find
// news coverage of them. Confirmed live (2026-07-21, expanded 2026-07-23)
// — each URL below returns real RSS/Atom content, verified by hand (curl,
// checked real HTTP 200 + real channel title) before wiring in. Skipped
// candidates that failed verification rather than guess: Reuters (every
// tested URL either 401'd or connection-failed — looks bot-blocked) and
// legacy Twitter-instance-RSS-bridge services (deliberately not used —
// solving a paid-API dependency by routing through an unofficial
// third-party scraper isn't "free data", it's a fragile, unverifiable
// substitute).
//
// Honesty discipline: every logged item carries a real source URL and
// real title/summary text. Real AI sentiment classification was brought
// back 2026-07 per explicit user request (see x-intel-sentiment-ai.js) —
// a small, focused Anthropic call, not a full re-analysis. What this path
// still does NOT do — and must not fabricate — is deeper AI-style
// analysis: no market-impact symbol calls, no confidence/impact scores,
// no executive summaries. Those require real reasoning this free path
// still doesn't perform. Items are marked analysisSource:"rss" and
// sentimentAnalyzed reflects whether a real AI call actually classified
// this specific item; no prediction gets logged for them (logPrediction
// is only called from Command Center, where a full reasoned call is made).
"use strict";

const { fetchRssItems } = require("./rss-fetch");
const { list: listWatchlist } = require("./x-intel-watchlist-store");
const { logItem, findRecentDuplicate } = require("./x-intel-store");
const mentionsStore = require("./x-intel-mentions-store");
const { classifySentiment } = require("./x-intel-sentiment-ai");

// username (matches watchlist entries) -> { url, itemCategory }. Only
// entities with a confirmed-working free feed are listed; everyone else
// (individual people with no official feed) stays on the AI search path.
const KNOWN_RSS_FEEDS = {
  federalreserve: { url: "https://www.federalreserve.gov/feeds/press_all.xml", itemCategory: "FederalReserve" },
  SECGov: { url: "https://www.sec.gov/news/pressreleases.rss", itemCategory: "FederalReserve" },
  WhiteHouse: { url: "https://www.whitehouse.gov/presidential-actions/feed/", itemCategory: "Politics" },
  NVIDIA: { url: "https://nvidianews.nvidia.com/releases.xml", itemCategory: "Semiconductor" },
  Apple: { url: "https://www.apple.com/newsroom/rss-feed.rss", itemCategory: "Other" },
  OpenAI: { url: "https://openai.com/news/rss.xml", itemCategory: "AI" },
  // Added 2026-07-23 — real official/targeted feeds for 6 more watchlist
  // accounts that were previously only reachable via paid X API reads.
  // Deliberately picked the targeted section feed over each org's general
  // homepage/all-news firehose where one exists (WSJ Markets not WSJ all,
  // FT Markets not FT homepage, CNBC Economy not CNBC all) — matches the
  // user's "no junk data" instruction.
  Microsoft: { url: "https://news.microsoft.com/source/feed/", itemCategory: "Other" },
  AMD: { url: "https://ir.amd.com/rss/news-releases.xml", itemCategory: "Semiconductor" },
  WSJ: { url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", itemCategory: "Macro" },
  FinancialTimes: { url: "https://www.ft.com/markets?format=rss", itemCategory: "Macro" },
  CNBC: { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", itemCategory: "Macro" },
  ProSyn: { url: "https://www.project-syndicate.org/rss", itemCategory: "Macro" },
};

const DEDUP_WINDOW_MS = 48 * 3600_000;
const RECENT_PER_FEED = 8; // only look at the most recent N items per poll — older ones were either already logged or predate this feature

function toIso(pubDate) {
  const d = pubDate ? new Date(pubDate) : null;
  return d && !isNaN(d) ? d.toISOString() : new Date().toISOString();
}

async function runXIntelRssPoll() {
  const watchlist = listWatchlist();
  const byUsername = new Map(watchlist.map((w) => [w.username, w]));
  let newItemsCount = 0;
  const feedsPolled = [];

  for (const [username, feed] of Object.entries(KNOWN_RSS_FEEDS)) {
    const entity = byUsername.get(username);
    if (!entity || entity.status !== "active") continue; // respect real user removals
    feedsPolled.push(username);
    let items;
    try {
      items = await fetchRssItems(feed.url);
    } catch (e) {
      console.warn(`[X-Intel RSS] ${username} feed fetch failed:`, e.message);
      continue;
    }
    for (const raw of items.slice(0, RECENT_PER_FEED)) {
      const oneLine = raw.title.slice(0, 140);
      if (findRecentDuplicate(username, oneLine, DEDUP_WINDOW_MS)) continue;
      // Real AI sentiment classification, brought back 2026-07 per
      // explicit user request — see x-intel-sentiment-ai.js's header.
      // Dedup already ran above, so this never spends a real AI call on
      // an item that's about to be discarded.
      const { sentiment, confidence, analyzed } = await classifySentiment(raw.summary || raw.title);
      const item = {
        entityUsername: entity.username,
        entityDisplayName: entity.displayName,
        entityCategory: entity.category,
        entityImportanceScore: entity.importanceScore,
        // capturedAt must be "when we logged this," not the article's real
        // publish date — findRecentDuplicate's 48h dedup window compares
        // against capturedAt, and the AI path always uses logging time.
        // Confirmed live bug: using the real pubDate here meant any item
        // older than 48h (common — these feeds return weeks of history)
        // permanently failed the dedup check and got re-logged every poll.
        // publishedAt keeps the real original date for honest UI display.
        capturedAt: new Date().toISOString(),
        publishedAt: toIso(raw.pubDate),
        sourceCitation: raw.link,
        text: raw.summary || raw.title,
        sentiment,
        confidence,
        sentimentAnalyzed: analyzed, // real disclosure flag, same as the X API path
        urgency: "low",
        category: feed.itemCategory,
        marketImpact: [], // honest — no reasoned symbol-level call made; fabricating one would violate this app's real-data-only rule
        aiSummary: {
          oneLine,
          executive: (raw.summary || "").slice(0, 400),
          whyItMatters: "", possibleReaction: "", risks: "", opportunities: "",
        },
        scores: null, // honest — not AI-scored; UI shows "—" instead of a fabricated number
        analysisSource: "rss",
      };
      logItem(item);
      // Category-level only — RSS items never get a real symbol-level call
      // (see the honesty note on marketImpact above), so there's no real
      // symbol/sector/theme to log here, just that a real item landed in
      // this category, for Trend Velocity's topic-level rollups.
      mentionsStore.logMention({ source: "rss", category: feed.itemCategory });
      newItemsCount++;
    }
  }
  return { ok: true, newItemsCount, feedsPolled };
}

module.exports = { runXIntelRssPoll, KNOWN_RSS_FEEDS };
