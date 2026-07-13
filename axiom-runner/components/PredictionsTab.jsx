import { useState } from "react";
import { STOCK_TO_SECTOR } from "./market-helpers.js";

// ─── PREDICTIONS TAB — stock / crypto / market price direction forecast ──────
function computePrediction(q) {
  const px    = Number(q.price || q.regularMarketPrice || 0);
  if (!px) return null;
  const chg   = Number(q.changesPercentage || 0);
  const ma50  = Number(q.priceAvg50 || 0);
  const ma200 = Number(q.priceAvg200 || 0);
  const hi52  = Number(q.yearHigh || 0), lo52 = Number(q.yearLow || 0);
  const vol   = Number(q.volume || 0), avgVol = Number(q.avgVolume || 0);
  const rvol  = avgVol > 0 ? vol / avgVol : 1;
  const dayRange = (Number(q.dayHigh||0) - Number(q.dayLow||0));
  const atrPct = px > 0 && dayRange > 0 ? (dayRange / px) : 0.025;

  let score = 0; const why = [];
  if (ma50 > 0 && ma200 > 0) {
    if (px > ma50 && ma50 > ma200) { score += 30; why.push("Strong uptrend (price > MA50 > MA200)"); }
    else if (px > ma50)            { score += 15; why.push("Above MA50"); }
    else if (px < ma50 && ma50 < ma200) { score -= 30; why.push("Downtrend (price < MA50 < MA200)"); }
    else                           { score -= 12; why.push("Below MA50"); }
  }
  if (hi52 > lo52 && px > 0) {
    const pos = (px - lo52) / (hi52 - lo52);
    if (pos > 0.85)      { score += 12; why.push("Near 52W high — momentum"); }
    else if (pos < 0.20) { score -= 10; why.push("Near 52W low — weak"); }
  }
  if (rvol > 1.8 && chg > 0)      { score += 15; why.push(`Volume surge ${rvol.toFixed(1)}x on green`); }
  else if (rvol > 1.8 && chg < 0) { score -= 15; why.push(`Volume surge ${rvol.toFixed(1)}x on red`); }
  if (chg > 3)       { score += 10; why.push("Strong momentum today"); }
  else if (chg < -3) { score -= 10; why.push("Heavy selling today"); }

  const conf = Math.min(90, 50 + Math.abs(score) / 2);
  const dir  = score >= 20 ? "BULLISH" : score >= 8 ? "LEAN UP" : score <= -20 ? "BEARISH" : score <= -8 ? "LEAN DOWN" : "NEUTRAL";
  // Cap the ATR so a single huge-move day doesn't produce absurd targets
  const cappedAtr = Math.min(atrPct, 0.05); // max 5% daily range used
  let weeklyMove = cappedAtr * Math.sqrt(5) * 100;
  weeklyMove = Math.min(weeklyMove, 12); // hard cap weekly expected move at 12%
  const biasMult = score >= 8 ? 1 : score <= -8 ? -1 : 0;
  const target = +(px * (1 + biasMult * weeklyMove / 100)).toFixed(2);
  const movePct = +(biasMult * weeklyMove).toFixed(1);
  return { px, chg, dir, conf: Math.round(conf), score, why: why.slice(0, 3), target, movePct, atrPct: cappedAtr };
}

export default function PredictionsTab({ C, MONO, SANS, watchlistData, macroData }) {
  const [filter, setFilter] = useState("ALL");
  const CRYPTO = ["BTC-USD","ETH-USD","BTCUSD","ETHUSD","SOL-USD","SOLUSD"];
  const INDEX  = ["SPY","QQQ","IWM","DIA"];

  const all = [...(watchlistData || []), ...(macroData || [])];
  const seen = new Set();
  const preds = [];
  all.forEach(q => {
    if (!q.symbol || seen.has(q.symbol)) return;
    seen.add(q.symbol);
    const p = computePrediction(q);
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
          Direction forecast + price target for stocks, crypto & the market — next ~1 week
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
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{p.conf}% conf</div>
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
              <div style={{ textAlign: "center", minWidth: 110 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>1-WEEK TARGET</div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: dirCol(p.dir) }}>${p.target}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: dirCol(p.dir) }}>{p.movePct >= 0 ? "+" : ""}{p.movePct}%</div>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                {p.why.map((w, i) => <div key={i} style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, padding: "1px 0" }}>• {w}</div>)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: "10px 14px", background: `${C.amber}10`, border: `1px solid ${C.amber}33`, borderRadius: 8, fontFamily: SANS, fontSize: 12, color: C.amber }}>
        ⚠️ Predictions are probability-based estimates from trend + momentum + volume — not guarantees. Always use stops.
      </div>
    </div>
  );
}
