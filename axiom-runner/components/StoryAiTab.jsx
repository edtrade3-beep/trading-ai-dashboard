// StoryAiTab.jsx — Arabic Story AI, a completely self-contained module
// (2026-09-07, explicit user request). No shared state, styling helper,
// or logic borrowed from Trade Desk/Autopilot/Journal beyond the app's
// generic theme (C/MONO/SANS) and card/section-label atoms every other
// tab already uses — this never touches am-core-engine.js,
// opportunity-engine.js, or any trading data. All real logic lives
// server-side (src/story-ai-*.js); this file only calls
// /api/story-ai/* and renders real backend state — no fake progress.
import { useState, useEffect, useCallback, useRef } from "react";
import { cardStyle, sectionLabelStyle } from "./ui-atoms.jsx";

const TEMPLATES = [
  "الأمل وعدم الاستسلام", "الصبر وقت الشدة", "الخوف من الفشل", "الثقة بالنفس",
  "قوة التوكل", "حسن الظن بالله", "الوقت", "الغضب", "التسامح", "الندم",
  "البداية من جديد", "النجاح بعد الفشل", "الامتنان", "العادات", "الخوف من كلام الناس",
];

const STYLES = [
  ["inspirational", "Inspirational"], ["psychological", "Psychological"], ["islamic_reflection", "Islamic Reflection"],
  ["historical", "Historical"], ["wisdom", "Wisdom"], ["life_lesson", "Life Lesson"], ["children", "Children"],
];
const VISUAL_STYLES = ["Cinematic Realism", "Illustrated", "Watercolor", "Historical Cinematic", "Warm Storybook"];
const DIALECTS = [["msa", "Modern Standard Arabic"], ["gulf", "Gulf"], ["egyptian", "Egyptian"], ["levantine", "Levantine"], ["maghrebi", "Maghrebi"]];
const DURATIONS = [["60", 60], ["90", 90], ["2 min", 120]];
const STEP_LABELS = { story: "Story", verification: "Verification", scenes: "Scenes", images: "Images", voice: "Voice", subtitles: "Subtitles", video: "Video", quality: "Quality Check" };
const STEP_ORDER = ["story", "verification", "scenes", "images", "voice", "subtitles", "video", "quality"];

function StatusDot({ status, C }) {
  const map = { passed: { c: C.green, i: "✓" }, warning: { c: C.amber, i: "!" }, failed: { c: C.red, i: "✕" }, running: { c: C.accent, i: "…" }, pending: { c: C.textDim, i: "·" } };
  const m = map[status] || map.pending;
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: `${m.c}22`, color: m.c, fontSize: 11, fontWeight: 800 }}>{m.i}</span>;
}

function Pill({ children, C, MONO, active, onClick }) {
  return (
    <button onClick={onClick} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 7, cursor: "pointer",
      border: `1px solid ${active ? C.accent : C.border}`, background: active ? `${C.accent}18` : "transparent", color: active ? C.accent : C.textSec }}>
      {children}
    </button>
  );
}

function ConnStatus({ label, status, C, MONO }) {
  const color = status === "Connected" ? C.green : status === "Error" ? C.red : C.textDim;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, padding: "4px 0" }}>
      <span style={{ color: C.textDim }}>{label}</span>
      <span style={{ color, fontWeight: 700 }}>{status === "Connected" ? "🟢 Connected" : status === "Error" ? "🔴 Error" : "⚪ Missing"}</span>
    </div>
  );
}

// ── CREATE ──────────────────────────────────────────────────────────────
function CreateView({ C, MONO, SANS, status, onCreated }) {
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(120);
  const [style, setStyle] = useState("inspirational");
  const [visualStyle, setVisualStyle] = useState(VISUAL_STYLES[0]);
  const [voice, setVoice] = useState("male");
  const [dialect, setDialect] = useState("msa");
  const [notes, setNotes] = useState("");
  const [options, setOptions] = useState({
    generateHook: true, generateImages: true, generateVoice: true, generateSubtitles: true,
    addMusic: true, addMotion: true, generateThumbnail: true, generateCaption: true,
    factCheck: true, verifyReligious: true,
  });
  const [estimate, setEstimate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ideas, setIdeas] = useState(null);
  const [ideasBusy, setIdeasBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/story-ai/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationSeconds: duration, options }) })
      .then((r) => r.json()).then((d) => { if (alive && d.ok) setEstimate(d); }).catch(() => {});
    return () => { alive = false; };
  }, [duration, options.generateImages, options.generateVoice]);

  const toggle = (key) => setOptions((o) => ({ ...o, [key]: !o[key] }));

  const generate = async (scriptOnly) => {
    if (!topic.trim()) { setError("Enter a topic first."); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/story-ai/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, durationSeconds: duration, style, visualStyle, voice, dialect, notes, options, scriptOnly }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || "Could not start generation."); setBusy(false); return; }
      onCreated(d.project.id);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const suggestIdeas = async () => {
    setIdeasBusy(true);
    try {
      const r = await fetch("/api/story-ai/suggest", { method: "POST" });
      const d = await r.json();
      setIdeas(d.ok ? d.ideas : []);
    } catch { setIdeas([]); }
    setIdeasBusy(false);
  };

  const claudeMissing = status?.claude?.status !== "Connected";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {claudeMissing && (
        <div style={{ ...cardStyle(), border: `1px solid ${C.amber}55`, background: `${C.amber}0d` }}>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.amber, fontWeight: 700 }}>⚠ ANTHROPIC_API_KEY not set — Story AI's Claude service is not configured. Set it in your environment to generate stories.</div>
        </div>
      )}

      <div style={cardStyle()}>
        <div style={sectionLabelStyle({ marginBottom: 10 })}>NEW STORY VIDEO</div>

        <label style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Topic</label>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="مثال: الأمل بعد الفشل"
          dir="rtl" style={{ width: "100%", marginTop: 4, marginBottom: 12, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: SANS, fontSize: 15 }} />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 12 }}>
          <div>
            <div style={sectionLabelStyle({ marginBottom: 6 })}>DURATION</div>
            <div style={{ display: "flex", gap: 6 }}>{DURATIONS.map(([l, v]) => <Pill key={v} C={C} MONO={MONO} active={duration === v} onClick={() => setDuration(v)}>{l}</Pill>)}</div>
          </div>
          <div>
            <div style={sectionLabelStyle({ marginBottom: 6 })}>VOICE</div>
            <div style={{ display: "flex", gap: 6 }}>
              <Pill C={C} MONO={MONO} active={voice === "male"} onClick={() => setVoice("male")}>Arabic Male</Pill>
              <Pill C={C} MONO={MONO} active={voice === "female"} onClick={() => setVoice("female")}>Arabic Female</Pill>
            </div>
          </div>
        </div>

        <div style={sectionLabelStyle({ marginBottom: 6 })}>STORY STYLE</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>{STYLES.map(([id, l]) => <Pill key={id} C={C} MONO={MONO} active={style === id} onClick={() => setStyle(id)}>{l}</Pill>)}</div>

        <div style={sectionLabelStyle({ marginBottom: 6 })}>VISUAL STYLE</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>{VISUAL_STYLES.map((v) => <Pill key={v} C={C} MONO={MONO} active={visualStyle === v} onClick={() => setVisualStyle(v)}>{v}</Pill>)}</div>

        <div style={sectionLabelStyle({ marginBottom: 6 })}>DIALECT</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>{DIALECTS.map(([id, l]) => <Pill key={id} C={C} MONO={MONO} active={dialect === id} onClick={() => setDialect(id)}>{l}</Pill>)}</div>

        <div style={sectionLabelStyle({ marginBottom: 6 })}>OPTIONS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 12 }}>
          {[["generateHook", "Generate hook"], ["generateImages", "Generate images"], ["generateVoice", "Generate Arabic voice"], ["generateSubtitles", "Generate subtitles"],
            ["addMusic", "Add background music"], ["addMotion", "Add cinematic motion"], ["generateThumbnail", "Generate thumbnail"], ["generateCaption", "Generate social caption"],
            ["factCheck", "Fact-check factual claims"], ["verifyReligious", "Verify religious attribution"]].map(([key, label]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 11.5, color: C.textSec, cursor: "pointer" }}>
              <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} /> {label}
            </label>
          ))}
        </div>

        {estimate && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: estimate.overBudget ? C.red : C.textDim, marginBottom: 12 }}>
            Estimated cost: ${estimate.estimate.totalEstUSD.toFixed(2)} (Claude ${estimate.estimate.claudeEstUSD.toFixed(2)} + images ${estimate.estimate.imageEstUSD.toFixed(2)} + voice ${estimate.estimate.ttsEstUSD.toFixed(2)}) — cap ${estimate.maxCostPerVideoUSD.toFixed(2)}
            {estimate.overBudget && " ⚠ over your configured budget"}
          </div>
        )}
        {error && <div style={{ fontFamily: SANS, fontSize: 12, color: C.red, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => generate(false)} disabled={busy || claudeMissing}
            style={{ flex: 1, fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "11px 0", borderRadius: 8, border: "none", color: "#fff", background: busy || claudeMissing ? C.textDim : C.accent, cursor: busy || claudeMissing ? "not-allowed" : "pointer" }}>
            {busy ? "STARTING…" : "GENERATE VIDEO"}
          </button>
          <button onClick={() => generate(true)} disabled={busy || claudeMissing}
            style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "11px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textSec, cursor: busy || claudeMissing ? "not-allowed" : "pointer" }}>
            GENERATE SCRIPT ONLY
          </button>
        </div>
      </div>

      <div style={cardStyle()}>
        <div style={sectionLabelStyle({ marginBottom: 8 })}>TEMPLATES</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {TEMPLATES.map((t) => <Pill key={t} C={C} MONO={SANS} onClick={() => setTopic(t)}>{t}</Pill>)}
        </div>
      </div>

      <div style={cardStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={sectionLabelStyle()}>SUGGEST STORY IDEAS</div>
          <button onClick={suggestIdeas} disabled={ideasBusy || claudeMissing} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textSec, cursor: "pointer" }}>
            {ideasBusy ? "…" : "Suggest"}
          </button>
        </div>
        {ideas && (ideas.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{ideas.map((i, idx) => <Pill key={idx} C={C} MONO={SANS} onClick={() => setTopic(i.topic_ar)}>{i.topic_ar}</Pill>)}</div>
        ) : <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>No ideas returned — try again.</div>)}
      </div>
    </div>
  );
}

// ── PROJECT DETAIL (progress / editor / final screen) ───────────────────
function ProjectDetail({ C, MONO, SANS, projectId, onBack }) {
  const [project, setProject] = useState(null);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(null); // {field, value} for the story editor
  const pollRef = useRef(null);

  const load = useCallback(() => {
    fetch(`/api/story-ai/projects/${projectId}`).then((r) => r.json()).then((d) => {
      if (d.ok) { setProject(d.project); setRunning(d.running); }
    }).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 2500);
    return () => clearInterval(pollRef.current);
  }, [load]);

  useEffect(() => {
    if (!running && pollRef.current && project?.job?.status !== "running") {
      // Slow the poll way down once nothing is actively running, still
      // catches a later manual retry from another tab/device.
      clearInterval(pollRef.current);
      pollRef.current = setInterval(load, 8000);
    }
  }, [running, project?.job?.status, load]);

  const retry = async (step) => {
    await fetch(`/api/story-ai/projects/${projectId}/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step }) });
    load();
  };

  const saveEdit = async () => {
    if (!editing) return;
    await fetch(`/api/story-ai/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ story: { [editing.field]: editing.value } }) });
    setEditing(null);
    load();
  };

  if (!project) return <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: 20 }}>Loading…</div>;

  const steps = project.job?.steps || {};
  const ready = project.status === "Ready";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <button onClick={onBack} style={{ alignSelf: "flex-start", fontFamily: MONO, fontSize: 11, color: C.textDim, background: "transparent", border: "none", cursor: "pointer" }}>← Back</button>

      <div style={cardStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={sectionLabelStyle()}>{project.story?.title_ar || project.topic}</div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 3 }}>{project.id} · {project.status}{running ? " · generating…" : ""}</div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.textSec }}>${project.costLedger?.totalUSD?.toFixed(2) ?? "0.00"}</div>
        </div>
      </div>

      {/* CREATION PROGRESS — real backend state only */}
      <div style={cardStyle()}>
        <div style={sectionLabelStyle({ marginBottom: 10 })}>PIPELINE</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {STEP_ORDER.map((step) => {
            const s = steps[step] || { status: "pending" };
            return (
              <div key={step} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <StatusDot status={s.status} C={C} />
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.text, minWidth: 100 }}>{STEP_LABELS[step]}</span>
                {s.reason && <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, flex: 1 }}>{s.reason}</span>}
                {(s.status === "failed" || s.status === "warning") && !running && (
                  <button onClick={() => retry(step)} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 5, border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent, cursor: "pointer" }}>RETRY STEP</button>
                )}
              </div>
            );
          })}
        </div>
        {project.job?.error && <div style={{ fontFamily: SANS, fontSize: 11, color: C.red, marginTop: 10 }}>⚠ {project.job.error}</div>}
      </div>

      {/* VERIFICATION result */}
      {project.verification && (
        <div style={cardStyle({ border: `1px solid ${project.verification.approved_for_publication ? C.border : C.amber}55` })}>
          <div style={sectionLabelStyle({ marginBottom: 6 })}>VERIFICATION — {project.verification.classification.toUpperCase()}</div>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: project.verification.approved_for_publication ? C.green : C.amber, fontWeight: 700, marginBottom: 6 }}>
            {project.verification.approved_for_publication ? "✓ Approved for publication" : "⚠ Needs human review before proceeding"}
          </div>
          {(project.verification.warnings || []).map((w, i) => <div key={i} style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, marginTop: 2 }}>• {w}</div>)}
        </div>
      )}

      {/* STORY EDITOR */}
      {project.story && (
        <div style={cardStyle()}>
          <div style={sectionLabelStyle({ marginBottom: 8 })}>STORY EDITOR</div>
          {["title_ar", "hook_ar", "narration_ar", "lesson_ar", "ending_question_ar"].map((field) => (
            <div key={field} style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginBottom: 2 }}>{field.replace("_ar", "").toUpperCase()}</div>
              {editing?.field === field ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <textarea dir="rtl" value={editing.value} onChange={(e) => setEditing({ field, value: e.target.value })}
                    style={{ flex: 1, fontFamily: SANS, fontSize: 13, padding: 8, borderRadius: 6, border: `1px solid ${C.accent}`, background: C.bg, color: C.text, minHeight: 50 }} />
                  <button onClick={saveEdit} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 5, border: "none", background: C.accent, color: "#fff", cursor: "pointer" }}>SAVE</button>
                </div>
              ) : (
                <div dir="rtl" onClick={() => setEditing({ field, value: project.story[field] })} style={{ fontFamily: SANS, fontSize: 13, color: C.text, padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, cursor: "pointer" }}>
                  {project.story[field] || "—"}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* SCENES */}
      {Array.isArray(project.scenes) && project.scenes.length > 0 && (
        <div style={cardStyle()}>
          <div style={sectionLabelStyle({ marginBottom: 8 })}>SCENES ({project.scenes.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
            {project.scenes.map((s) => {
              const img = (project.images || []).find((i) => i.sceneNumber === s.scene_number);
              return (
                <div key={s.scene_number} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.border}44` }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, minWidth: 20 }}>#{s.scene_number}</div>
                  <div style={{ flex: 1 }}>
                    <div dir="rtl" style={{ fontFamily: SANS, fontSize: 12, color: C.text }}>{s.narration_ar}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginTop: 2 }}>{s.duration_seconds}s · {s.motion} · {img?.ok ? "🖼 image ready" : "no image"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* QUALITY */}
      {project.quality && (
        <div style={cardStyle()}>
          <div style={sectionLabelStyle({ marginBottom: 8 })}>QUALITY CHECK — {project.quality.overall_score}/100</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontFamily: MONO, fontSize: 11, marginBottom: 8 }}>
            {[["Script", project.quality.script_score], ["Visual", project.quality.visual_score], ["Audio", project.quality.audio_score], ["Subtitle", project.quality.subtitle_score],
              ["Consistency", project.quality.consistency_score], ["Factual safety", project.quality.factual_safety_score], ["Religious safety", project.quality.religious_safety_score]].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textDim }}>{l}</span><span style={{ fontWeight: 700 }}>{v}</span></div>
            ))}
          </div>
          {(project.quality.warnings || []).map((w, i) => <div key={i} style={{ fontFamily: SANS, fontSize: 11, color: C.amber }}>⚠ {w}</div>)}
          {(project.quality.blocking_issues || []).map((w, i) => <div key={i} style={{ fontFamily: SANS, fontSize: 11, color: C.red }}>✕ {w}</div>)}
        </div>
      )}

      {/* FINAL PROJECT SCREEN */}
      {ready && (
        <div style={cardStyle({ border: `1px solid ${C.green}55`, background: `${C.green}0d` })}>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.green, marginBottom: 8 }}>✅ READY</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 10 }}>
            {project.durationSeconds}s · 1080×1920 · {project.style} · Quality {project.quality?.overall_score}/100 · ${project.costLedger?.totalUSD?.toFixed(2)}
          </div>
          {project.finalVideo ? (
            <a href={`/api/story-ai/projects/${project.id}/assets/final/${path_basename(project.finalVideo.path)}`} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "10px 16px", borderRadius: 8, background: C.green, color: "#fff", textDecoration: "none", display: "inline-block" }}>DOWNLOAD VIDEO</a>
          ) : (
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>Final video assembly did not run in this environment (image/voice/ffmpeg not fully configured) — the script, scenes, and any generated images/audio are ready to review above.</div>
          )}
          {project.social && (
            <div style={{ marginTop: 12 }}>
              <div style={sectionLabelStyle({ marginBottom: 6 })}>SOCIAL METADATA</div>
              {[["Title", project.social.youtube_title_ar], ["Instagram", project.social.instagram_caption_ar], ["TikTok", project.social.tiktok_caption_ar], ["Thumbnail text", project.social.thumbnail_text_ar]].map(([l, v]) => (
                <div key={l} dir="rtl" style={{ fontFamily: SANS, fontSize: 12, color: C.text, marginBottom: 4 }}><b style={{ fontFamily: MONO, color: C.textDim }}>{l}:</b> {v}</div>
              ))}
              <div dir="ltr" style={{ fontFamily: MONO, fontSize: 10.5, color: C.accent, marginTop: 4 }}>{(project.social.hashtags || []).join(" ")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function path_basename(p) { return String(p || "").split("/").pop(); }

// ── PROJECTS ──────────────────────────────────────────────────────────
function ProjectsView({ C, MONO, SANS, onOpen }) {
  const [projects, setProjects] = useState([]);
  useEffect(() => { fetch("/api/story-ai/projects").then((r) => r.json()).then((d) => { if (d.ok) setProjects(d.projects); }); }, []);
  const del = async (id, e) => { e.stopPropagation(); await fetch(`/api/story-ai/projects/${id}`, { method: "DELETE" }); setProjects((p) => p.filter((x) => x.id !== id)); };
  const dup = async (id, e) => { e.stopPropagation(); const r = await fetch(`/api/story-ai/projects/${id}/duplicate`, { method: "POST" }); const d = await r.json(); if (d.ok) onOpen(d.project.id); };
  if (!projects.length) return <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, padding: 20, textAlign: "center" }}>No projects yet — create one from CREATE.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {projects.map((p) => (
        <div key={p.id} onClick={() => onOpen(p.id)} style={{ ...cardStyle(), cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div dir="rtl" style={{ fontFamily: "inherit", fontSize: 13, color: C.text, fontWeight: 700 }}>{p.title || p.topic}</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 2 }}>{p.status} · {p.durationSeconds}s · ${p.costUSD?.toFixed(2) ?? "0.00"} · {new Date(p.updatedAt).toLocaleString()}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={(e) => dup(p.id, e)} style={{ fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.textSec, cursor: "pointer" }}>Duplicate</button>
            <button onClick={(e) => del(p.id, e)} style={{ fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 5, border: `1px solid ${C.red}55`, background: "transparent", color: C.red, cursor: "pointer" }}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── LIBRARY ───────────────────────────────────────────────────────────
function LibraryView({ C, MONO, SANS }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  useEffect(() => { fetch(`/api/story-ai/library${filter !== "all" ? `?type=${filter}` : ""}`).then((r) => r.json()).then((d) => { if (d.ok) setItems(d.items); }); }, [filter]);
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {["all", "image", "audio", "video", "thumbnail"].map((t) => <Pill key={t} C={C} MONO={MONO} active={filter === t} onClick={() => setFilter(t)}>{t}</Pill>)}
      </div>
      {items.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it, i) => (
            <div key={i} style={{ ...cardStyle(), display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
              <span>{it.type}{it.sceneNumber ? ` · scene ${it.sceneNumber}` : ""}</span>
              <span style={{ color: C.textDim }}>{it.projectId}</span>
            </div>
          ))}
        </div>
      ) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, padding: 20, textAlign: "center" }}>No assets yet.</div>}
    </div>
  );
}

// ── SETTINGS ──────────────────────────────────────────────────────────
function SettingsView({ C, MONO, SANS, status }) {
  if (!status) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={cardStyle()}>
        <div style={sectionLabelStyle({ marginBottom: 8 })}>CONNECTIONS</div>
        <ConnStatus label="Claude (Anthropic)" status={status.claude.status} C={C} MONO={MONO} />
        <ConnStatus label={`Images (${status.images.provider})`} status={status.images.status} C={C} MONO={MONO} />
        <ConnStatus label={`Voice (${status.voice.provider})`} status={status.voice.status} C={C} MONO={MONO} />
        <ConnStatus label="FFmpeg" status={status.ffmpeg.status} C={C} MONO={MONO} />
        <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 8 }}>
          Set ANTHROPIC_API_KEY, OPENAI_API_KEY or REPLICATE_API_TOKEN, ELEVENLABS_API_KEY or AZURE_SPEECH_KEY/AZURE_SPEECH_REGION in your environment to connect each service. Never enter API keys in this UI — they are server-side only.
        </div>
      </div>
      <div style={cardStyle()}>
        <div style={sectionLabelStyle({ marginBottom: 8 })}>BUDGET</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>Maximum cost per video: ${status.maxCostPerVideoUSD.toFixed(2)} (STORY_AI_MAX_COST_USD)</div>
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────
export default function StoryAiTab({ C, MONO, SANS }) {
  const [section, setSection] = useState("create"); // create | projects | library | settings
  const [openProjectId, setOpenProjectId] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => { fetch("/api/story-ai/status").then((r) => r.json()).then((d) => { if (d.ok) setStatus(d); }); }, [section]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "14px 12px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 20 }}>🎬</span>
        <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>Story AI</span>
        <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Arabic vertical-video storytelling studio</span>
      </div>

      {!openProjectId && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["create", "CREATE"], ["projects", "PROJECTS"], ["library", "LIBRARY"], ["settings", "SETTINGS"]].map(([id, l]) => (
            <Pill key={id} C={C} MONO={MONO} active={section === id} onClick={() => setSection(id)}>{l}</Pill>
          ))}
        </div>
      )}

      {openProjectId ? (
        <ProjectDetail C={C} MONO={MONO} SANS={SANS} projectId={openProjectId} onBack={() => setOpenProjectId(null)} />
      ) : section === "create" ? (
        <CreateView C={C} MONO={MONO} SANS={SANS} status={status} onCreated={setOpenProjectId} />
      ) : section === "projects" ? (
        <ProjectsView C={C} MONO={MONO} SANS={SANS} onOpen={setOpenProjectId} />
      ) : section === "library" ? (
        <LibraryView C={C} MONO={MONO} SANS={SANS} />
      ) : (
        <SettingsView C={C} MONO={MONO} SANS={SANS} status={status} />
      )}
    </div>
  );
}
