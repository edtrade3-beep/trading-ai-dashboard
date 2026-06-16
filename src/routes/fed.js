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
    // grab the first <item> (most recent)
    const item = xml.split("<item>")[1] || "";
    const pick = (tag) => { const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return m ? m[1].replace(/<!\\[CDATA\\[|\\]\\]>/g, "").trim() : ""; };
    const title = pick("title"), date = pick("pubDate"), link = pick("link"), desc = pick("description");
    if (!title) return null;
    return { title, date, link, text: `${title}. ${desc}` };
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
  if (!stmt) return writeJson(res, 200, { ok: false, reason: "fetch-failed", hint: "Paste the statement text instead (POST text)." });
  const r = scoreText(stmt.text);
  return writeJson(res, 200, { ok: true, source: "federalreserve.gov", title: stmt.title, date: stmt.date, link: stmt.link, ...r });
}

module.exports = { handleFed };
