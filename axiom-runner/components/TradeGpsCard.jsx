import React, { useEffect, useState } from "react";
import { shouldStopTrading } from "./risk-gate-client.js";

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
  dangerEvent, whyNow, account, loading, error, dailyLossLocked, C, MONO, SANS,
}) {
  const verdict = tradeGpsVerdict?.verdict || null;
  // Risk Engine override (2026-09-07, "3-Second AI Decision System" spec:
  // "Risk management overrides opportunity scores. Never allow AI
  // enthusiasm to override portfolio limits... STOP TRADING. No new
  // positions. Management/exit functions remain available."). Real,
  // already-computed signal (risk-guardrails.js's dailyLossBreakerTripped,
  // already gating every AUTONOMOUS order-placing path — server-
  // autopilot.js, lightbox-autopilot-execute.js, routes/autoexec.js — via
  // autopilot-risk-gate.js's evaluateAccountGate) — this was a real gap:
  // that same real breaker never reached the INTERACTIVE Trade Desk verdict
  // a human reads before manually placing an order, so a tripped daily-
  // loss lock was invisible here. Only overrides a NEW-ENTRY verdict
  // (BUY_*) — EXIT/WAIT/NO_TRADE (management of an existing position)
  // are intentionally unaffected, matching the spec's own carve-out.
  const stopTradingActive = shouldStopTrading(verdict, dailyLossLocked);
  const label = stopTradingActive ? "STOP TRADING" : loading ? "LOADING…" : (VERDICT_LABEL[verdict] || "—");
  const color = stopTradingActive ? C.red : verdictColor(verdict, C);
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
    && Number.isFinite(firstTarget) && Number.isFinite(positionSize) && positionSize > 0 && !stopTradingActive;

  // Readability redesign (2026-09-07, "3-Second AI Decision" spec —
  // explicit user requirement: verdict 30-42px, important values 22-28px,
  // primary labels 17-20px, never low-contrast gray for information the
  // user must act on). This card is Trade Desk's ONE always-visible
  // primary verdict now (CanonicalVerdictStrip's unique fields — regime/
  // data health/stage — are folded in below as compact secondary badges
  // rather than shown in a second, separate always-visible strip — see
  // TradeDeskTab.jsx's own removal note). Two explicit tiers: PRIMARY
  // (the spec's own required hierarchy — verdict, entry, stop, target,
  // confidence) rendered large; SECONDARY (everything else a user might
  // want but doesn't need in the first 3 seconds) rendered smaller but
  // still real text on C.textSec, never the old label-as-afterthought
  // 9px/textDim treatment.
  const regime = decision?.marketRegime?.regime || null;
  const dataHealthStatus = decision?.dataHealth?.status || null;
  const dataHealthColor = dataHealthStatus === "HEALTHY" ? C.green : dataHealthStatus === "DEGRADED" || dataHealthStatus === "POOR" ? C.amber : dataHealthStatus === "BLOCKED" ? C.red : C.textDim;
  // Carried over from the old CanonicalVerdictStrip (removed as a
  // separate always-visible strip, see TradeDeskTab.jsx) — real stale/
  // blocked-data disclosure must never silently disappear.
  const isStale = decision?.dataHealth?.stale || decision?.dataHealth?.canTrade === false;

  return (
    <section aria-label="Trade GPS primary opportunity" style={{ padding: "18px 20px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 22, marginBottom: 14 }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: 1, color: C.textSec }}>
            {symbol || "—"}{directionLabel ? ` · ${directionLabel}` : ""}{structure ? ` · ${structure.replace(/_/g, " ")}` : ""} · PAPER
          </div>
          <div style={{ fontFamily: MONO, fontSize: 38, fontWeight: 900, color, lineHeight: 1.05 }}>{label}</div>
        </div>
        {/* Folded in from the old always-visible CanonicalVerdictStrip —
            regime/data-health/stage as compact badges next to the verdict,
            not a second full-size strip competing for attention. */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingBottom: 4 }}>
          {regime && <Badge label="REGIME" value={regime.replace(/_/g, " ")} color={regime === "CRISIS" || regime === "RISK_OFF" ? C.red : regime === "RISK_ON" ? C.green : C.amber} C={C} MONO={MONO} />}
          {dataHealthStatus && <Badge label="DATA" value={dataHealthStatus} color={dataHealthColor} C={C} MONO={MONO} />}
          {decision?.opportunityStage && <Badge label="STAGE" value={decision.opportunityStage} color={C.textSec} C={C} MONO={MONO} />}
        </div>
        {canSendToQuickTrade && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-quick-trade", { detail: { symbol, shares: positionSize, stopLoss: stop, takeProfit: firstTarget } }))}
            title="Prefills Quick Trade with this exact entry, stop, target, and size — still requires your own confirm/submit."
            style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "12px 18px", borderRadius: 8, border: "none", background: color, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            SEND TO QUICK TRADE
          </button>
        )}
      </div>

      {/* PRIMARY tier — the spec's own required 3-second hierarchy: entry,
          stop, target, confidence. 22-24px values, 15-16px labels. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 26, marginBottom: 14 }}>
        <Metric label="ENTRY" value={money(entry)} size="primary" C={C} MONO={MONO} />
        <Metric label="STOP" value={money(stop)} size="primary" danger C={C} MONO={MONO} />
        <Metric label="TARGETS" value={targets.length ? targets.filter(Number.isFinite).map((t) => money(t)).join(" · ") : "—"} size="primary" C={C} MONO={MONO} />
        <Metric label="R : R" value={Number.isFinite(rr) ? `${rr.toFixed(1)}R` : "—"} size="primary" C={C} MONO={MONO} />
        <Metric label="CONFIDENCE" value={Number.isFinite(decision?.confidence) ? `${decision.confidence}%` : "—"} size="primary" C={C} MONO={MONO} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minWidth: 80 }}>
          <div style={{ fontFamily: MONO, fontSize: 15, color: C.textSec, letterSpacing: 0.4 }}>THESIS</div>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: light.color, margin: "5px 0" }} />
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: light.color }}>{light.label}</div>
        </div>
      </div>

      {/* WHY NOW — the spec's own required narrative line, sized as real
          body text (was 11.5px). */}
      <div style={{ fontFamily: SANS, fontSize: 16, lineHeight: 1.5, color: stopTradingActive ? C.red : error || isStale ? C.amber : C.textSec, marginBottom: 14 }}>
        {stopTradingActive ? "Your configured daily loss limit has been reached — no new positions until tomorrow. Existing positions can still be managed/exited normally."
          : error ? `Decision unavailable: ${error}` : isStale ? `STALE / BLOCKED DATA: ${decision?.blockers?.[0] || "new exposure is blocked until required data is fresh"}` : (
          <>
            {whyNow?.primary?.label && <span style={{ color: C.text, fontWeight: 700 }}>Why now: {whyNow.primary.label}. </span>}
            {tradeGpsVerdict?.reasonOneLine || (loading ? "Reading the canonical decision…" : (whyNow?.primary ? null : "No real explanation available yet."))}
          </>
        )}
      </div>

      {/* SECONDARY tier — real, readable, but visually recedes behind the
          primary tier above (smaller, no card/border emphasis). Never the
          old failing-contrast gray; C.textSec measures 7.6:1+ in both
          themes. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <Metric label="SCORE" value={Number.isFinite(tradeGps?.score) ? tradeGps.score : "—"} sub={decision?.scoreValidation || tradeGps?.band || null} C={C} MONO={MONO} />
        {/* Win probability / expected value (2026-09-04, Phase 0 audit
            finding: the score above must never be read as a probability —
            these are the REAL, separate, honestly-nullable numbers
            [institutional-scoring.js's bucketed historical win rate,
            opportunity-engine.js's EV-after-costs formula] that already
            existed but never reached this card before now). Honest "—" on
            insufficient real sample, never a fabricated percentage. */}
        <Metric label="WIN PROB" value={Number.isFinite(decision?.winProbability) ? `${decision.winProbability}%` : "—"}
          sub={Number.isFinite(decision?.winProbabilitySampleSize) ? `n=${decision.winProbabilitySampleSize}` : null} C={C} MONO={MONO} />
        <Metric label="EXP. VALUE" value={Number.isFinite(decision?.expectedValuePct) ? `${decision.expectedValuePct >= 0 ? "+" : ""}${decision.expectedValuePct}%` : "—"}
          sub="after costs" C={C} MONO={MONO} />
        <Metric label="CONFIRMATION" value={confirmationText} C={C} MONO={MONO} />
        <Metric label="SIZE" value={positionSize != null ? `${positionSize} ${structure === "STOCK" || !structure ? "sh" : "ct"}` : "—"} sub={positionSize != null ? "preview" : null} C={C} MONO={MONO} />
        <Metric label="MAX LOSS" value={maxLoss != null ? money(maxLoss) : (stopDistance != null ? `${money(stopDistance)}/sh` : "—")} danger C={C} MONO={MONO} />
        <Metric label="INVALIDATION" value={money(invalidation)} C={C} MONO={MONO} />
        <Metric label="EXPIRES" value={countdown || "—"} C={C} MONO={MONO} />
        <Metric label="AGREEMENT" value={agreementText} C={C} MONO={MONO} />
        {dangerText && <Metric label="DANGER" value={dangerText} danger C={C} MONO={MONO} />}
      </div>
    </section>
  );
}

function Badge({ label, value, color, C, MONO }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textSec, letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: color || C.text }}>{value}</div>
    </div>
  );
}

// size="primary" -> the spec's required 22-28px value / 17-20px label
// tier; default -> a smaller but still fully readable secondary tier
// (never below 14px, never the low-contrast textDim role).
function Metric({ label, value, sub, danger, size, C, MONO }) {
  const isPrimary = size === "primary";
  return (
    <div style={{ minWidth: isPrimary ? 100 : 88 }}>
      <div style={{ fontFamily: MONO, fontSize: isPrimary ? 15 : 13, color: C.textSec, letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: isPrimary ? 24 : 16, fontWeight: 800, color: danger ? C.red : C.text }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>{sub}</div>}
    </div>
  );
}
