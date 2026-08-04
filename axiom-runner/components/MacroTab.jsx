import { useState, useEffect } from "react";
import { Badge } from "./ui-atoms.jsx";
// MacroStatusStrip/useRealMacroOverrides/MACRO_STATUS_INSTRUMENTS extracted
// to their own file (2026-08-04, decision-first Scanner+Chart redesign,
// Phase 6) so the Chart page's own Market Context strip can mount the exact
// same real component instead of a second, potentially-diverging copy.
// Behavior here is unchanged.
import MacroStatusStrip, { useRealMacroOverrides } from "./MacroStatusStrip.jsx";

// Per-symbol override for the ALL INSTRUMENTS grid: real value/label/unit
// in place of the ETF price, only once the real fetch has actually landed.
const REAL_OVERRIDES = {
  IEF: (fred) => fred.us10y && { label: "10Y Treasury", value: fred.us10y.value, changePct: fred.us10y.changePct, unit: "%" },
  SHY: (fred) => fred.us2y && { label: "2Y Treasury", value: fred.us2y.value, changePct: fred.us2y.changePct, unit: "%" },
  BNO: (fred) => fred.brent && { label: "Brent Oil", value: fred.brent.value, changePct: fred.brent.changePct, unit: "$" },
};

// Curated risk-lens tiles shown first, with plain-English labels
// (US EQUITY RISK, GROWTH BETA, ...). The full-instrument grid below used
// to also render every one of these same symbols a second time in a
// different card style — real duplication, not complementary detail
// (CTO audit, 2026-07-29, product/UX pass). CURATED_RISK_LENS_KEYS lets
// the full grid exclude them instead of repeating them.
const CURATED_RISK_LENS = [
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
];
const CURATED_RISK_LENS_KEYS = new Set(CURATED_RISK_LENS.map((r) => r.k));

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
  C, MONO, macroTone, macroData, distData, macroEventCalendar, macroEventAlerts, cryptoSnapshot,
  watchlistSymbols, setWatchlistSymbols, setTerminalSymbol, setActiveTab,
}) {
  const { fred, btcDom } = useRealMacroOverrides();
  // Mobile audit finding (2026-08-04, "what else looks crowded on
  // mobile") — the "rest of macroData" grid below (rates/credit/breadth
  // instruments not in the curated risk lens above) rendered each of its
  // ~8 instruments as its own tall padded card (big price + badge + %chg
  // + 2 buttons), stacked one after another — a long wall of near-
  // identical cards, same pattern the Chart page's Supporting Detail
  // section had. Same real fix as that Chart-page pass: collapsed by
  // default behind a toggle, zero data/logic changes — the curated risk
  // lens above already covers the primary macro reads (equities/growth/
  // small-caps/USD/oil/gold/duration/crypto); this is genuinely
  // supplementary detail (2Y/10Y-proxy, VIXY, silver, credit spreads).
  const [showAllInstruments, setShowAllInstruments] = useState(false);
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
            <MacroStatusStrip C={C} MONO={MONO} macroData={macroData} distData={distData} fred={fred} />
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
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>NEXT EVENT</div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}>
                  <span style={{ fontFamily: MONO, color: C.text, fontWeight: 700 }}>{macroEventCalendar[0]?.title || "N/A"}</span>
                </div>
                <div style={{ fontSize: 12, color: C.textSec }}>
                  Countdown: <span style={{ fontFamily: MONO, color: C.accent, fontWeight: 700 }}>{macroEventCalendar[0] ? formatCountdown(macroEventCalendar[0].tteMs) : "—"}</span>
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
              {CURATED_RISK_LENS.map(({ k, t }) => {
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
            <div style={{ display: "flex", alignItems: "center", gap: 10, rowGap: 6, flexWrap: "wrap", margin: "4px 0 12px" }}>
              {/* No whiteSpace:nowrap here (unlike the Chart page's shorter
                  "SUPPORTING DETAIL" label this pattern was copied from) —
                  this label is long enough to overflow a 390px viewport on
                  its own single line even inside a flexWrap container
                  (flex-wrap only wraps between items, not within one), so
                  it needs to wrap internally instead; minWidth:0 lets it
                  actually shrink below its unwrapped intrinsic width. */}
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.1em", minWidth: 0 }}>
                ALL INSTRUMENTS — rates/credit/breadth, beyond the curated lens above
              </div>
              <div style={{ flex: 1, minWidth: 20, height: 1, background: C.border }} />
              <button onClick={() => setShowAllInstruments(v => !v)}
                style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, background: "transparent", border: `1px solid ${C.accent}55`, borderRadius: 6, padding: "3px 9px", cursor: "pointer", whiteSpace: "nowrap" }}>
                {showAllInstruments ? "Hide ▴" : `Show (${macroData.filter((q) => !CURATED_RISK_LENS_KEYS.has(q.symbol)).length} more instruments) ▾`}
              </button>
            </div>
            {showAllInstruments && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {/* Excludes CURATED_RISK_LENS_KEYS — those already have their
                  own tiles above; this grid is the rest of macroData
                  (rates/credit/breadth instruments not in the curated risk
                  lens), not a second copy of the same ~10 symbols. */}
              {macroData.filter((q) => !CURATED_RISK_LENS_KEYS.has(q.symbol)).map((q) => {
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
            )}
          </div>
  );
}
