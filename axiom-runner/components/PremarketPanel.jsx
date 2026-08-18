import { useEffect, useState } from "react";

// ── Premarket Panel — "AM Trading — Final Trading Logic Redesign" spec
// §4-6 (explicit user request, 2026-08-19): real gap/volume/catalyst
// scoring visible before the 9:30 open, without requiring the 15-min ORB
// to complete first. Deliberately its OWN small component — no shared
// styling or logic with LightBoxCard.jsx — per the spec's explicit "do
// not redesign the light boxes" constraint: this is new, additive UI, not
// a reskin of the existing grid. Self-fetching/self-polling, same
// independent-of-the-central-fetchAll-cycle convention LightBoxTab.jsx
// itself already uses. Renders nothing when there's no real data to show
// (outside the premarket window, or no real gappers) — never an empty
// placeholder competing with the grid below it.
const POLL_MS = 30000;

const STATE_COLOR = (C, state) => (state === "EARLY" ? C.green : state === "WATCH" ? C.amber : C.red);

function volumeLabel(rvolApprox) {
  if (rvolApprox == null) return "—";
  if (rvolApprox >= 1.5) return "Strong";
  if (rvolApprox >= 0.8) return "Normal";
  return "Weak";
}

export default function PremarketPanel({ C, MONO, SANS }) {
  const [rows, setRows] = useState([]);
  const [inWindow, setInWindow] = useState(false);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/market/premarket");
        const j = await r.json();
        if (!alive || !j.ok) return;
        setRows(j.rows || []);
        setInWindow(!!j.inPremarketWindow);
      } catch {}
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Nothing real to show — stay fully invisible, no placeholder card.
  if (!rows.length) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.text }}>🌅 Premarket</span>
        {inWindow && (
          <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: C.textDim, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 8px" }}>
            LIVE
          </span>
        )}
        <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>Real gap/volume/catalyst — before the 15-min ORB completes</span>
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {rows.map((r) => {
          const col = STATE_COLOR(C, r.state);
          return (
            <div key={r.symbol} style={{
              flex: "0 0 auto", minWidth: 150, background: C.card, border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${col}`, borderRadius: 8, boxShadow: C.shadow, padding: "8px 10px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>{r.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: col }}>{r.state}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: r.gapPct >= 0 ? C.green : C.red, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
                {r.gapPct >= 0 ? "+" : ""}{r.gapPct.toFixed(2)}%
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 4 }}>
                <span>Vol {volumeLabel(r.rvolApprox)}</span>
                <span>{r.hasNews ? "📰 News" : ""}</span>
                <span>Score {r.score}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
