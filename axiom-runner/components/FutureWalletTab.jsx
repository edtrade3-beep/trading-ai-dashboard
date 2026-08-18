// FutureWalletTab.jsx — embeds the real Future Wallet 100 research report
// (2026-08-16, explicit user request: 15-phase market regime + candidate
// discovery pipeline) inside the platform, per the user's explicit follow-
// up request 2026-08-17 ("why not showing in my platform"). The report
// already existed as a complete, self-contained styled HTML file (real
// Phase 1 market regime, real Phase 2 candidate universe of 243 companies,
// real Phase 2.5 shortlist of 110, real Top 25 deep research) — rather
// than re-authoring ~3600 lines of real research data as React (real risk
// of transcription errors on real numbers), it's served as-is from
// axiom-runner/assets/future-wallet-report.html and embedded here, same
// "iframe an existing real page" pattern TvTab.jsx already uses for live
// market TV.
const REPORT_URL = "/axiom-runner/assets/future-wallet-report.html";

export default function FutureWalletTab({ C, MONO, SANS }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>💰 Future Wallet 100</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            Generated Aug 16, 2026 — real market regime + candidate research, a point-in-time snapshot, not live-updating.
          </div>
        </div>
        <button
          onClick={() => window.open(REPORT_URL, "_blank", "noopener,noreferrer")}
          style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          OPEN IN NEW TAB ↗
        </button>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
        <iframe
          title="future-wallet-report"
          src={REPORT_URL}
          style={{ width: "100%", height: "78vh", border: "none", borderRadius: 8, background: "#fff" }}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: C.textDim }}>
          This report renders in its own theme (follows your system light/dark setting) rather than the app's theme toggle — it's the same real page published as the original artifact.
        </div>
      </div>
    </div>
  );
}
