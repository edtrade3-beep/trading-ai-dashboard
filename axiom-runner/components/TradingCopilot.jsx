import { useState, useRef, useEffect } from "react";

// 🗣️ Trading Copilot — floating chat backed entirely by real platform data
// (no Claude call — explicit user request 2026-09-11: "remove anthropic
// from anything else" outside Story AI). Every real question this answers
// (Morning Mode, Deep Scan, Market Narrative, weather, prayer times, the
// "مرحبا عدول" greeting) is a deterministic src/routes/market.js trigger;
// account/watchlist/positions context is no longer sent since nothing on
// the server reads it anymore.
export default function TradingCopilot({ C, MONO, SANS, statusBarH = 40, fabFading = false, isMobile = false }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);   // {role, content}
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [queuedQuery, setQueuedQuery] = useState(null);
  const endRef = useRef(null);

  // Master Agent — "first thing when I open the platform" (2026-09-11,
  // explicit user request). Auto-opens the panel once per real browser
  // session (sessionStorage, not localStorage — greets again on a fresh
  // session/new tab, but never re-nags on every activeTab switch within
  // the same one) and queues "good morning" through the exact same real
  // send() flow a manual click would use, so it goes through the exact
  // same /api/market/ai-copilot Morning Mode trigger — no separate path.
  useEffect(() => {
    let alreadyGreeted = true;
    try { alreadyGreeted = sessionStorage.getItem("axiom_copilot_greeted") === "1"; } catch {}
    if (alreadyGreeted) return;
    try { sessionStorage.setItem("axiom_copilot_greeted", "1"); } catch {}
    setOpen(true);
    // "مرحبا عدول" (explicit user request, 2026-09-11: "Instead of good
    // morning, say مرحبا عدول") — a personalized Arabic greeting, matched
    // by the same real Morning Mode trigger server-side alongside the
    // original English phrases (src/routes/market.js's ARABIC_GREETING_
    // TRIGGER), so this queued message gets the exact same real report.
    setQueuedQuery("مرحبا عدول");
  }, []); // eslint-disable-line
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

  // Microphone input (2026-09-11, explicit user request: "also use
  // microphone"). Real browser-native Web Speech API — no new backend,
  // no new cost, works in Chrome/Edge/Safari; Firefox has no
  // implementation, so this feature-detects and simply hides the mic
  // button there rather than showing a control that would silently do
  // nothing. Speaks the transcript into the same real input/send() path
  // a typed question uses — never a separate "voice command" parser, so
  // voice and typed questions always get identically grounded answers.
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const SpeechRecognitionCtor = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const micSupported = !!SpeechRecognitionCtor;
  const toggleListening = () => {
    if (!micSupported) return;
    if (listening) { recognitionRef.current?.stop(); return; }
    const rec = new SpeechRecognitionCtor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let transcript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setInput(transcript);
      const last = e.results[e.results.length - 1];
      if (last && last.isFinal) {
        const finalText = transcript.trim();
        if (finalText) send(finalText);
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };
  useEffect(() => () => recognitionRef.current?.stop(), []);

  const send = (override) => {
    const q = (override ?? input).trim(); if (!q || busy) return;
    const next = [...msgs, { role: "user", content: q }];
    setMsgs(next); setInput(""); setBusy(true);
    fetch("/api/market/ai-copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) })
      .then(async r => {
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          return { ok: false, error: (r.status === 502 || r.status === 503) ? "Server is waking up / redeploying — try again in a moment." : `Server not ready (HTTP ${r.status}).` };
        }
        return r.json();
      })
      .then(d => setMsgs(m => [...m, { role: "assistant", content: d.ok ? d.reply : `⚠ ${d.error || "error"}` }]))
      .catch(e => setMsgs(m => [...m, { role: "assistant", content: `⚠ ${e.message}` }]))
      .finally(() => setBusy(false));
  };
  const suggestions = ["good morning", "deep scan", "مرحبا عدول", "كيف داير الجو اليوم في المكان ديالي"];
  return (
    <>
      {/* bottom offsets add statusBarH (real, dynamic — can wrap to 2 lines)
          so this never sits on top of the fixed status bar at the very
          bottom of the viewport, same real-measurement fix applied to
          RealityCheckWidget/FloatingChecklistButton below it. */}
      {/* Mobile FAB stack (2026-08-23 revision — real user report: the old
          horizontal row of 4 buttons at the same bottom height spanned wide
          enough to permanently obscure real table rows/action buttons on
          an actual phone, confirmed via real screenshots — a narrower
          arrangement alone wasn't enough since content sits at that same
          right edge too). Two real changes: (1) stacked vertically at
          right:10 instead of spread horizontally (this button is
          bottom-most, closest to the tab bar); (2) hidden by default —
          fabFading is now driven by axiom-live.jsx's mobileFabsExpanded
          toggle (a new small "⚡" FAB) rather than the old scroll
          heuristic, so none of the 4 cover anything until the user
          explicitly asks for them. See RealityCheckWidget.jsx/
          FloatingChecklistButton.jsx/ChartSearchWidget.jsx for the rest
          of the column (114/166/218 above this one) — bottom:10 itself is
          reserved for the always-visible "⚡" expand toggle, not this
          button. */}
      <button className={`fab-copilot-btn${!isMobile && !open ? " fab-peek" : ""}`} onClick={() => setOpen(o => !o)} title="Trading Copilot"
        style={{ position: "fixed", bottom: (isMobile ? 62 : 18) + statusBarH, right: isMobile ? 10 : 18, zIndex: 9999,
          width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, borderRadius: "50%", cursor: "pointer",
          border: "none", background: C.accent, color: "#fff", fontSize: isMobile ? 14 : 16, boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
          opacity: fabFading && !open ? 0 : (isMobile || open ? 1 : undefined), pointerEvents: fabFading && !open ? "none" : "auto", transition: "opacity 0.2s" }}>{open ? "✕" : "💬"}</button>
      {open && (
        <div style={{ position: "fixed", bottom: 82 + statusBarH, right: 18, zIndex: 9999, width: "min(400px, 92vw)", height: "min(560px, 78vh)",
          display: "flex", flexDirection: "column", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 10px 40px rgba(0,0,0,0.4)", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.accent }}>🗣️ TRADING COPILOT <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 400, color: C.textDim }}>· real platform data only</span></div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {msgs.length === 0 && (
              <div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 10, lineHeight: 1.5 }}>Ask for a real market report, weather, or a prayer time — try one below.</div>
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
              placeholder={listening ? "Listening…" : "Ask your copilot…"} style={{ flex: 1, fontFamily: SANS, fontSize: 13, padding: "9px 11px", borderRadius: 8, border: `1px solid ${listening ? C.red : C.border}`, background: C.surface, color: C.text, outline: "none" }} />
            {micSupported && (
              <button onClick={toggleListening} title={listening ? "Stop listening" : "Speak your question"}
                style={{ fontFamily: MONO, fontSize: 14, padding: "0 12px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${listening ? C.red : C.border}`, background: listening ? C.red : C.surface, color: listening ? "#fff" : C.textSec,
                  animation: listening ? "copilot-mic-pulse 1.2s ease-in-out infinite" : "none" }}>🎤</button>
            )}
            <button onClick={() => send()} disabled={busy} style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, padding: "0 16px", borderRadius: 8, cursor: "pointer", border: "none", background: C.accent, color: "#fff" }}>➤</button>
          </div>
          {listening && (
            <style>{"@keyframes copilot-mic-pulse { 0%,100% { opacity:1; } 50% { opacity:0.55; } }"}</style>
          )}
        </div>
      )}
    </>
  );
}
