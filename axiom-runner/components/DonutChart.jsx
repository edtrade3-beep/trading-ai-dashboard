// Annulus/donut chart — lifted from the portfolio allocation donut in
// PortfolioTab.jsx (raw SVG arc paths via arcPath()) and generalized to take
// any labeled segments (market internals breadth, allocation, etc.).
export default function DonutChart({ C, MONO, segments = [], centerLabel, centerValue, size = 200 }) {
  const total = segments.reduce((s, x) => s + Math.max(Number(x.value) || 0, 0), 0);
  if (!total) return null;
  const cx = 100, cy = 100, outerR = 72, innerR = 44;
  let angle = -Math.PI / 2;
  const slices = segments.map(seg => {
    const value = Math.max(Number(seg.value) || 0, 0);
    const pct = value / total;
    const startAngle = angle;
    angle += pct * 2 * Math.PI;
    return { ...seg, pct, startAngle, endAngle: angle };
  });
  function arcPath(start, end) {
    const x1 = cx + outerR * Math.cos(start), y1 = cy + outerR * Math.sin(start);
    const x2 = cx + outerR * Math.cos(end), y2 = cy + outerR * Math.sin(end);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${cx + innerR * Math.cos(start)} ${cy + innerR * Math.sin(start)} L ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} L ${cx + innerR * Math.cos(end)} ${cy + innerR * Math.sin(end)} A ${innerR} ${innerR} 0 ${large} 0 ${cx + innerR * Math.cos(start)} ${cy + innerR * Math.sin(start)} Z`;
  }
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox="0 0 200 200" style={{ flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i} d={arcPath(s.startAngle, s.endAngle)} fill={s.color} opacity={0.88} />
        ))}
        {centerLabel && <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill={C.textDim} fontFamily={MONO}>{centerLabel}</text>}
        {centerValue != null && <text x={cx} y={cy + 10} textAnchor="middle" fontSize={13} fontWeight={800} fill={C.text} fontFamily={MONO}>{centerValue}</text>}
      </svg>
      <div style={{ display: "grid", gap: "4px 14px", flex: 1, minWidth: 0 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.text, fontWeight: 700 }}>{s.label}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{(s.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
