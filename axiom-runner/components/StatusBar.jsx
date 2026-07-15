import { useState, useEffect } from "react";

// Bottom status bar — self-contained, own periodic health check (matches the
// self-contained-widget pattern already used elsewhere in this app, e.g.
// RealityCheckWidget). Height is an authored constant (STATUS_BAR_H below),
// not intrinsic wrapping content, so — like the Sidebar — it doesn't need the
// Top Bar's ResizeObserver treatment, just a matching bottom padding on the
// page content.
export const STATUS_BAR_H = 40;

export default function StatusBar({ C, MONO, sidebarWidth, isMobile }) {
  const [health, setHealth] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | error

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

  const badge = (label, ok, honestLabel) => (
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 10, color: ok ? C.green : C.textDim }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: ok ? C.green : C.textDim, flexShrink: 0 }} />
      {label} {honestLabel && <span style={{ color: C.textDim }}>{honestLabel}</span>}
    </span>
  );

  return (
    <div style={{
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
