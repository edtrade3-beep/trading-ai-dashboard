import { useState, useEffect } from "react";
import { cardStyle, buttonChrome } from "./ui-helpers.js";

// ADVISOR AI — a long-horizon CIO-style research brief (src/advisor-ai.js).
// Same "real data + honest gaps" pattern as SmartMoneyBrief/CeoAiCard: one
// Claude call reasoning over real regime/sector/A+-scan/insider/COT/short
// data this platform already computes, plus live web search (via
// callAnthropicWithSearch) for macro/5-year-thesis context. Deliberately
// NOT the full "5 x 20-stock portfolio with 30 fabricated fields" the
// original spec asked for — this app has no 13F/Congress-trading/patent
// feed, so those are never fabricated; Claude is instructed to omit or cite
// real web search instead. See src/advisor-ai.js for the full rationale.

function stripMarkdown(s) {
  return String(s || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(^|\n)\s*#{1,6}\s*/g, "$1")
    .replace(/(^|\n)\s*[-*]\s+/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .trim();
}

const SECTIONS = [
  ["EXECUTIVE SUMMARY", "exec"],
  ["TACTICAL PICK", "tactical"],
  ["SWING PICK", "swing"],
  ["POSITION PICK", "position"],
  ["CORE PICK", "core"],
  ["5-YEAR THEMATIC THESIS", "thesis5y"],
  ["SECTOR RANKINGS", "sectors"],
  ["SMART MONEY READ", "smartMoney"],
  ["CEO ACTION PLAN", "actionPlan"],
];

// Splits ADVISOR's structured text response into labeled sections (see the
// system prompt in src/advisor-ai.js) — same regex-lookahead technique
// SmartMoneyBrief's parseBrief() uses, extended to 9 labels.
function parseReport(text) {
  const clean = stripMarkdown(text);
  const labels = SECTIONS.map(([label]) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const out = {};
  for (let i = 0; i < SECTIONS.length; i++) {
    const [label, key] = SECTIONS[i];
    const rest = labels.slice(i + 1);
    const re = new RegExp(`${labels[i]}\\s*(?:\\([^)]*\\))?:\\s*([\\s\\S]*?)(?=(?:${rest.join("|")})\\s*(?:\\([^)]*\\))?:|$)`, "i");
    const m = clean.match(re);
    out[key] = m ? m[1].trim() : "";
  }
  const hasAny = Object.values(out).some(v => v);
  return hasAny ? out : null;
}

export default function AdvisorAiTab({ C, MONO, SANS }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | empty | error

  useEffect(() => {
    fetch("/api/ai-hub/advisor-brief").then(r => r.json()).then(d => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); }
      else setState("empty");
    }).catch(() => setState("error"));
  }, []);

  const generate = () => {
    setLoading(true); setError(null);
    fetch("/api/ai-hub/advisor-brief/refresh", { method: "POST" }).then(r => r.json()).then(d => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); }
      else { setError(d?.error || "Failed to generate brief"); setState("error"); }
    }).catch(e => { setError(e.message || "Network error"); setState("error"); })
      .finally(() => setLoading(false));
  };

  const parsed = brief ? parseReport(brief.report) : null;

  const sectionCard = (label, body, color) => body ? (
    <div style={{ ...cardStyle(C), padding: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color, letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{body}</div>
    </div>
  ) : null;

  return (
    <div style={{ padding: "16px 20px", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text }}>🧭 ADVISOR AI</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            CIO-style research brief — real regime, sector rotation &amp; A+ setups from this platform, plus live web search for macro/tech context
          </div>
        </div>
        <button onClick={generate} disabled={loading}
          style={buttonChrome(C, { padding: "9px 18px", fontSize: 12, fontWeight: 800,
            background: loading ? C.surface : C.accent, color: loading ? C.textDim : "#fff", border: "none" })}>
          {loading ? "RESEARCHING…" : brief ? "↻ NEW BRIEF" : "GENERATE BRIEF"}
        </button>
      </div>

      {state === "error" && error && (
        <div style={{ ...cardStyle(C), padding: 16, borderColor: C.red }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ {error}</div>
        </div>
      )}

      {(state === "empty" || (state === "error" && !brief)) && !loading && (
        <div style={{ ...cardStyle(C), padding: 60, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 32, marginBottom: 12 }}>🧭</div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>Click Generate for a real, honest CIO-style read</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 6 }}>
            Regime · sector rotation · A+ setups · insider Form 4s · COT · short interest · web-searched macro context
          </div>
        </div>
      )}

      {loading && (
        <div style={{ ...cardStyle(C), padding: 60, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⌛ Reading regime, sectors, setups, smart-money data &amp; searching the web…</div>
        </div>
      )}

      {brief && !loading && (
        <>
          {(brief.regime || (brief.sectors && brief.sectors.length > 0)) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {brief.regime && (
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 10px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, color: C.text }}>
                  REGIME: {brief.regime.label} ({brief.regime.score}/100)
                </span>
              )}
              {(brief.sectors || []).map((s, i) => (
                <span key={i} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 8, background: `${C.green}18`, border: `1px solid ${C.border}`, color: C.green }}>
                  {i === 0 ? "LEADING: " : ""}{s}
                </span>
              ))}
            </div>
          )}

          {parsed ? (
            <>
              {sectionCard("EXECUTIVE SUMMARY", parsed.exec, C.accent)}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                {sectionCard("TACTICAL — 30 DAYS", parsed.tactical, C.green)}
                {sectionCard("SWING — 3 MONTHS", parsed.swing, C.green)}
                {sectionCard("POSITION — 6 MONTHS", parsed.position, C.green)}
                {sectionCard("CORE — 1 YEAR", parsed.core, C.green)}
              </div>
              {sectionCard("5-YEAR THEMATIC THESIS", parsed.thesis5y, C.purple)}
              {sectionCard("SECTOR RANKINGS", parsed.sectors, C.amber)}
              {sectionCard("SMART MONEY READ", parsed.smartMoney, C.amber)}
              {sectionCard("CEO ACTION PLAN", parsed.actionPlan, C.gold || C.accent)}
            </>
          ) : (
            sectionCard("BRIEF", stripMarkdown(brief.report), C.accent)
          )}

          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, textAlign: "right" }}>
            Generated {new Date(brief.generatedAt).toLocaleString([], { hour: "2-digit", minute: "2-digit" })} · AI-synthesized from real platform data + web search — not financial advice, cross-check before acting
          </div>
        </>
      )}
    </div>
  );
}
