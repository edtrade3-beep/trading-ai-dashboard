// Compact SVG polyline sparkline — lifted from the intraday index-chart
// pattern in RhProDashboard.jsx and generalized to take a plain number series.
export default function Sparkline({ C, data = [], color, width = 240, height = 60 }) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const hi = Math.max(...data), lo = Math.min(...data), sp = (hi - lo) || 1;
  const P = 4;
  const xf = i => P + (i / (data.length - 1)) * (width - P * 2);
  const yf = v => P + ((hi - v) / sp) * (height - P * 2);
  const up = data[data.length - 1] >= data[0];
  const col = color || (up ? C.green : C.red);
  const points = data.map((v, i) => `${xf(i).toFixed(1)},${yf(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height: "auto", display: "block" }}>
      <polyline points={points} fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
