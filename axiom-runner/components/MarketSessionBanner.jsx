// Market Session Banner — shows when market is NOT regular hours
export default function MarketSessionBanner({ C, MONO, SANS, marketSession }) {
  if (marketSession === "REGULAR") return null;
  const cfg = {
    PREMARKET:   { label: "PRE-MARKET", col: C.amber, bg: `${C.amber}14`, msg: "Market opens 9:30 AM ET · Pre-market prices may differ" },
    AFTERMARKET: { label: "AFTER-HOURS", col: C.purple, bg: `${C.purple}12`, msg: "Market closed · After-hours trading 4:00–8:00 PM ET" },
    OVERNIGHT:   { label: "MARKET CLOSED", col: C.textDim, bg: C.surface, msg: "Market opens 9:30 AM ET · Pre-market starts 4:00 AM ET" },
  }[marketSession] || null;
  if (!cfg) return null;
  return (
    <div style={{ padding: "5px 16px", background: cfg.bg, borderBottom: `1px solid ${cfg.col}33`,
      display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: cfg.col }}>{cfg.label}</span>
      <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{cfg.msg}</span>
    </div>
  );
}
