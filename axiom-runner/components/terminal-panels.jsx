import { useState, useEffect } from "react";
import { NUM } from "./theme.js";
import { computeRegime, STOCK_TO_SECTOR, SECTOR_ETFS } from "./market-helpers.js";

// Small self-contained panels that make up MarketTerminalTab's per-symbol
// detail tabs (Valuation, Analysts, Investors, Earnings, Company, Social,
// News) plus the top-of-page strip (pulse bar, sentiment, sector heat,
// best-opportunities). None of these are reused outside MarketTerminalTab —
// grouped in one file rather than one-file-per-atom to avoid 19 near-empty
// files for components this small.

// Earnings snapshot from fundamentals (works on Render via stockanalysis) —
// TTM revenue, net income, EPS, margin, and the next earnings date.
export function EarningsSnapshot({ symbol, C, MONO, SANS }) {
  const [f, setF] = useState(null);
  useEffect(() => {
    if (!symbol) return; setF(null);
    fetch("/api/market/fundamentals?symbol=" + encodeURIComponent(symbol))
      .then(r => r.json()).then(d => setF(d && !d.error ? d : null)).catch(() => {});
  }, [symbol]);
  if (!f) return null;
  const rev = Number(f.revenue) || null;
  const ni = rev && f.profitMargin != null ? rev * f.profitMargin : null;
  const big = (v) => v == null ? "—" : v >= 1e12 ? "$" + (v / 1e12).toFixed(2) + "T" : v >= 1e9 ? "$" + (v / 1e9).toFixed(1) + "B" : "$" + (v / 1e6).toFixed(0) + "M";
  const box = (label, val, col) => (
    <div key={label} style={{ flex: "1 1 90px", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 11px", background: C.bg }}>
      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim }}>{label}</div>
      <div style={{ fontFamily: NUM, fontSize: 19, fontWeight: 700, color: col || C.text }}>{val}</div>
    </div>
  );
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 8 }}>💰 Earnings Snapshot — {symbol}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {box("REVENUE (TTM)", big(rev))}
        {box("NET INCOME", big(ni), ni > 0 ? "#0d9465" : ni < 0 ? "#c8282a" : null)}
        {box("EPS", f.eps != null ? "$" + Number(f.eps).toFixed(2) : "—")}
        {box("PROFIT MARGIN", f.profitMargin != null ? (f.profitMargin * 100).toFixed(1) + "%" : "—")}
        {box("NEXT EARNINGS", f.earningsDate ? String(f.earningsDate).replace(/,?\s*\d{4}$/, "") : "—")}
      </div>
    </div>
  );
}

// Annual earnings bars (past actuals + forward analyst estimates). Estimates are
// drawn hollow with an "E" tag. Reads /api/market/earnings.
export function EarningsBars({ symbol, C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | none
  const [metric, setMetric] = useState("revenue");

  useEffect(() => {
    if (!symbol) return;
    setState("loading"); setData(null);
    fetch("/api/market/earnings?symbol=" + encodeURIComponent(symbol))
      .then(r => r.json())
      .then(j => { if (j.ok && j.annual && j.annual.length) { setData(j); setState("ok"); } else { setData(j); setState("none"); } })
      .catch(() => setState("none"));
  }, [symbol]);

  const fmtBig = (v) => v == null ? "—" : Math.abs(v) >= 1e12 ? "$" + (v / 1e12).toFixed(2) + "T" : Math.abs(v) >= 1e9 ? "$" + (v / 1e9).toFixed(1) + "B" : Math.abs(v) >= 1e6 ? "$" + (v / 1e6).toFixed(0) + "M" : "$" + v.toFixed(0);
  const rows = (data && data.annual) || [];
  const hasRev = rows.some(r => r.revenue != null);
  const hasEps = rows.some(r => r.eps != null);
  const activeMetric = metric === "revenue" && hasRev ? "revenue" : hasEps ? "eps" : "revenue";
  const vals = rows.map(r => activeMetric === "revenue" ? r.revenue : r.eps);
  const max = Math.max(...vals.filter(v => v != null && v > 0), 1);
  const fmt = (v) => v == null ? "—" : activeMetric === "revenue" ? fmtBig(v) : "$" + v.toFixed(2);

  return (
    <div style={{ marginTop: 14, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", background: C.card }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.text }}>📊 Annual Earnings — {symbol}</div>
        {state === "ok" && (
          <div style={{ display: "flex", gap: 4 }}>
            {hasRev && <button onClick={() => setMetric("revenue")} style={{ fontFamily: MONO, fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: `1px solid ${activeMetric === "revenue" ? "#22d47e" : C.border}`, background: activeMetric === "revenue" ? "rgba(34,212,126,0.14)" : "transparent", color: activeMetric === "revenue" ? "#22d47e" : C.textDim }}>Revenue</button>}
            {hasEps && <button onClick={() => setMetric("eps")} style={{ fontFamily: MONO, fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: `1px solid ${activeMetric === "eps" ? "#22d47e" : C.border}`, background: activeMetric === "eps" ? "rgba(34,212,126,0.14)" : "transparent", color: activeMetric === "eps" ? "#22d47e" : C.textDim }}>EPS</button>}
          </div>
        )}
      </div>

      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "18px 0", textAlign: "center" }}>Loading earnings…</div>}
      {state === "none" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "16px 0", textAlign: "center" }}>⚠ {(data && data.reason) || "Earnings data unavailable."}</div>}

      {state === "ok" && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 150, paddingTop: 8 }}>
          {rows.map((r, i) => {
            const v = activeMetric === "revenue" ? r.revenue : r.eps;
            const h = v != null && v > 0 ? Math.max(6, Math.round((v / max) * 110)) : 6;
            const prev = i > 0 ? (activeMetric === "revenue" ? rows[i - 1].revenue : rows[i - 1].eps) : null;
            const yoy = prev && v ? Math.round(((v - prev) / Math.abs(prev)) * 100) : null;
            return (
              <div key={r.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.text, marginBottom: 3 }}>{fmt(v)}</div>
                {yoy != null && <div style={{ fontFamily: MONO, fontSize: 9, color: yoy >= 0 ? "#22d47e" : "#ef4444", marginBottom: 2 }}>{yoy > 0 ? "+" : ""}{yoy}%</div>}
                <div title={r.estimate ? "Analyst estimate" : "Reported"}
                  style={{ width: "78%", height: h, borderRadius: "4px 4px 0 0",
                    background: r.estimate ? "transparent" : "#22d47e",
                    border: r.estimate ? "2px dashed #22d47e" : "none" }} />
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 5 }}>{r.year}{r.estimate ? "ᴱ" : ""}</div>
              </div>
            );
          })}
        </div>
      )}
      {state === "ok" && <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 8 }}>Solid = reported · dashed = analyst estimate (ᴱ). Source: {data.source}.</div>}
    </div>
  );
}

// AI "why is this moving" — on-demand (button) web-searched blurb. Reads
// /api/market/ai-why. On-demand so it only spends API tokens when asked.
export function AiWhyPanel({ symbol, price, changePct, C, MONO, SANS }) {
  const [reply, setReply] = useState("");
  const [state, setState] = useState("idle"); // idle | loading | ok | err
  const [err, setErr] = useState("");

  useEffect(() => { setReply(""); setState("idle"); setErr(""); }, [symbol]);

  const ask = () => {
    setState("loading"); setErr("");
    fetch("/api/market/ai-why", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, price, changePct }),
    })
      .then(r => r.json())
      .then(j => { if (j.ok) { setReply(j.reply); setState("ok"); } else { setErr(j.error || "failed"); setState("err"); } })
      .catch(e => { setErr(e.message); setState("err"); });
  };

  return (
    <div style={{ marginTop: 14, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", background: C.card }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.text }}>🤖 Why is {symbol} moving?</div>
        <button onClick={ask} disabled={state === "loading"}
          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8, cursor: state === "loading" ? "wait" : "pointer",
            border: `1px solid #7c5cff`, background: "rgba(124,92,255,0.14)", color: "#a78bfa" }}>
          {state === "loading" ? "Searching…" : state === "ok" ? "↻ Refresh" : "Ask AI"}
        </button>
      </div>
      {state === "err" && <div style={{ fontFamily: MONO, fontSize: 12, color: "#ef4444", marginTop: 8 }}>⚠ {err}</div>}
      {state === "ok" && (
        <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.5, color: C.text, marginTop: 10, whiteSpace: "pre-wrap" }}>{reply}</div>
      )}
      {state === "idle" && <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 8 }}>Live web-searched catalyst — click Ask AI.</div>}
    </div>
  );
}

// Latest headlines for the selected symbol. Reads /api/market/news.
export function NewsPanel({ symbol, C, MONO, SANS }) {
  const [items, setItems] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    if (!symbol) return;
    setState("loading"); setItems(null);
    fetch("/api/market/news?tickers=" + encodeURIComponent(symbol) + "&limit=8")
      .then(r => r.json())
      .then(j => { const arr = Array.isArray(j) ? j : (j.news || j.items || []); if (arr.length) { setItems(arr); setState("ok"); } else setState("none"); })
      .catch(() => setState("none"));
  }, [symbol]);

  const ago = (iso) => {
    if (!iso) return "";
    const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (mins < 60) return mins + "m ago";
    if (mins < 1440) return Math.round(mins / 60) + "h ago";
    return Math.round(mins / 1440) + "d ago";
  };

  return (
    <div style={{ marginTop: 14, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", background: C.card }}>
      <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 10 }}>📰 Latest — {symbol}</div>
      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "14px 0", textAlign: "center" }}>Loading news…</div>}
      {state === "none" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "14px 0", textAlign: "center" }}>No recent headlines.</div>}
      {state === "ok" && (items || []).slice(0, 8).map((it, i) => (
        <a key={i} href={it.link || it.url || "#"} target="_blank" rel="noopener noreferrer"
          style={{ display: "block", textDecoration: "none", padding: "9px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
          <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>{it.title}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 3 }}>{(it.source || it.publisher || "")}{it.publishedAt ? " · " + ago(it.publishedAt) : ""}</div>
        </a>
      ))}
    </div>
  );
}

// Sector heat strip: today's % move for each S&P sector ETF, green→red.
export function SectorHeatStrip({ sectorData, C, MONO, SANS }) {
  const NAMES = { XLK: "Tech", XLV: "Health", XLF: "Financials", XLY: "Cons Disc", XLC: "Comms", XLI: "Industrials", XLE: "Energy", XLP: "Staples", XLU: "Utilities", XLRE: "Real Est", XLB: "Materials" };
  const rows = Object.keys(NAMES).map(sym => {
    const d = (sectorData || []).find(x => String(x.symbol || "").toUpperCase() === sym);
    return { sym, name: NAMES[sym], chg: d ? Number(d.changesPercentage || 0) : null };
  }).filter(r => r.chg != null).sort((a, b) => b.chg - a.chg);
  if (!rows.length) return null;
  const bg = (v) => v > 0 ? `rgba(34,212,126,${Math.min(0.6, 0.12 + Math.abs(v) * 0.12)})` : `rgba(239,68,68,${Math.min(0.6, 0.12 + Math.abs(v) * 0.12)})`;
  return (
    <div style={{ width: "100%", marginBottom: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>SECTOR HEAT — TODAY</div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {rows.map(r => (
          <div key={r.sym} title={`${r.name} (${r.sym})`}
            style={{ flex: "1 1 80px", minWidth: 74, textAlign: "center", padding: "6px 4px", borderRadius: 7, background: bg(r.chg), border: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, color: C.text }}>{r.name}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: r.chg >= 0 ? "#0a7d43" : "#b91c1c" }}>{r.chg > 0 ? "+" : ""}{r.chg.toFixed(2)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Live market-pulse strip: SPY / QQQ / DIA / VIX / BTC.
export function MarketPulseBar({ C, MONO, SANS }) {
  const [q, setQ] = useState({});
  useEffect(() => {
    const merge = (d) => { const arr = Array.isArray(d) ? d : (d.quotes || []); setQ(prev => { const m = { ...prev }; arr.forEach(x => m[String(x.symbol).toUpperCase()] = x); return m; }); };
    const load = () => {
      // Fast path: SPY/QQQ/DIA via Alpaca (~0.3s) — show immediately.
      fetch("/api/market/quote?symbols=SPY,QQQ,DIA").then(r => r.json()).then(merge).catch(() => {});
      // Slow path: ^VIX/BTC go to Yahoo (blocked/slow on Render) — fill in when ready.
      fetch("/api/market/quote?symbols=^VIX,BTC-USD").then(r => r.json()).then(merge).catch(() => {});
    };
    load(); const t = setInterval(load, 60000); return () => clearInterval(t);
  }, []);
  const items = [["SPY", "S&P 500"], ["QQQ", "Nasdaq"], ["DIA", "Dow"], ["^VIX", "VIX"], ["BTC-USD", "Bitcoin"]];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
      {items.map(([sym, name]) => {
        const x = q[sym] || {}; const chg = Number(x.changesPercentage);
        const col = !isFinite(chg) ? C.textDim : chg > 0 ? "#0d9465" : chg < 0 ? "#c8282a" : C.text;
        const isVix = sym === "^VIX";
        return (
          <div key={sym} style={{ flex: "1 1 130px", minWidth: 120, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", background: C.bg }}>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim }}>{name}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: NUM, fontSize: 20, fontWeight: 700, color: C.text }}>{isFinite(x.price) ? (x.price >= 1000 ? Math.round(x.price).toLocaleString() : x.price?.toFixed(2)) : "—"}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: isVix ? (chg > 0 ? "#c8282a" : "#0d9465") : col }}>{isFinite(chg) ? (chg > 0 ? "+" : "") + chg.toFixed(2) + "%" : ""}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Fear & Greed dial + StockTwits social buzz, side by side.
export function SentimentRow({ C, MONO, SANS }) {
  const [fg, setFg] = useState(null);
  const [soc, setSoc] = useState(null);
  useEffect(() => {
    fetch("/api/market/feargreed").then(r => r.json()).then(d => d.ok !== false && setFg(d)).catch(() => {});
    fetch("/api/market/social-sentiment?symbols=SPY,QQQ").then(r => r.json()).then(d => d.ok !== false && setSoc(d)).catch(() => {});
  }, []);
  const fgCol = !fg ? C.textDim : fg.score <= 25 ? "#c8282a" : fg.score <= 45 ? "#e0803a" : fg.score <= 55 ? "#c9a227" : fg.score <= 75 ? "#5ab552" : "#0d9465";
  const socCol = !soc ? C.textDim : soc.netPct >= 8 ? "#0d9465" : soc.netPct <= -8 ? "#c8282a" : "#c9a227";
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 240px", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", background: C.bg }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim, marginBottom: 6 }}>FEAR &amp; GREED</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: NUM, fontSize: 30, fontWeight: 700, color: fgCol }}>{fg ? fg.score : "—"}</span>
          <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, color: fgCol }}>{fg ? fg.label : ""}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, marginTop: 6, background: "linear-gradient(to right,#c8282a,#e0803a,#c9a227,#5ab552,#0d9465)", position: "relative" }}>
          {fg && <div style={{ position: "absolute", left: `calc(${Math.max(0, Math.min(100, fg.score))}% - 5px)`, top: -2, width: 10, height: 10, borderRadius: "50%", background: "#fff", border: `2px solid ${fgCol}` }} />}
        </div>
      </div>
      <div style={{ flex: "1 1 240px", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", background: C.bg }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim, marginBottom: 6 }}>SOCIAL BUZZ (StockTwits)</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: NUM, fontSize: 30, fontWeight: 700, color: socCol }}>{soc ? (soc.netPct > 0 ? "+" : "") + soc.netPct + "%" : "—"}</span>
          <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, color: socCol }}>{soc ? soc.label : ""}</span>
        </div>
        {soc && soc.trending && soc.trending.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
            {soc.trending.slice(0, 8).map((t, i) => (
              <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.accent, background: `${C.accent}14`, borderRadius: 4, padding: "1px 6px" }}>{t.symbol || t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Market-wide news wire (top headlines, not per-symbol).
export function MarketNewsWire({ C, MONO, SANS }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    fetch("/api/market/news?tickers=SPY,QQQ,DIA&limit=14")
      .then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : (d.news || []))).catch(() => setItems([]));
  }, []);
  const ago = (iso) => { if (!iso) return ""; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? m + "m" : m < 1440 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d"; };
  return (
    <div style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg, overflow: "hidden" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, padding: "9px 12px", borderBottom: `1px solid ${C.border}` }}>📡 MARKET WIRE</div>
      {!items && <div style={{ padding: "18px 0", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {items && items.slice(0, 14).map((it, i) => (
        <a key={i} href={it.link || it.url || "#"} target="_blank" rel="noopener noreferrer"
          style={{ display: "block", textDecoration: "none", padding: "8px 12px", borderTop: i ? `1px solid ${C.border}` : "none" }}>
          <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>{it.title}</div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginTop: 2 }}>{(it.source || it.publisher || "")}{it.publishedAt ? " · " + ago(it.publishedAt) + " ago" : ""}</div>
        </a>
      ))}
    </div>
  );
}

// Analyst consensus for the loaded symbol + how it ranks vs sector peers today.
export function AnalystPeerPanel({ symbol, price, lb, C, MONO, SANS }) {
  const [f, setF] = useState(null);
  useEffect(() => {
    if (!symbol) return;
    setF(null);
    fetch("/api/market/fundamentals?symbol=" + encodeURIComponent(symbol))
      .then(r => r.json()).then(d => setF(d && !d.error ? d : null)).catch(() => {});
  }, [symbol]);
  const target = f && Number(f.analystTarget || f.targetMeanPrice) > 0 ? Number(f.analystTarget || f.targetMeanPrice) : null;
  const upside = target && price ? Math.round(((target - price) / price) * 100) : null;
  const rec = f && f.recommendationKey ? String(f.recommendationKey).replace(/_/g, " ").toUpperCase() : null;
  const recCol = rec ? (/BUY/.test(rec) ? "#0d9465" : /SELL|UNDER/.test(rec) ? "#c8282a" : "#c9a227") : C.textDim;
  // Peer rank from the leaderboard universe, matched by sector.
  const sec = STOCK_TO_SECTOR[symbol];
  let peers = [];
  if (lb && sec) {
    const all = [...(lb.moversUp || []), ...(lb.moversDown || []), ...(lb.upOnVolume || []), ...(lb.downOnVolume || [])];
    const seen = new Set();
    peers = all.filter(r => { if (seen.has(r.symbol)) return false; seen.add(r.symbol); return STOCK_TO_SECTOR[r.symbol] === sec; })
      .sort((a, b) => b.dayPct - a.dayPct);
  }
  const rank = peers.findIndex(p => p.symbol === symbol);
  return (
    <div style={{ marginTop: 14, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", background: C.bg }}>
      <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 10 }}>🎯 Analyst &amp; Peers — {symbol}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ flex: "1 1 100px", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px" }}>
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>ANALYST TARGET</div>
          <div style={{ fontFamily: NUM, fontSize: 22, fontWeight: 700, color: C.text }}>{target ? "$" + target.toFixed(2) : "—"}</div>
          {upside != null && <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: upside >= 0 ? "#0d9465" : "#c8282a" }}>{upside > 0 ? "+" : ""}{upside}% upside</div>}
        </div>
        <div style={{ flex: "1 1 100px", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px" }}>
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>CONSENSUS</div>
          <div style={{ fontFamily: NUM, fontSize: 22, fontWeight: 700, color: recCol }}>{rec || "—"}</div>
          {f && f.numberOfAnalystOpinions ? <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{f.numberOfAnalystOpinions} analysts</div> : null}
        </div>
      </div>
      {peers.length > 1 ? (
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 5 }}>
            SECTOR PEERS TODAY {rank >= 0 ? `· ${symbol} ranks #${rank + 1} of ${peers.length}` : ""}
          </div>
          {peers.slice(0, 6).map(p => (
            <div key={p.symbol} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: p.symbol === symbol ? 800 : 600, color: p.symbol === symbol ? C.accent : C.text }}>{p.symbol}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: p.dayPct >= 0 ? "#0d9465" : "#c8282a" }}>{p.dayPct > 0 ? "+" : ""}{p.dayPct.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      ) : <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No sector peers in the tracked universe.</div>}
    </div>
  );
}

// Valuation + growth + company profile for the loaded symbol.
export function FundamentalsPanel({ symbol, C, MONO, SANS }) {
  const [f, setF] = useState(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    if (!symbol) return;
    setState("loading"); setF(null);
    fetch("/api/market/fundamentals?symbol=" + encodeURIComponent(symbol))
      .then(r => r.json()).then(d => { if (d && !d.error) { setF(d); setState("ok"); } else setState("none"); }).catch(() => setState("none"));
  }, [symbol]);
  const pct = (v) => v == null || isNaN(v) ? "—" : (v * 100).toFixed(1) + "%";
  const num = (v, d = 2) => v == null || isNaN(v) || v === 0 ? "—" : Number(v).toFixed(d);
  const box = (label, val, col) => (
    <div key={label} style={{ flex: "1 1 90px", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 11px", background: C.bg }}>
      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim }}>{label}</div>
      <div style={{ fontFamily: NUM, fontSize: 19, fontWeight: 700, color: col || C.text }}>{val}</div>
    </div>
  );
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", background: C.bg }}>
      <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 10 }}>📊 Valuation &amp; Growth — {symbol}</div>
      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "16px 0", textAlign: "center" }}>Loading…</div>}
      {state === "none" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "16px 0", textAlign: "center" }}>⚠ Fundamentals unavailable (add an FMP key for full data on the live server).</div>}
      {state === "ok" && f && (
        <>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 5 }}>VALUATION</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {box("P/E", num(f.pe || f.trailingPE, 1))}
            {box("P/S", num(f.priceToSales, 1))}
            {box("P/B", num(f.priceToBook, 1))}
            {box("PEG", num(f.pegRatio, 2))}
            {box("BETA", num(f.beta, 2))}
            {box("DIV YIELD", f.dividendYield != null ? pct(f.dividendYield) : "—")}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 5 }}>GROWTH &amp; MARGINS</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {box("REV GROWTH", pct(f.revenueGrowth), f.revenueGrowth > 0 ? "#0d9465" : f.revenueGrowth < 0 ? "#c8282a" : null)}
            {box("EPS GROWTH", pct(f.earningsGrowth), f.earningsGrowth > 0 ? "#0d9465" : f.earningsGrowth < 0 ? "#c8282a" : null)}
            {box("GROSS MGN", pct(f.grossMargin))}
            {box("PROFIT MGN", pct(f.profitMargin))}
            {box("ROE", pct(f.roe))}
          </div>
        </>
      )}
    </div>
  );
}

// Company profile card — sector/industry from our map + any provider profile text.
export function CompanyProfile({ symbol, C, MONO, SANS }) {
  const [f, setF] = useState(null);
  useEffect(() => {
    if (!symbol) return; setF(null);
    fetch("/api/market/fundamentals?symbol=" + encodeURIComponent(symbol))
      .then(r => r.json()).then(d => setF(d && !d.error ? d : null)).catch(() => {});
  }, [symbol]);
  const sectorEtf = STOCK_TO_SECTOR[symbol];
  const sectorName = (SECTOR_ETFS.find(s => s.symbol === sectorEtf) || {}).name;
  const mc = f && Number(f.marketCap) > 0 ? Number(f.marketCap) : null;
  const mcStr = mc == null ? "—" : mc >= 1e12 ? "$" + (mc / 1e12).toFixed(2) + "T" : mc >= 1e9 ? "$" + (mc / 1e9).toFixed(1) + "B" : "$" + (mc / 1e6).toFixed(0) + "M";
  const row = (k, v) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{k}</span>
      <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: C.text }}>{v}</span>
    </div>
  );
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", background: C.bg }}>
      <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 10 }}>🏢 Company — {symbol}</div>
      {row("Sector", sectorName || "—")}
      {row("Market Cap", mcStr)}
      {row("Shares Out", f && f.sharesOutstanding ? (f.sharesOutstanding / 1e9).toFixed(2) + "B" : "—")}
      {row("Analyst Target", f && Number(f.analystTarget || f.targetMeanPrice) > 0 ? "$" + Number(f.analystTarget || f.targetMeanPrice).toFixed(2) : "—")}
      {f && f.description && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.55, marginTop: 10 }}>{String(f.description).slice(0, 400)}{f.description.length > 400 ? "…" : ""}</div>}
      {!(f && f.description) && <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 10 }}>Company description needs an FMP key on the live server.</div>}
    </div>
  );
}

// AI price prediction for a chosen future date.
export function AiPredictPanel({ symbol, chart, C, MONO, SANS }) {
  const dflt = () => { const d = new Date(); d.setMonth(d.getMonth() + 3); return d.toISOString().slice(0, 10); };
  const [date, setDate] = useState(dflt());
  const [reply, setReply] = useState(""); const [state, setState] = useState("idle");
  useEffect(() => { setReply(""); setState("idle"); }, [symbol]);
  const go = () => {
    if (!chart) return;
    setState("loading");
    fetch("/api/market/ai-predict", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, price: chart.price, targetDate: date, stage: chart.stage, rsRating: chart.rsRating, hi52: chart.hi52, lo52: chart.lo52, momentum: chart.momentum }) })
      .then(r => r.json()).then(j => { if (j.ok) { setReply(j.reply); setState("ok"); } else setState("err"); }).catch(() => setState("err"));
  };
  return (
    <div style={{ marginTop: 14, border: `1px solid #7c5cff55`, borderRadius: 12, padding: "12px 14px", background: "rgba(124,92,255,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: reply ? 10 : 0 }}>
        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.text }}>🔮 AI Price Prediction</div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ fontFamily: MONO, fontSize: 12, padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text }} />
        <button onClick={go} disabled={state === "loading" || !chart}
          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8, cursor: chart ? "pointer" : "not-allowed",
            border: `1px solid #7c5cff`, background: "rgba(124,92,255,0.16)", color: "#a78bfa" }}>
          {state === "loading" ? "Predicting…" : "Predict"}
        </button>
      </div>
      {state === "err" && <div style={{ fontFamily: MONO, fontSize: 12, color: "#c8282a" }}>⚠ Prediction failed — try again.</div>}
      {state === "ok" && <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.6, color: C.text, whiteSpace: "pre-wrap" }}>{reply}</div>}
      {state === "idle" && <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 6 }}>Pick a date → AI projects a target price + range. Educational, not advice.</div>}
    </div>
  );
}

// COT (Commitment of Traders) — weekly CFTC positioning of big futures traders.
export function COTPanel({ C, MONO, SANS }) {
  const [d, setD] = useState(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    fetch("/api/cot/status").then(r => r.json())
      .then(j => { if (j.ok && j.summary) { setD(j.summary); setState("ok"); } else setState("none"); })
      .catch(() => setState("none"));
  }, []);
  const biasCol = (b) => { const s = String(b || "").toLowerCase(); return s.includes("bull") ? "#0d9465" : s.includes("bear") ? "#c8282a" : C.textDim; };
  const rows = d ? [
    ["Equities (S&P/Nas)", d.equityBias], ["Bonds", d.bondBias], ["US Dollar", d.dollarBias],
    ["Gold", d.goldBias], ["Oil", d.oilBias], ["Bitcoin", d.bitcoinBias], ["VIX", d.vixBias],
  ].filter(r => r[1]) : [];
  return (
    <div style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim }}>🏛 COT POSITIONING</span>
        {d && d.reportDate && <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>wk {d.reportDate}</span>}
      </div>
      {state === "loading" && <div style={{ padding: "16px 0", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {state === "none" && <div style={{ padding: "14px 12px", textAlign: "center", fontFamily: MONO, fontSize: 11, color: C.textDim }}>COT data not available yet.</div>}
      {state === "ok" && rows.map(([name, bias], i) => (
        <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 12px", borderTop: i ? `1px solid ${C.border}` : "none", alignItems: "center" }}>
          <span style={{ fontFamily: SANS, fontSize: 12, color: C.text }}>{name}</span>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: biasCol(bias), textAlign: "right" }}>{bias}</span>
        </div>
      ))}
      {state === "ok" && <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, padding: "7px 12px" }}>Big-trader futures positioning (CFTC, weekly). ⚠️ Crowded = extreme positioning, reversal risk.</div>}
    </div>
  );
}

// Prediction markets (Polymarket) — event odds that move the tape. Free, works
// from Render (no key). Fed/rates/recession/crypto/politics.
export function PredictionMarkets({ C, MONO, SANS }) {
  const [m, setM] = useState(null);
  const [state, setState] = useState("loading");
  const [cat, setCat] = useState("ALL");
  useEffect(() => {
    fetch("/api/market/predictions").then(r => r.json())
      .then(d => { if (d && d.markets && d.markets.length) { setM(d.markets); setState("ok"); } else setState("none"); })
      .catch(() => setState("none"));
  }, []);
  const CATS = ["ALL", "MACRO", "STOCKS", "CRYPTO", "POLITICS"];
  const rows = (m || []).filter(x => cat === "ALL" || x.category === cat).slice(0, 12);
  const barCol = (p) => p >= 65 ? "#0d9465" : p >= 35 ? "#c9a227" : "#c8282a";
  return (
    <div style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg, overflow: "hidden" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, padding: "9px 12px", borderBottom: `1px solid ${C.border}` }}>🎲 PREDICTION MARKETS</div>
      {state === "ok" && (
        <div style={{ display: "flex", gap: 4, padding: "8px 10px", flexWrap: "wrap", borderBottom: `1px solid ${C.border}` }}>
          {CATS.map(c => (
            <button key={c} onClick={() => setCat(c)}
              style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, cursor: "pointer",
                border: `1px solid ${cat === c ? C.accent : C.border}`, background: cat === c ? `${C.accent}16` : "transparent", color: cat === c ? C.accent : C.textDim }}>{c}</button>
          ))}
        </div>
      )}
      {state === "loading" && <div style={{ padding: "18px 0", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {state === "none" && <div style={{ padding: "16px 0", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>No markets right now.</div>}
      {state === "ok" && rows.map((x, i) => (
        <div key={i} style={{ padding: "8px 12px", borderTop: i ? `1px solid ${C.border}` : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: SANS, fontSize: 12, color: C.text, lineHeight: 1.3 }}>{x.question}</span>
            <span style={{ fontFamily: NUM, fontSize: 18, fontWeight: 700, color: barCol(x.yesPct), whiteSpace: "nowrap" }}>{x.yesPct}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: C.border, marginTop: 5 }}>
            <div style={{ width: Math.max(2, Math.min(100, x.yesPct)) + "%", height: "100%", borderRadius: 2, background: barCol(x.yesPct) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Social feed — StockTwits message stream ("X for traders") for the symbol.
export function SocialFeed({ symbol, C, MONO, SANS }) {
  const [msgs, setMsgs] = useState(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    if (!symbol) return; setState("loading"); setMsgs(null);
    fetch("/api/market/social-stream?symbol=" + encodeURIComponent(symbol))
      .then(r => r.json()).then(j => { if (j.ok && j.messages && j.messages.length) { setMsgs(j.messages); setState("ok"); } else setState("none"); })
      .catch(() => setState("none"));
  }, [symbol]);
  const ago = (iso) => { if (!iso) return ""; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? m + "m" : m < 1440 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d"; };
  const bull = (msgs || []).filter(m => m.sentiment === "Bullish").length;
  const bear = (msgs || []).filter(m => m.sentiment === "Bearish").length;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.text }}>💬 Social — {symbol}</span>
        {state === "ok" && <span style={{ fontFamily: MONO, fontSize: 11 }}><span style={{ color: "#0d9465" }}>🟢 {bull}</span> · <span style={{ color: "#c8282a" }}>🔴 {bear}</span></span>}
      </div>
      {state === "loading" && <div style={{ padding: "18px 0", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading feed…</div>}
      {state === "none" && <div style={{ padding: "16px 0", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>No recent posts.</div>}
      {state === "ok" && (msgs || []).map((m) => {
        const sc = m.sentiment === "Bullish" ? "#0d9465" : m.sentiment === "Bearish" ? "#c8282a" : C.textDim;
        return (
          <div key={m.id} style={{ padding: "9px 14px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.accent }}>@{m.user}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{m.sentiment ? <b style={{ color: sc }}>{m.sentiment === "Bullish" ? "🟢 Bull" : "🔴 Bear"} · </b> : ""}{ago(m.at)}</span>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.4, marginTop: 3 }}>{m.body}</div>
          </div>
        );
      })}
      {state === "ok" && <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, padding: "8px 14px" }}>Source: StockTwits (free). X/Twitter posts require a paid API.</div>}
    </div>
  );
}

// Institutional ownership + insider transactions for the loaded symbol.
export function InvestorsPanel({ symbol, C, MONO, SANS }) {
  const [d, setD] = useState(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    if (!symbol) return; setState("loading"); setD(null);
    fetch("/api/market/insider?ticker=" + encodeURIComponent(symbol))
      .then(r => r.json()).then(j => { setD(j); setState(j && j.ok ? "ok" : "none"); }).catch(() => setState("none"));
  }, [symbol]);
  const inst = d && d.institutional || {};
  const holders = (inst.institutions || []);
  const txns = (d && d.insiderTransactions && d.insiderTransactions.transactions) || (d && d.insiderTransactions) || [];
  const big = (v) => !v ? "—" : v >= 1e9 ? "$" + (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(0) + "M" : "$" + v.toFixed(0);
  const hasData = holders.length || (Array.isArray(txns) && txns.length) || inst.institutionsPct;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", background: C.bg }}>
      <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 10 }}>🏦 Investors — {symbol}</div>
      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "16px 0", textAlign: "center" }}>Loading…</div>}
      {(state === "none" || (state === "ok" && !hasData)) && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "16px 0", textAlign: "center" }}>⚠ Ownership data unavailable (Yahoo is IP-blocked on the live server — works locally / with a data key).</div>}
      {state === "ok" && hasData && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>HELD BY INSTITUTIONS</div>
              <div style={{ fontFamily: NUM, fontSize: 22, fontWeight: 700, color: C.text }}>{inst.institutionsPct ? inst.institutionsPct + "%" : "—"}</div>
            </div>
            <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>HELD BY INSIDERS</div>
              <div style={{ fontFamily: NUM, fontSize: 22, fontWeight: 700, color: C.text }}>{inst.insidersPct ? inst.insidersPct + "%" : "—"}</div>
            </div>
          </div>
          {holders.length > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 5 }}>TOP INSTITUTIONAL HOLDERS</div>
              {holders.slice(0, 6).map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, whiteSpace: "nowrap" }}>{h.pctHeld ? h.pctHeld + "% · " : ""}{big(h.value)}</span>
                </div>
              ))}
            </>
          )}
          {Array.isArray(txns) && txns.length > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, margin: "12px 0 5px" }}>RECENT INSIDER TRANSACTIONS</div>
              {txns.slice(0, 6).map((t, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name} <span style={{ color: C.textDim }}>{t.role}</span></span>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: t.type === "SELL" ? "#c8282a" : "#0d9465", whiteSpace: "nowrap" }}>{t.type} {big(t.value)}</span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

// Position sizing off the saved account/risk % + an AI second opinion on the loaded
// setup — the two pieces the standalone Trade Analyzer had that the Terminal chart
// tab didn't (ported from RhProAnalyzer so that tab can be retired).
export function TradeExtrasPanel({ data, macroData, C, MONO, SANS }) {
  const [ai, setAi] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  useEffect(() => { setAi(""); }, [data?.symbol]);
  if (!data || !data.setup) return null;
  const s = data.setup;
  const entry = Number(s.entry || data.price || 0), stop = Number(s.stop || 0);
  const riskPS = Math.max(0.01, entry - stop);
  const rr = s.target2 != null ? (Number(s.target2) - entry) / riskPS : 0;
  const acct = Number(localStorage.getItem("axiom_acct_size")) || 10000;
  const riskPct = Number(localStorage.getItem("axiom_risk_pct")) || 1;
  const shares = riskPS > 0 ? Math.floor((acct * riskPct / 100) / riskPS) : 0;
  const dollarRisk = +(shares * riskPS).toFixed(0);
  const regime = computeRegime(macroData);
  const buyPoint = !!(s.actionable && !s.extended);
  const Row = ({ k, v, c }) => <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 13 }}><span style={{ color: C.textDim }}>{k}</span><span style={{ fontFamily: MONO, fontWeight: 700, color: c || C.text }}>{v}</span></div>;
  const askAi = () => {
    setAiLoading(true);
    fetch("/api/market/ai-setup-review", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setup: { symbol: data.symbol, px: data.price, chg: 0,
        aScore: Math.round(rr * 20), grade: s.verdict, marketScore: regime.score, marketPass: regime.score >= 75,
        sector: null, relStrength: data.rsRating, rvol: (data.volRatio || 0).toFixed(1),
        bestEntry: s.ema21 || s.entry, stop: s.stop, rr: rr.toFixed(1), atEntry: buyPoint } }) })
      .then(r => r.json()).then(d => setAi(d.ok ? d.review : `⚠ ${d.error || "AI unavailable"}`))
      .catch(e => setAi("⚠ " + e.message)).finally(() => setAiLoading(false));
  };
  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, maxWidth: 320 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 8 }}>POSITION SIZE</div>
        <Row k="Account" v={`$${acct.toLocaleString()}`} />
        <Row k="Risk per trade" v={`${riskPct}%`} />
        <Row k="Suggested shares" v={shares} c={C.accent} />
        <Row k="Dollar risk (max loss)" v={`$${dollarRisk}`} c={C.red} />
        <Row k="Capital deployed" v={`$${(shares * entry).toFixed(0)}`} />
        <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 6 }}>Sizes off your saved account & risk % (Tools tab).</div>
      </div>
      <div>
        <button onClick={askAi} disabled={aiLoading} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "9px 16px", borderRadius: 8, border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent, cursor: "pointer" }}>{aiLoading ? "⏳ asking AI…" : "🧠 AI second opinion"}</button>
        {ai && <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 10, background: `${C.accent}0a`, border: `1px solid ${C.accent}33`, fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{ai}</div>}
      </div>
    </div>
  );
}

// "How am I doing" — real results of the paper account: equity, realized P&L,
// win rate, profit factor, best/worst — from Alpaca closed trades.
export function PerformanceCard({ C, MONO, SANS }) {
  const [acct, setAcct] = useState(null);
  const [trades, setTrades] = useState(null);
  useEffect(() => {
    fetch("/api/alpaca/account").then(r => r.json()).then(d => d.ok && setAcct(d.account)).catch(() => {});
    fetch("/api/alpaca/closed-trades").then(r => r.json()).then(d => setTrades(Array.isArray(d.trades) ? d.trades : [])).catch(() => setTrades([]));
  }, []);
  if (!acct && !trades) return null;
  const n = (trades || []).length;
  const wins = (trades || []).filter(t => t.pnl > 0);
  const losses = (trades || []).filter(t => t.pnl < 0);
  const winRate = n ? Math.round(wins.length / n * 100) : null;
  const totalPnl = (trades || []).reduce((s, t) => s + (t.pnl || 0), 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : null);
  const best = n ? (trades || []).reduce((a, b) => b.pnl > a.pnl ? b : a) : null;
  const worst = n ? (trades || []).reduce((a, b) => b.pnl < a.pnl ? b : a) : null;
  const eq = acct ? Number(acct.equity) : null;
  const dayPl = acct && acct.lastEquity ? eq - Number(acct.lastEquity) : null;
  const money = (v) => v == null ? "—" : (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(0);
  const box = (label, val, col) => (
    <div key={label} style={{ flex: "1 1 90px", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 11px", background: C.bg }}>
      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim }}>{label}</div>
      <div style={{ fontFamily: NUM, fontSize: 20, fontWeight: 700, color: col || C.text }}>{val}</div>
    </div>
  );
  return (
    <div style={{ marginBottom: 14, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", background: C.card }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 900, color: C.text }}>📈 My Performance</span>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "#0d9465", background: "#0d946518", borderRadius: 4, padding: "1px 7px" }}>PAPER</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {box("EQUITY", eq == null ? "—" : "$" + eq.toLocaleString(undefined, { maximumFractionDigits: 0 }))}
        {box("TODAY", money(dayPl), dayPl == null ? null : dayPl >= 0 ? "#0d9465" : "#c8282a")}
        {box("REALIZED P&L", money(totalPnl), totalPnl >= 0 ? "#0d9465" : "#c8282a")}
        {box("WIN RATE", winRate == null ? "—" : winRate + "%", winRate >= 50 ? "#0d9465" : winRate == null ? null : "#d6a312")}
        {box("TRADES", String(n))}
        {box("PROFIT FACTOR", pf == null ? "—" : pf === Infinity ? "∞" : pf.toFixed(2), pf == null ? null : pf >= 1.5 ? "#0d9465" : pf >= 1 ? "#d6a312" : "#c8282a")}
      </div>
      {n > 0 ? (
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 8 }}>
          Best: <b style={{ color: "#0d9465" }}>{best.symbol} {money(best.pnl)}</b> · Worst: <b style={{ color: "#c8282a" }}>{worst.symbol} {money(worst.pnl)}</b> · Profit factor &gt;1 = making money over time.
        </div>
      ) : (
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 8 }}>No closed trades yet — stats fill in as the autopilot's paper positions close. Give it time.</div>
      )}
    </div>
  );
}

// ONE-CLICK best opportunities: scan a liquid universe, rank the best long
// buy-points, show top 5 with why / entry / stop / target / R:R. Click → chart.
const BEST_OPP_UNIVERSE = [
  "NVDA","AAPL","MSFT","AMZN","META","GOOGL","AVGO","AMD","NFLX","TSLA",
  "MU","SMCI","DELL","ARM","PLTR","CRWD","SNOW","NOW","ORCL","ANET",
  "MRVL","PANW","COIN","HOOD","UBER","SHOP","LLY","V","MA","JPM",
  "GE","CAT","CEG","VRT","TSM","QCOM","NEE","WMB","CCJ","MARA",
];
export function BestOpportunities({ C, MONO, SANS, onPick, macroData }) {
  const [rows, setRows] = useState(null);
  const [state, setState] = useState("idle"); // idle | loading | ok | err
  const [onlyStrong, setOnlyStrong] = useState(true);   // RS ≥ 70 quality filter
  const [lastScan, setLastScan] = useState(0);
  const [notifyOn, setNotifyOn] = useState(() => localStorage.getItem("bestopp_notify") === "on");
  const seenGo = React.useRef(new Set());   // GO symbols already alerted (avoid repeats)
  const isGo = (r) => r.verdict === "GO" || (r.atBuyPoint && r.volConfirmed);
  const regime = computeRegime(macroData);
  const marketGreen = regime.score >= 55;
  const enableNotify = () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") { const n = !notifyOn; setNotifyOn(n); localStorage.setItem("bestopp_notify", n ? "on" : "off"); return; }
    Notification.requestPermission().then(p => { if (p === "granted") { setNotifyOn(true); localStorage.setItem("bestopp_notify", "on"); } });
  };
  const scan = () => {
    setState(s => s === "ok" ? "ok" : "loading");  // silent refresh once we have data
    fetch("/api/market/trend-screen?symbols=" + encodeURIComponent(BEST_OPP_UNIVERSE.join(",")))
      .then(r => r.json())
      .then(j => {
        let res = (j.results || []).filter(r => !r.error && Number(r.entry) > Number(r.stop) && (r.passCount || 0) >= 6 && !r.extended);
        // Quality filter: relative strength ≥ 70 (leaders only) when enabled.
        if (onlyStrong) res = res.filter(r => (r.rsRating || 0) >= 70);
        const rr = (r) => (r.target2 - r.entry) / (r.entry - r.stop);
        // Rank: GO/buy-point/volume first, then trend quality + RELATIVE STRENGTH heavily.
        const rank = (r) => (r.verdict === "GO" ? 1000 : 0) + (r.atBuyPoint ? 500 : 0) + (r.volConfirmed ? 200 : 0) + (r.actionable ? 100 : 0) + (r.passCount || 0) * 20 + (r.rsRating || 0) * 2;
        const top = res.map(r => ({ ...r, _rr: rr(r), _rank: rank(r) })).sort((a, b) => b._rank - a._rank).slice(0, 5);
        // Flag GO setups that are NEW since we last saw them → highlight + notify.
        const newGo = [];
        top.forEach(r => { if (isGo(r) && !seenGo.current.has(r.symbol)) { r._new = true; newGo.push(r.symbol); seenGo.current.add(r.symbol); } });
        if (newGo.length && notifyOn && "Notification" in window && Notification.permission === "granted") {
          try { new Notification("🎯 New buy-point: " + newGo.join(", "), { body: "A new GO setup just appeared in Best Opportunities." }); } catch {}
        }
        setRows(top); setState(top.length ? "ok" : "none"); setLastScan(Date.now());
      })
      .catch(() => setState(s => s === "ok" ? "ok" : "err"));
  };
  // Auto-scan on mount + every 5 minutes. Defer the first (heavy, 40-symbol) scan
  // ~1.6s so the chart/movers/pulse load first instead of competing for the server.
  useEffect(() => {
    const kick = setTimeout(scan, 1600);
    const t = setInterval(scan, 5 * 60 * 1000);
    return () => { clearTimeout(kick); clearInterval(t); };
  }, [onlyStrong]); // eslint-disable-line
  const vBadge = (r) => {
    if (r.verdict === "GO" || (r.atBuyPoint && r.volConfirmed)) return ["🟢 GO — buy point", "#0d9465"];
    if (r.actionable) return ["🟡 READY — near pivot", "#d6a312"];
    return ["🟡 WATCH", "#d6a312"];
  };
  const why = (r) => `${r.passCount}/8 template · RS ${r.rsRating} · ${r.stage.replace(/\s*—.*/, "")}${r.atBuyPoint ? " · at buy point" : r.actionable ? " · near pivot" : ""}`;
  return (
    <div style={{ marginBottom: 14, border: `2px solid ${C.accent}`, borderRadius: 12, background: `${C.accent}0a`, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 16px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 900, color: C.text }}>🎯 Best Opportunities Now</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#0d9465", display: "inline-block" }} /> Auto-scans every 5 min</span>
            {lastScan ? ` · updated ${Math.round((Date.now() - lastScan) / 1000) < 60 ? "just now" : Math.round((Date.now() - lastScan) / 60000) + "m ago"}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setOnlyStrong(v => !v)} title="Only show market-leading stocks (Relative Strength ≥ 70)"
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "8px 12px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${onlyStrong ? "#0d9465" : C.border}`, background: onlyStrong ? "rgba(13,148,101,0.12)" : C.bg, color: onlyStrong ? "#0d9465" : C.textDim }}>
            {onlyStrong ? "✓ Leaders only (RS≥70)" : "All setups"}
          </button>
          <button onClick={enableNotify} title="Get a desktop notification when a new GO buy-point appears"
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "8px 12px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${notifyOn ? "#7c5cff" : C.border}`, background: notifyOn ? "rgba(124,92,255,0.12)" : C.bg, color: notifyOn ? "#7c5cff" : C.textDim }}>
            {notifyOn ? "🔔 Alerts ON" : "🔕 Alert me on new GO"}
          </button>
          <button onClick={scan} disabled={state === "loading"}
            style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, padding: "10px 20px", borderRadius: 10, cursor: state === "loading" ? "wait" : "pointer",
              border: "none", background: C.accent, color: "#fff" }}>
            {state === "loading" && !rows ? "Scanning market…" : "↻ Rescan now"}
          </button>
        </div>
      </div>
      {/* Market-regime banner — breakouts work in green markets, fail in red ones. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: `${regime.color}14`, borderTop: `1px solid ${C.border}`, borderBottom: state === "ok" || state === "none" ? `1px solid ${C.border}` : "none", flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: regime.color }}>MARKET: {regime.label} {regime.score}/100</span>
        <span style={{ fontFamily: SANS, fontSize: 12, color: C.textSec }}>
          {marketGreen ? "✅ Conditions favor breakouts — buy-points more likely to work." : "⚠️ Weak market — breakouts fail more often. Be selective or stay in cash; the autopilot won't force trades here either."}
        </span>
      </div>
      {state === "err" && <div style={{ fontFamily: MONO, fontSize: 12, color: "#c8282a", padding: "0 16px 12px" }}>⚠ Scan failed — try again.</div>}
      {state === "none" && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, padding: "0 16px 14px" }}>No clean buy-points right now — the market's not offering A-setups. Cash is a position. Try again later.</div>}
      {state === "ok" && rows && (
        <div style={{ padding: "0 12px 12px" }}>
          {rows.map((r, i) => {
            const [badge, bc] = vBadge(r);
            return (
              <div key={r.symbol} onClick={() => onPick && onPick(r.symbol)}
                style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 12px", cursor: "pointer", borderRadius: 10, background: C.bg, border: `1px solid ${r._new ? "#7c5cff" : C.border}`, boxShadow: r._new ? "0 0 0 3px rgba(124,92,255,0.15)" : "none", marginBottom: 8 }}>
                <div style={{ fontFamily: NUM, fontSize: 26, fontWeight: 700, color: C.textDim, minWidth: 26 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: SANS, fontSize: 17, fontWeight: 900, color: C.text }}>{r.symbol}</span>
                    {r._new && <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: "#fff", background: "#7c5cff", borderRadius: 4, padding: "1px 6px" }}>NEW</span>}
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: bc, background: `${bc}18`, borderRadius: 5, padding: "2px 8px" }}>{badge}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>R:R {r._rr.toFixed(1)}:1</span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 2 }}>{why(r)}</div>
                </div>
                <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 11, whiteSpace: "nowrap" }}>
                  <div style={{ color: C.accent }}>Buy ${r.entry}</div>
                  <div style={{ color: "#c8282a" }}>Stop ${r.stop}</div>
                  <div style={{ color: "#0d9465" }}>Target ${r.target2}</div>
                </div>
              </div>
            );
          })}
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, padding: "2px 4px" }}>Tap any name to open its chart + full setup. Educational, not financial advice.</div>
        </div>
      )}
    </div>
  );
}
