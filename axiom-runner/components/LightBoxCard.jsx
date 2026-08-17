import React, { useEffect, useRef, useState } from "react";
import { LIGHTBOX_DEFAULTS, STATE_COLOR_KEY, BAR_COLOR_KEY } from "./lightbox-config.js";

// One symbol's Light Box card. First React.memo use in this codebase —
// deliberate, and only safe because the parent (LightBoxTab.jsx) preserves
// object identity for any symbol whose data hasn't actually changed since
// the last poll; the comparator below just trusts that discipline
// (reference equality) rather than deep-comparing on every render, which
// is what makes "only affected boxes update" cheap even at hundreds of
// symbols.
//
// Visual style (2026-08-17): matches a reference design the user provided
// — flat card, no background tint or glow, a single blue accent border/
// badge/progress-bar for BUY and WAIT, breaking only to the app's
// strongest neutral ink color for SELL/EXIT. See lightbox-config.js's
// STATE_COLOR_KEY comment for the explicit tradeoff this accepts.
function LightBoxCardInner({ C, MONO, SANS, data, showSecondary }) {
  const col = C[STATE_COLOR_KEY[data.state]] || C.textDim;
  const barCol = C[BAR_COLOR_KEY] || C.accent;
  const prevStateRef = useRef(data.state);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (prevStateRef.current !== data.state) {
      prevStateRef.current = data.state;
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), LIGHTBOX_DEFAULTS.pulseMs);
      return () => clearTimeout(t);
    }
  }, [data.state]);

  return (
    <div
      style={{
        background: C.card,
        border: `2px solid ${col}`,
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: showSecondary ? 196 : 148,
        transition: "border-color 0.4s ease",
        animation: pulsing ? "lightboxPulse 1.5s ease-out 1" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text, letterSpacing: "0.02em" }}>{data.symbol}</span>
        <span style={{
          fontFamily: SANS, fontSize: 11, fontWeight: 700, color: barCol, background: `${barCol}1c`,
          borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap",
        }}>
          {data.state === "SELL" ? "SELL / EXIT" : data.state}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text, fontVariantNumeric: "tabular-nums" }}>
          {data.price != null ? `$${Number(data.price).toFixed(2)}` : "—"}
        </span>
        {data.chg != null && (
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: data.chg >= 0 ? C.green : C.red, fontVariantNumeric: "tabular-nums" }}>
            {data.chg >= 0 ? "+" : ""}{Number(data.chg).toFixed(2)}%
          </span>
        )}
      </div>

      {data.reason && (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec }}>{data.reason}</div>
      )}
      {data.quality != null && (
        <div style={{ width: "100%", marginTop: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginBottom: 3 }}>
            <span>A+</span><span>{data.quality}</span>
          </div>
          <div style={{ width: "100%", height: 5, borderRadius: 3, background: C.border, overflow: "hidden" }}>
            <div style={{ width: `${Math.max(0, Math.min(100, data.quality))}%`, height: "100%", background: barCol, transition: "width 0.4s ease" }} />
          </div>
        </div>
      )}

      {showSecondary && (
        <div style={{ marginTop: 4, paddingTop: 6, borderTop: `1px solid ${C.border}`, width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px" }}>
          <SecondaryStat label="RVOL" value={data.rvol != null ? `${Number(data.rvol).toFixed(1)}x` : "—"} C={C} SANS={SANS} MONO={MONO} />
          <SecondaryStat label="VWAP" value={data.vwap != null ? `$${Number(data.vwap).toFixed(2)}` : "—"} C={C} SANS={SANS} MONO={MONO} />
          <SecondaryStat label="Entry" value={data.bestEntry != null ? `$${Number(data.bestEntry).toFixed(2)}` : "—"} C={C} SANS={SANS} MONO={MONO} />
          <SecondaryStat label="Stop" value={data.stop != null ? `$${Number(data.stop).toFixed(2)}` : "—"} C={C} SANS={SANS} MONO={MONO} />
          <SecondaryStat label="Target" value={data.target != null ? `$${Number(data.target).toFixed(2)}` : "—"} C={C} SANS={SANS} MONO={MONO} />
        </div>
      )}
    </div>
  );
}

function SecondaryStat({ label, value, C, SANS, MONO }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ fontFamily: SANS, fontSize: 9.5, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.text, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function cardPropsEqual(prev, next) {
  return prev.data === next.data && prev.showSecondary === next.showSecondary;
}

const LightBoxCard = React.memo(LightBoxCardInner, cardPropsEqual);
export default LightBoxCard;
