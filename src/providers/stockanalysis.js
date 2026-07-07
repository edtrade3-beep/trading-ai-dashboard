// stockanalysis.com — free, no API key, and reachable from cloud hosts (Render)
// where Yahoo's quoteSummary is IP-blocked. Fills market cap / P/E / analyst /
// target / description / margins for the Valuation, Company, and Analyst panels.

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
// "$1.00 (0.51%)" → 0.0051 (yield as a fraction)
function parseYield(v) {
  if (v == null) return null;
  const m = String(v).match(/\(([\d.]+)%\)/);
  return m ? parseFloat(m[1]) / 100 : null;
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

async function fetchStockAnalysis(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym || /[-^=/]/.test(sym)) return null;   // equities only
  const url = `https://stockanalysis.com/api/symbol/s/${encodeURIComponent(sym)}/overview`;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }, signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) return null;
    const j = await res.json();
    const d = j && j.data;
    if (!d) return null;
    const revenue = parseBig(d.revenue);
    const netIncome = parseBig(d.netIncome);
    const profitMargin = revenue && netIncome != null ? netIncome / revenue : null;
    return {
      symbol: sym,
      marketCap: parseBig(d.marketCap) || 0,
      pe: parseNum(d.peRatio),
      trailingPE: parseNum(d.peRatio),
      forwardPE: parseNum(d.forwardPE),
      eps: parseNum(d.eps),
      beta: parseNum(d.beta),
      dividendYield: parseYield(d.dividend),
      sharesOutstanding: parseBig(d.sharesOut),
      revenue,
      profitMargin,
      analystTarget: parseNum(d.target),
      targetMeanPrice: parseNum(d.target),
      recommendationKey: recKey(d.analysts),
      earningsDate: d.earningsDate || null,
      description: d.description || null,
      // Fields this source doesn't provide — left null so callers show "—".
      priceToSales: revenue && parseBig(d.marketCap) ? parseBig(d.marketCap) / revenue : null,
      pegRatio: null, priceToBook: null, grossMargin: null, roe: null,
      revenueGrowth: null, earningsGrowth: null,
    };
  } catch { return null; }
}

module.exports = { fetchStockAnalysis };
