// scan-rotation.js — shared helper for the "scan-coverage cutoff" bug class
// found repeatedly this session: a fixed .slice(0, N) on a real, growing
// user list (watchlist symbols, accounts, etc.) always picks the SAME
// first N items forever, silently and permanently excluding everything
// beyond N. Used wherever a periodic scan must bound real per-item network
// calls (can't just raise N without risking real rate-limiting) but still
// needs to eventually cover the full list — advances a caller-owned offset
// each call so repeated calls cycle through the whole list over time.
"use strict";

function nextRotatedSlice(all, batchSize, offsetRef) {
  if (all.length <= batchSize) return all;
  const start = offsetRef.value % all.length;
  const slice = start + batchSize <= all.length
    ? all.slice(start, start + batchSize)
    : [...all.slice(start), ...all.slice(0, start + batchSize - all.length)];
  offsetRef.value = (start + batchSize) % all.length;
  return slice;
}

module.exports = { nextRotatedSlice };
