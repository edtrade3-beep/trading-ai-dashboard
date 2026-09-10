import { useState, useEffect } from "react";

// TasbeehCounter.jsx — Islamic tab Phase 2 (2026-09-10). Real tap counter
// for dhikr, persisted per-phrase in localStorage (so switching phrases or
// closing the tab never loses a real count). Vibrates on supported
// devices as a tactile confirmation — a real, small UX touch, not fake
// feedback.

const GREEN = "#0d9465";
const GREEN_DARK = "#0a6b48";
const CREAM = "#faf8f2";
const CARD = "#ffffff";
const BORDER = "#e4e0d2";
const TEXT = "#1c2b22";
const TEXT_DIM = "#6f7d73";
const SANS = "'Segoe UI', system-ui, -apple-system, sans-serif";

const PHRASES = [
  { id: "subhanallah", ar: "سُبْحَانَ اللَّهِ", en: "SubhanAllah", target: 33 },
  { id: "alhamdulillah", ar: "الْحَمْدُ لِلَّهِ", en: "Alhamdulillah", target: 33 },
  { id: "allahuakbar", ar: "اللَّهُ أَكْبَرُ", en: "Allahu Akbar", target: 34 },
  { id: "astaghfirullah", ar: "أَسْتَغْفِرُ اللَّهَ", en: "Astaghfirullah", target: 100 },
  { id: "custom", ar: "", en: "Custom", target: 100 },
];

const STORE_KEY = "islamic_tasbeeh_counts";
function loadCounts() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { return {}; } }
function saveCounts(c) { try { localStorage.setItem(STORE_KEY, JSON.stringify(c)); } catch {} }

export default function TasbeehCounter() {
  const [phraseId, setPhraseId] = useState(PHRASES[0].id);
  const [counts, setCounts] = useState(loadCounts);
  const [customTarget, setCustomTarget] = useState(100);

  useEffect(() => { saveCounts(counts); }, [counts]);

  const phrase = PHRASES.find((p) => p.id === phraseId);
  const count = counts[phraseId] || 0;
  const target = phraseId === "custom" ? customTarget : phrase.target;
  const reachedTarget = count > 0 && count % target === 0;

  const tap = () => {
    setCounts((c) => ({ ...c, [phraseId]: (c[phraseId] || 0) + 1 }));
    if (navigator.vibrate) navigator.vibrate(reachedTarget ? [40, 30, 40] : 15);
  };
  const reset = () => setCounts((c) => ({ ...c, [phraseId]: 0 }));

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 18 }}>
        {PHRASES.map((p) => (
          <button key={p.id} onClick={() => setPhraseId(p.id)}
            style={{ padding: "7px 12px", borderRadius: 999, fontFamily: SANS, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${phraseId === p.id ? GREEN : BORDER}`, background: phraseId === p.id ? `${GREEN}15` : CARD, color: phraseId === p.id ? GREEN_DARK : TEXT }}>
            {p.en}
          </button>
        ))}
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "32px 24px", textAlign: "center" }}>
        {phrase.ar && <div dir="rtl" style={{ fontFamily: "Georgia, serif", fontSize: 26, color: GREEN_DARK, marginBottom: 4 }}>{phrase.ar}</div>}
        <div style={{ fontFamily: SANS, fontSize: 14, color: TEXT_DIM, marginBottom: 20 }}>{phrase.en}</div>

        <button
          onClick={tap}
          style={{
            width: 180, height: 180, borderRadius: "50%", border: "none", cursor: "pointer",
            background: reachedTarget ? GREEN_DARK : GREEN, color: "#fff",
            fontFamily: SANS, fontSize: 52, fontWeight: 900, boxShadow: `0 6px 20px ${GREEN}44`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >{count}</button>

        {phraseId === "custom" && (
          <div style={{ marginTop: 16 }}>
            <label style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_DIM }}>Target: </label>
            <input type="number" value={customTarget} onChange={(e) => setCustomTarget(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: 70, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 8px", fontFamily: SANS, textAlign: "center", background: CREAM }} />
          </div>
        )}

        <div style={{ fontFamily: SANS, fontSize: 13, color: TEXT_DIM, marginTop: 18 }}>
          Target: {target} {reachedTarget && <span style={{ color: GREEN_DARK, fontWeight: 700 }}>· ✓ Reached {Math.floor(count / target)}× </span>}
        </div>

        <button onClick={reset} style={{ marginTop: 14, background: "transparent", border: `1px solid ${BORDER}`, color: TEXT_DIM, borderRadius: 10, padding: "8px 18px", fontFamily: SANS, fontWeight: 700, cursor: "pointer" }}>
          Reset
        </button>
      </div>
    </div>
  );
}
