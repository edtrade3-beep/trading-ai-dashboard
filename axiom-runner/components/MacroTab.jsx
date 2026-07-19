import { useState, useEffect } from "react";
import { Badge } from "./ui-atoms.jsx";

// Real 10Y/2Y Treasury yields + real Brent spot (FRED) and real market-wide
// BTC dominance (CoinGecko) — both free, no API key. These override the
// ALL INSTRUMENTS grid's IEF/SHY/BNO tiles (bond/oil ETF *prices*, not the
// yields/spot they're standing in for) and the crypto card's 3-coin
// dominance proxy. Falls back to the existing honest proxy display (still
// real data, just an imperfect stand-in) if the real fetch fails — never a
// silent blank.
function useRealMacroOverrides() {
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

// Per-symbol override for the ALL INSTRUMENTS grid: real value/label/unit
// in place of the ETF price, only once the real fetch has actually landed.
const REAL_OVERRIDES = {
  IEF: (fred) => fred.us10y && { label: "10Y Treasury", value: fred.us10y.value, changePct: fred.us10y.changePct, unit: "%" },
  SHY: (fred) => fred.us2y && { label: "2Y Treasury", value: fred.us2y.value, changePct: fred.us2y.changePct, unit: "%" },
  BNO: (fred) => fred.brent && { label: "Brent Oil", value: fred.brent.value, changePct: fred.brent.changePct, unit: "$" },
};

function formatCountdown(ms) {
  const n = Math.max(0, Number(ms || 0));
  const totalSec = Math.floor(n / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export default function MacroTab({
  C, MONO, macroTone, macroData, macroEventCalendar, macroEventAlerts, cryptoSnapshot,
  watchlistSymbols, setWatchlistSymbols, setTerminalSymbol, setActiveTab,
}) {
  const { fred, btcDom } = useRealMacroOverrides();
  return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                MACRO DASHBOARD V2 — {macroTone.toUpperCase()}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge color={macroTone.includes("Risk-On") ? C.green : macroTone.includes("Risk-Off") ? C.red : C.amber}>{macroTone}</Badge>
                <button
                  onClick={async () => {
                    const spy = macroData.find(m => m.symbol === "SPY");
                    const qqq = macroData.find(m => m.symbol === "QQQ");
                    const vix = macroData.find(m => m._label === "VIX" || m.symbol === "VIXY");
                    const usd = macroData.find(m => m.symbol === "UUP");
                    const lines = [
                      `📊 *Macro Snapshot*  — ${macroTone}`,
                      `SPY ${spy ? (spy.changesPercentage >= 0 ? "+" : "") + spy.changesPercentage.toFixed(2) + "%" : "—"}  QQQ ${qqq ? (qqq.changesPercentage >= 0 ? "+" : "") + qqq.changesPercentage.toFixed(2) + "%" : "—"}`,
                      `VIX ${vix ? (vix.changesPercentage >= 0 ? "+" : "") + vix.changesPercentage.toFixed(2) + "%" : "—"}  USD ${usd ? (usd.changesPercentage >= 0 ? "+" : "") + usd.changesPercentage.toFixed(2) + "%" : "—"}`,
                    ];
                    const nextEvt = macroEventCalendar[0];
                    if (nextEvt) lines.push(`Next: ${nextEvt.title} — ${formatCountdown(nextEvt.tteMs)}`);
                    try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) }); } catch {}
                  }}
                  style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 6, padding: "5px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                >PUSH BRIEF</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "9px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em" }}>ECONOMIC CALENDAR + COUNTDOWN</span>
                  <Badge color={macroEventAlerts.length ? C.red : C.green}>{macroEventAlerts.length ? "RISK WINDOW" : "CLEAR"}</Badge>
                </div>
                <div style={{ padding: 8, display: "grid", gap: 6 }}>
                  {macroEventCalendar.map((e) => (
                    <div key={e.id} style={{ border: `1px solid ${e.phase === "live" ? `${C.red}66` : e.phase === "imminent" ? `${C.amber}66` : C.border}`, borderRadius: 6, padding: "7px 8px", background: e.phase === "live" ? C.redBg : e.phase === "imminent" ? C.amberBg : C.surface }}>
                      <div style={{ display: "grid", gridTemplateColumns: "66px 1fr 110px 84px", gap: 8, alignItems: "center" }}>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700 }}>{e.tag}</span>
                        <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{e.title}</span>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                          {e.time.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: e.phase === "live" ? C.red : e.phase === "imminent" ? C.amber : C.textSec, fontWeight: 700 }}>
                          {e.phase === "live" ? "LIVE" : formatCountdown(e.tteMs)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>AUTO RISK ACTIONS</div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}>
                  Next event: <span style={{ fontFamily: MONO, color: C.text, fontWeight: 700 }}>{macroEventCalendar[0]?.title || "N/A"}</span>
                </div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 8 }}>
                  Countdown: <span style={{ fontFamily: MONO, color: C.accent, fontWeight: 700 }}>{macroEventCalendar[0] ? formatCountdown(macroEventCalendar[0].tteMs) : "—"}</span>
                </div>
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, color: C.textSec }}>1. T-90m: no new oversized entries.</div>
                  <div style={{ fontSize: 12, color: C.textSec }}>2. T-30m: reduce beta and tighten stops.</div>
                  <div style={{ fontSize: 12, color: C.textSec }}>3. T+15m: wait for post-release structure before adds.</div>
                  <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>
                    Fed/CPI/Jobs/PCE/Minutes are estimated recurring schedule until provider calendar API is connected.
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
              {[
                { k: "SPY", t: "US EQUITY RISK" },
                { k: "QQQ", t: "GROWTH BETA" },
                { k: "IWM", t: "SMALL-CAP BREADTH" },
                { k: "UUP", t: "USD PRESSURE" },
                { k: "USO", t: "OIL / INFLATION" },
                { k: "GLD", t: "DEFENSIVE METAL" },
                { k: "TLT", t: "LONG DURATION" },
                { k: "BTCUSD", t: "RISK SENTIMENT" },
                { k: "ETHUSD", t: "ALT LEADER" },
                { k: "SOLUSD", t: "HIGH-BETA ALT" },
              ].map(({ k, t }) => {
                const q = macroData.find((m) => m.symbol === k);
                if (!q) return null;
                const d1 = q.delta1d ?? q.changesPercentage ?? 0;
                const d7 = q.delta1w ?? 0;
                return (
                  <div key={k} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>{q._label || q.symbol}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{t}</span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800 }}>${q.price?.toFixed(2)}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, marginBottom: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: d1 >= 0 ? C.green : C.red }}>1D {d1 >= 0 ? "+" : ""}{d1.toFixed(2)}%</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: d7 >= 0 ? C.green : C.red }}>1W {d7 >= 0 ? "+" : ""}{d7.toFixed(2)}%</span>
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button
                        onClick={() => setWatchlistSymbols(prev => watchlistSymbols.includes(k) ? prev.filter(s => s !== k) : Array.from(new Set([...prev, k])))}
                        style={{ flex: 1, fontFamily: MONO, fontSize: 12, padding: "3px 0", background: watchlistSymbols.includes(k) ? `${C.red}18` : `${C.green}18`, color: watchlistSymbols.includes(k) ? C.red : C.green, border: `1px solid ${watchlistSymbols.includes(k) ? C.red : C.green}44`, borderRadius: 5, cursor: "pointer" }}
                      >{watchlistSymbols.includes(k) ? "−WL" : "+WL"}</button>
                      <button
                        onClick={() => { setTerminalSymbol(k); try { localStorage.setItem("mterminal_load_sym", k); } catch {} setActiveTab("mterminal"); }}
                        style={{ flex: 1, fontFamily: MONO, fontSize: 12, padding: "3px 0", background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 5, cursor: "pointer" }}
                      >CHART</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>{btcDom ? "BTC DOMINANCE" : "BTC DOMINANCE (PROXY)"}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{btcDom ? "real market-wide" : "BTC / (BTC+ETH+SOL)"}</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: C.accent }}>
                  {btcDom ? btcDom.btcDominance.toFixed(1) : Number(cryptoSnapshot.btcDomProxy || 0).toFixed(1)}%
                </div>
                <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 12, color: C.textSec }}>
                  Alt momentum spread:
                  <span style={{ color: Number(cryptoSnapshot.altStrength || 0) >= 0 ? C.green : C.red, fontWeight: 700, marginLeft: 6 }}>
                    {Number(cryptoSnapshot.altStrength || 0) >= 0 ? "+" : ""}{Number(cryptoSnapshot.altStrength || 0).toFixed(2)}%
                  </span>
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.text, marginBottom: 6 }}>CRYPTO COMPLEX</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { k: "BTCUSD", t: "BTC" },
                    { k: "ETHUSD", t: "ETH" },
                    { k: "SOLUSD", t: "SOL" },
                  ].map(({ k, t }) => {
                    const q = macroData.find((m) => m.symbol === k);
                    const chg = Number(q?.changesPercentage || 0);
                    return (
                      <div key={`cx-${k}`} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{t}</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text }}>
                          ${Number(q?.price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: chg >= 0 ? C.green : C.red }}>
                          {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.textSec, marginBottom: 10 }}>
              Regime filter: use macro tone first, then sector/stock relative strength, then entry trigger.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {macroData.map((q) => {
                const override = REAL_OVERRIDES[q.symbol]?.(fred);
                const chg = override ? (override.changePct ?? 0) : (q.changesPercentage || 0);
                const up = chg >= 0;
                const displayLabel = override ? override.label : (q._label || q.symbol);
                const displayValue = override
                  ? (override.unit === "%" ? `${override.value.toFixed(2)}%` : `$${override.value.toFixed(2)}`)
                  : `$${q.price?.toFixed(2)}`;
                return (
                  <div key={q.symbol} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>{displayLabel}</span>
                      <Badge color={up ? C.green : C.red}>{up ? "UP" : "DOWN"}</Badge>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, color: C.text }}>{displayValue}</div>
                    <div style={{ marginTop: 6, marginBottom: 10, fontFamily: MONO, fontSize: 15, color: up ? C.green : C.red, fontWeight: 700 }}>
                      {up ? "+" : ""}{chg.toFixed(2)}%
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button
                        onClick={() => setWatchlistSymbols(prev => watchlistSymbols.includes(q.symbol) ? prev.filter(s => s !== q.symbol) : Array.from(new Set([...prev, q.symbol])))}
                        style={{ flex: 1, fontFamily: MONO, fontSize: 12, padding: "3px 0", background: watchlistSymbols.includes(q.symbol) ? `${C.red}18` : `${C.green}18`, color: watchlistSymbols.includes(q.symbol) ? C.red : C.green, border: `1px solid ${watchlistSymbols.includes(q.symbol) ? C.red : C.green}44`, borderRadius: 5, cursor: "pointer" }}
                      >{watchlistSymbols.includes(q.symbol) ? "−WL" : "+WL"}</button>
                      <button
                        onClick={() => { setTerminalSymbol(q.symbol); try { localStorage.setItem("mterminal_load_sym", q.symbol); } catch {} setActiveTab("mterminal"); }}
                        style={{ flex: 1, fontFamily: MONO, fontSize: 12, padding: "3px 0", background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 5, cursor: "pointer" }}
                      >CHART</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
  );
}
