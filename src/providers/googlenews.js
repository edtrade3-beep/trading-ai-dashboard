// Google News RSS — free, no API key, and (unlike Yahoo's JSON API) not
// IP-blocked from cloud hosts like Render. Aggregates hundreds of outlets.
// Returns items shaped like the other news providers.
function stripTags(s) { return String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(); }
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  if (!m) return "";
  return stripTags(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

// fetchGoogleNews(query, limit) — query is usually a ticker; we append "stock".
async function fetchGoogleNews(query, limit = 10) {
  const q = encodeURIComponent(`${query} stock`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, limit).map((m) => {
      const block = m[1] || "";
      let title = tag(block, "title");
      const source = tag(block, "source") || "Google News";
      // Google appends " - Publisher" to titles; trim it for cleanliness.
      title = title.replace(new RegExp(`\\s*[-–]\\s*${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`), "");
      const pub = tag(block, "pubDate");
      return {
        title: title || "Untitled",
        publisher: source, source,
        link: tag(block, "link"),
        publishedAt: pub ? new Date(pub).toISOString() : null,
        summary: "",
        ticker: String(query).toUpperCase(),
      };
    }).filter((n) => n.title && n.title !== "Untitled");
  } catch { return []; }
}

module.exports = { fetchGoogleNews };
