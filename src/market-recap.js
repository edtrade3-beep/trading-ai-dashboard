// 3:45 PM Daily Market Recap — Auto-generates video script + sends to Telegram
// Pipeline: Fetch market data → Claude generates script → Telegram
// Runs at 3:45 PM ET weekdays via server.js scheduler

const { sendTelegramMessage, isConfigured } = require("./telegram");
const { callAnthropicApi, MODELS }          = require("./anthropic");
const { ANTHROPIC_API_KEY }                 = require("./config");
const { fetchJsonSafe, withTimeout }        = require("./utils");

// ── Fetch all market data in parallel ────────────────────────────────────────

async function fetchMarketData() {
  const https = require("https");

  function yahooMeta(sym) {
    return new Promise(resolve => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
      const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => {
          try {
            const m = JSON.parse(d)?.chart?.result?.[0]?.meta || {};
            const closes = JSON.parse(d)?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
            const prev   = closes[0] || m.previousClose || 0;
            const price  = m.regularMarketPrice || 0;
            const chg    = prev > 0 ? (price - prev) / prev * 100 : 0;
            resolve({ price: Math.round(price * 100) / 100, chg: Math.round(chg * 100) / 100 });
          } catch { resolve({ price: 0, chg: 0 }); }
        });
      });
      req.on("error", () => resolve({ price: 0, chg: 0 }));
      req.setTimeout(6000, () => { req.destroy(); resolve({ price: 0, chg: 0 }); });
    });
  }

  const [spy, qqq, iwm, vix, tlt, dxy, oil, gold, btc] = await Promise.all([
    yahooMeta("SPY"), yahooMeta("QQQ"), yahooMeta("IWM"),
    yahooMeta("^VIX"), yahooMeta("^TNX"),
    yahooMeta("DX-Y.NYB"), yahooMeta("CL=F"),
    yahooMeta("GC=F"), yahooMeta("BTC-USD"),
  ]);

  // Sector ETFs for rotation
  const sectorSyms = ["XLK","XLF","XLV","XLE","XLI","XLP","XLY","XLU","XLRE","XLC","XLB"];
  const sectorData = await Promise.all(sectorSyms.map(s => yahooMeta(s).then(d => ({ sym: s, ...d }))));
  sectorData.sort((a, b) => b.chg - a.chg);
  const topSector = sectorData[0];
  const weakSector = sectorData[sectorData.length - 1];

  const SECTOR_NAMES = {
    XLK:"Technology", XLF:"Financials", XLV:"Healthcare",
    XLE:"Energy", XLI:"Industrials", XLP:"Consumer Staples",
    XLY:"Consumer Discretionary", XLU:"Utilities", XLRE:"Real Estate",
    XLC:"Communication", XLB:"Materials"
  };

  return {
    spy, qqq, iwm, vix, tny: tlt, dxy, oil, gold, btc,
    topSector:  { name: SECTOR_NAMES[topSector.sym]  || topSector.sym,  chg: topSector.chg },
    weakSector: { name: SECTOR_NAMES[weakSector.sym] || weakSector.sym, chg: weakSector.chg },
    fetchedAt: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }),
    date: new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", year: "numeric" }),
  };
}

// ── Generate script with Claude ───────────────────────────────────────────────

async function generateRecapScript(data) {
  const { spy, qqq, iwm, vix, tny, dxy, oil, gold, btc, topSector, weakSector, date } = data;

  const fmt = (n) => n > 0 ? `+${n.toFixed(2)}%` : `${n.toFixed(2)}%`;
  const fmtP = (p) => p >= 1000 ? `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${p.toFixed(2)}`;

  const marketContext = `
Market Data at 3:45 PM ET — ${date}:
- SPY: ${fmtP(spy.price)} (${fmt(spy.chg)})
- QQQ: ${fmtP(qqq.price)} (${fmt(qqq.chg)})
- IWM: ${fmtP(iwm.price)} (${fmt(iwm.chg)})
- VIX: ${vix.price.toFixed(1)} — ${vix.price > 25 ? "elevated fear" : vix.price > 18 ? "cautious" : "calm"}
- 10Y Yield: ${tny.price.toFixed(2)}%
- DXY (Dollar): ${dxy.price.toFixed(2)} (${fmt(dxy.chg)})
- Oil (WTI): ${fmtP(oil.price)} (${fmt(oil.chg)})
- Gold: ${fmtP(gold.price)} (${fmt(gold.chg)})
- BTC: ${fmtP(btc.price)} (${fmt(btc.chg)})
- Strongest sector: ${topSector.name} (${fmt(topSector.chg)})
- Weakest sector: ${weakSector.name} (${fmt(weakSector.chg)})
`;

  const prompt = `You are a professional Bloomberg-style market narrator. Create a 75-second YouTube market recap voiceover script for 3:45 PM ET.

${marketContext}

RULES:
- Calm, professional tone — no hype
- Factual only — use the exact numbers provided
- No financial advice
- 6 scenes, each 2-3 sentences
- End EXACTLY with: "Do not chase. Wait for confirmation. Manage risk."
- Total word count: 140-170 words

FORMAT your response exactly like this:
SCENE 1 [OPEN]: [text]
SCENE 2 [INDEXES]: [text]
SCENE 3 [MACRO]: [text]
SCENE 4 [SECTORS]: [text]
SCENE 5 [SETUPS]: [text]
SCENE 6 [CLOSE]: [text]

TITLE: [YouTube title]
DESCRIPTION: [2-3 sentence YouTube description]`;

  try {
    if (!ANTHROPIC_API_KEY) {
      // Fallback: template-based script without AI
      return buildTemplateScript(data);
    }
    const text = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, { model: MODELS.haiku, maxTokens: 600 });
    return text;
  } catch {
    return buildTemplateScript(data);
  }
}

function buildTemplateScript(data) {
  const { spy, qqq, iwm, vix, tny, oil, gold, btc, topSector, weakSector, date } = data;
  const dir = (chg) => chg >= 0 ? "up" : "down";
  const abs = (chg) => Math.abs(chg).toFixed(2);

  return `SCENE 1 [OPEN]: It's 3:45 PM Eastern. Fifteen minutes to the close. Here's what matters right now.

SCENE 2 [INDEXES]: The S&P 500 is at $${spy.price}, ${dir(spy.chg)} ${abs(spy.chg)} percent. The Nasdaq is ${dir(qqq.chg)} ${abs(qqq.chg)}, trading at ${qqq.price}. Small caps are ${dir(iwm.chg)}, IWM at ${iwm.price}.

SCENE 3 [MACRO]: The VIX is at ${vix.price.toFixed(1)} — ${vix.price > 25 ? "fear is elevated" : vix.price > 18 ? "caution in the air" : "relatively calm"}. The 10-year yield holds at ${tny.price.toFixed(2)} percent. Oil is ${dir(oil.chg)} ${abs(oil.chg)}, gold at ${gold.price.toFixed(0)}.

SCENE 4 [SECTORS]: ${topSector.name} is today's leader, ${dir(topSector.chg > 0 ? 1 : -1)} ${Math.abs(topSector.chg).toFixed(2)} percent. ${weakSector.name} is the weakest sector today. Rotation is ${spy.chg > 0 ? "risk-on" : "defensive"}.

SCENE 5 [SETUPS]: Review your watchlist for confirmed setups only. Avoid chasing extended names. Volume and structure must confirm before entry.

SCENE 6 [CLOSE]: Power hour is here. Expect volatility. Institutions are positioning for tomorrow. Do not chase. Wait for confirmation. Manage risk.

TITLE: 3:45 PM Market Recap — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} | SPY ${spy.chg >= 0 ? "+" : ""}${spy.chg.toFixed(2)}%
DESCRIPTION: Daily 3:45 PM market recap. SPY ${spy.price}, QQQ ${qqq.price}, VIX ${vix.price.toFixed(1)}. Sector rotation, key levels, and watchlist notes heading into the close. Not financial advice.`;
}

// ── Format and send to Telegram ───────────────────────────────────────────────

function formatTelegramMessage(script, data) {
  const { spy, qqq, iwm, vix, topSector, weakSector, date } = data;
  const arrow = (chg) => chg >= 0 ? "▲" : "▼";
  const fmt = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  const lines = [
    `🎬 MARKET RECAP — 3:45 PM ET`,
    `📅 ${date}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `📊 SNAPSHOT`,
    `SPY ${spy.price} ${arrow(spy.chg)} ${fmt(spy.chg)}`,
    `QQQ ${qqq.price} ${arrow(qqq.chg)} ${fmt(qqq.chg)}`,
    `IWM ${iwm.price} ${arrow(iwm.chg)} ${fmt(iwm.chg)}`,
    `VIX ${vix.price.toFixed(1)} ${vix.price > 25 ? "⚠️ FEAR" : vix.price > 18 ? "🟡 CAUTION" : "🟢 CALM"}`,
    ``,
    `🔄 ROTATION`,
    `✅ Leading: ${topSector.name} ${fmt(topSector.chg)}`,
    `❌ Lagging: ${weakSector.name} ${fmt(weakSector.chg)}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📝 SCRIPT PREVIEW`,
    ``,
    script.split("\n").slice(0, 12).join("\n"),
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `⚠️ Do not chase. Wait for confirmation. Manage risk.`,
    `📱 Full video script generated — ready for production`,
  ];

  return lines.join("\n");
}

// ── ElevenLabs Voiceover ──────────────────────────────────────────────────────
// Requires: ELEVENLABS_API_KEY env var
// Voice: Antoni (professional male) — change VOICE_ID for different voice
// Available voices: Antoni=ErXwobaYiN019PkySvjV  Adam=pNInz6obpgDQGcFmaJgB
//                   Josh=TxGEqnHWrfWFTfGW9XjX   Sam=yoZ06aMxZJJ28mfd3POQ

const VOICE_ID = "ErXwobaYiN019PkySvjV"; // Antoni — calm professional male

function extractVoiceoverText(script) {
  // Remove scene labels and extract clean text only
  return script
    .split("\n")
    .filter(l => l.trim() && !l.startsWith("TITLE:") && !l.startsWith("DESCRIPTION:"))
    .map(l => l.replace(/^SCENE \d+ \[[A-Z ]+\]:\s*/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function generateVoiceover(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.log("[Voiceover] ELEVENLABS_API_KEY not set — skipping audio generation");
    return null;
  }

  const https = require("https");
  const body  = JSON.stringify({
    text,
    model_id: "eleven_monolingual_v1",
    voice_settings: { stability: 0.65, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true },
  });

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.elevenlabs.io",
      path: `/v1/text-to-speech/${VOICE_ID}`,
      method: "POST",
      headers: {
        "Accept":       "audio/mpeg",
        "xi-api-key":   apiKey,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(opts, res => {
      if (res.statusCode !== 200) {
        let errBody = "";
        res.on("data", c => errBody += c);
        res.on("end", () => reject(new Error(`ElevenLabs ${res.statusCode}: ${errBody.slice(0, 200)}`)));
        return;
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("ElevenLabs timeout")); });
    req.write(body);
    req.end();
  });
}

async function sendVoiceToTelegram(audioBuffer, caption) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const https = require("https");
  const boundary = "----RecapBoundary" + Date.now();

  // Build multipart/form-data
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="voice"; filename="market-recap.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`));
  parts.push(audioBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  return new Promise(resolve => {
    const opts = {
      hostname: "api.telegram.org",
      path: `/bot${token}/sendVoice`,
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
    };
    const req = https.request(opts, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        try { const j = JSON.parse(d); resolve(j.ok); } catch { resolve(false); }
      });
    });
    req.on("error", () => resolve(false));
    req.setTimeout(20000, () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

// ── Main function — called at 3:45 PM ET ─────────────────────────────────────

async function runMarketRecap() {
  if (!isConfigured()) {
    console.log("[Recap] Telegram not configured — skipping");
    return;
  }

  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) { console.log("[Recap] Weekend — skipping"); return; }

  console.log("[Recap] 3:45 PM — fetching market data…");
  try {
    // Step 1: Fetch market data
    const data = await fetchMarketData();
    console.log(`[Recap] Data: SPY ${data.spy.price} (${data.spy.chg}%)`);

    // Step 2: Generate script with Claude
    const script = await generateRecapScript(data);
    console.log("[Recap] Script generated ✓");

    // Step 3: Send text recap to Telegram
    const msg = formatTelegramMessage(script, data);
    await sendTelegramMessage(msg);
    console.log("[Recap] Text sent to Telegram ✓");

    // Step 4: Generate voiceover with ElevenLabs (if API key set)
    const voiceText = extractVoiceoverText(script);
    console.log(`[Recap] Voiceover text: ${voiceText.slice(0, 80)}…`);

    let audioBuffer = null;
    try {
      audioBuffer = await generateVoiceover(voiceText);
      if (audioBuffer) console.log(`[Recap] Audio generated: ${(audioBuffer.length / 1024).toFixed(0)} KB ✓`);
    } catch (e) {
      console.warn("[Recap] Voiceover failed:", e.message);
    }

    // Step 5: Send audio to Telegram as voice message
    if (audioBuffer) {
      const audioCaption = `🎙 3:45 PM Market Recap — ${data.date}\nSPY ${data.spy.price} · QQQ ${data.qqq.price} · VIX ${data.vix.price.toFixed(1)}`;
      const sent = await sendVoiceToTelegram(audioBuffer, audioCaption);
      console.log(sent ? "[Recap] Audio sent to Telegram ✓" : "[Recap] Audio send failed");

      // Save audio file
      const fs = require("fs");
      const path = require("path");
      const dir = path.join(__dirname, "../data");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "latest-recap.mp3"), audioBuffer);
      console.log("[Recap] Audio saved to data/latest-recap.mp3");
    }

    // Step 6: Generate video with Shotstack (if API key set)
    let videoUrl = null;
    if (process.env.SHOTSTACK_API_KEY) {
      try {
        videoUrl = await generateAndSendVideo(script, data);
        console.log("[Recap] Video pipeline complete ✓");
      } catch (e) {
        console.warn("[Recap] Video generation failed:", e.message);
      }
    }

    // Step 7: Save full JSON
    const fs   = require("fs");
    const path = require("path");
    const dir  = path.join(__dirname, "../data");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "latest-recap.json"), JSON.stringify({
      script, data, voiceGenerated: !!audioBuffer, videoUrl, generatedAt: new Date().toISOString()
    }, null, 2));
    console.log("[Recap] Complete pipeline done ✓");

  } catch (e) {
    console.error("[Recap] Error:", e.message);
  }
}

// ── API endpoint — get latest recap ──────────────────────────────────────────

async function handleRecapApi(req, res, requestUrl) {
  const { writeJson } = require("./utils");

  if (requestUrl.pathname === "/api/recap/latest") {
    try {
      const fs   = require("fs");
      const path = require("path");
      const file = path.join(__dirname, "../data/latest-recap.json");
      if (!fs.existsSync(file)) return writeJson(res, 200, { ok: false, error: "No recap yet" });
      return writeJson(res, 200, { ok: true, ...JSON.parse(fs.readFileSync(file, "utf8")) });
    } catch (e) { return writeJson(res, 500, { ok: false, error: e.message }); }
  }

  if (requestUrl.pathname === "/api/recap/video") {
    try {
      const fs   = require("fs");
      const path = require("path");
      const file = path.join(__dirname, "../data/latest-recap.mp4");
      if (!fs.existsSync(file)) return writeJson(res, 404, { ok: false, error: "No video yet — trigger /api/recap/generate first" });
      const buf = fs.readFileSync(file);
      res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": buf.length, "Content-Disposition": "attachment; filename=market-recap.mp4" });
      return res.end(buf);
    } catch (e) { return writeJson(res, 500, { ok: false, error: e.message }); }
  }

  if (requestUrl.pathname === "/api/recap/audio") {
    try {
      const fs   = require("fs");
      const path = require("path");
      const file = path.join(__dirname, "../data/latest-recap.mp3");
      if (!fs.existsSync(file)) return writeJson(res, 404, { ok: false, error: "No audio yet" });
      const buf = fs.readFileSync(file);
      res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": buf.length, "Content-Disposition": "attachment; filename=market-recap.mp3" });
      return res.end(buf);
    } catch (e) { return writeJson(res, 500, { ok: false, error: e.message }); }
  }

  if (requestUrl.pathname === "/api/recap/generate" && req.method === "POST") {
    runMarketRecap().catch(() => {});
    return writeJson(res, 200, { ok: true, message: "Recap generation started" });
  }

  return null;
}

// ── Shotstack Video Renderer ──────────────────────────────────────────────────
// Free tier: 200 renders/month at https://shotstack.io
// Requires: SHOTSTACK_API_KEY env var
// No npm packages needed — pure HTTPS API calls

function shotstackPost(path2, body) {
  const key = process.env.SHOTSTACK_API_KEY;
  if (!key) return Promise.reject(new Error("SHOTSTACK_API_KEY not set"));
  const https = require("https");
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.shotstack.io",
      path: `/stage${path2}`,   // /stage = sandbox (free), /v1 = production
      method: "POST",
      headers: {
        "x-api-key":    key,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(opts, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Shotstack timeout")); });
    req.write(payload);
    req.end();
  });
}

function shotstackGet(path2) {
  const key = process.env.SHOTSTACK_API_KEY;
  if (!key) return Promise.reject(new Error("SHOTSTACK_API_KEY not set"));
  const https = require("https");
  return new Promise((resolve, reject) => {
    const opts = { hostname: "api.shotstack.io", path: `/stage${path2}`, method: "GET", headers: { "x-api-key": key } };
    const req = https.request(opts, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

function buildShotstackSpec(script, data, audioUrl) {
  // Parse scenes from script
  const sceneLines = script.split("\n").filter(l => l.match(/^SCENE \d+/));
  const scenes = sceneLines.map(l => l.replace(/^SCENE \d+ \[[A-Z ]+\]:\s*/, "").trim());

  // Scene timings (seconds)
  const timings = [
    { start: 0,  len: 8  },   // Open
    { start: 8,  len: 12 },   // Indexes
    { start: 20, len: 12 },   // Macro
    { start: 32, len: 12 },   // Sectors
    { start: 44, len: 14 },   // Setups
    { start: 58, len: 17 },   // Close
  ];
  const totalLen = 75;

  // Caption clips
  const captionClips = scenes.map((text, i) => {
    const t = timings[i] || { start: 0, len: 10 };
    return {
      asset: {
        type: "html",
        html: `<p style="font-family:Arial,sans-serif;font-size:28px;color:#ffffff;text-align:center;max-width:900px;margin:0 auto;line-height:1.4;text-shadow:0 2px 8px rgba(0,0,0,0.8)">${text}</p>`,
        width: 960,
        height: 200,
      },
      start: t.start + 0.5,
      length: t.len - 0.5,
      position: "bottom",
      offset: { y: 0.15 },
      transition: { in: "fadeIn", out: "fadeOut" },
    };
  });

  // Title/watermark clip
  const titleClip = {
    asset: {
      type: "html",
      html: `<p style="font-family:Arial,sans-serif;font-size:18px;color:#f59e0b;letter-spacing:2px">AXIOM LIVE • 3:45 PM ET • ${data.date?.split(",")[0] || ""}</p>`,
      width: 800,
      height: 50,
    },
    start: 0,
    length: totalLen,
    position: "top",
    offset: { y: -0.42 },
  };

  // Stats bar clip (shows at start)
  const statsClip = {
    asset: {
      type: "html",
      html: `<div style="font-family:monospace;font-size:20px;color:#ffffff;display:flex;gap:24px;justify-content:center">
        <span style="color:${data.spy.chg >= 0 ? "#4ade80" : "#f87171"}">SPY ${data.spy.price} (${data.spy.chg >= 0 ? "+" : ""}${data.spy.chg}%)</span>
        <span style="color:${data.qqq.chg >= 0 ? "#4ade80" : "#f87171"}">QQQ ${data.qqq.price} (${data.qqq.chg >= 0 ? "+" : ""}${data.qqq.chg}%)</span>
        <span style="color:${data.vix.price > 20 ? "#f87171" : "#4ade80"}">VIX ${data.vix.price.toFixed(1)}</span>
      </div>`,
      width: 1000,
      height: 60,
    },
    start: 8,
    length: 12,
    position: "top",
    offset: { y: -0.30 },
    transition: { in: "fadeIn", out: "fadeOut" },
  };

  return {
    timeline: {
      soundtrack: audioUrl ? { src: audioUrl, effect: "fadeOut" } : undefined,
      background: "#0a0f1e",  // Dark navy Bloomberg-style
      tracks: [
        // Background gradient overlay track
        {
          clips: [{
            asset: {
              type: "html",
              html: `<div style="width:1920px;height:1080px;background:linear-gradient(135deg,#0a0f1e 0%,#0d1629 50%,#0a0f1e 100%)"></div>`,
              width: 1920,
              height: 1080,
            },
            start: 0,
            length: totalLen,
          }],
        },
        // Caption track
        { clips: captionClips },
        // Stats bar track
        { clips: [statsClip] },
        // Title track
        { clips: [titleClip] },
        // Closing message track
        {
          clips: [{
            asset: {
              type: "html",
              html: `<p style="font-family:Arial,sans-serif;font-size:22px;color:#f59e0b;text-align:center;letter-spacing:1px">Do not chase. Wait for confirmation. Manage risk.</p>`,
              width: 800,
              height: 60,
            },
            start: 58,
            length: 16,
            position: "bottom",
            offset: { y: 0.05 },
            transition: { in: "fadeIn", out: "fadeOut" },
          }],
        },
      ],
    },
    output: {
      format: "mp4",
      resolution: "hd",          // 1280x720
      aspectRatio: "16:9",
      fps: 25,
    },
  };
}

async function pollShotstackRender(renderId, maxWaitMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 5000)); // poll every 5s
    try {
      const res = await shotstackGet(`/render/${renderId}`);
      const status = res?.response?.status;
      const url    = res?.response?.url;
      console.log(`[Video] Shotstack status: ${status}`);
      if (status === "done" && url) return url;
      if (status === "failed") throw new Error("Shotstack render failed");
    } catch (e) { console.warn("[Video] Poll error:", e.message); }
  }
  throw new Error("Shotstack render timeout");
}

async function downloadMp4(url) {
  const https = require("https");
  return new Promise((resolve, reject) => {
    const chunks = [];
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject).setTimeout(60000, function() { this.destroy(); reject(new Error("Download timeout")); });
  });
}

async function sendVideoToTelegram(videoBuffer, caption) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  const https = require("https");
  const boundary = "----RecapVideoBoundary" + Date.now();
  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="market-recap.mp4"\r\nContent-Type: video/mp4\r\n\r\n`),
    videoBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  const body = Buffer.concat(parts);
  return new Promise(resolve => {
    const opts = {
      hostname: "api.telegram.org",
      path: `/bot${token}/sendVideo`,
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
    };
    const req = https.request(opts, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d).ok); } catch { resolve(false); } });
    });
    req.on("error", () => resolve(false));
    req.setTimeout(60000, () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

async function generateAndSendVideo(script, data) {
  if (!process.env.SHOTSTACK_API_KEY) {
    console.log("[Video] SHOTSTACK_API_KEY not set — skipping video render");
    return null;
  }

  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  const audioUrl  = renderUrl ? `${renderUrl}/api/recap/audio` : null;

  console.log("[Video] Building Shotstack spec…");
  const spec = buildShotstackSpec(script, data, audioUrl);

  console.log("[Video] Submitting render job…");
  const submitRes = await shotstackPost("/render", spec);
  const renderId  = submitRes?.response?.id;
  if (!renderId) throw new Error(`Shotstack submit failed: ${JSON.stringify(submitRes).slice(0, 200)}`);
  console.log(`[Video] Render job submitted: ${renderId}`);

  console.log("[Video] Waiting for render (up to 2 min)…");
  const mp4Url = await pollShotstackRender(renderId);
  console.log(`[Video] Render done: ${mp4Url}`);

  console.log("[Video] Downloading MP4…");
  const videoBuffer = await downloadMp4(mp4Url);
  console.log(`[Video] Downloaded: ${(videoBuffer.length / (1024 * 1024)).toFixed(1)} MB`);

  // Save locally
  const fs   = require("fs");
  const path = require("path");
  const dir  = path.join(__dirname, "../data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "latest-recap.mp4"), videoBuffer);
  console.log("[Video] Saved to data/latest-recap.mp4");

  // Send to Telegram
  const caption = `🎬 3:45 PM Market Recap — ${data.date}\nSPY ${data.spy.price} · QQQ ${data.qqq.price} · VIX ${data.vix.price.toFixed(1)}\n\n⚠️ Not financial advice.`;
  const sent = await sendVideoToTelegram(videoBuffer, caption);
  console.log(sent ? "[Video] Sent to Telegram ✓" : "[Video] Telegram send failed");

  return mp4Url;
}

module.exports = { runMarketRecap, handleRecapApi, generateAndSendVideo };
