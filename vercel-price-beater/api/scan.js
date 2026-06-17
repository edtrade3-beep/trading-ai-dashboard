// Vercel serverless function — POST /api/scan
// Body: { year, make, model, trim, zip, radius, myPrice }
// Keys come from Vercel Environment Variables:
//   MARKETCHECK_API_KEY, AUTODEV_API_KEY, BRAVE_API_KEY, SERPAPI_KEY
// Engine order: MarketCheck -> Auto.dev -> Brave -> SerpAPI (first one with data wins).

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const carQuery = ({ year, make, model, trim, zip }) => `${year} ${make} ${model} ${trim} for sale near ${zip} dealer`.replace(/\s+/g, " ").trim();
const AGG_RE = /average|market value|trade.?in|what(?:'s| is) it worth|how much is|price guide|value your|book value|kbb|kelley blue book|blue book|edmunds|nadaguides|nada\b|estimate|depreciat|price analysis|values?\b|fair purchase|typical price|starting (?:at|from)|carfax history/i;
const looksAggregate = (t) => AGG_RE.test(String(t || ""));
const MARKETPLACE_RE = /cargurus|cars\.com|autotrader|kbb|carfax|truecar|capitalone|carvana|vroom|edmunds|facebook|craigslist|ebay|google/i;
const titleCase = (s) => String(s || "").replace(/[-_.]/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, c => c.toUpperCase());
const US_STATES = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY";
const LOC_RE = new RegExp(`\\b([A-Z][a-zA-Z.\\-]+(?:\\s[A-Z][a-zA-Z.\\-]+)?),?\\s+(${US_STATES})\\b`);
const num = (x) => Number(String(x ?? "").replace(/[^0-9.]/g, "")) || 0;

function locationOf(text) { const m = String(text || "").match(LOC_RE); return m ? `${m[1].trim()}, ${m[2]}` : ""; }
function dealerName(text, host, explicit) {
  if (explicit && !MARKETPLACE_RE.test(explicit)) return explicit.trim();
  if (host && !MARKETPLACE_RE.test(host)) { const core = host.replace(/\.(com|net|org|us|co|biz|auto)$/i, "").split(".").pop(); if (core && core.length > 2) return titleCase(core); }
  const m = String(text || "").match(/(?:at|from|[-–·|@])\s*([A-Z][A-Za-z0-9'&.\- ]{2,38}?(?:Motors?|Auto(?:s|motive)?|Cars?|Dealership|Group|Sales|Imports?|Used Cars|Toyota|Honda|Ford|Chevrolet|Chevy|Nissan|Hyundai|Kia|GMC|Buick|Dodge|Jeep|Ram|Mazda|Subaru|Volkswagen|VW|BMW|Mercedes|Audi|Lexus|Acura|Infiniti|Mitsubishi|Cadillac|Lincoln))\b/);
  return m ? m[1].trim() : "";
}
function extractPrices(text) {
  const t = String(text || ""); const out = []; const re = /\$\s?([0-9]{1,3},[0-9]{3})/g; let m;
  while ((m = re.exec(t))) {
    const n = Number(m[1].replace(/,/g, ""));
    const before = t.slice(Math.max(0, m.index - 22), m.index).toLowerCase();
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 8).toLowerCase();
    if (/\/mo|month|\bmo\b/.test(after)) continue;
    if (/down|payment|deposit|as low as|finance|lease|apr/.test(before)) continue;
    out.push(n);
  }
  return out;
}
function aggregateHits(hits, refPrice) {
  const lo = refPrice > 0 ? Math.max(refPrice * 0.6, 4000) : 5000;
  const hi = refPrice > 0 ? refPrice * 1.4 : 200000;
  const ok = hits.filter(h => h.price >= lo && h.price <= hi);
  if (!ok.length) return { found: false };
  const prices = ok.map(h => h.price).sort((a, b) => a - b);
  const seen = new Set(), competitors = [];
  for (const h of ok.sort((a, b) => a.price - b.price)) {
    if (seen.has(h.price)) continue; seen.add(h.price);
    const host = hostOf(h.link), dealer = dealerName(h.title, host, h.dealer);
    competitors.push({ price: h.price, source: dealer || h.source || host || "dealer", dealer, location: locationOf(h.title), miles: 0, link: h.link });
    if (competitors.length >= 3) break;
  }
  return { found: true, marketLow: prices[0], marketAvg: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length), competitors };
}

async function marketcheckScan({ year, make, model, trim, zip }, key, radius) {
  const p = new URLSearchParams({ api_key: key, car_type: "used", year: String(year), make, model, zip: zip || "45014", radius: String(radius || 200), rows: "20", sort_by: "price", sort_order: "asc" });
  if (trim) p.set("trim", trim);
  let d = null; try { d = await withTimeout(fetch(`https://mc-api.marketcheck.com/v2/search/car/active?${p}`).then(r => r.json()), 15000); } catch { d = null; }
  if (!d) return { found: false, error: "MarketCheck unavailable" };
  if (!Array.isArray(d.listings)) { const msg = JSON.stringify(d); if (/invalid|unauthor|api.?key/i.test(msg)) return { found: false, error: "MarketCheck key invalid." }; if (/limit|quota/i.test(msg)) return { found: false, error: "MarketCheck quota exceeded." }; return { found: false, error: d.message || "MarketCheck error" }; }
  const comps = (d.listings || []).filter(l => l.dealer && !/dixie|cincy automall/i.test(l.dealer.name || ""))
    .map(l => ({ price: num(l.price), dealer: l.dealer.name || "", source: l.dealer.name || "", location: [l.dealer.city, l.dealer.state].filter(Boolean).join(", "), miles: num(l.miles), link: l.vdp_url || "" }))
    .filter(c => c.price > 0).sort((a, b) => a.price - b.price);
  if (!comps.length) return { found: false };
  const prices = comps.map(c => c.price);
  return { found: true, marketLow: prices[0], marketAvg: Math.round(prices.reduce((s, v) => s + v, 0) / prices.length), competitors: comps.slice(0, 3) };
}
async function autodevScan({ year, make, model, zip }, key, refPrice) {
  const p = new URLSearchParams({ apikey: key, makes: make, models: model, year: String(year), zip: zip || "45014", sort: "price" });
  let d = null; try { d = await withTimeout(fetch(`https://api.auto.dev/listings?${p}`).then(r => r.json()), 15000); } catch { d = null; }
  if (!d) return { found: false, error: "Auto.dev unavailable" };
  if (d.error) { const st = d.error.status; if (st === 401 || st === 403) return { found: false, error: "Auto.dev key invalid." }; if (st === 429) return { found: false, error: "Auto.dev quota exceeded." }; return { found: false, error: `Auto.dev: ${d.error.error || ""}` }; }
  const lo = refPrice > 0 ? refPrice * 0.5 : 0, hi = refPrice > 0 ? refPrice * 1.6 : 1e9;
  const comps = (d.data || []).map(rec => { const l = rec.retailListing || rec.wholesaleListing || {}; return { price: num(l.price), dealer: l.dealer || "", source: l.dealer || "", location: [l.city, l.state].filter(Boolean).join(", "), miles: num(l.miles), link: l.carfaxUrl || rec["@id"] || "" }; })
    .filter(c => c.price > 0 && (refPrice <= 0 || (c.price >= lo && c.price <= hi)) && !/dixie|cincy automall/i.test(c.dealer)).sort((a, b) => a.price - b.price);
  if (!comps.length) return { found: false };
  const prices = comps.map(c => c.price);
  return { found: true, marketLow: prices[0], marketAvg: Math.round(prices.reduce((s, v) => s + v, 0) / prices.length), competitors: comps.slice(0, 3) };
}
async function bravePriceScan(veh, key, refPrice) {
  let d = null; try { d = await withTimeout(fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(carQuery(veh))}&count=20`, { headers: { "X-Subscription-Token": key, "Accept": "application/json" } }).then(r => r.json()), 15000); } catch { d = null; }
  if (!d) return { found: false, error: "Brave unavailable" };
  if (d.error || d.type === "ErrorResponse") { const s = JSON.stringify(d); return { found: false, error: /quota|rate|limit/i.test(s) ? "Brave out of searches." : /unauthor|invalid|token/i.test(s) ? "Brave key invalid." : "Brave error" }; }
  const hits = [];
  ((d.web && d.web.results) || []).forEach(o => { const txt = `${o.title || ""} ${o.description || ""}`; if (looksAggregate(txt)) return; extractPrices(txt).forEach(p => hits.push({ price: p, source: (o.profile && o.profile.name) || "", link: o.url || "", title: txt, dealer: "" })); });
  return aggregateHits(hits, refPrice);
}
async function googlePriceScan(veh, key, refPrice) {
  let d = null; try { d = await withTimeout(fetch(`https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(carQuery(veh))}&location=${encodeURIComponent("Ohio, United States")}&num=20&api_key=${key}`).then(r => r.json()), 15000); } catch { d = null; }
  if (!d) return { found: false, error: "Google unavailable" };
  if (d.error) return { found: false, error: /invalid api key/i.test(d.error) ? "SerpAPI key invalid." : d.error };
  const hits = [];
  (d.shopping_results || []).forEach(s => { if (!looksAggregate(`${s.title || ""} ${s.source || ""}`)) hits.push({ price: num(s.price), source: s.source || "", link: s.link || "", title: s.title || "", dealer: s.source || "" }); });
  (d.organic_results || []).forEach(o => { const txt = `${o.title || ""} ${o.snippet || ""}`; if (looksAggregate(txt)) return; extractPrices(txt).forEach(p => hits.push({ price: p, source: o.source || "", link: o.link || "", title: txt, dealer: "" })); });
  return aggregateHits(hits, refPrice);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};
  const year = Number(b.year || 0), make = String(b.make || "").trim(), model = String(b.model || "").trim();
  const trim = String(b.trim || "").trim(), zip = (String(b.zip || "45014").replace(/[^0-9]/g, "").slice(0, 5)) || "45014";
  const radius = Math.min(Math.max(Number(b.radius || 200), 25), 500), myPrice = Number(b.myPrice || 0);
  if (!year || !make || !model) return res.status(400).json({ error: "year, make, and model are required" });

  const mcKey = process.env.MARKETCHECK_API_KEY, adKey = process.env.AUTODEV_API_KEY, braveKey = process.env.BRAVE_API_KEY, serpKey = process.env.SERPAPI_KEY;
  if (!mcKey && !adKey && !braveKey && !serpKey) return res.status(503).json({ error: "No engine configured — set MARKETCHECK_API_KEY / AUTODEV_API_KEY / BRAVE_API_KEY / SERPAPI_KEY in Vercel." });

  const veh = { year, make, model, trim, zip };
  let result, engine, lastErr = "";
  try {
    if (mcKey) { engine = "marketcheck"; const m = await marketcheckScan(veh, mcKey, radius); if (m.error) lastErr = m.error; else result = m; }
    if ((!result || !result.found) && adKey) { engine = "autodev"; const a = await autodevScan(veh, adKey, myPrice); if (a.error) lastErr = a.error; else result = a; }
    if ((!result || !result.found) && braveKey) { engine = "brave"; const x = await bravePriceScan(veh, braveKey, myPrice); if (x.error) lastErr = x.error; else result = x; }
    if ((!result || !result.found) && serpKey) { engine = "google"; const g = await googlePriceScan(veh, serpKey, myPrice); if (g.error) lastErr = g.error; else result = g; }
    result = result || { found: false };
    if (!result.found) return res.status(200).json(lastErr ? { found: false, engine, error: lastErr } : { found: false, engine });
    const c = result.competitors[0];
    const gap = myPrice && c ? myPrice - c.price : null;
    return res.status(200).json({ found: true, engine, competitors: result.competitors, marketLow: result.marketLow, marketAvg: result.marketAvg,
      cheapestPrice: c.price, source: c.source, dealer: c.dealer, location: c.location, link: c.link,
      gap, status: gap == null ? "unknown" : gap >= 0 ? "cheapest" : gap >= -500 ? "close" : "not_cheapest",
      suggested: gap != null && gap < 0 ? Math.max(c.price - 100, 0) : null });
  } catch (e) { return res.status(422).json({ error: e.message || "Scan failed" }); }
};
