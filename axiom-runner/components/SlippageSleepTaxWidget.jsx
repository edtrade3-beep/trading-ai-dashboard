import { useState, useEffect, useMemo } from "react";

// ─────────────────────────────────────────────────────────────────────────
// SLIPPAGE & SLEEP TAX — a self-contained floating overlay widget.
//
// Deliberately does NOT import theme.js, App() state, or any prop from its
// caller — every color/font/spacing value below is inlined so this file can
// be copy-pasted into any layout in this repo (or any other React project
// using plain JSX + inline styles) without wiring anything up. Call site is
// just `<SlippageSleepTaxWidget />` with zero props, zero context.
//
// Two behavioral-finance ideas retail traders rarely see surfaced anywhere:
//   1) Cognitive Efficiency Gauge — a reminder that raw P&L skill isn't
//      constant through the day; fatigue/liquidity vary by hour.
//   2) Slippage Tax Calculator — spread/slippage is a real, compounding
//      cost most platforms never show you a running total for.
// Both are illustrative/simulated, not derived from the user's real fill
// data — this is a decision-support nudge, not a backtest.
// ─────────────────────────────────────────────────────────────────────────

const PALETTE = {
  bg: "#141A23",       // premium low-glare dark gray (exact spec)
  bgRaised: "#1B222E",
  border: "#262F3D",
  text: "#F3F5F7",      // crisp white
  textDim: "#8A93A3",
  green: "#22C55E",
  amber: "#F59E0B",
  red: "#EF4444",
};

// Simulated hourly cognitive/liquidity efficiency, 0-100, index = hour of
// day (0 = 12am ... 23 = 11pm), loosely modeled on a US-session day trader's
// typical fatigue + liquidity curve. Not derived from any specific user's
// real performance — swap in real per-user stats here if you have them.
const HOURLY_EFFICIENCY = [
  15, 12, 10, 10, 14, 20, 28, 40, // 12am – 7am: overnight / pre-market, low liquidity
  55, 70, 88, 82, 65,             // 8am – 12pm: ramp into open, golden-hour peak, midday cool-off
  42, 48, 62, 75,                 // 1pm – 4pm: lunch-hour chop, afternoon recovery, power-hour close
  50, 38, 30, 25, 22, 20, 18,     // 5pm – 11pm: after-hours fatigue decline
];

const zoneFor = (score) =>
  score >= 70 ? { key: "sharp", label: "SHARP — HIGH EFFICIENCY", color: PALETTE.green,
      note: "Historically your clearest hours. Normal size, trust your process." }
  : score >= 40 ? { key: "caution", label: "CAUTION — MODERATE", color: PALETTE.amber,
      note: "Mixed hour. Take only your best-graded setups, size down if unsure." }
  : { key: "danger", label: "FATIGUED — HIGH RISK", color: PALETTE.red,
      note: "Historically your weakest hours — thin liquidity, low focus. This is the sleep tax." };

// Round-trip spread/slippage assumption per preset, in basis points (1bp = 0.01%).
const VOL_PRESETS = [
  { key: "calm",    label: "Calm · Blue-chip",     bps: 2,  hint: "Tight book, SPY/AAPL-tier liquidity" },
  { key: "normal",  label: "Normal",                bps: 6,  hint: "Typical mid-cap during regular hours" },
  { key: "volatile", label: "Volatile · News/Small-cap", bps: 20, hint: "Wide spreads, low float, or a catalyst in play" },
];

const fmtUSD = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

// Half-circle gauge, no chart library — a stroke-dasharray/dashoffset trick
// on a plain SVG <path> arc. r=80 → arc length = πr.
function Gauge({ score, color }) {
  const r = 80;
  const arcLen = Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg viewBox="0 0 200 112" style={{ width: "100%", height: 96, display: "block" }}>
      <path d="M20,100 A80,80 0 0 1 180,100" fill="none" stroke={PALETTE.border} strokeWidth={14} strokeLinecap="round" />
      <path d="M20,100 A80,80 0 0 1 180,100" fill="none" stroke={color} strokeWidth={14} strokeLinecap="round"
        strokeDasharray={arcLen} strokeDashoffset={arcLen - pct * arcLen}
        style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.4s ease" }} />
      <text x="100" y="92" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="30" fontWeight="800" fill={PALETTE.text}>
        {Math.round(score)}
      </text>
    </svg>
  );
}

export default function SlippageSleepTaxWidget() {
  const [open, setOpen] = useState(true);
  const [hour, setHour] = useState(() => new Date().getHours());
  const [positionSize, setPositionSize] = useState("10000");
  const [presetKey, setPresetKey] = useState("normal");

  // Keep "current hour" accurate without a chart-library-grade clock — a
  // plain 60s poll is more than enough resolution for an hour bucket.
  useEffect(() => {
    const t = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(t);
  }, []);

  const score = HOURLY_EFFICIENCY[hour] ?? 50;
  const zone = zoneFor(score);
  const preset = VOL_PRESETS.find((p) => p.key === presetKey) || VOL_PRESETS[1];

  const notional = useMemo(() => {
    const n = Number(String(positionSize).replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }, [positionSize]);
  const taxPerTrade = notional * (preset.bps / 10000);
  const taxPer100 = taxPerTrade * 100;

  const hour12 = ((hour % 12) || 12) + (hour < 12 ? "am" : "pm");
  const layeredRisk = zone.key === "danger" && presetKey === "volatile";

  return (
    <div style={{ position: "fixed", bottom: 18, left: 18, zIndex: 300, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {open && (
        <div
          role="dialog"
          aria-label="Slippage and Sleep Tax"
          style={{
            position: "absolute", bottom: 64, left: 0, width: 336, maxWidth: "88vw",
            background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 16,
            boxShadow: "0 20px 50px rgba(0,0,0,0.55)", overflow: "hidden",
            animation: "sstw-pop 0.15s ease-out",
          }}
        >
          <style>{`@keyframes sstw-pop { from { opacity:0; transform: translateY(6px) scale(0.98); } to { opacity:1; transform: translateY(0) scale(1); } }`}</style>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: `1px solid ${PALETTE.border}` }}>
            <span style={{ fontSize: 18 }}>🧠</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: PALETTE.text, fontWeight: 800, fontSize: 13, letterSpacing: "0.02em" }}>SLIPPAGE &amp; SLEEP TAX</div>
              <div style={{ color: PALETTE.textDim, fontSize: 11, marginTop: 1 }}>The costs your platform doesn't show you</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close"
              style={{ background: "transparent", border: "none", color: PALETTE.textDim, fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 4 }}>
              ×
            </button>
          </div>

          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* 1. Cognitive Efficiency Gauge */}
            <div style={{ background: PALETTE.bgRaised, border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ color: PALETTE.textDim, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em" }}>COGNITIVE EFFICIENCY — {hour12}</span>
              </div>
              <Gauge score={score} color={zone.color} />
              <div style={{ textAlign: "center", marginTop: -6 }}>
                <span style={{ display: "inline-block", color: zone.color, fontWeight: 800, fontSize: 11, letterSpacing: "0.04em",
                  border: `1px solid ${zone.color}55`, background: `${zone.color}1a`, borderRadius: 999, padding: "3px 10px" }}>
                  {zone.label}
                </span>
              </div>
              <div style={{ color: PALETTE.textDim, fontSize: 11.5, lineHeight: 1.5, marginTop: 8, textAlign: "center" }}>
                {zone.note}
              </div>
            </div>

            {/* 2. Live Slippage Tax Calculator */}
            <div style={{ background: PALETTE.bgRaised, border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ color: PALETTE.textDim, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", marginBottom: 10 }}>
                SLIPPAGE TAX CALCULATOR
              </div>

              <label style={{ display: "block", color: PALETTE.textDim, fontSize: 11, marginBottom: 5 }}>Position size ($)</label>
              <input
                inputMode="decimal"
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                placeholder="10000"
                style={{
                  width: "100%", background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, color: PALETTE.text,
                  borderRadius: 8, padding: "9px 12px", fontFamily: "ui-monospace, monospace", fontSize: 14, fontWeight: 700,
                  outline: "none", boxSizing: "border-box",
                }}
              />

              <div style={{ display: "flex", gap: 6, marginTop: 10, marginBottom: 12 }}>
                {VOL_PRESETS.map((p) => {
                  const active = p.key === presetKey;
                  return (
                    <button key={p.key} onClick={() => setPresetKey(p.key)} title={p.hint}
                      style={{
                        flex: 1, fontSize: 10.5, fontWeight: 700, padding: "8px 6px", borderRadius: 8, cursor: "pointer",
                        border: `1px solid ${active ? PALETTE.text : PALETTE.border}`,
                        background: active ? PALETTE.text : "transparent",
                        color: active ? PALETTE.bg : PALETTE.textDim,
                        lineHeight: 1.25,
                      }}>
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ color: PALETTE.textDim, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em" }}>PER TRADE</div>
                  <div style={{ color: PALETTE.amber, fontFamily: "ui-monospace, monospace", fontSize: 17, fontWeight: 800, marginTop: 2 }}>
                    -{fmtUSD(taxPerTrade)}
                  </div>
                </div>
                <div style={{ background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ color: PALETTE.textDim, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em" }}>PER 100 TRADES</div>
                  <div style={{ color: PALETTE.red, fontFamily: "ui-monospace, monospace", fontSize: 17, fontWeight: 800, marginTop: 2 }}>
                    -{fmtUSD(taxPer100)}
                  </div>
                </div>
              </div>
              <div style={{ color: PALETTE.textDim, fontSize: 10.5, lineHeight: 1.5, marginTop: 8 }}>
                Assumes ~{preset.bps}bps round-trip spread/slippage for a "{preset.label}" instrument. Estimate only — actual costs vary by broker and live order-book depth.
              </div>
            </div>

            {/* Layered-risk callout — only when a fatigued hour meets a volatile instrument */}
            {layeredRisk && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: `${PALETTE.red}14`, border: `1px solid ${PALETTE.red}44`, borderRadius: 10, padding: "10px 12px" }}>
                <span style={{ fontSize: 14 }}>⚠️</span>
                <div style={{ color: PALETTE.text, fontSize: 11.5, lineHeight: 1.5 }}>
                  <b>Layered risk:</b> you're in a historically fatigued hour <i>and</i> pricing a volatile instrument. Fatigue degrades judgment right when slippage cost is highest — the two compound.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle button — always shows a live ring for the current hour's zone, even collapsed */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Slippage & Sleep Tax" : "Open Slippage & Sleep Tax"}
        title="Slippage & Sleep Tax"
        style={{
          width: 52, height: 52, borderRadius: "50%", cursor: "pointer",
          background: PALETTE.bg, border: `2px solid ${zone.color}`,
          boxShadow: `0 8px 24px rgba(0,0,0,0.45), 0 0 0 3px ${zone.color}22`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, transition: "transform 0.12s ease",
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.94)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        {open ? <span style={{ color: PALETTE.text, fontSize: 20 }}>×</span> : "🧠"}
      </button>
    </div>
  );
}
