import { useState, useEffect, useCallback } from "react";

// AstraDevQueue.jsx (2026-09-13) — web front door onto the Astra/Claude
// dev-task queue, same shared state (data/agent-state.json) the Telegram
// /astra and /claude commands read/write via src/routes/agents.js. Built
// specifically so this is usable without Telegram (explicit user request:
// "why i need to use telegram for this"). Self-contained: fetches its own
// data, no new props threaded through axiom-live.jsx's own state.
//
// This is a dev-tooling surface, not a trading feature — it never touches
// execution-authority, never places an order, and Astra's calls here are
// text-only (a plan or a review), same real discipline as the backend.
const STATUS_COLOR = (C) => ({
  queued: C.textDim, planned: C.accent, in_progress: C.amber,
  review: C.amber, done: C.green, rejected: C.red,
});

export default function AstraDevQueue({ C, MONO, SANS }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        fetch("/api/agents/status").then((r) => r.json()),
        fetch("/api/agents/tasks?limit=20").then((r) => r.json()),
      ]);
      if (s?.ok) setStatus(s);
      if (t?.ok) setTasks(t.tasks || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function submitTask() {
    const t = text.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/agents/astra", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Astra couldn't plan this task.");
      setText("");
      if (j.task) setExpandedId(j.task.id);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const colors = STATUS_COLOR(C);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 8 }}>
            NEW TASK — ASTRA WILL PLAN IT (LEAD ARCHITECT / AUDITOR)
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe a dev task, e.g. 'Add a dark mode toggle to Settings'"
            style={{ width: "100%", minHeight: 90, resize: "vertical", background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "10px 12px", fontFamily: SANS, fontSize: 14, lineHeight: 1.45 }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <button
              onClick={submitTask}
              disabled={submitting || !text.trim()}
              style={{
                border: `1px solid ${C.accent}55`, background: `${C.accent}12`, color: C.accent,
                borderRadius: 6, padding: "6px 12px", fontFamily: MONO, fontSize: 12, fontWeight: 700,
                cursor: submitting || !text.trim() ? "not-allowed" : "pointer",
                opacity: submitting || !text.trim() ? 0.5 : 1,
              }}
            >
              {submitting ? "ASTRA IS PLANNING..." : "ASK ASTRA"}
            </button>
            <button
              onClick={refresh}
              style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
            >
              REFRESH
            </button>
            {error && <span style={{ fontSize: 12, color: C.red, fontFamily: MONO }}>{error}</span>}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
            Astra only produces a plan or a review — it never edits files, runs commands, or places trades.
            Real implementation happens through a human-run task queue (<code>node scripts/agent-worker.js</code>),
            never unattended.
          </div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 8 }}>STATUS</div>
          <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}>
            <b>Astra:</b> {status ? (status.astraConfigured ? "configured" : "offline fallback (no API key)") : "…"}
          </div>
          <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}><b>Total tasks:</b> {status?.totalTasks ?? "…"}</div>
          {status?.counts && (
            <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}>
              {Object.entries(status.counts).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: colors[k] || C.textSec }}>{k}</span><span>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 8 }}>TASK QUEUE</div>
        {!tasks.length && <div style={{ fontSize: 13, color: C.textDim }}>No tasks yet — submit one above.</div>}
        {tasks.map((t) => (
          <div key={t.id} style={{ borderTop: `1px solid ${C.border}`, padding: "8px 0" }}>
            <div
              onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            >
              <div style={{ fontSize: 13, color: C.text }}>{t.title}</div>
              <div style={{ fontSize: 11, fontFamily: MONO, color: colors[t.status] || C.textSec, textTransform: "uppercase" }}>{t.status}</div>
            </div>
            {expandedId === t.id && (
              <div style={{ marginTop: 8, fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>
                {t.plan?.text && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 4 }}>
                      ASTRA'S PLAN{t.plan.configured === false ? " (offline fallback)" : ""}
                    </div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: SANS, fontSize: 13 }}>{t.plan.text}</pre>
                  </div>
                )}
                {t.implementation?.summary && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 4 }}>IMPLEMENTATION</div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: SANS, fontSize: 13 }}>{t.implementation.summary}</pre>
                  </div>
                )}
                {t.review?.text && (
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 4 }}>
                      ASTRA'S REVIEW{t.review.configured === false ? " (offline fallback)" : ""}
                    </div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: SANS, fontSize: 13 }}>{t.review.text}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
