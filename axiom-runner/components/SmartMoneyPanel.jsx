import { useState, useEffect } from "react";

// Smart Money panel — Section 6 of the institutional redesign (2026-07-29,
// explicit user spec: "Order Blocks, Fair Value Gaps, Liquidity, VWAP,
// Volume Profile, Dark Pool Activity"). Extracted/generalized into one real
// standalone component rather than the compact hover-badge/single-dimension
// summaries this data was previously scattered across (Institutional
// Grade's own Smart Money dimension, RhProScanner's BOS badge, SmartScanTab's
// per-row SMC column). Fetches the same real src/smc-engine.js detectors
// (already used everywhere else in this app) via the existing standalone
// /api/market/smc endpoint, plus the existing per-symbol /api/market/darkpool
// filter — no new backend routes, no fabricated numbers. VWAP is computed
// client-side off the same real daily bars the chart already has (a 20-day
// volume-weighted average price — an honest daily-bar proxy, not a true
// intraday tick VWAP, which this app has no real feed for).
export default function SmartMoneyPanel({ symbol, chart, C, MONO, SANS }) {
  const [smc, setSmc] = useState(null);
  const [dp, setDp] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true); setSmc(null); setDp(null);
    Promise.all([
      fetch(`/api/market/smc?symbol=${encodeURIComponent(symbol)}`).then(r => r.json()).catch(() => null),
      fetch(`/api/market/darkpool?symbol=${encodeURIComponent(symbol)}`).then(r => r.json()).catch(() => null),
    ]).then(([smcData, dpData]) => {
      setSmc(smcData?.ok ? smcData : null);
      setDp(dpData?.ok ? dpData : null);
      setLoading(false);
    });
  }, [symbol]);

  const vwap = (() => {
    const bars = (chart?.bars || []).slice(-20);
    if (bars.length < 5) return null;
    let pv = 0, vol = 0;
    for (const b of bars) {
      const typical = (Number(b.high) + Number(b.low) + Number(b.close)) / 3;
      pv += typical * Number(b.volume || 0);
      vol += Number(b.volume || 0);
    }
    return vol > 0 ? +(pv / vol).toFixed(2) : null;
  })();

  const row = (label, value, color, sub, key) => (
    <div key={key ?? label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}33` }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{label}</div>
        {sub && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>{sub}</div>}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: color || C.text }}>{value}</div>
    </div>
  );

  const price = Number(chart?.price) || Number(smc?.price) || 0;

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", background: C.card }}>
      {loading && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading real Smart Money data…</div>}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>MARKET STRUCTURE</div>
            {smc?.bos && row(smc.bos.label, `$${smc.bos.level}`, smc.bos.type === "BULL_BOS" ? C.green : C.red)}
            {smc?.choch && row(smc.choch.label, "", smc.choch.type === "CHOCH_BULL" ? C.green : C.red)}
            {!smc?.bos && !smc?.choch && <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>No real break-of-structure signal right now.</div>}
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, margin: "12px 0 6px" }}>VWAP (20-day)</div>
            {vwap != null
              ? row("VWAP", `$${vwap}`, price >= vwap ? C.green : C.red, price >= vwap ? "Price above VWAP" : "Price below VWAP")
              : <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>Insufficient bar history.</div>}
          </div>

          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>ORDER BLOCKS</div>
            {smc?.orderBlocks?.length ? smc.orderBlocks.map((ob, i) => row(
              ob.type === "BULL_OB" ? "🟢 Bullish OB" : "🔴 Bearish OB", `$${ob.bot}–$${ob.top}`, ob.type === "BULL_OB" ? C.green : C.red, null, `ob-${i}`,
            )) : <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>No real order blocks nearby.</div>}
          </div>

          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>FAIR VALUE GAPS</div>
            {smc?.fvgs?.length ? smc.fvgs.map((f, i) => row(
              f.type === "BULL_FVG" ? "🟢 Bullish FVG" : "🔴 Bearish FVG", `$${f.bot}–$${f.top}`, f.type === "BULL_FVG" ? C.green : C.red, null, `fvg-${i}`,
            )) : <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>No real open fair value gaps.</div>}
          </div>

          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>LIQUIDITY</div>
            {smc?.liquidity?.length ? smc.liquidity.slice(0, 5).map((l, i) => row(
              l.label, `$${l.price}`, l.strength === "HIGH" ? C.amber : C.textDim, null, `liq-${i}`,
            )) : <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>No real liquidity levels detected.</div>}
          </div>

          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>VOLUME PROFILE (60d)</div>
            {smc?.volumeProfile?.vpoc
              ? <>
                  {row("VPOC", `$${smc.volumeProfile.vpoc}`, C.accent, "Point of control — highest real traded volume")}
                  {row("Value Area High", `$${smc.volumeProfile.vah}`, C.textSec)}
                  {row("Value Area Low", `$${smc.volumeProfile.val}`, C.textSec)}
                </>
              : <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>Volume profile unavailable.</div>}
          </div>

          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>DARK POOL ACTIVITY</div>
            {dp?.prints?.length ? dp.prints.slice(0, 5).map((p, i) => row(
              `$${Number(p.price).toFixed(2)} × ${Number(p.size).toLocaleString()}`,
              p.value >= 1e6 ? `$${(p.value / 1e6).toFixed(1)}M` : `$${(p.value / 1e3).toFixed(0)}K`,
              C.accent, p.time ? new Date(p.time).toLocaleDateString() : null, `dp-${i}`,
            )) : <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>No real block prints — configure UNUSUAL_WHALES_API_KEY for live dark pool data.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
