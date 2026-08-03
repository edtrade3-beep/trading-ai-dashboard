import { useState, useEffect, useCallback } from "react";

// ─── OptionsChainTab ────────────────────────────────────────────────────────
export default function OptionsChainTab({ C, MONO, SANS, defaultSymbol, onOpenTerminal }) {
  const [symbol, setSymbol] = useState(defaultSymbol || "AAPL");
  const [input, setInput] = useState(defaultSymbol || "AAPL");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [view, setView] = useState("calls"); // calls | puts | both
  const [strikeRange, setStrikeRange] = useState(10); // show N strikes each side of ATM
  // Smart Option Chain — options platform redesign Phase 5 (spec: "sort by
  // opportunity, not strike"). rankScore/pop/liquidityScore are computed
  // server-side (options-math.js's rankContracts, wired into
  // /api/market/options) — this is presentation-only, one ranking engine.
  // Default fixed 2026-08-04 (readability sweep) — this was hardcoded to
  // "strike" the whole time, directly contradicting the spec quoted above:
  // a first-time visitor saw strike-ordered contracts and had to know to
  // switch SORT BY to see the real ranked read this page was built for.
  const [sortBy, setSortBy] = useState("opportunity");

  const load = useCallback(async (sym, expiry) => {
    setLoading(true); setError(null);
    try {
      const url = `/api/market/options?symbol=${encodeURIComponent(sym)}${expiry ? `&expiry=${expiry}` : ""}`;
      const r = await fetch(url);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Failed");
      setData(d);
      setSelectedExpiry(d.selectedExpiry);
    } catch (e) { setError(e.message); setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(symbol); }, [symbol]);

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 };

  const atm = data?.underlying || 0;
  const filterStrikes = (contracts) => {
    if (!atm || !contracts?.length) return contracts || [];
    const strikes = contracts.map(c => c.strike).sort((a, b) => a - b);
    const closest = strikes.reduce((prev, curr) => Math.abs(curr - atm) < Math.abs(prev - atm) ? curr : prev, strikes[0]);
    const idx = strikes.indexOf(closest);
    const lo = strikes[Math.max(0, idx - strikeRange)];
    const hi = strikes[Math.min(strikes.length - 1, idx + strikeRange)];
    return contracts.filter(c => c.strike >= lo && c.strike <= hi);
  };

  // Smart Option Chain sort keys — spec: "Best Opportunity, Highest
  // Probability, Highest Liquidity, Best Risk/Reward, Highest AI Score,
  // Highest Institutional Interest, Highest Gamma, Lowest Spread, Highest
  // Open Interest, Highest Volume" instead of strike order. rankScore/pop/
  // liquidityScore are the real server-computed fields (options-math.js);
  // "Highest AI Score" and "Highest Institutional Interest" both map to
  // rankScore here (this standalone chain page has no per-symbol AI Trade
  // Score/Institution Score of its own — those live on the Charts page's
  // AiTradeCard, Phase 5/4 — so rankScore, which already blends real POP +
  // liquidity, is the closest honest proxy rather than inventing a second
  // number). Real spread computed from real bid/ask for the Lowest Spread
  // sort (not stored on the contract, cheap to derive here).
  const spreadOf = (c) => (c.bid > 0 && c.ask > 0 && c.ask >= c.bid) ? (c.ask - c.bid) / ((c.ask + c.bid) / 2) : Infinity;
  const SORT_OPTIONS = [
    { id: "opportunity", label: "Best Opportunity", key: (c) => c.rankScore ?? -1, dir: -1 },
    { id: "probability", label: "Highest Probability", key: (c) => c.pop ?? -1, dir: -1 },
    { id: "liquidity", label: "Highest Liquidity", key: (c) => c.liquidityScore ?? -1, dir: -1 },
    { id: "aiscore", label: "Highest AI / Institutional Score", key: (c) => c.rankScore ?? -1, dir: -1 },
    { id: "gamma", label: "Highest Gamma", key: (c) => Math.abs(c.gamma ?? 0), dir: -1 },
    { id: "spread", label: "Lowest Spread", key: spreadOf, dir: 1 },
    { id: "oi", label: "Highest Open Interest", key: (c) => c.openInterest ?? 0, dir: -1 },
    { id: "volume", label: "Highest Volume", key: (c) => c.volume ?? 0, dir: -1 },
    { id: "strike", label: "Strike", key: (c) => c.strike ?? 0, dir: 1 },
  ];
  const sortContracts = (contracts) => {
    const opt = SORT_OPTIONS.find(o => o.id === sortBy) || SORT_OPTIONS[SORT_OPTIONS.length - 1];
    return [...(contracts || [])].sort((a, b) => (opt.key(a) - opt.key(b)) * opt.dir);
  };

  const ColH = ({ children, align = "right" }) => (
    <th style={{ padding: "8px 10px", fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: align, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{children}</th>
  );

  const ContractRow = ({ c, type }) => {
    const itm = c.inTheMoney;
    const bg = itm ? (type === "calls" ? `${C.green}0a` : `${C.red}0a`) : "transparent";
    return (
      <tr style={{ background: bg }}>
        <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: itm ? (type === "calls" ? C.green : C.red) : C.text, borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>${c.strike}</td>
        <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, color: C.text, borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>${c.lastPrice}</td>
        <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, color: C.textDim, borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>${c.bid} / ${c.ask}</td>
        <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, color: c.change >= 0 ? C.green : C.red, borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>
          {c.change >= 0 ? "+" : ""}{c.change}
        </td>
        <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, color: C.textDim, borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>{c.volume?.toLocaleString()}</td>
        <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, color: C.textDim, borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>{c.openInterest?.toLocaleString()}</td>
        <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, borderBottom: `1px solid ${C.border}`, textAlign: "right",
          color: c.iv > 80 ? C.red : c.iv > 50 ? C.amber : C.green }}>
          {c.iv > 0 ? c.iv + "%" : "—"}
        </td>
        <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, borderBottom: `1px solid ${C.border}`, textAlign: "right",
          color: Math.abs(c.delta || 0) > 0.5 ? C.text : C.textDim }}>
          {c.delta != null ? c.delta : "—"}
        </td>
        <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, color: C.textDim, borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>
          {c.gamma != null ? c.gamma : "—"}
        </td>
        <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, color: C.textDim, borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>
          {c.theta != null ? c.theta : "—"}
        </td>
        <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, color: C.textDim, borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>
          {c.vega != null ? c.vega : "—"}
        </td>
        <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, borderBottom: `1px solid ${C.border}`, textAlign: "right", color: c.pop != null && c.pop >= 60 ? C.green : C.textDim }} title="Real probability of profit — Black-Scholes when IV/strike/DTE are all real, else the contract's own real delta as an approximation">
          {c.pop != null ? `${c.pop}%` : "—"}
        </td>
        <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 800, borderBottom: `1px solid ${C.border}`, textAlign: "right", color: c.rankScore >= 65 ? C.green : c.rankScore >= 40 ? C.amber : C.textDim }} title="Real composite of POP + liquidity — the Smart Option Chain's opportunity ranking">
          {c.rankScore ?? "—"}
        </td>
        <td style={{ padding: "7px 10px", borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
          {itm && <span style={{ fontFamily: MONO, fontSize: 12, color: type === "calls" ? C.green : C.red, fontWeight: 700 }}>ITM</span>}
        </td>
      </tr>
    );
  };

  const ChainTable = ({ contracts, type }) => {
    const filtered = sortContracts(filterStrikes(contracts));
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.surface }}>
              <ColH>STRIKE</ColH>
              <ColH>LAST</ColH>
              <ColH>BID / ASK</ColH>
              <ColH>CHG</ColH>
              <ColH>VOLUME</ColH>
              <ColH>OI</ColH>
              <ColH>IV</ColH>
              <ColH>DELTA</ColH>
              <ColH>GAMMA</ColH>
              <ColH>THETA</ColH>
              <ColH>VEGA</ColH>
              <ColH>POP</ColH>
              <ColH>OPP</ColH>
              <ColH align="center"> </ColH>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={14} style={{ padding: 20, textAlign: "center", color: C.textDim, fontFamily: MONO, fontSize: 12 }}>No contracts for this expiry</td></tr>
              : filtered.map((c, i) => <ContractRow key={i} c={c} type={type} />)
            }
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>OPTIONS CHAIN</span>
        <div style={{ display: "flex", gap: 0, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") { setSymbol(input); load(input); } }}
            placeholder="AAPL"
            style={{ width: 80, background: C.surface, border: "none", color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 10px", outline: "none" }}
          />
          <button onClick={() => { setSymbol(input); load(input); }}
            style={{ background: C.accent, border: "none", color: "#fff", fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>
            GO
          </button>
        </div>
        {data?.underlying > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text }}>
            {symbol} @ <span style={{ color: C.accent }}>${data.underlying}</span>
          </span>
        )}
        {loading && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⟳ Loading…</span>}
        {error && <span style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ {error}</span>}
      </div>

      {data && (
        <>
          {/* Expiry selector + controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>EXPIRY:</span>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {(data.expiryDates || []).slice(0, 8).map(d => (
                <button key={d}
                  onClick={() => { setSelectedExpiry(d); load(symbol, d); }}
                  style={{
                    fontFamily: MONO, fontSize: 12, fontWeight: selectedExpiry === d ? 800 : 400,
                    color: selectedExpiry === d ? C.accent : C.textDim,
                    background: selectedExpiry === d ? C.accentGlow : "transparent",
                    border: `1px solid ${selectedExpiry === d ? C.accent : C.border}`,
                    borderRadius: 5, padding: "3px 10px", cursor: "pointer",
                  }}>{d}</button>
              ))}
            </div>
            <span style={{ width: 1, height: 16, background: C.border }} />
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>VIEW:</span>
            {["calls","puts","both"].map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ fontFamily: MONO, fontSize: 12, fontWeight: view === v ? 800 : 400,
                  color: view === v ? (v === "calls" ? C.green : v === "puts" ? C.red : C.accent) : C.textDim,
                  background: "transparent", border: `1px solid ${view === v ? C.border : C.border}`, borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}>
                {v.toUpperCase()}
              </button>
            ))}
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>± STRIKES:</span>
            <select value={strikeRange} onChange={e => setStrikeRange(Number(e.target.value))}
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "3px 6px", borderRadius: 6 }}>
              {[5,10,15,20,30].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span style={{ width: 1, height: 16, background: C.border }} />
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>SORT BY:</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ background: C.surface, border: `1px solid ${C.accent}66`, color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "3px 6px", borderRadius: 6 }}>
              {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>

          {/* Chain tables */}
          {(view === "calls" || view === "both") && (
            <div style={{ ...card, marginBottom: 14 }}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.green }}>
                CALLS — {symbol} · {selectedExpiry} · {filterStrikes(data.calls).length} contracts
              </div>
              <ChainTable contracts={data.calls} type="calls" />
            </div>
          )}
          {(view === "puts" || view === "both") && (
            <div style={{ ...card }}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.red }}>
                PUTS — {symbol} · {selectedExpiry} · {filterStrikes(data.puts).length} contracts
              </div>
              <ChainTable contracts={data.puts} type="puts" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
