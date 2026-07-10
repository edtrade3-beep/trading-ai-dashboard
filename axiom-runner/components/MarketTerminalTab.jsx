import { useState, useEffect, useCallback } from "react";
import TrendChart from "./TrendChart.jsx";
import TrendSetupPanel from "./TrendSetupPanel.jsx";
import SmartScanPanel from "./SmartScanPanel.jsx";
import {
  EarningsSnapshot, EarningsBars, AiWhyPanel, NewsPanel, SectorHeatStrip,
  MarketPulseBar, SentimentRow, MarketNewsWire, AnalystPeerPanel,
  FundamentalsPanel, CompanyProfile, AiPredictPanel, COTPanel,
  PredictionMarkets, SocialFeed, InvestorsPanel, TradeExtrasPanel,
  PerformanceCard, BestOpportunities,
} from "./terminal-panels.jsx";

// Combined Market-Terminal page: movers leaderboard on the left, pro chart with
// AI overlays on the right. Click a mover → it loads in the chart.
export default function MarketTerminalTab({ C, MONO, SANS, sectorData, macroData, onDeepDive }) {
  const [lb, setLb] = useState(null);
  const [view, setView] = useState("moversUp");
  const [sym, setSym] = useState("NVDA");
  const [chart, setChart] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [query, setQuery] = useState("");
  const [dTab, setDTab] = useState("chart");   // per-symbol detail tab
  const [sortBy, setSortBy] = useState("bucket");  // movers sort
  const [source, setSource] = useState("movers");  // movers | watchlist
  const [wlRows, setWlRows] = useState(null);
  useEffect(() => {
    if (source !== "watchlist") return;
    setWlRows(null);
    // localStorage is the durable source (survives Render free-tier redeploys that
    // wipe the server file); merge with whatever the server still has.
    let local = [];
    try { local = JSON.parse(localStorage.getItem("dm_watchlist") || "[]"); } catch {}
    fetch("/api/watchlist").then(r => r.json()).catch(() => ({ symbols: [] })).then(async (d) => {
      const server = Array.isArray(d.symbols) ? d.symbols : [];
      const syms = [...new Set([...local, ...server].map(s => String(s).toUpperCase()))].slice(0, 150);
      if (!syms.length) { setWlRows([]); return; }
      // Fetch quotes in chunks of 40 so a big watchlist doesn't time out one call.
      const out = [];
      for (let i = 0; i < syms.length; i += 40) {
        const chunk = syms.slice(i, i + 40);
        try {
          const q = await fetch("/api/market/quote?symbols=" + encodeURIComponent(chunk.join(","))).then(r => r.json());
          const arr = Array.isArray(q) ? q : (q.quotes || []);
          out.push(...arr.filter(x => typeof x.price === "number")
            .map(x => ({ symbol: String(x.symbol).toUpperCase(), price: x.price, dayPct: Number(x.changesPercentage) || 0, volRatio: null })));
        } catch {}
      }
      setWlRows(out.sort((a, b) => b.dayPct - a.dayPct));
    }).catch(() => setWlRows([]));
  }, [source]);

  useEffect(() => {
    const load = () => fetch("/api/market/leaderboard?n=12").then(r => r.json()).then(setLb).catch(() => {});
    load(); const t = setInterval(load, 90000); return () => clearInterval(t);
  }, []);

  const loadSym = useCallback((s) => {
    const symbol = String(s || "").trim().toUpperCase();
    if (!symbol) return;
    setSym(symbol); setLoadingChart(true);
    fetch("/api/market/trend-template?symbol=" + encodeURIComponent(symbol))
      .then(r => r.json())
      .then(d => { if (!d.error) setChart(d); })
      .catch(() => {})
      .finally(() => setLoadingChart(false));
  }, []);
  useEffect(() => {
    let pending = null;
    try { pending = localStorage.getItem("mterminal_load_sym"); if (pending) localStorage.removeItem("mterminal_load_sym"); } catch {}
    loadSym(pending || "NVDA");
  }, [loadSym]);

  // Live refresh — silently re-pull the loaded symbol every 45s (no spinner, keeps
  // chart zoom) so price + setup stay current during the session.
  useEffect(() => {
    if (!sym) return;
    const t = setInterval(() => {
      fetch("/api/market/trend-template?symbol=" + encodeURIComponent(sym))
        .then(r => r.json()).then(d => { if (d && !d.error) setChart(d); }).catch(() => {});
    }, 45000);
    return () => clearInterval(t);
  }, [sym]);

  // Market cap + P/E from fundamentals (Yahoo local / FMP on cloud). Best-effort.
  const [fund, setFund] = useState(null);
  useEffect(() => {
    if (!sym) return;
    setFund(null);
    fetch("/api/market/fundamentals?symbol=" + encodeURIComponent(sym))
      .then(r => r.json()).then(j => setFund(j && !j.error ? j : null)).catch(() => {});
  }, [sym]);

  const [wlMsg, setWlMsg] = useState("");
  const addToWatchlist = useCallback(() => {
    const s = String(sym || "").trim().toUpperCase();
    if (!s) return;
    // Durable store = localStorage (survives Render redeploys). Also push to the
    // server so the scanner/autopilot sees it (best effort).
    let local = [];
    try { local = JSON.parse(localStorage.getItem("dm_watchlist") || "[]"); } catch {}
    local = local.map(x => String(x).toUpperCase());
    if (local.includes(s)) { setWlMsg(`${s} already on watchlist`); setTimeout(() => setWlMsg(""), 2500); return; }
    const next = [...local, s];
    try { localStorage.setItem("dm_watchlist", JSON.stringify(next)); } catch {}
    setWlMsg(`⭐ Added ${s} to watchlist`); setTimeout(() => setWlMsg(""), 2500);
    fetch("/api/watchlist").then(r => r.json()).then(d => {
      const server = Array.isArray(d.symbols) ? d.symbols.map(x => String(x).toUpperCase()) : [];
      const merged = [...new Set([...server, ...next])];
      return fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: merged }) });
    }).catch(() => {});
  }, [sym]);

  const removeFromWatchlist = useCallback((s) => {
    s = String(s).toUpperCase();
    let local = [];
    try { local = JSON.parse(localStorage.getItem("dm_watchlist") || "[]").map(x => String(x).toUpperCase()); } catch {}
    const next = local.filter(x => x !== s);
    try { localStorage.setItem("dm_watchlist", JSON.stringify(next)); } catch {}
    setWlRows(prev => (prev || []).filter(r => r.symbol !== s));
    fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: next }) }).catch(() => {});
  }, []);

  const VIEWS = [
    { id: "moversUp", label: "Up", icon: "🟢" },
    { id: "moversDown", label: "Down", icon: "🔴" },
    { id: "upOnVolume", label: "Up Vol", icon: "📈" },
    { id: "downOnVolume", label: "Dn Vol", icon: "📉" },
  ];
  const rows = (() => {
    if (source === "watchlist") return wlRows || [];
    const base = (lb && lb[view]) || [];
    if (sortBy === "bucket") return base;
    const s = [...base];
    if (sortBy === "chg") s.sort((a, b) => b.dayPct - a.dayPct);
    else if (sortBy === "vol") s.sort((a, b) => (b.volRatio || 0) - (a.volRatio || 0));
    else if (sortBy === "price") s.sort((a, b) => b.price - a.price);
    return s;
  })();
  const pct = (v) => v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  const col = (v) => v == null ? C.textDim : v > 0 ? "#22d47e" : v < 0 ? "#ef4444" : C.text;
  // Day-change % for the loaded symbol, looked up across all movers buckets.
  const symDayPct = (() => {
    if (!lb) return null;
    for (const k of ["moversUp", "moversDown", "upOnVolume", "downOnVolume"]) {
      const hit = (lb[k] || []).find(r => r.symbol === sym);
      if (hit) return hit.dayPct;
    }
    return null;
  })();

  return (
    <div style={{ width: "100%" }}>
    <PerformanceCard C={C} MONO={MONO} SANS={SANS} />
    <BestOpportunities C={C} MONO={MONO} SANS={SANS} onPick={loadSym} macroData={macroData} />
    <MarketPulseBar C={C} MONO={MONO} SANS={SANS} />
    <SentimentRow C={C} MONO={MONO} SANS={SANS} />
    <SectorHeatStrip sectorData={sectorData} C={C} MONO={MONO} SANS={SANS} />
    <div style={{ width: "100%", display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* ── LEFT: movers list ── */}
      <div style={{ flex: "1 1 320px", minWidth: 300, maxWidth: 420 }}>
        <form onSubmit={(e) => { e.preventDefault(); loadSym(query); setQuery(""); }} style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 Load any symbol…"
            style={{ flex: 1, fontFamily: MONO, fontSize: 13, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text }} />
        </form>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {[["movers", "🔥 Movers"], ["watchlist", "⭐ My Watchlist"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setSource(id)}
              style={{ flex: 1, fontFamily: SANS, fontSize: 12, fontWeight: 800, padding: "7px 0", borderRadius: 8, cursor: "pointer",
                border: `1px solid ${source === id ? C.accent : C.border}`, background: source === id ? `${C.accent}16` : C.card, color: source === id ? C.accent : C.textDim }}>{lbl}</button>
          ))}
        </div>
        {source === "movers" && (
          <>
            <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
              {VIEWS.map(v => (
                <button key={v.id} onClick={() => setView(v.id)}
                  style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${view === v.id ? "#22d47e" : C.border}`, background: view === v.id ? "rgba(34,212,126,0.14)" : C.card, color: view === v.id ? "#22d47e" : C.textDim }}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>SORT</span>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ fontFamily: MONO, fontSize: 11, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}>
                <option value="bucket">Default (bucket rank)</option>
                <option value="chg">Day % change</option>
                <option value="vol">Volume vs 50d</option>
                <option value="price">Price</option>
              </select>
            </div>
          </>
        )}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.card }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 0.8fr", padding: "8px 12px", background: C.bg, borderBottom: `2px solid ${C.border}`, fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim }}>
            <div>SYMBOL</div><div style={{ textAlign: "right" }}>PRICE</div><div style={{ textAlign: "right" }}>DAY%</div><div style={{ textAlign: "right" }}>VOL</div>
          </div>
          {((source === "movers" && !lb) || (source === "watchlist" && wlRows === null)) && <div style={{ padding: "24px 0", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
          {source === "watchlist" && Array.isArray(wlRows) && wlRows.length === 0 && <div style={{ padding: "24px 12px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Your watchlist is empty — add names from any tab.</div>}
          {rows.map((r, i) => (
            <div key={r.symbol} onClick={() => loadSym(r.symbol)}
              style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 0.8fr", padding: "9px 12px", alignItems: "center", cursor: "pointer",
                borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none",
                background: r.symbol === sym ? "rgba(34,212,126,0.10)" : (i % 2 ? "transparent" : "rgba(127,127,127,0.03)") }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 13, color: r.symbol === sym ? "#22d47e" : C.text }}>{r.symbol}</div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.text }}>${r.price.toFixed(2)}</div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col(r.dayPct) }}>{pct(r.dayPct)}</div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: r.volRatio >= 1.5 ? "#f59e0b" : C.textDim }}>
                {source === "watchlist"
                  ? <span onClick={(e) => { e.stopPropagation(); removeFromWatchlist(r.symbol); }} title="Remove from watchlist" style={{ cursor: "pointer", color: C.textDim, fontWeight: 800, padding: "0 4px" }}>×</span>
                  : (r.volRatio == null ? "—" : r.volRatio.toFixed(1) + "×")}
              </div>
            </div>
          ))}
        </div>
        <MarketNewsWire C={C} MONO={MONO} SANS={SANS} />
        <COTPanel C={C} MONO={MONO} SANS={SANS} />
        <PredictionMarkets C={C} MONO={MONO} SANS={SANS} />
      </div>

      {/* ── RIGHT: pro chart ── */}
      <div style={{ flex: "2 1 520px", minWidth: 340 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: SANS, fontSize: 24, fontWeight: 900, color: C.text }}>{sym}</span>
          {chart && chart.price != null && <span style={{ fontFamily: MONO, fontSize: 18, color: C.text }}>${chart.price.toFixed(2)}</span>}
          {chart && !loadingChart && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "#0d9465" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#0d9465", display: "inline-block" }} /> LIVE
            </span>
          )}
          {chart && chart.stage && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{chart.stage}</span>}
          {loadingChart && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>loading…</span>}
          <button onClick={() => setDTab("smart")} title="Smart Money analysis inline (structure, order blocks, FVGs, AI review)"
            style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 8, cursor: "pointer", marginLeft: "auto",
              border: `1px solid ${C.accent}`, background: dTab === "smart" ? C.accent : `${C.accent}14`, color: dTab === "smart" ? "#fff" : C.accent }}>
            🔬 Smart Scan
          </button>
          <button onClick={addToWatchlist}
            style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 8, cursor: "pointer",
              border: `1px solid #d6a312`, background: "rgba(214,163,18,0.14)", color: "#d6a312" }}>
            ⭐ Add to Watchlist
          </button>
          {wlMsg && <span style={{ fontFamily: MONO, fontSize: 12, color: "#22d47e" }}>{wlMsg}</span>}
        </div>
        {chart && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {(() => {
              const s = chart, pill = (label, val, col) => (
                <div key={label} style={{ flex: "1 1 120px", minWidth: 110, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", background: C.card }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: 0.5 }}>{label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: col || C.text }}>{val}</div>
                </div>
              );
              const num = (v) => (v == null || isNaN(v)) ? null : v;
              const mc = fund && Number(fund.marketCap) > 0 ? Number(fund.marketCap) : null;
              const mcStr = mc == null ? "—" : mc >= 1e12 ? "$" + (mc / 1e12).toFixed(2) + "T" : mc >= 1e9 ? "$" + (mc / 1e9).toFixed(1) + "B" : "$" + (mc / 1e6).toFixed(0) + "M";
              const pe = fund && Number(fund.pe || fund.trailingPE) > 0 ? Number(fund.pe || fund.trailingPE) : null;
              return [
                pill("MARKET CAP", mcStr),
                pill("P/E", pe != null ? pe.toFixed(1) : "—"),
                pill("% TO 52W HIGH", s.pctFromHigh != null ? s.pctFromHigh.toFixed(1) + "%" : "—", s.pctFromHigh != null && s.pctFromHigh > -3 ? "#22d47e" : C.text),
                pill("52W HIGH", num(s.hi52) != null ? "$" + s.hi52.toFixed(2) : "—"),
                pill("52W LOW", num(s.lo52) != null ? "$" + s.lo52.toFixed(2) : "—"),
                pill("RS RATING", num(s.rsRating) != null ? String(s.rsRating) : "—", s.rsRating >= 80 ? "#22d47e" : s.rsRating >= 70 ? "#d6a312" : "#ef4444"),
                pill("VOL vs AVG", num(s.volRatio) != null ? s.volRatio.toFixed(2) + "×" : "—", s.volRatio >= 1.5 ? "#f59e0b" : C.text),
                pill("MOMENTUM", num(s.momentum) != null ? (s.momentum > 0 ? "+" : "") + s.momentum.toFixed(1) + "%" : "—", s.momentum > 0 ? "#22d47e" : "#ef4444"),
              ];
            })()}
          </div>
        )}
        {/* ── Per-symbol detail tabs ── */}
        <div style={{ display: "flex", gap: 4, margin: "4px 0 12px", flexWrap: "wrap", borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
          {[["chart", "📈 Chart"], ["smart", "🔬 Smart Scan"], ["valuation", "📊 Valuation"], ["analysts", "🎯 Analysts"], ["investors", "🏦 Investors"], ["earnings", "💰 Earnings"], ["company", "🏢 Company"], ["social", "💬 Social"], ["news", "📰 News"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setDTab(id)}
              style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 7, cursor: "pointer",
                border: `1px solid ${dTab === id ? C.accent : "transparent"}`, background: dTab === id ? `${C.accent}16` : "transparent", color: dTab === id ? C.accent : C.textDim }}>
              {lbl}
            </button>
          ))}
        </div>

        {dTab === "chart" && (
          <>
            {chart
              ? <TrendChart data={chart} C={C} MONO={MONO} SANS={SANS} height={520} />
              : <div style={{ height: 520, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 13, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 12 }}>Select a mover to load the chart…</div>}
            <TrendSetupPanel data={chart} C={C} MONO={MONO} SANS={SANS} />
            <TradeExtrasPanel data={chart} macroData={macroData} C={C} MONO={MONO} SANS={SANS} />
            <AiWhyPanel symbol={sym} price={chart && chart.price} changePct={symDayPct} C={C} MONO={MONO} SANS={SANS} />
            <AiPredictPanel symbol={sym} chart={chart} C={C} MONO={MONO} SANS={SANS} />
          </>
        )}
        {dTab === "smart" && <SmartScanPanel symbol={sym} chart={chart} C={C} MONO={MONO} SANS={SANS} />}
        {dTab === "valuation" && <FundamentalsPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} />}
        {dTab === "analysts" && <AnalystPeerPanel symbol={sym} price={chart && chart.price} lb={lb} C={C} MONO={MONO} SANS={SANS} />}
        {dTab === "investors" && <InvestorsPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} />}
        {dTab === "earnings" && <><EarningsSnapshot symbol={sym} C={C} MONO={MONO} SANS={SANS} /><EarningsBars symbol={sym} C={C} MONO={MONO} SANS={SANS} /></>}
        {dTab === "company" && <CompanyProfile symbol={sym} C={C} MONO={MONO} SANS={SANS} />}
        {dTab === "social" && <SocialFeed symbol={sym} C={C} MONO={MONO} SANS={SANS} />}
        {dTab === "news" && <NewsPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} />}
      </div>
    </div>
    </div>
  );
}
