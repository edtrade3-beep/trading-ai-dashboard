import { useState, useRef, useEffect } from "react";

// Voice AI (Phase 17, options platform redesign) — a thin client-side mic
// button over the browser's native Web Speech API. Zero new backend: a
// transcript just becomes paletteInput text and runs through the exact
// same real runPaletteCommand() pipeline every typed query already uses
// (including its real AI-copilot fallback for free-text questions like
// "Find the best call" / "Compare NVDA and AMD"). Honest scope limit —
// SpeechRecognition has no/inconsistent support in some browsers (notably
// Firefox); rendered as a disabled mic with a clear tooltip rather than a
// silently-broken button.
const SpeechRecognitionCtor = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export default function CommandPaletteModal({ C, MONO, paletteOpen, setPaletteOpen, paletteInput, setPaletteInput, runPaletteCommand }) {
  const [listening, setListening] = useState(false);
  const [voiceErr, setVoiceErr] = useState("");
  const recRef = useRef(null);

  useEffect(() => {
    if (!paletteOpen) { setListening(false); setVoiceErr(""); recRef.current?.abort?.(); }
  }, [paletteOpen]);

  if (!paletteOpen) return null;

  const startListening = () => {
    if (!SpeechRecognitionCtor) return;
    setVoiceErr("");
    const rec = new SpeechRecognitionCtor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || "";
      if (transcript) {
        const cmd = /\bgo\b/i.test(transcript) ? transcript : `${transcript} GO`;
        setPaletteInput(cmd);
        runPaletteCommand(cmd);
        setPaletteOpen(false);
        setPaletteInput("");
      }
    };
    rec.onerror = (e) => setVoiceErr(e.error === "not-allowed" ? "Microphone access denied." : "Voice input failed — try again.");
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };
  const stopListening = () => { recRef.current?.stop?.(); setListening(false); };

  return (
        <div onClick={() => setPaletteOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.18)", zIndex: 1200, display: "grid", placeItems: "start center", paddingTop: "14vh" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: "92vw", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 24px 60px rgba(15,27,45,0.18)" }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>AXIOM COMMAND PALETTE (GO)</div>
                {voiceErr && <div style={{ fontFamily: MONO, fontSize: 10, color: C.red }}>{voiceErr}</div>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  autoFocus
                  value={paletteInput}
                  onChange={(e) => setPaletteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      runPaletteCommand(paletteInput);
                      setPaletteOpen(false);
                      setPaletteInput("");
                    }
                  }}
                  placeholder="Examples: NVDA GO | EARNINGS GO | MACRO GO | TERMINAL GO | TF 15M GO"
                  style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "10px 12px", borderRadius: 6 }}
                />
                <button
                  onClick={() => (listening ? stopListening() : startListening())}
                  disabled={!SpeechRecognitionCtor}
                  title={SpeechRecognitionCtor ? (listening ? "Listening… click to stop" : "Speak a command") : "Voice input not supported in this browser (try Chrome/Edge)"}
                  style={{
                    width: 42, borderRadius: 6, border: `1px solid ${listening ? C.red : C.border}`,
                    background: listening ? `${C.red}18` : C.bg, color: SpeechRecognitionCtor ? (listening ? C.red : C.textSec) : C.textDim,
                    cursor: SpeechRecognitionCtor ? "pointer" : "not-allowed", fontSize: 16,
                  }}
                >{listening ? "⏺" : "🎤"}</button>
              </div>
            </div>
            <div style={{ padding: "10px 12px", display: "grid", gap: 4 }}>
              {["NVDA GO", "EARNINGS GO", "MACRO GO", "NEWS GO", "TV GO", "ALERTS GO", "AGENT GO", "WORKFLOW GO", "FLOW GO", "PORTFOLIO GO", "SCANNER GO", "BACKTEST GO", "TERMINAL GO", "JOURNAL GO", "TF 5M GO", "TF 1D GO", "LAYOUT 2 GO", "LAYOUT 4 GO", "QURAN GO", "ATHAN GO", "ATHKAR GO", "TASBIH GO", "REVIEW MY PORTFOLIO GO", "COMPARE NVDA VS AMD GO", "FIND BREAKOUTS GO"].map((cmd) => (
                <button key={cmd} onClick={() => { runPaletteCommand(cmd); setPaletteOpen(false); setPaletteInput(""); }} style={{ textAlign: "left", border: `1px solid ${C.border}`, background: C.card, borderRadius: 6, padding: "8px 10px", cursor: "pointer", fontFamily: MONO, fontSize: 12, color: C.textSec }}>
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </div>
  );
}
