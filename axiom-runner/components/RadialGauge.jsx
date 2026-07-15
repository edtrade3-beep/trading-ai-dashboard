// Semicircle SVG arc gauge — lifted from the Fear & Greed gauge pattern in
// CryptoTab.jsx (viewBox 0 0 120 68, 157-unit arc length) and generalized so
// any 0-100 score can be shown as a gauge (Market Regime, Today's Score, etc.)
export default function RadialGauge({ C, MONO, value = 0, label, sublabel, color, size = 120 }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const col = color || C.accent;
  const h = size * (68 / 120);
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ position: "relative", width: size, height: h, margin: "0 auto 4px" }}>
        <svg viewBox="0 0 120 68" style={{ width: "100%", height: "100%" }}>
          <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke={C.border} strokeWidth="12" strokeLinecap="round" />
          <path
            d="M10,60 A50,50 0 0,1 110,60"
            fill="none" stroke={col} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${(v / 100) * 157} 157`}
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: size >= 100 ? 28 : 20, fontWeight: 900, color: col, lineHeight: 1 }}>{Math.round(v)}</div>
        </div>
      </div>
      {label && <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: col, letterSpacing: "0.06em" }}>{label}</div>}
      {sublabel && <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 2 }}>{sublabel}</div>}
    </div>
  );
}
