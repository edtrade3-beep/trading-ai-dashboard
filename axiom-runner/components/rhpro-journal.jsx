import { useState } from "react";

// Manual, localStorage-backed trade journal. Shared by the (currently
// orphaned-from-nav) standalone rhpro-journal tab and embedded live inside
// GreenLightTab's "Trade Journal" section. rhLoadJournal/rhSaveJournal are
// also used by RhProCoach (grades each journal entry A+ to F).

export function rhLoadJournal() { try { return JSON.parse(localStorage.getItem("rhpro_journal")) || []; } catch { return []; } }
export function rhSaveJournal(a) { try { localStorage.setItem("rhpro_journal", JSON.stringify(a)); } catch {} }
export function rhPnl(t) { const dir = t.side === "short" ? -1 : 1; return +(((Number(t.exit) - Number(t.entry)) * dir) * Number(t.shares || 0)).toFixed(2); }

export default function RhProJournal({ C, MONO, SANS }) {
  const [trades, setTrades] = useState(rhLoadJournal);
  const blank = { date: new Date().toISOString().slice(0, 10), symbol: "", side: "long", shares: "", entry: "", exit: "", aiScore: "", notes: "", mistakes: "", emotion: "", shot: "" };
  const [f, setF] = useState(blank);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const add = () => {
    if (!f.symbol || !f.entry || !f.exit || !f.shares) return;
    const t = { id: Date.now(), ...f, symbol: f.symbol.toUpperCase(), pnl: rhPnl(f) };
    const n = [t, ...trades]; setTrades(n); rhSaveJournal(n); setF(blank);
  };
  const del = (id) => { const n = trades.filter(t => t.id !== id); setTrades(n); rhSaveJournal(n); };

  const inp = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: MONO, fontSize: 13, color: C.text, padding: "8px 10px", outline: "none", width: "100%" };
  const Lbl = ({ t }) => <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 3 }}>{t}</div>;
  const total = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const wins = trades.filter(t => Number(t.pnl) > 0).length;

  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>📓 TRADE JOURNAL</div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{trades.length} trades · {trades.length ? Math.round(wins / trades.length * 100) : 0}% win · net <b style={{ color: total >= 0 ? C.green : C.red }}>${Math.round(total).toLocaleString()}</b></div>
      </div>

      {/* Entry form */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10, marginBottom: 10 }}>
          <div><Lbl t="DATE" /><input type="date" value={f.date} onChange={e => set("date", e.target.value)} style={inp} /></div>
          <div><Lbl t="SYMBOL" /><input value={f.symbol} onChange={e => set("symbol", e.target.value)} placeholder="NVDA" style={inp} /></div>
          <div><Lbl t="SIDE" /><select value={f.side} onChange={e => set("side", e.target.value)} style={inp}><option value="long">Long</option><option value="short">Short</option></select></div>
          <div><Lbl t="SHARES" /><input type="number" value={f.shares} onChange={e => set("shares", e.target.value)} style={inp} /></div>
          <div><Lbl t="ENTRY $" /><input type="number" step="0.01" value={f.entry} onChange={e => set("entry", e.target.value)} style={inp} /></div>
          <div><Lbl t="EXIT $" /><input type="number" step="0.01" value={f.exit} onChange={e => set("exit", e.target.value)} style={inp} /></div>
          <div><Lbl t="AI SCORE" /><input type="number" value={f.aiScore} onChange={e => set("aiScore", e.target.value)} placeholder="0-100" style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><Lbl t="WHAT WENT RIGHT / NOTES" /><input value={f.notes} onChange={e => set("notes", e.target.value)} placeholder="Followed the plan, waited for buy zone…" style={inp} /></div>
          <div><Lbl t="MISTAKES" /><input value={f.mistakes} onChange={e => set("mistakes", e.target.value)} placeholder="Sized too big, chased entry…" style={inp} /></div>
          <div><Lbl t="EMOTIONAL STATE" /><input value={f.emotion} onChange={e => set("emotion", e.target.value)} placeholder="Calm / FOMO / revenge…" style={inp} /></div>
          <div><Lbl t="SCREENSHOT REF (url/note)" /><input value={f.shot} onChange={e => set("shot", e.target.value)} placeholder="link or note" style={inp} /></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={add} style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, padding: "9px 22px", borderRadius: 8, border: "none", color: "#fff", background: C.accent, cursor: "pointer" }}>+ LOG TRADE</button>
          {f.entry && f.exit && f.shares ? <span style={{ fontFamily: MONO, fontSize: 13, color: rhPnl(f) >= 0 ? C.green : C.red }}>P&amp;L: ${rhPnl(f).toLocaleString()}</span> : null}
        </div>
      </div>

      {/* List */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["DATE", "SYM", "SIDE", "SH", "ENTRY", "EXIT", "P&L", "AI", "EMOTION", "MISTAKES", ""].map(h => <th key={h} style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, padding: "8px 8px", textAlign: "left", position: "sticky", top: 0, background: C.card }}>{h}</th>)}</tr></thead>
          <tbody>
            {trades.map(t => (
              <tr key={t.id}>
                <td style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, padding: "7px 8px", borderTop: `1px solid ${C.border}` }}>{t.date?.slice(5)}</td>
                <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, padding: "7px 8px", borderTop: `1px solid ${C.border}` }}>{t.symbol}</td>
                <td style={{ fontFamily: MONO, fontSize: 11, color: t.side === "short" ? C.red : C.green, padding: "7px 8px", borderTop: `1px solid ${C.border}` }}>{t.side}</td>
                <td style={{ fontFamily: MONO, fontSize: 11, color: C.textSec, padding: "7px 8px", borderTop: `1px solid ${C.border}` }}>{t.shares}</td>
                <td style={{ fontFamily: MONO, fontSize: 11, color: C.textSec, padding: "7px 8px", borderTop: `1px solid ${C.border}` }}>${t.entry}</td>
                <td style={{ fontFamily: MONO, fontSize: 11, color: C.textSec, padding: "7px 8px", borderTop: `1px solid ${C.border}` }}>${t.exit}</td>
                <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: Number(t.pnl) >= 0 ? C.green : C.red, padding: "7px 8px", borderTop: `1px solid ${C.border}` }}>${Number(t.pnl).toLocaleString()}</td>
                <td style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, padding: "7px 8px", borderTop: `1px solid ${C.border}` }}>{t.aiScore || "—"}</td>
                <td style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, padding: "7px 8px", borderTop: `1px solid ${C.border}`, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.emotion}</td>
                <td style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, padding: "7px 8px", borderTop: `1px solid ${C.border}`, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.mistakes}</td>
                <td style={{ padding: "7px 8px", borderTop: `1px solid ${C.border}` }}><span onClick={() => del(t.id)} style={{ cursor: "pointer", color: C.textDim, fontSize: 12 }}>🗑</span></td>
              </tr>
            ))}
            {!trades.length && <tr><td colSpan="11" style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, textAlign: "center", padding: 20 }}>No trades logged yet. Log your Robinhood trades above — the AI Coach and Performance dashboard read from here.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>Stored privately in your browser. Log every trade honestly — including the emotion and the mistake — that's where the growth is.</div>
    </div>
  );
}
