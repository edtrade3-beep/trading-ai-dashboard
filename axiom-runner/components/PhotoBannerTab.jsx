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
//
// Layout upgraded 2026-08-26 (explicit user follow-up, showed a real
// dealership listing-photo example: a dark top bar with a title on the
// left and several icon badges like "✅ ONE OWNER" / "71K MILES ONLY")
// from a single plain text line to a real title + up to 4 icon/label/
// sublabel badges laid out left-to-right with dividers, matching that
// reference bar. No brand logo is ever drawn (no real logo asset exists
// in this app) — the title is real styled text instead.
const MAX_BADGES = 4;

export default function PhotoBannerTab({ C, MONO, SANS }) {
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const canvasRef = useRef(null);
  const imgElRef = useRef(null);

  // Real "shrink to fit" — a photo can be narrow/portrait, or the real
  // title + up to 4 badges can genuinely be wider than the image (explicit
  // user follow-up, 2026-08-26: "always make them fit the page"). Measures
  // the real layout width at scale 1 first (a pure measurement pass, no
  // drawing), then — only if it would actually overflow — uniformly
  // shrinks every real size (fonts, icon radius, spacing) by the exact
  // real ratio needed, clamped to a floor so text never shrinks into
  // unreadable. Never crops/truncates content silently; always the same
  // real title/badges, just sized to actually fit this specific photo.
  const MIN_FIT_SCALE = 0.45;

  function layoutMetrics(barHeight, scale) {
    const padX = Math.round(barHeight * 0.32 * scale);
    const titleSize = Math.max(11, Math.round(barHeight * 0.34 * scale));
    const iconR = Math.round(barHeight * 0.26 * scale);
    const labelSize = Math.max(9, Math.round(barHeight * 0.26 * scale));
    const labelSizeWithSub = Math.max(9, Math.round(barHeight * 0.25 * scale));
    const subSize = Math.max(7, Math.round(barHeight * 0.17 * scale));
    return { padX, titleSize, iconR, labelSize, labelSizeWithSub, subSize };
  }

  function measureTotalWidth(ctx, sugg, badges, barHeight, scale) {
    const { padX, titleSize, iconR, labelSize, labelSizeWithSub, subSize } = layoutMetrics(barHeight, scale);
    let width = padX;
    if (sugg.titleText) {
      ctx.font = `900 ${titleSize}px sans-serif`;
      width += ctx.measureText(sugg.titleText.toUpperCase()).width + padX;
      if (badges.length) width += padX;
    }
    badges.forEach((b, i) => {
      width += iconR * 2 + Math.round(padX * 0.5);
      const label = b.label.toUpperCase();
      let labelW;
      if (b.sublabel) {
        ctx.font = `900 ${labelSizeWithSub}px sans-serif`;
        const wLabel = ctx.measureText(label).width;
        ctx.font = `700 ${subSize}px sans-serif`;
        const wSub = ctx.measureText(b.sublabel.toUpperCase()).width;
        labelW = Math.max(wLabel, wSub);
      } else {
        ctx.font = `800 ${labelSize}px sans-serif`;
        labelW = ctx.measureText(label).width;
      }
      width += labelW + padX;
      if (i < badges.length - 1) width += padX;
    });
    return width;
  }

  function drawCanvas(img, sugg) {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const badges = (sugg?.badges || []).filter((b) => b.label);
    if (!sugg || (!sugg.titleText && !badges.length)) return;

    const barHeight = Math.max(56, Math.round(canvas.height * 0.11));
    const y = sugg.position === "bottom" ? canvas.height - barHeight : 0;
    const midY = y + barHeight / 2;
    const availableWidth = canvas.width - Math.round(barHeight * 0.32); // trailing margin at scale 1, real headroom

    const totalAtScale1 = measureTotalWidth(ctx, sugg, badges, barHeight, 1);
    const scale = totalAtScale1 > availableWidth ? Math.max(MIN_FIT_SCALE, availableWidth / totalAtScale1) : 1;
    const { padX, titleSize, iconR, labelSize, labelSizeWithSub, subSize } = layoutMetrics(barHeight, scale);

    ctx.fillStyle = sugg.bgColor;
    ctx.fillRect(0, y, canvas.width, barHeight);

    const divider = (x) => {
      ctx.save();
      ctx.strokeStyle = sugg.textColor;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(1, Math.round(barHeight * 0.02));
      ctx.beginPath();
      ctx.moveTo(x, y + barHeight * 0.22);
      ctx.lineTo(x, y + barHeight * 0.78);
      ctx.stroke();
      ctx.restore();
    };

    let x = padX;
    if (sugg.titleText) {
      ctx.font = `900 ${titleSize}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = sugg.textColor;
      const t = sugg.titleText.toUpperCase();
      ctx.fillText(t, x, midY);
      x += ctx.measureText(t).width + padX;
      if (badges.length) { divider(x); x += padX; }
    }

    badges.forEach((b, i) => {
      ctx.beginPath();
      ctx.arc(x + iconR, midY, iconR, 0, Math.PI * 2);
      ctx.fillStyle = sugg.accentColor;
      ctx.fill();
      ctx.font = `${Math.round(iconR * 1.15)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.icon || "•", x + iconR, midY + 1);
      x += iconR * 2 + Math.round(padX * 0.5);

      ctx.textAlign = "left";
      ctx.fillStyle = sugg.textColor;
      const label = b.label.toUpperCase();
      if (b.sublabel) {
        ctx.font = `900 ${labelSizeWithSub}px sans-serif`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(label, x, midY - 1);
        const wLabel = ctx.measureText(label).width;
        ctx.font = `700 ${subSize}px sans-serif`;
        ctx.globalAlpha = 0.85;
        const sub = b.sublabel.toUpperCase();
        ctx.fillText(sub, x, midY - 1 + subSize + 2);
        const wSub = ctx.measureText(sub).width;
        ctx.globalAlpha = 1;
        x += Math.max(wLabel, wSub) + padX;
      } else {
        ctx.font = `800 ${labelSize}px sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText(label, x, midY);
        x += ctx.measureText(label).width + padX;
      }

      if (i < badges.length - 1) { divider(x); x += padX; }
    });
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

  const updateBadge = (i, patch) => setSuggestion((s) => ({ ...s, badges: s.badges.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) }));
  const removeBadge = (i) => setSuggestion((s) => ({ ...s, badges: s.badges.filter((_, idx) => idx !== i) }));
  const addBadge = () => setSuggestion((s) => ({ ...s, badges: [...(s.badges || []), { icon: "✅", label: "NEW", sublabel: "" }].slice(0, MAX_BADGES) }));

  const field = (label, node) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.4 }}>
      {label}
      {node}
    </label>
  );
  const inputStyle = { fontFamily: SANS, fontSize: 13, padding: "7px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.card, color: C.text };
  const colorSwatchStyle = { width: 40, height: 32, padding: 0, border: `1px solid ${C.border}`, borderRadius: 6, background: "transparent", cursor: "pointer" };
  const smallBtn = { fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 6, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textDim };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>🎨 PHOTO BANNERS</div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
          Upload a photo, tell AI what banner you want (e.g. "one owner, 71k miles, clean title, gas saver, phone connection"), and it'll suggest a real title + icon badges — then tweak anything before downloading.
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
              placeholder='e.g. "one owner, 71k miles, clean title" — or leave blank and let AI decide'
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
            <div style={{ background: C.surface || C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>AI SUGGESTION — edit anything below, the canvas above updates live</div>
              {suggestion.reasoning && (
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec || C.textDim, fontStyle: "italic" }}>{suggestion.reasoning}</div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {field("TITLE", <input style={{ ...inputStyle, width: 180 }} value={suggestion.titleText}
                  onChange={(e) => setSuggestion((s) => ({ ...s, titleText: e.target.value.slice(0, 30) }))} placeholder="(optional)" />)}
                {field("POSITION", (
                  <select style={inputStyle} value={suggestion.position}
                    onChange={(e) => setSuggestion((s) => ({ ...s, position: e.target.value }))}>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                  </select>
                ))}
                {field("BACKGROUND", <input type="color" value={suggestion.bgColor}
                  onChange={(e) => setSuggestion((s) => ({ ...s, bgColor: e.target.value }))} style={colorSwatchStyle} />)}
                {field("TEXT", <input type="color" value={suggestion.textColor}
                  onChange={(e) => setSuggestion((s) => ({ ...s, textColor: e.target.value }))} style={colorSwatchStyle} />)}
                {field("BADGE ACCENT", <input type="color" value={suggestion.accentColor}
                  onChange={(e) => setSuggestion((s) => ({ ...s, accentColor: e.target.value }))} style={colorSwatchStyle} />)}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.4 }}>BADGES ({(suggestion.badges || []).length}/{MAX_BADGES})</div>
                {(suggestion.badges || []).map((b, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input style={{ ...inputStyle, width: 48, textAlign: "center" }} value={b.icon}
                      onChange={(e) => updateBadge(i, { icon: e.target.value.slice(0, 4) })} title="Emoji icon" />
                    <input style={{ ...inputStyle, width: 130 }} value={b.label} placeholder="Label"
                      onChange={(e) => updateBadge(i, { label: e.target.value.slice(0, 16) })} />
                    <input style={{ ...inputStyle, width: 130 }} value={b.sublabel} placeholder="Sublabel (optional)"
                      onChange={(e) => updateBadge(i, { sublabel: e.target.value.slice(0, 16) })} />
                    <button onClick={() => removeBadge(i)} style={smallBtn}>✕</button>
                  </div>
                ))}
                {(suggestion.badges || []).length < MAX_BADGES && (
                  <button onClick={addBadge} style={{ ...smallBtn, alignSelf: "flex-start" }}>+ Add badge</button>
                )}
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
