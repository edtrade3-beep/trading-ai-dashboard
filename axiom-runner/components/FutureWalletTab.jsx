import { useState, useEffect, useMemo } from "react";
import { NUM } from "./theme.js";
import { PanelErrorBoundary } from "./ui-atoms.jsx";

// FutureWalletTab.jsx — rebuilt 2026-08-19 (explicit user feedback: "dont
// like future wallet too much data nor organized hard to read hard to
// understand no deep dice in each company also i only want us companies
// now"). Previously this just iframed a static, one-time-generated
// 3,591-line HTML report (future-wallet-report.html, 2026-08-16 snapshot,
// 50,374px of continuous scroll, the same ~11 sector categories listed
// twice before any per-company depth) — confirmed via direct screenshots
// during the redesign audit, not assumed. That report is left on disk,
// just no longer the primary UI.
//
// This is a real, live screener on top of the Future Wallet API
// (src/routes/future-wallet.js) — no new backend, every field below is
// real data already computed and stored server-side. US-only by default
// (94 of 100 real candidates; 6 non-US names available via "Show all").
// Same collapse-to-expand deep-dive convention as DecisionCard.jsx.
const SCORE_COLOR = (v) => !Number.isFinite(v) ? null : v >= 65 ? "#0d9465" : v >= 45 ? "#d6a312" : "#c8282a";
const SCORE_DOT = (col) => col === "#0d9465" ? "🟢" : col === "#d6a312" ? "🟡" : col === "#c8282a" ? "🔴" : "⚪";
const fmtPct = (v) => Number.isFinite(v) ? (v * 100 >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%" : "—";
const fmtNum = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : "—";
const fmtBig = (v) => {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + "M";
  return v.toFixed(0);
};

// BTC + HPC Deep Scan, folded into Future Wallet as a filter toggle
// (2026-08-30, explicit user request: "i want btc+hpc inside future
// wallet as a sub tab use same set up same engine as future wallet") —
// same real universe src/btc-hpc-scan.js's HPC_MINER_UNIVERSE used,
// server-seeded into fw_universe (src/future-wallet-universe.js) so these
// 12 tickers flow through the exact same real quant/technical/potential/
// agent pipeline as every other Future Wallet candidate. A ticker-
// membership filter, not a sector filter — these real companies land in
// whatever real FMP sector/industry they actually report (some read
// "Financial Services," some "Technology"), which this deliberately
// doesn't override.
const BTC_HPC_TICKERS = new Set(["IREN", "WULF", "CORZ", "CIFR", "RIOT", "MARA", "CLSK", "HUT", "BITF", "HIVE", "APLD", "BTBT"]);

export default function FutureWalletTab({ C, MONO, SANS }) {
  const [universe, setUniverse] = useState(null);
  const [quant, setQuant] = useState([]);
  const [technical, setTechnical] = useState([]);
  const [potential, setPotential] = useState([]);
  const [agentRows, setAgentRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Real handoff from Light Box's "🐎 TOP HORSES" / "⭐ BEST OF BOTH WORLDS"
  // cards (Horse Hunter upgrade, 2026-08-26) — same one-time localStorage
  // read pattern axiom-live.jsx's other cross-tab handoffs already use
  // (mterminal_load_sym, lightbox_handoff_opportunity), honestly discarded
  // if stale (>60s) so a leftover key from an old session never silently
  // re-fires. Pre-fills the search box too, so the symbol is findable even
  // if it falls outside the default US-only/sector filters.
  const horseHandoff = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("lightbox_horse_handoff");
      if (!raw) return null;
      localStorage.removeItem("lightbox_horse_handoff");
      const { symbol, ts } = JSON.parse(raw);
      if (!symbol || !ts || Date.now() - ts > 60_000) return null;
      return symbol;
    } catch { return null; }
  })[0];

  const [search, setSearch] = useState(horseHandoff || "");
  const [sectorFilter, setSectorFilter] = useState("ALL");
  const [btcHpcOnly, setBtcHpcOnly] = useState(false);
  const [showAll, setShowAll] = useState(!!horseHandoff); // real handoff may land on a non-US symbol; only default true when arriving via handoff — preserves the normal US-only default otherwise
  const [expanded, setExpanded] = useState(horseHandoff || null);
  const [runningFor, setRunningFor] = useState(null);

  const loadAll = () => {
    setLoading(true); setError(null);
    Promise.all([
      fetch("/api/future-wallet/universe").then(r => r.json()),
      fetch("/api/future-wallet/quant-metrics").then(r => r.json()),
      fetch("/api/future-wallet/technical-scores").then(r => r.json()),
      fetch("/api/future-wallet/future-potential").then(r => r.json()),
      fetch("/api/future-wallet/agent-analysis").then(r => r.json()),
    ]).then(([u, q, t, p, a]) => {
      if (!u.ok) throw new Error(u.error || "Failed to load candidate universe");
      setUniverse(u.rows || []);
      setQuant(q.rows || []);
      setTechnical(t.rows || []);
      setPotential(p.rows || []);
      setAgentRows(a.rows || []);
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { loadAll(); }, []);

  const rows = useMemo(() => {
    if (!universe) return [];
    const qBy = new Map(quant.map(r => [r.symbol, r]));
    const tBy = new Map(technical.map(r => [r.symbol, r]));
    const pBy = new Map(potential.map(r => [r.symbol, r]));
    const aBy = new Map();
    agentRows.forEach(r => { if (!aBy.has(r.symbol)) aBy.set(r.symbol, []); aBy.get(r.symbol).push(r); });
    return universe.map(u => ({
      ...u,
      quant: qBy.get(u.ticker) || null,
      technical: tBy.get(u.ticker) || null,
      potential: pBy.get(u.ticker) || null,
      agents: aBy.get(u.ticker) || [],
    }));
  }, [universe, quant, technical, potential, agentRows]);

  const sectors = useMemo(() => Array.from(new Set(rows.map(r => r.sector).filter(Boolean))).sort(), [rows]);
  const nonUsCount = useMemo(() => rows.filter(r => r.country !== "US").length, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return rows
      .filter(r => btcHpcOnly ? BTC_HPC_TICKERS.has(r.ticker) : (showAll || r.country === "US"))
      .filter(r => btcHpcOnly || sectorFilter === "ALL" || r.sector === sectorFilter)
      .filter(r => !q || r.ticker.toUpperCase().includes(q) || (r.company || "").toUpperCase().includes(q))
      .sort((a, b) => (Number(b.potential?.future_potential_score) || -1) - (Number(a.potential?.future_potential_score) || -1));
  }, [rows, showAll, sectorFilter, btcHpcOnly, search]);

  const runDeepResearch = (ticker) => {
    setRunningFor(ticker);
    fetch("/api/future-wallet/run-agent-swarm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: [ticker] }),
    }).then(r => r.json())
      .then(() => fetch("/api/future-wallet/agent-analysis").then(r => r.json()))
      .then(a => { if (a.ok) setAgentRows(a.rows || []); })
      .catch(() => {})
      .finally(() => setRunningFor(null));
  };

  const chip = (active, onClick, label) => (
    <button key={label} onClick={onClick}
      style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7, cursor: "pointer",
        border: `1px solid ${active ? C.accent : C.border}`, background: active ? `${C.accent}18` : C.surface, color: active ? C.accent : C.textSec }}>
      {label}
    </button>
  );

  const statBox = (label, val, col) => (
    <div key={label} style={{ flex: "1 1 110px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: C.textDim, letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontFamily: NUM, fontSize: 15, fontWeight: 800, color: col || C.text }}>{val}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>💰 FUTURE WALLET</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            {loading ? "Loading real candidate data…" : btcHpcOnly
              ? `${filtered.length} of ${BTC_HPC_TICKERS.size} real BTC-mining/HPC-hosting candidates · sorted by Future Potential Score`
              : `${filtered.length} of ${universe ? universe.length : 0} real candidates · sorted by Future Potential Score`}
          </div>
        </div>
        <button onClick={loadAll} disabled={loading}
          style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: loading ? "default" : "pointer" }}>
          {loading ? "⌛ Loading…" : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, background: C.redBg || `${C.red}12`, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
          ⚠ {error}
        </div>
      )}

      {!loading && !error && (
        <>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search ticker or company…"
            style={{ flex: "1 1 220px", fontFamily: MONO, fontSize: 13, padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text }} />
          <button onClick={() => setShowAll(v => !v)} disabled={btcHpcOnly}
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 7, cursor: btcHpcOnly ? "default" : "pointer", opacity: btcHpcOnly ? 0.4 : 1,
              border: `1px solid ${showAll ? C.accent : C.border}`, background: showAll ? `${C.accent}18` : "transparent", color: showAll ? C.accent : C.textDim }}>
            {showAll ? `✓ Showing all (incl. ${nonUsCount} non-US)` : `🇺🇸 US only — show all →`}
          </button>
          <button onClick={() => { setBtcHpcOnly(v => !v); setSectorFilter("ALL"); }}
            title="The real BTC-mining/HPC-hosting pivot universe (IREN/WULF/CORZ/CIFR/RIOT/MARA/CLSK/HUT/BITF/HIVE/APLD/BTBT), same engine as every other candidate here"
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 7, cursor: "pointer",
              border: `1px solid ${btcHpcOnly ? "#f7931a" : C.border}`, background: btcHpcOnly ? "#f7931a22" : "transparent", color: btcHpcOnly ? "#f7931a" : C.textDim }}>
            {btcHpcOnly ? "✓ 🪙 BTC + HPC — back to all →" : "🪙 BTC + HPC"}
          </button>
        </div>

        {!btcHpcOnly && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {chip(sectorFilter === "ALL", () => setSectorFilter("ALL"), "ALL")}
            {sectors.map(s => chip(sectorFilter === s, () => setSectorFilter(s), s))}
          </div>
        )}

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 140px 110px 100px 40px", gap: 8, padding: "8px 14px", background: C.surface, borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.4 }}>
            <span>TICKER</span><span>COMPANY / SECTOR</span><span>FUTURE SCORE</span><span>TECH / VCP</span><span>PRICE</span><span></span>
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: "24px 0", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>No candidates match this filter.</div>
          )}
          {filtered.map(r => {
            const isOpen = expanded === r.ticker;
            const fScore = Number(r.potential?.future_potential_score);
            const fColor = SCORE_COLOR(fScore);
            const tScore = Number(r.technical?.technical_score);
            const tColor = SCORE_COLOR(tScore);
            const hasAgents = r.agents.length > 0;
            return (
              <div key={r.ticker} style={{ borderBottom: `1px solid ${C.border}` }}>
                <div onClick={() => setExpanded(isOpen ? null : r.ticker)}
                  style={{ display: "grid", gridTemplateColumns: "70px 1fr 140px 110px 100px 40px", gap: 8, padding: "10px 14px", cursor: "pointer", alignItems: "center", background: isOpen ? `${C.accent}08` : "transparent" }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.accent }}>{r.ticker}</span>
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.company}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim }}>{r.sector}{r.country !== "US" ? ` · ${r.country}` : ""}</div>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{SCORE_DOT(fColor)}</span>
                    <span style={{ fontFamily: NUM, fontSize: 15, fontWeight: 800, color: fColor || C.textDim }}>{Number.isFinite(fScore) ? fScore : "—"}</span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: tColor || C.textDim }}>
                    {SCORE_DOT(tColor)} {r.technical?.vcp_verdict || "—"}
                  </span>
                  <span style={{ fontFamily: NUM, fontSize: 13, color: C.text }}>{Number.isFinite(Number(r.quant?.price)) ? "$" + Number(r.quant.price).toFixed(2) : "—"}</span>
                  <span style={{ textAlign: "right" }}>
                    {hasAgents && <span title="Real AI deep-dive available">🔬</span>}
                    <span style={{ marginLeft: 4, color: C.textDim }}>{isOpen ? "▲" : "▼"}</span>
                  </span>
                </div>

                {isOpen && (
                  <PanelErrorBoundary label={`${r.ticker} deep dive`}>
                    <div style={{ padding: "4px 14px 16px" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        {statBox("REVENUE GROWTH", fmtPct(Number(r.quant?.revenue_growth)), null)}
                        {statBox("EPS GROWTH", fmtPct(Number(r.quant?.eps_growth)), null)}
                        {statBox("GROSS MARGIN", fmtPct(Number(r.quant?.gross_margin)), null)}
                        {statBox("ROIC", fmtPct(Number(r.quant?.roic)), null)}
                        {statBox("ROE", fmtPct(Number(r.quant?.roe)), null)}
                        {statBox("FCF", "$" + fmtBig(Number(r.quant?.fcf)), null)}
                        {statBox("P/E", fmtNum(Number(r.quant?.pe), 1), null)}
                        {statBox("PEG", fmtNum(Number(r.quant?.peg), 2), null)}
                        {statBox("EV/EBITDA", fmtNum(Number(r.quant?.ev_ebitda), 1), null)}
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        <div style={{ flex: "1 1 260px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>TECHNICAL / VCP</div>
                          {r.technical ? (
                            <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
                              Technical Score <b>{r.technical.technical_score}</b> · VCP <b style={{ color: tColor }}>{r.technical.vcp_verdict}</b> ({r.technical.vcp_score}/100)<br />
                              Risk: {r.technical.vcp_risk_state} · Breakout: {r.technical.breakout_status}<br />
                              Support ${fmtNum(Number(r.technical.support))} · Resistance ${fmtNum(Number(r.technical.resistance))}
                            </div>
                          ) : <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>No technical data yet.</div>}
                        </div>
                        <div style={{ flex: "1 1 260px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>FUTURE POTENTIAL SCORE — {Number.isFinite(fScore) ? fScore : "—"}/100 (quantitative)</div>
                          {r.potential?.components?.quantitative ? (
                            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textSec, lineHeight: 1.7 }}>
                              {Object.entries(r.potential.components.quantitative).map(([k, v]) => (
                                <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span style={{ textTransform: "capitalize" }}>{k.replace(/([A-Z])/g, " $1")}</span>
                                  <span style={{ color: C.text, fontWeight: 700 }}>{v}</span>
                                </div>
                              ))}
                              <div style={{ marginTop: 4, color: C.textDim, fontStyle: "italic" }}>Qualitative dimensions (moat, TAM, management) need the AI deep-dive below.</div>
                            </div>
                          ) : <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>No score data yet.</div>}
                        </div>
                      </div>

                      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, marginBottom: 8 }}>🔬 AI DEEP DIVE</div>
                        {hasAgents ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {r.agents.map(a => (
                              <div key={a.agent_name} style={{ borderLeft: `3px solid ${C.accent}`, paddingLeft: 10 }}>
                                <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: C.text }}>
                                  {a.agent_name} — <span style={{ color: C.accent }}>{a.score}/100</span>
                                </div>
                                <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.textSec, marginTop: 2 }}>{a.verdict}</div>
                                <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 3, lineHeight: 1.5 }}>{a.reasoning}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 8 }}>
                              No AI deep-dive yet for {r.ticker}. Real quant/technical data above is still fully real — this just adds 5 AI-agent reads (Fundamental/Growth/Valuation/Moat/Risk).
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); runDeepResearch(r.ticker); }} disabled={runningFor === r.ticker}
                              style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, padding: "7px 14px", borderRadius: 7, cursor: runningFor === r.ticker ? "default" : "pointer",
                                border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent }}>
                              {runningFor === r.ticker ? "⌛ Running 5 real Claude calls…" : "🔬 Run Deep Research (5 real Claude calls)"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </PanelErrorBoundary>
                )}
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
