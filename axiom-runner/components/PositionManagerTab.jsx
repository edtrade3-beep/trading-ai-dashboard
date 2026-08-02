import { useState, useEffect, useCallback } from "react";
import { rhAutoLogClosedPosition } from "./rhpro-journal.jsx";

// PositionManagerTab — Position Manager / AI Exit Engine, options
// platform redesign Phase 11. Paper positions only (confirmed decision —
// never places a real order). Every field is real: server-side store
// (src/paper-positions-store.js) + real chain-sourced repricing
// (src/routes/paper-positions.js's repriceOne, Polygon-preferred/
// Yahoo-fallback) + real exit signals reusing Phase 5's
// ivCrushRisk/assignmentRisk. Closing a position auto-logs a real entry
// into the existing Trade Journal (rhAutoLogClosedPosition) — additive,
// doesn't touch the manual equity-entry form there.
export default function PositionManagerTab({ C, MONO, SANS }) {
  const [open, setOpen] = useState([]);
  const [closed, setClosed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState({ symbol: "", type: "call", strike: "", expiry: "", entryPremium: "", entryUnderlying: "", qty: "1" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/paper-positions").then(res => res.json());
      if (r?.ok) { setOpen(r.open || []); setClosed(r.closed || []); }
    } finally { setLoading(false); }
  }, []);

  // ~15s refresh (Phase 18, options platform redesign — "faster polling,
  // not WebSockets" decision, tightened specifically on this time-sensitive
  // surface). Previously fetched once on mount only; the underlying real
  // data (src/paper-positions-store.js) is a cheap local read — server.js's
  // real reprice job (src/routes/paper-positions.js) writes to it every 15
  // min during market hours, so this just shows whatever the last real
  // write was sooner, at effectively no added server cost.
  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [load]);

  const openPosition = async () => {
    if (!form.symbol || !form.strike || !form.expiry || !form.entryPremium) return;
    const body = {
      symbol: form.symbol.toUpperCase(), type: form.type, strike: Number(form.strike), expiry: form.expiry,
      entryPremium: Number(form.entryPremium), entryUnderlying: Number(form.entryUnderlying) || null, qty: Number(form.qty) || 1,
    };
    const r = await fetch("/api/paper-positions/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(res => res.json());
    if (r?.ok) { setForm({ symbol: "", type: "call", strike: "", expiry: "", entryPremium: "", entryUnderlying: "", qty: "1" }); load(); }
  };

  const reprice = async (id) => {
    setBusyId(id);
    try { await fetch(`/api/paper-positions/${id}/reprice`, { method: "POST" }); await load(); }
    finally { setBusyId(null); }
  };

  const closePos = async (id) => {
    const pos = open.find(p => p.id === id);
    const exitPremium = window.prompt(`Real exit premium for ${pos?.symbol} $${pos?.strike} ${pos?.type}? (blank = use last real repriced value $${pos?.currentPremium})`, pos?.currentPremium);
    if (exitPremium === null) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/paper-positions/${id}/close`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exitPremium: exitPremium ? Number(exitPremium) : undefined, exitReason: "manual" }),
      }).then(res => res.json());
      if (r?.ok && r.position) rhAutoLogClosedPosition(r.position);
      await load();
    } finally { setBusyId(null); }
  };

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 12 };
  const inp = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: MONO, fontSize: 12, color: C.text, padding: "6px 8px", outline: "none", width: "100%" };
  const th = { padding: "6px 8px", fontFamily: MONO, fontSize: 10, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}` };
  const td = { padding: "6px 8px", fontFamily: MONO, fontSize: 12, textAlign: "right", borderBottom: `1px solid ${C.border}33` };
  const recColor = (rec) => rec === "Hold" ? C.green : rec === "Exit Now" ? C.red : C.amber;

  return (
    <div style={{ padding: "0 0 40px" }}>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 16 }}>POSITION MANAGER — AI EXIT ENGINE</div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginBottom: 16 }}>
        Paper positions only — never places a real order. Repriced every 15 min during market hours off a real options chain.
      </div>

      <div style={card}>
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>OPEN PAPER POSITION</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8, marginBottom: 8 }}>
          <input placeholder="SYMBOL" value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))} style={inp} />
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inp}>
            <option value="call">Call</option><option value="put">Put</option>
          </select>
          <input placeholder="STRIKE" type="number" value={form.strike} onChange={e => setForm(f => ({ ...f, strike: e.target.value }))} style={inp} />
          <input placeholder="EXPIRY YYYY-MM-DD" value={form.expiry} onChange={e => setForm(f => ({ ...f, expiry: e.target.value }))} style={inp} />
          <input placeholder="ENTRY PREMIUM" type="number" step="0.01" value={form.entryPremium} onChange={e => setForm(f => ({ ...f, entryPremium: e.target.value }))} style={inp} />
          <input placeholder="UNDERLYING $" type="number" step="0.01" value={form.entryUnderlying} onChange={e => setForm(f => ({ ...f, entryUnderlying: e.target.value }))} style={inp} />
          <input placeholder="QTY" type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} style={inp} />
        </div>
        <button onClick={openPosition} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "7px 18px", borderRadius: 7, border: "none", color: "#fff", background: C.accent, cursor: "pointer" }}>
          + OPEN POSITION
        </button>
      </div>

      <div style={card}>
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>
          OPEN POSITIONS ({open.length}){loading && " · loading…"}
        </div>
        {open.length === 0 ? (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, padding: "12px 0" }}>No open paper positions.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["SYMBOL", "TYPE", "STRIKE", "EXPIRY", "ENTRY", "CURRENT", "P/L", "EXIT SCORE", "RECOMMENDATION", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {open.map(p => (
                  <tr key={p.id}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 800, color: C.text }}>{p.symbol}</td>
                    <td style={{ ...td, color: p.type === "call" ? C.green : C.red }}>{p.type?.toUpperCase()}</td>
                    <td style={{ ...td, color: C.text }}>${p.strike}</td>
                    <td style={{ ...td, color: C.textDim }}>{p.expiry}</td>
                    <td style={{ ...td, color: C.textDim }}>${p.entryPremium}</td>
                    <td style={{ ...td, color: C.text }}>${p.currentPremium}</td>
                    <td style={{ ...td, fontWeight: 800, color: p.pnl >= 0 ? C.green : C.red }}>{p.pnl != null ? `$${p.pnl} (${p.pnlPct}%)` : "—"}</td>
                    <td style={{ ...td, color: C.textDim }}>{p.exitSignals?.exitScore ?? "—"}</td>
                    <td style={{ ...td, fontWeight: 800, color: recColor(p.exitSignals?.recommendation) }}>{p.exitSignals?.recommendation || "Not yet priced"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <button disabled={busyId === p.id} onClick={() => reprice(p.id)} style={{ fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.text, cursor: "pointer", marginRight: 6 }}>Reprice</button>
                      <button disabled={busyId === p.id} onClick={() => closePos(p.id)} style={{ fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 6, border: "none", background: C.red, color: "#fff", cursor: "pointer" }}>Close</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>CLOSED POSITIONS ({closed.length})</div>
        {closed.length === 0 ? (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, padding: "12px 0" }}>No closed paper positions yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["SYMBOL", "TYPE", "STRIKE", "ENTRY", "EXIT", "P/L", "REASON", "CLOSED"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {closed.slice(0, 30).map(p => (
                  <tr key={p.id}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 800, color: C.text }}>{p.symbol}</td>
                    <td style={{ ...td, color: p.type === "call" ? C.green : C.red }}>{p.type?.toUpperCase()}</td>
                    <td style={{ ...td, color: C.text }}>${p.strike}</td>
                    <td style={{ ...td, color: C.textDim }}>${p.entryPremium}</td>
                    <td style={{ ...td, color: C.textDim }}>${p.exitPremium}</td>
                    <td style={{ ...td, fontWeight: 800, color: p.pnl >= 0 ? C.green : C.red }}>{p.pnl != null ? `$${p.pnl} (${p.pnlPct}%)` : "—"}</td>
                    <td style={{ ...td, color: C.textDim }}>{p.exitReason}</td>
                    <td style={{ ...td, color: C.textDim }}>{p.exitDate ? new Date(p.exitDate).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
