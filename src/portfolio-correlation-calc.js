// portfolio-correlation-calc.js — real Pearson correlation, real sector
// exposure, and real factor-proxy correlation across the account's actual
// held positions. Server-side port of HoldingsTab.jsx's exact math (same
// pearson() formula, same >=20-bar minimum, same >=0.7 correlation-cluster
// threshold, same >=20%/30% concentration convention) — ported so the same
// real answer applies to the live Alpaca account, not reinvented slightly
// differently.
//
// "Factor exposure" here means real, disclosed correlation to three widely
// known style-proxy ETFs (SPY=broad market, QQQ=large-cap growth/tech,
// IWM=small-cap) computed from real daily returns — NOT a fabricated
// multi-factor regression (Fama-French loadings etc.). Labeled honestly as
// correlation-to-proxy throughout, matching this app's "never fabricate"
// rule the same way X Intel's classifiers are disclosed as deterministic
// pattern-matching, not AI judgment.
const FACTOR_PROXIES = { SPY: "Market (SPY)", QQQ: "Growth/Tech (QQQ)", IWM: "Small-Cap (IWM)" };
const MIN_BARS = 20;
const CLUSTER_THRESHOLD = 0.7;
const CONCURRENCY = 4;

function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

async function mapConcurrent(items, fn, conc = CONCURRENCY) {
  const out = [];
  for (let i = 0; i < items.length; i += conc) {
    const batch = items.slice(i, i + conc);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

function returnsFromBars(bars) {
  if (!Array.isArray(bars) || bars.length < MIN_BARS) return null;
  const closes = bars.map((b) => b.close).filter(Number.isFinite);
  if (closes.length < MIN_BARS) return null;
  return closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
}

// positions: real Alpaca positions [{symbol, marketValue, ...}]. getJson:
// ai-hub.js's existing internal-HTTP helper, reused so this hits the same
// real /api/market/candles + /api/market/fundamentals routes the browser
// already uses for the manual-portfolio version of this analysis.
async function computePortfolioCorrelation(positions, getJson) {
  const syms = [...new Set(positions.map((p) => p.symbol))];
  if (!syms.length) return { syms: [], matrix: {}, sectors: {}, clusters: [], factorExposure: [], insufficientData: [] };

  const sectorPairs = await mapConcurrent(syms, async (sym) => {
    try {
      const d = await getJson(`/api/market/fundamentals?symbol=${encodeURIComponent(sym)}`);
      return [sym, d?.sector || "Unknown"];
    } catch { return [sym, "Unknown"]; }
  });
  const sectors = Object.fromEntries(sectorPairs);

  const allFetchSyms = [...syms, ...Object.keys(FACTOR_PROXIES)];
  const returnPairs = await mapConcurrent(allFetchSyms, async (sym) => {
    try {
      const d = await getJson(`/api/market/candles?ticker=${encodeURIComponent(sym)}&timeframe=1D`);
      return [sym, returnsFromBars(d?.bars)];
    } catch { return [sym, null]; }
  });
  const returnsBySym = Object.fromEntries(returnPairs.filter(([, r]) => r));
  const corrSyms = syms.filter((s) => returnsBySym[s]);
  const insufficientData = syms.filter((s) => !returnsBySym[s]);

  const matrix = {};
  const clusters = [];
  if (corrSyms.length >= 2) {
    const minLen = Math.min(...corrSyms.map((s) => returnsBySym[s].length));
    const trimmed = {};
    for (const s of corrSyms) trimmed[s] = returnsBySym[s].slice(-minLen);
    for (const s1 of corrSyms) {
      matrix[s1] = {};
      for (const s2 of corrSyms) matrix[s1][s2] = Number(pearson(trimmed[s1], trimmed[s2]).toFixed(2));
    }
    for (let i = 0; i < corrSyms.length; i++) {
      for (let j = i + 1; j < corrSyms.length; j++) {
        const s1 = corrSyms[i], s2 = corrSyms[j], v = matrix[s1][s2];
        if (v >= CLUSTER_THRESHOLD) clusters.push({ a: s1, b: s2, correlation: v });
      }
    }
    clusters.sort((a, b) => b.correlation - a.correlation);
  }

  // Real $-weighted average correlation to each factor proxy — only over
  // positions that actually have enough real return data; never guessed
  // for the ones that don't (those surface honestly in insufficientData).
  const totalValue = positions.reduce((s, p) => s + (Number(p.marketValue) || 0), 0);
  const factorExposure = Object.entries(FACTOR_PROXIES)
    .filter(([proxySym]) => returnsBySym[proxySym])
    .map(([proxySym, label]) => {
      let weightedSum = 0, weightUsed = 0;
      for (const p of positions) {
        if (!returnsBySym[p.symbol]) continue;
        const minLen = Math.min(returnsBySym[p.symbol].length, returnsBySym[proxySym].length);
        const corr = pearson(returnsBySym[p.symbol].slice(-minLen), returnsBySym[proxySym].slice(-minLen));
        const w = Number(p.marketValue) || 0;
        weightedSum += corr * w;
        weightUsed += w;
      }
      return weightUsed > 0 ? { proxy: proxySym, label, correlation: Number((weightedSum / weightUsed).toFixed(2)) } : null;
    })
    .filter(Boolean);

  return { syms: corrSyms, matrix, sectors, clusters, factorExposure, insufficientData };
}

module.exports = { pearson, computePortfolioCorrelation, FACTOR_PROXIES, MIN_BARS, CLUSTER_THRESHOLD };
