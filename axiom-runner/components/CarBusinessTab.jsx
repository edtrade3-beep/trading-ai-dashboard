// CarBusinessTab.jsx — Car Business Intelligence.
//
// A completely separate decision system from the trading tabs — no
// am-core-engine.js, no opportunity-engine.js, nothing shared with
// Trade Desk/Autopilot/Cortex. What IS reused, per the user's own
// instruction: this app's real dealer backend (src/inventory-store.js's
// real current lot, src/dealership/fb-hub.js's real CRM leads) and this
// app's real macro data — all wired server-side in src/car-business-ai.js,
// which this tab just displays.
//
// Upgraded 2026-08-30 (explicit user /goal: "upgrade CAR BUSINESS...
// into a dealership PROFIT + INTELLIGENCE SYSTEM") — car-business-ai.js
// now runs 3 real, right-sized AI calls instead of one; this tab renders
// all of it: the Command Center nightly readout + ONE FINAL VERDICT
// (a real, deterministic synthesis — car-business-engine.js's
// computeCommandCenter/computeFinalVerdict, not a 4th AI call), the
// Inventory Radar (extended with real turn/dead-inventory reads), the
// Acquisition Engine (buy-tomorrow + avoid lists), Local Market Gap,
// Customer Intelligence, Lead Engine + Funnel, Finance/Regulation,
// Future Scanner, a compact 24-month Forecast, and the Learning System
// (real predicted-vs-actual grading).
//
// Same live-feed architecture as ResearchTab.jsx's LiveIntel section:
// GET/POST /api/car-business/intel[/refresh], daily auto-refresh at
// 6:05 PM ET (server.js), manual Refresh button here for on-demand runs.

import { useState, useEffect, useCallback, useRef } from "react";

const SECTION_COLOR = (C) => ({ STRONG: C.green, NORMAL: C.accent, WEAKENING: C.amber, HIGH_RISK: C.red });
const SECTION_ICON = { STRONG: "🟢", NORMAL: "🟡", WEAKENING: "🟠", HIGH_RISK: "🔴" };
const BUY_COLOR = (C) => ({ UNDERPRICED_OPPORTUNITY: C.green, STRONG_BUY: C.green, SELECTIVE: C.amber, WATCH: C.amber, AVOID: C.red });
const BUY_ICON = { UNDERPRICED_OPPORTUNITY: "🔥", STRONG_BUY: "🟢", SELECTIVE: "🟡", WATCH: "🟠", AVOID: "🔴" };
const OPP_ICON = { EARLY: "🟢", DEVELOPING: "🟢", CONFIRMED: "🟡", CROWDED: "🟠", LATE: "🔴", AVOID: "🔴" };
const TURN_LABEL = { FAST_TURN: "🟢 FAST TURN", NORMAL: "🟡 NORMAL", SLOW: "🟠 SLOW", EXIT_RISK: "🔴 EXIT RISK" };
const REG_STYLE = (C) => ({ ACTION_REQUIRED: { icon: "🚨", color: C.red }, WATCH: { icon: "⚠️", color: C.amber }, NO_MATERIAL_IMPACT: { icon: "🟢", color: C.green } });
const FUTURE_STYLE = (C) => ({ CREATE_PROFIT: { icon: "💰", color: C.green }, DESTROY_PROFIT: { icon: "⚠️", color: C.red }, MIXED: { icon: "🔮", color: C.textDim } });
const FINAL_VERDICT_META = (C) => ({
  EXPAND: { icon: "🟢", color: C.green, label: "EXPAND" },
  BUY_SELECTIVELY: { icon: "🟢", color: C.green, label: "BUY SELECTIVELY" },
  HOLD: { icon: "🟡", color: C.amber, label: "HOLD" },
  REDUCE_RISK: { icon: "🟠", color: C.amber, label: "REDUCE RISK" },
  DEFENSIVE: { icon: "🔴", color: C.red, label: "DEFENSIVE" },
});
const LEARNING_STYLE = (C) => ({
  CORRECT: { icon: "✅", color: C.green }, PARTIALLY_CORRECT: { icon: "⚠️", color: C.amber }, WRONG: { icon: "❌", color: C.red },
  TOO_EARLY: { icon: "⏱️", color: C.textDim }, TOO_LATE: { icon: "⏱️", color: C.amber }, MISSED_OPPORTUNITY: { icon: "🚨", color: C.red }, UNKNOWN: { icon: "❔", color: C.textDim },
});
const STATUS_STYLE = (C) => ({
  NEW: { bg: C.accentGlow, fg: C.accent, label: "NEW" },
  STRENGTHENED: { bg: C.greenBg, fg: C.green, label: "STRENGTHENED" },
  WEAKENED: { bg: C.amberBg, fg: C.amber, label: "WEAKENED" },
  INVALIDATED: { bg: C.redBg, fg: C.red, label: "INVALIDATED" },
  UNCHANGED: { bg: C.card, fg: C.textDim, label: "UNCHANGED" },
});
const REPRICE_STYLE = (C) => ({
  REPRICE_UP: { icon: "⬆️", color: C.green, label: "REPRICE UP" },
  REPRICE_DOWN: { icon: "⬇️", color: C.red, label: "REPRICE DOWN" },
  HOLD_PRICE: { icon: "➡️", color: C.textDim, label: "HOLD PRICE" },
});

// CSV Repricing Analysis (explicit user request: "add csv file to
// analysis inventory and ai will tell me which one i need to reprice
// supply and demand"). Same real quoted-field CSV row parser PortfolioTab.jsx
// already uses for broker CSV import — duplicated here (not imported; a
// small pure helper, and the two files parse different real column sets)
// rather than re-derived from scratch. Flexible header matching (any
// order/case) — vin/year/make/model/trim/mileage/price/condition, matching
// the same real vehicle shape routes/inventory.js's own CSV export uses.
function parseInventoryCsvForRepricing(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], errors: ["File is empty or has only a header row."] };
  const parseRow = (line) => {
    const fields = [];
    let cur = "", inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuote = !inQuote;
      else if (ch === "," && !inQuote) { fields.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  };
  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/[\s_-]+/g, ""));
  const col = (names) => headers.findIndex((h) => names.includes(h));
  const idx = {
    vin: col(["vin"]), year: col(["year"]), make: col(["make"]), model: col(["model"]),
    trim: col(["trim", "trimlevel"]), mileage: col(["mileage", "miles", "odometer"]),
    price: col(["price", "listprice", "askingprice"]), condition: col(["condition"]),
  };
  const rows = lines.slice(1).map(parseRow).map((f) => ({
    vin: idx.vin >= 0 ? f[idx.vin] : "",
    year: idx.year >= 0 ? f[idx.year] : "",
    make: idx.make >= 0 ? f[idx.make] : "",
    model: idx.model >= 0 ? f[idx.model] : "",
    trim: idx.trim >= 0 ? f[idx.trim] : "",
    mileage: idx.mileage >= 0 ? f[idx.mileage] : "",
    price: idx.price >= 0 ? f[idx.price] : "",
    condition: idx.condition >= 0 ? f[idx.condition] : "",
  })).filter((r) => r.year && r.make && r.model);
  const errors = [];
  if (idx.year < 0 || idx.make < 0 || idx.model < 0) errors.push("Couldn't find year/make/model columns — check the CSV header row.");
  return { rows, errors };
}

function StatusBadge({ C, MONO, status }) {
  const s = STATUS_STYLE(C)[status] || STATUS_STYLE(C).NEW;
  return <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, padding: "2px 7px", borderRadius: 4, background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>{s.label}</span>;
}

const DIMENSION_LABELS = {
  "auto-market": "AUTO MARKET", "credit-environment": "CREDIT", "used-market": "USED MARKET",
  "new-market": "NEW MARKET", "inventory-stance": "INVENTORY", "pricing-direction": "PRICING", "dealer-environment": "DEALER ENV.",
};

function Section({ C, MONO, SANS, title, subtitle, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, margin: "0 0 4px", color: C.text }}>{title}</h2>
      {subtitle && <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12 }}>{subtitle}</div>}
      {!subtitle && <div style={{ marginBottom: 4 }} />}
      {children}
    </section>
  );
}

function DimensionTile({ C, MONO, dim }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${dim.shifted ? C.amber : C.border}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, color: C.textDim, marginBottom: 4 }}>{DIMENSION_LABELS[dim.dimension] || dim.dimension}</div>
      <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text }}>{dim.state}</div>
      {dim.shifted && <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.amber, marginTop: 3 }}>was {dim.priorState}</div>}
    </div>
  );
}

function ShiftBanner({ C, MONO, dim }) {
  return (
    <div style={{ background: C.amberBg, border: `1.5px solid ${C.amber}`, borderRadius: 10, padding: "12px 16px", marginBottom: 10 }}>
      <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 12, color: C.amber, marginBottom: 6 }}>🚨 BUSINESS SHIFT — {DIMENSION_LABELS[dim.dimension] || dim.dimension}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 4 }}>{dim.priorState} → {dim.state}</div>
      {dim.whyItMatters && <div style={{ fontSize: 12.5, color: C.textSec }}>{dim.whyItMatters}</div>}
    </div>
  );
}

// §14 — Daily Command Center + ONE FINAL VERDICT. The most prominent block
// on the page — a real, deterministic synthesis (car-business-engine.js's
// computeCommandCenter/computeFinalVerdict), never a 4th AI call.
function CommandCenterBanner({ C, MONO, SANS, cc }) {
  if (!cc) return null;
  const fv = FINAL_VERDICT_META(C)[cc.finalVerdict?.verdict] || {};
  const rows = [
    ["🚨 MARKET CHANGE", cc.marketChange],
    ["🔥 BEST OPPORTUNITY", cc.bestOpportunity],
    ["🚗 VEHICLES TO BUY", cc.vehiclesToBuy?.length ? cc.vehiclesToBuy.join(", ") : null],
    ["💰 BEST PRICE RANGE", cc.bestPriceRange],
    ["📈 BEST CUSTOMER SEGMENT", cc.bestCustomerSegment],
    ["📲 BEST LEAD CHANNEL", cc.bestLeadChannel],
    ["🏪 GET CUSTOMERS TO THE DOOR", cc.howToGetCustomersIn],
    ["⚠️ BIGGEST BUSINESS RISK", cc.biggestRisk],
    ["🔮 FUTURE TECHNOLOGY", cc.futureTechnology],
    ["📊 24-MONTH OUTLOOK", cc.twentyFourMonthOutlook],
  ].filter(([, v]) => v);

  return (
    <div style={{ background: C.card, border: `1.5px solid ${fv.color || C.border}`, borderRadius: 12, padding: "18px 20px", marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>DAILY CAR BUSINESS COMMAND CENTER</div>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: fv.color, background: `${fv.color}18`, border: `1px solid ${fv.color}55`, borderRadius: 999, padding: "5px 14px" }}>
          {fv.icon} {fv.label || cc.finalVerdict?.verdict || "—"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px 24px" }}>
        {rows.map(([label, val], i) => (
          <div key={i}>
            <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: 0.4, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketSectionCard({ C, MONO, s }) {
  const color = SECTION_COLOR(C)[s.classification] || C.textDim;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{s.category}</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color }}>{SECTION_ICON[s.classification]} {s.classification?.replace("_", " ")}</span>
      </div>
      <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{s.summary}</div>
      {s.sources?.length ? <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 6 }}>Sources: {s.sources.join(" · ")}</div> : null}
    </div>
  );
}

function OpportunityCard({ C, MONO, o }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: C.text, lineHeight: 1.35 }}>{OPP_ICON[o.classification] || "🟡"} {o.headline}</div>
        <StatusBadge C={C} MONO={MONO} status={o.status} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: C.textDim, marginBottom: 8 }}>{o.classification}</div>
      {o.whyNow && <div style={{ fontSize: 12.5, color: C.textSec, marginBottom: 6 }}><b style={{ color: C.text }}>Why now:</b> {o.whyNow}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 6, fontSize: 11.5, color: C.textSec, margin: "8px 0" }}>
        {o.buyPrice && <div><b style={{ color: C.textDim }}>Buy:</b> {o.buyPrice}</div>}
        {o.targetRetail && <div><b style={{ color: C.textDim }}>Target retail:</b> {o.targetRetail}</div>}
        {o.expectedGross && <div><b style={{ color: C.textDim }}>Gross:</b> {o.expectedGross}</div>}
        {o.expectedDaysToTurn && <div><b style={{ color: C.textDim }}>Turn:</b> {o.expectedDaysToTurn}</div>}
      </div>
      {o.customer && <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 3 }}><b>Customer:</b> {o.customer}</div>}
      {o.leadSource && <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 3 }}><b>Lead source:</b> {o.leadSource}</div>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
        {o.risk && <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: o.risk === "HIGH" ? C.redBg : o.risk === "MEDIUM" ? C.amberBg : C.greenBg, color: o.risk === "HIGH" ? C.red : o.risk === "MEDIUM" ? C.amber : C.green }}>{o.risk} RISK</span>}
        {Number.isFinite(o.confidence) && <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Confidence {o.confidence}</span>}
      </div>
    </div>
  );
}

// §2/§3 — What Should I Buy Tomorrow + the Buy-Price Engine (fields
// embedded per-recommendation).
function BuyRecCard({ C, MONO, b }) {
  return (
    <div style={{ background: C.greenBg, border: `1px solid ${C.green}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: C.text, marginBottom: 6 }}>{b.vehicle}</div>
      <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginBottom: 8 }}>{b.year} · {b.mileageRange} · {b.trim}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 6, fontSize: 11.5, color: C.textSec, marginBottom: 8 }}>
        <div><b style={{ color: C.textDim }}>Target buy:</b> {b.targetBuy}</div>
        <div><b style={{ color: C.textDim }}>Max buy:</b> {b.maxBuy}</div>
        <div><b style={{ color: C.textDim }}>Retail:</b> {b.expectedRetail}</div>
        <div><b style={{ color: C.textDim }}>Gross:</b> {b.expectedGross}</div>
        <div><b style={{ color: C.textDim }}>Turn:</b> {b.expectedDaysToTurn}</div>
      </div>
      {b.whyNow && <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}>{b.whyNow}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Number.isFinite(b.demandScore) && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.green, fontWeight: 700 }}>Demand {b.demandScore}</span>}
        {b.financingDifficulty && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim }}>Financing: {b.financingDifficulty}</span>}
        {b.repairRisk && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim }}>Repair risk: {b.repairRisk}</span>}
        {Number.isFinite(b.confidence) && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim }}>Confidence {b.confidence}</span>}
      </div>
    </div>
  );
}

// CSV Repricing Analysis — a manual, on-demand tool independent of the
// daily Command Center report (works even before that's loaded). Upload
// -> parse -> POST /api/car-business/reprice -> real per-vehicle
// REPRICE_UP/REPRICE_DOWN/HOLD_PRICE read grounded in real supply/demand
// comps research.
function RepricingTool({ C, MONO, SANS }) {
  const fileRef = useRef(null);
  const [parsed, setParsed] = useState(null); // {rows, errors}
  const [fileName, setFileName] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null); // {results, analyzed, uploaded, skippedInvalid, truncated}
  const [error, setError] = useState(null);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null); setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const info = parseInventoryCsvForRepricing(String(ev.target.result || ""));
      setParsed(info);
      setFileName(file.name);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const analyze = () => {
    if (!parsed?.rows?.length) return;
    setAnalyzing(true); setError(null);
    fetch("/api/car-business/reprice", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicles: parsed.rows }),
    }).then((r) => r.json())
      .then((d) => { if (d.ok) setResult(d); else setError(d.error || "Repricing analysis failed."); })
      .catch((e) => setError(e.message))
      .finally(() => setAnalyzing(false));
  };

  return (
    <Section C={C} MONO={MONO} SANS={SANS} title="Repricing Analysis — upload a CSV" subtitle="Real supply/demand-grounded repricing read for any vehicles you upload — a subset, a fresh export, whatever you want checked right now.">
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: result || error ? 14 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onFile} />
          <button onClick={() => fileRef.current?.click()} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, cursor: "pointer" }}>
            📄 Choose CSV
          </button>
          {fileName && <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.textDim }}>{fileName}</span>}
          {parsed && (
            <button onClick={analyze} disabled={analyzing || !parsed.rows.length} style={{
              fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 8,
              border: `1px solid ${C.accent}`, background: analyzing ? C.card : C.accent, color: analyzing ? C.accent : "#fff",
              cursor: analyzing || !parsed.rows.length ? "default" : "pointer",
            }}>{analyzing ? "Analyzing…" : `Analyze ${parsed.rows.length} vehicle${parsed.rows.length === 1 ? "" : "s"} for Repricing`}</button>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
          Expected columns (any order/case): vin, year, make, model, trim, mileage, price, condition. Same format as the dealer portal's own inventory export.
        </div>
        {parsed?.errors?.length > 0 && (
          <div style={{ fontSize: 12, color: C.amber, marginTop: 8 }}>⚠ {parsed.errors[0]}</div>
        )}
        {parsed && !parsed.errors?.length && (
          <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6 }}>Parsed {parsed.rows.length} real vehicle{parsed.rows.length === 1 ? "" : "s"} from the file.</div>
        )}
      </div>

      {error && <div style={{ fontSize: 13, color: C.red, background: C.redBg, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>{error}</div>}

      {result && (
        <>
          <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 10 }}>
            Analyzed {result.analyzed} of {result.uploaded} uploaded real vehicles, highest-price first
            {result.skippedInvalid ? ` · ${result.skippedInvalid} row(s) couldn't be parsed into a real vehicle` : ""}
            {result.truncated ? ` · ${result.truncated} lower-priced row(s) not analyzed this run — re-upload just those for a follow-up check` : ""}.
          </div>
          <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 760 }}>
              <thead>
                <tr>
                  {["VEHICLE", "ASKING", "ACTION", "SUGGESTED", "SUPPLY / DEMAND", "URGENCY"].map((h) => (
                    <th key={h} style={{ textAlign: "left", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", color: C.textDim, background: C.card, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.results.map((r, i, arr) => {
                  const rs = REPRICE_STYLE(C)[r.action] || {};
                  const bb = i < arr.length - 1 ? `1px solid ${C.border}` : "none";
                  const v = r.vehicle;
                  return (
                    <tr key={r.vin}>
                      <td style={{ padding: "9px 12px", borderBottom: bb }}>
                        <div style={{ fontWeight: 700, color: C.text }}>{v ? `${v.year} ${v.make} ${v.model} ${v.trim || ""}` : r.vin}</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{r.vin}{v ? ` · ${Number(v.mileage).toLocaleString()} mi` : ""}</div>
                        <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{r.reasoning}</div>
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: bb, fontFamily: MONO, color: C.text }}>{v ? `$${Number(v.price).toLocaleString()}` : "—"}</td>
                      <td style={{ padding: "9px 12px", borderBottom: bb }}>
                        <span style={{ color: rs.color, fontWeight: 800, fontFamily: MONO, fontSize: 11 }}>{rs.icon} {rs.label}</span>
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: bb, fontFamily: MONO, color: C.text }}>{Number.isFinite(r.suggestedPrice) ? `$${r.suggestedPrice.toLocaleString()}` : "—"}</td>
                      <td style={{ padding: "9px 12px", borderBottom: bb, fontSize: 11.5, color: C.textSec }}>{r.supplyDemandRead}</td>
                      <td style={{ padding: "9px 12px", borderBottom: bb, fontFamily: MONO, fontSize: 10.5, color: r.urgency === "HIGH" ? C.red : r.urgency === "MEDIUM" ? C.amber : C.textDim }}>{r.urgency || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}

export default function CarBusinessTab({ C, MONO, SANS }) {
  const [intel, setIntel] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    Promise.all([
      fetch("/api/car-business/intel").then((r) => r.json()),
      fetch("/api/inventory").then((r) => r.json()).catch(() => ({ items: [] })),
    ]).then(([d, inv]) => {
      if (d.ok) setIntel(d.intel); else setError(d.error || "Failed to load Car Business intelligence.");
      setInventory(Array.isArray(inv?.items) ? inv.items : Array.isArray(inv) ? inv : []);
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const refresh = () => {
    setRefreshing(true); setError(null);
    fetch("/api/car-business/intel/refresh", { method: "POST" }).then((r) => r.json())
      .then((d) => { if (d.ok) setIntel(d.intel); else setError(d.error || "Refresh failed."); })
      .catch((e) => setError(e.message))
      .finally(() => setRefreshing(false));
  };

  const invByVin = new Map(inventory.map((v) => [String(v.vin || "").toUpperCase(), v]));
  const scores = intel?.inventoryScores || [];
  const opportunities = intel?.opportunities || [];
  const sections = intel?.marketSections || [];
  const shifts = (intel?.dimensions || []).filter((d) => d.shifted);
  const buyRecs = intel?.buyRecommendations || [];
  const avoidList = intel?.avoidList || [];
  const segments = intel?.customerSegments || [];
  const channels = intel?.leadChannels || [];
  const regFlags = intel?.regulationFlags || [];
  const future = intel?.futureScan || [];
  const learning = intel?.learningHistory || [];

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 20px 80px", fontFamily: SANS, color: C.text }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: C.accent, fontWeight: 700, marginBottom: 8 }}>Automotive Business Intelligence</div>
          <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: "clamp(22px, 4vw, 30px)", lineHeight: 1.2, margin: "0 0 8px", color: C.text }}>🚗 Car Business</h1>
          <p style={{ fontSize: 13.5, color: C.textSec, maxWidth: 640, margin: 0 }}>
            A dealership profit + intelligence system — what to buy, what to pay, what to sell for, who to sell to, and how to get them through the door. Grounded in this dealership's real inventory and real CRM leads. Refreshes daily at 6:05 PM ET, or on demand below.
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing} style={{
          fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 8,
          border: `1px solid ${C.accent}`, background: refreshing ? C.card : C.accent, color: refreshing ? C.accent : "#fff",
          cursor: refreshing ? "default" : "pointer", whiteSpace: "nowrap",
        }}>{refreshing ? "Researching…" : "↻ Refresh"}</button>
      </div>

      <RepricingTool C={C} MONO={MONO} SANS={SANS} />

      {loading && <div style={{ fontSize: 13, color: C.textDim }}>Loading Car Business intelligence…</div>}
      {!loading && error && <div style={{ fontSize: 13, color: C.red, background: C.redBg, borderRadius: 8, padding: "10px 14px" }}>{error}</div>}
      {!loading && !error && !intel && (
        <div style={{ fontSize: 13, color: C.textDim, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
          No report generated yet. This runs automatically once a day (6:05 PM ET), or click "Refresh" to generate one now.
          {" "}Requires <code>ANTHROPIC_API_KEY</code> to be configured.
          {!inventory.length && <div style={{ marginTop: 8 }}>No real inventory on file yet either — the inventory-scoring section needs at least one real vehicle in the dealer portal's inventory.</div>}
        </div>
      )}

      {!loading && intel && (
        <>
          {intel.partialFailures?.length > 0 && (
            <div style={{ fontSize: 12.5, color: C.amber, background: C.amberBg, borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
              ⚠️ The {intel.partialFailures.join(", ")} research call{intel.partialFailures.length > 1 ? "s" : ""} failed this run — showing every section that DID complete rather than discarding the whole report. Try Refresh again shortly for the missing section{intel.partialFailures.length > 1 ? "s" : ""}.
            </div>
          )}

          <CommandCenterBanner C={C} MONO={MONO} SANS={SANS} cc={intel.commandCenter} />

          {intel.dailySummary && (
            <div style={{ background: C.accentGlow, border: `1px solid ${C.accent}`, borderRadius: 10, padding: "14px 18px", marginBottom: 16, fontSize: 13.5, color: C.text, lineHeight: 1.6 }}>
              <b style={{ color: C.accent }}>Today's read:</b> {intel.dailySummary}
            </div>
          )}

          {shifts.map((d, i) => <ShiftBanner key={i} C={C} MONO={MONO} dim={d} />)}

          {intel.dimensions?.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 24 }}>
              {intel.dimensions.map((d, i) => <DimensionTile key={i} C={C} MONO={MONO} dim={d} />)}
            </div>
          )}

          {/* §1/§5/§6 — Inventory Opportunity Radar + Days-to-Turn + Dead Inventory */}
          {scores.length > 0 && (
            <Section C={C} MONO={MONO} SANS={SANS} title="Inventory Intelligence — real current lot" subtitle={`${scores.length} of ${inventory.length} real vehicles scored`}>
              <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 820 }}>
                  <thead>
                    <tr>
                      {["VEHICLE", "PRICE", "SCORE", "TURN", "ACTION", "EXP. GROSS", "EXP. DAYS", "ON LOT"].map((h) => (
                        <th key={h} style={{ textAlign: "left", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", color: C.textDim, background: C.card, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...scores].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((s, i, arr) => {
                      const v = invByVin.get(s.vin);
                      const color = BUY_COLOR(C)[s.classification] || C.textDim;
                      const bb = i < arr.length - 1 ? `1px solid ${C.border}` : "none";
                      return (
                        <tr key={s.vin}>
                          <td style={{ padding: "9px 12px", borderBottom: bb }}>
                            <div style={{ fontWeight: 700, color: C.text }}>{v ? `${v.year} ${v.make} ${v.model} ${v.trim || ""}` : s.vin}</div>
                            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{s.vin}{v ? ` · ${Number(v.mileage).toLocaleString()} mi` : ""}</div>
                            <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{s.reason}</div>
                            {s.deadInventoryAction && (
                              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.red, marginTop: 4 }}>⚠️ {s.deadInventoryAction.replace("_", " ")}</div>
                            )}
                          </td>
                          <td style={{ padding: "9px 12px", borderBottom: bb, fontFamily: MONO, color: C.text }}>{v ? `$${v.price?.toLocaleString?.() ?? v.price}` : "—"}</td>
                          <td style={{ padding: "9px 12px", borderBottom: bb }}>
                            <span style={{ color, fontWeight: 800, fontFamily: MONO }}>{BUY_ICON[s.classification] || "🟡"} {s.score ?? "—"}</span>
                          </td>
                          <td style={{ padding: "9px 12px", borderBottom: bb, fontFamily: MONO, fontSize: 10.5 }}>{s.turnVerdict ? TURN_LABEL[s.turnVerdict] : "—"}</td>
                          <td style={{ padding: "9px 12px", borderBottom: bb, fontSize: 11.5, color: C.textSec }}>{s.action}</td>
                          <td style={{ padding: "9px 12px", borderBottom: bb, fontFamily: MONO, color: C.text }}>{Number.isFinite(s.expectedGross) ? `$${s.expectedGross.toLocaleString()}` : "—"}</td>
                          <td style={{ padding: "9px 12px", borderBottom: bb, fontFamily: MONO, color: C.text }}>{s.expectedDaysToSell ?? "—"}</td>
                          <td style={{ padding: "9px 12px", borderBottom: bb, fontFamily: MONO, color: C.textDim }}>{s.daysOnLot != null ? `${s.daysOnLot}d` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* §2/§3 — What Should I Buy Tomorrow */}
          {buyRecs.length > 0 && (
            <Section C={C} MONO={MONO} SANS={SANS} title="What Should I Buy Tomorrow — Top 10 Acquisition Targets">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                {buyRecs.map((b, i) => <BuyRecCard key={i} C={C} MONO={MONO} b={b} />)}
              </div>
            </Section>
          )}
          {avoidList.length > 0 && (
            <Section C={C} MONO={MONO} SANS={SANS} title="🔴 Top Vehicles to Avoid">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
                {avoidList.map((a, i) => (
                  <div key={i} style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: C.text, marginBottom: 3 }}>{a.vehicle}</div>
                    <div style={{ fontSize: 11.5, color: C.textSec }}>{a.reason}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* §4 — Local Market Gap */}
          {intel.localMarketGap && (
            <Section C={C} MONO={MONO} SANS={SANS} title="Local Market Gap">
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 8 }}>{intel.localMarketGap.summary}</div>
                {intel.localMarketGap.underservedSegments?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                    {intel.localMarketGap.underservedSegments.map((s, i) => (
                      <span key={i} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: C.accent, background: C.accentGlow, borderRadius: 5, padding: "3px 8px" }}>{s}</span>
                    ))}
                  </div>
                )}
                {intel.localMarketGap.sources?.length > 0 && <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 6 }}>Sources: {intel.localMarketGap.sources.join(" · ")}</div>}
              </div>
            </Section>
          )}

          {/* Auto Market (incl. FTC/regulation classification sections) */}
          {sections.length > 0 && (
            <Section C={C} MONO={MONO} SANS={SANS} title="Auto Market">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                {sections.map((s, i) => <MarketSectionCard key={i} C={C} MONO={MONO} s={s} />)}
              </div>
            </Section>
          )}

          {/* §10 — Finance / Consumer Stress */}
          {intel.financeRead && (
            <Section C={C} MONO={MONO} SANS={SANS} title="Finance & Consumer Stress">
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: intel.financeRead.verdict === "TIGHT" ? C.red : intel.financeRead.verdict === "EASING" ? C.green : C.amber, marginBottom: 8 }}>{intel.financeRead.verdict}</div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{intel.financeRead.summary}</div>
                {intel.financeRead.sources?.length > 0 && <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 8 }}>Sources: {intel.financeRead.sources.join(" · ")}</div>}
              </div>
            </Section>
          )}

          {/* §11 — FTC / Regulation flags */}
          {regFlags.length > 0 && (
            <Section C={C} MONO={MONO} SANS={SANS} title="FTC / Regulation">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
                {regFlags.map((r, i) => {
                  const rs = REG_STYLE(C)[r.flag] || {};
                  return (
                    <div key={i} style={{ background: C.card, border: `1px solid ${rs.color || C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: rs.color, marginBottom: 4 }}>{rs.icon} {r.flag.replace("_", " ")}</div>
                      <div style={{ fontSize: 12, color: C.textSec }}>{r.summary}</div>
                      {r.source && <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 4 }}>{r.source}</div>}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* §7 — Customer Intelligence */}
          {segments.length > 0 && (
            <Section C={C} MONO={MONO} SANS={SANS} title="Customer Intelligence — Best Segments">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                {segments.map((s, i) => (
                  <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 6 }}>{s.segment}</div>
                    <div style={{ fontSize: 12, color: C.textSec, marginBottom: 8 }}>{s.wants}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11, color: C.textDim, marginBottom: 6 }}>
                      <div><b>Price:</b> {s.priceRange}</div>
                      <div><b>Payment:</b> {s.paymentRange}</div>
                      <div><b>Down:</b> {s.downPayment}</div>
                      <div><b>Credit:</b> {s.creditProfile}</div>
                    </div>
                    {s.commonObjection && <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 4 }}><b>Objection:</b> {s.commonObjection}</div>}
                    <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.accent, marginTop: 6 }}>{s.bestVehicle} · {s.bestChannel}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* §8/§9 — Lead Engine + Funnel */}
          {(channels.length > 0 || intel.funnelRead) && (
            <Section C={C} MONO={MONO} SANS={SANS} title="Lead Engine & Funnel">
              {channels.length > 0 && (
                <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: intel.funnelRead ? 14 : 0 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 480 }}>
                    <thead>
                      <tr>
                        {["CHANNEL", "REAL LEADS", "NOTES"].map((h) => (
                          <th key={h} style={{ textAlign: "left", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", color: C.textDim, background: C.card, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {channels.map((c, i, arr) => (
                        <tr key={i}>
                          <td style={{ padding: "8px 12px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", fontWeight: 700, color: C.text }}>{c.channel}</td>
                          <td style={{ padding: "8px 12px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", fontFamily: MONO, color: c.hasRealData ? C.green : C.textDim }}>
                            {c.hasRealData ? (c.leadCount ?? "—") : "no real data tracked"}
                          </td>
                          <td style={{ padding: "8px 12px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", fontSize: 11.5, color: C.textSec }}>{c.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {intel.funnelRead && (
                <div style={{ background: C.amberBg, border: `1px solid ${C.amber}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.amber, marginBottom: 6 }}>BIGGEST CONVERSION LEAK</div>
                  <div style={{ fontSize: 13, color: C.text, marginBottom: 10 }}>{intel.funnelRead.biggestLeak}</div>
                  {intel.funnelRead.topActions?.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: C.textSec }}>
                      {intel.funnelRead.topActions.map((a, i) => <li key={i} style={{ marginBottom: 4 }}>{a}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* §12 — Future Scanner */}
          {future.length > 0 && (
            <Section C={C} MONO={MONO} SANS={SANS} title="Automotive Future Scanner">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
                {future.map((f, i) => {
                  const fs = FUTURE_STYLE(C)[f.impact] || {};
                  return (
                    <div key={i} style={{ background: C.card, border: `1px solid ${fs.color || C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: fs.color, marginBottom: 4 }}>{fs.icon} {f.technology}</div>
                      <div style={{ fontSize: 12, color: C.textSec }}>{f.summary}</div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* §13 — 24-Month Forecast (compact) */}
          {intel.forecast && (
            <Section C={C} MONO={MONO} SANS={SANS} title="24-Month Forecast">
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>BASE CASE</div>
                  <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>{intel.forecast.baseCase}</div>
                </div>
                <div style={{ background: C.greenBg, border: `1px solid ${C.green}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.green, marginBottom: 6 }}>BULL CASE</div>
                  <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>{intel.forecast.bullCase}</div>
                </div>
                <div style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.red, marginBottom: 6 }}>BEAR CASE</div>
                  <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>{intel.forecast.bearCase}</div>
                </div>
              </div>
            </Section>
          )}

          {/* Opportunity Board */}
          {opportunities.length > 0 && (
            <Section C={C} MONO={MONO} SANS={SANS} title="Opportunity Board">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
                {opportunities.map((o, i) => <OpportunityCard key={i} C={C} MONO={MONO} o={o} />)}
              </div>
            </Section>
          )}

          {/* §15 — Learning System */}
          <Section C={C} MONO={MONO} SANS={SANS} title="Learning System — predicted vs. actual">
            {learning.length === 0 ? (
              <div style={{ fontSize: 12.5, color: C.textDim, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
                No real graded predictions yet — this fills in once inventory scores from at least {3} days ago can be compared against real current outcomes (sold, or still on the real lot).
              </div>
            ) : (
              <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 560 }}>
                  <thead>
                    <tr>
                      {["VIN", "PREDICTED", "VERDICT", "REASON"].map((h) => (
                        <th key={h} style={{ textAlign: "left", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", color: C.textDim, background: C.card, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {learning.map((g, i, arr) => {
                      const ls = LEARNING_STYLE(C)[g.verdict] || {};
                      const bb = i < arr.length - 1 ? `1px solid ${C.border}` : "none";
                      return (
                        <tr key={g.vin}>
                          <td style={{ padding: "8px 12px", borderBottom: bb, fontFamily: MONO, fontSize: 11, color: C.text }}>{g.vin}</td>
                          <td style={{ padding: "8px 12px", borderBottom: bb, fontFamily: MONO, fontSize: 10.5, color: C.textDim }}>{g.classification}</td>
                          <td style={{ padding: "8px 12px", borderBottom: bb }}>
                            <span style={{ color: ls.color, fontWeight: 800, fontFamily: MONO, fontSize: 11 }}>{ls.icon} {g.verdict.replace("_", " ")}</span>
                          </td>
                          <td style={{ padding: "8px 12px", borderBottom: bb, fontSize: 11.5, color: C.textSec }}>{g.reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 20 }}>
            {intel.generatedAt ? `Generated ${new Date(intel.generatedAt).toLocaleString()}` : ""}{intel.priorAt ? ` · previous run ${new Date(intel.priorAt).toLocaleString()}` : ""}
          </div>
        </>
      )}
    </div>
  );
}
