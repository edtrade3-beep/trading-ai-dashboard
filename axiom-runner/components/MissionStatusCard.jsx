import { useState, useEffect } from "react";

// ── Mission Status — one plain-English line combining what's already
// computed elsewhere (regime, tilt lock) with a real open-position count
// (same /api/alpaca/positions endpoint ActivePositionsCard already calls).
// Not a new scoring system — a status summary of existing real signals.
export default function MissionStatusCard({ C, MONO, SANS, regimeLabel, regimeColor, tiltEnabled, tiltLocked, tiltStreak }) {
  const [openCount, setOpenCount] = useState(null);
  useEffect(() => {
    const load = () => {
      fetch("/api/alpaca/positions").then(r => r.json()).then(d => {
        if (d?.ok) setOpenCount((d.positions || []).length);
      }).catch(() => {});
    };
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  let status, color, icon;
  if (tiltEnabled && tiltLocked) {
    status = "LOCKED — tilt guard engaged, review before next trade";
    color = C.red; icon = "🔴";
  } else if (regimeLabel === "RISK OFF") {
    status = "DEFENSIVE — risk off, avoid new size";
    color = C.red; icon = "🔴";
  } else if (regimeLabel === "RISK ON") {
    status = "ACTIVE — risk on, cleared for full-size A+ setups";
    color = C.green; icon = "🟢";
  } else {
    status = `STANDBY — ${regimeLabel || "reading regime"}, size down`;
    color = C.amber; icon = "🟡";
  }

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 30, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color, marginBottom: 8, lineHeight: 1.4 }}>{status}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, fontFamily: MONO, fontSize: 11, color: C.textDim }}>
        <span>{openCount == null ? "…" : openCount} open</span>
        {tiltEnabled && <span>{tiltStreak || 0}/3 losses</span>}
      </div>
    </div>
  );
}
