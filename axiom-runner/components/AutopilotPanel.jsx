import { useEffect, useState } from "react";

// ── Autopilot Panel — "AM TRADING — LIGHT BOX + AUTOPILOT" spec §31-32
// (explicit user request, 2026-08-19). A separate, third autopilot system
// from src/server-autopilot.js (swing, already live in production) and
// AutoPilotEngine.jsx (client-side swing) — both untouched, per explicit
// user choice. Deliberately its own small component — no shared styling
// with LightBoxCard.jsx, per the "do not redesign the light boxes"
// constraint.
//
// ASSIST real order execution (2026-08-23, explicit user request) — LONG
// entries only (see src/lightbox-autopilot-execute.js's header for why
// SHORT stays alert-only). Real two-tap confirm: PREVIEW fetches real
// qty/entry/stop/target/risk$ off the live account (never guessed
// client-side), CONFIRM re-validates fresh server-side and places a real
// Alpaca paper bracket order. AUTOPILOT (fully automatic, no tap) is still
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
    <div style={{ marginBottom: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: C.shadow, padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text }}>🤖 AUTOPILOT</span>
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

      {/* Real ASSIST ready-to-execute LONG positions — only meaningful in
          ASSIST mode; hidden otherwise so OFF/ALERT users never see order
          UI for a mode that can't place orders. */}
      {status.mode === "ASSIST" && (() => {
        const ready = positions.filter((p) => p.state === "ENTRY_READY" && p.direction === "LONG" && !(p.orderId && p.orderPlacedForTs === p.detectedAt));
        if (!ready.length && !preview && !orderResult) return null;
        return (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 6 }}>
              REAL ENTRY_READY (LONG) — TAP TO PREVIEW, THEN CONFIRM
            </div>
            {ready.map((p) => (
              <div key={p.symbol} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "5px 0", fontFamily: MONO, fontSize: 11 }}>
                <span style={{ color: C.text, fontWeight: 800 }}>{p.symbol}</span>
                <span style={{ color: C.textDim, fontFamily: SANS, fontSize: 10.5, flex: 1 }}>{p.why}</span>
                <button onClick={() => previewOrder(p.symbol)} disabled={orderBusy}
                  style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.green}`, background: `${C.green}18`, color: C.green, cursor: orderBusy ? "not-allowed" : "pointer" }}>
                  PREVIEW
                </button>
              </div>
            ))}

            {previewError && (
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.red, marginTop: 6 }}>{previewError}</div>
            )}

            {preview && (
              <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.green}55`, background: `${C.green}0d` }}>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.text, marginBottom: 4 }}>
                  {preview.symbol} — {preview.qty} sh @ ~${Number(preview.entry).toFixed(2)} (paper)
                </div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, marginBottom: 8 }}>
                  Stop ${Number(preview.stop).toFixed(2)} · Target ${Number(preview.target).toFixed(2)} · Risking ${preview.riskDollars} ({preview.riskPct}% of equity) · Est. cost ${preview.estCost}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={confirmOrder} disabled={orderBusy}
                    style={{ flex: 1, fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "8px 0", borderRadius: 6, border: "none", color: "#fff", background: orderBusy ? C.textDim : C.green, cursor: orderBusy ? "not-allowed" : "pointer" }}>
                    {orderBusy ? "PLACING…" : "✅ CONFIRM — PLACE REAL ORDER"}
                  </button>
                  <button onClick={() => { setPreview(null); setPreviewError(null); }} disabled={orderBusy}
                    style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "8px 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textSec, cursor: orderBusy ? "not-allowed" : "pointer" }}>
                    CANCEL
                  </button>
                </div>
              </div>
            )}

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
