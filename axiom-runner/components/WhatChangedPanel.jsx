import { useEffect, useRef, useState } from "react";

// WhatChangedPanel — the global "WHAT CHANGED SINCE OPEN?" / "WHAT CHANGED
// SINCE LAST REFRESH?" surface (platform-consolidation Part 7, 2026-09-06).
// Reads GET /api/market/what-changed, which is a cheap, synchronous read of
// whatever the most recent real /api/market/opportunities scan already
// recorded (src/what-changed-store.js) — this component never triggers a
// scan or recompute itself, it just polls the persisted result. Honest
// empty state ("No material changes yet") until real data exists, same
// discipline as every other tracker in this app — never a fabricated
// "nothing changed."
const POLL_MS = 60_000;

function ChangeRow({ label, from, to, MONO, C }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontFamily: MONO, fontSize: 11.5, padding: "3px 0" }}>
      <span style={{ color: C.textDim, minWidth: 0, flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {from ?? "—"} <span style={{ color: C.textDim }}>→</span> <b>{to ?? "—"}</b>
      </span>
    </div>
  );
}

function Section({ title, at, diff, MONO, SANS, C }) {
  const rows = [
    ...(diff?.changes || []).map((c) => ({ label: c.label, from: c.from, to: c.to })),
    ...(diff?.candidateTransitions || []).map((t) => ({ label: t.symbol, from: t.from, to: t.to })),
  ];
  return (
    <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: C.textDim }}>{title}</span>
        {at ? <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : null}
      </div>
      {rows.length ? (
        <>
          {rows.map((r, i) => <ChangeRow key={`${r.label}-${i}`} label={r.label} from={r.from} to={r.to} MONO={MONO} C={C} />)}
          {diff?.truncated && <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.textDim, marginTop: 2, fontStyle: "italic" }}>+ more not shown</div>}
        </>
      ) : (
        <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, fontStyle: "italic" }}>
          {diff === null ? "Not enough real data yet today." : "No material changes."}
        </div>
      )}
    </div>
  );
}

export default function WhatChangedPanel({ C, MONO, SANS, pillStyle, containerStyle }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

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

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const sinceOpenCount = (data?.sinceOpen?.changes?.length || 0) + (data?.sinceOpen?.candidateTransitions?.length || 0);
  const sinceRefreshCount = (data?.sinceLastRefresh?.changes?.length || 0) + (data?.sinceLastRefresh?.candidateTransitions?.length || 0);
  const badgeCount = sinceRefreshCount || sinceOpenCount;

  return (
    <div ref={rootRef} style={{ position: "relative", ...containerStyle }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="What changed since market open and since the last scan"
        style={{ ...pillStyle, cursor: "pointer", border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px", background: open ? C.card : "transparent", color: C.textSec }}
      >
        <span>🕰️</span>
        <span style={{ color: C.textDim }}>CHANGED</span>
        {badgeCount > 0 && (
          <b style={{ color: C.accent, marginLeft: 2 }}>{badgeCount}</b>
        )}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, width: 320, maxHeight: 420, overflowY: "auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.35)", zIndex: 30 }}>
          <div style={{ padding: "8px 12px", fontFamily: SANS, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, color: C.text }}>WHAT CHANGED?</div>
          <Section title="SINCE OPEN" at={data?.sinceOpenAt} diff={data?.sinceOpen} MONO={MONO} SANS={SANS} C={C} />
          <Section title="SINCE LAST REFRESH" at={data?.sinceLastRefreshAt} diff={data?.sinceLastRefresh} MONO={MONO} SANS={SANS} C={C} />
        </div>
      )}
    </div>
  );
}
