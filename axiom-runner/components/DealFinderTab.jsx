import { useState } from "react";

export default function DealFinderTab({ C, MONO, SANS }) {
  const [query, setQuery] = useState("laptop");
  const [budget, setBudget] = useState("600");
  const [use, setUse] = useState("everyday use — browsing, video, light work");
  const [out, setOut] = useState(null);  // null | "loading" | text | {error}
  const find = () => {
    setOut("loading");
    fetch("/api/market/deal-find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, budget, useCase: use }) })
      .then(r => r.json()).then(d => setOut(d && d.ok ? d.deals : { error: (d && d.error) || "no response" })).catch(e => setOut({ error: e.message }));
  };
  const presets = [["💻 Laptop", "laptop"], ["📱 Phone", "phone"], ["🎧 Headphones", "headphones"], ["📺 TV", "TV"], ["⌚ Smartwatch", "smartwatch"], ["🎮 Console", "game console"]];
  const inp = { fontFamily: SANS, fontSize: 14, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, outline: "none", width: "100%" };
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 20px" }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 4 }}>🛒 DEAL FINDER</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginBottom: 16 }}>Tell me what you want and your budget — Claude searches the live web for the best current deals: cheapest, good quality, best value.</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {presets.map(([lbl, q]) => (
          <button key={q} onClick={() => setQuery(q)} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, padding: "6px 11px", borderRadius: 7, cursor: "pointer", border: `1px solid ${query === q ? C.accent : C.border}`, background: query === q ? `${C.accent}14` : C.card, color: query === q ? C.accent : C.textSec }}>{lbl}</button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
        <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>WHAT ARE YOU LOOKING FOR?</div><input value={query} onChange={e => setQuery(e.target.value)} style={inp} placeholder="e.g. laptop, gaming laptop, 4K TV…" /></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px" }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>BUDGET ($)</div><input value={budget} onChange={e => setBudget(e.target.value)} type="number" style={inp} placeholder="600" /></div>
          <div style={{ flex: "3 1 300px" }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>WHAT FOR? (optional)</div><input value={use} onChange={e => setUse(e.target.value)} style={inp} placeholder="gaming, school, video editing…" /></div>
        </div>
      </div>
      <button onClick={find} disabled={out === "loading"} style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "11px 24px", borderRadius: 9, cursor: "pointer", border: "none", background: C.accent, color: "#fff" }}>
        {out === "loading" ? "🔎 searching the web…" : "🔎 FIND ME A DEAL"}
      </button>
      {out && out.error && <div style={{ fontFamily: SANS, fontSize: 13, color: C.amber, marginTop: 14 }}>Couldn't search — {out.error}</div>}
      {typeof out === "string" && out !== "loading" && (
        <div style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.7, whiteSpace: "pre-line", marginTop: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
          {out.split(/(https?:\/\/[^\s)]+)/g).map((part, i) => /^https?:\/\//.test(part)
            ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: C.accent, wordBreak: "break-all" }}>{part}</a>
            : part)}
        </div>
      )}
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 12 }}>Prices are pulled live from the web and can change — always verify on the retailer's site before buying.</div>
    </div>
  );
}
