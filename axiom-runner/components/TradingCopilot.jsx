import { useState, useRef, useEffect } from "react";
import { computeRegime } from "./market-helpers.js";

// 🗣️ Trading Copilot — floating chat that knows your context + can search live news
export default function TradingCopilot({ C, MONO, SANS, macroData, watchlistSymbols }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);   // {role, content}
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [positions, setPositions] = useState([]);
  const [queuedQuery, setQueuedQuery] = useState(null);
  const endRef = useRef(null);
  useEffect(() => { if (open) fetch("/api/alpaca/positions").then(r => r.json()).then(d => { if (d?.ok) setPositions(d.positions || []); }).catch(() => {}); }, [open]);
  // Opened from the sidebar's "AI Copilot" item, or from the command palette
  // routing free-text queries here — event-based rather than a lifted prop,
  // matching the existing window-event pattern used elsewhere (e.g.
  // "gl-trades-changed", "autopilot-tick") for cross-component signals.
  // detail.query alone: queue it to send through the normal /api/market/
  // ai-copilot flow once open. detail.deferAnswer: true: show the question
  // immediately but don't call ai-copilot — the command palette is fetching
  // a purpose-built answer (e.g. ai-why) separately and will deliver it via
  // "ai-copilot-answer", so only one AI call happens for that query.
  useEffect(() => {
    const onOpen = (e) => {
      setOpen(true);
      const detail = e.detail || {};
      if (!detail.query) return;
      if (detail.deferAnswer) {
        setMsgs(m => [...m, { role: "user", content: detail.query }]);
        setBusy(true);
      } else {
        setQueuedQuery(detail.query);
      }
    };
    const onAnswer = (e) => {
      setBusy(false);
      setMsgs(m => [...m, { role: "assistant", content: (e.detail && e.detail.answer) || "(no answer)" }]);
    };
    window.addEventListener("open-ai-copilot", onOpen);
    window.addEventListener("ai-copilot-answer", onAnswer);
    return () => { window.removeEventListener("open-ai-copilot", onOpen); window.removeEventListener("ai-copilot-answer", onAnswer); };
  }, []);
  // Fires the queued query once the panel is actually open (positions have
  // started fetching) — uses this render's own `send` closure, so it's
  // always fresh, unlike the mount-only effect above.
  useEffect(() => {
    if (queuedQuery && open) { send(queuedQuery); setQueuedQuery(null); }
  }, [queuedQuery, open]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  const send = (override) => {
    const q = (override ?? input).trim(); if (!q || busy) return;
    const next = [...msgs, { role: "user", content: q }];
    setMsgs(next); setInput(""); setBusy(true);
    const ctx = {
      account: Number(localStorage.getItem("axiom_acct_size")) || 10000,
      riskPct: Number(localStorage.getItem("axiom_risk_pct")) || 1,
      regime: (typeof computeRegime === "function" ? computeRegime(macroData).score : null),
      watchlist: watchlistSymbols || [],
      positions,
    };
    fetch("/api/market/ai-copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next, context: ctx }) })
      .then(async r => {
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          return { ok: false, error: (r.status === 502 || r.status === 503) ? "Server is waking up / redeploying — try again in a moment." : `Server not ready (HTTP ${r.status}).` };
        }
        return r.json();
      })
      .then(d => setMsgs(m => [...m, { role: "assistant", content: d.ok ? d.reply : `⚠ ${d.error === "invalid x-api-key" ? "AI key rejected — update ANTHROPIC_API_KEY in Render." : (d.error || "error")}` }]))
      .catch(e => setMsgs(m => [...m, { role: "assistant", content: `⚠ ${e.message}` }]))
      .finally(() => setBusy(false));
  };
  const suggestions = ["What's strong today?", "Why is NVDA moving?", "Should I hold my positions?", "Plan a trade for me"];
  return (
    <>
      <button onClick={() => setOpen(o => !o)} title="Trading Copilot"
        style={{ position: "fixed", bottom: 18, right: 18, zIndex: 9999, width: 54, height: 54, borderRadius: "50%", cursor: "pointer",
          border: "none", background: C.accent, color: "#fff", fontSize: 22, boxShadow: "0 6px 20px rgba(0,0,0,0.3)" }}>{open ? "✕" : "💬"}</button>
      {open && (
        <div style={{ position: "fixed", bottom: 82, right: 18, zIndex: 9999, width: "min(400px, 92vw)", height: "min(560px, 78vh)",
          display: "flex", flexDirection: "column", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 10px 40px rgba(0,0,0,0.4)", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.accent }}>🗣️ TRADING COPILOT <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 400, color: C.textDim }}>· knows your watchlist & positions</span></div>
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {msgs.length === 0 && (
              <div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 10, lineHeight: 1.5 }}>Ask me anything — I know your account, watchlist, positions, and the regime, and I can pull live news.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {suggestions.map(s => <button key={s} onClick={() => setInput(s)} style={{ textAlign: "left", fontFamily: SANS, fontSize: 12, padding: "7px 10px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.border}`, background: C.card, color: C.textSec }}>{s}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%",
                background: m.role === "user" ? C.accent : C.card, color: m.role === "user" ? "#fff" : C.text,
                border: m.role === "user" ? "none" : `1px solid ${C.border}`, borderRadius: 10, padding: "8px 11px",
                fontFamily: SANS, fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.content}</div>
            ))}
            {busy && <div style={{ alignSelf: "flex-start", fontFamily: MONO, fontSize: 11, color: C.textDim }}>🗣️ thinking…</div>}
            <div ref={endRef} />
          </div>
          <div style={{ display: "flex", gap: 6, padding: 10, borderTop: `1px solid ${C.border}` }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }}
              placeholder="Ask your copilot…" style={{ flex: 1, fontFamily: SANS, fontSize: 13, padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, outline: "none" }} />
            <button onClick={send} disabled={busy} style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, padding: "0 16px", borderRadius: 8, cursor: "pointer", border: "none", background: C.accent, color: "#fff" }}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}
