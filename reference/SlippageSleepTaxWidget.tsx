/**
 * Slippage & Sleep Tax — portable reference implementation (TypeScript + Tailwind CSS)
 * ─────────────────────────────────────────────────────────────────────────
 * This is a REFERENCE FILE, not wired into this repo's build. The live app
 * (axiom-runner/**) is plain JSX with inline styles — no TypeScript compiler,
 * no Tailwind — so the shipped version lives at
 * axiom-runner/components/SlippageSleepTaxWidget.jsx with the exact same
 * logic and visual spec, just in that stack. This file is for dropping into
 * any *other* React + TypeScript + Tailwind project as originally specced.
 *
 * Drop-in usage: `<SlippageSleepTaxWidget />` — zero props, zero context,
 * zero external state. Requires Tailwind's JIT/arbitrary-value support
 * (v3+) for the exact `#141A23` background token used below.
 *
 * A self-contained floating overlay surfacing two costs most trading
 * platforms never show you a running total for:
 *   1) Cognitive Efficiency Gauge — a reminder that skill isn't constant
 *      through the day; fatigue and liquidity both vary by hour.
 *   2) Slippage Tax Calculator — spread/slippage as a real, compounding
 *      dollar cost instead of an abstract basis-point number.
 * Both are illustrative/simulated, not derived from a specific user's real
 * fill data — this is a decision-support nudge, not a backtest.
 */

import { useState, useEffect, useMemo } from "react";

type ZoneKey = "sharp" | "caution" | "danger";

interface Zone {
  key: ZoneKey;
  label: string;
  note: string;
  className: string;   // Tailwind text/border color for this zone
  ringClass: string;    // Tailwind ring/shadow color for the collapsed button
  hex: string;           // raw hex, needed for the SVG stroke (SVG can't read Tailwind classes)
}

interface VolatilityPreset {
  key: "calm" | "normal" | "volatile";
  label: string;
  bps: number;
  hint: string;
}

// Simulated hourly cognitive/liquidity efficiency, 0-100, index = hour of day
// (0 = 12am ... 23 = 11pm). Loosely modeled on a US-session day trader's
// typical fatigue + liquidity curve — swap in real per-user stats if you
// have them.
const HOURLY_EFFICIENCY: number[] = [
  15, 12, 10, 10, 14, 20, 28, 40, // 12am – 7am: overnight / pre-market, low liquidity
  55, 70, 88, 82, 65,             // 8am – 12pm: ramp into open, golden-hour peak, midday cool-off
  42, 48, 62, 75,                 // 1pm – 4pm: lunch-hour chop, afternoon recovery, power-hour close
  50, 38, 30, 25, 22, 20, 18,     // 5pm – 11pm: after-hours fatigue decline
];

function zoneFor(score: number): Zone {
  if (score >= 70) {
    return {
      key: "sharp",
      label: "SHARP — HIGH EFFICIENCY",
      note: "Historically your clearest hours. Normal size, trust your process.",
      className: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
      ringClass: "ring-emerald-400/30 border-emerald-400",
      hex: "#22C55E",
    };
  }
  if (score >= 40) {
    return {
      key: "caution",
      label: "CAUTION — MODERATE",
      note: "Mixed hour. Take only your best-graded setups, size down if unsure.",
      className: "text-amber-400 border-amber-400/40 bg-amber-400/10",
      ringClass: "ring-amber-400/30 border-amber-400",
      hex: "#F59E0B",
    };
  }
  return {
    key: "danger",
    label: "FATIGUED — HIGH RISK",
    note: "Historically your weakest hours — thin liquidity, low focus. This is the sleep tax.",
    className: "text-red-400 border-red-400/40 bg-red-400/10",
    ringClass: "ring-red-400/30 border-red-400",
    hex: "#EF4444",
  };
}

// Round-trip spread/slippage assumption per preset, in basis points (1bp = 0.01%).
const VOL_PRESETS: VolatilityPreset[] = [
  { key: "calm", label: "Calm · Blue-chip", bps: 2, hint: "Tight book, SPY/AAPL-tier liquidity" },
  { key: "normal", label: "Normal", bps: 6, hint: "Typical mid-cap during regular hours" },
  { key: "volatile", label: "Volatile · News/Small-cap", bps: 20, hint: "Wide spreads, low float, or a catalyst in play" },
];

const fmtUSD = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** Half-circle gauge, no chart library — stroke-dasharray/dashoffset on a plain SVG <path> arc. */
function Gauge({ score, color }: { score: number; color: string }) {
  const r = 80;
  const arcLen = Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg viewBox="0 0 200 112" className="block w-full h-24">
      <path d="M20,100 A80,80 0 0 1 180,100" fill="none" stroke="#262F3D" strokeWidth={14} strokeLinecap="round" />
      <path
        d="M20,100 A80,80 0 0 1 180,100"
        fill="none"
        stroke={color}
        strokeWidth={14}
        strokeLinecap="round"
        strokeDasharray={arcLen}
        strokeDashoffset={arcLen - pct * arcLen}
        className="transition-[stroke-dashoffset,stroke] duration-300 ease-out"
      />
      <text x="100" y="92" textAnchor="middle" className="fill-white font-mono text-[30px] font-extrabold">
        {Math.round(score)}
      </text>
    </svg>
  );
}

export default function SlippageSleepTaxWidget() {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState<number>(() => new Date().getHours());
  const [positionSize, setPositionSize] = useState<string>("10000");
  const [presetKey, setPresetKey] = useState<VolatilityPreset["key"]>("normal");

  // Keep "current hour" accurate without a heavyweight clock — a plain 60s
  // poll is more than enough resolution for an hour bucket.
  useEffect(() => {
    const t = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(t);
  }, []);

  const score = HOURLY_EFFICIENCY[hour] ?? 50;
  const zone = zoneFor(score);
  const preset = VOL_PRESETS.find((p) => p.key === presetKey) ?? VOL_PRESETS[1];

  const notional = useMemo(() => {
    const n = Number(positionSize.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }, [positionSize]);
  const taxPerTrade = notional * (preset.bps / 10000);
  const taxPer100 = taxPerTrade * 100;

  const hour12 = `${(hour % 12) || 12}${hour < 12 ? "am" : "pm"}`;
  const layeredRisk = zone.key === "danger" && presetKey === "volatile";

  return (
    <div className="fixed bottom-[18px] left-[18px] z-[300] font-sans">
      {open && (
        <div
          role="dialog"
          aria-label="Slippage and Sleep Tax"
          className="absolute bottom-16 left-0 w-[336px] max-w-[88vw] rounded-2xl border border-[#262F3D]
                     bg-[#141A23] shadow-[0_20px_50px_rgba(0,0,0,0.55)] overflow-hidden
                     animate-[sstw-pop_0.15s_ease-out]"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3.5 border-b border-[#262F3D]">
            <span className="text-lg">🧠</span>
            <div className="flex-1 min-w-0">
              <div className="text-white font-extrabold text-[13px] tracking-wide">SLIPPAGE &amp; SLEEP TAX</div>
              <div className="text-slate-400 text-[11px] mt-0.5">The costs your platform doesn&apos;t show you</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-slate-400 hover:text-white text-lg leading-none p-1 transition-colors"
            >
              ×
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {/* 1. Cognitive Efficiency Gauge */}
            <div className="rounded-xl border border-[#262F3D] bg-[#1B222E] px-4 py-3.5">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-slate-400 text-[10px] font-extrabold tracking-widest">
                  COGNITIVE EFFICIENCY — {hour12}
                </span>
              </div>
              <Gauge score={score} color={zone.hex} />
              <div className="text-center -mt-1.5">
                <span className={`inline-block font-extrabold text-[11px] tracking-wide rounded-full border px-2.5 py-1 ${zone.className}`}>
                  {zone.label}
                </span>
              </div>
              <div className="text-slate-400 text-[11.5px] leading-relaxed mt-2 text-center">{zone.note}</div>
            </div>

            {/* 2. Live Slippage Tax Calculator */}
            <div className="rounded-xl border border-[#262F3D] bg-[#1B222E] px-4 py-3.5">
              <div className="text-slate-400 text-[10px] font-extrabold tracking-widest mb-2.5">
                SLIPPAGE TAX CALCULATOR
              </div>

              <label className="block text-slate-400 text-[11px] mb-1.5">Position size ($)</label>
              <input
                inputMode="decimal"
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                placeholder="10000"
                className="w-full rounded-lg border border-[#262F3D] bg-[#141A23] text-white
                           px-3 py-2 font-mono text-sm font-bold outline-none
                           focus:border-slate-400 transition-colors"
              />

              <div className="flex gap-1.5 mt-2.5 mb-3">
                {VOL_PRESETS.map((p) => {
                  const active = p.key === presetKey;
                  return (
                    <button
                      key={p.key}
                      onClick={() => setPresetKey(p.key)}
                      title={p.hint}
                      className={`flex-1 text-[10.5px] font-bold px-1.5 py-2 rounded-lg leading-tight transition-colors
                        ${active ? "bg-white text-[#141A23] border border-white" : "bg-transparent text-slate-400 border border-[#262F3D] hover:border-slate-500"}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[#262F3D] bg-[#141A23] px-3 py-2.5">
                  <div className="text-slate-400 text-[9.5px] font-bold tracking-wide">PER TRADE</div>
                  <div className="text-amber-400 font-mono text-[17px] font-extrabold mt-0.5">
                    -{fmtUSD(taxPerTrade)}
                  </div>
                </div>
                <div className="rounded-lg border border-[#262F3D] bg-[#141A23] px-3 py-2.5">
                  <div className="text-slate-400 text-[9.5px] font-bold tracking-wide">PER 100 TRADES</div>
                  <div className="text-red-400 font-mono text-[17px] font-extrabold mt-0.5">
                    -{fmtUSD(taxPer100)}
                  </div>
                </div>
              </div>
              <div className="text-slate-400 text-[10.5px] leading-relaxed mt-2">
                Assumes ~{preset.bps}bps round-trip spread/slippage for a &quot;{preset.label}&quot; instrument.
                Estimate only — actual costs vary by broker and live order-book depth.
              </div>
            </div>

            {/* Layered-risk callout — only when a fatigued hour meets a volatile instrument */}
            {layeredRisk && (
              <div className="flex gap-2 items-start rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2.5">
                <span className="text-sm">⚠️</span>
                <div className="text-white text-[11.5px] leading-relaxed">
                  <b>Layered risk:</b> you&apos;re in a historically fatigued hour <i>and</i> pricing a volatile
                  instrument. Fatigue degrades judgment right when slippage cost is highest — the two compound.
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
        className={`w-[52px] h-[52px] rounded-full bg-[#141A23] border-2 flex items-center justify-center
                    text-[22px] shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-4 transition-transform
                    active:scale-95 ${zone.ringClass}`}
      >
        {open ? <span className="text-white text-xl">×</span> : "🧠"}
      </button>
    </div>
  );
}

/**
 * If your Tailwind config doesn't already allow arbitrary @keyframes via
 * className (some v3 setups need the animation registered explicitly),
 * add this to tailwind.config.js:
 *
 *   theme: {
 *     extend: {
 *       keyframes: {
 *         "sstw-pop": {
 *           from: { opacity: "0", transform: "translateY(6px) scale(0.98)" },
 *           to:   { opacity: "1", transform: "translateY(0) scale(1)" },
 *         },
 *       },
 *       animation: {
 *         "sstw-pop": "sstw-pop 0.15s ease-out",
 *       },
 *     },
 *   },
 *
 * and swap `animate-[sstw-pop_0.15s_ease-out]` above for `animate-sstw-pop`.
 * The arbitrary-value form above works out of the box on Tailwind v3.1+
 * without any config changes, which is why it's the default here.
 */
