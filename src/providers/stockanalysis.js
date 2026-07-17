// stockanalysis.com — free, no API key, and reachable from cloud hosts (Render)
// where Yahoo's quoteSummary is IP-blocked. Fills market cap / P/E / analyst /
// target / description / margins for the Valuation, Company, and Analyst panels.
//
// Used to call a JSON API (api/symbol/s/{SYM}/overview) — that endpoint now
// 404s, a site restructuring (same category of break as the Finviz table
// parser fixed earlier). The same data is still there, just moved: it's
// embedded inline as a JS object literal in the stock page's own HTML/script
// bundle, under the exact same field names the old JSON API used
// (marketCap, revenue, peRatio, target, analysts, earningsDate, ...) — so
// everything below this extraction step (parseBig/parseNum/recKey/the
// return shape) is unchanged.

const { decodeXmlEntities } = require("../utils");

// Parse "4.77T" / "253.49B" / "24.22M" / "1,234" → number.
function parseBig(v) {
  if (v == null) return null;
  let s = String(v).trim().replace(/[$,]/g, "");
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*([TBMK])?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const mult = { T: 1e12, B: 1e9, M: 1e6, K: 1e3 }[(m[2] || "").toUpperCase()];
  if (mult) n *= mult;
  return Number.isFinite(n) ? n : null;
}
// Parse a plain number out of a string ("30.02", "301.62 (+53.16%)").
function parseNum(v) {
  if (v == null) return null;
  const m = String(v).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function recKey(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("strong buy")) return "strong_buy";
  if (s.includes("buy")) return "buy";
  if (s.includes("hold")) return "hold";
  if (s.includes("strong sell")) return "strong_sell";
  if (s.includes("sell")) return "sell";
  return null;
}

// Targeted extraction, not a general JS-object parser (the embedded object
// has unquoted keys, not valid JSON, and eval()-ing third-party page content
// isn't something to do regardless). Each pattern requires the field name
// immediately followed by ":" so a longer field sharing the same prefix
// (e.g. marketCapGrowth) can't be mistaken for the one being searched for.
function extractStr(html, name) {
  const m = html.match(new RegExp(`\\b${name}:"([^"]*)"`));
  return m ? m[1] : null;
}
function extractNum(html, name) {
  const m = html.match(new RegExp(`\\b${name}:(-?[\\d.]+)(?=[,}])`));
  return m ? parseFloat(m[1]) : null;
}
// Sector/Industry live in the page's "stock info" table as {t:"Label",v:"Value"}
// pairs, a different shape from the marketCap/revenue/etc. fields above.
function extractLabeledValue(html, label) {
  const m = html.match(new RegExp(`t:"${label}",v:"([^"]*)"`));
  return m ? m[1] : null;
}

async function fetchStockAnalysis(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym || /[-^=/]/.test(sym)) return null;   // equities only
  const url = `https://stockanalysis.com/stocks/${encodeURIComponent(sym.toLowerCase())}/`;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) return null;
    const html = await res.text();

    const d = {
      marketCap: extractStr(html, "marketCap"),
      revenue: extractStr(html, "revenue"),
      revenueGrowth: extractNum(html, "revenueGrowth"),
      netIncomeGrowth: extractNum(html, "netIncomeGrowth"),
      eps: extractStr(html, "eps"),
      peRatio: extractStr(html, "peRatio"),
      forwardPE: extractStr(html, "forwardPE"),
      beta: extractStr(html, "beta"),
      sharesOut: extractStr(html, "sharesOut"),
      target: extractStr(html, "target"),
      analysts: extractStr(html, "analysts"),
      earningsDate: extractStr(html, "earningsDate"),
      description: extractStr(html, "description"),
      sector: extractLabeledValue(html, "Sector"),
      industry: extractLabeledValue(html, "Industry"),
    };
    if (!d.marketCap && !d.revenue) return null; // page didn't contain the expected data at all

    const titleM = html.match(/<title>([^<(]+?)\s*\(/);
    const companyName = titleM ? decodeXmlEntities(titleM[1].trim()) : null;

    const analystTargetM = html.match(/analystTarget:\{target:"([^"]+)",change:"([^"]+)",changeWord:"([^"]+)"\}/);
    const analystChartM = html.match(/analystChart:\{strongBuy:(\d+),buy:(\d+),hold:(\d+),sell:(\d+),strongSell:(\d+)\}/);
    const [sb, b, h, s, ss] = analystChartM ? analystChartM.slice(1).map(Number) : [null, null, null, null, null];
    const numberOfAnalystOpinions = analystChartM ? sb + b + h + s + ss : null;

    const revenue = parseBig(d.revenue);
    // Net income in dollars isn't extracted (only its growth %), so profit
    // margin can't be computed — left honestly null rather than guessed.
    const profitMargin = null;

    return {
      symbol: sym,
      name: companyName,
      sector: d.sector || null,
      industry: d.industry || null,
      marketCap: parseBig(d.marketCap) || 0,
      pe: parseNum(d.peRatio),
      trailingPE: parseNum(d.peRatio),
      forwardPE: parseNum(d.forwardPE),
      eps: parseNum(d.eps),
      epsTrailingTwelveMonths: parseNum(d.eps),
      beta: parseNum(d.beta),
      dividendYield: null, // extraction of this field proved unreliable across tickers — left honestly null
      sharesOutstanding: parseBig(d.sharesOut),
      revenue,
      profitMargin,
      revenueGrowth: d.revenueGrowth != null ? d.revenueGrowth / 100 : null,
      earningsGrowth: d.netIncomeGrowth != null ? d.netIncomeGrowth / 100 : null,
      analystTarget: analystTargetM ? parseNum(analystTargetM[1]) : parseNum(d.target),
      targetMeanPrice: analystTargetM ? parseNum(analystTargetM[1]) : parseNum(d.target),
      // This source doesn't provide analyst-range (high/low) targets.
      targetHighPrice: null, targetLowPrice: null,
      recommendationKey: recKey(d.analysts),
      recommendationMean: null,
      numberOfAnalystOpinions,
      analystStrongBuy: sb, analystBuy: b, analystHold: h, analystSell: s, analystStrongSell: ss,
      earningsDate: d.earningsDate || null,
      description: d.description || null,
      priceToSales: revenue && parseBig(d.marketCap) ? parseBig(d.marketCap) / revenue : null,
      pegRatio: null, priceToBook: null, grossMargin: null, roe: null,
    };
  } catch { return null; }
}

module.exports = { fetchStockAnalysis };
