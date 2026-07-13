import { useState, useCallback, useEffect } from "react";

export default function SecFilingsTab({ C, MONO, SANS, watchlistSymbols }) {
  const [symbol, setSymbol] = useState(watchlistSymbols?.[0] || "AAPL");
  const [input, setInput] = useState(watchlistSymbols?.[0] || "AAPL");
  const [filings, setFilings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (sym) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/market/sec?symbol=${encodeURIComponent(sym)}`);
      const d = await r.json();
      setFilings(d.filings || []);
      if (!d.filings?.length) setError("No recent filings found for " + sym);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(symbol); }, [symbol]);

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" };
  const typeColor = (t) => {
    if (t === "4") return C.amber;
    if (t === "8-K") return C.accent;
    if (t?.startsWith("13F")) return C.purple;
    return C.textDim;
  };

  return (
    <div style={{ padding: "0 0 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>SEC FILINGS</span>
        <div style={{ display: "flex", gap: 0, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
          <input value={input} onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") { setSymbol(input); } }}
            placeholder="AAPL"
            style={{ width: 80, background: C.surface, border: "none", color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 10px", outline: "none" }} />
          <button onClick={() => setSymbol(input)}
            style={{ background: C.accent, border: "none", color: "#fff", fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>GO</button>
        </div>
        {/* Quick watchlist buttons */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(watchlistSymbols || []).slice(0, 12).map(s => (
            <button key={s} onClick={() => { setSymbol(s); setInput(s); }}
              style={{ fontFamily: MONO, fontSize: 12, color: symbol === s ? C.accent : C.textDim,
                background: symbol === s ? C.accentGlow : "transparent",
                border: `1px solid ${symbol === s ? C.accent : C.border}`,
                borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>{s}</button>
          ))}
        </div>
        {loading && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⟳ Loading…</span>}
      </div>

      <div style={card}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>RECENT FILINGS — {symbol}</span>
          <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${symbol}&CIK=&type=&dateb=&owner=include&count=40&search_text=`}
            target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: MONO, fontSize: 12, color: C.accent, textDecoration: "none" }}>
            EDGAR →
          </a>
        </div>
        {error && !filings.length ? (
          <div style={{ padding: 30, textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>
            {error}
            <div style={{ marginTop: 10 }}>
              <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbol}&type=8-K&dateb=&owner=include&count=10`}
                target="_blank" rel="noopener noreferrer"
                style={{ color: C.accent, fontFamily: MONO, fontSize: 12 }}>
                View on SEC EDGAR →
              </a>
            </div>
          </div>
        ) : filings.length === 0 && !loading ? (
          <div style={{ padding: 30, textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>No filings found</div>
        ) : filings.map((f, i) => (
          <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, textDecoration: "none", background: "transparent", transition: "background 0.12s" }}
            onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: typeColor(f.type), minWidth: 48 }}>{f.type}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, minWidth: 90 }}>{f.date}</span>
            <span style={{ fontFamily: SANS, fontSize: 13, color: C.text, flex: 1 }}>{f.entity || f.desc || "—"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.accent }}>→</span>
          </a>
        ))}
      </div>

      <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center" }}>
        Form 4 = insider transactions · 8-K = material events · 13F = institutional holdings · Source: SEC EDGAR
      </div>
    </div>
  );
}
