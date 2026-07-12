import { QURAN_RECITERS, SURAH_LIST, qUrl } from "./quran-data.js";

// The global <audio> element (with its play/pause/error/ended handlers) and all
// quran*/hasanat state stay in axiom-live.jsx's App() — they must survive tab
// switches so playback doesn't stop when the user leaves this tab. This
// component only renders the player UI; everything is passed down as props.
export default function QuranTab({
  C, MONO, SANS,
  quranSurah, setQuranSurah, quranSearchQuery, setQuranSearchQuery,
  quranDuration, quranCurrentTime, setQuranCurrentTime, quranAudioRef,
  quranPlaying, quranWasPlaying, quranAutoPlay, quranUsedFallback,
  quranAudioError, setQuranAudioError, quranLoading, setQuranLoading,
  quranReciter, setQuranReciter, quranVolume, setQuranVolume,
  quranRepeat, setQuranRepeat, quranAutoNext, setQuranAutoNext,
  quranShowText, setQuranShowText, quranText,
  hasanat, setHasanat, HASANAT_GOAL, creditSurah,
}) {
  const surahNum = quranSurah;
  const surahInfo = SURAH_LIST[surahNum - 1];
  const gold = "#c9a84c";
  const goldDim = "#c9a84c44";
  const goldBg  = "#c9a84c12";

  const fmtTime = (s) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const filteredSurahs = quranSearchQuery.trim()
    ? SURAH_LIST.filter(([n, ar, en]) =>
        en.toLowerCase().includes(quranSearchQuery.toLowerCase()) ||
        ar.includes(quranSearchQuery) ||
        String(n).startsWith(quranSearchQuery.trim())
      )
    : SURAH_LIST;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {/* ── Bismillah header ── */}
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 20, color: gold, letterSpacing: "0.08em", marginBottom: 4, direction: "rtl" }}>
          بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.14em" }}>QURAN RECITATION PLAYER</div>
      </div>

      {/* ── Main player card ── */}
      <div style={{ background: C.card, border: `1px solid ${goldDim}`, borderRadius: 18, padding: "22px 20px 18px", marginBottom: 14, boxShadow: `0 0 50px ${gold}08` }}>

        {/* Surah name */}
        <div style={{ textAlign: "center", marginBottom: 14, direction: "rtl" }}>
          <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 36, fontWeight: 900, color: gold, lineHeight: 1.2 }}>
            {surahInfo?.[1]}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 4, direction: "ltr" }}>
            {surahNum}. {surahInfo?.[2]}
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div style={{ marginBottom: 12 }}>
          <input
            type="range"
            min="0"
            max={quranDuration || 100}
            step="1"
            value={quranCurrentTime}
            onChange={e => {
              const t = Number(e.target.value);
              setQuranCurrentTime(t);
              if (quranAudioRef.current) quranAudioRef.current.currentTime = t;
            }}
            style={{ width: "100%", accentColor: gold, height: 4, cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 3 }}>
            <span>{fmtTime(quranCurrentTime)}</span>
            <span>{fmtTime(quranDuration)}</span>
          </div>
        </div>

        {/* ── Transport controls ── */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginBottom: 16 }}>
          {/* Prev surah */}
          <button
            onClick={() => {
              const prev = surahNum > 1 ? surahNum - 1 : 114;
              quranWasPlaying.current = quranPlaying;
              setQuranSurah(prev);
              localStorage.setItem("quran_surah", String(prev));
            }}
            title="السورة السابقة"
            style={{ background: C.surface, border: `1px solid ${goldDim}`, color: gold, borderRadius: 999, width: 46, height: 46, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >⏮</button>

          {/* Rewind 10s */}
          <button
            onClick={() => { if (quranAudioRef.current) quranAudioRef.current.currentTime = Math.max(0, quranCurrentTime - 10); }}
            title="-10 ثانية"
            style={{ background: C.surface, border: `1px solid ${goldDim}`, color: gold, borderRadius: 999, width: 40, height: 40, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO }}
          >-10</button>

          {/* Play / Pause — shows spinner while loading */}
          <button
            onClick={() => {
              if (!quranAudioRef.current) return;
              if (quranPlaying) {
                quranAutoPlay.current = false;
                quranAudioRef.current.pause();
              } else {
                quranAutoPlay.current     = true;
                quranUsedFallback.current = false;  // allow fallback on fresh play attempt
                setQuranAudioError(false);
                setQuranLoading(true);
                // Ensure src is set (re-apply in case it was cleared)
                if (!quranAudioRef.current.src || quranAudioRef.current.src === window.location.href) {
                  quranAudioRef.current.src = qUrl(quranReciter, quranSurah);
                }
                // With preload="none", must call load() before play()
                quranAudioRef.current.load();
                // Don't show error here — onError handles fallback first, shows error only if both CDNs fail
                quranAudioRef.current.play().catch(() => {});
              }
            }}
            style={{ background: quranAudioError ? C.red : gold, border: "none", color: "#fff", borderRadius: 999, width: 68, height: 68, fontSize: quranLoading ? 18 : 28, cursor: "pointer", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 20px ${gold}44`, transition: "transform 0.1s", flexShrink: 0 }}
          >
            {quranLoading ? "⌛" : quranPlaying ? "⏸" : "▶"}
          </button>

          {/* Forward 10s */}
          <button
            onClick={() => { if (quranAudioRef.current && quranDuration) quranAudioRef.current.currentTime = Math.min(quranDuration, quranCurrentTime + 10); }}
            title="+10 ثانية"
            style={{ background: C.surface, border: `1px solid ${goldDim}`, color: gold, borderRadius: 999, width: 40, height: 40, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO }}
          >+10</button>

          {/* Next surah */}
          <button
            onClick={() => {
              const next = surahNum < 114 ? surahNum + 1 : 1;
              quranWasPlaying.current = quranPlaying;
              setQuranSurah(next);
              localStorage.setItem("quran_surah", String(next));
            }}
            title="السورة التالية"
            style={{ background: C.surface, border: `1px solid ${goldDim}`, color: gold, borderRadius: 999, width: 46, height: 46, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >⏭</button>
        </div>

        {/* ── Volume slider ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, direction: "ltr" }}>
          <span style={{ fontSize: 16 }}>{quranVolume === 0 ? "🔇" : quranVolume < 0.5 ? "🔉" : "🔊"}</span>
          <input
            type="range" min="0" max="1" step="0.05"
            value={quranVolume}
            onChange={e => setQuranVolume(Number(e.target.value))}
            style={{ flex: 1, accentColor: gold, cursor: "pointer" }}
          />
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, minWidth: 30 }}>{Math.round(quranVolume * 100)}%</span>
        </div>

        {/* ── Mode toggles ── */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", direction: "ltr", justifyContent: "center" }}>
          <button
            onClick={() => setQuranRepeat(r => !r)}
            style={{ background: quranRepeat ? `${gold}22` : C.surface, border: `1px solid ${quranRepeat ? gold : C.border}`, color: quranRepeat ? gold : C.textDim, borderRadius: 6, padding: "7px 14px", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
          >
            🔂 <span>تكرار السورة</span>
          </button>
          <button
            onClick={() => setQuranAutoNext(a => !a)}
            style={{ background: quranAutoNext ? `${gold}22` : C.surface, border: `1px solid ${quranAutoNext ? gold : C.border}`, color: quranAutoNext ? gold : C.textDim, borderRadius: 6, padding: "7px 14px", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
          >
            ▶▶ <span>تشغيل تلقائي</span>
          </button>
          <a
            href={qUrl(quranReciter, surahNum)}
            download={`${surahInfo?.[2] || surahNum}.mp3`}
            target="_blank" rel="noopener noreferrer"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, padding: "7px 14px", fontFamily: MONO, fontSize: 12, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", gap: 5 }}
          >
            ⬇ <span>تنزيل</span>
          </a>
        </div>

        {/* Audio error banner */}
        {quranAudioError && (
          <div style={{ marginTop: 14, background: "#2a120a", border: "1px solid #cc4400", borderRadius: 10, padding: "12px 14px", direction: "ltr", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#ff6633" }}>⚠ تعذّر تشغيل الصوت — Audio unavailable</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: "#cc7755", marginTop: 4 }}>
                {quranReciter.full
                  ? <>ملف الصوت غير متاح مؤقتاً — Audio file temporarily unavailable.<br/>Try a different surah or click RETRY.</>
                  : <>هذه السورة غير متوفرة لهذا القارئ — surah not available for this reciter.<br/>Switch to a ★ reciter (Al-Afasy or Maher Al-Muaiqly have all 114 surahs).</>
                }
              </div>
            </div>
            <button
              onClick={() => {
                quranUsedFallback.current = false;
                quranAutoPlay.current     = true;
                setQuranAudioError(false);
                setQuranLoading(true);
                if (quranAudioRef.current) {
                  quranAudioRef.current.src = qUrl(quranReciter, surahNum);
                  quranAudioRef.current.load();
                  quranAudioRef.current.play().catch(() => {});
                }
              }}
              style={{ background: "#cc4400", border: "none", color: "#fff", borderRadius: 5, padding: "8px 14px", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
            >RETRY</button>
          </div>
        )}
      </div>

      {/* ── Reciter selector ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.1em" }}>القارئ — RECITER</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>★ = مكتبة كاملة 114 سورة</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
          {QURAN_RECITERS.map(r => (
            <button
              key={r.id}
              onClick={() => {
                quranWasPlaying.current = quranPlaying;
                setQuranReciter(r);
                localStorage.setItem("quran_reciter", JSON.stringify(r));
              }}
              style={{
                background: r.id === quranReciter.id ? `${gold}1a` : C.surface,
                border: `1px solid ${r.id === quranReciter.id ? gold : C.border}`,
                color: r.id === quranReciter.id ? gold : C.text,
                borderRadius: 8, padding: "10px 12px", cursor: "pointer",
                fontFamily: "Arial, sans-serif", fontSize: 13, textAlign: "right",
                direction: "rtl", lineHeight: 1.4, transition: "background 0.12s",
                position: "relative",
              }}
            >
              {r.label}
              {r.full && (
                <span style={{ position: "absolute", top: 5, left: 7, fontFamily: MONO, fontSize: 12, color: r.id === quranReciter.id ? gold : "#c9a84c88", lineHeight: 1 }}>★</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── 📖 READ — Arabic text of the current surah ── */}
      <div style={{ background: C.card, border: `1px solid ${goldDim}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: gold, letterSpacing: "0.1em" }}>📖 اقرأ — {surahInfo?.[1]}</div>
          <button onClick={() => { const v = !quranShowText; setQuranShowText(v); localStorage.setItem("quran_show_text", v ? "on" : "off"); }}
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              border: `1px solid ${quranShowText ? gold : C.border}`, background: quranShowText ? `${gold}1a` : C.surface, color: quranShowText ? gold : C.textDim }}>
            {quranShowText ? "إخفاء النص" : "إظهار النص"}
          </button>
        </div>
        {quranShowText && (
          quranText?.loading ? <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", padding: 16 }}>… جارٍ تحميل النص</div>
          : quranText?.error ? <div style={{ fontFamily: SANS, fontSize: 12, color: C.amber, textAlign: "center", padding: 12 }}>تعذّر تحميل النص — تحقّق من الاتصال.</div>
          : quranText?.ayahs ? (() => {
            const letters = (quranText.ayahs.map(a => a.ar).join(" ")
              .replace(/[ً-ْٰٓ-ٟۖ-ۭ]/g, "")  // strip tashkeel
              .match(/[ء-يٱ]/g) || []).length;
            const reward = letters * 10;
            const credited = hasanat.date === new Date().toDateString() && hasanat.done.includes(surahNum);
            const pct = Math.min(100, Math.round((hasanat.today / HASANAT_GOAL) * 100));
            return <>
            {/* Challenge bar */}
            <div style={{ background: `${gold}10`, border: `1px solid ${gold}33`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                <span style={{ fontFamily: SANS, fontSize: 12, color: C.textSec }}>هذه السورة: <strong style={{ color: gold }}>{letters.toLocaleString("en-US")}</strong> حرف = <strong style={{ color: gold }}>{reward.toLocaleString("en-US")}</strong> حسنة بإذن الله</span>
                <button onClick={() => creditSurah(surahNum, letters)} disabled={credited}
                  style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, padding: "5px 12px", borderRadius: 7, cursor: credited ? "default" : "pointer",
                    border: `1px solid ${credited ? C.green : gold}`, background: credited ? `${C.green}1a` : `${gold}1a`, color: credited ? C.green : gold }}>
                  {credited ? "✓ سُجّلت اليوم" : `✅ أنهيت التلاوة (+${reward.toLocaleString("en-US")})`}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>
                  🏆 تحدّي اليوم: <strong style={{ color: C.text }}>{hasanat.today.toLocaleString("en-US")}</strong> / {HASANAT_GOAL.toLocaleString("en-US")} حسنة · الإجمالي <strong style={{ color: C.text }}>{hasanat.total.toLocaleString("en-US")}</strong>
                </div>
                <button onClick={() => { if (window.confirm("تصفير العدّاد (اليوم والإجمالي)؟")) { const z = { total: 0, today: 0, date: "", done: [] }; setHasanat(z); localStorage.setItem("quran_hasanat", JSON.stringify(z)); } }}
                  style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 6, cursor: "pointer", border: `1px solid ${C.border}`, background: C.surface, color: C.textDim, whiteSpace: "nowrap" }}>↺ تصفير</button>
              </div>
              <div style={{ height: 7, background: C.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: gold, borderRadius: 4, transition: "width 0.4s" }} />
              </div>
              {hasanat.today >= HASANAT_GOAL && <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.green, marginTop: 6, textAlign: "center" }}>🎉 أكملت تحدّي اليوم — تقبّل الله! واصل للأجر.</div>}
            </div>
            <div dir="rtl" style={{ fontFamily: "'Amiri', 'Scheherazade New', 'Traditional Arabic', Georgia, serif", fontSize: 24, lineHeight: 2.2, color: C.text, textAlign: "right" }}>
              {surahNum !== 1 && surahNum !== 9 && <div style={{ textAlign: "center", color: gold, fontSize: 22, marginBottom: 10 }}>بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>}
              {quranText.ayahs.map(a => (
                <span key={a.n}>{a.ar} <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 26, height: 26, fontFamily: MONO, fontSize: 12, color: gold, border: `1px solid ${gold}66`, borderRadius: "50%", margin: "0 4px", verticalAlign: "middle" }}>{a.n}</span> </span>
              ))}
            </div>
            </>;
          })() : null
        )}
      </div>

      {/* ── Surah list (all 114, searchable) ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.1em" }}>
            السور — ALL SURAHS ({filteredSurahs.length}/114)
          </div>
          <input
            value={quranSearchQuery}
            onChange={e => setQuranSearchQuery(e.target.value)}
            placeholder="ابحث عن سورة  /  Search surah..."
            style={{
              border: `1px solid ${C.border}`, background: C.surface, color: C.text,
              borderRadius: 6, padding: "7px 12px", fontFamily: "Arial, sans-serif", fontSize: 13,
              outline: "none", width: 220, direction: "rtl",
            }}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 5, maxHeight: 400, overflowY: "auto", paddingRight: 4 }}>
          {filteredSurahs.map(([n, ar, en]) => {
            const isActive = n === surahNum;
            return (
              <button
                key={n}
                onClick={() => {
                  quranWasPlaying.current = quranPlaying;
                  setQuranSurah(n);
                  localStorage.setItem("quran_surah", String(n));
                }}
                style={{
                  background: isActive ? `${gold}1e` : C.surface,
                  border: `1px solid ${isActive ? gold : C.border}`,
                  color: isActive ? gold : C.text,
                  borderRadius: 8, padding: "9px 8px",
                  cursor: "pointer", textAlign: "right", direction: "rtl",
                  transition: "background 0.1s",
                }}
              >
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, fontWeight: isActive ? 700 : 400 }}>{ar}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: isActive ? `${gold}bb` : C.textDim, marginTop: 2, direction: "ltr" }}>{n}. {en}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
