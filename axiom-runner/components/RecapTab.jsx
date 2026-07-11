export default function RecapTab({ C, MONO, SANS }) {
  const [recap,      setRecap]      = React.useState(null);
  const [loading,    setLoading]    = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [status,     setStatus]     = React.useState("idle"); // idle | generating | done | error
  const [msg,        setMsg]        = React.useState("");
  const audioRef = React.useRef(null);

  const load = React.useCallback(() => {
    setLoading(true);
    fetch("/api/recap/latest")
      .then(r => r.json())
      .then(d => { if (d.ok) setRecap(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    setStatus("generating");
    setMsg("⏳ Fetching market data…");
    try {
      const r = await fetch("/api/recap/generate", { method: "POST" });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message || "Failed");
      setMsg("⏳ Generating script + audio + video… (~2 min)");
      // Poll for completion
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const latest = await fetch("/api/recap/latest").then(r => r.json()).catch(() => null);
        if (latest?.ok && latest.generatedAt) {
          const age = Date.now() - new Date(latest.generatedAt).getTime();
          if (age < 5 * 60 * 1000) { // generated within last 5 min = fresh
            clearInterval(poll);
            setRecap(latest);
            setStatus("done");
            setMsg("✅ Recap ready!");
            setGenerating(false);
            return;
          }
        }
        if (attempts >= 30) { // 2.5 min timeout
          clearInterval(poll);
          setStatus("error");
          setMsg("⚠️ Taking longer than expected — check back in a minute");
          setGenerating(false);
          load();
        }
        const msgs = ["⏳ Writing script…", "🎙 Generating voiceover…", "🎬 Rendering video…", "📦 Finishing up…"];
        setMsg(msgs[Math.min(Math.floor(attempts / 6), msgs.length - 1)]);
      }, 5000);
    } catch (e) {
      setStatus("error");
      setMsg(`Error: ${e.message}`);
      setGenerating(false);
    }
  };

  const fmt = v => typeof v === "number" ? (v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`) : "—";
  const data = recap?.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>🎬 MARKET RECAP STUDIO</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            Auto-runs at 3:45 PM ET weekdays · Script + Audio + Video
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {recap?.generatedAt && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
              Last: {new Date(recap.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button onClick={generate} disabled={generating}
            style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 20px", borderRadius: 8,
              border: "none", cursor: generating ? "default" : "pointer",
              background: generating ? C.surface : C.accent, color: generating ? C.textDim : "#fff" }}>
            {generating ? "⏳ Generating…" : "▶ Generate Now"}
          </button>
        </div>
      </div>

      {/* Status bar */}
      {msg && (
        <div style={{ padding: "10px 14px", borderRadius: 8,
          background: status === "done" ? `${C.green}12` : status === "error" ? `${C.red}12` : `${C.accent}12`,
          border: `1px solid ${status === "done" ? C.green : status === "error" ? C.red : C.accent}33`,
          fontFamily: SANS, fontSize: 13, color: status === "done" ? C.green : status === "error" ? C.red : C.accent }}>
          {msg}
        </div>
      )}

      {loading && !recap && (
        <div style={{ padding: 40, textAlign: "center", fontFamily: MONO, fontSize: 13, color: C.textDim }}>
          Loading recap…
        </div>
      )}

      {!recap && !loading && (
        <div style={{ padding: 32, textAlign: "center", background: C.card, borderRadius: 12, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎬</div>
          <div style={{ fontFamily: MONO, fontSize: 14, color: C.text, marginBottom: 8 }}>No recap yet</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 16 }}>
            Click Generate Now to create your first market recap.<br/>
            Auto-runs every weekday at 3:45 PM ET.
          </div>
          <button onClick={generate} disabled={generating}
            style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, padding: "10px 24px", borderRadius: 8,
              border: "none", cursor: "pointer", background: C.accent, color: "#fff" }}>
            ▶ Generate First Recap
          </button>
        </div>
      )}

      {recap && (
        <>
          {/* Download bar — visible immediately when any file is ready */}
          {(recap.voiceGenerated || recap.videoUrl) && (
            <div style={{ background: `${C.green}10`, border: `1px solid ${C.green}44`, borderRadius: 12,
              padding: "14px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.green, flex: 1 }}>
                ✅ Files ready — download below
              </span>
              {recap.voiceGenerated && (
                <a href="/api/recap/audio" download="market-recap.mp3"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO,
                    fontSize: 12, fontWeight: 800, textDecoration: "none", padding: "8px 18px",
                    borderRadius: 7, background: C.accent, color: "#fff" }}>
                  ⬇ MP3
                </a>
              )}
              {recap.videoUrl && (
                <a href="/api/recap/video" download="market-recap.mp4"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO,
                    fontSize: 12, fontWeight: 800, textDecoration: "none", padding: "8px 18px",
                    borderRadius: 7, background: "#16a34a", color: "#fff" }}>
                  ⬇ MP4
                </a>
              )}
              {recap.script && (
                <button onClick={() => navigator.clipboard?.writeText(recap.script).catch(() => {})}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 18px",
                    borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface,
                    color: C.text, cursor: "pointer" }}>
                  📋 Script
                </button>
              )}
            </div>
          )}

          {/* Market snapshot */}
          {data && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.1em", marginBottom: 10 }}>
                📊 MARKET DATA — {data.date}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                {[
                  ["SPY",   data.spy?.price,  data.spy?.chg],
                  ["QQQ",   data.qqq?.price,  data.qqq?.chg],
                  ["IWM",   data.iwm?.price,  data.iwm?.chg],
                  ["VIX",   data.vix?.price,  null],
                  ["Gold",  data.gold?.price, data.gold?.chg],
                  ["Oil",   data.oil?.price,  data.oil?.chg],
                  ["BTC",   data.btc?.price,  data.btc?.chg],
                ].map(([label, price, chg]) => (
                  <div key={label} style={{ textAlign: "center", padding: "8px 4px", background: C.surface, borderRadius: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{label}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>
                      {price ? `$${price >= 1000 ? price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : price.toFixed(2)}` : "—"}
                    </div>
                    {chg != null && (
                      <div style={{ fontFamily: MONO, fontSize: 10, color: chg >= 0 ? C.green : C.red }}>
                        {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {data.topSector && (
                <div style={{ marginTop: 10, display: "flex", gap: 16, fontFamily: SANS, fontSize: 12 }}>
                  <span style={{ color: C.green }}>✅ Leading: {data.topSector.name} ({fmt(data.topSector.chg)})</span>
                  <span style={{ color: C.red }}>❌ Lagging: {data.weakSector?.name} ({fmt(data.weakSector?.chg)})</span>
                </div>
              )}
            </div>
          )}

          {/* Audio player */}
          {recap.voiceGenerated && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.1em", marginBottom: 10 }}>
                🎙 VOICEOVER AUDIO
              </div>
              <audio ref={audioRef} controls style={{ width: "100%", borderRadius: 8 }}
                src="/api/recap/audio">
                Your browser does not support audio.
              </audio>
              <a href="/api/recap/audio" download="market-recap.mp3"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12,
                  fontFamily: MONO, fontSize: 13, fontWeight: 800, textDecoration: "none",
                  background: C.accent, color: "#fff", padding: "10px 20px",
                  borderRadius: 8, width: "100%", justifyContent: "center", boxSizing: "border-box" }}>
                ⬇ DOWNLOAD MP3
              </a>
            </div>
          )}

          {/* Video player */}
          {recap.videoUrl && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.1em", marginBottom: 10 }}>
                🎬 VIDEO RECAP
              </div>
              <video controls style={{ width: "100%", borderRadius: 8, background: "#000" }}
                src="/api/recap/video">
                Your browser does not support video.
              </video>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <a href="/api/recap/video" download="market-recap.mp4"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                    fontFamily: MONO, fontSize: 13, fontWeight: 800, textDecoration: "none",
                    background: "#16a34a", color: "#fff", padding: "10px 20px", borderRadius: 8 }}>
                  ⬇ DOWNLOAD MP4
                </a>
                <a href="/api/recap/video" download="market-recap.mp4"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                    fontFamily: MONO, fontSize: 12, fontWeight: 700, textDecoration: "none",
                    background: "#ff0000", color: "#fff", padding: "10px 16px", borderRadius: 8 }}>
                  ▶ Upload to YouTube
                </a>
              </div>
            </div>
          )}

          {/* Script */}
          {recap.script && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.1em" }}>
                  📝 VIDEO SCRIPT
                </div>
                <button onClick={() => navigator.clipboard?.writeText(recap.script).catch(() => {})}
                  style={{ fontFamily: MONO, fontSize: 10, padding: "3px 10px", borderRadius: 5,
                    border: `1px solid ${C.border}`, background: "transparent", color: C.textDim, cursor: "pointer" }}>
                  Copy
                </button>
              </div>
              <pre style={{ fontFamily: SANS, fontSize: 12, color: C.text, lineHeight: 1.8,
                whiteSpace: "pre-wrap", margin: 0, padding: "12px 14px",
                background: C.surface, borderRadius: 8, maxHeight: 400, overflowY: "auto" }}>
                {recap.script}
              </pre>
            </div>
          )}

          {/* Setup reminder */}
          {(!recap.voiceGenerated || !recap.videoUrl) && (
            <div style={{ padding: "12px 16px", background: `${C.amber}10`, border: `1px solid ${C.amber}33`,
              borderRadius: 10, fontFamily: SANS, fontSize: 12, color: C.amber }}>
              {!recap.voiceGenerated && "🎙 Add ELEVENLABS_API_KEY to Render to enable voiceover. "}
              {!recap.videoUrl && "🎬 Add SHOTSTACK_API_KEY to Render to enable video rendering."}
            </div>
          )}
        </>
      )}
    </div>
  );
}
