// ── Tilt Detector Banner ──
export default function TiltDetectorOverlay({ C, MONO, SANS, tiltLocked, tiltUnlockAt, setActiveTab, setTiltLocked, setTiltUnlockAt }) {
  if (!tiltLocked) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.93)", zIndex: 9998,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 500, width: "100%", background: C.surface, borderRadius: 16,
        border: `2px solid ${C.amber}`, boxShadow: `0 0 60px ${C.amber}44`, padding: 36, textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🧠</div>
        <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.amber, marginBottom: 10 }}>
          TILT DETECTED — STEP AWAY
        </div>
        <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec, lineHeight: 1.7, marginBottom: 18 }}>
          You have <strong style={{ color: C.red }}>3 consecutive losses</strong> today. The platform is locked for <strong>30 minutes</strong>.
          {tiltUnlockAt && (
            <div style={{ fontFamily: MONO, fontSize: 13, color: C.amber, marginTop: 8 }}>
              Unlocks at {tiltUnlockAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
        <div style={{ background: `${C.amber}12`, border: `1px solid ${C.amber}33`, borderRadius: 10, padding: "14px 18px", marginBottom: 20, textAlign: "left" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.amber, marginBottom: 6 }}>WHAT TO DO RIGHT NOW</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, lineHeight: 1.8 }}>
            1. Close your laptop or put down the phone<br/>
            2. Go for a 10-minute walk<br/>
            3. Come back and review what went wrong — not to fix it, just to understand it<br/>
            4. No more trades today unless the setup is a perfect 10
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => setActiveTab("journal")}
            style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, border: `1px solid ${C.accent}`,
              background: `${C.accent}18`, color: C.accent, borderRadius: 8, padding: "10px 24px", cursor: "pointer" }}>
            📓 Review My Trades
          </button>
          <button onClick={() => { setTiltLocked(false); setTiltUnlockAt(null); }}
            style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.border}`,
              background: "transparent", color: C.textDim, borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>
            Override Unlock
          </button>
        </div>
      </div>
    </div>
  );
}
