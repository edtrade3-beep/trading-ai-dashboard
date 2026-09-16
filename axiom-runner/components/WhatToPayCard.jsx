import { useEffect, useState } from "react";

// WhatToPayCard.jsx (2026-09-16, "AI Trade Desk — Add 'What Price to
// Pay' to Every Stock") — the primary UI this master prompt asks for:
// "On every stock card/row, directly below the current market price,
// display: WHAT TO PAY / STRONG BUY ZONE / DON'T CHASE ABOVE." Real,
// self-fetching (GET /api/market/what-to-pay?symbol=X — src/what-to-pay.js,
// which itself reuses the canonical tier/ATR/EMA/VWAP/RVOL/MACD/RSI
// infrastructure, no new indicator engine). Deliberately simple —
// "Do not clutter the main card with RSI, MACD, EMA, VWAP, ATR, etc.
// Those calculations happen behind the scenes."
const STATUS_STYLE = {
  "ENTRY CONFIRMED": { icon: "🟢", color: "green" },
  "STRONG BUY ZONE": { icon: "🟡", color: "amber" },
  "IN BUY ZONE": { icon: "🟡", color: "amber" },
  "APPROACHING BUY ZONE": { icon: "🟡", color: "amber" },
  "WAIT FOR PRICE": { icon: "🟡", color: "textDim" },
  "EXTENDED — DON'T CHASE": { icon: "🔴", color: "red" },
};

function money(v) { return Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—"; }
function zoneText(z) { return z ? `$${z.low.toFixed(2)}–${z.high.toFixed(2)}` : "—"; }

export default function WhatToPayCard({ symbol, C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("idle"); // idle | loading | ok | error

  useEffect(() => {
    if (!symbol) { setData(null); setState("idle"); return; }
    let alive = true;
    setState("loading");
    fetch(`/api/market/what-to-pay?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).then((d) => {
      if (!alive) return;
      if (d?.ok === false || d?.available === false) { setState("error"); return; }
      setData(d);
      setState("ok");
    }).catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [symbol]);

  if (!symbol || state === "idle") return null;
  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12 };
  const title = <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: C.textDim, marginBottom: 8 }}>🎯 WHAT PRICE TO PAY</div>;

  if (state === "loading") return <div style={card}>{title}<div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>Calculating…</div></div>;
  if (state === "error" || !data) return <div style={card}>{title}<div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>No real price-zone read available for {symbol} yet.</div></div>;

  const style = STATUS_STYLE[data.priceStatus] || STATUS_STYLE["WAIT FOR PRICE"];
  const statusColor = C[style.color] || C.textSec;
  const distanceText = data.distancePct > 0 ? `${data.distancePct}% ABOVE BUY ZONE` : data.distancePct === 0 ? "IN BUY ZONE" : null;

  return (
    <div style={card}>
      {title}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 24px", marginBottom: 10 }}>
        <Field label="CURRENT PRICE" value={money(data.price)} big C={C} MONO={MONO} />
        <Field label="🎯 WHAT TO PAY" value={zoneText(data.whatToPay)} C={C} MONO={MONO} />
        <Field label="🔥 STRONG BUY ZONE" value={zoneText(data.strongBuyZone)} C={C} MONO={MONO} />
        <Field label="⛔ DON'T CHASE ABOVE" value={money(data.dontChaseAbove)} C={C} MONO={MONO} />
      </div>
      {distanceText && (
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textSec, marginBottom: 8 }}>{distanceText}</div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: statusColor }}>{style.icon} {data.priceStatus}</span>
      </div>
      {/* Small secondary text — "Waiting for pullback toward $X" style hint,
          real and derived, never a fabricated narrative. */}
      {data.priceStatus === "WAIT FOR PRICE" && data.whatToPay && (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 4 }}>Waiting for pullback toward {money(data.whatToPay.high)}</div>
      )}
      {(data.priceStatus === "IN BUY ZONE" || data.priceStatus === "STRONG BUY ZONE") && (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 4 }}>
          Price is attractive — {data.confirmation.count}/7 real confirmation signals so far, waiting for more before this reads ENTRY CONFIRMED.
        </div>
      )}
    </div>
  );
}

function Field({ label, value, big, C, MONO }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: big ? 20 : 15, fontWeight: 800, color: C.text }}>{value}</div>
    </div>
  );
}
