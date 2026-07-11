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

export default function HoldingsTab({ C, MONO, SANS, macroData }) {
  const [holdings, setHoldings] = useState(() => { try { return JSON.parse(localStorage.getItem(HOLDINGS_KEY)) || DEFAULT_HOLDINGS; } catch { return DEFAULT_HOLDINGS; } });
  const [quotes, setQuotes] = useState({});
  const [form, setForm] = useState({ symbol: "", shares: "", cost: "" });
  const [syncedAt, setSyncedAt] = useState(null);
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
    const gl = computeGreenLight(q, spyChg, null);
    const ma50 = Number(q.priceAvg50 || 0);
    const atrPct = Math.min(0.05, Math.max(0.01, Number(gl.atrPct) || 0.025));
    const stop = +(px * (1 - atrPct * 1.5)).toFixed(2);
    const belowStop = px <= stop;
    const belowMA = ma50 > 0 && px < ma50;
    const status = belowStop ? { t: "🔴 BELOW STOP", c: C.red } : belowMA ? { t: "🟠 BELOW MA50", c: C.amber } : { t: "🟢 TREND OK", c: C.green };
    return { ...h, q, px, ma50, stop, pnl, pnlPct, status, signal: gl.signal, value: px * h.shares };
  });
  const totalValue = rows.reduce((s, r) => s + (r.value || 0), 0);
  const totalPnl = rows.reduce((s, r) => s + (r.pnl || 0), 0);

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
    </div>
  );
}
