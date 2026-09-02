"use strict";

const DATA_HEALTH_VERSION = "data-health-v1";
const STATUS_WEIGHT = { HEALTHY: 1, DEGRADED: 0.6, STALE: 0.25, UNAVAILABLE: 0 };

function normalizeSource(source, nowMs = Date.now()) {
  const required = source?.required !== false;
  const timestamp = Number.isFinite(source?.timestamp) ? source.timestamp : null;
  const staleAfterMs = Number.isFinite(source?.staleAfterMs) ? Math.max(0, source.staleAfterMs) : null;
  const available = source?.available !== false && source?.valuePresent !== false;
  const ageMs = timestamp == null ? null : Math.max(0, nowMs - timestamp);
  let status;
  if (!available) status = "UNAVAILABLE";
  else if (timestamp == null && staleAfterMs != null) status = "DEGRADED";
  else if (ageMs != null && staleAfterMs != null && ageMs > staleAfterMs) status = "STALE";
  else if (source?.degraded) status = "DEGRADED";
  else status = "HEALTHY";
  return { source: String(source?.source || "unknown"), required, status, timestamp, ageMs, staleAfterMs, note: source?.note || null };
}

function computeDataHealth(sources, { nowMs = Date.now() } = {}) {
  const normalized = (Array.isArray(sources) ? sources : []).map((s) => normalizeSource(s, nowMs));
  const required = normalized.filter((s) => s.required);
  const scored = required.length ? required : normalized;
  const score = scored.length ? Math.round(scored.reduce((sum, s) => sum + STATUS_WEIGHT[s.status], 0) / scored.length * 100) : 0;
  const blockers = normalized.filter((s) => s.required && (s.status === "STALE" || s.status === "UNAVAILABLE")).map((s) => `${s.source}: ${s.status.toLowerCase()}`);
  const warnings = normalized.filter((s) => s.status === "DEGRADED" || (!s.required && (s.status === "STALE" || s.status === "UNAVAILABLE"))).map((s) => `${s.source}: ${s.status.toLowerCase()}`);
  return {
    score, status: blockers.length ? "BLOCKED" : score >= 90 ? "HEALTHY" : score >= 70 ? "DEGRADED" : "POOR",
    confidenceMultiplier: Math.round(Math.max(0, Math.min(1, score / 100)) * 100) / 100,
    canTrade: blockers.length === 0, blockers, warnings, sources: normalized, timestamp: nowMs, engineVersion: DATA_HEALTH_VERSION,
  };
}

module.exports = { DATA_HEALTH_VERSION, normalizeSource, computeDataHealth };
