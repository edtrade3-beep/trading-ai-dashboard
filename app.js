const form = document.querySelector("#analysis-form");
const reportEl = document.querySelector("#report");
const scoreStrip = document.querySelector("#score-strip");
const regimeTag = document.querySelector("#regime-tag");
const loadDemoBtn = document.querySelector("#load-demo");
const copyReportBtn = document.querySelector("#copy-report");
const fetchLiveBtn = document.querySelector("#fetch-live");
const liveStatusEl = document.querySelector("#live-status");
const headlineFeedEl = document.querySelector("#headline-feed");

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
}

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
  scoreStrip.innerHTML = `
    <div><span>Trend</span><strong>${score.trend}/${weights.trend}</strong></div>
    <div><span>Momentum</span><strong>${score.momentum}/${weights.momentum}</strong></div>
    <div><span>Volume</span><strong>${score.volume}/${weights.volume}</strong></div>
    <div><span>News</span><strong>${score.news}/${weights.news}</strong></div>
    <div><span>Macro</span><strong>${score.macro}/${weights.macro}</strong></div>
  `;
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
