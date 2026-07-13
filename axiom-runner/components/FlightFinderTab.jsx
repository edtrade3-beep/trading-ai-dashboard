import { useState } from "react";

export default function FlightFinderTab({ C, MONO, SANS }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [when, setWhen] = useState("");
  const [roundTrip, setRoundTrip] = useState(true);
  const [flexible, setFlexible] = useState(true);
  const [out, setOut] = useState(null);
  const find = () => {
    if (!from.trim() || !to.trim()) { setOut({ error: "Enter where you're flying from and to." }); return; }
    setOut("loading");
    fetch("/api/market/flight-find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to, when, roundTrip, flexible }) })
      .then(r => r.json()).then(d => setOut(d && d.ok ? d.flights : { error: (d && d.error) || "no response" })).catch(e => setOut({ error: e.message }));
  };
  const inp = { fontFamily: SANS, fontSize: 14, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, outline: "none", width: "100%" };
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 20px" }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 4 }}>✈️ FLIGHT FINDER</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginBottom: 16 }}>Tell me where and roughly when — Claude searches live for the cheapest flights AND the best dates to fly and book.</div>
      <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>FROM</div><input value={from} onChange={e => setFrom(e.target.value)} style={inp} placeholder="City or airport (e.g. New York / JFK)" /></div>
          <div style={{ flex: "1 1 200px" }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>TO</div><input value={to} onChange={e => setTo(e.target.value)} style={inp} placeholder="City or airport (e.g. Dubai / DXB)" /></div>
        </div>
        <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>WHEN (optional — month, dates, "next month")</div><input value={when} onChange={e => setWhen(e.target.value)} style={inp} placeholder="e.g. mid-January, or Jan 14–21" /></div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {[["Round-trip", roundTrip, () => setRoundTrip(true)], ["One-way", !roundTrip, () => setRoundTrip(false)]].map(([lbl, on, fn]) => (
            <button key={lbl} onClick={fn} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 7, cursor: "pointer", border: `1px solid ${on ? C.accent : C.border}`, background: on ? `${C.accent}14` : C.card, color: on ? C.accent : C.textSec }}>{lbl}</button>
          ))}
          <button onClick={() => setFlexible(f => !f)} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 7, cursor: "pointer", border: `1px solid ${flexible ? C.green : C.border}`, background: flexible ? `${C.green}14` : C.card, color: flexible ? C.green : C.textSec }}>{flexible ? "📅 Flexible dates ✓" : "📅 Fixed dates"}</button>
        </div>
      </div>
      <button onClick={find} disabled={out === "loading"} style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "11px 24px", borderRadius: 9, cursor: "pointer", border: "none", background: C.accent, color: "#fff" }}>
        {out === "loading" ? "🔎 searching flights…" : "🔎 FIND CHEAP FLIGHTS"}
      </button>
      {out && out.error && <div style={{ fontFamily: SANS, fontSize: 13, color: C.amber, marginTop: 14 }}>{out.error}</div>}
      {typeof out === "string" && out !== "loading" && (
        <div style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.7, whiteSpace: "pre-line", marginTop: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
          {out.split(/(https?:\/\/[^\s)]+)/g).map((part, i) => /^https?:\/\//.test(part)
            ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: C.accent, wordBreak: "break-all" }}>{part}</a> : part)}
        </div>
      )}
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 12 }}>Prices are pulled live and change fast — always confirm on the booking site before purchasing.</div>
    </div>
  );
}
