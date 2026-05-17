const crypto = require("node:crypto");
const { writeJson, readRequestBody } = require("../utils");
const { loadJournal, saveJournal, addEntry } = require("../journal-store");

const ALLOWED_STATUSES = ["open", "closed", "cancelled"];
const ALLOWED_SIDES = ["BUY", "SELL", "WAIT"];

function sanitizeEntry(raw) {
  return {
    ticker: String(raw.ticker || "").toUpperCase().trim().slice(0, 12),
    timeframe: String(raw.timeframe || "1D").slice(0, 8),
    style: String(raw.style || "Swing").slice(0, 16),
    side: ALLOWED_SIDES.includes(String(raw.side || "").toUpperCase()) ? String(raw.side).toUpperCase() : "WAIT",
    bias: String(raw.bias || "Choppy").slice(0, 16),
    score: Math.max(0, Math.min(100, Number(raw.score) || 0)),
    confidence: Math.max(0, Math.min(100, Number(raw.confidence) || 0)),
    entry: Number(raw.entry) || 0,
    stopLoss: Number(raw.stopLoss) || 0,
    target: Number(raw.target) || 0,
    size: Number(raw.size) || 0,
    notes: String(raw.notes || "").slice(0, 1000),
    status: "open",
  };
}

async function handleJournal(req, res, requestUrl) {
  const { pathname } = requestUrl;

  // GET /api/journal — list all entries
  if (pathname === "/api/journal" && req.method === "GET") {
    const entries = loadJournal();
    return writeJson(res, 200, { entries, count: entries.length });
  }

  // POST /api/journal — create a new entry
  if (pathname === "/api/journal" && req.method === "POST") {
    let body;
    try {
      const raw = await readRequestBody(req);
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { error: "Invalid JSON body" });
    }
    if (!body.ticker) return writeJson(res, 400, { error: "ticker is required" });

    const entry = {
      id: crypto.randomUUID(),
      ...sanitizeEntry(body),
      openedAt: new Date().toISOString(),
      closedAt: null,
      closePrice: null,
      pnl: null,
    };

    const current = loadJournal();
    const updated = addEntry(current, entry);
    saveJournal(updated);
    return writeJson(res, 201, { entry });
  }

  // PATCH /api/journal/:id — update an entry (close, add notes, etc.)
  const patchMatch = pathname.match(/^\/api\/journal\/([a-f0-9\-]{36})$/i);
  if (patchMatch && req.method === "PATCH") {
    const id = patchMatch[1];
    let body;
    try {
      const raw = await readRequestBody(req);
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { error: "Invalid JSON body" });
    }

    const entries = loadJournal();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return writeJson(res, 404, { error: "Entry not found" });

    const existing = entries[idx];
    const updates = {};

    if (body.status !== undefined) {
      if (!ALLOWED_STATUSES.includes(String(body.status))) {
        return writeJson(res, 400, { error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` });
      }
      updates.status = body.status;
      if (body.status === "closed" && !existing.closedAt) {
        updates.closedAt = new Date().toISOString();
      }
    }
    if (body.closePrice !== undefined) {
      updates.closePrice = Number(body.closePrice) || null;
      if (updates.closePrice && existing.entry) {
        const direction = existing.side === "SELL" ? -1 : 1;
        updates.pnl = direction * (updates.closePrice - existing.entry) * (existing.size || 1);
      }
    }
    if (body.notes !== undefined) updates.notes = String(body.notes).slice(0, 1000);
    if (body.size !== undefined) updates.size = Number(body.size) || 0;
    if (body.entry !== undefined && Number(body.entry) > 0) updates.entry = Math.round(Number(body.entry) * 10000) / 10000;
    if (body.stopLoss !== undefined) updates.stopLoss = Number(body.stopLoss) > 0 ? Math.round(Number(body.stopLoss) * 10000) / 10000 : null;
    if (body.target !== undefined) updates.target = Number(body.target) > 0 ? Math.round(Number(body.target) * 10000) / 10000 : null;

    entries[idx] = { ...existing, ...updates };
    saveJournal(entries);
    return writeJson(res, 200, { entry: entries[idx] });
  }

  // GET /api/journal/stats
  if (pathname === "/api/journal/stats" && req.method === "GET") {
    const entries = loadJournal();
    const closed = entries.filter((e) => e.status === "closed" && e.pnl != null);
    const wins = closed.filter((e) => e.pnl > 0);
    const losses = closed.filter((e) => e.pnl <= 0);
    const totalPnl = closed.reduce((s, e) => s + e.pnl, 0);
    const avgPnl = closed.length ? totalPnl / closed.length : 0;
    const bestTrade = closed.length ? closed.reduce((best, e) => (e.pnl > best.pnl ? e : best), closed[0]) : null;
    const worstTrade = closed.length ? closed.reduce((worst, e) => (e.pnl < worst.pnl ? e : worst), closed[0]) : null;
    const avgScore = entries.length ? Math.round(entries.reduce((s, e) => s + (e.score || 0), 0) / entries.length) : 0;
    const byTicker = {};
    closed.forEach((e) => {
      if (!byTicker[e.ticker]) byTicker[e.ticker] = { ticker: e.ticker, trades: 0, pnl: 0 };
      byTicker[e.ticker].trades++;
      byTicker[e.ticker].pnl += e.pnl;
    });
    const topTicker = Object.values(byTicker).sort((a, b) => b.pnl - a.pnl)[0] || null;
    return writeJson(res, 200, {
      total: entries.length,
      open: entries.filter((e) => e.status === "open").length,
      closed: closed.length,
      cancelled: entries.filter((e) => e.status === "cancelled").length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length ? Math.round((wins.length / closed.length) * 100) : null,
      totalPnl: closed.length ? Math.round(totalPnl * 100) / 100 : null,
      avgPnl: closed.length ? Math.round(avgPnl * 100) / 100 : null,
      avgScore,
      bestTrade: bestTrade ? { ticker: bestTrade.ticker, pnl: bestTrade.pnl } : null,
      worstTrade: worstTrade ? { ticker: worstTrade.ticker, pnl: worstTrade.pnl } : null,
      topTicker,
    });
  }

  // GET /api/journal/export.csv
  if (pathname === "/api/journal/export.csv" && req.method === "GET") {
    const entries = loadJournal();
    const header = "ID,Ticker,Timeframe,Style,Side,Bias,Score,Confidence,Entry,StopLoss,Target,Size,Status,ClosePrice,PnL,OpenedAt,ClosedAt,Notes";
    const rows = entries.map((e) =>
      [e.id, e.ticker, e.timeframe, e.style, e.side, e.bias, e.score, e.confidence,
       e.entry, e.stopLoss, e.target, e.size || 0, e.status,
       e.closePrice ?? "", e.pnl != null ? e.pnl.toFixed(2) : "",
       e.openedAt || "", e.closedAt || "", e.notes || ""]
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header, ...rows].join("\r\n");
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="journal-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    });
    res.end(csv);
    return;
  }

  // DELETE /api/journal/:id
  const deleteMatch = pathname.match(/^\/api\/journal\/([a-f0-9\-]{36})$/i);
  if (deleteMatch && req.method === "DELETE") {
    const id = deleteMatch[1];
    const entries = loadJournal();
    const filtered = entries.filter((e) => e.id !== id);
    if (filtered.length === entries.length) {
      return writeJson(res, 404, { error: "Entry not found" });
    }
    saveJournal(filtered);
    return writeJson(res, 200, { ok: true, deleted: id });
  }

  return writeJson(res, 404, { error: "Unknown journal endpoint." });
}

module.exports = handleJournal;
