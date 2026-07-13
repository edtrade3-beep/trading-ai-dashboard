import { C, MONO, SANS } from "./theme.js";

export default function PasswordLockScreen({ value, error, onChange, onSubmit }) {
  return (
    <div style={{
      minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: SANS,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet" />
      <div style={{
        width: 420, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 32, textAlign: "center",
      }}>
        <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>AM TRADING</div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 20 }}>
          PASSWORD PROTECTED
        </div>
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="Enter password"
          style={{
            width: "100%", boxSizing: "border-box", padding: "11px 12px",
            border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface,
            color: C.text, fontFamily: MONO, fontSize: 13, marginBottom: 12,
          }}
        />
        {error ? <div style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>{error}</div> : null}
        <button
          onClick={onSubmit}
          style={{
            width: "100%", border: `1px solid ${C.accent}`, background: C.accent, color: "#fff",
            borderRadius: 6, padding: "10px 0", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          UNLOCK
        </button>
      </div>
    </div>
  );
}
