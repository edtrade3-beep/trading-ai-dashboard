import { useState, useEffect } from "react";

// Bottom status bar — self-contained, own periodic health check (matches the
// self-contained-widget pattern already used elsewhere in this app, e.g.
// RealityCheckWidget). Height is an authored constant (STATUS_BAR_H below),
// not intrinsic wrapping content, so — like the Sidebar — it doesn't need the
// Top Bar's ResizeObserver treatment, just a matching bottom padding on the
// page content.
export const STATUS_BAR_H = 40;

export default function StatusBar({ C, MONO, sidebarWidth, isMobile, rootRef }) {
  const [health, setHealth] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | error
  // Emergency Stop (2026-08-24, Execution Bot Architecture Audit Phase 1)
  // — the one real, global kill switch, surfaced here because StatusBar is
  // the one component visible on every page regardless of which tab is
  // open, matching the "IS IT SAFE?" top-level question this control needs
  // to answer at a glance from anywhere in the app.
  const [estop, setEstop] = useState(null);
  const [estopBusy, setEstopBusy] = useState(false);

  useEffect(() => {
    const load = () => {
      const t0 = performance.now();
      fetch("/api/health").then(r => r.ok ? r.json() : Promise.reject())
        .then(d => { setLatencyMs(Math.round(performance.now() - t0)); setHealth(d); setState("ok"); })
        .catch(() => setState("error"));
    };
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const loadEstop = () => fetch("/api/emergency-stop/status").then(r => r.json()).then(d => { if (d?.ok) setEstop(d); }).catch(() => {});
    loadEstop();
    const id = setInterval(loadEstop, 15000);
    return () => clearInterval(id);
  }, []);

  const activateEstop = async () => {
    if (!window.confirm("Activate Emergency Stop?\n\nThis cancels every real pending order on Alpaca and Tradier and halts all 4 automated-execution systems until manually re-armed. Open positions are NOT closed.")) return;
    setEstopBusy(true);
    try {
      const r = await fetch("/api/emergency-stop/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activatedBy: "app-ui" }) }).then(x => x.json());
      if (r?.state) setEstop(r);
    } catch {}
    setEstopBusy(false);
  };
  const rearmEstop = async () => {
    if (!window.confirm("Re-arm Emergency Stop?\n\nAutomated systems will be allowed to place new orders again.")) return;
    setEstopBusy(true);
    try {
      const r = await fetch("/api/emergency-stop/rearm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rearmedBy: "app-ui" }) }).then(x => x.json());
      if (r?.state) setEstop(r);
    } catch {}
    setEstopBusy(false);
  };

  const badge = (label, ok, honestLabel) => (
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 10, color: ok ? C.green : C.textDim }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: ok ? C.green : C.textDim, flexShrink: 0 }} />
      {label} {honestLabel && <span style={{ color: C.textDim }}>{honestLabel}</span>}
    </span>
  );

  return (
    <div ref={rootRef} style={{
      position: "fixed", bottom: 0, left: !isMobile ? sidebarWidth : 0, right: 0, height: STATUS_BAR_H,
      background: C.surface, borderTop: `1px solid ${C.border}`, zIndex: 38,
      display: "flex", alignItems: "center", gap: 16, padding: "0 16px",
      overflowX: "auto", scrollbarWidth: "none",
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: state === "ok" ? C.green : state === "error" ? C.red : C.amber, flexShrink: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: state === "ok" ? C.green : state === "error" ? C.red : C.amber }}>
          {state === "ok" ? "CONNECTED" : state === "error" ? "DISCONNECTED" : "CONNECTING…"}
        </span>
      </span>
      <span style={{ width: 1, height: 14, background: C.border, flexShrink: 0 }} />
      {estop && (
        <button onClick={estop.active ? rearmEstop : activateEstop} disabled={estopBusy}
          title={estop.active ? `Activated by ${estop.activatedBy} — ${estop.reason}` : "Cancel all real pending orders and halt every automated-execution system"}
          style={{
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0, fontFamily: MONO, fontSize: 10, fontWeight: 800,
            padding: "3px 9px", borderRadius: 5, cursor: estopBusy ? "not-allowed" : "pointer", border: "none",
            background: estop.active ? C.red : "transparent", color: estop.active ? "#fff" : C.textDim,
            outline: estop.active ? "none" : `1px solid ${C.border}`,
          }}>
          {estop.active ? "🛑 STOPPED — RE-ARM" : "🛑 EMERGENCY STOP"}
        </button>
      )}
      <span style={{ width: 1, height: 14, background: C.border, flexShrink: 0 }} />
      {/* Integration badges — Telegram is a real live signal from /api/health.
          Polygon/Alpaca show "configured" (key present), honestly distinct
          from "connected" (no live-ping concept exists for either). TradingView
          has no connectivity concept at all — it's a static embedded chart
          widget, not an authenticated API — so it's just labeled as such. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {badge("Polygon", !!health?.envSeen?.POLYGON_API_KEY, "configured")}
        {badge("Alpaca", !!health?.envSeen?.ALPACA_KEY_ID, "configured")}
        {badge("TradingView", true, "embedded")}
        {badge("Telegram", !!health?.telegram, health?.telegram ? "connected" : "not set up")}
      </div>
      <span style={{ width: 1, height: 14, background: C.border, flexShrink: 0 }} />
      <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, flexShrink: 0 }}>
        Latency: {latencyMs != null ? `${latencyMs}ms` : "—"}
      </span>
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {/* Always ON, not a toggle — this app is architecturally paper-trading
            only (Alpaca's paper API, hardcoded — see routes/alpaca.js), there's
            no live-mode concept to switch to, so a functional toggle would be
            fake. */}
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Paper Trading</span>
        <span style={{ width: 26, height: 14, borderRadius: 7, background: C.green, position: "relative", display: "inline-block" }}>
          <span style={{ position: "absolute", top: 2, right: 2, width: 10, height: 10, borderRadius: "50%", background: "#fff" }} />
        </span>
        <span style={{ width: 1, height: 14, background: C.border }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textSec }}>Account: PAPER-001</span>
      </span>
    </div>
  );
}
