// x-intel-rss.js — free path for X Intel's official/company accounts.
// Zero AI cost: these orgs publish real, free, public RSS feeds directly,
// which is both cheaper AND faster than waiting for AI web search to find
// news coverage of them. Confirmed live (2026-07-21) — each URL below
// returns real RSS/Atom content, verified by hand before wiring in.
//
// Honesty discipline, same as the AI path: every logged item carries a
// real source URL and real title/summary text. What this path does NOT
// do — and must not fabricate — is AI-style analysis: no sentiment
// judgment, no market-impact symbol calls, no confidence/impact scores.
// Those require real reasoning this free path doesn't perform. Items are
// marked analysisSource:"rss" so the UI can show them as real-but-
// unanalyzed, and no prediction gets logged for them (logPrediction is
// only called from the AI path, where a real reasoned call was made).
"use strict";

const { fetchRssItems } = require("./rss-fetch");
const { list: listWatchlist } = require("./x-intel-watchlist-store");
const { logItem, findRecentDuplicate } = require("./x-intel-store");

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
        sentiment: "neutral", // honest — no AI judgment performed on this path
        confidence: null,
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
      newItemsCount++;
    }
  }
  return { ok: true, newItemsCount, feedsPolled };
}

module.exports = { runXIntelRssPoll, KNOWN_RSS_FEEDS };
