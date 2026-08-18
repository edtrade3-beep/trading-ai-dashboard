import { useEffect, useState } from "react";

// ── Autopilot Panel — "AM TRADING — LIGHT BOX + AUTOPILOT" spec §31-32
// (explicit user request, 2026-08-19). A separate, third autopilot system
// from src/server-autopilot.js (swing, already live in production) and
// AutoPilotEngine.jsx (client-side swing) — both untouched, per explicit
// user choice. Deliberately its own small component — no shared styling
// with LightBoxCard.jsx, per the "do not redesign the light boxes"
// constraint. ALERT mode only this phase: real detection + Telegram
// alerts, ZERO order execution. ASSIST/AUTOPILOT are shown (matching the
// spec's visual design) but visibly disabled — honest about what's
// actually built rather than implying a capability that doesn't exist yet.
const POLL_MS = 20000;
const MODES = [
  { id: "OFF", label: "OFF", enabled: true },
  { id: "ALERT", label: "ALERT", enabled: true },
  { id: "ASSIST", label: "ASSIST", enabled: false },
  { id: "AUTOPILOT", label: "AUTOPILOT", enabled: false },
];

const STATE_COLOR = (C, state) => {
  if (state === "ENTRY_READY") return C.green;
  if (state === "ENTRY_MISSED") return C.amber;
  if (state === "EXIT") return C.red;
  return C.textDim;
};

export default function AutopilotPanel({ C, MONO, SANS }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

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
