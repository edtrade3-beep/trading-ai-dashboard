import { useEffect, useMemo, useState } from "react";
import { SCAN_UNIVERSE } from "./market-helpers.js";
import { fetchDecision } from "./decision-store.js";
import TradeGpsCard from "./TradeGpsCard.jsx";
import TradeGpsWhyPanel from "./TradeGpsWhyPanel.jsx";

// Trade Navigator (2026-09-03, explicit user spec: "The 10-Second Trade
// Navigator... converts the entire market into simple, executable trade
// plans"). A NEW dedicated screen, not a Trade Desk enhancement — opens
// straight to a ranked market-wide radar with the single best real setup
// shown automatically, no symbol picking required. Reuses everything
// Trade GPS/Trade Desk already built this session: the same canonical
// pipeline (via the same withDecision=1 route), the same TradeGpsCard/
// TradeGpsWhyPanel (not rebuilt), the same shared decision-store.js
// cache for the detail read — this file only adds the real market-wide
// ranking + grouping, never a second scoring engine.

const RADAR_GROUPS = [
  { key: "TRADE_NOW", label: "TRADE NOW", hint: "entry conditions confirmed" },
  { key: "GET_READY", label: "GET READY", hint: "approaching the entry" },
  { key: "WAIT", label: "WAIT", hint: "promising, but confirmation missing" },
  { key: "AVOID", label: "AVOID", hint: "weak setup, poor liquidity, or excessive risk" },
];

// Real, disclosed grouping — a presentational label only, never a second
// verdict. tradeGpsVerdict/signalState are the real, already-computed
// values every row already carries.
function radarGroupFor(row) {
  const verdict = row?.tradeGpsVerdict?.verdict;
  const signalState = row?.assetDecision?.signalState;
  if (verdict && verdict.startsWith("BUY_")) return "TRADE_NOW";
  if (signalState === "ARMED") return "GET_READY";
  if (signalState === "SETUP_FORMING") return "WAIT";
  return "AVOID";
}

export default function TradeNavigatorTab({ C, MONO, SANS, setActiveTab, openInTradeDesk }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [account, setAccount] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    fetch(`/api/market/trend-screen?symbols=${SCAN_UNIVERSE.join(",")}&withDecision=1`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { if (d.ok !== false) setRows(d.results || []); else setError(d.error || "scan failed"); } })
      .catch((e) => { if (!cancelled) setError(e.name === "AbortError" ? "Scan timed out." : e.message); })
      .finally(() => clearTimeout(timer));
    fetch("/api/autopilot2/status").then((r) => r.json()).then((d) => { if (!cancelled && d?.ok) setAccount(d.account); }).catch(() => {});
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, []);

  const grouped = useMemo(() => {
    const out = { TRADE_NOW: [], GET_READY: [], WAIT: [], AVOID: [] };
    for (const row of rows || []) {
      if (row.error || !row.assetDecision) continue;
      out[radarGroupFor(row)].push(row);
    }
    for (const key of Object.keys(out)) {
      out[key].sort((a, b) => (b.tradeGps?.score ?? -1) - (a.tradeGps?.score ?? -1));
    }
    return out;
  }, [rows]);

  const topSymbol = grouped.TRADE_NOW[0]?.symbol || grouped.GET_READY[0]?.symbol || null;

  useEffect(() => {
    const target = selectedSymbol || topSymbol;
    if (!target) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    fetchDecision(target).then((entry) => { if (!cancelled) { setDetail(entry); setDetailLoading(false); } });
    return () => { cancelled = true; };
  }, [selectedSymbol, topSymbol]);

  const activeSymbol = selectedSymbol || topSymbol;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: C.bg }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>🧭 TRADE NAVIGATOR</div>
        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginTop: 2 }}>
          What should I trade, why is it moving, where do I enter, where do I exit, stock or options — one real screen, ten seconds.
        </div>
      </div>

      {error ? (
        <div style={{ padding: 20, fontFamily: SANS, fontSize: 12, color: C.red }}>Unable to load the real market scan: {error}</div>
      ) : !rows ? (
        <div style={{ padding: 20, fontFamily: SANS, fontSize: 12, color: C.textDim }}>Scanning the real market…</div>
      ) : (
        <>
          {activeSymbol && (
            <>
              <TradeGpsCard
                symbol={activeSymbol} decision={detail?.assetDecision} loading={detailLoading}
                tradeGps={detail?.tradeGps} tradeStructure={detail?.tradeStructure} trapShield={detail?.trapShield}
                marketAgreement={detail?.marketAgreement} tradeGpsVerdict={detail?.tradeGpsVerdict}
                dangerEvent={detail?.dangerEvent} whyNow={detail?.whyNow} account={account}
                C={C} MONO={MONO} SANS={SANS}
              />
              <TradeGpsWhyPanel tradeGps={detail?.tradeGps} tradeStructure={detail?.tradeStructure} trapShield={detail?.trapShield} C={C} MONO={MONO} SANS={SANS} />
              {openInTradeDesk && (
                <div style={{ padding: "6px 14px" }}>
                  <button onClick={() => openInTradeDesk(activeSymbol)}
                    style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 6, cursor: "pointer", border: `1px solid ${C.accent}`, background: "transparent", color: C.accent }}>
                    Open {activeSymbol} in Trade Desk →
                  </button>
                </div>
              )}
            </>
          )}

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 0.8, color: C.textDim, marginBottom: 10 }}>OPPORTUNITY RADAR</div>
            {RADAR_GROUPS.map((g) => (
              <RadarGroup key={g.key} group={g} rows={grouped[g.key]} activeSymbol={activeSymbol} onSelect={setSelectedSymbol} C={C} MONO={MONO} SANS={SANS} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const GROUP_COLOR = { TRADE_NOW: "green", GET_READY: "amber", WAIT: "textSec", AVOID: "textDim" };

function RadarGroup({ group, rows, activeSymbol, onSelect, C, MONO, SANS }) {
  const [open, setOpen] = useState(group.key === "TRADE_NOW" || group.key === "GET_READY");
  const color = C[GROUP_COLOR[group.key]] || C.text;
  if (!rows.length && group.key === "AVOID") return null; // real AVOID lists are routinely huge — collapsed by default below, and skipped entirely when literally empty
  return (
    <div style={{ marginBottom: 10 }}>
      <button onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "4px 0" }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color }}>{group.label}</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>({rows.length})</span>
        <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>— {group.hint}</span>
      </button>
      {open && (
        rows.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            {rows.slice(0, group.key === "AVOID" ? 15 : 30).map((row) => (
              <RadarRow key={row.symbol} row={row} active={row.symbol === activeSymbol} onSelect={onSelect} C={C} MONO={MONO} />
            ))}
            {rows.length > (group.key === "AVOID" ? 15 : 30) && (
              <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, padding: "4px 0" }}>+{rows.length - (group.key === "AVOID" ? 15 : 30)} more</div>
            )}
          </div>
        ) : (
          <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, padding: "4px 0 4px 18px" }}>No real setups here right now.</div>
        )
      )}
    </div>
  );
}

function RadarRow({ row, active, onSelect, C, MONO }) {
  const score = row.tradeGps?.score;
  const verdict = row.tradeGpsVerdict?.verdict;
  return (
    <button onClick={() => onSelect(row.symbol)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 8px", borderRadius: 6, cursor: "pointer", textAlign: "left",
        border: `1px solid ${active ? C.accent : "transparent"}`, background: active ? `${C.accent}14` : C.surface }}>
      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: C.text, minWidth: 56 }}>{row.symbol}</span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, minWidth: 40 }}>{Number.isFinite(score) ? score : "—"}</span>
      <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: C.textSec, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {verdict ? verdict.replace(/_/g, " ") : "—"}
      </span>
    </button>
  );
}
