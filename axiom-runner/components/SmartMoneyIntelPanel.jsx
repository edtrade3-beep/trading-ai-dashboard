import { useState, useEffect } from "react";

// SmartMoneyIntelPanel — Smart Money Intelligence (2026-09-08, user's own
// spec: "a stock-intelligence profile... insider activity, institutional/
// fund activity, analyst intelligence, unusual activity, sentiment...
// integrate into the existing ticker-detail workflow rather than another
// disconnected page"). Reads GET /api/market/smart-money-intel?symbol=X,
// a pure aggregation of engines this app already has (real Form 4
// insider transactions, real 13F-derived institutional/fund ownership,
// real analyst upgrade/downgrade history + price targets, real options
// flow with evidence-based "unusual" flags, real Trade GPS technical
// score + entry/stop/targets/structure, real fundamental score, real
// per-ticker news sentiment/catalyst aggregation) — this component does
// zero new computation, it only renders what the server already computed.
//
// NAMING NOTE: this is unrelated to the separate, older /api/market/
// smart-money route ("Smart Money Concepts" — ICT order blocks/FVGs/
// BOS-CHoCH, a technical-analysis framework). Same everyday phrase,
// different concept — this panel's own route is smart-money-intel.
//
// Defaults COLLAPSED, same real reasoning as BeforeItPopsPanel.jsx/
// HiddenGemPanel.jsx: Trade Desk's core zone is a fixed, viewport-derived
// height shared with ChartPane, so an always-open panel here would eat
// into that budget — this is mounted as a plain sibling BELOW that zone.

const BAND_META = {
  STRONG_BUY: { label: "STRONG BUY", icon: "🟢", color: "green" },
  BUY: { label: "BUY", icon: "🟢", color: "green" },
  WATCH: { label: "WATCH", icon: "🟡", color: "amber" },
  AVOID: { label: "AVOID", icon: "🟠", color: "orange" },
  SELL: { label: "SELL", icon: "🔴", color: "red" },
  UNAVAILABLE: { label: "UNAVAILABLE", icon: "⚪", color: "gray" },
};
const CLASS_COLOR = (C, name) => ({ green: C.green, amber: C.amber, orange: "#e07b1a", red: C.red, gray: C.textSec }[name] || C.textSec);
const TABS = ["VERDICT", "INSIDERS", "INSTITUTIONS", "ANALYSTS", "OPTIONS FLOW", "SENTIMENT", "CATALYSTS"];

function fmtMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtShares(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString();
}
function fmtPct(v, digits = 1) {
  const n = Number(v);
  return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%` : "—";
}

export default function SmartMoneyIntelPanel({ symbol, C, MONO, SANS, setTerminalSymbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("tradedesk_smart_money_intel_open") !== "on"; } catch { return true; }
  });
  const [tab, setTab] = useState("VERDICT");

  useEffect(() => {
    if (!symbol || collapsed) return;
    let alive = true;
    setLoading(true); setError(null);
    fetch(`/api/market/smart-money-intel?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json())
      .then((d) => { if (!alive) return; if (d.ok) setData(d); else setError(d.error || "Unavailable"); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [symbol, collapsed]);

  const toggleCollapsed = () => setCollapsed((v) => {
    const nv = !v;
    try { localStorage.setItem("tradedesk_smart_money_intel_open", nv ? "off" : "on"); } catch {}
    return nv;
  });

  const band = data ? (BAND_META[data.smartMoney?.band] || BAND_META.UNAVAILABLE) : null;

  return (
    <section aria-label="Smart Money Intelligence" style={{ padding: "14px 20px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      <button onClick={toggleCollapsed} style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: 0, marginBottom: collapsed ? 0 : 12, width: "100%", textAlign: "left" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>{collapsed ? "▸" : "▾"}</span>
        <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>🧠 SMART MONEY INTELLIGENCE</span>
        <span style={{ fontFamily: SANS, fontSize: 13, color: C.textSec }}>— insiders, institutions, analysts, options flow, sentiment for {symbol || "this ticker"}</span>
        {data?.smartMoney?.score != null && (
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 14, fontWeight: 800, color: CLASS_COLOR(C, band?.color) }}>
            {band?.icon} {data.smartMoney.score}/100 {band?.label}
          </span>
        )}
      </button>

      {!collapsed && (
        <>
          {loading && !data && <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec }}>Reading real insider/institutional/analyst/options-flow data for {symbol}…</div>}
          {error && <div style={{ fontFamily: SANS, fontSize: 15, color: C.amber }}>Unavailable right now: {error}</div>}

          {data && (
            <>
              {/* Hero row — ticker, company, price, change, market cap, Smart Money Score */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 20, marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>{data.companyName}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontFamily: MONO, fontSize: 28, fontWeight: 900, color: C.text }}>{data.symbol}</span>
                    <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C.text }}>${Number(data.price).toFixed(2)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: data.changePct >= 0 ? C.green : C.red }}>{fmtPct(data.changePct, 2)}</span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec, marginTop: 2 }}>Market Cap {fmtMoney(data.marketCap)}</div>
                </div>
                <div style={{ marginLeft: "auto", textAlign: "center", padding: "10px 22px", borderRadius: 12, border: `2px solid ${CLASS_COLOR(C, band?.color)}`, background: `${CLASS_COLOR(C, band?.color)}14` }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textSec, letterSpacing: 0.6 }}>SMART MONEY SCORE</div>
                  <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 900, color: CLASS_COLOR(C, band?.color), lineHeight: 1.1 }}>
                    {data.smartMoney?.score != null ? data.smartMoney.score : "—"}<span style={{ fontSize: 16 }}>/100</span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: CLASS_COLOR(C, band?.color) }}>{band?.icon} {band?.label}</div>
                </div>
              </div>

              {data.signalShift?.shifted && (
                <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: 10, border: `2px solid ${C.amber}`, background: `${C.amber}18` }}>
                  <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.amber, marginBottom: 4 }}>🚨 {data.signalShift.headline}</div>
                  <div style={{ fontFamily: SANS, fontSize: 14, color: C.text }}>
                    Score moved {data.signalShift.delta >= 0 ? "+" : ""}{data.signalShift.delta} vs {data.signalShift.priorDate} ({data.signalShift.priorScore}/100). Evidence: {(data.signalShift.evidence || []).join(" ")}
                  </div>
                </div>
              )}

              {/* Tab bar */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                {TABS.map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, padding: "7px 12px", borderRadius: 7, cursor: "pointer",
                      border: `1px solid ${tab === t ? C.accent : C.border}`, background: tab === t ? C.accent : "transparent", color: tab === t ? "#fff" : C.textSec }}>
                    {t}
                  </button>
                ))}
              </div>

              {tab === "VERDICT" && <VerdictTab data={data} C={C} MONO={MONO} SANS={SANS} setTerminalSymbol={setTerminalSymbol} />}
              {tab === "INSIDERS" && <InsidersTab data={data} C={C} MONO={MONO} SANS={SANS} />}
              {tab === "INSTITUTIONS" && <InstitutionsTab data={data} C={C} MONO={MONO} SANS={SANS} />}
              {tab === "ANALYSTS" && <AnalystsTab data={data} C={C} MONO={MONO} SANS={SANS} />}
              {tab === "OPTIONS FLOW" && <OptionsFlowTab data={data} C={C} MONO={MONO} SANS={SANS} />}
              {tab === "SENTIMENT" && <SentimentTab data={data} C={C} MONO={MONO} SANS={SANS} />}
              {tab === "CATALYSTS" && <CatalystsTab data={data} C={C} MONO={MONO} SANS={SANS} />}
            </>
          )}
        </>
      )}
    </section>
  );
}

function SubScoreBar({ label, weight, sub, C, MONO }) {
  const available = Number.isFinite(sub?.score);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: C.textSec, fontWeight: 700 }}>{label} <span style={{ color: C.textDim }}>({weight}%)</span></span>
        <span style={{ color: available ? C.text : C.textDim, fontWeight: 800 }}>{available ? `${sub.score}/100` : "Unavailable"}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: C.card, overflow: "hidden" }}>
        {available && <div style={{ width: `${sub.score}%`, height: "100%", background: sub.score >= 65 ? C.green : sub.score >= 45 ? C.amber : C.red }} />}
      </div>
      {sub?.reason && <div style={{ fontFamily: "inherit", fontSize: 13, color: C.textSec, marginTop: 3, lineHeight: 1.4 }}>{sub.reason}</div>}
    </div>
  );
}

function VerdictTab({ data, C, MONO, SANS, setTerminalSymbol }) {
  const t = data.technical || {};
  const opt = data.bestOptionsStructure;
  const sm = data.smartMoney;
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 10 }}>SMART MONEY SCORE BREAKDOWN</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 18 }}>
        <SubScoreBar label="INSIDER" weight={sm.weights.insider} sub={sm.subScores.insider} C={C} MONO={MONO} />
        <SubScoreBar label="INSTITUTIONAL" weight={sm.weights.institutional} sub={sm.subScores.institutional} C={C} MONO={MONO} />
        <SubScoreBar label="OPTIONS" weight={sm.weights.options} sub={sm.subScores.options} C={C} MONO={MONO} />
        <SubScoreBar label="ANALYST" weight={sm.weights.analyst} sub={sm.subScores.analyst} C={C} MONO={MONO} />
        <SubScoreBar label="TECHNICAL" weight={sm.weights.technical} sub={sm.subScores.technical} C={C} MONO={MONO} />
        <SubScoreBar label="FUNDAMENTAL" weight={sm.weights.fundamental} sub={sm.subScores.fundamental} C={C} MONO={MONO} />
        <SubScoreBar label="CATALYST/NEWS" weight={sm.weights.catalyst} sub={sm.subScores.catalyst} C={C} MONO={MONO} />
      </div>

      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 10 }}>TRADE PLAN (real Trade GPS levels)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 18, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
        <Field label="Verdict" value={t.verdict || "—"} color={t.verdict?.includes("BUY") ? C.green : t.verdict === "AVOID" ? C.red : C.amber} C={C} MONO={MONO} />
        <Field label="Entry" value={t.entry != null ? `$${Number(t.entry).toFixed(2)}` : "—"} C={C} MONO={MONO} />
        <Field label="Stop / Invalidation" value={t.stop != null ? `$${Number(t.stop).toFixed(2)}` : "—"} color={C.red} C={C} MONO={MONO} />
        <Field label="Target 1" value={t.targets?.[0] != null ? `$${Number(t.targets[0]).toFixed(2)}` : "—"} color={C.green} C={C} MONO={MONO} />
        <Field label="Target 2" value={t.targets?.[1] != null ? `$${Number(t.targets[1]).toFixed(2)}` : "—"} color={C.green} C={C} MONO={MONO} />
        <Field label="R:R" value={t.riskReward != null ? `${Number(t.riskReward).toFixed(1)}R` : "—"} C={C} MONO={MONO} />
        <Field label="Structure" value={t.structure ? t.structure.replace(/_/g, " ") : "—"} C={C} MONO={MONO} />
      </div>

      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 10 }}>BEST OPTIONS STRUCTURE</div>
      {opt?.available ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <Field label="Strategy" value={opt.strategy} C={C} MONO={MONO} />
          <Field label="Direction" value={`${opt.direction?.icon || ""} ${opt.direction?.label || "—"}`} C={C} MONO={MONO} />
          <Field label="Expiration" value={opt.expiration} C={C} MONO={MONO} />
          <Field label={opt.isCredit ? "Target Credit" : "Target Debit"} value={opt.targetPrice != null ? `$${Number(opt.targetPrice).toFixed(2)}` : "—"} C={C} MONO={MONO} />
          <Field label="Max Loss" value={opt.maxLoss != null ? `$${opt.maxLoss}` : "—"} color={C.red} C={C} MONO={MONO} />
        </div>
      ) : (
        <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec }}>Unavailable: {opt?.reason || "No real options data for this symbol right now."}</div>
      )}

      {setTerminalSymbol && (
        <button onClick={() => setTerminalSymbol?.(data.symbol)} style={{ marginTop: 16, fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "9px 16px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textSec, cursor: "pointer" }}>
          OPEN CHART
        </button>
      )}
    </div>
  );
}

function InsidersTab({ data, C, MONO, SANS }) {
  const txns = data.insiders?.transactions || [];
  if (!txns.length) return <Empty text="No real recent Form 4 insider transactions on file for this symbol." C={C} SANS={SANS} />;
  return (
    <div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, marginBottom: 10 }}>Source: {data.insiders.source === "sec-edgar" ? "SEC EDGAR (direct)" : "Yahoo (Form 4-derived)"}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
              {["Insider", "Title", "Type", "Shares", "Value", "Date"].map((h) => <th key={h} style={{ padding: "8px 10px", color: C.textSec, fontWeight: 700 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {txns.map((t, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: t.type === "BUY" ? `${C.green}0e` : `${C.red}0e` }}>
                <td style={{ padding: "8px 10px", color: C.text, fontWeight: 700 }}>{t.name}</td>
                <td style={{ padding: "8px 10px", color: C.textSec }}>{t.role}</td>
                <td style={{ padding: "8px 10px", fontWeight: 800, color: t.type === "BUY" ? C.green : C.red }}>{t.type === "BUY" ? "🟢 BUY" : "🔴 SELL"}</td>
                <td style={{ padding: "8px 10px", color: C.text }}>{fmtShares(t.shares)}</td>
                <td style={{ padding: "8px 10px", color: C.text, fontWeight: 700 }}>{fmtMoney(t.value)}</td>
                <td style={{ padding: "8px 10px", color: C.textSec }}>{t.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InstitutionsTab({ data, C, MONO, SANS }) {
  const inst = data.institutions?.institutions || [];
  const funds = data.institutions?.funds || [];
  if (!inst.length && !funds.length) return <Empty text="No real institutional or fund ownership rows on file for this symbol." C={C} SANS={SANS} />;
  return (
    <div>
      {inst.length > 0 && (
        <>
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>INSTITUTIONS (real 13F-derived position change)</div>
          <div style={{ overflowX: "auto", marginBottom: 18 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", borderBottom: `1px solid ${C.border}` }}>{["Institution", "Change", "Shares", "% Held", "Value", "Reported"].map((h) => <th key={h} style={{ padding: "8px 10px", color: C.textSec, fontWeight: 700 }}>{h}</th>)}</tr></thead>
              <tbody>
                {inst.map((o, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 10px", color: C.text, fontWeight: 700 }}>{o.name}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 800, color: o.change > 0 ? C.green : o.change < 0 ? C.red : C.textSec }}>
                      {o.change > 0 ? "🟢 INCREASE" : o.change < 0 ? "🔴 REDUCE" : "— UNCHANGED"} {o.change ? `(${o.change >= 0 ? "+" : ""}${fmtShares(o.change)})` : ""}
                    </td>
                    <td style={{ padding: "8px 10px", color: C.text }}>{fmtShares(o.shares)}</td>
                    <td style={{ padding: "8px 10px", color: C.text }}>{o.pctHeld}%</td>
                    <td style={{ padding: "8px 10px", color: C.text }}>{fmtMoney(o.value)}</td>
                    <td style={{ padding: "8px 10px", color: C.textSec }}>{o.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {funds.length > 0 && (
        <>
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>FUND MANAGERS (real ownership snapshot)</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, marginBottom: 8 }}>Real shares/% held as of the reporting date below — Yahoo's real per-fund position-CHANGE field isn't currently populated, so a Buy/Increase/Reduce direction can't honestly be shown for these rows.</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", borderBottom: `1px solid ${C.border}` }}>{["Fund", "Shares", "% Held", "Reported"].map((h) => <th key={h} style={{ padding: "8px 10px", color: C.textSec, fontWeight: 700 }}>{h}</th>)}</tr></thead>
              <tbody>
                {funds.map((f, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 10px", color: C.text, fontWeight: 700 }}>{f.name}</td>
                    <td style={{ padding: "8px 10px", color: C.text }}>{fmtShares(f.shares)}</td>
                    <td style={{ padding: "8px 10px", color: C.text }}>{f.pctHeld}%</td>
                    <td style={{ padding: "8px 10px", color: C.textSec }}>{f.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function AnalystsTab({ data, C, MONO, SANS }) {
  const a = data.analysts || {};
  const hist = a.history || [];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 18, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
        <Field label="Target Low" value={a.targetLow ? `$${a.targetLow}` : "—"} C={C} MONO={MONO} />
        <Field label="Target Mean" value={a.targetMean ? `$${a.targetMean.toFixed(2)}` : "—"} C={C} MONO={MONO} />
        <Field label="Target High" value={a.targetHigh ? `$${a.targetHigh}` : "—"} C={C} MONO={MONO} />
        <Field label="Consensus" value={a.recommendation ? a.recommendation.replace(/_/g, " ").toUpperCase() : "—"} C={C} MONO={MONO} />
        <Field label="# Analysts" value={a.numAnalysts || "—"} C={C} MONO={MONO} />
      </div>
      {!hist.length ? <Empty text="No real recent analyst upgrade/downgrade activity on file." C={C} SANS={SANS} /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 14 }}>
            <thead><tr style={{ textAlign: "left", borderBottom: `1px solid ${C.border}` }}>{["Date", "Firm", "Action", "From", "To"].map((h) => <th key={h} style={{ padding: "8px 10px", color: C.textSec, fontWeight: 700 }}>{h}</th>)}</tr></thead>
            <tbody>
              {hist.map((h, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "8px 10px", color: C.textSec }}>{h.date}</td>
                  <td style={{ padding: "8px 10px", color: C.text, fontWeight: 700 }}>{h.firm}</td>
                  <td style={{ padding: "8px 10px", fontWeight: 800, color: h.action === "up" ? C.green : h.action === "down" ? C.red : C.textSec }}>
                    {h.action === "up" ? "🟢 UPGRADE" : h.action === "down" ? "🔴 DOWNGRADE" : h.action?.toUpperCase()}
                  </td>
                  <td style={{ padding: "8px 10px", color: C.textSec }}>{h.fromGrade || "—"}</td>
                  <td style={{ padding: "8px 10px", color: C.text }}>{h.toGrade || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OptionsFlowTab({ data, C, MONO, SANS }) {
  const rows = data.optionsFlow?.rows || [];
  if (!rows.length) return <Empty text="No real recent options-flow data on file for this symbol." C={C} SANS={SANS} />;
  return (
    <div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, marginBottom: 10 }}>
        Source: {data.optionsFlow.source || "—"} · {data.optionsFlow.unusualCount} real unusual print(s) flagged below
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 13.5 }}>
          <thead><tr style={{ textAlign: "left", borderBottom: `1px solid ${C.border}` }}>{["Side", "Strike", "Expiry", "Premium", "Volume", "OI", "Unusual"].map((h) => <th key={h} style={{ padding: "7px 9px", color: C.textSec, fontWeight: 700 }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: r.unusual ? `${C.amber}0e` : "transparent" }}>
                <td style={{ padding: "7px 9px", fontWeight: 800, color: r.side === "CALL" ? C.green : C.red }}>{r.side === "CALL" ? "🟢 CALL" : "🔴 PUT"}</td>
                <td style={{ padding: "7px 9px", color: C.text }}>${r.strike}</td>
                <td style={{ padding: "7px 9px", color: C.textSec }}>{r.expiration}</td>
                <td style={{ padding: "7px 9px", color: C.text }}>{fmtMoney(r.notional)}</td>
                <td style={{ padding: "7px 9px", color: C.text }}>{r.volume ?? "—"}</td>
                <td style={{ padding: "7px 9px", color: C.text }}>{r.openInterest ?? "—"}</td>
                <td style={{ padding: "7px 9px", fontWeight: 800, color: r.unusual ? C.amber : C.textDim }}>{r.unusual ? "⚠️ YES" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SentimentTab({ data, C, MONO, SANS }) {
  const s = data.sentiment;
  if (!s?.ok) return <Empty text="Real news sentiment aggregation is unavailable right now (requires the news database to be configured)." C={C} SANS={SANS} />;
  if (!s.articleCount) return <Empty text="No real recent news articles on file for this symbol." C={C} SANS={SANS} />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
      <Field label="Articles (3d)" value={s.articleCount} C={C} MONO={MONO} />
      <Field label="Bullish" value={s.bullish} color={C.green} C={C} MONO={MONO} />
      <Field label="Bearish" value={s.bearish} color={C.red} C={C} MONO={MONO} />
      <Field label="Avg Impact" value={`${s.avgImpact}/100`} C={C} MONO={MONO} />
      <Field label="Trend" value={s.trend} color={s.trend === "BULLISH" ? C.green : s.trend === "BEARISH" ? C.red : C.amber} C={C} MONO={MONO} />
    </div>
  );
}

function CatalystsTab({ data, C, MONO, SANS }) {
  const c = data.catalyst;
  if (!c?.ok && c?.ok !== undefined) return <Empty text="Real catalyst data is unavailable right now (requires the news database to be configured)." C={C} SANS={SANS} />;
  if (!c?.latestHeadline) return <Empty text="No real recent material catalyst on file for this symbol." C={C} SANS={SANS} />;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.textSec, marginBottom: 6 }}>LATEST REAL CATALYST — {c.latestCatalyst}</div>
      <div style={{ fontFamily: SANS, fontSize: 16, color: C.text, lineHeight: 1.5 }}>{c.latestHeadline}</div>
    </div>
  );
}

function Empty({ text, C, SANS }) {
  return <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec }}>⚪ {text}</div>;
}

function Field({ label, value, color, C, MONO }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: color || C.text }}>{value ?? "—"}</div>
    </div>
  );
}
