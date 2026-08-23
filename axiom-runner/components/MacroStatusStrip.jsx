import { useState, useEffect } from "react";
import { classifyMacroStatus } from "./market-helpers.js";

// Extracted out of MacroTab.jsx (2026-08-04, decision-first Scanner+Chart
// redesign, Phase 6) — was a private, unexported component only MacroTab
// could mount. The Chart page's own "Market Context" strip needs the exact
// same real data/logic, not a second, potentially-diverging copy — same
// bug class ("duplicate-mount") already fixed repeatedly elsewhere in this
// app's cleanup sweep. MacroTab.jsx now imports this file instead of
// defining these locally; behavior there is unchanged.

// Real 10Y/2Y Treasury yields + real Brent spot (FRED) and real market-wide
// BTC dominance (CoinGecko) — both free, no API key. Falls back to the
// existing honest proxy display (still real data, just an imperfect
// stand-in) if the real fetch fails — never a silent blank.
export function useRealMacroOverrides() {
  const [fred, setFred] = useState({ us10y: null, us2y: null, brent: null });
  const [btcDom, setBtcDom] = useState(null);
  useEffect(() => {
    const load = () => {
      fetch("/api/market/us10y").then(r => r.json()).then(d => { if (d?.ok) setFred(f => ({ ...f, us10y: d })); }).catch(() => {});
      fetch("/api/market/us2y").then(r => r.json()).then(d => { if (d?.ok) setFred(f => ({ ...f, us2y: d })); }).catch(() => {});
      fetch("/api/market/brent-oil").then(r => r.json()).then(d => { if (d?.ok) setFred(f => ({ ...f, brent: d })); }).catch(() => {});
      fetch("/api/market/btc-dominance").then(r => r.json()).then(d => { if (d?.ok) setBtcDom(d); }).catch(() => {});
    };
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return { fred, btcDom };
}

// Real Macro Regime read (Institutional Intelligence Phase 1, 2026-08-23)
// — /api/market/macro-regime, server-computed (macro-engine.js's real
// FRED + SPY/QQQ/VIX classification, cached 20 min server-side). Same
// polling cadence as useRealMacroOverrides above; a real regime read
// doesn't need to be fresher than that.
export function useMacroRegime() {
  const [regime, setRegime] = useState(null);
  useEffect(() => {
    const load = () => {
      fetch("/api/market/macro-regime").then(r => r.json()).then(d => { if (d?.ok) setRegime(d); }).catch(() => {});
    };
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return regime;
}

// The exact 10-instrument list from the options platform redesign spec
// ("SPY, QQQ, IWM, DIA, VIX, DXY, 10Y Treasury, Gold, Oil, BTC — show
// Green/Yellow/Red instead of dozens of numbers"), Phase 1. `vix: true`
// marks the one entry classified by real absolute level (distData.vix)
// instead of %change; `fredKey` marks the one entry (10Y) that has a real
// non-proxy override (useRealMacroOverrides' fred.us10y) instead of the
// IEF ETF price's own %change.
export const MACRO_STATUS_INSTRUMENTS = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq 100" },
  { symbol: "IWM", label: "Russell 2000" },
  { symbol: "DIA", label: "Dow 30" },
  { symbol: "VIX", label: "Volatility", vix: true },
  { symbol: "UUP", label: "US Dollar (DXY proxy)" },
  { symbol: "IEF", label: "10Y Treasury", fredKey: "us10y" },
  { symbol: "GLD", label: "Gold" },
  { symbol: "USO", label: "Oil" },
  { symbol: "BTCUSD", label: "Bitcoin" },
];

const STATUS_DOT_COLOR = (C, status) =>
  status === "green" ? C.green : status === "red" ? C.red : status === "yellow" ? C.amber : C.textDim;

// A single at-a-glance Green/Yellow/Red strip for the spec's exact 10
// instruments — real %change (or real VIX level) classified through
// classifyMacroStatus, replacing "dozens of numbers" with one status dot
// per instrument.
export default function MacroStatusStrip({ C, MONO, macroData, distData, fred }) {
  const macroRegime = useMacroRegime();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
      {macroRegime && (
        <div title={(macroRegime.reasons || []).join(" · ")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: `${macroRegime.color}18`, border: `1px solid ${macroRegime.color}`, borderRadius: 20, padding: "6px 12px" }}>
          <span style={{ fontSize: 11 }}>{macroRegime.icon}</span>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: macroRegime.color }}>MACRO: {macroRegime.label}</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{macroRegime.score}/100</span>
        </div>
      )}
      {/* Real Treasury/Credit scores (Institutional Intelligence Phase 2,
          2026-08-23) — same useMacroRegime() response, zero new fetches.
          Score-banded color (no discrete regime label for these two, just
          a real 0-100 readout) — >=70 healthy, 40-69 moderate, <40 stressed. */}
      {macroRegime?.treasury && (
        <div title={`Yield curve ${macroRegime.treasury.factors.yieldCurve ?? "—"} · Real 10Y yield ${macroRegime.treasury.factors.realYield10y ?? "—"}%`}
          style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 12px" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: macroRegime.treasury.score >= 70 ? C.green : macroRegime.treasury.score >= 40 ? C.amber : C.red, flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>Treasury</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{macroRegime.treasury.score}/100</span>
        </div>
      )}
      {macroRegime?.credit && (
        <div title={`HY OAS ${macroRegime.credit.factors.hySpread ?? "—"} · IG OAS ${macroRegime.credit.factors.igSpread ?? "—"} · ${macroRegime.credit.momentum?.status || "—"}`}
          style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 12px" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: macroRegime.credit.score >= 70 ? C.green : macroRegime.credit.score >= 40 ? C.amber : C.red, flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>Credit</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{macroRegime.credit.score}/100{macroRegime.credit.momentum?.status ? ` · ${macroRegime.credit.momentum.status}` : ""}</span>
        </div>
      )}
      {/* Real Liquidity/Employment scores (Institutional Intelligence
          Phase 3, 2026-08-23) — same useMacroRegime() response, zero new
          fetches. Same score-banded pattern as Treasury/Credit above. */}
      {macroRegime?.liquidity && (
        <div title={`Net Liquidity $${macroRegime.liquidity.factors.netLiquidity != null ? Math.round(macroRegime.liquidity.factors.netLiquidity).toLocaleString() : "—"}M · ${macroRegime.liquidity.factors.netLiquidityChangePct ?? "—"}% over window`}
          style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 12px" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: macroRegime.liquidity.score >= 70 ? C.green : macroRegime.liquidity.score >= 40 ? C.amber : C.red, flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>Liquidity</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{macroRegime.liquidity.score}/100</span>
        </div>
      )}
      {macroRegime?.employment && (
        <div title={`Payrolls trend ${macroRegime.employment.factors.payrollsWindowChangePct ?? "—"}% · Wages YoY ${macroRegime.employment.factors.wagesYoy ?? "—"}%`}
          style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 12px" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: macroRegime.employment.score >= 70 ? C.green : macroRegime.employment.score >= 40 ? C.amber : C.red, flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>Employment</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{macroRegime.employment.score}/100</span>
        </div>
      )}
      {MACRO_STATUS_INSTRUMENTS.map(({ symbol, label, vix, fredKey }) => {
        const q = (macroData || []).find(m => m.symbol === symbol);
        const override = fredKey ? fred?.[fredKey] : null;
        const chgPct = vix ? null : (override ? override.changePct : q?.changesPercentage);
        const { status, label: statusLabel } = classifyMacroStatus(vix ? "VIX" : symbol, {
          chgPct, vixLevel: vix ? Number(distData?.vix) || 0 : null,
        });
        const dot = STATUS_DOT_COLOR(C, status);
        return (
          <div key={symbol} style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 12px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }} />
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>{label}</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: dot }}>{statusLabel}</span>
          </div>
        );
      })}
    </div>
  );
}
