import { useEffect, useState } from "react";

// WhatChangedStrip.jsx (2026-09-13) — always-visible "WHAT CHANGED" panel
// for Trade Desk (explicit user goal: understand what changed in ~10
// seconds without clicking anything). Consumes the SAME existing
// GET /api/market/what-changed contract WhatChangedPanel.jsx already
// established — no new detection logic, no new endpoint, no second
// polling loop against a different source. Direction arrows come straight
// from what-changed-engine.js's own `direction` field (added alongside
// this component, reusing its existing actionableRank/real-number
// comparisons) — never inferred/parsed client-side. Kinds with no honest
// ordinal (dataHealth, news) render a plain neutral arrow, never a guess.
const POLL_MS = 60_000;

function arrowFor(direction, C) {
  if (direction === "up") return { glyph: "↑", color: C.green };
  if (direction === "down") return { glyph: "↓", color: C.red };
  return { glyph: "→", color: C.textDim };
}

function ChangeItem({ subject, from, to, direction, C, MONO, SANS }) {
  const arrow = arrowFor(direction, C);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, minWidth: 0 }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{subject}</span>
      <span style={{ fontFamily: SANS, fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {from ?? "—"} <b style={{ color: arrow.color }}>{arrow.glyph}</b> <b>{to ?? "—"}</b>
      </span>
    </div>
  );
}

export default function WhatChangedStrip({ C, MONO, SANS }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/market/what-changed").then((r) => r.json()).then((d) => {
        if (alive && d?.ok !== false) setData(d);
      }).catch(() => {});
    };
    load();
    const iv = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  // Same precedence the existing badge already used: prefer "since last
  // refresh" when it has anything real to show, else fall back to
  // "since open" — never invent a third comparison basis.
  const primary = data?.sinceLastRefresh?.hasChanges ? data.sinceLastRefresh : data?.sinceOpen?.hasChanges ? data.sinceOpen : null;

  const items = primary
    ? [
        ...(primary.changes || []).map((c) => ({ subject: c.label, from: c.from, to: c.to, direction: c.direction ?? null })),
        ...(primary.candidateTransitions || []).map((t) => ({ subject: t.symbol, from: t.from, to: t.to, direction: t.direction ?? null })),
      ].slice(0, 6)
    : [];

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: C.textDim, marginBottom: 8 }}>⚡ WHAT CHANGED</div>
      {items.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {items.map((it, i) => <ChangeItem key={`${it.subject}-${i}`} {...it} C={C} MONO={MONO} SANS={SANS} />)}
        </div>
      ) : (
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>
          {data ? "No material changes since the previous state." : "Loading…"}
        </div>
      )}
    </div>
  );
}
