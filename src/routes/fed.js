// Fed Interpreter — fetches the latest FOMC monetary-policy statement (text, published ~2pm ET)
// and scores it dovish↔hawkish. Works with no AI key via keyword scoring; you can also POST your own text.
const { writeJson } = require("../utils");

const DOVISH = ["cut", "cuts", "lower", "ease", "easing", "accommodative", "patient", "downside risk", "softening", "moderat", "slower", "weaken", "support", "below target", "cooling", "decline"];
const HAWKISH = ["raise", "hike", "increase", "tighten", "restrictive", "elevated", "persistent", "vigilant", "upside risk", "firm", "strong", "robust", "above target", "inflationary", "overheating", "remain higher"];

function scoreText(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return null;
  let dov = 0, haw = 0;
  for (const w of DOVISH) if (t.includes(w)) dov++;
  for (const w of HAWKISH) if (t.includes(w)) haw++;
  // score 0-100, 100 = max dovish (risk-on)
  let score = 50 + (dov - haw) * 7;
  score = Math.max(5, Math.min(95, Math.round(score)));
  const bias = score >= 65 ? "DOVISH" : score <= 35 ? "HAWKISH" : "NEUTRAL";
  const read = bias === "DOVISH" ? "🟢 Risk-ON — supportive for stocks (especially growth/tech)."
    : bias === "HAWKISH" ? "🔴 Risk-OFF — pressure on stocks; favor defense/cash."
    : "🟡 Mixed — wait for the price reaction and Powell's tone.";
  return { score, bias, read, dovishHits: dov, hawkishHits: haw };
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

async function handleFed(req, res, requestUrl) {
  if (requestUrl.pathname !== "/api/market/fed-interpret") return writeJson(res, 404, { ok: false });

  // POST { text } — interpret pasted statement
  if (req.method === "POST") {
    let body = ""; for await (const c of req) body += c;
    let payload; try { payload = JSON.parse(body || "{}"); } catch { payload = {}; }
    const r = scoreText(payload.text);
    if (!r) return writeJson(res, 400, { ok: false, error: "no text" });
    return writeJson(res, 200, { ok: true, source: "pasted", ...r });
  }

  // GET — fetch latest official statement and score it
  const stmt = await fetchLatestFedStatement();
  if (!stmt) return writeJson(res, 200, { ok: false, reason: "no-statement", hint: "No FOMC statement found — the meeting may not have happened yet. Paste the statement text after 2pm ET on meeting day." });
  const r = scoreText(stmt.text);
  const stale = stmt.ageDays != null && stmt.ageDays > 2;  // older than 2 days = last meeting's, not today's
  return writeJson(res, 200, { ok: true, source: "federalreserve.gov", title: stmt.title, date: stmt.date, ageDays: stmt.ageDays, stale, link: stmt.link, ...r });
}

module.exports = { handleFed };
