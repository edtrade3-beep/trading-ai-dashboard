import { useState, useEffect, useCallback } from "react";

// ADOL22 Autopilot 2.0 — Command Center. A real internal $100k simulated
// paper account (src/autopilot2-account.js) run by a real autonomous
// scan->enter->manage->exit loop (src/autopilot2-engine.js) — never a
// real order, never Alpaca. Stocks + long calls today (0.60-0.85 delta,
// via src/autopilot2-expression.js); puts, spreads, and crypto are real,
// disclosed gaps, not silently missing (Autopilot goal audit, 2026-08-30).
//
// Deliberately no manual Buy/Sell anywhere on this page (spec §31) — the
// only controls are the 5 the spec lists. This is a monitoring surface,
// not a trading console.
const STATE_META = {
  OFF: { icon: "⚪", color: "#8a94a6", label: "OFF" },
  RUNNING: { icon: "🟢", color: "#0d9465", label: "RUNNING" },
  PAUSED: { icon: "🟡", color: "#d6a312", label: "PAUSED" },
  SAFE_MODE: { icon: "🟠", color: "#e07b1a", label: "SAFE MODE" },
};

function fmtMoney(n) {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export default function Autopilot2Tab({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [missed, setMissed] = useState(null);

  const load = useCallback(() => {
    fetch("/api/autopilot2/status").then(r => r.json()).then(d => {
      if (d?.ok) { setData(d); setError(null); } else setError(d?.error || "status fetch failed");
    }).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // real refresh — same status the engine itself just updated on its own tick
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    fetch("/api/autopilot2/missed-opportunities").then(r => r.json()).then(setMissed).catch(() => setMissed(null));
  }, []);

  const runAction = async (path, body) => {
    setLoading(true);
    try {
      await fetch(`/api/autopilot2/${path}`, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      await load();
    } finally { setLoading(false); }
  };

  const doReset = async () => {
    if (!confirmingReset) { setConfirmingReset(true); return; }
    await runAction("reset", { confirm: true });
    setConfirmingReset(false);
  };

  // The app's one, real, SHARED kill switch (src/emergency-stop.js) — not
  // an Autopilot-2.0-only stop. Deliberately a direct fetch, not
  // runAction's /api/autopilot2/ prefix, since this is a different real
  // route every other autopilot in the app already honors too.
  const doEmergencyStop = async () => {
    if (!window.confirm("Real Emergency Stop — this halts EVERY autopilot in the app (Green Light, Light Box, and this one), cancels open real orders on the real broker, not just Autopilot 2.0. Continue?")) return;
    setLoading(true);
    try {
      await fetch("/api/emergency-stop/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "ADOL22 Autopilot 2.0 manual stop", activatedBy: "adol22-tab" }) });
      await load();
    } finally { setLoading(false); }
  };

  if (error && !data) {
    return (
      <div style={{ padding: "16px 20px", fontFamily: SANS, fontSize: 13, color: C.textDim }}>
        ⚠ Couldn't load Autopilot 2.0 status: {error}
      </div>
    );
  }
  if (!data) {
    return <div style={{ padding: "16px 20px", fontFamily: MONO, fontSize: 13, color: C.textDim }}>Loading ADOL22 Autopilot 2.0…</div>;
  }

  const state = data.state?.state || "OFF";
  const meta = STATE_META[state] || STATE_META.OFF;
  const acct = data.account || {};
  const best = data.bestOpportunity;

  const stat = (label, value, color) => (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 900, color: color || C.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header + top strip */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>🤖 ADOL22 AUTOPILOT 2.0</span>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: meta.color, background: `${meta.color}18`, border: `1px solid ${meta.color}55`, borderRadius: 999, padding: "3px 10px" }}>
            {meta.icon} {meta.label}
          </span>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 3 }}>
          A real internal $100,000 simulated paper account — stocks + long calls, no real orders ever. No puts, spreads, or crypto yet. {data.state?.reason ? `(${data.state.reason})` : ""}
        </div>
      </div>

      {/* How it trades — a plain-English brief, not marketing copy. Every
          step named here is a real function this engine actually calls,
          in this order, every tick (src/autopilot2-engine.js). */}
      <div style={{ padding: "12px 16px", background: `${C.accent}0a`, border: `1px solid ${C.accent}33`, borderRadius: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, letterSpacing: 0.5, marginBottom: 6 }}>HOW IT TRADES</div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>
          Every 5 minutes during market hours: <b>scans</b> the real scan universe through the platform's one canonical engine (am-core-engine.js) → <b>scores</b> and ranks real candidates by expected value, probability, and risk → <b>checks risk</b> (position/sector/portfolio-risk limits, daily/weekly/drawdown breakers — risk always wins, a blocked trade never fires) → <b>enters</b> the best real candidate as a stock or a long call, sized to the risk limit → <b>manages</b> every open position each tick (stop, trail, partial profit, or exit) using that same one verdict engine → <b>exits</b> on a hard stop, invalidated thesis, or (for calls) an approaching expiration. Trades that get skipped are logged with the real reason, and revisited later to see what actually happened (Missed Opportunities). Outside market hours, or with no real candidate that clears every gate, it correctly does nothing — an empty account isn't a bug, it's the risk rules working.
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, rowGap: 12, flexWrap: "wrap", padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        {stat("PAPER EQUITY", fmtMoney(acct.equity))}
        {stat("TODAY P&L", fmtMoney(acct.dailyPnl), acct.dailyPnl >= 0 ? C.green : C.red)}
        {stat("TOTAL P&L", fmtMoney(acct.totalPnl), acct.totalPnl >= 0 ? C.green : C.red)}
        {stat("OPEN POSITIONS", acct.openPositions?.length ?? 0)}
        {stat("PORTFOLIO HEAT", fmtPct(acct.portfolioHeatPct, 1))}
        {stat("DRAWDOWN", fmtPct(acct.drawdownPct, 1), acct.drawdownPct < -5 ? C.red : C.text)}
      </div>

      {/* Controls — exactly the spec §31 list, no manual buy/sell anywhere */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={loading || state === "RUNNING"} onClick={() => runAction("start")}
          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: "none", cursor: loading ? "default" : "pointer", background: C.green, color: "#fff", opacity: state === "RUNNING" ? 0.5 : 1 }}>
          ▶ AUTOPILOT ON
        </button>
        <button disabled={loading || state === "OFF"} onClick={() => runAction("off")}
          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, cursor: loading ? "default" : "pointer", background: C.surface, color: C.textSec }}>
          ⏻ AUTOPILOT OFF
        </button>
        {state === "RUNNING"
          ? <button disabled={loading} onClick={() => runAction("pause")}
              style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.amber}`, cursor: loading ? "default" : "pointer", background: `${C.amber}18`, color: C.amber }}>
              ⏸ PAUSE NEW TRADES
            </button>
          : <button disabled={loading || state === "OFF"} onClick={() => runAction("resume")}
              style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.green}`, cursor: loading ? "default" : "pointer", background: `${C.green}18`, color: C.green, opacity: state === "OFF" ? 0.5 : 1 }}>
              ▶ RESUME
            </button>}
        <button disabled={loading} onClick={doEmergencyStop}
          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, padding: "8px 16px", borderRadius: 8, border: "none", cursor: loading ? "default" : "pointer", background: C.red, color: "#fff" }}>
          🛑 EMERGENCY STOP
        </button>
        <button disabled={loading} onClick={doReset}
          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: `1px solid ${confirmingReset ? C.red : C.border}`, cursor: loading ? "default" : "pointer", background: confirmingReset ? `${C.red}18` : C.surface, color: confirmingReset ? C.red : C.textSec }}>
          {confirmingReset ? "⚠ CLICK AGAIN TO CONFIRM — WIPES TO $100K" : "↺ RESET PAPER ACCOUNT"}
        </button>
      </div>

      {/* Best opportunity */}
      <div style={{ padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>BEST OPPORTUNITY RIGHT NOW</div>
        {best ? (
          <div style={{ display: "flex", gap: 20, rowGap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
            <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.accent }}>{best.symbol}</span>
            {best.stage && (
              <span title="EARLY = just clearing entry criteria, before it's obvious. CONFIRMED = fully confirmed breakout/retest."
                style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                  color: best.stage === "EARLY" ? "#0d9465" : C.accent,
                  background: `${best.stage === "EARLY" ? "#0d9465" : C.accent}18`,
                  border: `1px solid ${best.stage === "EARLY" ? "#0d9465" : C.accent}55`, borderRadius: 4, padding: "2px 7px" }}>
                {best.stage}
              </span>
            )}
            {stat("TRADE QUALITY", best.score)}
            {stat("PROBABILITY", best.probability != null ? `${best.probability}%` : "insufficient data")}
            {stat("EXPECTED R", Number.isFinite(best.expectedValue) ? `${best.expectedValue >= 0 ? "+" : ""}${best.expectedValue}%` : "—")}
            {stat("CHASE RISK", best.chaseRisk || "—")}
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, flex: 1, minWidth: 200 }}>{best.verdictReason}</div>
          </div>
        ) : (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No real actionable candidate right now — honestly none, not hidden.</div>
        )}
      </div>

      {/* Open positions */}
      <div style={{ padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>OPEN POSITIONS</div>
        {acct.openPositions?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {acct.openPositions.map(p => (
              <div key={p.id} style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap", padding: "6px 0", borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, minWidth: 60 }}>{p.symbol}</span>
                {p.assetType === "CALL" ? (
                  <>
                    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, background: `${C.accent}18`, borderRadius: 4, padding: "1px 6px" }}>CALL</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>{p.qty} ct ${p.strike} strike @ ${p.entryPrice?.toFixed(2)}</span>
                  </>
                ) : (
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>{p.qty} sh @ ${p.entryPrice?.toFixed(2)}</span>
                )}
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: p.unrealizedPnl >= 0 ? C.green : C.red }}>{fmtMoney(p.unrealizedPnl)} ({fmtPct(p.unrealizedPnlPct)})</span>
                {p.assetType === "CALL" ? (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>exp {p.expiry}{Number.isFinite(p.dte) ? ` (${p.dte}d)` : ""}</span>
                ) : (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>stop ${p.stop?.toFixed(2)} · target ${p.target?.toFixed(2)}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No real open positions right now.</div>
        )}
      </div>

      {/* Activity feed */}
      <div style={{ padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>AUTOPILOT ACTIVITY</div>
        {data.activity?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
            {data.activity.map((a, i) => {
              const col = a.type === "ENTER" ? C.green : a.type === "REJECT" ? C.textDim : (a.type === "HARD_EXIT" || a.type === "SAFE_MODE") ? C.red : a.type === "EXIT" ? C.amber : C.accent;
              return (
                <div key={i} style={{ display: "flex", gap: 10, fontSize: 12, fontFamily: SANS, color: C.textSec, alignItems: "baseline" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, minWidth: 48 }}>{new Date(a.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: col, minWidth: 70 }}>{a.type}</span>
                  {a.symbol && <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>{a.symbol}</span>}
                  <span>{a.reason}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No activity logged yet.</div>
        )}
      </div>

      {/* Missed opportunities — real forward-outcome tracking for candidates
          this engine detected but did NOT enter (risk/sizing gates). See
          src/missed-opportunity-tracker.js. Observability only — never
          feeds back into the entry decision. */}
      <div style={{ padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>MISSED OPPORTUNITIES — WHAT SKIPPED TRADES DID AFTERWARD</div>
        {missed?.available ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>
              {missed.resolvedCount} of {missed.totalRecordsChecked} rejected candidates from {missed.daysAgo}+ real days ago, checked against today's real price:
            </div>
            {Object.entries(missed.categories || {}).map(([cat, d]) => (
              <div key={cat} style={{ display: "flex", gap: 12, alignItems: "baseline", fontFamily: MONO, fontSize: 11 }}>
                <span style={{ color: C.textDim, minWidth: 140 }}>{cat}</span>
                <span style={{ color: C.text }}>{d.count} skipped</span>
                <span style={{ color: d.avgForwardReturnPct >= 0 ? C.green : C.red }}>{fmtPct(d.avgForwardReturnPct)} avg</span>
                <span style={{ color: C.textDim }}>{d.wouldHaveGainedRate}% would have gained</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{missed?.reason || "Loading…"}</div>
        )}
      </div>

      {/* System status */}
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span>MARKET SCANNING</span><span>·</span><span>RISK MONITORING</span><span>·</span><span>POSITION MANAGEMENT</span>
        {acct.stalePricing?.length > 0 && <span style={{ color: C.amber }}>· ⚠ stale pricing: {acct.stalePricing.join(", ")}</span>}
      </div>
    </div>
  );
}
