import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { THEME_LIGHT, THEME_DARK, C, SANS, MONO, NUM, LAYOUT } from "./components/theme.js";
import ColoredIntradayChart from "./components/ColoredIntradayChart.jsx";
import TrendChart from "./components/TrendChart.jsx";
import TrendSetupPanel from "./components/TrendSetupPanel.jsx";
import SmartScanPanel from "./components/SmartScanPanel.jsx";
import DayTradeTab from "./components/DayTradeTab.jsx";
import MarketTerminalTab from "./components/MarketTerminalTab.jsx";
import { computeRegime, STOCK_TO_SECTOR, SECTOR_ETFS } from "./components/market-helpers.js";
import { FIVEX_DATA, FIVEX_REF } from "./components/fivex-data.js";
import { qUrl, QURAN_RECITERS, SURAH_LIST } from "./components/quran-data.js";
import QuranTab from "./components/QuranTab.jsx";
import MoversTab from "./components/MoversTab.jsx";
import TradingCopilot from "./components/TradingCopilot.jsx";
import PredictionsTab from "./components/PredictionsTab.jsx";
import ProPathTab from "./components/ProPathTab.jsx";
import CoursesTab from "./components/CoursesTab.jsx";
import StartHereTab from "./components/StartHereTab.jsx";
import OptionsEduTab from "./components/OptionsEduTab.jsx";
import {
  classifyTrend, computeScores, computeGreenLight, logTradeNote, addPaperTrade, addPaperShort,
  optionValue, addPaperOption, alpacaPlace, alpacaShort, alpacaClose, alpacaOption,
  GL_TRADES_KEY, OPT_LEVERAGE, SLIP, OPT_SLIP, computeMTFSignal, r2,
} from "./components/trading-utils.js";
import RhProJournal, { rhLoadJournal, rhSaveJournal, rhPnl } from "./components/rhpro-journal.jsx";
import GreenLightTab from "./components/GreenLightTab.jsx";
import { Badge, ScoreBar, TrendTag, formatNum } from "./components/ui-atoms.jsx";
import CoachTab from "./components/CoachTab.jsx";
import CryptoTab from "./components/CryptoTab.jsx";
import MyTradesTab from "./components/MyTradesTab.jsx";
import SoccerWatchTab from "./components/SoccerWatchTab.jsx";
import DipBuyTab from "./components/DipBuyTab.jsx";
import EducationTab from "./components/EducationTab.jsx";
import TelegramAlertsTab from "./components/TelegramAlertsTab.jsx";
import TradeAdvisorTab from "./components/TradeAdvisorTab.jsx";
import CompressionTab from "./components/CompressionTab.jsx";
import AutoPilotEngine from "./components/AutoPilotEngine.jsx";
import TerminalWorkspace from "./components/TerminalWorkspace.jsx";
import SmartMoneyBrief from "./components/SmartMoneyBrief.jsx";
import TrendTemplateTab from "./components/TrendTemplateTab.jsx";
import EarlyEntryScanner from "./components/EarlyEntryScanner.jsx";
import ChallengeTab from "./components/ChallengeTab.jsx";
import Adol22Tab from "./components/Adol22Tab.jsx";
import GapScanner from "./components/GapScanner.jsx";
import RecapTab from "./components/RecapTab.jsx";
import TradePlannerTab from "./components/TradePlannerTab.jsx";
import NotesTab from "./components/NotesTab.jsx";
import AutoExecPanel from "./components/AutoExecPanel.jsx";
import CombinedTab from "./components/CombinedTab.jsx";
import OptionsChainTab from "./components/OptionsChainTab.jsx";
import Under10Tab from "./components/Under10Tab.jsx";
import RhProDashboard from "./components/RhProDashboard.jsx";
import RhProScanner from "./components/RhProScanner.jsx";
import RhProWatchlists from "./components/RhProWatchlists.jsx";
import RhProHeatMap from "./components/RhProHeatMap.jsx";
import RhProCoach from "./components/RhProCoach.jsx";
import RhProApex from "./components/RhProApex.jsx";
import GapFillTab from "./components/GapFillTab.jsx";
import InsiderTab from "./components/InsiderTab.jsx";
import MorningRoutineTab from "./components/MorningRoutineTab.jsx";
import OptionsPayoffTool from "./components/OptionsPayoffTool.jsx";
import HoldingsTab from "./components/HoldingsTab.jsx";
import SqueezeTab from "./components/SqueezeTab.jsx";
import MonitorSection from "./components/MonitorSection.jsx";
import MonitorAthan from "./components/MonitorAthan.jsx";
import SpyVolumeWidget from "./components/SpyVolumeWidget.jsx";
import MacroEventsWidget from "./components/MacroEventsWidget.jsx";
import RiskTrafficLight from "./components/RiskTrafficLight.jsx";
import FedWatchWidget from "./components/FedWatchWidget.jsx";
import FedInterpreter from "./components/FedInterpreter.jsx";
import RegimeNewsPanel from "./components/RegimeNewsPanel.jsx";
import DashboardTab from "./components/DashboardTab.jsx";
import SmartScanTab from "./components/SmartScanTab.jsx";
import JournalTab from "./components/JournalTab.jsx";
import QuotesTab from "./components/QuotesTab.jsx";
import PortfolioTab from "./components/PortfolioTab.jsx";
import FivexTab from "./components/FivexTab.jsx";
import JournalStatsTab from "./components/JournalStatsTab.jsx";
import DealsTab from "./components/DealsTab.jsx";
import WorkflowTab from "./components/WorkflowTab.jsx";
import AlertsTab from "./components/AlertsTab.jsx";
import AcademyTab from "./components/AcademyTab.jsx";
import ToolsTab from "./components/ToolsTab.jsx";
import ScannerTab from "./components/ScannerTab.jsx";
import MacroTab from "./components/MacroTab.jsx";
import AiLabTab from "./components/AiLabTab.jsx";
import AthanTab from "./components/AthanTab.jsx";
import ScreenerTab from "./components/ScreenerTab.jsx";
import FlowTab from "./components/FlowTab.jsx";
import OpenStockTab from "./components/OpenStockTab.jsx";
import AnalystTab from "./components/AnalystTab.jsx";
import NewsTab from "./components/NewsTab.jsx";
import HalalTab from "./components/HalalTab.jsx";
import RiskLabTab from "./components/RiskLabTab.jsx";
import RotationTab from "./components/RotationTab.jsx";
import MultiTfTab from "./components/MultiTfTab.jsx";
import TasbihTab from "./components/TasbihTab.jsx";
import SeasonalityTab from "./components/SeasonalityTab.jsx";
import OptionsCalcTab from "./components/OptionsCalcTab.jsx";
import SmartMoneyTab from "./components/SmartMoneyTab.jsx";
import FibonacciTab from "./components/FibonacciTab.jsx";
import SectorsTab from "./components/SectorsTab.jsx";
import EarningsTab from "./components/EarningsTab.jsx";
import SocialTab from "./components/SocialTab.jsx";
import BacktestTab from "./components/BacktestTab.jsx";
import DcaTab from "./components/DcaTab.jsx";
import CorrelationTab from "./components/CorrelationTab.jsx";
import BreadthTab from "./components/BreadthTab.jsx";
import AgentTab from "./components/AgentTab.jsx";
import AthkarTab from "./components/AthkarTab.jsx";
import HeatmapTab from "./components/HeatmapTab.jsx";
import ShortIntTab from "./components/ShortIntTab.jsx";
import EarnCalTab from "./components/EarnCalTab.jsx";
import FearGreedTab from "./components/FearGreedTab.jsx";
import BriefingTab from "./components/BriefingTab.jsx";
import IpoTab from "./components/IpoTab.jsx";
import CalendarTab from "./components/CalendarTab.jsx";
import EconCalTab from "./components/EconCalTab.jsx";
import DarkPoolTab from "./components/DarkPoolTab.jsx";
import DpHeatmapTab from "./components/DpHeatmapTab.jsx";
import CotTab from "./components/CotTab.jsx";

// Attach the API token (if the user set one) to every same-origin /api request,
// so money-moving routes work when server-side API_AUTH_TOKEN auth is enabled.
if (typeof window !== "undefined" && !window.__dmFetchWrapped) {
  window.__dmFetchWrapped = true;
  const _origFetch = window.fetch.bind(window);
  window.fetch = async (url, opts = {}) => {
    try {
      if (typeof url === "string" && url.startsWith("/api/")) {
        const tok = localStorage.getItem("axiom_api_token");
        if (tok) opts = { ...opts, headers: { ...(opts.headers || {}), "x-api-token": tok } };
      }
    } catch {}
    // Auto-retry transient server blips (5xx / HTML during a Render redeploy) for
    // idempotent GET calls to our own API — so a brief deploy window doesn't
    // surface scary "Unexpected end of JSON input" errors to the user. Only GETs
    // are retried (never POSTs), and only our /api/ paths.
    const isApiGet = typeof url === "string" && url.startsWith("/api/")
      && (!opts.method || String(opts.method).toUpperCase() === "GET");
    if (!isApiGet) return _origFetch(url, opts);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await _origFetch(url, opts);
        const ct = res.headers.get("content-type") || "";
        const transient = res.status >= 500 || (res.status === 200 && ct.includes("text/html")); // HTML = redeploy splash
        if (transient && attempt === 0) { await new Promise(r => setTimeout(r, 900)); continue; }
        return res;
      } catch (e) {
        if (attempt === 0) { await new Promise(r => setTimeout(r, 900)); continue; }
        throw e;
      }
    }
    return _origFetch(url, opts);
  };
}

// Error boundary — a runtime crash in any component shows a recovery screen
// (with the error, so it can be diagnosed) instead of a blank white page.
class RhErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { try { console.error("[AM Platform crash]", err, info && info.componentStack); } catch {} }
  render() {
    if (!this.state.err) return this.props.children;
    const msg = String(this.state.err && (this.state.err.stack || this.state.err.message) || this.state.err);
    return React.createElement("div", { style: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1220", color: "#e6edf6", fontFamily: "ui-monospace, Menlo, monospace", padding: 24 } },
      React.createElement("div", { style: { maxWidth: 640, background: "#111a2b", border: "1px solid #24324a", borderRadius: 14, padding: 24 } },
        React.createElement("div", { style: { fontSize: 20, fontWeight: 900, marginBottom: 8 } }, "⚠️ Something hit an error"),
        React.createElement("div", { style: { fontSize: 13, color: "#9fb0c7", marginBottom: 14, lineHeight: 1.6 } }, "The app caught a crash and stopped this view instead of going blank. Reloading usually fixes it. If it keeps happening, copy the message below and send it over."),
        React.createElement("button", { onClick: () => location.reload(), style: { fontFamily: "inherit", fontWeight: 800, fontSize: 14, padding: "10px 22px", borderRadius: 9, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer", marginBottom: 16 } }, "↻ Reload the app"),
        React.createElement("pre", { style: { fontSize: 11, color: "#c66", background: "#0b1220", border: "1px solid #24324a", borderRadius: 8, padding: 12, overflow: "auto", maxHeight: 220, whiteSpace: "pre-wrap" } }, msg.slice(0, 1500))
      )
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// AXIOM — Professional Market Intelligence Platform
// Real Data Edition — multi-provider (Finnhub + FMP + Yahoo fallback)
// ═══════════════════════════════════════════════════════════════

// THEME_LIGHT / THEME_DARK / C / SANS / MONO / NUM / LAYOUT now live in
// ./components/theme.js (imported above) — single source of truth shared
// with the split-out components/ files.
const UI_ZOOM = 1.0;         // no zoom — let the layout fill the viewport naturally
const UI_ZOOM_TABLET = 1.08; // slight zoom for iPad readability
const WEATHER_ZIP = "45014";

const ATHKAR_DATA = {
  morning: {
    title: "أذكار الصباح",
    items: [
      { id: "m1", text: "أَعُوذُ بِاللهِ مِنَ الشَّيْطَانِ الرَّجِيمِ\nاللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ", count: 1, label: "آية الكرسي" },
      { id: "m2", text: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\nقُلْ هُوَ اللَّهُ أَحَدٌ، اللَّهُ الصَّمَدُ، لَمْ يَلِدْ وَلَمْ يُولَدْ، وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ", count: 3, label: "سورة الإخلاص" },
      { id: "m3", text: "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ", count: 1, label: "دعاء الصباح" },
      { id: "m4", text: "اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ وَإِلَيْكَ النُّشُورُ", count: 1, label: "دعاء الاستيقاظ" },
      { id: "m5", text: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ", count: 100, label: "تسبيح الصباح" },
      { id: "m6", text: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ", count: 1, label: "سيد الاستغفار" },
      { id: "m7", text: "اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَهَ إِلَّا أَنْتَ", count: 3, label: "دعاء العافية" },
      { id: "m8", text: "رَضِيتُ بِاللَّهِ رَبًّا، وَبِالإِسْلَامِ دِيناً، وَبِمُحَمَّدٍ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ نَبِيًّا", count: 3, label: "الرضا بالله" },
    ],
  },
  evening: {
    title: "أذكار المساء",
    items: [
      { id: "e1", text: "أَعُوذُ بِاللهِ مِنَ الشَّيْطَانِ الرَّجِيمِ\nاللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ", count: 1, label: "آية الكرسي" },
      { id: "e2", text: "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ", count: 1, label: "دعاء المساء" },
      { id: "e3", text: "اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ وَإِلَيْكَ الْمَصِيرُ", count: 1, label: "دعاء المساء" },
      { id: "e4", text: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ", count: 100, label: "تسبيح المساء" },
      { id: "e5", text: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ", count: 1, label: "سيد الاستغفار" },
      { id: "e6", text: "اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَهَ إِلَّا أَنْتَ", count: 3, label: "دعاء العافية" },
    ],
  },
  afterPrayer: {
    title: "أذكار بعد الصلاة",
    items: [
      { id: "p1", text: "أَسْتَغْفِرُ اللَّهَ", count: 3, label: "الاستغفار" },
      { id: "p2", text: "اللَّهُمَّ أَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ، تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ", count: 1, label: "دعاء التسليم" },
      { id: "p3", text: "لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ", count: 1, label: "التهليل" },
      { id: "p4", text: "سُبْحَانَ اللَّهِ", count: 33, label: "التسبيح" },
      { id: "p5", text: "الْحَمْدُ لِلَّهِ", count: 33, label: "التحميد" },
      { id: "p6", text: "اللَّهُ أَكْبَرُ", count: 34, label: "التكبير" },
      { id: "p7", text: "آيَةُ الْكُرْسِيِّ", count: 1, label: "آية الكرسي بعد كل صلاة" },
    ],
  },
  sleep: {
    title: "أذكار النوم",
    items: [
      { id: "s1", text: "بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا", count: 1, label: "دعاء النوم" },
      { id: "s2", text: "اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ", count: 3, label: "الدعاء قبل النوم" },
      { id: "s3", text: "سُبْحَانَ اللَّهِ", count: 33, label: "تسبيح النوم" },
      { id: "s4", text: "الْحَمْدُ لِلَّهِ", count: 33, label: "تحميد النوم" },
      { id: "s5", text: "اللَّهُ أَكْبَرُ", count: 34, label: "تكبير النوم" },
      { id: "s6", text: "قُلْ هُوَ اللَّهُ أَحَدٌ ...", count: 3, label: "سورة الإخلاص" },
    ],
  },
  istighfar: {
    title: "الاستغفار",
    items: [
      { id: "i1", text: "أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ الَّذِي لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ وَأَتُوبُ إِلَيْهِ", count: 100, label: "الاستغفار الكامل" },
      { id: "i2", text: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ", count: 1, label: "سيد الاستغفار" },
    ],
  },
  salawat: {
    title: "الصلاة على النبي ﷺ",
    items: [
      { id: "sl1", text: "اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ", count: 10, label: "الصلاة المختصرة" },
      { id: "sl2", text: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ، كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ", count: 10, label: "الصلاة الإبراهيمية" },
    ],
  },
  duaa: {
    title: "أدعية مختارة",
    items: [
      { id: "d1", text: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ", count: 1, label: "دعاء الدنيا والآخرة" },
      { id: "d2", text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ", count: 3, label: "دعاء العفو والعافية" },
      { id: "d3", text: "حَسْبِيَ اللَّهُ لَا إِلَهَ إِلَّا هُوَ، عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ", count: 7, label: "دعاء التوكل" },
      { id: "d4", text: "اللَّهُمَّ أَصْلِحْ لِي دِينِي الَّذِي هُوَ عِصْمَةُ أَمْرِي، وَأَصْلِحْ لِي دُنْيَايَ الَّتِي فِيهَا مَعَاشِي، وَأَصْلِحْ لِي آخِرَتِي الَّتِي فِيهَا مَعَادِي", count: 1, label: "دعاء الصلاح" },
    ],
  },
};
const TASBIH_DHIKR = [
  { id: "t1", text: "سبحان الله", transliteration: "Subhan Allah" },
  { id: "t2", text: "الحمد لله", transliteration: "Alhamdulillah" },
  { id: "t3", text: "الله أكبر", transliteration: "Allahu Akbar" },
  { id: "t4", text: "لا إله إلا الله", transliteration: "La ilaha illallah" },
  { id: "t5", text: "أستغفر الله", transliteration: "Astaghfirullah" },
  { id: "t6", text: "اللهم صلِّ على محمد", transliteration: "Allahumma salli 'ala Muhammad" },
  { id: "t7", text: "سبحان الله وبحمده", transliteration: "Subhan Allahi wa bihamdih" },
  { id: "t8", text: "سبحان الله العظيم", transliteration: "Subhan Allahil Azeem" },
  { id: "t9", text: "لا حول ولا قوة إلا بالله", transliteration: "La hawla wa la quwwata illa billah" },
  { id: "t10", text: "حسبي الله ونعم الوكيل", transliteration: "Hasbiyallahu wa ni'mal wakeel" },
];

const MARKET_BASE_URL = "/api/market";
const CANDLE_BASE_URL = "/api/yahoo";

// ── Symbols ──
const WATCHLIST_SYMBOLS = [
  // Mega-cap tech & AI
  "NVDA","AAPL","MSFT","AMZN","META","GOOGL","TSLA","AVGO","CRM","ADBE","ORCL","NFLX",
  // Semis
  "AMD","QCOM","MU","INTC","AMAT","LRCX","KLAC","MRVL","ARM","SMCI",
  // High-growth / momentum tech
  "PLTR","PANW","CRWD","SNOW","NOW","UBER","SHOP","COIN","NET","DDOG","ZS","OKTA",
  // Financials
  "JPM","BAC","WFC","GS","MS","V","MA","AXP","BX","SCHW",
  // Healthcare & biotech
  "UNH","LLY","ABBV","MRK","PFE","TMO","ISRG","AMGN","VRTX","REGN",
  // Consumer & retail
  "COST","WMT","HD","MCD","NKE","SBUX","CMG","TGT",
  // Energy
  "XOM","CVX","COP","OXY","SLB",
  // Industrial & defense
  "CAT","DE","RTX","LMT","BA",
  // Staples & dividend
  "KO","PEP","PG","JNJ",
  // More semis & enterprise tech
  "TSM","ASML","INTU","CSCO","IBM","ANET","DELL","TXN","ADI","NXPI","MCHP","CDNS","SNPS","FTNT","WDAY","MDB","TTD",
  // High-beta growth & retail favorites
  "RBLX","U","AFRM","SOFI","HOOD","DKNG","ABNB","DASH","PINS","SNAP","SPOT","RDDT","PYPL","LULU","DECK",
  // EV & autos
  "RIVN","LCID","NIO","F","GM",
  // China & international
  "BABA","PDD","JD",
  // Solar & clean energy
  "ENPH","FSLR","VLO","MPC",
  // Biotech & medical
  "MRNA","DXCM","MDT","GILD",
  // ETF proxies for macro
  "SPY","QQQ","IWM","XLK","XLE","XLF","GLD","SMH","ARKK"
];
const MARKET_UNIVERSE_SYMBOLS = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","TSLA","AVGO","BRK.B","JPM","V","UNH","XOM","LLY","MA","HD","PG","COST","JNJ","MRK",
  "ABBV","KO","PEP","BAC","WMT","ORCL","CRM","ADBE","NFLX","CSCO","AMD","QCOM","TMO","MCD","INTU","ACN","DHR","ABT","LIN","TXN",
  "NEE","PM","DIS","CAT","NKE","PFE","INTC","AMAT","GE","IBM","NOW","AMGN","SPGI","BKNG","GS","PLTR","MU","PANW","UBER","SHOP",
  "SNOW","CRWD","ANET","ADP","BLK","AXP","MS","CVX","COP","SLB","EOG","FANG","MPC","OXY","RTX","LMT","BA","DE","MMM","HON",
  "UPS","FDX","UNP","CSX","NSC","C","WFC","SCHW","BX","KKR","APO","PGR","AON","MMC","CMCSA","TMUS","T","VZ","SBUX","CMG",
  "LOW","TJX","TGT","ROST","DG","DLTR","CVS","CI","HUM","ISRG","SYK","BSX","GILD","VRTX","REGN","MDT","BMY","SO","DUK","D",
  "PLD","AMT","EQIX","PSA","CCI","SPG","O","WELL","VICI","NEM","FCX","NUE","X","CLF","DAL","UAL","AAL","RCL","CCL","MAR",
  "HLT","ABNB","PYPL","SQ","COIN","HOOD","RIOT","MARA","SMCI","ARM","ASML","TSM","NVO","SAP","BABA","PDD","JD","MELI","SE",
];
const LIVE_TV_SOURCES = [
  {
    id: "bloomberg",
    label: "Bloomberg TV",
    embed: "https://www.youtube.com/embed/live_stream?channel=UCIALMKvObZNtJ6AmdCLP7Lg",
    official: "https://www.bloomberg.com/live/us",
  },
  {
    id: "cnbc",
    label: "CNBC",
    embed: "https://www.youtube.com/embed/live_stream?channel=UCvJJ_dzjViJCoLf5uKUTwoA",
    official: "https://www.cnbc.com/live-tv/",
  },
  {
    id: "reuters",
    label: "Reuters",
    embed: "https://www.youtube.com/embed/live_stream?channel=UChqUTb7kYRX8-EiaN3XFrSQ",
    official: "https://www.reuters.com/world/",
  },
];
const MACRO_SYMBOLS = [
  { symbol: "SPY", label: "S&P 500", type: "etf" },
  { symbol: "QQQ", label: "Nasdaq 100", type: "etf" },
  { symbol: "IWM", label: "Russell 2000", type: "etf" },
  { symbol: "DIA", label: "Dow 30", type: "etf" },
  { symbol: "VIXY", label: "Volatility", type: "volatility" },
  { symbol: "GLD", label: "Gold", type: "commodity" },
  { symbol: "BNO", label: "Brent Oil (Proxy)", type: "commodity" },
  { symbol: "USO", label: "Crude Oil", type: "commodity" },
  { symbol: "SHY", label: "2Y Treasury (Proxy)", type: "bond" },
  { symbol: "IEF", label: "10Y Treasury (Proxy)", type: "bond" },
  { symbol: "TLT", label: "20Y Treasury", type: "bond" },
  { symbol: "HYG", label: "High Yield", type: "credit" },
  { symbol: "LQD", label: "IG Credit", type: "credit" },
  { symbol: "UUP", label: "US Dollar", type: "currency" },
  { symbol: "BTCUSD", label: "Bitcoin", type: "crypto" },
  { symbol: "ETHUSD", label: "Ethereum", type: "crypto" },
  { symbol: "SOLUSD", label: "Solana", type: "crypto" },
];
const TV_EXCHANGE_HINTS = {
  SPY: "AMEX", QQQ: "NASDAQ", IWM: "AMEX", DIA: "AMEX", GLD: "AMEX", TLT: "NASDAQ", USO: "AMEX",
  XLK: "AMEX", XLV: "AMEX", XLF: "AMEX", XLY: "AMEX", XLC: "AMEX", XLI: "AMEX", XLE: "AMEX",
  XLP: "AMEX", XLU: "AMEX", XLRE: "AMEX", XLB: "AMEX",
};
const STORAGE_KEY = "axiom_local_config_v1";
// App password is validated server-side via POST /api/auth/check (never stored in source)
const AUTH_STORAGE_KEY = "axiom_app_unlock_v1";
const DEFAULT_SETTINGS = {
  refreshMs: 30000,
  terminalLayout: "1",
  hotkeyProfile: "classic",
  themeMode: "dark", // permanent default
  brightness: 100,   // 50–100 — CSS filter applied to whole app
  econCalendarView: "today",
  econCalendarRegion: "US",
  econAutoRisk30m: true,
  tvWebhookToken: "",
  providerKeys: { finnhubKey: "", fmpKey: "", polygonKey: "", uwKey: "", tradierKey: "" },
  flowFilters: { flowType: "all", minNotional: "0", unusualOnly: false, autoAlertNotional: "250000" },
};

function getMarketSessionET(now = new Date()) {
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins >= 240 && mins < 570) return "PREMARKET";
  if (mins >= 570 && mins < 960) return "REGULAR";
  if (mins >= 960 && mins < 1200) return "AFTERMARKET";
  return "OVERNIGHT";
}

function getSessionCountdownSecs(now = new Date()) {
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const s = et.getHours() * 3600 + et.getMinutes() * 60 + et.getSeconds();
  const PRE = 4 * 3600, OPEN = 9.5 * 3600, CLOSE = 16 * 3600, AH_END = 20 * 3600, DAY = 86400;
  if (s >= PRE && s < OPEN)   return { label: "OPENS IN",   secs: OPEN - s,    session: "PREMARKET" };
  if (s >= OPEN && s < CLOSE) return { label: "CLOSES IN",  secs: CLOSE - s,   session: "REGULAR" };
  if (s >= CLOSE && s < AH_END) return { label: "AH ENDS IN", secs: AH_END - s, session: "AFTERMARKET" };
  return { label: "PRE IN", secs: s >= AH_END ? (DAY - s + PRE) : (PRE - s), session: "OVERNIGHT" };
}

function fmtCountdownShort(secs) {
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(ss).padStart(2, "0")}s`;
  return `${ss}s`;
}

// ── Telegram / TradingView Alert Analyzer ──────────────────────────────────

const ANALYZER_SAMPLES = [
`🚨 NVDA LONG — Breakout Setup
Price: $875.50
VWAP: Above ($868.20)
EMA: 9 > 21 Bullish
RVOL: 2.4x
Entry: $872–875
Stop: $862
T1: $895
T2: $912
T3: $930`,

`AAPL — potential long
Current: $184.20
EMA: mixed/flat
Volume: normal
Entry near current
Stop maybe $180
Target $190`,

`🔥 META LONG SWING 1D
Price: $485
Above VWAP ($478)
EMA 9 > 21 bullish
RVOL: 1.8x
Entry: $483–485
Stop: $474
T1: $497
T2: $510
T3: $525`,

`TSLA SHORT 15M
Price: $245.80
Below VWAP ($249.10)
EMA: 9 < 21 bearish stack
RVOL: 3.1x
Entry: $246–247
Stop: $252
T1: $240
T2: $235
T3: $229
Setup: Failed breakout reversal`,
];

function parseTelegramAlert(rawText) {
  const text = String(rawText || "").trim();
  if (!text || text.length < 10) return null;

  // Symbol — first uppercase ticker word (optionally preceded by $)
  const symMatch = text.match(/\$([A-Z]{1,6}(?:\.[A-Z]{1,3})?)\b/) ||
    text.match(/\b([A-Z]{2,6}(?:\.[A-Z]{1,3})?)\b/);
  const symbol = symMatch ? symMatch[1] : null;

  // Direction
  const dirMatch = text.match(/\b(LONG|SHORT|BUY|SELL|BULLISH|BEARISH|CALL|PUT|BULL|BEAR)\b/i);
  let direction = dirMatch ? dirMatch[1].toUpperCase() : null;
  if (["BUY","BULL","BULLISH","CALL"].includes(direction)) direction = "LONG";
  if (["SELL","BEAR","BEARISH","PUT"].includes(direction)) direction = "SHORT";

  // Timeframe
  const tfMatch = text.match(/\b(1M|3M|5M|10M|15M|30M|1H|2H|4H|1D|1W|DAILY|WEEKLY|SWING|INTRADAY)\b/i);
  const timeframe = tfMatch ? tfMatch[1].toUpperCase() : null;

  // Price
  const priceMatch = text.match(/(?:PRICE|CURRENT|LAST|AT)[:\s]*\$?([\d,]+\.?\d*)/i) ||
    text.match(/\$\s*([\d]{2,6}\.?\d{0,2})\b/);
  const price = priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : null;

  // VWAP status + value
  let vwapStatus = null;
  const vwapAbove = /above\s+vwap|vwap[:\s]+above|price.*above.*vwap/i.test(text);
  const vwapBelow = /below\s+vwap|vwap[:\s]+below|price.*below.*vwap/i.test(text);
  const vwapAt    = /at\s+vwap|near\s+vwap/i.test(text);
  if (vwapAbove) vwapStatus = "above";
  else if (vwapBelow) vwapStatus = "below";
  else if (vwapAt) vwapStatus = "at";

  const vwapValMatch = text.match(/vwap[:\s(]+\$?([\d,]+\.?\d*)/i);
  const vwapValue = vwapValMatch ? Number(vwapValMatch[1].replace(/,/g, "")) : null;
  if (vwapValue && price && !vwapStatus) {
    vwapStatus = price > vwapValue * 1.002 ? "above" : price < vwapValue * 0.998 ? "below" : "at";
  }

  // EMA trend
  let emaTrend = null;
  if (/ema.*bull|bullish.*ema|9\s*[>]\s*21|ema.*align.*bull|above.*ema/i.test(text)) emaTrend = "bullish";
  else if (/ema.*bear|bearish.*ema|9\s*[<]\s*21|ema.*align.*bear|below.*ema/i.test(text)) emaTrend = "bearish";
  else if (/ema.*align[^e]|aligned.*ema/i.test(text)) emaTrend = "aligned";
  else if (/ema.*flat|ema.*mix|mixed.*ema/i.test(text)) emaTrend = "flat";

  // RVOL
  const rvolMatch = text.match(/rvol[:\s]*([\d.]+)\s*x?/i) || text.match(/([\d.]+)\s*x\s+(?:rvol|vol)/i);
  const rvol = rvolMatch ? Number(rvolMatch[1]) : null;

  // Entry zone
  const entryMatch = text.match(/(?:entry|enter)[:\s]*\$?([\d,]+\.?\d*)(?:\s*[–\-—]\s*\$?([\d,]+\.?\d*))?/i);
  const entryLow  = entryMatch ? Number(entryMatch[1].replace(/,/g, "")) : null;
  const entryHigh = entryMatch && entryMatch[2] ? Number(entryMatch[2].replace(/,/g, "")) : null;

  // Stop
  const stopMatch = text.match(/(?:stop|sl|stop.?loss)[:\s]*\$?([\d,]+\.?\d*)/i);
  const stop = stopMatch ? Number(stopMatch[1].replace(/,/g, "")) : null;

  // Targets — labeled
  const t1Match = text.match(/(?:t1|tp1|target\s*1)[:\s]*\$?([\d,]+\.?\d*)/i);
  const t2Match = text.match(/(?:t2|tp2|target\s*2)[:\s]*\$?([\d,]+\.?\d*)/i);
  const t3Match = text.match(/(?:t3|tp3|target\s*3)[:\s]*\$?([\d,]+\.?\d*)/i);
  let t1 = t1Match ? Number(t1Match[1].replace(/,/g, "")) : null;
  let t2 = t2Match ? Number(t2Match[1].replace(/,/g, "")) : null;
  let t3 = t3Match ? Number(t3Match[1].replace(/,/g, "")) : null;

  // Fallback: generic target line
  if (!t1) {
    const tgMatch = text.match(/(?:target|tp|take.?profit)[:\s]*\$?([\d,]+\.?\d*)(?:[,\s]+\$?([\d,]+\.?\d*))?(?:[,\s]+\$?([\d,]+\.?\d*))?/i);
    if (tgMatch) {
      if (tgMatch[1]) t1 = Number(tgMatch[1].replace(/,/g, ""));
      if (tgMatch[2]) t2 = Number(tgMatch[2].replace(/,/g, ""));
      if (tgMatch[3]) t3 = Number(tgMatch[3].replace(/,/g, ""));
    }
  }

  // Inline alert score
  const scoreMatch = text.match(/(?:score|rating)[:\s]*(\d{1,3})/i);
  const alertScore = scoreMatch ? Number(scoreMatch[1]) : null;

  // Setup type
  let setupType = "unspecified";
  if (/breakout|break.?above|break.?out/i.test(text)) setupType = "breakout";
  else if (/pullback|retest|retrace/i.test(text)) setupType = "pullback";
  else if (/reversal|bounce|recovery|failed/i.test(text)) setupType = "reversal";
  else if (/continuation|trend\s+follow/i.test(text)) setupType = "continuation";

  return { symbol, direction, timeframe, price, vwapStatus, vwapValue, emaTrend, rvol, entryLow, entryHigh, stop, t1, t2, t3, alertScore, setupType, raw: rawText };
}

function scoreAlert(parsed) {
  if (!parsed || !parsed.symbol) {
    return { score: 0, grade: "F", decision: "AVOID", warnings: ["Cannot parse alert — no symbol detected"], risks: [], positives: [], suggestedEntry: null, suggestedStop: null, suggestedT1: null, suggestedT2: null, suggestedT3: null, rrRatio: null };
  }

  let score = 50;
  const warnings = [], risks = [], positives = [];
  const { direction, vwapStatus, emaTrend, rvol, price, stop, entryLow, entryHigh, t1, t2, t3, setupType } = parsed;

  // ── VWAP alignment (+/-15)
  if (!vwapStatus) {
    warnings.push("VWAP status unknown — bias unconfirmed");
  } else if (vwapStatus === "above" && direction === "LONG") {
    score += 15; positives.push("Price ABOVE VWAP — bullish bias confirmed");
  } else if (vwapStatus === "below" && direction === "SHORT") {
    score += 15; positives.push("Price BELOW VWAP — bearish bias confirmed");
  } else if (vwapStatus === "above" && direction === "SHORT") {
    score -= 10; risks.push("Shorting ABOVE VWAP — fighting institutional order flow");
  } else if (vwapStatus === "below" && direction === "LONG") {
    score -= 15; risks.push("Longing BELOW VWAP — counter-trend, high failure rate");
  } else if (vwapStatus === "at") {
    score += 2; warnings.push("Price AT VWAP — wait for decisive break in either direction");
  }

  // ── EMA trend (+/-12)
  if (!emaTrend) {
    warnings.push("EMA data missing — trend confirmation unavailable");
  } else if (emaTrend === "bullish" && direction === "LONG") {
    score += 12; positives.push("EMA 9 > 21 — bullish stack, trend aligned");
  } else if (emaTrend === "bearish" && direction === "SHORT") {
    score += 12; positives.push("EMA 9 < 21 — bearish stack, trend aligned");
  } else if (emaTrend === "bullish" && direction === "SHORT") {
    score -= 12; risks.push("Fighting bullish EMA stack on a SHORT — high risk");
  } else if (emaTrend === "bearish" && direction === "LONG") {
    score -= 12; risks.push("Fighting bearish EMA stack on a LONG — high risk");
  } else if (emaTrend === "aligned") {
    score += 6; positives.push("EMAs aligned with trade direction");
  } else if (emaTrend === "flat") {
    score -= 5; warnings.push("EMAs flat — choppy price action, no clear trend");
  }

  // ── RVOL (+/-15)
  if (rvol === null) {
    score -= 5; warnings.push("RVOL not specified — volume confirmation unknown");
  } else if (rvol >= 2.5) {
    score += 15; positives.push(`RVOL ${rvol.toFixed(1)}x — institutional volume spike detected`);
  } else if (rvol >= 2.0) {
    score += 12; positives.push(`RVOL ${rvol.toFixed(1)}x — strong volume, move has conviction`);
  } else if (rvol >= 1.5) {
    score += 8; positives.push(`RVOL ${rvol.toFixed(1)}x — above-average volume`);
  } else if (rvol >= 1.0) {
    score += 2; warnings.push(`RVOL ${rvol.toFixed(1)}x — average volume, low conviction`);
  } else {
    score -= 12; risks.push(`RVOL ${rvol.toFixed(1)}x — below-average volume, breakout suspect`);
  }

  // ── Stop loss & R:R
  const entryRef = entryLow || price;
  let rrRatio = null;
  if (!stop) {
    score -= 20; risks.push("NO STOP LOSS defined — position carries undefined risk");
  } else if (entryRef && t1) {
    const risk = Math.abs(entryRef - stop);
    const reward = Math.abs(t1 - entryRef);
    rrRatio = risk > 0 ? reward / risk : 0;
    if (rrRatio >= 3)       { score += 12; positives.push(`R:R ${rrRatio.toFixed(1)}:1 — excellent risk/reward`); }
    else if (rrRatio >= 2)  { score += 8;  positives.push(`R:R ${rrRatio.toFixed(1)}:1 — solid risk/reward`); }
    else if (rrRatio >= 1.5){ score += 3;  warnings.push(`R:R ${rrRatio.toFixed(1)}:1 — acceptable but not ideal`); }
    else if (rrRatio >= 1)  { score -= 5;  warnings.push(`R:R ${rrRatio.toFixed(1)}:1 — marginal, consider reducing size`); }
    else                    { score -= 15; risks.push(`R:R ${rrRatio.toFixed(1)}:1 — unfavorable, risk outweighs reward`); }

    const stopPct = risk / entryRef * 100;
    if (stopPct > 5)       { score -= 8;  risks.push(`Stop ${stopPct.toFixed(1)}% from entry — too wide, forces small size`); }
    else if (stopPct > 3)  { warnings.push(`Stop ${stopPct.toFixed(1)}% from entry — moderate risk`); }
  }

  // ── VWAP extension risk
  if (parsed.vwapValue && price) {
    const extPct = Math.abs(price - parsed.vwapValue) / parsed.vwapValue * 100;
    if (extPct > 3)       { score -= 12; risks.push(`Price ${extPct.toFixed(1)}% from VWAP — chasing an extended move`); }
    else if (extPct > 2)  { score -= 6;  warnings.push(`Price ${extPct.toFixed(1)}% from VWAP — slightly extended, prefer pullback entry`); }
  }

  // ── Setup type bonus/penalty
  if (setupType === "breakout")     { score += 5; positives.push("Breakout setup — momentum trade"); }
  else if (setupType === "pullback"){ score += 7; positives.push("Pullback to key level — higher R:R potential"); }
  else if (setupType === "reversal"){ score -= 3; warnings.push("Reversal trade — statistically lower probability, need volume confirmation"); }

  // ── Missing data penalties
  if (!direction)  { score -= 15; risks.push("No trade direction specified"); }
  if (!t1)         { score -= 8;  warnings.push("No targets defined — exit plan unclear"); }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Grade and decision
  let grade, decision;
  if (score >= 80)      { grade = "A+"; decision = "ENTER"; }
  else if (score >= 70) { grade = "A";  decision = "WAIT"; }
  else if (score >= 60) { grade = "B";  decision = "WAIT"; }
  else if (score >= 50) { grade = "C";  decision = "AVOID"; }
  else                  { grade = "D";  decision = "AVOID"; }

  // Hard overrides
  if (risks.some(r => r.includes("undefined risk") || r.includes("unfavorable"))) decision = "AVOID";
  if (risks.some(r => r.includes("counter-trend") || r.includes("fighting"))) decision = score >= 75 ? "WAIT" : "AVOID";

  // Suggested levels (use alert values or derive)
  const suggestedEntry = entryLow || price;
  const suggestedEntryHigh = entryHigh || (suggestedEntry ? suggestedEntry * (direction === "LONG" ? 1.005 : 0.995) : null);
  const suggestedStop  = stop || (suggestedEntry ? (direction === "LONG" ? suggestedEntry * 0.97 : suggestedEntry * 1.03) : null);
  const suggestedT1    = t1   || (suggestedEntry ? (direction === "LONG" ? suggestedEntry * 1.03 : suggestedEntry * 0.97) : null);
  const suggestedT2    = t2   || (suggestedT1   ? (direction === "LONG" ? suggestedT1 * 1.03    : suggestedT1 * 0.97)    : null);
  const suggestedT3    = t3   || (suggestedT2   ? (direction === "LONG" ? suggestedT2 * 1.03    : suggestedT2 * 0.97)    : null);

  // Invalidation condition
  const invalidation = suggestedStop
    ? `Close ${direction === "LONG" ? "below" : "above"} $${suggestedStop.toFixed(2)} — exit immediately`
    : "No stop defined — set one before entry";

  return { score, grade, decision, warnings, risks, positives, rrRatio, invalidation, suggestedEntry, suggestedEntryHigh, suggestedStop, suggestedT1, suggestedT2, suggestedT3 };
}

function nextDayOfMonthOccurrence(day = 12, hour = 8, minute = 30, fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setSeconds(0, 0);
  const year = d.getFullYear();
  const month = d.getMonth();
  const candidate = new Date(year, month, day, hour, minute, 0, 0);
  if (candidate > d) return candidate;
  return new Date(year, month + 1, day, hour, minute, 0, 0);
}

function nextFirstFridayOccurrence(hour = 8, minute = 30, fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setSeconds(0, 0);
  let year = d.getFullYear();
  let month = d.getMonth();
  for (let k = 0; k < 14; k += 1) {
    const firstDay = new Date(year, month, 1);
    const dow = firstDay.getDay();
    const offset = (5 - dow + 7) % 7;
    const firstFridayDate = 1 + offset;
    const candidate = new Date(year, month, firstFridayDate, hour, minute, 0, 0);
    if (candidate > d) return candidate;
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function nextFedCycleOccurrence(fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setSeconds(0, 0);
  const anchor = new Date(2026, 0, 29, 14, 0, 0, 0);
  const stepMs = 42 * 24 * 60 * 60 * 1000;
  if (d < anchor) return anchor;
  const diff = d.getTime() - anchor.getTime();
  const jumps = Math.floor(diff / stepMs) + 1;
  return new Date(anchor.getTime() + jumps * stepMs);
}

function weatherCodeLabel(code) {
  const n = Number(code);
  if (n === 0) return "Clear";
  if ([1, 2, 3].includes(n)) return "Partly cloudy";
  if ([45, 48].includes(n)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(n)) return "Drizzle";
  if ([61, 63, 65, 66, 67].includes(n)) return "Rain";
  if ([71, 73, 75, 77].includes(n)) return "Snow";
  if ([80, 81, 82].includes(n)) return "Rain showers";
  if ([95, 96, 99].includes(n)) return "Thunderstorm";
  return "Mixed";
}

function buildMacroEventCalendar(now = new Date()) {
  const ref = new Date(now);
  const fed = nextFedCycleOccurrence(ref);
  const cpi = nextDayOfMonthOccurrence(12, 8, 30, ref);
  const jobs = nextFirstFridayOccurrence(8, 30, ref);
  const pce = nextDayOfMonthOccurrence(28, 8, 30, ref);
  const fomcMins = new Date(fed.getTime() + 21 * 24 * 60 * 60 * 1000);
  const ecb = nextDayOfMonthOccurrence(6, 8, 15, ref);
  const boe = nextDayOfMonthOccurrence(20, 7, 0, ref);
  const boj = nextDayOfMonthOccurrence(18, 23, 0, ref);
  const chinaCpi = nextDayOfMonthOccurrence(10, 21, 30, ref);

  const events = [
    { id: "fed", title: "Fed Decision / Presser", tag: "FED", severity: "high", time: fed, riskNote: "Reduce gross and avoid fresh size 60–90m pre-event.", estimated: true },
    { id: "cpi", title: "US CPI Release", tag: "CPI", severity: "high", time: cpi, riskNote: "Tighten stops and cut leverage into print.", estimated: true },
    { id: "jobs", title: "US Jobs (NFP)", tag: "JOBS", severity: "high", time: jobs, riskNote: "Expect index/FX vol spikes; reduce into event.", estimated: true },
    { id: "pce", title: "PCE Inflation", tag: "PCE", severity: "medium", time: pce, riskNote: "Trim high-beta if regime is fragile.", estimated: true },
    { id: "fomc-mins", title: "FOMC Minutes", tag: "MINUTES", severity: "medium", time: fomcMins, riskNote: "Keep optionality; avoid oversized adds.", estimated: true },
  ].map((e) => {
    const tteMs = e.time.getTime() - ref.getTime();
    const mins = tteMs / 60000;
    const phase = mins <= 0 ? "live" : mins <= 60 ? "imminent" : mins <= 180 ? "near" : "scheduled";
    return { ...e, tteMs, phase };
  });

  return events.sort((a, b) => a.time.getTime() - b.time.getTime());
}

function buildMacroEventCalendarV2(now = new Date()) {
  const ref = new Date(now);
  const fed = nextFedCycleOccurrence(ref);
  const cpi = nextDayOfMonthOccurrence(12, 8, 30, ref);
  const jobs = nextFirstFridayOccurrence(8, 30, ref);
  const pce = nextDayOfMonthOccurrence(28, 8, 30, ref);
  const fomcMins = new Date(fed.getTime() + 21 * 24 * 60 * 60 * 1000);
  const ecb = nextDayOfMonthOccurrence(6, 8, 15, ref);
  const boe = nextDayOfMonthOccurrence(20, 7, 0, ref);
  const boj = nextDayOfMonthOccurrence(18, 23, 0, ref);
  const chinaCpi = nextDayOfMonthOccurrence(10, 21, 30, ref);

  const events = [
    { id: "fed", title: "Fed Decision / Presser", tag: "FED", severity: "high", region: "US", time: fed, riskNote: "Reduce gross and avoid fresh size 60-90m pre-event.", estimated: true,
      est: { metric: "Fed Funds Rate", prior: "4.25–4.50%", consensus: "4.25–4.50% (hold)", whisper: "Hold; watch dot plot & Powell tone for cut timing" } },
    { id: "cpi", title: "US CPI Release", tag: "CPI", severity: "high", region: "US", time: cpi, riskNote: "Tighten stops and cut leverage into print.", estimated: true,
      est: { metric: "CPI YoY / Core", prior: "3.0% / 3.3%", consensus: "2.9% / 3.2%", whisper: "Cooler core would fuel rate-cut bets → risk-on" } },
    { id: "jobs", title: "US Jobs (NFP)", tag: "JOBS", severity: "high", region: "US", time: jobs, riskNote: "Expect index/FX vol spikes; reduce into event.", estimated: true,
      est: { metric: "Nonfarm Payrolls / Unemp.", prior: "+150K / 4.1%", consensus: "+165K / 4.1%", whisper: "Hot print = yields up, growth/tech under pressure" } },
    { id: "pce", title: "PCE Inflation", tag: "PCE", severity: "medium", region: "US", time: pce, riskNote: "Trim high-beta if regime is fragile.", estimated: true,
      est: { metric: "Core PCE YoY", prior: "2.8%", consensus: "2.7%", whisper: "Fed's preferred gauge — soft = dovish tailwind" } },
    { id: "fomc-mins", title: "FOMC Minutes", tag: "MINUTES", severity: "medium", region: "US", time: fomcMins, riskNote: "Keep optionality; avoid oversized adds.", estimated: true },
    { id: "ecb", title: "ECB Rate Decision", tag: "ECB", severity: "high", region: "GLOBAL", time: ecb, riskNote: "Watch DXY and global risk cross-asset reaction.", estimated: true },
    { id: "boe", title: "BoE Policy Decision", tag: "BOE", severity: "medium", region: "GLOBAL", time: boe, riskNote: "UK rates can spill into global yields/risk.", estimated: true },
    { id: "boj", title: "BoJ Policy Outlook", tag: "BOJ", severity: "medium", region: "GLOBAL", time: boj, riskNote: "JPY/yield shifts can hit equity beta quickly.", estimated: true },
    { id: "cn-cpi", title: "China CPI/PPI", tag: "CN CPI", severity: "medium", region: "GLOBAL", time: chinaCpi, riskNote: "Can affect commodity and cyclical sentiment.", estimated: true },
  ].map((e) => {
    const tteMs = e.time.getTime() - ref.getTime();
    const mins = tteMs / 60000;
    const phase = mins <= 0 ? "live" : mins <= 60 ? "imminent" : mins <= 180 ? "near" : "scheduled";
    const impact = e.severity === "high" ? "HIGH" : e.severity === "medium" ? "MEDIUM" : "LOW";
    return { ...e, tteMs, phase, impact };
  });

  return events.sort((a, b) => a.time.getTime() - b.time.getTime());
}

function analyzeNewsIntelligence(newsRows = []) {
  const byTicker = {};
  const upgrades = [];
  const downgrades = [];
  const macroRed = [];
  const macroGreen = [];
  const upWords = ["upgrade", "upgrades", "outperform", "overweight", "buy rating", "raises target", "initiates buy"];
  const downWords = ["downgrade", "downgrades", "underperform", "underweight", "sell rating", "cuts target", "reduces target"];
  const buyWords = ["buyback", "beats", "strong guidance", "raised guidance", "contract win"];
  const sellWords = ["misses", "cuts guidance", "secondary offering", "dilution", "investigation"];
  const redWords = ["war", "conflict", "sanction", "tariff", "rate hike", "hot inflation", "recession", "liquidity stress"];
  const greenWords = ["ceasefire", "rate cut", "cooling inflation", "stimulus", "disinflation", "soft landing"];

  for (const row of newsRows || []) {
    const text = `${row?.title || ""} ${row?.summary || ""}`.toLowerCase();
    const ticker = String(row?.ticker || "").toUpperCase();
    if (ticker && !byTicker[ticker]) byTicker[ticker] = { upgrades: 0, downgrades: 0, buyMentions: 0, sellMentions: 0 };
    if (ticker) {
      if (upWords.some((w) => text.includes(w))) byTicker[ticker].upgrades += 1;
      if (downWords.some((w) => text.includes(w))) byTicker[ticker].downgrades += 1;
      if (buyWords.some((w) => text.includes(w))) byTicker[ticker].buyMentions += 1;
      if (sellWords.some((w) => text.includes(w))) byTicker[ticker].sellMentions += 1;
      if (byTicker[ticker].upgrades > byTicker[ticker].downgrades) upgrades.push({ ticker, title: row?.title || "" });
      if (byTicker[ticker].downgrades > byTicker[ticker].upgrades) downgrades.push({ ticker, title: row?.title || "" });
    }
    if (redWords.some((w) => text.includes(w))) macroRed.push(row?.title || "");
    if (greenWords.some((w) => text.includes(w))) macroGreen.push(row?.title || "");
  }

  return {
    byTicker,
    upgrades: upgrades.slice(0, 8),
    downgrades: downgrades.slice(0, 8),
    macroRed: Array.from(new Set(macroRed)).slice(0, 8),
    macroGreen: Array.from(new Set(macroGreen)).slice(0, 8),
  };
}

function getTradingViewUrl(symbol) {
  const s = String(symbol || "").toUpperCase().replace("-USD", "USD");
  if (!s) return "https://www.tradingview.com";
  if (s === "BTCUSD") return "https://www.tradingview.com/chart/?symbol=BITSTAMP:BTCUSD";
  const ex = TV_EXCHANGE_HINTS[s] || "NASDAQ";
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`${ex}:${s}`)}`;
}
const DEFAULT_PORTFOLIO = [
  { symbol: "NVDA", shares: "20", avgCost: "120" },
  { symbol: "AAPL", shares: "30", avgCost: "165" },
  { symbol: "MSFT", shares: "15", avgCost: "320" },
];
const DEFAULT_SCANNER_FILTERS = {
  minPrice: "10",
  minChange: "0.5",
  minRvol: "1",
  minScore: "55",
  sector: "ALL",
  scope: "watchlist",
};
const DEFAULT_WORKFLOW = {
  premarket: {
    checklist: [
      { id: "macro_regime", label: "Classify macro regime (Risk-On / Risk-Off)", done: false },
      { id: "key_levels", label: "Mark key levels for SPY/QQQ", done: false },
      { id: "watchlist_rank", label: "Rank top watchlist ideas by score", done: false },
      { id: "catalysts", label: "Review earnings/news catalysts", done: false },
    ],
    notes: "",
  },
  live: {
    checklist: [
      { id: "setup_quality", label: "Only take A+ setups with confirmation", done: false },
      { id: "position_size", label: "Size by risk model before entry", done: false },
      { id: "invalidation", label: "Set stop + invalidation before order", done: false },
      { id: "regime_gate", label: "Confirm trade aligns with macro regime", done: false },
      { id: "max_loss", label: "Respect daily max loss lock", done: false },
    ],
    notes: "",
  },
  postmarket: {
    checklist: [
      { id: "journal", label: "Journal each trade outcome", done: false },
      { id: "mistakes", label: "Tag mistakes and rule breaks", done: false },
      { id: "best_setups", label: "Save best setups for replay", done: false },
      { id: "next_day", label: "Build focus list for tomorrow", done: false },
    ],
    notes: "",
  },
};

function appendProviderKeys(url, providerKeys = {}) {
  const u = new URL(url, window.location.origin);
  const finnhubKey = String(providerKeys?.finnhubKey || "").trim();
  const fmpKey = String(providerKeys?.fmpKey || "").trim();
  const polygonKey = String(providerKeys?.polygonKey || "").trim();
  const uwKey = String(providerKeys?.uwKey || "").trim();
  const tradierKey = String(providerKeys?.tradierKey || "").trim();
  if (finnhubKey) u.searchParams.set("finnhubKey", finnhubKey);
  if (fmpKey) u.searchParams.set("fmpKey", fmpKey);
  if (polygonKey) u.searchParams.set("polygonKey", polygonKey);
  if (uwKey) u.searchParams.set("uwKey", uwKey);
  if (tradierKey) u.searchParams.set("tradierKey", tradierKey);
  return `${u.pathname}${u.search}`;
}

// ── API Fetch Helpers ──
function getApiErrorMessage(data, text, status) {
  const fromJson = data?.["Error Message"] || data?.message || data?.error || data?.code;
  if (fromJson) return String(fromJson);
  if (typeof text === "string" && text.trim()) return text.trim();
  return `API ${status}`;
}

function isRestrictedMessage(message) {
  const m = String(message || "").toLowerCase();
  return m.includes("restricted") || m.includes("premium") || m.includes("plan") || m.includes("limit");
}

async function fetchApiPayload(url) {
  const res = await fetch(url);
  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  const message = getApiErrorMessage(data, text, res.status);

  if (!res.ok) {
    throw new Error(message);
  }

  if (data && (data?.status === "error" || data?.["Error Message"] || data?.message || data?.error || data?.code)) {
    throw new Error(message);
  }

  if (!data) {
    throw new Error(message);
  }

  return data;
}

function withClientTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function normalizeQuoteResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && data.symbol) return [data];
  return [];
}

function normalizeTdQuote(data, fallbackSymbol) {
  const symbol = String(data?.symbol || fallbackSymbol || "").toUpperCase();
  if (!symbol) return null;
  const price = Number(data?.close ?? data?.price ?? data?.regularMarketPrice ?? 0);
  const prev = Number(data?.previous_close ?? data?.previousClose ?? data?.regularMarketPreviousClose ?? price);
  const impliedChange = prev ? ((price - prev) / prev) * 100 : 0;
  const yearHigh = Number(data?.fifty_two_week?.high ?? data?.fifty_two_week_high ?? data?.fiftyTwoWeekHigh ?? data?.yearHigh ?? 0);
  const yearLow = Number(data?.fifty_two_week?.low ?? data?.fifty_two_week_low ?? data?.fiftyTwoWeekLow ?? data?.yearLow ?? 0);
  const changesPercentage = Number(data?.changesPercentage ?? data?.percent_change ?? data?.regularMarketChangePercent);
  const change = Number(data?.change ?? data?.regularMarketChange ?? (price - prev));

  return {
    symbol,
    name: data?.name || data?.longName || data?.shortName || data?.instrument_name || symbol,
    price: Number.isFinite(price) ? price : 0,
    change: Number.isFinite(change) ? change : 0,
    changesPercentage: Number.isFinite(changesPercentage) ? changesPercentage : impliedChange,
    delta1d: Number.isFinite(Number(data?.delta1d)) ? Number(data?.delta1d) : (Number.isFinite(changesPercentage) ? changesPercentage : impliedChange),
    delta1w: Number.isFinite(Number(data?.delta1w)) ? Number(data?.delta1w) : 0,
    delta5m: Number.isFinite(Number(data?.delta5m)) ? Number(data?.delta5m) : 0,
    delta30m: Number.isFinite(Number(data?.delta30m)) ? Number(data?.delta30m) : 0,
    open: Number.isFinite(Number(data?.open ?? data?.regularMarketOpen)) ? Number(data?.open ?? data?.regularMarketOpen) : 0,
    previousClose: Number.isFinite(prev) ? prev : 0,
    dayHigh: Number.isFinite(Number(data?.dayHigh ?? data?.regularMarketDayHigh)) ? Number(data?.dayHigh ?? data?.regularMarketDayHigh) : 0,
    dayLow: Number.isFinite(Number(data?.dayLow ?? data?.regularMarketDayLow)) ? Number(data?.dayLow ?? data?.regularMarketDayLow) : 0,
    volume: Number.isFinite(Number(data?.volume)) ? Number(data?.volume) : 0,
    avgVolume: Number.isFinite(Number(data?.avgVolume ?? data?.average_volume ?? data?.averageDailyVolume3Month)) ? Number(data?.avgVolume ?? data?.average_volume ?? data?.averageDailyVolume3Month) : 0,
    yearHigh: Number.isFinite(yearHigh) ? yearHigh : 0,
    yearLow: Number.isFinite(yearLow) ? yearLow : 0,
    pe: Number.isFinite(Number(data?.pe)) ? Number(data?.pe) : 0,
    marketCap: Number.isFinite(Number(data?.marketCap ?? data?.market_cap)) ? Number(data?.marketCap ?? data?.market_cap) : 0,
    priceAvg50: Number.isFinite(Number(data?.priceAvg50 ?? data?.fifty_day_avg ?? data?.fifty_day_average)) ? Number(data?.priceAvg50 ?? data?.fifty_day_avg ?? data?.fifty_day_average) : 0,
    priceAvg200: Number.isFinite(Number(data?.priceAvg200 ?? data?.two_hundred_day_avg ?? data?.two_hundred_day_average)) ? Number(data?.priceAvg200 ?? data?.two_hundred_day_avg ?? data?.two_hundred_day_average) : 0,
    exchange: data?.exchange || data?.fullExchangeName || "",
  };
}

function normalizeTdBatch(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.map((q) => normalizeTdQuote(q, q?.symbol)).filter(Boolean);
  if (data?.symbol) return [normalizeTdQuote(data, data?.symbol)].filter(Boolean);
  if (typeof data === "object") {
    return Object.entries(data)
      .map(([symbol, q]) => normalizeTdQuote(q, symbol))
      .filter(Boolean);
  }
  return [];
}

function buildPlaceholderQuotes(symbols) {
  return (symbols || []).map((symbol) => ({
    symbol,
    name: symbol,
    price: 0,
    change: 0,
    changesPercentage: 0,
    delta1d: 0,
    delta1w: 0,
    delta5m: 0,
    delta30m: 0,
    open: 0,
    previousClose: 0,
    dayHigh: 0,
    dayLow: 0,
    volume: 0,
    avgVolume: 0,
    yearHigh: 0,
    yearLow: 0,
    marketCap: 0,
    pe: 0,
    priceAvg50: 0,
    priceAvg200: 0,
  }));
}

async function fetchQuotes(symbols, providerKeys) {
  const list = symbols.join(",");
  const quoteUrl = appendProviderKeys(
    `${MARKET_BASE_URL}/quote?symbols=${encodeURIComponent(list)}`,
    providerKeys
  );
  const data = await fetchApiPayload(quoteUrl);
  return normalizeTdBatch(data);
}

async function fetchQuotesChunked(symbols, providerKeys, chunkSize = 35) {
  const clean = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  if (!clean.length) return [];
  const chunks = [];
  for (let i = 0; i < clean.length; i += chunkSize) {
    chunks.push(clean.slice(i, i + chunkSize));
  }
  const rows = await Promise.all(chunks.map((chunk) => fetchQuotes(chunk, providerKeys).catch(() => [])));
  const all = rows.flat();
  const dedup = new Map();
  all.forEach((q) => {
    if (q?.symbol) dedup.set(q.symbol, q);
  });
  return Array.from(dedup.values());
}

async function fetchCryptoQuotes(providerKeys) {
  try {
    const data = await fetchApiPayload(
      appendProviderKeys(`${MARKET_BASE_URL}/quote?symbols=${encodeURIComponent("BTC-USD,ETH-USD,SOL-USD")}`, providerKeys)
    );
    return normalizeTdBatch(data);
  } catch {
    return [];
  }
}

async function fetchNews(tickers, limit = 20, providerKeys) {
  if (!tickers?.length) return [];
  const url = appendProviderKeys(
    `${MARKET_BASE_URL}/news?tickers=${encodeURIComponent(tickers.join(","))}&limit=${encodeURIComponent(limit)}`,
    providerKeys
  );
  const data = await fetchApiPayload(url);
  if (!Array.isArray(data)) return [];
  return data.map((item) => ({
    ...item,
    publisher: item?.publisher || item?.source || "Unknown",
    source: item?.source || item?.publisher || "Unknown",
  }));
}

async function fetchCandles(symbol, timeframe = "1D") {
  if (!symbol) return null;
  const url = `${CANDLE_BASE_URL}/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`;
  return fetchApiPayload(url);
}

async function fetchFundamentals(symbol, providerKeys) {
  if (!symbol) return null;
  const url = appendProviderKeys(`${MARKET_BASE_URL}/fundamentals?symbol=${encodeURIComponent(symbol)}`, providerKeys);
  return fetchApiPayload(url);
}

async function fetchOptionsFlow(symbols, limit = 24, providerKeys, flowFilters = {}) {
  if (!symbols?.length) return null;
  const flowType = String(flowFilters?.flowType || "all");
  const minNotional = Number(flowFilters?.minNotional || 0);
  const unusualOnly = Boolean(flowFilters?.unusualOnly);
  const raw = `${MARKET_BASE_URL}/options-flow?symbols=${encodeURIComponent(symbols.join(","))}&limit=${encodeURIComponent(limit)}&flowType=${encodeURIComponent(flowType)}&minNotional=${encodeURIComponent(minNotional)}&unusualOnly=${encodeURIComponent(unusualOnly ? "true" : "false")}`;
  const url = appendProviderKeys(raw, providerKeys);
  return fetchApiPayload(url);
}

async function fetchTradingViewAlerts(limit = 25) {
  const url = `${MARKET_BASE_URL}/tv-alerts?limit=${encodeURIComponent(limit)}`;
  const data = await fetchApiPayload(url);
  return {
    rows: Array.isArray(data?.rows) ? data.rows : [],
    secured: Boolean(data?.secured),
  };
}

function isLegacyEndpointMessage(message) {
  const m = String(message || "").toLowerCase();
  return m.includes("legacy endpoint");
}

function toFriendlyApiMessage(message) {
  const raw = String(message || "");
  if (isLegacyEndpointMessage(raw)) {
    return "The old provider endpoint is no longer available. This dashboard now uses multi-provider market quotes.";
  }
  if (isRestrictedMessage(raw)) {
    return "Upstream quote source is throttling or temporarily unavailable.";
  }
  return raw;
}

async function fetchGainersLosers(apiKey) {
  return [];
}

function classifyRegime(macroQuotes) {
  if (!macroQuotes || macroQuotes.length < 3) return "Loading…";
  const spy = macroQuotes.find(q => q.symbol === "SPY");
  const qqq = macroQuotes.find(q => q.symbol === "QQQ");
  const tlt = macroQuotes.find(q => q.symbol === "TLT");
  const gld = macroQuotes.find(q => q.symbol === "GLD");
  
  const spyChg = spy?.changesPercentage || 0;
  const qqqChg = qqq?.changesPercentage || 0;
  const tltChg = tlt?.changesPercentage || 0;
  const gldChg = gld?.changesPercentage || 0;
  
  if (spyChg > 0.5 && qqqChg > 0.5 && tltChg < 0) return "Risk-On";
  if (spyChg < -0.5 && gldChg > 0 && tltChg > 0) return "Risk-Off";
  if (qqqChg > spyChg + 0.3) return "Growth";
  if (spyChg > 0 && tltChg > 0) return "Goldilocks";
  if (spyChg < -0.3) return "Defensive";
  return "Neutral";
}

function buildAlerts({ watchlist, macro, regime, sectorData, customAlerts }) {
  if (!Array.isArray(watchlist) || watchlist.length === 0) return [];
  const alerts = [];
  const spy = Array.isArray(macro) ? macro.find((q) => q.symbol === "SPY") : null;
  const spyChg = spy?.changesPercentage || 0;
  const sectorMap = new Map((sectorData || []).map((s) => [s.symbol, s]));
  const customSet = new Map((customAlerts || []).map((a) => [String(a.symbol || "").toUpperCase(), Number(a.minScore || 60)]));

  watchlist.forEach((q) => {
    const symbol = q.symbol;
    const chg = q.changesPercentage || 0;
    const rvol = q.avgVolume > 0 ? q.volume / q.avgVolume : 0;
    const price = q.price || 0;
    const yearHigh = q.yearHigh || 0;
    const yearLow = q.yearLow || 0;
    const rangePos = yearHigh > yearLow ? (price - yearLow) / (yearHigh - yearLow) : 0.5;
    const relVsSpy = chg - spyChg;
    const sectorEtf = STOCK_TO_SECTOR[symbol];
    const sectorChg = sectorEtf ? (sectorMap.get(sectorEtf)?.changesPercentage || 0) : 0;
    const relVsSector = chg - sectorChg;

    if (chg > 1.5 && rvol > 1.3 && relVsSpy > 0.8) {
      alerts.push({
        symbol,
        type: "opportunity",
        category: "breakout",
        score: 90 + Math.min(9, Math.round(rvol * 2)),
        text: `Momentum expansion: +${chg.toFixed(2)}% with ${rvol.toFixed(2)}x RVOL and RS vs SPY.`,
      });
    }

    if (rangePos > 0.9 && rvol > 1.2) {
      alerts.push({
        symbol,
        type: "opportunity",
        category: "trend",
        score: 84,
        text: "Near 52W high with volume sponsorship. Watch breakout continuation.",
      });
    }
    if (q.priceAvg50 && q.price > q.priceAvg50 && chg > 0.4 && rvol > 1) {
      alerts.push({
        symbol,
        type: "opportunity",
        category: "ema-reclaim",
        score: 78,
        text: `EMA reclaim signal: price above 50D average with improving participation.`,
      });
    }
    if (relVsSector > 0.8 && relVsSpy > 0.5) {
      alerts.push({
        symbol,
        type: "opportunity",
        category: "rs-shift",
        score: 82,
        text: `Relative strength shift: outperforming both sector (${sectorEtf || "n/a"}) and SPY.`,
      });
    }

    if (chg < -2 && rvol > 1.2) {
      alerts.push({
        symbol,
        type: "risk",
        category: "distribution",
        score: 87,
        text: `Distribution risk: ${chg.toFixed(2)}% with elevated volume.`,
      });
    }

    if ((regime === "Risk-Off" || regime === "Defensive") && chg > 1.2 && relVsSpy < 0) {
      alerts.push({
        symbol,
        type: "risk",
        category: "macro-conflict",
        score: 72,
        text: "Macro regime conflict: price up but underperforming index leadership.",
      });
    }
    if (rvol > 2.2 && Math.abs(chg) < 0.35) {
      alerts.push({
        symbol,
        type: "risk",
        category: "failed-move",
        score: 69,
        text: "Heavy volume without directional progress; possible distribution/absorption.",
      });
    }

    if (customSet.has(symbol)) {
      const minScore = customSet.get(symbol);
      const currentScore = Math.round((Math.max(0, relVsSpy) * 9) + (rvol * 20) + (Math.max(0, chg) * 8));
      if (currentScore >= minScore) {
        alerts.push({
          symbol,
          type: "opportunity",
          category: "custom",
          score: Math.min(95, currentScore),
          text: `Custom alert triggered (threshold ${minScore}) with score ${currentScore}.`,
        });
      }
    }
  });

  return alerts.sort((a, b) => b.score - a.score).slice(0, 8);
}

function classifyMacroTone(macroData) {
  const get = (s) => macroData.find((q) => q.symbol === s)?.changesPercentage || 0;
  const spy = get("SPY");
  const qqq = get("QQQ");
  const vixy = get("VIXY");
  const tlt = get("TLT");
  const hyg = get("HYG");
  const uso = get("USO");
  const uup = get("UUP");

  if (spy > 0.5 && qqq > 0.5 && vixy < 0) return "Risk-On";
  if (spy < -0.5 && vixy > 0.5 && tlt > 0) return "Risk-Off";
  if (qqq > spy && tlt > 0) return "Falling-Yield Relief";
  if (uso > 1 && uup > 0.5) return "Inflation Pressure";
  if (hyg < -0.6 && spy <= 0) return "Credit Stress";
  return "Balanced";
}

// ── Tiny Components ──
const Pill = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{
    fontFamily: SANS, fontSize: 12, fontWeight: 700, padding: "8px 14px",
    borderRadius: 6, border: "none", cursor: "pointer", letterSpacing: "0.02em",
    background: active ? C.accent : C.card, color: active ? "#fff" : C.textDim,
    transition: "all 0.15s",
  }}>{children}</button>
);

// ── API Key Screen ──
function PasswordLockScreen({ value, error, onChange, onSubmit }) {
  return (
    <div style={{
      minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: SANS,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet" />
      <div style={{
        width: 420, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 32, textAlign: "center",
      }}>
        <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>AM TRADING</div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 20 }}>
          PASSWORD PROTECTED
        </div>
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="Enter password"
          style={{
            width: "100%", boxSizing: "border-box", padding: "11px 12px",
            border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface,
            color: C.text, fontFamily: MONO, fontSize: 13, marginBottom: 12,
          }}
        />
        {error ? <div style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>{error}</div> : null}
        <button
          onClick={onSubmit}
          style={{
            width: "100%", border: `1px solid ${C.accent}`, background: C.accent, color: "#fff",
            borderRadius: 6, padding: "10px 0", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          UNLOCK
        </button>
      </div>
    </div>
  );
}

function ApiKeyScreen({ onSubmit }) {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchApiPayload(`${MARKET_BASE_URL}/quote?symbols=AAPL`);
      if (normalizeQuoteResponse(data).length > 0) {
        onSubmit(key.trim());
      } else {
        setError("Unexpected response. Verify your provider keys in server environment.");
      }
    } catch (e) {
      setError(toFriendlyApiMessage(e?.message || "Network error. Check your connection."));
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: SANS,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet" />
      <div style={{
        width: 440, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 40, textAlign: "center",
      }}>
        <div style={{
          fontFamily: MONO, fontSize: 28, fontWeight: 800, color: C.text,
          letterSpacing: "-0.03em", marginBottom: 4,
        }}>AXIOM</div>
        <div style={{
          fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.15em",
          marginBottom: 32, textTransform: "uppercase",
        }}>Market Intelligence Platform</div>

        <div style={{ textAlign: "left", marginBottom: 6 }}>
          <label style={{ fontSize: 12, fontFamily: MONO, color: C.textSec, letterSpacing: "0.06em" }}>
            PROVIDER ACCESS KEY
          </label>
        </div>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Optional key (server env keys recommended)"
          style={{
            width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 6, color: C.text, fontFamily: MONO, fontSize: 12, outline: "none",
            marginBottom: 12, boxSizing: "border-box",
          }}
          onFocus={(e) => e.target.style.borderColor = C.accent}
          onBlur={(e) => e.target.style.borderColor = C.border}
        />

        {error && (
          <div style={{ fontSize: 12, color: C.red, fontFamily: SANS, marginBottom: 10 }}>{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !key.trim()}
          style={{
            width: "100%", padding: "10px 0", background: loading ? C.textDim : C.accent,
            color: "#fff", border: "none", borderRadius: 6, fontFamily: MONO, fontSize: 12,
            fontWeight: 700, cursor: loading ? "wait" : "pointer", letterSpacing: "0.06em",
            marginBottom: 20, opacity: (!key.trim() && !loading) ? 0.5 : 1,
          }}
        >{loading ? "VALIDATING…" : "CONNECT"}</button>

        <div style={{
          fontSize: 12, fontFamily: SANS, color: C.textDim, lineHeight: 1.7,
          borderTop: `1px solid ${C.border}`, paddingTop: 16,
        }}>
          Configure provider keys on the server for best reliability:
          <br /><span style={{ color: C.accent, fontWeight: 600 }}>FINNHUB_API_KEY</span> and <span style={{ color: C.accent, fontWeight: 600 }}>FMP_API_KEY</span>
          <br />Yahoo remains an automatic fallback when available.
        </div>
      </div>
    </div>
  );
}

// ── Macro Tape ──
function MacroTape({ data, cryptoSnapshot }) {
  if (!data.length) return null;

  // Priority index slots matching the screenshot layout
  const SLOTS = [
    { sym: "SPY",   label: "S&P 500",        shortLabel: "S&P 500" },
    { sym: "QQQ",   label: "Nasdaq 100",      shortLabel: "Nasdaq 100" },
    { sym: "IWM",   label: "Russell 2000",    shortLabel: "Russell 2000" },
    { sym: "DIA",   label: "Dow 30",          shortLabel: "Dow 30" },
    { sym: "VIXY",  label: "Volatility",      shortLabel: "Volatility", isVix: true },
    { sym: "GLD",   label: "Gold",            shortLabel: "Gold" },
    { sym: "BNO",   label: "Brent Oil",       shortLabel: "Brent Oil (l)" },
    { sym: "USO",   label: "Crude Oil",       shortLabel: "Crude Oil" },
    { sym: "SHY",   label: "2Y Treasury",     shortLabel: "2Y Treasury" },
    { sym: "BTCUSD",label: "Bitcoin",         shortLabel: "BTC" },
  ];

  const vixyRow = data.find(q => q.symbol === "VIXY");
  const spyRow  = data.find(q => q.symbol === "SPY");
  const vixChg  = vixyRow?.changesPercentage || 0;
  const spyChg  = spyRow?.changesPercentage || 0;
  let regime, regimeColor, regimeBg;
  if (vixChg >= 3 || (vixChg >= 1 && spyChg <= -1)) {
    regime = "FEAR 🔴"; regimeColor = C.red; regimeBg = `${C.red}14`;
  } else if (vixChg <= -2 || (vixChg < 0 && spyChg >= 0.5)) {
    regime = "CALM 🟢"; regimeColor = C.green; regimeBg = `${C.green}14`;
  } else {
    regime = "NEUTRAL 🟡"; regimeColor = C.amber; regimeBg = `${C.amber}14`;
  }

  return (
    <div style={{
      display: "flex", alignItems: "stretch",
      background: C.surface, borderBottom: `1px solid ${C.border}`,
      overflowX: "auto", scrollbarWidth: "none",
      flexShrink: 0,
    }}>
      {SLOTS.map(slot => {
        const q = data.find(d => d.symbol === slot.sym);
        const chg = q?.changesPercentage || 0;
        const price = q?.price || 0;
        const isUp = chg >= 0;
        const col = slot.isVix
          ? (isUp ? C.red : C.green)
          : (isUp ? C.green : C.red);
        return (
          <div key={slot.sym} style={{
            padding: "6px 18px", display: "flex", flexDirection: "column",
            justifyContent: "center", minWidth: "fit-content",
            borderRight: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, fontWeight: 600, letterSpacing: "0.07em", marginBottom: 2, whiteSpace: "nowrap" }}>
              {slot.shortLabel}
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 14, fontFamily: MONO, color: C.text, fontWeight: 800 }}>
                {price > 0
                  ? (price >= 10000 ? price.toLocaleString(undefined, { maximumFractionDigits: 0 })
                     : price >= 1000 ? price.toLocaleString(undefined, { maximumFractionDigits: 2 })
                     : price.toFixed(2))
                  : "—"}
              </span>
              <span style={{ fontSize: 12, fontFamily: MONO, color: col, fontWeight: 700 }}>
                {price > 0 ? `${isUp ? "+" : ""}${chg.toFixed(2)}%` : "—"}
              </span>
            </div>
          </div>
        );
      })}
      {/* VIX regime badge pinned right */}
      <div style={{
        marginLeft: "auto", padding: "6px 16px", display: "flex",
        alignItems: "center", gap: 7, background: regimeBg,
        borderLeft: `1px solid ${regimeColor}33`, flexShrink: 0,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: regimeColor, flexShrink: 0, boxShadow: `0 0 7px ${regimeColor}` }} />
        <span style={{ fontFamily: MONO, fontSize: 12, color: regimeColor, fontWeight: 800, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
          VIX REGIME: {regime}
        </span>
      </div>
    </div>
  );
}

// ── Sector Heatmap ──
function SectorHeatmap({ data }) {
  if (!data.length) return <div style={{ fontSize: 12, color: C.textDim, fontFamily: MONO, padding: 16 }}>Loading sectors…</div>;
  const sorted = [...data].sort((a, b) => (b.changesPercentage || 0) - (a.changesPercentage || 0));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3 }}>
      {sorted.map(s => {
        const chg = s.changesPercentage || 0;
        const int = Math.min(Math.abs(chg) / 2.5, 1);
        const bg = chg >= 0
          ? `rgba(0,214,143,${0.06 + int * 0.22})`
          : `rgba(255,71,87,${0.06 + int * 0.22})`;
        const bdr = chg >= 0
          ? `rgba(0,214,143,${0.12 + int * 0.3})`
          : `rgba(255,71,87,${0.12 + int * 0.3})`;
        return (
          <div key={s.symbol} style={{
            background: bg, border: `1px solid ${bdr}`, borderRadius: 5,
            padding: "7px 5px", textAlign: "center",
          }}>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim }}>{s.symbol}</div>
            <div style={{
              fontSize: 13, fontFamily: MONO, fontWeight: 800,
              color: chg >= 0 ? C.green : C.red,
            }}>
              {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
            </div>
            <div style={{ fontSize: 7, fontFamily: SANS, color: C.textDim, marginTop: 1 }}>
              {s._sectorName}
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ─── Crypto liquidations widget (Monitor) ────────────────────────────────────
function CryptoLiqWidget({ C, MONO, SANS }) {
  const [data, setData] = React.useState({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      const syms = ["BTC", "ETH", "SOL"];
      const out = {};
      await Promise.all(syms.map(async s => {
        try { const r = await fetch(`/api/crypto/liquidations?symbol=${s}`); const d = await r.json(); if (d.ok) out[s] = d; } catch {}
      }));
      if (alive) { setData(out); setLoading(false); }
    };
    load();
    const t = setInterval(load, 3 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const fmt = v => v >= 1e9 ? `$${(v/1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${Math.round(v||0)}`;
  const syms = Object.keys(data);

  return (
    <div style={{ marginBottom: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: "#f59e0b", letterSpacing: "0.08em", marginBottom: 8 }}>
        💥 CRYPTO LIQUIDATIONS <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>· 24h</span>
      </div>
      {loading && syms.length === 0 && <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Loading…</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {["BTC","ETH","SOL"].map(s => {
          const d = data[s];
          if (!d) return null;
          const longs = d.liqs24h?.longs || 0;
          const shorts = d.liqs24h?.shorts || 0;
          const total = longs + shorts;
          const longPct = total > 0 ? Math.round(longs / total * 100) : 50;
          return (
            <div key={s} style={{ background: C.surface, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent }}>{s}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: (d.change24h||0) >= 0 ? C.green : C.red }}>
                  ${d.price >= 1000 ? Math.round(d.price).toLocaleString() : d.price?.toFixed(2)}
                </span>
              </div>
              {total > 0 ? (
                <>
                  <div style={{ height: 5, borderRadius: 3, overflow: "hidden", display: "flex", marginBottom: 5 }}>
                    <div style={{ width: `${longPct}%`, background: C.red }} />
                    <div style={{ width: `${100-longPct}%`, background: C.green }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10 }}>
                    <span style={{ color: C.red }}>🔴 Longs {fmt(longs)}</span>
                    <span style={{ color: C.green }}>🟢 Shorts {fmt(shorts)}</span>
                  </div>
                </>
              ) : (
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>No liquidation data</div>
              )}
              {/* Key levels */}
              {d.keyLevels && (d.keyLevels.biggestLongLiq || d.keyLevels.biggestShortLiq) && (
                <div style={{ marginTop: 5, paddingTop: 5, borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 9, color: C.textDim }}>
                  {d.keyLevels.biggestLongLiq && <div>⚠ Long liq zone: ${Math.round(d.keyLevels.biggestLongLiq.price).toLocaleString()}</div>}
                  {d.keyLevels.biggestShortLiq && <div>⚠ Short liq zone: ${Math.round(d.keyLevels.biggestShortLiq.price).toLocaleString()}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 6 }}>
        💡 Big long liquidations = forced selling (price crashed). Big shorts = forced buying (squeeze up).
      </div>
    </div>
  );
}








// ─── Scrolling news ticker strip (Monitor top area) ─────────────────────────
function NewsTicker({ C, MONO }) {
  const [items, setItems] = React.useState([]);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/finviz/news?limit=40")
        .then(r => r.json())
        .then(d => { if (alive) setItems(d.items || []); })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 120000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!items.length) return null;

  // Build ticker text: "TICKER  Headline  ·  ..."
  const tickerText = items.map(n => {
    const sym = n.tickers && n.tickers.length > 0 ? n.tickers[0] + "  " : "";
    return sym + n.title;
  }).join("   ·   ");

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        marginBottom: 8, background: C.surface,
        border: `1px solid ${C.border}`, borderRadius: 8,
        overflow: "hidden", position: "relative",
        display: "flex", alignItems: "center",
        height: 34,
      }}
    >
      {/* Label */}
      <div style={{
        flexShrink: 0, padding: "0 10px",
        fontFamily: MONO, fontSize: 10, fontWeight: 900,
        color: C.accent, letterSpacing: "0.08em",
        borderRight: `1px solid ${C.border}`,
        height: "100%", display: "flex", alignItems: "center",
        background: C.card, zIndex: 2,
      }}>📰 NEWS</div>

      {/* Scrolling area */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <div style={{
          display: "inline-block",
          whiteSpace: "nowrap",
          fontFamily: MONO, fontSize: 11, color: C.textSec,
          animation: paused ? "none" : "tickerScroll 240s linear infinite",
          paddingLeft: "100%",
        }}>
          {tickerText}
        </div>
      </div>

      {/* Pause indicator */}
      {paused && (
        <div style={{
          position: "absolute", right: 8,
          fontFamily: MONO, fontSize: 9, color: C.textDim,
          background: C.surface, padding: "0 4px",
        }}>⏸ hover</div>
      )}

      <style>{`
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}

// ─── Finviz News Card — live market news scraped from finviz.com/news.ashx ───
function FinvizNewsCard({ C, MONO }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState(null);

  const [meta, setMeta] = useState({ source: "", ageMin: null });

  const load = (force) => {
    if (!force) setLoading(true);
    fetch(`/api/finviz/news?limit=40${force ? "&refresh=1" : ""}`)
      .then(r => r.json())
      .then(d => {
        setItems(d.items || []);
        setMeta({ source: d.source || "", ageMin: d.ageMin });
        setTs(new Date());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load(false);
    const t = setInterval(() => load(false), 5 * 60 * 1000); // poll every 5 min
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, overflowY: "auto", maxHeight: 440 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em" }}>
          📰 MARKET NEWS
          {meta.source && <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginLeft: 6 }}>via {meta.source}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {meta.ageMin !== null && <span style={{ fontFamily: MONO, fontSize: 9, color: meta.ageMin <= 5 ? C.green : C.textDim }}>{meta.ageMin}m ago</span>}
          {ts && <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{ts.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
          <button onClick={() => load(true)}
            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.accent, fontFamily: MONO, fontSize: 10, cursor: "pointer", padding: "2px 6px" }}>↻</button>
        </div>
      </div>
      {loading && <div style={{ fontSize: 12, color: C.textDim }}>Loading…</div>}
      {!loading && items.length === 0 && (
        <div style={{ fontSize: 12, color: C.textDim }}>Fetching headlines — check back in 30 seconds…</div>
      )}
      {items.map((n, i) => (
        <a key={i} href={n.url} target="_blank" rel="noreferrer"
          style={{ display: "block", textDecoration: "none", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700 }}>
              {n.tickers && n.tickers.length > 0 ? n.tickers.slice(0, 3).join(" · ") : n.source || "MKT"}
            </span>
            {n.time && <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{n.time}</span>}
          </div>
          <div style={{ fontSize: 12, color: C.text, fontWeight: 600, lineHeight: 1.4 }}>{n.title}</div>
          {n.source && n.tickers && n.tickers.length > 0 && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 1 }}>{n.source}</div>
          )}
        </a>
      ))}
    </div>
  );
}

// ─── SecFilingsTab ───────────────────────────────────────────────────────────
function SecFilingsTab({ C, MONO, SANS, watchlistSymbols }) {
  const [symbol, setSymbol] = useState(watchlistSymbols?.[0] || "AAPL");
  const [input, setInput] = useState(watchlistSymbols?.[0] || "AAPL");
  const [filings, setFilings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (sym) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/market/sec?symbol=${encodeURIComponent(sym)}`);
      const d = await r.json();
      setFilings(d.filings || []);
      if (!d.filings?.length) setError("No recent filings found for " + sym);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(symbol); }, [symbol]);

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" };
  const typeColor = (t) => {
    if (t === "4") return C.amber;
    if (t === "8-K") return C.accent;
    if (t?.startsWith("13F")) return C.purple;
    return C.textDim;
  };

  return (
    <div style={{ padding: "0 0 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>SEC FILINGS</span>
        <div style={{ display: "flex", gap: 0, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
          <input value={input} onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") { setSymbol(input); } }}
            placeholder="AAPL"
            style={{ width: 80, background: C.surface, border: "none", color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 10px", outline: "none" }} />
          <button onClick={() => setSymbol(input)}
            style={{ background: C.accent, border: "none", color: "#fff", fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>GO</button>
        </div>
        {/* Quick watchlist buttons */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(watchlistSymbols || []).slice(0, 12).map(s => (
            <button key={s} onClick={() => { setSymbol(s); setInput(s); }}
              style={{ fontFamily: MONO, fontSize: 12, color: symbol === s ? C.accent : C.textDim,
                background: symbol === s ? C.accentGlow : "transparent",
                border: `1px solid ${symbol === s ? C.accent : C.border}`,
                borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>{s}</button>
          ))}
        </div>
        {loading && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⟳ Loading…</span>}
      </div>

      <div style={card}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>RECENT FILINGS — {symbol}</span>
          <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${symbol}&CIK=&type=&dateb=&owner=include&count=40&search_text=`}
            target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: MONO, fontSize: 12, color: C.accent, textDecoration: "none" }}>
            EDGAR →
          </a>
        </div>
        {error && !filings.length ? (
          <div style={{ padding: 30, textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>
            {error}
            <div style={{ marginTop: 10 }}>
              <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbol}&type=8-K&dateb=&owner=include&count=10`}
                target="_blank" rel="noopener noreferrer"
                style={{ color: C.accent, fontFamily: MONO, fontSize: 12 }}>
                View on SEC EDGAR →
              </a>
            </div>
          </div>
        ) : filings.length === 0 && !loading ? (
          <div style={{ padding: 30, textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>No filings found</div>
        ) : filings.map((f, i) => (
          <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, textDecoration: "none", background: "transparent", transition: "background 0.12s" }}
            onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: typeColor(f.type), minWidth: 48 }}>{f.type}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, minWidth: 90 }}>{f.date}</span>
            <span style={{ fontFamily: SANS, fontSize: 13, color: C.text, flex: 1 }}>{f.entity || f.desc || "—"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.accent }}>→</span>
          </a>
        ))}
      </div>

      <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center" }}>
        Form 4 = insider transactions · 8-K = material events · 13F = institutional holdings · Source: SEC EDGAR
      </div>
    </div>
  );
}



// ── GREEN LIGHT BACKTEST — does the 5/5 signal actually make money? ──
async function glFetchCandles(sym) {
  try {
    const d = await fetch(`/api/market/chart?symbol=${sym}&interval=1d&range=1y`).then(r => r.json());
    const res = d?.chart?.result?.[0];
    const q = res?.indicators?.quote?.[0];
    if (!q || !res?.timestamp) return null;
    const ts = res.timestamp, close = q.close, high = q.high, low = q.low, vol = q.volume;
    if (!close || close.length < 210) return null;
    return { ts, close, high, low, vol };
  } catch { return null; }
}
function glAvg(arr, a, b) { let s = 0, n = 0; for (let i = a; i <= b; i++) { if (arr[i] > 0) { s += arr[i]; n++; } } return n ? s / n : 0; }
function glSimulate(sym, c, spyMap, threshold, trades, spyTrendMap) {
  const { ts, close, high, low, vol } = c, n = close.length;
  const k = 2 / 22; const ema21 = [close[0]]; for (let i = 1; i < n; i++) ema21[i] = close[i] * k + ema21[i - 1] * (1 - k);
  let open = null;
  for (let i = 200; i < n; i++) {
    const px = close[i]; if (!(px > 0)) continue;
    const ma50 = glAvg(close, i - 49, i), ma200 = glAvg(close, i - 199, i);
    let g = 0, l = 0; for (let j = i - 13; j <= i; j++) { const dd = close[j] - close[j - 1]; dd > 0 ? g += dd : l += -dd; }
    const rsi = l === 0 ? 100 : 100 - 100 / (1 + (g / 14) / (l / 14));
    const av = glAvg(vol, i - 19, i), rvol = av > 0 ? vol[i] / av : 1;
    let tr = 0; for (let j = i - 13; j <= i; j++) tr += Math.max(high[j] - low[j], Math.abs(high[j] - close[j - 1]), Math.abs(low[j] - close[j - 1]));
    const atr = tr / 14;
    const spy = spyMap[ts[i]] ?? 0;
    if (open) {
      // Trailing stop: let winners RUN. Ratchet the stop up to 2.5×ATR below the high, never down.
      open.hwm = Math.max(open.hwm, px);
      const trail = open.hwm - atr * 2.5;
      if (trail > open.stop) open.stop = trail;
      if (px <= open.stop) {
        const r = open.risk > 0 ? (px - open.entry) / open.risk : 0;
        trades.push({ sym, score: open.score, r, ret: (px - open.entry) / open.entry, exitTs: ts[i], regime: open.regime });
        open = null;
      }
    }
    if (!open) {
      const dev = ema21[i] > 0 ? (px - ema21[i]) / ema21[i] : 1;
      const checks = [ spy > -0.5, ma50 > 0 && px > ma50 && ma50 > ma200, rsi >= 50, rvol >= 1.2, ema21[i] > 0 && dev <= 0.08 && dev >= -0.06 ];
      const passed = checks.filter(Boolean).length;
      if (passed >= threshold && atr > 0) open = { entry: px, stop: px - atr * 1.5, risk: atr * 1.5, hwm: px, score: passed, regime: (spyTrendMap && spyTrendMap[ts[i]]) || "BULL" };
    }
  }
}

function GLBacktestTab({ C, MONO, SANS, watchlistSymbols }) {
  const [threshold, setThreshold] = useState(5);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const run = async () => {
    setRunning(true); setResult(null);
    const spy = await glFetchCandles("SPY");
    const spyMap = {}, spyTrendMap = {};
    if (spy) {
      for (let i = 1; i < spy.close.length; i++) if (spy.close[i - 1] > 0) spyMap[spy.ts[i]] = (spy.close[i] - spy.close[i - 1]) / spy.close[i - 1] * 100;
      // Regime per day: SPY above its 50-day MA = BULL, below = BEAR.
      for (let i = 50; i < spy.close.length; i++) { const ma = glAvg(spy.close, i - 49, i); spyTrendMap[spy.ts[i]] = spy.close[i] >= ma ? "BULL" : "BEAR"; }
    }
    const skip = new Set(["SPY","QQQ","IWM","XLK","XLE","XLF","GLD","SMH","ARKK","DIA"]);
    const syms = (watchlistSymbols || []).filter(s => !skip.has(s)).slice(0, 40);
    const trades = [];
    for (let i = 0; i < syms.length; i++) {
      setProgress(`Testing ${syms[i]} (${i + 1}/${syms.length})…`);
      const c = await glFetchCandles(syms[i]);
      if (c) glSimulate(syms[i], c, spyMap, threshold, trades, spyTrendMap);
    }
    const nT = trades.length;
    const wins = trades.filter(t => t.r > 0), losses = trades.filter(t => t.r <= 0);
    const winRate = nT ? wins.length / nT * 100 : 0;
    const avgR = nT ? trades.reduce((s, t) => s + t.r, 0) / nT : 0;
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.r, 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.r, 0) / losses.length) : 0;
    const pf = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : (wins.length ? 99 : 0);
    const byScore = sc => { const set = trades.filter(t => t.score === sc); if (!set.length) return null; const w = set.filter(t => t.r > 0).length; return { n: set.length, wr: Math.round(w / set.length * 100), avgR: set.reduce((s, t) => s + t.r, 0) / set.length }; };
    // Max drawdown of the cumulative-R equity curve (trades in exit order).
    const chrono = [...trades].sort((a, b) => (a.exitTs || 0) - (b.exitTs || 0));
    let cum = 0, peak = 0, maxDD = 0;
    for (const t of chrono) { cum += t.r; peak = Math.max(peak, cum); maxDD = Math.max(maxDD, peak - cum); }
    const byRegime = rg => { const set = trades.filter(t => t.regime === rg); if (!set.length) return null; const w = set.filter(t => t.r > 0).length; return { n: set.length, wr: Math.round(w / set.length * 100), avgR: set.reduce((s, t) => s + t.r, 0) / set.length }; };
    setResult({ nT, winRate, avgR, avgWin, avgLoss, pf, s4: byScore(4), s5: byScore(5), maxDD, bull: byRegime("BULL"), bear: byRegime("BEAR") });
    setRunning(false); setProgress("");
  };
  const verdict = result ? (result.avgR >= 0.2 && result.pf >= 1.3 ? { t: "✅ EDGE LOOKS REAL — worth trading", c: C.green } : result.avgR > 0 ? { t: "🟡 MARGINAL — small edge, needs more data", c: C.amber } : { t: "🔴 NO EDGE — this signal lost money historically", c: C.red }) : null;
  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", textAlign: "center", flex: 1, minWidth: 110 };
  return (
    <div style={{ padding: "16px 20px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 4 }}>🔬 GREEN LIGHT BACKTEST</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginBottom: 14 }}>
        Tests the exact 5-check signal on the past year of real data across your watchlist — entries, ATR stops, trend exits — to answer the only question that matters: <b>does it make money?</b>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>BUY:</span>
        {[[5, "5/5 only"], [4, "4/5+"]].map(([n, l]) => (
          <button key={n} onClick={() => setThreshold(n)} style={{ background: threshold === n ? "#7c3aed" : C.surface, color: threshold === n ? "#fff" : C.textSec, border: `1px solid ${threshold === n ? "#7c3aed" : C.border}`, borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 11px", cursor: "pointer" }}>{l}</button>
        ))}
        <button onClick={run} disabled={running} style={{ background: running ? C.surface : C.green, color: running ? C.textDim : "#fff", border: "none", borderRadius: 7, fontFamily: MONO, fontSize: 13, fontWeight: 800, padding: "8px 18px", cursor: running ? "default" : "pointer", marginLeft: "auto" }}>
          {running ? "⏳ running…" : "▶ RUN BACKTEST"}
        </button>
      </div>
      {running && <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, marginBottom: 12 }}>{progress}</div>}
      {result && (
        <>
          <div style={{ background: `${verdict.c}12`, border: `1px solid ${verdict.c}55`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontFamily: MONO, fontSize: 14, fontWeight: 900, color: verdict.c, textAlign: "center" }}>{verdict.t}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={card}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>TRADES</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>{result.nT}</div></div>
            <div style={card}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>WIN RATE</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: result.winRate >= 50 ? C.green : C.amber }}>{result.winRate.toFixed(0)}%</div></div>
            <div style={card}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>AVG R/TRADE</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: result.avgR >= 0 ? C.green : C.red }}>{result.avgR >= 0 ? "+" : ""}{result.avgR.toFixed(2)}R</div></div>
            <div style={card}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>PROFIT FACTOR</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: result.pf >= 1.3 ? C.green : result.pf >= 1 ? C.amber : C.red }}>{result.pf.toFixed(2)}</div></div>
            <div style={card}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>MAX DRAWDOWN</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: result.maxDD <= 5 ? C.green : result.maxDD <= 10 ? C.amber : C.red }}>−{result.maxDD.toFixed(1)}R</div></div>
          </div>
          {/* Performance by market regime */}
          {(result.bull || result.bear) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ ...card, textAlign: "left", borderLeft: `3px solid ${C.green}` }}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>🟢 BULL REGIME (SPY &gt; 50MA)</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{result.bull ? `${result.bull.n} trades · ${result.bull.wr}% · ${result.bull.avgR >= 0 ? "+" : ""}${result.bull.avgR.toFixed(2)}R` : "—"}</div></div>
              <div style={{ ...card, textAlign: "left", borderLeft: `3px solid ${C.red}` }}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>🔴 BEAR REGIME (SPY &lt; 50MA)</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{result.bear ? `${result.bear.n} trades · ${result.bear.wr}% · ${result.bear.avgR >= 0 ? "+" : ""}${result.bear.avgR.toFixed(2)}R` : "—"}</div></div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ ...card, textAlign: "left" }}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>AVG WIN / LOSS</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.text }}><span style={{ color: C.green }}>+{result.avgWin.toFixed(2)}R</span> / <span style={{ color: C.red }}>−{result.avgLoss.toFixed(2)}R</span></div></div>
            {result.s5 && <div style={{ ...card, textAlign: "left" }}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>5/5 SETUPS</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{result.s5.n} trades · {result.s5.wr}% · {result.s5.avgR >= 0 ? "+" : ""}{result.s5.avgR.toFixed(2)}R</div></div>}
            {result.s4 && <div style={{ ...card, textAlign: "left" }}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>4/5 SETUPS</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{result.s4.n} trades · {result.s4.wr}% · {result.s4.avgR >= 0 ? "+" : ""}{result.s4.avgR.toFixed(2)}R</div></div>}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
            📖 <b>Reading it:</b> <b>Avg R ≥ +0.2</b> and <b>profit factor ≥ 1.3</b> = a real edge worth trading. Profit factor &lt; 1 = it lost money. Compare 5/5 vs 4/5 — if 5/5's avg R is clearly higher, stay strict. <b>Max drawdown</b> = worst peak-to-trough losing run (in R) — smaller is safer. <b>By regime</b>: it should make most of its money in the BULL regime and lose far less in BEAR — that's the proof your market filter (trade only when green) actually matters. <br/>
            ⚠️ Backtest = approximation (no slippage/spread, daily closes, ~1 year). It's a sanity check, not a guarantee. A good backtest + weeks of paper = real confidence.
          </div>
        </>
      )}
    </div>
  );
}

// ── 📧 Lead Responder — paste a CarGurus lead → AI drafts the dealer reply ──
function LeadResponderTab({ C, MONO, SANS }) {
  const [lead, setLead] = useState("");
  const [out, setOut] = useState(null);   // null | "loading" | {subject,body,...} | {error}
  const [copied, setCopied] = useState("");
  const gen = () => {
    if (!lead.trim()) { setOut({ error: "Paste the CarGurus lead email first." }); return; }
    setOut("loading");
    fetch("/api/market/lead-reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: lead }) })
      .then(r => r.json()).then(d => setOut(d && d.ok ? d : { error: (d && d.error) || "no response" })).catch(e => setOut({ error: e.message }));
  };
  const copy = (txt, what) => { navigator.clipboard?.writeText(txt); setCopied(what); setTimeout(() => setCopied(""), 1500); };
  const inp = { fontFamily: SANS, fontSize: 13, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, outline: "none", width: "100%" };
  const ok = out && typeof out === "object" && !out.error && out !== "loading";
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 20px" }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 4 }}>📧 LEAD RESPONDER</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginBottom: 14 }}>Paste a CarGurus (or any) lead email — Claude pulls out the customer & vehicle and writes the ready-to-send reply in your template.</div>
      <textarea value={lead} onChange={e => setLead(e.target.value)} rows={8} style={{ ...inp, fontFamily: MONO, fontSize: 12, resize: "vertical" }} placeholder="Paste the full CarGurus lead email here…" />
      <button onClick={gen} disabled={out === "loading"} style={{ marginTop: 10, fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "11px 24px", borderRadius: 9, cursor: "pointer", border: "none", background: C.accent, color: "#fff" }}>
        {out === "loading" ? "✍️ drafting reply…" : "✍️ DRAFT REPLY"}
      </button>
      {out && out.error && <div style={{ fontFamily: SANS, fontSize: 13, color: C.amber, marginTop: 14 }}>{out.error}</div>}
      {ok && (
        <div style={{ marginTop: 16 }}>
          {(out.customerEmail || out.customerPhone || out.vehicle) && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12, fontFamily: MONO, fontSize: 12, color: C.textSec }}>
              {out.firstName && <span>👤 {out.firstName}</span>}
              {out.customerEmail && <span>✉️ {out.customerEmail}</span>}
              {out.customerPhone && <span>📞 {out.customerPhone}</span>}
              {out.vehicle && <span>🚗 {out.vehicle}{out.price ? ` · $${out.price}` : ""}</span>}
            </div>
          )}
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>SUBJECT</div>
          <div style={{ ...inp, marginBottom: 10 }}>{out.subject}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>REPLY</div>
          <div style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.6, whiteSpace: "pre-line", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>{out.body}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => copy(out.body, "reply")} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 14px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.accent}`, background: `${C.accent}18`, color: C.accent }}>📋 Copy reply</button>
            {out.customerEmail && <a href={`mailto:${out.customerEmail}?subject=${encodeURIComponent(out.subject || "")}&body=${encodeURIComponent(out.body || "")}`} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 14px", borderRadius: 8, textDecoration: "none", border: `1px solid ${C.green}`, background: `${C.green}18`, color: C.green }}>✉️ Open in email →</a>}
            {copied && <span style={{ fontFamily: SANS, fontSize: 12, color: C.green, alignSelf: "center" }}>✓ copied {copied}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ✈️ Flight Finder — AI finds cheap flights + the best dates to fly/book ──
function FlightFinderTab({ C, MONO, SANS }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [when, setWhen] = useState("");
  const [roundTrip, setRoundTrip] = useState(true);
  const [flexible, setFlexible] = useState(true);
  const [out, setOut] = useState(null);
  const find = () => {
    if (!from.trim() || !to.trim()) { setOut({ error: "Enter where you're flying from and to." }); return; }
    setOut("loading");
    fetch("/api/market/flight-find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to, when, roundTrip, flexible }) })
      .then(r => r.json()).then(d => setOut(d && d.ok ? d.flights : { error: (d && d.error) || "no response" })).catch(e => setOut({ error: e.message }));
  };
  const inp = { fontFamily: SANS, fontSize: 14, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, outline: "none", width: "100%" };
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 20px" }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 4 }}>✈️ FLIGHT FINDER</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginBottom: 16 }}>Tell me where and roughly when — Claude searches live for the cheapest flights AND the best dates to fly and book.</div>
      <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>FROM</div><input value={from} onChange={e => setFrom(e.target.value)} style={inp} placeholder="City or airport (e.g. New York / JFK)" /></div>
          <div style={{ flex: "1 1 200px" }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>TO</div><input value={to} onChange={e => setTo(e.target.value)} style={inp} placeholder="City or airport (e.g. Dubai / DXB)" /></div>
        </div>
        <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>WHEN (optional — month, dates, "next month")</div><input value={when} onChange={e => setWhen(e.target.value)} style={inp} placeholder="e.g. mid-January, or Jan 14–21" /></div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {[["Round-trip", roundTrip, () => setRoundTrip(true)], ["One-way", !roundTrip, () => setRoundTrip(false)]].map(([lbl, on, fn]) => (
            <button key={lbl} onClick={fn} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 7, cursor: "pointer", border: `1px solid ${on ? C.accent : C.border}`, background: on ? `${C.accent}14` : C.card, color: on ? C.accent : C.textSec }}>{lbl}</button>
          ))}
          <button onClick={() => setFlexible(f => !f)} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 7, cursor: "pointer", border: `1px solid ${flexible ? C.green : C.border}`, background: flexible ? `${C.green}14` : C.card, color: flexible ? C.green : C.textSec }}>{flexible ? "📅 Flexible dates ✓" : "📅 Fixed dates"}</button>
        </div>
      </div>
      <button onClick={find} disabled={out === "loading"} style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "11px 24px", borderRadius: 9, cursor: "pointer", border: "none", background: C.accent, color: "#fff" }}>
        {out === "loading" ? "🔎 searching flights…" : "🔎 FIND CHEAP FLIGHTS"}
      </button>
      {out && out.error && <div style={{ fontFamily: SANS, fontSize: 13, color: C.amber, marginTop: 14 }}>{out.error}</div>}
      {typeof out === "string" && out !== "loading" && (
        <div style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.7, whiteSpace: "pre-line", marginTop: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
          {out.split(/(https?:\/\/[^\s)]+)/g).map((part, i) => /^https?:\/\//.test(part)
            ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: C.accent, wordBreak: "break-all" }}>{part}</a> : part)}
        </div>
      )}
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 12 }}>Prices are pulled live and change fast — always confirm on the booking site before purchasing.</div>
    </div>
  );
}

// ── 🛒 Deal Finder — AI searches the live web for the best deal on anything ──
function DealFinderTab({ C, MONO, SANS }) {
  const [query, setQuery] = useState("laptop");
  const [budget, setBudget] = useState("600");
  const [use, setUse] = useState("everyday use — browsing, video, light work");
  const [out, setOut] = useState(null);  // null | "loading" | text | {error}
  const find = () => {
    setOut("loading");
    fetch("/api/market/deal-find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, budget, useCase: use }) })
      .then(r => r.json()).then(d => setOut(d && d.ok ? d.deals : { error: (d && d.error) || "no response" })).catch(e => setOut({ error: e.message }));
  };
  const presets = [["💻 Laptop", "laptop"], ["📱 Phone", "phone"], ["🎧 Headphones", "headphones"], ["📺 TV", "TV"], ["⌚ Smartwatch", "smartwatch"], ["🎮 Console", "game console"]];
  const inp = { fontFamily: SANS, fontSize: 14, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, outline: "none", width: "100%" };
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 20px" }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 4 }}>🛒 DEAL FINDER</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginBottom: 16 }}>Tell me what you want and your budget — Claude searches the live web for the best current deals: cheapest, good quality, best value.</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {presets.map(([lbl, q]) => (
          <button key={q} onClick={() => setQuery(q)} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, padding: "6px 11px", borderRadius: 7, cursor: "pointer", border: `1px solid ${query === q ? C.accent : C.border}`, background: query === q ? `${C.accent}14` : C.card, color: query === q ? C.accent : C.textSec }}>{lbl}</button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
        <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>WHAT ARE YOU LOOKING FOR?</div><input value={query} onChange={e => setQuery(e.target.value)} style={inp} placeholder="e.g. laptop, gaming laptop, 4K TV…" /></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px" }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>BUDGET ($)</div><input value={budget} onChange={e => setBudget(e.target.value)} type="number" style={inp} placeholder="600" /></div>
          <div style={{ flex: "3 1 300px" }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>WHAT FOR? (optional)</div><input value={use} onChange={e => setUse(e.target.value)} style={inp} placeholder="gaming, school, video editing…" /></div>
        </div>
      </div>
      <button onClick={find} disabled={out === "loading"} style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "11px 24px", borderRadius: 9, cursor: "pointer", border: "none", background: C.accent, color: "#fff" }}>
        {out === "loading" ? "🔎 searching the web…" : "🔎 FIND ME A DEAL"}
      </button>
      {out && out.error && <div style={{ fontFamily: SANS, fontSize: 13, color: C.amber, marginTop: 14 }}>Couldn't search — {out.error}</div>}
      {typeof out === "string" && out !== "loading" && (
        <div style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.7, whiteSpace: "pre-line", marginTop: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
          {out.split(/(https?:\/\/[^\s)]+)/g).map((part, i) => /^https?:\/\//.test(part)
            ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: C.accent, wordBreak: "break-all" }}>{part}</a>
            : part)}
        </div>
      )}
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 12 }}>Prices are pulled live from the web and can change — always verify on the retailer's site before buying.</div>
    </div>
  );
}


// ── Squeeze Screener ─────────────────────────────────────────────────────────
function MarketOutlookTab({ C, MONO, SANS }) {
  const [d, setD] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const load = React.useCallback(() => {
    setLoading(true); setErr(null);
    fetch("/api/market/outlook").then(r => r.json())
      .then(x => { if (x.error) { setErr(x.error); setD(null); } else setD(x); })
      .catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const leanCol = !d ? C.textDim : d.lean === "BULLISH" ? C.green : d.lean === "BEARISH" ? C.red : "#d6a312";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>🧭 30-DAY MARKET OUTLOOK</div>
        <button onClick={load} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "6px 14px", borderRadius: 6, border: `1px solid ${C.accent}`, background: `${C.accent}18`, color: C.accent, cursor: "pointer" }}>{loading ? "…" : "↻ Refresh"}</button>
        <div style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 11, color: C.textDim }}>Composite of trend · breadth · vol · seasonality · Fed odds</div>
      </div>
      {err && <div style={{ color: C.red, fontFamily: SANS, fontSize: 13 }}>Could not load: {err}</div>}
      {!d && !err && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>Computing outlook…</div>}

      {d && (<>
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14 }}>
          {/* Lean + range */}
          <div style={{ background: C.bg, border: `1px solid ${leanCol}55`, borderRadius: 12, padding: 18, textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 900, color: leanCol }}>{d.lean}</div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>next ~30 days · {d.confidence}% conviction</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 4 }}>composite {d.composite > 0 ? "+" : ""}{d.composite}</div>
            <div style={{ borderTop: `1px solid ${C.border}`, margin: "14px 0", paddingTop: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>SPY {d.spy}</div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, margin: "2px 0 8px" }}>expected 30-day move ±{d.range.expectedMovePct}%</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.green }}>68%: {d.range.low1} – {d.range.high1}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 2 }}>95%: {d.range.low2} – {d.range.high2}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-around", fontFamily: MONO, fontSize: 11 }}>
              <div><div style={{ color: C.textDim }}>VIX</div><div style={{ color: C.text, fontWeight: 700 }}>{d.vix ?? "—"}</div></div>
              <div><div style={{ color: C.textDim }}>Breadth</div><div style={{ color: C.text, fontWeight: 700 }}>{d.breadthPct ?? "—"}%</div></div>
              <div><div style={{ color: C.textDim }}>Season</div><div style={{ color: C.text, fontWeight: 700 }}>{d.seasonality >= 0 ? "+" : ""}{d.seasonality ?? "—"}%</div></div>
            </div>
          </div>

          {/* Signal breakdown */}
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>What's driving the read</div>
            {d.signals.map(s => { const pos = s.score >= 0; const w = Math.min(50, Math.abs(s.score) / 25 * 50);
              return (
                <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", fontFamily: MONO, fontSize: 12 }}>
                  <div style={{ width: 110, color: C.text }}>{s.name}</div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", position: "relative", height: 14 }}>
                    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.border }} />
                    <div style={{ position: "absolute", left: pos ? "50%" : `calc(50% - ${w}%)`, width: w + "%", height: 10, top: 2, borderRadius: 3, background: pos ? C.green : C.red, opacity: .85 }} />
                  </div>
                  <div style={{ width: 52, textAlign: "right", color: pos ? C.green : C.red, fontWeight: 700 }}>{pos ? "+" : ""}{s.score}</div>
                  <div style={{ width: 240, color: C.textDim, fontFamily: SANS, fontSize: 11 }}>{s.detail}</div>
                </div>
              ); })}
          </div>
        </div>

        {/* Prediction markets */}
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 8 }}>🔮 Prediction markets <span style={{ color: C.textDim, fontWeight: 400, fontSize: 11 }}>(Polymarket — what the crowd is pricing)</span></div>
          {d.predictionMarkets.fed ? (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontFamily: MONO, fontSize: 13 }}>
              <div style={{ color: C.textDim, fontSize: 12 }}>Next FOMC ({d.predictionMarkets.fed.meeting}):</div>
              <div><b style={{ color: C.green }}>CUT {d.predictionMarkets.fed.cut}%</b></div>
              <div><b style={{ color: "#d6a312" }}>HOLD {d.predictionMarkets.fed.hold}%</b></div>
              <div><b style={{ color: C.red }}>HIKE {d.predictionMarkets.fed.hike}%</b></div>
              {d.predictionMarkets.recession && <div style={{ color: C.textDim }}>· Recession odds <b style={{ color: C.text }}>{d.predictionMarkets.recession.prob}%</b></div>}
            </div>
          ) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Prediction-market data unavailable right now.</div>}
        </div>

        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, lineHeight: 1.5 }}>
          ⚠ {d.note} The lean is a weighted snapshot of current conditions; the range is a statistical 1σ/2σ band from realized volatility — both shift as conditions change. Not financial advice.</div>
      </>)}
    </div>
  );
}


export default function App() {
  // First-run defaults: route autopilot to the Alpaca paper account and turn it ON.
  // Only sets when unset, so it never overrides a choice you've made. (Paper only — no real money.)
  useState(() => {
    if (typeof window === "undefined") return null;
    if (localStorage.getItem("axiom_autopilot_broker") == null) localStorage.setItem("axiom_autopilot_broker", "alpaca");
    if (localStorage.getItem("axiom_autopilot") == null) localStorage.setItem("axiom_autopilot", "on");
    // Conservative shorts on by default: strong bear setups only, half size, max 2/day.
    if (localStorage.getItem("axiom_autopilot_short") == null) localStorage.setItem("axiom_autopilot_short", "on");
    if (localStorage.getItem("axiom_autopilot_maxshorts") == null) localStorage.setItem("axiom_autopilot_maxshorts", "2");
    return null;
  });
  const [appUnlocked, setAppUnlocked] = useState(true);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768 && window.innerWidth <= 1100);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  useEffect(() => {
    const fn = () => { setIsMobile(window.innerWidth < 768); setIsTablet(window.innerWidth >= 768 && window.innerWidth <= 1100); };
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  // Size everything off the REAL Alpaca paper account: pull live equity → axiom_acct_size
  // so every position-size calc across the app uses your actual balance, not a manual number.
  useEffect(() => {
    const sync = () => fetch("/api/alpaca/account").then(r => r.json()).then(d => {
      if (d?.ok && d.account && Number(d.account.equity) > 0) {
        localStorage.setItem("axiom_acct_size", String(Math.round(Number(d.account.equity))));
        localStorage.setItem("axiom_alpaca_bp", String(Math.round(Number(d.account.buyingPower) || 0)));
        localStorage.setItem("axiom_acct_source", "alpaca");
      }
    }).catch(() => {});
    sync();
    const iv = setInterval(sync, 5 * 60_000);
    return () => clearInterval(iv);
  }, []);
  const [unlockInput, setUnlockInput] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [apiKey, setApiKey] = useState("YAHOO_LOCAL");
  const [watchlistSymbols, setWatchlistSymbols] = useState(WATCHLIST_SYMBOLS);
  const [watchlistInput, setWatchlistInput] = useState(WATCHLIST_SYMBOLS.join(","));
  // Multiple named watchlists — active list drives watchlistSymbols
  const [watchlists, setWatchlists] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ax_watchlists") || "null");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {}
    return [{ id: "main", name: "Main", symbols: WATCHLIST_SYMBOLS }];
  });
  const [activeWlistId, setActiveWlistId] = useState("main");
  const [wlistRenaming, setWlistRenaming] = useState(null); // id being renamed
  const [wlistRenameVal, setWlistRenameVal] = useState("");
  const [wlSearchQuery, setWlSearchQuery] = useState("");
  const [wlSearchFocused, setWlSearchFocused] = useState(false);
  const [watchlistNotes, setWatchlistNotes] = useState(() => { try { return JSON.parse(localStorage.getItem("ax_wl_notes") || "{}"); } catch { return {}; } });
  const [openNoteSymbol, setOpenNoteSymbol] = useState(null);
  const [openAlertSymbol, setOpenAlertSymbol] = useState(null);
  const [wlAlertPrice, setWlAlertPrice] = useState("");
  const [wlAlertDir, setWlAlertDir] = useState("above");
  const [customAlertSymbol, setCustomAlertSymbol] = useState("");
  const [customAlertMin, setCustomAlertMin] = useState("70");
  const [customAlerts, setCustomAlerts] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [pageZoom, setPageZoom] = useState(() => Number(localStorage.getItem("axiom_page_zoom")) || 1);
  const cycleZoom = () => { const next = pageZoom >= 1.5 ? 1 : pageZoom >= 1.25 ? 1.5 : pageZoom >= 1 ? 1.25 : 1; setPageZoom(next); localStorage.setItem("axiom_page_zoom", String(next)); };
  const [providerKeys, setProviderKeys] = useState(DEFAULT_SETTINGS.providerKeys);
  const [flowFilters, setFlowFilters] = useState(DEFAULT_SETTINGS.flowFilters);
  const [riskAccount, setRiskAccount] = useState(() => {
    try {
      const saved = localStorage.getItem("risk_account");
      // Migrate old $100,000 default → $10,000
      if (!saved || saved === "100000") {
        localStorage.setItem("risk_account", "10000");
        return "10000";
      }
      return saved;
    } catch { return "10000"; }
  });
  const [riskPct, setRiskPct] = useState("1");
  // Daily Max Loss Lock
  const [dailyMaxLoss, setDailyMaxLoss] = useState(() => { try { return localStorage.getItem("daily_max_loss") || "200"; } catch { return "200"; } });
  const [lockEnabled,  setLockEnabled]  = useState(() => { try { return localStorage.getItem("lock_enabled") === "true"; } catch { return false; } }); // OFF by default
  const [tradingLocked, setTradingLocked] = useState(false);
  // ── Tilt Detector ─────────────────────────────────────────────────────────
  const [tiltStreak,    setTiltStreak]    = useState(0);   // consecutive losses today
  const [tiltLocked,    setTiltLocked]    = useState(false);
  const [tiltUnlockAt,  setTiltUnlockAt]  = useState(null); // Date object
  const [tiltEnabled,   setTiltEnabled]   = useState(() => { try { return localStorage.getItem("tilt_enabled") !== "false"; } catch { return true; } });
  const [lockReason,   setLockReason]   = useState("");
  const [activeLesson, setActiveLesson] = useState(null); // Academy tab
  // Earnings Cal, Econ Cal, Journal Analytics — hoisted (were inside conditional IIFEs)
  const [ecData,   setEcData]   = useState(null);
  const [ecLoad,   setEcLoad]   = useState(false);
  const [evData,   setEvData]   = useState(null);
  const [jData,    setJData]    = useState(null);
  const [riskEntry, setRiskEntry] = useState("100");
  const [riskStop, setRiskStop] = useState("95");
  const [riskSide, setRiskSide] = useState("long");
  const [riskMaxPosPct, setRiskMaxPosPct] = useState("20");
  const [riskCorrCap, setRiskCorrCap] = useState("0.80");
  const [riskAtrPct, setRiskAtrPct] = useState("4.0");
  const [riskSlipBps, setRiskSlipBps] = useState("10");
  const [riskSetupQuality, setRiskSetupQuality] = useState("A");
  const [watchlistData, setWatchlistData] = useState([]);
  const prevScoresRef = useRef({});  // symbol → last composite score, for crossing-70 detection
  const prevGreenRef = useRef({});   // symbol → was green light, for green-light transition alerts
  const regimeRef = useRef(null);    // last known Risk-On/Risk-Off regime, for change alerts
  const morningSentRef = useRef("");  // date string of last 7am green-light summary sent
  const [marketUniverseData, setMarketUniverseData] = useState([]);
  const [marketUniverseLoading, setMarketUniverseLoading] = useState(false);
  const [newsData, setNewsData] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [telegramOk, setTelegramOk] = useState(false);
  const [tvWebhookRows, setTvWebhookRows] = useState([]);
  const [tvWebhookSecured, setTvWebhookSecured] = useState(false);
  const [journalEntries, setJournalEntries] = useState([]);
  const [journalStats, setJournalStats] = useState(null);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalFilter, setJournalFilter] = useState("all");
  const [journalTickerSearch, setJournalTickerSearch] = useState("");
  const [journalStyleFilter, setJournalStyleFilter] = useState("all");
  const [journalDateRange, setJournalDateRange] = useState("all");
  const [journalSort, setJournalSort] = useState({ col: "openedAt", dir: "desc" });
  const [journalCloseId, setJournalCloseId] = useState(null);
  const [journalClosePrice, setJournalClosePrice] = useState("");
  const [journalEditId, setJournalEditId] = useState(null);
  const [journalEditNotes, setJournalEditNotes] = useState("");
  const [journalEditEntry, setJournalEditEntry] = useState("");
  const [journalEditSL, setJournalEditSL] = useState("");
  const [journalEditTarget, setJournalEditTarget] = useState("");
  const [journalEditSize, setJournalEditSize] = useState("");
  const [quickLogModal, setQuickLogModal] = useState(null);
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [paSymbol, setPaSymbol] = useState("");
  const [paTarget, setPaTarget] = useState("");
  const [paDirection, setPaDirection] = useState("above");
  const [paNote, setPaNote] = useState("");
  const [optionsFlow, setOptionsFlow] = useState(null);
  const [macroData, setMacroData] = useState([]);
  const [sectorData, setSectorData] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);

  // ── selectedStock → redirect to Smart Scanner deep dive (useEffect, NOT during render) ──
  useEffect(() => {
    if (!selectedStock) return;
    const sym = selectedStock.symbol || selectedStock.ticker;
    if (!sym) { setSelectedStock(null); return; }
    const sc = computeScores(selectedStock).composite || 50;
    setScanResults(prev => prev.some(r => r.ticker === sym) ? prev : [{
      ticker: sym, score: sc, signal: "WATCH", scannerScore: sc, signals: [], sColor: "#f59e0b",
      quote: { price: selectedStock.price || 0, changePercent: selectedStock.changesPercentage || 0,
        yearHigh: selectedStock.yearHigh, yearLow: selectedStock.yearLow,
        priceAvg50: selectedStock.priceAvg50, priceAvg200: selectedStock.priceAvg200,
        volume: selectedStock.volume, avgVolume: selectedStock.avgVolume },
      candles: null, rsiVal: null, macdBull: null, ema9v: null, ema21v: null,
    }, ...prev]);
    setSfSig("ALL"); setSfMinScore(0);
    setActiveTab("smartscan");
    setSelectedStock(null);
    setTimeout(() => { setScanExpanded(sym); loadDeepDive(sym); loadDeepSocial(sym); }, 80);
    setTimeout(() => fetchTradeSetup(sym, { ticker: sym, score: sc, signal: "WATCH", signals: [], quote: { price: selectedStock.price || 0 } }), 1300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStock]);
  const [terminalSymbol, setTerminalSymbol] = useState(WATCHLIST_SYMBOLS[0]);
  const [myTvChartUrl,   setMyTvChartUrl]   = useState(() => { try { return localStorage.getItem("my_tv_chart_url") || ""; } catch { return ""; } });
  const [tvChartMode,    setTvChartMode]     = useState(() => { try { return localStorage.getItem("tv_chart_mode") || "widget"; } catch { return "widget"; } }); // "widget" | "my_chart"
  const [terminalTf, setTerminalTf] = useState("1D");
  const [terminalCandles, setTerminalCandles] = useState(null);
  const [terminalCandlesLoading, setTerminalCandlesLoading] = useState(false);
  const [terminalPanelSymbols, setTerminalPanelSymbols] = useState(WATCHLIST_SYMBOLS.slice(0, 4));
  const [terminalPanelCandles, setTerminalPanelCandles] = useState({});
  const [terminalFundamentals, setTerminalFundamentals] = useState(null);
  const [selectedFundamentals, setSelectedFundamentals] = useState(null);
  const [selectedFundamentalsLoading, setSelectedFundamentalsLoading] = useState(false);
  const [dataSourceStatus, setDataSourceStatus] = useState("connecting");
  const [terminalLayout, setTerminalLayout] = useState(DEFAULT_SETTINGS.terminalLayout);
  const [hotkeyProfile, setHotkeyProfile] = useState(DEFAULT_SETTINGS.hotkeyProfile);
  const [drawTools, setDrawTools] = useState({
    trendStart: "",
    trendEnd: "",
    fibLow: "",
    fibHigh: "",
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteInput, setPaletteInput] = useState("");
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [earningsRows, setEarningsRows] = useState([]);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsUpdatedAt, setEarningsUpdatedAt] = useState("");
  const [earningsRefreshTick, setEarningsRefreshTick] = useState(0);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [agentPrompt, setAgentPrompt] = useState("Give me market regime, top 5 longs, top 3 risks, and a clear execution plan.");
  const [agentOutput, setAgentOutput] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentRunAt, setAgentRunAt] = useState("");
  const [briefText, setBriefText] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefAt, setBriefAt] = useState("");
  const [briefExpanded, setBriefExpanded] = useState(false);
  // Always open on the Monitor dashboard, regardless of the last tab used.
  // First visit lands on the Start Here guide; afterwards opens to the Monitor as usual.
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("axiom_seen_start")) {
      localStorage.setItem("axiom_seen_start", "1");
      return "start";
    }
    return "greenlight";  // default landing: A+ Green Light + Auto-Pilot
  });
  // Save tab on change
  React.useEffect(() => { try { localStorage.setItem("last_tab", activeTab); } catch {} }, [activeTab]);
  const [loading, setLoading] = useState(false);
  const [portfolioHoldings, setPortfolioHoldings] = useState(DEFAULT_PORTFOLIO);
  const [csvImportModal, setCsvImportModal] = useState(null); // null | { rows, parseInfo }
  const csvFileRef = useRef(null);
  const [pasteModal, setPasteModal] = useState(null); // null | "input" | { rows, scanning, scanned }
  const [pasteText, setPasteText] = useState("");
  const [scannerFilters, setScannerFilters] = useState(DEFAULT_SCANNER_FILTERS);
  const [serverScreenLoading, setServerScreenLoading] = useState(false);
  const [serverScreenResults, setServerScreenResults] = useState(null);
  const [marketMovers, setMarketMovers] = useState(null);
  const [marketMoversLoading, setMarketMoversLoading] = useState(false);
  const [tvWebhookFilter, setTvWebhookFilter] = useState("");
  const [tvWebhookLoggedRows, setTvWebhookLoggedRows] = useState({});
  const [newsSymFilter, setNewsSymFilter] = useState("");
  const [newsSentFilter, setNewsSentFilter] = useState("all");
  const [workflowState, setWorkflowState] = useState(DEFAULT_WORKFLOW);
  const [workflowAutoPlan, setWorkflowAutoPlan] = useState(null);
  const [dailyGamePlan, setDailyGamePlan] = useState(() => { try { return localStorage.getItem("ax_game_plan") || ""; } catch { return ""; } });
  const [tvSource, setTvSource] = useState("bloomberg");
  const [backtestSymbol, setBacktestSymbol] = useState(WATCHLIST_SYMBOLS[0]);
  const [backtestTf, setBacktestTf] = useState("1D");
  const [backtestLookback, setBacktestLookback] = useState("20");
  const [backtestResult, setBacktestResult] = useState(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState("");
  const [sortCol, setSortCol] = useState("composite");
  const [signalFilter, setSignalFilter] = useState("ALL"); // ALL | BUY | HOLD | SELL
  const [trendFilter,  setTrendFilter]  = useState("ALL"); // ALL | Strong Up | Up | Flat | Weak | Down
  const [volumeFilter, setVolumeFilter] = useState("ALL"); // ALL | HIGH | NORMAL | LOW
  const [scoreFilter,  setScoreFilter]  = useState("ALL"); // ALL | 70+ | 60+ | 50+ | <50
  const [sortDir, setSortDir] = useState("desc");
  // Default card view on tablet AND mobile (better for touch)
  const [wlCardView, setWlCardView] = useState(() => typeof window !== "undefined" && window.innerWidth <= 1100);
  const intervalRef = useRef(null);
  const seenTriggeredAlerts = useRef(new Set());
  const lastAlertsTabVisit = useRef(0);
  const [triggeredAlertBadge, setTriggeredAlertBadge] = useState(0);
  const [analyzerExpanded, setAnalyzerExpanded] = useState(null);
  const [tgStatus, setTgStatus] = useState(null); // null | "sending" | "ok" | "error" | "unconfigured"
  const [tgMsg, setTgMsg] = useState("");

  // ── COT State ──
  const [cotData, setCotData]           = useState(null);   // full API response
  const [cotLoading, setCotLoading]     = useState(false);
  const [cotError, setCotError]         = useState("");
  const [cotRunning, setCotRunning]     = useState(false);  // manual scan in progress
  const [cotLastSent, setCotLastSent]   = useState(null);   // last Telegram send result

  // ── OpenStock / TradingView Widget State ──
  const [tvOsInput,  setTvOsInput]  = useState("SPY");
  const [tvOsSymbol, setTvOsSymbol] = useState("SPY");
  // ── Smart Scanner state ──────────────────────────────────────────────────
  const [scanResults,  setScanResults]  = useState([]);
  const scanResultsRef = useRef([]);
  useEffect(() => { scanResultsRef.current = scanResults; }, [scanResults]);
  const [scanLoading,  setScanLoading]  = useState(false);
  // Scanner filters — hoisted to top level (Rules of Hooks)
  const [sfSig,      setSfSig]      = useState(() => { try { return localStorage.getItem("sf_sig") || "ALL"; } catch { return "ALL"; } });
  const [sfMinScore, setSfMinScore] = useState(() => { try { return Number(localStorage.getItem("sf_score") || "0"); } catch { return 0; } });
  const [sfMaxPrice, setSfMaxPrice] = useState(0);
  const [sfZone,     setSfZone]     = useState("ALL");
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 30 });
  const [scanExpanded, setScanExpanded] = useState(null);

  // ── Auto-refresh live quote while deep dive is open (every 30s) ──
  useEffect(() => {
    if (!scanExpanded) return;
    const ticker = scanExpanded;
    const refresh = async () => {
      try {
        const r = await fetch(`/api/market/quote?symbols=${encodeURIComponent(ticker)}`);
        const d = await r.json();
        const q = Array.isArray(d) ? d[0] : (d?.quotes ? d.quotes[0] : (d?.quote || d));
        if (!q || !q.price) return;
        setScanResults(prev => prev.map(row =>
          row.ticker === ticker
            ? { ...row, quote: { ...row.quote, price: q.price, changePercent: q.changesPercentage ?? q.changePercent ?? row.quote?.changePercent, volume: q.volume ?? row.quote?.volume } }
            : row
        ));
      } catch {}
    };
    refresh(); // immediate on open
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [scanExpanded]);

  const [scanFavorites, setScanFavorites] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("scan_favorites") || "[]")); } catch { return new Set(); } });
  const toggleFavorite = (ticker) => setScanFavorites(prev => {
    const next = new Set(prev);
    next.has(ticker) ? next.delete(ticker) : next.add(ticker);
    try { localStorage.setItem("scan_favorites", JSON.stringify([...next])); } catch {}
    return next;
  });
  const [scanLastRun,  setScanLastRun]  = useState(null);
  const [scanHistory,  setScanHistory]  = useState([]); // last 5 scan summaries
  const [scanError,    setScanError]    = useState(null);
  const [scanDeepData, setScanDeepData] = useState({});
  const [scanDeepLoad, setScanDeepLoad] = useState({});
  const [deepSocialData, setDeepSocialData] = useState({});
  const [deepSocialLoad, setDeepSocialLoad] = useState({});
  // ── Hoisted state for Institutional Radar, Trade Signals, Dark Pool ─────────
  // Must be at top level — NOT inside conditional IIFEs (Rules of Hooks)
  const [distData,     setDistData]     = useState(null);
  const [futuresData,  setFuturesData]  = useState([]);
  const [preMktMovers, setPreMktMovers] = useState([]);
  const [eventCountdowns, setEventCountdowns] = useState([]);
  const [tickTrinData, setTickTrinData] = useState(null);
  const [shortChgData, setShortChgData] = useState(null);
  const [dpHeatData,   setDpHeatData]   = useState(null);
  const [distLoading,  setDistLoading]  = useState(false);
  const [distExpanded, setDistExpanded] = useState(false);
  const [sigData,      setSigData]      = useState(null);
  const [sigLoading,   setSigLoading]   = useState(false);
  const [sigFilter,    setSigFilter]    = useState("ALL");
  const [sigCollapsed, setSigCollapsed] = useState(false); // open by default
  const [dpData,       setDpData]       = useState(null);
  const [dpLoad,       setDpLoad]       = useState(false);
  const [dpSym,        setDpSym]        = useState("");
  const [dpErr,        setDpErr]        = useState(null);

  const [autoScanOn,   setAutoScanOn]   = useState(() => {
    try { return JSON.parse(localStorage.getItem("smartscan_auto_on") ?? "true"); } catch { return true; }
  });
  const [autoScanMins, setAutoScanMins] = useState(() => {
    try { return Number(localStorage.getItem("smartscan_auto_mins") || 1); } catch { return 1; }
  });
  const [autoScanCountdown, setAutoScanCountdown] = useState(0);
  const autoScanRef = useRef(null);
  // ── AI Trade Setup state ─────────────────────────────────────────────────
  const [tradeSetups,     setTradeSetups]     = useState({});  // { BBAI: { plan, generatedAt } }
  const [tradeSetupLoad,  setTradeSetupLoad]  = useState({});  // { BBAI: true/false }
  const [tradeSetupError, setTradeSetupError] = useState({});  // { BBAI: "msg" }
  // ── Custom scan tickers (persisted) ──────────────────────────────────────
  const [customScanTickers, setCustomScanTickers] = useState(() => {
    try { return JSON.parse(localStorage.getItem("custom_scan_tickers") || "[]"); } catch { return []; }
  });
  const [scanTickerInput, setScanTickerInput] = useState("");
  const [autoExecStatus,  setAutoExecStatus]  = useState({});  // { BBAI: "placing"|"done"|"error" }

  // ── Pre-Market Briefing ───────────────────────────────────────────────────
  const [premktBriefing,  setPremktBriefing]  = useState("");
  const [premktLoading,   setPremktLoading]   = useState(false);
  const [premktAt,        setPremktAt]        = useState("");

  // ── Custom Screener ───────────────────────────────────────────────────────
  const [screenerRules,   setScreenerRules]   = useState([{ field: "score", op: ">=", val: "70" }]);
  const [screenerResults, setScreenerResults] = useState([]);
  const [screenerRan,     setScreenerRan]     = useState(false);

  // ── Short Interest ────────────────────────────────────────────────────────
  const [shortIntData,    setShortIntData]    = useState([]);
  const [shortIntLoading, setShortIntLoading] = useState(false);
  const [shortIntInput,   setShortIntInput]   = useState("");

  // ── Correlation Matrix ────────────────────────────────────────────────────
  const [corrMatrix,      setCorrMatrix]      = useState(null);
  const [corrLoading,     setCorrLoading]     = useState(false);

  // ── Fibonacci Calculator ──────────────────────────────────────────────────
  const [fibTicker,       setFibTicker]       = useState("SPY");
  const [fibInput,        setFibInput]        = useState("SPY");
  const [fibData,         setFibData]         = useState(null);
  const [fibLoading,      setFibLoading]      = useState(false);
  const [fibError,        setFibError]        = useState("");

  // ── Multi-Timeframe ───────────────────────────────────────────────────────
  const [multitfSymbol,   setMultitfSymbol]   = useState("SPY");
  const [multitfInput,    setMultitfInput]    = useState("SPY");
  const [multitfInds,     setMultitfInds]     = useState({ RSI: true, MACD: true, BB: false, EMA: false, VWAP: false, STOCH: false, VOL: false, ATR: false });
  const [mtfLayout,       setMtfLayout]       = useState("grid"); // grid (2x2) or stack (1 column)

  // ── Halal Screener ────────────────────────────────────────────────────────
  const [halalInput,      setHalalInput]      = useState("");
  const [halalReport,     setHalalReport]     = useState(null);
  const [halalLoading,    setHalalLoading]    = useState(false);
  const [halalError,      setHalalError]      = useState("");

  // ── AI Journal Review ─────────────────────────────────────────────────────
  const [journalReview,   setJournalReview]   = useState(null);
  const [journalRevLoad,  setJournalRevLoad]  = useState(false);
  const [journalRevError, setJournalRevError] = useState("");

  // ── News Sentiment ────────────────────────────────────────────────────────
  const [newsSentiments,  setNewsSentiments]  = useState({});  // headline text → {s, score}
  const [newsSentLoading, setNewsSentLoading] = useState(false);

  // ── Smart Money (Insider + Institutional) ────────────────────────────────
  const [insiderTicker,   setInsiderTicker]   = useState("AAPL");
  const [insiderInput,    setInsiderInput]    = useState("AAPL");
  const [insiderData,     setInsiderData]     = useState(null);
  const [instData,        setInstData]        = useState(null);
  const [insiderLoading,  setInsiderLoading]  = useState(false);

  // ── Social Sentiment ──────────────────────────────────────────────────────
  const [socialTicker,    setSocialTicker]    = useState("TSLA");
  const [socialInput,     setSocialInput]     = useState("TSLA");
  const [socialData,      setSocialData]      = useState(null);
  const [socialLoading,   setSocialLoading]   = useState(false);

  // ── Analyst Ratings ───────────────────────────────────────────────────────
  const [analystTicker,   setAnalystTicker]   = useState("AAPL");
  const [analystInput,    setAnalystInput]    = useState("AAPL");
  const [analystData,     setAnalystData]     = useState(null);
  const [analystLoading,  setAnalystLoading]  = useState(false);

  // ── Dividend / IPO Calendar ───────────────────────────────────────────────
  const [dividendData,    setDividendData]    = useState(null);
  const [dividendLoading, setDividendLoading] = useState(false);

  // ── AI Pattern Recognizer ─────────────────────────────────────────────────
  const [patternTicker,   setPatternTicker]   = useState("SPY");
  const [patternInput,    setPatternInput]    = useState("SPY");
  const [patternResult,   setPatternResult]   = useState(null);
  const [patternLoading,  setPatternLoading]  = useState(false);

  // ── Macro Scenario Planner ────────────────────────────────────────────────
  const [scenarioInput,   setScenarioInput]   = useState("");
  const [scenarioResult,  setScenarioResult]  = useState(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);

  // ── Earnings Call Summarizer ──────────────────────────────────────────────
  const [earningsCallText,   setEarningsCallText]   = useState("");
  const [earningsCallResult, setEarningsCallResult] = useState(null);
  const [earningsCallLoad,   setEarningsCallLoad]   = useState(false);

  // ── Session Recap ─────────────────────────────────────────────────────────
  const [sessionRecapResult, setSessionRecapResult] = useState(null);
  const [sessionRecapLoad,   setSessionRecapLoad]   = useState(false);

  // ── Trade Checklist ───────────────────────────────────────────────────────
  const [checklistItems, setChecklistItems] = useState([
    { id: 1, label: "Trend aligned on D1 chart",           done: false },
    { id: 2, label: "Above key support level",             done: false },
    { id: 3, label: "RSI not overbought (< 70)",           done: false },
    { id: 4, label: "MACD bullish cross confirmed",        done: false },
    { id: 5, label: "Volume above 20-day average",         done: false },
    { id: 6, label: "Risk/Reward ≥ 2:1",                   done: false },
    { id: 7, label: "Position size within risk limit",     done: false },
    { id: 8, label: "Stop-loss level defined",             done: false },
    { id: 9, label: "No major news catalyst today",        done: false },
    { id: 10, label: "Halal screening passed",             done: false },
  ]);

  // ── DCA Planner ───────────────────────────────────────────────────────────
  const [dcaTicker,  setDcaTicker]  = useState("SPY");
  const [dcaAmount,  setDcaAmount]  = useState("500");
  const [dcaPeriod,  setDcaPeriod]  = useState("monthly");
  const [dcaMonths,  setDcaMonths]  = useState("24");
  const [dcaReturn,  setDcaReturn]  = useState("10");
  const [dcaResult,  setDcaResult]  = useState(null);

  // ── Options Break-Even Calculator ─────────────────────────────────────────
  const [optionType,    setOptionType]    = useState("call");
  const [optionStock,   setOptionStock]   = useState("");
  const [optionStrike,  setOptionStrike]  = useState("");
  const [optionPremium, setOptionPremium] = useState("");
  const [optionExpiry,  setOptionExpiry]  = useState("");
  const [optionResult,  setOptionResult]  = useState(null);

  // ── AI Lab sub-section ────────────────────────────────────────────────────
  const [ailabSection,  setAilabSection]  = useState("pattern");
  // Fear & Greed
  const [fearGreedData,    setFearGreedData]    = useState(null);
  const [fearGreedLoading, setFearGreedLoading] = useState(false);
  // News sentiment (for next-day projection)
  const [newsSentiment, setNewsSentiment] = useState(null);
  // Social (StockTwits) sentiment
  const [socialSentiment, setSocialSentiment] = useState(null);
  // Market Breadth
  const [breadthData,    setBreadthData]    = useState(null);
  const [breadthLoading, setBreadthLoading] = useState(false);
  // Seasonality
  const [seasonTicker,  setSeasonTicker]  = useState("SPY");
  const [seasonInput,   setSeasonInput]   = useState("SPY");
  const [seasonData,    setSeasonData]    = useState(null);
  const [seasonLoading, setSeasonLoading] = useState(false);

  const [fivexSector,    setFivexSector]    = useState("ALL");
  const [fivexSort,      setFivexSort]      = useState("rank");  // "rank" | "zone" | "upside" | "risk"
  const [fivexPrices,    setFivexPrices]    = useState({});   // { BBAI: { price, change, pct } }
  const [fivexLoading,   setFivexLoading]   = useState(false);
  const [fivexFetchedAt, setFivexFetchedAt] = useState(null);
  const [fivexError,     setFivexError]     = useState(null);

  // ── Quran Player State ──
  const [quranReciter, setQuranReciter] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("quran_reciter") || "null");
      // Validate saved reciter still exists in the current list (CDN may have changed)
      return (saved && QURAN_RECITERS.find(r => r.id === saved.id)) || QURAN_RECITERS[0];
    } catch { return QURAN_RECITERS[0]; }
  });
  const [quranSurah, setQuranSurah] = useState(() => {
    try { return Number(localStorage.getItem("quran_surah") || "1"); } catch { return 1; }
  });
  const [quranPlaying, setQuranPlaying] = useState(false);
  const [quranAutoNext, setQuranAutoNext] = useState(true);
  // ── Quran text reader (read along) ──
  const [quranShowText, setQuranShowText] = useState(() => localStorage.getItem("quran_show_text") !== "off");
  const [quranText, setQuranText] = useState(null);   // { ayahs:[{n,ar}] } | { loading } | { error }
  // ── حسنات challenge — every letter = 10 hasanat (الم حرف...بكل حرف عشر حسنات) ──
  const HASANAT_GOAL = 100000; // daily challenge target
  const [hasanat, setHasanat] = useState(() => {
    try { return JSON.parse(localStorage.getItem("quran_hasanat")) || { total: 0, today: 0, date: "", done: [] }; }
    catch { return { total: 0, today: 0, date: "", done: [] }; }
  });
  const creditSurah = (num, letters) => {
    const today = new Date().toDateString();
    setHasanat(h => {
      let { total, today: t, date, done } = h;
      if (date !== today) { t = 0; done = []; date = today; }
      if (done.includes(num)) return { total, today: t, date, done };
      const next = { total: total + letters * 10, today: t + letters * 10, date, done: [...done, num] };
      localStorage.setItem("quran_hasanat", JSON.stringify(next));
      return next;
    });
  };
  useEffect(() => {
    if (!quranShowText) return;
    let alive = true;
    setQuranText({ loading: true });
    fetch(`https://api.alquran.cloud/v1/surah/${quranSurah}`).then(r => r.json())
      .then(d => { if (!alive) return; const ay = d?.data?.ayahs; if (ay) setQuranText({ ayahs: ay.map(a => ({ n: a.numberInSurah, ar: a.text })) }); else setQuranText({ error: true }); })
      .catch(() => { if (alive) setQuranText({ error: true }); });
    return () => { alive = false; };
  }, [quranSurah, quranShowText]);
  const [quranRepeat, setQuranRepeat] = useState(false);
  const [quranAudioError, setQuranAudioError] = useState(false);
  const [quranLoading, setQuranLoading] = useState(false);
  const [quranCurrentTime, setQuranCurrentTime] = useState(0);
  const [quranDuration, setQuranDuration] = useState(0);
  const [quranVolume, setQuranVolume] = useState(() => { try { return Number(localStorage.getItem("quran_volume") || "1"); } catch { return 1; } });
  const [quranSearchQuery, setQuranSearchQuery] = useState("");
  const quranAudioRef = useRef(null);

  // ── Athan State ──
  const [athanCity, setAthanCity] = useState(() => localStorage.getItem("athan_city") || "");
  const [athanCountry, setAthanCountry] = useState(() => localStorage.getItem("athan_country") || "");
  const [athanMethod, setAthanMethod] = useState(() => Number(localStorage.getItem("athan_method") || "4"));
  const [athanSoundOn, setAthanSoundOn] = useState(() => localStorage.getItem("athan_sound") !== "off");
  const [athanReminder, setAthanReminder] = useState(() => Number(localStorage.getItem("athan_reminder") || "10"));
  const [athanTimes, setAthanTimes] = useState(null);
  const [athanHijri, setAthanHijri] = useState(null);
  const [athanLoading, setAthanLoading] = useState(false);
  const [athanError, setAthanError] = useState("");
  const [athanNow, setAthanNow] = useState(new Date());
  const athanAudioRef = useRef(null);
  const athanFiredReminders = useRef(new Set()); // tracks "YYYY-MM-DD:PrayerKey:mins" keys

  // Clock tick for athan countdown — must live at component level (Rules of Hooks)
  useEffect(() => {
    if (activeTab !== "athan") return;
    const t = setInterval(() => setAthanNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [activeTab]);

  // Shared prayer-time fetch function (component level so useEffect can call it)
  const fetchPrayerTimes = useCallback(async (lat, lng, city, country) => {
    setAthanLoading(true);
    setAthanError("");
    try {
      let url;
      if (lat && lng) {
        url = `https://api.aladhan.com/v1/timings/${Math.floor(Date.now() / 1000)}?latitude=${lat}&longitude=${lng}&method=${athanMethod}`;
      } else {
        url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${athanMethod}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.code !== 200) throw new Error(data.data || "خطأ في جلب أوقات الصلاة");
      setAthanTimes(data.data.timings);
      setAthanHijri(data.data.date?.hijri);
    } catch (err) {
      setAthanError(String(err.message || "فشل في جلب أوقات الصلاة"));
    }
    setAthanLoading(false);
  }, [athanMethod]);

  // Auto-load prayer times when athan tab opens with a saved city
  const athanAutoLoaded = useRef(false);
  useEffect(() => {
    if (activeTab !== "athan" || athanTimes || athanLoading || athanAutoLoaded.current) return;
    athanAutoLoaded.current = true;
    if (athanCity && athanCountry) {
      fetchPrayerTimes(null, null, athanCity, athanCountry);
    }
  }, [activeTab, athanTimes, athanLoading, athanCity, athanCountry, fetchPrayerTimes]);

  // Prayer time reminder — fires browser notification N min before each prayer
  useEffect(() => {
    if (!athanTimes || !athanReminder) return;
    const PRAYER_KEYS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
    const PRAYER_NAMES_AR = { Fajr: "الفجر", Dhuhr: "الظهر", Asr: "العصر", Maghrib: "المغرب", Isha: "العشاء" };
    const today = new Date().toISOString().slice(0, 10);

    const t = setInterval(() => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const now = new Date();
      PRAYER_KEYS.forEach(key => {
        const timeStr = athanTimes[key];
        if (!timeStr) return;
        const [h, m] = timeStr.split(":").map(Number);
        const prayerTime = new Date(now);
        prayerTime.setHours(h, m, 0, 0);
        const diffSec = Math.round((prayerTime - now) / 1000);
        const diffMin = diffSec / 60;
        // Fire when within [target-0.5, target+0.5] minute window
        if (diffMin >= athanReminder - 0.5 && diffMin < athanReminder + 0.5) {
          const key2 = `${today}:${key}:${athanReminder}`;
          if (!athanFiredReminders.current.has(key2)) {
            athanFiredReminders.current.add(key2);
            try {
              new Notification(`🕌 ${PRAYER_NAMES_AR[key]} خلال ${athanReminder} دقيقة`, {
                body: `وقت صلاة ${PRAYER_NAMES_AR[key]} الساعة ${timeStr}`,
                icon: "/axiom-runner/assets/am-trading-logo.png",
                tag: key2,
              });
            } catch {}
          }
        }
      });
    }, 30000); // check every 30 seconds
    return () => clearInterval(t);
  }, [athanTimes, athanReminder]);

  // Real athan recitation audio (full adhan MP3)
  const ATHAN_URL = "https://www.islamcan.com/audio/adhan/azan2.mp3";
  const playAthan = React.useCallback(() => {
    try {
      if (!athanAudioRef.current) {
        athanAudioRef.current = new Audio(ATHAN_URL);
        athanAudioRef.current.preload = "auto";
      }
      athanAudioRef.current.currentTime = 0;
      athanAudioRef.current.volume = 1.0;
      const p = athanAudioRef.current.play();
      if (p && p.catch) p.catch(() => {
        // Browser blocked autoplay — fall back to a beep so something is heard
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          [[880,0,0.4],[1100,0.45,0.4],[880,0.9,0.6]].forEach(([f,s,d]) => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination); o.type = "sine"; o.frequency.value = f;
            g.gain.setValueAtTime(0.22, ctx.currentTime + s);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + s + d);
            o.start(ctx.currentTime + s); o.stop(ctx.currentTime + s + d);
          });
        } catch {}
      });
    } catch {}
  }, []);

  const stopAthan = React.useCallback(() => {
    try { if (athanAudioRef.current) { athanAudioRef.current.pause(); athanAudioRef.current.currentTime = 0; } } catch {}
  }, []);

  // Prayer time arrival — plays the full athan when prayer time hits (if athanSoundOn)
  const athanFiredSounds = useRef(new Set());
  useEffect(() => {
    if (!athanTimes || !athanSoundOn) return;
    const PRAYER_KEYS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
    const today = new Date().toISOString().slice(0, 10);
    const t = setInterval(() => {
      const now = new Date();
      PRAYER_KEYS.forEach(key => {
        const timeStr = athanTimes[key];
        if (!timeStr) return;
        const [h, m] = timeStr.split(":").map(Number);
        const prayerTime = new Date(now);
        prayerTime.setHours(h, m, 0, 0);
        const diffSec = Math.abs((prayerTime - now) / 1000);
        if (diffSec <= 30) {
          const soundKey = `${today}:${key}`;
          if (!athanFiredSounds.current.has(soundKey)) {
            athanFiredSounds.current.add(soundKey);
            playAthan();
          }
        }
      });
    }, 15000);
    return () => clearInterval(t);
  }, [athanTimes, athanSoundOn, playAthan]);

  // Reload global quran audio when surah or reciter changes, resume if was playing
  const quranWasPlaying   = useRef(false);
  const quranUsedFallback = useRef(false);  // true = already tried 64kbps
  const quranAutoPlay     = useRef(false);  // true = user intends to play (not yet confirmed by onPlay)
  useEffect(() => {
    if (!quranAudioRef.current) return;
    const shouldPlay = quranWasPlaying.current;
    quranWasPlaying.current   = false;
    quranUsedFallback.current = false;  // reset fallback on every track change
    quranAutoPlay.current     = false;  // reset intent on track change
    setQuranAudioError(false);
    setQuranCurrentTime(0);
    setQuranDuration(0);
    // Always update the src so subsequent play() uses the right file
    quranAudioRef.current.src = qUrl(quranReciter, quranSurah);
    // Only fetch (load + play) if we were already playing — otherwise wait for user tap
    if (shouldPlay) {
      quranAutoPlay.current = true;
      quranAudioRef.current.load();
      // Don't show error here — onError will handle fallback, then show error if both fail
      quranAudioRef.current.play().catch(() => {});
    }
    // If not playing: src is staged, browser will NOT fetch until play() is called
  }, [quranSurah, quranReciter]);

  // Sync volume to audio element whenever it changes
  useEffect(() => {
    if (quranAudioRef.current) quranAudioRef.current.volume = quranVolume;
    localStorage.setItem("quran_volume", String(quranVolume));
  }, [quranVolume]);

  // ── Deals State ──
  const [dealsQuery,    setDealsQuery]    = useState("");
  const [dealsCategory, setDealsCategory] = useState("electronics");
  const [dealsMaxPrice, setDealsMaxPrice] = useState("");
  const [dealsLocation, setDealsLocation] = useState("");
  const [dealsResults,  setDealsResults]  = useState([]);
  const [dealsLoading,  setDealsLoading]  = useState(false);
  const [dealsError,    setDealsError]    = useState("");
  const [dealsSearched, setDealsSearched] = useState(false);
  const [dealsSources,  setDealsSources]  = useState({});
  const [dealsWatches,  setDealsWatches]  = useState([]);
  const [dealsAlerts,   setDealsAlerts]   = useState([]);
  const [dealsWatchesLoading, setDealsWatchesLoading] = useState(false);

  const fetchDealsWatches = useCallback(() => {
    fetch("/api/deals/watches").then(r => r.json()).then(d => {
      if (d.ok) { setDealsWatches(d.watches || []); setDealsAlerts(d.recentAlerts || []); }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "deals") fetchDealsWatches();
  }, [activeTab, fetchDealsWatches]);

  // ── COT: fetch on tab open ──
  const fetchCOTData = useCallback(() => {
    setCotLoading(true); setCotError("");
    fetch("/api/cot/status")
      .then(r => r.json())
      .then(d => { setCotData(d); setCotLoading(false); })
      .catch(e => { setCotError(e.message || "Failed to load COT data"); setCotLoading(false); });
  }, []);

  useEffect(() => {
    if (activeTab === "cot") fetchCOTData();
  }, [activeTab, fetchCOTData]);

  const runDealsSearch = useCallback(() => {
    setDealsLoading(true); setDealsError(""); setDealsResults([]); setDealsSearched(false); setDealsSources({});
    const params = new URLSearchParams({ q: dealsQuery, category: dealsCategory });
    if (dealsMaxPrice) params.set("maxPrice", dealsMaxPrice);
    if (dealsLocation) params.set("location", dealsLocation);
    // 35-second frontend timeout so the button never hangs forever
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    fetch(`/api/deals/search?${params}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        clearTimeout(timer);
        setDealsLoading(false);
        setDealsSearched(true);
        if (d.ok) {
          setDealsResults(d.results || []);
          // Use server-reported sourceStatus (includes 0s and -1 errors)
          setDealsSources(d.sourceStatus || {});
        } else {
          setDealsError(d.error || "Search failed");
        }
      })
      .catch(e => {
        clearTimeout(timer);
        setDealsLoading(false);
        setDealsSearched(true);
        setDealsError(e.name === "AbortError" ? "Search timed out (35s) — server may be overloaded, try again" : e.message);
      });
  }, [dealsQuery, dealsCategory, dealsMaxPrice, dealsLocation]);

  const addDealsWatch = useCallback(() => {
    if (!dealsQuery.trim()) return;
    setDealsWatchesLoading(true);
    fetch("/api/deals/watches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: dealsQuery, category: dealsCategory, maxPrice: dealsMaxPrice || null, location: dealsLocation }),
    }).then(r => r.json()).then(d => {
      setDealsWatchesLoading(false);
      if (d.ok) { fetchDealsWatches(); alert(`Watch added! Telegram alerts will fire every 30 min when new "${dealsQuery}" deals appear.`); }
    }).catch(() => setDealsWatchesLoading(false));
  }, [dealsQuery, dealsCategory, dealsMaxPrice, dealsLocation, fetchDealsWatches]);

  const removeDealsWatch = useCallback((id) => {
    fetch(`/api/deals/watches/${id}`, { method: "DELETE" })
      .then(() => fetchDealsWatches());
  }, [fetchDealsWatches]);

  // ── Athkar State ──
  const [athkarCategory, setAthkarCategory] = useState("morning");
  const [athkarProgress, setAthkarProgress] = useState(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const lastReset = localStorage.getItem("athkar_reset_date");
      if (lastReset !== today) {
        // New day — clear daily categories, keep persistent ones
        const saved = JSON.parse(localStorage.getItem("athkar_progress") || "{}");
        const DAILY_CATS = ["morning", "evening", "afterPrayer", "sleep"];
        const allDailyKeys = DAILY_CATS.flatMap(cat => (ATHKAR_DATA[cat]?.items || []).map(i => i.id));
        const reset = { ...saved };
        allDailyKeys.forEach(k => { reset[k] = 0; });
        localStorage.setItem("athkar_progress", JSON.stringify(reset));
        localStorage.setItem("athkar_reset_date", today);
        return reset;
      }
      return JSON.parse(localStorage.getItem("athkar_progress") || "{}");
    } catch { return {}; }
  });

  // ── Tasbih State ──
  const [tasbihDhikr, setTasbihDhikr] = useState(TASBIH_DHIKR[0]);
  const [tasbihTarget, setTasbihTarget] = useState(33);
  const [tasbihCustomTarget, setTasbihCustomTarget] = useState("");
  const [tasbihCount, setTasbihCount] = useState(() => {
    try { return Number(localStorage.getItem("tasbih_count") || "0"); } catch { return 0; }
  });
  const [tasbihCompleted, setTasbihCompleted] = useState(false);

  const themeMode = String(settings.themeMode || "light").toLowerCase() === "dark" ? "dark" : "light";
  const brightness = Math.max(30, Math.min(100, Number(settings.brightness ?? 100)));
  // Sync module-level C on every render so all components see the current theme immediately
  Object.assign(C, themeMode === "dark" ? THEME_DARK : THEME_LIGHT);

  const SESSION_TTL = 8 * 60 * 60 * 1000;
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const { ts } = JSON.parse(raw);
        if (Date.now() - ts < SESSION_TTL) setAppUnlocked(true);
        else sessionStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch {
      // Legacy "1" value — clear it so user re-authenticates cleanly
      try { sessionStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
    }
  }, []);

  // Request browser notification permission when app is unlocked
  useEffect(() => {
    if (!appUnlocked) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [appUnlocked]);

  const handleUnlock = useCallback(() => {
    fetch("/api/auth/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: String(unlockInput || "") }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setAppUnlocked(true);
          setUnlockError("");
          try { sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ts: Date.now() })); } catch {}
        } else {
          setUnlockError("Incorrect password");
        }
      })
      .catch(() => setUnlockError("Connection error — try again"));
  }, [unlockInput]);

  const handleLock = useCallback(() => {
    setAppUnlocked(false);
    setUnlockInput("");
    setUnlockError("");
    try { sessionStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
  }, []);

  const refreshNews = useCallback(async () => {
    setNewsLoading(true);
    try {
      const tickers = watchlistData.length
        ? [...watchlistData].sort((a, b) => Math.abs(b.changesPercentage || 0) - Math.abs(a.changesPercentage || 0)).slice(0, 6).map((q) => q.symbol)
        : watchlistSymbols.slice(0, 6);
      const headlines = await withClientTimeout(fetchNews(tickers, 24, providerKeys), 10000, []);
      setNewsData(Array.isArray(headlines) ? headlines : []);
    } catch {}
    setNewsLoading(false);
  }, [watchlistData, watchlistSymbols, providerKeys]);

  const fetchMarketMovers = useCallback(async () => {
    setMarketMoversLoading(true);
    try {
      const symbols = (watchlistSymbols.length ? watchlistSymbols : WATCHLIST_SYMBOLS).join(",");
      const res = await fetch(`/api/market/movers?symbols=${encodeURIComponent(symbols)}&n=5`);
      if (!res.ok) throw new Error("Movers fetch failed");
      const data = await res.json();
      setMarketMovers(data);
    } catch {}
    setMarketMoversLoading(false);
  }, [watchlistSymbols]);

  useEffect(() => {
    if (activeTab === "sectors" && !marketMovers && !marketMoversLoading) {
      fetchMarketMovers();
    }
  }, [activeTab, marketMovers, marketMoversLoading, fetchMarketMovers]);

  const loadJournalTab = useCallback(async () => {
    if (journalLoading) return;
    setJournalLoading(true);
    try {
      const [entriesRes, statsRes] = await Promise.all([
        fetch("/api/journal"),
        fetch("/api/journal/stats"),
      ]);
      const entriesData = entriesRes.ok ? await entriesRes.json() : { entries: [] };
      const statsData = statsRes.ok ? await statsRes.json() : null;
      setJournalEntries(entriesData.entries || []);
      setJournalStats(statsData);
    } catch {}
    setJournalLoading(false);
  }, [journalLoading]);

  useEffect(() => {
    if (activeTab === "journal") loadJournalTab();
  }, [activeTab]);

  // ── 5X PLAYS: live price fetch (component level — hooks must not be inside IIFEs) ──
  const FIVEX_TICKERS_DEFAULT = ["BBAI","SERV","SMR","RDW","NNE","LUNR","PL","SYM","OKLO","ASTS","PLTR","RKLB","NBIS","VRT","PWR","GSAT","APLD","ACHR","SOUN","RGTI","CORZ","PATH","KTOS","IONQ","SMCI","CCJ","BWXT","VST","CEG","GEV"];
  const FIVEX_TICKERS = [...new Set([...FIVEX_TICKERS_DEFAULT, ...customScanTickers])];
  async function fetchLivePrices() {
    setFivexLoading(true);
    setFivexError(null);
    try {
      const res  = await fetch(`/api/yahoo/quote?symbols=${FIVEX_TICKERS.join(",")}`);
      const data = await res.json();
      const map  = {};
      (Array.isArray(data) ? data : (data.quotes || [])).forEach(q => {
        if (q.symbol) map[q.symbol] = {
          price: Number(q.price  || 0),
          change: Number(q.change || 0),
          pct:   Number(q.changesPercentage || 0),
        };
      });
      setFivexPrices(map);
      setFivexFetchedAt(new Date());
    } catch (e) {
      setFivexError("Live price fetch failed — " + e.message);
    }
    setFivexLoading(false);
  }
  useEffect(() => {
    if (activeTab === "fivex" && Object.keys(fivexPrices).length === 0 && !fivexLoading) {
      fetchLivePrices();
    }
    // Auto-run smart scan when tab opens — but NEVER if a deep dive was just opened
    // (openDeepDiveFor adds a row + expands it; a re-scan would wipe it)
    if ((activeTab === "smartscan" || activeTab === "scanner") && !scanLoading && !scanExpanded) {
      const stale = !scanLastRun || (Date.now() - scanLastRun.getTime() > 20 * 60 * 1000);
      if (scanResults.length === 0 || stale) {
        runSmartScan();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  // Auto-refresh live prices every 5 min while 5X PLAYS tab is open
  useEffect(() => {
    if (activeTab !== "fivex") return;
    const t = setInterval(() => { if (!fivexLoading) fetchLivePrices(); }, 5 * 60_000);
    return () => clearInterval(t);
  }, [activeTab, fivexLoading]);

  // ── Auto-refresh Smart Scanner every 60s when on smartscan tab ───────────
  useEffect(() => {
    if (activeTab !== "smartscan" && activeTab !== "combined") return;
    const t = setInterval(() => {
      // Don't refresh while a deep dive is open — it would wipe the expanded row
      if (!scanLoading && scanResults.length > 0 && !scanExpanded) {
        runSmartScan();
      }
    }, 60_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, scanLoading]);

  // ── 7AM ET: Telegram the Green Light list for the day ──────────────────────
  useEffect(() => {
    const check = () => {
      const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
      const et = new Date(etStr);
      const h = et.getHours(), m = et.getMinutes(), wd = et.getDay();
      if (wd === 0 || wd === 6) return;            // weekend
      if (h !== 7 || m > 10) return;               // only 7:00–7:10 AM ET
      const today = et.toLocaleDateString("en-US");
      if (morningSentRef.current === today) return; // already sent today
      if (!watchlistData || watchlistData.length === 0) return;

      morningSentRef.current = today;
      const spyChgGL = Number((watchlistData.find(q => q.symbol === "SPY") ||
                               (macroData||[]).find(m2 => m2.symbol === "SPY"))?.changesPercentage || 0);
      const greens = [], yellows = [];
      watchlistData.forEach(q => {
        const px = Number(q.price || 0); if (!px) return;
        // Same engine as the Green Light card so the morning scan always agrees
        const scanRow = (scanResultsRef.current || []).find(r => r.ticker === q.symbol);
        const passed = computeGreenLight(q, spyChgGL, scanRow).passed;
        const line = `${q.symbol} $${px.toFixed(2)} (${(q.changesPercentage||0)>=0?"+":""}${(q.changesPercentage||0).toFixed(1)}%) — ${passed}/5`;
        if (passed >= 4) greens.push(line);
        else if (passed === 3) yellows.push(line);
      });
      const msg = [
        `☀️ *GREEN LIGHT — MORNING SCAN*`,
        `${new Date().toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}`,
        `Market: SPY ${spyChgGL>=0?"+":""}${spyChgGL.toFixed(2)}% ${spyChgGL > -1 ? "✅ safe" : "🚨 danger — sit out"}`,
        ``,
        greens.length ? `🟢 *READY TO BUY (${greens.length})*\n${greens.join("\n")}` : `🟢 No green lights yet — wait for setups`,
        yellows.length ? `\n🟡 *WATCH (${yellows.length})*\n${yellows.slice(0,5).join("\n")}` : "",
        ``,
        `Remember: only buy GREEN. Risk 1%. Set your stop.`,
      ].filter(Boolean).join("\n");
      fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }).catch(() => {});
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistData]);

  // ── News sentiment scoring (for next-day direction) ──────────────────────────
  useEffect(() => {
    let alive = true;
    const BULL = ["surge","soar","jump","rally","gain","rise","beat","beats","record","high","boom","upgrade","bullish","strong","growth","optimis","recover","rebound","outperform","tops","exceed","profit","breakthrough","deal","approval","cut rate","rate cut","soft landing","cools","cooling"];
    const BEAR = ["plunge","crash","tumble","fall","drop","slump","sink","miss","misses","loss","losses","weak","cut","layoff","recession","fear","selloff","sell-off","downgrade","bearish","warn","warning","slowdown","decline","slip","sinks","hike","inflation","tariff","crisis","default","bankrupt","probe","lawsuit","slumps","craters","slides"];
    const score = () => {
      fetch("/api/finviz/news?limit=40").then(r => r.json()).then(d => {
        if (!alive) return;
        const items = d.items || [];
        if (!items.length) { setNewsSentiment(null); return; }
        let bull = 0, bear = 0;
        const headlines = [];
        items.forEach(n => {
          const t = (n.title || "").toLowerCase();
          let s = 0;
          BULL.forEach(w => { if (t.includes(w)) s += 1; });
          BEAR.forEach(w => { if (t.includes(w)) s -= 1; });
          if (s > 0) bull++; else if (s < 0) bear++;
          if (s !== 0) headlines.push({ title: n.title, s });
        });
        const total = bull + bear;
        const netPct = total ? Math.round(((bull - bear) / total) * 100) : 0;
        const label = netPct >= 25 ? "BULLISH" : netPct >= 8 ? "LEAN BULLISH" : netPct <= -25 ? "BEARISH" : netPct <= -8 ? "LEAN BEARISH" : "MIXED";
        setNewsSentiment({ bull, bear, netPct, label,
          topBull: headlines.filter(h=>h.s>0).slice(0,2).map(h=>h.title),
          topBear: headlines.filter(h=>h.s<0).slice(0,2).map(h=>h.title) });
      }).catch(() => {});
    };
    score();
    const t = setInterval(score, 5 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // ── Social (StockTwits) sentiment ────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/market/social-sentiment?symbols=SPY,QQQ").then(r => r.json()).then(d => {
        if (alive && d.ok) setSocialSentiment(d);
      }).catch(() => {});
    };
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // ── TICK/TRIN on startup ─────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/market/tick-trin").then(r=>r.json()).then(d=>{ if(d.ok) setTickTrinData(d); }).catch(()=>{});
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  // ── Earnings Cal / Econ Cal / Journal Analytics tab data ────────────────────
  useEffect(() => {
    if (activeTab === "earn-cal" && !ecData && !ecLoad) {
      setEcLoad(true);
      fetch("/api/market/earnings-calendar").then(r=>r.json()).then(d=>{if(d.ok)setEcData(d);}).catch(()=>{}).finally(()=>setEcLoad(false));
    }
    if (activeTab === "econ-cal" && !evData) {
      fetch("/api/market/econ-calendar").then(r=>r.json()).then(d=>{if(d.ok)setEvData(d);}).catch(()=>{});
    }
    if (activeTab === "journal-stats" && !jData) {
      fetch("/api/journal").then(r=>r.json()).then(d=>{if(Array.isArray(d))setJData(d);else if(d.entries)setJData(d.entries);}).catch(()=>{});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Fetch short-changes and dp-heatmap when those tabs are opened ────────────
  useEffect(() => {
    if (activeTab === "short-changes" && !shortChgData) {
      fetch("/api/market/short-changes").then(r=>r.json()).then(d=>{ if(d.ok) setShortChgData(d); }).catch(()=>{});
    }
    if (activeTab === "dp-heatmap" && !dpHeatData) {
      fetch("/api/market/darkpool-heatmap").then(r=>r.json()).then(d=>{ if(d.ok) setDpHeatData(d); }).catch(()=>{});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Institutional Radar + Trade Signals + Fear&Greed — top-level effects ────
  useEffect(() => {
    // Auto-load Fear & Greed on Monitor tab open (4s delay so watchlist loads first)
    const t = setTimeout(() => { fetchFearGreed(); }, 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDistLoading(true);
      fetch("/api/market/distribution")
        .then(r => r.json()).then(d => { if (d.ok) setDistData(d); })
        .catch(() => {}).finally(() => setDistLoading(false));
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // ── Futures + Pre-Market Movers + Event Countdowns ────────────────────────
  useEffect(() => {
    const load = () => {
      fetch("/api/market/futures").then(r => r.ok ? r.json() : null).then(d => { if (d?.ok) setFuturesData(d.futures || []); }).catch(() => {});
      fetch("/api/market/premarket-movers").then(r => r.ok ? r.json() : null).then(d => { if (d?.ok) setPreMktMovers(d.movers || []); }).catch(() => {});
      fetch("/api/market/event-countdowns").then(r => r.ok ? r.json() : null).then(d => { if (d?.ok) setEventCountdowns(d.events || []); }).catch(() => {});
    };
    const t = setTimeout(load, 2500);
    const iv = setInterval(load, 60_000); // refresh every 1 min with the rest of monitor
    return () => { clearTimeout(t); clearInterval(iv); };
  }, []);

  useEffect(() => {
    const fetchSigs = () => {
      setSigLoading(true);
      fetch("/api/market/trade-signals")
        .then(r => r.json()).then(d => { if (d.ok) setSigData(d); })
        .catch(() => {}).finally(() => setSigLoading(false));
    };
    // Initial load after 2s
    const init = setTimeout(fetchSigs, 2000);
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchSigs, 60_000);
    return () => { clearTimeout(init); clearInterval(interval); };
  }, []);

  // ── Daily Max Loss Lock — runs after portfolioSummary is set ─────────────────
  // NOTE: portfolioSummary is declared later via useMemo — this effect reads
  // the current value from a ref to avoid the TDZ issue.
  const _dailyMaxLossRef = React.useRef(dailyMaxLoss);
  _dailyMaxLossRef.current = dailyMaxLoss;

  // ── Morning Brief auto-run (#5) ────────────────────────────────────────────
  // On weekdays between 6:30 AM–9:30 AM ET: auto-generate briefing if not done today
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const etStr  = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
        const etDate = new Date(etStr);
        const h = etDate.getHours();
        const m = etDate.getMinutes();
        const day = etDate.getDay(); // 0=Sun 6=Sat
        const isWeekday = day >= 1 && day <= 5;
        const isMorning = (h === 6 && m >= 30) || (h >= 7 && h < 9) || (h === 9 && m <= 30);
        const alreadyGenerated = premktBriefing && premktAt &&
          new Date(premktAt).toDateString() === etDate.toDateString();
        if (isWeekday && isMorning && !alreadyGenerated && !premktLoading) {
          console.log("[AutoBrief] Morning window detected — auto-generating briefing");
          fetchPremarketBriefing();
        }
      } catch {}
    }, 2000); // check 2s after mount
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Smart Scanner: scoring + scan + deep-dive ───────────────────────────
  function scoreTicker(ticker, quote, candles) {
    let score = 50;
    const signals = [];
    const price   = Number(quote?.price || 0);
    const ref     = FIVEX_REF[ticker];

    // ── RSI ────────────────────────────────────────────────────────────────
    const rsiArr = candles?.indicators?.rsi || [];
    const rsiVal = rsiArr.length ? Number(rsiArr.at(-1)?.value) : null;
    if (rsiVal !== null && !isNaN(rsiVal)) {
      if      (rsiVal < 25) { score += 22; signals.push({ txt: `RSI ${rsiVal.toFixed(0)} — OVERSOLD`,   bull: true  }); }
      else if (rsiVal < 35) { score += 14; signals.push({ txt: `RSI ${rsiVal.toFixed(0)} — WEAK`,       bull: true  }); }
      else if (rsiVal < 50) { score +=  7; }
      else if (rsiVal > 75) { score -= 12; signals.push({ txt: `RSI ${rsiVal.toFixed(0)} — OVERBOUGHT`, bull: false }); }
      else if (rsiVal > 65) { score -=  5; }
    }

    // ── MACD ───────────────────────────────────────────────────────────────
    const macdArr  = candles?.indicators?.macd || [];
    const macdLast = macdArr.length ? macdArr.at(-1)  : null;
    const macdPrev = macdArr.length >= 2 ? macdArr.at(-2) : null;
    let macdBull   = null;
    if (macdLast) {
      macdBull = Number(macdLast.macd) > Number(macdLast.signal);
      if (macdBull) { score += 12; signals.push({ txt: "MACD BULLISH CROSSOVER",  bull: true  }); }
      else          { score -=  5; signals.push({ txt: "MACD BEARISH",             bull: false }); }
      if (macdPrev) {
        const histNow  = Number(macdLast.histogram);
        const histPrev = Number(macdPrev.histogram);
        if (!isNaN(histNow) && !isNaN(histPrev) && histNow > histPrev) {
          score += 5; signals.push({ txt: "MACD HISTOGRAM RISING ↑", bull: true });
        }
      }
    }

    // ── EMA position ──────────────────────────────────────────────────────
    const ema9Arr  = candles?.indicators?.ema9  || [];
    const ema21Arr = candles?.indicators?.ema21 || [];
    const ema9v    = ema9Arr.length  ? Number(ema9Arr.at(-1)?.value)  : null;
    const ema21v   = ema21Arr.length ? Number(ema21Arr.at(-1)?.value) : null;
    if (ema9v  && price > 0) {
      if (price > ema9v)           { score += 5;  signals.push({ txt: "ABOVE EMA9",          bull: true  }); }
      if (price < ema9v * 0.94)    { score += 8;  signals.push({ txt: "FAR BELOW EMA9 ← BOUNCE?", bull: true }); }
    }
    if (ema21v && price > 0) {
      if (price > ema21v)          { score += 8;  signals.push({ txt: "ABOVE EMA21",         bull: true  }); }
      else                         { score -= 3;  signals.push({ txt: "BELOW EMA21",          bull: false }); }
    }

    // ── Entry zone vs 5X ref data ─────────────────────────────────────────
    if (ref && price > 0) {
      if      (price <= ref.stop)    { score -= 20; signals.push({ txt: "⚠ BELOW STOP LEVEL",    bull: false }); }
      else if (price <= ref.e3)      { score += 20; signals.push({ txt: "🟢 DEEP VALUE ZONE",     bull: true  }); }
      else if (price <= ref.e2)      { score += 13; signals.push({ txt: "⚡ BETTER ENTRY ZONE",   bull: true  }); }
      else if (price <= ref.e1)      { score +=  7; signals.push({ txt: "🔵 STARTER ENTRY ZONE",  bull: true  }); }
      else if (price >= ref.trigger) { score -=  5; signals.push({ txt: "ABOVE BREAKOUT TRIGGER", bull: false }); }
    }

    // ── 52-week range position ────────────────────────────────────────────
    const yH = Number(quote?.yearHigh || 0);
    const yL = Number(quote?.yearLow  || 0);
    if (yH > yL && price > 0) {
      const pos = (price - yL) / (yH - yL);
      if      (pos < 0.20) { score += 15; signals.push({ txt: "NEAR 52W LOW ← VALUE",    bull: true  }); }
      else if (pos < 0.35) { score +=  8; }
      else if (pos > 0.90) { score -=  8; signals.push({ txt: "NEAR 52W HIGH → CAUTION", bull: false }); }
      else if (pos > 0.75) { score -=  3; }
    }

    // ── Volume vs average ─────────────────────────────────────────────────
    const vol    = Number(quote?.volume    || 0);
    const avgVol = Number(quote?.avgVolume || 0);
    if (vol > 0 && avgVol > 0) {
      const vr = vol / avgVol;
      if      (vr > 2.5) { score += 12; signals.push({ txt: `VOL SPIKE ${vr.toFixed(1)}×`,  bull: true  }); }
      else if (vr > 1.5) { score +=  6; signals.push({ txt: "VOL ABOVE AVG",                 bull: true  }); }
      else if (vr < 0.4) { score -=  5; signals.push({ txt: "LOW VOLUME — WEAK CONVICTION",  bull: false }); }
    }

    // ── Momentum (1-week move) ────────────────────────────────────────────
    const d1w = Number(quote?.delta1w || 0);
    if      (d1w < -15) { score += 12; signals.push({ txt: `OVERSOLD 1W (${d1w.toFixed(1)}%) ← REVERSAL?`, bull: true  }); }
    else if (d1w < -6)  { score +=  6; signals.push({ txt: `PULLBACK 1W (${d1w.toFixed(1)}%)`,              bull: true  }); }
    else if (d1w > 20)  { score -=  8; signals.push({ txt: `EXTENDED 1W (+${d1w.toFixed(1)}%) ← CHASING`,  bull: false }); }

    // ── Sentiment from news keywords ──────────────────────────────────────
    const BULL_KW = ["win","award","contract","surge","beat","record","launch","expand","partnership","upgrade","buy","strong","profit","revenue","growth","milestone"];
    const BEAR_KW = ["fall","drop","loss","miss","cut","layoff","lawsuit","probe","fraud","decline","sell","downgrade","concern","risk","fail","delay","cancel","warning"];
    const news = (scanDeepData[ticker]?.news || []);
    let bullKw = 0, bearKw = 0;
    news.forEach(n => {
      const t = (n.title + " " + (n.summary || "")).toLowerCase();
      BULL_KW.forEach(w => { if (t.includes(w)) bullKw++; });
      BEAR_KW.forEach(w => { if (t.includes(w)) bearKw++; });
    });
    const sentScore = Math.min(10, bullKw) - Math.min(10, bearKw);
    score += sentScore;
    if (sentScore >= 4)  signals.push({ txt: "SENTIMENT BULLISH 📰", bull: true  });
    if (sentScore <= -4) signals.push({ txt: "SENTIMENT BEARISH 📰", bull: false });

    // Clamp 5-97
    score = Math.max(5, Math.min(97, Math.round(score)));

    // Signal label
    let signal, sColor;
    if      (score >= 78) { signal = "STRONG BUY"; sColor = "#00e676"; }
    else if (score >= 63) { signal = "BUY";         sColor = "#4caf50"; }
    else if (score >= 48) { signal = "WATCH";       sColor = "#26a69a"; }
    else if (score >= 35) { signal = "NEUTRAL";     sColor = "#ffaa00"; }
    else                  { signal = "AVOID";        sColor = "#ff4444"; }

    return { ticker, score, signal, sColor, signals, rsiVal, macdBull, ema9v, ema21v, ref };
  }

  async function runSmartScan() {
    setScanLoading(true);
    setScanError(null);
    setScanResults([]);
    setScanProgress({ done: 0, total: FIVEX_TICKERS.length });
    try {
      setScanProgress({ done: 2, total: FIVEX_TICKERS.length });
      const res  = await fetch(`/api/scanner/smart-scan?tickers=${FIVEX_TICKERS.join(",")}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Scan failed");
      setScanProgress({ done: FIVEX_TICKERS.length, total: FIVEX_TICKERS.length });
      const scored = (data.results || [])
        .map(({ ticker, quote, candles }) => ({
          ...scoreTicker(ticker, quote, candles),
          quote, candles,
        }))
        .sort((a, b) => b.score - a.score);
      setScanResults(scored);
      setScanLastRun(new Date());
      // Pre-warm deep dive for top 3 results (loads in background so clicking is instant)
      setTimeout(() => {
        scored.slice(0, 3).forEach(r => {
          if (!scanDeepData[r.ticker]) {
            loadDeepDive(r.ticker);
            loadDeepSocial(r.ticker);
          }
        });
      }, 2000); // 2s delay so UI renders first
      // Save to scan history (keep last 8)
      setScanHistory(prev => [{
        ts: new Date(),
        topBuys: scored.filter(r => r.signal === "STRONG BUY" || r.signal === "BUY").slice(0,3).map(r => ({ ticker: r.ticker, score: r.score, signal: r.signal })),
        topSells: scored.filter(r => r.signal === "AVOID").slice(0,2).map(r => ({ ticker: r.ticker, score: r.score })),
        total: scored.length,
      }, ...prev].slice(0, 8));
    } catch (e) {
      setScanError(e.message);
    }
    setScanLoading(false);
  }

  // ── Add / remove a custom ticker — scans it immediately ─────────────────
  async function addScanTicker(rawSym) {
    const sym = rawSym.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    if (!sym) return;
    const allCurrent = new Set([...FIVEX_TICKERS_DEFAULT, ...customScanTickers]);
    if (allCurrent.has(sym)) { setScanTickerInput(""); return; }

    // Persist immediately so FIVEX_TICKERS picks it up
    const next = [...customScanTickers, sym];
    setCustomScanTickers(next);
    localStorage.setItem("custom_scan_tickers", JSON.stringify(next));
    setScanTickerInput("");

    // Instantly scan this one ticker and merge into results
    try {
      const res  = await fetch(`/api/scanner/smart-scan?tickers=${sym}`);
      const data = await res.json();
      if (!data.ok || !data.results?.length) return;
      const [{ ticker, quote, candles }] = data.results;
      const scored = { ...scoreTicker(ticker, quote, candles), quote, candles };
      setScanResults(prev => {
        // Replace if already present, otherwise prepend
        const exists = prev.some(r => r.ticker === ticker);
        const updated = exists
          ? prev.map(r => r.ticker === ticker ? scored : r)
          : [scored, ...prev];
        return updated.sort((a, b) => b.score - a.score);
      });
    } catch { /* silent — ticker still added to list */ }
  }

  function removeScanTicker(sym) {
    const next = customScanTickers.filter(s => s !== sym);
    setCustomScanTickers(next);
    localStorage.setItem("custom_scan_tickers", JSON.stringify(next));
    // Remove from results too
    setScanResults(prev => prev.filter(r => r.ticker !== sym));
  }

  // ── Auto-scan interval ───────────────────────────────────────────────────
  useEffect(() => {
    if (autoScanRef.current) { clearInterval(autoScanRef.current); autoScanRef.current = null; }
    if (!autoScanOn) { setAutoScanCountdown(0); return; }
    const totalSecs = autoScanMins * 60;
    setAutoScanCountdown(totalSecs);
    let remaining = totalSecs;
    autoScanRef.current = setInterval(() => {
      remaining -= 1;
      setAutoScanCountdown(remaining);
      if (remaining <= 0) {
        remaining = totalSecs;
        setAutoScanCountdown(totalSecs);
        runSmartScan();
      }
    }, 1000);
    return () => { if (autoScanRef.current) clearInterval(autoScanRef.current); };
  }, [autoScanOn, autoScanMins]);

  // One-call helper: open the full deep dive for any ticker from anywhere
  function openDeepDiveFor(sym, quote) {
    if (!sym) return;
    // Clear all filters so the row is always visible
    setSfSig("ALL"); setSfMinScore(0);
    try { setSfZone && setSfZone("ALL"); } catch {}
    try { setSfMaxPrice && setSfMaxPrice(0); } catch {}
    // Add the row if it isn't already present
    setScanResults(prev => prev.some(r => r.ticker === sym) ? prev : [{
      ticker: sym, score: 50, signal: "WATCH", scannerScore: 50, signals: [], sColor: "#f59e0b",
      quote: quote || { price: 0, changePercent: 0 }, candles: null,
      rsiVal: null, macdBull: null, ema9v: null, ema21v: null,
    }, ...prev]);
    // Set expanded IMMEDIATELY (before tab switch) so the auto-scan guard sees it
    setScanExpanded(sym);
    setActiveTab("smartscan");
    setTimeout(() => { setScanExpanded(sym); loadDeepDive(sym); loadDeepSocial(sym); }, 150);
    setTimeout(() => { try { fetchTradeSetup(sym, { ticker: sym, score: 50, signal: "WATCH", signals: [], quote: quote || { price: 0 } }); } catch {} }, 1400);
  }

  async function loadDeepDive(ticker) {
    if (scanDeepData[ticker]) return;
    setScanDeepLoad(prev => ({ ...prev, [ticker]: true }));
    try {
      const [fundR, newsR, shortR, insiderR, optionsR, smcR, fvR] = await Promise.allSettled([
        fetch(`/api/yahoo/fundamentals?symbol=${ticker}`).then(r => r.json()),
        fetch(`/api/yahoo/news?tickers=${ticker}&limit=6`).then(r => r.json()),
        fetch(`/api/yahoo/short-interest?symbol=${ticker}`).then(r => r.json()),
        fetch(`/api/yahoo/insider?symbol=${ticker}`).then(r => r.json()),
        fetch(`/api/yahoo/options?symbol=${ticker}`).then(r => r.json()),
        fetch(`/api/market/smc?symbol=${ticker}`).then(r => r.json()),
        // Finviz stats — primary source for analyst data (Yahoo v10 returns 401)
        fetch(`/api/finviz/quote?symbol=${ticker}`).then(r => r.json()),
      ]);
      const fv = fvR.status === "fulfilled" ? fvR.value : null;
      const raw = fv?.raw || {};
      // Parse Finviz raw fields into normalized analyst/ownership data
      const fvData = fv ? {
        targetPrice:      parseFloat((raw["Target Price"] || "0").replace(/[^0-9.]/g,"")) || null,
        recom:            parseFloat(raw["Recom"] || "0") || null,  // 1=StrongBuy 5=StrongSell
        shortFloat:       parseFloat((raw["Short Float"] || "0").replace(/[^0-9.]/g,"")) || null,
        shortRatio:       parseFloat(raw["Short Ratio"] || "0") || null,
        beta:             parseFloat(raw["Beta"] || "0") || null,
        pe:               parseFloat(raw["P/E"] || "0") || null,
        forwardPE:        parseFloat(raw["Forward P/E"] || "0") || null,
        peg:              parseFloat(raw["PEG"] || "0") || null,
        pb:               parseFloat(raw["P/B"] || "0") || null,
        institutionalPct: parseFloat((raw["Inst Own"] || "0").replace(/[^0-9.]/g,"")) || null,
        insiderPct:       parseFloat((raw["Insider Own"] || "0").replace(/[^0-9.]/g,"")) || null,
        insiderTrans:     raw["Insider Trans"] || null,
        rsi14:            fv.rsi14 || null,
        roe:              parseFloat((raw["ROE"] || "0").replace(/[^0-9.-]/g,"")) || null,
        profitMargin:     parseFloat((raw["Profit Margin"] || "0").replace(/[^0-9.-]/g,"")) || null,
        grossMargin:      parseFloat((raw["Gross Margin"] || "0").replace(/[^0-9.-]/g,"")) || null,
      } : null;
      setScanDeepData(prev => ({
        ...prev,
        [ticker]: {
          fundamentals: fundR.status    === "fulfilled" ? fundR.value    : null,
          news:         newsR.status    === "fulfilled" ? (Array.isArray(newsR.value) ? newsR.value : []) : [],
          short:        shortR.status   === "fulfilled" ? shortR.value   : null,
          insider:      insiderR.status === "fulfilled" ? insiderR.value : null,
          options:      optionsR.status === "fulfilled" ? optionsR.value : null,
          smc:          smcR.status     === "fulfilled" && smcR.value?.ok ? smcR.value : null,
          fv:           fvData,
        },
      }));
    } catch {}
    setScanDeepLoad(prev => ({ ...prev, [ticker]: false }));
  }

  async function loadDeepSocial(ticker) {
    if (deepSocialData[ticker]) return;
    setDeepSocialLoad(prev => ({ ...prev, [ticker]: true }));
    try {
      const r = await fetch(`/api/market/social?ticker=${encodeURIComponent(ticker)}`);
      const d = r.ok ? await r.json() : null;
      setDeepSocialData(prev => ({ ...prev, [ticker]: d || {} }));
    } catch {
      setDeepSocialData(prev => ({ ...prev, [ticker]: {} }));
    }
    setDeepSocialLoad(prev => ({ ...prev, [ticker]: false }));
  }

  async function fetchTradeSetup(ticker, row) {
    if (tradeSetupLoad[ticker]) return;
    setTradeSetupLoad(prev => ({ ...prev, [ticker]: true }));
    setTradeSetupError(prev => ({ ...prev, [ticker]: null }));
    const deep = scanDeepData[ticker] || {};
    try {
      const res = await fetch("/api/agent/trade-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          score:      row.score,
          signal:     row.signal,
          signals:    row.signals || [],
          rsiVal:     row.rsiVal,
          macdBull:   row.macdBull,
          ema9v:      row.ema9v,
          ema21v:     row.ema21v,
          livePrice:  row.quote?.price,
          liveChg:    row.quote?.changePercent,
          ref:        row.ref,
          fundamentals: deep.fundamentals || null,
          news:         deep.news || [],
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "AI setup failed");
      setTradeSetups(prev => ({ ...prev, [ticker]: { plan: data.plan, generatedAt: data.generatedAt } }));
    } catch (e) {
      setTradeSetupError(prev => ({ ...prev, [ticker]: e.message }));
    }
    setTradeSetupLoad(prev => ({ ...prev, [ticker]: false }));
  }

  // ── Pre-Market Briefing ───────────────────────────────────────────────────
  async function fetchPremarketBriefing() {
    setPremktLoading(true);
    try {
      const wl = watchlistData || [];
      const md = macroData || [];

      const spy  = md.find(m => m.symbol === "SPY");
      const qqq  = md.find(m => m.symbol === "QQQ");
      const iwm  = md.find(m => m.symbol === "IWM");
      const vix  = md.find(m => m.symbol === "VIX" || m.symbol === "^VIX");
      const usd  = md.find(m => m.symbol === "DXY" || m.symbol === "UUP");
      const oil  = md.find(m => m.symbol === "USO" || m.symbol === "CL=F");
      const btc  = md.find(m => m.symbol === "BTCUSD" || m.symbol === "BTC-USD");

      const chg = s => Number(s?.changesPercentage || 0);

      const advancers = wl.filter(q => chg(q) > 0).length;
      const decliners = wl.filter(q => chg(q) < 0).length;
      const breadthPct = wl.length ? Math.round(advancers / wl.length * 100) : 50;

      const topGainers = [...wl].sort((a,b) => chg(b)-chg(a)).slice(0,5)
        .map(q => ({ symbol: q.symbol, chg: chg(q), rvol: Number(q.rvol||1) }));
      const topLosers  = [...wl].sort((a,b) => chg(a)-chg(b)).slice(0,5)
        .map(q => ({ symbol: q.symbol, chg: chg(q), rvol: Number(q.rvol||1) }));
      const topLongs   = [...wl].filter(q=>chg(q)>0)
        .sort((a,b)=>(Number(b.relVsSpy||0)+Number(b.rvol||1))-(Number(a.relVsSpy||0)+Number(a.rvol||1)))
        .slice(0,8).map(q=>({ symbol: q.symbol, relVsSpy: Number(q.relVsSpy||0), rvol: Number(q.rvol||1), composite: Number(q.composite||0), chg: chg(q) }));
      const topRisks   = [...wl].filter(q=>chg(q)<-1)
        .sort((a,b)=>chg(a)-chg(b)).slice(0,5)
        .map(q=>({ symbol: q.symbol, chg: chg(q), rvol: Number(q.rvol||1) }));
      const rotation   = (rotationRank||[]).slice(0,8).map(q=>({ symbol:q.symbol, relVsSpy:Number(q.relVsSpy||0), rvol:Number(q.rvol||1) }));

      const indexMoves = md.slice(0,8).map(m => ({ label: m.symbol||"", value: chg(m), price: Number(m.price||0) }));

      const earningsUpcoming = (earningsRows||[]).filter(e => {
        try { const d = new Date(e.date||e.earningsDate); const diff = (d - new Date()) / 86400000; return diff >= -1 && diff <= 14; } catch { return false; }
      }).slice(0,8).map(e => ({ symbol: e.symbol||e.ticker, date: e.date||e.earningsDate, timing: e.timing||"" }));

      const sectorSnap = (sectorData||[]).slice(0,11).map(s=>({ symbol:s.symbol, chg: chg(s) }));
      const sectorPos  = sectorSnap.filter(s=>s.chg>0).length;
      const sectorNeg  = sectorSnap.filter(s=>s.chg<0).length;

      const alerts = (combinedAlerts||[]).slice(0,6).map(a=>({ symbol:a.symbol, score:a.score||0, text:(a.text||"").slice(0,80) }));

      const newsHeadlines = (newsData||[]).slice(0,8).map(n=>({ ticker:n.ticker||"MKT", title:(n.title||n.headline||"").slice(0,120) }));

      const res = await fetch("/api/agent/premarket", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regime, macroTone, session: marketSession,
          flowBias, flowCallNotional, flowPutNotional,
          spy: { chg: chg(spy) }, qqq: { chg: chg(qqq) }, iwm: { chg: chg(iwm) },
          vix: { chg: chg(vix) }, usd: { chg: chg(usd) }, oil: { chg: chg(oil) }, btc: { chg: chg(btc) },
          breadth: { advancers, decliners, breadthPct },
          topGainers, topLosers, topLongs, topRisks, rotation,
          indexMoves, earningsUpcoming, sectorSnap, sectorBreadth: { positive: sectorPos, negative: sectorNeg },
          alerts, newsHeadlines,
          riskAccount: Number(riskAccount||50000), riskPct: Number(riskPct||1),
        }),
      });
      const data = await res.json();
      if (data.ok) { setPremktBriefing(data.briefing); setPremktAt(data.generatedAt); }
      else throw new Error(data.error || "Briefing failed");
    } catch (e) {
      setPremktBriefing("Error: " + e.message);
    }
    setPremktLoading(false);
  }

  // ── Fibonacci Calculator ──────────────────────────────────────────────────
  async function fetchFibonacci(ticker) {
    setFibLoading(true); setFibError(""); setFibData(null);
    try {
      const res = await fetch(`/api/market/candles?ticker=${encodeURIComponent(ticker)}&timeframe=1D`);
      const data = await res.json();
      if (!data.ok || !data.bars || data.bars.length < 20) throw new Error("Not enough candle data");
      const bars = data.bars.slice(-90);
      const highs = bars.map(b => b.high);
      const lows  = bars.map(b => b.low);
      const swingHigh = Math.max(...highs);
      const swingLow  = Math.min(...lows);
      const range = swingHigh - swingLow;
      const last  = bars[bars.length - 1].close;
      const RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];
      const LABELS = ["0% (Low)", "23.6%", "38.2%", "50%", "61.8% (Golden)", "78.6%", "100% (High)", "127.2% (Ext)", "161.8% (Ext)"];
      const levels = RATIOS.map((r, i) => ({
        label: LABELS[i], ratio: r,
        price: swingLow + range * r,
        isKey: [0.382, 0.5, 0.618].includes(r),
        isExt: r > 1,
      }));
      setFibData({ ticker, swingHigh, swingLow, levels, lastPrice: last, highIdx: highs.indexOf(swingHigh), lowIdx: lows.indexOf(swingLow) });
    } catch (e) {
      setFibError(e.message);
    }
    setFibLoading(false);
  }

  // ── Halal Check ───────────────────────────────────────────────────────────
  async function fetchHalalCheck(ticker) {
    setHalalLoading(true); setHalalError(""); setHalalReport(null);
    try {
      // Fetch fundamentals first
      const fRes = await fetch(`/api/market/fundamentals?ticker=${encodeURIComponent(ticker)}`).catch(() => null);
      let fund = {};
      if (fRes?.ok) { try { fund = await fRes.json(); } catch {} }
      const res = await fetch("/api/agent/halal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, company: fund.name || ticker, sector: fund.sector || "Unknown", description: fund.description || "", debtRatio: fund.debtRatio, interestRatio: fund.interestRatio, cashRatio: fund.cashRatio }),
      });
      const data = await res.json();
      if (data.ok) setHalalReport({ ticker, report: data.report, at: data.generatedAt });
      else throw new Error(data.error || "Halal check failed");
    } catch (e) {
      setHalalError(e.message);
    }
    setHalalLoading(false);
  }

  // ── Journal AI Review ─────────────────────────────────────────────────────
  async function fetchJournalReview() {
    setJournalRevLoad(true); setJournalRevError("");
    try {
      const res = await fetch("/api/agent/journal-review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: journalEntries }),
      });
      const data = await res.json();
      if (data.ok) setJournalReview({ text: data.review, at: data.generatedAt });
      else throw new Error(data.error || "Review failed");
    } catch (e) {
      setJournalRevError(e.message);
    }
    setJournalRevLoad(false);
  }

  // ── News Sentiment Scorer ─────────────────────────────────────────────────
  async function scoreNewsSentiment() {
    setNewsSentLoading(true);
    try {
      const headlines = (newsData || []).slice(0, 25).map(n => n.title || n.headline || "");
      const res = await fetch("/api/agent/sentiment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headlines }),
      });
      const data = await res.json();
      if (data.ok) {
        const map = {};
        (data.results || []).forEach((r, i) => { if (headlines[r.i - 1]) map[headlines[r.i - 1]] = r; });
        setNewsSentiments(map);
      }
    } catch {}
    setNewsSentLoading(false);
  }

  // ── Short Interest Fetch ──────────────────────────────────────────────────
  async function fetchShortInterest(tickerStr) {
    setShortIntLoading(true);
    try {
      const tickers = tickerStr.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 30);
      const res = await fetch(`/api/market/short-interest?tickers=${tickers.join(",")}`);
      const data = await res.json();
      if (data.ok) setShortIntData(data.results || []);
    } catch {}
    setShortIntLoading(false);
  }

  // ── Correlation Calculator ────────────────────────────────────────────────
  async function computeCorrelation() {
    setCorrLoading(true);
    try {
      // Use available candle data from scanDeepData
      const syms = Object.keys(scanDeepData).filter(t => scanDeepData[t]?.candles?.length >= 20);
      if (syms.length < 2) { setCorrMatrix({ error: "Run Smart Scan first to load candle data (need ≥2 tickers)" }); setCorrLoading(false); return; }
      // Build returns matrix
      const returnsBySym = {};
      for (const s of syms) {
        const bars = scanDeepData[s].candles;
        const closes = bars.map(b => b.close).filter(Number.isFinite);
        const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
        returnsBySym[s] = returns;
      }
      // Normalize to same length (min length)
      const minLen = Math.min(...Object.values(returnsBySym).map(r => r.length));
      const trimmed = {};
      for (const s of syms) trimmed[s] = returnsBySym[s].slice(-minLen);
      // Compute pairwise Pearson
      const pearson = (a, b) => {
        const n = a.length;
        const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
        let num = 0, da = 0, db = 0;
        for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
        return da && db ? num / Math.sqrt(da * db) : 0;
      };
      const matrix = {};
      for (const s1 of syms) { matrix[s1] = {}; for (const s2 of syms) matrix[s1][s2] = Number(pearson(trimmed[s1], trimmed[s2]).toFixed(2)); }
      setCorrMatrix({ syms, matrix, computedAt: new Date().toISOString() });
    } catch (e) {
      setCorrMatrix({ error: e.message });
    }
    setCorrLoading(false);
  }

  // ── Smart Money: Insider + Institutional ─────────────────────────────────
  async function fetchInsiderData(ticker) {
    setInsiderLoading(true);
    setInsiderData(null); setInstData(null);
    try {
      const res  = await fetch(`/api/market/insider?ticker=${encodeURIComponent(ticker)}`);
      const data = res.ok ? await res.json() : { error: "Failed" };
      setInsiderTicker(ticker);
      if (data.error) { setInsiderData({ error: data.error }); setInsiderLoading(false); return; }
      // Backend returns { insiderTransactions: {...transactions,holders}, institutional: {...institutions,funds} }
      // Merge into one flat object so the render code works with a single variable
      const txn  = data.insiderTransactions  || {};
      const inst = data.institutional        || {};
      setInsiderData({
        symbol:           ticker.toUpperCase(),
        transactions:     txn.transactions    || [],
        holders:          txn.holders         || [],
        insidersPct:      inst.insidersPct    ?? null,   // already 0-100 percent
        institutionsPct:  inst.institutionsPct ?? null,  // already 0-100 percent
        institutions:     inst.institutions   || [],
        funds:            inst.funds          || [],
      });
    } catch (e) {
      setInsiderData({ error: e.message });
    }
    setInsiderLoading(false);
  }

  // ── Social Sentiment ──────────────────────────────────────────────────────
  async function fetchSocialSentiment(ticker) {
    setSocialLoading(true);
    setSocialData(null);
    try {
      const res = await fetch(`/api/market/social?ticker=${encodeURIComponent(ticker)}`);
      const data = res.ok ? await res.json() : { error: "Failed" };
      setSocialTicker(ticker);
      setSocialData(data);
    } catch (e) {
      setSocialData({ error: e.message });
    }
    setSocialLoading(false);
  }

  // ── Analyst Ratings ───────────────────────────────────────────────────────
  async function fetchAnalystRatings(ticker) {
    setAnalystLoading(true);
    setAnalystData(null);
    try {
      const res = await fetch(`/api/market/analyst?tickers=${encodeURIComponent(ticker)}`);
      const data = res.ok ? await res.json() : { error: "Failed" };
      setAnalystTicker(ticker);
      // Backend wraps array in { ok, results: [...], fetchedAt }
      setAnalystData(data.results?.[0] || data);
    } catch (e) {
      setAnalystData({ error: e.message });
    }
    setAnalystLoading(false);
  }

  // ── Dividend Calendar ─────────────────────────────────────────────────────
  async function fetchDividendCalendar() {
    setDividendLoading(true);
    try {
      const tickers = watchlistData.length > 0
        ? watchlistData.slice(0, 20).map(w => w.ticker).join(",")
        : "AAPL,MSFT,JNJ,PG,KO,VZ,T,XOM,CVX,MCD,DIS,HD,WMT,PFE,MRK";
      const res = await fetch(`/api/market/dividends?tickers=${encodeURIComponent(tickers)}`);
      const data = res.ok ? await res.json() : {};
      // Backend wraps array in { ok, results: [...], fetchedAt }
      setDividendData(data.results || []);
    } catch (e) {
      setDividendData([]);
    }
    setDividendLoading(false);
  }

  // ── AI Pattern Recognizer ─────────────────────────────────────────────────
  async function fetchAIPattern(ticker) {
    setPatternLoading(true);
    setPatternResult(null);
    try {
      // Get candle data first
      const cRes = await fetch(`/api/market/candles?ticker=${encodeURIComponent(ticker)}&timeframe=1d`);
      const cData = cRes.ok ? await cRes.json() : null;
      if (!cData?.bars?.length) { setPatternResult({ error: "No candle data available" }); setPatternLoading(false); return; }
      const bars = cData.bars.slice(-60); // last 60 days
      const res = await fetch("/api/agent/pattern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, bars }),
      });
      const data = res.ok ? await res.json() : { error: "AI request failed" };
      setPatternTicker(ticker);
      setPatternResult(data);
    } catch (e) {
      setPatternResult({ error: e.message });
    }
    setPatternLoading(false);
  }

  // ── Macro Scenario Planner ────────────────────────────────────────────────
  async function fetchMacroScenario(prompt) {
    if (!prompt.trim()) return;
    setScenarioLoading(true);
    setScenarioResult(null);
    try {
      const holdings = portfolioRows.slice(0, 10).map(p => ({ ticker: p.ticker, shares: p.shares, value: (p.shares * (p.currentPrice || p.avgCost)) }));
      const res = await fetch("/api/agent/macro-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: prompt, holdings }),
      });
      const data = res.ok ? await res.json() : { error: "AI request failed" };
      setScenarioResult(data);
    } catch (e) {
      setScenarioResult({ error: e.message });
    }
    setScenarioLoading(false);
  }

  // ── Earnings Call Summarizer ──────────────────────────────────────────────
  async function summarizeEarningsCall() {
    if (!earningsCallText.trim()) return;
    setEarningsCallLoad(true);
    setEarningsCallResult(null);
    try {
      const res = await fetch("/api/agent/earnings-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: earningsCallText.slice(0, 12000) }),
      });
      const data = res.ok ? await res.json() : { error: "AI request failed" };
      setEarningsCallResult(data);
    } catch (e) {
      setEarningsCallResult({ error: e.message });
    }
    setEarningsCallLoad(false);
  }

  // ── Session Recap ─────────────────────────────────────────────────────────
  async function generateSessionRecap() {
    setSessionRecapLoad(true);
    setSessionRecapResult(null);
    try {
      const closedToday = journalEntries.filter(e => {
        if (!e.exitDate) return false;
        const d = new Date(e.exitDate);
        const today = new Date();
        return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
      });
      const res = await fetch("/api/agent/session-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trades: closedToday.length > 0 ? closedToday : journalEntries.slice(-5), macroRegime: regime }),
      });
      const data = res.ok ? await res.json() : { error: "AI request failed" };
      setSessionRecapResult(data);
    } catch (e) {
      setSessionRecapResult({ error: e.message });
    }
    setSessionRecapLoad(false);
  }

  // ── DCA Calculator ────────────────────────────────────────────────────────
  function computeDCA() {
    const amount   = parseFloat(dcaAmount)  || 0;
    const months   = parseInt(dcaMonths)    || 24;
    const annRet   = parseFloat(dcaReturn)  || 10;
    const periods  = dcaPeriod === "weekly" ? months * 4.33 : dcaPeriod === "daily" ? months * 30 : months;
    const r        = (annRet / 100) / (dcaPeriod === "weekly" ? 52 : dcaPeriod === "daily" ? 365 : 12);
    // Future value of a series: FV = P * ((1+r)^n - 1) / r
    const fv       = r > 0 ? amount * ((Math.pow(1 + r, periods) - 1) / r) : amount * periods;
    const invested = amount * periods;
    const gain     = fv - invested;
    // Build equity curve (sampled at monthly intervals for chart)
    const curve = [];
    const perPeriodInMonth = dcaPeriod === "weekly" ? 4.33 : dcaPeriod === "daily" ? 30 : 1;
    for (let m = 1; m <= months; m++) {
      const n = m * perPeriodInMonth;
      const val = r > 0 ? amount * ((Math.pow(1 + r, n) - 1) / r) : amount * n;
      curve.push({ month: m, value: val, invested: amount * n });
    }
    setDcaResult({ fv, invested, gain, gainPct: (gain / invested) * 100, curve, periods: Math.round(periods) });
  }

  // ── Options Break-Even ────────────────────────────────────────────────────
  function computeOptions() {
    const strike   = parseFloat(optionStrike)  || 0;
    const premium  = parseFloat(optionPremium) || 0;
    const stock    = parseFloat(optionStock)   || 0;
    if (!strike || !premium) return;
    const isCall = optionType === "call";
    const breakEven    = isCall ? strike + premium : strike - premium;
    const intrinsic    = isCall ? Math.max(0, stock - strike) : Math.max(0, strike - stock);
    const timeValue    = Math.max(0, premium - intrinsic);
    const currentPnL   = stock ? (isCall ? (stock - breakEven) * 100 : (breakEven - stock) * 100) : null;
    const maxProfit    = isCall ? "Unlimited" : ((strike - premium) * 100).toFixed(2);
    const maxLoss      = (premium * 100).toFixed(2);
    const daysToExpiry = optionExpiry ? Math.max(0, Math.round((new Date(optionExpiry) - new Date()) / 86400000)) : null;
    setOptionResult({ breakEven, intrinsic, timeValue, currentPnL, maxProfit, maxLoss, daysToExpiry, isCall, premium, strike });
  }


  // -- Fear & Greed Meter
  async function fetchFearGreed() {
    setFearGreedLoading(true); setFearGreedData(null);
    try {
      const res  = await fetch("/api/market/feargreed");
      const data = res.ok ? await res.json() : { error: "Failed" };
      setFearGreedData(data);
    } catch(e) { setFearGreedData({ error: e.message }); }
    setFearGreedLoading(false);
  }

  // -- Market Breadth
  async function fetchBreadth() {
    setBreadthLoading(true); setBreadthData(null);
    try {
      const res  = await fetch("/api/market/breadth");
      const data = res.ok ? await res.json() : { error: "Failed" };
      setBreadthData(data);
    } catch(e) { setBreadthData({ error: e.message }); }
    setBreadthLoading(false);
  }

  // -- Seasonality
  async function fetchSeasonality(ticker) {
    const sym = (ticker || seasonTicker || "SPY").toUpperCase();
    setSeasonLoading(true); setSeasonData(null); setSeasonTicker(sym);
    try {
      const res  = await fetch("/api/market/seasonality?ticker=" + encodeURIComponent(sym));
      const data = res.ok ? await res.json() : { error: "Failed" };
      setSeasonData(data);
    } catch(e) { setSeasonData({ error: e.message }); }
    setSeasonLoading(false);
  }

  const loadPriceAlertList = useCallback(async () => {
    try {
      const res = await fetch("/api/price-alerts");
      const data = res.ok ? await res.json() : { alerts: [] };
      const alerts = data.alerts || [];
      // Fire browser notifications for newly triggered alerts and update badge
      let newlyTriggered = 0;
      for (const a of alerts) {
        if (a.status === "triggered" && !seenTriggeredAlerts.current.has(a.id)) {
          seenTriggeredAlerts.current.add(a.id);
          newlyTriggered++;
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification(`Price Alert: ${a.symbol}`, {
                body: `${a.symbol} hit ${a.direction} $${a.targetPrice}${a.note ? ` · ${a.note}` : ""}`,
                icon: "/axiom-runner/assets/am-trading-logo.png",
              });
            } catch {}
          }
        }
      }
      if (newlyTriggered > 0) setTriggeredAlertBadge(prev => prev + newlyTriggered);
      setPriceAlerts(alerts);
    } catch {}
  }, []);

  useEffect(() => {
    if (activeTab === "alerts") {
      lastAlertsTabVisit.current = Date.now();
      setTriggeredAlertBadge(0);
      loadPriceAlertList();
    }
  }, [activeTab]);

  // Background poll: check for newly triggered price alerts every 2 minutes regardless of active tab
  useEffect(() => {
    loadPriceAlertList();
    const tid = setInterval(() => loadPriceAlertList(), 120_000);
    return () => clearInterval(tid);
  }, []);

  useEffect(() => {
    fetch("/api/health").then(r => r.ok ? r.json() : {}).then(d => { if (d.telegram) setTelegramOk(true); }).catch(() => {});
    fetch("/api/plan").then(r => r.ok ? r.json() : {}).then(d => { if (d.text && !localStorage.getItem("ax_game_plan")) setDailyGamePlan(d.text); }).catch(() => {});
  }, []);

  const runServerScreen = useCallback(async () => {
    setServerScreenLoading(true);
    setServerScreenResults(null);
    try {
      const symbols = watchlistSymbols.length ? watchlistSymbols : WATCHLIST_SYMBOLS;
      const res = await fetch("/api/market/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          filters: {
            minPrice: Number(scannerFilters.minPrice) || 0,
            minChangePct: Number(scannerFilters.minChange) || 0,
            minRvol: Number(scannerFilters.minRvol) || 0,
            minScore: Number(scannerFilters.minScore) || 0,
            limit: 50,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Screen failed");
      setServerScreenResults(data.results || []);
    } catch {
      setServerScreenResults([]);
    } finally {
      setServerScreenLoading(false);
    }
  }, [watchlistSymbols, scannerFilters]);

  useEffect(() => {
    try {
      document.body.style.background = C.bg;
      document.body.style.color = C.text;
    } catch {}
  }, [themeMode]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.watchlistSymbols) && saved.watchlistSymbols.length) {
        setWatchlistSymbols(saved.watchlistSymbols);
        setWatchlistInput(saved.watchlistSymbols.join(","));
      }
      if (Array.isArray(saved.customAlerts)) setCustomAlerts(saved.customAlerts);
      if (Array.isArray(saved.portfolioHoldings) && saved.portfolioHoldings.length) {
        setPortfolioHoldings(saved.portfolioHoldings.map((h) => ({
          symbol: String(h.symbol || "").toUpperCase(),
          shares: String(h.shares || "0"),
          avgCost: String(h.avgCost || "0"),
        })));
      }
      if (saved.scannerFilters && typeof saved.scannerFilters === "object") {
        setScannerFilters({
          minPrice: String(saved.scannerFilters.minPrice || "10"),
          minChange: String(saved.scannerFilters.minChange || "0.5"),
          minRvol: String(saved.scannerFilters.minRvol || "1"),
          minScore: String(saved.scannerFilters.minScore || "55"),
          sector: String(saved.scannerFilters.sector || "ALL"),
          scope: String(saved.scannerFilters.scope || "watchlist"),
        });
      }
      if (saved.workflowState && typeof saved.workflowState === "object") {
        setWorkflowState({
          premarket: {
            checklist: Array.isArray(saved.workflowState?.premarket?.checklist) ? saved.workflowState.premarket.checklist : DEFAULT_WORKFLOW.premarket.checklist,
            notes: String(saved.workflowState?.premarket?.notes || ""),
          },
          live: {
            checklist: Array.isArray(saved.workflowState?.live?.checklist) ? saved.workflowState.live.checklist : DEFAULT_WORKFLOW.live.checklist,
            notes: String(saved.workflowState?.live?.notes || ""),
          },
          postmarket: {
            checklist: Array.isArray(saved.workflowState?.postmarket?.checklist) ? saved.workflowState.postmarket.checklist : DEFAULT_WORKFLOW.postmarket.checklist,
            notes: String(saved.workflowState?.postmarket?.notes || ""),
          },
        });
      }
      if (saved.settings && typeof saved.settings === "object") {
        setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
        if (saved.settings.terminalLayout) setTerminalLayout(String(saved.settings.terminalLayout));
        if (saved.settings.hotkeyProfile) setHotkeyProfile(String(saved.settings.hotkeyProfile));
        if (saved.settings.providerKeys && typeof saved.settings.providerKeys === "object") {
          setProviderKeys({
            finnhubKey: String(saved.settings.providerKeys.finnhubKey || ""),
            fmpKey: String(saved.settings.providerKeys.fmpKey || ""),
            polygonKey: String(saved.settings.providerKeys.polygonKey || ""),
            uwKey: String(saved.settings.providerKeys.uwKey || ""),
            tradierKey: String(saved.settings.providerKeys.tradierKey || ""),
          });
        }
        if (saved.settings.flowFilters && typeof saved.settings.flowFilters === "object") {
          setFlowFilters({
            flowType: String(saved.settings.flowFilters.flowType || "all"),
            minNotional: String(saved.settings.flowFilters.minNotional || "0"),
            unusualOnly: Boolean(saved.settings.flowFilters.unusualOnly),
            autoAlertNotional: String(saved.settings.flowFilters.autoAlertNotional || "250000"),
          });
        }
      }
      if (saved.riskSettings && typeof saved.riskSettings === "object") {
        setRiskAccount(String(saved.riskSettings.riskAccount || "10000"));
        setRiskPct(String(saved.riskSettings.riskPct || "1"));
        setRiskEntry(String(saved.riskSettings.riskEntry || "100"));
        setRiskStop(String(saved.riskSettings.riskStop || "95"));
        setRiskSide(String(saved.riskSettings.riskSide || "long"));
        setRiskMaxPosPct(String(saved.riskSettings.riskMaxPosPct || "20"));
        setRiskCorrCap(String(saved.riskSettings.riskCorrCap || "0.80"));
        setRiskAtrPct(String(saved.riskSettings.riskAtrPct || "4.0"));
        setRiskSlipBps(String(saved.riskSettings.riskSlipBps || "10"));
        setRiskSetupQuality(String(saved.riskSettings.riskSetupQuality || "A"));
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("ax_wl_notes", JSON.stringify(watchlistNotes)); } catch {}
  }, [watchlistNotes]);

  // Persist named watchlists
  useEffect(() => {
    try { localStorage.setItem("ax_watchlists", JSON.stringify(watchlists)); } catch {}
  }, [watchlists]);

  // When active list changes, load its symbols into the main watchlistSymbols state
  useEffect(() => {
    const list = watchlists.find(w => w.id === activeWlistId);
    if (list) {
      setWatchlistSymbols(list.symbols);
      setWatchlistInput(list.symbols.join(","));
    }
  }, [activeWlistId]);

  // When watchlistSymbols changes, keep the active named list in sync
  useEffect(() => {
    setWatchlists(prev => prev.map(w => w.id === activeWlistId ? { ...w, symbols: watchlistSymbols } : w));
  }, [watchlistSymbols]);

  useEffect(() => {
    try { localStorage.setItem("ax_game_plan", dailyGamePlan); } catch {}
    const tid = setTimeout(() => {
      fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: dailyGamePlan }) }).catch(() => {});
    }, 1000);
    return () => clearTimeout(tid);
  }, [dailyGamePlan]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        watchlistSymbols,
        customAlerts,
        portfolioHoldings,
        scannerFilters,
        workflowState,
        settings: { ...settings, terminalLayout, hotkeyProfile, providerKeys, flowFilters },
        riskSettings: {
          riskAccount, riskPct, riskEntry, riskStop, riskSide,
          riskMaxPosPct, riskCorrCap, riskAtrPct, riskSlipBps, riskSetupQuality,
        },
      }));
    } catch {}
  }, [watchlistSymbols, customAlerts, portfolioHoldings, scannerFilters, workflowState, settings, terminalLayout, hotkeyProfile, providerKeys, flowFilters, riskAccount, riskPct, riskEntry, riskStop, riskSide, riskMaxPosPct, riskCorrCap, riskAtrPct, riskSlipBps, riskSetupQuality]);

  useEffect(() => {
    const t = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load portfolio from server on first mount (fills in if localStorage was empty)
  const portfolioServerSynced = useRef(false);
  useEffect(() => {
    if (portfolioServerSynced.current) return;
    portfolioServerSynced.current = true;
    fetch("/api/portfolio")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data || !Array.isArray(data.holdings) || !data.holdings.length) return;
        setPortfolioHoldings((prev) => {
          const hasLocal = prev.some((h) => h.symbol && Number(h.shares) > 0);
          if (hasLocal) return prev;
          return data.holdings.map((h) => ({
            symbol: String(h.symbol || "").toUpperCase(),
            shares: String(h.shares || "0"),
            avgCost: String(h.costBasis || "0"),
          }));
        });
      })
      .catch(() => {});
  }, []);

  // Debounced server save whenever portfolio changes
  useEffect(() => {
    if (!portfolioServerSynced.current) return;
    const holdings = portfolioHoldings
      .filter((h) => h.symbol && Number(h.shares) > 0)
      .map((h) => ({
        symbol: String(h.symbol || "").toUpperCase(),
        shares: Number(h.shares) || 0,
        costBasis: Number(h.avgCost) || 0,
      }));
    const timer = setTimeout(() => {
      fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings }),
      }).catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [portfolioHoldings]);

  // Server-side settings: load watchlist on first mount, override localStorage if server has one
  const settingsServerSynced = useRef(false);
  useEffect(() => {
    if (settingsServerSynced.current) return;
    settingsServerSynced.current = true;
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.settings) return;
        const s = data.settings;
        if (Array.isArray(s.watchlistSymbols) && s.watchlistSymbols.length > 0) {
          setWatchlistSymbols(s.watchlistSymbols);
          setWatchlistInput(s.watchlistSymbols.join(","));
        }
        if (s.themeMode === "dark" || s.themeMode === "light") {
          setSettings((prev) => ({ ...prev, themeMode: s.themeMode }));
        }
      })
      .catch(() => {});
  }, []);

  // Debounced server save of watchlist + themeMode whenever they change
  useEffect(() => {
    if (!settingsServerSynced.current) return;
    const timer = setTimeout(() => {
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlistSymbols, themeMode }),
      }).catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
  }, [watchlistSymbols, themeMode]);

  useEffect(() => {
    if (!watchlistSymbols.length) return;
    if (!watchlistSymbols.includes(terminalSymbol)) {
      setTerminalSymbol(watchlistSymbols[0]);
    }
  }, [watchlistSymbols, terminalSymbol]);

  useEffect(() => {
    if (!watchlistSymbols.length) return;
    setTerminalPanelSymbols((prev) => {
      const seed = [terminalSymbol, ...prev, ...watchlistSymbols].filter(Boolean);
      const uniq = Array.from(new Set(seed)).slice(0, 4);
      while (uniq.length < 4) uniq.push(watchlistSymbols[0]);
      return uniq;
    });
  }, [watchlistSymbols, terminalSymbol]);

  useEffect(() => {
    let cancelled = false;
    if (!apiKey || !terminalSymbol) return;
    setTerminalCandlesLoading(true);
    fetchCandles(terminalSymbol, terminalTf)
      .then((data) => {
        if (!cancelled) setTerminalCandles(data);
      })
      .catch(() => {
        if (!cancelled) setTerminalCandles(null);
      })
      .finally(() => {
        if (!cancelled) setTerminalCandlesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, terminalSymbol, terminalTf]);

  useEffect(() => {
    let cancelled = false;
    if (!apiKey) return;
    const panelCount = terminalLayout === "4" ? 4 : terminalLayout === "2" ? 2 : 1;
    const symbols = terminalPanelSymbols.slice(0, panelCount).filter(Boolean);
    if (!symbols.length) return;
    Promise.all(symbols.map((s) => fetchCandles(s, terminalTf).catch(() => null)))
      .then((rows) => {
        if (cancelled) return;
        const map = {};
        rows.forEach((r, idx) => {
          if (r && symbols[idx]) map[symbols[idx]] = r;
        });
        setTerminalPanelCandles(map);
      });
    return () => { cancelled = true; };
  }, [apiKey, terminalPanelSymbols, terminalLayout, terminalTf]);

  useEffect(() => {
    let cancelled = false;
    if (!apiKey || !terminalSymbol) return;
    fetchFundamentals(terminalSymbol, providerKeys)
      .then((f) => {
        if (!cancelled) setTerminalFundamentals(f || null);
      })
      .catch(() => {
        if (!cancelled) setTerminalFundamentals(null);
      });
    return () => { cancelled = true; };
  }, [apiKey, terminalSymbol, providerKeys]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedStock?.symbol) {
      setSelectedFundamentals(null);
      setSelectedFundamentalsLoading(false);
      return () => { cancelled = true; };
    }
    setSelectedFundamentalsLoading(true);
    fetchFundamentals(selectedStock.symbol, providerKeys)
      .then((f) => {
        if (!cancelled) { setSelectedFundamentals(f || null); setSelectedFundamentalsLoading(false); }
      })
      .catch(() => {
        if (!cancelled) { setSelectedFundamentals(null); setSelectedFundamentalsLoading(false); }
      });
    return () => { cancelled = true; };
  }, [selectedStock?.symbol, providerKeys]);

  useEffect(() => {
    let cancelled = false;
    if (activeTab !== "earnings" || !apiKey) return () => { cancelled = true; };

    const loadEarningsCalendar = async () => {
      setEarningsLoading(true);
      const symbols = [...new Set((watchlistSymbols || []).map((s) => String(s || "").toUpperCase()).filter(Boolean))].slice(0, 30);
      const quoteMap = new Map((watchlistData || []).map((q) => [String(q.symbol || "").toUpperCase(), q]));

      const rows = await Promise.all(symbols.map(async (symbol) => {
        const quote = quoteMap.get(symbol) || {};
        const fallbackDate = quote?.earningsDate || null;
        let earningsDate = fallbackDate;
        try {
          const f = await withClientTimeout(fetchFundamentals(symbol, providerKeys), 4500, null);
          earningsDate = f?.earningsDate || earningsDate;
        } catch {}

        const ts = earningsDate ? new Date(earningsDate).getTime() : NaN;
        const valid = Number.isFinite(ts);
        const now = new Date();
        const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const eventStart = valid
          ? new Date(new Date(ts).getFullYear(), new Date(ts).getMonth(), new Date(ts).getDate()).getTime()
          : NaN;
        const dayDiff = valid ? Math.round((eventStart - nowStart) / (24 * 60 * 60 * 1000)) : null;
        const timing = dayDiff == null
          ? "TBD"
          : dayDiff === 0
          ? "TODAY"
          : dayDiff === 1
          ? "TOMORROW"
          : dayDiff > 1
          ? `IN ${dayDiff}D`
          : `${Math.abs(dayDiff)}D AGO`;

        return {
          symbol,
          earningsDate: valid ? new Date(ts).toISOString() : null,
          dayDiff,
          timing,
          chg: Number(quote?.changesPercentage || 0),
          score: Number(quote?.composite || 0),
          price: Number(quote?.price || 0),
        };
      }));

      const sorted = rows.sort((a, b) => {
        const ak = a.dayDiff == null ? 9999 : (a.dayDiff >= 0 ? a.dayDiff : 5000 + Math.abs(a.dayDiff));
        const bk = b.dayDiff == null ? 9999 : (b.dayDiff >= 0 ? b.dayDiff : 5000 + Math.abs(b.dayDiff));
        return ak - bk;
      });

      if (cancelled) return;
      setEarningsRows(sorted);
      setEarningsUpdatedAt(new Date().toLocaleTimeString());
      setEarningsLoading(false);
    };

    loadEarningsCalendar().catch(() => {
      if (!cancelled) setEarningsLoading(false);
    });

    return () => { cancelled = true; };
  }, [activeTab, apiKey, watchlistSymbols, watchlistData, providerKeys, earningsRefreshTick]);

  const runPaletteCommand = useCallback((raw) => {
    const q = String(raw || "").trim().toUpperCase();
    if (!q) return;

    const normalized = q.replace(/\s*(<GO>|GO)\s*$/, "").trim();
    const toTab = {
      MONITOR: "dashboard",
      DASHBOARD: "dashboard",
      TERMINAL: "mterminal",
      MACRO: "macro",
      NEWS: "news",
      // Added 2026-07-12 with the nav trim above — these lost their subnav
      // buttons but stay one command away, same convention as BREADTH/SECTORS/
      // ROTATION/COT below.
      QUOTES: "quotes",
      CRYPTO: "crypto",
      EVENTS: "econ-cal",
      DECK: "rhpro",
      SECTORHEAT: "rhpro-heat",
      WATCHLISTS: "rhpro-lists",
      HOLDINGS: "holdings",
      AICOACH: "rhpro-coach",
      // Added with the SMART MONEY trim — SMARTMONEY (13F Lookup) already
      // had an alias below.
      DPHEAT: "dp-heatmap",
      INSIDER: "insider",
      SHORTINT: "shortint",
      SHORTCHG: "short-changes",
      SECFILINGS: "sec-filings",
      SOCIAL: "social",
      CORR: "correlation",
      EARNINGS: "earnings",
      TV: "tv",
      LIVETV: "tv",
      ALERTS: "alerts",
      AGENT: "agent",
      AI: "agent",
      WORKFLOW: "workflow",
      FLOW: "flow",
      PORTFOLIO: "portfolio",
      FIVEX: "fivex",
      SCANNER: "scanner",
      BACKTEST: "backtest",
      ROTATION: "rotation",
      TOOLS: "tools",
      // Added with the TOOLS group removal 2026-07-12.
      DEALFINDER: "dealfinder",
      FLIGHTFINDER: "flightfinder",
      LEADRESPONDER: "leadresponder",
      SECTORS: "sectors",
      BREADTH: "breadth",
      COT: "cot",
      DEALS: "deals",
      DIPBUY: "dipbuy",
      TELEGRAM: "telegram",
      ADVISOR: "advisor",
      MORNING: "morning-routine",
      COMPRESSION: "compression",
      TRENDTEMPLATE: "trendtemplate",
      EARLY: "early",
      CHALLENGE: "challenge",
      ACADEMY: "academy",
      COURSES: "courses",
      START: "start",
      AILAB: "ailab",
      SCREENER: "screener",
      OPENSTOCK: "openstock",
      STOCKS: "openstock",
      ANALYST: "analyst",
      HALAL: "halal",
      RISKLAB: "risklab",
      MULTITF: "multitf",
      SEASONALITY: "seasonality",
      OPTCALC: "options-calc",
      SMARTMONEY: "smartmoney",
      FIBONACCI: "fibonacci",
      FIB: "fibonacci",
      DCA: "dca",
      HEATMAP: "heatmap",
      EARNCAL: "earn-cal",
      FEARGREED: "feargreed",
      BRIEFING: "briefing",
      DIVIDEND: "ipo",
      IPO: "ipo",
      RECAP: "recap",
      ADOL22: "adol22",
      GAP: "gap",
      TRADEPLANNER: "tradeplanner",
      AUTOEXEC: "autoexec",
      COMBINED: "combined",
      OPTIONS: "options",
      UNDER10: "under10",
      GAPFILL: "gapfill",
      SQUEEZE: "squeeze",
      SMARTSCAN: "smartscan",
      OUTLOOK: "outlook",
      GLBACKTEST: "gl-backtest",
      PREDICTIONS: "predictions",
      JOURNAL: "journal",
      JSTATS: "journal-stats",
      QURAN: "quran",
      ATHAN: "athan",
      PRAYER: "athan",
      ATHKAR: "athkar",
      TASBIH: "tasbih",
      DHIKR: "tasbih",
    };

    if (toTab[normalized]) {
      setActiveTab(toTab[normalized]);
      return;
    }

    if (normalized.startsWith("TF ")) {
      const tf = normalized.replace("TF ", "").trim();
      if (["5M", "15M", "1H", "1D", "1W"].includes(tf)) {
        // TF/LAYOUT palette commands are the only remaining way to reach the
        // legacy multi-panel Terminal view — it has no equivalent in the
        // consolidated mterminal tab, so it's kept as an explicit power-user
        // entry point rather than deleted outright.
        setActiveTab("terminal");
        setTerminalTf(tf);
      }
      return;
    }

    if (normalized.startsWith("LAYOUT ")) {
      const l = normalized.replace("LAYOUT ", "").trim();
      if (["1", "2", "4"].includes(l)) {
        // See TF-command comment above — multi-panel LAYOUT is legacy-only.
        setActiveTab("terminal");
        setTerminalLayout(l);
      }
      return;
    }

    const maybeSymbol = normalized.split(" ")[0];
    if (/^[A-Z.\-]{1,10}$/.test(maybeSymbol)) {
      setTerminalSymbol(maybeSymbol);
      if (!watchlistSymbols.includes(maybeSymbol)) {
        const next = [...watchlistSymbols, maybeSymbol];
        setWatchlistSymbols(next);
        setWatchlistInput(next.join(","));
      }
      try { localStorage.setItem("mterminal_load_sym", maybeSymbol); } catch {}
      setActiveTab("mterminal");
    }
  }, [watchlistSymbols, setWatchlistSymbols, setWatchlistInput, setTerminalLayout]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setShortcutHelpOpen(false);
      } else if (!paletteOpen && !shortcutHelpOpen && e.key === "?") {
        const tag = e.target?.tagName?.toLowerCase();
        if (tag !== "input" && tag !== "textarea") {
          e.preventDefault();
          setShortcutHelpOpen(v => !v);
        }
      } else if (!paletteOpen && e.key === "/") {
        const t = e.target;
        const tag = t?.tagName?.toLowerCase();
        if (tag !== "input" && tag !== "textarea") {
          e.preventDefault();
          setPaletteOpen(true);
        }
      }

      // ── Global navigation shortcuts ──────────────────────────────────────
      const tag2 = e.target?.tagName?.toLowerCase();
      if (!paletteOpen && tag2 !== "input" && tag2 !== "textarea" && tag2 !== "select" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "m") setActiveTab("dashboard");
        else if (k === "s") setActiveTab("smartscan");
        else if (k === "g") setActiveTab("gap");
        else if (k === "c") setActiveTab("mterminal");
        else if (k === "n") setActiveTab("news");
        else if (k === "p") setActiveTab("portfolio");
        else if (k === "j") setActiveTab("journal");
        else if (k === "a") setActiveTab("earn-cal");
        else if (k === "e") setActiveTab("econ-cal");
      }

      if (activeTab === "terminal" && !paletteOpen && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase();
        const tfByProfile = hotkeyProfile === "scalper"
          ? { z: "5M", x: "15M", c: "1H", v: "1D", b: "1W" }
          : { q: "5M", w: "15M", e: "1H", r: "1D", t: "1W" };
        if (tfByProfile[key]) {
          setTerminalTf(tfByProfile[key]);
        }
        if (key === "1") setTerminalLayout("1");
        if (key === "2") setTerminalLayout("2");
        if (key === "4") setTerminalLayout("4");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, shortcutHelpOpen, activeTab, hotkeyProfile]);

  const fetchAll = useCallback(async (key) => {
    setError("");
    setDataSourceStatus("updating");

    let hardError = "";
    let wl = [];

    try {
      wl = await withClientTimeout(fetchQuotes(watchlistSymbols, providerKeys), 25000, []);
      if (Array.isArray(wl) && wl.length > 0) {
        setWatchlistData(wl);

        // Session + regime for smart Telegram routing
        const sessionNow = getMarketSessionET(new Date());      // PREMARKET | REGULAR | AFTERMARKET | OVERNIGHT
        const isRegular  = sessionNow === "REGULAR";
        const isExtended = sessionNow === "PREMARKET" || sessionNow === "AFTERMARKET";
        const regimeNow  = classifyRegime(macroData);

        // ── ⚖️ REGIME CHANGE alert (only pre-market & after-market) ──
        if (regimeRef.current && regimeRef.current !== regimeNow &&
            (regimeNow === "Risk-On" || regimeNow === "Risk-Off") && isExtended) {
          const icon = regimeNow === "Risk-On" ? "🟢" : "🔴";
          const msg = [
            `${icon} *REGIME CHANGE* — ${regimeRef.current} → ${regimeNow}`,
            `Session: ${sessionNow}`,
            regimeNow === "Risk-On" ? "Risk appetite returning — favor longs at the open." : "Risk coming off — protect capital, cut size.",
          ].join("\n");
          fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }).catch(() => {});
        }
        regimeRef.current = regimeNow;  // always track so we catch the next change

        // ── 🟢 GREEN LIGHT 5/5 alert (only during regular trading hours) ──
        const spyChgGL = Number(wl.find(q => q.symbol === "SPY")?.changesPercentage ||
                                (macroData || []).find(m => m.symbol === "SPY")?.changesPercentage || 0);
        wl.forEach(q => {
          const sym = q.symbol;
          const px = Number(q.price || 0);
          // Use the SAME engine as the Green Light card so Telegram + UI always agree
          const scanRow = (scanResultsRef.current || []).find(r => r.ticker === sym);
          const gl = computeGreenLight(q, spyChgGL, scanRow);
          // Telegram only for PERFECT 5/5 setups (not 4/5)
          const isGreen = gl.passed === 5;
          const wasGreen = prevGreenRef.current[sym];
          // Fire only on transition into 5/5, and only during regular hours
          if (isGreen && wasGreen === false && isRegular) {
            const msg = [
              `🟢 *GREEN LIGHT 5/5* — ${sym}${gl.isLeader ? " 💪 LEADER" : ""}`,
              `$${px.toFixed(2)} (${(q.changesPercentage||0) >= 0 ? "+" : ""}${(q.changesPercentage||0).toFixed(2)}%)`,
              `✅ At GOOD ENTRY — all 5 checks passed`,
              `🎯 Entry $${gl.bestEntry} · 🛑 Stop $${gl.stop}`,
              `🎯 T1 $${gl.t1} · T2 $${gl.t2}`,
              `BUY ZONE`,
            ].join("\n");
            fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }).catch(() => {});
          }
          prevGreenRef.current[sym] = isGreen;   // always track so we catch the next transition
          prevScoresRef.current[sym] = computeScores(q).composite;
        });
      }
      else wl = [];
    } catch (e) {
      hardError = `Quotes unavailable: ${e?.message || "unknown error"}`;
    }

    if (!wl || wl.length === 0) {
      setWatchlistData((prev) => (Array.isArray(prev) && prev.length > 0 ? prev : buildPlaceholderQuotes(watchlistSymbols)));
    }

    try {
      const macroSyms = MACRO_SYMBOLS.filter(m => m.type !== "crypto").map(m => m.symbol);
      const macroQ = await withClientTimeout(fetchQuotes(macroSyms, providerKeys), 14000, []);
      let cryptoQ = [];
      try { cryptoQ = await withClientTimeout(fetchCryptoQuotes(providerKeys), 8000, []); } catch {}
      const combined = [...(Array.isArray(macroQ) ? macroQ : []), ...(Array.isArray(cryptoQ) ? cryptoQ : [])];
      combined.forEach(q => {
        const def = MACRO_SYMBOLS.find(m => m.symbol === q.symbol);
        if (def) q._label = def.label;
      });
      setMacroData(combined);
    } catch {}

    try {
      const sectorSyms = SECTOR_ETFS.map(s => s.symbol);
      const sectorQ = await withClientTimeout(fetchQuotes(sectorSyms, providerKeys), 14000, []);
      if (Array.isArray(sectorQ)) {
        sectorQ.forEach(q => {
          const def = SECTOR_ETFS.find(s => s.symbol === q.symbol);
          if (def) q._sectorName = def.name;
        });
        setSectorData(sectorQ);
      }
    } catch {}

    try {
      const newsTickers = [...(wl || [])]
        .sort((a, b) => Math.abs(b.changesPercentage || 0) - Math.abs(a.changesPercentage || 0))
        .slice(0, 6)
        .map((q) => q.symbol);
      const headlines = await withClientTimeout(
        fetchNews(newsTickers.length ? newsTickers : watchlistSymbols.slice(0, 6), 24, providerKeys),
        5000,
        []
      );
      setNewsData(Array.isArray(headlines) ? headlines : []);
    } catch {}

    try {
      const flowSymbols = (wl?.length ? wl : watchlistSymbols.map((symbol) => ({ symbol })))
        .slice(0, 8)
        .map((row) => row.symbol)
        .filter(Boolean);
      const flow = await withClientTimeout(fetchOptionsFlow(flowSymbols, 28, providerKeys, flowFilters), 20000, null);
      setOptionsFlow(flow && typeof flow === "object" ? flow : null);
    } catch {}

    try {
      const tv = await withClientTimeout(fetchTradingViewAlerts(30), 5000, { rows: [], secured: false });
      setTvWebhookRows(Array.isArray(tv?.rows) ? tv.rows : []);
      setTvWebhookSecured(Boolean(tv?.secured));
    } catch {}

    setLastUpdate(new Date());
    if (Array.isArray(wl) && wl.length > 0) {
      setDataSourceStatus(hardError ? "degraded" : "live");
      setError(hardError || "");   // clear any stale warning once quotes succeed
    } else {
      setDataSourceStatus("degraded");
      setError(hardError || "Data fetch warning: no live quotes returned (add ALPACA/FINNHUB keys, or retry).");
    }
  }, [watchlistSymbols, providerKeys, flowFilters]);

  const handleApiKey = useCallback((key) => {
    setApiKey(key || "YAHOO_LOCAL");
    setLoading(true);
    fetchAll(key).finally(() => setLoading(false));

    // Auto-refresh from user settings (stored locally)
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchAll(key), settings.refreshMs);
  }, [fetchAll, settings.refreshMs]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Play a soft beep when new TV webhook alerts arrive
  const prevWebhookCount = useRef(0);
  const [alertSoundEnabled, setAlertSoundEnabled] = useState(true);
  useEffect(() => {
    const count = tvWebhookRows.length;
    if (count > prevWebhookCount.current && prevWebhookCount.current > 0 && alertSoundEnabled) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
        osc.onended = () => ctx.close();
      } catch {}
    }
    prevWebhookCount.current = count;
  }, [tvWebhookRows.length, alertSoundEnabled]);

  // Sorting
  const sorted = useMemo(() => {
    return [...watchlistData].sort((a, b) => {
      let va, vb;
      const scA = computeScores(a);
      const scB = computeScores(b);
      switch (sortCol) {
        case "symbol": return sortDir === "asc" ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
        case "price": va = a.price; vb = b.price; break;
        case "change": va = a.changesPercentage || 0; vb = b.changesPercentage || 0; break;
        case "volume": va = a.volume || 0; vb = b.volume || 0; break;
        case "rvol": va = a.avgVolume ? a.volume / a.avgVolume : 0; vb = b.avgVolume ? b.volume / b.avgVolume : 0; break;
        case "mktcap": va = a.marketCap || 0; vb = b.marketCap || 0; break;
        case "composite": va = scA.composite; vb = scB.composite; break;
        case "tech": va = scA.tech; vb = scB.tech; break;
        case "fund": va = scA.fund; vb = scB.fund; break;
        default: va = scA.composite; vb = scB.composite;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [watchlistData, sortCol, sortDir]);

  const signalFiltered = useMemo(() => {
    return sorted.filter(q => {
      // Signal
      if (signalFilter !== "ALL" && computeMTFSignal(q).signal !== signalFilter) return false;
      // Trend
      if (trendFilter !== "ALL" && classifyTrend(q) !== trendFilter) return false;
      // Volume (RVOL)
      if (volumeFilter !== "ALL") {
        const rvol = q.avgVolume ? q.volume / q.avgVolume : 0;
        if (volumeFilter === "HIGH"   && rvol < 1.5)  return false;
        if (volumeFilter === "NORMAL" && (rvol < 0.8 || rvol >= 1.5)) return false;
        if (volumeFilter === "LOW"    && rvol >= 0.8) return false;
      }
      // Score
      if (scoreFilter !== "ALL") {
        const s = computeScores(q).composite;
        if (scoreFilter === "70+" && s < 70)  return false;
        if (scoreFilter === "60+" && s < 60)  return false;
        if (scoreFilter === "50+" && s < 50)  return false;
        if (scoreFilter === "<50" && s >= 50) return false;
      }
      return true;
    });
  }, [sorted, signalFilter, trendFilter, volumeFilter, scoreFilter]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const handleSymbolSearch = useCallback(async () => {
    const symbol = symbolSearch.trim().toUpperCase();
    if (!symbol) return;
    if (!/^[A-Z0-9.\-^]{1,12}$/.test(symbol)) return;
    setSymbolSearch("");

    // 1. Add to active watchlist if not already there
    let added = false;
    if (!watchlistSymbols.includes(symbol)) {
      const next = [symbol, ...watchlistSymbols].slice(0, 50);
      setWatchlistSymbols(next);
      setWatchlistInput(next.join(","));
      added = true;
    }

    // 2. Always set as terminal symbol
    setTerminalSymbol(symbol);

    // 3. If on Monitor tab: stay here, refresh data, open the stock directly
    if (activeTab === "dashboard") {
      // Refresh watchlist data to include the new symbol
      setLoading(true);
      fetchAll(apiKey).finally(() => setLoading(false));

      // Fetch a quick quote to open the DeepDive
      try {
        const r = await fetch(`/api/yahoo/quote?symbols=${symbol}`);
        const d = await r.json();
        const q = Array.isArray(d) ? d[0] : (d?.quotes?.[0] || null);
        if (q) setSelectedStock(q);
      } catch {}

      // Show brief toast
      const toast = document.createElement("div");
      toast.textContent = `${added ? "✅ Added" : "📌"} ${symbol} — opening…`;
      toast.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a2742;color:#e0e8ff;font-family:monospace;font-size:13px;font-weight:700;padding:10px 20px;border-radius:8px;border:1px solid #4a7bdf44;z-index:9999;pointer-events:none;opacity:1;transition:opacity 0.5s";
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 500); }, 2000);
    } else {
      // On other tabs: navigate to chart as before
      try { localStorage.setItem("mterminal_load_sym", symbol); } catch {}
      setActiveTab("mterminal");
      setLoading(true);
      fetchAll(apiKey).finally(() => setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolSearch, watchlistSymbols, apiKey, fetchAll, activeTab]);
  const runTvWebhookTest = useCallback(async () => {
    const symbol = String(terminalSymbol || watchlistSymbols?.[0] || "NVDA").toUpperCase();
    let testUrl = "/api/webhooks/tradingview";
    try {
      const token = String(settings?.tvWebhookToken || "").trim();
      const base = `${window.location.origin}/api/webhooks/tradingview`;
      testUrl = token ? `${base}?token=${encodeURIComponent(token)}` : base;
    } catch {}
    const sample = {
      symbol,
      side: "BUY",
      price: "0",
      timeframe: "1D",
      message: `LOCAL TEST: ${symbol} webhook ping`
    };
    setLoading(true);
    setError("");
    try {
      const response = await fetch(testUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sample)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || "Webhook test failed.");
      }
      await fetchAll(apiKey);
    } catch (error) {
      setError(`Webhook TEST failed: ${error?.message || "unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [apiKey, fetchAll, settings, terminalSymbol, watchlistSymbols]);
  const openTradingView = useCallback((symbol) => {
    const url = getTradingViewUrl(symbol);
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {}
  }, []);
  const fetchWeather = useCallback(async () => {
    setWeatherLoading(true);
    setWeatherError("");
    try {
      const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(WEATHER_ZIP)}&count=1&language=en&format=json`);
      if (!geoResp.ok) throw new Error("geocode failed");
      const geo = await geoResp.json();
      const place = Array.isArray(geo?.results) && geo.results.length ? geo.results[0] : null;
      if (!place) throw new Error("zip not found");
      const lat = Number(place.latitude);
      const lon = Number(place.longitude);

      const wResp = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
      );
      if (!wResp.ok) throw new Error("weather failed");
      const w = await wResp.json();
      setWeatherData({
        location: `${place.name || "45014"}, ${place.admin1 || ""}`.replace(/,\s*$/, ""),
        temp: Number(w?.current?.temperature_2m || 0),
        feelsLike: Number(w?.current?.apparent_temperature || 0),
        humidity: Number(w?.current?.relative_humidity_2m || 0),
        wind: Number(w?.current?.wind_speed_10m || 0),
        precip: Number(w?.current?.precipitation || 0),
        code: Number(w?.current?.weather_code || 0),
        high: Number(w?.daily?.temperature_2m_max?.[0] || 0),
        low: Number(w?.daily?.temperature_2m_min?.[0] || 0),
        rainChance: Number(w?.daily?.precipitation_probability_max?.[0] || 0),
        updatedAt: new Date().toLocaleTimeString(),
      });
    } catch {
      setWeatherError("Weather data unavailable right now.");
    } finally {
      setWeatherLoading(false);
    }
  }, []);
  const loadMarketUniverse = useCallback(async () => {
    setMarketUniverseLoading(true);
    try {
      const rows = await withClientTimeout(fetchQuotesChunked(MARKET_UNIVERSE_SYMBOLS, providerKeys, 30), 30000, []);
      if (Array.isArray(rows) && rows.length) {
        setMarketUniverseData(rows);
        return rows;
      }
      return [];
    } catch {
      setMarketUniverseData([]);
      return [];
    } finally {
      setMarketUniverseLoading(false);
    }
  }, [providerKeys]);
  useEffect(() => {
    fetchWeather();
    const t = setInterval(fetchWeather, 20 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchWeather]);
  const runBacktest = useCallback(async () => {
    const symbol = backtestSymbol.trim().toUpperCase();
    if (!symbol) return;
    setBacktestLoading(true);
    try {
      const data = await fetchCandles(symbol, backtestTf);
      const bars = Array.isArray(data?.bars) ? data.bars : [];
      const lookback = Math.max(5, Math.min(80, Number(backtestLookback || 20)));
      if (bars.length < lookback + 15) {
        setBacktestResult({ error: "Not enough candle history for this timeframe." });
        return;
      }
      const trades = [];
      let equity = 1;
      let peak = 1;
      let maxDrawdown = 0;
      const maxHoldBars = 12;
      for (let i = lookback; i < bars.length - 2; i += 1) {
        const b = bars[i];
        const prevHigh = Math.max(...bars.slice(i - lookback, i).map((x) => Number(x.high || 0)));
        const entry = Number(b.close || 0);
        if (entry <= 0 || entry <= prevHigh) continue;
        const stop = entry * 0.96;
        const target = entry + (entry - stop) * 2;
        let exit = entry;
        let outcome = "open";
        for (let j = i + 1; j < Math.min(bars.length, i + 1 + maxHoldBars); j += 1) {
          const n = bars[j];
          const hitStop = Number(n.low || 0) <= stop;
          const hitTarget = Number(n.high || 0) >= target;
          if (hitStop && hitTarget) {
            exit = stop;
            outcome = "stop";
            break;
          }
          if (hitStop) {
            exit = stop;
            outcome = "stop";
            break;
          }
          if (hitTarget) {
            exit = target;
            outcome = "target";
            break;
          }
          exit = Number(n.close || exit);
          outcome = "time";
        }
        const retPct = ((exit - entry) / entry) * 100;
        trades.push({
          date: b.time || b.date || "",
          entry,
          stop,
          target,
          exit,
          retPct,
          outcome,
        });
        equity *= (1 + retPct / 100);
        peak = Math.max(peak, equity);
        const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
        maxDrawdown = Math.max(maxDrawdown, dd);
      }
      const wins = trades.filter((t) => t.retPct > 0).length;
      const losses = trades.filter((t) => t.retPct <= 0).length;
      const avgRet = trades.length ? trades.reduce((s, t) => s + t.retPct, 0) / trades.length : 0;
      setBacktestResult({
        symbol,
        timeframe: backtestTf,
        lookback,
        totalTrades: trades.length,
        wins,
        losses,
        winRate: trades.length ? (wins / trades.length) * 100 : 0,
        avgRet,
        expectancy: avgRet,
        netRet: (equity - 1) * 100,
        maxDrawdown,
        trades: trades.slice(-12).reverse(),
      });
    } catch (e) {
      setBacktestResult({ error: e?.message || "Backtest failed." });
    } finally {
      setBacktestLoading(false);
    }
  }, [backtestSymbol, backtestTf, backtestLookback]);
  const updateWorkflowCheck = useCallback((section, id, done) => {
    setWorkflowState((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        checklist: prev[section].checklist.map((item) => item.id === id ? { ...item, done } : item),
      },
    }));
  }, []);
  const updateWorkflowNotes = useCallback((section, notes) => {
    setWorkflowState((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        notes,
      },
    }));
  }, []);
  const workflowProgress = useMemo(() => {
    const calc = (section) => {
      const list = workflowState?.[section]?.checklist || [];
      const done = list.filter((x) => x.done).length;
      return { done, total: list.length, pct: list.length ? (done / list.length) * 100 : 0 };
    };
    return {
      premarket: calc("premarket"),
      live: calc("live"),
      postmarket: calc("postmarket"),
    };
  }, [workflowState]);

  const regime = useMemo(() => classifyRegime(macroData), [macroData]);
  const alerts = useMemo(
    () => buildAlerts({ watchlist: watchlistData, macro: macroData, regime, sectorData, customAlerts }),
    [watchlistData, macroData, regime, sectorData, customAlerts]
  );
  const macroTone = useMemo(() => classifyMacroTone(macroData), [macroData]);
  const rotationRank = useMemo(() => {
    const spy = macroData.find((q) => q.symbol === "SPY")?.changesPercentage || 0;
    return [...watchlistData]
      .map((q) => ({
        ...q,
        sectorEtf: STOCK_TO_SECTOR[q.symbol] || "",
        relVsSector: (q.changesPercentage || 0) - ((sectorData.find((s) => s.symbol === (STOCK_TO_SECTOR[q.symbol] || ""))?.changesPercentage) || 0),
        relVsSpy: (q.changesPercentage || 0) - spy,
        rvol: q.avgVolume ? q.volume / q.avgVolume : 0,
      }))
      .sort((a, b) => (b.relVsSpy * 0.5 + b.relVsSector * 0.6 + b.rvol * 1.2) - (a.relVsSpy * 0.5 + a.relVsSector * 0.6 + a.rvol * 1.2));
  }, [watchlistData, macroData, sectorData]);
  const scannerRank = useMemo(() => {
    const spy = macroData.find((q) => q.symbol === "SPY")?.changesPercentage || 0;
    return [...watchlistData]
      .map((q) => {
        const rvol = q.avgVolume ? q.volume / q.avgVolume : 0;
        const rel = (q.changesPercentage || 0) - spy;
        const score = (q.delta5m || 0) * 5 + (q.delta30m || 0) * 2 + rel * 2 + rvol * 12;
        return { ...q, rvol, rel, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [watchlistData, macroData]);
  const scannerRows = useMemo(() => {
    const sourceRows = scannerFilters.scope === "market" ? marketUniverseData : watchlistData;
    const minPrice = Number(scannerFilters.minPrice || 0);
    const minChange = Number(scannerFilters.minChange || 0);
    const minRvol = Number(scannerFilters.minRvol || 0);
    const minScore = Number(scannerFilters.minScore || 0);
    const sector = scannerFilters.sector || "ALL";
    return sourceRows
      .map((q) => {
        const scores = computeScores(q);
        const rvol = q.avgVolume ? q.volume / q.avgVolume : 0;
        const sectorEtf = STOCK_TO_SECTOR[q.symbol] || "";
        return {
          ...q,
          scannerScore: scores.composite,
          scannerTech: scores.tech,
          scannerFund: scores.fund,
          rvol,
          sectorEtf,
        };
      })
      .filter((q) => q.price >= minPrice)
      .filter((q) => minChange < 0 ? (q.changesPercentage || 0) <= minChange : Math.abs(q.changesPercentage || 0) >= minChange)
      .filter((q) => q.rvol >= minRvol)
      .filter((q) => q.scannerScore >= minScore)
      .filter((q) => sector === "ALL" || q.sectorEtf === sector)
      .sort((a, b) => b.scannerScore - a.scannerScore);
  }, [watchlistData, marketUniverseData, scannerFilters]);
  const marketSession = useMemo(() => getMarketSessionET(new Date()), [lastUpdate, loading]);
  const sessionCountdown = useMemo(() => getSessionCountdownSecs(new Date(clockNow)), [clockNow]);
  const newsIntel = useMemo(() => analyzeNewsIntelligence(newsData), [newsData]);
  const macroEventCalendar = useMemo(() => buildMacroEventCalendarV2(new Date(clockNow)), [clockNow]);
  const econCalendarView = String(settings.econCalendarView || "today");
  const econCalendarRegion = String(settings.econCalendarRegion || "US");
  const econAutoRisk30m = settings.econAutoRisk30m !== false;
  const econCalendarRows = useMemo(() => {
    const windowMs = econCalendarView === "week" ? (7 * 24 * 60 * 60 * 1000) : (24 * 60 * 60 * 1000);
    return (macroEventCalendar || [])
      .filter((e) => econCalendarRegion === "GLOBAL" ? true : String(e.region || "US") === "US")
      .filter((e) => e.phase === "live" || e.tteMs <= windowMs)
      .slice(0, econCalendarView === "week" ? 8 : 4);
  }, [macroEventCalendar, econCalendarView, econCalendarRegion]);
  const macroEventAlerts = useMemo(() => {
    return (macroEventCalendar || [])
      .filter((e) => !(econAutoRisk30m && e.severity === "high" && e.tteMs <= 30 * 60 * 1000 && e.tteMs >= 0))
      .filter((e) => e.tteMs <= 3 * 60 * 60 * 1000 && e.tteMs >= -30 * 60 * 1000)
      .map((e) => {
        const mins = Math.floor(Math.max(0, e.tteMs) / 60000);
        const score = e.phase === "imminent" || e.phase === "live" ? 94 : e.phase === "near" ? 86 : 74;
        const text = e.phase === "live"
          ? `${e.title} now live. Reduce risk / avoid fresh high-beta entries until post-release trend forms.`
          : `${e.title} in ${mins}m. ${e.riskNote}`;
        return {
          symbol: "MKT",
          type: "risk",
          category: "macro-event",
          score,
          text,
        };
      });
  }, [macroEventCalendar, econAutoRisk30m]);
  const econAutoRiskAlerts = useMemo(() => {
    if (!econAutoRisk30m) return [];
    return (macroEventCalendar || [])
      .filter((e) => e.severity === "high" && e.tteMs <= 30 * 60 * 1000 && e.tteMs >= 0)
      .map((e) => ({
        symbol: "MKT",
        type: "risk",
        category: "event-risk-auto",
        score: 97,
        text: `Auto risk action: ${e.title} in ${Math.max(0, Math.floor(e.tteMs / 60000))}m. Reduce risk now (trim size, tighten stops, avoid new high-beta entries).`,
      }));
  }, [macroEventCalendar, econAutoRisk30m]);
  const sessionMovers = useMemo(() => {
    const src = scannerFilters.scope === "market" && marketUniverseData.length ? marketUniverseData : watchlistData;
    const rows = [...(src || [])].filter((q) => Number(q.price || 0) > 0);
    const gainers = rows.sort((a, b) => (b.changesPercentage || 0) - (a.changesPercentage || 0)).slice(0, 5);
    const losers = [...rows].sort((a, b) => (a.changesPercentage || 0) - (b.changesPercentage || 0)).slice(0, 5);
    return { gainers, losers };
  }, [watchlistData, marketUniverseData, scannerFilters.scope]);
  const prePostMovers = useMemo(() => {
    const src = scannerFilters.scope === "market" && marketUniverseData.length ? marketUniverseData : watchlistData;
    const rows = [...(src || [])]
      .filter((q) => Number(q.price || 0) > 0)
      .map((q) => ({
        ...q,
        pre: Number(q.preMarketChangePercent || 0),
        post: Number(q.postMarketChangePercent || 0),
      }));
    const pre = [...rows]
      .filter((q) => Math.abs(q.pre) > 0.01)
      .sort((a, b) => Math.abs(b.pre) - Math.abs(a.pre))
      .slice(0, 5);
    const post = [...rows]
      .filter((q) => Math.abs(q.post) > 0.01)
      .sort((a, b) => Math.abs(b.post) - Math.abs(a.post))
      .slice(0, 5);
    return { pre, post };
  }, [watchlistData, marketUniverseData, scannerFilters.scope]);
  const earningsSurpriseTracker = useMemo(() => {
    const bySymbol = {};
    const beatWords = ["beat", "beats", "tops estimate", "above estimates", "raised guidance", "strong guidance"];
    const missWords = ["miss", "misses", "below estimates", "cuts guidance", "weak guidance"];

    for (const n of newsData || []) {
      const symbol = String(n?.ticker || "").toUpperCase();
      if (!symbol) continue;
      const txt = `${n?.title || ""} ${n?.summary || ""}`.toLowerCase();
      if (!bySymbol[symbol]) bySymbol[symbol] = { symbol, beats: 0, misses: 0, notes: [] };
      if (beatWords.some((w) => txt.includes(w))) {
        bySymbol[symbol].beats += 1;
        bySymbol[symbol].notes.push(n?.title || "");
      }
      if (missWords.some((w) => txt.includes(w))) {
        bySymbol[symbol].misses += 1;
        bySymbol[symbol].notes.push(n?.title || "");
      }
    }

    return Object.values(bySymbol)
      .map((r) => ({
        ...r,
        status: r.beats > r.misses ? "BEAT" : r.misses > r.beats ? "MISS" : "INLINE",
      }))
      .sort((a, b) => (b.beats - b.misses) - (a.beats - a.misses))
      .slice(0, 6);
  }, [newsData]);
  const macroSignalFlags = useMemo(() => {
    const vix = Number(macroData.find((m) => m.symbol === "VIXY")?.changesPercentage || 0);
    const spy = Number(macroData.find((m) => m.symbol === "SPY")?.changesPercentage || 0);
    const uup = Number(macroData.find((m) => m.symbol === "UUP")?.changesPercentage || 0);
    const uso = Number(macroData.find((m) => m.symbol === "USO")?.changesPercentage || 0);
    const red = [];
    const green = [];
    if (vix > 2) red.push(`Volatility pressure (VIX proxy +${vix.toFixed(2)}%)`);
    if (spy < -0.5) red.push(`Index weakness (SPY ${spy.toFixed(2)}%)`);
    if (uup > 0.4) red.push(`Dollar strength headwind (${uup.toFixed(2)}%)`);
    if (uso > 1.2) red.push(`Oil inflation risk (${uso.toFixed(2)}%)`);
    if (spy > 0.7) green.push(`Risk appetite healthy (SPY +${spy.toFixed(2)}%)`);
    if (vix < -1.5) green.push(`Volatility easing (${vix.toFixed(2)}%)`);
    if (uup < -0.3) green.push(`Dollar easing (${uup.toFixed(2)}%)`);
    if (uso < -1) green.push(`Oil pressure cooling (${uso.toFixed(2)}%)`);
    return { red, green };
  }, [macroData]);
  const cryptoSnapshot = useMemo(() => {
    const btc = Number(macroData.find((m) => m.symbol === "BTCUSD")?.price || 0);
    const eth = Number(macroData.find((m) => m.symbol === "ETHUSD")?.price || 0);
    const sol = Number(macroData.find((m) => m.symbol === "SOLUSD")?.price || 0);
    const btcChg = Number(macroData.find((m) => m.symbol === "BTCUSD")?.changesPercentage || 0);
    const ethChg = Number(macroData.find((m) => m.symbol === "ETHUSD")?.changesPercentage || 0);
    const solChg = Number(macroData.find((m) => m.symbol === "SOLUSD")?.changesPercentage || 0);
    const denom = btc + eth + sol;
    const btcDomProxy = denom > 0 ? (btc / denom) * 100 : 0;
    const altStrength = ((ethChg + solChg) / 2) - btcChg;
    return { btc, eth, sol, btcChg, ethChg, solChg, btcDomProxy, altStrength };
  }, [macroData]);
  const portfolioRows = useMemo(() => {
    return portfolioHoldings
      .map((h, idx) => {
        const symbol = String(h.symbol || "").toUpperCase();
        const shares = Number(h.shares || 0);
        const avgCost = Number(h.avgCost || 0);
        // Check watchlist first, then macroData for index stocks
        const live = watchlistData.find((q) => q.symbol === symbol)
                  || (macroData||[]).find((q) => q.symbol === symbol)
                  || null;
        const price = Number(live?.price || h.lastPrice || 0);
        const dayChg = Number(live?.changesPercentage || live?.delta1d || 0);
        const marketValue = shares * price;
        const costBasis = shares * avgCost;
        const pnl = marketValue - costBasis;
        const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
        const dayPnl = shares * price * dayChg / 100;
        return { idx, symbol, shares, avgCost, live, marketValue, costBasis, pnl, pnlPct, dayChg, dayPnl };
      })
      .filter((r) => r.symbol);
  }, [portfolioHoldings, watchlistData]);
  const portfolioSummary = useMemo(() => {
    const totalValue = portfolioRows.reduce((sum, r) => sum + r.marketValue, 0);
    const totalCost = portfolioRows.reduce((sum, r) => sum + r.costBasis, 0);
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const winners   = portfolioRows.filter((r) => r.pnl >= 0).length;
    const losers    = portfolioRows.filter((r) => r.pnl < 0).length;
    const dayPnlTotal = portfolioRows.reduce((s, r) => s + (r.dayPnl || 0), 0);
    const dayPnlPct   = totalValue > 0 ? dayPnlTotal / totalValue * 100 : 0;
    return { totalValue, totalCost, totalPnl, totalPnlPct, winners, losers, dayPnlTotal, dayPnlPct };
  }, [portfolioRows]);

  // ── Daily Max Loss Lock check (after portfolioSummary is available) ───────────
  useEffect(() => {
    const dayPnl = portfolioSummary ? (portfolioSummary.dayPnlTotal || 0) : 0;
    const maxLoss = Number(_dailyMaxLossRef.current || 200);
    if (lockEnabled && dayPnl < 0 && Math.abs(dayPnl) >= maxLoss && !tradingLocked) {
      setTradingLocked(true);
      setLockReason("Daily max loss of $" + maxLoss + " reached. Today P&L: -$" + Math.abs(dayPnl).toFixed(0) + ". Stop trading. Review tomorrow.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioSummary, dailyMaxLoss]);

  // ── Tilt Detector — watch journal for 3 consecutive losses ────────────────
  useEffect(() => {
    if (!tiltEnabled) return;
    const today = new Date().toISOString().slice(0, 10);
    const todayTrades = journalEntries
      .filter(e => e.status === "closed" && e.pnl != null && String(e.closedAt || "").startsWith(today))
      .sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));
    // Count trailing consecutive losses
    let streak = 0;
    for (let i = todayTrades.length - 1; i >= 0; i--) {
      if (todayTrades[i].pnl < 0) streak++;
      else break;
    }
    setTiltStreak(streak);
    if (streak >= 3 && !tiltLocked) {
      const unlockAt = new Date(Date.now() + 30 * 60 * 1000);
      setTiltLocked(true);
      setTiltUnlockAt(unlockAt);
    }
  }, [journalEntries, tiltEnabled]);

  // ── Auto-unlock tilt after 30 min ─────────────────────────────────────────
  useEffect(() => {
    if (!tiltLocked || !tiltUnlockAt) return;
    const ms = tiltUnlockAt.getTime() - Date.now();
    if (ms <= 0) { setTiltLocked(false); setTiltUnlockAt(null); return; }
    const t = setTimeout(() => { setTiltLocked(false); setTiltUnlockAt(null); }, ms);
    return () => clearTimeout(t);
  }, [tiltLocked, tiltUnlockAt]);

  const liveJournalPnl = useMemo(() => {
    const map = {};
    for (const e of journalEntries) {
      if (e.status !== "open" || !e.entry || !e.ticker) continue;
      const q = watchlistData.find(d => d.symbol === e.ticker);
      if (!q || !q.price) continue;
      const dir = e.side === "SELL" ? -1 : 1;
      const size = e.size || 1;
      const livePnl = dir * (q.price - e.entry) * size;
      const livePnlPct = ((q.price - e.entry) / e.entry) * 100 * dir;
      map[e.id] = { livePrice: q.price, livePnl, livePnlPct };
    }
    return map;
  }, [journalEntries, watchlistData]);
  const flowRows = Array.isArray(optionsFlow?.flow) ? optionsFlow.flow : [];
  const flowBySymbol = Array.isArray(optionsFlow?.bySymbol) ? optionsFlow.bySymbol : [];
  const flowCallNotional = Number(optionsFlow?.summary?.callNotional || 0);
  const flowPutNotional = Number(optionsFlow?.summary?.putNotional || 0);
  const flowBias = flowCallNotional > flowPutNotional ? "CALL BIAS" : flowPutNotional > flowCallNotional ? "PUT BIAS" : "NEUTRAL";
  const flowAlerts = useMemo(() => {
    const threshold = Math.max(0, Number(flowFilters.autoAlertNotional || 250000));
    return flowRows
      .filter((row) => Number(row.notional || 0) >= threshold)
      .slice(0, 6)
      .map((row) => ({
        symbol: row.symbol,
        type: "flow",
        score: Math.min(99, Math.max(60, Math.round((Number(row.notional || 0) / Math.max(threshold, 1)) * 60))),
        text: `${row.tradeType} ${row.side} flow ${formatNum(row.notional || 0)} at ${row.strike} (${row.expiry || "near-term"})`,
        category: row.tradeType === "DARKPOOL" ? "dark-pool" : row.tradeType === "SWEEP" ? "sweep" : "flow-spike",
      }));
  }, [flowRows, flowFilters.autoAlertNotional]);
  const tvWebhookAlerts = useMemo(() => {
    return (tvWebhookRows || []).slice(0, 12).map((row) => {
      const side = String(row?.side || "INFO").toUpperCase();
      const type = side === "SELL" ? "risk" : side === "BUY" ? "opportunity" : "flow";
      const px = Number(row?.price || 0);
      return {
        symbol: String(row?.symbol || "").toUpperCase() || "TV",
        type,
        score: Math.max(60, Math.min(99, Number(row?.score || 78))),
        text: `TradingView ${side}${px > 0 ? ` @ ${px.toFixed(2)}` : ""} - ${row?.message || "Signal received"}`,
        source: "tradingview",
      };
    });
  }, [tvWebhookRows]);
  const combinedAlerts = useMemo(
    () => [...tvWebhookAlerts, ...econAutoRiskAlerts, ...macroEventAlerts, ...alerts, ...flowAlerts].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 12),
    [tvWebhookAlerts, econAutoRiskAlerts, macroEventAlerts, alerts, flowAlerts]
  );
  const topHeadlineTape = useMemo(() => {
    const alertItems = (combinedAlerts || []).slice(0, 8).map((a) => ({
      kind: "ALERT",
      symbol: a.symbol,
      text: `${a.symbol} ${String(a.type || "").toUpperCase()} ${a.text}`,
      tone: a.type === "risk" ? "red" : a.type === "flow" ? "amber" : "green",
    }));
    const newsItems = (newsData || []).slice(0, 10).map((n) => {
      const t = String(n?.title || "");
      const s = String(n?.ticker || "");
      const l = t.toLowerCase();
      const isUp = l.includes("upgrade") || l.includes("raises target") || l.includes("buy rating") || l.includes("outperform");
      const isDown = l.includes("downgrade") || l.includes("cuts target") || l.includes("sell rating") || l.includes("underperform");
      return {
        kind: isUp ? "UPGRADE" : isDown ? "DOWNGRADE" : "NEWS",
        symbol: s || "MKT",
        text: `${s ? `${s} ` : ""}${t}`,
        tone: isUp ? "green" : isDown ? "red" : "accent",
      };
    });
    const all = [...alertItems, ...newsItems];
    return all.length ? all : [{ kind: "INFO", symbol: "MKT", text: "Waiting for alerts/news flow...", tone: "accent" }];
  }, [combinedAlerts, newsData]);
  const selectedTvSource = useMemo(
    () => LIVE_TV_SOURCES.find((s) => s.id === tvSource) || LIVE_TV_SOURCES[0],
    [tvSource]
  );
  const buildHeuristicAgentOutput = useCallback((prompt, wl, topLongs, topRisks, topAlerts, spy, qqq, iwm, btc, avgIdx, focus, focusScore, focusTrend) => {
    const lines = [];
    lines.push("AI AGENT - INSTITUTIONAL SUMMARY (Heuristic)");
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push(`Prompt: ${prompt || "General market check"}`);
    lines.push("");
    lines.push("1) MARKET VERDICT");
    lines.push(`Regime: ${regime} | Tone: ${macroTone} | Session: ${marketSession}`);
    lines.push(`Index momentum: SPY ${spy >= 0 ? "+" : ""}${spy.toFixed(2)}% | QQQ ${qqq >= 0 ? "+" : ""}${qqq.toFixed(2)}% | IWM ${iwm >= 0 ? "+" : ""}${iwm.toFixed(2)}% | BTC ${btc >= 0 ? "+" : ""}${btc.toFixed(2)}%`);
    lines.push(`Flow bias: ${flowBias} (Calls ${formatNum(flowCallNotional)} vs Puts ${formatNum(flowPutNotional)})`);
    lines.push(`Bias: ${avgIdx > 0.45 && flowBias === "CALL BIAS" ? "BULLISH TILT" : avgIdx < -0.35 && flowBias === "PUT BIAS" ? "DEFENSIVE / BEARISH TILT" : "MIXED / SELECTIVE"}`);
    lines.push("");
    lines.push("2) BEST LONG CANDIDATES");
    if (topLongs.length) {
      lines.push(...topLongs.map((q, i) =>
        `${i + 1}. ${q.symbol} | RS ${Number(q.relVsSpy || 0) >= 0 ? "+" : ""}${Number(q.relVsSpy || 0).toFixed(2)}% | RVOL ${Number(q.rvol || 0).toFixed(2)}x | Score ${Math.round(Number(q.composite || 0))} | TV ${getTradingViewUrl(q.symbol)}`
      ));
    } else {
      lines.push("No clean long setups right now.");
    }
    lines.push("");
    lines.push("3) RISK NAMES / HEDGES");
    lines.push(...topRisks.map((q, i) =>
      `${i + 1}. ${q.symbol} | RS ${Number(q.relVsSpy || 0).toFixed(2)}% | RVOL ${Number(q.rvol || 0).toFixed(2)}x`
    ));
    lines.push("");
    lines.push("4) PRIORITY ALERTS");
    if (topAlerts.length) {
      lines.push(...topAlerts.map((a, i) => `${i + 1}. ${a.symbol} [${String(a.type || "").toUpperCase()} ${a.score}] ${a.text}`));
    } else {
      lines.push("No high-priority alerts.");
    }
    if (focus) {
      lines.push("");
      lines.push(`5) FOCUS SYMBOL: ${focus.symbol}`);
      lines.push(`Price ${formatNum(focus.price)} | CHG ${Number(focus.changesPercentage || 0) >= 0 ? "+" : ""}${Number(focus.changesPercentage || 0).toFixed(2)}% | Trend ${focusTrend}`);
      lines.push(`Composite ${focusScore?.composite || 0} | Tech ${focusScore?.tech || 0} | Fund ${focusScore?.fund || 0}`);
      lines.push(`TradingView: ${getTradingViewUrl(focus.symbol)}`);
    }
    lines.push("");
    lines.push("6) EXECUTION PLAN (TODAY)");
    lines.push("A) Trade only A/A+ setups with RS + RVOL confirmation.");
    lines.push("B) Keep size moderate until macro/event risk is clear.");
    lines.push("C) Cut losers fast, scale winners by confirmation.");
    lines.push("");
    lines.push("Decision-support only, not financial advice.");
    return lines.join("\n");
  }, [regime, macroTone, marketSession, flowBias, flowCallNotional, flowPutNotional]);

  const runAIAgent = useCallback(async () => {
    setAgentLoading(true);
    try {
      const prompt = String(agentPrompt || "").trim();
      const wl = [...(watchlistData || [])].filter((q) => Number(q.price || 0) > 0);
      const topLongs = rotationRank
        .filter((q) => Number(q.relVsSpy || 0) > 0 && Number(q.rvol || 0) >= 1)
        .slice(0, 5);
      const topRisks = [...rotationRank]
        .sort((a, b) => Number(a.relVsSpy || 0) - Number(b.relVsSpy || 0))
        .slice(0, 3);
      const topAlerts = [...(combinedAlerts || [])].slice(0, 4);

      const findBySym = (sym) => wl.find((q) => q.symbol === sym) || null;
      const spy = Number(findBySym("SPY")?.changesPercentage || macroData.find((m) => m.symbol === "SPY")?.changesPercentage || 0);
      const qqq = Number(findBySym("QQQ")?.changesPercentage || macroData.find((m) => m.symbol === "QQQ")?.changesPercentage || 0);
      const iwm = Number(findBySym("IWM")?.changesPercentage || macroData.find((m) => m.symbol === "IWM")?.changesPercentage || 0);
      const btc = Number(macroData.find((m) => m.symbol === "BTCUSD")?.changesPercentage || 0);
      const avgIdx = (spy + qqq + iwm) / 3;

      const allSyms = Array.from(new Set([...wl.map((q) => q.symbol), ...rotationRank.map((q) => q.symbol)]));
      const matchedSymbol = allSyms.find((s) => prompt.toUpperCase().includes(s));
      const focus = matchedSymbol ? findBySym(matchedSymbol) : null;
      const focusScore = focus ? computeScores(focus) : null;
      const focusTrend = focus ? classifyTrend(focus) : null;

      // Try the server-side Claude AI endpoint first; fall back to heuristic if not configured.
      try {
        const indexRows = [
          { label: "SPY", value: spy },
          { label: "QQQ", value: qqq },
          { label: "IWM", value: iwm },
          { label: "BTC", value: btc },
        ];
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            regime,
            macroTone,
            session: marketSession,
            flowBias,
            flowCallNotional,
            flowPutNotional,
            indexRows,
            topLongs,
            topRisks,
            alerts: topAlerts,
            focus: focus ? { symbol: focus.symbol, price: focus.price, changesPercentage: focus.changesPercentage, trend: focusTrend, score: focusScore?.composite || 0 } : null,
          }),
        });
        const data = await res.json();
        if (res.ok && data.output) {
          setAgentOutput(`AI AGENT - CLAUDE ANALYSIS\nGenerated: ${new Date().toLocaleString()}\n\n${data.output}`);
          setAgentRunAt(new Date().toLocaleString());
          return;
        }
      } catch {}

      // Heuristic fallback
      const output = buildHeuristicAgentOutput(prompt, wl, topLongs, topRisks, topAlerts, spy, qqq, iwm, btc, avgIdx, focus, focusScore, focusTrend);
      setAgentOutput(output);
      setAgentRunAt(new Date().toLocaleString());
    } finally {
      setAgentLoading(false);
    }
  }, [agentPrompt, watchlistData, rotationRank, combinedAlerts, macroData, regime, macroTone, marketSession, flowBias, flowCallNotional, flowPutNotional, buildHeuristicAgentOutput]);
  const runMorningBrief = useCallback(async () => {
    setBriefLoading(true);
    try {
      const spy = Number(macroData.find((m) => m.symbol === "SPY")?.changesPercentage || 0);
      const qqq = Number(macroData.find((m) => m.symbol === "QQQ")?.changesPercentage || 0);
      const iwm = Number(macroData.find((m) => m.symbol === "IWM")?.changesPercentage || 0);
      const btc = Number(macroData.find((m) => m.symbol === "BTCUSD")?.changesPercentage || 0);
      const topMovers = [...watchlistData]
        .sort((a, b) => Math.abs(b.changesPercentage || 0) - Math.abs(a.changesPercentage || 0))
        .slice(0, 5);
      const indexRows = [{ label: "SPY", value: spy }, { label: "QQQ", value: qqq }, { label: "IWM", value: iwm }, { label: "BTC", value: btc }];
      const briefPrompt = `Morning market brief for ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}. Session: ${marketSession}. Regime: ${regime}. Flow: ${flowBias}. Give me: 1) Market tone in 2 sentences, 2) Top 3 names to watch and why, 3) Key risks today, 4) One sentence action plan. Be direct and concise.`;
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: briefPrompt, regime, macroTone, session: marketSession, flowBias, flowCallNotional, flowPutNotional, indexRows, topLongs: rotationRank.slice(0, 3), topRisks: [...rotationRank].sort((a, b) => a.relVsSpy - b.relVsSpy).slice(0, 2), alerts: combinedAlerts.slice(0, 3) }),
        });
        const data = await res.json();
        if (res.ok && data.output) {
          setBriefText(data.output);
          setBriefAt(new Date().toLocaleTimeString());
          return;
        }
      } catch {}
      // Heuristic fallback
      const tone = spy >= 0.5 ? "BULLISH" : spy <= -0.5 ? "BEARISH" : "MIXED";
      const movers = topMovers.slice(0, 3).map((q) => `${q.symbol} ${q.changesPercentage >= 0 ? "+" : ""}${(q.changesPercentage || 0).toFixed(2)}%`).join(", ");
      setBriefText(`Market ${tone} | SPY ${spy >= 0 ? "+" : ""}${spy.toFixed(2)}% QQQ ${qqq >= 0 ? "+" : ""}${qqq.toFixed(2)}% IWM ${iwm >= 0 ? "+" : ""}${iwm.toFixed(2)}%\n\nTop movers: ${movers}\n\nRegime: ${regime} · Flow: ${flowBias} · Session: ${marketSession}\n\nWatch for volatility around economic events. Manage size.`);
      setBriefAt(new Date().toLocaleTimeString());
    } finally {
      setBriefLoading(false);
    }
  }, [macroData, watchlistData, marketSession, regime, flowBias, flowCallNotional, flowPutNotional, macroTone, rotationRank, combinedAlerts]);

  const applyWorkflowPrimary = useCallback((candidate, meta = {}) => {
    if (!candidate?.symbol) return;
    const entry = Number(candidate.entry || 0);
    const stop = Number(candidate.stop || 0);
    const target = Number(candidate.target || 0);
    setTerminalSymbol(candidate.symbol);
    setBacktestSymbol(candidate.symbol);
    if (entry > 0) setRiskEntry(entry.toFixed(2));
    if (stop > 0) setRiskStop(stop.toFixed(2));
    const liveRow = watchlistData.find((q) => q.symbol === candidate.symbol);
    if (liveRow) setSelectedStock(liveRow);
    setWorkflowAutoPlan((prev) => ({
      ...(prev || {}),
      ...meta,
      symbol: candidate.symbol,
      entry,
      stop,
      target,
      score: Number(candidate.score || 0),
      why: candidate.why || "No rationale available.",
    }));
    try { localStorage.setItem("mterminal_load_sym", candidate.symbol); } catch {}
    setActiveTab("mterminal");
  }, [watchlistData]);

  const runWorkflowAuto = useCallback(async () => {
    const now = new Date().toLocaleString();
    const macroRegime = String(regime || "Neutral");
    const spy = Number(macroData.find((m) => m.symbol === "SPY")?.changesPercentage || 0);
    const flowMap = new Map((flowBySymbol || []).map((f) => [f.symbol, f]));
    const alertMap = new Map((combinedAlerts || []).map((a) => [a.symbol, Math.max(0, Number(a.score || 0))]));
    let sourceRows = scannerFilters.scope === "market" ? marketUniverseData : watchlistData;
    if (scannerFilters.scope === "market" && (!sourceRows || sourceRows.length === 0)) {
      sourceRows = await loadMarketUniverse();
    }
    const candidates = (sourceRows || [])
      .filter((q) => Number(q?.price || 0) > 0)
      .map((q) => {
        const scores = computeScores(q);
        const rvol = q.avgVolume ? q.volume / q.avgVolume : 0;
        const change = Number(q.changesPercentage || 0);
        const delta30 = Number(q.delta30m || 0);
        const sectorEtf = STOCK_TO_SECTOR[q.symbol] || "";
        const sectorPerf = Number(sectorData.find((s) => s.symbol === sectorEtf)?.changesPercentage || 0);
        const relVsSector = change - sectorPerf;
        const relVsSpy = change - spy;
        const flow = flowMap.get(q.symbol);
        const cp = Number(flow?.callPutRatio || 1);
        const flowBoost = flow ? (cp >= 1 ? Math.min(12, (cp - 1) * 8 + 4) : -Math.min(8, (1 - cp) * 8)) : 0;
        const alertBoost = (alertMap.get(q.symbol) || 0) * 0.12;
        const tickerIntel = newsIntel.byTicker[q.symbol] || { upgrades: 0, downgrades: 0, buyMentions: 0, sellMentions: 0 };
        const ratingBoost = (tickerIntel.upgrades + tickerIntel.buyMentions) * 2 - (tickerIntel.downgrades + tickerIntel.sellMentions) * 2.5;
        const regimePenalty = macroRegime.includes("Risk-Off") && change > 0 ? -3 : 0;
        const score = (
          scores.composite * 0.5 +
          Math.max(-5, Math.min(8, change)) * 3 +
          Math.max(-3, Math.min(4, delta30)) * 2.4 +
          Math.max(-4, Math.min(5, relVsSector)) * 2.1 +
          Math.max(-4, Math.min(5, relVsSpy)) * 1.8 +
          Math.max(0, Math.min(3, rvol - 1)) * 8 +
          flowBoost +
          alertBoost +
          ratingBoost +
          regimePenalty
        );
        const entry = Number(q.price || 0);
        const stop = entry > 0 ? entry * 0.97 : 0;
        const target = entry > 0 ? entry + (entry - stop) * 2 : 0;
        const reasons = [];
        reasons.push(`Composite ${scores.composite}`);
        if (rvol >= 1.2) reasons.push(`RVOL ${rvol.toFixed(2)}x`);
        if (relVsSector > 0) reasons.push(`Outperforming ${sectorEtf || "sector"} by ${relVsSector.toFixed(2)}%`);
        if (relVsSpy > 0) reasons.push(`Beating SPY by ${relVsSpy.toFixed(2)}%`);
        if (flow) reasons.push(`Options C/P ${cp.toFixed(2)}`);
        if (tickerIntel.upgrades > 0) reasons.push(`Upgrade/Bullish mentions ${tickerIntel.upgrades + tickerIntel.buyMentions}`);
        if (tickerIntel.downgrades > 0) reasons.push(`Downgrade risk ${tickerIntel.downgrades}`);
        if (delta30 > 0) reasons.push(`30m momentum +${delta30.toFixed(2)}%`);
        return {
          symbol: q.symbol,
          score: Number(score.toFixed(1)),
          why: reasons.slice(0, 5).join(" | "),
          entry,
          stop,
          target,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const primary = candidates[0] || { symbol: "N/A", score: 0, why: "No candidates", entry: 0, stop: 0, target: 0 };
    const previousSymbol = String(workflowAutoPlan?.symbol || "");
    const rotatedPrimary = candidates[1] && previousSymbol === primary.symbol && Math.abs(primary.score - candidates[1].score) <= 4
      ? candidates[1]
      : primary;
    const focusList = candidates.slice(0, 3).map((c) => c.symbol).join(", ");

    setWorkflowState((prev) => ({
      premarket: {
        ...prev.premarket,
        checklist: prev.premarket.checklist.map((x) => ({ ...x, done: true })),
        notes: `Auto plan generated ${now}\nScope: ${scannerFilters.scope.toUpperCase()}\nSession: ${marketSession}\nRegime: ${macroRegime}\nFocus list: ${focusList || "N/A"}\nPrimary candidate: ${rotatedPrimary.symbol}\nWHY: ${rotatedPrimary.why}\nAnalyst upgrades: ${newsIntel.upgrades.length} | downgrades: ${newsIntel.downgrades.length}\nMacro green flags: ${macroSignalFlags.green.length} | red flags: ${macroSignalFlags.red.length}`,
      },
      live: {
        ...prev.live,
        checklist: prev.live.checklist.map((x) => ({ ...x, done: true })),
        notes: `Execution focus: ${rotatedPrimary.symbol}\nInstitutional score: ${rotatedPrimary.score}\nEntry: ${rotatedPrimary.entry > 0 ? `$${rotatedPrimary.entry.toFixed(2)}` : "N/A"}\nStop: ${rotatedPrimary.stop > 0 ? `$${rotatedPrimary.stop.toFixed(2)}` : "N/A"}\nTarget: ${rotatedPrimary.target > 0 ? `$${rotatedPrimary.target.toFixed(2)}` : "N/A"}\nWHY: ${rotatedPrimary.why}`,
      },
      postmarket: {
        ...prev.postmarket,
        checklist: prev.postmarket.checklist,
        notes: prev.postmarket.notes || "Postmarket review placeholder generated. Fill after close.",
      },
    }));

    setWorkflowAutoPlan({
      createdAt: now,
      symbol: rotatedPrimary.symbol,
      entry: rotatedPrimary.entry,
      stop: rotatedPrimary.stop,
      target: rotatedPrimary.target,
      score: rotatedPrimary.score,
      why: rotatedPrimary.why,
      scope: scannerFilters.scope,
      regime: macroRegime,
      top3: focusList || "N/A",
      candidates,
    });
    applyWorkflowPrimary(rotatedPrimary, {
      createdAt: now,
      scope: scannerFilters.scope,
      regime: macroRegime,
      top3: focusList || "N/A",
      candidates,
    });
  }, [watchlistData, marketUniverseData, macroData, sectorData, flowBySymbol, combinedAlerts, newsIntel, regime, marketSession, macroSignalFlags, workflowAutoPlan?.symbol, applyWorkflowPrimary, scannerFilters.scope, loadMarketUniverse]);

  const riskPlan = useMemo(() => {
    const account = Number(riskAccount || 0);
    const pct = Number(riskPct || 0) / 100;
    const entry = Number(riskEntry || 0);
    const stop = Number(riskStop || 0);
    const maxPosPct = Math.max(1, Math.min(100, Number(riskMaxPosPct || 0)));
    const corrCap = Math.max(0.3, Math.min(1, Number(riskCorrCap || 0)));
    const atrPct = Math.max(0.2, Number(riskAtrPct || 0));
    const slipBps = Math.max(0, Number(riskSlipBps || 0));
    const side = String(riskSide || "long").toLowerCase() === "short" ? "short" : "long";
    const quality = String(riskSetupQuality || "A").toUpperCase();
    const qualityMult = quality === "A+" ? 1 : quality === "A" ? 0.9 : quality === "B" ? 0.72 : 0.55;
    const regimeMult = regime === "Risk-On" ? 1 : regime === "Goldilocks" ? 0.95 : regime === "Neutral" ? 0.85 : regime === "Risk-Off" ? 0.6 : regime === "Defensive" ? 0.65 : 0.8;

    const baseRiskDollars = account * pct;
    const adjustedRiskBudget = baseRiskDollars * qualityMult * regimeMult;
    const rawStopDistance = Math.abs(entry - stop);
    const slippagePerShare = entry > 0 ? entry * (slipBps / 10000) : 0;
    const perShare = Math.max(0, rawStopDistance + slippagePerShare);
    const baseShares = perShare > 0 ? Math.floor(adjustedRiskBudget / perShare) : 0;
    const volAdj = Math.max(0.45, Math.min(1.2, 2.5 / atrPct));
    const sharesAfterModel = Math.floor(baseShares * volAdj * corrCap);
    const maxNotional = account * (maxPosPct / 100);
    const maxSharesByNotional = entry > 0 ? Math.floor(maxNotional / entry) : 0;
    const shares = Math.max(0, Math.min(sharesAfterModel, maxSharesByNotional || sharesAfterModel));
    const position = shares * entry;
    const estRisk = shares * perShare;
    const stopPct = entry > 0 ? (rawStopDistance / entry) * 100 : 0;
    const t1 = side === "long" ? entry + perShare : entry - perShare;
    const t2 = side === "long" ? entry + perShare * 2 : entry - perShare * 2;
    const remainingCap = Math.max(0, maxNotional - position);

    return {
      side,
      quality,
      regime,
      regimeMult,
      qualityMult,
      riskDollars: adjustedRiskBudget,
      baseRiskDollars,
      perShare,
      stopPct,
      shares,
      position,
      estRisk,
      t1,
      t2,
      maxNotional,
      remainingCap,
      maxSharesByNotional,
      volAdj,
      corrCap,
      slippagePerShare,
    };
  }, [riskAccount, riskPct, riskEntry, riskStop, riskMaxPosPct, riskCorrCap, riskAtrPct, riskSlipBps, riskSide, riskSetupQuality, regime]);
  const regimeColor = {
    "Risk-On": C.green, "Risk-Off": C.red, "Growth": C.cyan,
    "Goldilocks": C.green, "Defensive": C.amber, "Neutral": C.textSec, "Loading…": C.textDim,
  };
  const dataFreshSec = lastUpdate ? Math.max(0, Math.floor((Date.now() - lastUpdate.getTime()) / 1000)) : null;
  const dataBadge = dataSourceStatus === "live"
    ? (dataFreshSec !== null && dataFreshSec > 90 ? "STALE" : "LIVE")
    : dataSourceStatus === "updating" ? "UPDATING" : dataSourceStatus === "degraded" ? "DEGRADED" : "CONNECTING";
  const dataBadgeColor = dataBadge === "LIVE" ? C.green : dataBadge === "UPDATING" ? C.accent : dataBadge === "STALE" ? C.amber : C.red;
  const providersConfigured = [providerKeys.finnhubKey, providerKeys.fmpKey, providerKeys.polygonKey, providerKeys.uwKey, providerKeys.tradierKey]
    .filter((x) => String(x || "").trim()).length;
  const tvWebhookToken = String(settings.tvWebhookToken || "").trim();
  const tvWebhookUrl = useMemo(() => {
    try {
      const base = `${window.location.origin}/api/webhooks/tradingview`;
      return tvWebhookToken ? `${base}?token=${encodeURIComponent(tvWebhookToken)}` : base;
    } catch {
      return tvWebhookToken ? `/api/webhooks/tradingview?token=${encodeURIComponent(tvWebhookToken)}` : "/api/webhooks/tradingview";
    }
  }, [tvWebhookToken]);
  const panelCount = terminalLayout === "4" ? 4 : terminalLayout === "2" ? 2 : 1;
  const activePanelSymbols = terminalPanelSymbols.slice(0, panelCount);
  const handlePanelSymbolChange = useCallback((idx, symbol) => {
    setTerminalPanelSymbols((prev) => {
      const next = [...prev];
      next[idx] = symbol;
      return next;
    });
    if (idx === 0) setTerminalSymbol(symbol);
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    setLoading(true);
    fetchAll(apiKey).finally(() => setLoading(false));
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchAll(apiKey), 180000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [apiKey, fetchAll]);

  useEffect(() => {
    if (scannerFilters.scope !== "market") return;
    if (marketUniverseData.length > 0) return;
    loadMarketUniverse();
  }, [scannerFilters.scope, marketUniverseData.length, loadMarketUniverse]);

  if (!appUnlocked) {
    return (
      <PasswordLockScreen
        value={unlockInput}
        error={unlockError}
        onChange={(v) => { setUnlockInput(v); if (unlockError) setUnlockError(""); }}
        onSubmit={handleUnlock}
      />
    );
  }

  if (!apiKey) return <ApiKeyScreen onSubmit={handleApiKey} />;


  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: SANS, zoom: (isMobile ? 1 : isTablet ? UI_ZOOM_TABLET : UI_ZOOM) * pageZoom, lineHeight: 1.5, width: "100%", maxWidth: "100vw", overflowX: "hidden", filter: brightness < 100 ? `brightness(${brightness}%)` : "none", transition: "filter 0.2s" }}>
      <TradingCopilot C={C} MONO={MONO} SANS={SANS} macroData={macroData} watchlistSymbols={watchlistSymbols} />
      {/* Google Fonts — Inter (UI) + JetBrains Mono (data/numbers) */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet" />
      {/* Global baseline styles */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { font-size: 14px; -webkit-text-size-adjust: 100%; }
        body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
        /* Thin, attractive scrollbars on desktop */
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(128,160,200,0.28); border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(128,160,200,0.50); }
        * { scrollbar-width: thin; scrollbar-color: rgba(128,160,200,0.28) transparent; }
        /* Monospace digits should have tabular figures */
        .mono, [class*="mono"] { font-variant-numeric: tabular-nums; }
      `}</style>
      {/* Mobile-specific global styles */}
      {isMobile && (
        <style>{`
          * { -webkit-tap-highlight-color: transparent; }
          select, input[type="text"], input[type="number"], input[type="search"] { font-size: 16px !important; }
          ::-webkit-scrollbar { display: none; }
          * { scrollbar-width: none; }
          .axiom-ticker-track { animation-duration: 280s !important; }
          table { width: 100%; }
          td, th { white-space: nowrap; }
          .mobile-nav-btn { min-height: 44px !important; min-width: 44px !important; padding: 10px 11px !important; font-size: 11px !important; }
          .tablet-nav-btn { min-height: 44px !important; padding: 8px 12px !important; font-size: 11px !important; }
          .mobile-subnav-btn { min-height: 40px !important; padding: 8px 12px !important; font-size: 10px !important; }
          .mobile-content { padding: 10px 10px 24px !important; }
        `}</style>
      )}

      {/* Top Bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: isMobile ? "6px 10px" : "8px 18px", borderBottom: `1px solid ${C.border}`,
        background: themeMode === "dark" ? "#0d1422" : C.surface,
        flexWrap: "wrap", rowGap: 6,
        position: "sticky", top: 0, zIndex: 40,
        boxShadow: themeMode === "dark" ? "0 1px 0 #1a2e4a, 0 2px 12px rgba(0,0,0,0.5)" : "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
          {/* ☰ Hamburger — mobile only, FAR LEFT before logo */}
          {isMobile && (
            <button
              onClick={() => { setMobileMenuOpen(s => !s); setMobileSearchOpen(false); }}
              style={{
                background: mobileMenuOpen ? `${C.accent}18` : "transparent",
                border: `1px solid ${mobileMenuOpen ? C.accent : C.border}`,
                color: mobileMenuOpen ? C.accent : C.textSec,
                borderRadius: 6, width: 40, height: 40,
                fontSize: 18, cursor: "pointer", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >☰</button>
          )}
          {/* Logo + brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <img
              src="/axiom-runner/assets/am-trading-logo.png?v=2"
              alt="AM Trading Platform"
              style={{ width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, objectFit: "contain", borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}
            />
            {!isMobile && (
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
                <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: 16, color: C.text, letterSpacing: "-0.01em" }}>AM TRADING</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.1em" }}>PLATFORM</span>
              </div>
            )}
          </div>
          {/* User pill */}
          <div style={{
            display: "flex", alignItems: "center", gap: 0,
            background: "transparent", border: "none",
            borderRadius: 999, padding: "2px", flexShrink: 0,
          }}>
            <img
              src="/axiom-runner/assets/avatar.jpg"
              alt=""
              style={{
                width: 36, height: 36, borderRadius: "50%",
                objectFit: "cover", objectPosition: "center 15%",
                border: `2px solid ${C.accent}`,
                flexShrink: 0,
              }}
            />
          </div>
          {/* Nav tabs — grouped */}
          {(() => {
            const NAV_GROUPS = [
              // breadth/sectors/rotation/cot hidden from the MONITOR subnav bar
              // (see SUB_GROUPS.dashboard comment) but kept here so this pill
              // still highlights correctly if you land on one via the palette.
              // "dashboard" listed first (not "start") — clicking the MONITOR
              // pill uses tabs[0] as the landing tab, and Start Here is
              // onboarding-only, not a repeat destination.
              { id: "dashboard",  label: "📊 MONITOR",    tabs: ["dashboard", "start", "quotes", "crypto", "news", "econ-cal", "macro", "breadth", "sectors", "rotation", "cot"] },
              // SMART MONEY folded into TERMINAL 2026-07-12 per user request
              // ("add inside terminal") — its own top-level pill is gone, all
              // 11 of its tabs (3 now visible in the TERMINAL subnav, 8 still
              // palette-only) live under this group's membership now so
              // TERMINAL highlights correctly for all of them.
              { id: "mterminal",  label: "🖥 TERMINAL",   tabs: ["mterminal", "daytrade", "movers", "sm-brief", "darkpool", "dp-heatmap", "insider", "smartmoney", "flow", "shortint", "short-changes", "sec-filings", "social", "correlation"] },
              // "greenlight" listed first (not "rhpro"/Command Deck) — clicking
              // the PRO TRADE pill uses tabs[0] as the landing tab, and it
              // should land on one of the 3 tabs actually shown in the subnav,
              // matching the app's own global default landing tab.
              { id: "rhpro",      label: "📈 PRO TRADE",  tabs: ["greenlight", "tradeplanner", "rhpro", "rhpro-apex", "rhpro-scan", "rhpro-lists", "rhpro-heat", "holdings", "rhpro-journal", "rhpro-coach", "morning-routine", "mytrades",
                // Hidden from the PRO TRADE subnav bar (see SUB_GROUPS.rhpro
                // comment) but still reachable — kept here so this group still
                // highlights correctly if you land on one of these another way.
                "gl-backtest", "combined", "dipbuy", "squeeze", "under10", "gap", "adol22", "smartscan", "outlook", "predictions"] },
              { id: "coach",      label: "🧭 المدرّب",    tabs: ["coach"] },
              { id: "education",  label: "🎓 LEARN",      tabs: ["propath", "options-edu", "notes", "education"] },
              { id: "islamic",    label: "☪️",             tabs: ["quran", "athan", "athkar", "tasbih"] },
            ];
            const scannerBadge = scannerRows.filter(r => r.scannerScore >= 70).length || null;
            return (
              <div style={{ display: "flex", gap: 2, overflowX: "auto", maxWidth: "100%", paddingBottom: 0, scrollbarWidth: "none", flexWrap: "nowrap", alignItems: "center" }}>
                {NAV_GROUPS.map(g => {
                  const isActive = g.tabs.includes(activeTab);
                  const hasAlertBadge = g.id === "portfolio" && triggeredAlertBadge > 0;
                  const hasScanBadge  = g.id === "scanner" && scannerBadge;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setActiveTab(g.tabs[0])}
                      className={isMobile ? "mobile-nav-btn" : isTablet ? "tablet-nav-btn" : ""}
                      style={{
                        border: "none",
                        background: isActive
                          ? (themeMode === "dark" ? `${C.accent}22` : `${C.accent}14`)
                          : "transparent",
                        color: isActive ? C.accent : C.textSec,
                        fontFamily: MONO, fontSize: 12, fontWeight: isActive ? 800 : 600,
                        padding: isMobile ? "10px 11px" : "6px 9px", borderRadius: 6, cursor: "pointer",
                        borderBottom: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
                        letterSpacing: "0.04em", whiteSpace: "nowrap",
                        transition: "color 0.15s, background 0.15s",
                        display: "inline-flex", alignItems: "center", gap: 4,
                        minHeight: isMobile ? 44 : "auto",
                      }}
                    >
                      {g.label}
                      {hasAlertBadge && (
                        <span style={{ background: C.red, color: "#fff", borderRadius: 10, padding: "2px 6px", fontSize: 12, fontWeight: 800 }}>{triggeredAlertBadge}</span>
                      )}
                      {hasScanBadge && (
                        <span style={{ background: C.green, color: "#fff", borderRadius: 10, padding: "2px 6px", fontSize: 12, fontWeight: 800 }}>{scannerBadge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
        {/* Mobile: theme toggle — shown on mobile only here */}
        {isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setSettings((s) => ({ ...s, themeMode: themeMode === "dark" ? "light" : "dark" }))}
              style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, width: 40, height: 40, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >{themeMode === "dark" ? "☀" : "🌙"}</button>
            {/* Dimmer on mobile too */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <span style={{ fontSize: 12 }}>{brightness <= 60 ? "🌑" : brightness <= 80 ? "🌗" : "☀️"}</span>
              <input type="range" min={30} max={100} step={5} value={brightness}
                onChange={e => setSettings(s => ({ ...s, brightness: Number(e.target.value) }))}
                style={{ width: 50, accentColor: C.accent, cursor: "pointer" }} />
            </div>
          </div>
        )}

        {/* Desktop action buttons — right side of nav bar */}
        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, marginLeft: 8 }}>
            <input
              value={symbolSearch}
              onChange={(e) => setSymbolSearch(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") handleSymbolSearch(); }}
              placeholder="Search ticker…"
              style={{ width: 120, border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "3px 8px", fontFamily: MONO, fontSize: 12, outline: "none", height: 24 }}
            />
            <button onClick={handleSymbolSearch} style={{ border: `1px solid ${C.border}`, background: C.card, color: C.textSec, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer", height: 24 }}>SEARCH</button>
            <button onClick={() => openTradingView(symbolSearch || terminalSymbol)} style={{ border: `1px solid ${C.border}`, background: C.card, color: C.accent, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer", height: 24 }}>TV</button>
            <span style={{ width: 1, height: 14, background: C.border, flexShrink: 0 }} />
            <button onClick={() => { setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); }} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 12, padding: "3px 7px", borderRadius: 6, cursor: "pointer", height: 24 }}>{loading ? "⟳" : "REFRESH"}</button>
            <button
              title="Save watchlists, portfolio & settings to server"
              onClick={async () => {
                try {
                  const payload = { watchlists, portfolioHoldings, activeWlistId };
                  const r = await fetch("/api/cloud/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                  const d = await r.json();
                  if (d.ok) alert(`☁ Saved to cloud at ${new Date(d.savedAt).toLocaleTimeString()}`);
                  else alert("Save failed: " + d.error);
                } catch (e) { alert("Save failed: " + e.message); }
              }}
              style={{ background: `${C.green}14`, border: `1px solid ${C.green}55`, color: C.green, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "3px 7px", borderRadius: 6, cursor: "pointer", height: 24 }}
            >☁ SAVE</button>
            <button
              title="Load watchlists, portfolio & settings from server"
              onClick={async () => {
                try {
                  const r = await fetch("/api/cloud/load");
                  const d = await r.json();
                  if (!d.ok || !d.data) { alert("No cloud save found."); return; }
                  if (!window.confirm(`Load cloud save from ${new Date(d.data.savedAt).toLocaleString()}? This will overwrite your current data.`)) return;
                  if (Array.isArray(d.data.watchlists) && d.data.watchlists.length) {
                    setWatchlists(d.data.watchlists);
                    const aid = d.data.activeWlistId || d.data.watchlists[0].id;
                    setActiveWlistId(aid);
                  }
                  if (Array.isArray(d.data.portfolioHoldings)) setPortfolioHoldings(d.data.portfolioHoldings);
                  alert("☁ Loaded from cloud!");
                } catch (e) { alert("Load failed: " + e.message); }
              }}
              style={{ background: `${C.accent}14`, border: `1px solid ${C.accent}55`, color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "3px 7px", borderRadius: 6, cursor: "pointer", height: 24 }}
            >☁ LOAD</button>
            <a href="/dealer" target="_blank" rel="noopener" style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 12, padding: "3px 7px", borderRadius: 6, cursor: "pointer", textDecoration: "none", height: 24, display: "flex", alignItems: "center" }}>DIXIE</a>
            <button onClick={() => setActiveTab("mytrades")} title="Open MY TRADES (paper auto-pilot positions)" style={{ background: "#7c3aed14", border: `1px solid #7c3aed55`, color: "#a78bfa", fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "3px 7px", borderRadius: 6, cursor: "pointer", height: 24 }}>📋 TRADES</button>
            <button onClick={handleLock} style={{ background: `${C.red}10`, border: `1px solid ${C.red}44`, color: C.red, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "3px 7px", borderRadius: 6, cursor: "pointer", height: 24 }}>LOCK</button>
            <button onClick={() => setPaletteOpen(true)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 12, padding: "3px 7px", borderRadius: 6, cursor: "pointer", height: 24 }}>CMD</button>
            <button onClick={() => setSettings((s) => ({ ...s, themeMode: themeMode === "dark" ? "light" : "dark" }))} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textDim, fontFamily: MONO, fontSize: 12, padding: "3px 7px", borderRadius: 6, cursor: "pointer", height: 24 }}>
              {themeMode === "dark" ? "☀" : "●"}
            </button>

            {/* ── Brightness dimmer ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 6px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, height: 24 }}
              title={`Brightness ${brightness}% — drag to dim`}>
              <span style={{ fontSize: 12 }}>{brightness <= 60 ? "🌑" : brightness <= 80 ? "🌗" : "☀️"}</span>
              <input
                type="range" min={30} max={100} step={5}
                value={brightness}
                onChange={e => setSettings(s => ({ ...s, brightness: Number(e.target.value) }))}
                style={{ width: 60, height: 4, accentColor: C.accent, cursor: "pointer" }}
              />
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, minWidth: 26 }}>{brightness}%</span>
            </div>

            {/* ── Page zoom (100 → 125 → 150) ── */}
            <button onClick={cycleZoom} title="Zoom the whole page (100 → 125 → 150 → 100)"
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 8px", height: 24, cursor: "pointer",
                background: pageZoom > 1 ? `${C.accent}18` : C.card, border: `1px solid ${pageZoom > 1 ? C.accent : C.border}`, borderRadius: 6,
                fontFamily: MONO, fontSize: 12, fontWeight: 700, color: pageZoom > 1 ? C.accent : C.textDim }}>
              🔍 {Math.round(pageZoom * 100)}%
            </button>

            {/* ── Status chips (inline after ● button) ── */}
            <span style={{ width: 1, height: 14, background: C.border, flexShrink: 0, marginLeft: 2 }} />

            {/* Live dot + timestamp */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", background: C.card, borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: dataBadge === "LIVE" ? C.green : dataBadge === "STALE" ? C.amber : C.red, boxShadow: `0 0 5px ${dataBadge === "LIVE" ? C.green : C.amber}`, animation: "pulse 2s infinite", flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, whiteSpace: "nowrap" }}>
                {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "CONNECTING…"}
              </span>
            </div>

            {/* Weather */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${C.border}`, background: C.card, borderRadius: 5, padding: "4px 10px", fontSize: 12, fontFamily: MONO, color: C.textSec, whiteSpace: "nowrap" }}>
              <span style={{ color: C.accent, fontWeight: 700 }}>WEATHER {WEATHER_ZIP}</span>
              {weatherData ? (
                <>
                  <span style={{ fontWeight: 800, color: weatherData.temp >= 85 ? C.red : weatherData.temp <= 40 ? C.cyan : C.text }}>{weatherData.temp.toFixed(0)}°F</span>
                  <span style={{ color: C.textDim }}>{weatherCodeLabel(weatherData.code)}</span>
                </>
              ) : <span style={{ color: C.textDim }}>—</span>}
            </div>

            {/* Session countdown */}
            {(() => {
              const cdColor = sessionCountdown.session === "REGULAR" ? C.green : sessionCountdown.session === "PREMARKET" ? C.accent : sessionCountdown.session === "AFTERMARKET" ? C.amber : C.textDim;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: `${cdColor}0e`, borderRadius: 6, border: `1px solid ${cdColor}2a` }}>
                  <span style={{ fontSize: 12, fontFamily: MONO, color: C.textDim }}>{sessionCountdown.label}</span>
                  <span style={{ fontSize: 12, fontFamily: MONO, color: cdColor, fontWeight: 800 }}>{fmtCountdownShort(sessionCountdown.secs)}</span>
                </div>
              );
            })()}

            {/* Hijri date */}
            {athanHijri && (
              <div onClick={() => setActiveTab("athan")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", background: "#c9a84c0e", borderRadius: 6, border: "1px solid #c9a84c2a", cursor: "pointer", direction: "rtl" }}>
                <span style={{ fontSize: 12, fontFamily: "Arial, sans-serif", color: "#c9a84c", fontWeight: 700 }}>
                  {athanHijri.day} {athanHijri.month?.ar} {athanHijri.year} هـ
                </span>
              </div>
            )}

            {/* Portfolio P/L */}
            {portfolioSummary.totalCost > 0 && portfolioSummary.totalValue > 0 && (
              <div onClick={() => setActiveTab("portfolio")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6,
                border: `1px solid ${portfolioSummary.totalPnl >= 0 ? C.green : C.red}44`,
                background: portfolioSummary.totalPnl >= 0 ? `${C.green}0e` : `${C.red}0e`, cursor: "pointer" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>PORT</span>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: portfolioSummary.totalPnl >= 0 ? C.green : C.red }}>
                    {portfolioSummary.totalPnl >= 0 ? "+" : ""}{portfolioSummary.totalPnlPct.toFixed(2)}%
                  </div>
                  {(portfolioSummary.dayPnlTotal || 0) !== 0 && (
                    <div style={{ fontFamily: MONO, fontSize: 10, color: (portfolioSummary.dayPnlTotal||0) >= 0 ? C.green : C.red }}>
                      Today {(portfolioSummary.dayPnlTotal||0) >= 0 ? "+" : ""}{formatNum(portfolioSummary.dayPnlTotal||0)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Today P/L */}
            {(() => {
              const today = new Date().toISOString().slice(0, 10);
              const todayClosed = journalEntries.filter(e => e.status === "closed" && e.pnl != null && (e.closedAt || "").slice(0, 10) === today);
              if (!todayClosed.length) return null;
              const todayPnl = todayClosed.reduce((s, e) => s + e.pnl, 0);
              const color = todayPnl >= 0 ? C.green : C.red;
              return (
                <div onClick={() => setActiveTab("journal")} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 6, border: `1px solid ${color}44`, background: `${color}0e`, cursor: "pointer" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>TODAY</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color }}>{todayPnl >= 0 ? "+" : ""}${Math.round(todayPnl)}</span>
                </div>
              );
            })()}

            {/* Quran playing */}
            {quranPlaying && (
              <button onClick={() => { if (quranAudioRef.current) quranAudioRef.current.pause(); }} style={{ background: `#c9a84c18`, border: `1px solid #c9a84c55`, color: "#c9a84c", fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "5px 9px", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <span>▐▌</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}>
                  {SURAH_LIST.find(s => s[0] === quranSurah)?.[1] || `سورة ${quranSurah}`}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mobile menu drawer — opens from LEFT hamburger button */}
      {isMobile && mobileMenuOpen && (
        <div style={{
          borderBottom: `2px solid ${C.accent}33`,
          borderLeft: `3px solid ${C.accent}`,
          background: C.surface,
          boxShadow: "0 6px 24px rgba(0,0,0,0.15)",
        }}>
          {/* Search row — top of menu */}
          <div style={{ padding: "10px 12px 0", display: "flex", gap: 6 }}>
            <input
              autoFocus
              value={symbolSearch}
              onChange={(e) => setSymbolSearch(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") { handleSymbolSearch(); setMobileMenuOpen(false); } }}
              placeholder="🔍  Search ticker (e.g. NVDA)"
              style={{
                flex: 1, border: `1px solid ${C.border}`, background: C.surface,
                color: C.text, borderRadius: 8, padding: "12px 14px",
                fontFamily: MONO, fontSize: 15, outline: "none",
              }}
            />
            <button
              onClick={() => { handleSymbolSearch(); setMobileMenuOpen(false); }}
              style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 8, padding: "12px 18px", fontFamily: MONO, fontSize: 13, fontWeight: 800, cursor: "pointer" }}
            >GO</button>
            <button
              onClick={() => { openTradingView(symbolSearch || terminalSymbol); setMobileMenuOpen(false); }}
              style={{ border: `1px solid ${C.border}`, background: C.card, color: C.accent, borderRadius: 8, padding: "12px 14px", fontFamily: MONO, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >TV</button>
          </div>
          {/* Action buttons grid */}
          <div style={{ padding: "10px 12px 12px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <button
              onClick={() => { setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); setMobileMenuOpen(false); }}
              style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 12, padding: "12px 8px", borderRadius: 8, cursor: "pointer", minHeight: 48, fontWeight: 700 }}
            >{loading ? "⟳ …" : "⟳ REFRESH"}</button>
            <a
              href="/dealer" target="_blank" rel="noopener"
              onClick={() => setMobileMenuOpen(false)}
              style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 12, padding: "12px 8px", borderRadius: 8, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48, fontWeight: 700 }}
            >DIXIE</a>
            <button
              onClick={() => { setActiveTab("mytrades"); setMobileMenuOpen(false); }}
              style={{ background: "#7c3aed14", border: `1px solid #7c3aed55`, color: "#a78bfa", fontFamily: MONO, fontSize: 12, padding: "12px 8px", borderRadius: 8, cursor: "pointer", minHeight: 48, fontWeight: 700 }}
            >📋 TRADES</button>
            <button
              onClick={() => { setPaletteOpen(true); setMobileMenuOpen(false); }}
              style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 12, padding: "12px 8px", borderRadius: 8, cursor: "pointer", minHeight: 48, fontWeight: 700 }}
            >⌨ CMD</button>
            <button
              onClick={() => { handleLock(); setMobileMenuOpen(false); }}
              style={{ background: `${C.red}10`, border: `1px solid ${C.red}44`, color: C.red, fontFamily: MONO, fontSize: 12, padding: "12px 8px", borderRadius: 8, cursor: "pointer", minHeight: 48, fontWeight: 700 }}
            >🔒 LOCK</button>
          </div>
          {/* Status info row */}
          <div style={{ padding: "0 12px 10px", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {weatherData && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${C.border}`, background: C.card, borderRadius: 6, padding: "7px 12px", fontSize: 12, fontFamily: MONO, color: C.textSec }}>
                <span>☁</span>
                <span style={{ fontWeight: 800 }}>{weatherData.temp.toFixed(0)}°F</span>
                <span style={{ color: C.textDim }}>{weatherCodeLabel(weatherData.code)}</span>
              </div>
            )}
            {(() => {
              const cdColor = sessionCountdown.session === "REGULAR" ? C.green : sessionCountdown.session === "PREMARKET" ? C.accent : sessionCountdown.session === "AFTERMARKET" ? C.amber : C.textDim;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: `${cdColor}0e`, borderRadius: 6, border: `1px solid ${cdColor}2a` }}>
                  <span style={{ fontSize: 12, fontFamily: MONO, color: C.textDim }}>{sessionCountdown.label}</span>
                  <span style={{ fontSize: 12, fontFamily: MONO, color: cdColor, fontWeight: 800 }}>{fmtCountdownShort(sessionCountdown.secs)}</span>
                </div>
              );
            })()}
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: C.card, borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: dataBadge === "LIVE" ? C.green : C.amber, boxShadow: `0 0 4px ${C.green}` }} />
              <span style={{ fontSize: 12, fontFamily: MONO, color: C.textDim }}>{lastUpdate ? lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Market Session Banner — shows when market is NOT regular hours */}
      {marketSession !== "REGULAR" && (() => {
        const cfg = {
          PREMARKET:   { label: "PRE-MARKET", col: C.amber, bg: `${C.amber}14`, msg: "Market opens 9:30 AM ET · Pre-market prices may differ" },
          AFTERMARKET: { label: "AFTER-HOURS", col: C.purple, bg: `${C.purple}12`, msg: "Market closed · After-hours trading 4:00–8:00 PM ET" },
          OVERNIGHT:   { label: "MARKET CLOSED", col: C.textDim, bg: C.surface, msg: "Market opens 9:30 AM ET · Pre-market starts 4:00 AM ET" },
        }[marketSession] || null;
        if (!cfg) return null;
        return (
          <div style={{ padding: "5px 16px", background: cfg.bg, borderBottom: `1px solid ${cfg.col}33`,
            display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: cfg.col }}>{cfg.label}</span>
            <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{cfg.msg}</span>
          </div>
        );
      })()}

      {/* Market Index Strip — matches screenshot layout */}
      <MacroTape data={macroData} cryptoSnapshot={cryptoSnapshot} />

      {/* News / Alert Tape */}
      <div style={{ borderBottom: `1px solid ${C.border}`, background: "#06090e", overflow: "hidden", whiteSpace: "nowrap" }}>
        <div className="axiom-ticker-track" style={{ display: "inline-flex", alignItems: "center", gap: 26, padding: "6px 0", animation: "axiomTickerLTR 500s linear infinite" }}>
          {[...topHeadlineTape, ...topHeadlineTape].map((item, i) => {
            const toneColor = item.tone === "red" ? C.red : item.tone === "green" ? C.green : item.tone === "amber" ? C.amber : C.accent;
            const toneBg    = item.tone === "red" ? C.redBg : item.tone === "green" ? C.greenBg : item.tone === "amber" ? C.amberBg : `${C.accent}12`;
            return (
              <span key={`ticker-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, paddingRight: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: toneColor, background: toneBg, border: `1px solid ${toneColor}44`, borderRadius: 5, padding: "3px 7px" }}>
                  {item.kind}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: "#e8e8e8" }}>{item.symbol}</span>
                <span style={{ fontFamily: SANS, fontSize: 12, color: "#c8cfd8", maxWidth: 460, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", verticalAlign: "bottom" }}>
                  {item.text}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Sub-nav bar — shown when active tab belongs to a multi-tab group */}
      {(() => {
        const SUB_GROUPS = {
          // Trimmed 2026-07-11: was 12 tabs — breadth/sectors/rotation/cot are
          // real, fully-built, non-redundant widgets (added 2026-07-10) but
          // more "occasional deep lens" than "check every time" like the 8
          // below. Same "hide, don't delete" treatment as the PRO TRADE trim —
          // all 4 still fully work via the command palette (BREADTH GO,
          // SECTORS GO, ROTATION GO, COT GO). Add a line back here to
          // re-surface any of them.
          // Also left dormant (still work, just not surfaced — code untouched):
          // "calendar" (TV-iframe dup of Events), "heatmap" (portfolio P&L
          // heatmap, belongs nearer Holdings not market-wide monitoring),
          // feargreed/correlation/seasonality/darkpool/social/insider (real,
          // but lower daily-monitoring priority — most now live under the
          // 🕵️ SMART MONEY group instead).
          // Trimmed 2026-07-12 per user request ("fewer tabs, only what I use,
          // no distraction") — was 8 tabs. START HERE is onboarding-only (still
          // lands there automatically on first visit, no button needed) and
          // QUOTES/CRYPTO/NEWS/EVENTS/MACRO are all still fully wired, just not
          // in this bar — reachable via command palette (QUOTES/CRYPTO/NEWS/
          // EVENTS/MACRO GO).
          // MOVERS moved to TERMINAL 2026-07-12 per user request — now the
          // sole tab here, matching the existing single-tab precedent (coach).
          dashboard: [
            { id: "dashboard",  label: "📊 MONITOR" },
          ],
          terminal: [
            { id: "multitf",    label: "📈 CHART" },
            { id: "tv",         label: "📺 TV LIVE" },
          ],
          mterminal: [
            { id: "mterminal",  label: "🖥 MARKET TERMINAL" },
            { id: "daytrade",   label: "⚡ DAY TRADE" },
            { id: "movers",     label: "🔥 MOVERS" },
            { id: "sm-brief",   label: "🧠 AI BRIEF" },
            { id: "darkpool",   label: "🌊 DARK POOL" },
            { id: "flow",       label: "⚡ OPTIONS FLOW" },
          ],
          // Trimmed 2026-07-10: was 18 tabs (8 of them near-duplicate "rank
          // stocks, find setups" scanners). Kept the ones covering distinct,
          // non-overlapping jobs. The rest (GL Backtest, Compression+Signal,
          // Dip Buy, Squeeze, Under $10, Gap Scanner, Adol22, Smart Scan,
          // Predictions, Outlook) still work exactly as before — their code,
          // routes, and (for Adol22) backend Telegram alerts are untouched —
          // they're just not cluttering this bar. Add a line back here to
          // re-surface any of them.
          // Trimmed 2026-07-12 per user request — was 8 tabs, kept the 3 named
          // explicitly (autopilot + the two scanners). COMMAND DECK/HEAT MAP/
          // WATCHLISTS/HOLDINGS are still fully wired, just not in this bar —
          // reachable via command palette (DECK/SECTORHEAT/WATCHLISTS/HOLDINGS
          // GO). TRADE PLANNER and AI COACH added back 2026-07-12 — both are
          // complete, valuable features that just weren't discoverable.
          rhpro: [
            { id: "rhpro-apex", label: "🧠 TRADE PRO AI" },
            { id: "rhpro-scan", label: "🎯 SNIPER SCANNER" },
            { id: "greenlight",  label: "🟢 GREEN LIGHT + AUTOPILOT" },
            { id: "tradeplanner", label: "🎯 TRADE PLANNER" },
            { id: "rhpro-coach", label: "🎓 AI COACH" },
          ],
          // SMART MONEY folded into the mterminal group above 2026-07-12 —
          // AI Brief/Dark Pool/Options Flow are now part of SUB_GROUPS.mterminal.
          coach: [
            { id: "coach",        label: "🧭 المدرّب اليومي" },
          ],
          education: [
            { id: "propath",         label: "🎯 PRO PATH" },
            { id: "options-edu",     label: "📈 OPTIONS 101" },
            { id: "education",       label: "🎓 PSYCHOLOGY" },
            { id: "notes",           label: "📝 NOTES" },
          ],
          // TOOLS removed as a top-level group 2026-07-12 per user request
          // ("remove tools") — Settings/Deal Finder/Flight Finder/Lead
          // Responder are all still fully wired, just not in the nav bar,
          // reachable via command palette (TOOLS/DEALFINDER/FLIGHTFINDER/
          // LEADRESPONDER GO).
          // halal/soccer hidden 2026-07-10 (removed from nav, code untouched —
          // same "hide, don't delete" treatment as the PRO TRADE trim above).
          islamic: [
            { id: "quran",  label: "قرآن" },
            { id: "athan",  label: "الصلاة" },
            { id: "athkar", label: "أذكار" },
            { id: "tasbih", label: "تسبيح" },
          ],
        };
        const activeGroup = Object.entries(SUB_GROUPS).find(([, tabs]) =>
          tabs.some(t => !t.divider && t.id === activeTab)
        );
        if (!activeGroup) return null;
        const [, subTabs] = activeGroup;
        return (
          <div style={{
            borderBottom: `1px solid ${C.border}`,
            background: C.surface,
            padding: isMobile ? "0 6px" : "0 18px",
            display: "flex", alignItems: "center", gap: 1,
            overflowX: "auto", scrollbarWidth: "none",
          }}>
            {/* USE MY CHART button — only on CHART tab */}
            {activeTab === "terminal" && (
              <div style={{ marginLeft: "auto", padding: "0 4px", flexShrink: 0 }}>
                {tvChartMode === "widget" ? (
                  <button
                    onClick={() => { setTvChartMode("my_chart"); localStorage.setItem("tv_chart_mode","my_chart"); }}
                    style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                      border: `1px solid ${C.accent}`, background: `${C.accent}18`,
                      color: C.accent, borderRadius: 6,
                      padding: isMobile ? "8px 12px" : "3px 10px",
                      minHeight: isMobile ? 36 : "auto",
                      cursor: "pointer", whiteSpace: "nowrap" }}>
                    📊 MY TV CHART
                  </button>
                ) : (
                  <button
                    onClick={() => { setTvChartMode("widget"); localStorage.setItem("tv_chart_mode","widget"); }}
                    style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                      border: `1px solid ${C.border}`, background: C.surface,
                      color: C.textSec, borderRadius: 6,
                      padding: isMobile ? "8px 12px" : "3px 10px",
                      minHeight: isMobile ? 36 : "auto",
                      cursor: "pointer", whiteSpace: "nowrap" }}>
                    ← BUILT-IN CHART
                  </button>
                )}
              </div>
            )}

            {subTabs.map((t, ti) => {
              if (t.divider) return (
                <div key={`div-${ti}`} style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 6px", flexShrink: 0 }}>
                  <div style={{ width: 1, height: 16, background: C.border }} />
                  <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 900, color: C.textDim,
                    letterSpacing: "0.12em", opacity: 0.6 }}>{t.divider}</span>
                </div>
              );
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: isActive ? C.accent : C.textDim,
                    fontFamily: MONO, fontSize: isMobile ? 11 : 9, fontWeight: isActive ? 800 : 500,
                    padding: isMobile ? "10px 14px" : "5px 10px", cursor: "pointer",
                    borderBottom: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
                    letterSpacing: "0.06em", whiteSpace: "nowrap",
                    transition: "color 0.12s",
                    display: "inline-flex", alignItems: "center", gap: 4,
                    minHeight: isMobile ? 44 : "auto",
                  }}
                >
                  {t.label}
                  {t.id === "alerts" && triggeredAlertBadge > 0 && (
                    <span style={{ background: C.red, color: "#fff", borderRadius: 10, padding: "2px 5px", fontSize: 7, fontWeight: 800 }}>{triggeredAlertBadge}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })()}

      {error && (
        <div style={{ padding: "8px 18px", fontSize: 12, fontFamily: MONO, color: C.red, background: C.redBg }}>
          {error}
        </div>
      )}

      {/* Content */}
      <div className={isMobile ? "mobile-content" : ""} style={{ padding: isMobile ? "10px 10px 24px" : LAYOUT.contentPadding, maxWidth: LAYOUT.pageMaxWidth, margin: "0 auto" }}>

        {/* ── Regime Strategy Banner ── shows on scanner/watchlist tabs */}
        {["scanner","early","smartscan","screener","fivex","shortint"].includes(activeTab) && regime && regime !== "Loading…" && (() => {
          const isRiskOff  = regime === "Risk-Off" || regime === "Defensive";
          const isRiskOn   = regime === "Risk-On" || regime === "Growth" || regime === "Goldilocks";
          const bannerColor = isRiskOff ? C.red : isRiskOn ? C.green : C.amber;
          const bannerBg    = isRiskOff ? C.redBg : isRiskOn ? C.greenBg : C.amberBg;
          const icon  = isRiskOff ? "⚠️" : isRiskOn ? "🟢" : "🟡";
          const strategy = isRiskOff
            ? "RISK-OFF MODE: Reduce size, prefer hedges/shorts, tighten stops on longs. Avoid chasing."
            : isRiskOn
            ? "RISK-ON MODE: Lean long on high-RS names with confirmation. Momentum favors buyers."
            : "NEUTRAL REGIME: Trade selective A+ setups only. No edge in low-conviction names.";
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", marginBottom: 12,
              background: bannerBg, border: `1px solid ${bannerColor}44`, borderRadius: 8, borderLeft: `3px solid ${bannerColor}` }}>
              <span style={{ fontSize: 14 }}>{icon}</span>
              <div>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: bannerColor, letterSpacing: "0.06em" }}>REGIME: {regime.toUpperCase()}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec, marginLeft: 12 }}>{strategy}</span>
              </div>
            </div>
          );
        })()}

        {loading && !watchlistData.length && (
          <div style={{ textAlign: "center", padding: 60, fontFamily: MONO, color: C.textDim }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>Fetching live market data…</div>
            <div style={{ fontSize: 12 }}>Connecting to multi-provider quote engine</div>
          </div>
        )}

        {/* ── MY TRADINGVIEW CHART — shows if user has connected their chart URL ── */}
        {activeTab === "terminal" && tvChartMode === "my_chart" && myTvChartUrl && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 90px)" }}>
            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
              background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.accent }}>📊 MY TRADINGVIEW CHART</span>
              <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Your saved layout with all your indicators and data</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button onClick={() => { setTvChartMode("widget"); localStorage.setItem("tv_chart_mode","widget"); }}
                  style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.border}`, background: C.card, color: C.textSec, borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
                  ← BACK TO BUILT-IN
                </button>
                <a href={myTvChartUrl} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.accent}44`, background: `${C.accent}12`, color: C.accent, borderRadius: 6, padding: "3px 10px", textDecoration: "none" }}>
                  OPEN IN TRADINGVIEW ↗
                </a>
              </div>
            </div>
            {/* Full chart embed */}
            <iframe
              src={myTvChartUrl}
              title="My TradingView Chart"
              allow="fullscreen; clipboard-write"
              style={{ flex: 1, border: "none", width: "100%", display: "block" }}
            />
          </div>
        )}

        {/* ── MY CHART SETUP — shown when no chart URL set yet ── */}
        {activeTab === "terminal" && tvChartMode === "my_chart" && !myTvChartUrl && (
          <div style={{ padding: "40px 30px", maxWidth: 600, margin: "0 auto" }}>
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 8 }}>
              📊 Connect Your TradingView Chart
            </div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, marginBottom: 24, lineHeight: 1.7 }}>
              Embed your personal TradingView chart with all your custom indicators, Pine Scripts, and saved layouts directly here.
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 20 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>HOW TO GET YOUR CHART URL:</div>
              {[
                "Open TradingView and go to your chart",
                'Click Share → "Get Link" → Copy the URL',
                'Or just copy the URL from your browser address bar',
                "Paste it below and click CONNECT",
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.accent, flexShrink: 0 }}>{i+1}.</span>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: C.textSec }}>{step}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="https://www.tradingview.com/chart/XXXXXX/"
                style={{ flex: 1, border: `1px solid ${C.border}`, background: C.surface, color: C.text,
                  borderRadius: 6, padding: "10px 14px", fontFamily: MONO, fontSize: 12, outline: "none" }}
                id="tv-chart-url-input"
              />
              <button
                onClick={() => {
                  const url = document.getElementById("tv-chart-url-input").value.trim();
                  if (url && url.includes("tradingview.com")) {
                    setMyTvChartUrl(url);
                    localStorage.setItem("my_tv_chart_url", url);
                  } else {
                    alert("Please enter a valid TradingView chart URL");
                  }
                }}
                style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: C.accent,
                  border: "none", color: "#fff", borderRadius: 6, padding: "10px 20px", cursor: "pointer" }}>
                CONNECT
              </button>
            </div>
            <button onClick={() => { setTvChartMode("widget"); localStorage.setItem("tv_chart_mode","widget"); }}
              style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, background: "none", border: "none",
                cursor: "pointer", marginTop: 12, textDecoration: "underline" }}>
              Use built-in chart instead
            </button>
          </div>
        )}

        {activeTab === "terminal" && tvChartMode === "widget" && watchlistData.length > 0 && (
          <TerminalWorkspace
            watchlistData={watchlistData}
            macroData={macroData}
            sectorData={sectorData}
            newsData={newsData}
            alerts={alerts}
            selectedSymbol={terminalSymbol}
            onSelectSymbol={setTerminalSymbol}
            timeframe={terminalTf}
            onTimeframeChange={setTerminalTf}
            candleData={terminalCandles}
            loadingCandles={terminalCandlesLoading}
            terminalLayout={terminalLayout}
            onLayoutChange={setTerminalLayout}
            hotkeyProfile={hotkeyProfile}
            onHotkeyProfileChange={setHotkeyProfile}
            drawTools={drawTools}
            onDrawToolsChange={setDrawTools}
            panelSymbols={activePanelSymbols}
            onPanelSymbolChange={handlePanelSymbolChange}
            panelCandleMap={terminalPanelCandles}
            fundamentals={terminalFundamentals}
            marketSession={marketSession}
            onQuickLog={setQuickLogModal}
            watchlistSymbols={watchlistSymbols}
            onWatchlistChange={(next) => { setWatchlistSymbols(next); setWatchlistInput(next.join(",")); }}
          />
        )}

        {activeTab === "dashboard" && (
          <DashboardTab
            C={C} MONO={MONO} SANS={SANS}
            watchlistData={watchlistData} macroData={macroData} distData={distData} fearGreedData={fearGreedData}
            sigData={sigData} sigFilter={sigFilter} newsSentiment={newsSentiment} socialSentiment={socialSentiment}
            flowBias={flowBias} eventCountdowns={eventCountdowns} preMktMovers={preMktMovers}
            tiltEnabled={tiltEnabled} tiltLocked={tiltLocked} tiltStreak={tiltStreak}
            setTerminalSymbol={setTerminalSymbol} setScanResults={setScanResults} setActiveTab={setActiveTab}
            setScanExpanded={setScanExpanded} loadDeepDive={loadDeepDive} loadDeepSocial={loadDeepSocial}
            setTiltLocked={setTiltLocked} setSigLoading={setSigLoading} setSigData={setSigData}
            fetchFearGreed={fetchFearGreed} setDistData={setDistData} setFuturesData={setFuturesData}
            setPreMktMovers={setPreMktMovers}
          />
        )}

        {activeTab === "movers" && (
          <MoversTab C={C} MONO={MONO} SANS={SANS} openDeepDiveFor={openDeepDiveFor} />
        )}

        {activeTab === "mterminal" && (
          <MarketTerminalTab C={C} MONO={MONO} SANS={SANS} sectorData={sectorData} macroData={macroData} onDeepDive={openDeepDiveFor} setActiveTab={setActiveTab} />
        )}

        {activeTab === "daytrade" && (
          <DayTradeTab C={C} MONO={MONO} SANS={SANS} onDeepDive={openDeepDiveFor} />
        )}

        {activeTab === "quotes" && (
          <QuotesTab
            C={C} MONO={MONO} SANS={SANS} isTablet={isTablet} apiKey={apiKey} settings={settings}
            marketSession={marketSession}
            watchlistData={watchlistData} watchlistSymbols={watchlistSymbols} watchlists={watchlists}
            watchlistNotes={watchlistNotes}
            activeWlistId={activeWlistId} openAlertSymbol={openAlertSymbol} openNoteSymbol={openNoteSymbol}
            scoreFilter={scoreFilter} signalFilter={signalFilter} trendFilter={trendFilter} volumeFilter={volumeFilter}
            wlAlertDir={wlAlertDir} wlAlertPrice={wlAlertPrice} wlCardView={wlCardView}
            wlistRenameVal={wlistRenameVal} wlistRenaming={wlistRenaming} wlSearchFocused={wlSearchFocused}
            wlSearchQuery={wlSearchQuery}
            sorted={sorted} signalFiltered={signalFiltered} sortCol={sortCol} sortDir={sortDir} handleSort={handleSort}
            MARKET_UNIVERSE_SYMBOLS={MARKET_UNIVERSE_SYMBOLS}
            setActiveTab={setActiveTab} setActiveWlistId={setActiveWlistId} setLoading={setLoading}
            setOpenAlertSymbol={setOpenAlertSymbol} setOpenNoteSymbol={setOpenNoteSymbol}
            setQuickLogModal={setQuickLogModal} setScanExpanded={setScanExpanded} setScanResults={setScanResults}
            setScoreFilter={setScoreFilter} setSelectedStock={setSelectedStock} setSettings={setSettings}
            setSignalFilter={setSignalFilter} setTerminalSymbol={setTerminalSymbol} setTrendFilter={setTrendFilter}
            setVolumeFilter={setVolumeFilter} setWatchlistInput={setWatchlistInput}
            setWatchlistNotes={setWatchlistNotes} setWatchlists={setWatchlists}
            setWatchlistSymbols={setWatchlistSymbols} setWlAlertDir={setWlAlertDir} setWlAlertPrice={setWlAlertPrice}
            setWlCardView={setWlCardView} setWlistRenameVal={setWlistRenameVal} setWlistRenaming={setWlistRenaming}
            setWlSearchFocused={setWlSearchFocused} setWlSearchQuery={setWlSearchQuery}
            fetchAll={fetchAll} openTradingView={openTradingView} loadDeepDive={loadDeepDive}
            loadDeepSocial={loadDeepSocial}
          />
        )}


        {activeTab === "crypto" && (
          <>
            <CryptoLiqWidget C={C} MONO={MONO} SANS={SANS} />
            <CryptoTab C={C} MONO={MONO} SANS={SANS} />
          </>
        )}

        {activeTab === "options" && (
          <OptionsChainTab C={C} MONO={MONO} SANS={SANS}
            defaultSymbol={terminalSymbol || watchlistSymbols[0] || "AAPL"}
            onOpenTerminal={(sym) => { setTerminalSymbol(sym); try { localStorage.setItem("mterminal_load_sym", sym); } catch {} setActiveTab("mterminal"); }}
          />
        )}

        {activeTab === "sec-filings" && (
          <SecFilingsTab C={C} MONO={MONO} SANS={SANS} watchlistSymbols={watchlistSymbols} />
        )}

        {/* ── SHORT INTEREST CHANGES TAB (#26) ── */}
        {activeTab === "short-changes" && (() => {
          // No hooks here — state hoisted to top level
          const scLoad = !shortChgData;
          const fmtPct = v => v > 0 ? "+" + v.toFixed(1) + "%" : v.toFixed(1) + "%";
          const Section = ({ title, col, rows, cols }) => (
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: col, marginBottom: 10, letterSpacing: "0.06em" }}>{title}</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: C.surface }}>
                  {cols.map(c => <th key={c} style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "6px 8px", textAlign: "left", borderBottom: `1px solid ${C.border}` }}>{c}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : C.surface, cursor: "pointer" }}
                      onClick={() => { setTerminalSymbol(r.sym); try { localStorage.setItem("mterminal_load_sym", r.sym); } catch {} setActiveTab("mterminal"); }}>
                      <td style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.accent, padding: "9px 8px" }}>{r.sym}</td>
                      <td style={{ fontFamily: MONO, fontSize: 12, color: C.text, padding: "9px 8px" }}>${r.price}</td>
                      <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: r.shortFloat > 20 ? C.red : r.shortFloat > 10 ? C.amber : C.text, padding: "9px 8px" }}>{r.shortFloat > 0 ? r.shortFloat.toFixed(1) + "%" : "—"}</td>
                      <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: r.shortChange > 5 ? C.red : r.shortChange < -5 ? C.green : C.text, padding: "9px 8px" }}>{r.shortChange !== 0 ? fmtPct(r.shortChange) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          return (
            <div style={{ padding: "16px 20px" }}>
              <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 16 }}>🩳 SHORT INTEREST CHANGES</div>
              {scLoad && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⌛ Loading short interest data…</div>}
              {shortChgData && (
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <Section title="🔴 SHORTS INCREASING — Bears Adding" col={C.red} rows={shortChgData.increasing || []} cols={["TICKER","PRICE","FLOAT SHORT","WK CHG%"]} />
                  <Section title="🟢 SHORT COVERING — Bears Running" col={C.green} rows={shortChgData.covering || []} cols={["TICKER","PRICE","FLOAT SHORT","WK CHG%"]} />
                  <Section title="⚡ HIGHEST SHORT FLOAT — Squeeze Candidates" col={C.amber} rows={shortChgData.highShort || []} cols={["TICKER","PRICE","FLOAT SHORT","WK CHG%"]} />
                </div>
              )}
            </div>
          );
        })()}

        {activeTab === "dp-heatmap" && (
          <DpHeatmapTab
            C={C} MONO={MONO} SANS={SANS} dpHeatData={dpHeatData} setDpHeatData={setDpHeatData}
            dpLoad={dpLoad} setDpLoad={setDpLoad} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
          />
        )}

        {activeTab === "sm-brief" && <SmartMoneyBrief C={C} MONO={MONO} SANS={SANS} watchlistSymbols={watchlistSymbols} />}

        {activeTab === "darkpool" && (
          <DarkPoolTab
            C={C} MONO={MONO} dpSym={dpSym} setDpSym={setDpSym} dpLoad={dpLoad} setDpLoad={setDpLoad}
            dpData={dpData} setDpData={setDpData} dpErr={dpErr} setDpErr={setDpErr}
            setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
          />
        )}

        {activeTab === "telegram" && (
          <TelegramAlertsTab
            C={C} MONO={MONO} SANS={SANS}
            watchlistSymbols={watchlistSymbols}
            watchlistData={watchlistData}
            onOpenTerminal={(sym) => { setTerminalSymbol(sym); try { localStorage.setItem("mterminal_load_sym", sym); } catch {} setActiveTab("mterminal"); }}
          />
        )}

        {activeTab === "news" && (
          <NewsTab
            C={C} MONO={MONO} newsSymFilter={newsSymFilter} setNewsSymFilter={setNewsSymFilter}
            newsSentFilter={newsSentFilter} setNewsSentFilter={setNewsSentFilter}
            refreshNews={refreshNews} newsLoading={newsLoading} newsData={newsData}
            scoreNewsSentiment={scoreNewsSentiment} newsSentLoading={newsSentLoading}
            watchlistSymbols={watchlistSymbols} newsSentiments={newsSentiments}
            setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
            setQuickLogModal={setQuickLogModal} setWatchlistSymbols={setWatchlistSymbols}
          />
        )}

        {activeTab === "earnings" && (
          <EarningsTab
            C={C} MONO={MONO} earningsUpdatedAt={earningsUpdatedAt} setEarningsRefreshTick={setEarningsRefreshTick}
            earningsLoading={earningsLoading} earningsRows={earningsRows}
            watchlistSymbols={watchlistSymbols} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
            setQuickLogModal={setQuickLogModal} setWatchlistSymbols={setWatchlistSymbols}
          />
        )}

        {activeTab === "tv" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                LIVE MARKET TV
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {LIVE_TV_SOURCES.map((src) => (
                  <button
                    key={src.id}
                    onClick={() => setTvSource(src.id)}
                    style={{
                      border: `1px solid ${tvSource === src.id ? C.accent : C.border}`,
                      background: tvSource === src.id ? `${C.accent}12` : C.surface,
                      color: tvSource === src.id ? C.accent : C.text,
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontFamily: MONO,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {src.label}
                  </button>
                ))}
                <button
                  onClick={() => window.open(selectedTvSource.official, "_blank", "noopener,noreferrer")}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                >
                  OPEN OFFICIAL
                </button>
              </div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
              <iframe
                title="live-market-tv"
                src={selectedTvSource.embed}
                style={{ width: "100%", height: "72vh", border: "none", borderRadius: 8, background: "#000" }}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
              <div style={{ marginTop: 8, fontSize: 12, color: C.textDim }}>
                If this stream is blocked by provider policy, use <b>OPEN OFFICIAL</b>.
              </div>
            </div>
          </div>
        )}

        {activeTab === "openstock" && (
          <OpenStockTab
            C={C} MONO={MONO} themeMode={themeMode} isMobile={isMobile}
            tvOsSymbol={tvOsSymbol} tvOsInput={tvOsInput} setTvOsInput={setTvOsInput} setTvOsSymbol={setTvOsSymbol}
          />
        )}

        {activeTab === "fivex" && (
          <FivexTab
            C={C} MONO={MONO}
            fivexError={fivexError} fivexFetchedAt={fivexFetchedAt} fivexLoading={fivexLoading}
            fivexPrices={fivexPrices} fivexSector={fivexSector} fivexSort={fivexSort}
            setActiveTab={setActiveTab} setFivexSector={setFivexSector} setFivexSort={setFivexSort}
            setScanExpanded={setScanExpanded} setScanResults={setScanResults} setTerminalSymbol={setTerminalSymbol}
            fetchLivePrices={fetchLivePrices} loadDeepDive={loadDeepDive} loadDeepSocial={loadDeepSocial}
          />
        )}

        {activeTab === "advisor" && (
          <TradeAdvisorTab
            C={C} MONO={MONO} SANS={SANS}
            watchlistData={watchlistData}
            watchlistSymbols={watchlistSymbols}
            onOpenTerminal={(sym) => { setTerminalSymbol(sym); try { localStorage.setItem("mterminal_load_sym", sym); } catch {} setActiveTab("mterminal"); }}
            onAddSymbols={(syms) => {
              setWatchlistSymbols(prev => {
                const existing = new Set(prev.map(s => s.toUpperCase()));
                const newOnes = syms.filter(s => !existing.has(s));
                return newOnes.length ? [...prev, ...newOnes] : prev;
              });
              setWatchlistInput(prev => {
                const existing = new Set(prev.split(",").map(s => s.trim().toUpperCase()));
                const newOnes = syms.filter(s => !existing.has(s));
                return newOnes.length ? [prev, ...newOnes].join(",") : prev;
              });
            }}
          />
        )}

        {activeTab === "smartscan" && (
          <SmartScanTab
            C={C} MONO={MONO} SANS={SANS} isTablet={isTablet} macroData={macroData} watchlistSymbols={watchlistSymbols}
            scanResults={scanResults} scanExpanded={scanExpanded} scanError={scanError} scanLoading={scanLoading}
            scanProgress={scanProgress} scanLastRun={scanLastRun}
            scanFavorites={scanFavorites} scanHistory={scanHistory} scanDeepData={scanDeepData} scanDeepLoad={scanDeepLoad}
            scanTickerInput={scanTickerInput} customScanTickers={customScanTickers}
            deepSocialData={deepSocialData} autoScanMins={autoScanMins} autoScanOn={autoScanOn}
            autoScanCountdown={autoScanCountdown} autoExecStatus={autoExecStatus}
            riskAccount={riskAccount} riskPct={riskPct} sfMaxPrice={sfMaxPrice} sfMinScore={sfMinScore}
            sfSig={sfSig} sfZone={sfZone}
            tradeSetups={tradeSetups} tradeSetupLoad={tradeSetupLoad} tradeSetupError={tradeSetupError}
            setScanResults={setScanResults} setScanExpanded={setScanExpanded} setScanError={setScanError}
            setScanLoading={setScanLoading} setScanTickerInput={setScanTickerInput} setScanLastRun={setScanLastRun}
            setAutoScanMins={setAutoScanMins} setAutoScanOn={setAutoScanOn} setAutoExecStatus={setAutoExecStatus}
            setRiskAccount={setRiskAccount} setRiskPct={setRiskPct}
            setSfMaxPrice={setSfMaxPrice} setSfMinScore={setSfMinScore} setSfSig={setSfSig} setSfZone={setSfZone}
            setQuickLogModal={setQuickLogModal} setTradeSetups={setTradeSetups}
            setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol}
            addScanTicker={addScanTicker} removeScanTicker={removeScanTicker} scoreTicker={scoreTicker}
            toggleFavorite={toggleFavorite} fetchTradeSetup={fetchTradeSetup}
            loadDeepDive={loadDeepDive} loadDeepSocial={loadDeepSocial} runSmartScan={runSmartScan}
            FIVEX_TICKERS={FIVEX_TICKERS} themeMode={themeMode}
          />
        )}

        {activeTab === "sectors" && (
          <SectorsTab
            C={C} MONO={MONO} SANS={SANS} sectorData={sectorData} WEATHER_ZIP={WEATHER_ZIP}
            fetchWeather={fetchWeather} weatherLoading={weatherLoading} weatherError={weatherError}
            weatherData={weatherData} weatherCodeLabel={weatherCodeLabel}
            watchlistSymbols={watchlistSymbols} setWatchlistSymbols={setWatchlistSymbols}
            setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
          />
        )}

      </div>

      {/* Deep Dive */}
        {activeTab === "macro" && (
          <MacroTab
            C={C} MONO={MONO} macroTone={macroTone} macroData={macroData}
            macroEventCalendar={macroEventCalendar} macroEventAlerts={macroEventAlerts}
            cryptoSnapshot={cryptoSnapshot}
            watchlistSymbols={watchlistSymbols} setWatchlistSymbols={setWatchlistSymbols}
            setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
          />
        )}

        {activeTab === "alerts" && (
          <AlertsTab
            C={C} MONO={MONO}
            tvWebhookRows={tvWebhookRows} combinedAlerts={combinedAlerts} telegramOk={telegramOk}
            customAlertSymbol={customAlertSymbol} setCustomAlertSymbol={setCustomAlertSymbol}
            customAlertMin={customAlertMin} setCustomAlertMin={setCustomAlertMin} setCustomAlerts={setCustomAlerts}
            setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} setQuickLogModal={setQuickLogModal}
            priceAlerts={priceAlerts} paSymbol={paSymbol} setPaSymbol={setPaSymbol}
            paDirection={paDirection} setPaDirection={setPaDirection} paTarget={paTarget} setPaTarget={setPaTarget}
            paNote={paNote} setPaNote={setPaNote} loadPriceAlertList={loadPriceAlertList} watchlistData={watchlistData}
            tvWebhookFilter={tvWebhookFilter} setTvWebhookFilter={setTvWebhookFilter}
            alertSoundEnabled={alertSoundEnabled} setAlertSoundEnabled={setAlertSoundEnabled}
            setTvWebhookRows={setTvWebhookRows}
            tvWebhookSecured={tvWebhookSecured} tvWebhookLoggedRows={tvWebhookLoggedRows}
            setTvWebhookLoggedRows={setTvWebhookLoggedRows}
          />
        )}

        {activeTab === "agent" && (
          <AgentTab
            C={C} MONO={MONO} SANS={SANS} regime={regime} setAgentPrompt={setAgentPrompt}
            runAIAgent={runAIAgent} agentLoading={agentLoading} agentPrompt={agentPrompt}
            terminalSymbol={terminalSymbol} marketSession={marketSession} flowBias={flowBias}
            combinedAlerts={combinedAlerts} watchlistData={watchlistData} agentRunAt={agentRunAt}
            agentOutput={agentOutput} telegramOk={telegramOk}
          />
        )}

        {activeTab === "workflow" && (
          <WorkflowTab
            C={C} MONO={MONO} SANS={SANS} DEFAULT_WORKFLOW={DEFAULT_WORKFLOW}
            scannerFilters={scannerFilters} setScannerFilters={setScannerFilters}
            marketUniverseLoading={marketUniverseLoading} marketUniverseData={marketUniverseData}
            loadMarketUniverse={loadMarketUniverse}
            runWorkflowAuto={runWorkflowAuto} setWorkflowState={setWorkflowState}
            setWorkflowAutoPlan={setWorkflowAutoPlan} dailyGamePlan={dailyGamePlan}
            setDailyGamePlan={setDailyGamePlan} workflowAutoPlan={workflowAutoPlan}
            setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
            applyWorkflowPrimary={applyWorkflowPrimary}
            marketSession={marketSession} sessionMovers={sessionMovers} newsIntel={newsIntel}
            macroSignalFlags={macroSignalFlags}
            marketMovers={marketMovers} marketMoversLoading={marketMoversLoading}
            fetchMarketMovers={fetchMarketMovers} prePostMovers={prePostMovers}
            earningsSurpriseTracker={earningsSurpriseTracker}
            workflowProgress={workflowProgress} workflowState={workflowState}
            updateWorkflowCheck={updateWorkflowCheck} updateWorkflowNotes={updateWorkflowNotes}
          />
        )}

        {activeTab === "portfolio" && (
          <PortfolioTab
            C={C} MONO={MONO}
            csvImportModal={csvImportModal} pasteModal={pasteModal} pasteText={pasteText}
            portfolioHoldings={portfolioHoldings} watchlistSymbols={watchlistSymbols}
            csvFileRef={csvFileRef} portfolioRows={portfolioRows} portfolioSummary={portfolioSummary}
            setActiveTab={setActiveTab} setCsvImportModal={setCsvImportModal} setPasteModal={setPasteModal}
            setPasteText={setPasteText} setPortfolioHoldings={setPortfolioHoldings}
            setTerminalSymbol={setTerminalSymbol} setWatchlistSymbols={setWatchlistSymbols}
          />
        )}

        {activeTab === "scanner" && (
          <ScannerTab
            C={C} MONO={MONO} scannerRows={scannerRows} lastUpdate={lastUpdate} dataFreshSec={dataFreshSec}
            scannerFilters={scannerFilters} setScannerFilters={setScannerFilters}
            setLoading={setLoading} fetchAll={fetchAll} apiKey={apiKey} runServerScreen={runServerScreen}
            serverScreenLoading={serverScreenLoading}
            marketUniverseData={marketUniverseData} marketUniverseLoading={marketUniverseLoading}
            loadMarketUniverse={loadMarketUniverse} flowBySymbol={flowBySymbol}
            setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} openTradingView={openTradingView}
            setScanResults={setScanResults} setScanExpanded={setScanExpanded}
            loadDeepDive={loadDeepDive} loadDeepSocial={loadDeepSocial} setWatchlistSymbols={setWatchlistSymbols}
            setQuickLogModal={setQuickLogModal}
            serverScreenResults={serverScreenResults} setServerScreenResults={setServerScreenResults}
          />
        )}

        {activeTab === "early" && (
          <EarlyEntryScanner
            watchlistData={watchlistData}
            macroData={macroData}
            sectorData={sectorData}
            onSelectSymbol={(sym) => { setTerminalSymbol(sym); try { localStorage.setItem("mterminal_load_sym", sym); } catch {} setActiveTab("mterminal"); }}
          />
        )}

        {activeTab === "backtest" && (
          <BacktestTab
            C={C} MONO={MONO} backtestSymbol={backtestSymbol} setBacktestSymbol={setBacktestSymbol}
            backtestTf={backtestTf} setBacktestTf={setBacktestTf}
            backtestLookback={backtestLookback} setBacktestLookback={setBacktestLookback}
            runBacktest={runBacktest} backtestLoading={backtestLoading} backtestResult={backtestResult}
          />
        )}

        {activeTab === "flow" && (
          <FlowTab
            C={C} MONO={MONO} optionsFlow={optionsFlow} flowBias={flowBias}
            flowCallNotional={flowCallNotional} flowPutNotional={flowPutNotional}
            flowFilters={flowFilters} setFlowFilters={setFlowFilters} setLoading={setLoading}
            fetchAll={fetchAll} apiKey={apiKey}
            flowBySymbol={flowBySymbol} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
            setWatchlistSymbols={setWatchlistSymbols} watchlistSymbols={watchlistSymbols} flowRows={flowRows}
          />
        )}

        {activeTab === "calendar" && (
          <CalendarTab C={C} MONO={MONO} isMobile={isMobile} themeMode={themeMode} />
        )}

        {activeTab === "rotation" && (
          <RotationTab
            C={C} MONO={MONO} rotationRank={rotationRank} watchlistSymbols={watchlistSymbols}
            setWatchlistSymbols={setWatchlistSymbols} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
          />
        )}

        {activeTab === "tools" && (
          <ToolsTab
            C={C} MONO={MONO} riskPlan={riskPlan}
            riskAccount={riskAccount} setRiskAccount={setRiskAccount} riskPct={riskPct} setRiskPct={setRiskPct}
            riskEntry={riskEntry} setRiskEntry={setRiskEntry} riskStop={riskStop} setRiskStop={setRiskStop}
            riskSide={riskSide} setRiskSide={setRiskSide} riskMaxPosPct={riskMaxPosPct} setRiskMaxPosPct={setRiskMaxPosPct}
            riskCorrCap={riskCorrCap} setRiskCorrCap={setRiskCorrCap}
            riskAtrPct={riskAtrPct} setRiskAtrPct={setRiskAtrPct} riskSlipBps={riskSlipBps} setRiskSlipBps={setRiskSlipBps}
            riskSetupQuality={riskSetupQuality} setRiskSetupQuality={setRiskSetupQuality}
            terminalSymbol={terminalSymbol} selectedStock={selectedStock} scannerRank={scannerRank}
            providerKeys={providerKeys} setProviderKeys={setProviderKeys} apiKey={apiKey} setLoading={setLoading}
            fetchAll={fetchAll}
            tvWebhookSecured={tvWebhookSecured} tvWebhookRows={tvWebhookRows} tvWebhookToken={tvWebhookToken}
            setSettings={setSettings} runTvWebhookTest={runTvWebhookTest} tvWebhookUrl={tvWebhookUrl}
          />
        )}

        {activeTab === "journal" && (
          <JournalTab
            C={C} MONO={MONO} SANS={SANS}
            journalCloseId={journalCloseId} journalClosePrice={journalClosePrice} journalDateRange={journalDateRange}
            journalEditEntry={journalEditEntry} journalEditId={journalEditId} journalEditNotes={journalEditNotes}
            journalEditSize={journalEditSize} journalEditSL={journalEditSL} journalEditTarget={journalEditTarget}
            journalEntries={journalEntries} journalFilter={journalFilter} journalLoading={journalLoading}
            journalRevError={journalRevError} journalReview={journalReview} journalRevLoad={journalRevLoad}
            journalSort={journalSort} journalStats={journalStats} journalStyleFilter={journalStyleFilter}
            journalTickerSearch={journalTickerSearch} liveJournalPnl={liveJournalPnl}
            setJournalCloseId={setJournalCloseId} setJournalClosePrice={setJournalClosePrice}
            setJournalDateRange={setJournalDateRange} setJournalEditEntry={setJournalEditEntry}
            setJournalEditId={setJournalEditId} setJournalEditNotes={setJournalEditNotes}
            setJournalEditSize={setJournalEditSize} setJournalEditSL={setJournalEditSL}
            setJournalEditTarget={setJournalEditTarget} setJournalFilter={setJournalFilter}
            setJournalReview={setJournalReview} setJournalSort={setJournalSort}
            setJournalStyleFilter={setJournalStyleFilter} setJournalTickerSearch={setJournalTickerSearch}
            setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol}
            fetchJournalReview={fetchJournalReview} loadJournalTab={loadJournalTab}
          />
        )}

      {activeTab === "deals" && (
        <DealsTab
          C={C} MONO={MONO} SANS={SANS} isMobile={isMobile} themeMode={themeMode}
          dealsCategory={dealsCategory} dealsSources={dealsSources} dealsQuery={dealsQuery}
          dealsMaxPrice={dealsMaxPrice} dealsLoading={dealsLoading} dealsError={dealsError}
          dealsSearched={dealsSearched} dealsResults={dealsResults} dealsWatches={dealsWatches}
          dealsWatchesLoading={dealsWatchesLoading} dealsAlerts={dealsAlerts}
          setDealsCategory={setDealsCategory} setDealsQuery={setDealsQuery} setDealsMaxPrice={setDealsMaxPrice}
          fetchDealsWatches={fetchDealsWatches} runDealsSearch={runDealsSearch}
          addDealsWatch={addDealsWatch} removeDealsWatch={removeDealsWatch}
        />
      )}

      {activeTab === "cot" && (
        <CotTab
          C={C} MONO={MONO} cotData={cotData} cotError={cotError} cotLastSent={cotLastSent}
          cotLoading={cotLoading} cotRunning={cotRunning} isMobile={isMobile}
          setCotData={setCotData} setCotLastSent={setCotLastSent} setCotRunning={setCotRunning}
        />
      )}

      {/* ══════════════════ QURAN TAB ══════════════════ */}
      {activeTab === "quran" && (
        <QuranTab
          C={C} MONO={MONO} SANS={SANS}
          quranSurah={quranSurah} setQuranSurah={setQuranSurah}
          quranSearchQuery={quranSearchQuery} setQuranSearchQuery={setQuranSearchQuery}
          quranDuration={quranDuration} quranCurrentTime={quranCurrentTime} setQuranCurrentTime={setQuranCurrentTime}
          quranAudioRef={quranAudioRef}
          quranPlaying={quranPlaying} quranWasPlaying={quranWasPlaying} quranAutoPlay={quranAutoPlay} quranUsedFallback={quranUsedFallback}
          quranAudioError={quranAudioError} setQuranAudioError={setQuranAudioError}
          quranLoading={quranLoading} setQuranLoading={setQuranLoading}
          quranReciter={quranReciter} setQuranReciter={setQuranReciter}
          quranVolume={quranVolume} setQuranVolume={setQuranVolume}
          quranRepeat={quranRepeat} setQuranRepeat={setQuranRepeat}
          quranAutoNext={quranAutoNext} setQuranAutoNext={setQuranAutoNext}
          quranShowText={quranShowText} setQuranShowText={setQuranShowText}
          quranText={quranText}
          hasanat={hasanat} setHasanat={setHasanat} HASANAT_GOAL={HASANAT_GOAL} creditSurah={creditSurah}
        />
      )}

      {activeTab === "athan" && (
        <AthanTab
          C={C} MONO={MONO}
          athanNow={athanNow} athanTimes={athanTimes} athanHijri={athanHijri}
          athanLoading={athanLoading} athanError={athanError} setAthanError={setAthanError}
          athanCity={athanCity} setAthanCity={setAthanCity} athanCountry={athanCountry} setAthanCountry={setAthanCountry}
          athanMethod={athanMethod} setAthanMethod={setAthanMethod}
          athanSoundOn={athanSoundOn} setAthanSoundOn={setAthanSoundOn}
          athanReminder={athanReminder} setAthanReminder={setAthanReminder}
          fetchPrayerTimes={fetchPrayerTimes} playAthan={playAthan} stopAthan={stopAthan}
        />
      )}

      {activeTab === "athkar" && (
        <AthkarTab
          C={C} MONO={MONO} ATHKAR_DATA={ATHKAR_DATA} athkarCategory={athkarCategory}
          setAthkarCategory={setAthkarCategory} athkarProgress={athkarProgress}
          setAthkarProgress={setAthkarProgress}
        />
      )}

      {activeTab === "tasbih" && (
        <TasbihTab
          C={C} MONO={MONO} TASBIH_DHIKR={TASBIH_DHIKR}
          tasbihCustomTarget={tasbihCustomTarget} setTasbihCustomTarget={setTasbihCustomTarget}
          tasbihTarget={tasbihTarget} setTasbihTarget={setTasbihTarget}
          tasbihCount={tasbihCount} setTasbihCount={setTasbihCount}
          tasbihCompleted={tasbihCompleted} setTasbihCompleted={setTasbihCompleted}
          tasbihDhikr={tasbihDhikr} setTasbihDhikr={setTasbihDhikr}
        />
      )}

      {activeTab === "briefing" && (
        <BriefingTab
          C={C} MONO={MONO} SANS={SANS} isMobile={isMobile} premktBriefing={premktBriefing}
          premktAt={premktAt} fetchPremarketBriefing={fetchPremarketBriefing} premktLoading={premktLoading}
        />
      )}

      {activeTab === "multitf" && (
        <MultiTfTab
          C={C} MONO={MONO} SANS={SANS} themeMode={themeMode} multitfSymbol={multitfSymbol}
          terminalSymbol={terminalSymbol} watchlistData={watchlistData}
          multitfInput={multitfInput} setMultitfInput={setMultitfInput} setMultitfSymbol={setMultitfSymbol}
          multitfInds={multitfInds} setMultitfInds={setMultitfInds} mtfLayout={mtfLayout} setMtfLayout={setMtfLayout}
        />
      )}

      {/* Always-on hands-off paper auto-pilot (buys + exits on every tab) */}
      <AutoPilotEngine watchlistData={watchlistData} macroData={macroData} scanResults={scanResults} />

      {/* ── CUSTOM SCREENER ──────────────────────────────────────────────── */}
      {activeTab === "tradeplanner" && <TradePlannerTab C={C} MONO={MONO} SANS={SANS} macroData={macroData} />}
      {activeTab === "dipbuy" && <DipBuyTab C={C} MONO={MONO} SANS={SANS} watchlistData={watchlistData} macroData={macroData} openDeepDiveFor={openDeepDiveFor} />}
      {(activeTab === "greenlight" || activeTab === "mytrades") && <>
        <GreenLightTab C={C} MONO={MONO} SANS={SANS} watchlistData={watchlistData} macroData={macroData} openDeepDiveFor={openDeepDiveFor} scanResults={scanResults} sectorData={sectorData} />
        <MyTradesTab C={C} MONO={MONO} SANS={SANS} watchlistData={watchlistData} />
      </>}
      {activeTab === "trendtemplate" && <TrendTemplateTab C={C} MONO={MONO} SANS={SANS} watchlistSymbols={watchlistSymbols} />}
      {activeTab === "outlook" && <MarketOutlookTab C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "holdings" && <HoldingsTab C={C} MONO={MONO} SANS={SANS} macroData={macroData} />}
      {activeTab === "gl-backtest" && <GLBacktestTab C={C} MONO={MONO} SANS={SANS} watchlistSymbols={watchlistSymbols} />}
      {activeTab === "predictions" && <PredictionsTab C={C} MONO={MONO} SANS={SANS} watchlistData={watchlistData} macroData={macroData} />}
      {activeTab === "coach" && <CoachTab C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "rhpro" && <RhProDashboard C={C} MONO={MONO} SANS={SANS} macroData={macroData} sectorData={sectorData} />}
      {activeTab === "rhpro-apex" && <RhProApex C={C} MONO={MONO} SANS={SANS} macroData={macroData} sectorData={sectorData} />}
      {activeTab === "rhpro-scan" && <RhProScanner C={C} MONO={MONO} SANS={SANS} macroData={macroData} setActiveTab={setActiveTab} />}
      {activeTab === "rhpro-lists" && <RhProWatchlists C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} macroData={macroData} />}
      {activeTab === "rhpro-heat" && <RhProHeatMap C={C} MONO={MONO} SANS={SANS} sectorData={sectorData} macroData={macroData} />}
      {activeTab === "rhpro-journal" && <RhProJournal C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "rhpro-coach" && <RhProCoach C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "start" && <StartHereTab C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} />}
      {activeTab === "dealfinder" && <DealFinderTab C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "flightfinder" && <FlightFinderTab C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "leadresponder" && <LeadResponderTab C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "under10" && <Under10Tab C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} watchlistSymbols={watchlistSymbols} />}
      {activeTab === "combined"     && <CombinedTab     C={C} MONO={MONO} SANS={SANS} watchlistSymbols={watchlistSymbols}
        onDeepDive={(sym, row) => openDeepDiveFor(sym, { price: row?.price || 0, changePercent: 0 })} />}
      {activeTab === "squeeze"      && <SqueezeTab      C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} />}
      {activeTab === "compression"  && <CompressionTab  C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} watchlistSymbols={watchlistSymbols}
        onDeepDive={sym => openDeepDiveFor(sym, null)} />}
      {activeTab === "insider"      && <InsiderTab      C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} />}
      {activeTab === "gapfill"      && <GapFillTab      C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} />}
      {activeTab === "screener" && (
        <ScreenerTab
          C={C} MONO={MONO} scanResults={scanResults} screenerRules={screenerRules}
          setScreenerRules={setScreenerRules} screenerResults={screenerResults}
          setScreenerResults={setScreenerResults} screenerRan={screenerRan} setScreenerRan={setScreenerRan}
          themeMode={themeMode} setActiveTab={setActiveTab} setTvOsSymbol={setTvOsSymbol} setTvOsInput={setTvOsInput}
        />
      )}

      {activeTab === "shortint" && (
        <ShortIntTab
          C={C} MONO={MONO} watchlistSymbols={watchlistSymbols} shortIntInput={shortIntInput}
          setShortIntInput={setShortIntInput} fetchShortInterest={fetchShortInterest}
          shortIntLoading={shortIntLoading} shortIntData={shortIntData} themeMode={themeMode}
          setActiveTab={setActiveTab} setTvOsSymbol={setTvOsSymbol} setTvOsInput={setTvOsInput}
        />
      )}

      {activeTab === "heatmap" && (
        <HeatmapTab
          C={C} MONO={MONO} portfolioHoldings={portfolioHoldings} watchlistData={watchlistData}
          setActiveTab={setActiveTab} setTvOsSymbol={setTvOsSymbol} setTvOsInput={setTvOsInput}
        />
      )}

      {activeTab === "correlation" && (
        <CorrelationTab
          C={C} MONO={MONO} themeMode={themeMode} scanDeepData={scanDeepData}
          computeCorrelation={computeCorrelation} corrLoading={corrLoading} corrMatrix={corrMatrix}
        />
      )}

      {activeTab === "fibonacci" && (
        <FibonacciTab
          C={C} MONO={MONO} fibInput={fibInput} setFibInput={setFibInput} fibTicker={fibTicker}
          setFibTicker={setFibTicker} fetchFibonacci={fetchFibonacci} fibLoading={fibLoading}
          fibError={fibError} fibData={fibData}
        />
      )}

      {activeTab === "halal" && (
        <HalalTab
          C={C} MONO={MONO} SANS={SANS} isMobile={isMobile} halalReport={halalReport}
          halalInput={halalInput} setHalalInput={setHalalInput} fetchHalalCheck={fetchHalalCheck}
          halalLoading={halalLoading} halalError={halalError}
        />
      )}

      {activeTab === "smartmoney" && (
        <SmartMoneyTab
          C={C} MONO={MONO} isMobile={isMobile}
          insiderInput={insiderInput} setInsiderInput={setInsiderInput} insiderLoading={insiderLoading}
          insiderTicker={insiderTicker} insiderData={insiderData} fetchInsiderData={fetchInsiderData}
        />
      )}

      {activeTab === "social" && (
        <SocialTab
          C={C} MONO={MONO} SANS={SANS} socialInput={socialInput} setSocialInput={setSocialInput}
          fetchSocialSentiment={fetchSocialSentiment} socialLoading={socialLoading}
          socialTicker={socialTicker} socialData={socialData}
        />
      )}

      {/* ── AUTO-EXECUTE TAB ────────────────────────────────────────────────── */}
      {activeTab === "autoexec" && (
        <AutoExecPanel C={C} MONO={MONO} SANS={SANS} />
      )}

      {/* ── GAP SCANNER TAB ─────────────────────────────────────────────────── */}
      {activeTab === "gap" && <GapScanner C={C} MONO={MONO} SANS={SANS} />}

      {activeTab === "analyst" && (
        <AnalystTab
          C={C} MONO={MONO} analystInput={analystInput} setAnalystInput={setAnalystInput}
          fetchAnalystRatings={fetchAnalystRatings} analystLoading={analystLoading}
          analystTicker={analystTicker} analystData={analystData}
        />
      )}

      {activeTab === "ipo" && (
        <IpoTab C={C} MONO={MONO} fetchDividendCalendar={fetchDividendCalendar} dividendLoading={dividendLoading} dividendData={dividendData} />
      )}

      {activeTab === "risklab" && (
        <RiskLabTab C={C} MONO={MONO} portfolioRows={portfolioRows} scanDeepData={scanDeepData} />
      )}

      {activeTab === "ailab" && (
        <AiLabTab
          C={C} MONO={MONO} SANS={SANS}
          ailabSection={ailabSection} setAilabSection={setAilabSection}
          patternInput={patternInput} setPatternInput={setPatternInput} fetchAIPattern={fetchAIPattern}
          patternLoading={patternLoading} patternResult={patternResult} patternTicker={patternTicker}
          scenarioInput={scenarioInput} setScenarioInput={setScenarioInput} fetchMacroScenario={fetchMacroScenario}
          scenarioLoading={scenarioLoading} scenarioResult={scenarioResult}
          earningsCallText={earningsCallText} setEarningsCallText={setEarningsCallText}
          summarizeEarningsCall={summarizeEarningsCall} earningsCallLoad={earningsCallLoad}
          earningsCallResult={earningsCallResult}
          sessionRecapLoad={sessionRecapLoad} generateSessionRecap={generateSessionRecap}
          sessionRecapResult={sessionRecapResult}
          checklistItems={checklistItems} setChecklistItems={setChecklistItems}
        />
      )}

      {activeTab === "dca" && (
        <DcaTab
          C={C} MONO={MONO} dcaTicker={dcaTicker} setDcaTicker={setDcaTicker} dcaAmount={dcaAmount}
          setDcaAmount={setDcaAmount} dcaPeriod={dcaPeriod} setDcaPeriod={setDcaPeriod}
          dcaMonths={dcaMonths} setDcaMonths={setDcaMonths} dcaReturn={dcaReturn} setDcaReturn={setDcaReturn}
          computeDCA={computeDCA} dcaResult={dcaResult}
        />
      )}

      {activeTab === "options-calc" && (
        <OptionsCalcTab
          C={C} MONO={MONO} SANS={SANS}
          optionType={optionType} setOptionType={setOptionType} optionStrike={optionStrike} setOptionStrike={setOptionStrike}
          optionPremium={optionPremium} setOptionPremium={setOptionPremium}
          optionStock={optionStock} setOptionStock={setOptionStock} optionExpiry={optionExpiry} setOptionExpiry={setOptionExpiry}
          computeOptions={computeOptions} optionResult={optionResult}
        />
      )}

      {activeTab === "feargreed" && (
        <FearGreedTab C={C} MONO={MONO} fearGreedData={fearGreedData} fetchFearGreed={fetchFearGreed} fearGreedLoading={fearGreedLoading} />
      )}

      {activeTab === "breadth" && (
        <BreadthTab C={C} MONO={MONO} breadthData={breadthData} fetchBreadth={fetchBreadth} breadthLoading={breadthLoading} />
      )}

      {activeTab === "seasonality" && (
        <SeasonalityTab
          C={C} MONO={MONO} seasonData={seasonData} seasonInput={seasonInput} setSeasonInput={setSeasonInput}
          fetchSeasonality={fetchSeasonality} seasonLoading={seasonLoading} seasonTicker={seasonTicker}
        />
      )}

      {activeTab === "earn-cal" && (
        <EarnCalTab
          C={C} MONO={MONO} SANS={SANS} ecData={ecData} setEcLoad={setEcLoad} setEcData={setEcData}
          ecLoad={ecLoad} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
        />
      )}

      {activeTab === "econ-cal" && (
        <EconCalTab C={C} MONO={MONO} SANS={SANS} evData={evData} />
      )}

      {activeTab === "journal-stats" && <JournalStatsTab C={C} MONO={MONO} SANS={SANS} jData={jData} />}

      {/* Global Quran audio element — stays mounted across all tab switches */}
      <audio
        ref={quranAudioRef}
        preload="none"
        onPlay={() => { quranAutoPlay.current = false; setQuranPlaying(true); setQuranAudioError(false); setQuranLoading(false); }}
        onPause={() => { quranAutoPlay.current = false; setQuranPlaying(false); }}
        onWaiting={() => setQuranLoading(true)}
        onLoadStart={() => { setQuranLoading(true); setQuranAudioError(false); }}
        onCanPlay={() => { setQuranAudioError(false); setQuranLoading(false); if (quranAudioRef.current) setQuranDuration(quranAudioRef.current.duration || 0); }}
        onDurationChange={() => { if (quranAudioRef.current) setQuranDuration(quranAudioRef.current.duration || 0); }}
        onTimeUpdate={() => { if (quranAudioRef.current) setQuranCurrentTime(quranAudioRef.current.currentTime || 0); }}
        onError={() => {
          // First failure → try 64 kbps fallback before showing error
          if (!quranUsedFallback.current) {
            quranUsedFallback.current = true;
            const el = quranAudioRef.current;
            if (el) {
              el.src = qUrl(quranReciter, quranSurah); // retry (quranicaudio.com has single quality)
              el.load();
              // Auto-play fallback if user intended to play (quranAutoPlay) OR was already playing
              if (quranAutoPlay.current || quranPlaying) {
                el.play().catch(() => {
                  quranAutoPlay.current = false;
                  setQuranPlaying(false);
                  setQuranLoading(false);
                  setQuranAudioError(true);
                });
              }
            }
          } else {
            // Both 128kbps and 64kbps failed → show error
            quranAutoPlay.current = false;
            setQuranPlaying(false);
            setQuranLoading(false);
            setQuranAudioError(true);
          }
        }}
        onEnded={() => {
          if (quranRepeat) {
            // Repeat current surah — seek to start and play again
            if (quranAudioRef.current) {
              quranAudioRef.current.currentTime = 0;
              quranAudioRef.current.load();
              quranAudioRef.current.play().catch(() => {});
            }
          } else if (quranAutoNext) {
            quranWasPlaying.current = true;
            setQuranSurah(prev => {
              const next = prev < 114 ? prev + 1 : 1;
              localStorage.setItem("quran_surah", String(next));
              return next;
            });
          } else { setQuranPlaying(false); }
        }}
        style={{ display: "none" }}
      />


      {paletteOpen && (
        <div onClick={() => setPaletteOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.18)", zIndex: 1200, display: "grid", placeItems: "start center", paddingTop: "14vh" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: "92vw", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 24px 60px rgba(15,27,45,0.18)" }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 8 }}>AXIOM COMMAND PALETTE (GO)</div>
              <input
                autoFocus
                value={paletteInput}
                onChange={(e) => setPaletteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    runPaletteCommand(paletteInput);
                    setPaletteOpen(false);
                    setPaletteInput("");
                  }
                }}
                placeholder="Examples: NVDA GO | EARNINGS GO | MACRO GO | TERMINAL GO | TF 15M GO"
                style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "10px 12px", borderRadius: 6 }}
              />
            </div>
            <div style={{ padding: "10px 12px", display: "grid", gap: 4 }}>
              {["NVDA GO", "EARNINGS GO", "MACRO GO", "NEWS GO", "TV GO", "ALERTS GO", "AGENT GO", "WORKFLOW GO", "FLOW GO", "PORTFOLIO GO", "SCANNER GO", "BACKTEST GO", "TERMINAL GO", "JOURNAL GO", "TF 5M GO", "TF 1D GO", "LAYOUT 2 GO", "LAYOUT 4 GO", "QURAN GO", "ATHAN GO", "ATHKAR GO", "TASBIH GO"].map((cmd) => (
                <button key={cmd} onClick={() => { runPaletteCommand(cmd); setPaletteOpen(false); setPaletteInput(""); }} style={{ textAlign: "left", border: `1px solid ${C.border}`, background: C.card, borderRadius: 6, padding: "8px 10px", cursor: "pointer", fontFamily: MONO, fontSize: 12, color: C.textSec }}>
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Old DeepDive replaced by Smart Scanner deep dive */}
      {/* selectedStock redirect — handled by useEffect below, NOT during render */}

      {shortcutHelpOpen && (
        <div onClick={() => setShortcutHelpOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.55)", zIndex: 1300, display: "grid", placeItems: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 24px 60px rgba(15,27,45,0.25)", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ fontFamily: MONO, fontSize: 13, color: C.text, fontWeight: 700 }}>KEYBOARD SHORTCUTS</div>
              <button onClick={() => setShortcutHelpOpen(false)} style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer", fontSize: 18, padding: "0 4px" }}>×</button>
            </div>
            {[
              { section: "GLOBAL" },
              { key: "Ctrl+K  or  /", desc: "Open command palette" },
              { key: "?", desc: "Show this help overlay" },
              { key: "Esc", desc: "Close any overlay / palette" },
              { section: "TERMINAL (when terminal tab is active)" },
              { key: hotkeyProfile === "scalper" ? "Z" : "Q", desc: "Switch chart to 5M" },
              { key: hotkeyProfile === "scalper" ? "X" : "W", desc: "Switch chart to 15M" },
              { key: hotkeyProfile === "scalper" ? "C" : "E", desc: "Switch chart to 1H" },
              { key: hotkeyProfile === "scalper" ? "V" : "R", desc: "Switch chart to 1D" },
              { key: hotkeyProfile === "scalper" ? "B" : "T", desc: "Switch chart to 1W" },
              { key: "1", desc: "Single-panel layout" },
              { key: "2", desc: "Two-panel layout" },
              { key: "4", desc: "Four-panel layout" },
              { section: "NAVIGATION — press anywhere (not in input)" },
              { key: "M", desc: "📊 Monitor (dashboard)" },
              { key: "S", desc: "🔍 Smart Scanner" },
              { key: "G", desc: "📈 Gap Scan" },
              { key: "C", desc: "📈 Chart (Terminal)" },
              { key: "N", desc: "📰 News" },
              { key: "P", desc: "💼 Portfolio" },
              { key: "J", desc: "📓 Journal" },
              { key: "A", desc: "📅 Earnings Calendar" },
              { key: "E", desc: "🗓 Economic Calendar" },
              { key: "Click watchlist row", desc: "Open deep dive" },
            ].map((item, i) => item.section
              ? <div key={i} style={{ fontFamily: MONO, fontSize: 12, color: C.accent, letterSpacing: "0.12em", fontWeight: 700, marginTop: i > 0 ? 14 : 0, marginBottom: 6 }}>{item.section}</div>
              : <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                  <kbd style={{ fontFamily: MONO, fontSize: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 8px", color: C.text }}>{item.key}</kbd>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: C.textSec }}>{item.desc}</span>
                </div>
            )}
            <div style={{ marginTop: 16, fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center" }}>
              Hotkey profile: <strong>{hotkeyProfile}</strong> · Change in Terminal → profile selector
            </div>
          </div>
        </div>
      )}

      {/* ── Quick-Log Modal ── */}
      {quickLogModal && (
        <div onClick={() => setQuickLogModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.58)", zIndex: 1350, display: "grid", placeItems: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: "94vw", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 24px 60px rgba(15,27,45,0.30)", padding: 24 }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <span style={{ fontFamily: MONO, fontSize: 17, color: C.text, fontWeight: 800 }}>{quickLogModal.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, marginLeft: 10 }}>${Number(quickLogModal.price).toFixed(2)}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: quickLogModal.chg >= 0 ? C.green : C.red, marginLeft: 8, fontWeight: 700 }}>{quickLogModal.chg >= 0 ? "+" : ""}{quickLogModal.chg.toFixed(2)}%</span>
                {quickLogModal.score > 0 && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginLeft: 10 }}>Score {Math.round(quickLogModal.score)}</span>}
              </div>
              <button onClick={() => setQuickLogModal(null)} style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 2px" }}>×</button>
            </div>

            {/* BUY / SELL toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {["BUY", "SELL"].map(s => (
                <button key={s} onClick={() => setQuickLogModal(m => ({ ...m, side: s }))}
                  style={{ flex: 1, border: `1px solid ${s === "BUY" ? C.green : C.red}66`, background: quickLogModal.side === s ? (s === "BUY" ? `${C.green}22` : `${C.red}22`) : C.card, color: s === "BUY" ? C.green : C.red, borderRadius: 5, padding: "7px 0", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 800, letterSpacing: "0.05em" }}>
                  {s}
                </button>
              ))}
            </div>

            {/* Numeric fields */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              {[
                { label: "ENTRY", key: "entry" },
                { label: "STOP", key: "stopLoss" },
                { label: "TARGET", key: "target" },
                { label: "SHARES", key: "size", step: "1" },
              ].map(({ label, key, step }) => (
                <div key={key}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
                  <input type="number" step={step || "0.01"} value={quickLogModal[key]}
                    onChange={e => setQuickLogModal(m => ({ ...m, [key]: e.target.value }))}
                    style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontFamily: MONO, fontSize: 12, color: C.text, outline: "none" }} />
                </div>
              ))}
            </div>

            {/* R:R badge */}
            {(() => {
              const entry = Number(quickLogModal.entry) || 0;
              const stop = Number(quickLogModal.stopLoss) || 0;
              const target = Number(quickLogModal.target) || 0;
              if (entry > 0 && stop > 0 && target > 0 && Math.abs(entry - stop) > 0) {
                const rr = Math.abs(target - entry) / Math.abs(entry - stop);
                return (
                  <div style={{ fontFamily: MONO, fontSize: 12, color: rr >= 2 ? C.green : rr >= 1 ? C.amber : C.red, textAlign: "right", marginBottom: 10, fontWeight: 700 }}>
                    R:R {rr.toFixed(1)}:1 {rr >= 2 ? "✓" : rr >= 1 ? "~" : "✗"}
                  </div>
                );
              }
              return <div style={{ marginBottom: 10 }} />;
            })()}

            {/* Timeframe + Style */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>TIMEFRAME</div>
                <select value={quickLogModal.timeframe} onChange={e => setQuickLogModal(m => ({ ...m, timeframe: e.target.value }))}
                  style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontFamily: MONO, fontSize: 12, color: C.text }}>
                  {["1m","5m","15m","1H","4H","1D","1W"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>STYLE</div>
                <select value={quickLogModal.style} onChange={e => setQuickLogModal(m => ({ ...m, style: e.target.value }))}
                  style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontFamily: MONO, fontSize: 12, color: C.text }}>
                  {["Breakout","Pullback","Reversal","Momentum","Scalp","Swing","Watchlist"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>NOTES</div>
              <textarea rows={2} value={quickLogModal.notes} onChange={e => setQuickLogModal(m => ({ ...m, notes: e.target.value }))}
                style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontFamily: MONO, fontSize: 12, color: C.text, resize: "none", outline: "none" }} />
            </div>

            {/* Action row */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  const m = quickLogModal;
                  const entry = Number(m.entry) || 0;
                  const stop = Number(m.stopLoss) || 0;
                  const target = Number(m.target) || 0;
                  const rr = entry > 0 && stop > 0 && target > 0 ? (Math.abs(target - entry) / Math.abs(entry - stop)).toFixed(1) : "?";
                  const plan = [
                    `📋 ${m.symbol} | ${m.side} | ${m.style} | ${m.timeframe}`,
                    `Entry: $${entry.toFixed(2)} | Stop: $${stop.toFixed(2)} | Target: $${target.toFixed(2)}`,
                    `Size: ${Number(m.size) || "?"} shares | R:R ${rr}:1`,
                    m.notes ? `Notes: ${m.notes}` : "",
                  ].filter(Boolean).join("\n");
                  navigator.clipboard.writeText(plan).catch(() => {});
                }}
                style={{ border: `1px solid ${C.border}`, background: C.card, color: C.textSec, borderRadius: 5, padding: "11px 12px", fontFamily: MONO, fontSize: 12, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
                title="Copy trade plan to clipboard"
              >
                COPY
              </button>
              <button onClick={async () => {
                try {
                  await fetch("/api/journal", { method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      ticker: quickLogModal.symbol,
                      side: quickLogModal.side,
                      score: Math.round(quickLogModal.score || 0),
                      entry: Number(quickLogModal.entry) || 0,
                      stopLoss: Number(quickLogModal.stopLoss) || 0,
                      target: Number(quickLogModal.target) || 0,
                      size: Number(quickLogModal.size) || 0,
                      timeframe: quickLogModal.timeframe,
                      style: quickLogModal.style,
                      notes: quickLogModal.notes,
                    }),
                  });
                  setQuickLogModal(null);
                } catch {}
              }} style={{ flex: 1, border: "none", background: quickLogModal.side === "BUY" ? C.green : C.red, color: "#fff", borderRadius: 5, padding: "11px 0", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 800, letterSpacing: "0.06em" }}>
                LOG {quickLogModal.side} — {quickLogModal.symbol}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚽ SOCCER WATCH */}
      {activeTab === "soccer" && <SoccerWatchTab C={C} MONO={MONO} SANS={SANS} isTablet={isTablet} />}

      {activeTab === "adol22"          && <Adol22Tab          C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "notes"           && <NotesTab           C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "education"       && <EducationTab        C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "courses"         && <CoursesTab          C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "propath"         && <ProPathTab          C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} />}
      {activeTab === "options-edu"     && <OptionsEduTab       C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "recap"           && <RecapTab           C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "morning-routine" && <MorningRoutineTab C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} macroData={macroData} distData={distData} fearGreedData={fearGreedData} />}
      {activeTab === "challenge" && <ChallengeTab C={C} MONO={MONO} SANS={SANS} />}
      {activeTab === "academy" && (
        <AcademyTab
          C={C} MONO={MONO} SANS={SANS} isTablet={isTablet}
          activeLesson={activeLesson} setActiveLesson={setActiveLesson}
          lockEnabled={lockEnabled} setLockEnabled={setLockEnabled}
          tradingLocked={tradingLocked} setTradingLocked={setTradingLocked}
          dailyMaxLoss={dailyMaxLoss} setDailyMaxLoss={setDailyMaxLoss} setLockReason={setLockReason}
        />
      )}


      {/* ── Floating Checklist Button ── */}
      {(() => {
        const done  = checklistItems.filter(c => c.done).length;
        const total = checklistItems.length;
        const allDone = done === total;
        return (
          <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 8000 }}>
            <button
              onClick={() => setActiveTab("tools")}
              style={{ width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer",
                background: allDone ? C.green : done > 0 ? C.amber : C.red,
                boxShadow: `0 4px 18px ${allDone ? C.green : done > 0 ? C.amber : C.red}66`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, transition: "all 0.2s" }}>
              ✅
            </button>
          </div>
        );
      })()}

      {/* ── DAILY MAX LOSS LOCK OVERLAY ── */}
      {/* ── Tilt Detector Banner ── */}
      {tiltLocked && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.93)", zIndex: 9998,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 500, width: "100%", background: C.surface, borderRadius: 16,
            border: `2px solid ${C.amber}`, boxShadow: `0 0 60px ${C.amber}44`, padding: 36, textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🧠</div>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.amber, marginBottom: 10 }}>
              TILT DETECTED — STEP AWAY
            </div>
            <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec, lineHeight: 1.7, marginBottom: 18 }}>
              You have <strong style={{ color: C.red }}>3 consecutive losses</strong> today. The platform is locked for <strong>30 minutes</strong>.
              {tiltUnlockAt && (
                <div style={{ fontFamily: MONO, fontSize: 13, color: C.amber, marginTop: 8 }}>
                  Unlocks at {tiltUnlockAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
            <div style={{ background: `${C.amber}12`, border: `1px solid ${C.amber}33`, borderRadius: 10, padding: "14px 18px", marginBottom: 20, textAlign: "left" }}>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.amber, marginBottom: 6 }}>WHAT TO DO RIGHT NOW</div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, lineHeight: 1.8 }}>
                1. Close your laptop or put down the phone<br/>
                2. Go for a 10-minute walk<br/>
                3. Come back and review what went wrong — not to fix it, just to understand it<br/>
                4. No more trades today unless the setup is a perfect 10
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => setActiveTab("journal")}
                style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, border: `1px solid ${C.accent}`,
                  background: `${C.accent}18`, color: C.accent, borderRadius: 8, padding: "10px 24px", cursor: "pointer" }}>
                📓 Review My Trades
              </button>
              <button onClick={() => { setTiltLocked(false); setTiltUnlockAt(null); }}
                style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.border}`,
                  background: "transparent", color: C.textDim, borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>
                Override Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      {tradingLocked && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9999,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: 24 }}>
          <div style={{ maxWidth: 520, width: "100%", background: C.surface, borderRadius: 16,
            border: `2px solid ${C.red}`, boxShadow: `0 0 60px ${C.red}44`, padding: 36, textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🛑</div>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.red, marginBottom: 12 }}>
              TRADING LOCKED
            </div>
            <div style={{ fontFamily: SANS, fontSize: 15, color: C.textSec, lineHeight: 1.7, marginBottom: 24 }}>
              {lockReason}
            </div>
            <div style={{ background: `${C.red}12`, border: `1px solid ${C.red}33`, borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.red, marginBottom: 8 }}>
                WHY THIS RULE EXISTS
              </div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, lineHeight: 1.7, textAlign: "left" }}>
                After hitting your daily loss limit, the brain switches to "revenge mode" — you start chasing trades to make it back. This is how small losses become catastrophic losses. Professional traders never trade past their daily limit. Come back tomorrow with a clear head.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => { setTradingLocked(false); setLockReason(""); }}
                style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, border: "none",
                  background: C.green, color: "#fff", borderRadius: 8, padding: "12px 28px", cursor: "pointer" }}>
                🔓 UNLOCK PLATFORM
              </button>
              <button onClick={() => setActiveTab("journal")}
                style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, border: `1px solid ${C.accent}`,
                  background: `${C.accent}18`, color: C.accent, borderRadius: 8, padding: "10px 24px", cursor: "pointer" }}>
                📓 REVIEW MY TRADES
              </button>
              <button onClick={() => { setTradingLocked(false); setLockReason(""); setLockEnabled(false); try{localStorage.setItem("lock_enabled","false");}catch{} }}
                style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.border}`,
                  background: "transparent", color: C.textDim, borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>
                Disable Lock Feature
              </button>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 16, textAlign: "center" }}>
              Locked at -${dailyMaxLoss} · Turn off in TOOLS → 📚 ACADEMY
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
        @keyframes axiomTickerLTR { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }
        .axiom-ticker-track:hover { animation-play-state: paused; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        table { border-spacing: 0; }
      `}</style>
    </div>
  );
}

window.__AXIOM_APP__ = function AppRoot() { return React.createElement(RhErrorBoundary, null, React.createElement(App)); };



