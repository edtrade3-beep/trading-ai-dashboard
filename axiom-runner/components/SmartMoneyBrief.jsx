import { useState } from "react";
import { cardStyle, buttonChrome } from "./ui-helpers.js";

// The system prompt tells Claude to skip markdown, but models don't always
// comply perfectly — strip common markdown artifacts as a safety net so raw
// "**"/"##"/"- " never leaks into the UI.
function stripMarkdown(s) {
  return String(s || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(^|\n)\s*#{1,6}\s*/g, "$1")
    .replace(/(^|\n)\s*[-*]\s+/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .trim();
}

// Splits the AI brief into its 3 labeled sections (see the system prompt in
// src/routes/market.js POST /api/market/smart-money-brief) for nicer display.
function parseBrief(text) {
  const clean = stripMarkdown(text);
  const grab = (label, nextLabels) => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=(?:${nextLabels.join("|")}):|$)`, "i");
    const m = clean.match(re);
    return m ? m[1].trim() : "";
  };
  const whats = grab("WHAT'S REALLY HAPPENING", ["VS\\. THE HEADLINES", "WATCH"]);
  const vs    = grab("VS\\. THE HEADLINES", ["WATCH"]);
  const watch = grab("WATCH", []);
  if (!whats && !vs && !watch) return null; // didn't match the expected format — fall back to raw text
  return { whats, vs, watch };
}

export default function SmartMoneyBrief({ C, MONO, SANS, watchlistSymbols }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [brief, setBrief]     = useState(null);   // { text, sources, generatedAt }

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const symbols = (watchlistSymbols || []).slice(0, 8);
      const r = await fetch("/api/market/smart-money-brief", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || "Failed to generate brief"); setBrief(null); }
      else setBrief({ text: d.brief, sources: d.sources || [], generatedAt: d.generatedAt });
    } catch (e) { setError(e.message || "Network error"); }
    finally { setLoading(false); }
  };

  const parsed = brief ? parseBrief(brief.text) : null;

  const sectionCard = (label, body, color) => (
    <div style={{ ...cardStyle(C), padding: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color, letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{body}</div>
    </div>
  );

  return (
    <div style={{ padding: "16px 20px", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text }}>🕵️ SMART MONEY BRIEF</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            Reads dark pool, options flow, insider buys, COT positioning &amp; short interest — tells you what's really happening, not what the headlines say
          </div>
        </div>
        <button onClick={generate} disabled={loading}
          style={buttonChrome(C, { padding: "9px 18px", fontSize: 12, fontWeight: 800,
            background: loading ? C.surface : C.accent, color: loading ? C.textDim : "#fff", border: "none" })}>
          {loading ? "READING THE TAPE…" : brief ? "↻ REFRESH BRIEF" : "GENERATE BRIEF"}
        </button>
      </div>

      {error && (
        <div style={{ ...cardStyle(C), padding: 16, borderColor: C.red }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ {error}</div>
        </div>
      )}

      {!brief && !loading && !error && (
        <div style={{ ...cardStyle(C), padding: 60, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 32, marginBottom: 12 }}>🕵️</div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>Click Generate to read across today's positioning data</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 6 }}>Dark pool · options flow · insider Form 4s · COT · short interest — synthesized by AI</div>
        </div>
      )}

      {loading && (
        <div style={{ ...cardStyle(C), padding: 60, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⌛ Pulling dark pool, options flow, insider, COT &amp; short interest data…</div>
        </div>
      )}

      {brief && !loading && (
        <>
          {parsed ? (
            <>
              {sectionCard("WHAT'S REALLY HAPPENING", parsed.whats, C.accent)}
              {sectionCard("VS. THE HEADLINES", parsed.vs, C.amber)}
              {sectionCard("WATCH", parsed.watch, C.green)}
            </>
          ) : (
            sectionCard("BRIEF", stripMarkdown(brief.text), C.accent)
          )}

          <details style={{ ...cardStyle(C), padding: 14 }}>
            <summary style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.textDim, cursor: "pointer", letterSpacing: "0.05em" }}>
              DATA SOURCES USED (click to expand)
            </summary>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {brief.sources.map((s, i) => (
                <div key={i} style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>• {s}</div>
              ))}
            </div>
          </details>

          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, textAlign: "right" }}>
            Generated {new Date(brief.generatedAt).toLocaleTimeString()} · not financial advice — cross-check before acting
          </div>
        </>
      )}
    </div>
  );
}
