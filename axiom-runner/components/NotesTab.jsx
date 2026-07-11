import { useState, useEffect } from "react";

// ─── NOTES TAB ───────────────────────────────────────────────────────────────
// Auto-populated every morning with BUY + SELL signals. Manual notes supported.
const NOTES_KEY = "axiom_notes_v1";
export default function NotesTab({ C, MONO, SANS }) {
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(NOTES_KEY) || "[]"); } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [testing, setTesting] = useState(false);
  const [lastGen, setLastGen] = useState(() => localStorage.getItem("axiom_notes_lastgen") || null);
  const [filter, setFilter] = useState("all"); // all | trades | other

  const save = (updated) => {
    setNotes(updated);
    localStorage.setItem(NOTES_KEY, JSON.stringify(updated));
  };

  // Auto-refresh when the trade engine logs a buy/sell/exit note
  useEffect(() => {
    const reload = () => { try { setNotes(JSON.parse(localStorage.getItem(NOTES_KEY) || "[]")); } catch {} };
    window.addEventListener("notes-changed", reload);
    return () => window.removeEventListener("notes-changed", reload);
  }, []);

  const addNote = (note) => {
    const updated = [note, ...notes].slice(0, 200);
    save(updated);
  };

  const deleteNote = (id) => save(notes.filter(n => n.id !== id));

  const addManual = () => {
    if (!input.trim()) return;
    addNote({ id: Date.now(), type: "manual", text: input.trim(), ts: new Date().toISOString() });
    setInput("");
  };

  // ── Fetch real signals from the scanner ──
  const generateMorningSignals = async () => {
    setTesting(true);
    try {
      // Run a quick scan to get real signals
      const r = await fetch("/api/scanner/smart?limit=20").catch(() => null);
      const d = r ? await r.json().catch(() => null) : null;
      const rows = d?.results || d?.rows || [];

      let buyNote = null, sellNote = null;

      // Find best BUY (STRONG BUY or BUY signal, highest score)
      const buys = rows.filter(r => r.signal === "STRONG BUY" || r.signal === "BUY").sort((a,b) => b.score - a.score);
      if (buys.length > 0) {
        const b = buys[0];
        buyNote = {
          id: Date.now(),
          type: "buy",
          ticker: b.ticker || b.symbol,
          text: `🟢 BUY SIGNAL — ${b.ticker || b.symbol}\nScore: ${b.score}/100 · Signal: ${b.signal}\nPrice: $${Number(b.quote?.price || 0).toFixed(2)} · RSI: ${b.rsiVal ? Math.round(b.rsiVal) : "—"}\nSignals: ${(b.signals || []).slice(0,3).map(s => s?.txt || s).filter(Boolean).join(", ")}`,
          ts: new Date().toISOString(),
        };
      }

      // Find best SELL (SELL or AVOID, highest score)
      const sells = rows.filter(r => r.signal === "SELL" || r.signal === "AVOID").sort((a,b) => b.score - a.score);
      if (sells.length > 0) {
        const s = sells[0];
        sellNote = {
          id: Date.now() + 1,
          type: "sell",
          ticker: s.ticker || s.symbol,
          text: `🔴 SELL SIGNAL — ${s.ticker || s.symbol}\nScore: ${s.score}/100 · Signal: ${s.signal}\nPrice: $${Number(s.quote?.price || 0).toFixed(2)} · RSI: ${s.rsiVal ? Math.round(s.rsiVal) : "—"}\nSignals: ${(s.signals || []).slice(0,3).map(sg => sg?.txt || sg).filter(Boolean).join(", ")}`,
          ts: new Date().toISOString(),
        };
      }

      // Fallback test signals if scan returns nothing
      if (!buyNote) {
        buyNote = {
          id: Date.now(),
          type: "buy",
          ticker: "TEST",
          text: `🟢 BUY SIGNAL — TEST\nScore: 85/100 · Signal: STRONG BUY\nThis is a test buy signal. Connect to scanner for real signals.\nRSI: 38 · EMA aligned · Volume 2.1x`,
          ts: new Date().toISOString(),
        };
      }
      if (!sellNote) {
        sellNote = {
          id: Date.now() + 1,
          type: "sell",
          ticker: "TEST",
          text: `🔴 SELL SIGNAL — TEST\nScore: 82/100 · Signal: AVOID\nThis is a test sell signal. Connect to scanner for real signals.\nRSI: 74 · Overbought · Near 52W high`,
          ts: new Date().toISOString(),
        };
      }

      const genNote = {
        id: Date.now() + 2,
        type: "header",
        text: `📅 MORNING SIGNALS — ${new Date().toLocaleDateString("en-US", { weekday:"long", month:"short", day:"numeric" })} · ${new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",timeZone:"America/New_York"})} ET`,
        ts: new Date().toISOString(),
      };

      const updated = [genNote, buyNote, sellNote, ...notes].slice(0, 200);
      save(updated);
      const now = new Date().toISOString();
      setLastGen(now);
      localStorage.setItem("axiom_notes_lastgen", now);
    } catch(e) {
      addNote({ id: Date.now(), type: "error", text: `❌ Failed to generate signals: ${e.message}`, ts: new Date().toISOString() });
    }
    setTesting(false);
  };

  // ── Auto-generate at 8:30 AM ET if not already done today ──
  useEffect(() => {
    const check = () => {
      const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
      const et = new Date(etStr);
      const h = et.getHours(), m = et.getMinutes(), wd = et.getDay();
      if (wd === 0 || wd === 6) return; // weekend
      if (h !== 8 || m < 30 || m > 45) return; // only 8:30–8:45 AM ET
      const today = et.toLocaleDateString("en-US");
      const lastDate = lastGen ? new Date(lastGen).toLocaleDateString("en-US") : null;
      if (lastDate === today) return; // already done today
      generateMorningSignals();
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [lastGen]);

  const typeColor = t => t === "buy" ? C.green : t === "sell" ? C.amber : t === "exit" ? C.red : t === "summary" ? C.accent : t === "header" ? C.accent : t === "error" ? C.red : C.textDim;
  const typeIcon  = t => t === "buy" ? "🟢" : t === "sell" ? "🎯" : t === "exit" ? "⏹" : t === "summary" ? "📊" : t === "header" ? "📅" : t === "manual" ? "📝" : "ℹ";

  return (
    <div style={{ padding: "20px 24px", maxWidth: 820, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>📝 SIGNAL NOTES</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 3 }}>
            Auto-populated every morning 8:30 AM ET with BUY + SELL signals
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={generateMorningSignals} disabled={testing}
            style={{ background: testing ? C.surface : C.accent, color: testing ? C.textDim : "#fff",
              border: "none", borderRadius: 8, fontFamily: MONO, fontSize: 12, fontWeight: 700,
              padding: "8px 16px", cursor: testing ? "not-allowed" : "pointer" }}>
            {testing ? "⏳ GENERATING…" : "🧪 TEST GENERATE"}
          </button>
          {notes.length > 0 && (
            <button onClick={() => { if(window.confirm("Clear all notes?")) save([]); }}
              style={{ background: C.surface, color: C.red, border: `1px solid ${C.red}44`,
                borderRadius: 8, fontFamily: MONO, fontSize: 11, padding: "8px 12px", cursor: "pointer" }}>
              CLEAR ALL
            </button>
          )}
        </div>
      </div>

      {/* Status */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ padding: "8px 14px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
          fontFamily: MONO, fontSize: 11, color: C.textDim }}>
          ⏰ Auto-runs at 8:30 AM ET weekdays
        </div>
        {lastGen && (
          <div style={{ padding: "8px 14px", borderRadius: 8, background: `${C.green}12`, border: `1px solid ${C.green}33`,
            fontFamily: MONO, fontSize: 11, color: C.green }}>
            ✅ Last generated: {new Date(lastGen).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
          </div>
        )}
        <div style={{ padding: "8px 14px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
          fontFamily: MONO, fontSize: 11, color: C.textDim }}>
          {notes.length} note{notes.length !== 1 ? "s" : ""} saved
        </div>
      </div>

      {/* Manual input */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addManual()}
          placeholder="Add a manual note… (Enter to save)"
          style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
            fontFamily: SANS, fontSize: 13, color: C.text, padding: "10px 14px", outline: "none" }} />
        <button onClick={addManual}
          style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8,
            fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "10px 16px", cursor: "pointer" }}>
          + ADD
        </button>
      </div>

      {/* Filter: separate auto trade journal from everything else */}
      {notes.length > 0 && (() => {
        const tradeCount = notes.filter(n => n.auto).length;
        const otherCount = notes.length - tradeCount;
        return (
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[["all", `ALL (${notes.length})`], ["trades", `📋 TRADES (${tradeCount})`], ["other", `✍️ NOTES (${otherCount})`]].map(([id, lbl]) => (
              <button key={id} onClick={() => setFilter(id)}
                style={{ background: filter === id ? C.accent : C.surface, color: filter === id ? "#fff" : C.textSec,
                  border: `1px solid ${filter === id ? C.accent : C.border}`, borderRadius: 7,
                  fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>{lbl}</button>
            ))}
          </div>
        );
      })()}

      {/* Notes list */}
      {notes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
          <div style={{ fontFamily: MONO, fontSize: 14, color: C.text, marginBottom: 8 }}>No notes yet</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>
            Click <strong>TEST GENERATE</strong> to create your first buy + sell signal notes
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.filter(n => filter === "all" ? true : filter === "trades" ? n.auto : !n.auto).map(note => (
            <div key={note.id} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderLeft: `4px solid ${typeColor(note.type)}`,
              borderRadius: 8, padding: "12px 14px",
              display: "flex", gap: 12, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{typeIcon(note.type)}</span>
              <div style={{ flex: 1 }}>
                <pre style={{ fontFamily: SANS, fontSize: 13, color: note.type === "header" ? C.accent : C.text,
                  fontWeight: note.type === "header" ? 700 : 400,
                  margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {note.text}
                </pre>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 6 }}>
                  {new Date(note.ts).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                </div>
              </div>
              <button onClick={() => deleteNote(note.id)}
                style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer",
                  fontSize: 16, padding: "0 4px", flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
