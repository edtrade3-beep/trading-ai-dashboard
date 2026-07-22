import { useState, useEffect } from "react";
import { cardStyle } from "./ui-helpers.js";

// ALERTS + LIVE DIGEST — Module 13 (sector-sentiment-flip / Fed-stance-
// change detectors) and Module 14 (deterministic Live Digest). The Live
// Digest is explicitly NOT an AI-written summary — see its own `label`
// field. A true AI summary "every few minutes" isn't affordable under this
// app's ~$10/month budget; the real AI summary stays at its existing
// 2x/day cadence (aiSummary on individual X Intel items). This gives the
// same real content at zero AI cost and 5-minute freshness instead.
export default function XIntelAlerts({ C, MONO, SANS }) {
  const [alerts, setAlerts] = useState(null);
  const [digest, setDigest] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    Promise.all([
      fetch("/api/x-intel/alert-checks").then((r) => r.json()),
      fetch("/api/x-intel/digest").then((r) => r.json()),
    ]).then(([a, d]) => {
      if (a.ok) setAlerts(a);
      if (d.ok) setDigest(d.digest);
      setState("ok");
    }).catch(() => setState("error"));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Loading…</div>}

      {digest && (
        <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 4 }}>📊 LIVE DIGEST</div>
          <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 12, fontStyle: "italic" }}>{digest.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, fontFamily: MONO, fontSize: 12 }}>
            <div><span style={{ color: C.textDim }}>Breaking news (24h)</span><br /><b style={{ color: C.text, fontSize: 18 }}>{digest.breakingNewsCount24h}</b></div>
            <div><span style={{ color: C.textDim }}>Top mention delta</span><br /><b style={{ color: C.text, fontSize: 16 }}>{digest.topMentionDeltas?.[0] ? `${digest.topMentionDeltas[0].symbol} +${digest.topMentionDeltas[0].velocityPct}%` : "—"}</b></div>
          </div>
          {digest.fedStanceChange && (
            <div style={{ marginTop: 12, padding: "8px 10px", background: `${C.purple}0c`, borderLeft: `3px solid ${C.purple}`, borderRadius: 4 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.purple, marginBottom: 3 }}>FED — MOST RECENT VS PRIOR</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: C.text }}>{digest.fedStanceChange.latest}</div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 2 }}>Prior: {digest.fedStanceChange.prior}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 10 }}>🔔 SECTOR SENTIMENT FLIPS</div>
        {alerts?.sectorFlips?.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {alerts.sectorFlips.map((f) => (
              <div key={f.sector} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: C.surface, borderRadius: 6 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, textTransform: "capitalize" }}>{f.sector}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: f.direction === "bullish" ? C.green : C.red }}>
                  turned {f.direction} ({f.tickersImproving || f.tickersDeteriorating}/{f.tickersTotal} tickers)
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No real sector-level sentiment flips right now — needs enough real per-ticker sentiment history to detect a genuine flip, not a guess.</div>
        )}
      </div>
    </div>
  );
}
