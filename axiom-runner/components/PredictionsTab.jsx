import { useState, useEffect } from "react";
import { STOCK_TO_SECTOR, computePrediction } from "./market-helpers.js";

// ─── PREDICTIONS TAB — stock / crypto / market price direction forecast ──────
// computePrediction moved to market-helpers.js 2026-07-28 so Market
// Terminal, Sniper Scanner, and Pro Watchlists can show the same real
// prediction inline with each stock's analysis instead of only here.
//
// Weekly/monthly/yearly horizons + a real prediction rate added 2026-08-26.
// The rate is honestly "insufficient data" for every row on THIS tab — it
// needs a row's real Trade Desk A+ Score (computeAPlusScore's VCP/entry
// analysis) to look up a real historical win rate against, and this tab
// only has lightweight trend-screen data (Stage/pctFromHigh/volRatio), not
// a full setup score. Rather than reusing this file's own unrelated
// momentum heuristic as a stand-in score (which would misrepresent
// another score's real track record as this one's), the rate is left
// honestly blank here. Market Terminal / Sniper Scanner / Pro Watchlists
// DO have a real A+ Score per row and can pass it into computePrediction's
// opts to get a real rate — not wired here, since none of that setup data
// exists on this tab's rows.
const HORIZONS = [
  { key: "weekly", label: "1-WEEK" },
  { key: "monthly", label: "1-MONTH" },
  { key: "yearly", label: "1-YEAR" },
];

export default function PredictionsTab({ C, MONO, SANS, watchlistData, macroData }) {
  const [filter, setFilter] = useState("ALL");
  const [trendMap, setTrendMap] = useState({});
  const CRYPTO = ["BTC-USD","ETH-USD","BTCUSD","ETHUSD","SOL-USD","SOLUSD"];
  const INDEX  = ["SPY","QQQ","IWM","DIA"];

  const all = [...(watchlistData || []), ...(macroData || [])];
  const seen0 = new Set();
  const stockSymbols = [];
  all.forEach(q => {
    if (!q.symbol || seen0.has(q.symbol)) return;
    seen0.add(q.symbol);
    if (!INDEX.includes(q.symbol) && !CRYPTO.includes(q.symbol)) stockSymbols.push(q.symbol);
  });
  const stockKey = stockSymbols.slice(0, 30).sort().join(",");

  useEffect(() => {
    if (!stockKey) return;
    fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(stockKey)}`)
      .then(r => r.json())
      .then(j => {
        const map = {};
        (j.results || []).forEach(r => { if (!r.error) map[r.symbol] = r; });
        setTrendMap(map);
      })
      .catch(() => {});
  }, [stockKey]);

  const seen = new Set();
  const preds = [];
  all.forEach(q => {
    if (!q.symbol || seen.has(q.symbol)) return;
    seen.add(q.symbol);
    const p = computePrediction(q, trendMap[q.symbol]);
    if (!p) return;
    const cat = INDEX.includes(q.symbol) ? "MARKET" : CRYPTO.includes(q.symbol) ? "CRYPTO" : "STOCK";
    const sector = q.sector || STOCK_TO_SECTOR[q.symbol] || (cat === "CRYPTO" ? "Cryptocurrency" : cat === "MARKET" ? "Index ETF" : "");
    preds.push({ ...p, symbol: q.symbol, name: q.name || q.symbol, sector, cat });
  });
  preds.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  const cats = ["ALL", "🟢 BULLISH", "🔴 BEARISH", "MARKET", "STOCK", "CRYPTO"];
  const filtered = preds.filter(p => {
    if (filter === "ALL") return true;
    if (filter === "🟢 BULLISH") return p.dir.includes("BULL") || p.dir === "LEAN UP";
    if (filter === "🔴 BEARISH") return p.dir.includes("BEAR") || p.dir === "LEAN DOWN";
    return p.cat === filter;
  });
  const dirCol = d => d.includes("BULL") || d === "LEAN UP" ? C.green : d.includes("BEAR") || d === "LEAN DOWN" ? C.red : C.amber;
  const dirIcon = d => d.includes("BULL") || d === "LEAN UP" ? "📈" : d.includes("BEAR") || d === "LEAN DOWN" ? "📉" : "➡️";

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text }}>🔮 PRICE PREDICTIONS</div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginTop: 3 }}>
          Direction forecast + real weekly/monthly/yearly price targets, each with its real historical win rate where enough data exists
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {cats.map(c => {
          const active = filter === c;
          const accent = c === "🟢 BULLISH" ? C.green : c === "🔴 BEARISH" ? C.red : C.accent;
          return (
            <button key={c} onClick={() => setFilter(c)}
              style={{ background: active ? accent : C.surface, color: active ? "#fff" : C.textSec,
                border: `1px solid ${active ? accent : C.border}`, borderRadius: 6,
                fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 12px", cursor: "pointer" }}>
              {c}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && <div style={{ textAlign: "center", padding: "48px 0", fontFamily: MONO, fontSize: 14, color: C.textDim }}>Loading market data… add tickers to your watchlist.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(p => (
          <div key={p.symbol} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${dirCol(p.dir)}`, borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ textAlign: "center", minWidth: 90 }}>
                <div style={{ fontSize: 20 }}>{dirIcon(p.dir)}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: dirCol(p.dir) }}>{p.dir}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }} title="The engine's own self-confidence in this directional call — a real, deterministic read of trend/volume/momentum, NOT a historical win rate (see each horizon's real rate below).">{p.conf}% self-conf</div>
              </div>
              <div style={{ minWidth: 150 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.accent }}>{p.symbol}</span>
                  <span style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, background: C.surface, borderRadius: 3, padding: "1px 5px" }}>{p.cat}</span>
                </div>
                {p.name && p.name !== p.symbol && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>{p.name}</div>}
                {p.sector && <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{p.sector}</div>}
                <div style={{ fontFamily: MONO, fontSize: 13, color: C.text, marginTop: 2 }}>${p.px.toFixed(2)}
                  <span style={{ color: p.chg >= 0 ? C.green : C.red, marginLeft: 5 }}>{p.chg >= 0 ? "+" : ""}{p.chg.toFixed(1)}%</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {HORIZONS.map(hz => {
                  const h = p.horizons?.[hz.key];
                  const rate = p.rates?.[hz.key];
                  if (!h) return null;
                  return (
                    <div key={hz.key} style={{ textAlign: "center", minWidth: 92 }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{hz.label}</div>
                      <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: dirCol(p.dir) }}>${h.target}</div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: dirCol(p.dir) }}>{h.movePct >= 0 ? "+" : ""}{h.movePct}%</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: rate ? C.textSec : C.textDim, marginTop: 2 }} title="Real historical win rate for this score band and horizon — insufficient data means the platform's forward-return log doesn't have enough real samples yet, never a guessed number.">
                        {rate ? `${rate.winRate}% won (n=${rate.count})` : "rate: insufficient data"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                {p.why.map((w, i) => <div key={i} style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, padding: "1px 0" }}>• {w}</div>)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: "10px 14px", background: `${C.amber}10`, border: `1px solid ${C.amber}33`, borderRadius: 8, fontFamily: SANS, fontSize: 12, color: C.amber }}>
        ⚠️ Targets are ATR-scaled estimates from trend + momentum + volume, not guarantees. Win rates (where shown) are real historical results for that score band — always use stops.
      </div>
    </div>
  );
}
