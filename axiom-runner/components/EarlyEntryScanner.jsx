import { useState, useMemo, useRef, useEffect } from "react";
import { C, MONO, SANS } from "./theme.js";

// ═══════════════════════════════════════════════════════════════
// EARLY ENTRY SCANNER
// ═══════════════════════════════════════════════════════════════

// trend is the platform's own real trend-template scan row for this symbol
// (/api/market/trend-screen — same engine ADVISOR AI, Green Light, and the
// Trading Copilot already trust). q.priceAvg50/priceAvg200/yearHigh are NOT
// real signals here: watchlistData is fed by /api/market/quote, a fast,
// price-only path that never populates fundamentals fields for any symbol
// Alpaca covers (confirmed live this session — same root cause already
// fixed in PredictionsTab and Green Light's deep-dive). Those fields were
// always exactly 0, which didn't just silently skip factor #2 below — the
// EMA-alignment check's final else branch actively pushed a "Below key
// EMAs" flag onto every single scanned stock regardless of its real trend,
// and that false flag fed directly into the "Avoid / Trap Zone"
// classification (flags.length >= 2). Routing in real stage/pctFromHigh/
// abovePivotPct data from trend-screen fixes the false negative, not just
// the missing bonus points.
function computeEarlyScore(q, spyChg, qqqChg, trend) {
  if (!q || !q.price) return { score: 0, breakdown: {}, reasons: [], flags: [] };
  const price  = Number(q.price || 0);
  const open   = Number(q.open  || price);
  const vol    = Number(q.volume    || 0);
  const avgVol = Number(q.avgVolume || 1);
  const chg    = Number(q.changesPercentage || 0);
  const rvol   = avgVol > 0 ? vol / avgVol : 0;
  const relSpy = chg - spyChg;
  const relQqq = chg - qqqChg;
  const relRS  = (relSpy + relQqq) / 2;

  const bd = {};
  const reasons = [];
  const flags   = [];

  // 1. Above VWAP (15 pts) — proxy: price vs open
  if (open > 0 && price >= open * 1.001) {
    bd.vwap = 15; reasons.push("Above VWAP");
  } else if (open > 0 && price >= open * 0.997) {
    bd.vwap = 7;  reasons.push("Near VWAP");
  } else {
    bd.vwap = 0;  flags.push("Below VWAP");
  }

  // 2. Bullish trend structure (15 pts) — real Stage classification
  // (Stage 2 IS "price > MA50 > MA200 and trending up", the exact thing
  // this factor is meant to test) instead of the always-empty q.priceAvg50/
  // priceAvg200. No trend data available (fetch still pending/failed) is
  // treated as "unknown," not "bearish" — it stays neutral, no flag.
  const stage = String(trend?.stage || "");
  if (stage.startsWith("Stage 2")) {
    bd.ema = 15; reasons.push("Bullish trend structure (Stage 2, real trend template)");
  } else if (stage.startsWith("Stage 1")) {
    bd.ema = 6;  reasons.push("Base-building (Stage 1)");
  } else if (stage.startsWith("Stage 3") || stage.startsWith("Stage 4")) {
    bd.ema = 0;  flags.push("Downtrend / topping structure (real trend template)");
  } else {
    bd.ema = 0; // unknown — no trend data yet, not a false accusation
  }

  // 3. Near breakout level (15 pts) — within 1-3% of 52wk high, from
  // trend-screen's real pctFromHigh (negative when below the real 52-week
  // high) instead of the always-empty q.yearHigh.
  let distToHigh = 100;
  if (trend && Number.isFinite(Number(trend.pctFromHigh))) {
    distToHigh = -Number(trend.pctFromHigh);
    if (distToHigh >= 0.3 && distToHigh <= 3)       { bd.breakout = 15; reasons.push("Near 52W breakout zone"); }
    else if (distToHigh > 3 && distToHigh <= 6)     { bd.breakout = 8; }
    else if (distToHigh < 0.3 && distToHigh >= -2)  { bd.breakout = 5;  flags.push("Just broke out — extended"); }
    else                                              { bd.breakout = 0; }
  } else { bd.breakout = 0; }

  // 4. RVOL (15 pts)
  if (rvol >= 2.5)      { bd.rvol = 15; reasons.push(`RVOL ${rvol.toFixed(1)}x — institutional volume`); }
  else if (rvol >= 1.5) { bd.rvol = 12; reasons.push(`RVOL ${rvol.toFixed(1)}x — above average`); }
  else if (rvol >= 1.2) { bd.rvol = 7; }
  else if (rvol >= 0.8) { bd.rvol = 3; }
  else                   { bd.rvol = 0; flags.push("Low volume"); }

  // 5. Relative strength vs SPY/QQQ (15 pts)
  if (relRS >= 2)       { bd.rs = 15; reasons.push("Stronger than SPY/QQQ"); }
  else if (relRS >= 1)  { bd.rs = 10; reasons.push("Outperforming market"); }
  else if (relRS >= 0)  { bd.rs = 6; }
  else if (relRS >= -1) { bd.rs = 2; }
  else                  { bd.rs = 0; flags.push("Weaker than market"); }

  // 6. Pullback held support (10 pts) — real distance above the
  // trend-screen pivot (a genuine technical support/trigger level) instead
  // of the always-empty q.priceAvg50.
  if (trend && Number.isFinite(Number(trend.abovePivotPct))) {
    const abovePivot = Number(trend.abovePivotPct);
    if (abovePivot >= 0 && abovePivot <= 3 && chg > 0)      { bd.pullback = 10; reasons.push("Holding near real support (trend-template pivot)"); }
    else if (abovePivot > 3 && abovePivot <= 6 && chg > 0)  { bd.pullback = 5; }
    else if (abovePivot < 0 && abovePivot >= -3 && chg < 0) { bd.pullback = 2; flags.push("Testing support — watch closely"); }
    else { bd.pullback = 0; }
  } else { bd.pullback = 0; }

  // 7. OBV / accumulation rising (10 pts)
  if (rvol >= 1.5 && chg > 0)      { bd.obv = 10; reasons.push("Volume confirming move"); }
  else if (rvol >= 1.0 && chg > 0) { bd.obv = 5; }
  else if (rvol >= 1.5 && chg < 0) { bd.obv = 0; flags.push("High volume selling"); }
  else                              { bd.obv = 0; }

  // 8. Catalyst awareness (5 pts)
  if (rvol >= 2.5)      { bd.catalyst = 5; reasons.push("Unusual volume — possible catalyst"); }
  else if (rvol >= 1.8) { bd.catalyst = 3; }
  else                  { bd.catalyst = 0; }

  const score = Math.min(100, Object.values(bd).reduce((s, v) => s + v, 0));

  // Extra trap flags — "near 52W low" dropped: trend-screen exposes real
  // pctFromHigh but not pctFromLow, and q.yearLow is the same always-empty
  // field as the others above, so there's no real data left to check this
  // against. Omitted rather than left silently wired to a fabricated 0.
  if (rvol >= 1.5 && chg < -1.5) flags.push("High-volume sell-off — trap risk");
  if (distToHigh < -2)            flags.push("Extended above breakout");

  return { score, breakdown: bd, reasons, flags, rvol, relRS, distToHigh };
}

function classifyEarlySetup(q, scored, trend) {
  const { score, breakdown: bd, rvol, distToHigh } = scored;
  const chg   = Number(q.changesPercentage || 0);
  const price = Number(q.price || 0);
  const open  = Number(q.open  || price);
  // Same fix as computeEarlyScore: q.priceAvg50 is always empty, so this
  // used trend-screen's real abovePivotPct (distance above the real
  // technical pivot) as the "near a support level" proxy instead — this
  // classification could otherwise never fire.
  const nearPivot = trend && Number.isFinite(Number(trend.abovePivotPct)) && Math.abs(Number(trend.abovePivotPct)) <= 3;

  if (score < 50 || (bd.vwap === 0 && bd.ema === 0)) return "Avoid / Trap Zone";
  if (bd.vwap === 15 && rvol >= 1.5 && chg > 0 && price > open * 1.001)       return "VWAP Reclaim";
  if (bd.ema >= 15 && nearPivot)                                              return "21 EMA Pullback";
  if (distToHigh >= 0.3 && distToHigh <= 3 && bd.breakout >= 15)               return "Pre-Breakout Compression";
  if (bd.rs >= 10 && score >= 65)                                               return "Relative Strength Leader";
  if (rvol >= 2.0 && bd.obv >= 5 && score >= 60)                               return "Volume Before Price";
  if (distToHigh >= -1 && distToHigh <= 1 && bd.vwap > 0)                      return "Breakout Retest";
  return "Setup Forming";
}

function earlyScoreLabel(score) {
  if (score >= 85) return { label: "A+ Early Entry", color: "#00c97a" };
  if (score >= 75) return { label: "Watch Closely",  color: "#ffb340" };
  if (score >= 65) return { label: "Setup Forming",  color: "#607494" };
  return                  { label: "Ignore / Avoid", color: "#ff4d63" };
}

export default function EarlyEntryScanner({ watchlistData, macroData, sectorData, onSelectSymbol }) {
  const [alertPreview, setAlertPreview] = useState(null);
  const [sentAlerts, setSentAlerts]     = useState({});   // symbol → timestamp ms
  const [alertStatus, setAlertStatus]   = useState("");
  const [filterSetup, setFilterSetup]   = useState("ALL");
  const [minScoreFilter, setMinScoreFilter] = useState(0);
  const sentRef = useRef({});

  const spy = (macroData || []).find(q => q.symbol === "SPY");
  const qqq = (macroData || []).find(q => q.symbol === "QQQ");
  const spyChg = Number(spy?.changesPercentage || 0);
  const qqqChg = Number(qqq?.changesPercentage || 0);

  // Determine market bias
  const marketBias = useMemo(() => {
    if (spyChg > 0.5 && qqqChg > 0.5) return { label: "Risk-On",  color: "#00c97a" };
    if (spyChg < -0.5 || qqqChg < -0.5) return { label: "Risk-Off", color: "#ff4d63" };
    return { label: "Neutral", color: "#ffb340" };
  }, [spyChg, qqqChg]);

  // Real trend-template data (stage, pctFromHigh, abovePivotPct) — see the
  // comment above computeEarlyScore for why this replaces watchlistData's
  // always-empty priceAvg50/priceAvg200/yearHigh fields.
  const [trendMap, setTrendMap] = useState({});
  const watchSymbolsKey = (watchlistData || []).map(q => q.symbol).filter(Boolean).sort().join(",");
  useEffect(() => {
    if (!watchSymbolsKey) return;
    fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(watchSymbolsKey)}`)
      .then(r => r.json())
      .then(j => {
        const map = {};
        (j.results || []).forEach(r => { if (!r.error) map[r.symbol] = r; });
        setTrendMap(map);
      })
      .catch(() => {});
  }, [watchSymbolsKey]);

  // Score every watchlist symbol
  const scoredRows = useMemo(() => {
    if (!watchlistData || !watchlistData.length) return [];
    return watchlistData.map(q => {
      const trend   = trendMap[q.symbol];
      const scored  = computeEarlyScore(q, spyChg, qqqChg, trend);
      const setup   = classifyEarlySetup(q, scored, trend);
      const lbl     = earlyScoreLabel(scored.score);
      const price   = Number(q.price || 0);
      const atr     = price > 0 ? ((Number(q.dayHigh || price) - Number(q.dayLow || price)) / price) * 100 : 1;
      // Real technical pivot from trend-screen when available (the actual
      // breakout trigger level this platform's own scanner computes),
      // falling back to the old flat +0.3%-above-price estimate otherwise.
      const pivot   = trend && Number(trend.pivot) > 0 ? Number(trend.pivot) : null;
      const entry   = pivot && Math.abs(price - pivot) / pivot * 100 <= 5 ? pivot * 1.005 : price * 1.003;
      const stop    = entry * (setup === "VWAP Reclaim" ? 0.977 : 0.972);
      const t1      = entry * (setup === "Pre-Breakout Compression" ? 1.045 : 1.055);
      const t2      = entry * (setup === "Pre-Breakout Compression" ? 1.085 : 1.10);
      const rr      = entry > stop ? (t1 - entry) / Math.max(0.01, entry - stop) : 0;
      // Real 52W high derived from trend-screen's real pctFromHigh
      // (yHigh = price / (1 + pctFromHigh/100)) rather than the always-0
      // q.yearHigh — used only for display in the alert text.
      const pctFromHigh = trend != null ? Number(trend.pctFromHigh) : null;
      const yHigh   = Number.isFinite(pctFromHigh) && (1 + pctFromHigh / 100) > 0 ? price / (1 + pctFromHigh / 100) : 0;
      return { q, scored, setup, lbl, entry, stop, t1, t2, rr, atr, yHigh };
    }).sort((a, b) => b.scored.score - a.scored.score);
  }, [watchlistData, spyChg, qqqChg, trendMap]);

  const earlyEntries    = useMemo(() => scoredRows.filter(r => r.scored.score >= 65 && r.setup !== "Avoid / Trap Zone"), [scoredRows]);
  const preBreakout     = useMemo(() => scoredRows.filter(r => r.setup === "Pre-Breakout Compression" || (r.scored.distToHigh >= 0 && r.scored.distToHigh <= 5)), [scoredRows]);
  const vwapReclaims    = useMemo(() => scoredRows.filter(r => r.setup === "VWAP Reclaim"), [scoredRows]);
  const emaPullbacks    = useMemo(() => scoredRows.filter(r => r.setup === "21 EMA Pullback"), [scoredRows]);
  const trapZones       = useMemo(() => scoredRows.filter(r => r.setup === "Avoid / Trap Zone" || r.scored.score < 50 || r.scored.flags.length >= 2), [scoredRows]);
  const aPlusCount      = useMemo(() => scoredRows.filter(r => r.scored.score >= 85).length, [scoredRows]);
  const nearBreakout    = useMemo(() => scoredRows.filter(r => r.scored.distToHigh >= 0 && r.scored.distToHigh <= 3).length, [scoredRows]);

  const bestSector = useMemo(() => {
    if (!sectorData || !sectorData.length) return "—";
    const top = [...sectorData].sort((a, b) => (b.changesPercentage || 0) - (a.changesPercentage || 0))[0];
    return top ? `${top.symbol} +${Number(top.changesPercentage || 0).toFixed(2)}%` : "—";
  }, [sectorData]);

  const bestEntry = scoredRows[0] || null;

  const setupOptions = ["ALL", "VWAP Reclaim", "21 EMA Pullback", "Pre-Breakout Compression", "Relative Strength Leader", "Volume Before Price", "Breakout Retest"];

  const filteredEntries = useMemo(() => earlyEntries.filter(r => {
    if (filterSetup !== "ALL" && r.setup !== filterSetup) return false;
    if (r.scored.score < minScoreFilter) return false;
    return true;
  }), [earlyEntries, filterSetup, minScoreFilter]);

  const buildAlertText = (row) => {
    const { q, scored, setup, lbl, entry, stop, t1, t2, rr } = row;
    const whys = scored.reasons.slice(0, 5).map(r => `✅ ${r}`).join("\n");
    return (
`🚨 EARLY ${lbl.label.toUpperCase()} ALERT

Ticker: ${q.symbol}
Score: ${scored.score}/100
Setup: ${setup}

Entry:   $${entry.toFixed(2)}
Stop:    $${stop.toFixed(2)}
Target 1: $${t1.toFixed(2)}
Target 2: $${t2.toFixed(2)}
Risk/Reward: ${rr.toFixed(1)}R

Why this is early:
${whys || "✅ Multiple early signals confirmed"}

Action Plan:
Enter only if candle closes above entry.
Do not chase if price is extended.
Risk small and follow the stop.`
    );
  };

  const sendAlert = async (row) => {
    const now = Date.now();
    const last = sentRef.current[row.q.symbol] || 0;
    if (now - last < 30 * 60 * 1000) {
      setAlertStatus(`⏱ Alert for ${row.q.symbol} already sent < 30 min ago`);
      setTimeout(() => setAlertStatus(""), 3000);
      return;
    }
    const text = buildAlertText(row);
    try {
      setAlertStatus("Sending…");
      await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      sentRef.current[row.q.symbol] = now;
      setSentAlerts(s => ({ ...s, [row.q.symbol]: now }));
      setAlertStatus(`✅ Alert sent for ${row.q.symbol}`);
    } catch {
      setAlertStatus("❌ Notify endpoint unavailable — check /api/notify");
    }
    setTimeout(() => setAlertStatus(""), 4000);
  };

  const TH = ({ children, right }) => (
    <th style={{ padding: "8px 10px", textAlign: right ? "right" : "left", fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.07em", borderBottom: `1px solid ${C.border}`, background: C.surface, fontWeight: 700, whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
  const TD = ({ children, right, color, mono }) => (
    <td style={{ padding: "7px 10px", textAlign: right ? "right" : "left", fontFamily: mono !== false ? MONO : SANS, fontSize: 12, color: color || C.text, borderTop: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
      {children}
    </td>
  );

  const ScoreBadge = ({ score }) => {
    const lbl = earlyScoreLabel(score);
    return (
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: lbl.color, background: `${lbl.color}18`, padding: "3px 8px", borderRadius: 6 }}>
        {score}
      </span>
    );
  };

  const SetupBadge = ({ setup }) => {
    const col = setup === "VWAP Reclaim" ? C.cyan :
                setup === "21 EMA Pullback" ? C.green :
                setup === "Pre-Breakout Compression" ? C.amber :
                setup === "Relative Strength Leader" ? C.accent :
                setup === "Volume Before Price" ? C.purple :
                setup === "Breakout Retest" ? "#f0c040" :
                setup === "Avoid / Trap Zone" ? C.red : C.textDim;
    return (
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col, background: `${col}18`, padding: "3px 7px", borderRadius: 5, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
        {setup}
      </span>
    );
  };

  const SummaryCard = ({ label, value, sub, color, onClick }) => (
    <div onClick={onClick} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", cursor: onClick ? "pointer" : "default", minWidth: 130, flex: "1 1 130px" }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.07em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: color || C.text, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 3 }}>{sub}</div>}
    </div>
  );

  const SectionHeader = ({ title, count, color, badge }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.09em", fontWeight: 700 }}>{title}</span>
      {count != null && <span style={{ fontFamily: MONO, fontSize: 12, color: color || C.green, background: `${color || C.green}18`, padding: "1px 7px", borderRadius: 10 }}>{count}</span>}
      {badge && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{badge}</span>}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>

      {/* ── Summary Cards ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
        <SummaryCard label="MARKET BIAS"       value={marketBias.label}                 color={marketBias.color}  sub={`SPY ${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}%  QQQ ${qqqChg >= 0 ? "+" : ""}${qqqChg.toFixed(2)}%`} />
        <SummaryCard label="BEST EARLY ENTRY"  value={bestEntry?.q.symbol || "—"}       color={C.accent}          sub={bestEntry ? `Score ${bestEntry.scored.score} · ${bestEntry.setup}` : "No setups yet"} onClick={() => bestEntry && onSelectSymbol(bestEntry.q.symbol)} />
        <SummaryCard label="STRONGEST SECTOR"  value={bestSector.split(" ")[0] || "—"}  color={C.cyan}            sub={bestSector} />
        <SummaryCard label="A+ EARLY SETUPS"   value={aPlusCount}                        color={aPlusCount > 0 ? C.green : C.textDim}  sub="Score ≥ 85 — act now" />
        <SummaryCard label="NEAR BREAKOUT"     value={nearBreakout}                      color={C.amber}           sub="Within 3% of 52W high" />
        <SummaryCard label="TRAP / AVOID"      value={trapZones.length}                  color={trapZones.length > 0 ? C.red : C.textDim}  sub="Flagged — do not chase" />
        <button
          onClick={async () => {
            const bias = marketBias.label;
            const biasIcon = bias === "Risk-On" ? "🟢" : bias === "Risk-Off" ? "🔴" : "⚪";
            const top3 = filteredEntries.slice(0, 3).map(r =>
              `${r.scored.score >= 85 ? "🌟" : r.scored.score >= 75 ? "⭐" : "•"} ${r.q.symbol}  Score ${r.scored.score}  ${r.setup}  Entry $${r.entry.toFixed(2)}  Stop $${r.stop.toFixed(2)}  T1 $${r.t1.toFixed(2)}  RR ${r.rr.toFixed(1)}R`
            ).join("\n");
            const brk3 = preBreakout.slice(0, 3).map(r => `• ${r.q.symbol}  $${Number(r.q.price||0).toFixed(2)}  Score ${r.scored.score}  ${r.scored.distToHigh.toFixed(1)}% to breakout`).join("\n");
            const traps = trapZones.slice(0, 3).map(r => `⚠ ${r.q.symbol}`).join("  ");
            const msg = [
              `${biasIcon} MARKET BRIEF`,
              `Bias: ${bias}  |  SPY ${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}%  QQQ ${qqqChg >= 0 ? "+" : ""}${qqqChg.toFixed(2)}%`,
              `Sector: ${bestSector || "—"}`,
              "",
              `TOP EARLY ENTRIES (${aPlusCount} A+ / ${filteredEntries.length} total)`,
              top3 || "None",
              "",
              `PRE-BREAKOUT WATCH`,
              brk3 || "None",
              traps ? "\nAVOID: " + traps : "",
            ].filter(x => x !== undefined).join("\n").trim();
            try {
              const r = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) });
              const d = await r.json().catch(() => ({}));
              if (d.ok === false) alert("Telegram error: " + (d.error || "unknown"));
            } catch(e) { alert("Send failed: " + e.message); }
          }}
          style={{ background: "#2563eb18", border: "1px solid #2563eb55", color: "#2563eb", borderRadius: 8, padding: "10px 16px", fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", alignSelf: "stretch", display: "flex", alignItems: "center", gap: 6 }}
        >📱 PUSH BRIEF</button>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.07em" }}>SETUP:</span>
        {setupOptions.map(s => (
          <button key={s} onClick={() => setFilterSetup(s)} style={{ border: `1px solid ${filterSetup === s ? C.accent : C.border}`, background: filterSetup === s ? `${C.accent}18` : C.surface, color: filterSetup === s ? C.accent : C.textDim, fontFamily: MONO, fontSize: 12, padding: "4px 10px", borderRadius: 12, cursor: "pointer", fontWeight: filterSetup === s ? 800 : 400, letterSpacing: "0.04em" }}>
            {s}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>MIN SCORE:</span>
          {[0, 65, 75, 85].map(v => (
            <button key={v} onClick={() => setMinScoreFilter(v)} style={{ border: `1px solid ${minScoreFilter === v ? C.accent : C.border}`, background: minScoreFilter === v ? `${C.accent}18` : C.surface, color: minScoreFilter === v ? C.accent : C.textDim, fontFamily: MONO, fontSize: 12, padding: "4px 9px", borderRadius: 12, cursor: "pointer", fontWeight: minScoreFilter === v ? 800 : 400 }}>
              {v === 0 ? "ALL" : `${v}+`}
            </button>
          ))}
        </div>
        {alertStatus && (
          <span style={{ fontFamily: MONO, fontSize: 12, color: alertStatus.startsWith("✅") ? C.green : alertStatus.startsWith("❌") ? C.red : C.amber, marginLeft: 8 }}>{alertStatus}</span>
        )}
      </div>

      {/* ── Best Early Entries Table ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SectionHeader title="BEST EARLY ENTRIES" count={filteredEntries.length} color={C.green} />
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Scored from watchlist · modular — plug in live data to refine</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <TH>TICKER</TH><TH right>PRICE</TH><TH right>SCORE</TH><TH>SETUP TYPE</TH>
                <TH right>ENTRY</TH><TH right>STOP</TH><TH right>T1</TH><TH right>T2</TH>
                <TH right>R:R</TH><TH>STATUS</TH><TH>ALERT</TH>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 && (
                <tr><td colSpan={11} style={{ padding: 16, fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center" }}>No early entries match the current filters.</td></tr>
              )}
              {filteredEntries.map(row => {
                const { q, scored, setup, lbl, entry, stop, t1, t2, rr } = row;
                const chg = Number(q.changesPercentage || 0);
                const recentlySent = sentAlerts[q.symbol] && (Date.now() - sentAlerts[q.symbol] < 30 * 60 * 1000);
                return (
                  <tr key={q.symbol} style={{ background: "transparent" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <TD>
                      <button onClick={() => onSelectSymbol(q.symbol)} style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, cursor: "pointer", padding: 0 }}>
                        {q.symbol}
                      </button>
                    </TD>
                    <TD right mono color={chg >= 0 ? C.green : C.red}>${Number(q.price || 0).toFixed(2)}</TD>
                    <TD right><ScoreBadge score={scored.score} /></TD>
                    <TD><SetupBadge setup={setup} /></TD>
                    <TD right mono color={C.text}>${entry.toFixed(2)}</TD>
                    <TD right mono color={C.red}>${stop.toFixed(2)}</TD>
                    <TD right mono color={C.green}>${t1.toFixed(2)}</TD>
                    <TD right mono color={C.green}>${t2.toFixed(2)}</TD>
                    <TD right mono color={rr >= 2 ? C.green : rr >= 1.5 ? C.amber : C.red}>{rr.toFixed(1)}R</TD>
                    <TD><span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: lbl.color, background: `${lbl.color}15`, padding: "3px 7px", borderRadius: 5 }}>{lbl.label}</span></TD>
                    <TD>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button onClick={() => setAlertPreview(alertPreview?.q?.symbol === q.symbol ? null : row)}
                          style={{ border: `1px solid ${alertPreview?.q?.symbol === q.symbol ? C.amber : C.border}`, background: alertPreview?.q?.symbol === q.symbol ? `${C.amber}18` : C.surface, color: alertPreview?.q?.symbol === q.symbol ? C.amber : C.textDim, fontFamily: MONO, fontSize: 12, padding: "3px 7px", borderRadius: 5, cursor: "pointer" }}>
                          PREVIEW
                        </button>
                        {scored.score >= 75 && (
                          <button onClick={() => sendAlert(row)} disabled={recentlySent}
                            style={{ border: `1px solid ${recentlySent ? C.border : C.green + "88"}`, background: recentlySent ? C.surface : `${C.green}14`, color: recentlySent ? C.textDim : C.green, fontFamily: MONO, fontSize: 12, padding: "3px 7px", borderRadius: 5, cursor: recentlySent ? "default" : "pointer", opacity: recentlySent ? 0.5 : 1 }}>
                            {recentlySent ? "SENT" : "SEND"}
                          </button>
                        )}
                      </div>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Alert Preview Panel ── */}
      {alertPreview && (
        <div style={{ background: C.card, border: `2px solid ${C.amber}66`, borderRadius: 8, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <SectionHeader title={`TELEGRAM ALERT PREVIEW — ${alertPreview.q.symbol}`} color={C.amber} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => sendAlert(alertPreview)}
                style={{ border: `1px solid ${C.green}88`, background: `${C.green}18`, color: C.green, fontFamily: MONO, fontSize: 12, padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}>
                SEND TO TELEGRAM
              </button>
              <button onClick={() => setAlertPreview(null)}
                style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textDim, fontFamily: MONO, fontSize: 12, padding: "5px 10px", borderRadius: 6, cursor: "pointer" }}>
                CLOSE
              </button>
            </div>
          </div>
          <pre style={{ fontFamily: MONO, fontSize: 12, color: C.text, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
            {buildAlertText(alertPreview)}
          </pre>
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 12, color: C.textDim }}>
            Alert rules: Score ≥85 = A+ Early Entry Alert · Score 75–84 = Watch Closely · Duplicate suppressed for 30 min per ticker
          </div>
        </div>
      )}

      {/* ── Two-column: VWAP Reclaim + EMA Pullback ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* VWAP Reclaim */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
            <SectionHeader title="VWAP RECLAIM SCANNER" count={vwapReclaims.length} color={C.cyan} badge="price reclaimed above open" />
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>TICKER</TH><TH right>PRICE</TH><TH right>CHG%</TH><TH right>RVOL</TH><TH right>SCORE</TH><TH>SEND</TH></tr></thead>
            <tbody>
              {vwapReclaims.length === 0 && <tr><td colSpan={6} style={{ padding: 12, fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center" }}>No VWAP reclaims detected.</td></tr>}
              {vwapReclaims.slice(0, 8).map(row => {
                const chg = Number(row.q.changesPercentage || 0);
                return (
                  <tr key={row.q.symbol}
                      onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <TD><button onClick={() => onSelectSymbol(row.q.symbol)} style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, cursor: "pointer", padding: 0 }}>{row.q.symbol}</button></TD>
                    <TD right>${Number(row.q.price || 0).toFixed(2)}</TD>
                    <TD right color={chg >= 0 ? C.green : C.red}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</TD>
                    <TD right color={row.scored.rvol >= 1.5 ? C.green : C.textDim}>{row.scored.rvol.toFixed(2)}x</TD>
                    <TD right><ScoreBadge score={row.scored.score} /></TD>
                    <TD><button onClick={async () => {
                      const msg = `📈 VWAP RECLAIM — ${row.q.symbol}\nPrice: $${Number(row.q.price||0).toFixed(2)}  CHG: ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%\nRVOL: ${row.scored.rvol.toFixed(2)}x  Score: ${row.scored.score}\nSetup: VWAP Reclaim — price closed above open with volume`;
                      await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }).catch(() => {});
                    }} style={{ border: "1px solid #2563eb55", background: "#2563eb12", color: "#2563eb", borderRadius: 5, padding: "3px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>📱</button></TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
              Qualifies: price above open · volume confirming · SPY/QQQ stable<br />
              EMA aligned · candle closed above reclaim level
            </div>
          </div>
        </div>

        {/* EMA Pullback */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
            <SectionHeader title="21 EMA PULLBACK SCANNER" count={emaPullbacks.length} color={C.green} badge="near 50sma support · trending" />
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>TICKER</TH><TH right>PRICE</TH><TH right>vs 50D</TH><TH right>RVOL</TH><TH right>SCORE</TH><TH>SEND</TH></tr></thead>
            <tbody>
              {emaPullbacks.length === 0 && <tr><td colSpan={6} style={{ padding: 12, fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center" }}>No EMA pullbacks detected.</td></tr>}
              {emaPullbacks.slice(0, 8).map(row => {
                const avg50 = Number(row.q.priceAvg50 || 0);
                const price = Number(row.q.price || 0);
                const distTo50 = avg50 > 0 ? ((price - avg50) / avg50 * 100) : null;
                return (
                  <tr key={row.q.symbol}
                      onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <TD><button onClick={() => onSelectSymbol(row.q.symbol)} style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, cursor: "pointer", padding: 0 }}>{row.q.symbol}</button></TD>
                    <TD right>${price.toFixed(2)}</TD>
                    <TD right color={distTo50 != null ? (distTo50 >= 0 ? C.green : C.red) : C.textDim}>
                      {distTo50 != null ? `${distTo50 >= 0 ? "+" : ""}${distTo50.toFixed(1)}%` : "—"}
                    </TD>
                    <TD right color={row.scored.rvol >= 1.5 ? C.green : C.textDim}>{row.scored.rvol.toFixed(2)}x</TD>
                    <TD right><ScoreBadge score={row.scored.score} /></TD>
                    <TD><button onClick={async () => {
                      const d50str = distTo50 != null ? `${distTo50 >= 0 ? "+" : ""}${distTo50.toFixed(1)}% vs 50D` : "";
                      const msg = `🔄 21 EMA PULLBACK — ${row.q.symbol}\nPrice: $${price.toFixed(2)}  ${d50str}\nRVOL: ${row.scored.rvol.toFixed(2)}x  Score: ${row.scored.score}\nSetup: Pulling back to 21 EMA / 50D support — watch for green bounce`;
                      await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }).catch(() => {});
                    }} style={{ border: "1px solid #2563eb55", background: "#2563eb12", color: "#2563eb", borderRadius: 5, padding: "3px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>📱</button></TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
              Qualifies: price above 200 EMA · EMA 9 {'>'} 21 {'>'} 50 · pulling near 50D<br />
              low selling volume · green bounce from support
            </div>
          </div>
        </div>
      </div>

      {/* ── Pre-Breakout Watchlist ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SectionHeader title="PRE-BREAKOUT WATCHLIST" count={preBreakout.length} color={C.amber} badge="within 5% of 52W high · compression building" />
          {preBreakout.length > 0 && (
            <button onClick={async () => {
              const lines = preBreakout.slice(0, 8).map(r =>
                `• ${r.q.symbol}  $${Number(r.q.price||0).toFixed(2)}  Score ${r.scored.score}  ${r.scored.distToHigh.toFixed(1)}% to ${r.yHigh > 0 ? "$" + r.yHigh.toFixed(2) : "52W high"}  RVOL ${r.scored.rvol.toFixed(2)}x`
              ).join("\n");
              const msg = `🚀 PRE-BREAKOUT WATCHLIST (${preBreakout.length})\nStocks within 5% of 52W high with compression building:\n\n${lines}`;
              await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }).catch(() => {});
            }} style={{ border: "1px solid #2563eb55", background: "#2563eb12", color: "#2563eb", borderRadius: 6, padding: "4px 12px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 800 }}>📱 PUSH LIST</button>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <TH>TICKER</TH><TH right>PRICE</TH><TH right>BREAKOUT LEVEL</TH>
                <TH right>DIST %</TH><TH right>RVOL</TH><TH right>ATR%</TH>
                <TH right>REL STR</TH><TH right>SCORE</TH><TH>PLAN</TH><TH>SEND</TH>
              </tr>
            </thead>
            <tbody>
              {preBreakout.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 16, fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center" }}>No pre-breakout candidates in watchlist.</td></tr>
              )}
              {preBreakout.slice(0, 10).map(row => {
                const { q, scored, setup, atr, yHigh, rr } = row;
                const price = Number(q.price || 0);
                const relStr = scored.relRS;
                const plan = scored.distToHigh <= 1.5
                  ? "Ready to break — watch for volume surge"
                  : scored.distToHigh <= 3
                  ? "Building base — wait for catalyst"
                  : "Stalk — not ready yet";
                return (
                  <tr key={q.symbol}
                      onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <TD><button onClick={() => onSelectSymbol(q.symbol)} style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, cursor: "pointer", padding: 0 }}>{q.symbol}</button></TD>
                    <TD right>${price.toFixed(2)}</TD>
                    <TD right color={C.amber}>{yHigh > 0 ? `$${yHigh.toFixed(2)}` : "—"}</TD>
                    <TD right color={scored.distToHigh <= 2 ? C.green : scored.distToHigh <= 4 ? C.amber : C.textDim}>
                      {yHigh > 0 ? `${scored.distToHigh.toFixed(1)}%` : "—"}
                    </TD>
                    <TD right color={scored.rvol >= 1.5 ? C.green : C.textDim}>{scored.rvol.toFixed(2)}x</TD>
                    <TD right color={atr <= 1.5 ? C.green : atr <= 3 ? C.amber : C.textDim}>{atr.toFixed(2)}%</TD>
                    <TD right color={relStr >= 0 ? C.green : C.red}>{relStr >= 0 ? "+" : ""}{relStr.toFixed(2)}%</TD>
                    <TD right><ScoreBadge score={scored.score} /></TD>
                    <TD mono={false}><span style={{ fontSize: 12, color: scored.distToHigh <= 1.5 ? C.green : scored.distToHigh <= 3 ? C.amber : C.textDim }}>{plan}</span></TD>
                    <TD><button onClick={async () => {
                      const msg = `🚀 PRE-BREAKOUT — ${q.symbol}\nPrice: $${price.toFixed(2)}  Score: ${scored.score}\nBreakout level: ${yHigh > 0 ? "$" + yHigh.toFixed(2) : "—"}  Dist: ${scored.distToHigh.toFixed(1)}%\nRVOL: ${scored.rvol.toFixed(2)}x  Rel Str: ${relStr >= 0 ? "+" : ""}${relStr.toFixed(2)}%\nPlan: ${plan}`;
                      await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }).catch(() => {});
                    }} style={{ border: "1px solid #2563eb55", background: "#2563eb12", color: "#2563eb", borderRadius: 5, padding: "3px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>📱</button></TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Avoid / Trap Zone ── */}
      <div style={{ background: C.card, border: `1px solid ${C.red}33`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SectionHeader title="AVOID / TRAP ZONE" count={trapZones.length} color={C.red} badge="do not chase these" />
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ Extended · weak · below VWAP · score &lt; 50</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><TH>TICKER</TH><TH right>PRICE</TH><TH right>CHG%</TH><TH right>SCORE</TH><TH>FLAGS</TH></tr>
            </thead>
            <tbody>
              {trapZones.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 14, fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center" }}>No trap zones — market looks clean.</td></tr>
              )}
              {trapZones.slice(0, 8).map(row => {
                const chg = Number(row.q.changesPercentage || 0);
                return (
                  <tr key={row.q.symbol}
                      onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <TD mono><span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textSec }}>{row.q.symbol}</span></TD>
                    <TD right>${Number(row.q.price || 0).toFixed(2)}</TD>
                    <TD right color={chg >= 0 ? C.textSec : C.red}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</TD>
                    <TD right><span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.red }}>{row.scored.score}</span></TD>
                    <TD mono={false}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {row.scored.flags.map((f, i) => (
                          <span key={i} style={{ fontFamily: MONO, fontSize: 12, color: C.red, background: `${C.red}14`, padding: "2px 6px", borderRadius: 5 }}>{f}</span>
                        ))}
                      </div>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Scoring Legend ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px" }}>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.07em", marginBottom: 10 }}>EARLY ENTRY SCORING MODEL</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
          {[
            { label: "A+ Early Entry", range: "85–100", color: "#00c97a" },
            { label: "Watch Closely",  range: "75–84",  color: "#ffb340" },
            { label: "Setup Forming",  range: "65–74",  color: "#607494" },
            { label: "Ignore / Avoid", range: "0–64",   color: "#ff4d63" },
          ].map(({ label, range, color }) => (
            <div key={label} style={{ border: `1px solid ${color}44`, borderRadius: 6, padding: "8px 12px", background: `${color}0a` }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color, fontWeight: 800 }}>{label}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>Score {range}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {[
            ["Above VWAP", "15 pts"],
            ["EMA Alignment", "15 pts"],
            ["Near Breakout", "15 pts"],
            ["RVOL ≥ 1.5x", "15 pts"],
            ["Relative Strength", "15 pts"],
            ["Pullback Support", "10 pts"],
            ["OBV Accumulation", "10 pts"],
            ["Catalyst Awareness", "5 pts"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", background: C.surface, borderRadius: 6, border: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>{k}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 12, color: C.textDim }}>
          Data source: watchlist live quotes · VWAP proxy = price vs open · EMA proxy = 50D/200D SMA · Plug in TradingView/Polygon webhooks to upgrade to real VWAP + EMA values
        </div>
      </div>

    </div>
  );
}
