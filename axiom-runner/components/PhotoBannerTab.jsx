import { useState, useRef, useEffect } from "react";

// PhotoBannerTab.jsx — "AI adds a banner to your photo" (explicit user
// request, 2026-08-26: "build tab so i can give image and ask to add
// banners by ai"). Real scope: Claude vision looks at the real uploaded
// photo + your real instruction and returns a real, disclosed placement/
// style suggestion (src/routes/photo-banner.js) — Claude cannot generate
// or edit image pixels (no such API exists anywhere in this app), so the
// actual banner is drawn deterministically here via real Canvas
// compositing, exactly where/how Claude said. You can also just edit the
// suggestion by hand before downloading — never locked to the AI's first
// answer.
export default function PhotoBannerTab({ C, MONO, SANS }) {
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const canvasRef = useRef(null);
  const imgElRef = useRef(null);

  function drawCanvas(img, sugg) {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    if (sugg && sugg.bannerText) {
      const bandHeight = Math.max(40, Math.round(canvas.height * 0.1));
      const y = sugg.position === "bottom" ? canvas.height - bandHeight : 0;
      ctx.fillStyle = sugg.bgColor;
      ctx.fillRect(0, y, canvas.width, bandHeight);
      ctx.fillStyle = sugg.textColor;
      const fontSize = Math.max(16, Math.round(bandHeight * 0.48));
      ctx.font = `800 ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(sugg.bannerText.toUpperCase(), canvas.width / 2, y + bandHeight / 2 + 1);
    }
  }

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setSuggestion(null);
    const reader = new FileReader();
    reader.onload = (ev) => setImageDataUrl(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  useEffect(() => {
    if (!imageDataUrl) return;
    const img = new Image();
    img.onload = () => { imgElRef.current = img; drawCanvas(img, suggestion); };
    img.src = imageDataUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDataUrl]);

  useEffect(() => {
    if (imgElRef.current) drawCanvas(imgElRef.current, suggestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion]);

  const askAi = async () => {
    if (!imageDataUrl) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/photo-banner/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, instruction }),
      });
      const j = await r.json();
      if (!j.ok) { setError(j.error || "Failed to get a real banner suggestion."); return; }
      setSuggestion(j.suggestion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get a real banner suggestion.");
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "banner.png";
    a.click();
  };

  const field = (label, node) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.4 }}>
      {label}
      {node}
    </label>
  );
  const inputStyle = { fontFamily: SANS, fontSize: 13, padding: "7px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.card, color: C.text };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>🎨 PHOTO BANNERS</div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
          Upload a photo, tell AI what banner you want (or leave it blank), and it'll suggest real text/placement/colors — then you can tweak anything before downloading.
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />

      {!imageDataUrl ? (
        <button onClick={() => fileRef.current?.click()}
          style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, padding: "12px 20px", borderRadius: 10, cursor: "pointer",
            border: `1px dashed ${C.accent}`, background: `${C.accent}0c`, color: C.accent }}>
          📤 Choose a photo…
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, overflow: "auto" }}>
            <canvas ref={canvasRef} style={{ maxWidth: "100%", display: "block", borderRadius: 6 }} />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => fileRef.current?.click()}
              style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "7px 12px", borderRadius: 7, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textDim }}>
              ↻ Choose a different photo
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={instruction} onChange={(e) => setInstruction(e.target.value)}
              placeholder='e.g. "add a SALE banner" — or leave blank and let AI decide'
              style={{ ...inputStyle, flex: "1 1 280px" }} />
            <button onClick={askAi} disabled={loading}
              style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, cursor: loading ? "default" : "pointer",
                border: `1px solid ${C.accent}`, background: `${C.accent}18`, color: C.accent, opacity: loading ? 0.7 : 1 }}>
              {loading ? "⌛ Thinking…" : "✨ Ask AI"}
            </button>
          </div>

          {error && (
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.red || "#c8282a", background: `${C.red || "#c8282a"}12`, border: `1px solid ${(C.red || "#c8282a")}44`, borderRadius: 8, padding: "8px 12px" }}>
              ⚠ {error}
            </div>
          )}

          {suggestion && (
            <div style={{ background: C.surface || C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>AI SUGGESTION — edit anything below, the canvas above updates live</div>
              {suggestion.reasoning && (
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec || C.textDim, fontStyle: "italic" }}>{suggestion.reasoning}</div>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {field("BANNER TEXT", <input style={inputStyle} value={suggestion.bannerText}
                  onChange={(e) => setSuggestion((s) => ({ ...s, bannerText: e.target.value.slice(0, 40) }))} />)}
                {field("POSITION", (
                  <select style={inputStyle} value={suggestion.position}
                    onChange={(e) => setSuggestion((s) => ({ ...s, position: e.target.value }))}>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                  </select>
                ))}
                {field("BACKGROUND", <input type="color" value={suggestion.bgColor}
                  onChange={(e) => setSuggestion((s) => ({ ...s, bgColor: e.target.value }))}
                  style={{ width: 44, height: 32, padding: 0, border: `1px solid ${C.border}`, borderRadius: 6, background: "transparent" }} />)}
                {field("TEXT COLOR", <input type="color" value={suggestion.textColor}
                  onChange={(e) => setSuggestion((s) => ({ ...s, textColor: e.target.value }))}
                  style={{ width: 44, height: 32, padding: 0, border: `1px solid ${C.border}`, borderRadius: 6, background: "transparent" }} />)}
              </div>
              <div>
                <button onClick={download}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${C.accent}`, background: C.accent, color: "#fff" }}>
                  ⬇ Download PNG
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
