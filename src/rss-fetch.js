// rss-fetch.js — free, real RSS/Atom polling for X Intel's official-account
// sources (Fed, White House, SEC, company newsrooms). These are genuine,
// free, public press-release feeds — zero AI cost, zero ToS risk, and
// actually faster than AI web search since the org publishes directly
// rather than waiting for news coverage to pick it up. No XML dependency:
// a small regex parser, matching this codebase's existing plain-Node style.
"use strict";

const https = require("node:https");

function get(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AMTradingPlatform/1.0)" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Some real feeds (e.g. ir.amd.com) 301 to a relative path with no
        // scheme/host — https.get() throws "Invalid URL" on that directly.
        // Resolve against the original request URL, same as a browser would.
        const target = new URL(res.headers.location, url).toString();
        get(target, timeoutMs).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("RSS fetch timeout")));
  });
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

function atomLink(block) {
  const m = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1] : "";
}

// Parses both RSS 2.0 (<item>) and Atom (<entry>) feeds — both real formats
// confirmed live across the sources this feeds (Apple's newsroom is Atom,
// the rest are RSS 2.0).
function parseFeed(xml) {
  const items = [];
  const isAtom = /<feed\b/i.test(xml) && !/<rss\b/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const title = tag(block, "title");
    const link = isAtom ? atomLink(block) : tag(block, "link");
    const guid = tag(block, "guid") || tag(block, "id") || link;
    const pubDate = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated");
    const summary = tag(block, "description") || tag(block, "summary") || tag(block, "content");
    if (!title || !link) continue;
    items.push({ title, link, guid: guid || link, pubDate, summary: summary.slice(0, 400) });
  }
  return items;
}

async function fetchRssItems(url) {
  const xml = await get(url);
  return parseFeed(xml);
}

module.exports = { fetchRssItems };
