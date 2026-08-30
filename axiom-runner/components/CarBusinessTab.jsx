// CarBusinessTab.jsx — Car Business Intelligence (2026-08-30, explicit
// user goal: "CAR BUSINESS... Help me become significantly more successful
// and profitable in the car business over the next 24 months... DO NOT MIX
// IT WITH THE TRADING ENGINE. DO NOT CREATE DUPLICATE AI ENGINES.").
//
// A completely separate decision system from the trading tabs — no
// am-core-engine.js, no opportunity-engine.js, nothing shared with
// Trade Desk/Autopilot/Cortex. What IS reused, per the user's own
// instruction: this app's real dealer backend (src/inventory-store.js's
// real current lot via GET /api/inventory, src/dealership/fb-hub.js's
// real CRM leads) and this app's real macro data — all wired server-side
// in src/car-business-ai.js, which this tab just displays.
//
// Same live-feed architecture as ResearchTab.jsx's LiveIntel section:
// GET/POST /api/car-business/intel[/refresh], daily auto-refresh at
// 6:05 PM ET (server.js), manual Refresh button here for on-demand runs.

import { useState, useEffect, useCallback } from "react";

const SECTION_COLOR = (C) => ({ STRONG: C.green, NORMAL: C.accent, WEAKENING: C.amber, HIGH_RISK: C.red });
const SECTION_ICON = { STRONG: "🟢", NORMAL: "🟡", WEAKENING: "🟠", HIGH_RISK: "🔴" };
const BUY_COLOR = (C) => ({ BUY_AGGRESSIVELY: C.green, BUY: C.green, SELECTIVE: C.amber, WATCH: C.amber, AVOID: C.red });
const BUY_ICON = { BUY_AGGRESSIVELY: "🔥", BUY: "🟢", SELECTIVE: "🟡", WATCH: "🟠", AVOID: "🔴" };
const OPP_ICON = { EARLY: "🟢", DEVELOPING: "🟢", CONFIRMED: "🟡", CROWDED: "🟠", LATE: "🔴", AVOID: "🔴" };
const STATUS_STYLE = (C) => ({
  NEW: { bg: C.accentGlow, fg: C.accent, label: "NEW" },
  STRENGTHENED: { bg: C.greenBg, fg: C.green, label: "STRENGTHENED" },
  WEAKENED: { bg: C.amberBg, fg: C.amber, label: "WEAKENED" },
  INVALIDATED: { bg: C.redBg, fg: C.red, label: "INVALIDATED" },
  UNCHANGED: { bg: C.card, fg: C.textDim, label: "UNCHANGED" },
});

function StatusBadge({ C, MONO, status }) {
  const s = STATUS_STYLE(C)[status] || STATUS_STYLE(C).NEW;
  return <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, padding: "2px 7px", borderRadius: 4, background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>{s.label}</span>;
}

const DIMENSION_LABELS = {
  "auto-market": "AUTO MARKET", "credit-environment": "CREDIT", "used-market": "USED MARKET",
  "new-market": "NEW MARKET", "inventory-stance": "INVENTORY", "pricing-direction": "PRICING", "dealer-environment": "DEALER ENV.",
};

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

function MarketSectionCard({ C, MONO, SANS, s }) {
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

function OpportunityCard({ C, MONO, SANS, o }) {
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

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px 80px", fontFamily: SANS, color: C.text }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: C.accent, fontWeight: 700, marginBottom: 8 }}>Automotive Business Intelligence</div>
          <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: "clamp(22px, 4vw, 30px)", lineHeight: 1.2, margin: "0 0 8px", color: C.text }}>🚗 Car Business</h1>
          <p style={{ fontSize: 13.5, color: C.textSec, maxWidth: 620, margin: 0 }}>
            A separate decision system for the dealership — what to buy, what to pay, what to sell for, who to sell to, and how to get them through the door. Grounded in this dealership's real inventory and real CRM leads. Refreshes daily at 6:05 PM ET, or on demand below.
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing} style={{
          fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 8,
          border: `1px solid ${C.accent}`, background: refreshing ? C.card : C.accent, color: refreshing ? C.accent : "#fff",
          cursor: refreshing ? "default" : "pointer", whiteSpace: "nowrap",
        }}>{refreshing ? "Researching…" : "↻ Refresh"}</button>
      </div>

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
          {intel.dailySummary && (
            <div style={{ background: C.accentGlow, border: `1px solid ${C.accent}`, borderRadius: 10, padding: "14px 18px", marginBottom: 16, fontSize: 13.5, color: C.text, lineHeight: 1.6 }}>
              <b style={{ color: C.accent }}>Today's read:</b> {intel.dailySummary}
            </div>
          )}

          {shifts.map((d, i) => <ShiftBanner key={i} C={C} MONO={MONO} dim={d} />)}

          {/* Business verdict — the 7 fixed dimensions */}
          {intel.dimensions?.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 16 }}>
              {intel.dimensions.map((d, i) => <DimensionTile key={i} C={C} MONO={MONO} dim={d} />)}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginBottom: 24 }}>
            {intel.topOpportunity && (
              <div style={{ background: C.greenBg, border: `1px solid ${C.green}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.green, marginBottom: 4 }}>TOP OPPORTUNITY</div>
                <div style={{ fontSize: 13, color: C.text }}>{intel.topOpportunity}</div>
              </div>
            )}
            {intel.biggestRisk && (
              <div style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.red, marginBottom: 4 }}>BIGGEST RISK</div>
                <div style={{ fontSize: 13, color: C.text }}>{intel.biggestRisk}</div>
              </div>
            )}
            {intel.nextAction && (
              <div style={{ background: C.accentGlow, border: `1px solid ${C.accent}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, marginBottom: 4 }}>NEXT ACTION</div>
                <div style={{ fontSize: 13, color: C.text }}>{intel.nextAction}</div>
              </div>
            )}
          </div>

          {sections.length > 0 && (
            <>
              <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, margin: "0 0 12px", color: C.text }}>Auto Market</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginBottom: 24 }}>
                {sections.map((s, i) => <MarketSectionCard key={i} C={C} MONO={MONO} SANS={SANS} s={s} />)}
              </div>
            </>
          )}

          {scores.length > 0 && (
            <>
              <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, margin: "0 0 4px", color: C.text }}>Inventory Intelligence — real current lot</h2>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12 }}>{scores.length} of {inventory.length} real vehicles scored</div>
              <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 24 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
                  <thead>
                    <tr>
                      {["VEHICLE", "PRICE", "SCORE", "ACTION", "EXP. GROSS", "EXP. DAYS"].map((h) => (
                        <th key={h} style={{ textAlign: "left", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", color: C.textDim, background: C.card, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scores.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((s, i) => {
                      const v = invByVin.get(s.vin);
                      const color = BUY_COLOR(C)[s.classification] || C.textDim;
                      return (
                        <tr key={s.vin}>
                          <td style={{ padding: "9px 12px", borderBottom: i < scores.length - 1 ? `1px solid ${C.border}` : "none" }}>
                            <div style={{ fontWeight: 700, color: C.text }}>{v ? `${v.year} ${v.make} ${v.model} ${v.trim || ""}` : s.vin}</div>
                            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{s.vin}{v ? ` · ${Number(v.mileage).toLocaleString()} mi` : ""}</div>
                            <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{s.reason}</div>
                          </td>
                          <td style={{ padding: "9px 12px", borderBottom: i < scores.length - 1 ? `1px solid ${C.border}` : "none", fontFamily: MONO, color: C.text }}>{v ? `$${v.price?.toLocaleString?.() ?? v.price}` : "—"}</td>
                          <td style={{ padding: "9px 12px", borderBottom: i < scores.length - 1 ? `1px solid ${C.border}` : "none" }}>
                            <span style={{ color, fontWeight: 800, fontFamily: MONO }}>{BUY_ICON[s.classification] || "🟡"} {s.score ?? "—"}</span>
                          </td>
                          <td style={{ padding: "9px 12px", borderBottom: i < scores.length - 1 ? `1px solid ${C.border}` : "none", fontSize: 11.5, color: C.textSec }}>{s.action}</td>
                          <td style={{ padding: "9px 12px", borderBottom: i < scores.length - 1 ? `1px solid ${C.border}` : "none", fontFamily: MONO, color: C.text }}>{Number.isFinite(s.expectedGross) ? `$${s.expectedGross.toLocaleString()}` : "—"}</td>
                          <td style={{ padding: "9px 12px", borderBottom: i < scores.length - 1 ? `1px solid ${C.border}` : "none", fontFamily: MONO, color: C.text }}>{s.expectedDaysToSell ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {opportunities.length > 0 && (
            <>
              <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, margin: "0 0 12px", color: C.text }}>Opportunity Board</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 8 }}>
                {opportunities.map((o, i) => <OpportunityCard key={i} C={C} MONO={MONO} SANS={SANS} o={o} />)}
              </div>
            </>
          )}

          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 20 }}>
            {intel.generatedAt ? `Generated ${new Date(intel.generatedAt).toLocaleString()}` : ""}{intel.priorAt ? ` · previous run ${new Date(intel.priorAt).toLocaleString()}` : ""}
          </div>
        </>
      )}
    </div>
  );
}
