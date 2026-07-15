import { useState } from "react";

// ── Ask AI bar — the real AI copilot (TradingCopilot.jsx) already works and
// already knows your account/watchlist/positions, but the only way to reach
// it was a floating chat bubble easy to miss. This puts a real input right
// on the Dashboard; it dispatches the exact same "open-ai-copilot" event
// the sidebar and command palette already use — zero backend change, just
// making the existing entry point visible.
export default function AskAiBar({ C, MONO, SANS }) {
  const [q, setQ] = useState("");
  const ask = () => {
    const query = q.trim();
    if (!query) return;
    window.dispatchEvent(new CustomEvent("open-ai-copilot", { detail: { query } }));
    setQ("");
  };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadow, padding: 10, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: MONO, fontSize: 14 }}>🗣️</span>
      <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ask(); }}
        placeholder="Ask AI — “Review my portfolio”, “Why is NVDA moving?”, “Should I buy TSLA?”…"
        style={{ flex: 1, fontFamily: SANS, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, outline: "none" }} />
      <button onClick={ask} style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, padding: "8px 16px", borderRadius: 8, cursor: "pointer", border: "none", background: C.accent, color: "#fff" }}>Ask</button>
    </div>
  );
}
