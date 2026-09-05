import { useEffect, useState } from "react";
import { sectionLabelStyle, cardStyle } from "./ui-atoms.jsx";

// UnifiedAutopilotPanel — Unified Autopilot merge, Stage 10 (see
// .claude/plans/proud-yawning-unicorn.md). Before this, the real merge
// work (Stages 2-8: one shared risk gate, one shared state machine +
// transition log, one shared execution engine placing every real order
// on the Alpaca account, one boot-time broker reconciliation) had NO
// visible surface anywhere in the app — every bit of it only showed up
// via a raw API call. This is that surface: what's actually unified now
// (server-autopilot.js + lightbox-autopilot-execute.js sharing one
// execution path), what each real order attempt did, and whether the
// last boot-time reconciliation found anything.
//
// Deliberately separate from AutopilotPanel.jsx ("LB ASSIST" — Light
// Box's own manual preview/confirm feature) and Autopilot2Tab.jsx (the
// dedicated simulated-ledger system) — this panel is about the shared
// EXECUTION PLUMBING those two real Alpaca-account systems now have in
// common, not a third trading feature of its own. Read-only: no control
// surface here places, cancels, or approves anything.
const POLL_MS = 20000;

const STATE_COLOR = (C, state) => {
  if (state === "FILLED" || state === "POSITION_OPEN" || state === "CLOSED") return C.green;
  if (["REJECTED", "FAILED", "KILLED_BY_RISK", "KILLED_BY_THESIS", "EXPIRED", "CANCELLED"].includes(state)) return C.red;
  if (["ORDER_PENDING", "PARTIALLY_FILLED", "WAITING_FOR_ENTRY", "EXIT_PENDING"].includes(state)) return C.amber;
  return C.textDim; // RECEIVED / VALIDATING / RISK_APPROVED / MANAGING_POSITION
};

const SOURCE_LABEL = { "server-autopilot": "SERVER", "lightbox-assist": "LB ASSIST" };

export default function UnifiedAutopilotPanel({ C, MONO, SANS }) {
  const [orders, setOrders] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [mutators, setMutators] = useState(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const [orderLogR, reconR, healthR] = await Promise.all([
          fetch("/api/autopilot/order-log?window=30"),
          fetch("/api/autopilot/reconciliation"),
          fetch("/api/health"),
        ]);
        const [orderLogJ, reconJ, healthJ] = await Promise.all([orderLogR.json(), reconR.json(), healthR.json()]);
        if (!alive) return;
        if (orderLogJ.ok) setOrders(orderLogJ.orders);
        if (reconJ.ok) setReconciliation(reconJ);
        if (healthJ.ok) setMutators(healthJ.execution?.activeMutators || []);
      } catch {}
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!orders) return null;

  const recent = [...orders].reverse(); // newest first — the store appends oldest-first

  return (
    <div style={cardStyle({ marginBottom: 14 })}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text }}>🔗 UNIFIED AUTOPILOT</span>
          <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: C.textDim }}>
            {(mutators || []).length ? mutators.join(" + ") : "no automated path active"}
          </span>
        </div>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
        Server Autopilot and Light Box Assist place every real order through one shared execution path — one risk gate,
        one per-symbol lock, one transition log. This is that log, not a third trading system of its own.
      </div>

      {reconciliation && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 10.5 }}>
          {reconciliation.ran === null && <span style={{ color: C.textDim }}>Boot reconciliation: not yet run this deploy.</span>}
          {reconciliation.ran === false && <span style={{ color: C.amber }}>⚠ Boot reconciliation skipped — {reconciliation.reason}</span>}
          {reconciliation.ran === true && reconciliation.checked === 0 && (
            <span style={{ color: C.green }}>✓ Boot reconciliation: no orders left stuck mid-flight by the last restart.</span>
          )}
          {reconciliation.ran === true && reconciliation.checked > 0 && (
            <span style={{ color: C.text }}>
              Boot reconciliation: {reconciliation.checked} order(s) found mid-flight from the last restart, resolved against real broker state — {reconciliation.resolved.map((r) => `${r.symbol}→${r.to}`).join(", ")}.
            </span>
          )}
        </div>
      )}

      <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
        <div style={sectionLabelStyle({ marginBottom: 6 })}>
          RECENT ORDER ATTEMPTS (BOTH SYSTEMS, ONE LOG)
        </div>
        {!recent.length && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>No order attempts recorded yet.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
          {recent.slice(0, 15).map((r) => {
            const last = r.history?.[r.history.length - 1];
            return (
              <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: MONO, fontSize: 10.5 }}>
                <span style={{ color: C.textDim, minWidth: 62 }}>{new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span style={{ color: C.textSec, fontSize: 9.5, fontWeight: 800, minWidth: 60 }}>{SOURCE_LABEL[r.source] || r.source}</span>
                <span style={{ color: C.text, fontWeight: 700, minWidth: 56 }}>{r.symbol}</span>
                <span style={{ color: STATE_COLOR(C, r.currentState), fontWeight: 800 }}>{r.currentState}</span>
                {last?.reason && <span style={{ color: C.textDim, fontFamily: SANS, fontSize: 10 }}>{last.reason}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
