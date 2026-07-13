import { useState } from "react";
import { C, MONO, SANS } from "./theme.js";

export default function ApiKeyScreen({ onSubmit, fetchApiPayload, marketBaseUrl, normalizeQuoteResponse, toFriendlyApiMessage }) {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchApiPayload(`${marketBaseUrl}/quote?symbols=AAPL`);
      if (normalizeQuoteResponse(data).length > 0) {
        onSubmit(key.trim());
      } else {
        setError("Unexpected response. Verify your provider keys in server environment.");
      }
    } catch (e) {
      setError(toFriendlyApiMessage(e?.message || "Network error. Check your connection."));
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: SANS,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet" />
      <div style={{
        width: 440, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 40, textAlign: "center",
      }}>
        <div style={{
          fontFamily: MONO, fontSize: 28, fontWeight: 800, color: C.text,
          letterSpacing: "-0.03em", marginBottom: 4,
        }}>AXIOM</div>
        <div style={{
          fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.15em",
          marginBottom: 32, textTransform: "uppercase",
        }}>Market Intelligence Platform</div>

        <div style={{ textAlign: "left", marginBottom: 6 }}>
          <label style={{ fontSize: 12, fontFamily: MONO, color: C.textSec, letterSpacing: "0.06em" }}>
            PROVIDER ACCESS KEY
          </label>
        </div>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Optional key (server env keys recommended)"
          style={{
            width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 6, color: C.text, fontFamily: MONO, fontSize: 12, outline: "none",
            marginBottom: 12, boxSizing: "border-box",
          }}
          onFocus={(e) => e.target.style.borderColor = C.accent}
          onBlur={(e) => e.target.style.borderColor = C.border}
        />

        {error && (
          <div style={{ fontSize: 12, color: C.red, fontFamily: SANS, marginBottom: 10 }}>{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !key.trim()}
          style={{
            width: "100%", padding: "10px 0", background: loading ? C.textDim : C.accent,
            color: "#fff", border: "none", borderRadius: 6, fontFamily: MONO, fontSize: 12,
            fontWeight: 700, cursor: loading ? "wait" : "pointer", letterSpacing: "0.06em",
            marginBottom: 20, opacity: (!key.trim() && !loading) ? 0.5 : 1,
          }}
        >{loading ? "VALIDATING…" : "CONNECT"}</button>

        <div style={{
          fontSize: 12, fontFamily: SANS, color: C.textDim, lineHeight: 1.7,
          borderTop: `1px solid ${C.border}`, paddingTop: 16,
        }}>
          Configure provider keys on the server for best reliability:
          <br /><span style={{ color: C.accent, fontWeight: 600 }}>FINNHUB_API_KEY</span> and <span style={{ color: C.accent, fontWeight: 600 }}>FMP_API_KEY</span>
          <br />Yahoo remains an automatic fallback when available.
        </div>
      </div>
    </div>
  );
}
