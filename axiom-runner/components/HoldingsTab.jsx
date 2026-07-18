import { useState, useEffect } from "react";
import { computeGreenLight } from "./trading-utils.js";

// ── MY HOLDINGS — mechanical signal · suggested stop · trend · P&L for positions you own ──
const HOLDINGS_KEY = "axiom_holdings_v1";
const HOLDINGS_CRYPTO = new Set(["BTC","ETH","SOL","DOGE","ADA","AVAX","LINK","XRP","LTC","BCH","DOT","MATIC","UNI","SHIB","ATOM","BNB","TRX","NEAR","APT","ARB"]);
const DEFAULT_HOLDINGS = [
  { symbol: "MSTR", shares: 34.7, cost: 420.72 }, { symbol: "MARA", shares: 399, cost: 20.41 },
  { symbol: "COIN", shares: 15, cost: 291.20 }, { symbol: "CLSK", shares: 634, cost: 10.90 },
  { symbol: "RIOT", shares: 132.48, cost: 10.54 }, { symbol: "BTBT", shares: 1050.29, cost: 3.25 },
  { symbol: "CIFR", shares: 45, cost: 17.63 }, { symbol: "UPXI", shares: 1111, cost: 4.67 },
  { symbol: "DFDV", shares: 219, cost: 13.89 }, { symbol: "ASST", shares: 35, cost: 26.42 },
  { symbol: "AMD", shares: 19.5, cost: 183.05 }, { symbol: "NVDA", shares: 3, cost: 183.05 },
  { symbol: "TSLA", shares: 30, cost: 399.94 }, { symbol: "AMZN", shares: 12, cost: 206.01 },
  { symbol: "NFLX", shares: 15, cost: 93.72 }, { symbol: "SLV", shares: 15, cost: 66.54 },
  { symbol: "HIVE", shares: 125, cost: 4.34 }, { symbol: "SOUN", shares: 45, cost: 7.71 },
];

// ── Portfolio AI helpers ──────────────────────────────────────────────────
// Same Pearson-correlation formula as computeCorrelation() (axiom-live.jsx,
// used by CorrelationTab) — reused here, not reinvented, just applied to the
// user's actual held symbols' daily returns instead of whatever's loaded in
// Smart Scan's scanDeepData.
function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export default function HoldingsTab({ C, MONO, SANS, macroData }) {
  const [holdings, setHoldings] = useState(() => { try { return JSON.parse(localStorage.getItem(HOLDINGS_KEY)) || DEFAULT_HOLDINGS; } catch { return DEFAULT_HOLDINGS; } });
  const [quotes, setQuotes] = useState({});
  const [form, setForm] = useState({ symbol: "", shares: "", cost: "" });
  const [syncedAt, setSyncedAt] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [sectorMap, setSectorMap] = useState({});
  const [corrData, setCorrData] = useState(null);
  const save = (h, push = true) => {
    setHoldings(h); localStorage.setItem(HOLDINGS_KEY, JSON.stringify(h));
    if (push) fetch("/api/holdings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holdings: h, source: "manual" }) }).catch(() => {});
  };
  // Load the server copy (refreshed by the daily Robinhood sync) on mount
  useEffect(() => {
    fetch("/api/holdings").then(r => r.json()).then(d => {
      if (d?.ok && Array.isArray(d.holdings) && d.holdings.length) {
        setHoldings(d.holdings); localStorage.setItem(HOLDINGS_KEY, JSON.stringify(d.holdings));
        setSyncedAt(d.updatedAt || null);
      }
    }).catch(() => {});
  }, []);

  // Real trend-template data for the "BELOW MA50" status tier below —
  // /api/market/quote (used just above for stockArr) is a fast price-only
  // path that never populates priceAvg50 for any Alpaca-covered symbol
  // (confirmed live this session, same root cause fixed in
  // PredictionsTab/Green Light/Early Entry Scanner/Autopilot/Dashboard).
  // Since belowMA was already gated behind `ma50 > 0`, this never
  // mislabeled a holding — it just meant the "🟠 BELOW MA50" middle status
  // tier could never appear for any real holding, only the binary
  // "🔴 BELOW STOP" / "🟢 TREND OK" outcomes.
  const [trendMap, setTrendMap] = useState({});
  useEffect(() => {
    const stockSyms = holdings.filter(h => !HOLDINGS_CRYPTO.has(h.symbol)).map(h => h.symbol);
    if (!stockSyms.length) return;
    fetch(`/api/market/trend-screen?symbols=${encodeURIComponent([...new Set(stockSyms)].sort().join(","))}`)
      .then(r => r.json())
      .then(j => {
        const map = {};
        (j.results || []).forEach(r => { if (!r.error) map[r.symbol] = r; });
        setTrendMap(map);
      })
      .catch(() => {});
  }, [holdings.filter(h => !HOLDINGS_CRYPTO.has(h.symbol)).map(h => h.symbol).sort().join(",")]);

  useEffect(() => {
    if (!holdings.length) return;
    const load = () => {
      const stockSyms = holdings.filter(h => !HOLDINGS_CRYPTO.has(h.symbol)).map(h => h.symbol);
      const hasCrypto = holdings.some(h => HOLDINGS_CRYPTO.has(h.symbol));
      Promise.all([
        stockSyms.length ? fetch(`/api/market/quote?symbols=${stockSyms.join(",")}`).then(r => r.json()).catch(() => []) : Promise.resolve([]),
        hasCrypto ? fetch("/api/market/crypto").then(r => r.json()).catch(() => null) : Promise.resolve(null),
      ]).then(([stockArr, cryptoJson]) => {
        const m = {};
        (Array.isArray(stockArr) ? stockArr : []).forEach(q => { m[q.symbol] = q; });
        const coins = cryptoJson?.coins || cryptoJson?.data?.coins || [];
        coins.forEach(c => { if (HOLDINGS_CRYPTO.has(c.symbol)) m[c.symbol] = { symbol: c.symbol, price: Number(c.price), changesPercentage: Number(c.changesPercentage), isCrypto: true }; });
        setQuotes(m);
      });
    };
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [holdings.map(h => h.symbol).join(",")]);

  const spyChg = Number((macroData || []).find(m => m.symbol === "SPY")?.changesPercentage || 0);
  const addHolding = () => {
    const s = form.symbol.trim().toUpperCase(); if (!s) return;
    save([...holdings.filter(h => h.symbol !== s), { symbol: s, shares: Number(form.shares) || 0, cost: Number(form.cost) || 0 }]);
    setForm({ symbol: "", shares: "", cost: "" });
  };
  const removeHolding = s => save(holdings.filter(h => h.symbol !== s));

  const rows = holdings.map(h => {
    const q = quotes[h.symbol];
    if (!q || !(q.price > 0)) return { ...h, loading: true };
    const px = q.price;
    const pnl = h.cost > 0 ? (px - h.cost) * h.shares : 0;
    const pnlPct = h.cost > 0 ? (px - h.cost) / h.cost * 100 : 0;
    if (q.isCrypto) {
      const chg = Number(q.changesPercentage || 0);
      const stop = +(px * 0.85).toFixed(2);   // crypto is volatile — wider 15% stop
      const belowStop = px <= stop;
      const status = belowStop ? { t: "🔴 BELOW STOP", c: C.red } : chg < -5 ? { t: "🟠 DROPPING", c: C.amber } : { t: "🟢 OK", c: C.green };
      return { ...h, q, px, stop, pnl, pnlPct, status, isCrypto: true, value: px * h.shares };
    }
    const gl = computeGreenLight(q, spyChg, null, null, trendMap[h.symbol]);
    const trendStage = String(trendMap[h.symbol]?.stage || "");
    const atrPct = Math.min(0.05, Math.max(0.01, Number(gl.atrPct) || 0.025));
    const stop = +(px * (1 - atrPct * 1.5)).toFixed(2);
    const belowStop = px <= stop;
    const belowMA = trendStage.startsWith("Stage 3") || trendStage.startsWith("Stage 4");
    const status = belowStop ? { t: "🔴 BELOW STOP", c: C.red } : belowMA ? { t: "🟠 BELOW MA50", c: C.amber } : { t: "🟢 TREND OK", c: C.green };
    return { ...h, q, px, stop, pnl, pnlPct, status, signal: gl.signal, value: px * h.shares };
  });
  const totalValue = rows.reduce((s, r) => s + (r.value || 0), 0);
  const totalPnl = rows.reduce((s, r) => s + (r.pnl || 0), 0);

  // ── Portfolio AI: sector exposure + correlation need data this component
  // doesn't already fetch (per-symbol sector, daily candles) — gated behind
  // a button rather than auto-fetched on every load/quote-refresh, same
  // on-demand pattern CorrelationTab already uses for its own fetch.
  const runPortfolioAnalysis = async () => {
    const readyRows = rows.filter(r => !r.loading);
    if (readyRows.length < 1) return;
    setAiLoading(true); setAiError("");
    try {
      const stockSyms = readyRows.filter(r => !r.isCrypto).map(r => r.symbol);
      const CONC = 4;
      const sectors = {};
      for (let i = 0; i < stockSyms.length; i += CONC) {
        const batch = stockSyms.slice(i, i + CONC);
        const results = await Promise.all(batch.map(async sym => {
          try {
            const r = await fetch(`/api/market/fundamentals?symbol=${encodeURIComponent(sym)}`);
            const d = r.ok ? await r.json() : {};
            return [sym, d.sector || "Unknown"];
          } catch { return [sym, "Unknown"]; }
        }));
        results.forEach(([sym, sector]) => { sectors[sym] = sector; });
      }
      setSectorMap(sectors);

      const returnsBySym = {};
      for (let i = 0; i < stockSyms.length; i += CONC) {
        const batch = stockSyms.slice(i, i + CONC);
        const results = await Promise.all(batch.map(async sym => {
          try {
            const r = await fetch(`/api/market/candles?ticker=${encodeURIComponent(sym)}&timeframe=1D`);
            const d = r.ok ? await r.json() : null;
            const bars = Array.isArray(d?.bars) ? d.bars : [];
            if (bars.length < 20) return [sym, null];
            const closes = bars.map(b => b.close).filter(Number.isFinite);
            const returns = closes.slice(1).map((c, i2) => (c - closes[i2]) / closes[i2]);
            return [sym, returns];
          } catch { return [sym, null]; }
        }));
        results.forEach(([sym, returns]) => { if (returns) returnsBySym[sym] = returns; });
      }
      const corrSyms = Object.keys(returnsBySym);
      if (corrSyms.length >= 2) {
        const minLen = Math.min(...corrSyms.map(s => returnsBySym[s].length));
        const trimmed = {};
        for (const s of corrSyms) trimmed[s] = returnsBySym[s].slice(-minLen);
        const matrix = {};
        for (const s1 of corrSyms) { matrix[s1] = {}; for (const s2 of corrSyms) matrix[s1][s2] = Number(pearson(trimmed[s1], trimmed[s2]).toFixed(2)); }
        setCorrData({ syms: corrSyms, matrix, computedAt: new Date().toISOString() });
      } else {
        setCorrData({ syms: [], matrix: {}, computedAt: new Date().toISOString() });
      }
    } catch (e) {
      setAiError(e.message || "Portfolio analysis failed");
    }
    setAiLoading(false);
  };

  // Position concentration — flag anything over 20% of portfolio (single-name risk)
  const concentrationFlags = rows
    .filter(r => !r.loading && totalValue > 0)
    .map(r => ({ symbol: r.symbol, pct: (r.value / totalValue) * 100 }))
    .filter(r => r.pct >= 20)
    .sort((a, b) => b.pct - a.pct);

  // Sector exposure — only meaningful once sectorMap is populated
  const sectorExposure = (() => {
    if (!Object.keys(sectorMap).length || totalValue <= 0) return [];
    const bySector = {};
    rows.filter(r => !r.loading).forEach(r => {
      const sector = r.isCrypto ? "Crypto" : (sectorMap[r.symbol] || "Unknown");
      bySector[sector] = (bySector[sector] || 0) + r.value;
    });
    return Object.entries(bySector)
      .map(([sector, value]) => ({ sector, value, pct: (value / totalValue) * 100 }))
      .sort((a, b) => b.pct - a.pct);
  })();

  // Portfolio heat — total $ at risk if every stop were hit simultaneously
  const heatRows = rows.filter(r => !r.loading && r.stop > 0);
  const totalAtRisk = heatRows.reduce((s, r) => s + Math.max(0, (r.px - r.stop) * r.shares), 0);
  const heatPct = totalValue > 0 ? (totalAtRisk / totalValue) * 100 : 0;
  const breachedStops = rows.filter(r => !r.loading && r.px <= r.stop);

  // High-correlation clusters (pairwise > 0.7) — "this isn't N positions, it's 1"
  const corrClusters = (() => {
    if (!corrData?.syms || corrData.syms.length < 2) return [];
    const pairs = [];
    for (let i = 0; i < corrData.syms.length; i++) {
      for (let j = i + 1; j < corrData.syms.length; j++) {
        const s1 = corrData.syms[i], s2 = corrData.syms[j];
        const v = corrData.matrix[s1][s2];
        if (v >= 0.7) pairs.push([s1, s2, v]);
      }
    }
    return pairs.sort((a, b) => b[2] - a[2]);
  })();

  const suggestions = [];
  if (breachedStops.length) suggestions.push({ sev: "high", text: `🔴 ${breachedStops.map(r => r.symbol).join(", ")} ${breachedStops.length > 1 ? "are" : "is"} already below its suggested stop — re-evaluate now, not after the analysis.` });
  if (heatPct > 15) suggestions.push({ sev: "high", text: `🔥 Portfolio heat is ${heatPct.toFixed(1)}% — if every stop hit today you'd give back $${totalAtRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })}. That's high total risk for one account; consider trimming size or tightening stops.` });
  else if (heatPct > 8) suggestions.push({ sev: "med", text: `🔥 Portfolio heat is ${heatPct.toFixed(1)}% ($${totalAtRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })} at risk if every stop hit) — worth watching, not yet alarming.` });
  concentrationFlags.forEach(f => suggestions.push({ sev: f.pct >= 30 ? "high" : "med", text: `⚖️ ${f.symbol} is ${f.pct.toFixed(0)}% of your portfolio — a single-name move against you has outsized account impact.` }));
  sectorExposure.filter(s => s.pct >= 40).forEach(s => suggestions.push({ sev: "med", text: `🏭 ${s.pct.toFixed(0)}% of your portfolio is in ${s.sector} — this is a concentrated sector bet, not a diversified book.` }));
  corrClusters.slice(0, 3).forEach(([s1, s2, v]) => suggestions.push({ sev: "low", text: `🔗 ${s1} and ${s2} move together (${v.toFixed(2)} correlation) — effectively one bet, not two.` }));
  if (!suggestions.length && corrData) suggestions.push({ sev: "low", text: "✅ No major concentration, heat, or correlation flags — this looks reasonably balanced." });

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 4 }}>📊 MY HOLDINGS</div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 14 }}>
        Mechanical signal · suggested stop (ATR) · trend for what you own. These are tool-computed levels — <b>not advice</b>. You decide and place orders yourself.
        {syncedAt && <span style={{ color: C.green, marginLeft: 6 }}>· ✅ synced from Robinhood {new Date(syncedAt).toLocaleDateString()}</span>}
      </div>

      {/* Totals */}
      <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px" }}>
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>PORTFOLIO VALUE</div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.text }}>${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px" }}>
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>UNREALIZED P&amp;L</div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: totalPnl >= 0 ? C.green : C.red }}>{totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      {/* Add holding */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))} placeholder="SYMBOL" style={{ width: 90, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 10px", outline: "none" }} />
        <input value={form.shares} onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} placeholder="shares" style={{ width: 80, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 10px", outline: "none" }} />
        <input value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} placeholder="avg cost" style={{ width: 90, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 10px", outline: "none" }} />
        <button onClick={addHolding} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 14px", cursor: "pointer" }}>+ ADD</button>
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(r => (
          <div key={r.symbol} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${r.status ? r.status.c : C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ minWidth: 90 }}>
              <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.accent }}>{r.symbol}</span>
              {r.isCrypto && <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 800, color: "#f7931a", background: "#f7931a18", borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>₿ CRYPTO</span>}
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{r.shares} {r.isCrypto ? "" : "sh "}@ ${r.cost}</div>
            </div>
            {r.loading ? <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>loading…</span> : (<>
              <div style={{ minWidth: 90 }}>
                <span style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>${r.px.toFixed(2)}</span>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: r.pnl >= 0 ? C.green : C.red }}>{r.pnl >= 0 ? "+" : ""}${r.pnl.toFixed(0)} ({r.pnlPct >= 0 ? "+" : ""}{r.pnlPct.toFixed(1)}%)</div>
              </div>
              <div style={{ minWidth: 110 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>🛑 SUGGESTED STOP</div>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.red }}>${r.stop} <span style={{ fontSize: 9, color: C.textDim }}>({((r.stop - r.px) / r.px * 100).toFixed(1)}%)</span></div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: r.status.c, background: `${r.status.c}14`, borderRadius: 5, padding: "3px 9px" }}>{r.status.t}</span>
                <button onClick={() => removeHolding(r.symbol)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            </>)}
          </div>
        ))}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 14 }}>
        🛑 stop = volatility-sized (1.5× ATR) below price. 🟠 below MA50 = momentum weakening. 🔴 below stop = your risk level breached. Not investment advice — for big allocation decisions, consult a licensed advisor.
      </div>

      {/* ── Portfolio AI ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: aiError || corrData ? 14 : 0 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>🧠 PORTFOLIO AI</div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 2 }}>Concentration · sector exposure · correlation · total risk across everything you own</div>
          </div>
          <button onClick={runPortfolioAnalysis} disabled={aiLoading || rows.every(r => r.loading)}
            style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, fontWeight: 700,
              background: aiLoading ? C.surface : C.accent, border: "none",
              color: aiLoading ? C.textDim : "#fff", borderRadius: 6, padding: "9px 18px",
              cursor: aiLoading ? "default" : "pointer" }}>
            {aiLoading ? "ANALYZING…" : corrData ? "RE-ANALYZE" : "🧠 ANALYZE PORTFOLIO"}
          </button>
        </div>

        {aiError && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>{aiError}</div>}

        {corrData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Portfolio heat */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px" }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>PORTFOLIO HEAT</div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: heatPct > 15 ? C.red : heatPct > 8 ? C.amber : C.green }}>{heatPct.toFixed(1)}%</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>${totalAtRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })} at risk if every stop hits</div>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px" }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>LARGEST POSITION</div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.text }}>{concentrationFlags[0]?.symbol || rows.filter(r => !r.loading).sort((a, b) => b.value - a.value)[0]?.symbol || "—"}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{totalValue > 0 ? ((rows.filter(r => !r.loading).sort((a, b) => b.value - a.value)[0]?.value || 0) / totalValue * 100).toFixed(0) : 0}% of portfolio</div>
              </div>
            </div>

            {/* Sector exposure */}
            {sectorExposure.length > 0 && (
              <div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 8 }}>SECTOR EXPOSURE</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sectorExposure.map(s => (
                    <div key={s.sector} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 110, fontFamily: MONO, fontSize: 11, color: C.text, flexShrink: 0 }}>{s.sector}</div>
                      <div style={{ flex: 1, height: 8, background: C.surface, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, s.pct)}%`, height: "100%", background: s.pct >= 40 ? C.red : s.pct >= 25 ? C.amber : C.accent, borderRadius: 4 }} />
                      </div>
                      <div style={{ width: 42, fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text, textAlign: "right" }}>{s.pct.toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Correlation matrix */}
            {corrData.syms.length >= 2 ? (
              <div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 8 }}>CORRELATION — {corrData.syms.length} symbols with daily candle data</div>
                <div style={{ overflow: "auto" }}>
                  <table style={{ borderCollapse: "separate", borderSpacing: 3 }}>
                    <thead>
                      <tr>
                        <th></th>
                        {corrData.syms.map(s => <th key={s} style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, padding: "2px 6px" }}>{s}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {corrData.syms.map(s1 => (
                        <tr key={s1}>
                          <td style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim, padding: "2px 6px", textAlign: "right" }}>{s1}</td>
                          {corrData.syms.map(s2 => {
                            const v = corrData.matrix[s1][s2];
                            const isDiag = s1 === s2;
                            const bg = isDiag ? `${C.accent}22` : v >= 0.7 ? "rgba(220,38,38,0.35)" : v >= 0.3 ? "rgba(220,38,38,0.15)" : v <= -0.3 ? "rgba(5,150,105,0.15)" : "transparent";
                            return <td key={s2} style={{ background: bg, border: `1px solid ${C.border}33`, borderRadius: 4, fontFamily: MONO, fontSize: 10, fontWeight: isDiag ? 800 : 500, color: C.text, padding: "4px 6px", textAlign: "center" }}>{isDiag ? "—" : v.toFixed(2)}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Need ≥2 non-crypto holdings with candle data for a correlation matrix.</div>
            )}

            {/* Suggestions */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 8 }}>SUGGESTIONS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {suggestions.map((s, i) => (
                  <div key={i} style={{ fontFamily: SANS, fontSize: 12, color: C.text, background: C.surface, borderLeft: `3px solid ${s.sev === "high" ? C.red : s.sev === "med" ? C.amber : C.border}`, borderRadius: 6, padding: "8px 12px" }}>{s.text}</div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
