import React, { useEffect, useState } from "react";

// Trade GPS (2026-09-03) — the spec's own "3-second primary card": one
// real action, one real structure, one real score, one real trade plan.
// Pure presentational read of the SAME canonical pipeline result every
// other Trade Desk surface already reads (via decision-store.js's shared
// cache) — never recomputes a verdict, score, or price itself.

const VERDICT_LABEL = {
  BUY_STOCK: "BUY STOCK", BUY_CALL: "BUY CALL", BUY_PUT: "BUY PUT",
  BUY_CALL_SPREAD: "BUY CALL SPREAD", BUY_PUT_SPREAD: "BUY PUT SPREAD",
  WAIT: "WAIT", EXIT: "EXIT", NO_TRADE: "NO TRADE",
};

function verdictColor(verdict, C) {
  if (!verdict) return C.textDim;
  if (verdict.startsWith("BUY_")) return C.green;
  if (verdict === "EXIT") return C.red;
  if (verdict === "NO_TRADE") return C.textDim;
  return C.amber; // WAIT
}

function thesisLight(warningLevel, C) {
  if (warningLevel === "HIGH") return { color: C.red, label: "BLOCKED" };
  if (warningLevel === "CAUTION") return { color: C.amber, label: "CAUTION" };
  return { color: C.green, label: "CLEAR" };
}

function money(v) {
  return Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—";
}

// A live, self-contained countdown — recomputes every 30s so a viewer who
// leaves the tab open sees a real, decaying window, never a frozen number.
function useCountdown(expiresAtMs) {
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    if (!Number.isFinite(expiresAtMs)) return;
    const iv = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, [expiresAtMs]);
  if (!Number.isFinite(expiresAtMs)) return null;
  const remainMs = expiresAtMs - nowMs;
  if (remainMs <= 0) return "expired";
  const mins = Math.floor(remainMs / 60_000);
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

export default function TradeGpsCard({
  symbol, decision, tradeGps, tradeStructure, trapShield, marketAgreement, tradeGpsVerdict,
  loading, C, MONO, SANS,
}) {
  const verdict = tradeGpsVerdict?.verdict || null;
  const label = loading ? "LOADING…" : (VERDICT_LABEL[verdict] || "—");
  const color = verdictColor(verdict, C);
  const structure = tradeGpsVerdict?.structure || tradeStructure?.structure || null;
  const light = thesisLight(trapShield?.warningLevel, C);
  const countdown = useCountdown(decision?.signalExpiresAt);

  const entry = decision?.entry;
  const stop = decision?.stop;
  const targets = decision?.targets || [];
  const rr = decision?.riskReward;
  const invalidation = decision?.invalidation;
  const stopDistance = Number.isFinite(entry) && Number.isFinite(stop) ? Math.abs(entry - stop) : null;
  const maxLoss = Number.isFinite(tradeStructure?.maxLoss) ? tradeStructure.maxLoss : null;

  const agreementText = Number.isFinite(marketAgreement?.count) && Number.isFinite(marketAgreement?.total) && marketAgreement.total > 0
    ? `${marketAgreement.count} of ${marketAgreement.total} factors aligned`
    : "—";

  return (
    <section aria-label="Trade GPS primary opportunity" style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 14, padding: "12px 14px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ minWidth: 190, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: C.textDim }}>TRADE GPS · PAPER ONLY</div>
        <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 900, color, lineHeight: 1.15 }}>{label}</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textSec, marginTop: 2 }}>
          {symbol || "—"}{structure ? ` · ${structure.replace(/_/g, " ")}` : ""}
        </div>
      </div>

      <Metric label="SCORE" value={Number.isFinite(tradeGps?.score) ? tradeGps.score : "—"} sub={tradeGps?.band || null} C={C} MONO={MONO} />
      <Metric label="CONFIDENCE" value={Number.isFinite(decision?.confidence) ? `${decision.confidence}%` : "—"} C={C} MONO={MONO} />
      <Metric label="ENTRY" value={money(entry)} C={C} MONO={MONO} />
      <Metric label="STOP" value={money(stop)} danger C={C} MONO={MONO} />
      <Metric label="TARGETS" value={targets.length ? targets.filter(Number.isFinite).map((t) => money(t)).join(" · ") : "—"} C={C} MONO={MONO} />
      <Metric label="R:R" value={Number.isFinite(rr) ? `${rr.toFixed(1)}R` : "—"} C={C} MONO={MONO} />
      <Metric label="MAX LOSS" value={maxLoss != null ? money(maxLoss) : (stopDistance != null ? `${money(stopDistance)}/sh` : "—")} danger C={C} MONO={MONO} />
      <Metric label="INVALIDATION" value={money(invalidation)} C={C} MONO={MONO} />
      <Metric label="EXPIRES" value={countdown || "—"} C={C} MONO={MONO} />
      <Metric label="AGREEMENT" value={agreementText} C={C} MONO={MONO} />
      <div style={{ minWidth: 90, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: 0.6 }}>THESIS</div>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: light.color, margin: "4px 0" }} />
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: light.color }}>{light.label}</div>
      </div>

      <div style={{ flex: 1, minWidth: 200, fontFamily: SANS, fontSize: 11.5, color: C.textSec, display: "flex", alignItems: "center" }}>
        {tradeGpsVerdict?.reasonOneLine || (loading ? "Reading the canonical decision…" : "No real explanation available yet.")}
      </div>
    </section>
  );
}

function Metric({ label, value, sub, danger, C, MONO }) {
  return (
    <div style={{ minWidth: 84 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: danger ? C.red : C.text }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{sub}</div>}
    </div>
  );
}
