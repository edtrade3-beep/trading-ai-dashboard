import { useEffect, useRef, useState } from "react";

// ── Day Trade Console (2026-08-18, explicit user request) ───────────────
// Single-symbol, 15-minute-timeframe intraday decision page. Renders the
// real payload from GET /api/market/daytrade-console — this component does
// zero signal math of its own, same "server computes, client renders"
// split as LightBoxTab.jsx. Light/clean card design per the spec's own
// "not dark/Bloomberg-style" requirement: flat surfaces, a small shadow
// instead of a glow, and signal color reserved for borders/badges/bars —
// never body text.
const POLL_MS = 22000;

function verdictColor(C, verdict) {
  if (verdict === "BULLISH") return C.green;
  if (verdict === "BEARISH") return C.red;
  if (verdict === "MIXED") return C.amber;
  return C.textDim;
}
function scoreColor(C, score) {
  if (score == null) return C.textDim;
  if (score >= 60) return C.green;
  if (score <= 40) return C.red;
  return C.amber;
}
function titleCase(s) {
  if (!s) return "—";
  return String(s).replace(/_/g, " ").replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
function fmtPct(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}
function fmtUsd(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}
function boolWord(v) {
  if (v == null) return "unknown";
  return v ? "yes" : "no";
}

function ScoreBar({ C, MONO, score }) {
  const col = scoreColor(C, score);
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 22, fontWeight: 900, color: col, lineHeight: 1 }}>
        <span>{score != null ? score : "—"}</span>
      </div>
      <div style={{ width: "100%", height: 5, borderRadius: 3, background: C.border, overflow: "hidden", marginTop: 6 }}>
        <div style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%`, height: "100%", background: col, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

function Box({ C, MONO, SANS, label, score, children, span }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14,
      boxShadow: C.shadow, display: "flex", flexDirection: "column", gap: 8,
      gridColumn: span ? `span ${span}` : undefined,
    }}>
      <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</div>
      {score !== undefined && <ScoreBar C={C} MONO={MONO} score={score} />}
      {children}
    </div>
  );
}

function Stat({ C, MONO, SANS, label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: color || C.text, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function Dot({ C, state }) {
  const col = state === "GREEN" ? C.green : state === "YELLOW" ? C.amber : state === "RED" ? C.red : C.textDim;
  return <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 999, background: col }} />;
}

const MIXED_LABELS = { orb: "ORB", vwap: "VWAP", momentum: "Momentum", volume: "Volume", relativeStrength: "Rel. Strength", market: "Market", trend: "Trend", priceAction: "Price Action" };

export default function DayTradeConsoleTab({ C, MONO, SANS, symbol: initialSymbol, onBack }) {
  const [symbol, setSymbol] = useState((initialSymbol || "").toUpperCase());
  const [symbolInput, setSymbolInput] = useState((initialSymbol || "").toUpperCase());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  useEffect(() => {
    if (!symbol) return;
    let timer;
    const poll = async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/market/daytrade-console?symbol=${encodeURIComponent(symbol)}`);
        const j = await r.json();
        if (!aliveRef.current) return;
        if (!j.ok) { setError(j.error || "no data"); setData(null); }
        else { setError(null); setData(j); }
      } catch {
        if (aliveRef.current) setError("fetch failed");
      } finally {
        if (aliveRef.current) setLoading(false);
      }
    };
    poll();
    timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [symbol]);

  const submitSymbol = () => {
    const s = symbolInput.trim().toUpperCase();
    if (s) { setData(null); setError(null); setSymbol(s); }
  };

  const inputStyle = { fontFamily: MONO, fontSize: 13, fontWeight: 700, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, width: 120 };
  const btnStyle = { fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "8px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.border}`, background: C.card, color: C.textSec };

  return (
    <div style={{ padding: "8px 4px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {onBack && <button style={btnStyle} onClick={onBack}>← Light Box</button>}
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text }}>📊 Day Trade Console</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") submitSymbol(); }}
            placeholder="SYMBOL"
            style={inputStyle}
          />
          <button style={{ ...btnStyle, borderColor: C.accent, color: C.accent }} onClick={submitSymbol}>Load</button>
          {loading && <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>updating…</span>}
        </div>
      </div>

      {!symbol && (
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, padding: 24, textAlign: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          Enter a symbol above, or open one from a Light Box card.
        </div>
      )}

      {symbol && error && !data && (
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, padding: 24, textAlign: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          {symbol}: {error}
        </div>
      )}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Primary Signal */}
          <div style={{
            background: C.card, border: `2px solid ${verdictColor(C, data.mixedSignals.verdict)}`, borderRadius: 14, padding: 18,
            boxShadow: C.shadow, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14,
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 900, color: C.text }}>{data.symbol}</span>
              <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{fmtUsd(data.price)}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: data.chgPct >= 0 ? C.green : C.red }}>{fmtPct(data.chgPct)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.07em", textTransform: "uppercase" }}>Day Trade Score</div>
                <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 900, color: scoreColor(C, data.primarySignal.masterScore), lineHeight: 1.1 }}>
                  {data.primarySignal.masterScore != null ? data.primarySignal.masterScore : "—"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.07em", textTransform: "uppercase" }}>Confidence</div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.text }}>{data.primarySignal.confidence}%</div>
              </div>
              <span style={{
                fontFamily: SANS, fontSize: 13, fontWeight: 800, color: verdictColor(C, data.mixedSignals.verdict),
                background: `${verdictColor(C, data.mixedSignals.verdict)}18`, borderRadius: 999, padding: "8px 16px", whiteSpace: "nowrap",
              }}>
                {data.mixedSignals.verdict} · {titleCase(data.primarySignal.classification)}
              </span>
            </div>
          </div>

          {/* Row 2: ORB / VWAP / Momentum / Volume */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <Box C={C} MONO={MONO} SANS={SANS} label="Opening Range Breakout" score={data.orb.score}>
              <Stat C={C} MONO={MONO} SANS={SANS} label="Status" value={titleCase(data.orb.status)} color={scoreColor(C, data.orb.score)} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="OR Range" value={`${fmtUsd(data.orb.orLow)} – ${fmtUsd(data.orb.orHigh)}`} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="Dist. Above High" value={fmtPct(data.orb.distanceAboveHigh)} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="Volume Confirm" value={titleCase(data.orb.volumeConfirmed)} />
            </Box>
            <Box C={C} MONO={MONO} SANS={SANS} label="VWAP" score={data.vwapBox.score}>
              <Stat C={C} MONO={MONO} SANS={SANS} label="Position" value={titleCase(data.vwapBox.position)} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="Distance" value={fmtPct(data.vwapBox.distancePct)} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="VWAP Momentum" value={fmtPct(data.vwapBox.momentumPct)} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="VWAP Level" value={fmtUsd(data.vwapBox.vwap)} />
            </Box>
            <Box C={C} MONO={MONO} SANS={SANS} label="Momentum" score={data.momentumBox.score}>
              <Stat C={C} MONO={MONO} SANS={SANS} label="RSI (15m)" value={data.momentumBox.rsi ?? "—"} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="ROC" value={fmtPct(data.momentumBox.roc)} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="MACD" value={titleCase(data.momentumBox.macdState)} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="Direction" value={titleCase(data.momentumBox.direction)} />
            </Box>
            <Box C={C} MONO={MONO} SANS={SANS} label="Volume" score={data.volumeBox.score}>
              <Stat C={C} MONO={MONO} SANS={SANS} label="RVOL" value={data.volumeBox.volume != null ? `${data.volumeBox.volume.toFixed(2)}x` : "—"} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="State" value={titleCase(data.volumeBox.state)} />
            </Box>
          </div>

          {/* Row 3: Trend / Relative Strength / Market / Price Action */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <Box C={C} MONO={MONO} SANS={SANS} label="Trend (15m stack)" score={data.trendBox.score}>
              <Stat C={C} MONO={MONO} SANS={SANS} label="Label" value={titleCase(data.trendBox.label)} color={scoreColor(C, data.trendBox.score)} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="Price vs VWAP" value={data.trendBox.vwap != null ? (data.trendBox.price > data.trendBox.vwap ? "Above" : "Below") : "—"} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="EMA 9/20/50" value={`${data.trendBox.ema9 ?? "—"} / ${data.trendBox.ema20 ?? "—"} / ${data.trendBox.ema50 ?? "—"}`} />
            </Box>
            <Box C={C} MONO={MONO} SANS={SANS} label="Relative Strength" score={data.relativeStrengthBox.score}>
              <Stat C={C} MONO={MONO} SANS={SANS} label="Classification" value={titleCase(data.relativeStrengthBox.classification)} color={scoreColor(C, data.relativeStrengthBox.score)} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="vs SPY" value={fmtPct(data.relativeStrengthBox.vsSpy)} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="vs QQQ" value={fmtPct(data.relativeStrengthBox.vsQqq)} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="vs Sector" value={fmtPct(data.relativeStrengthBox.vsSector)} />
            </Box>
            <Box C={C} MONO={MONO} SANS={SANS} label="Market Confirmation" score={data.marketBox.score}>
              <Stat C={C} MONO={MONO} SANS={SANS} label="Regime" value={titleCase(data.marketBox.regimeLabel)} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="VIX" value={data.marketBox.vixVal ?? "—"} />
              <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: SANS, fontSize: 10.5, color: C.textSec }}><Dot C={C} state={data.marketBox.dots.spy} />SPY</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: SANS, fontSize: 10.5, color: C.textSec }}><Dot C={C} state={data.marketBox.dots.qqq} />QQQ</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: SANS, fontSize: 10.5, color: C.textSec }}><Dot C={C} state={data.marketBox.dots.vix} />VIX</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: SANS, fontSize: 10.5, color: C.textSec }}><Dot C={C} state={data.marketBox.dots.sector} />Sector</span>
              </div>
            </Box>
            <Box C={C} MONO={MONO} SANS={SANS} label="Price Action" score={data.priceActionBox.score}>
              <Stat C={C} MONO={MONO} SANS={SANS} label="Higher Highs/Lows" value={`${boolWord(data.priceActionBox.higherHighs)} / ${boolWord(data.priceActionBox.higherLows)}`} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="Support / Resist." value={`${fmtUsd(data.priceActionBox.support)} / ${fmtUsd(data.priceActionBox.resistance)}`} />
              <Stat C={C} MONO={MONO} SANS={SANS} label="15m ATR" value={fmtUsd(data.priceActionBox.atr15m)} />
            </Box>
          </div>

          {/* Mixed Signals */}
          <div style={{ background: C.card, border: `1px solid ${verdictColor(C, data.mixedSignals.verdict)}66`, borderRadius: 12, padding: 16, boxShadow: C.shadow }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
              <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.07em", textTransform: "uppercase" }}>Mixed Signals</div>
              <div style={{ display: "flex", gap: 10, fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>
                <span style={{ color: C.green }}>● {data.mixedSignals.bullishCount} Bullish</span>
                <span style={{ color: C.amber }}>● {data.mixedSignals.neutralCount} Neutral</span>
                <span style={{ color: C.red }}>● {data.mixedSignals.bearishCount} Bearish</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 12 }}>
              {Object.keys(MIXED_LABELS).map((k) => {
                const cls = data.mixedSignals.classified[k];
                const col = cls === "bullish" ? C.green : cls === "bearish" ? C.red : C.textDim;
                return (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 11.5, color: C.textSec }}>
                    <Dot C={C} state={cls === "bullish" ? "GREEN" : cls === "bearish" ? "RED" : "YELLOW"} />
                    {MIXED_LABELS[k]} <span style={{ color: col, fontWeight: 700 }}>{cls}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.5, background: C.bg, borderRadius: 8, padding: "10px 12px" }}>{data.mixedSignals.reason}</div>
          </div>

          {/* Trade Plan */}
          <div style={{
            background: C.card, border: `1px solid ${data.tradePlan.direction === "NO_TRADE" ? C.border : verdictColor(C, data.tradePlan.direction === "LONG" ? "BULLISH" : "BEARISH")}`,
            borderRadius: 12, padding: 16, boxShadow: C.shadow,
          }}>
            <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Trade Plan</div>
            {data.tradePlan.direction === "NO_TRADE" ? (
              <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: C.textDim, display: "flex", alignItems: "center", gap: 8 }}>
                🛑 NO TRADE — {data.tradePlan.reason}
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "center" }}>
                <span style={{
                  fontFamily: SANS, fontSize: 13, fontWeight: 800,
                  color: verdictColor(C, data.tradePlan.direction === "LONG" ? "BULLISH" : "BEARISH"),
                  background: `${verdictColor(C, data.tradePlan.direction === "LONG" ? "BULLISH" : "BEARISH")}18`, borderRadius: 999, padding: "6px 14px",
                }}>{data.tradePlan.direction}</span>
                <Stat C={C} MONO={MONO} SANS={SANS} label="Entry" value={fmtUsd(data.tradePlan.entry)} />
                <Stat C={C} MONO={MONO} SANS={SANS} label="Stop" value={fmtUsd(data.tradePlan.stop)} color={C.red} />
                <Stat C={C} MONO={MONO} SANS={SANS} label="Target 1" value={fmtUsd(data.tradePlan.target1)} color={C.green} />
                <Stat C={C} MONO={MONO} SANS={SANS} label="Target 2" value={fmtUsd(data.tradePlan.target2)} color={C.green} />
                <Stat C={C} MONO={MONO} SANS={SANS} label="R:R" value={data.tradePlan.rewardRisk != null ? `${data.tradePlan.rewardRisk}:1` : "—"} />
                <Stat C={C} MONO={MONO} SANS={SANS} label="Risk %" value={data.tradePlan.positionRiskPct != null ? `${data.tradePlan.positionRiskPct}%` : "—"} />
              </div>
            )}
          </div>

          <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, textAlign: "right" }}>
            Updated {data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : "—"} · coverage {data.masterScore.coverage}%
          </div>
        </div>
      )}
    </div>
  );
}
