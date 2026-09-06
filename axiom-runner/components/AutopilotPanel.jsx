import { useEffect, useState } from "react";
import { sectionLabelStyle, cardStyle } from "./ui-atoms.jsx";

// ── Autopilot Panel — "AM TRADING — LIGHT BOX + AUTOPILOT" spec §31-32
// (explicit user request, 2026-08-19). A separate, third autopilot system
// from src/server-autopilot.js (swing, already live in production) and
// AutoPilotEngine.jsx (client-side swing) — both untouched, per explicit
// user choice. Deliberately its own small component — no shared styling
// with LightBoxCard.jsx, per the "do not redesign the light boxes"
// constraint.
//
// ASSIST real order execution (2026-08-23, explicit user request) — both
// LONG and SHORT (SHORT added same day once day-trade-calc.js's
// direction-aware stop/target math shipped — see
// src/lightbox-autopilot-execute.js's header). Real two-tap confirm:
// PREVIEW fetches real qty/entry/stop/target/risk$ off the live account
// (never guessed client-side), CONFIRM re-validates fresh server-side and
// places a real Alpaca paper bracket order (buy-side for LONG, real
// short-sell for SHORT). AUTOPILOT (fully automatic, no tap) is still
// not built — stays visibly disabled so nothing implies more capability
// than exists yet.
const POLL_MS = 20000;
const MODES = [
  { id: "OFF", label: "OFF", enabled: true },
  { id: "ALERT", label: "ALERT", enabled: true },
  { id: "ASSIST", label: "ASSIST", enabled: true },
  { id: "AUTOPILOT", label: "AUTOPILOT", enabled: false },
];

const STATE_COLOR = (C, state) => {
  if (state === "ENTRY_READY" || state === "ORDER_PLACED") return C.green;
  if (state === "ENTRY_MISSED" || state === "FLATTENED") return C.amber;
  if (state === "EXIT") return C.red;
  return C.textDim;
};

export default function AutopilotPanel({ C, MONO, SANS }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { symbol, ...realFieldsFromServer } | null
  const [previewError, setPreviewError] = useState(null);
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderResult, setOrderResult] = useState(null); // { symbol, ok, ... } | null, last completed order

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/autopilot/status");
        const j = await r.json();
        if (!alive || !j.ok) return;
        setStatus(j);
      } catch {}
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const setMode = async (mode) => {
    setBusy(true);
    try {
      const r = await fetch("/api/autopilot/mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      const j = await r.json();
      if (j.ok) setStatus((s) => (s ? { ...s, mode: j.mode } : s));
    } catch {}
    setBusy(false);
  };

  const previewOrder = async (symbol) => {
    setPreview(null); setPreviewError(null); setOrderResult(null);
    setOrderBusy(true);
    try {
      const r = await fetch("/api/autopilot/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) });
      const j = await r.json();
      if (j.ok) setPreview({ symbol, ...j }); else setPreviewError(j.error || "Preview failed.");
    } catch (e) { setPreviewError(e.message); }
    setOrderBusy(false);
  };

  const confirmOrder = async () => {
    if (!preview) return;
    setOrderBusy(true);
    try {
      const r = await fetch("/api/autopilot/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: preview.symbol }) });
      const j = await r.json();
      setOrderResult({ symbol: preview.symbol, ...j });
      if (j.ok) { setPreview(null); setPreviewError(null); }
    } catch (e) { setOrderResult({ symbol: preview.symbol, ok: false, error: e.message }); }
    setOrderBusy(false);
  };

  if (!status) return null;

  const positions = Object.values(status.positions || {});
  const openCount = positions.filter((p) => p.state && !["EXITED", "ENTRY_MISSED"].includes(p.state)).length;
  const modeColor = status.mode === "OFF" ? C.textDim : C.green;

  const btn = (active, enabled) => ({
    fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 6,
    cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.4,
    border: `1px solid ${active ? modeColor : C.border}`, background: active ? `${modeColor}18` : C.card,
    color: active ? modeColor : C.textSec,
  });

  return (
    <div style={cardStyle({ marginBottom: 14 })}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Relabeled from "AUTOPILOT" (2026-08-31 audit fix) — this panel
              is Light Box's own order-assist feature, not the dedicated
              Autopilot 2.0 system; the generic label read as the same
              thing. See this file's own header comment for the full
              real-system-boundary explanation. */}
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text }}>🤖 LIGHT BOX ASSIST</span>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: modeColor }}>
            {status.mode === "OFF" ? "⚪ OFF" : `🟢 ${status.mode}`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {MODES.map((m) => (
            <button key={m.id} disabled={busy || !m.enabled} onClick={() => m.enabled && setMode(m.id)}
              title={m.enabled ? undefined : "Not yet built — coming in a later phase"}
              style={btn(status.mode === m.id, m.enabled)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 10 }}>
        <span>Today: <b style={{ color: C.text, fontFamily: MONO }}>{status.dailyStats.trades}</b> trades</span>
        <span>P/L: <b style={{ color: status.dailyStats.pl >= 0 ? C.green : C.red, fontFamily: MONO }}>{status.dailyStats.pl >= 0 ? "+" : ""}{status.dailyStats.pl}</b></span>
        <span>Risk used: <b style={{ color: C.text, fontFamily: MONO }}>{status.dailyStats.riskUsedPct}%</b></span>
        <span>Open: <b style={{ color: C.text, fontFamily: MONO }}>{openCount}</b></span>
      </div>

      {/* Real ASSIST ready-to-execute LONG + SHORT positions — only
          meaningful in ASSIST mode; hidden otherwise so OFF/ALERT users
          never see order UI for a mode that can't place orders. */}
      {status.mode === "ASSIST" && (() => {
        const ready = positions.filter((p) => p.state === "ENTRY_READY" && (p.direction === "LONG" || p.direction === "SHORT") && !(p.orderId && p.orderPlacedForTs === p.detectedAt));
        if (!ready.length && !preview && !orderResult) return null;
        return (
          // Real bug fix (2026-09-06, user report + screenshot: "can not
          // click on preview" on a phone) — this list has no right-side
          // clearance for the app's always-on fixed "⚡" FAB-expand toggle
          // (axiom-live.jsx, position:fixed, bottom:10+statusBarH, right:10,
          // zIndex:9999, "always visible on every screen size" per its own
          // comment there). Whichever row happens to scroll into that
          // button's fixed screen coordinates has its flush-right PREVIEW
          // button's taps captured by the FAB instead — same class of bug
          // this codebase has hit and fixed before for other lists/panels
          // (DashboardTab.jsx's DashSubNav, MarketTerminalTab.jsx's chart
          // price scale), just not yet applied here. paddingRight on this
          // container (not just the button) insets every row, including
          // the right-aligned PREVIEW button, out from under that column —
          // matching the MarketTerminalTab.jsx clearance convention.
          <div style={{ marginTop: 10, paddingTop: 8, paddingRight: 56, borderTop: `1px solid ${C.border}` }}>
            <div style={sectionLabelStyle({ marginBottom: 6 })}>
              REAL ENTRY_READY (LONG + SHORT) — TAP TO PREVIEW, THEN CONFIRM
            </div>
            {/* Mobile-usability pass, same fix (explicit user request:
                "make sure its easy to use in mobile") — was one dense
                single-line row (symbol + badge + why-text + button all
                sharing one line via flex:1), which squeezed the tap target
                on narrow phones and forced the button to vertically-center
                against a wrapped 2-line "why" string. Symbol/badge/button
                now share a fixed-height top line (button never shrinks,
                flexShrink:0, real ~36px tap height), "why" text is its own
                full-width line below so it can wrap freely without
                affecting the button's size or position. */}
            {ready.map((p) => (
              <div key={p.symbol} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}44`, fontFamily: MONO, fontSize: 11 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: p.direction === "SHORT" ? C.red : C.text, fontWeight: 800 }}>{p.symbol}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: p.direction === "SHORT" ? C.red : C.green, border: `1px solid ${p.direction === "SHORT" ? C.red : C.green}55`, borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>
                    {p.direction === "SHORT" ? "SHORT" : "LONG"}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => previewOrder(p.symbol)} disabled={orderBusy}
                    style={{ flexShrink: 0, minHeight: 36, fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.green}`, background: `${C.green}18`, color: C.green, cursor: orderBusy ? "not-allowed" : "pointer" }}>
                    PREVIEW
                  </button>
                </div>
                <div style={{ color: C.textDim, fontFamily: SANS, fontSize: 10.5, marginTop: 3 }}>{p.why}</div>
              </div>
            ))}

            {previewError && (
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.red, marginTop: 6 }}>{previewError}</div>
            )}

            {preview && (() => {
              const isShort = preview.direction === "SHORT";
              const verb = isShort ? "SHORT SELL" : "BUY";
              return (
                <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, border: `1px solid ${isShort ? C.red : C.green}55`, background: `${isShort ? C.red : C.green}0d` }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.text, marginBottom: 4 }}>
                    {verb} {preview.symbol} — {preview.qty} sh @ ~${Number(preview.entry).toFixed(2)} (paper)
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, marginBottom: 8 }}>
                    Stop ${Number(preview.stop).toFixed(2)} · Target ${Number(preview.target).toFixed(2)} · Risking ${preview.riskDollars} ({preview.riskPct}% of equity) · Est. {isShort ? "exposure" : "cost"} ${preview.estCost}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={confirmOrder} disabled={orderBusy}
                      style={{ flex: 1, fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "8px 0", borderRadius: 6, border: "none", color: "#fff", background: orderBusy ? C.textDim : (isShort ? C.red : C.green), cursor: orderBusy ? "not-allowed" : "pointer" }}>
                      {orderBusy ? "PLACING…" : `✅ CONFIRM — ${verb}`}
                    </button>
                    <button onClick={() => { setPreview(null); setPreviewError(null); }} disabled={orderBusy}
                      style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "8px 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textSec, cursor: orderBusy ? "not-allowed" : "pointer" }}>
                      CANCEL
                    </button>
                  </div>
                </div>
              );
            })()}

            {orderResult && (
              <div style={{ fontFamily: SANS, fontSize: 11, color: orderResult.ok ? C.green : C.red, marginTop: 6 }}>
                {orderResult.ok ? `✅ Order placed for ${orderResult.symbol} (${orderResult.qty} sh, order ${orderResult.orderId}).` : `${orderResult.symbol}: ${orderResult.error}`}
              </div>
            )}
          </div>
        );
      })()}

      {status.activityLog?.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 4, maxHeight: 120, overflowY: "auto" }}>
          {status.activityLog.slice(0, 8).map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: MONO, fontSize: 10.5 }}>
              <span style={{ color: C.textDim }}>{new Date(a.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span style={{ color: C.text, fontWeight: 700 }}>{a.symbol}</span>
              <span style={{ color: STATE_COLOR(C, a.state), fontWeight: 700 }}>{a.state}</span>
              <span style={{ color: C.textDim, fontFamily: SANS }}>{a.note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
