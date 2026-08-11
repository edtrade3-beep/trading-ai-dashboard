import { useState, useEffect } from "react";
import { computeRegime } from "./market-helpers.js";

// RhFutureValueTab.jsx — "🚀 FUTURE STOCKS" / "💎 UNDERVALUED STOCKS"
// (explicit user request, 2026-08-11: "Add TWO separate sections to my
// trading platform ... Never confuse 'good company' with 'good stock
// price'"). Every score/number here traces to real FMP fundamentals
// (src/future-value-scoring.js, src/routes/future-value-scan.js) — no
// invented DCF, no fabricated moat number. Kept deliberately simple per the
// same "SIMPLE VERSION" instruction the Watchlists redesign already
// follows: one headline score + real fair-value read per card, everything
// else lives behind Deep Scan.

const ZONE_LABEL = { IDEAL_BUY_ZONE: "🟢 Ideal buy zone", ACCEPTABLE: "🟡 Acceptable", TOO_EXPENSIVE: "🔴 Too expensive" };

function scoreColor(C, n) {
  if (n == null) return C.textDim;
  return n >= 65 ? C.green : n >= 45 ? C.amber : C.red;
}

// 3-state verdict — the same "never confuse good company with good stock
// price" logic the user spelled out explicitly: a great business at too
// rich a price is WAIT, not BUY; a cheap weak business is AVOID, not a
// bargain. Only real FUTURE_SCORE + real fair-value zone decide this.
function computeFutureValueVerdict(read) {
  const future = read?.futureScore;
  const zone = read?.fairValue?.zone;
  const value = read?.valueScore;
  if (future == null) return { action: "WAIT", color: "#d6a312", reason: "Not enough real fundamentals data to score this business yet." };
  if (future < 45) return { action: "AVOID", color: "#c8282a", reason: "Weak real business fundamentals (quality/growth/moat) — a low price doesn't fix a weak business." };
  if (zone === "TOO_EXPENSIVE") return { action: "WAIT", color: "#d6a312", reason: "Real business quality is good, but the price is above real analyst fair value — wait for a better entry." };
  if (future >= 65 && (zone === "IDEAL_BUY_ZONE" || zone === "ACCEPTABLE")) return { action: "BUY", color: "#0d9465", reason: "Strong real business fundamentals AND priced at/below real analyst fair value." };
  if (value != null && value < 35 && zone == null) return { action: "WAIT", color: "#d6a312", reason: "Decent business, but no real analyst price-target coverage to confirm the price is fair." };
  return { action: "WAIT", color: "#d6a312", reason: "Decent business, but not a clearly strong enough setup on both quality and price yet." };
}

function Card({ C, MONO, SANS, r, kind, onDeepScan }) {
  const headline = kind === "undervalued" ? r.valueScore : r.futureScore;
  const headlineLabel = kind === "undervalued" ? "VALUE" : "FUTURE";
  const mos = r.fairValue?.marginOfSafetyPct;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text }}>{r.symbol}</span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>${Number(r.price).toFixed(2)}</span>
      </div>
      {r.name && <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{headlineLabel} SCORE</span>
        <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: scoreColor(C, headline) }}>{headline ?? "—"}</span>
      </div>
      {r.fairValue && (
        <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginBottom: 8 }}>
          Fair value ${r.fairValue.fairValue} · {ZONE_LABEL[r.fairValue.zone] || "—"}
          {mos != null && <> · {mos >= 0 ? `${mos.toFixed(0)}% below fair value` : `${Math.abs(mos).toFixed(0)}% above fair value`}</>}
        </div>
      )}
      <button onClick={() => onDeepScan(r.symbol)}
        style={{ width: "100%", fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 0", borderRadius: 6, border: "1px solid #d6a312", background: "#d6a31214", color: "#d6a312", cursor: "pointer" }}>
        ⊕ DEEP SCAN
      </button>
    </div>
  );
}

function Section({ C, MONO, SANS, icon, title, desc, rows, kind, onDeepScan }) {
  if (!rows.length) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>{icon} {title}</div>
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 10 }}>{desc}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>
        {rows.map((r) => <Card key={r.symbol} C={C} MONO={MONO} SANS={SANS} r={r} kind={kind} onDeepScan={onDeepScan} />)}
      </div>
    </div>
  );
}

function dimRead(label, state, reason) {
  const color = state === "good" ? "#0d9465" : state === "bad" ? "#c8282a" : "#d6a312";
  const icon = state === "good" ? "🟢" : state === "bad" ? "🔴" : "🟡";
  return { label, state, color, icon, reason };
}

function DeepScanModal({ C, MONO, SANS, symbol, read, macroData, onClose }) {
  const [tech, setTech] = useState(null);
  const [techLoading, setTechLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setTechLoading(true);
    fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((j) => { if (live) setTech((j.results || [])[0] || null); })
      .catch(() => { if (live) setTech(null); })
      .finally(() => { if (live) setTechLoading(false); });
    return () => { live = false; };
  }, [symbol]);

  if (!read) return null;
  const regime = computeRegime(macroData);
  const verdict = computeFutureValueVerdict(read);
  const fv = read.fairValue;

  const fundamentalDim = dimRead("Fundamental",
    read.qualityScore >= 65 ? "good" : read.qualityScore >= 40 ? "neutral" : "bad",
    `Quality Score ${read.qualityScore ?? "—"}/100 — real profit margin, ROE, ROIC, balance-sheet health.`);
  const valuationDim = dimRead("Valuation",
    fv?.zone === "IDEAL_BUY_ZONE" ? "good" : fv?.zone === "ACCEPTABLE" ? "neutral" : "bad",
    fv ? `${ZONE_LABEL[fv.zone] || "—"} vs. real analyst fair value ($${fv.fairValue}).` : "No real analyst price-target coverage.");
  const futureDim = dimRead("Future Potential",
    (read.growthScore + read.moatScore) / 2 >= 65 ? "good" : (read.growthScore + read.moatScore) / 2 >= 40 ? "neutral" : "bad",
    `Growth ${read.growthScore ?? "—"}/100 · Moat Proxy ${read.moatScore ?? "—"}/100${read.sharesGrowth != null ? ` · shares ${read.sharesGrowth < 0 ? "shrinking (buybacks)" : "growing (dilution)"}` : ""}.`);
  const technicalDim = techLoading ? null : dimRead("Technical",
    tech ? (tech.actionable && !tech.extended ? "good" : tech.stage === 4 ? "bad" : "neutral") : "neutral",
    tech ? `Stage ${tech.stage ?? "—"} · RS ${tech.rsRating ?? "—"} · ${tech.actionable ? "actionable setup" : "not currently actionable"}.` : "Live technical read unavailable right now.");
  const marketDim = dimRead("Market",
    regime && regime.score >= 55 ? "good" : regime && regime.score >= 40 ? "neutral" : "bad",
    regime ? `Regime: ${regime.label} (${regime.score}/100).` : "Market regime unavailable.");

  const dims = [fundamentalDim, valuationDim, futureDim, technicalDim, marketDim].filter(Boolean);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, maxWidth: 480, width: "100%", maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.textDim }}>⊕ FUTURE/VALUE · DEEP SCAN</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textDim, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 12 }}>{symbol} <span style={{ fontSize: 14, color: C.textDim }}>${Number(read.price).toFixed(2)}</span></div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {dims.map((d) => (
            <div key={d.label} style={{ border: `1px solid ${d.color}44`, background: `${d.color}14`, borderRadius: 8, padding: 8 }}>
              <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 900, color: C.text }}>{d.icon} {d.label.toUpperCase()}</div>
              <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 3 }}>{d.reason}</div>
            </div>
          ))}
        </div>

        {fv && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, marginBottom: 14 }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.text, marginBottom: 6 }}>REAL ANALYST FAIR VALUE</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 3 }}>
              <span>Conservative</span><span style={{ color: C.text, fontWeight: 800 }}>${fv.conservative}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 3 }}>
              <span>Fair Value</span><span style={{ color: C.text, fontWeight: 800 }}>${fv.fairValue}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 3 }}>
              <span>Bull Case</span><span style={{ color: C.text, fontWeight: 800 }}>${fv.bull}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, color: C.textDim }}>
              <span>Max Price To Pay</span><span style={{ color: "#d6a312", fontWeight: 900 }}>${fv.maxPriceToPay}</span>
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", padding: "14px 0", borderRadius: 10, background: `${verdict.color}14`, border: `1px solid ${verdict.color}55` }}>
          <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: verdict.color }}>{verdict.action}</div>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginTop: 4, padding: "0 16px" }}>{verdict.reason}</div>
        </div>
      </div>
    </div>
  );
}

export default function RhFutureValueTab({ C, MONO, SANS, macroData }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deepScanSymbol, setDeepScanSymbol] = useState(null);

  const load = () => {
    setLoading(true); setError(null);
    fetch("/api/scanner/future-value")
      .then((r) => r.json())
      .then((j) => { if (!j.ok) { setError(j.error || "Scan failed."); setData(null); } else setData(j); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const allRows = data ? [...data.future, ...data.undervalued, ...data.overlap] : [];
  const findRead = (sym) => allRows.find((r) => r.symbol === sym);

  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>🚀💎 FUTURE / UNDERVALUED</div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>
          {data ? `${data.scanned} real stocks scored` : loading ? "scanning…" : ""}
        </div>
        <button onClick={load} disabled={loading} style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: "none", color: "#fff", background: loading ? C.textDim : C.accent, cursor: "pointer" }}>{loading ? "⏳…" : "↻ REFRESH"}</button>
      </div>

      {error && <div style={{ fontFamily: SANS, fontSize: 12, color: "#c8282a", marginBottom: 12 }}>{error} — this needs an FMP API key configured on the server.</div>}
      {!error && !loading && data && !allRows.length && (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No real fundamentals data scored yet — try Refresh.</div>
      )}

      {data && (
        <>
          <Section C={C} MONO={MONO} SANS={SANS} icon="🏆" title="FUTURE + UNDERVALUED" desc="Great real business AND a real attractive price — the highest-priority list." rows={data.overlap} kind="future" onDeepScan={setDeepScanSymbol} />
          <Section C={C} MONO={MONO} SANS={SANS} icon="🚀" title="FUTURE STOCKS" desc="Real durable growth + moat + financial strength — regardless of today's price." rows={data.future} kind="future" onDeepScan={setDeepScanSymbol} />
          <Section C={C} MONO={MONO} SANS={SANS} icon="💎" title="UNDERVALUED STOCKS" desc="Cheap relative to real fundamentals — priced below real analyst fair value." rows={data.undervalued} kind="undervalued" onDeepScan={setDeepScanSymbol} />
        </>
      )}

      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>
        Every score here comes from real fundamentals (FMP) — no invented valuation model. Detailed reasoning lives inside Deep Scan.
      </div>
      {/* Bottom safety margin (2026-08-11) — same real risk already found
          and fixed on the Scanner tab: the fixed-position FAB cluster
          hovers over the bottom ~90px of every mobile viewport regardless
          of scroll position, and a card's DEEP SCAN button can otherwise
          land right underneath it at a natural scroll-stop. */}
      <div style={{ height: 90 }} />

      {deepScanSymbol && (
        <DeepScanModal C={C} MONO={MONO} SANS={SANS} symbol={deepScanSymbol} read={findRead(deepScanSymbol)} macroData={macroData} onClose={() => setDeepScanSymbol(null)} />
      )}
    </div>
  );
}
