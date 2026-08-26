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
//
// Design upgraded again 2026-08-26 (explicit user follow-up pasting a
// full generative-image-editing-style design brief — vary gradient/
// typography/badge-shape, give the strongest claim visual prominence).
// Confirmed with the user: no image-generation API exists in this app
// (Claude vision input only), so this widens what the deterministic
// Canvas renderer can express instead — a real 2-color gradient fill, a
// real font-family choice (src/routes/photo-banner.js's curated
// system-font whitelist), a real badge-shape choice (circle/rounded-
// square), and a real "primary" badge rendered larger for genuine
// typographic hierarchy — while the underlying photo is still never
// touched, only drawn once and composited under the bar exactly as before.
const MAX_BADGES = 4;
const PRIMARY_BOOST = 1.22; // real, disclosed size multiplier for the one badge marked primary

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Real "shape" variety (explicit user follow-up, 2026-08-26 — "vary
// banner shape," not just full-width bars every time): a classic diagonal
// ribbon draped across one corner, holding a single short phrase. Pure
// rotation math around the chosen corner — no image alteration, drawn on
// top exactly like the bar layout.
function drawRibbon(ctx, canvas, sugg, fontStack, text) {
  const corner = sugg.corner || "top-right";
  const isLeft = corner.includes("left");
  const isTop = corner.includes("top");
  const shortSide = Math.min(canvas.width, canvas.height);
  const length = shortSide * 0.62;
  const thickness = Math.max(30, Math.round(shortSide * 0.085));

  const cx = isLeft ? 0 : canvas.width;
  const cy = isTop ? 0 : canvas.height;
  // Rotate so the ribbon's long axis runs diagonally FROM this corner INTO
  // the photo (canvas rotate() is clockwise with y pointing down).
  const baseAngle = isTop ? (isLeft ? Math.PI / 4 : (Math.PI * 3) / 4) : (isLeft ? -Math.PI / 4 : (-Math.PI * 3) / 4);
  const start = -length * 0.15; // small real overhang past the corner, the classic "wrapped" look

  let fontSize = Math.max(12, Math.round(thickness * 0.42));
  ctx.font = `900 ${fontSize}px ${fontStack}`;
  const visibleLength = length * 0.75;
  const textW = ctx.measureText(text.toUpperCase()).width;
  if (textW > visibleLength) fontSize = Math.max(9, Math.round(fontSize * (visibleLength / textW)));
  ctx.font = `900 ${fontSize}px ${fontStack}`;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(baseAngle);

  if (sugg.gradient && sugg.bgColor2 && sugg.bgColor2 !== sugg.bgColor) {
    const grad = ctx.createLinearGradient(start, 0, start + length, 0);
    grad.addColorStop(0, sugg.bgColor);
    grad.addColorStop(1, sugg.bgColor2);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = sugg.bgColor;
  }
  ctx.fillRect(start, -thickness / 2, length, thickness);

  const edge = Math.max(2, Math.round(thickness * 0.06));
  ctx.fillStyle = sugg.accentColor;
  ctx.fillRect(start, -thickness / 2, length, edge);
  ctx.fillRect(start, thickness / 2 - edge, length, edge);

  ctx.fillStyle = sugg.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), start + length / 2, 1);
  ctx.restore();
}

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

  function badgeMetrics(base, primary) {
    if (!primary) return base;
    return { iconR: Math.round(base.iconR * PRIMARY_BOOST), labelSize: Math.round(base.labelSize * PRIMARY_BOOST), labelSizeWithSub: Math.round(base.labelSizeWithSub * PRIMARY_BOOST), subSize: base.subSize };
  }

  function measureTotalWidth(ctx, sugg, badges, barHeight, scale, fontStack) {
    const base = layoutMetrics(barHeight, scale);
    let width = base.padX;
    if (sugg.titleText) {
      ctx.font = `900 ${base.titleSize}px ${fontStack}`;
      width += ctx.measureText(sugg.titleText.toUpperCase()).width + base.padX;
      if (badges.length) width += base.padX;
    }
    badges.forEach((b, i) => {
      const m = badgeMetrics(base, b.primary);
      width += m.iconR * 2 + Math.round(base.padX * 0.5);
      const label = b.label.toUpperCase();
      let labelW;
      if (b.sublabel) {
        ctx.font = `900 ${m.labelSizeWithSub}px ${fontStack}`;
        const wLabel = ctx.measureText(label).width;
        ctx.font = `700 ${m.subSize}px ${fontStack}`;
        const wSub = ctx.measureText(b.sublabel.toUpperCase()).width;
        labelW = Math.max(wLabel, wSub);
      } else {
        ctx.font = `800 ${m.labelSize}px ${fontStack}`;
        labelW = ctx.measureText(label).width;
      }
      width += labelW + base.padX;
      if (i < badges.length - 1) width += base.padX;
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

    const fontStack = `"${sugg.fontFamily || "Arial"}", Arial, sans-serif`;

    if (sugg.layout === "ribbon") {
      const primaryBadge = badges.find((b) => b.primary) || badges[0];
      const ribbonText = sugg.titleText || (primaryBadge ? [primaryBadge.label, primaryBadge.sublabel].filter(Boolean).join(" ") : "");
      if (ribbonText) drawRibbon(ctx, canvas, sugg, fontStack, ribbonText);
      return;
    }

    const barHeight = Math.max(56, Math.round(canvas.height * 0.11));
    const y = sugg.position === "bottom" ? canvas.height - barHeight : 0;
    const midY = y + barHeight / 2;
    const availableWidth = canvas.width - Math.round(barHeight * 0.32); // trailing margin at scale 1, real headroom

    const totalAtScale1 = measureTotalWidth(ctx, sugg, badges, barHeight, 1, fontStack);
    const scale = totalAtScale1 > availableWidth ? Math.max(MIN_FIT_SCALE, availableWidth / totalAtScale1) : 1;
    const base = layoutMetrics(barHeight, scale);
    const { padX, titleSize } = base;

    // Real background — flat fill, or a real 2-color gradient when the AI
    // (or a hand edit) opted into one, same real bar either way.
    if (sugg.gradient && sugg.bgColor2 && sugg.bgColor2 !== sugg.bgColor) {
      const grad = ctx.createLinearGradient(0, y, canvas.width, y);
      grad.addColorStop(0, sugg.bgColor);
      grad.addColorStop(1, sugg.bgColor2);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = sugg.bgColor;
    }
    ctx.fillRect(0, y, canvas.width, barHeight);

    // A thin accent-colored edge line — a small, real "premium" polish
    // touch along the bar's inner border.
    ctx.fillStyle = sugg.accentColor;
    ctx.fillRect(0, sugg.position === "bottom" ? y : y + barHeight - Math.max(2, Math.round(barHeight * 0.02)), canvas.width, Math.max(2, Math.round(barHeight * 0.02)));

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
      ctx.font = `900 ${titleSize}px ${fontStack}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = sugg.textColor;
      const t = sugg.titleText.toUpperCase();
      ctx.fillText(t, x, midY);
      x += ctx.measureText(t).width + padX;
      if (badges.length) { divider(x); x += padX; }
    }

    badges.forEach((b, i) => {
      const m = badgeMetrics(base, b.primary);
      if (sugg.badgeShape === "square") {
        roundRectPath(ctx, x, midY - m.iconR, m.iconR * 2, m.iconR * 2, Math.round(m.iconR * 0.35));
        ctx.fillStyle = sugg.accentColor;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x + m.iconR, midY, m.iconR, 0, Math.PI * 2);
        ctx.fillStyle = sugg.accentColor;
        ctx.fill();
      }
      ctx.font = `${Math.round(m.iconR * 1.15)}px ${fontStack}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(b.icon || "•", x + m.iconR, midY + 1);
      x += m.iconR * 2 + Math.round(padX * 0.5);

      ctx.textAlign = "left";
      ctx.fillStyle = sugg.textColor;
      const label = b.label.toUpperCase();
      if (b.sublabel) {
        ctx.font = `900 ${m.labelSizeWithSub}px ${fontStack}`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(label, x, midY - 1);
        const wLabel = ctx.measureText(label).width;
        ctx.font = `700 ${m.subSize}px ${fontStack}`;
        ctx.globalAlpha = 0.85;
        const sub = b.sublabel.toUpperCase();
        ctx.fillText(sub, x, midY - 1 + m.subSize + 2);
        const wSub = ctx.measureText(sub).width;
        ctx.globalAlpha = 1;
        x += Math.max(wLabel, wSub) + padX;
      } else {
        ctx.font = `800 ${m.labelSize}px ${fontStack}`;
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
  const addBadge = () => setSuggestion((s) => ({ ...s, badges: [...(s.badges || []), { icon: "✅", label: "NEW", sublabel: "", primary: false }].slice(0, MAX_BADGES) }));
  // Only one real "primary" (larger) badge at a time — matches the same
  // real "first one wins" rule src/routes/photo-banner.js's
  // sanitizeSuggestion enforces on the AI's own output.
  const togglePrimary = (i) => setSuggestion((s) => ({ ...s, badges: s.badges.map((b, idx) => ({ ...b, primary: idx === i ? !b.primary : false })) }));

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
                {field("SHAPE", (
                  <select style={inputStyle} value={suggestion.layout}
                    onChange={(e) => setSuggestion((s) => ({ ...s, layout: e.target.value }))}>
                    <option value="bar">Full bar</option>
                    <option value="ribbon">Corner ribbon</option>
                  </select>
                ))}
                {field(suggestion.layout === "ribbon" ? "RIBBON TEXT" : "TITLE", <input style={{ ...inputStyle, width: 180 }} value={suggestion.titleText}
                  onChange={(e) => setSuggestion((s) => ({ ...s, titleText: e.target.value.slice(0, 30) }))} placeholder={suggestion.layout === "ribbon" ? "e.g. SALE" : "(optional)"} />)}
                {suggestion.layout === "ribbon" ? field("CORNER", (
                  <select style={inputStyle} value={suggestion.corner}
                    onChange={(e) => setSuggestion((s) => ({ ...s, corner: e.target.value }))}>
                    <option value="top-left">Top left</option>
                    <option value="top-right">Top right</option>
                    <option value="bottom-left">Bottom left</option>
                    <option value="bottom-right">Bottom right</option>
                  </select>
                )) : field("POSITION", (
                  <select style={inputStyle} value={suggestion.position}
                    onChange={(e) => setSuggestion((s) => ({ ...s, position: e.target.value }))}>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                  </select>
                ))}
                {field("BACKGROUND", <input type="color" value={suggestion.bgColor}
                  onChange={(e) => setSuggestion((s) => ({ ...s, bgColor: e.target.value }))} style={colorSwatchStyle} />)}
                {suggestion.gradient && field("GRADIENT TO", <input type="color" value={suggestion.bgColor2}
                  onChange={(e) => setSuggestion((s) => ({ ...s, bgColor2: e.target.value }))} style={colorSwatchStyle} />)}
                {field("TEXT", <input type="color" value={suggestion.textColor}
                  onChange={(e) => setSuggestion((s) => ({ ...s, textColor: e.target.value }))} style={colorSwatchStyle} />)}
                {field("BADGE ACCENT", <input type="color" value={suggestion.accentColor}
                  onChange={(e) => setSuggestion((s) => ({ ...s, accentColor: e.target.value }))} style={colorSwatchStyle} />)}
                {field("GRADIENT", (
                  <button onClick={() => setSuggestion((s) => ({ ...s, gradient: !s.gradient, bgColor2: s.gradient ? s.bgColor2 : (s.bgColor2 || s.bgColor) }))}
                    style={{ ...smallBtn, borderColor: suggestion.gradient ? C.accent : C.border, color: suggestion.gradient ? C.accent : C.textDim, padding: "7px 10px" }}>
                    {suggestion.gradient ? "✓ On" : "Off"}
                  </button>
                ))}
                {field("FONT", (
                  <select style={inputStyle} value={suggestion.fontFamily}
                    onChange={(e) => setSuggestion((s) => ({ ...s, fontFamily: e.target.value }))}>
                    {["Arial", "Helvetica Neue", "Georgia", "Impact", "Trebuchet MS", "Verdana", "Futura"].map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                ))}
                {suggestion.layout !== "ribbon" && field("BADGE SHAPE", (
                  <select style={inputStyle} value={suggestion.badgeShape}
                    onChange={(e) => setSuggestion((s) => ({ ...s, badgeShape: e.target.value }))}>
                    <option value="circle">Circle</option>
                    <option value="square">Rounded square</option>
                  </select>
                ))}
              </div>

              {suggestion.layout !== "ribbon" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.4 }}>BADGES ({(suggestion.badges || []).length}/{MAX_BADGES}) — ⭐ marks the strongest claim (renders larger)</div>
                {(suggestion.badges || []).map((b, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input style={{ ...inputStyle, width: 48, textAlign: "center" }} value={b.icon}
                      onChange={(e) => updateBadge(i, { icon: e.target.value.slice(0, 4) })} title="Emoji icon" />
                    <input style={{ ...inputStyle, width: 130 }} value={b.label} placeholder="Label"
                      onChange={(e) => updateBadge(i, { label: e.target.value.slice(0, 16) })} />
                    <input style={{ ...inputStyle, width: 130 }} value={b.sublabel} placeholder="Sublabel (optional)"
                      onChange={(e) => updateBadge(i, { sublabel: e.target.value.slice(0, 16) })} />
                    <button onClick={() => togglePrimary(i)} title="Make this the primary (larger) badge"
                      style={{ ...smallBtn, borderColor: b.primary ? C.accent : C.border, color: b.primary ? C.accent : C.textDim }}>
                      {b.primary ? "⭐" : "☆"}
                    </button>
                    <button onClick={() => removeBadge(i)} style={smallBtn}>✕</button>
                  </div>
                ))}
                {(suggestion.badges || []).length < MAX_BADGES && (
                  <button onClick={addBadge} style={{ ...smallBtn, alignSelf: "flex-start" }}>+ Add badge</button>
                )}
              </div>
              )}

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
