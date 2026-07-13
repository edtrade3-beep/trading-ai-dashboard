import { C, MONO } from "./theme.js";

export default function MacroTape({ data, cryptoSnapshot }) {
  if (!data.length) return null;

  // Priority index slots matching the screenshot layout
  const SLOTS = [
    { sym: "SPY",   label: "S&P 500",        shortLabel: "S&P 500" },
    { sym: "QQQ",   label: "Nasdaq 100",      shortLabel: "Nasdaq 100" },
    { sym: "IWM",   label: "Russell 2000",    shortLabel: "Russell 2000" },
    { sym: "DIA",   label: "Dow 30",          shortLabel: "Dow 30" },
    { sym: "VIXY",  label: "Volatility",      shortLabel: "Volatility", isVix: true },
    { sym: "GLD",   label: "Gold",            shortLabel: "Gold" },
    { sym: "BNO",   label: "Brent Oil",       shortLabel: "Brent Oil (l)" },
    { sym: "USO",   label: "Crude Oil",       shortLabel: "Crude Oil" },
    { sym: "SHY",   label: "2Y Treasury",     shortLabel: "2Y Treasury" },
    { sym: "BTCUSD",label: "Bitcoin",         shortLabel: "BTC" },
  ];

  const vixyRow = data.find(q => q.symbol === "VIXY");
  const spyRow  = data.find(q => q.symbol === "SPY");
  const vixChg  = vixyRow?.changesPercentage || 0;
  const spyChg  = spyRow?.changesPercentage || 0;
  let regime, regimeColor, regimeBg;
  if (vixChg >= 3 || (vixChg >= 1 && spyChg <= -1)) {
    regime = "FEAR 🔴"; regimeColor = C.red; regimeBg = `${C.red}14`;
  } else if (vixChg <= -2 || (vixChg < 0 && spyChg >= 0.5)) {
    regime = "CALM 🟢"; regimeColor = C.green; regimeBg = `${C.green}14`;
  } else {
    regime = "NEUTRAL 🟡"; regimeColor = C.amber; regimeBg = `${C.amber}14`;
  }

  return (
    <div style={{
      display: "flex", alignItems: "stretch",
      background: C.surface, borderBottom: `1px solid ${C.border}`,
      overflowX: "auto", scrollbarWidth: "none",
      flexShrink: 0,
    }}>
      {SLOTS.map(slot => {
        const q = data.find(d => d.symbol === slot.sym);
        const chg = q?.changesPercentage || 0;
        const price = q?.price || 0;
        const isUp = chg >= 0;
        const col = slot.isVix
          ? (isUp ? C.red : C.green)
          : (isUp ? C.green : C.red);
        return (
          <div key={slot.sym} style={{
            padding: "6px 18px", display: "flex", flexDirection: "column",
            justifyContent: "center", minWidth: "fit-content",
            borderRight: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, fontWeight: 600, letterSpacing: "0.07em", marginBottom: 2, whiteSpace: "nowrap" }}>
              {slot.shortLabel}
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 14, fontFamily: MONO, color: C.text, fontWeight: 800 }}>
                {price > 0
                  ? (price >= 10000 ? price.toLocaleString(undefined, { maximumFractionDigits: 0 })
                     : price >= 1000 ? price.toLocaleString(undefined, { maximumFractionDigits: 2 })
                     : price.toFixed(2))
                  : "—"}
              </span>
              <span style={{ fontSize: 12, fontFamily: MONO, color: col, fontWeight: 700 }}>
                {price > 0 ? `${isUp ? "+" : ""}${chg.toFixed(2)}%` : "—"}
              </span>
            </div>
          </div>
        );
      })}
      {/* VIX regime badge pinned right */}
      <div style={{
        marginLeft: "auto", padding: "6px 16px", display: "flex",
        alignItems: "center", gap: 7, background: regimeBg,
        borderLeft: `1px solid ${regimeColor}33`, flexShrink: 0,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: regimeColor, flexShrink: 0, boxShadow: `0 0 7px ${regimeColor}` }} />
        <span style={{ fontFamily: MONO, fontSize: 12, color: regimeColor, fontWeight: 800, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
          VIX REGIME: {regime}
        </span>
      </div>
    </div>
  );
}
