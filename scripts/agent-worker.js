#!/usr/bin/env node
"use strict";
// scripts/agent-worker.js — the Claude side of the Astra/Claude task queue
// (2026-09-13, "remote development architecture" build).
//
// This is deliberately NOT a background daemon. Nothing in this repo
// invokes Claude Code automatically. The flow is:
//   1. A Telegram "/astra <task>" message enqueues a task AND Astra plans
//      it immediately (that part is automatic — Astra's plan call is
//      text-only, no code execution, so it's safe to run unattended).
//   2. A human — or an interactive Claude Code session the human is
//      running — calls this script to see what's queued, pick a task up,
//      and mark it done.
//   3. Astra reviews the completed work (text-only again) and the task
//      moves to "done".
// That's the entire "remote control" surface: real code changes always
// require a human in the loop. Explicit instruction honored: "Do not
// deploy destructive changes without safeguards" — this script never
// touches git, never deploys, and never places/cancels a trade.
const store = require("../src/agent-state-store");

function printTask(t) {
  console.log(`\n[${t.id}] ${t.status.toUpperCase()} — ${t.title}`);
  if (t.body && t.body !== t.title) console.log(`  ${t.body}`);
  if (t.plan?.text) {
    console.log(`  PLAN${t.plan.configured === false ? " (offline fallback)" : ""}:`);
    console.log(t.plan.text.split("\n").map((l) => "    " + l).join("\n"));
  }
}

function cmdList(args) {
  const status = args[0] && store.TASK_STATUSES.includes(args[0]) ? args[0] : null;
  const tasks = store.listTasks({ status, limit: 20 });
  if (!tasks.length) { console.log(status ? `No tasks with status "${status}".` : "No tasks queued."); return; }
  tasks.forEach(printTask);
}

function cmdNext() {
  const t = store.nextQueuedTask();
  if (!t) { console.log("Nothing queued or planned."); return; }
  printTask(t);
}

function cmdStart(args) {
  const id = args[0];
  if (!id) { console.error("Usage: agent-worker start <taskId>"); process.exitCode = 1; return; }
  const t = store.updateTask(id, { status: "in_progress" }, "claude", "started", null);
  if (!t) { console.error(`No such task: ${id}`); process.exitCode = 1; return; }
  store.touchAgent("claude", { lastAction: "started", lastTaskId: id });
  console.log(`Started ${id}.`);
}

async function cmdComplete(args) {
  const id = args[0];
  const summaryIdx = args.indexOf("--summary");
  const filesIdx = args.indexOf("--files");
  const summaryText = summaryIdx >= 0 ? args[summaryIdx + 1] : "";
  const files = filesIdx >= 0 ? String(args[filesIdx + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (!id || !summaryText) {
    console.error('Usage: agent-worker complete <taskId> --summary "..." [--files a.js,b.js]');
    process.exitCode = 1;
    return;
  }
  const t = store.updateTask(id, {
    status: "review",
    implementation: { summary: summaryText, filesChanged: files, completedAt: new Date().toISOString() },
  }, "claude", "completed", summaryText);
  if (!t) { console.error(`No such task: ${id}`); process.exitCode = 1; return; }
  store.touchAgent("claude", { lastAction: "completed", lastTaskId: id });
  console.log(`Marked ${id} complete — moved to review. Running Astra's review...`);
  const astra = require("../src/astra-agent");
  try {
    const review = await astra.reviewTask(store.getTask(id));
    store.updateTask(id, { status: "done", review }, "astra", "reviewed", review.configured ? null : "offline fallback review");
    store.touchAgent("astra", { lastAction: "reviewed", lastTaskId: id });
    console.log(`\nASTRA REVIEW:\n${review.text}`);
  } catch (err) {
    console.error(`Astra review failed: ${err.message} — task left in "review" status.`);
  }
}

function cmdStatus() {
  console.log(JSON.stringify(store.summary(), null, 2));
}

async function main() {
  const [, , cmd, ...args] = process.argv;
  switch (cmd) {
    case "list": return cmdList(args);
    case "next": return cmdNext();
    case "start": return cmdStart(args);
    case "complete": return cmdComplete(args);
    case "status": return cmdStatus();
    default:
      console.log("Usage: node scripts/agent-worker.js <list [status]|next|start <id>|complete <id> --summary \"...\" [--files a,b]|status>");
      process.exitCode = cmd ? 1 : 0;
  }
}

main();
