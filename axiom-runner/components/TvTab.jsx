import { LIVE_TV_SOURCES } from "./tv-sources.js";

export default function TvTab({ C, MONO, tvSource, setTvSource, selectedTvSource }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
          LIVE MARKET TV
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {LIVE_TV_SOURCES.map((src) => (
            <button
              key={src.id}
              onClick={() => setTvSource(src.id)}
              style={{
                border: `1px solid ${tvSource === src.id ? C.accent : C.border}`,
                background: tvSource === src.id ? `${C.accent}12` : C.surface,
                color: tvSource === src.id ? C.accent : C.text,
                borderRadius: 6,
                padding: "6px 10px",
                fontFamily: MONO,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {src.label}
            </button>
          ))}
          <button
            onClick={() => window.open(selectedTvSource.official, "_blank", "noopener,noreferrer")}
            style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
          >
            OPEN OFFICIAL
          </button>
        </div>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
        <iframe
          title="live-market-tv"
          src={selectedTvSource.embed}
          style={{ width: "100%", height: "72vh", border: "none", borderRadius: 8, background: "#000" }}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
        <div style={{ marginTop: 8, fontSize: 12, color: C.textDim }}>
          If this stream is blocked by provider policy, use <b>OPEN OFFICIAL</b>.
        </div>
      </div>
    </div>
  );
}
