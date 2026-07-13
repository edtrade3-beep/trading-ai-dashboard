// ── DAILY MAX LOSS LOCK OVERLAY ──
export default function TradingLockedOverlay({ C, MONO, SANS, tradingLocked, lockReason, dailyMaxLoss, setActiveTab, setTradingLocked, setLockReason, setLockEnabled }) {
  if (!tradingLocked) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9999,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 24 }}>
      <div style={{ maxWidth: 520, width: "100%", background: C.surface, borderRadius: 16,
        border: `2px solid ${C.red}`, boxShadow: `0 0 60px ${C.red}44`, padding: 36, textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🛑</div>
        <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.red, marginBottom: 12 }}>
          TRADING LOCKED
        </div>
        <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec, lineHeight: 1.7, marginBottom: 24 }}>
          {lockReason}
        </div>
        <div style={{ background: `${C.red}12`, border: `1px solid ${C.red}33`, borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.red, marginBottom: 8 }}>
            WHY THIS RULE EXISTS
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, lineHeight: 1.7, textAlign: "left" }}>
            After hitting your daily loss limit, the brain switches to "revenge mode" — you start chasing trades to make it back. This is how small losses become catastrophic losses. Professional traders never trade past their daily limit. Come back tomorrow with a clear head.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => { setTradingLocked(false); setLockReason(""); }}
            style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, border: "none",
              background: C.green, color: "#fff", borderRadius: 8, padding: "12px 28px", cursor: "pointer" }}>
            🔓 UNLOCK PLATFORM
          </button>
          <button onClick={() => setActiveTab("journal")}
            style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, border: `1px solid ${C.accent}`,
              background: `${C.accent}18`, color: C.accent, borderRadius: 8, padding: "10px 24px", cursor: "pointer" }}>
            📓 REVIEW MY TRADES
          </button>
          <button onClick={() => { setTradingLocked(false); setLockReason(""); setLockEnabled(false); try{localStorage.setItem("lock_enabled","false");}catch{} }}
            style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.border}`,
              background: "transparent", color: C.textDim, borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>
            Disable Lock Feature
          </button>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 16, textAlign: "center" }}>
          Locked at -${dailyMaxLoss} · Turn off in TOOLS → 📚 ACADEMY
        </div>
      </div>
    </div>
  );
}
