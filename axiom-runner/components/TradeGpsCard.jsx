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

// Real, hand-ported mirror of autopilot2-engine.js's sizeEntry — same
// documented real defaults (0.5% risk/trade, $500 max real risk/trade,
// 20% max name concentration), same real formula. A genuine "here's what
// Autopilot 2.0 would actually place" preview, not a fabricated number —
// same "pure math, zero server-only dependencies, keep in sync" pattern
// this codebase already uses for red-flag-engine.js's client twin. Reads
// real equity/cash from Autopilot 2.0's own live status (already fetched
// by the parent, no new network call) — returns null (not 0) when no
// real account data is available yet, so a genuinely-zero-qty result is
// never confused with "we don't know."
function previewPositionSize({ equity, cash, entry, stop, direction = "LONG", riskPct = 0.5, maxTradeRiskDollars = 500, maxNamePct = 20 }) {
  if (!Number.isFinite(equity) || !Number.isFinite(cash) || !Number.isFinite(entry) || !Number.isFinite(stop)) return null;
  const isShort = direction === "SHORT";
  const stopValid = isShort ? stop > 0 && stop > entry : stop > 0 && entry > stop;
  if (!(entry > 0) || !stopValid) return null;
  const riskPerShare = isShort ? stop - entry : entry - stop;
  if (!(riskPerShare > 0)) return null;
  let qty = Math.floor((equity * (riskPct / 100)) / riskPerShare);
  qty = Math.min(qty, Math.floor(cash / entry));
  qty = Math.min(qty, Math.floor((equity * (maxNamePct / 100)) / entry));
  qty = Math.min(qty, Math.floor(maxTradeRiskDollars / riskPerShare));
  return Math.max(0, qty);
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
  dangerEvent, whyNow, account, loading, C, MONO, SANS,
}) {
  const verdict = tradeGpsVerdict?.verdict || null;
  const label = loading ? "LOADING…" : (VERDICT_LABEL[verdict] || "—");
  const color = verdictColor(verdict, C);
  const structure = tradeGpsVerdict?.structure || tradeStructure?.structure || null;
  const light = thesisLight(trapShield?.warningLevel, C);
  const countdown = useCountdown(decision?.signalExpiresAt);
  const dangerCountdown = useCountdown(dangerEvent?.atMs);

  const entry = decision?.entry;
  const stop = decision?.stop;
  const targets = decision?.targets || [];
  const rr = decision?.riskReward;
  const invalidation = decision?.invalidation;
  const stopDistance = Number.isFinite(entry) && Number.isFinite(stop) ? Math.abs(entry - stop) : null;
  const maxLoss = Number.isFinite(tradeStructure?.maxLoss) ? tradeStructure.maxLoss : null;
  const hasLevels = Number.isFinite(entry) && Number.isFinite(stop);
  const direction = hasLevels && stop > entry ? "SHORT" : "LONG";
  // Direction was already computed above but never rendered anywhere on
  // this card (2026-09-04, Phase 0 audit's five-second-test finding) —
  // a viewer had to infer LONG/SHORT from whether the stop sat above or
  // below entry. Only shown once real entry/stop levels exist — never
  // defaults to displaying "LONG" for a symbol with no real decision yet.
  const directionLabel = hasLevels ? direction : null;

  const agreementText = Number.isFinite(marketAgreement?.count) && Number.isFinite(marketAgreement?.total) && marketAgreement.total > 0
    ? `${marketAgreement.count} of ${marketAgreement.total} factors aligned`
    : "—";

  // Confirmation trigger — signal-lifecycle.js's own real ARMED/ENTER_NOW
  // distinction: ARMED means a real reference entry exists but the real
  // executable trigger hasn't printed yet (entry itself IS that trigger
  // price); ENTER_NOW means it already has. Never a second signal read.
  const confirmationText = decision?.signalState === "ENTER_NOW" ? "Confirmed — live now"
    : decision?.signalState === "ARMED" && Number.isFinite(entry) ? `Hold ${direction === "SHORT" ? "below" : "above"} ${money(entry)}`
    : "—";

  const positionSize = previewPositionSize({ equity: account?.equity, cash: account?.cash, entry, stop, direction });

  const dangerText = dangerEvent ? `${dangerEvent.label} ${dangerCountdown || ""}`.trim() : null;

  // Send-to-Quick-Trade handoff (2026-09-03, Phase 0 audit finding: this
  // exact real "open-quick-trade" event + shares/stopLoss/takeProfit
  // handoff already exists in CortexMiniPanel.jsx, MarketTerminalTab.jsx,
  // TradePlannerTab.jsx, and CommandSearchPanel.jsx — Trade GPS's own
  // card, the ONE place meant to be Trade Desk's single primary plan, was
  // the one surface missing it. Without this, a user reading this card's
  // real entry/stop/target had no way to carry those exact numbers into
  // Quick Trade — they'd retype them by hand into a separately-computed
  // panel, or submit against whatever QuickTradePanel derived on its own,
  // silently diverging from the plan they just read. Reuses this card's
  // OWN already-computed positionSize (the real, hand-ported sizeEntry
  // mirror above) as `shares` — a stronger real number than the simpler
  // localStorage-risk-% formula the other call sites use. STOCK only:
  // QuickTradePanel's own order path is real-shares/equity only, no
  // options order route exists there, so this is never offered for a
  // CALL/PUT/spread structure it couldn't actually carry out.
  const firstTarget = targets.find(Number.isFinite);
  const canSendToQuickTrade = verdict === "BUY_STOCK" && Number.isFinite(entry) && Number.isFinite(stop)
    && Number.isFinite(firstTarget) && Number.isFinite(positionSize) && positionSize > 0;

  return (
    <section aria-label="Trade GPS primary opportunity" style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 14, padding: "12px 14px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ minWidth: 190, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: C.textDim }}>TRADE GPS · PAPER ONLY</div>
        <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 900, color, lineHeight: 1.15 }}>{label}</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textSec, marginTop: 2 }}>
          {symbol || "—"}{directionLabel ? ` · ${directionLabel}` : ""}{structure ? ` · ${structure.replace(/_/g, " ")}` : ""}
        </div>
      </div>

      <Metric label="SCORE" value={Number.isFinite(tradeGps?.score) ? tradeGps.score : "—"} sub={tradeGps?.band || null} C={C} MONO={MONO} />
      <Metric label="CONFIDENCE" value={Number.isFinite(decision?.confidence) ? `${decision.confidence}%` : "—"} C={C} MONO={MONO} />
      <Metric label="ENTRY" value={money(entry)} C={C} MONO={MONO} />
      <Metric label="CONFIRMATION" value={confirmationText} C={C} MONO={MONO} />
      <Metric label="STOP" value={money(stop)} danger C={C} MONO={MONO} />
      <Metric label="TARGETS" value={targets.length ? targets.filter(Number.isFinite).map((t) => money(t)).join(" · ") : "—"} C={C} MONO={MONO} />
      <Metric label="R:R" value={Number.isFinite(rr) ? `${rr.toFixed(1)}R` : "—"} C={C} MONO={MONO} />
      <Metric label="SIZE" value={positionSize != null ? `${positionSize} ${structure === "STOCK" || !structure ? "sh" : "ct"}` : "—"} sub={positionSize != null ? "preview" : null} C={C} MONO={MONO} />
      <Metric label="MAX LOSS" value={maxLoss != null ? money(maxLoss) : (stopDistance != null ? `${money(stopDistance)}/sh` : "—")} danger C={C} MONO={MONO} />
      <Metric label="INVALIDATION" value={money(invalidation)} C={C} MONO={MONO} />
      <Metric label="EXPIRES" value={countdown || "—"} C={C} MONO={MONO} />
      <Metric label="AGREEMENT" value={agreementText} C={C} MONO={MONO} />
      {dangerText && <Metric label="DANGER" value={dangerText} danger C={C} MONO={MONO} />}
      <div style={{ minWidth: 90, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: 0.6 }}>THESIS</div>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: light.color, margin: "4px 0" }} />
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: light.color }}>{light.label}</div>
      </div>

      {canSendToQuickTrade && (
        <div style={{ display: "flex", alignItems: "center" }}>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-quick-trade", { detail: { symbol, shares: positionSize, stopLoss: stop, takeProfit: firstTarget } }))}
            title="Prefills Quick Trade with this exact entry, stop, target, and size — still requires your own confirm/submit."
            style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, padding: "9px 12px", borderRadius: 7, border: "none", background: color, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            SEND TO QUICK TRADE
          </button>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 200, fontFamily: SANS, fontSize: 11.5, color: C.textSec, display: "flex", alignItems: "center" }}>
        {whyNow?.primary?.label && <span style={{ color: C.text, fontWeight: 700, marginRight: 5 }}>Why now: {whyNow.primary.label}.</span>}
        {tradeGpsVerdict?.reasonOneLine || (loading ? "Reading the canonical decision…" : (whyNow?.primary ? null : "No real explanation available yet."))}
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
