import { useState } from "react";

export default function LeadResponderTab({ C, MONO, SANS }) {
  const [lead, setLead] = useState("");
  const [out, setOut] = useState(null);   // null | "loading" | {subject,body,...} | {error}
  const [copied, setCopied] = useState("");
  const gen = () => {
    if (!lead.trim()) { setOut({ error: "Paste the CarGurus lead email first." }); return; }
    setOut("loading");
    fetch("/api/market/lead-reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: lead }) })
      .then(r => r.json()).then(d => setOut(d && d.ok ? d : { error: (d && d.error) || "no response" })).catch(e => setOut({ error: e.message }));
  };
  const copy = (txt, what) => { navigator.clipboard?.writeText(txt); setCopied(what); setTimeout(() => setCopied(""), 1500); };
  const inp = { fontFamily: SANS, fontSize: 13, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, outline: "none", width: "100%" };
  const ok = out && typeof out === "object" && !out.error && out !== "loading";
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 20px" }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 4 }}>📧 LEAD RESPONDER</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginBottom: 14 }}>Paste a CarGurus (or any) lead email — Claude pulls out the customer & vehicle and writes the ready-to-send reply in your template.</div>
      <textarea value={lead} onChange={e => setLead(e.target.value)} rows={8} style={{ ...inp, fontFamily: MONO, fontSize: 12, resize: "vertical" }} placeholder="Paste the full CarGurus lead email here…" />
      <button onClick={gen} disabled={out === "loading"} style={{ marginTop: 10, fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "11px 24px", borderRadius: 9, cursor: "pointer", border: "none", background: C.accent, color: "#fff" }}>
        {out === "loading" ? "✍️ drafting reply…" : "✍️ DRAFT REPLY"}
      </button>
      {out && out.error && <div style={{ fontFamily: SANS, fontSize: 13, color: C.amber, marginTop: 14 }}>{out.error}</div>}
      {ok && (
        <div style={{ marginTop: 16 }}>
          {(out.customerEmail || out.customerPhone || out.vehicle) && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12, fontFamily: MONO, fontSize: 12, color: C.textSec }}>
              {out.firstName && <span>👤 {out.firstName}</span>}
              {out.customerEmail && <span>✉️ {out.customerEmail}</span>}
              {out.customerPhone && <span>📞 {out.customerPhone}</span>}
              {out.vehicle && <span>🚗 {out.vehicle}{out.price ? ` · $${out.price}` : ""}</span>}
            </div>
          )}
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>SUBJECT</div>
          <div style={{ ...inp, marginBottom: 10 }}>{out.subject}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>REPLY</div>
          <div style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.6, whiteSpace: "pre-line", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>{out.body}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => copy(out.body, "reply")} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 14px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.accent}`, background: `${C.accent}18`, color: C.accent }}>📋 Copy reply</button>
            {out.customerEmail && <a href={`mailto:${out.customerEmail}?subject=${encodeURIComponent(out.subject || "")}&body=${encodeURIComponent(out.body || "")}`} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 14px", borderRadius: 8, textDecoration: "none", border: `1px solid ${C.green}`, background: `${C.green}18`, color: C.green }}>✉️ Open in email →</a>}
            {copied && <span style={{ fontFamily: SANS, fontSize: 12, color: C.green, alignSelf: "center" }}>✓ copied {copied}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
