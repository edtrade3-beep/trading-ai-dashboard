// Fed Interpreter — fetches the latest FOMC monetary-policy statement (text, published ~2pm ET)
// and scores it dovish↔hawkish. Works with no AI key via keyword scoring; you can also POST your own text.
const { writeJson } = require("../utils");

// Weighted phrases — multi-word phrases carry more signal than single keywords.
const DOVISH = [["rate cut", 3], ["cut the target", 3], ["lower the target", 3], ["reduce the target", 3], ["decided to lower", 4], ["easing", 2], ["accommodative", 2], ["downside risk", 2], ["softening", 2], ["cooling", 2], ["below target", 2], ["weakened", 2], ["moderat", 1], ["slower pace", 2], ["patient", 1], ["decline", 1], ["unemployment has risen", 2], ["job gains have slowed", 2]];
const HAWKISH = [["rate increase", 3], ["raise the target", 3], ["additional firming", 4], ["decided to raise", 4], ["restrictive", 2], ["elevated", 2], ["persistent", 2], ["remain higher", 2], ["upside risk", 2], ["inflation remains", 2], ["strongly committed", 2], ["sufficiently restrictive", 3], ["firming", 1], ["robust", 1], ["above target", 2], ["vigilant", 1], ["tight labor", 2], ["overheating", 2]];

// Detect the actual policy decision (the single biggest signal).
function detectRateAction(t) {
  if (/decided to raise|raise the target range|increase the target range/.test(t)) return { action: "HIKE", weight: -4 };
  if (/decided to lower|lower the target range|reduce the target range|cut the target/.test(t)) return { action: "CUT", weight: 4 };
  if (/decided to maintain|maintain the target range|keep the target range|unchanged|left the target range/.test(t)) return { action: "HOLD", weight: 0 };
  return { action: "UNKNOWN", weight: 0 };
}

function scoreText(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return null;
  let dov = 0, haw = 0, dovHits = [], hawHits = [];
  for (const [w, wt] of DOVISH) if (t.includes(w)) { dov += wt; dovHits.push(w); }
  for (const [w, wt] of HAWKISH) if (t.includes(w)) { haw += wt; hawHits.push(w); }
  const rate = detectRateAction(t);
  // score 0-100, 100 = max dovish (risk-on). Decision is weighted heaviest.
  let score = 50 + (dov - haw) * 4 + rate.weight * 6;
  score = Math.max(3, Math.min(97, Math.round(score)));
  const bias = score >= 62 ? "DOVISH" : score <= 38 ? "HAWKISH" : "NEUTRAL";
  const read = bias === "DOVISH" ? "🟢 Risk-ON — supportive for stocks (especially growth/tech)."
    : bias === "HAWKISH" ? "🔴 Risk-OFF — pressure on stocks; favor defense/cash."
    : "🟡 Flat / mixed — no strong tilt; wait for the price reaction and Powell's tone.";
  const label = bias === "NEUTRAL" ? "FLAT" : bias;
  return { score, bias, label, read, rateAction: rate.action,
    dovishHits: dovHits.length, hawkishHits: hawHits.length, dovishTerms: dovHits, hawkishTerms: hawHits };
}

// Pull the readable statement body out of a federalreserve.gov press-release page.
async function fetchFullStatement(link) {
  if (!link) return "";
  try {
    const html = await fetch(link, { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.ok ? r.text() : "");
    if (!html) return "";
    const main = html.match(/<div[^>]*class="col-xs-12[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
    const body = (main ? main[1] : html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    // Keep the policy-statement portion (starts ~"Recent indicators" / "The Committee").
    const start = body.search(/recent indicators|the committee|economic activity/i);
    return start >= 0 ? body.slice(start, start + 4000) : body.slice(0, 4000);
  } catch { return ""; }
}

async function fetchLatestFedStatement() {
  try {
    const xml = await fetch("https://www.federalreserve.gov/feeds/press_monetary.xml", { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.ok ? r.text() : "");
    if (!xml) return null;
    const items = xml.split("<item>").slice(1);
    const pickFrom = (item, tag) => { const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : ""; };
    // Find the actual FOMC POLICY STATEMENT — skip discount-rate minutes, meeting minutes, implementation notes
    for (const item of items) {
      const title = pickFrom(item, "title");
      const tl = title.toLowerCase();
      if (tl.includes("discount rate") || tl.includes("minutes") || tl.includes("implementation note")) continue;
      if (tl.includes("fomc statement") || tl.includes("issues fomc") || (tl.includes("monetary policy") && tl.includes("statement"))) {
        const date = pickFrom(item, "pubDate");
        const ageDays = date ? Math.floor((Date.now() - new Date(date).getTime()) / 86400000) : null;
        return { title, date, ageDays, link: pickFrom(item, "link"), text: `${title}. ${pickFrom(item, "description")}` };
      }
    }
    return null;  // no policy statement found in the feed
  } catch { return null; }
}

// Market/analyst reaction to the latest Fed decision.
// Primary: Google News RSS (free, no key, no quota). Optional: Brave if a key is set.
async function fetchFromGoogleNews(query) {
  const url = "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=en-US&gl=US&ceid=US:en";
  const xml = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => (r.ok ? r.text() : ""));
  if (!xml) return [];
  const items = xml.split("<item>").slice(1);
  const pick = (s, tag) => { const m = s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : ""; };
  return items.slice(0, 8).map((it) => {
    let title = pick(it, "title");
    let source = pick(it, "source");
    // Google appends " - Publisher" to every title — strip it (use it as source if none).
    if (/ - [^-]+$/.test(title)) { if (!source) source = title.replace(/^.* - /, ""); title = title.replace(/ - [^-]+$/, ""); }
    const date = pick(it, "pubDate");
    return { title, url: pick(it, "link"), source, age: date ? new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "" };
  }).filter((h) => h.title);
}

async function fetchFedReactions() {
  try {
    const headlines = await fetchFromGoogleNews("FOMC Federal Reserve interest rate decision reaction");
    if (headlines.length) return { ok: true, headlines, source: "Google News" };
    return { ok: false, error: "No reaction headlines found right now." };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function handleFed(req, res, requestUrl) {
  if (requestUrl.pathname === "/api/market/fed-news") {
    const r = await fetchFedReactions();
    return writeJson(res, r.ok ? 200 : 200, r);
  }
  if (requestUrl.pathname !== "/api/market/fed-interpret") return writeJson(res, 404, { ok: false });

  // POST { text } — interpret pasted statement
  if (req.method === "POST") {
    let body = ""; for await (const c of req) body += c;
    let payload; try { payload = JSON.parse(body || "{}"); } catch { payload = {}; }
    const r = scoreText(payload.text);
    if (!r) return writeJson(res, 400, { ok: false, error: "no text" });
    return writeJson(res, 200, { ok: true, source: "pasted", ...r });
  }

  // GET — fetch latest official statement and score it (full body when available)
  const stmt = await fetchLatestFedStatement();
  if (!stmt) return writeJson(res, 200, { ok: false, reason: "no-statement", hint: "No FOMC statement found — the meeting may not have happened yet. Paste the statement text after 2pm ET on meeting day." });
  const fullBody = await fetchFullStatement(stmt.link);
  const scored = fullBody && fullBody.length > 200 ? fullBody : stmt.text;
  const r = scoreText(scored);
  const stale = stmt.ageDays != null && stmt.ageDays > 2;  // older than 2 days = last meeting's, not today's
  return writeJson(res, 200, { ok: true, source: "federalreserve.gov", title: stmt.title, date: stmt.date, ageDays: stmt.ageDays, stale, link: stmt.link, fullText: !!(fullBody && fullBody.length > 200), ...r });
}

module.exports = { handleFed };
