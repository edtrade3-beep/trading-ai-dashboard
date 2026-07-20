import { useState, useEffect } from "react";
import { C, MONO } from "./theme.js";

const SESSION_LABEL = { REGULAR: "MARKET OPEN", PREMARKET: "PRE-MARKET", AFTERMARKET: "AFTER-HOURS", OVERNIGHT: "MARKET CLOSED" };
const SESSION_COLOR = { REGULAR: C.green, PREMARKET: C.amber, AFTERMARKET: C.purple, OVERNIGHT: C.textDim };

export default function MacroTape({ data, cryptoSnapshot, marketSession }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  // Collapsible (2026-07-20, user request — same treatment as the left
  // sidebar) — persisted across sessions. Normal document flow, not
  // position:fixed, so collapsing it just reflows everything below;
  // no ResizeObserver plumbing needed like the sidebar required.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("macrotape_collapsed") === "1"; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed(v => {
    const nv = !v;
    try { localStorage.setItem("macrotape_collapsed", nv ? "1" : "0"); } catch {}
    return nv;
  });

  if (!data.length) return null;

  // Priority index slots matching the reference layout. DXY is backed by
  // UUP (the closest fetched proxy — MACRO_SYMBOLS has no literal DXY quote)
  // labeled "US Dollar" rather than "DXY", since UUP's ETF share price
  // (~$25-30) doesn't match real DXY index conventions (~100-110) — showing
  // it as "DXY" would be a misleading number, not just a relabel.
  const SLOTS = [
    { sym: "SPY",   label: "S&P 500",        shortLabel: "S&P 500" },
    { sym: "QQQ",   label: "Nasdaq 100",      shortLabel: "Nasdaq 100" },
    { sym: "IWM",   label: "Russell 2000",    shortLabel: "Russell 2000" },
    { sym: "DIA",   label: "Dow 30",          shortLabel: "Dow 30" },
    { sym: "VIXY",  label: "Volatility",      shortLabel: "Volatility", isVix: true },
    { sym: "UUP",   label: "US Dollar",       shortLabel: "US Dollar" },
    { sym: "GLD",   label: "Gold",            shortLabel: "Gold" },
    { sym: "BNO",   label: "Brent Oil",       shortLabel: "Brent Oil (l)" },
    { sym: "USO",   label: "Crude Oil",       shortLabel: "Crude Oil" },
    { sym: "SHY",   label: "2Y Treasury",     shortLabel: "2Y Treasury" },
    { sym: "BTCUSD",label: "Bitcoin",         shortLabel: "BTC" },
    { sym: "ETHUSD",label: "Ethereum",        shortLabel: "ETH" },
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

  if (collapsed) {
    const spyChgUp = spyChg >= 0;
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, background: C.surface,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0, padding: "4px 12px",
      }}>
        <button onClick={toggleCollapsed} title="Show market ticker"
          style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer",
            fontFamily: MONO, fontSize: 11, padding: "2px 4px", display: "flex", alignItems: "center", gap: 4 }}>
          <span>▸</span><span>MARKET TICKER</span>
        </button>
        {spyRow && (
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
            S&P <span style={{ color: C.text, fontWeight: 700 }}>{spyRow.price?.toFixed(2)}</span>{" "}
            <span style={{ color: spyChgUp ? C.green : C.red }}>{spyChgUp ? "+" : ""}{spyChg.toFixed(2)}%</span>
          </span>
        )}
        <span style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: regimeColor, flexShrink: 0, boxShadow: `0 0 5px ${regimeColor}` }} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: regimeColor, fontWeight: 700, letterSpacing: "0.06em" }}>{regime}</span>
        </span>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "stretch",
      background: C.surface, borderBottom: `1px solid ${C.border}`,
      overflowX: "auto", scrollbarWidth: "none",
      flexShrink: 0,
    }}>
      <button onClick={toggleCollapsed} title="Hide market ticker"
        style={{ borderTop: "none", borderLeft: "none", borderBottom: "none", borderRight: `1px solid ${C.border}`,
          background: "transparent", color: C.textDim,
          cursor: "pointer", padding: "6px 10px", flexShrink: 0, fontSize: 12 }}>
        ◂
      </button>
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
      {/* VIX regime badge */}
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
      {/* Clock + market-status — right-pinned, reuses the same marketSession
          value already computed for MarketSessionBanner (no new fetch). */}
      {marketSession && (() => {
        const sCol = SESSION_COLOR[marketSession] || C.textDim;
        return (
          <div style={{ padding: "6px 16px", display: "flex", alignItems: "center", gap: 8, borderLeft: `1px solid ${C.border}`, flexShrink: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: sCol, flexShrink: 0, boxShadow: marketSession === "REGULAR" ? `0 0 7px ${sCol}` : "none" }} />
            <span style={{ fontFamily: MONO, fontSize: 12, color: sCol, fontWeight: 800, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
              {SESSION_LABEL[marketSession] || marketSession}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, whiteSpace: "nowrap" }}>
              {now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit" })} ET
            </span>
          </div>
        );
      })()}
    </div>
  );
}
