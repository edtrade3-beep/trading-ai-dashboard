"use strict";
/**
 * telegramService.js  (COT module)
 * Formats and sends the seven scheduled COT+intraday Telegram reports.
 *
 * Report format matches the spec:
 *   📊 MARKET SCAN + COT BIAS
 *   Session / Time / Market Bias / COT Bias / Risk Mode
 *   🏦 COT POSITIONING  (equity, dollar, bonds, gold, oil, btc)
 *   📈 INDEX CHECK  (SPY, QQQ, VIX)
 *   🔥 TOP SETUPS  (up to 3)
 *   ⚠️ CAUTION LIST
 *   🎯 ACTION PLAN
 */

const { sendTelegramMessage } = require("../telegram");
const { shouldSendAlert } = require("../telegram-bot");
const { scanCOTSymbols } = require("./intradayScanner");
const { loadWatchlistSymbols } = require("./watchlistHelper");

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(v) { return Math.round(v * 100) / 100; }

function etTime() {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function biasEmoji(label = "") {
  const l = label.toLowerCase();
  if (l.includes("strong bullish"))  return "🟢🟢";
  if (l.includes("bullish"))         return "🟢";
  if (l.includes("strong bearish"))  return "🔴🔴";
  if (l.includes("bearish"))         return "🔴";
  if (l.includes("crowded"))         return "🟡";
  return "⚪";
}

function riskMode(equityBiasLabel, vixAnalysis) {
  const label = (equityBiasLabel || "").toLowerCase();
  const vixUp = vixAnalysis && (vixAnalysis.chgPct > 5 || vixAnalysis.composite > 65);
  if (vixUp)               return "🔴 RISK-OFF  (VIX spike)";
  if (label.includes("strong bullish")) return "🟢 RISK-ON";
  if (label.includes("bullish"))        return "🟢 RISK-ON";
  if (label.includes("strong bearish")) return "🔴 RISK-OFF";
  if (label.includes("bearish"))        return "🟡 CAUTION";
  return "⚪ NEUTRAL";
}

function trendLabel(a) {
  if (!a) return "N/A";
  const arrow = a.emaAligned === "↑" ? "↑" : "↓";
  return `${arrow} $${a.price}  ${a.chgPct >= 0 ? "+" : ""}${a.chgPct}%  S${Math.round(a.composite)}`;
}

function vwapStatus(a) {
  // Approx: if price > EMA21 and trend is upward, price is likely above VWAP
  if (!a) return "N/A";
  return a.price > a.ema21 ? "ABOVE" : "BELOW";
}

function alignmentTag(cotAlignment) {
  if (cotAlignment === "aligned")  return "✅ COT Aligned";
  if (cotAlignment === "opposed")  return "⚠️ COT Opposed";
  return "➖ COT Neutral";
}

// ── Report builder ────────────────────────────────────────────────────────────

function buildReport(session, scanResult) {
  const { enriched, topSetups, cautionList, cotSummary } = scanResult;
  const time = etTime();

  const spy  = enriched.find(a => a.symbol === "SPY");
  const qqq  = enriched.find(a => a.symbol === "QQQ");
  const vix  = enriched.find(a => a.symbol === "^VIX");

  const intradayBias = spy
    ? (spy.composite >= 60 ? "Bullish" : spy.composite <= 40 ? "Bearish" : "Neutral")
    : "Neutral";

  const equityBias = cotSummary.equityBias || "N/A";
  const staleNote  = cotSummary.staleWarning
    ? `\n⚠️ ${cotSummary.staleWarning}`
    : "";

  const lines = [
    `📊 MARKET SCAN + COT BIAS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Session:      ${session}`,
    `Time:         ${time}`,
    `Market Bias:  ${intradayBias}`,
    `COT Bias:     ${equityBias}`,
    `Risk Mode:    ${riskMode(equityBias, vix)}`,
    cotSummary.reportDate ? `COT Date:     ${cotSummary.reportDate}${staleNote}` : staleNote || "",

    ``,
    `🏦 COT POSITIONING`,
    `Equity Indexes: ${biasEmoji(cotSummary.equityBias)} ${cotSummary.equityBias}`,
    `Bonds (10Y/2Y): ${biasEmoji(cotSummary.bondBias)}  ${cotSummary.bondBias}`,
    `Dollar:         ${biasEmoji(cotSummary.dollarBias)} ${cotSummary.dollarBias}`,
    `Gold:           ${biasEmoji(cotSummary.goldBias)}  ${cotSummary.goldBias}`,
    `Oil:            ${biasEmoji(cotSummary.oilBias)}   ${cotSummary.oilBias}`,
    cotSummary.bitcoinBias !== "N/A" ? `Bitcoin:        ${biasEmoji(cotSummary.bitcoinBias)} ${cotSummary.bitcoinBias}` : "",

    ``,
    `📈 INDEX CHECK`,
    `SPY: ${trendLabel(spy)} | VWAP ${vwapStatus(spy)} | Score ${spy?.composite ?? "N/A"}`,
    `QQQ: ${trendLabel(qqq)} | VWAP ${vwapStatus(qqq)} | Score ${qqq?.composite ?? "N/A"}`,
    `VIX: ${vix ? `$${vix.price}  ${vix.chgPct >= 0 ? "+" : ""}${vix.chgPct}%  Score ${vix.composite}` : "N/A"}`,
  ];

  // TOP SETUPS
  lines.push(``, `🔥 TOP A+ SETUPS`);
  if (topSetups.length === 0) {
    lines.push(`No A+ setups this scan  (score ≥70, RVOL ≥1.5, 9>21 EMA)`);
  } else {
    topSetups.slice(0, 3).forEach((a, i) => {
      const risk  = Math.max(a.price - a.support, 0.01);
      const t1    = round2(a.price + risk);
      const t2    = round2(a.price + risk * 2);
      const stop  = round2(a.support);
      lines.push(
        `${i + 1}. ${a.symbol}`,
        `   Score: ${a.composite}  RVOL ${a.rvol}x  RSI ${a.rsi}`,
        `   COT: ${alignmentTag(a.cotAlignment)}`,
        `   Entry $${a.price}   Stop $${stop}   T1 $${t1}   T2 $${t2}`,
        `   ${a.trend}${a.cotBias ? `  |  COT ${a.cotBias.label}` : ""}`,
      );
    });
  }

  // CAUTION
  lines.push(``, `⚠️ CAUTION`);
  if (cautionList.length === 0) {
    lines.push(`No extreme positioning flags`);
  } else {
    cautionList.forEach(a => {
      const note = a.cotBias?.crowdedLong  ? "Crowded Long — reversal risk" :
                   a.cotBias?.crowdedShort ? "Crowded Short — squeeze risk" :
                   a.cotAlignment === "opposed" ? `COT opposed to intraday ${a.intradayDir}` : "";
      if (note) lines.push(`• ${a.symbol}  ${note}`);
    });
  }

  // ACTION PLAN
  lines.push(
    ``, `🎯 ACTION PLAN`,
    `If intraday trend ALIGNS with COT bias → trade with full conviction`,
    `If intraday trend FIGHTS COT bias → reduce size or wait for confirmation`,
    `COT is positioning bias, not an entry signal`,
  );

  return lines.filter(l => l !== undefined).join("\n");
}

// ── Scheduled send ────────────────────────────────────────────────────────────

async function sendCOTReport(session, extraWatchlistSymbols = []) {
  try {
    if (!shouldSendAlert({ category: "recap" })) return { ok: false, error: "skipped — daily informational budget reached" };
    const scanResult = await scanCOTSymbols(extraWatchlistSymbols);
    const msg = buildReport(session, scanResult);
    await sendTelegramMessage(msg);
    console.log(`[COT] ${session} report sent`);
    return { ok: true, session };
  } catch (err) {
    console.error(`[COT] Failed to send ${session} report:`, err.message);
    return { ok: false, error: err.message };
  }
}

// ── Weekly COT data notification ──────────────────────────────────────────────

async function sendCOTUpdateNotification(marketsUpdated, reportDate) {
  if (!shouldSendAlert({ category: "recap" })) return;
  const msg = [
    `📋 COT DATA UPDATED`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `New CFTC COT report loaded`,
    `Report date:   ${reportDate || "Unknown"}`,
    `Markets:       ${marketsUpdated} instruments updated`,
    `Source:        CFTC (cftc.gov)`,
    ``,
    `Use /cot or check the COT dashboard tab for full positioning details.`,
  ].join("\n");
  await sendTelegramMessage(msg);
}

module.exports = { sendCOTReport, sendCOTUpdateNotification, buildReport };
