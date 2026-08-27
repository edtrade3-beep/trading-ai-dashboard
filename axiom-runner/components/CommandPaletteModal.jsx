import { useState, useRef, useEffect, useMemo } from "react";

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

// Curated, honestly-labeled subset of runPaletteCommand's real alias map
// (axiom-live.jsx) — not every one of its ~150 aliases (many are legacy/
// personal-utility, not what a trader is scanning for here), just the
// destinations a "what deserves my attention" search should surface.
// TRADEJOURNAL/BREAKOUTS are aliases added alongside this redesign; every
// other cmd below already worked, this list just makes them discoverable
// by typing instead of only by knowing the exact keyword in advance.
const SUGGESTED_COMMANDS = [
  { label: "Earnings Calendar", hint: "upcoming & past earnings", cmd: "EARNINGS GO" },
  { label: "Breakouts", hint: "Sniper Scanner, breakout category", cmd: "BREAKOUTS GO" },
  { label: "Options Flow", hint: "unusual options activity", cmd: "FLOW GO" },
  { label: "Trade Journal", hint: "your logged trades", cmd: "JOURNAL GO" },
  { label: "AI Trade Coach", hint: "morning game plan, weekly review", cmd: "TRADECOACH GO" },
  { label: "Alerts", hint: "priority alerts", cmd: "ALERTS GO" },
  { label: "Portfolio", hint: "positions & P&L", cmd: "PORTFOLIO GO" },
  { label: "News", hint: "headlines & sentiment", cmd: "NEWS GO" },
  { label: "Crypto", hint: "crypto markets", cmd: "CRYPTO GO" },
  { label: "Calendar / Fed Watch", hint: "FOMC & econ events", cmd: "CALENDAR GO" },
  { label: "Sniper Scanner", hint: "scan for setups", cmd: "SCANNER GO" },
  { label: "Watchlists", hint: "your watchlists", cmd: "WATCHLISTS GO" },
  { label: "Charts", hint: "per-symbol workspace", cmd: "CHARTS GO" },
  { label: "Dashboard / Home", hint: "command center", cmd: "DASHBOARD GO" },
  { label: "Green Light Autopilot", hint: "auto entries/exits", cmd: "GREENLIGHT GO" },
  { label: "Predictions", hint: "weekly/monthly/yearly targets + real win rate", cmd: "PREDICTIONS GO" },
  { label: "Autopilot 2.0", hint: "real $100k autonomous paper account", cmd: "AUTOPILOT2 GO" },
  { label: "Review my portfolio", hint: "ask the AI copilot", cmd: "REVIEW MY PORTFOLIO GO" },
];

const TICKER_RE = /^[A-Z.\-]{1,10}$/;

export default function CommandPaletteModal({ C, MONO, paletteOpen, setPaletteOpen, paletteInput, setPaletteInput, runPaletteCommand }) {
  const [listening, setListening] = useState(false);
  const [voiceErr, setVoiceErr] = useState("");
  const [highlight, setHighlight] = useState(0);
  const recRef = useRef(null);

  useEffect(() => {
    if (!paletteOpen) { setListening(false); setVoiceErr(""); recRef.current?.abort?.(); }
  }, [paletteOpen]);

  // Live results — no intermediate "search results page": whatever's
  // highlighted here is exactly what Enter/click runs, immediately.
  const results = useMemo(() => {
    const q = paletteInput.trim();
    if (!q) return SUGGESTED_COMMANDS;
    const qUpper = q.toUpperCase();
    const qLower = q.toLowerCase();
    // Real destination-label matches rank above the speculative ticker
    // guess — a curated label match is a stronger signal than "any short
    // uppercase-able string could theoretically be a ticker" (e.g. typing
    // "break" should default to the real Breakouts destination, not a
    // guessed jump to a ticker literally named BREAK).
    const out = SUGGESTED_COMMANDS.filter(s =>
      s.label.toLowerCase().includes(qLower) || (s.hint || "").toLowerCase().includes(qLower)
    );
    if (TICKER_RE.test(qUpper)) {
      out.push({ label: `Go to ${qUpper}`, hint: "chart, decision, options, news, journal — one workspace", cmd: `${qUpper} GO`, ticker: true });
    }
    if (!out.length) out.push({ label: `Ask the AI Copilot: "${q}"`, hint: "free-text — flow, comparisons, plans", cmd: q, freeText: true });
    return out;
  }, [paletteInput]);

  useEffect(() => { setHighlight(0); }, [paletteInput, paletteOpen]);

  if (!paletteOpen) return null;

  const run = (cmd) => {
    runPaletteCommand(cmd);
    setPaletteOpen(false);
    setPaletteInput("");
  };

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
                    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(h + 1, results.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
                    else if (e.key === "Enter") {
                      const picked = results[highlight];
                      run(picked ? picked.cmd : paletteInput);
                    }
                  }}
                  placeholder="Search a ticker or a destination — NVDA, Earnings, Breakouts, Journal…"
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
            <div style={{ padding: "6px 8px", display: "grid", gap: 2, maxHeight: 360, overflowY: "auto" }}>
              {results.map((r, i) => (
                <div key={r.cmd + i} onClick={() => run(r.cmd)} onMouseEnter={() => setHighlight(i)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    textAlign: "left", borderRadius: 6, padding: "9px 10px", cursor: "pointer",
                    background: i === highlight ? `${C.accent}18` : "transparent",
                    border: `1px solid ${i === highlight ? C.accent : "transparent"}`,
                  }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: r.ticker ? C.accent : C.text, whiteSpace: "nowrap" }}>{r.label}</span>
                    {r.hint && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.hint}</span>}
                  </div>
                  {i === highlight && <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, flexShrink: 0 }}>↵</span>}
                </div>
              ))}
            </div>
            <div style={{ padding: "6px 12px 10px", fontFamily: MONO, fontSize: 10, color: C.textDim, borderTop: `1px solid ${C.border}` }}>
              ↑↓ to navigate · ↵ to go · no results page — picking one navigates immediately
            </div>
          </div>
        </div>
  );
}
