// ── Morning Routine Tab ──────────────────────────────────────────────────────
export default function MorningRoutineTab({ C, MONO, SANS, setActiveTab, macroData, distData, fearGreedData }) {
  const STEPS = [
    { id: "regime",    icon: "📊", time: "30s", title: "Check Market Regime",     action: "Open Monitor → what is BULL/BEAR/CHOP today?",          tab: "dashboard" },
    { id: "futures",   icon: "⚡", time: "30s", title: "Futures + Pre-Market",    action: "Is SPY/QQQ up or down pre-market? Any big gappers?",    tab: "dashboard" },
    { id: "events",    icon: "📅", time: "30s", title: "Check Events Today",      action: "FOMC? CPI? Jobs? Any high-impact news? → Reduce size.", tab: "dashboard" },
    { id: "compress",  icon: "🌀", time: "2m",  title: "Compression Scanner",     action: "Find stocks coiling. Run filter: 2+ GO signals.",       tab: "compression" },
    { id: "best",      icon: "⚡", time: "2m",  title: "Best Setups Tab",         action: "Check ENTER setups. Any confirmed BUY + coiling?",      tab: "combined" },
    { id: "wl",        icon: "👁", time: "1m",  title: "Scan Watchlist",          action: "Any watchlist stock at entry zone? Near breakout?",     tab: "dashboard" },
    { id: "risk",      icon: "🛑", time: "30s", title: "Set Daily Risk Budget",   action: "$10K × 1% = $100 max risk. Max 2-3 trades today.",      tab: null },
    { id: "plan",      icon: "📋", time: "2m",  title: "Pick Top 2 Setups",       action: "Write entry, stop, target for each. Nothing else.",     tab: null },
    { id: "ready",     icon: "✅", time: "30s", title: "Mental Checklist",        action: "Am I calm? Had coffee? Not distracted? Phone away?",    tab: null },
  ];

  const today = new Date().toISOString().slice(0, 10);
  const storageKey = `morning_routine_${today}`;

  const [checked, setChecked] = React.useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || "[]")); } catch { return new Set(); }
  });
  const [notes, setNotes] = React.useState(() => {
    try { return localStorage.getItem(`morning_notes_${today}`) || ""; } catch { return ""; }
  });

  const toggle = (id) => setChecked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch {}
    return next;
  });

  const saveNotes = (v) => {
    setNotes(v);
    try { localStorage.setItem(`morning_notes_${today}`, v); } catch {}
  };

  const done = checked.size;
  const total = STEPS.length;
  const pct = Math.round(done / total * 100);
  const allDone = done === total;
  const etNow = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header */}
      <div style={{ background: allDone ? `${C.green}12` : C.card, border: `1px solid ${allDone ? C.green+"44" : C.border}`, borderRadius: 12, padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>
              ☀️ MORNING ROUTINE
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {etNow} ET
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: allDone ? C.green : C.accent }}>{pct}%</div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>{done}/{total} steps</div>
          </div>
        </div>
        <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: allDone ? C.green : C.accent, borderRadius: 4, transition: "width 0.4s" }} />
        </div>
        {allDone && (
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.green, marginTop: 10 }}>
            ✅ Pre-market routine complete — you are READY to trade.
          </div>
        )}
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {STEPS.map((s, i) => {
          const isDone = checked.has(s.id);
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px",
              borderRadius: 10, background: isDone ? `${C.green}0c` : C.card,
              border: `1px solid ${isDone ? C.green+"44" : C.border}`,
              opacity: isDone ? 0.85 : 1 }}>
              {/* Checkbox */}
              <button onClick={() => toggle(s.id)}
                style={{ width: 24, height: 24, borderRadius: "50%", border: `2px solid ${isDone ? C.green : C.border}`,
                  background: isDone ? C.green : "transparent", flexShrink: 0, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                {isDone && <span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>✓</span>}
              </button>
              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 16 }}>{s.icon}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: isDone ? C.textDim : C.text,
                    textDecoration: isDone ? "line-through" : "none" }}>
                    {i + 1}. {s.title}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginLeft: "auto" }}>~{s.time}</span>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: isDone ? C.textDim : C.textSec, lineHeight: 1.5 }}>
                  {s.action}
                </div>
              </div>
              {/* Go button */}
              {s.tab && !isDone && (
                <button onClick={() => { setActiveTab(s.tab); toggle(s.id); }}
                  style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, padding: "4px 10px",
                    borderRadius: 6, border: `1px solid ${C.accent}44`, background: `${C.accent}15`,
                    color: C.accent, cursor: "pointer", flexShrink: 0 }}>
                  GO →
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Today's notes */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, marginBottom: 8, letterSpacing: "0.08em" }}>
          📝 TODAY'S FOCUS & TOP 2 SETUPS
        </div>
        <textarea value={notes} onChange={e => saveNotes(e.target.value)}
          placeholder={"Write your top 2 setups for today:\n\nSetup 1: TICKER — Entry $X, Stop $X, Target $X\nSetup 2: TICKER — Entry $X, Stop $X, Target $X\n\nToday's rule: ___"}
          style={{ width: "100%", minHeight: 120, padding: "10px 12px", background: C.surface,
            border: `1px solid ${C.border}`, color: C.text, fontFamily: SANS, fontSize: 13,
            borderRadius: 8, resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }} />
      </div>

      {/* Reset */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>
          Resets automatically each morning
        </div>
        <button onClick={() => { setChecked(new Set()); try { localStorage.removeItem(storageKey); } catch {} }}
          style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, background: "transparent",
            border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}>
          Reset
        </button>
      </div>
    </div>
  );
}
