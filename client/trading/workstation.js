const form = document.querySelector("#analysis-form");
const reportEl = document.querySelector("#report");
const scoreStrip = document.querySelector("#score-strip");
const regimeTag = document.querySelector("#regime-tag");
const loadDemoBtn = document.querySelector("#load-demo");
const copyReportBtn = document.querySelector("#copy-report");
const printReportBtn = document.querySelector("#print-report");
const fetchLiveBtn = document.querySelector("#fetch-live");
const liveStatusEl = document.querySelector("#live-status");
const headlineFeedEl = document.querySelector("#headline-feed");
const historyEl = document.querySelector("#history-panel");
const journalEl = document.querySelector("#journal-panel");
const clearHistoryBtn = document.querySelector("#clear-history");
const refreshJournalBtn = document.querySelector("#refresh-journal");
const journalFilterEl = document.querySelector("#journal-filter");
const logTradeBtn = document.querySelector("#log-trade");
const logStatusEl = document.querySelector("#log-status");

const STORAGE_FORM_KEY = "dixie_ws_form";
const STORAGE_HISTORY_KEY = "dixie_ws_history";
const HISTORY_MAX = 10;

let lastAnalysis = null;

const demoData = {
  ticker: "NVDA",
  timeframe: "1D",
  style: "Swing",
  price: 974.5,
  support: 952.0,
  resistance: 998.0,
  liquidityZone: "Above 998 buy stops, below 952 sell stops",
  trend: "Uptrend",
  structure: "Bullish BOS",
  volumeCharacter: "Accumulation",
  ema9: 969.2,
  ema21: 955.8,
  ema200: 842.4,
  vwap: 968.4,
  rsi: 63.4,
  divergence: "None",
  volumeSpike: "Yes",
  stopClusters: "Under 952 swing lows and above 998 breakout highs",
  fakeoutRisk: "Medium",
  newsSentiment: "Bullish",
  catalyst: "AI demand acceleration",
  newsNotes: "Data center demand remains strong and bullish AI capex commentary keeps dip buyers active.",
  spyTrend: "Uptrend",
  qqqTrend: "Uptrend",
  vix: 14.8,
  dxy: 103.2,
  yield2y: 4.52,
  yield10y: 4.21
};

const weights = {
  trend: 30,
  momentum: 20,
  volume: 15,
  news: 20,
  macro: 15
};

// Restore form state and history on page load
(function init() {
  try {
    const raw = localStorage.getItem(STORAGE_FORM_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      Object.entries(data).forEach(([key, value]) => {
        const field = form.elements.namedItem(key);
        if (field) field.value = value;
      });
    }
  } catch {}
  renderHistory();
  loadJournal();
})();

clearHistoryBtn && clearHistoryBtn.addEventListener("click", () => {
  try { localStorage.removeItem(STORAGE_HISTORY_KEY); } catch {}
  renderHistory();
});

refreshJournalBtn && refreshJournalBtn.addEventListener("click", loadJournal);

printReportBtn && printReportBtn.addEventListener("click", () => {
  const content = reportEl?.innerHTML;
  if (!content) return;
  const win = window.open("", "_blank", "width=800,height=900");
  win.document.write(`<!DOCTYPE html><html><head><title>Dixie Trading – Analysis Report</title>
<style>
  body { font-family: Inter, Arial, sans-serif; font-size: 14px; color: #0f172a; padding: 32px; max-width: 740px; margin: 0 auto; }
  .report-block { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; }
  .report-block:last-child { border-bottom: none; }
  .report-title { font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; color: #2563eb; }
  p { margin: 4px 0; line-height: 1.6; }
  @media print { body { padding: 0; } }
</style></head><body>${content}<p style="margin-top:32px;font-size:11px;color:#94a3b8;">Dixie Trading – Analyst Workstation · ${new Date().toLocaleString()}</p></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
});
journalFilterEl && journalFilterEl.addEventListener("input", () => {
  const term = (journalFilterEl.value || "").toUpperCase().trim();
  if (!term) { loadJournal(); return; }
  const items = document.querySelectorAll(".journal-item");
  items.forEach((item) => {
    const ticker = item.querySelector(".journal-ticker")?.textContent?.toUpperCase() || "";
    item.style.display = ticker.includes(term) ? "" : "none";
  });
});

loadDemoBtn.addEventListener("click", () => {
  Object.entries(demoData).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) {
      field.value = value;
    }
  });
  runAnalysis();
});

copyReportBtn.addEventListener("click", async () => {
  const text = reportEl.innerText.trim();
  if (!text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    copyReportBtn.textContent = "Copied";
    setTimeout(() => {
      copyReportBtn.textContent = "Copy Output";
    }, 1200);
  } catch {
    copyReportBtn.textContent = "Copy failed";
    setTimeout(() => {
      copyReportBtn.textContent = "Copy Output";
    }, 1200);
  }
});

fetchLiveBtn.addEventListener("click", async () => {
  const ticker = String(form.elements.namedItem("ticker").value || "").trim().toUpperCase();
  const timeframe = String(form.elements.namedItem("timeframe").value || "1D");
  const style = String(form.elements.namedItem("style").value || "Swing");

  if (!ticker) {
    liveStatusEl.textContent = "Enter ticker first";
    form.elements.namedItem("ticker").focus();
    return;
  }

  setLiveState("Fetching live data...");
  fetchLiveBtn.disabled = true;

  try {
    const response = await fetch(`/api/live?ticker=${encodeURIComponent(ticker)}&timeframe=${encodeURIComponent(timeframe)}&style=${encodeURIComponent(style)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Live request failed.");
    }

    Object.entries(payload.formData).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (field) {
        field.value = value;
      }
    });

    renderHeadlines(payload.news || [], payload.generatedAt, payload.source);
    setLiveState(`Live sync complete | ${new Date(payload.generatedAt).toLocaleString()}`);
    runAnalysis();
  } catch (error) {
    setLiveState(error instanceof Error ? error.message : "Live fetch failed");
  } finally {
    fetchLiveBtn.disabled = false;
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runAnalysis();
});

function runAnalysis() {
  const data = readForm();
  const indicatorState = analyzeIndicators(data);
  const score = calculateScores(data, indicatorState);
  const tradePlan = buildTradePlan(data, indicatorState, score);
  renderScores(score);
  renderReport(data, indicatorState, score, tradePlan);
  saveFormState(data);
  pushHistory(data, tradePlan, score);
  lastAnalysis = { data, tradePlan, score };
  if (logTradeBtn) logTradeBtn.disabled = false;
  if (logStatusEl) logStatusEl.textContent = "";
}

logTradeBtn && logTradeBtn.addEventListener("click", async () => {
  if (!lastAnalysis) return;
  const { data, tradePlan, score } = lastAnalysis;
  logTradeBtn.disabled = true;
  if (logStatusEl) logStatusEl.textContent = "Saving…";
  try {
    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: data.ticker,
        timeframe: data.timeframe,
        style: data.style,
        side: tradePlan.action,
        bias: tradePlan.bias,
        score: score.total,
        confidence: tradePlan.confidence,
        entry: tradePlan.entry,
        stopLoss: tradePlan.stopLoss,
        target: tradePlan.target,
        notes: data.newsNotes || "",
      }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || "Save failed");
    if (logStatusEl) logStatusEl.textContent = `Logged (${payload.entry.id.slice(0, 8)}…)`;
    setTimeout(() => { if (logStatusEl) logStatusEl.textContent = ""; }, 4000);
    await loadJournal();
  } catch (err) {
    if (logStatusEl) logStatusEl.textContent = err.message || "Log failed";
    logTradeBtn.disabled = false;
  }
});

function readForm() {
  const raw = Object.fromEntries(new FormData(form).entries());
  const numericFields = [
    "price",
    "support",
    "resistance",
    "ema9",
    "ema21",
    "ema200",
    "vwap",
    "rsi",
    "vix",
    "dxy",
    "yield2y",
    "yield10y"
  ];

  numericFields.forEach((field) => {
    raw[field] = Number(raw[field]);
  });

  return raw;
}

function analyzeIndicators(data) {
  const emaBullish = data.price > data.ema9 && data.ema9 > data.ema21 && data.ema21 > data.ema200;
  const emaBearish = data.price < data.ema9 && data.ema9 < data.ema21 && data.ema21 < data.ema200;
  const vwapState = data.price >= data.vwap ? "above" : "below";
  const rsiState = data.rsi >= 70 ? "overbought" : data.rsi <= 30 ? "oversold" : "balanced";
  const nearResistance = Math.abs(data.resistance - data.price) / data.price <= 0.015;
  const nearSupport = Math.abs(data.price - data.support) / data.price <= 0.015;
  const range = Math.abs(data.resistance - data.support);

  return {
    emaBullish,
    emaBearish,
    vwapState,
    rsiState,
    nearResistance,
    nearSupport,
    range
  };
}

function calculateScores(data, state) {
  let trend = 0;
  if (data.trend === "Uptrend") trend += 12;
  if (data.trend === "Downtrend") trend += 12;
  if (data.structure === "Bullish BOS" || data.structure === "Bearish BOS") trend += 10;
  if (state.emaBullish || state.emaBearish) trend += 8;
  trend = clamp(trend, 0, weights.trend);

  let momentum = 8;
  if (state.vwapState === "above" && data.trend === "Uptrend") momentum += 4;
  if (state.vwapState === "below" && data.trend === "Downtrend") momentum += 4;
  if (data.rsi >= 55 && data.rsi <= 68 && data.trend === "Uptrend") momentum += 5;
  if (data.rsi <= 45 && data.rsi >= 32 && data.trend === "Downtrend") momentum += 5;
  if (data.divergence === "Bullish" || data.divergence === "Bearish") momentum += 3;
  if (state.rsiState === "overbought" || state.rsiState === "oversold") momentum -= 2;
  momentum = clamp(momentum, 0, weights.momentum);

  let volume = 5;
  if (data.volumeCharacter === "Accumulation" || data.volumeCharacter === "Distribution") volume += 6;
  if (data.volumeSpike === "Yes") volume += 4;
  volume = clamp(volume, 0, weights.volume);

  let news = 10;
  if (data.newsSentiment === "Bullish") news += 7;
  if (data.newsSentiment === "Bearish") news -= 5;
  if (data.catalyst.trim()) news += 3;
  news = clamp(news, 0, weights.news);

  let macro = 6;
  const riskOn = data.spyTrend === "Uptrend" && data.qqqTrend === "Uptrend" && data.vix < 18;
  const riskOff = (data.spyTrend === "Downtrend" || data.qqqTrend === "Downtrend") && data.vix > 20;
  if (riskOn) macro += 6;
  if (riskOff) macro -= 3;
  if (data.dxy < 104.5) macro += 2;
  if (data.yield10y < data.yield2y) macro += 1;
  macro = clamp(macro, 0, weights.macro);

  return {
    trend,
    momentum,
    volume,
    news,
    macro,
    total: trend + momentum + volume + news + macro,
    riskOn,
    riskOff
  };
}

function buildTradePlan(data, state, score) {
  const bullishSignals = [
    data.trend === "Uptrend",
    data.structure === "Bullish BOS",
    state.emaBullish,
    state.vwapState === "above",
    data.newsSentiment === "Bullish",
    score.riskOn
  ].filter(Boolean).length;

  const bearishSignals = [
    data.trend === "Downtrend",
    data.structure === "Bearish BOS",
    state.emaBearish,
    state.vwapState === "below",
    data.newsSentiment === "Bearish",
    score.riskOff
  ].filter(Boolean).length;

  let bias = "Choppy";
  if (bullishSignals >= 4 && score.total >= 65) bias = "Bullish";
  if (bearishSignals >= 4 && score.total >= 60) bias = "Bearish";

  const control = bias === "Bullish"
    ? "Buyers control tape while price stays above value."
    : bias === "Bearish"
      ? "Sellers control tape while rallies fail into supply."
      : "Neither side has full control. Expect two-way liquidity grabs.";

  const holdLevel = bias === "Bearish" ? data.support : Math.max(data.support, data.ema21);
  const breakLevel = bias === "Bearish" ? Math.min(data.resistance, data.ema21) : data.support;

  const entry = bias === "Bullish"
    ? round2(Math.max(data.ema9, data.vwap))
    : bias === "Bearish"
      ? round2(Math.min(data.ema9, data.vwap))
      : round2((data.support + data.resistance) / 2);

  const stopLoss = bias === "Bullish"
    ? round2(Math.min(data.support, data.ema21) - state.range * 0.12)
    : bias === "Bearish"
      ? round2(Math.max(data.resistance, data.ema21) + state.range * 0.12)
      : round2(data.support - state.range * 0.08);

  const risk = Math.abs(entry - stopLoss) || Math.max(state.range * 0.1, Math.max(data.price * 0.005, 1));
  const target = bias === "Bearish"
    ? round2(entry - risk * 2.2)
    : round2(entry + risk * 2.2);

  const action = bias === "Choppy" || data.fakeoutRisk === "High" ? "WAIT" : bias === "Bullish" ? "BUY" : "SELL";
  const confidence = clamp(
    Math.round(score.total - (data.fakeoutRisk === "High" ? 12 : data.fakeoutRisk === "Medium" ? 6 : 0)),
    35,
    92
  );

  return {
    bias,
    control,
    holdLevel: round2(holdLevel),
    breakLevel: round2(breakLevel),
    entry,
    stopLoss,
    target,
    rr: `1:${round2(Math.abs(target - entry) / risk)}`,
    action,
    confidence
  };
}

function renderScores(score) {
  const tile = (label, val, max) =>
    `<div class="score-tile"><span>${label}</span><strong>${val}/${max}</strong></div>`;
  scoreStrip.innerHTML =
    tile("Trend", score.trend, weights.trend) +
    tile("Momentum", score.momentum, weights.momentum) +
    tile("Volume", score.volume, weights.volume) +
    tile("News", score.news, weights.news) +
    tile("Macro", score.macro, weights.macro);
}

function renderReport(data, state, score, plan) {
  const riskRegime = score.riskOn ? "Risk-on" : score.riskOff ? "Risk-off" : "Mixed";
  regimeTag.textContent = `${riskRegime} | Score ${score.total}/100`;

  reportEl.innerHTML = `
    <section class="report-block">
      <div class="report-title">1. Market Bias</div>
      <p><strong class="bias-${plan.bias.toLowerCase()}">${plan.bias}</strong> on ${data.ticker.toUpperCase()} (${data.timeframe}, ${data.style})</p>
      <p>Trend: ${data.trend}. Structure: ${data.structure}. EMA stack: ${state.emaBullish ? "bullishly aligned" : state.emaBearish ? "bearishly aligned" : "mixed"}. Price is ${state.vwapState} VWAP.</p>
    </section>

    <section class="report-block">
      <div class="report-title">2. Key Levels</div>
      <p>Support: ${round2(data.support)} | Resistance: ${round2(data.resistance)} | Liquidity: ${data.liquidityZone || "Not specified"}</p>
      <p>Stop clusters: ${data.stopClusters || "Not specified"}</p>
    </section>

    <section class="report-block">
      <div class="report-title">3. Momentum Control</div>
      <p>${plan.control}</p>
      <p>RSI ${data.rsi} is ${state.rsiState}. Divergence: ${data.divergence}. Volume profile suggests ${data.volumeCharacter.toLowerCase()}${data.volumeSpike === "Yes" ? " with participation spike" : ""}.</p>
    </section>

    <section class="report-block">
      <div class="report-title">4. Scenarios</div>
      <p>If price holds above ${plan.holdLevel}, expect ${plan.bias === "Bearish" ? "seller continuation toward lower liquidity" : "continuation into resistance and potential stop run"}.</p>
      <p>If price breaks below ${plan.breakLevel}, expect ${plan.bias === "Bullish" ? "long liquidation toward lower liquidity" : "failed bounce and downside extension"}.</p>
    </section>

    <section class="report-block">
      <div class="report-title">5. Best Trade Setup</div>
      <p>Entry: ${plan.entry} | Stop Loss: ${plan.stopLoss} | Target: ${plan.target} | Risk/Reward: ${plan.rr}</p>
      <p>Fakeout risk: ${data.fakeoutRisk}. Institutional read: ${data.volumeCharacter === "Accumulation" ? "accumulation bias" : data.volumeCharacter === "Distribution" ? "distribution bias" : "no clean footprint"}.</p>
    </section>

    <section class="report-block">
      <div class="report-title">6. News + Macro</div>
      <p>Sentiment: ${data.newsSentiment}. Catalyst: ${data.catalyst || "None supplied"}. Impact: ${data.newsNotes || "No news notes entered."}</p>
      <p>SPY: ${data.spyTrend} | QQQ: ${data.qqqTrend} | VIX: ${data.vix} | DXY: ${data.dxy} | 2Y: ${data.yield2y}% | 10Y: ${data.yield10y}% | Regime: ${riskRegime}</p>
    </section>

    <section class="report-block">
      <div class="report-title">7. Final Decision</div>
      <p>Confidence Level: ${plan.confidence}%</p>
      <p><strong>Clear Action: ${plan.action}</strong></p>
      <p>AI Score: ${score.total}/100</p>
    </section>
  `;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function setLiveState(message) {
  liveStatusEl.textContent = message;
}

function renderHeadlines(newsItems, generatedAt, source) {
  if (!newsItems.length) {
    headlineFeedEl.innerHTML = `<p class="placeholder">No fresh headlines were returned. Source: ${source || "Unknown"}.</p>`;
    return;
  }

  const stamp = generatedAt ? new Date(generatedAt).toLocaleString() : "Unknown time";
  const items = newsItems
    .map((item) => `
      <div class="headline-item">
        <a href="${item.link || "#"}" target="_blank" rel="noreferrer">${escapeHtml(item.title || "Untitled headline")}</a>
        <div class="headline-meta">${escapeHtml(item.publisher || "Unknown")} | ${item.publishedAt ? new Date(item.publishedAt).toLocaleString() : stamp}</div>
      </div>
    `)
    .join("");

  headlineFeedEl.innerHTML = `${items}<div class="headline-meta" style="margin-top:12px;">Source: ${escapeHtml(source || "Unknown")} | Synced: ${stamp}</div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function saveFormState(data) {
  try { localStorage.setItem(STORAGE_FORM_KEY, JSON.stringify(data)); } catch {}
}

function pushHistory(data, plan, score) {
  if (!data.ticker) return;
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : [];
    history.unshift({
      ticker: data.ticker,
      timeframe: data.timeframe,
      style: data.style,
      total: score.total,
      bias: plan.bias,
      action: plan.action,
      confidence: plan.confidence,
      ts: Date.now(),
      formData: data,
    });
    if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  } catch {}
}

async function loadJournal() {
  if (!journalEl) return;
  try {
    const [entriesRes, statsRes] = await Promise.all([
      fetch("/api/journal"),
      fetch("/api/journal/stats"),
    ]);
    const entriesData = await entriesRes.json();
    if (!entriesRes.ok) throw new Error(entriesData.error || "Failed to load journal");
    const statsData = statsRes.ok ? await statsRes.json() : null;
    renderJournal(entriesData.entries || [], statsData);
  } catch (err) {
    if (journalEl) journalEl.innerHTML = `<p class="placeholder" style="color:#dc2626;">${escapeHtml(err.message)}</p>`;
  }
}

function renderJournalStats(entries, serverStats) {
  const statsEl = document.querySelector("#journal-stats");
  if (!statsEl) return;
  if (!entries.length) { statsEl.style.display = "none"; return; }

  const s = serverStats || {};
  const closed = s.closed ?? entries.filter((e) => e.status === "closed").length;
  const open = s.open ?? entries.filter((e) => e.status === "open").length;
  const winRate = s.winRate != null ? `${s.winRate}%` : "—";
  const totalPnl = s.totalPnl != null ? `${s.totalPnl >= 0 ? "+" : ""}$${s.totalPnl.toFixed(0)}` : "—";
  const avgPnl = s.avgPnl != null ? `${s.avgPnl >= 0 ? "+" : ""}$${s.avgPnl.toFixed(0)}` : "—";
  const bestText = s.bestTrade ? `${s.bestTrade.ticker} +$${Math.round(s.bestTrade.pnl)}` : "—";

  statsEl.style.display = "flex";
  statsEl.innerHTML = [
    { label: "Trades", value: entries.length },
    { label: "Open", value: open },
    { label: "Win Rate", value: closed ? winRate : "—" },
    { label: "Total P&L", value: totalPnl },
    { label: "Avg P&L", value: avgPnl },
    { label: "Best Trade", value: bestText },
  ].map((item) => `<div class="journal-stat-chip"><span>${escapeHtml(String(item.value))}</span>${escapeHtml(item.label)}</div>`).join("");
}

function renderJournal(entries, serverStats) {
  if (!journalEl) return;
  renderJournalStats(entries, serverStats);
  if (!entries.length) {
    journalEl.innerHTML = `<p class="placeholder">No journal entries yet. Log a trade to start.</p>`;
    return;
  }
  journalEl.innerHTML = entries.map((e) => {
    const statusClass = `journal-status-${e.status}`;
    const pnlText = e.pnl != null ? ` · P&L: ${e.pnl >= 0 ? "+" : ""}$${e.pnl.toFixed(2)}` : "";
    const notesHtml = e.notes
      ? `<div class="journal-notes">${escapeHtml(e.notes)}</div>` : "";
    const closeForm = e.status === "open" ? `
      <div class="journal-close-form">
        <input type="number" step="0.01" placeholder="Close price" id="close-${e.id}" />
        <button class="btn-ghost journal-close-btn" data-id="${e.id}" style="font-size:11px;">Mark Closed</button>
        <button class="btn-ghost journal-cancel-btn" data-id="${e.id}" style="font-size:11px;color:#94a3b8;">Cancel</button>
      </div>
      <div class="journal-notes-form">
        <textarea id="notes-${e.id}" placeholder="Add notes…" rows="2" style="width:100%;font-size:11px;padding:4px 7px;border:1px solid rgba(100,116,139,0.2);border-radius:6px;background:#f8fafc;color:#0f172a;font-family:inherit;resize:vertical;">${escapeHtml(e.notes || "")}</textarea>
        <button class="btn-ghost journal-notes-btn" data-id="${e.id}" style="font-size:11px;">Save Notes</button>
      </div>` : notesHtml;
    return `<div class="journal-item">
      <div class="journal-row">
        <span class="journal-ticker">${escapeHtml(e.ticker)}</span>
        <span class="bias-${(e.bias || "choppy").toLowerCase()}" style="font-weight:700;font-size:11px;">${escapeHtml(e.side)}</span>
        <span class="journal-score">${e.score}/100</span>
        <span class="journal-prices">E:${e.entry} SL:${e.stopLoss} T:${e.target}${pnlText}</span>
        <span class="${statusClass}">${e.status.toUpperCase()}</span>
        <span class="journal-time">${new Date(e.openedAt).toLocaleDateString()}</span>
        <button class="btn-ghost journal-delete-btn" data-id="${e.id}" style="font-size:10px;padding:1px 7px;color:#dc2626;border-color:#fecaca;margin-left:auto;">Del</button>
      </div>
      ${closeForm}
    </div>`;
  }).join("");

  journalEl.querySelectorAll(".journal-close-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const input = journalEl.querySelector(`#close-${id}`);
      const closePrice = Number(input?.value);
      if (!closePrice) { input && (input.style.borderColor = "#dc2626"); return; }
      btn.disabled = true;
      try {
        const res = await fetch(`/api/journal/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "closed", closePrice }),
        });
        if (!res.ok) throw new Error("Failed to close");
        await loadJournal();
      } catch {
        btn.disabled = false;
      }
    });
  });

  journalEl.querySelectorAll(".journal-cancel-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/journal/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        });
        if (!res.ok) throw new Error("Failed");
        await loadJournal();
      } catch {
        btn.disabled = false;
      }
    });
  });

  journalEl.querySelectorAll(".journal-notes-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const textarea = journalEl.querySelector(`#notes-${id}`);
      const notes = textarea?.value || "";
      btn.disabled = true;
      btn.textContent = "Saving…";
      try {
        const res = await fetch(`/api/journal/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        });
        if (!res.ok) throw new Error("Failed");
        btn.textContent = "Saved";
        setTimeout(() => { btn.disabled = false; btn.textContent = "Save Notes"; }, 1500);
      } catch {
        btn.textContent = "Error";
        btn.disabled = false;
      }
    });
  });

  journalEl.querySelectorAll(".journal-delete-btn").forEach((btn) => {
    let deleteTimer = null;
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (btn.dataset.confirming !== "1") {
        btn.dataset.confirming = "1";
        btn.textContent = "Sure?";
        btn.style.borderColor = "#dc2626";
        deleteTimer = setTimeout(() => {
          btn.dataset.confirming = "";
          btn.textContent = "Del";
          btn.style.borderColor = "#fecaca";
        }, 2500);
        return;
      }
      clearTimeout(deleteTimer);
      btn.disabled = true;
      try {
        const res = await fetch(`/api/journal/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        await loadJournal();
      } catch {
        btn.disabled = false;
      }
    });
  });
}

function renderHistory() {
  if (!historyEl) return;
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : [];
    if (!history.length) {
      historyEl.innerHTML = `<p class="placeholder">Run an analysis to start tracking history.</p>`;
      return;
    }
    historyEl.innerHTML = history.map((h, i) => {
      const bias = h.bias || "Choppy";
      const biasClass = `bias-${bias.toLowerCase()}`;
      return `<div class="history-item">
        <span class="history-ticker">${escapeHtml(h.ticker)}</span>
        <span class="history-score">${h.total}/100</span>
        <span class="history-action ${biasClass}">${h.action}</span>
        <span class="history-time">${new Date(h.ts).toLocaleString()}</span>
        <button class="btn-ghost history-load" data-index="${i}">Load</button>
      </div>`;
    }).join("");
    historyEl.querySelectorAll(".history-load").forEach((btn) => {
      btn.addEventListener("click", () => {
        const entry = history[Number(btn.dataset.index)];
        if (!entry || !entry.formData) return;
        Object.entries(entry.formData).forEach(([key, value]) => {
          const field = form.elements.namedItem(key);
          if (field) field.value = value;
        });
        runAnalysis();
      });
    });
  } catch {}
}
