import { riskBuzz, riskVibrate } from "./monitor-shared.js";

export default function FedInterpreter({ C, MONO, SANS }) {
  const [on, setOn] = React.useState(() => localStorage.getItem("axiom_fed_on") === "on");
  const [loading, setLoading] = React.useState(false);
  const [res, setRes] = React.useState(null);
  const [paste, setPaste] = React.useState("");
  const [watch, setWatch] = React.useState(false);
  const [news, setNews] = React.useState(null);
  const [newsLoading, setNewsLoading] = React.useState(false);
  const loadNews = async () => {
    setNewsLoading(true);
    try { const d = await fetch("/api/market/fed-news").then(r => r.json()); setNews(d); }
    catch (e) { setNews({ ok: false, error: e.message }); }
    setNewsLoading(false);
  };
  const interpret = async () => {
    setLoading(true); setRes(null);
    try { const d = await fetch("/api/market/fed-interpret").then(r => r.json()); setRes(d); } catch { setRes({ ok: false }); }
    setLoading(false);
  };
  const interpretPaste = async () => {
    if (!paste.trim()) return;
    setLoading(true); setRes(null);
    try { const d = await fetch("/api/market/fed-interpret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: paste }) }).then(r => r.json()); setRes(d); } catch { setRes({ ok: false }); }
    setLoading(false);
  };
  const sendTg = () => {
    if (!res?.ok) return;
    fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `🏛 *FED INTERPRETER*\n\n${res.label || res.bias} · ${res.score}/100${res.rateAction && res.rateAction !== "UNKNOWN" ? ` · ${res.rateAction}` : ""}\n${res.read}` }) }).catch(() => {});
  };
  // ── AUTO-SEND: when ON, poll for a FRESH statement and push to Telegram automatically (once) ──
  React.useEffect(() => {
    if (!on) return;
    const check = async () => {
      try {
        const d = await fetch("/api/market/fed-interpret").then(r => r.json());
        if (d?.ok && !d.stale) {
          const key = d.date || d.title || "";
          if (key && localStorage.getItem("axiom_fed_sent") !== key) {
            localStorage.setItem("axiom_fed_sent", key);
            setRes(d);
            if (localStorage.getItem("axiom_risklight_sound") === "on") riskBuzz(d.bias === "DOVISH" ? "GREEN" : d.bias === "HAWKISH" ? "RED" : "YELLOW");
            riskVibrate(d.bias === "DOVISH" ? "GREEN" : d.bias === "HAWKISH" ? "RED" : "YELLOW");
            const tg = `🏛 *FOMC STATEMENT — ${d.label || d.bias}*\n\nScore: ${d.score}/100${d.rateAction && d.rateAction !== "UNKNOWN" ? `\nDecision: ${d.rateAction}` : ""}\n${d.read}\n\n📄 ${d.title || ""}`;
            fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: tg }) }).catch(() => {});
          }
        }
      } catch {}
    };
    check();
    const t = setInterval(check, 15 * 1000); // every 15s while ON — catch the statement the second it drops
    return () => clearInterval(t);
  }, [on]);

  const col = res?.ok ? (res.bias === "DOVISH" ? C.green : res.bias === "HAWKISH" ? C.red : C.amber) : C.textDim;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em" }}>🏛 FED INTERPRETER</span>
        <button onClick={() => { const v = !on; setOn(v); localStorage.setItem("axiom_fed_on", v ? "on" : "off"); }}
          style={{ background: on ? "#7c3aed" : C.surface, color: on ? "#fff" : C.textSec, border: `1px solid ${on ? "#7c3aed" : C.border}`, borderRadius: 6, fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>
          {on ? "ON" : "OFF"}
        </button>
        <span style={{ fontFamily: SANS, fontSize: 10, color: on ? C.green : C.textDim }}>{on ? "🟢 AUTO — pushes the statement read to Telegram the moment it drops" : "Switch ON for auto-interpret + Telegram"}</span>
        {on && <button onClick={() => setWatch(w => !w)} style={{ marginLeft: "auto", background: watch ? "#dc2626" : C.surface, color: watch ? "#fff" : C.textSec, border: `1px solid ${watch ? "#dc2626" : C.border}`, borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>{watch ? "✕ HIDE LIVE" : "📺 WATCH LIVE"}</button>}
        {on && <button onClick={interpret} disabled={loading} style={{ background: loading ? C.surface : C.accent, color: loading ? C.textDim : "#fff", border: "none", borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 14px", cursor: loading ? "default" : "pointer" }}>{loading ? "…" : "🎙 INTERPRET FED"}</button>}
      </div>
      {on && watch && (
        <div style={{ marginTop: 10, position: "relative", paddingTop: "56.25%", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
          <iframe src="https://www.youtube.com/embed/QB5BNdBFujE?autoplay=1" title="Fed Live" frameBorder="0" allow="autoplay; encrypted-media" allowFullScreen
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
        </div>
      )}
      {on && (
        <div style={{ marginTop: 10 }}>
          {res?.ok ? (
            <div style={{ background: `${col}12`, border: `1px solid ${col}44`, borderRadius: 8, padding: "10px 12px" }}>
              {res.stale && <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 6 }}>⚠️ This is the LAST meeting's statement ({res.ageDays}d old) — no new one yet. Re-tap after 2pm ET on meeting day.</div>}
              <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: res.stale ? C.textDim : col }}>{res.label || res.bias} · {res.score}/100{res.stale ? " (old)" : ""}{res.rateAction && res.rateAction !== "UNKNOWN" ? ` · ${res.rateAction}` : ""}</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: C.text, marginTop: 4 }}>{res.read}</div>
              {(res.hawkishHits > 0 || res.dovishHits > 0) && (
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 5 }}>
                  🦅 hawkish {res.hawkishHits} · 🕊 dovish {res.dovishHits}{res.fullText ? " · full text" : " · headline only"}</div>
              )}
              {res.title && <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 6 }}>📄 {res.title} {res.date ? `· ${new Date(res.date).toLocaleDateString()}` : ""} <a href="https://www.federalreserve.gov/newsevents/pressreleases.htm" target="_blank" rel="noopener" style={{ color: C.accent }}>· open Fed releases</a></div>}
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button onClick={sendTg} style={{ background: `${C.accent}15`, border: `1px solid ${C.accent}44`, color: C.accent, borderRadius: 6, fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>📱 SEND TO TELEGRAM</button>
                <button onClick={loadNews} style={{ background: `${C.green}12`, border: `1px solid ${C.green}44`, color: C.green, borderRadius: 6, fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>{newsLoading ? "…" : "📰 MARKET REACTION"}</button>
              </div>
              {news && (
                <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                  {news.ok ? (
                    <>
                      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, marginBottom: 5 }}>WHAT ANALYSTS ARE SAYING <span style={{ fontWeight: 400 }}>· via Brave</span></div>
                      {news.headlines.map((h, i) => (
                        <div key={i} style={{ marginBottom: 7 }}>
                          <a href={h.url} target="_blank" rel="noopener" style={{ fontFamily: SANS, fontSize: 12, color: C.accent, textDecoration: "none", fontWeight: 600 }}>{h.title}</a>
                          <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>{h.source}{h.age ? ` · ${h.age}` : ""}</div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ fontFamily: SANS, fontSize: 11, color: C.amber }}>📰 {news.error}{/not set/i.test(news.error || "") ? " — add BRAVE_API_KEY in Render." : ""}</div>
                  )}
                </div>
              )}
            </div>
          ) : res && !res.ok ? (
            <div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.amber, marginBottom: 6 }}>Couldn't auto-fetch the statement — paste it here and interpret:</div>
              <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={3} placeholder="Paste the FOMC statement text…" style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: SANS, fontSize: 12, padding: "8px", boxSizing: "border-box", outline: "none" }} />
              <button onClick={interpretPaste} style={{ marginTop: 6, background: C.accent, color: "#fff", border: "none", borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 14px", cursor: "pointer" }}>SCORE IT</button>
            </div>
          ) : (
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Tap INTERPRET FED after the 2pm statement drops — it scores the policy dovish (risk-on) ↔ hawkish (risk-off).</div>
          )}
        </div>
      )}
    </div>
  );
}
