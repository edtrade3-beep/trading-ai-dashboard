import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// AXIOM — Professional Market Intelligence Platform
// Real Data Edition — multi-provider (Finnhub + FMP + Yahoo fallback)
// ═══════════════════════════════════════════════════════════════

const THEME_LIGHT = {
  bg: "#fbfcff",
  surface: "#ffffff",
  card: "#ffffff",
  cardHover: "#f6f9ff",
  border: "#e6edf7",
  borderLit: "#d6e3f5",
  text: "#0a0a0a",
  textSec: "#1f1f1f",
  textDim: "#262626",
  accent: "#2c76e7",
  accentGlow: "rgba(44,118,231,0.14)",
  green: "#17a572",
  greenBg: "rgba(23,165,114,0.10)",
  red: "#de5b6f",
  redBg: "rgba(222,91,111,0.10)",
  amber: "#d99a2c",
  amberBg: "rgba(217,154,44,0.10)",
  cyan: "#2f98c6",
  purple: "#9a6ae0",
};
const THEME_DARK = {
  bg: "#060d1a",
  surface: "#0c1525",
  card: "#0f1c30",
  cardHover: "#152336",
  border: "#1a2e4a",
  borderLit: "#20395e",
  text: "#e4eeff",
  textSec: "#b0c6e8",
  textDim: "#607494",
  accent: "#2b90ff",
  accentGlow: "rgba(43,144,255,0.25)",
  green: "#00c97a",
  greenBg: "rgba(0,201,122,0.12)",
  red: "#ff4d63",
  redBg: "rgba(255,77,99,0.12)",
  amber: "#ffb340",
  amberBg: "rgba(255,179,64,0.14)",
  cyan: "#00d4ff",
  purple: "#a97aff",
};
const C = { ...THEME_LIGHT };

const SANS = `'Inter', 'Segoe UI Variable Text', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
const MONO = `'Inter', 'Segoe UI Variable Text', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
const UI_ZOOM = 1.06;
const LAYOUT = {
  pageMaxWidth: 1880,
  contentPadding: "18px 20px 28px",
  gridGap: 14,
  sidebarWidth: 390,
};
const WEATHER_ZIP = "45014";

// ── Islamic Module Constants ──
// CDN: download.quranicaudio.com/quran/{reciter.path}/{surahNum_padded3}.mp3
// All reciters verified to have complete 114-surah libraries on quranicaudio.com
const QURAN_BASE = "https://download.quranicaudio.com/quran";
const qUrl = (r, n) => `${QURAN_BASE}/${r.path}/${String(n).padStart(3, "0")}.mp3`;
const QURAN_RECITERS = [
  { id: "alafasy",  path: "mishaari_raashid_al_3afaasee",     label: "مشاري العفاسي — Mishary Al-Afasy",       full: true },
  { id: "maher",    path: "maher_almu3aiqly/year1440",        label: "ماهر المعيقلي — Maher Al-Muaiqly",       full: true },
  { id: "husary",   path: "mahmood_khaleel_al-husaree_iza3a", label: "محمود خليل الحصري — Al-Husary",           full: true },
  { id: "minshawi", path: "muhammad_siddeeq_al-minshaawee",   label: "محمد المنشاوي — Al-Minshawi",             full: true },
  { id: "sudais",   path: "abdurrahmaan_as-sudays",           label: "عبد الرحمن السديس — Sudais",              full: true },
  { id: "shuraym",  path: "sa3ood_al-shuraym",                label: "سعود الشريم — Shuraym",                   full: true },
  { id: "ghamdi",   path: "sa3d_al-ghaamidi/complete",        label: "سعد الغامدي — Saad Al-Ghamdi",            full: true },
  { id: "shatri",   path: "abu_bakr_ash-shatri_tarawee7",     label: "أبو بكر الشاطري — Abu Bakr Al-Shatri",   full: true },
  { id: "hudhaify", path: "huthayfi",                         label: "علي الحذيفي — Ali Al-Hudhaify",           full: true },
  { id: "ajamy",    path: "ahmed_ibn_3ali_al-3ajamy",         label: "أحمد العجمي — Ahmed Al-Ajamy",            full: true },
  { id: "basfar",   path: "abdullaah_basfar",                 label: "عبد الله بصفر — Abdullah Basfar",         full: true },
  { id: "ayyoub",   path: "muhammad_ayyoob_hq",               label: "محمد أيوب — Muhammad Ayyoub",             full: true },
  { id: "akhdar",   path: "ibrahim_al_akhdar",                label: "إبراهيم الأخضر — Ibrahim Al-Akhdar",     full: true },
];
// ── 5X Thematic Watchlist — shared by 5X PLAYS tab + Smart Scanner ─────────
const FIVEX_DATA = [
  { rank:1,  ticker:"BBAI",  company:"BigBear.ai",          sector:"Defense AI",        price:4.37,   e1:4.15,   e2:3.85,   e3:3.50,   trigger:4.72,   stop:3.71,   risk:"Very High",   upside:"5x-8x",  thesis:"Government AI systems" },
  { rank:2,  ticker:"SERV",  company:"Serve Robotics",       sector:"Robotics",          price:8.84,   e1:8.40,   e2:7.78,   e3:7.07,   trigger:9.55,   stop:7.51,   risk:"Extreme",     upside:"10x+",   thesis:"Autonomous delivery robots" },
  { rank:3,  ticker:"SMR",   company:"NuScale Power",        sector:"Nuclear",           price:12.07,  e1:11.47,  e2:10.62,  e3:9.66,   trigger:13.04,  stop:10.26,  risk:"High",        upside:"5x-7x",  thesis:"Small modular reactors" },
  { rank:4,  ticker:"RDW",   company:"Redwire",              sector:"Space",             price:24.00,  e1:22.80,  e2:21.12,  e3:19.20,  trigger:25.92,  stop:20.40,  risk:"High",        upside:"4x-6x",  thesis:"Space infrastructure" },
  { rank:5,  ticker:"NNE",   company:"Nano Nuclear Energy",  sector:"Nuclear",           price:27.36,  e1:25.99,  e2:24.08,  e3:21.89,  trigger:29.55,  stop:23.26,  risk:"Extreme",     upside:"10x+",   thesis:"Micro nuclear speculation" },
  { rank:6,  ticker:"LUNR",  company:"Intuitive Machines",   sector:"Space",             price:40.34,  e1:38.32,  e2:35.50,  e3:32.27,  trigger:43.57,  stop:34.29,  risk:"Very High",   upside:"5x-10x", thesis:"Moon/NASA contracts" },
  { rank:7,  ticker:"PL",    company:"Planet Labs",          sector:"Satellite AI",      price:50.48,  e1:47.96,  e2:44.42,  e3:40.38,  trigger:54.52,  stop:42.91,  risk:"High",        upside:"4x-6x",  thesis:"Earth observation AI" },
  { rank:8,  ticker:"SYM",   company:"Symbotic",             sector:"Automation",        price:53.63,  e1:50.95,  e2:47.19,  e3:42.90,  trigger:57.92,  stop:45.59,  risk:"Medium-High", upside:"4x-6x",  thesis:"Warehouse robotics" },
  { rank:9,  ticker:"OKLO",  company:"Oklo",                 sector:"AI Energy",         price:67.82,  e1:64.43,  e2:59.68,  e3:54.26,  trigger:73.25,  stop:57.65,  risk:"Very High",   upside:"8x-12x", thesis:"AI power demand + nuclear" },
  { rank:10, ticker:"ASTS",  company:"AST SpaceMobile",      sector:"Space",             price:129.60, e1:123.12, e2:114.05, e3:103.68, trigger:139.97, stop:110.16, risk:"Very High",   upside:"8x-15x", thesis:"Satellite direct-to-phone" },
  { rank:11, ticker:"PLTR",  company:"Palantir",             sector:"Defense AI",        price:132.51, e1:125.88, e2:116.61, e3:106.01, trigger:143.11, stop:112.63, risk:"Medium",      upside:"3x-5x",  thesis:"AI operating system" },
  { rank:12, ticker:"RKLB",  company:"Rocket Lab",           sector:"Space",             price:150.23, e1:142.72, e2:132.20, e3:120.18, trigger:162.25, stop:127.70, risk:"High",        upside:"5x-8x",  thesis:"Launch + defense + satellites" },
  { rank:13, ticker:"NBIS",  company:"Nebius Group",         sector:"AI Infrastructure", price:208.37, e1:197.95, e2:183.37, e3:166.70, trigger:225.04, stop:177.11, risk:"High",        upside:"4x-7x",  thesis:"AI compute infrastructure" },
  { rank:14, ticker:"VRT",   company:"Vertiv",               sector:"Infrastructure",    price:319.78, e1:303.79, e2:281.41, e3:255.82, trigger:345.36, stop:271.81, risk:"Medium",      upside:"3x-5x",  thesis:"AI datacenter cooling" },
  { rank:15, ticker:"PWR",   company:"Quanta Services",      sector:"Infrastructure",    price:733.62, e1:696.94, e2:645.59, e3:586.90, trigger:792.31, stop:623.58, risk:"Medium",      upside:"3x-5x",  thesis:"Grid modernization" },
  { rank:16, ticker:"GSAT",  company:"Globalstar",           sector:"Satellite AI",      price:2.82,   e1:2.68,   e2:2.48,   e3:2.26,   trigger:3.05,   stop:2.40,   risk:"Extreme",     upside:"10x+",   thesis:"Apple satellite partner — direct-to-device" },
  { rank:17, ticker:"APLD",  company:"Applied Digital",      sector:"AI Infrastructure", price:8.14,   e1:7.73,   e2:7.16,   e3:6.51,   trigger:8.79,   stop:6.92,   risk:"Extreme",     upside:"10x+",   thesis:"AI hyperscale data center builder" },
  { rank:18, ticker:"ACHR",  company:"Archer Aviation",      sector:"Air Mobility",      price:10.82,  e1:10.28,  e2:9.52,   e3:8.66,   trigger:11.69,  stop:9.20,   risk:"Extreme",     upside:"8x-15x", thesis:"eVTOL air taxi + US military contracts" },
  { rank:19, ticker:"SOUN",  company:"SoundHound AI",        sector:"AI Voice",          price:12.44,  e1:11.82,  e2:10.95,  e3:9.95,   trigger:13.44,  stop:10.57,  risk:"Extreme",     upside:"8x-15x", thesis:"Voice AI platform — automotive + enterprise" },
  { rank:20, ticker:"RGTI",  company:"Rigetti Computing",    sector:"Quantum AI",        price:13.86,  e1:13.17,  e2:12.20,  e3:11.09,  trigger:14.97,  stop:11.78,  risk:"Extreme",     upside:"10x+",   thesis:"Quantum processors for AI optimisation" },
  { rank:21, ticker:"CORZ",  company:"Core Scientific",      sector:"AI Infrastructure", price:16.24,  e1:15.43,  e2:14.29,  e3:12.99,  trigger:17.54,  stop:13.80,  risk:"Very High",   upside:"6x-10x", thesis:"HPC + AI compute hosting — ex-Bitcoin miner pivot" },
  { rank:22, ticker:"PATH",  company:"UiPath",               sector:"Automation",        price:17.68,  e1:16.80,  e2:15.56,  e3:14.14,  trigger:19.09,  stop:15.03,  risk:"High",        upside:"4x-7x",  thesis:"Enterprise AI automation — agentic workflow leader" },
  { rank:23, ticker:"KTOS",  company:"Kratos Defense",       sector:"Defense AI",        price:37.94,  e1:36.04,  e2:33.39,  e3:30.35,  trigger:40.98,  stop:32.25,  risk:"High",        upside:"5x-8x",  thesis:"Autonomous drones + AI targeting systems" },
  { rank:24, ticker:"IONQ",  company:"IonQ",                 sector:"Quantum AI",        price:47.62,  e1:45.24,  e2:41.91,  e3:38.10,  trigger:51.43,  stop:40.48,  risk:"Very High",   upside:"8x-15x", thesis:"Quantum computing as a service — govt + cloud" },
  { rank:25, ticker:"SMCI",  company:"Super Micro Computer", sector:"AI Infrastructure", price:48.35,  e1:45.93,  e2:42.55,  e3:38.68,  trigger:52.22,  stop:41.10,  risk:"Very High",   upside:"5x-10x", thesis:"AI server + GPU rack systems — Nvidia ecosystem" },
  { rank:26, ticker:"CCJ",   company:"Cameco",               sector:"Nuclear",           price:57.88,  e1:54.99,  e2:50.93,  e3:46.30,  trigger:62.51,  stop:49.20,  risk:"High",        upside:"4x-6x",  thesis:"World's largest uranium producer — nuclear renaissance" },
  { rank:27, ticker:"BWXT",  company:"BWX Technologies",     sector:"Nuclear",           price:112.44, e1:106.82, e2:98.95,  e3:89.95,  trigger:121.44, stop:95.57,  risk:"Medium-High", upside:"4x-6x",  thesis:"Naval nuclear reactors + microreactor development" },
  { rank:28, ticker:"VST",   company:"Vistra Energy",        sector:"AI Energy",         price:141.76, e1:134.67, e2:124.75, e3:113.41, trigger:153.10, stop:120.50, risk:"Medium",      upside:"3x-5x",  thesis:"Nuclear + gas power for AI data center demand" },
  { rank:29, ticker:"CEG",   company:"Constellation Energy", sector:"AI Energy",         price:268.42, e1:255.00, e2:236.21, e3:214.74, trigger:289.89, stop:228.16, risk:"Medium",      upside:"3x-5x",  thesis:"Largest US nuclear fleet — AI data center PPAs" },
  { rank:30, ticker:"GEV",   company:"GE Vernova",           sector:"Infrastructure",    price:397.84, e1:377.95, e2:350.10, e3:318.27, trigger:429.67, stop:338.16, risk:"Medium",      upside:"3x-5x",  thesis:"Grid modernisation + wind & gas turbines for AI era" },
];
// Lookup map: ticker → ref data
const FIVEX_REF = Object.fromEntries(FIVEX_DATA.map(s => [s.ticker, s]));

const SURAH_LIST = [
  [1,"الفاتحة","Al-Fatiha"],
  [2,"البقرة","Al-Baqarah"],
  [3,"آل عمران","Ali 'Imran"],
  [4,"النساء","An-Nisa"],
  [5,"المائدة","Al-Ma'idah"],
  [6,"الأنعام","Al-An'am"],
  [7,"الأعراف","Al-A'raf"],
  [8,"الأنفال","Al-Anfal"],
  [9,"التوبة","At-Tawbah"],
  [10,"يونس","Yunus"],
  [11,"هود","Hud"],
  [12,"يوسف","Yusuf"],
  [13,"الرعد","Ar-Ra'd"],
  [14,"إبراهيم","Ibrahim"],
  [15,"الحجر","Al-Hijr"],
  [16,"النحل","An-Nahl"],
  [17,"الإسراء","Al-Isra"],
  [18,"الكهف","Al-Kahf"],
  [19,"مريم","Maryam"],
  [20,"طه","Ta-Ha"],
  [21,"الأنبياء","Al-Anbiya"],
  [22,"الحج","Al-Hajj"],
  [23,"المؤمنون","Al-Mu'minun"],
  [24,"النور","An-Nur"],
  [25,"الفرقان","Al-Furqan"],
  [26,"الشعراء","Ash-Shu'ara"],
  [27,"النمل","An-Naml"],
  [28,"القصص","Al-Qasas"],
  [29,"العنكبوت","Al-'Ankabut"],
  [30,"الروم","Ar-Rum"],
  [31,"لقمان","Luqman"],
  [32,"السجدة","As-Sajdah"],
  [33,"الأحزاب","Al-Ahzab"],
  [34,"سبأ","Saba"],
  [35,"فاطر","Fatir"],
  [36,"يس","Ya-Sin"],
  [37,"الصافات","As-Saffat"],
  [38,"ص","Sad"],
  [39,"الزمر","Az-Zumar"],
  [40,"غافر","Ghafir"],
  [41,"فصلت","Fussilat"],
  [42,"الشورى","Ash-Shura"],
  [43,"الزخرف","Az-Zukhruf"],
  [44,"الدخان","Ad-Dukhan"],
  [45,"الجاثية","Al-Jathiyah"],
  [46,"الأحقاف","Al-Ahqaf"],
  [47,"محمد","Muhammad"],
  [48,"الفتح","Al-Fath"],
  [49,"الحجرات","Al-Hujurat"],
  [50,"ق","Qaf"],
  [51,"الذاريات","Adh-Dhariyat"],
  [52,"الطور","At-Tur"],
  [53,"النجم","An-Najm"],
  [54,"القمر","Al-Qamar"],
  [55,"الرحمن","Ar-Rahman"],
  [56,"الواقعة","Al-Waqi'ah"],
  [57,"الحديد","Al-Hadid"],
  [58,"المجادلة","Al-Mujadila"],
  [59,"الحشر","Al-Hashr"],
  [60,"الممتحنة","Al-Mumtahanah"],
  [61,"الصف","As-Saf"],
  [62,"الجمعة","Al-Jumu'ah"],
  [63,"المنافقون","Al-Munafiqun"],
  [64,"التغابن","At-Taghabun"],
  [65,"الطلاق","At-Talaq"],
  [66,"التحريم","At-Tahrim"],
  [67,"الملك","Al-Mulk"],
  [68,"القلم","Al-Qalam"],
  [69,"الحاقة","Al-Haqqah"],
  [70,"المعارج","Al-Ma'arij"],
  [71,"نوح","Nuh"],
  [72,"الجن","Al-Jinn"],
  [73,"المزمل","Al-Muzzammil"],
  [74,"المدثر","Al-Muddaththir"],
  [75,"القيامة","Al-Qiyamah"],
  [76,"الإنسان","Al-Insan"],
  [77,"المرسلات","Al-Mursalat"],
  [78,"النبأ","An-Naba"],
  [79,"النازعات","An-Nazi'at"],
  [80,"عبس","'Abasa"],
  [81,"التكوير","At-Takwir"],
  [82,"الإنفطار","Al-Infitar"],
  [83,"المطففين","Al-Mutaffifin"],
  [84,"الإنشقاق","Al-Inshiqaq"],
  [85,"البروج","Al-Buruj"],
  [86,"الطارق","At-Tariq"],
  [87,"الأعلى","Al-A'la"],
  [88,"الغاشية","Al-Ghashiyah"],
  [89,"الفجر","Al-Fajr"],
  [90,"البلد","Al-Balad"],
  [91,"الشمس","Ash-Shams"],
  [92,"الليل","Al-Layl"],
  [93,"الضحى","Ad-Duha"],
  [94,"الشرح","Ash-Sharh"],
  [95,"التين","At-Tin"],
  [96,"العلق","Al-'Alaq"],
  [97,"القدر","Al-Qadr"],
  [98,"البينة","Al-Bayyinah"],
  [99,"الزلزلة","Az-Zalzalah"],
  [100,"العاديات","Al-'Adiyat"],
  [101,"القارعة","Al-Qari'ah"],
  [102,"التكاثر","At-Takathur"],
  [103,"العصر","Al-'Asr"],
  [104,"الهمزة","Al-Humazah"],
  [105,"الفيل","Al-Fil"],
  [106,"قريش","Quraysh"],
  [107,"الماعون","Al-Ma'un"],
  [108,"الكوثر","Al-Kawthar"],
  [109,"الكافرون","Al-Kafirun"],
  [110,"النصر","An-Nasr"],
  [111,"المسد","Al-Masad"],
  [112,"الإخلاص","Al-Ikhlas"],
  [113,"الفلق","Al-Falaq"],
  [114,"الناس","An-Nas"],
];
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
  "NVDA","AAPL","MSFT","AMZN","META","GOOGL","TSLA","JPM","XOM","UNH","LLY","AVGO","HD","V","CRM",
  "AMD","QCOM","MU","INTC","ORCL","ADBE","NFLX","COST","WMT","BAC","WFC","GS","MS","CAT","DE",
  "NKE","MCD","DIS","PFE","MRK","ABBV","KO","PEP","TMO","AMGN","ISRG","PANW","PLTR","UBER","SHOP"
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
const SECTOR_ETFS = [
  { symbol: "XLK", name: "Technology" },
  { symbol: "XLV", name: "Healthcare" },
  { symbol: "XLF", name: "Financials" },
  { symbol: "XLY", name: "Consumer Disc" },
  { symbol: "XLC", name: "Communication" },
  { symbol: "XLI", name: "Industrials" },
  { symbol: "XLE", name: "Energy" },
  { symbol: "XLP", name: "Cons. Staples" },
  { symbol: "XLU", name: "Utilities" },
  { symbol: "XLRE", name: "Real Estate" },
  { symbol: "XLB", name: "Materials" },
];
const STOCK_TO_SECTOR = {
  NVDA: "XLK", AAPL: "XLK", MSFT: "XLK", AVGO: "XLK",
  AMZN: "XLY", TSLA: "XLY", HD: "XLY",
  META: "XLC", GOOGL: "XLC", CRM: "XLK",
  JPM: "XLF", XOM: "XLE", UNH: "XLV", LLY: "XLV", V: "XLF",
};
const TV_EXCHANGE_HINTS = {
  SPY: "AMEX", QQQ: "NASDAQ", IWM: "AMEX", DIA: "AMEX", GLD: "AMEX", TLT: "NASDAQ", USO: "AMEX",
  XLK: "AMEX", XLV: "AMEX", XLF: "AMEX", XLY: "AMEX", XLC: "AMEX", XLI: "AMEX", XLE: "AMEX",
  XLP: "AMEX", XLU: "AMEX", XLRE: "AMEX", XLB: "AMEX",
};
const STORAGE_KEY = "axiom_local_config_v1";
// App password is validated server-side via POST /api/auth/check (never stored in source)
const AUTH_STORAGE_KEY = "axiom_app_unlock_v1";
const DEFAULT_SETTINGS = {
  refreshMs: 180000,
  terminalLayout: "1",
  hotkeyProfile: "classic",
  themeMode: "dark",
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

function formatCountdown(ms) {
  const n = Math.max(0, Number(ms || 0));
  const totalSec = Math.floor(n / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
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
    { id: "fed", title: "Fed Decision / Presser", tag: "FED", severity: "high", region: "US", time: fed, riskNote: "Reduce gross and avoid fresh size 60-90m pre-event.", estimated: true },
    { id: "cpi", title: "US CPI Release", tag: "CPI", severity: "high", region: "US", time: cpi, riskNote: "Tighten stops and cut leverage into print.", estimated: true },
    { id: "jobs", title: "US Jobs (NFP)", tag: "JOBS", severity: "high", region: "US", time: jobs, riskNote: "Expect index/FX vol spikes; reduce into event.", estimated: true },
    { id: "pce", title: "PCE Inflation", tag: "PCE", severity: "medium", region: "US", time: pce, riskNote: "Trim high-beta if regime is fragile.", estimated: true },
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

// ── Score Computation (heuristic from quote data) ──
function computeScores(q) {
  if (!q) return { tech: 0, fund: 0, macro: 0, composite: 0 };
  
  // Technical score from price action signals
  let tech = 50;
  const chgPct = q.changesPercentage || 0;
  if (chgPct > 2) tech += 20;
  else if (chgPct > 0.5) tech += 12;
  else if (chgPct > 0) tech += 5;
  else if (chgPct > -1) tech -= 5;
  else tech -= 15;
  
  // Volume signal
  if (q.volume && q.avgVolume) {
    const rvol = q.volume / q.avgVolume;
    if (rvol > 1.5 && chgPct > 0) tech += 15;
    else if (rvol > 1.2 && chgPct > 0) tech += 8;
    else if (rvol > 1.5 && chgPct < 0) tech -= 10;
  }
  
  // Distance from year high/low
  if (q.yearHigh && q.yearLow && q.price) {
    const range = q.yearHigh - q.yearLow;
    if (range > 0) {
      const pos = (q.price - q.yearLow) / range;
      if (pos > 0.85) tech += 10;
      else if (pos > 0.6) tech += 5;
      else if (pos < 0.2) tech -= 10;
    }
  }
  
  // Fundamental placeholder (would need income statement API)
  let fund = 50;
  if (q.pe && q.pe > 0 && q.pe < 25) fund += 12;
  else if (q.pe && q.pe > 40) fund -= 8;
  if (q.marketCap > 200e9) fund += 8;
  else if (q.marketCap > 50e9) fund += 4;
  
  // Macro alignment (simplified)
  let macro = 55;
  if (chgPct > 0) macro += 8;
  
  tech = Math.max(0, Math.min(100, tech));
  fund = Math.max(0, Math.min(100, fund));
  macro = Math.max(0, Math.min(100, macro));
  const composite = Math.round(tech * 0.45 + fund * 0.35 + macro * 0.2);
  
  return { tech, fund, macro, composite };
}

function classifyTrend(q) {
  if (!q) return "—";
  const chg = q.changesPercentage || 0;
  if (chg > 2.5) return "Strong Up";
  if (chg > 0.5) return "Up";
  if (chg > -0.5) return "Flat";
  if (chg > -2) return "Weak";
  return "Down";
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
const Badge = ({ children, color = C.accent, bg }) => (
  <span style={{
    fontSize: 9, fontFamily: MONO, fontWeight: 700, padding: "2px 6px",
    borderRadius: 2, color, background: bg || `${color}18`, letterSpacing: "0.04em",
    whiteSpace: "nowrap", textTransform: "uppercase",
  }}>{children}</span>
);

const ScoreBar = ({ value, color, w = "100%" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 5, width: w }}>
    <div style={{ flex: 1, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
      <div style={{
        width: `${value}%`, height: "100%", borderRadius: 2,
        background: color || (value >= 70 ? C.green : value >= 45 ? C.amber : C.red),
        transition: "width 0.4s ease",
      }} />
    </div>
    <span style={{ fontSize: 9, fontFamily: MONO, color: C.text, minWidth: 20, textAlign: "right" }}>{value}</span>
  </div>
);

const TrendTag = ({ trend }) => {
  const m = {
    "Strong Up": { c: C.green, i: "▲▲" }, "Up": { c: C.green, i: "▲" },
    "Flat": { c: C.amber, i: "◆" }, "Weak": { c: C.red, i: "▽" }, "Down": { c: C.red, i: "▼▼" },
    "—": { c: C.textDim, i: "—" },
  };
  const { c, i } = m[trend] || m["—"];
  return <Badge color={c}>{i} {trend}</Badge>;
};

const formatNum = (n) => {
  if (!n && n !== 0) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
};

const Pill = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{
    fontFamily: SANS, fontSize: 12, fontWeight: 700, padding: "8px 14px",
    borderRadius: 4, border: "none", cursor: "pointer", letterSpacing: "0.02em",
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
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{
        width: 420, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 32, textAlign: "center",
      }}>
        <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>AM TRADING</div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 20 }}>
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
        {error ? <div style={{ fontSize: 11, color: C.red, marginBottom: 10 }}>{error}</div> : null}
        <button
          onClick={onSubmit}
          style={{
            width: "100%", border: `1px solid ${C.accent}`, background: C.accent, color: "#fff",
            borderRadius: 6, padding: "10px 0", fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer",
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
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{
        width: 440, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 40, textAlign: "center",
      }}>
        <div style={{
          fontFamily: MONO, fontSize: 28, fontWeight: 800, color: C.text,
          letterSpacing: "-0.03em", marginBottom: 4,
        }}>AXIOM</div>
        <div style={{
          fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.15em",
          marginBottom: 32, textTransform: "uppercase",
        }}>Market Intelligence Platform</div>

        <div style={{ textAlign: "left", marginBottom: 6 }}>
          <label style={{ fontSize: 10, fontFamily: MONO, color: C.textSec, letterSpacing: "0.06em" }}>
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
            borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, outline: "none",
            marginBottom: 12, boxSizing: "border-box",
          }}
          onFocus={(e) => e.target.style.borderColor = C.accent}
          onBlur={(e) => e.target.style.borderColor = C.border}
        />

        {error && (
          <div style={{ fontSize: 11, color: C.red, fontFamily: SANS, marginBottom: 10 }}>{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !key.trim()}
          style={{
            width: "100%", padding: "10px 0", background: loading ? C.textDim : C.accent,
            color: "#fff", border: "none", borderRadius: 4, fontFamily: MONO, fontSize: 11,
            fontWeight: 700, cursor: loading ? "wait" : "pointer", letterSpacing: "0.06em",
            marginBottom: 20, opacity: (!key.trim() && !loading) ? 0.5 : 1,
          }}
        >{loading ? "VALIDATING…" : "CONNECT"}</button>

        <div style={{
          fontSize: 10, fontFamily: SANS, color: C.textDim, lineHeight: 1.7,
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
            <span style={{ fontSize: 9, fontFamily: MONO, color: C.textDim, fontWeight: 600, letterSpacing: "0.07em", marginBottom: 2, whiteSpace: "nowrap" }}>
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
              <span style={{ fontSize: 11, fontFamily: MONO, color: col, fontWeight: 700 }}>
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
        <span style={{ fontFamily: MONO, fontSize: 10, color: regimeColor, fontWeight: 800, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
          VIX REGIME: {regime}
        </span>
      </div>
    </div>
  );
}

// ── Sector Heatmap ──
function SectorHeatmap({ data }) {
  if (!data.length) return <div style={{ fontSize: 11, color: C.textDim, fontFamily: MONO, padding: 16 }}>Loading sectors…</div>;
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
            background: bg, border: `1px solid ${bdr}`, borderRadius: 3,
            padding: "7px 5px", textAlign: "center",
          }}>
            <div style={{ fontSize: 8, fontFamily: MONO, color: C.textDim }}>{s.symbol}</div>
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

// ── Canvas Chart ─────────────────────────────────────────────────────────────
function drawChart(ctx, W, H, candleData, drawTools, hover) {
  ctx.save();
  const bars     = (candleData?.bars || []).slice(-120);
  const ind      = candleData?.indicators || {};
  const ema9arr  = (ind.ema9  || []).slice(-120);
  const ema21arr = (ind.ema21 || []).slice(-120);
  const vwapArr  = (ind.vwap  || []).slice(-120);
  const rsiArr   = (ind.rsi   || []).slice(-120);
  const macdLine = (ind.macd?.line      || []).slice(-120);
  const macdSig  = (ind.macd?.signal    || []).slice(-120);
  const macdHist = (ind.macd?.histogram || []).slice(-120);
  const n = bars.length;

  const PL = 8, PR = 68, PT = 14, PB = 26, GAP = 5;
  const cH  = H - PT - PB;
  const cW  = W - PL - PR;
  const pH  = Math.floor(cH * 0.56);
  const vH  = Math.floor(cH * 0.10);
  const rH  = Math.floor(cH * 0.17);
  const mH  = cH - pH - vH - rH - GAP * 3;
  const pY  = PT;
  const vY  = pY + pH + GAP;
  const rY  = vY + vH + GAP;
  const mY  = rY + rH + GAP;

  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, W, H);

  if (!n) {
    ctx.fillStyle = C.textDim;
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("No chart data", W / 2, H / 2);
    ctx.restore();
    return;
  }

  const allPx = bars.flatMap(b => [b.high, b.low])
    .concat(ema9arr.map(v => v.value), ema21arr.map(v => v.value), vwapArr.map(v => v.value))
    .filter(Number.isFinite);
  const hiRaw = Math.max(...allPx);
  const loRaw = Math.min(...allPx);
  const span  = Math.max(hiRaw - loRaw, hiRaw * 0.001, 0.01);
  const hiP   = hiRaw + span * 0.04;
  const loP   = loRaw - span * 0.04;
  const pSpan = hiP - loP;

  const barW  = cW / n;
  const candW = Math.max(1, barW * 0.65);
  const toX   = (i) => PL + (i + 0.5) * barW;
  const toYP  = (p) => pY + pH - ((p - loP) / pSpan) * pH;
  const decs  = hiP >= 1000 ? 1 : hiP >= 100 ? 2 : hiP >= 10 ? 3 : 4;

  // ── Price gridlines + Y labels ──────────────────────────────────────────
  ctx.font = "9px monospace";
  ctx.textAlign = "left";
  for (let i = 0; i <= 5; i++) {
    const p = loP + (pSpan / 5) * i;
    const y = toYP(p);
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.textDim;
    ctx.fillText(`$${p.toFixed(decs)}`, W - PR + 4, y + 3);
  }

  // ── Volume ───────────────────────────────────────────────────────────────
  const maxV = Math.max(...bars.map(b => b.volume || 0), 1);
  bars.forEach((b, i) => {
    const up = b.close >= b.open;
    const bh = ((b.volume || 0) / maxV) * vH;
    ctx.fillStyle = up ? `${C.green}55` : `${C.red}55`;
    ctx.fillRect(toX(i) - candW / 2, vY + vH - bh, candW, bh);
  });
  ctx.fillStyle = C.textDim; ctx.font = "8px monospace"; ctx.textAlign = "left";
  ctx.fillText("VOL", W - PR + 4, vY + 9);

  // ── RSI ──────────────────────────────────────────────────────────────────
  [30, 50, 70].forEach(lv => {
    const y = rY + rH * (1 - lv / 100);
    ctx.strokeStyle = lv === 50 ? C.border : `${C.textDim}55`;
    ctx.lineWidth = 0.4;
    ctx.setLineDash(lv === 50 ? [] : [3, 4]);
    ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.textDim; ctx.font = "8px monospace"; ctx.textAlign = "left";
    ctx.fillText(`${lv}`, W - PR + 4, y + 3);
  });
  if (rsiArr.length > 1) {
    const rW = cW / rsiArr.length;
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.2; ctx.beginPath();
    rsiArr.forEach((r, i) => {
      const x = PL + (i + 0.5) * rW;
      const y = rY + rH * (1 - Math.max(0, Math.min(100, r.value)) / 100);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    const lr = rsiArr[rsiArr.length - 1]?.value;
    if (lr !== undefined) {
      ctx.fillStyle = C.accent; ctx.font = "8px monospace"; ctx.textAlign = "left";
      ctx.fillText(`RSI ${lr.toFixed(0)}`, W - PR + 4, rY + 9);
    }
  }

  // ── MACD ─────────────────────────────────────────────────────────────────
  const macdAbsMax = Math.max(
    ...macdHist.map(m => Math.abs(m.value)),
    ...macdLine.map(m => Math.abs(m.value)),
    ...macdSig.map(m => Math.abs(m.value)), 0.001
  );
  const mMid = mY + mH / 2;
  const toYM = (v) => mMid - (v / macdAbsMax) * (mH / 2 * 0.88);
  ctx.strokeStyle = C.border; ctx.lineWidth = 0.4; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(PL, mMid); ctx.lineTo(W - PR, mMid); ctx.stroke();
  ctx.setLineDash([]);
  if (macdHist.length) {
    const hW = cW / macdHist.length;
    const hBW = Math.max(1, hW * 0.65);
    macdHist.forEach((m, i) => {
      const x = PL + (i + 0.5) * hW, y = toYM(m.value);
      ctx.fillStyle = m.value >= 0 ? `${C.green}88` : `${C.red}88`;
      if (m.value >= 0) ctx.fillRect(x - hBW / 2, y, hBW, mMid - y);
      else              ctx.fillRect(x - hBW / 2, mMid, hBW, y - mMid);
    });
  }
  if (macdLine.length > 1) {
    const mLW = cW / macdLine.length;
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.2; ctx.beginPath();
    macdLine.forEach((m, i) => { const x = PL + (i + 0.5) * mLW, y = toYM(m.value); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();
  }
  if (macdSig.length > 1) {
    const mSW = cW / macdSig.length;
    ctx.strokeStyle = C.purple; ctx.lineWidth = 1; ctx.beginPath();
    macdSig.forEach((m, i) => { const x = PL + (i + 0.5) * mSW, y = toYM(m.value); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();
  }
  ctx.fillStyle = C.textDim; ctx.font = "8px monospace"; ctx.textAlign = "left";
  ctx.fillText("MACD", W - PR + 4, mY + 9);

  // ── Candles ───────────────────────────────────────────────────────────────
  bars.forEach((b, i) => {
    const up = b.close >= b.open;
    const x  = toX(i);
    const by = Math.min(toYP(b.open), toYP(b.close));
    const bh = Math.max(Math.abs(toYP(b.close) - toYP(b.open)), 1);
    ctx.strokeStyle = up ? C.green : C.red; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, toYP(b.high)); ctx.lineTo(x, toYP(b.low)); ctx.stroke();
    ctx.fillStyle = up ? `${C.green}44` : `${C.red}44`;
    ctx.fillRect(x - candW / 2, by, candW, bh);
    ctx.strokeRect(x - candW / 2, by, candW, bh);
  });

  // ── Overlays ──────────────────────────────────────────────────────────────
  const drawLine = (arr, color, lw) => {
    if (arr.length < 2) return;
    const aW = cW / arr.length;
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash([]); ctx.beginPath();
    arr.forEach((p, i) => { const x = PL + (i + 0.5) * aW, y = toYP(p.value); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();
  };
  drawLine(ema9arr,  C.cyan,   1.2);
  drawLine(ema21arr, C.purple, 1.2);
  drawLine(vwapArr,  C.amber,  1.5);

  // ── Draw tools ────────────────────────────────────────────────────────────
  const fibLo = Number(drawTools?.fibLow), fibHi = Number(drawTools?.fibHigh);
  if (Number.isFinite(fibLo) && Number.isFinite(fibHi) && fibHi > fibLo) {
    ctx.font = "8px monospace"; ctx.textAlign = "right";
    [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].forEach(f => {
      const y = toYP(fibLo + (fibHi - fibLo) * f);
      if (y < pY || y > pY + pH) return;
      ctx.strokeStyle = "#2c7be5"; ctx.lineWidth = 0.6; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#2c7be5";
      ctx.fillText(f.toFixed(3), W - PR - 2, y - 2);
    });
  }
  const tS = Number(drawTools?.trendStart), tE = Number(drawTools?.trendEnd);
  if (Number.isFinite(tS) && Number.isFinite(tE)) {
    ctx.strokeStyle = "#805ad5"; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(PL, toYP(tS)); ctx.lineTo(W - PR, toYP(tE)); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Legend ────────────────────────────────────────────────────────────────
  ctx.font = "9px monospace"; ctx.textAlign = "left";
  const le9  = ema9arr.length  ? ema9arr[ema9arr.length - 1].value.toFixed(decs)   : "";
  const le21 = ema21arr.length ? ema21arr[ema21arr.length - 1].value.toFixed(decs) : "";
  const lv   = vwapArr.length  ? vwapArr[vwapArr.length - 1].value.toFixed(decs)   : "";
  [[C.cyan, `EMA9 ${le9}`], [C.purple, `EMA21 ${le21}`], [C.amber, `VWAP ${lv}`]].forEach(([col, lbl], i) => {
    ctx.fillStyle = col;
    ctx.fillText(lbl, PL + 4 + i * 115, PT + 11);
  });

  // ── X-axis labels ─────────────────────────────────────────────────────────
  ctx.fillStyle = C.textDim; ctx.font = "9px monospace"; ctx.textAlign = "center";
  const xStep = Math.max(1, Math.floor(n / 8));
  for (let i = 0; i < n; i += xStep) {
    const b = bars[i];
    if (!b?.time) continue;
    const d = new Date(b.time);
    ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, toX(i), H - 8);
  }

  // ── Crosshair ─────────────────────────────────────────────────────────────
  if (hover) {
    const cx = toX(hover.idx);
    ctx.strokeStyle = `${C.textDim}88`;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cx, PT); ctx.lineTo(cx, H - PB); ctx.stroke();
    if (hover.y >= pY && hover.y <= pY + pH) {
      ctx.beginPath(); ctx.moveTo(PL, hover.y); ctx.lineTo(W - PR, hover.y); ctx.stroke();
      const pTag = loP + ((pY + pH - hover.y) / pH) * pSpan;
      ctx.setLineDash([]);
      ctx.fillStyle = C.accent;
      ctx.fillRect(W - PR, hover.y - 9, PR - 1, 18);
      ctx.fillStyle = "#fff"; ctx.font = "9px monospace"; ctx.textAlign = "left";
      ctx.fillText(`$${pTag.toFixed(decs)}`, W - PR + 3, hover.y + 3);
    }
    ctx.setLineDash([]);
    if (bars[hover.idx]?.time) {
      const d = new Date(bars[hover.idx].time);
      const ts = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
      const tw = ts.length * 5.4;
      const tx = Math.max(PL + tw / 2 + 2, Math.min(cx, W - PR - tw / 2 - 2));
      ctx.fillStyle = C.accent;
      ctx.fillRect(tx - tw / 2 - 2, H - PB - 1, tw + 4, PB);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      ctx.fillText(ts, tx, H - 8);
    }
  }

  ctx.restore();
}

function CanvasChart({ candleData, drawTools, loading }) {
  const containerRef = useRef(null);
  const canvasRef    = useRef(null);
  const [cvSize, setCvSize] = useState({ w: 600, h: 360 });
  const [hover, setHover]   = useState(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCvSize({ w: Math.max(100, Math.floor(width)), h: Math.max(60, Math.floor(height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = cvSize.w * dpr;
    canvas.height = cvSize.h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    drawChart(ctx, cvSize.w, cvSize.h, candleData, drawTools, hover);
  }, [candleData, drawTools, cvSize, hover]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas || !candleData?.bars?.length) { setHover(null); return; }
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (cvSize.w / rect.width);
    const my = (e.clientY - rect.top)  * (cvSize.h / rect.height);
    const n    = Math.min(candleData.bars.length, 120);
    const barW = (cvSize.w - 8 - 68) / n;
    const idx  = Math.max(0, Math.min(n - 1, Math.floor((mx - 8) / barW)));
    setHover({ x: mx, y: my, bar: candleData.bars.slice(-n)[idx] || null, idx });
  }, [candleData, cvSize]);

  const handleMouseLeave = useCallback(() => setHover(null), []);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", background: C.surface, overflow: "hidden" }}>
      {(loading || !candleData?.bars?.length) ? (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
            {loading ? "Loading chart…" : "Select a symbol — chart loads automatically"}
          </span>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      )}
      {hover?.bar && !loading && (
        <div style={{
          position: "absolute",
          left: Math.min(hover.x + 14, cvSize.w - 160),
          top: Math.max(6, hover.y - 92),
          background: C.card,
          border: `1px solid ${C.borderLit}`,
          borderRadius: 6,
          padding: "7px 10px",
          fontFamily: MONO,
          fontSize: 10,
          color: C.text,
          pointerEvents: "none",
          zIndex: 10,
          minWidth: 148,
          boxShadow: "0 4px 14px rgba(0,0,0,0.14)",
        }}>
          <div style={{ color: C.textDim, marginBottom: 5, fontSize: 9 }}>
            {new Date(hover.bar.time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px" }}>
            <span style={{ color: C.textDim }}>O</span><span>${Number(hover.bar.open  || 0).toFixed(2)}</span>
            <span style={{ color: C.textDim }}>H</span><span style={{ color: C.green }}>${Number(hover.bar.high  || 0).toFixed(2)}</span>
            <span style={{ color: C.textDim }}>L</span><span style={{ color: C.red   }}>${Number(hover.bar.low   || 0).toFixed(2)}</span>
            <span style={{ color: C.textDim }}>C</span><span style={{ color: hover.bar.close >= hover.bar.open ? C.green : C.red }}>${Number(hover.bar.close || 0).toFixed(2)}</span>
            <span style={{ color: C.textDim }}>Vol</span><span>{hover.bar.volume ? `${(hover.bar.volume / 1e6).toFixed(2)}M` : "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TerminalWorkspace({
  watchlistData, macroData, sectorData, newsData, alerts,
  selectedSymbol, onSelectSymbol, timeframe, onTimeframeChange,
  candleData, loadingCandles, terminalLayout, onLayoutChange,
  hotkeyProfile, onHotkeyProfileChange, drawTools, onDrawToolsChange,
  panelSymbols, onPanelSymbolChange, panelCandleMap, fundamentals, marketSession,
  onQuickLog,
}) {
  const selected = watchlistData.find((q) => q.symbol === selectedSymbol) || watchlistData[0] || null;
  const [leftW, setLeftW] = useState(220);
  const [rightW, setRightW] = useState(340);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [drag, setDrag] = useState(null);
  const [alertFormOpen, setAlertFormOpen] = useState(false);
  const [alertTarget, setAlertTarget] = useState("");
  const [alertDir, setAlertDir] = useState("above");
  const [alertSaving, setAlertSaving] = useState(false);
  const [orderType, setOrderType] = useState("market");
  const [orderSide, setOrderSide] = useState("buy");
  const [orderQty, setOrderQty] = useState("100");
  const [orderPrice, setOrderPrice] = useState("");
  const [orderTp, setOrderTp] = useState("");
  const [orderSl, setOrderSl] = useState("");
  const [orderTrailPct, setOrderTrailPct] = useState("2");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderConfirmed, setOrderConfirmed] = useState(null);

  // ── Chart mode (canvas = interactive / finviz = image) ───────────────────
  const [chartMode, setChartMode] = useState("canvas");
  const [fvPeriod, setFvPeriod]   = useState("d");
  const [fvStats,  setFvStats]    = useState(null);
  const [fvLoading, setFvLoading] = useState(false);

  const loadFvStats = useCallback(async (sym) => {
    if (!sym) return;
    setFvLoading(true);
    try {
      const res  = await fetch(`/api/finviz/quote?symbol=${encodeURIComponent(sym)}`);
      const data = await res.json();
      if (res.ok) setFvStats(data);
    } catch {}
    finally { setFvLoading(false); }
  }, []);

  // Auto-load Finviz stats when switching to FV mode or symbol changes
  useEffect(() => {
    if (chartMode === "finviz" && selected?.symbol) loadFvStats(selected.symbol);
  }, [chartMode, selected?.symbol]); // eslint-disable-line

  // ── AI Insight ──────────────────────────────────────────────────────────────
  const [insightText, setInsightText]       = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightSymbol, setInsightSymbol]   = useState(null);
  const [insightAt, setInsightAt]           = useState(null);
  const insightPrevRef                       = useRef(null);

  const runInsight = useCallback(async (sym, price, change, scores) => {
    if (!sym || price <= 0) return;
    setInsightLoading(true);
    setInsightSymbol(sym);
    const priceFmt = price.toFixed(2);
    const chgFmt   = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
    const score    = Number(scores?.composite || 50);
    const prompt   = `Give me a 2-3 sentence technical snapshot of ${sym} at $${priceFmt} (${chgFmt}). Composite score: ${score}/100. Include: current trend status, the single most critical price level right now, and a specific near-term target or support. Be direct and specific. No filler. End with one action bias word: BULLISH / BEARISH / NEUTRAL.`;
    try {
      const res  = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const data = await res.json();
      if (res.ok && data.output) {
        setInsightText(data.output.trim());
      } else {
        throw new Error("no output");
      }
    } catch {
      // Heuristic fallback when AI not configured
      const dir  = change > 1.5 ? "bullish momentum" : change < -1.5 ? "bearish pressure" : "range consolidation";
      const bias = score >= 72 ? "BULLISH" : score <= 38 ? "BEARISH" : "NEUTRAL";
      const tgt  = (price * (change >= 0 ? 1.028 : 0.972)).toFixed(2);
      const sup  = (price * 0.968).toFixed(2);
      setInsightText(`${sym} in ${dir}, score ${score}/100. Key level: $${sup} support. Near-term target: $${tgt}. ${bias}`);
    } finally {
      setInsightAt(new Date().toLocaleTimeString());
      setInsightLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      if (drag === "left") setLeftW((w) => Math.max(170, Math.min(360, w + (e.movementX || 0))));
      if (drag === "right") setRightW((w) => Math.max(260, Math.min(520, w - (e.movementX || 0))));
    };
    const onUp = () => setDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag]);

  // Auto-run AI Insight whenever the selected symbol changes
  useEffect(() => {
    if (!selected || selected.symbol === insightPrevRef.current) return;
    insightPrevRef.current = selected.symbol;
    const price = Number(selected.price || 0);
    const change = Number(selected.changesPercentage || 0);
    if (price > 0) runInsight(selected.symbol, price, change, computeScores(selected));
  }, [selected?.symbol]); // eslint-disable-line

  if (!selected) return null;
  const chg = selected.changesPercentage || 0;
  const scores = computeScores(selected);
  const rvol = selected.avgVolume ? (selected.volume / selected.avgVolume) : 0;
  const leaderTape = macroData.filter((q) => ["SPY", "QQQ", "IWM", "DIA", "UUP", "USO", "GLD", "TLT", "BTCUSD"].includes(q.symbol));
  const topNews = newsData.filter((n) => !selected?.symbol || n.ticker === selected.symbol).slice(0, 6);
  const terminalAlertMap = useMemo(() => {
    const m = new Map();
    (alerts || []).forEach((a) => {
      const prev = Number(m.get(a.symbol) || 0);
      m.set(a.symbol, Math.max(prev, Number(a.score || 0)));
    });
    return m;
  }, [alerts]);
  const terminalRankRows = useMemo(() => {
    const spy = Number(macroData.find((q) => q.symbol === "SPY")?.changesPercentage || 0);
    return [...(watchlistData || [])]
      .map((q) => {
        const s = computeScores(q);
        const rel = Number(q.changesPercentage || 0) - spy;
        const r = q.avgVolume ? (q.volume / q.avgVolume) : 0;
        const alertBoost = Number(terminalAlertMap.get(q.symbol) || 0) * 0.2;
        const rankScore = s.composite * 0.55 + s.tech * 0.25 + Math.max(-5, Math.min(5, rel)) * 3 + Math.max(0, Math.min(3, r - 1)) * 10 + alertBoost;
        return { ...q, s, rel, r, rankScore };
      })
      .sort((a, b) => b.rankScore - a.rankScore);
  }, [watchlistData, macroData, terminalAlertMap]);
  const executionRows = useMemo(() => {
    return terminalRankRows.slice(0, 6).map((q) => {
      const entry = Number(q.price || 0);
      const stop = entry > 0 ? entry * 0.97 : 0;
      const target = entry > 0 ? entry * 1.06 : 0;
      const rr = entry > stop ? (target - entry) / Math.max(0.01, entry - stop) : 0;
      const status = rr >= 1.8 && q.r >= 1.2 ? "TRIGGERED" : rr >= 1.3 ? "STALK" : "WAIT";
      return { symbol: q.symbol, entry, stop, target, rr, status, score: q.s.composite, rvol: q.r };
    });
  }, [terminalRankRows]);
  const terminalMacroMatrix = useMemo(() => {
    const getQ = (symbol) => macroData.find((m) => m.symbol === symbol) || null;
    const safeNum = (v) => Number(v || 0);
    const gld = getQ("GLD");
    const brent = getQ("BNO") || getQ("USO");
    const y2 = getQ("SHY");
    const y10 = getQ("IEF") || getQ("TLT");
    const usd = getQ("UUP");
    const spy = getQ("SPY");
    const qqq = getQ("QQQ");
    const btc = getQ("BTCUSD");
    const eth = getQ("ETHUSD");

    const stockMove = (safeNum(spy?.changesPercentage) + safeNum(qqq?.changesPercentage)) / 2;
    const cryptoMove = (safeNum(btc?.changesPercentage) + safeNum(eth?.changesPercentage)) / 2;
    const usdMove = safeNum(usd?.changesPercentage);
    const goldMove = safeNum(gld?.changesPercentage);
    const brentMove = safeNum(brent?.changesPercentage);
    const y2Move = safeNum(y2?.changesPercentage);
    const y10Move = safeNum(y10?.changesPercentage);
    const curveProxy = y10Move - y2Move;

    const rel = [];
    rel.push(`Dollar vs Stocks: ${usdMove >= 0 && stockMove <= 0 ? "Inverse (risk-off pressure)" : usdMove <= 0 && stockMove >= 0 ? "Supportive (risk-on)" : "Mixed"}`);
    rel.push(`Dollar vs Crypto: ${usdMove >= 0 && cryptoMove <= 0 ? "Inverse (crypto headwind)" : usdMove <= 0 && cryptoMove >= 0 ? "Supportive (crypto tailwind)" : "Mixed"}`);
    rel.push(`Gold vs Dollar: ${goldMove >= 0 && usdMove <= 0 ? "Classic hedge bid" : goldMove <= 0 && usdMove >= 0 ? "Dollar pressure on metals" : "Mixed"}`);
    rel.push(`Brent vs Equities: ${brentMove > 0.8 && stockMove < 0 ? "Inflation stress signal" : brentMove < 0 && stockMove > 0 ? "Cost relief for risk assets" : "Neutral"}`);
    rel.push(`2Y/10Y Proxy: ${curveProxy > 0 ? "Long-end outperforming short-end" : curveProxy < 0 ? "Front-end pressure > long-end" : "Flat"}`);

    return {
      rows: [
        { key: "Gold", symbol: gld?.symbol || "GLD", price: safeNum(gld?.price), chg: goldMove },
        { key: "Brent", symbol: brent?.symbol || "BNO", price: safeNum(brent?.price), chg: brentMove },
        { key: "2Y", symbol: y2?.symbol || "SHY", price: safeNum(y2?.price), chg: y2Move },
        { key: "10Y", symbol: y10?.symbol || "IEF", price: safeNum(y10?.price), chg: y10Move },
        { key: "Dollar", symbol: usd?.symbol || "UUP", price: safeNum(usd?.price), chg: usdMove },
        { key: "BTC", symbol: btc?.symbol || "BTCUSD", price: safeNum(btc?.price), chg: safeNum(btc?.changesPercentage) },
      ],
      rel,
      stockMove,
      cryptoMove,
      curveProxy,
    };
  }, [macroData]);
  const institutionalRadar = useMemo(() => {
    const advancers = terminalRankRows.filter((x) => Number(x.changesPercentage || 0) > 0).length;
    const total = terminalRankRows.length || 0;
    const breadthPct = total ? (advancers / total) * 100 : 0;
    const vix = Number(macroData.find((m) => m.symbol === "VIXY")?.changesPercentage || 0);
    const usd = Number(macroData.find((m) => m.symbol === "UUP")?.changesPercentage || 0);
    const oil = Number(macroData.find((m) => m.symbol === "USO")?.changesPercentage || 0);
    const macroPressureScore = vix * 0.5 + usd * 0.3 + Math.max(0, oil) * 0.2;
    const macroPressureLabel = macroPressureScore > 1.5 ? "HIGH" : macroPressureScore > 0.4 ? "ELEVATED" : "LOW";
    const focus = executionRows[0] || null;
    const focusStatus = String(focus?.status || "WATCH").toUpperCase();
    const focusTone = focusStatus === "TRIGGERED" ? "green" : focusStatus === "STALK" ? "amber" : "red";
    return { advancers, total, breadthPct, macroPressureScore, macroPressureLabel, focus: focus?.symbol || selected?.symbol || "N/A", focusStatus, focusTone };
  }, [terminalRankRows, macroData, executionRows, selected]);
  const riskSnapshot = useMemo(() => {
    const riskAlerts = (alerts || []).filter((a) => a.type === "risk").length;
    const avgRR = executionRows.length ? executionRows.reduce((sum, r) => sum + r.rr, 0) / executionRows.length : 0;
    const topSectors = {};
    executionRows.forEach((r) => {
      const sec = STOCK_TO_SECTOR[r.symbol] || "OTHER";
      topSectors[sec] = (topSectors[sec] || 0) + 1;
    });
    const concentration = Object.values(topSectors).length ? Math.max(...Object.values(topSectors)) : 0;
    const mode = riskAlerts >= 3 || concentration >= 4 ? "DEFENSIVE" : avgRR >= 1.6 ? "AGGRESSIVE" : "BALANCED";
    return { riskAlerts, avgRR, concentration, mode };
  }, [alerts, executionRows]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: `${showLeft ? `${leftW}px` : "0px"} ${showLeft ? "6px" : "0px"} 1fr ${showRight ? "6px" : "0px"} ${showRight ? `${rightW}px` : "0px"}`, gap: 0, minHeight: "calc(100vh - 164px)" }}>
      {showLeft && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column", marginRight: 4 }}>
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", display: "flex", justifyContent: "space-between" }}>
            WATCHLIST GRID
            <button onClick={() => setShowLeft(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.textDim, fontFamily: MONO, fontSize: 10 }}>HIDE</button>
          </div>
          <div style={{ overflowY: "auto" }}>
            {watchlistData.slice(0, 20).map((q) => {
              const up = (q.changesPercentage || 0) >= 0;
              const active = q.symbol === selected.symbol;
              const isPreMarket = marketSession === "PREMARKET";
              const isPostMarket = marketSession === "AFTERMARKET";
              const extChg = isPreMarket
                ? Number(q.preMarketChangePercent || 0)
                : isPostMarket ? Number(q.postMarketChangePercent || 0) : null;
              const extColor = isPreMarket ? C.accent : C.amber;
              return (
                <div key={q.symbol} style={{ width: "100%", borderBottom: `1px solid ${C.border}`, background: active ? C.cardHover : "transparent", display: "flex", alignItems: "stretch" }}>
                  <div onClick={() => onSelectSymbol(q.symbol)} style={{ flex: 1, cursor: "pointer", padding: "9px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{q.symbol}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: up ? C.green : C.red }}>{up ? "+" : ""}{(q.changesPercentage || 0).toFixed(2)}%</span>
                    </div>
                    <div style={{ marginTop: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>${q.price?.toFixed(2)}</span>
                      {extChg !== null && extChg !== 0 && (
                        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: extColor, background: `${extColor}18`, borderRadius: 3, padding: "1px 4px" }}>
                          {isPreMarket ? "PRE" : "POST"} {extChg >= 0 ? "+" : ""}{extChg.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {onQuickLog && (
                    <button
                      onClick={() => onQuickLog({ symbol: q.symbol, price: q.price || 0, entry: (q.price || 0).toFixed(2), stopLoss: "", target: "", size: "", side: "BUY", timeframe: "1D", style: "Breakout", notes: `WL entry · CHG ${up ? "+" : ""}${(q.changesPercentage || 0).toFixed(2)}%`, score: 0, chg: q.changesPercentage || 0, rvol: 0 })}
                      title="Quick log to journal"
                      style={{ border: "none", borderLeft: `1px solid ${C.border}`, background: "transparent", color: C.textDim, fontFamily: MONO, fontSize: 9, cursor: "pointer", padding: "0 7px", flexShrink: 0 }}
                    >LOG</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {showLeft && <div onMouseDown={() => setDrag("left")} style={{ cursor: "col-resize", background: C.border, borderRadius: 6 }} />}

      <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 10, margin: "0 4px" }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800 }}>{selected.symbol}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>${selected.price?.toFixed(2)}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: chg >= 0 ? C.green : C.red }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {!showLeft && <button onClick={() => setShowLeft(true)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textDim, fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}>SHOW WL</button>}
              {!showRight && <button onClick={() => setShowRight(true)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textDim, fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}>SHOW INTEL</button>}
              {["1", "2", "4"].map((l) => (
                <button key={`layout-${l}`} onClick={() => onLayoutChange(l)} style={{ border: `1px solid ${terminalLayout === l ? C.accent : C.border}`, background: terminalLayout === l ? `${C.accent}12` : C.surface, color: terminalLayout === l ? C.accent : C.textDim, fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}>
                  {l}x
                </button>
              ))}
              <select value={hotkeyProfile} onChange={(e) => onHotkeyProfileChange(e.target.value)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textDim, fontFamily: MONO, fontSize: 10, padding: "4px 6px", borderRadius: 4 }}>
                <option value="classic">HK Classic</option>
                <option value="scalper">HK Scalper</option>
              </select>
              {["5M", "15M", "1H", "1D", "1W"].map((tf) => (
                <button key={tf} onClick={() => onTimeframeChange(tf)} style={{ border: `1px solid ${timeframe === tf && chartMode === "canvas" ? C.accent : C.border}`, background: timeframe === tf && chartMode === "canvas" ? `${C.accent}12` : C.surface, color: timeframe === tf && chartMode === "canvas" ? C.accent : C.textDim, fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}>
                  {tf}
                </button>
              ))}
              {/* Chart source toggle */}
              <div style={{ display: "flex", gap: 2, marginLeft: 4, borderLeft: `1px solid ${C.border}`, paddingLeft: 6 }}>
                <button onClick={() => setChartMode("canvas")} style={{ border: `1px solid ${chartMode === "canvas" ? C.accent : C.border}`, background: chartMode === "canvas" ? `${C.accent}18` : C.surface, color: chartMode === "canvas" ? C.accent : C.textDim, fontFamily: MONO, fontSize: 9, padding: "4px 7px", borderRadius: 4, cursor: "pointer", fontWeight: chartMode === "canvas" ? 800 : 400 }}>
                  CHART
                </button>
                <button onClick={() => setChartMode("finviz")} style={{ border: `1px solid ${chartMode === "finviz" ? C.purple : C.border}`, background: chartMode === "finviz" ? `${C.purple}18` : C.surface, color: chartMode === "finviz" ? C.purple : C.textDim, fontFamily: MONO, fontSize: 9, padding: "4px 7px", borderRadius: 4, cursor: "pointer", fontWeight: chartMode === "finviz" ? 800 : 400 }}>
                  FV
                </button>
              </div>
              {chartMode === "finviz" && (
                <div style={{ display: "flex", gap: 2 }}>
                  {[["d","D"],["w","W"],["m","M"]].map(([val, lbl]) => (
                    <button key={val} onClick={() => setFvPeriod(val)} style={{ border: `1px solid ${fvPeriod === val ? C.purple : C.border}`, background: fvPeriod === val ? `${C.purple}18` : C.surface, color: fvPeriod === val ? C.purple : C.textDim, fontFamily: MONO, fontSize: 9, padding: "4px 6px", borderRadius: 4, cursor: "pointer" }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => { setAlertFormOpen(v => !v); setAlertTarget(selected.price ? selected.price.toFixed(2) : ""); }} style={{ border: `1px solid ${alertFormOpen ? C.amber : C.border}`, background: alertFormOpen ? `${C.amber}14` : C.surface, color: alertFormOpen ? C.amber : C.textDim, fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}>
                + ALERT
              </button>
            </div>
          </div>
          {alertFormOpen && (
            <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, background: `${C.amber}08`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>{selected.symbol}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Price alert</span>
              <select value={alertDir} onChange={e => setAlertDir(e.target.value)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: MONO, fontSize: 11, padding: "5px 8px" }}>
                <option value="above">ABOVE</option>
                <option value="below">BELOW</option>
              </select>
              <input type="number" step="0.01" value={alertTarget} onChange={e => setAlertTarget(e.target.value)} placeholder="Target price" style={{ width: 110, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: MONO, fontSize: 11, padding: "5px 8px" }} />
              <button disabled={alertSaving} onClick={async () => {
                if (!alertTarget || Number(alertTarget) <= 0) return;
                setAlertSaving(true);
                try {
                  await fetch("/api/price-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: selected.symbol, targetPrice: Number(alertTarget), direction: alertDir }) });
                  setAlertFormOpen(false);
                  setAlertTarget("");
                } finally { setAlertSaving(false); }
              }} style={{ border: `1px solid ${C.amber}55`, background: `${C.amber}18`, color: C.amber, borderRadius: 4, padding: "5px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer", fontWeight: 700 }}>
                {alertSaving ? "SAVING…" : "SET ALERT"}
              </button>
              <button onClick={() => setAlertFormOpen(false)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "5px 8px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>✕</button>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ height: 340, flexShrink: 0, borderBottom: `1px solid ${C.border}`, position: "relative" }}>
            {chartMode === "finviz" ? (
              <div style={{ width: "100%", height: "100%", background: "#111418", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <img
                  key={`fv-${selected.symbol}-${fvPeriod}`}
                  src={`/api/finviz/chart?symbol=${encodeURIComponent(selected.symbol)}&period=${fvPeriod}`}
                  alt={`${selected.symbol} Finviz chart`}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextElementSibling.style.display = "flex"; }}
                />
                <div style={{ display: "none", position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "#888" }}>Finviz chart unavailable</span>
                  <button onClick={() => setChartMode("canvas")} style={{ border: "1px solid #444", background: "#222", color: "#aaa", fontFamily: MONO, fontSize: 10, padding: "4px 10px", borderRadius: 4, cursor: "pointer" }}>Switch to Canvas</button>
                </div>
              </div>
            ) : (
              <CanvasChart candleData={candleData} drawTools={drawTools} loading={loadingCandles} />
            )}
          </div>
          {chartMode === "finviz" && (
            <div style={{ flexShrink: 0, borderBottom: `1px solid ${C.border}`, background: C.surface, padding: "8px 12px" }}>
              {fvLoading ? (
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Loading Finviz stats…</span>
              ) : fvStats ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                  {[
                    ["RSI(14)",  fvStats.rsi14   != null ? fvStats.rsi14.toFixed(1)                             : "—"],
                    ["ATR",      fvStats.atr      != null ? fvStats.atr.toFixed(2)                              : "—"],
                    ["Beta",     fvStats.beta     != null ? fvStats.beta.toFixed(2)                             : "—"],
                    ["SMA20",    fvStats.sma20    != null ? `${fvStats.sma20 >= 0 ? "+" : ""}${fvStats.sma20.toFixed(2)}%` : "—"],
                    ["SMA50",    fvStats.sma50    != null ? `${fvStats.sma50 >= 0 ? "+" : ""}${fvStats.sma50.toFixed(2)}%` : "—"],
                    ["SMA200",   fvStats.sma200   != null ? `${fvStats.sma200 >= 0 ? "+" : ""}${fvStats.sma200.toFixed(2)}%` : "—"],
                    ["Short%",   fvStats.shortFloat != null ? `${fvStats.shortFloat.toFixed(1)}%`               : "—"],
                    ["Target",   fvStats.targetPrice != null ? `$${fvStats.targetPrice.toFixed(2)}`             : "—"],
                    ["Recom",    fvStats.recom    || "—"],
                    ["Earnings", fvStats.earnings || "—"],
                    ["P/E",      fvStats.pe       != null ? fvStats.pe.toFixed(1)                               : "—"],
                    ["EPS",      fvStats.eps      != null ? fvStats.eps.toFixed(2)                              : "—"],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.text }}>{val}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>No Finviz data</span>
              )}
            </div>
          )}
          <div style={{ overflow: "auto" }}>
          <div style={{ padding: 10, background: "linear-gradient(180deg,#ffffff 0%,#f8fbff 100%)", display: "grid", gap: 10, gridTemplateColumns: "1.15fr 1fr" }}>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
              <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em" }}>INSTITUTIONAL RANKING LADDER</span>
                <Badge color={C.accent}>LIVE</Badge>
              </div>
              <div style={{ overflowY: "auto", maxHeight: terminalLayout === "1" ? 400 : 220 }}>
                {terminalRankRows.slice(0, 16).map((q, idx) => (
                  <button
                    key={`rank-${q.symbol}`}
                    onClick={() => onSelectSymbol(q.symbol)}
                    style={{ width: "100%", border: "none", borderBottom: `1px solid ${C.border}`, background: selected.symbol === q.symbol ? C.cardHover : C.surface, padding: "8px 10px", textAlign: "left", cursor: "pointer" }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "28px 56px 1fr 68px 64px 72px", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>#{idx + 1}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>{q.symbol}</span>
                      <span style={{ fontSize: 10, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: (q.changesPercentage || 0) >= 0 ? C.green : C.red }}>{(q.changesPercentage || 0) >= 0 ? "+" : ""}{(q.changesPercentage || 0).toFixed(2)}%</span>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: q.r >= 1.2 ? C.green : C.textDim }}>R {q.r.toFixed(2)}x</span>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent }}>S {q.s.composite}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, background: "#f9fbff", padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>
                  MACRO RELATION MATRIX
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  {terminalMacroMatrix.rows.map((m) => (
                    <div key={`mx-${m.key}`} style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, padding: "7px 8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.text }}>{m.key}</span>
                        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{m.symbol}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: C.text, fontWeight: 700 }}>
                          {m.price > 10000 ? m.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : m.price.toFixed(2)}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: m.chg >= 0 ? C.green : C.red }}>
                          {m.chg >= 0 ? "+" : ""}{m.chg.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, padding: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Stocks (SPY/QQQ)</div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: terminalMacroMatrix.stockMove >= 0 ? C.green : C.red, fontWeight: 700 }}>
                        {terminalMacroMatrix.stockMove >= 0 ? "+" : ""}{terminalMacroMatrix.stockMove.toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Crypto (BTC/ETH)</div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: terminalMacroMatrix.cryptoMove >= 0 ? C.green : C.red, fontWeight: 700 }}>
                        {terminalMacroMatrix.cryptoMove >= 0 ? "+" : ""}{terminalMacroMatrix.cryptoMove.toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Curve (10Y-2Y proxy)</div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: terminalMacroMatrix.curveProxy >= 0 ? C.green : C.red, fontWeight: 700 }}>
                        {terminalMacroMatrix.curveProxy >= 0 ? "+" : ""}{terminalMacroMatrix.curveProxy.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    {terminalMacroMatrix.rel.map((line, i) => (
                      <div key={`mrel-${i}`} style={{ fontSize: 10, color: C.textSec, lineHeight: 1.4 }}>{line}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gap: 10, gridTemplateRows: "1fr auto" }}>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
                <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em" }}>EXECUTION BLOTTER</span>
                  <Badge color={C.green}>A+ FILTER</Badge>
                </div>
                <div style={{ display: "grid", gridTemplateRows: "auto auto 1fr", minHeight: terminalLayout === "1" ? 390 : 180 }}>
                  <div>
                    {executionRows.map((r) => (
                      <div key={`ex-${r.symbol}`} style={{ borderBottom: `1px solid ${C.border}`, padding: "8px 10px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "54px 70px 70px 70px 52px 1fr auto", gap: 8, alignItems: "center" }}>
                          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>{r.symbol}</span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textSec }}>E ${r.entry.toFixed(2)}</span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.red }}>S ${r.stop.toFixed(2)}</span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.green }}>T ${r.target.toFixed(2)}</span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent }}>{r.rr.toFixed(2)}R</span>
                          <span style={{ justifySelf: "end" }}>
                            <Badge color={r.status === "TRIGGERED" ? C.green : r.status === "STALK" ? C.amber : C.textDim}>{r.status}</Badge>
                          </span>
                          <button onClick={async () => {
                            try {
                              await fetch("/api/journal", { method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ ticker: r.symbol, side: "BUY", score: r.score, entry: r.entry, stopLoss: r.stop, target: r.target, timeframe: "1D", style: "Terminal", notes: `Blotter ${r.status} · RR ${r.rr.toFixed(2)} · RVOL ${r.rvol.toFixed(2)}x` }) });
                            } catch {}
                          }} style={{ border: `1px solid ${C.green}55`, background: C.surface, color: C.green, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}>LOG</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "10px", background: "#fbfdff", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>
                      ACTION QUEUE
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 6 }}>NEXT NAMES</div>
                        {(executionRows.slice(0, 3)).map((r) => (
                          <div key={`aq-${r.symbol}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, padding: "3px 0" }}>
                            <button onClick={() => onSelectSymbol(r.symbol)} style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 11, color: C.accent, cursor: "pointer", padding: 0, fontWeight: 700 }}>{r.symbol}</button>
                            <span style={{ fontFamily: MONO, color: r.status === "TRIGGERED" ? C.green : r.status === "STALK" ? C.amber : C.textDim }}>
                              {r.status}
                            </span>
                          </div>
                        ))}
                        {!executionRows.length && <div style={{ fontSize: 11, color: C.textDim }}>No live setups yet.</div>}
                      </div>
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 6 }}>CATALYST CHECK</div>
                        {(topNews.length ? topNews : newsData.slice(0, 3)).slice(0, 3).map((n, i) => (
                          <div key={`aqn-${i}`} style={{ fontSize: 10, color: C.textSec, lineHeight: 1.35, padding: "3px 0", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontFamily: MONO, color: C.accent }}>{n.ticker || "MKT"}</span> {n.title}
                          </div>
                        ))}
                        {!newsData.length && <div style={{ fontSize: 11, color: C.textDim }}>No catalyst headlines loaded.</div>}
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: 10, background: "#f8fbff" }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>
                      MARKET PULSE
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <div onClick={() => { const s = terminalRankRows[0]?.symbol; if (s) onSelectSymbol(s); }} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface, cursor: "pointer" }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Top Gainer</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.green, fontWeight: 700 }}>{terminalRankRows[0]?.symbol || "N/A"}</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.green }}>{(terminalRankRows[0]?.changesPercentage || 0) >= 0 ? "+" : ""}{Number(terminalRankRows[0]?.changesPercentage || 0).toFixed(2)}%</div>
                      </div>
                      <div onClick={() => { const s = terminalRankRows[terminalRankRows.length - 1]?.symbol; if (s) onSelectSymbol(s); }} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface, cursor: "pointer" }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Weakest Name</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, fontWeight: 700 }}>{terminalRankRows[terminalRankRows.length - 1]?.symbol || "N/A"}</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.red }}>{(terminalRankRows[terminalRankRows.length - 1]?.changesPercentage || 0) >= 0 ? "+" : ""}{Number(terminalRankRows[terminalRankRows.length - 1]?.changesPercentage || 0).toFixed(2)}%</div>
                      </div>
                      <div onClick={() => { const s = [...terminalRankRows].sort((a, b) => (b.rel || 0) - (a.rel || 0))[0]?.symbol; if (s) onSelectSymbol(s); }} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface, cursor: "pointer" }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Best RS vs SPY</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700 }}>
                          {[...terminalRankRows].sort((a, b) => (b.rel || 0) - (a.rel || 0))[0]?.symbol || "N/A"}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent }}>
                          {(([...terminalRankRows].sort((a, b) => (b.rel || 0) - (a.rel || 0))[0]?.rel || 0) >= 0 ? "+" : "")}
                          {Number(([...terminalRankRows].sort((a, b) => (b.rel || 0) - (a.rel || 0))[0]?.rel || 0)).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, padding: 8 }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.08em", marginBottom: 6 }}>
                        INSTITUTIONAL RADAR
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div style={{ border: `1px solid ${institutionalRadar.breadthPct >= 60 ? `${C.green}66` : institutionalRadar.breadthPct >= 45 ? `${C.amber}66` : `${C.red}66`}`, borderRadius: 5, padding: 7, background: institutionalRadar.breadthPct >= 60 ? C.greenBg : institutionalRadar.breadthPct >= 45 ? C.amberBg : C.redBg }}>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Breadth</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>
                            {institutionalRadar.advancers}/{institutionalRadar.total}
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textSec }}>
                            {institutionalRadar.total ? `${Math.round(institutionalRadar.breadthPct)}% advancers` : "No data"}
                          </div>
                        </div>
                        <div style={{ border: `1px solid ${institutionalRadar.macroPressureLabel === "HIGH" ? `${C.red}66` : institutionalRadar.macroPressureLabel === "ELEVATED" ? `${C.amber}66` : `${C.green}66`}`, borderRadius: 5, padding: 7, background: institutionalRadar.macroPressureLabel === "HIGH" ? C.redBg : institutionalRadar.macroPressureLabel === "ELEVATED" ? C.amberBg : C.greenBg }}>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Macro Pressure</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>
                            <span style={{ color: institutionalRadar.macroPressureLabel === "HIGH" ? C.red : institutionalRadar.macroPressureLabel === "ELEVATED" ? C.amber : C.green }}>
                              {institutionalRadar.macroPressureLabel}
                            </span>
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textSec }}>VIX + USD + Oil</div>
                        </div>
                        <div style={{ border: `1px solid ${institutionalRadar.focusTone === "green" ? `${C.green}66` : institutionalRadar.focusTone === "amber" ? `${C.amber}66` : `${C.red}66`}`, borderRadius: 5, padding: 7, background: institutionalRadar.focusTone === "green" ? C.greenBg : institutionalRadar.focusTone === "amber" ? C.amberBg : C.redBg }}>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Session Focus</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.accent }}>
                            {institutionalRadar.focus}
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textSec }}>
                            {institutionalRadar.focusStatus}
                          </div>
                        </div>
                      </div>
                      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 4 }}>Signal Queue</div>
                        {(alerts || []).slice(0, 3).map((a, i) => (
                          <div key={`radar-sig-${i}`} style={{ display: "grid", gridTemplateColumns: "60px 1fr 52px", gap: 8, alignItems: "center", padding: "4px 6px", fontSize: 10, border: `1px solid ${Number(a.score || 0) >= 85 ? `${C.green}66` : Number(a.score || 0) >= 70 ? `${C.amber}66` : `${C.border}`}`, borderRadius: 4, marginBottom: 4, background: Number(a.score || 0) >= 85 ? C.greenBg : Number(a.score || 0) >= 70 ? C.amberBg : C.surface }}>
                            <span style={{ fontFamily: MONO, color: C.accent, fontWeight: 700 }}>{a.symbol || "MKT"}</span>
                            <span style={{ color: C.textSec, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.text || "Signal update"}</span>
                            <span style={{ fontFamily: MONO, color: Number(a.score || 0) >= 85 ? C.green : Number(a.score || 0) >= 70 ? C.amber : C.textDim, justifySelf: "end", fontWeight: 700 }}>S {Number(a.score || 0)}</span>
                          </div>
                        ))}
                        {!(alerts || []).length && (
                          <div style={{ fontSize: 10, color: C.textDim }}>No high-priority signals queued.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>RISK COMMAND PANEL</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Mode</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: riskSnapshot.mode === "DEFENSIVE" ? C.red : riskSnapshot.mode === "AGGRESSIVE" ? C.green : C.amber, fontWeight: 700 }}>{riskSnapshot.mode}</div>
                  </div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Risk Alerts</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: riskSnapshot.riskAlerts > 2 ? C.red : C.text }}>{riskSnapshot.riskAlerts}</div>
                  </div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Avg R:R</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: riskSnapshot.avgRR >= 1.5 ? C.green : C.amber }}>{riskSnapshot.avgRR.toFixed(2)}</div>
                  </div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Sector Concentration</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: riskSnapshot.concentration >= 4 ? C.red : C.text }}>{riskSnapshot.concentration}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 1, background: C.border }}>
            {[["Composite", scores.composite, C.accent], ["Technical", scores.tech, C.cyan], ["Fundamental", scores.fund, C.purple], ["Macro Fit", scores.macro, C.amber], ["RVOL", `${rvol.toFixed(2)}x`, rvol > 1.2 ? C.green : C.textDim]].map(([k, v, col]) => (
              <div key={k} style={{ background: C.surface, padding: "8px 10px" }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{k}</div>
                <div style={{ fontFamily: MONO, fontSize: 14, color: col, fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8, marginBottom: 10 }}>
            <input value={drawTools.trendStart} onChange={(e) => onDrawToolsChange((d) => ({ ...d, trendStart: e.target.value }))} placeholder="Trend start" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 10 }} />
            <input value={drawTools.trendEnd} onChange={(e) => onDrawToolsChange((d) => ({ ...d, trendEnd: e.target.value }))} placeholder="Trend end" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 10 }} />
            <input value={drawTools.fibLow} onChange={(e) => onDrawToolsChange((d) => ({ ...d, fibLow: e.target.value }))} placeholder="Fib low" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 10 }} />
            <input value={drawTools.fibHigh} onChange={(e) => onDrawToolsChange((d) => ({ ...d, fibHigh: e.target.value }))} placeholder="Fib high" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 10 }} />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>SECTOR ROTATION TAPE</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6 }}>
            {[...sectorData].sort((a, b) => (b.changesPercentage || 0) - (a.changesPercentage || 0)).slice(0, 8).map((s) => (
              <div key={s.symbol} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", background: C.surface }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.text }}>{s.symbol}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: (s.changesPercentage || 0) >= 0 ? C.green : C.red }}>{(s.changesPercentage || 0) >= 0 ? "+" : ""}{(s.changesPercentage || 0).toFixed(2)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showRight && <div onMouseDown={() => setDrag("right")} style={{ cursor: "col-resize", background: C.border, borderRadius: 6 }} />}
      {showRight && (
        <div style={{ display: "grid", gridTemplateRows: "auto auto auto auto auto 1fr", gap: 10, marginLeft: 4, overflowY: "auto" }}>

          {/* ── AI INSIGHT card ──────────────────────────────────────── */}
          <div style={{ background: C.card, border: `1px solid ${insightLoading ? C.accent + "66" : C.border}`, borderRadius: 8, overflow: "hidden", transition: "border-color 0.3s" }}>
            {/* Header */}
            <div style={{ padding: "8px 12px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 900, color: "#fff" }}>AI</span>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", flex: 1 }}>AI INSIGHT</span>
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.text }}>{insightSymbol || selected.symbol}</span>
              <button
                onClick={() => runInsight(selected.symbol, Number(selected.price || 0), Number(selected.changesPercentage || 0), scores)}
                disabled={insightLoading}
                style={{ border: `1px solid ${C.border}`, borderRadius: 3, background: "transparent", color: insightLoading ? C.textDim : C.accent, fontFamily: MONO, fontSize: 9, cursor: insightLoading ? "default" : "pointer", padding: "2px 7px", letterSpacing: "0.04em" }}
              >{insightLoading ? "…" : "↻"}</button>
            </div>
            {/* Body */}
            <div style={{ padding: "10px 12px", minHeight: 64 }}>
              {insightLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${C.accent}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Analyzing {selected.symbol}…</span>
                </div>
              ) : insightText ? (
                <>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: C.text, lineHeight: 1.6, marginBottom: 6 }}>
                    {insightText}
                  </div>
                  {insightAt && (
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Updated {insightAt}</div>
                  )}
                </>
              ) : (
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Select a symbol to generate insight.</div>
              )}
            </div>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>MACRO / REGIME</span>
              <button onClick={() => setShowRight(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.textDim, fontFamily: MONO, fontSize: 10 }}>HIDE</button>
            </div>
            {leaderTape.slice(0, 6).map((q) => (
              <div key={q.symbol} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.text }}>{q.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: (q.changesPercentage || 0) >= 0 ? C.green : C.red }}>{(q.changesPercentage || 0) >= 0 ? "+" : ""}{(q.changesPercentage || 0).toFixed(2)}%</span>
              </div>
            ))}
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>
              FUNDAMENTALS — {selected.symbol}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: C.textDim }}>Market Cap</span><span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{formatNum(fundamentals?.marketCap || selected.marketCap || 0)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: C.textDim }}>P/E</span><span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{Number.isFinite(Number(fundamentals?.pe)) ? Number(fundamentals.pe).toFixed(2) : "—"}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: C.textDim }}>EPS</span><span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{Number.isFinite(Number(fundamentals?.eps)) ? Number(fundamentals.eps).toFixed(2) : "—"}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: C.textDim }}>Shares Out</span><span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{fundamentals?.sharesOutstanding ? `${(Number(fundamentals.sharesOutstanding) / 1e9).toFixed(2)}B` : "—"}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: C.textDim }}>Earnings</span><span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{fundamentals?.earningsDate ? new Date(fundamentals.earningsDate).toLocaleDateString() : "TBD"}</span></div>
            </div>
          </div>
          {/* ── ORDER ENTRY PANEL ── */}
          {(() => {
            const price = Number(selected?.price || 0);
            const spread = Math.max(0.01, price * 0.0003);
            const bid = price > 0 ? (price - spread / 2).toFixed(2) : "—";
            const ask = price > 0 ? (price + spread / 2).toFixed(2) : "—";
            const entryPrice = orderType === "market" ? price : (Number(orderPrice) || price);
            const tpNum = Number(orderTp) || 0;
            const slNum = Number(orderSl) || 0;
            const rr = tpNum > 0 && slNum > 0 && entryPrice > 0 && orderSide === "buy"
              ? ((tpNum - entryPrice) / Math.max(0.01, entryPrice - slNum)).toFixed(2)
              : tpNum > 0 && slNum > 0 && entryPrice > 0 && orderSide === "sell"
              ? ((entryPrice - tpNum) / Math.max(0.01, slNum - entryPrice)).toFixed(2)
              : null;
            const posValue = (Number(orderQty) || 0) * entryPrice;
            const riskAmt = slNum > 0 && entryPrice > 0 && Number(orderQty) > 0
              ? Math.abs(entryPrice - slNum) * Number(orderQty)
              : 0;

            // Simulated order book — 5 levels each side
            const levels = Array.from({ length: 5 }, (_, i) => {
              const bidPx = price > 0 ? (price - spread / 2 - i * spread * 1.2).toFixed(2) : 0;
              const askPx = price > 0 ? (price + spread / 2 + i * spread * 1.2).toFixed(2) : 0;
              const bidSz = Math.floor(200 + Math.random() * 800 + (4 - i) * 200);
              const askSz = Math.floor(200 + Math.random() * 800 + (4 - i) * 200);
              return { bidPx, askPx, bidSz, askSz };
            });
            const maxSz = Math.max(...levels.map(l => Math.max(l.bidSz, l.askSz)));

            const handlePlaceOrder = async () => {
              if (!Number(orderQty) || Number(orderQty) <= 0) return;
              setOrderSubmitting(true);
              try {
                const notes = [
                  `${orderType.toUpperCase()} order`,
                  orderType !== "market" && orderPrice ? `@ $${orderPrice}` : `@ market $${price.toFixed(2)}`,
                  orderTrailPct && orderType === "trailing" ? `trail ${orderTrailPct}%` : "",
                  rr ? `R:R ${rr}` : "",
                ].filter(Boolean).join(" · ");
                await fetch("/api/journal", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ticker: selected.symbol,
                    side: orderSide === "buy" ? "BUY" : "SELL",
                    entry: entryPrice,
                    stopLoss: slNum || undefined,
                    target: tpNum || undefined,
                    size: Number(orderQty),
                    timeframe: "1D",
                    style: "Order Entry",
                    score: scores.composite,
                    notes,
                  }),
                });
                setOrderConfirmed({ side: orderSide, qty: orderQty, price: entryPrice.toFixed(2), symbol: selected.symbol });
                setTimeout(() => setOrderConfirmed(null), 4000);
              } finally {
                setOrderSubmitting(false);
              }
            };

            return (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                {/* Header */}
                <div style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: C.surface }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em" }}>ORDER ENTRY</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.text }}>{selected.symbol}</span>
                </div>

                {/* Bid/Ask strip */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ padding: "8px 12px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 2 }}>BID</div>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.green }}>{bid}</div>
                  </div>
                  <div style={{ background: C.border }} />
                  <div style={{ padding: "8px 12px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 2 }}>ASK</div>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.red }}>{ask}</div>
                  </div>
                </div>

                {/* Order book depth */}
                <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.08em", marginBottom: 6 }}>ORDER BOOK DEPTH</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto 1fr", gap: "2px 6px", alignItems: "center" }}>
                    {levels.map((l, i) => (
                      <React.Fragment key={`ob-${i}`}>
                        {/* Bid bar */}
                        <div style={{ position: "relative", height: 14, background: `${C.green}18`, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${(l.bidSz / maxSz) * 100}%`, background: `${C.green}44`, borderRadius: 2 }} />
                          <span style={{ position: "absolute", right: 4, top: 0, bottom: 0, display: "flex", alignItems: "center", fontFamily: MONO, fontSize: 9, color: C.green }}>{l.bidSz}</span>
                        </div>
                        {/* Bid price */}
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.green, textAlign: "right", whiteSpace: "nowrap" }}>${l.bidPx}</div>
                        {/* Ask price */}
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.red, textAlign: "left", whiteSpace: "nowrap" }}>${l.askPx}</div>
                        {/* Ask bar */}
                        <div style={{ position: "relative", height: 14, background: `${C.red}18`, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(l.askSz / maxSz) * 100}%`, background: `${C.red}44`, borderRadius: 2 }} />
                          <span style={{ position: "absolute", left: 4, top: 0, bottom: 0, display: "flex", alignItems: "center", fontFamily: MONO, fontSize: 9, color: C.red }}>{l.askSz}</span>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <div style={{ padding: "10px 12px" }}>
                  {/* Order type tabs */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 3, marginBottom: 10 }}>
                    {[["market", "Market"], ["limit", "Limit"], ["stop", "Stop"], ["trailing", "Trail"]].map(([v, lbl]) => (
                      <button key={v} onClick={() => setOrderType(v)} style={{ padding: "5px 0", border: `1px solid ${orderType === v ? C.accent : C.border}`, borderRadius: 4, background: orderType === v ? `${C.accent}18` : C.surface, color: orderType === v ? C.accent : C.textDim, fontFamily: MONO, fontSize: 9, cursor: "pointer", fontWeight: orderType === v ? 800 : 400, letterSpacing: "0.04em" }}>
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {/* BUY / SELL */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                    <button onClick={() => setOrderSide("buy")} style={{ padding: "9px 0", border: `2px solid ${orderSide === "buy" ? C.green : C.border}`, borderRadius: 5, background: orderSide === "buy" ? `${C.green}22` : C.surface, color: orderSide === "buy" ? C.green : C.textDim, fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: "0.06em" }}>
                      BUY
                    </button>
                    <button onClick={() => setOrderSide("sell")} style={{ padding: "9px 0", border: `2px solid ${orderSide === "sell" ? C.red : C.border}`, borderRadius: 5, background: orderSide === "sell" ? `${C.red}22` : C.surface, color: orderSide === "sell" ? C.red : C.textDim, fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: "0.06em" }}>
                      SELL
                    </button>
                  </div>

                  {/* Quantity */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 4 }}>QUANTITY (SHARES)</div>
                    <input type="number" min="1" step="1" value={orderQty} onChange={e => setOrderQty(e.target.value)}
                      style={{ width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 10px", borderRadius: 4 }} />
                  </div>

                  {/* Limit/Stop price */}
                  {(orderType === "limit" || orderType === "stop") && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 4 }}>{orderType === "limit" ? "LIMIT PRICE" : "STOP TRIGGER"}</div>
                      <input type="number" step="0.01" value={orderPrice} onChange={e => setOrderPrice(e.target.value)} placeholder={price.toFixed(2)}
                        style={{ width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 10px", borderRadius: 4 }} />
                    </div>
                  )}

                  {/* Trailing % */}
                  {orderType === "trailing" && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 4 }}>TRAIL DISTANCE (%)</div>
                      <input type="number" step="0.1" min="0.1" value={orderTrailPct} onChange={e => setOrderTrailPct(e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 10px", borderRadius: 4 }} />
                    </div>
                  )}

                  {/* TP / SL row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.green, marginBottom: 4 }}>TAKE PROFIT</div>
                      <input type="number" step="0.01" value={orderTp} onChange={e => setOrderTp(e.target.value)} placeholder="Price"
                        style={{ width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.green}44`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "6px 8px", borderRadius: 4 }} />
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.red, marginBottom: 4 }}>STOP LOSS</div>
                      <input type="number" step="0.01" value={orderSl} onChange={e => setOrderSl(e.target.value)} placeholder="Price"
                        style={{ width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.red}44`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "6px 8px", borderRadius: 4 }} />
                    </div>
                  </div>

                  {/* Position summary */}
                  {(posValue > 0 || rr) && (
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: "7px 10px", marginBottom: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>VALUE</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.text, fontWeight: 700 }}>${posValue > 0 ? posValue.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>RISK $</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: riskAmt > 0 ? C.red : C.textDim, fontWeight: 700 }}>{riskAmt > 0 ? `$${riskAmt.toFixed(0)}` : "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>R:R</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: rr && Number(rr) >= 2 ? C.green : rr && Number(rr) >= 1 ? C.amber : C.red, fontWeight: 700 }}>{rr ? `${rr}R` : "—"}</div>
                      </div>
                    </div>
                  )}

                  {/* Confirmed banner */}
                  {orderConfirmed && (
                    <div style={{ background: `${C.green}18`, border: `1px solid ${C.green}55`, borderRadius: 4, padding: "7px 10px", marginBottom: 8, fontFamily: MONO, fontSize: 10, color: C.green, textAlign: "center" }}>
                      ✓ {orderConfirmed.side.toUpperCase()} {orderConfirmed.qty}×{orderConfirmed.symbol} @ ${orderConfirmed.price} — Logged to Journal
                    </div>
                  )}

                  {/* Place Order button */}
                  <button onClick={handlePlaceOrder} disabled={orderSubmitting || !Number(orderQty)}
                    style={{ width: "100%", padding: "10px 0", border: "none", borderRadius: 5, background: orderSide === "buy" ? C.green : C.red, color: "#fff", fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: orderSubmitting || !Number(orderQty) ? "default" : "pointer", opacity: orderSubmitting || !Number(orderQty) ? 0.5 : 1, letterSpacing: "0.06em" }}>
                    {orderSubmitting ? "PLACING…" : `PLACE ${orderSide.toUpperCase()} ORDER`}
                  </button>
                </div>
              </div>
            );
          })()}

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>ALERT PRIORITY</div>
            {alerts.slice(0, 4).map((a, i) => (
              <div key={`${a.symbol}-${i}`} style={{ padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700 }}>{a.symbol}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: a.type === "risk" ? C.red : C.green }}>{a.score}</span>
                </div>
                <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.35 }}>{a.text}</div>
              </div>
            ))}
            {alerts.length === 0 && <div style={{ fontSize: 11, color: C.textDim }}>No active alerts.</div>}
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, overflowY: "auto" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>NEWS INTELLIGENCE</div>
            {(topNews.length ? topNews : newsData.slice(0, 6)).map((n, i) => (
              <a key={`${n.ticker}-${i}`} href={n.link} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.accent, marginBottom: 3 }}>{n.ticker} · {n.publisher}</div>
                <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.35 }}>{n.title}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DeepDive({ stock, fundamentals, onClose, onExit, onOpenTradingView }) {
  if (!stock) return null;
  const chg = stock.changesPercentage || 0;
  const isUp = chg >= 0;
  const scores = computeScores(stock);
  const trend = classifyTrend(stock);
  const sma50 = Number(stock.priceAvg50 || 0);
  const sma200 = Number(stock.priceAvg200 || 0);
  const yearHigh = Number(stock.yearHigh || 0);
  const yearLow = Number(stock.yearLow || 0);
  const yearRange = yearHigh > yearLow ? yearHigh - yearLow : 0;
  const yearPos = yearRange > 0 ? ((stock.price - yearLow) / yearRange) * 100 : 50;
  const atrProxyPct = stock.price ? (((stock.dayHigh || stock.price) - (stock.dayLow || stock.price)) / stock.price) * 100 : 0;
  const trendState = stock.price > sma50 && sma50 > sma200 ? "Primary Uptrend" : stock.price < sma50 && sma50 < sma200 ? "Primary Downtrend" : "Transition / Range";
  const structureState = yearPos >= 75 ? "Near highs (breakout zone)" : yearPos <= 30 ? "Near lows (repair zone)" : "Mid-range (rotation zone)";
  const valuationState = stock.pe > 0 ? (stock.pe < 25 ? "Reasonable" : stock.pe < 45 ? "Rich" : "Extended") : "Unavailable";
  const qualityState = scores.fund >= 68 ? "High Quality" : scores.fund >= 52 ? "Average Quality" : "Lower Quality";
  const macroFit = scores.macro >= 65 ? "Aligned" : scores.macro >= 50 ? "Neutral" : "Misaligned";
  const rvol = stock.volume && stock.avgVolume ? (stock.volume / stock.avgVolume).toFixed(2) : "—";
  const entry = sma50 > 0 ? ((stock.price + sma50) / 2) : stock.price;
  const stop = entry * (trendState === "Primary Uptrend" ? 0.965 : 0.95);
  const target1 = entry * 1.05;
  const target2 = entry * 1.1;
  const rr = (target1 - entry) / Math.max(0.01, entry - stop);
  const setup = trendState === "Primary Uptrend" && rr >= 1.5 && Number(rvol || 0) >= 1.1 ? "BUY / STALK" : rr >= 1.2 ? "WAIT / CONFIRM" : "AVOID / REDUCE";
  const riskBudget = 750;
  const riskPerShare = Math.max(0.01, entry - stop);
  const sizeShares = Math.floor(riskBudget / riskPerShare);
  const positionValue = sizeShares * entry;
  const bullProb = Math.max(15, Math.min(80, Math.round((scores.tech * 0.5 + scores.fund * 0.3 + scores.macro * 0.2))));
  const baseProb = Math.max(10, Math.min(60, Math.round(100 - Math.abs(chg) * 6 - Math.abs(50 - yearPos) * 0.3)));
  const bearProb = Math.max(10, 100 - bullProb - baseProb);
  const catalystNote = stock.volume > (stock.avgVolume || 0) ? "Volume sponsorship active" : "Needs stronger participation";
  const riskNote = stock.price < sma50 ? "Below 50D trend support" : "Trend intact while above 50D";
  const resolvedMarketCap = Number(fundamentals?.marketCap || stock.marketCap || 0);
  const resolvedPe = Number.isFinite(Number(fundamentals?.pe)) && Number(fundamentals?.pe) > 0 ? Number(fundamentals?.pe) : Number(stock.pe || 0);
  const resolvedEps = Number.isFinite(Number(fundamentals?.eps)) && Number(fundamentals?.eps) > 0 ? Number(fundamentals?.eps) : Number(stock.eps || 0);
  const fallbackEps = resolvedPe > 0 && stock.price > 0 ? (stock.price / resolvedPe) : (stock.price > 0 ? stock.price / 28 : 0);
  const modeledEps = resolvedEps > 0 ? resolvedEps : fallbackEps;
  const growthAnchor = Math.max(-0.25, Math.min(0.35, ((scores.fund - 50) / 220) + (trendState === "Primary Uptrend" ? 0.04 : trendState === "Primary Downtrend" ? -0.04 : 0)));
  const baseGrowth = growthAnchor;
  const bullGrowth = Math.min(0.55, baseGrowth + 0.09);
  const bearGrowth = Math.max(-0.35, baseGrowth - 0.10);
  const peAnchor = resolvedPe > 0 ? resolvedPe : (valuationState === "Reasonable" ? 24 : valuationState === "Rich" ? 32 : 20);
  const bullMultiple = Math.max(10, peAnchor * (trendState === "Primary Uptrend" ? 1.16 : 1.08));
  const baseMultiple = Math.max(10, peAnchor * 1.0);
  const bearMultiple = Math.max(8, peAnchor * (trendState === "Primary Downtrend" ? 0.74 : 0.82));
  let bull12m = modeledEps > 0 ? (modeledEps * (1 + bullGrowth) * bullMultiple) : 0;
  let base12m = modeledEps > 0 ? (modeledEps * (1 + baseGrowth) * baseMultiple) : 0;
  let bear12m = modeledEps > 0 ? (modeledEps * (1 + bearGrowth) * bearMultiple) : 0;
  if (!(bull12m > 0 && base12m > 0 && bear12m > 0)) {
    const fallbackBase = stock.price > 0 ? stock.price * (1 + Math.max(-0.12, Math.min(0.18, growthAnchor))) : 0;
    base12m = fallbackBase;
    bull12m = fallbackBase * 1.2;
    bear12m = fallbackBase * 0.78;
  }
  const priceNow = Number(stock.price || 0);
  const upsideBasePct = priceNow > 0 ? ((base12m / priceNow) - 1) * 100 : 0;
  const upsideBullPct = priceNow > 0 ? ((bull12m / priceNow) - 1) * 100 : 0;
  const downsideBearPct = priceNow > 0 ? ((bear12m / priceNow) - 1) * 100 : 0;
  const estModelTag = resolvedEps > 0 && resolvedPe > 0 ? "EPS x P/E model" : "Hybrid proxy model";
  const techTrendScore = stock.price > sma50 && sma50 > sma200 ? 85 : stock.price > sma50 ? 68 : stock.price > sma200 ? 55 : 38;
  const techMomentumScore = Math.max(20, Math.min(95, 50 + chg * 7 + (Number(rvol || 0) - 1) * 18));
  const techStructureScore = Math.max(20, Math.min(95, 45 + (yearPos - 50) * 0.9));
  const techVolatilityScore = Math.max(20, Math.min(95, 75 - atrProxyPct * 4.5));
  const technicalDeepScore = Math.round(techTrendScore * 0.35 + techMomentumScore * 0.25 + techStructureScore * 0.25 + techVolatilityScore * 0.15);

  const fundValuationScore = resolvedPe > 0 ? (resolvedPe < 20 ? 84 : resolvedPe < 30 ? 72 : resolvedPe < 45 ? 58 : 42) : 52;
  const fundEpsScore = resolvedEps > 0 ? Math.min(90, 52 + resolvedEps * 6) : 46;
  const fundQualityScore = scores.fund;
  const fundDurabilityScore = Math.max(30, Math.min(90, 55 + (resolvedMarketCap > 2e11 ? 14 : resolvedMarketCap > 5e10 ? 8 : 2) - (atrProxyPct > 6 ? 8 : 0)));
  const fundamentalDeepScore = Math.round(fundValuationScore * 0.3 + fundEpsScore * 0.25 + fundQualityScore * 0.25 + fundDurabilityScore * 0.2);
  const panelCard = {
    background: C.surface,
    border: `1px solid ${C.borderLit}`,
    borderRadius: 10,
    boxShadow: "0 8px 22px rgba(21, 44, 78, 0.08)",
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "linear-gradient(180deg, #f4f8ff 0%, #edf3fb 100%)",
      zIndex: 1000, overflow: "hidden",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: "100%", minHeight: "100vh", background: "transparent",
        border: "none", borderRadius: 0, overflowY: "auto", overflowX: "hidden", boxSizing: "border-box",
      }}>
        {/* Header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 5,
          padding: "20px 24px", borderBottom: `1px solid ${C.borderLit}`,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          flexWrap: "wrap", gap: 10,
          background: "linear-gradient(180deg, #ffffff 0%, #f2f7ff 100%)",
          boxShadow: "0 8px 24px rgba(25, 55, 98, 0.08)",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 24, fontFamily: MONO, fontWeight: 800, color: C.text }}>{stock.symbol}</span>
              <span style={{ fontSize: 12, fontFamily: SANS, color: C.textSec }}>{stock.name}</span>
              <Badge color={C.textSec}>{stock.exchange}</Badge>
              <button
                onClick={() => onOpenTradingView?.(stock.symbol)}
                style={{ border: `1px solid ${C.borderLit}`, background: "#ffffff", color: C.accent, borderRadius: 4, padding: "3px 8px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
              >
                TRADINGVIEW
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 6 }}>
              <span style={{ fontSize: 30, fontFamily: MONO, fontWeight: 700, color: C.text }}>
                ${stock.price?.toFixed(2)}
              </span>
              <span style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: isUp ? C.green : C.red }}>
                {isUp ? "+" : ""}{chg.toFixed(2)}% ({isUp ? "+" : ""}${(stock.change || 0).toFixed(2)})
              </span>
              <TrendTag trend={trend} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: "#ffffff", border: `1px solid ${C.borderLit}`, color: C.text,
                fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer",
                borderRadius: 6, padding: "8px 12px",
              }}
            >
              BACK TO MONITOR
            </button>
            <button
              onClick={() => (onExit ? onExit() : onClose?.())}
              style={{
                background: "#ffffff", border: `1px solid ${C.borderLit}`, color: C.red,
                fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer",
                borderRadius: 6, padding: "8px 12px",
              }}
            >
              EXIT
            </button>
          </div>
          <button onClick={onClose} style={{
            background: "#f6f9ff", border: `1px solid ${C.borderLit}`, color: C.accent,
            fontSize: 18, cursor: "pointer", borderRadius: 6, width: 38, height: 38,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        {/* Score Bar */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10,
          padding: "12px 14px 2px",
        }}>
          {[
            { label: "COMPOSITE", val: scores.composite, col: C.accent },
            { label: "TECHNICAL", val: scores.tech, col: C.cyan },
            { label: "FUNDAMENTAL", val: scores.fund, col: C.purple },
            { label: "MACRO FIT", val: scores.macro, col: C.amber },
          ].map(s => (
            <div key={s.label} style={{ ...panelCard, borderTop: `3px solid ${s.col}`, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 8, fontFamily: MONO, color: C.textDim, marginBottom: 5, letterSpacing: "0.1em" }}>{s.label}</div>
              <div style={{ fontSize: 24, fontFamily: MONO, fontWeight: 800, color: s.col }}>{s.val}</div>
              <div style={{ marginTop: 5 }}><ScoreBar value={s.val} color={s.col} /></div>
            </div>
          ))}
        </div>

        {/* Data Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, padding: "10px 14px 0" }}>
          <div style={{ ...panelCard, padding: 18 }}>
            <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 800, color: C.cyan, marginBottom: 10, letterSpacing: "0.08em" }}>
              MARKET DATA
            </div>
            {[
              ["Price", `$${stock.price?.toFixed(2)}`],
              ["Day Range", `$${stock.dayLow?.toFixed(2)} — $${stock.dayHigh?.toFixed(2)}`],
              ["52W Range", `$${stock.yearLow?.toFixed(2)} — $${stock.yearHigh?.toFixed(2)}`],
              ["Volume", stock.volume?.toLocaleString()],
              ["Avg Volume", stock.avgVolume?.toLocaleString()],
              ["Rel. Volume", `${rvol}x`],
              ["Market Cap", formatNum(resolvedMarketCap)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 10, fontFamily: SANS, color: C.textDim }}>{k}</span>
                <span style={{ fontSize: 10, fontFamily: MONO, color: C.text }}>{v || "—"}</span>
              </div>
            ))}
          </div>
          <div style={{ ...panelCard, padding: 18 }}>
            <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 800, color: C.purple, marginBottom: 10, letterSpacing: "0.08em" }}>
              VALUATION & METRICS
            </div>
            {[
              ["P/E Ratio", stock.pe?.toFixed(2)],
              ["EPS (TTM)", `$${stock.eps?.toFixed(2)}`],
              ["Shares Out", stock.sharesOutstanding ? `${(stock.sharesOutstanding / 1e9).toFixed(2)}B` : "—"],
              ["Open", `$${stock.open?.toFixed(2)}`],
              ["Prev Close", `$${stock.previousClose?.toFixed(2)}`],
              ["50D Avg", stock.priceAvg50 ? `$${stock.priceAvg50.toFixed(2)}` : "—"],
              ["200D Avg", stock.priceAvg200 ? `$${stock.priceAvg200.toFixed(2)}` : "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 10, fontFamily: SANS, color: C.textDim }}>{k}</span>
                <span style={{ fontSize: 10, fontFamily: MONO, color: C.text }}>{v || "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* EMA / Trend Analysis */}
        <div style={{ ...panelCard, margin: "12px 14px 0", padding: 18 }}>
          <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 800, color: C.accent, marginBottom: 10, letterSpacing: "0.08em" }}>
            TREND ANALYSIS
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {[
              {
                label: "50D AVG POSITION",
                val: stock.priceAvg50 ? (stock.price > stock.priceAvg50 ? "ABOVE" : "BELOW") : "—",
                col: stock.price > (stock.priceAvg50 || 0) ? C.green : C.red,
                detail: stock.priceAvg50 ? `Price ${((stock.price / stock.priceAvg50 - 1) * 100).toFixed(1)}% from 50D` : "",
              },
              {
                label: "200D AVG POSITION",
                val: stock.priceAvg200 ? (stock.price > stock.priceAvg200 ? "ABOVE" : "BELOW") : "—",
                col: stock.price > (stock.priceAvg200 || 0) ? C.green : C.red,
                detail: stock.priceAvg200 ? `Price ${((stock.price / stock.priceAvg200 - 1) * 100).toFixed(1)}% from 200D` : "",
              },
              {
                label: "52W RANGE POSITION",
                val: stock.yearHigh && stock.yearLow
                  ? `${(((stock.price - stock.yearLow) / (stock.yearHigh - stock.yearLow)) * 100).toFixed(0)}%`
                  : "—",
                col: C.text,
                detail: stock.yearHigh ? `High $${stock.yearHigh.toFixed(2)} / Low $${stock.yearLow.toFixed(2)}` : "",
              },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: 8, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 800, color: item.col }}>{item.val}</div>
                <div style={{ fontSize: 9, fontFamily: SANS, color: C.textDim, marginTop: 2 }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Deep Dive Pro */}
        <div style={{ ...panelCard, margin: "12px 14px 0", padding: 18 }}>
          <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 800, color: C.green, marginBottom: 10, letterSpacing: "0.08em" }}>
            DEEP DIVE PRO
          </div>
          {(() => {
            return (
              <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 8 }}>INSTITUTIONAL READ</div>
                  <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}>
                    Bull case: {trendState === "Primary Uptrend" ? "Trend leadership intact with favorable structure and upside continuation potential." : "Needs reclaim of trend stack (price > 50D > 200D) before high-conviction continuation."}
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}>
                    Bear case: {trendState === "Primary Downtrend" ? "Downtrend pressure remains with higher risk of lower highs and lower lows." : "Loss of 50D support can trigger fast de-risking into range lows."}
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec }}>
                    Macro fit: {macroFit}. Stock likely responds more to broad risk regime than idiosyncratic catalysts in high-volatility sessions.
                  </div>
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>TECHNICAL CHECKLIST</div>
                    <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.45 }}>
                      Trend: {stock.price > (stock.priceAvg50 || 0) ? "Aligned" : "Weak"} ·
                      RVOL: {rvol}x ·
                      52W position: {stock.yearHigh && stock.yearLow ? `${(((stock.price - stock.yearLow) / Math.max(0.01, (stock.yearHigh - stock.yearLow))) * 100).toFixed(0)}%` : "n/a"}
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>FUNDAMENTAL PROXY</div>
                    <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.45 }}>
                      Market cap: {formatNum(resolvedMarketCap)} ·
                      50D vs 200D: {(stock.priceAvg50 && stock.priceAvg200 && stock.priceAvg50 > stock.priceAvg200) ? "Improving trend" : "Mixed/weak"} ·
                      Quality flag: {scores.fund >= 65 ? "Higher quality" : scores.fund >= 50 ? "Neutral quality" : "Lower quality"}
                    </div>
                  </div>
                </div>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 8 }}>TRADE PLAN</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Setup</span><span style={{ color: setup.includes("BUY") ? C.green : setup.includes("WAIT") ? C.amber : C.red, fontFamily: MONO }}>{setup}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Entry Zone</span><span style={{ color: C.text, fontFamily: MONO }}>${entry.toFixed(2)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Stop</span><span style={{ color: C.red, fontFamily: MONO }}>${stop.toFixed(2)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Target 1</span><span style={{ color: C.green, fontFamily: MONO }}>${target1.toFixed(2)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Target 2</span><span style={{ color: C.green, fontFamily: MONO }}>${target2.toFixed(2)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>R:R</span><span style={{ color: rr >= 1.5 ? C.green : C.amber, fontFamily: MONO }}>{rr.toFixed(2)}x</span></div>
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 8 }}>
                    Invalidation: close below stop with rising volume. Position size note: risk max 0.5%–1% per trade.
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 12 }}>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 6 }}>TECHNICAL INTELLIGENCE</div>
                  <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.55 }}>
                    Trend state: {trendState}<br />
                    Structure: {structureState}<br />
                    RVOL: {rvol}x<br />
                    Intraday range / ATR proxy: {atrProxyPct.toFixed(2)}%
                  </div>
                </div>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 6 }}>FUNDAMENTAL SNAPSHOT</div>
                  <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.55 }}>
                Market cap: {formatNum(resolvedMarketCap)}<br />
                Valuation: {valuationState} {resolvedPe > 0 ? `(P/E ${resolvedPe.toFixed(1)})` : ""}<br />
                EPS proxy: {resolvedEps > 0 ? `$${resolvedEps.toFixed(2)}` : "Not available"}<br />
                Quality: {qualityState}
              </div>
                </div>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 6 }}>SCENARIO MATRIX</div>
                  <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.55 }}>
                    Bull continuation: <span style={{ color: C.green, fontFamily: MONO }}>{bullProb}%</span><br />
                    Base consolidation: <span style={{ color: C.amber, fontFamily: MONO }}>{baseProb}%</span><br />
                    Bear breakdown: <span style={{ color: C.red, fontFamily: MONO }}>{bearProb}%</span><br />
                    Year range position: <span style={{ fontFamily: MONO }}>{yearPos.toFixed(0)}%</span>
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>12M PRICE ESTIMATE</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
                      <span style={{ color: C.textDim }}>Bear (12m)</span>
                      <span style={{ color: C.red, fontFamily: MONO }}>${bear12m.toFixed(2)} ({downsideBearPct >= 0 ? "+" : ""}{downsideBearPct.toFixed(1)}%)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
                      <span style={{ color: C.textDim }}>Base (12m)</span>
                      <span style={{ color: C.accent, fontFamily: MONO }}>${base12m.toFixed(2)} ({upsideBasePct >= 0 ? "+" : ""}{upsideBasePct.toFixed(1)}%)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: C.textDim }}>Bull (12m)</span>
                      <span style={{ color: C.green, fontFamily: MONO }}>${bull12m.toFixed(2)} ({upsideBullPct >= 0 ? "+" : ""}{upsideBullPct.toFixed(1)}%)</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.textDim, marginTop: 6 }}>
                      Model: {estModelTag}. For decision support only.
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 12 }}>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 6 }}>CATALYSTS & RISKS</div>
                  <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.55 }}>
                    Catalyst watch: {catalystNote}<br />
                    Risk flag: {riskNote}<br />
                    Confirmation needed: hold above entry zone and improve relative volume and trend quality.
                  </div>
                </div>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 6 }}>POSITION SIZING NOTE</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Risk Budget</span><span style={{ color: C.text, fontFamily: MONO }}>${riskBudget.toFixed(0)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Risk / Share</span><span style={{ color: C.text, fontFamily: MONO }}>${riskPerShare.toFixed(2)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Suggested Size</span><span style={{ color: C.text, fontFamily: MONO }}>{sizeShares.toLocaleString()} sh</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: C.textDim }}>Position Notional</span><span style={{ color: C.text, fontFamily: MONO }}>${positionValue.toFixed(0)}</span></div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 12 }}>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.cyan }}>TECHNICAL DEEP DIVE</div>
                    <Badge color={technicalDeepScore >= 70 ? C.green : technicalDeepScore >= 55 ? C.amber : C.red}>{technicalDeepScore}</Badge>
                  </div>
                  <div style={{ display: "grid", gap: 5, fontSize: 11, color: C.textSec, lineHeight: 1.45 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Trend Stack (9/21/50/200 proxy)</span><span style={{ fontFamily: MONO, color: techTrendScore >= 70 ? C.green : techTrendScore >= 55 ? C.amber : C.red }}>{techTrendScore}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Momentum (CHG% + RVOL)</span><span style={{ fontFamily: MONO, color: techMomentumScore >= 70 ? C.green : techMomentumScore >= 55 ? C.amber : C.red }}>{Math.round(techMomentumScore)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Structure (52W range position)</span><span style={{ fontFamily: MONO, color: techStructureScore >= 70 ? C.green : techStructureScore >= 55 ? C.amber : C.red }}>{Math.round(techStructureScore)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Volatility Efficiency</span><span style={{ fontFamily: MONO, color: techVolatilityScore >= 70 ? C.green : techVolatilityScore >= 55 ? C.amber : C.red }}>{Math.round(techVolatilityScore)}</span></div>
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim }}>
                    Trigger quality: {technicalDeepScore >= 70 ? "Institutional-quality continuation profile." : technicalDeepScore >= 55 ? "Tradable with confirmation and tighter risk." : "Weak technical quality, avoid forcing entries."}
                  </div>
                </div>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.purple }}>FUNDAMENTAL DEEP DIVE</div>
                    <Badge color={fundamentalDeepScore >= 70 ? C.green : fundamentalDeepScore >= 55 ? C.amber : C.red}>{fundamentalDeepScore}</Badge>
                  </div>
                  <div style={{ display: "grid", gap: 5, fontSize: 11, color: C.textSec, lineHeight: 1.45 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Valuation Quality</span><span style={{ fontFamily: MONO, color: fundValuationScore >= 70 ? C.green : fundValuationScore >= 55 ? C.amber : C.red }}>{fundValuationScore}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>EPS Power (proxy)</span><span style={{ fontFamily: MONO, color: fundEpsScore >= 70 ? C.green : fundEpsScore >= 55 ? C.amber : C.red }}>{Math.round(fundEpsScore)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Quality Composite</span><span style={{ fontFamily: MONO, color: fundQualityScore >= 70 ? C.green : fundQualityScore >= 55 ? C.amber : C.red }}>{fundQualityScore}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Durability / Scale</span><span style={{ fontFamily: MONO, color: fundDurabilityScore >= 70 ? C.green : fundDurabilityScore >= 55 ? C.amber : C.red }}>{Math.round(fundDurabilityScore)}</span></div>
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim }}>
                    12m Base/Bull/Bear: <span style={{ fontFamily: MONO, color: C.text }}>${base12m.toFixed(2)} / ${bull12m.toFixed(2)} / ${bear12m.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              </>
            );
          })()}
        </div>

        {/* Disclaimer */}
        <div style={{ margin: "12px 14px 16px", padding: "10px 18px", fontSize: 9, fontFamily: SANS, color: C.textDim, background: "#f8fbff", border: `1px solid ${C.borderLit}`, borderRadius: 8, fontStyle: "italic" }}>
          Decision support only — not financial advice. Scores are heuristic estimates. Full fundamental & macro scoring requires additional API data (income statements, macro indicators).
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EARLY ENTRY SCANNER
// ═══════════════════════════════════════════════════════════════

function computeEarlyScore(q, spyChg, qqqChg) {
  if (!q || !q.price) return { score: 0, breakdown: {}, reasons: [], flags: [] };
  const price  = Number(q.price || 0);
  const open   = Number(q.open  || price);
  const avg50  = Number(q.priceAvg50  || 0);
  const avg200 = Number(q.priceAvg200 || 0);
  const yHigh  = Number(q.yearHigh || 0);
  const yLow   = Number(q.yearLow  || 0);
  const vol    = Number(q.volume    || 0);
  const avgVol = Number(q.avgVolume || 1);
  const chg    = Number(q.changesPercentage || 0);
  const rvol   = avgVol > 0 ? vol / avgVol : 0;
  const relSpy = chg - spyChg;
  const relQqq = chg - qqqChg;
  const relRS  = (relSpy + relQqq) / 2;

  const bd = {};
  const reasons = [];
  const flags   = [];

  // 1. Above VWAP (15 pts) — proxy: price vs open
  if (open > 0 && price >= open * 1.001) {
    bd.vwap = 15; reasons.push("Above VWAP");
  } else if (open > 0 && price >= open * 0.997) {
    bd.vwap = 7;  reasons.push("Near VWAP");
  } else {
    bd.vwap = 0;  flags.push("Below VWAP");
  }

  // 2. Bullish EMA alignment (15 pts)
  if (avg50 > 0 && avg200 > 0 && price > avg50 && avg50 > avg200) {
    bd.ema = 15; reasons.push("Bullish EMA alignment");
  } else if (avg50 > 0 && price > avg50) {
    bd.ema = 8;  reasons.push("Above 50 EMA");
  } else if (avg200 > 0 && price > avg200) {
    bd.ema = 4;  reasons.push("Above 200 EMA");
  } else {
    bd.ema = 0;  flags.push("Below key EMAs");
  }

  // 3. Near breakout level (15 pts) — within 1-3% of 52wk high
  let distToHigh = 100;
  if (yHigh > 0) {
    distToHigh = ((yHigh - price) / yHigh) * 100;
    if (distToHigh >= 0.3 && distToHigh <= 3)       { bd.breakout = 15; reasons.push("Near 52W breakout zone"); }
    else if (distToHigh > 3 && distToHigh <= 6)     { bd.breakout = 8; }
    else if (distToHigh < 0.3 && distToHigh >= -2)  { bd.breakout = 5;  flags.push("Just broke out — extended"); }
    else                                              { bd.breakout = 0; }
  } else { bd.breakout = 0; }

  // 4. RVOL (15 pts)
  if (rvol >= 2.5)      { bd.rvol = 15; reasons.push(`RVOL ${rvol.toFixed(1)}x — institutional volume`); }
  else if (rvol >= 1.5) { bd.rvol = 12; reasons.push(`RVOL ${rvol.toFixed(1)}x — above average`); }
  else if (rvol >= 1.2) { bd.rvol = 7; }
  else if (rvol >= 0.8) { bd.rvol = 3; }
  else                   { bd.rvol = 0; flags.push("Low volume"); }

  // 5. Relative strength vs SPY/QQQ (15 pts)
  if (relRS >= 2)       { bd.rs = 15; reasons.push("Stronger than SPY/QQQ"); }
  else if (relRS >= 1)  { bd.rs = 10; reasons.push("Outperforming market"); }
  else if (relRS >= 0)  { bd.rs = 6; }
  else if (relRS >= -1) { bd.rs = 2; }
  else                  { bd.rs = 0; flags.push("Weaker than market"); }

  // 6. Pullback held support (10 pts)
  if (avg50 > 0) {
    const distTo50 = Math.abs(price - avg50) / avg50 * 100;
    if (distTo50 <= 2 && chg > 0)      { bd.pullback = 10; reasons.push("Bouncing off 50 EMA support"); }
    else if (distTo50 <= 4 && chg > 0) { bd.pullback = 5; }
    else if (distTo50 <= 1.5 && chg < 0) { bd.pullback = 2; flags.push("Testing support — watch closely"); }
    else { bd.pullback = 0; }
  } else { bd.pullback = 0; }

  // 7. OBV / accumulation rising (10 pts)
  if (rvol >= 1.5 && chg > 0)      { bd.obv = 10; reasons.push("Volume confirming move"); }
  else if (rvol >= 1.0 && chg > 0) { bd.obv = 5; }
  else if (rvol >= 1.5 && chg < 0) { bd.obv = 0; flags.push("High volume selling"); }
  else                              { bd.obv = 0; }

  // 8. Catalyst awareness (5 pts)
  if (rvol >= 2.5)      { bd.catalyst = 5; reasons.push("Unusual volume — possible catalyst"); }
  else if (rvol >= 1.8) { bd.catalyst = 3; }
  else                  { bd.catalyst = 0; }

  const score = Math.min(100, Object.values(bd).reduce((s, v) => s + v, 0));

  // Extra trap flags
  if (yHigh > 0 && yLow > 0) {
    const rng = yHigh - yLow;
    const yPos = rng > 0 ? (price - yLow) / rng : 0.5;
    if (yPos < 0.25) flags.push("Near 52W low — downtrend");
  }
  if (rvol >= 1.5 && chg < -1.5) flags.push("High-volume sell-off — trap risk");
  if (distToHigh < -2)            flags.push("Extended above breakout");

  return { score, breakdown: bd, reasons, flags, rvol, relRS, distToHigh };
}

function classifyEarlySetup(q, scored) {
  const { score, breakdown: bd, rvol, distToHigh } = scored;
  const chg   = Number(q.changesPercentage || 0);
  const price = Number(q.price || 0);
  const open  = Number(q.open  || price);
  const avg50 = Number(q.priceAvg50 || 0);

  if (score < 50 || (bd.vwap === 0 && bd.ema === 0)) return "Avoid / Trap Zone";
  if (bd.vwap === 15 && rvol >= 1.5 && chg > 0 && price > open * 1.001)       return "VWAP Reclaim";
  if (bd.ema >= 15 && avg50 > 0 && Math.abs(price - avg50) / avg50 * 100 <= 3) return "21 EMA Pullback";
  if (distToHigh >= 0.3 && distToHigh <= 3 && bd.breakout >= 15)               return "Pre-Breakout Compression";
  if (bd.rs >= 10 && score >= 65)                                               return "Relative Strength Leader";
  if (rvol >= 2.0 && bd.obv >= 5 && score >= 60)                               return "Volume Before Price";
  if (distToHigh >= -1 && distToHigh <= 1 && bd.vwap > 0)                      return "Breakout Retest";
  return "Setup Forming";
}

function earlyScoreLabel(score) {
  if (score >= 85) return { label: "A+ Early Entry", color: "#00c97a" };
  if (score >= 75) return { label: "Watch Closely",  color: "#ffb340" };
  if (score >= 65) return { label: "Setup Forming",  color: "#607494" };
  return                  { label: "Ignore / Avoid", color: "#ff4d63" };
}

function EarlyEntryScanner({ watchlistData, macroData, sectorData, onSelectSymbol }) {
  const [alertPreview, setAlertPreview] = useState(null);
  const [sentAlerts, setSentAlerts]     = useState({});   // symbol → timestamp ms
  const [alertStatus, setAlertStatus]   = useState("");
  const [filterSetup, setFilterSetup]   = useState("ALL");
  const [minScoreFilter, setMinScoreFilter] = useState(0);
  const sentRef = useRef({});

  const spy = (macroData || []).find(q => q.symbol === "SPY");
  const qqq = (macroData || []).find(q => q.symbol === "QQQ");
  const spyChg = Number(spy?.changesPercentage || 0);
  const qqqChg = Number(qqq?.changesPercentage || 0);

  // Determine market bias
  const marketBias = useMemo(() => {
    if (spyChg > 0.5 && qqqChg > 0.5) return { label: "Risk-On",  color: "#00c97a" };
    if (spyChg < -0.5 || qqqChg < -0.5) return { label: "Risk-Off", color: "#ff4d63" };
    return { label: "Neutral", color: "#ffb340" };
  }, [spyChg, qqqChg]);

  // Score every watchlist symbol
  const scoredRows = useMemo(() => {
    if (!watchlistData || !watchlistData.length) return [];
    return watchlistData.map(q => {
      const scored  = computeEarlyScore(q, spyChg, qqqChg);
      const setup   = classifyEarlySetup(q, scored);
      const lbl     = earlyScoreLabel(scored.score);
      const price   = Number(q.price || 0);
      const avg50   = Number(q.priceAvg50 || 0);
      const yHigh   = Number(q.yearHigh   || 0);
      const atr     = price > 0 ? ((Number(q.dayHigh || price) - Number(q.dayLow || price)) / price) * 100 : 1;
      const entry   = avg50 > 0 && Math.abs(price - avg50) / avg50 * 100 <= 3 ? avg50 * 1.005 : price * 1.003;
      const stop    = entry * (setup === "VWAP Reclaim" ? 0.977 : 0.972);
      const t1      = entry * (setup === "Pre-Breakout Compression" ? 1.045 : 1.055);
      const t2      = entry * (setup === "Pre-Breakout Compression" ? 1.085 : 1.10);
      const rr      = entry > stop ? (t1 - entry) / Math.max(0.01, entry - stop) : 0;
      return { q, scored, setup, lbl, entry, stop, t1, t2, rr, atr, yHigh };
    }).sort((a, b) => b.scored.score - a.scored.score);
  }, [watchlistData, spyChg, qqqChg]);

  const earlyEntries    = useMemo(() => scoredRows.filter(r => r.scored.score >= 65 && r.setup !== "Avoid / Trap Zone"), [scoredRows]);
  const preBreakout     = useMemo(() => scoredRows.filter(r => r.setup === "Pre-Breakout Compression" || (r.scored.distToHigh >= 0 && r.scored.distToHigh <= 5)), [scoredRows]);
  const vwapReclaims    = useMemo(() => scoredRows.filter(r => r.setup === "VWAP Reclaim"), [scoredRows]);
  const emaPullbacks    = useMemo(() => scoredRows.filter(r => r.setup === "21 EMA Pullback"), [scoredRows]);
  const trapZones       = useMemo(() => scoredRows.filter(r => r.setup === "Avoid / Trap Zone" || r.scored.score < 50 || r.scored.flags.length >= 2), [scoredRows]);
  const aPlusCount      = useMemo(() => scoredRows.filter(r => r.scored.score >= 85).length, [scoredRows]);
  const nearBreakout    = useMemo(() => scoredRows.filter(r => r.scored.distToHigh >= 0 && r.scored.distToHigh <= 3).length, [scoredRows]);

  const bestSector = useMemo(() => {
    if (!sectorData || !sectorData.length) return "—";
    const top = [...sectorData].sort((a, b) => (b.changesPercentage || 0) - (a.changesPercentage || 0))[0];
    return top ? `${top.symbol} +${Number(top.changesPercentage || 0).toFixed(2)}%` : "—";
  }, [sectorData]);

  const bestEntry = scoredRows[0] || null;

  const setupOptions = ["ALL", "VWAP Reclaim", "21 EMA Pullback", "Pre-Breakout Compression", "Relative Strength Leader", "Volume Before Price", "Breakout Retest"];

  const filteredEntries = useMemo(() => earlyEntries.filter(r => {
    if (filterSetup !== "ALL" && r.setup !== filterSetup) return false;
    if (r.scored.score < minScoreFilter) return false;
    return true;
  }), [earlyEntries, filterSetup, minScoreFilter]);

  const buildAlertText = (row) => {
    const { q, scored, setup, lbl, entry, stop, t1, t2, rr } = row;
    const whys = scored.reasons.slice(0, 5).map(r => `✅ ${r}`).join("\n");
    return (
`🚨 EARLY ${lbl.label.toUpperCase()} ALERT

Ticker: ${q.symbol}
Score: ${scored.score}/100
Setup: ${setup}

Entry:   $${entry.toFixed(2)}
Stop:    $${stop.toFixed(2)}
Target 1: $${t1.toFixed(2)}
Target 2: $${t2.toFixed(2)}
Risk/Reward: ${rr.toFixed(1)}R

Why this is early:
${whys || "✅ Multiple early signals confirmed"}

Action Plan:
Enter only if candle closes above entry.
Do not chase if price is extended.
Risk small and follow the stop.`
    );
  };

  const sendAlert = async (row) => {
    const now = Date.now();
    const last = sentRef.current[row.q.symbol] || 0;
    if (now - last < 30 * 60 * 1000) {
      setAlertStatus(`⏱ Alert for ${row.q.symbol} already sent < 30 min ago`);
      setTimeout(() => setAlertStatus(""), 3000);
      return;
    }
    const text = buildAlertText(row);
    try {
      setAlertStatus("Sending…");
      await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      sentRef.current[row.q.symbol] = now;
      setSentAlerts(s => ({ ...s, [row.q.symbol]: now }));
      setAlertStatus(`✅ Alert sent for ${row.q.symbol}`);
    } catch {
      setAlertStatus("❌ Notify endpoint unavailable — check /api/notify");
    }
    setTimeout(() => setAlertStatus(""), 4000);
  };

  const TH = ({ children, right }) => (
    <th style={{ padding: "8px 10px", textAlign: right ? "right" : "left", fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.07em", borderBottom: `1px solid ${C.border}`, background: C.surface, fontWeight: 700, whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
  const TD = ({ children, right, color, mono }) => (
    <td style={{ padding: "7px 10px", textAlign: right ? "right" : "left", fontFamily: mono !== false ? MONO : SANS, fontSize: 11, color: color || C.text, borderTop: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
      {children}
    </td>
  );

  const ScoreBadge = ({ score }) => {
    const lbl = earlyScoreLabel(score);
    return (
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: lbl.color, background: `${lbl.color}18`, padding: "2px 7px", borderRadius: 4 }}>
        {score}
      </span>
    );
  };

  const SetupBadge = ({ setup }) => {
    const col = setup === "VWAP Reclaim" ? C.cyan :
                setup === "21 EMA Pullback" ? C.green :
                setup === "Pre-Breakout Compression" ? C.amber :
                setup === "Relative Strength Leader" ? C.accent :
                setup === "Volume Before Price" ? C.purple :
                setup === "Breakout Retest" ? "#f0c040" :
                setup === "Avoid / Trap Zone" ? C.red : C.textDim;
    return (
      <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: col, background: `${col}18`, padding: "2px 6px", borderRadius: 3, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
        {setup}
      </span>
    );
  };

  const SummaryCard = ({ label, value, sub, color, onClick }) => (
    <div onClick={onClick} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", cursor: onClick ? "pointer" : "default", minWidth: 130, flex: "1 1 130px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.07em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: color || C.text, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 3 }}>{sub}</div>}
    </div>
  );

  const SectionHeader = ({ title, count, color, badge }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.09em", fontWeight: 700 }}>{title}</span>
      {count != null && <span style={{ fontFamily: MONO, fontSize: 9, color: color || C.green, background: `${color || C.green}18`, padding: "1px 7px", borderRadius: 10 }}>{count}</span>}
      {badge && <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{badge}</span>}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>

      {/* ── Summary Cards ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
        <SummaryCard label="MARKET BIAS"       value={marketBias.label}                 color={marketBias.color}  sub={`SPY ${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}%  QQQ ${qqqChg >= 0 ? "+" : ""}${qqqChg.toFixed(2)}%`} />
        <SummaryCard label="BEST EARLY ENTRY"  value={bestEntry?.q.symbol || "—"}       color={C.accent}          sub={bestEntry ? `Score ${bestEntry.scored.score} · ${bestEntry.setup}` : "No setups yet"} onClick={() => bestEntry && onSelectSymbol(bestEntry.q.symbol)} />
        <SummaryCard label="STRONGEST SECTOR"  value={bestSector.split(" ")[0] || "—"}  color={C.cyan}            sub={bestSector} />
        <SummaryCard label="A+ EARLY SETUPS"   value={aPlusCount}                        color={aPlusCount > 0 ? C.green : C.textDim}  sub="Score ≥ 85 — act now" />
        <SummaryCard label="NEAR BREAKOUT"     value={nearBreakout}                      color={C.amber}           sub="Within 3% of 52W high" />
        <SummaryCard label="TRAP / AVOID"      value={trapZones.length}                  color={trapZones.length > 0 ? C.red : C.textDim}  sub="Flagged — do not chase" />
        <button
          onClick={async () => {
            const bias = marketBias.label;
            const biasIcon = bias === "Risk-On" ? "🟢" : bias === "Risk-Off" ? "🔴" : "⚪";
            const top3 = filteredEntries.slice(0, 3).map(r =>
              `${r.scored.score >= 85 ? "🌟" : r.scored.score >= 75 ? "⭐" : "•"} ${r.q.symbol}  Score ${r.scored.score}  ${r.setup}  Entry $${r.entry.toFixed(2)}  Stop $${r.stop.toFixed(2)}  T1 $${r.t1.toFixed(2)}  RR ${r.rr.toFixed(1)}R`
            ).join("\n");
            const brk3 = preBreakout.slice(0, 3).map(r => `• ${r.q.symbol}  $${Number(r.q.price||0).toFixed(2)}  Score ${r.scored.score}  ${r.scored.distToHigh.toFixed(1)}% to breakout`).join("\n");
            const traps = trapZones.slice(0, 3).map(r => `⚠ ${r.q.symbol}`).join("  ");
            const msg = [
              `${biasIcon} MARKET BRIEF`,
              `Bias: ${bias}  |  SPY ${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}%  QQQ ${qqqChg >= 0 ? "+" : ""}${qqqChg.toFixed(2)}%`,
              `Sector: ${bestSector || "—"}`,
              "",
              `TOP EARLY ENTRIES (${aPlusCount} A+ / ${filteredEntries.length} total)`,
              top3 || "None",
              "",
              `PRE-BREAKOUT WATCH`,
              brk3 || "None",
              traps ? "\nAVOID: " + traps : "",
            ].filter(x => x !== undefined).join("\n").trim();
            try {
              const r = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) });
              const d = await r.json().catch(() => ({}));
              if (d.ok === false) alert("Telegram error: " + (d.error || "unknown"));
            } catch(e) { alert("Send failed: " + e.message); }
          }}
          style={{ background: "#2563eb18", border: "1px solid #2563eb55", color: "#2563eb", borderRadius: 8, padding: "10px 16px", fontFamily: MONO, fontSize: 10, fontWeight: 800, cursor: "pointer", alignSelf: "stretch", display: "flex", alignItems: "center", gap: 6 }}
        >📱 PUSH BRIEF</button>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.07em" }}>SETUP:</span>
        {setupOptions.map(s => (
          <button key={s} onClick={() => setFilterSetup(s)} style={{ border: `1px solid ${filterSetup === s ? C.accent : C.border}`, background: filterSetup === s ? `${C.accent}18` : C.surface, color: filterSetup === s ? C.accent : C.textDim, fontFamily: MONO, fontSize: 9, padding: "4px 10px", borderRadius: 12, cursor: "pointer", fontWeight: filterSetup === s ? 800 : 400, letterSpacing: "0.04em" }}>
            {s}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>MIN SCORE:</span>
          {[0, 65, 75, 85].map(v => (
            <button key={v} onClick={() => setMinScoreFilter(v)} style={{ border: `1px solid ${minScoreFilter === v ? C.accent : C.border}`, background: minScoreFilter === v ? `${C.accent}18` : C.surface, color: minScoreFilter === v ? C.accent : C.textDim, fontFamily: MONO, fontSize: 9, padding: "4px 9px", borderRadius: 12, cursor: "pointer", fontWeight: minScoreFilter === v ? 800 : 400 }}>
              {v === 0 ? "ALL" : `${v}+`}
            </button>
          ))}
        </div>
        {alertStatus && (
          <span style={{ fontFamily: MONO, fontSize: 10, color: alertStatus.startsWith("✅") ? C.green : alertStatus.startsWith("❌") ? C.red : C.amber, marginLeft: 8 }}>{alertStatus}</span>
        )}
      </div>

      {/* ── Best Early Entries Table ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SectionHeader title="BEST EARLY ENTRIES" count={filteredEntries.length} color={C.green} />
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Scored from watchlist · modular — plug in live data to refine</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <TH>TICKER</TH><TH right>PRICE</TH><TH right>SCORE</TH><TH>SETUP TYPE</TH>
                <TH right>ENTRY</TH><TH right>STOP</TH><TH right>T1</TH><TH right>T2</TH>
                <TH right>R:R</TH><TH>STATUS</TH><TH>ALERT</TH>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 && (
                <tr><td colSpan={11} style={{ padding: 16, fontFamily: MONO, fontSize: 11, color: C.textDim, textAlign: "center" }}>No early entries match the current filters.</td></tr>
              )}
              {filteredEntries.map(row => {
                const { q, scored, setup, lbl, entry, stop, t1, t2, rr } = row;
                const chg = Number(q.changesPercentage || 0);
                const recentlySent = sentAlerts[q.symbol] && (Date.now() - sentAlerts[q.symbol] < 30 * 60 * 1000);
                return (
                  <tr key={q.symbol} style={{ background: "transparent" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <TD>
                      <button onClick={() => onSelectSymbol(q.symbol)} style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, cursor: "pointer", padding: 0 }}>
                        {q.symbol}
                      </button>
                    </TD>
                    <TD right mono color={chg >= 0 ? C.green : C.red}>${Number(q.price || 0).toFixed(2)}</TD>
                    <TD right><ScoreBadge score={scored.score} /></TD>
                    <TD><SetupBadge setup={setup} /></TD>
                    <TD right mono color={C.text}>${entry.toFixed(2)}</TD>
                    <TD right mono color={C.red}>${stop.toFixed(2)}</TD>
                    <TD right mono color={C.green}>${t1.toFixed(2)}</TD>
                    <TD right mono color={C.green}>${t2.toFixed(2)}</TD>
                    <TD right mono color={rr >= 2 ? C.green : rr >= 1.5 ? C.amber : C.red}>{rr.toFixed(1)}R</TD>
                    <TD><span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: lbl.color, background: `${lbl.color}15`, padding: "2px 6px", borderRadius: 3 }}>{lbl.label}</span></TD>
                    <TD>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button onClick={() => setAlertPreview(alertPreview?.q?.symbol === q.symbol ? null : row)}
                          style={{ border: `1px solid ${alertPreview?.q?.symbol === q.symbol ? C.amber : C.border}`, background: alertPreview?.q?.symbol === q.symbol ? `${C.amber}18` : C.surface, color: alertPreview?.q?.symbol === q.symbol ? C.amber : C.textDim, fontFamily: MONO, fontSize: 9, padding: "3px 7px", borderRadius: 3, cursor: "pointer" }}>
                          PREVIEW
                        </button>
                        {scored.score >= 75 && (
                          <button onClick={() => sendAlert(row)} disabled={recentlySent}
                            style={{ border: `1px solid ${recentlySent ? C.border : C.green + "88"}`, background: recentlySent ? C.surface : `${C.green}14`, color: recentlySent ? C.textDim : C.green, fontFamily: MONO, fontSize: 9, padding: "3px 7px", borderRadius: 3, cursor: recentlySent ? "default" : "pointer", opacity: recentlySent ? 0.5 : 1 }}>
                            {recentlySent ? "SENT" : "SEND"}
                          </button>
                        )}
                      </div>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Alert Preview Panel ── */}
      {alertPreview && (
        <div style={{ background: C.card, border: `2px solid ${C.amber}66`, borderRadius: 8, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <SectionHeader title={`TELEGRAM ALERT PREVIEW — ${alertPreview.q.symbol}`} color={C.amber} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => sendAlert(alertPreview)}
                style={{ border: `1px solid ${C.green}88`, background: `${C.green}18`, color: C.green, fontFamily: MONO, fontSize: 10, padding: "5px 14px", borderRadius: 4, cursor: "pointer", fontWeight: 700 }}>
                SEND TO TELEGRAM
              </button>
              <button onClick={() => setAlertPreview(null)}
                style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textDim, fontFamily: MONO, fontSize: 10, padding: "5px 10px", borderRadius: 4, cursor: "pointer" }}>
                CLOSE
              </button>
            </div>
          </div>
          <pre style={{ fontFamily: MONO, fontSize: 11, color: C.text, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
            {buildAlertText(alertPreview)}
          </pre>
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 9, color: C.textDim }}>
            Alert rules: Score ≥85 = A+ Early Entry Alert · Score 75–84 = Watch Closely · Duplicate suppressed for 30 min per ticker
          </div>
        </div>
      )}

      {/* ── Two-column: VWAP Reclaim + EMA Pullback ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* VWAP Reclaim */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
            <SectionHeader title="VWAP RECLAIM SCANNER" count={vwapReclaims.length} color={C.cyan} badge="price reclaimed above open" />
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>TICKER</TH><TH right>PRICE</TH><TH right>CHG%</TH><TH right>RVOL</TH><TH right>SCORE</TH><TH>SEND</TH></tr></thead>
            <tbody>
              {vwapReclaims.length === 0 && <tr><td colSpan={6} style={{ padding: 12, fontFamily: MONO, fontSize: 11, color: C.textDim, textAlign: "center" }}>No VWAP reclaims detected.</td></tr>}
              {vwapReclaims.slice(0, 8).map(row => {
                const chg = Number(row.q.changesPercentage || 0);
                return (
                  <tr key={row.q.symbol}
                      onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <TD><button onClick={() => onSelectSymbol(row.q.symbol)} style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.accent, cursor: "pointer", padding: 0 }}>{row.q.symbol}</button></TD>
                    <TD right>${Number(row.q.price || 0).toFixed(2)}</TD>
                    <TD right color={chg >= 0 ? C.green : C.red}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</TD>
                    <TD right color={row.scored.rvol >= 1.5 ? C.green : C.textDim}>{row.scored.rvol.toFixed(2)}x</TD>
                    <TD right><ScoreBadge score={row.scored.score} /></TD>
                    <TD><button onClick={async () => {
                      const msg = `📈 VWAP RECLAIM — ${row.q.symbol}\nPrice: $${Number(row.q.price||0).toFixed(2)}  CHG: ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%\nRVOL: ${row.scored.rvol.toFixed(2)}x  Score: ${row.scored.score}\nSetup: VWAP Reclaim — price closed above open with volume`;
                      await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }).catch(() => {});
                    }} style={{ border: "1px solid #2563eb55", background: "#2563eb12", color: "#2563eb", borderRadius: 3, padding: "2px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer", fontWeight: 700 }}>📱</button></TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, lineHeight: 1.6 }}>
              Qualifies: price above open · volume confirming · SPY/QQQ stable<br />
              EMA aligned · candle closed above reclaim level
            </div>
          </div>
        </div>

        {/* EMA Pullback */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
            <SectionHeader title="21 EMA PULLBACK SCANNER" count={emaPullbacks.length} color={C.green} badge="near 50sma support · trending" />
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>TICKER</TH><TH right>PRICE</TH><TH right>vs 50D</TH><TH right>RVOL</TH><TH right>SCORE</TH><TH>SEND</TH></tr></thead>
            <tbody>
              {emaPullbacks.length === 0 && <tr><td colSpan={6} style={{ padding: 12, fontFamily: MONO, fontSize: 11, color: C.textDim, textAlign: "center" }}>No EMA pullbacks detected.</td></tr>}
              {emaPullbacks.slice(0, 8).map(row => {
                const avg50 = Number(row.q.priceAvg50 || 0);
                const price = Number(row.q.price || 0);
                const distTo50 = avg50 > 0 ? ((price - avg50) / avg50 * 100) : null;
                return (
                  <tr key={row.q.symbol}
                      onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <TD><button onClick={() => onSelectSymbol(row.q.symbol)} style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.accent, cursor: "pointer", padding: 0 }}>{row.q.symbol}</button></TD>
                    <TD right>${price.toFixed(2)}</TD>
                    <TD right color={distTo50 != null ? (distTo50 >= 0 ? C.green : C.red) : C.textDim}>
                      {distTo50 != null ? `${distTo50 >= 0 ? "+" : ""}${distTo50.toFixed(1)}%` : "—"}
                    </TD>
                    <TD right color={row.scored.rvol >= 1.5 ? C.green : C.textDim}>{row.scored.rvol.toFixed(2)}x</TD>
                    <TD right><ScoreBadge score={row.scored.score} /></TD>
                    <TD><button onClick={async () => {
                      const d50str = distTo50 != null ? `${distTo50 >= 0 ? "+" : ""}${distTo50.toFixed(1)}% vs 50D` : "";
                      const msg = `🔄 21 EMA PULLBACK — ${row.q.symbol}\nPrice: $${price.toFixed(2)}  ${d50str}\nRVOL: ${row.scored.rvol.toFixed(2)}x  Score: ${row.scored.score}\nSetup: Pulling back to 21 EMA / 50D support — watch for green bounce`;
                      await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }).catch(() => {});
                    }} style={{ border: "1px solid #2563eb55", background: "#2563eb12", color: "#2563eb", borderRadius: 3, padding: "2px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer", fontWeight: 700 }}>📱</button></TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, lineHeight: 1.6 }}>
              Qualifies: price above 200 EMA · EMA 9 &gt; 21 &gt; 50 · pulling near 50D<br />
              low selling volume · green bounce from support
            </div>
          </div>
        </div>
      </div>

      {/* ── Pre-Breakout Watchlist ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SectionHeader title="PRE-BREAKOUT WATCHLIST" count={preBreakout.length} color={C.amber} badge="within 5% of 52W high · compression building" />
          {preBreakout.length > 0 && (
            <button onClick={async () => {
              const lines = preBreakout.slice(0, 8).map(r =>
                `• ${r.q.symbol}  $${Number(r.q.price||0).toFixed(2)}  Score ${r.scored.score}  ${r.scored.distToHigh.toFixed(1)}% to ${r.yHigh > 0 ? "$" + r.yHigh.toFixed(2) : "52W high"}  RVOL ${r.scored.rvol.toFixed(2)}x`
              ).join("\n");
              const msg = `🚀 PRE-BREAKOUT WATCHLIST (${preBreakout.length})\nStocks within 5% of 52W high with compression building:\n\n${lines}`;
              await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }).catch(() => {});
            }} style={{ border: "1px solid #2563eb55", background: "#2563eb12", color: "#2563eb", borderRadius: 4, padding: "4px 12px", fontFamily: MONO, fontSize: 9, cursor: "pointer", fontWeight: 800 }}>📱 PUSH LIST</button>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <TH>TICKER</TH><TH right>PRICE</TH><TH right>BREAKOUT LEVEL</TH>
                <TH right>DIST %</TH><TH right>RVOL</TH><TH right>ATR%</TH>
                <TH right>REL STR</TH><TH right>SCORE</TH><TH>PLAN</TH><TH>SEND</TH>
              </tr>
            </thead>
            <tbody>
              {preBreakout.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 16, fontFamily: MONO, fontSize: 11, color: C.textDim, textAlign: "center" }}>No pre-breakout candidates in watchlist.</td></tr>
              )}
              {preBreakout.slice(0, 10).map(row => {
                const { q, scored, setup, atr, yHigh, rr } = row;
                const price = Number(q.price || 0);
                const relStr = scored.relRS;
                const plan = scored.distToHigh <= 1.5
                  ? "Ready to break — watch for volume surge"
                  : scored.distToHigh <= 3
                  ? "Building base — wait for catalyst"
                  : "Stalk — not ready yet";
                return (
                  <tr key={q.symbol}
                      onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <TD><button onClick={() => onSelectSymbol(q.symbol)} style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, cursor: "pointer", padding: 0 }}>{q.symbol}</button></TD>
                    <TD right>${price.toFixed(2)}</TD>
                    <TD right color={C.amber}>{yHigh > 0 ? `$${yHigh.toFixed(2)}` : "—"}</TD>
                    <TD right color={scored.distToHigh <= 2 ? C.green : scored.distToHigh <= 4 ? C.amber : C.textDim}>
                      {yHigh > 0 ? `${scored.distToHigh.toFixed(1)}%` : "—"}
                    </TD>
                    <TD right color={scored.rvol >= 1.5 ? C.green : C.textDim}>{scored.rvol.toFixed(2)}x</TD>
                    <TD right color={atr <= 1.5 ? C.green : atr <= 3 ? C.amber : C.textDim}>{atr.toFixed(2)}%</TD>
                    <TD right color={relStr >= 0 ? C.green : C.red}>{relStr >= 0 ? "+" : ""}{relStr.toFixed(2)}%</TD>
                    <TD right><ScoreBadge score={scored.score} /></TD>
                    <TD mono={false}><span style={{ fontSize: 10, color: scored.distToHigh <= 1.5 ? C.green : scored.distToHigh <= 3 ? C.amber : C.textDim }}>{plan}</span></TD>
                    <TD><button onClick={async () => {
                      const msg = `🚀 PRE-BREAKOUT — ${q.symbol}\nPrice: $${price.toFixed(2)}  Score: ${scored.score}\nBreakout level: ${yHigh > 0 ? "$" + yHigh.toFixed(2) : "—"}  Dist: ${scored.distToHigh.toFixed(1)}%\nRVOL: ${scored.rvol.toFixed(2)}x  Rel Str: ${relStr >= 0 ? "+" : ""}${relStr.toFixed(2)}%\nPlan: ${plan}`;
                      await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }).catch(() => {});
                    }} style={{ border: "1px solid #2563eb55", background: "#2563eb12", color: "#2563eb", borderRadius: 3, padding: "2px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer", fontWeight: 700 }}>📱</button></TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Avoid / Trap Zone ── */}
      <div style={{ background: C.card, border: `1px solid ${C.red}33`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SectionHeader title="AVOID / TRAP ZONE" count={trapZones.length} color={C.red} badge="do not chase these" />
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.red }}>⚠ Extended · weak · below VWAP · score &lt; 50</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><TH>TICKER</TH><TH right>PRICE</TH><TH right>CHG%</TH><TH right>SCORE</TH><TH>FLAGS</TH></tr>
            </thead>
            <tbody>
              {trapZones.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 14, fontFamily: MONO, fontSize: 11, color: C.textDim, textAlign: "center" }}>No trap zones — market looks clean.</td></tr>
              )}
              {trapZones.slice(0, 8).map(row => {
                const chg = Number(row.q.changesPercentage || 0);
                return (
                  <tr key={row.q.symbol}
                      onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <TD mono><span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.textSec }}>{row.q.symbol}</span></TD>
                    <TD right>${Number(row.q.price || 0).toFixed(2)}</TD>
                    <TD right color={chg >= 0 ? C.textSec : C.red}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</TD>
                    <TD right><span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.red }}>{row.scored.score}</span></TD>
                    <TD mono={false}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {row.scored.flags.map((f, i) => (
                          <span key={i} style={{ fontFamily: MONO, fontSize: 8, color: C.red, background: `${C.red}14`, padding: "1px 5px", borderRadius: 3 }}>{f}</span>
                        ))}
                      </div>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Scoring Legend ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px" }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.07em", marginBottom: 10 }}>EARLY ENTRY SCORING MODEL</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
          {[
            { label: "A+ Early Entry", range: "85–100", color: "#00c97a" },
            { label: "Watch Closely",  range: "75–84",  color: "#ffb340" },
            { label: "Setup Forming",  range: "65–74",  color: "#607494" },
            { label: "Ignore / Avoid", range: "0–64",   color: "#ff4d63" },
          ].map(({ label, range, color }) => (
            <div key={label} style={{ border: `1px solid ${color}44`, borderRadius: 6, padding: "8px 12px", background: `${color}0a` }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color, fontWeight: 800 }}>{label}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 2 }}>Score {range}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {[
            ["Above VWAP", "15 pts"],
            ["EMA Alignment", "15 pts"],
            ["Near Breakout", "15 pts"],
            ["RVOL ≥ 1.5x", "15 pts"],
            ["Relative Strength", "15 pts"],
            ["Pullback Support", "10 pts"],
            ["OBV Accumulation", "10 pts"],
            ["Catalyst Awareness", "5 pts"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", background: C.surface, borderRadius: 4, border: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.textSec }}>{k}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.accent, fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 9, color: C.textDim }}>
          Data source: watchlist live quotes · VWAP proxy = price vs open · EMA proxy = 50D/200D SMA · Plug in TradingView/Polygon webhooks to upgrade to real VWAP + EMA values
        </div>
      </div>

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [appUnlocked, setAppUnlocked] = useState(true);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  const [unlockInput, setUnlockInput] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [apiKey, setApiKey] = useState("YAHOO_LOCAL");
  const [watchlistSymbols, setWatchlistSymbols] = useState(WATCHLIST_SYMBOLS);
  const [watchlistInput, setWatchlistInput] = useState(WATCHLIST_SYMBOLS.join(","));
  const [watchlistNotes, setWatchlistNotes] = useState(() => { try { return JSON.parse(localStorage.getItem("ax_wl_notes") || "{}"); } catch { return {}; } });
  const [openNoteSymbol, setOpenNoteSymbol] = useState(null);
  const [openAlertSymbol, setOpenAlertSymbol] = useState(null);
  const [wlAlertPrice, setWlAlertPrice] = useState("");
  const [wlAlertDir, setWlAlertDir] = useState("above");
  const [customAlertSymbol, setCustomAlertSymbol] = useState("");
  const [customAlertMin, setCustomAlertMin] = useState("70");
  const [customAlerts, setCustomAlerts] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [providerKeys, setProviderKeys] = useState(DEFAULT_SETTINGS.providerKeys);
  const [flowFilters, setFlowFilters] = useState(DEFAULT_SETTINGS.flowFilters);
  const [riskAccount, setRiskAccount] = useState("100000");
  const [riskPct, setRiskPct] = useState("1");
  const [riskEntry, setRiskEntry] = useState("100");
  const [riskStop, setRiskStop] = useState("95");
  const [riskSide, setRiskSide] = useState("long");
  const [riskMaxPosPct, setRiskMaxPosPct] = useState("20");
  const [riskCorrCap, setRiskCorrCap] = useState("0.80");
  const [riskAtrPct, setRiskAtrPct] = useState("4.0");
  const [riskSlipBps, setRiskSlipBps] = useState("10");
  const [riskSetupQuality, setRiskSetupQuality] = useState("A");
  const [watchlistData, setWatchlistData] = useState([]);
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
  const [terminalSymbol, setTerminalSymbol] = useState(WATCHLIST_SYMBOLS[0]);
  const [terminalTf, setTerminalTf] = useState("1D");
  const [terminalCandles, setTerminalCandles] = useState(null);
  const [terminalCandlesLoading, setTerminalCandlesLoading] = useState(false);
  const [terminalPanelSymbols, setTerminalPanelSymbols] = useState(WATCHLIST_SYMBOLS.slice(0, 4));
  const [terminalPanelCandles, setTerminalPanelCandles] = useState({});
  const [terminalFundamentals, setTerminalFundamentals] = useState(null);
  const [selectedFundamentals, setSelectedFundamentals] = useState(null);
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
  const [marketReportOpen, setMarketReportOpen] = useState(false);
  const [marketReportText, setMarketReportText] = useState("");
  const [marketReportData, setMarketReportData] = useState(null);
  const [marketReportGeneratedAt, setMarketReportGeneratedAt] = useState("");
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
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(false);
  const [portfolioHoldings, setPortfolioHoldings] = useState(DEFAULT_PORTFOLIO);
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
  const [sortDir, setSortDir] = useState("desc");
  const intervalRef = useRef(null);
  const seenTriggeredAlerts = useRef(new Set());
  const lastAlertsTabVisit = useRef(0);
  const [triggeredAlertBadge, setTriggeredAlertBadge] = useState(0);

  // ── Alert Analyzer state
  const [analyzerInput, setAnalyzerInput] = useState("");
  const [analyzerResults, setAnalyzerResults] = useState([]);
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
  const [scanLoading,  setScanLoading]  = useState(false);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 30 });
  const [scanExpanded, setScanExpanded] = useState(null);
  const [scanLastRun,  setScanLastRun]  = useState(null);
  const [scanError,    setScanError]    = useState(null);
  const [scanDeepData, setScanDeepData] = useState({});
  const [scanDeepLoad, setScanDeepLoad] = useState({});

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

  // Prayer time arrival — plays a Web Audio beep when prayer time hits (if athanSoundOn)
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
            try {
              const ctx = new (window.AudioContext || window.webkitAudioContext)();
              // Three-tone athan chime: 880Hz → 1100Hz → 880Hz
              [[880, 0, 0.4], [1100, 0.45, 0.4], [880, 0.9, 0.6]].forEach(([freq, startAt, dur]) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = "sine";
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.22, ctx.currentTime + startAt);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + dur);
                osc.start(ctx.currentTime + startAt);
                osc.stop(ctx.currentTime + startAt + dur);
                osc.onended = () => { try { ctx.close(); } catch {} };
              });
            } catch {}
          }
        }
      });
    }, 15000);
    return () => clearInterval(t);
  }, [athanTimes, athanSoundOn]);

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
  const FIVEX_TICKERS = ["BBAI","SERV","SMR","RDW","NNE","LUNR","PL","SYM","OKLO","ASTS","PLTR","RKLB","NBIS","VRT","PWR","GSAT","APLD","ACHR","SOUN","RGTI","CORZ","PATH","KTOS","IONQ","SMCI","CCJ","BWXT","VST","CEG","GEV"];
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
  }, [activeTab]);
  // Auto-refresh live prices every 5 min while 5X PLAYS tab is open
  useEffect(() => {
    if (activeTab !== "fivex") return;
    const t = setInterval(() => { if (!fivexLoading) fetchLivePrices(); }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [activeTab, fivexLoading]);

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
    } catch (e) {
      setScanError(e.message);
    }
    setScanLoading(false);
  }

  async function loadDeepDive(ticker) {
    if (scanDeepData[ticker]) return;
    setScanDeepLoad(prev => ({ ...prev, [ticker]: true }));
    try {
      const [fundR, newsR] = await Promise.allSettled([
        fetch(`/api/yahoo/fundamentals?symbol=${ticker}`).then(r => r.json()),
        fetch(`/api/yahoo/news?tickers=${ticker}&limit=6`).then(r => r.json()),
      ]);
      setScanDeepData(prev => ({
        ...prev,
        [ticker]: {
          fundamentals: fundR.status === "fulfilled" ? fundR.value : null,
          news: newsR.status === "fulfilled" ? (Array.isArray(newsR.value) ? newsR.value : []) : [],
        },
      }));
    } catch {}
    setScanDeepLoad(prev => ({ ...prev, [ticker]: false }));
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
        setRiskAccount(String(saved.riskSettings.riskAccount || "100000"));
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
      return () => { cancelled = true; };
    }
    fetchFundamentals(selectedStock.symbol, providerKeys)
      .then((f) => {
        if (!cancelled) setSelectedFundamentals(f || null);
      })
      .catch(() => {
        if (!cancelled) setSelectedFundamentals(null);
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
      TERMINAL: "terminal",
      MACRO: "macro",
      NEWS: "news",
      EARNINGS: "earnings",
      TV: "tv",
      LIVETV: "tv",
      ALERTS: "alerts",
      AGENT: "agent",
      AI: "agent",
      WORKFLOW: "workflow",
      FLOW: "flow",
      PORTFOLIO: "portfolio",
      SCANNER: "scanner",
      BACKTEST: "backtest",
      ROTATION: "rotation",
      TOOLS: "tools",
      SECTORS: "sectors",
      JOURNAL: "journal",
      ANALYZER: "analyzer",
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
        setActiveTab("terminal");
        setTerminalTf(tf);
      }
      return;
    }

    if (normalized.startsWith("LAYOUT ")) {
      const l = normalized.replace("LAYOUT ", "").trim();
      if (["1", "2", "4"].includes(l)) {
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
      setActiveTab("terminal");
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
      if (Array.isArray(wl) && wl.length > 0) setWatchlistData(wl);
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
      if (hardError) setError(hardError);
    } else {
      setDataSourceStatus("degraded");
      setError(hardError || "Data fetch warning: no live quotes returned (use Finnhub/FMP keys in Tools).");
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

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const handleSymbolSearch = useCallback(() => {
    const symbol = symbolSearch.trim().toUpperCase();
    if (!symbol) return;
    if (!/^[A-Z.\-]{1,10}$/.test(symbol)) return;
    if (!watchlistSymbols.includes(symbol)) {
      const next = [symbol, ...watchlistSymbols].slice(0, 30);
      setWatchlistSymbols(next);
      setWatchlistInput(next.join(","));
    }
    setTerminalSymbol(symbol);
    setActiveTab("terminal");
    setSymbolSearch("");
    setLoading(true);
    fetchAll(apiKey).finally(() => setLoading(false));
  }, [symbolSearch, watchlistSymbols, apiKey, fetchAll]);
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
        const live = watchlistData.find((q) => q.symbol === symbol) || null;
        const price = Number(live?.price || 0);
        const marketValue = shares * price;
        const costBasis = shares * avgCost;
        const pnl = marketValue - costBasis;
        const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
        return { idx, symbol, shares, avgCost, live, marketValue, costBasis, pnl, pnlPct };
      })
      .filter((r) => r.symbol);
  }, [portfolioHoldings, watchlistData]);
  const portfolioSummary = useMemo(() => {
    const totalValue = portfolioRows.reduce((sum, r) => sum + r.marketValue, 0);
    const totalCost = portfolioRows.reduce((sum, r) => sum + r.costBasis, 0);
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const winners = portfolioRows.filter((r) => r.pnl >= 0).length;
    const losers = portfolioRows.filter((r) => r.pnl < 0).length;
    return { totalValue, totalCost, totalPnl, totalPnlPct, winners, losers };
  }, [portfolioRows]);
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
  const generateMarketReport = useCallback(async () => {
    const nowLabel = new Date().toLocaleString();
    const getMacro = (sym) => macroData.find((m) => m.symbol === sym) || null;
    const spy = getMacro("SPY");
    const qqq = getMacro("QQQ");
    const iwm = getMacro("IWM");
    const vix = getMacro("VIXY");
    const usd = getMacro("UUP");
    const oil = getMacro("USO");
    const btc = getMacro("BTCUSD");

    const wl = [...(watchlistData || [])].filter((q) => Number(q.price || 0) > 0);
    const advancers = wl.filter((q) => Number(q.changesPercentage || 0) > 0).length;
    const decliners = wl.filter((q) => Number(q.changesPercentage || 0) < 0).length;
    const breadthPct = wl.length ? Math.round((advancers / wl.length) * 100) : 0;
    const topGainers = [...wl].sort((a, b) => Number(b.changesPercentage || 0) - Number(a.changesPercentage || 0)).slice(0, 5);
    const topLosers = [...wl].sort((a, b) => Number(a.changesPercentage || 0) - Number(b.changesPercentage || 0)).slice(0, 3);

    const sectors = [...(sectorData || [])];
    const sectorLeaders = sectors.sort((a, b) => Number(b.changesPercentage || 0) - Number(a.changesPercentage || 0)).slice(0, 3);
    const sectorLaggers = [...sectors].sort((a, b) => Number(a.changesPercentage || 0) - Number(b.changesPercentage || 0)).slice(0, 3);

    const spyChg = Number(spy?.changesPercentage || 0);
    const qqqChg = Number(qqq?.changesPercentage || 0);
    const iwmChg = Number(iwm?.changesPercentage || 0);
    const btcChg = Number(btc?.changesPercentage || 0);
    const vixChg = Number(vix?.changesPercentage || 0);
    const usdChg = Number(usd?.changesPercentage || 0);
    const oilChg = Number(oil?.changesPercentage || 0);
    const stockIndexAvg = (spyChg + qqqChg + iwmChg) / 3;

    const priAlerts = [...(combinedAlerts || [])].slice(0, 5);
    const headlines = [...(newsData || [])].slice(0, 5);
    const earningsFocusSymbols = [...new Set([
      ...topGainers.map((q) => q.symbol),
      ...topLosers.map((q) => q.symbol),
      ...rotationRank.slice(0, 5).map((q) => q.symbol),
    ].filter(Boolean))].slice(0, 10);

    const earningsWatchRaw = await Promise.all(earningsFocusSymbols.map(async (symbol) => {
      const wlRow = wl.find((q) => q.symbol === symbol);
      let earningsDate = wlRow?.earningsDate || null;
      if (!earningsDate) {
        try {
          const f = await withClientTimeout(fetchFundamentals(symbol, providerKeys), 5000, null);
          earningsDate = f?.earningsDate || null;
        } catch {}
      }

      const eventTs = earningsDate ? new Date(earningsDate).getTime() : NaN;
      const validDate = Number.isFinite(eventTs);
      const now = new Date();
      const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const eventStart = validDate ? new Date(new Date(eventTs).getFullYear(), new Date(eventTs).getMonth(), new Date(eventTs).getDate()).getTime() : NaN;
      const dayDiff = validDate ? Math.round((eventStart - nowStart) / (24 * 60 * 60 * 1000)) : null;
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
        earningsDate: validDate ? new Date(eventTs).toISOString() : null,
        dayDiff,
        timing,
      };
    }));
    const earningsWatch = earningsWatchRaw
      .sort((a, b) => {
        const av = a.dayDiff == null ? 9999 : Math.abs(a.dayDiff);
        const bv = b.dayDiff == null ? 9999 : Math.abs(b.dayDiff);
        return av - bv;
      })
      .slice(0, 8);

    let marketScore = 50;
    marketScore += Math.max(-20, Math.min(20, stockIndexAvg * 8));
    marketScore += (breadthPct - 50) * 0.5;
    marketScore += flowBias === "CALL BIAS" ? 8 : flowBias === "PUT BIAS" ? -8 : 0;
    marketScore += vixChg <= 0 ? 5 : -5;
    marketScore += usdChg <= 0 ? 4 : -4;
    marketScore += oilChg <= 0 ? 2 : -2;
    marketScore += btcChg >= 0 ? 3 : -3;
    marketScore = Math.max(0, Math.min(100, Math.round(marketScore)));

    const verdict = marketScore >= 62 ? "BULLISH" : marketScore <= 38 ? "BEARISH" : "NEUTRAL";
    const conviction = Math.abs(marketScore - 50) >= 20 ? "HIGH" : Math.abs(marketScore - 50) >= 10 ? "MEDIUM" : "LOW";
    const projection1d = verdict === "BULLISH"
      ? "Bias up next 1D; buy pullbacks in high-RS leaders."
      : verdict === "BEARISH"
      ? "Bias down next 1D; fade weak bounces and reduce gross."
      : "Chop/range likely next 1D; only A+ setups.";
    const projection1w = verdict === "BULLISH"
      ? "Constructive 1W backdrop if breadth stays above 55% and VIX/US dollar stay contained."
      : verdict === "BEARISH"
      ? "Fragile 1W backdrop unless breadth recovers and macro pressure cools."
      : "Balanced 1W backdrop; wait for leadership expansion or clear risk-off break.";
    const macroVsStocksCrypto =
      `Stocks ${stockIndexAvg >= 0 ? "outperforming" : "under pressure"} (${stockIndexAvg >= 0 ? "+" : ""}${stockIndexAvg.toFixed(2)} avg) | ` +
      `Crypto ${btcChg >= 0 ? "confirming risk-on" : "diverging risk-off"} (${btcChg >= 0 ? "+" : ""}${btcChg.toFixed(2)}%) | ` +
      `Macro pressure: VIX ${vixChg >= 0 ? "+" : ""}${vixChg.toFixed(2)}%, USD ${usdChg >= 0 ? "+" : ""}${usdChg.toFixed(2)}%, Oil ${oilChg >= 0 ? "+" : ""}${oilChg.toFixed(2)}%.`;
    const sectorPositive = sectors.filter((s) => Number(s.changesPercentage || 0) > 0).length;
    const sectorNegative = sectors.filter((s) => Number(s.changesPercentage || 0) < 0).length;
    const nearEvents = (econCalendarRows || []).slice(0, 3).map((e) => `${e.title} (${e.phase || "upcoming"})`);
    const macroRiskCount = (macroSignalFlags.red || []).length + (macroEventAlerts || []).length;
    const alignmentScoreRaw =
      (stockIndexAvg >= 0 ? 34 : 18) +
      (btcChg >= 0 ? 22 : 10) +
      (vixChg <= 0 ? 16 : 8) +
      (usdChg <= 0 ? 14 : 7) +
      (oilChg <= 0 ? 14 : 7);
    const alignmentScore = Math.max(0, Math.min(100, Math.round(alignmentScoreRaw)));
    const bullProb = Math.max(5, Math.min(90, marketScore));
    const bearProb = Math.max(5, Math.min(90, 100 - marketScore));
    const baseProb = Math.max(5, Math.min(80, 100 - Math.abs(marketScore - 50) * 1.5));
    const doNow = verdict === "BULLISH"
      ? [
          "Focus long exposure in RS leaders with RVOL > 1.2x.",
          "Buy pullbacks to support only after volume confirmation.",
          "Keep risk concentrated in top 3 strongest setups.",
        ]
      : verdict === "BEARISH"
      ? [
          "Reduce gross and prioritize capital preservation.",
          "Favor defensive/low-beta names and tactical hedges.",
          "Take quick profits and avoid overstaying bounces.",
        ]
      : [
          "Trade smaller size with strict A+ setup filter.",
          "Wait for breadth/flow expansion before adding risk.",
          "Run paired ideas (leader vs laggard) to reduce beta.",
        ];
    const avoidNow = verdict === "BULLISH"
      ? [
          "Chasing late extensions without pullback structure.",
          "Crowded low-liquidity names with weak flow support.",
        ]
      : verdict === "BEARISH"
      ? [
          "Catching falling knives in broken trend names.",
          "Oversized swing risk ahead of macro events.",
        ]
      : [
          "Forcing directional bets in low-conviction tape.",
          "Ignoring event risk windows around high-impact data.",
        ];
    const watchNow = [
      `Sector breadth: ${sectorPositive} positive / ${sectorNegative} negative`,
      `Flow bias: ${flowBias} (calls ${formatNum(flowCallNotional)} vs puts ${formatNum(flowPutNotional)})`,
      `Crypto tone: BTC ${btcChg >= 0 ? "+" : ""}${btcChg.toFixed(2)}% | Alt strength ${cryptoSnapshot.altStrength >= 0 ? "+" : ""}${cryptoSnapshot.altStrength.toFixed(2)}%`,
    ];
    const flipBullTrigger = "Bullish upgrade if breadth > 58%, VIX cools, and call flow expands.";
    const flipBearTrigger = "Bearish downgrade if breadth < 45%, VIX/US dollar rise, and put flow dominates.";
    const confidenceDrivers = [
      ...((macroSignalFlags.green || []).slice(0, 3).map((x) => ({ tone: "green", text: x }))),
      ...((macroSignalFlags.red || []).slice(0, 3).map((x) => ({ tone: "red", text: x }))),
    ];
    const longIdeas = rotationRank
      .filter((q) => Number(q.relVsSpy || 0) > 0 && Number(q.rvol || 0) >= 1)
      .slice(0, 5)
      .map((q) => `${q.symbol} (RS ${Number(q.relVsSpy || 0) >= 0 ? "+" : ""}${Number(q.relVsSpy || 0).toFixed(2)}%, RVOL ${Number(q.rvol || 0).toFixed(2)}x)`);
    const shortIdeas = [...rotationRank]
      .sort((a, b) => Number(a.relVsSpy || 0) - Number(b.relVsSpy || 0))
      .filter((q) => Number(q.relVsSpy || 0) < 0)
      .slice(0, 5)
      .map((q) => `${q.symbol} (RS ${Number(q.relVsSpy || 0).toFixed(2)}%, RVOL ${Number(q.rvol || 0).toFixed(2)}x)`);
    const riskPctNum = Math.max(0, Number(riskPct || 1));
    const riskAccountNum = Math.max(0, Number(riskAccount || 0));
    const dailyRiskBudget = (riskAccountNum * riskPctNum) / 100;
    const portfolioAction = verdict === "BULLISH"
      ? `Increase gross risk selectively (+10% to +20%) with max daily risk budget ${formatNum(dailyRiskBudget)}.`
      : verdict === "BEARISH"
      ? `Cut gross risk (-20% to -40%), rotate defensive, keep daily loss hard-stop near ${formatNum(dailyRiskBudget)}.`
      : `Keep balanced exposure, cap position sizing, and preserve daily risk budget near ${formatNum(dailyRiskBudget)}.`;
    const cryptoRegimeNote =
      `BTC ${btcChg >= 0 ? "supportive" : "weak"} (${btcChg >= 0 ? "+" : ""}${btcChg.toFixed(2)}%), ` +
      `BTC dominance proxy ${Number(cryptoSnapshot.btcDomProxy || 0).toFixed(1)}%, ` +
      `Alt strength ${Number(cryptoSnapshot.altStrength || 0) >= 0 ? "+" : ""}${Number(cryptoSnapshot.altStrength || 0).toFixed(2)}%.`;
    const reportSymbols = Array.from(new Set([
      ...topGainers.map((q) => q.symbol),
      ...topLosers.map((q) => q.symbol),
      ...rotationRank.slice(0, 5).map((q) => q.symbol),
      "SPY", "QQQ", "IWM", "BTCUSD",
    ].filter(Boolean))).slice(0, 14);
    const tradingViewLinks = reportSymbols.map((symbol) => ({
      symbol,
      url: getTradingViewUrl(symbol),
    }));

    const lines = [];
    lines.push("AM TRADING - MARKET OVERALL REPORT");
    lines.push(`Generated: ${nowLabel}`);
    lines.push(`Session: ${marketSession} | Regime: ${regime} | Macro Tone: ${macroTone}`);
    lines.push("");
    lines.push("0) EXECUTIVE VERDICT (READ THIS FIRST)");
    lines.push(`Market status: ${verdict} (score ${marketScore}/100, conviction ${conviction})`);
    lines.push(`Projection 1D: ${projection1d}`);
    lines.push(`Projection 1W: ${projection1w}`);
    lines.push(`Macro vs Stocks vs Crypto: ${macroVsStocksCrypto}`);
    lines.push(`Do now: ${verdict === "BULLISH" ? "Press leaders with confirmation and tight invalidation." : verdict === "BEARISH" ? "Cut weak names, lower size, protect capital." : "Trade smaller and wait for clear expansion."}`);
    lines.push(`Avoid now: ${verdict === "BULLISH" ? "Chasing extended candles without volume confirmation." : verdict === "BEARISH" ? "Bottom-fishing momentum breakdowns." : "Overtrading low-quality setups in noise."}`);
    lines.push("");
    lines.push("0.1) DECISION MATRIX");
    lines.push(`Scenario probabilities: Bull ${bullProb}% | Base ${baseProb}% | Bear ${bearProb}%`);
    lines.push(`Cross-asset alignment score: ${alignmentScore}/100`);
    lines.push(`Macro risk count: ${macroRiskCount} active flags/events`);
    lines.push(`Event window (next): ${nearEvents.join(" | ") || "No high-impact events in immediate window"}`);
    lines.push(`Do now: ${doNow.join(" | ")}`);
    lines.push(`Avoid now: ${avoidNow.join(" | ")}`);
    lines.push(`Watch now: ${watchNow.join(" | ")}`);
    lines.push(`Trigger to turn more bullish: ${flipBullTrigger}`);
    lines.push(`Trigger to turn more bearish: ${flipBearTrigger}`);
    lines.push("");
    lines.push("0.2) PORTFOLIO + POSITIONING");
    lines.push(`Portfolio action: ${portfolioAction}`);
    lines.push(`Long ideas: ${longIdeas.join(" | ") || "None"}`);
    lines.push(`Short/hedge ideas: ${shortIdeas.join(" | ") || "None"}`);
    lines.push(`Crypto regime: ${cryptoRegimeNote}`);
    lines.push(`Confidence drivers: ${confidenceDrivers.map((d) => `${d.tone.toUpperCase()}: ${d.text}`).join(" | ") || "None"}`);
    lines.push("");
    lines.push("0.3) CHART LINKS (TRADINGVIEW)");
    lines.push(...tradingViewLinks.map((x, i) => `${i + 1}. ${x.symbol}: ${x.url}`));
    lines.push("");
    lines.push("1) INDEX + MACRO SNAPSHOT");
    lines.push(`SPY ${spy ? `${Number(spy.changesPercentage || 0) >= 0 ? "+" : ""}${Number(spy.changesPercentage || 0).toFixed(2)}%` : "N/A"} | QQQ ${qqq ? `${Number(qqq.changesPercentage || 0) >= 0 ? "+" : ""}${Number(qqq.changesPercentage || 0).toFixed(2)}%` : "N/A"} | IWM ${iwm ? `${Number(iwm.changesPercentage || 0) >= 0 ? "+" : ""}${Number(iwm.changesPercentage || 0).toFixed(2)}%` : "N/A"}`);
    lines.push(`VIX proxy ${vix ? `${Number(vix.changesPercentage || 0) >= 0 ? "+" : ""}${Number(vix.changesPercentage || 0).toFixed(2)}%` : "N/A"} | USD ${usd ? `${Number(usd.changesPercentage || 0) >= 0 ? "+" : ""}${Number(usd.changesPercentage || 0).toFixed(2)}%` : "N/A"} | Oil ${oil ? `${Number(oil.changesPercentage || 0) >= 0 ? "+" : ""}${Number(oil.changesPercentage || 0).toFixed(2)}%` : "N/A"} | BTC ${btc ? `${Number(btc.changesPercentage || 0) >= 0 ? "+" : ""}${Number(btc.changesPercentage || 0).toFixed(2)}%` : "N/A"}`);
    lines.push("");
    lines.push("2) BREADTH + LEADERSHIP");
    lines.push(`Breadth: ${advancers} advancers / ${decliners} decliners (${breadthPct}% positive)`);
    lines.push(`Top gainers: ${topGainers.map((q) => `${q.symbol} ${Number(q.changesPercentage || 0) >= 0 ? "+" : ""}${Number(q.changesPercentage || 0).toFixed(2)}%`).join(" | ") || "N/A"}`);
    lines.push(`Top losers: ${topLosers.map((q) => `${q.symbol} ${Number(q.changesPercentage || 0).toFixed(2)}%`).join(" | ") || "N/A"}`);
    lines.push(`Sector leaders: ${sectorLeaders.map((s) => `${s.symbol} ${Number(s.changesPercentage || 0) >= 0 ? "+" : ""}${Number(s.changesPercentage || 0).toFixed(2)}%`).join(" | ") || "N/A"}`);
    lines.push(`Sector laggards: ${sectorLaggers.map((s) => `${s.symbol} ${Number(s.changesPercentage || 0).toFixed(2)}%`).join(" | ") || "N/A"}`);
    lines.push("");
    lines.push("3) SIGNALS + EVENT RISK");
    lines.push(`Macro green flags: ${(macroSignalFlags.green || []).slice(0, 3).join(" | ") || "None"}`);
    lines.push(`Macro red flags: ${(macroSignalFlags.red || []).slice(0, 3).join(" | ") || "None"}`);
    lines.push(`Auto risk events (next 3h): ${macroEventAlerts.length}`);
    lines.push(`Flow bias: ${flowBias} (Calls ${formatNum(flowCallNotional)} vs Puts ${formatNum(flowPutNotional)})`);
    lines.push(`Priority alerts: ${priAlerts.map((a) => `${a.symbol}(${a.score})`).join(" | ") || "None"}`);
    lines.push("");
    lines.push("4) NEWS + CATALYSTS");
    lines.push(`Upgrades: ${(newsIntel.upgrades || []).length} | Downgrades: ${(newsIntel.downgrades || []).length}`);
    lines.push(...headlines.map((n, i) => `${i + 1}. ${n.ticker || "MKT"} - ${n.title || "Headline unavailable"}`));
    lines.push("");
    lines.push("5) EARNINGS WATCH");
    lines.push(`Upcoming within 14d: ${earningsWatch.filter((e) => Number.isFinite(e.dayDiff) && e.dayDiff >= 0 && e.dayDiff <= 14).length}`);
    lines.push(...earningsWatch.map((e, i) => {
      const dateLabel = e.earningsDate ? new Date(e.earningsDate).toLocaleDateString() : "TBD";
      return `${i + 1}. ${e.symbol} - ${dateLabel} (${e.timing})`;
    }));
    lines.push("");
    lines.push("6) EXECUTION FOCUS");
    lines.push(`Rotation leaders: ${rotationRank.slice(0, 5).map((q) => `${q.symbol}(RS ${Number(q.relVsSpy || 0) >= 0 ? "+" : ""}${Number(q.relVsSpy || 0).toFixed(2)}%, RVOL ${Number(q.rvol || 0).toFixed(2)}x)`).join(" | ") || "N/A"}`);
    lines.push(`Suggested posture: ${regime === "Risk-On" ? "Lean long on high-RS names with confirmation." : regime === "Risk-Off" ? "Reduce gross, tighten stops, prioritize defense." : "Balanced posture; trade selective A+ setups only."}`);
    lines.push("");
    lines.push("Note: Decision-support only, not financial advice.");

    setMarketReportData({
      verdict,
      marketScore,
      conviction,
      projection1d,
      projection1w,
      macroVsStocksCrypto,
      alignmentScore,
      scenario: { bull: bullProb, base: baseProb, bear: bearProb },
      macroRiskCount,
      eventWindow: nearEvents,
      doNow,
      avoidNow,
      watchNow,
      flipBullTrigger,
      flipBearTrigger,
      confidenceDrivers,
      longIdeas,
      shortIdeas,
      portfolioAction,
      dailyRiskBudget,
      cryptoRegimeNote,
      tradingViewLinks,
      sectorBreadth: { positive: sectorPositive, negative: sectorNegative },
      session: marketSession,
      regime,
      macroTone,
      indexRows: [
        { label: "SPY", value: Number(spy?.changesPercentage || 0) },
        { label: "QQQ", value: Number(qqq?.changesPercentage || 0) },
        { label: "IWM", value: Number(iwm?.changesPercentage || 0) },
        { label: "VIX", value: Number(vix?.changesPercentage || 0), invert: true },
        { label: "USD", value: Number(usd?.changesPercentage || 0), invert: true },
        { label: "OIL", value: Number(oil?.changesPercentage || 0), invert: true },
        { label: "BTC", value: Number(btc?.changesPercentage || 0) },
      ],
      breadth: { advancers, decliners, breadthPct },
      topGainers,
      topLosers,
      sectorLeaders,
      sectorLaggers,
      macroGreen: (macroSignalFlags.green || []).slice(0, 4),
      macroRed: (macroSignalFlags.red || []).slice(0, 4),
      flowBias,
      flowCallNotional,
      flowPutNotional,
      priAlerts,
      upgradesCount: (newsIntel.upgrades || []).length,
      downgradesCount: (newsIntel.downgrades || []).length,
      headlines,
      earningsWatch,
      rotationTop: rotationRank.slice(0, 5),
      posture: regime === "Risk-On"
        ? "Lean long on high-RS names with confirmation."
        : regime === "Risk-Off"
        ? "Reduce gross, tighten stops, prioritize defense."
        : "Balanced posture; trade selective A+ setups only.",
    });
    setMarketReportGeneratedAt(nowLabel);
    setMarketReportText(lines.join("\n"));
    setMarketReportOpen(true);
  }, [macroData, watchlistData, sectorData, combinedAlerts, newsData, marketSession, regime, macroTone, macroSignalFlags, macroEventAlerts, econCalendarRows, flowBias, flowCallNotional, flowPutNotional, newsIntel.upgrades, newsIntel.downgrades, rotationRank, providerKeys, cryptoSnapshot, riskPct, riskAccount]);
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
    setActiveTab("terminal");
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

  const SortH = ({ col, children, align = "left" }) => (
    <th onClick={() => handleSort(col)} style={{
      padding: "10px 8px", fontSize: 11, fontFamily: MONO, letterSpacing: "0.04em",
      color: sortCol === col ? C.accent : C.textDim, textAlign: align, cursor: "pointer",
      borderBottom: `1px solid ${C.border}`, userSelect: "none", whiteSpace: "nowrap",
    }}>
      {children}{sortCol === col ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
    </th>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: SANS, zoom: isMobile ? 1 : UI_ZOOM, lineHeight: 1.45, width: "100%", maxWidth: "100vw", overflowX: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      {/* Mobile-specific global styles */}
      {isMobile && (
        <style>{`
          * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
          select, input[type="text"], input[type="number"], input[type="search"] { font-size: 16px !important; }
          ::-webkit-scrollbar { display: none; }
          * { scrollbar-width: none; }
          .axiom-ticker-track { animation-duration: 160s !important; }
          table { width: 100%; }
          td, th { white-space: nowrap; }
          .mobile-nav-btn { min-height: 44px !important; min-width: 44px !important; padding: 10px 11px !important; font-size: 11px !important; }
          .mobile-subnav-btn { min-height: 40px !important; padding: 8px 12px !important; font-size: 10px !important; }
          .mobile-content { padding: 10px 10px 24px !important; }
        `}</style>
      )}

      {/* Top Bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: isMobile ? "6px 10px" : "8px 18px", borderBottom: `1px solid ${C.border}`,
        background: themeMode === "dark" ? "#070d1b" : C.surface,
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
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.1em" }}>PLATFORM</span>
              </div>
            )}
          </div>
          {/* User pill */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 999, padding: "4px 10px 4px 4px", flexShrink: 0,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              background: `linear-gradient(135deg, ${C.accent}, ${C.cyan})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 800, color: "#fff", fontFamily: MONO, flexShrink: 0,
            }}>D</div>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.textSec, fontWeight: 700 }}>Dixie</span>
          </div>
          {/* Nav tabs — grouped */}
          {(() => {
            const NAV_GROUPS = [
              { id: "dashboard", label: "MONITOR",   tabs: ["dashboard"] },
              { id: "terminal",  label: "TERMINAL",  tabs: ["terminal"] },
              { id: "scanner",   label: "SCANNER",   tabs: ["scanner", "early", "analyzer", "cot"] },
              { id: "markets",   label: "MARKETS",   tabs: ["news", "earnings", "macro", "sectors", "rotation", "tv", "flow", "openstock", "fivex", "smartscan"] },
              { id: "portfolio", label: "PORTFOLIO", tabs: ["portfolio", "journal", "alerts"] },
              { id: "tools",     label: "TOOLS",     tabs: ["tools", "backtest", "workflow", "agent"] },
              { id: "cot",       label: "📊 COT",    tabs: ["cot"] },
              { id: "deals",     label: "🛒 DEALS",  tabs: ["deals"] },
              { id: "islamic",   label: "☪",         tabs: ["quran", "athan", "athkar", "tasbih"] },
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
                      className={isMobile ? "mobile-nav-btn" : ""}
                      style={{
                        border: "none",
                        background: isActive
                          ? (themeMode === "dark" ? `${C.accent}22` : `${C.accent}14`)
                          : "transparent",
                        color: isActive ? C.accent : C.textDim,
                        fontFamily: MONO, fontSize: 10, fontWeight: isActive ? 800 : 600,
                        padding: isMobile ? "10px 11px" : "6px 9px", borderRadius: 4, cursor: "pointer",
                        borderBottom: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
                        letterSpacing: "0.04em", whiteSpace: "nowrap",
                        transition: "color 0.15s, background 0.15s",
                        display: "inline-flex", alignItems: "center", gap: 4,
                        minHeight: isMobile ? 44 : "auto",
                      }}
                    >
                      {g.label}
                      {hasAlertBadge && (
                        <span style={{ background: C.red, color: "#fff", borderRadius: 10, padding: "1px 5px", fontSize: 8, fontWeight: 800 }}>{triggeredAlertBadge}</span>
                      )}
                      {hasScanBadge && (
                        <span style={{ background: C.green, color: "#fff", borderRadius: 10, padding: "1px 5px", fontSize: 8, fontWeight: 800 }}>{scannerBadge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
        {/* Right side: weather, search, status, action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", justifyContent: "flex-end", flexShrink: 0 }}>
          {/* Live dot — always visible */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", background: C.card, borderRadius: 4, border: `1px solid ${C.border}` }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: dataBadge === "LIVE" ? C.green : dataBadge === "STALE" ? C.amber : C.red, boxShadow: `0 0 5px ${dataBadge === "LIVE" ? C.green : C.amber}`, animation: "pulse 2s infinite", flexShrink: 0 }} />
            {!isMobile && (
              <span style={{ fontSize: 9, fontFamily: MONO, color: C.textDim, whiteSpace: "nowrap" }}>
                {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "CONNECTING…"}
              </span>
            )}
          </div>

          {/* Weather chip — desktop only */}
          {!isMobile && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              border: `1px solid ${C.border}`,
              background: C.card, borderRadius: 5, padding: "4px 10px",
              fontSize: 10, fontFamily: MONO, color: C.textSec, whiteSpace: "nowrap",
            }}>
              <span style={{ color: C.accent, fontWeight: 700 }}>WEATHER {WEATHER_ZIP}</span>
              {weatherData ? (
                <>
                  <span style={{ fontWeight: 800, color: weatherData.temp >= 85 ? C.red : weatherData.temp <= 40 ? C.cyan : C.text }}>
                    {weatherData.temp.toFixed(0)}°F
                  </span>
                  <span style={{ color: C.textDim }}>{weatherCodeLabel(weatherData.code)}</span>
                </>
              ) : (
                <span style={{ color: C.textDim }}>—</span>
              )}
            </div>
          )}

          {/* Session countdown — desktop only */}
          {!isMobile && (() => {
            const cdColor = sessionCountdown.session === "REGULAR" ? C.green
              : sessionCountdown.session === "PREMARKET" ? C.accent
              : sessionCountdown.session === "AFTERMARKET" ? C.amber : C.textDim;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: `${cdColor}0e`, borderRadius: 4, border: `1px solid ${cdColor}2a` }}>
                <span style={{ fontSize: 9, fontFamily: MONO, color: C.textDim }}>{sessionCountdown.label}</span>
                <span style={{ fontSize: 10, fontFamily: MONO, color: cdColor, fontWeight: 800 }}>{fmtCountdownShort(sessionCountdown.secs)}</span>
              </div>
            );
          })()}

          {/* Hijri date */}
          {athanHijri && (
            <div onClick={() => setActiveTab("athan")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", background: "#c9a84c0e", borderRadius: 4, border: "1px solid #c9a84c2a", cursor: "pointer", direction: "rtl" }}>
              <span style={{ fontSize: isMobile ? 11 : 10, fontFamily: "Arial, sans-serif", color: "#c9a84c", fontWeight: 700 }}>
                {isMobile ? `${athanHijri.day} هـ` : `${athanHijri.day} ${athanHijri.month?.ar} ${athanHijri.year} هـ`}
              </span>
            </div>
          )}

          {/* Portfolio P/L chip — desktop only */}
          {!isMobile && portfolioSummary.totalCost > 0 && portfolioSummary.totalValue > 0 && (
            <div onClick={() => setActiveTab("portfolio")} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 4, border: `1px solid ${portfolioSummary.totalPnl >= 0 ? C.green : C.red}44`, background: portfolioSummary.totalPnl >= 0 ? `${C.green}0e` : `${C.red}0e`, cursor: "pointer" }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>PORT</span>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: portfolioSummary.totalPnl >= 0 ? C.green : C.red }}>
                {portfolioSummary.totalPnl >= 0 ? "+" : ""}{portfolioSummary.totalPnlPct.toFixed(2)}%
              </span>
            </div>
          )}

          {/* Today P/L chip — always visible (important KPI) */}
          {(() => {
            const today = new Date().toISOString().slice(0, 10);
            const todayClosed = journalEntries.filter(e => e.status === "closed" && e.pnl != null && (e.closedAt || "").slice(0, 10) === today);
            if (!todayClosed.length) return null;
            const todayPnl = todayClosed.reduce((s, e) => s + e.pnl, 0);
            const color = todayPnl >= 0 ? C.green : C.red;
            return (
              <div onClick={() => setActiveTab("journal")} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 4, border: `1px solid ${color}44`, background: `${color}0e`, cursor: "pointer" }}>
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>TODAY</span>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color }}>
                  {todayPnl >= 0 ? "+" : ""}${Math.round(todayPnl)}
                </span>
              </div>
            );
          })()}

          {/* Quran playing indicator */}
          {quranPlaying && (
            <button
              onClick={() => { if (quranAudioRef.current) quranAudioRef.current.pause(); }}
              style={{ background: `#c9a84c18`, border: `1px solid #c9a84c55`, color: "#c9a84c", fontFamily: MONO, fontSize: 9, fontWeight: 700, padding: "5px 9px", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, maxWidth: isMobile ? 80 : 140 }}
            >
              <span>▐▌</span>
              {!isMobile && (
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}>
                  {SURAH_LIST.find(s => s[0] === quranSurah)?.[1] || `سورة ${quranSurah}`}
                </span>
              )}
            </button>
          )}

          {/* Mobile: theme toggle only — all actions in left ☰ drawer */}
          {isMobile && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => setSettings((s) => ({ ...s, themeMode: themeMode === "dark" ? "light" : "dark" }))}
                style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, width: 40, height: 40, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >{themeMode === "dark" ? "☀" : "🌙"}</button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile menu drawer — opens from LEFT hamburger button */}
      {isMobile && mobileMenuOpen && (
        <div style={{
          borderBottom: `2px solid ${C.accent}33`,
          borderLeft: `3px solid ${C.accent}`,
          background: themeMode === "dark" ? "#070c19" : "#f4f8ff",
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
            >DEALER</a>
            <a
              href="/workstation" target="_blank" rel="noopener"
              onClick={() => setMobileMenuOpen(false)}
              style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 12, padding: "12px 8px", borderRadius: 8, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48, fontWeight: 700 }}
            >WS</a>
            <button
              onClick={() => { generateMarketReport(); setMobileMenuOpen(false); }}
              style={{ background: `${C.accent}14`, border: `1px solid ${C.accent}44`, color: C.accent, fontFamily: MONO, fontSize: 12, padding: "12px 8px", borderRadius: 8, cursor: "pointer", minHeight: 48, fontWeight: 700 }}
            >📊 REPORT</button>
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
              <div style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${C.border}`, background: C.card, borderRadius: 6, padding: "7px 12px", fontSize: 11, fontFamily: MONO, color: C.textSec }}>
                <span>☁</span>
                <span style={{ fontWeight: 800 }}>{weatherData.temp.toFixed(0)}°F</span>
                <span style={{ color: C.textDim }}>{weatherCodeLabel(weatherData.code)}</span>
              </div>
            )}
            {(() => {
              const cdColor = sessionCountdown.session === "REGULAR" ? C.green : sessionCountdown.session === "PREMARKET" ? C.accent : sessionCountdown.session === "AFTERMARKET" ? C.amber : C.textDim;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: `${cdColor}0e`, borderRadius: 6, border: `1px solid ${cdColor}2a` }}>
                  <span style={{ fontSize: 10, fontFamily: MONO, color: C.textDim }}>{sessionCountdown.label}</span>
                  <span style={{ fontSize: 12, fontFamily: MONO, color: cdColor, fontWeight: 800 }}>{fmtCountdownShort(sessionCountdown.secs)}</span>
                </div>
              );
            })()}
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: C.card, borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: dataBadge === "LIVE" ? C.green : C.amber, boxShadow: `0 0 4px ${C.green}` }} />
              <span style={{ fontSize: 10, fontFamily: MONO, color: C.textDim }}>{lastUpdate ? lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Data source info bar + action buttons — desktop only */}
      {!isMobile && <div style={{ padding: "3px 12px 3px 18px", borderBottom: `1px solid ${C.border}`, background: themeMode === "dark" ? "#080e1c" : C.surface, display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap" }}>
        {/* Left: data source info */}
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, whiteSpace: "nowrap" }}>DATA SOURCE:</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textSec, whiteSpace: "nowrap" }}>Multi Provider (Finnhub + FMP + Yahoo Fallback)</span>
        <span onClick={() => setActiveTab("tools")} style={{ fontFamily: MONO, fontSize: 9, color: C.accent, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>LOG</span>
        <span style={{ width: 1, height: 10, background: C.border, flexShrink: 0 }} />
        <Badge color={dataBadgeColor}>{dataBadge}</Badge>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, whiteSpace: "nowrap" }}>
          {providersConfigured > 0 ? `${providersConfigured} key${providersConfigured > 1 ? "s" : ""} configured` : "No API keys"}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, whiteSpace: "nowrap" }}>
          {lastUpdate ? `Last tick ${lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Awaiting first tick"}
          {dataFreshSec !== null ? ` · ${dataFreshSec}s ago` : ""}
        </span>

        {/* Right: search + action buttons (moved from topbar) */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto", flexShrink: 0 }}>
          {/* Search */}
          <input
            value={symbolSearch}
            onChange={(e) => setSymbolSearch(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") handleSymbolSearch(); }}
            placeholder="Search ticker…"
            style={{ width: 130, border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "3px 8px", fontFamily: MONO, fontSize: 10, outline: "none", height: 24 }}
          />
          <button onClick={handleSymbolSearch} style={{ border: `1px solid ${C.border}`, background: C.card, color: C.textSec, borderRadius: 4, padding: "3px 7px", fontFamily: MONO, fontSize: 10, cursor: "pointer", height: 24 }}>SEARCH</button>
          <button onClick={() => openTradingView(symbolSearch || terminalSymbol)} style={{ border: `1px solid ${C.border}`, background: C.card, color: C.accent, borderRadius: 4, padding: "3px 7px", fontFamily: MONO, fontSize: 10, cursor: "pointer", height: 24 }}>TV</button>
          <span style={{ width: 1, height: 14, background: C.border, flexShrink: 0 }} />
          <button onClick={() => { setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); }} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 10, padding: "3px 7px", borderRadius: 4, cursor: "pointer", height: 24 }}>{loading ? "⟳" : "REFRESH"}</button>
          <a href="/dealer" target="_blank" rel="noopener" style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 10, padding: "3px 7px", borderRadius: 4, cursor: "pointer", textDecoration: "none", height: 24, display: "flex", alignItems: "center" }}>DEALER</a>
          <a href="/workstation" target="_blank" rel="noopener" style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 10, padding: "3px 7px", borderRadius: 4, cursor: "pointer", textDecoration: "none", height: 24, display: "flex", alignItems: "center" }}>WS</a>
          <button onClick={generateMarketReport} style={{ background: `${C.accent}14`, border: `1px solid ${C.accent}55`, color: C.accent, fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4, cursor: "pointer", height: 24 }}>MARKET RESET</button>
          <button onClick={handleLock} style={{ background: `${C.red}10`, border: `1px solid ${C.red}44`, color: C.red, fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4, cursor: "pointer", height: 24 }}>LOCK</button>
          <button onClick={() => setPaletteOpen(true)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 10, padding: "3px 7px", borderRadius: 4, cursor: "pointer", height: 24 }}>CMD</button>
          <button onClick={() => setSettings((s) => ({ ...s, themeMode: themeMode === "dark" ? "light" : "dark" }))} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textDim, fontFamily: MONO, fontSize: 10, padding: "3px 7px", borderRadius: 4, cursor: "pointer", height: 24 }}>
            {themeMode === "dark" ? "☀" : "●"}
          </button>
        </div>
      </div>}
      {/* Market Index Strip — matches screenshot layout */}
      <MacroTape data={macroData} cryptoSnapshot={cryptoSnapshot} />

      {/* News / Alert Tape */}
      <div style={{ borderBottom: `1px solid ${C.border}`, background: themeMode === "dark" ? "#080f1e" : "#f7faff", overflow: "hidden", whiteSpace: "nowrap" }}>
        <div className="axiom-ticker-track" style={{ display: "inline-flex", alignItems: "center", gap: 26, padding: "5px 0", animation: "axiomTickerLTR 320s linear infinite" }}>
          {[...topHeadlineTape, ...topHeadlineTape].map((item, i) => {
            const isDarkNews = themeMode === "dark" && item.kind === "NEWS";
            const toneColor = isDarkNews ? "#2a2100" : (item.tone === "red" ? C.red : item.tone === "green" ? C.green : item.tone === "amber" ? C.amber : C.accent);
            const toneBg = isDarkNews ? "#ffd54a" : (item.tone === "red" ? C.redBg : item.tone === "green" ? C.greenBg : item.tone === "amber" ? C.amberBg : `${C.accent}12`);
            const toneBorder = isDarkNews ? "#caa32b" : `${toneColor}40`;
            return (
              <span key={`ticker-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, paddingRight: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: toneColor, background: toneBg, border: `1px solid ${toneBorder}`, borderRadius: 3, padding: "2px 5px" }}>
                  {item.kind}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.text }}>{item.symbol}</span>
                <span style={{ fontSize: 11, color: themeMode === "dark" ? "#b8ccec" : C.textSec, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", verticalAlign: "bottom" }}>
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
          scanner:   [
            { id: "scanner",  label: "SCANNER" },
            { id: "early",    label: "EARLY ENTRY" },
            { id: "analyzer", label: "ANALYZER" },
            { id: "cot",      label: "📊 COT" },
          ],
          markets: [
            { id: "news",     label: "NEWS" },
            { id: "earnings", label: "EARNINGS" },
            { id: "macro",    label: "MACRO" },
            { id: "sectors",  label: "SECTORS" },
            { id: "rotation", label: "ROTATION" },
            { id: "flow",     label: "FLOW" },
            { id: "tv",        label: "TV LIVE" },
            { id: "openstock", label: "📈 STOCKS" },
            { id: "fivex",     label: "🚀 5X PLAYS" },
            { id: "smartscan", label: "🧠 SMART SCAN" },
          ],
          portfolio: [
            { id: "portfolio", label: "POSITIONS" },
            { id: "journal",   label: "JOURNAL" },
            { id: "alerts",    label: "ALERTS" },
          ],
          tools: [
            { id: "tools",     label: "TOOLS" },
            { id: "backtest",  label: "BACKTEST" },
            { id: "workflow",  label: "WORKFLOW" },
            { id: "agent",     label: "AI AGENT" },
          ],
          islamic: [
            { id: "quran",  label: "قرآن" },
            { id: "athan",  label: "الصلاة" },
            { id: "athkar", label: "أذكار" },
            { id: "tasbih", label: "تسبيح" },
          ],
        };
        const activeGroup = Object.entries(SUB_GROUPS).find(([, tabs]) =>
          tabs.some(t => t.id === activeTab)
        );
        if (!activeGroup) return null;
        const [, subTabs] = activeGroup;
        return (
          <div style={{
            borderBottom: `1px solid ${C.border}`,
            background: themeMode === "dark" ? "#070d1b" : "#f2f5fb",
            padding: isMobile ? "0 6px" : "0 18px",
            display: "flex", alignItems: "center", gap: 1,
            overflowX: "auto", scrollbarWidth: "none",
          }}>
            {subTabs.map(t => {
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
                    <span style={{ background: C.red, color: "#fff", borderRadius: 10, padding: "1px 4px", fontSize: 7, fontWeight: 800 }}>{triggeredAlertBadge}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })()}

      {error && (
        <div style={{ padding: "8px 18px", fontSize: 11, fontFamily: MONO, color: C.red, background: C.redBg }}>
          {error}
        </div>
      )}

      {/* Content */}
      <div className={isMobile ? "mobile-content" : ""} style={{ padding: isMobile ? "10px 10px 24px" : LAYOUT.contentPadding, maxWidth: LAYOUT.pageMaxWidth, margin: "0 auto" }}>
        {loading && !watchlistData.length && (
          <div style={{ textAlign: "center", padding: 60, fontFamily: MONO, color: C.textDim }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>Fetching live market data…</div>
            <div style={{ fontSize: 10 }}>Connecting to multi-provider quote engine</div>
          </div>
        )}

        {activeTab === "terminal" && watchlistData.length > 0 && (
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
          />
        )}

        {activeTab === "dashboard" && watchlistData.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `minmax(860px, 1fr) minmax(340px, ${LAYOUT.sidebarWidth}px)`, gap: LAYOUT.gridGap, alignItems: "start" }}>
            {/* Watchlist Table */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontFamily: SANS, fontSize: 15, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em" }}>
                  WATCHLIST — {watchlistData.length} SYMBOLS — REAL-TIME QUOTES
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={watchlistInput}
                    onChange={(e) => setWatchlistInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { const next = watchlistInput.split(",").map(s => s.trim().toUpperCase()).filter(Boolean); if (next.length) { setWatchlistSymbols(Array.from(new Set(next))); setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); } } }}
                    placeholder="AAPL,MSFT,NVDA"
                    style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 10, padding: "6px 8px", minWidth: 160, width: "min(300px, 40vw)" }}
                  />
                  <button onClick={() => {
                    const next = watchlistInput.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
                    if (next.length) {
                      setWatchlistSymbols(Array.from(new Set(next)));
                      setLoading(true);
                      fetchAll(apiKey).finally(() => setLoading(false));
                    }
                  }} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 10, padding: "6px 8px", cursor: "pointer" }}>
                    SAVE LIST
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: watchlistSymbols }) });
                        alert(`✅ Pushed ${watchlistSymbols.length} symbols to bot watchlist.`);
                      } catch (e) { alert("Push failed: " + e.message); }
                    }}
                    style={{ background: `${C.green}12`, border: `1px solid ${C.green}44`, color: C.green, fontFamily: MONO, fontSize: 10, padding: "6px 8px", cursor: "pointer", borderRadius: 3 }}
                    title="Push current watchlist to the bot"
                  >↑ BOT</button>
                  <button
                    onClick={async () => {
                      try {
                        const data = await fetch("/api/watchlist").then(r => r.json());
                        if (data.symbols && data.symbols.length) {
                          setWatchlistSymbols(data.symbols);
                          setWatchlistInput(data.symbols.join(","));
                          setLoading(true);
                          fetchAll(apiKey).finally(() => setLoading(false));
                        } else { alert("Bot watchlist is empty. Push from bot first."); }
                      } catch (e) { alert("Pull failed: " + e.message); }
                    }}
                    style={{ background: `${C.accent}12`, border: `1px solid ${C.accent}44`, color: C.accent, fontFamily: MONO, fontSize: 10, padding: "6px 8px", cursor: "pointer", borderRadius: 3 }}
                    title="Load bot watchlist into platform"
                  >↓ BOT</button>
                  <select
                    value={String(settings.refreshMs)}
                    onChange={(e) => setSettings((s) => ({ ...s, refreshMs: Number(e.target.value) }))}
                    style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 10, padding: "6px 8px" }}
                  >
                    <option value="60000">Refresh 1m</option>
                    <option value="180000">Refresh 3m</option>
                    <option value="300000">Refresh 5m</option>
                  </select>
                </div>
              </div>
              {watchlistData.length >= 3 && (() => {
                const isPreMkt = marketSession === "PREMARKET";
                const isPostMkt = marketSession === "AFTERMARKET";
                const isExt = isPreMkt || isPostMkt;
                const extColor = isPreMkt ? C.accent : C.amber;
                const extLabel = isPreMkt ? "PRE" : "POST";
                const getChg = (q) => isExt
                  ? Number(isPreMkt ? q.preMarketChangePercent : q.postMarketChangePercent) || 0
                  : (q.changesPercentage || 0);
                const moversBase = [...watchlistData].sort((a, b) => getChg(b) - getChg(a));
                const top3 = moversBase.slice(0, 3);
                const bot3 = moversBase.slice(-3).reverse();
                return (
                  <div>
                    {isExt && (
                      <div style={{ fontFamily: MONO, fontSize: 9, color: extColor, fontWeight: 700, marginBottom: 4, letterSpacing: "0.1em" }}>
                        {extLabel}MARKET MOVERS
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 10 }}>
                      {top3.map((q) => {
                        const chg = getChg(q);
                        return (
                          <div key={`mv-t-${q.symbol}`} onClick={() => { setTerminalSymbol(q.symbol); setActiveTab("terminal"); }} style={{ background: `${C.green}18`, border: `1px solid ${C.green}44`, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
                            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.accent }}>{q.symbol}</div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.green, fontWeight: 700 }}>+{chg.toFixed(2)}%</div>
                            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{isExt ? <span style={{ color: extColor, fontWeight: 700 }}>{extLabel} </span> : null}${(q.price || 0).toFixed(2)}</div>
                          </div>
                        );
                      })}
                      {bot3.map((q) => {
                        const chg = getChg(q);
                        return (
                          <div key={`mv-b-${q.symbol}`} onClick={() => { setTerminalSymbol(q.symbol); setActiveTab("terminal"); }} style={{ background: `${C.red}18`, border: `1px solid ${C.red}44`, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
                            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.accent }}>{q.symbol}</div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, fontWeight: 700 }}>{chg.toFixed(2)}%</div>
                            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{isExt ? <span style={{ color: extColor, fontWeight: 700 }}>{extLabel} </span> : null}${(q.price || 0).toFixed(2)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              <div style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 5,
                overflow: "hidden",
              }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: C.surface }}>
                        <SortH col="symbol">SYMBOL</SortH>
                        <SortH col="price" align="right">PRICE</SortH>
                        <SortH col="change" align="right">CHG%</SortH>
                        {(marketSession === "PREMARKET" || marketSession === "AFTERMARKET") && (
                          <th style={{ padding: "10px 8px", fontSize: 10, fontFamily: MONO, textAlign: "right", borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em", color: marketSession === "PREMARKET" ? C.accent : C.amber }}>
                            {marketSession === "PREMARKET" ? "PRE%" : "POST%"}
                          </th>
                        )}
                        <th style={{ padding: "10px 8px", fontSize: 10, fontFamily: MONO, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em" }}>5M</th>
                        <th style={{ padding: "10px 8px", fontSize: 10, fontFamily: MONO, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em" }}>30M</th>
                        <th style={{ padding: "10px 8px", fontSize: 10, fontFamily: MONO, color: C.textDim, textAlign: "center", borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em" }}>TREND</th>
                        <SortH col="rvol" align="right">RVOL</SortH>
                        <SortH col="volume" align="right">VOLUME</SortH>
                        <SortH col="mktcap" align="right">MKT CAP</SortH>
                        <SortH col="composite">SCORE</SortH>
                        <SortH col="tech">TECH</SortH>
                        <SortH col="fund">FUND</SortH>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(q => {
                        const chg = q.changesPercentage || 0;
                        const isUp = chg >= 0;
                        const scores = computeScores(q);
                        const trend = classifyTrend(q);
                        const rvol = q.avgVolume ? (q.volume / q.avgVolume) : 0;
                        const colSpan = (marketSession === "PREMARKET" || marketSession === "AFTERMARKET") ? 13 : 12;
                        return (
                          <React.Fragment key={q.symbol}>
                          <tr
                            onClick={() => setSelectedStock(q)}
                            style={{ cursor: "pointer", transition: "background 0.1s" }}
                            onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            <td style={{ padding: "10px 10px", borderBottom: `1px solid ${C.border}` }}>
                              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 14, color: C.text }}>{q.symbol}</div>
                              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.name}</div>
                              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setTerminalSymbol(q.symbol); setActiveTab("terminal"); }}
                                  style={{ border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer", fontWeight: 700 }}
                                >
                                  CHART
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openTradingView(q.symbol); }}
                                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                                >
                                  TV
                                </button>
                                <a
                                  href={`/workstation#${q.symbol}`}
                                  target="_blank"
                                  rel="noopener"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.purple, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer", textDecoration: "none" }}
                                >
                                  WS
                                </a>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setQuickLogModal({ symbol: q.symbol, price: q.price || 0, entry: (q.price || 0).toFixed(2), stopLoss: "", target: "", size: "", side: "BUY", timeframe: "1D", style: "Watchlist", notes: `CHG ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}% · RVOL ${rvol.toFixed(2)}x`, score: scores.composite || 0, chg, rvol }); }}
                                  style={{ border: `1px solid ${C.green}55`, background: C.surface, color: C.green, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer", fontWeight: 700 }}
                                >
                                  LOG
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setOpenNoteSymbol(openNoteSymbol === q.symbol ? null : q.symbol); }}
                                  style={{ border: `1px solid ${watchlistNotes[q.symbol] ? C.amber + "88" : C.border}`, background: watchlistNotes[q.symbol] ? C.amber + "18" : C.surface, color: watchlistNotes[q.symbol] ? C.amber : C.textDim, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                                  title="Add note"
                                >
                                  NOTE
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (openAlertSymbol === q.symbol) { setOpenAlertSymbol(null); } else { setOpenAlertSymbol(q.symbol); setWlAlertDir("above"); setWlAlertPrice((q.price ? (q.price * 1.02).toFixed(2) : "")); } }}
                                  style={{ border: `1px solid ${openAlertSymbol === q.symbol ? C.amber + "99" : C.border}`, background: openAlertSymbol === q.symbol ? `${C.amber}18` : C.surface, color: openAlertSymbol === q.symbol ? C.amber : C.textDim, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                                  title="Set price alert"
                                >
                                  ALERT
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setWatchlistSymbols(prev => prev.filter(s => s !== q.symbol)); }}
                                  style={{ border: `1px solid ${C.red}44`, background: C.surface, color: C.red, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                                  title={`Remove ${q.symbol} from watchlist`}
                                >
                                  ×
                                </button>
                              </div>
                              {watchlistNotes[q.symbol] && openNoteSymbol !== q.symbol && (
                                <div style={{ fontFamily: MONO, fontSize: 9, color: C.amber, marginTop: 3, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  📝 {watchlistNotes[q.symbol]}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "10px 8px", fontFamily: MONO, fontSize: 15, color: C.text, textAlign: "right", borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>
                              ${q.price?.toFixed(2)}
                            </td>
                            <td style={{
                              padding: "10px 8px", fontFamily: MONO, fontSize: 15, fontWeight: 700, textAlign: "right",
                              color: isUp ? C.green : C.red, borderBottom: `1px solid ${C.border}`,
                              background: isUp ? C.greenBg : C.redBg,
                            }}>
                              {isUp ? "+" : ""}{chg.toFixed(2)}%
                            </td>
                            {(marketSession === "PREMARKET" || marketSession === "AFTERMARKET") && (() => {
                              const extChg = marketSession === "PREMARKET"
                                ? Number(q.preMarketChangePercent || 0)
                                : Number(q.postMarketChangePercent || 0);
                              const extColor = marketSession === "PREMARKET" ? C.accent : C.amber;
                              const extBg = marketSession === "PREMARKET" ? C.accentGlow : C.amberBg;
                              return (
                                <td style={{ padding: "10px 8px", fontFamily: MONO, fontSize: 13, fontWeight: 700, textAlign: "right", borderBottom: `1px solid ${C.border}`, color: extChg !== 0 ? extColor : C.textDim, background: extChg !== 0 ? extBg : "transparent" }}>
                                  {extChg !== 0 ? `${extChg >= 0 ? "+" : ""}${extChg.toFixed(2)}%` : "—"}
                                </td>
                              );
                            })()}
                            <td style={{ padding: "10px 8px", fontFamily: MONO, fontSize: 12, textAlign: "right", borderBottom: `1px solid ${C.border}`, color: (q.delta5m || 0) >= 0 ? C.green : C.red }}>
                              {(q.delta5m || 0) >= 0 ? "+" : ""}{(q.delta5m || 0).toFixed(2)}%
                            </td>
                            <td style={{ padding: "10px 8px", fontFamily: MONO, fontSize: 12, textAlign: "right", borderBottom: `1px solid ${C.border}`, color: (q.delta30m || 0) >= 0 ? C.green : C.red }}>
                              {(q.delta30m || 0) >= 0 ? "+" : ""}{(q.delta30m || 0).toFixed(2)}%
                            </td>
                            <td style={{ padding: "10px 8px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
                              <TrendTag trend={trend} />
                            </td>
                            <td style={{
                              padding: "10px 8px", fontFamily: MONO, fontSize: 13, textAlign: "right",
                              color: rvol > 1.3 ? C.green : rvol > 1 ? C.text : C.textDim,
                              borderBottom: `1px solid ${C.border}`,
                            }}>
                              {rvol.toFixed(2)}x
                            </td>
                            <td style={{ padding: "10px 8px", fontFamily: MONO, fontSize: 13, color: C.textSec, textAlign: "right", borderBottom: `1px solid ${C.border}` }}>
                              {q.volume ? (q.volume / 1e6).toFixed(1) + "M" : "—"}
                            </td>
                            <td style={{ padding: "10px 8px", fontFamily: MONO, fontSize: 13, color: C.textSec, textAlign: "right", borderBottom: `1px solid ${C.border}` }}>
                              {formatNum(q.marketCap)}
                            </td>
                            <td style={{ padding: "7px 6px", borderBottom: `1px solid ${C.border}`, minWidth: 65 }}>
                              <ScoreBar value={scores.composite} />
                            </td>
                            <td style={{ padding: "7px 6px", borderBottom: `1px solid ${C.border}`, minWidth: 55 }}>
                              <ScoreBar value={scores.tech} color={C.cyan} />
                            </td>
                            <td style={{ padding: "7px 6px", borderBottom: `1px solid ${C.border}`, minWidth: 55 }}>
                              <ScoreBar value={scores.fund} color={C.purple} />
                            </td>
                          </tr>
                          {openNoteSymbol === q.symbol && (
                            <tr style={{ background: C.card }}>
                              <td colSpan={colSpan} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                  <textarea
                                    autoFocus
                                    value={watchlistNotes[q.symbol] || ""}
                                    onChange={e => setWatchlistNotes(n => ({ ...n, [q.symbol]: e.target.value }))}
                                    onClick={e => e.stopPropagation()}
                                    placeholder={`Notes for ${q.symbol} — thesis, key levels, catalysts…`}
                                    rows={2}
                                    style={{ flex: 1, background: C.surface, border: `1px solid ${C.amber}44`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "6px 8px", borderRadius: 4, resize: "vertical", outline: "none" }}
                                  />
                                  <button
                                    onClick={e => { e.stopPropagation(); setWatchlistNotes(n => { const next = { ...n }; delete next[q.symbol]; return next; }); setOpenNoteSymbol(null); }}
                                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.red, borderRadius: 4, padding: "4px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer", flexShrink: 0 }}
                                  >
                                    CLEAR
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); setOpenNoteSymbol(null); }}
                                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "4px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer", flexShrink: 0 }}
                                  >
                                    DONE
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                          {openAlertSymbol === q.symbol && (
                            <tr style={{ background: C.card }}>
                              <td colSpan={colSpan} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.amber, fontWeight: 700 }}>🔔 ALERT {q.symbol}</span>
                                  <select value={wlAlertDir} onChange={e => setWlAlertDir(e.target.value)}
                                    style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "4px 8px", borderRadius: 4 }}>
                                    <option value="above">Above</option>
                                    <option value="below">Below</option>
                                  </select>
                                  <input type="number" step="0.01" value={wlAlertPrice} onChange={e => setWlAlertPrice(e.target.value)}
                                    placeholder="Target price"
                                    style={{ width: 110, background: C.surface, border: `1px solid ${C.amber}66`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "4px 8px", borderRadius: 4, outline: "none" }}
                                  />
                                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>now: ${(q.price || 0).toFixed(2)}</span>
                                  <button
                                    onClick={async e => {
                                      e.stopPropagation();
                                      if (!wlAlertPrice) return;
                                      await fetch("/api/price-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: q.symbol, targetPrice: Number(wlAlertPrice), direction: wlAlertDir }) });
                                      setOpenAlertSymbol(null);
                                    }}
                                    style={{ border: `1px solid ${C.amber}66`, background: `${C.amber}22`, color: C.amber, borderRadius: 4, padding: "4px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer", fontWeight: 700, flexShrink: 0 }}
                                  >
                                    SET ALERT
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); setOpenAlertSymbol(null); }}
                                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "4px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer", flexShrink: 0 }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: 8, fontFamily: MONO, color: C.textDim, textAlign: "center" }}>
                Click any row for deep-dive · Auto-refreshes every {Math.round(settings.refreshMs / 60000)}m · Data via multi-provider quote engine
              </div>
            </div>

            {/* Right Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignSelf: "start" }}>
              {/* Morning Brief */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>MORNING BRIEF</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {briefAt && <span style={{ fontSize: 9, fontFamily: MONO, color: C.textDim }}>{briefAt}</span>}
                    <button
                      onClick={runMorningBrief}
                      disabled={briefLoading}
                      style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}14`, color: C.accent, borderRadius: 4, padding: "3px 8px", fontFamily: MONO, fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                    >
                      {briefLoading ? "..." : briefText ? "REFRESH" : "BRIEF ME"}
                    </button>
                  </div>
                </div>
                {briefText ? (
                  <>
                    <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, lineHeight: 1.45, whiteSpace: "pre-wrap", maxHeight: briefExpanded ? "none" : 120, overflow: "hidden" }}>
                      {briefText}
                    </div>
                    <button
                      onClick={() => setBriefExpanded(x => !x)}
                      style={{ marginTop: 6, border: "none", background: "none", color: C.accent, fontFamily: MONO, fontSize: 9, cursor: "pointer", padding: 0 }}
                    >
                      {briefExpanded ? "COLLAPSE ▲" : "EXPAND ▼"}
                    </button>
                  </>
                ) : (
                  <div style={{ fontSize: 10, fontFamily: SANS, color: C.textDim }}>
                    Click BRIEF ME for an AI-generated market summary.
                  </div>
                )}
              </div>
              {/* Alerts Feed */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 9, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                    ALERT FEED
                  </div>
                  <Badge color={combinedAlerts.length ? C.amber : C.textDim}>{combinedAlerts.length ? `${combinedAlerts.length} ACTIVE` : "CLEAR"}</Badge>
                </div>
                {combinedAlerts.length === 0 && (
                  <div style={{ fontSize: 10, fontFamily: SANS, color: C.textDim }}>
                    No high-priority alerts right now.
                  </div>
                )}
                {combinedAlerts.map((a, i) => (
                  <div key={`${a.symbol}-${i}`} style={{
                    borderBottom: `1px solid ${C.border}`, padding: "7px 0",
                    display: "grid", gridTemplateColumns: "50px 1fr", gap: 8,
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.text }}>{a.symbol}</span>
                      <Badge color={a.type === "risk" ? C.red : a.type === "flow" ? C.amber : C.green}>{a.type}</Badge>
                    </div>
                    <div>
                      <div style={{ fontFamily: SANS, fontSize: 10, color: C.textSec, lineHeight: 1.35 }}>{a.text}</div>
                      <div style={{ marginTop: 5 }}>
                        <ScoreBar value={a.score} color={a.type === "risk" ? C.red : a.type === "flow" ? C.amber : C.green} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Market Summary */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14 }}>
                <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em", marginBottom: 10 }}>
                  MARKET SNAPSHOT
                </div>
                {macroData.filter(q => ["SPY","QQQ","IWM","DIA"].includes(q.symbol)).map(q => {
                  const chg = q.changesPercentage || 0;
                  const isUp = chg >= 0;
                  return (
                    <div key={q.symbol} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "5px 0", borderBottom: `1px solid ${C.border}`,
                    }}>
                      <div>
                        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.text }}>{q.symbol}</span>
                        <span style={{ fontFamily: SANS, fontSize: 8, color: C.textDim, marginLeft: 6 }}>{q._label}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.text, marginRight: 8 }}>${q.price?.toFixed(2)}</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: isUp ? C.green : C.red }}>
                          {isUp ? "+" : ""}{chg.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Daily Economic Calendar */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em" }}>
                    DAILY ECONOMIC CALENDAR
                  </div>
                  <Badge color={(econCalendarRows || []).some((e) => e.phase === "live" || e.phase === "imminent") ? C.red : C.green}>
                    {(econCalendarRows || []).some((e) => e.phase === "live" || e.phase === "imminent") ? "RISK WINDOW" : "NORMAL"}
                  </Badge>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                  <button
                    onClick={() => setSettings((s) => ({ ...s, econCalendarView: "today" }))}
                    style={{ border: `1px solid ${econCalendarView === "today" ? C.accent : C.border}`, background: econCalendarView === "today" ? `${C.accent}14` : C.surface, color: econCalendarView === "today" ? C.accent : C.textSec, borderRadius: 4, padding: "4px 6px", fontFamily: MONO, fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                  >
                    TODAY
                  </button>
                  <button
                    onClick={() => setSettings((s) => ({ ...s, econCalendarView: "week" }))}
                    style={{ border: `1px solid ${econCalendarView === "week" ? C.accent : C.border}`, background: econCalendarView === "week" ? `${C.accent}14` : C.surface, color: econCalendarView === "week" ? C.accent : C.textSec, borderRadius: 4, padding: "4px 6px", fontFamily: MONO, fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                  >
                    THIS WEEK
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                  <button
                    onClick={() => setSettings((s) => ({ ...s, econCalendarRegion: "US" }))}
                    style={{ border: `1px solid ${econCalendarRegion === "US" ? C.green : C.border}`, background: econCalendarRegion === "US" ? `${C.green}14` : C.surface, color: econCalendarRegion === "US" ? C.green : C.textSec, borderRadius: 4, padding: "4px 6px", fontFamily: MONO, fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                  >
                    US ONLY
                  </button>
                  <button
                    onClick={() => setSettings((s) => ({ ...s, econCalendarRegion: "GLOBAL" }))}
                    style={{ border: `1px solid ${econCalendarRegion === "GLOBAL" ? C.purple : C.border}`, background: econCalendarRegion === "GLOBAL" ? `${C.purple}14` : C.surface, color: econCalendarRegion === "GLOBAL" ? C.purple : C.textSec, borderRadius: 4, padding: "4px 6px", fontFamily: MONO, fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                  >
                    GLOBAL
                  </button>
                </div>
                <button
                  onClick={() => setSettings((s) => ({ ...s, econAutoRisk30m: !econAutoRisk30m }))}
                  style={{ width: "100%", marginBottom: 8, border: `1px solid ${econAutoRisk30m ? C.red : C.border}`, background: econAutoRisk30m ? `${C.red}14` : C.surface, color: econAutoRisk30m ? C.red : C.textSec, borderRadius: 4, padding: "5px 8px", fontFamily: MONO, fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                >
                  {econAutoRisk30m ? "AUTO REDUCE RISK T-30M: ON" : "AUTO REDUCE RISK T-30M: OFF"}
                </button>
                {(econCalendarRows || [])
                  .map((e) => (
                    <div key={`daily-eco-${e.id}`} style={{
                      borderBottom: `1px solid ${C.border}`,
                      padding: "6px 0",
                      display: "grid",
                      gridTemplateColumns: "54px 1fr 78px",
                      gap: 8,
                      alignItems: "center",
                    }}>
                      <div>
                        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.accent }}>{e.tag}</span>
                        <div style={{ fontFamily: MONO, fontSize: 8, color: e.severity === "high" ? C.red : e.severity === "medium" ? C.amber : C.green, fontWeight: 700 }}>
                          {e.impact || String(e.severity || "").toUpperCase()}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: SANS, fontSize: 10, color: C.textSec, lineHeight: 1.3 }}>{e.title}</div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 2 }}>
                          {e.region} • {e.time.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </div>
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, textAlign: "right", color: e.phase === "live" ? C.red : e.phase === "imminent" ? C.amber : C.textSec }}>
                        {e.phase === "live" ? "LIVE" : formatCountdown(e.tteMs)}
                      </span>
                    </div>
                  ))}
                {!((econCalendarRows || []).length) && (
                  <div style={{ fontSize: 10, fontFamily: SANS, color: C.textDim }}>
                    No major events in selected window.
                  </div>
                )}
              </div>

              {/* Weather */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em" }}>
                    WEATHER ({WEATHER_ZIP})
                  </div>
                  <button
                    onClick={fetchWeather}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "3px 7px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                  >
                    {weatherLoading ? "..." : "REFRESH"}
                  </button>
                </div>
                {weatherError && <div style={{ fontSize: 11, color: C.red }}>{weatherError}</div>}
                {!weatherError && weatherData && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                      <div style={{ fontSize: 10, color: C.textDim }}>{weatherData.location}</div>
                      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: C.text }}>{weatherData.temp.toFixed(0)}°F</div>
                      <div style={{ fontSize: 10, color: C.textSec }}>{weatherCodeLabel(weatherData.code)}</div>
                    </div>
                    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                      <div style={{ fontSize: 10, color: C.textDim }}>High / Low</div>
                      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700 }}>{weatherData.high.toFixed(0)}° / {weatherData.low.toFixed(0)}°</div>
                      <div style={{ fontSize: 10, color: C.textDim }}>Wind {weatherData.wind.toFixed(0)} mph</div>
                    </div>
                  </div>
                )}
                {!weatherError && !weatherData && <div style={{ fontSize: 11, color: C.textDim }}>Loading weather...</div>}
              </div>

              {/* Sector Heatmap */}
              <div>
                <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em", marginBottom: 8 }}>
                  SECTOR HEATMAP
                </div>
                <SectorHeatmap data={sectorData} />
              </div>

              {/* Top Movers */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14 }}>
                {(() => {
                  const isPreMkt = marketSession === "PREMARKET";
                  const isPostMkt = marketSession === "AFTERMARKET";
                  const isExt = isPreMkt || isPostMkt;
                  const extLabel = isPreMkt ? "PRE" : "POST";
                  const extColor = isPreMkt ? C.accent : C.amber;
                  const getChg = (q) => isExt
                    ? Number(isPreMkt ? q.preMarketChangePercent : q.postMarketChangePercent) || 0
                    : (q.changesPercentage || 0);
                  return (
                    <>
                      <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                        WATCHLIST MOVERS
                        {isExt && <span style={{ fontSize: 9, fontFamily: MONO, color: extColor, fontWeight: 700, border: `1px solid ${extColor}44`, padding: "1px 5px", borderRadius: 3 }}>{extLabel}</span>}
                      </div>
                      {[...watchlistData]
                        .sort((a, b) => Math.abs(getChg(b)) - Math.abs(getChg(a)))
                        .slice(0, 5)
                        .map(q => {
                          const chg = getChg(q);
                          const isUp = chg >= 0;
                          return (
                            <div key={q.symbol} onClick={() => setSelectedStock(q)} style={{
                              display: "flex", justifyContent: "space-between", padding: "4px 0",
                              borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                            }}>
                              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.text }}>{q.symbol}</span>
                              <span style={{
                                fontFamily: MONO, fontSize: 10, fontWeight: 700,
                                color: isUp ? C.green : C.red,
                                padding: "1px 6px", borderRadius: 2,
                                background: isUp ? C.greenBg : C.redBg,
                              }}>
                                {isUp ? "+" : ""}{chg.toFixed(2)}%
                              </span>
                            </div>
                          );
                        })}
                    </>
                  );
                })()}
              </div>

              {/* Portfolio Mini Widget */}
              {portfolioSummary.totalCost > 0 && portfolioSummary.totalValue > 0 && (
                <div
                  onClick={() => setActiveTab("portfolio")}
                  style={{ background: C.card, border: `1px solid ${portfolioSummary.totalPnl >= 0 ? `${C.green}55` : `${C.red}55`}`, borderRadius: 5, padding: 14, cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em" }}>PORTFOLIO</div>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: portfolioSummary.totalPnl >= 0 ? C.green : C.red }}>
                      {portfolioSummary.totalPnl >= 0 ? "+" : ""}{portfolioSummary.totalPnlPct.toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.text, fontWeight: 700 }}>{formatNum(portfolioSummary.totalValue)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: portfolioSummary.totalPnl >= 0 ? C.green : C.red, fontWeight: 700 }}>
                      {portfolioSummary.totalPnl >= 0 ? "+" : ""}{formatNum(portfolioSummary.totalPnl)}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, fontFamily: MONO, color: C.textDim }}>
                    {portfolioSummary.winners}W / {portfolioSummary.losers}L · {portfolioRows.length} positions · click to expand
                  </div>
                </div>
              )}

              {/* News Wire */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14 }}>
                <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em", marginBottom: 10 }}>
                  NEWS WIRE
                </div>
                {newsData.slice(0, 4).map((n, i) => (
                  <a key={`${n.ticker}-${i}`} href={n.link} target="_blank" rel="noreferrer" style={{
                    display: "block", textDecoration: "none", color: C.text, padding: "6px 0",
                    borderBottom: `1px solid ${C.border}`,
                  }}>
                    <div style={{ fontSize: 10, fontFamily: MONO, color: C.accent, marginBottom: 2 }}>
                      {n.ticker} · {n.publisher}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, lineHeight: 1.35 }}>
                      {n.title}
                    </div>
                  </a>
                ))}
                {!newsData.length && <div style={{ fontSize: 11, color: C.textDim }}>No headlines yet.</div>}
              </div>

              {/* Daily P/L Tracker */}
              {(() => {
                const todayStr = new Date().toISOString().slice(0, 10);
                const todayTrades = journalEntries.filter(e => e.status === "closed" && e.pnl != null && String(e.closedAt || "").startsWith(todayStr));
                const todayPnl = todayTrades.reduce((s, e) => s + e.pnl, 0);
                const todayWins = todayTrades.filter(e => e.pnl > 0).length;
                const todayLosses = todayTrades.filter(e => e.pnl <= 0).length;
                const openCount = Object.keys(liveJournalPnl).length;
                const liveTotalPnl = Object.values(liveJournalPnl).reduce((s, d) => s + d.livePnl, 0);
                if (todayTrades.length === 0 && openCount === 0) return null;
                const pnlColor = todayPnl >= 0 ? C.green : C.red;
                return (
                  <div onClick={() => setActiveTab("journal")}
                    style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14, cursor: "pointer" }}>
                    <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em", marginBottom: 10 }}>
                      TODAY&apos;S P/L
                    </div>
                    {todayTrades.length > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>Realized ({todayTrades.length})</span>
                        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: pnlColor }}>{todayPnl >= 0 ? "+" : ""}${todayPnl.toFixed(2)}</span>
                      </div>
                    )}
                    {openCount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>Unrealized ({openCount})</span>
                        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: liveTotalPnl >= 0 ? C.green : C.red }}>{liveTotalPnl >= 0 ? "+" : ""}${liveTotalPnl.toFixed(2)}</span>
                      </div>
                    )}
                    {todayTrades.length > 0 && (
                      <div style={{ fontSize: 10, fontFamily: MONO, color: C.textDim }}>{todayWins}W / {todayLosses}L · click for full journal</div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === "news" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                NEWS DESK — LIVE HEADLINES
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={newsSymFilter}
                  onChange={(e) => setNewsSymFilter(e.target.value.toUpperCase())}
                  placeholder="Filter symbol…"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 10, padding: "5px 8px", width: 120, borderRadius: 4 }}
                />
                <select
                  value={newsSentFilter}
                  onChange={(e) => setNewsSentFilter(e.target.value)}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 10, padding: "5px 8px", borderRadius: 4 }}
                >
                  <option value="all">All Sentiment</option>
                  <option value="bullish">Bullish</option>
                  <option value="bearish">Bearish</option>
                  <option value="neutral">Neutral</option>
                  <option value="wl">WL Only</option>
                </select>
                <button
                  onClick={refreshNews}
                  disabled={newsLoading}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  {newsLoading ? "LOADING..." : `REFRESH (${newsData.length})`}
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {newsData
                .filter((n) => {
                  if (newsSymFilter && !String(n.ticker || "").toUpperCase().includes(newsSymFilter)) return false;
                  if (newsSentFilter === "wl") {
                    if (!watchlistSymbols.includes(String(n.ticker || "").toUpperCase())) return false;
                  } else if (newsSentFilter !== "all") {
                    const bullish = ["beat","surge","upgrade","growth","record","bull","rally","wins","strong","expands"];
                    const bearish = ["miss","drop","downgrade","cuts","probe","lawsuit","bear","weak","fall","slump"];
                    const txt = (String(n.title || "") + " " + String(n.summary || "")).toLowerCase();
                    const bs = bullish.filter(w => txt.includes(w)).length;
                    const be = bearish.filter(w => txt.includes(w)).length;
                    const sent = bs > be ? "bullish" : be > bs ? "bearish" : "neutral";
                    if (sent !== newsSentFilter) return false;
                  }
                  return true;
                })
                .map((n, i) => {
                  const bullish = ["beat","surge","upgrade","growth","record","bull","rally","wins","strong","expands"];
                  const bearish = ["miss","drop","downgrade","cuts","probe","lawsuit","bear","weak","fall","slump"];
                  const txt = (String(n.title || "") + " " + String(n.summary || "")).toLowerCase();
                  const bs = bullish.filter(w => txt.includes(w)).length;
                  const be = bearish.filter(w => txt.includes(w)).length;
                  const sent = bs > be ? "bullish" : be > bs ? "bearish" : "neutral";
                  const sentColor = sent === "bullish" ? C.green : sent === "bearish" ? C.red : C.textDim;
                  const onWatchlist = watchlistSymbols.includes(n.ticker);
                  return (
                    <div key={`${n.ticker}-${i}`} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, position: "relative" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button onClick={() => { setTerminalSymbol(n.ticker); setActiveTab("terminal"); }}
                            style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 10, cursor: "pointer", padding: 0, fontWeight: 700 }}>
                            {n.ticker}
                          </button>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>· {n.publisher}</span>
                          <span style={{ fontFamily: MONO, fontSize: 9, color: sentColor, fontWeight: 700, textTransform: "uppercase" }}>{sent}</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>
                            {n.publishedAt ? new Date(n.publishedAt).toLocaleString() : ""}
                          </span>
                          {n.ticker && (
                            <React.Fragment>
                              <button
                                onClick={() => setQuickLogModal({ symbol: n.ticker, price: 0, entry: "", stopLoss: "", target: "", size: "", side: sent === "bearish" ? "SELL" : "BUY", timeframe: "1D", style: "News", notes: n.title || "", score: sent === "bullish" ? 72 : 55, chg: 0, rvol: 0 })}
                                style={{ border: `1px solid ${C.accent}44`, background: C.surface, color: C.accent, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}>
                                LOG
                              </button>
                              <button
                                onClick={() => setWatchlistSymbols(prev => onWatchlist ? prev.filter(s => s !== n.ticker) : Array.from(new Set([...prev, n.ticker])))}
                                title={onWatchlist ? `Remove ${n.ticker} from watchlist` : `Add ${n.ticker} to watchlist`}
                                style={{ border: `1px solid ${onWatchlist ? C.red : C.green}55`, background: onWatchlist ? C.redBg : C.greenBg, color: onWatchlist ? C.red : C.green, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer", fontWeight: 700 }}>
                                {onWatchlist ? "−WL" : "+WL"}
                              </button>
                              <button
                                onClick={async () => {
                                  const icon = sent === "bullish" ? "🟢" : sent === "bearish" ? "🔴" : "⚪";
                                  const msg = `${icon} *${n.ticker}* — ${sent.toUpperCase()} News\n_${(n.title || "").slice(0, 120)}_\n${n.publisher || ""}`;
                                  try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                                }}
                                title="Push to Telegram"
                                style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}>
                                PUSH
                              </button>
                            </React.Fragment>
                          )}
                        </div>
                      </div>
                      <a href={n.link} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 4 }}>{n.title}</div>
                        {n.summary ? <div style={{ fontSize: 11, color: C.textSec }}>{n.summary}</div> : null}
                      </a>
                    </div>
                  );
                })}
              {!newsData.length && <div style={{ color: C.textDim, fontSize: 13 }}>No headlines loaded yet.</div>}
            </div>
          </div>
        )}

        {activeTab === "earnings" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                EARNINGS CALENDAR — WATCHLIST + LEADERS
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                  {earningsUpdatedAt ? `Updated ${earningsUpdatedAt}` : "Not loaded"}
                </span>
                <button
                  onClick={() => setEarningsRefreshTick((n) => n + 1)}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  {earningsLoading ? "UPDATING..." : "REFRESH"}
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>TODAY / TOMORROW</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C.amber }}>
                  {earningsRows.filter((e) => Number.isFinite(e.dayDiff) && e.dayDiff >= 0 && e.dayDiff <= 1).length}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>NEXT 7D</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C.green }}>
                  {earningsRows.filter((e) => Number.isFinite(e.dayDiff) && e.dayDiff >= 0 && e.dayDiff <= 7).length}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>NEXT 14D</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C.accent }}>
                  {earningsRows.filter((e) => Number.isFinite(e.dayDiff) && e.dayDiff >= 0 && e.dayDiff <= 14).length}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>UNKNOWN DATE</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C.red }}>
                  {earningsRows.filter((e) => !e.earningsDate).length}
                </div>
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "130px 160px 130px 120px 120px 1fr auto", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                <span>SYMBOL</span>
                <span>EARN DATE</span>
                <span>COUNTDOWN</span>
                <span>CHG%</span>
                <span>SCORE</span>
                <span>PRICE</span>
                <span></span>
              </div>
              <div style={{ maxHeight: "58vh", overflow: "auto" }}>
                {earningsRows.map((e) => {
                  const isSoon = Number.isFinite(e.dayDiff) && e.dayDiff >= 0 && e.dayDiff <= 7;
                  const dateLabel = e.earningsDate ? new Date(e.earningsDate).toLocaleDateString() : "TBD";
                  const chg = Number(e.chg || 0);
                  const onWl = watchlistSymbols.includes(e.symbol);
                  const px = Number(e.price || 0);
                  return (
                    <div key={`earn-row-${e.symbol}`} style={{ display: "grid", gridTemplateColumns: "130px 160px 130px 120px 120px 1fr auto", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, background: isSoon ? `${C.amber}0D` : C.card, alignItems: "center" }}>
                      <button onClick={() => { setTerminalSymbol(e.symbol); setActiveTab("terminal"); }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", padding: 0, textAlign: "left" }}>{e.symbol}</button>
                      <span style={{ fontSize: 12, color: C.textSec }}>{dateLabel}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: isSoon ? C.amber : C.textSec }}>{e.timing}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: chg >= 0 ? C.green : C.red, fontWeight: 700 }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.accent, fontWeight: 700 }}>{Math.round(Number(e.score || 0))}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>${px.toFixed(2)}</span>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          onClick={() => setQuickLogModal({ symbol: e.symbol, price: px, entry: px.toFixed(2), stopLoss: "", target: "", size: "", side: chg >= 0 ? "BUY" : "SELL", timeframe: "1D", style: "Earnings", notes: `Earnings ${dateLabel}${e.timing ? " " + e.timing : ""}`, score: Math.round(Number(e.score || 65)), chg, rvol: 0 })}
                          style={{ border: `1px solid ${C.accent}44`, background: C.surface, color: C.accent, borderRadius: 4, padding: "4px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}>LOG</button>
                        <button
                          onClick={() => setWatchlistSymbols(prev => onWl ? prev.filter(s => s !== e.symbol) : Array.from(new Set([...prev, e.symbol])))}
                          style={{ border: `1px solid ${onWl ? C.red : C.green}55`, background: C.surface, color: onWl ? C.red : C.green, borderRadius: 4, padding: "4px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}>
                          {onWl ? "−WL" : "+WL"}
                        </button>
                        <button
                          onClick={async () => {
                            const msg = `📅 *${e.symbol}* Earnings ${e.timing ? e.timing : dateLabel}\nPrice: $${px.toFixed(2)}  CHG: ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%  Score: ${Math.round(Number(e.score || 0))}`;
                            try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                          }}
                          style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 4, padding: "4px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }} title="Push to Telegram">PUSH</button>
                      </div>
                    </div>
                  );
                })}
                {!earningsRows.length && !earningsLoading && (
                  <div style={{ padding: 14, fontSize: 12, color: C.textDim }}>No earnings rows yet. Click REFRESH.</div>
                )}
                {earningsLoading && (
                  <div style={{ padding: 14, fontSize: 12, color: C.textDim }}>Loading earnings calendar...</div>
                )}
              </div>
            </div>
          </div>
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
                      borderRadius: 4,
                      padding: "6px 10px",
                      fontFamily: MONO,
                      fontSize: 10,
                      cursor: "pointer",
                    }}
                  >
                    {src.label}
                  </button>
                ))}
                <button
                  onClick={() => window.open(selectedTvSource.official, "_blank", "noopener,noreferrer")}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
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
              <div style={{ marginTop: 8, fontSize: 11, color: C.textDim }}>
                If this stream is blocked by provider policy, use <b>OPEN OFFICIAL</b>.
              </div>
            </div>
          </div>
        )}

        {/* ── OPENSTOCK: TradingView Market Widgets (iframe srcdoc approach) ──── */}
        {activeTab === "openstock" && (() => {
          // Each TradingView widget runs inside its own iframe so it gets a clean
          // document context — the only reliable way to embed them in a React SPA.
          function tvFrame(scriptFile, cfg, height) {
            // TradingView requires explicit pixel values — "100%" for height is ignored
            const config = JSON.stringify({ ...cfg, width: "100%", height: height });
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:${height}px;overflow:hidden;background:#131722}</style></head>
<body>
<div class="tradingview-widget-container" style="height:${height}px;width:100%">
  <div class="tradingview-widget-container__widget" style="height:${height}px;width:100%"></div>
  <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/${scriptFile}" async>
  ${config}
  <\/script>
</div>
</body></html>`;
            return (
              <iframe
                srcDoc={html}
                style={{ width: "100%", height: height, border: "none", display: "block" }}
                scrolling="no"
                title={scriptFile}
              />
            );
          }

          const dark = { colorTheme: "dark", locale: "en", isTransparent: false };
          const sym  = tvOsSymbol.toUpperCase();
          const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" };
          const lbl  = (t) => (
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim,
              padding: "6px 10px", borderBottom: `1px solid ${C.border}` }}>{t}</div>
          );

          return (
            <div>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em" }}>
                  📈 MARKET OVERVIEW — TRADINGVIEW
                </div>
                <a href="https://www.tradingview.com" target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, textDecoration: "none",
                    border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 8px" }}>
                  OPEN TRADINGVIEW ↗
                </a>
              </div>

              {/* Row 1: Heatmap + Market Overview */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div style={card}>
                  {lbl("SPX 500 HEATMAP — BY SECTOR")}
                  {tvFrame("embed-widget-stock-heatmap.js", {
                    ...dark, dataSource: "SPX500", grouping: "sector",
                    blockSize: "market_cap_basic", blockColor: "change",
                    hasTopBar: false, isZoomEnabled: true, hasSymbolTooltip: true,
                  }, 500)}
                </div>
                <div style={card}>
                  {lbl("MARKET OVERVIEW — INDICES / TECH / MACRO")}
                  {tvFrame("embed-widget-market-overview.js", {
                    ...dark, dateRange: "3M", showChart: true, showSymbolLogo: true, showFloatingTooltip: true,
                    plotLineColorGrowing: "#26a69a", plotLineColorFalling: "#ef5350",
                    tabs: [
                      { title: "Indices", symbols: [
                        { s: "FOREXCOM:SPXUSD", d: "S&P 500" }, { s: "FOREXCOM:NSXUSD", d: "Nasdaq 100" },
                        { s: "FOREXCOM:DJI", d: "Dow Jones" }, { s: "INDEX:RTY", d: "Russell 2000" },
                        { s: "NASDAQ:QQQ" }, { s: "AMEX:IWM" } ] },
                      { title: "Tech", symbols: [
                        { s: "NASDAQ:NVDA" }, { s: "NASDAQ:AAPL" }, { s: "NASDAQ:MSFT" },
                        { s: "NASDAQ:META" }, { s: "NASDAQ:GOOGL" }, { s: "NASDAQ:AMZN" } ] },
                      { title: "Macro", symbols: [
                        { s: "AMEX:GLD", d: "Gold" }, { s: "AMEX:USO", d: "Oil" },
                        { s: "NASDAQ:TLT", d: "Bonds" }, { s: "AMEX:UUP", d: "USD" },
                        { s: "BITSTAMP:BTCUSD", d: "Bitcoin" }, { s: "AMEX:SLV", d: "Silver" } ] },
                    ],
                  }, 500)}
                </div>
              </div>

              {/* Row 2: Quotes + News */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                <div style={card}>
                  {lbl("MARKET QUOTES — TECH / ETFs / CRYPTO")}
                  {tvFrame("embed-widget-market-quotes.js", {
                    ...dark, showSymbolLogo: true,
                    symbolsGroups: [
                      { name: "Tech", symbols: [
                        { name: "NASDAQ:NVDA" }, { name: "NASDAQ:AAPL" }, { name: "NASDAQ:MSFT" },
                        { name: "NASDAQ:META" }, { name: "NASDAQ:GOOGL" }, { name: "NASDAQ:AMZN" } ] },
                      { name: "ETFs", symbols: [
                        { name: "AMEX:SPY" }, { name: "NASDAQ:QQQ" }, { name: "AMEX:IWM" },
                        { name: "NASDAQ:TLT" }, { name: "AMEX:GLD" }, { name: "AMEX:USO" } ] },
                      { name: "Crypto", symbols: [
                        { name: "BITSTAMP:BTCUSD" }, { name: "COINBASE:ETHUSD" } ] },
                    ],
                  }, 500)}
                </div>
                <div style={card}>
                  {lbl("MARKET NEWS TIMELINE")}
                  {tvFrame("embed-widget-timeline.js", {
                    ...dark, feedMode: "all_symbols", displayMode: "regular",
                  }, 500)}
                </div>
              </div>

              {/* Stock Deep Dive */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em" }}>
                    STOCK DEEP DIVE
                  </div>
                  <input
                    value={tvOsInput}
                    onChange={e => setTvOsInput(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === "Enter") setTvOsSymbol(tvOsInput.trim() || "SPY"); }}
                    placeholder="SYMBOL"
                    style={{ fontFamily: MONO, fontSize: 11, background: C.surface, border: `1px solid ${C.border}`,
                      color: C.text, borderRadius: 4, padding: "4px 8px", width: 90, outline: "none" }}
                  />
                  <button
                    onClick={() => setTvOsSymbol(tvOsInput.trim() || "SPY")}
                    style={{ fontFamily: MONO, fontSize: 10, background: `${C.accent}18`, border: `1px solid ${C.accent}55`,
                      color: C.accent, borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>
                    GO
                  </button>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                    Showing: <b style={{ color: C.text }}>{sym}</b>
                  </span>
                </div>

                {/* Symbol Info */}
                <div key={`si-${sym}`} style={{ ...card, marginBottom: 10 }}>
                  {tvFrame("embed-widget-symbol-info.js", {
                    ...dark, symbol: sym, largeChartUrl: "",
                  }, 160)}
                </div>

                {/* Chart + Technical Analysis */}
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div key={`ch-${sym}`} style={card}>
                    {lbl("ADVANCED CHART — DAILY")}
                    {tvFrame("embed-widget-advanced-chart.js", {
                      ...dark, symbol: sym, interval: "D", style: "1",
                      details: true, hotlist: true, calendar: false,
                      studies: ["STD;MACD", "STD;RSI"],
                      allow_symbol_change: false, save_image: false,
                    }, 650)}
                  </div>
                  <div key={`ta-${sym}`} style={card}>
                    {lbl("TECHNICAL ANALYSIS")}
                    {tvFrame("embed-widget-technical-analysis.js", {
                      ...dark, symbol: sym, interval: "1h", showIntervalTabs: true,
                    }, 650)}
                  </div>
                </div>

                {/* Company Profile + Financials */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div key={`cp-${sym}`} style={card}>
                    {lbl("COMPANY PROFILE")}
                    {tvFrame("embed-widget-company-profile.js", { ...dark, symbol: sym }, 500)}
                  </div>
                  <div key={`fn-${sym}`} style={card}>
                    {lbl("FINANCIALS")}
                    {tvFrame("embed-widget-financials.js", { ...dark, symbol: sym, displayMode: "regular" }, 500)}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── 5X PLAYS: High-Growth Thematic Watchlist ──────────────────────── */}
        {activeTab === "fivex" && (() => {
          const FIVEX = FIVEX_DATA; // module-level constant — shared with Smart Scanner

          const SECTOR_META = {
            "Defense AI":        { color: "#4488ff", icon: "🛡️" },
            "Robotics":          { color: "#00d4ff", icon: "🤖" },
            "Nuclear":           { color: "#ffaa00", icon: "⚛️" },
            "Space":             { color: "#b06cff", icon: "🚀" },
            "Satellite AI":      { color: "#00ffd4", icon: "🛰️" },
            "Automation":        { color: "#66ff88", icon: "⚙️" },
            "AI Energy":         { color: "#ff6633", icon: "⚡" },
            "Infrastructure":    { color: "#88a0b8", icon: "🏗️" },
            "AI Infrastructure": { color: "#cc66ff", icon: "🖥️" },
            "Quantum AI":        { color: "#ff44cc", icon: "⚛️🤖" },
            "AI Voice":          { color: "#44ffdd", icon: "🎙️" },
            "Air Mobility":      { color: "#88ccff", icon: "✈️" },
          };

          const RISK_COLOR = {
            "Medium":       "#26a69a",
            "Medium-High":  "#a8c030",
            "High":         "#ffaa00",
            "Very High":    "#ff7030",
            "Extreme":      "#ff2255",
          };

          const UPSIDE_COLOR = (u) => {
            if (u === "10x+") return "#ffd700";
            if (u.startsWith("8x")) return "#00d4ff";
            if (u.startsWith("5x")) return "#66ff88";
            return "#aabbcc";
          };

          const $ = (n) => `$${n.toFixed(2)}`;
          const sectors = ["ALL", ...Object.keys(SECTOR_META)];

          // zone classification per ticker (using live price when available)
          function getZone(s) {
            const lv = fivexPrices[s.ticker];
            const p  = lv ? lv.price : s.price;
            if (!lv) return "no-data";
            if (p <= s.stop)     return "stop";
            if (p <= s.e3)       return "deep";
            if (p <= s.e2)       return "better";
            if (p <= s.e1)       return "starter";
            if (p >= s.trigger)  return "breakout";
            return "wait";
          }

          // zone sort order
          const ZONE_ORDER = { deep: 0, better: 1, starter: 2, breakout: 3, wait: 4, stop: 5, "no-data": 6 };
          const UPSIDE_VAL = u => u === "10x+" ? 10 : parseFloat(u) || 0;
          const RISK_ORDER = { Extreme: 0, "Very High": 1, High: 2, "Medium-High": 3, Medium: 4 };

          // sector summary counts
          const counts = {};
          FIVEX.forEach(s => { counts[s.sector] = (counts[s.sector] || 0) + 1; });

          // zone summary counts
          const zoneCounts = { deep: 0, better: 0, starter: 0, breakout: 0, wait: 0, stop: 0 };
          FIVEX.forEach(s => { const z = getZone(s); if (z in zoneCounts) zoneCounts[z]++; });

          // filter + sort
          const filtered = fivexSector === "ALL" ? [...FIVEX] : FIVEX.filter(s => s.sector === fivexSector);
          const visible = filtered.sort((a, b) => {
            if (fivexSort === "zone")   return ZONE_ORDER[getZone(a)] - ZONE_ORDER[getZone(b)];
            if (fivexSort === "upside") return UPSIDE_VAL(b.upside) - UPSIDE_VAL(a.upside);
            if (fivexSort === "risk")   return (RISK_ORDER[a.risk] ?? 9) - (RISK_ORDER[b.risk] ?? 9);
            return a.rank - b.rank; // default: rank
          });

          const TH = (label, tip) => (
            <th title={tip} style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, fontWeight: 700,
              padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap",
              borderBottom: `1px solid ${C.border}`, letterSpacing: "0.06em" }}>
              {label}
            </th>
          );

          return (
            <div>
              {/* ── Header ── */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, letterSpacing: "0.08em" }}>
                    🚀 HIGH-GROWTH THEMATIC WATCHLIST — 5× AND UP
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 4 }}>
                    AI · INFRASTRUCTURE · ROBOTICS · NUCLEAR · SATELLITE · SPACE · AI ENERGY · DEFENCE AI &nbsp;|&nbsp;
                    {FIVEX.length} STOCKS &nbsp;|&nbsp; REF PRICES: 2026-05-27
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: "#ff9900", marginTop: 3 }}>
                    ⚠ Entry zones rule-based (−5% / −12% / −20% from ref price). Not financial advice.
                  </div>
                  {fivexFetchedAt && (
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.green, marginTop: 3 }}>
                      ● LIVE PRICES as of {fivexFetchedAt.toLocaleTimeString()}
                    </div>
                  )}
                  {fivexError && (
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.red, marginTop: 3 }}>⚠ {fivexError}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={fetchLivePrices}
                    disabled={fivexLoading}
                    style={{ fontFamily: MONO, fontSize: 10,
                      background: fivexLoading ? C.surface : `${C.green}18`,
                      border: `1px solid ${fivexLoading ? C.border : C.green}`,
                      color: fivexLoading ? C.textDim : C.green,
                      borderRadius: 4, padding: "5px 12px", cursor: fivexLoading ? "default" : "pointer", whiteSpace: "nowrap" }}>
                    {fivexLoading ? "⌛ LOADING…" : "↻ LIVE PRICES"}
                  </button>
                  <button
                    onClick={async () => {
                      const lines = ["🚀 *5X Growth Watchlist*\n"];
                      visible.forEach(s => {
                        const lv = fivexPrices[s.ticker];
                        const sm = SECTOR_META[s.sector];
                        const priceStr = lv ? ` @ $${lv.price.toFixed(2)} (${lv.pct >= 0 ? "+" : ""}${lv.pct.toFixed(1)}%)` : "";
                        const zone = lv ? (lv.price <= s.e3 ? " 🟢 DEEP VALUE" : lv.price <= s.e2 ? " 🟡 IN ZONE" : lv.price <= s.e1 ? " 🔵 STARTER" : "") : "";
                        lines.push(`${sm ? sm.icon : "•"} *${s.ticker}*${priceStr}${zone} ${s.upside} — ${s.thesis}`);
                      });
                      try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) }); } catch {}
                    }}
                    style={{ fontFamily: MONO, fontSize: 10, background: `${C.accent}18`, border: `1px solid ${C.accent}55`,
                      color: C.accent, borderRadius: 4, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                    PUSH TO TELEGRAM
                  </button>
                </div>
              </div>

              {/* ── Zone summary bar ── */}
              {Object.keys(fivexPrices).length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12,
                  padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginRight: 4 }}>LIVE ZONES:</span>
                  {[
                    { key: "deep",     label: "🟢 DEEP VALUE",  color: "#00e676" },
                    { key: "better",   label: "⚡ BETTER ENTRY", color: "#4caf50" },
                    { key: "starter",  label: "🔵 STARTER",      color: "#26a69a" },
                    { key: "breakout", label: "🚀 BREAKOUT",     color: "#ffd700" },
                    { key: "wait",     label: "⏳ WAIT",         color: C.textDim },
                    { key: "stop",     label: "⚠ BELOW STOP",   color: C.red     },
                  ].map(({ key, label, color }) => zoneCounts[key] > 0 && (
                    <span key={key} style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700,
                      color, background: color + "18", border: `1px solid ${color}44`,
                      borderRadius: 12, padding: "3px 10px", cursor: "pointer" }}
                      onClick={() => setFivexSort("zone")}>
                      {label} <span style={{ fontWeight: 900 }}>{zoneCounts[key]}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* ── Sort + Sector pills row ── */}
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>SORT:</span>
                {[["rank","RANK"],["zone","ZONE"],["upside","UPSIDE"],["risk","RISK"]].map(([val, lbl]) => (
                  <button key={val} onClick={() => setFivexSort(val)} style={{
                    fontFamily: MONO, fontSize: 9, cursor: "pointer", borderRadius: 4,
                    padding: "3px 8px",
                    background: fivexSort === val ? `${C.accent}22` : C.surface,
                    border: `1px solid ${fivexSort === val ? C.accent : C.border}`,
                    color: fivexSort === val ? C.accent : C.textDim, fontWeight: fivexSort === val ? 700 : 400,
                  }}>{lbl}</button>
                ))}
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.border, margin: "0 4px" }}>|</span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>SECTOR:</span>
              </div>

              {/* ── Sector summary pills ── */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {sectors.map(sec => {
                  const meta = SECTOR_META[sec];
                  const active = fivexSector === sec;
                  const cnt = sec === "ALL" ? FIVEX.length : (counts[sec] || 0);
                  return (
                    <button key={sec}
                      onClick={() => setFivexSector(sec)}
                      style={{
                        fontFamily: MONO, fontSize: 9, cursor: "pointer", borderRadius: 20,
                        padding: "4px 10px", whiteSpace: "nowrap",
                        background: active ? (meta ? meta.color + "30" : `${C.accent}22`) : C.surface,
                        border: `1px solid ${active ? (meta ? meta.color : C.accent) : C.border}`,
                        color: active ? (meta ? meta.color : C.accent) : C.textDim,
                        fontWeight: active ? 700 : 400,
                      }}>
                      {meta ? meta.icon + " " : ""}{sec} {cnt > 0 && cnt < FIVEX.length ? `(${cnt})` : ""}
                    </button>
                  );
                })}
              </div>

              {/* ── Table ── */}
              <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
                  <thead style={{ background: themeMode === "dark" ? "#0d1117" : "#f0f2f5" }}>
                    <tr>
                      {TH("#", "Rank by price")}
                      {TH("TICKER", "Symbol")}
                      {TH("COMPANY", "Company name")}
                      {TH("SECTOR", "Thematic sector")}
                      {TH("REF PRICE", "Reference capture price (2026-05-27)")}
                      {TH("LIVE", "Live market price + today's change")}
                      {TH("ZONE", "Current entry zone based on live price")}
                      {TH("STARTER −5%", "Starter entry zone")}
                      {TH("BETTER −12%", "Better entry zone")}
                      {TH("DEEP −20%", "Deep value entry zone")}
                      {TH("BREAKOUT +8%", "Breakout trigger level")}
                      {TH("STOP −15%", "Suggested stop loss")}
                      {TH("RISK", "Risk classification")}
                      {TH("UPSIDE", "Potential upside multiple")}
                      {TH("THESIS", "Investment thesis")}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((s, i) => {
                      const meta = SECTOR_META[s.sector] || { color: C.textDim, icon: "•" };
                      const rColor = RISK_COLOR[s.risk] || C.textDim;
                      const uColor = UPSIDE_COLOR(s.upside);
                      const lv = fivexPrices[s.ticker];
                      const liveP = lv ? lv.price : null;
                      // Use live price for zone detection when available, fall back to ref price
                      const checkP = liveP || s.price;
                      const isAboveBreakout = checkP >= s.trigger;
                      const isBelowStop     = checkP <= s.stop;
                      const isInEntry1      = checkP <= s.e1;
                      const isInEntry2      = checkP <= s.e2;
                      const isInEntry3      = checkP <= s.e3;
                      // Row tint based on live zone
                      let rowTint = "transparent";
                      if (liveP) {
                        if (isBelowStop)        rowTint = "#ff22441a";
                        else if (isInEntry3)    rowTint = "#00e67610";
                        else if (isInEntry2)    rowTint = "#4caf5010";
                        else if (isInEntry1)    rowTint = "#26a69a0c";
                        else if (isAboveBreakout) rowTint = "#ffd70010";
                      }
                      const rowBase = i % 2 === 0
                        ? (themeMode === "dark" ? "#11161d" : "#f9fafb")
                        : (themeMode === "dark" ? "#0d1117" : "#ffffff");
                      const rowBg = rowTint !== "transparent" ? rowTint : rowBase;
                      // Zone badge
                      let zoneBadge = null;
                      if (liveP) {
                        if (isBelowStop)          zoneBadge = { label: "⚠ STOP", color: C.red };
                        else if (isInEntry3)      zoneBadge = { label: "🟢 DEEP", color: "#00e676" };
                        else if (isInEntry2)      zoneBadge = { label: "⚡ BETTER", color: "#4caf50" };
                        else if (isInEntry1)      zoneBadge = { label: "🔵 STARTER", color: "#26a69a" };
                        else if (isAboveBreakout) zoneBadge = { label: "🚀 BREAK", color: "#ffd700" };
                        else                      zoneBadge = { label: "WAIT", color: C.textDim };
                      }
                      return (
                        <tr key={s.ticker} style={{ background: rowBg, cursor: "pointer" }}
                          onClick={() => { setTvOsInput(s.ticker); setTvOsSymbol(s.ticker); setActiveTab("openstock"); }}
                          title={`Click to open ${s.ticker} in Stock Deep Dive`}>
                          {/* Rank */}
                          <td style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, textAlign: "center",
                            padding: "9px 8px", borderBottom: `1px solid ${C.border}22` }}>
                            {s.rank}
                          </td>
                          {/* Ticker */}
                          <td style={{ padding: "9px 8px", borderBottom: `1px solid ${C.border}22`, textAlign: "center" }}>
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: meta.color,
                              background: meta.color + "18", borderRadius: 4, padding: "2px 6px" }}>
                              {s.ticker}
                            </span>
                          </td>
                          {/* Company */}
                          <td style={{ fontFamily: MONO, fontSize: 10, color: C.text, padding: "9px 8px",
                            borderBottom: `1px solid ${C.border}22`, whiteSpace: "nowrap" }}>
                            {s.company}
                          </td>
                          {/* Sector */}
                          <td style={{ padding: "9px 8px", borderBottom: `1px solid ${C.border}22`, whiteSpace: "nowrap" }}>
                            <span style={{ fontFamily: MONO, fontSize: 9, color: meta.color, fontWeight: 700 }}>
                              {meta.icon} {s.sector}
                            </span>
                          </td>
                          {/* Ref Price */}
                          <td style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: C.textDim,
                            textAlign: "right", padding: "9px 10px", borderBottom: `1px solid ${C.border}22` }}>
                            {$(s.price)}
                          </td>
                          {/* Live Price */}
                          <td style={{ padding: "9px 10px", borderBottom: `1px solid ${C.border}22`, textAlign: "right" }}>
                            {fivexLoading ? (
                              <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>…</span>
                            ) : liveP ? (
                              <div>
                                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800,
                                  color: lv.pct >= 0 ? C.green : C.red }}>
                                  {$(liveP)}
                                </div>
                                <div style={{ fontFamily: MONO, fontSize: 8,
                                  color: lv.pct >= 0 ? C.green : C.red }}>
                                  {lv.pct >= 0 ? "+" : ""}{lv.pct.toFixed(2)}%
                                </div>
                              </div>
                            ) : (
                              <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>—</span>
                            )}
                          </td>
                          {/* Zone Badge */}
                          <td style={{ textAlign: "center", padding: "9px 8px", borderBottom: `1px solid ${C.border}22` }}>
                            {zoneBadge ? (
                              <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700,
                                color: zoneBadge.color, background: zoneBadge.color + "22",
                                border: `1px solid ${zoneBadge.color}44`,
                                borderRadius: 4, padding: "2px 5px", whiteSpace: "nowrap" }}>
                                {zoneBadge.label}
                              </span>
                            ) : (
                              <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>—</span>
                            )}
                          </td>
                          {/* Entry 1 -5% */}
                          <td style={{ fontFamily: MONO, fontSize: 10, textAlign: "right", padding: "9px 10px",
                            borderBottom: `1px solid ${C.border}22`,
                            color: isInEntry1 ? "#26a69a" : C.textDim,
                            background: isInEntry1 ? "#26a69a14" : "transparent" }}>
                            {$(s.e1)}
                          </td>
                          {/* Entry 2 -12% */}
                          <td style={{ fontFamily: MONO, fontSize: 10, textAlign: "right", padding: "9px 10px",
                            borderBottom: `1px solid ${C.border}22`,
                            color: isInEntry2 ? "#4caf50" : C.textDim,
                            fontWeight: isInEntry2 ? 700 : 400,
                            background: isInEntry2 ? "#4caf5018" : "transparent" }}>
                            {$(s.e2)}
                          </td>
                          {/* Entry 3 -20% deep value */}
                          <td style={{ fontFamily: MONO, fontSize: 11, textAlign: "right", padding: "9px 10px",
                            borderBottom: `1px solid ${C.border}22`,
                            color: isInEntry3 ? "#00e676" : C.textDim,
                            fontWeight: isInEntry3 ? 800 : 400,
                            background: isInEntry3 ? "#00e67618" : "transparent" }}>
                            {$(s.e3)}
                          </td>
                          {/* Breakout +8% */}
                          <td style={{ fontFamily: MONO, fontSize: 10, textAlign: "right", padding: "9px 10px",
                            borderBottom: `1px solid ${C.border}22`,
                            color: isAboveBreakout ? "#ffd700" : "#ff9900",
                            fontWeight: 700 }}>
                            {$(s.trigger)}
                          </td>
                          {/* Stop -15% */}
                          <td style={{ fontFamily: MONO, fontSize: 10, textAlign: "right", padding: "9px 10px",
                            borderBottom: `1px solid ${C.border}22`, color: C.red }}>
                            {$(s.stop)}
                          </td>
                          {/* Risk */}
                          <td style={{ textAlign: "center", padding: "9px 8px", borderBottom: `1px solid ${C.border}22` }}>
                            <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, color: rColor,
                              background: rColor + "20", border: `1px solid ${rColor}55`,
                              borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" }}>
                              {s.risk.toUpperCase()}
                            </span>
                          </td>
                          {/* Upside */}
                          <td style={{ textAlign: "center", padding: "9px 8px", borderBottom: `1px solid ${C.border}22` }}>
                            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: uColor }}>
                              {s.upside}
                            </span>
                          </td>
                          {/* Thesis */}
                          <td style={{ fontFamily: MONO, fontSize: 9, color: C.textSec, padding: "9px 10px",
                            borderBottom: `1px solid ${C.border}22`, whiteSpace: "nowrap" }}>
                            {s.thesis}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Legend ── */}
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 14, padding: "10px 14px",
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>
                  <span style={{ color: "#26a69a" }}>■</span> STARTER −5% &nbsp;
                  <span style={{ color: "#4caf50" }}>■</span> BETTER −12% &nbsp;
                  <span style={{ color: "#00e676", fontWeight: 700 }}>■</span> DEEP −20% &nbsp;&nbsp;
                  <span style={{ color: "#ff9900" }}>■</span> BREAKOUT +8% &nbsp;
                  <span style={{ color: C.red }}>■</span> STOP −15%
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>
                  {["Extreme","Very High","High","Medium-High","Medium"].map(r => (
                    <span key={r} style={{ marginRight: 10 }}>
                      <span style={{ color: RISK_COLOR[r] }}>■</span> {r}
                    </span>
                  ))}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginLeft: "auto" }}>
                  Click any row → Stock Deep Dive ↗
                </div>
              </div>
            </div>
          );
        })()}

        {activeTab === "smartscan" && (() => {
          // ── Signal badge style helper ─────────────────────────────────────
          const SIG_STYLE = (sColor) => ({
            display: "inline-block", fontFamily: MONO, fontSize: 9, fontWeight: 800,
            color: sColor, background: sColor + "22", border: `1px solid ${sColor}44`,
            borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap",
          });

          // ── Summary counts ────────────────────────────────────────────────
          const sigCounts = { "STRONG BUY": 0, "BUY": 0, "WATCH": 0, "NEUTRAL": 0, "AVOID": 0 };
          scanResults.forEach(r => { if (sigCounts[r.signal] !== undefined) sigCounts[r.signal]++; });

          const STAT_CARDS = [
            { label: "STRONG BUY", count: sigCounts["STRONG BUY"], color: "#00e676" },
            { label: "BUY",        count: sigCounts["BUY"],        color: "#4caf50" },
            { label: "WATCH",      count: sigCounts["WATCH"],      color: "#26a69a" },
            { label: "NEUTRAL",    count: sigCounts["NEUTRAL"],    color: "#ffaa00" },
            { label: "AVOID",      count: sigCounts["AVOID"],      color: "#ff4444" },
          ];

          return (
            <div style={{ padding: "0 2px" }}>

              {/* ── Header ── */}
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12,
                marginBottom: 14, padding: "12px 16px",
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text,
                    letterSpacing: "0.06em" }}>🧠 SMART SCANNER</div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 2 }}>
                    AI-scored technical + entry zone + volume + sentiment — 30 high-growth tickers
                  </div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {scanLastRun && (
                    <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>
                      Last scan: {scanLastRun.toLocaleTimeString()}
                    </span>
                  )}
                  {scanLoading && (
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.accent }}>
                      ⌛ Scanning {scanProgress.done}/{scanProgress.total}…
                      <div style={{ marginTop: 4, width: 160, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${Math.round((scanProgress.done / scanProgress.total) * 100)}%`,
                          height: "100%", background: C.accent, borderRadius: 2, transition: "width 0.3s" }} />
                      </div>
                    </div>
                  )}
                  <button onClick={runSmartScan} disabled={scanLoading}
                    style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700,
                      background: scanLoading ? C.surface : `${C.green}18`,
                      border: `1px solid ${scanLoading ? C.border : C.green}`,
                      color: scanLoading ? C.textDim : C.green,
                      borderRadius: 6, padding: "7px 18px", cursor: scanLoading ? "default" : "pointer" }}>
                    {scanLoading ? "⌛ SCANNING…" : "▶ RUN SCAN"}
                  </button>
                </div>
              </div>

              {/* ── Error ── */}
              {scanError && (
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.red,
                  background: C.redBg, border: `1px solid ${C.red}44`,
                  borderRadius: 6, padding: "8px 14px", marginBottom: 10 }}>
                  ⚠ {scanError}
                </div>
              )}

              {/* ── Empty state ── */}
              {!scanLoading && !scanError && scanResults.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 0",
                  fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                  Press <strong style={{ color: C.green }}>▶ RUN SCAN</strong> to analyse all 30 watchlist stocks
                  <div style={{ fontSize: 9, marginTop: 8, color: C.textDim }}>
                    RSI · MACD · EMA · Entry zones · Volume · 52W position · News sentiment
                  </div>
                </div>
              )}

              {/* ── Summary stat cards ── */}
              {scanResults.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  {STAT_CARDS.map(sc => (
                    <div key={sc.label} style={{ flex: "1 1 100px", minWidth: 90,
                      background: C.card, border: `1px solid ${sc.color}44`,
                      borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
                      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: sc.color,
                        lineHeight: 1 }}>
                        {sc.count}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 8, color: sc.color + "cc",
                        marginTop: 4, letterSpacing: "0.06em" }}>
                        {sc.label}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Results table ── */}
              {scanResults.length > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 10, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: themeMode === "dark" ? "#0b1526" : "#f0f4fa" }}>
                        {["#","SCORE","SIGNAL","TICKER","SECTOR","LIVE $","RSI","MACD","EMA","ZONE","UPSIDE","THESIS"].map(h => (
                          <th key={h} style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700,
                            color: C.textDim, padding: "8px 10px", textAlign: h === "#" ? "center" : "left",
                            letterSpacing: "0.05em", borderBottom: `1px solid ${C.border}`,
                            whiteSpace: "nowrap" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {scanResults.map((row, idx) => {
                        const isExpanded = scanExpanded === row.ticker;
                        const ref = FIVEX_REF[row.ticker];
                        const livePrice = Number(row.quote?.price || 0);
                        const liveChg   = Number(row.quote?.changePercent || 0);
                        const yH = Number(row.quote?.yearHigh || 0);
                        const yL = Number(row.quote?.yearLow  || 0);

                        // Zone label
                        let zoneLbl = "—", zoneCol = C.textDim;
                        if (ref && livePrice > 0) {
                          if      (livePrice <= ref.stop)    { zoneLbl = "⚠ STOP";   zoneCol = C.red; }
                          else if (livePrice <= ref.e3)      { zoneLbl = "🟢 DEEP";   zoneCol = "#00e676"; }
                          else if (livePrice <= ref.e2)      { zoneLbl = "⚡ BETTER"; zoneCol = "#4caf50"; }
                          else if (livePrice <= ref.e1)      { zoneLbl = "🔵 STARTER"; zoneCol = "#26a69a"; }
                          else if (livePrice >= ref.trigger) { zoneLbl = "🔶 ABOVE"; zoneCol = "#ff9900"; }
                          else                               { zoneLbl = "WAIT";      zoneCol = C.textDim; }
                        }

                        const emaLabel = (row.ema9v && row.ema21v)
                          ? (row.ema9v > row.ema21v ? "9>21 ▲" : "9<21 ▼")
                          : "—";
                        const emaCol   = (row.ema9v && row.ema21v)
                          ? (row.ema9v > row.ema21v ? C.green : C.red)
                          : C.textDim;

                        const deepData = scanDeepData[row.ticker];
                        const isLoading = scanDeepLoad[row.ticker];
                        const fd = deepData?.fundamentals;

                        const $ = v => (v == null || isNaN(v)) ? "—" : `$${Number(v).toFixed(2)}`;
                        const fmt = (v, decimals = 2) => (v == null || isNaN(v)) ? "—" : Number(v).toFixed(decimals);

                        return (
                          <React.Fragment key={row.ticker}>
                            {/* ── Main row ── */}
                            <tr
                              onClick={() => {
                                if (scanExpanded === row.ticker) {
                                  setScanExpanded(null);
                                } else {
                                  setScanExpanded(row.ticker);
                                  loadDeepDive(row.ticker);
                                }
                              }}
                              style={{
                                cursor: "pointer",
                                background: isExpanded
                                  ? (themeMode === "dark" ? "#0d1f38" : "#eef4ff")
                                  : (idx % 2 === 0 ? "transparent" : (themeMode === "dark" ? "#0a1628" : "#f8fbff")),
                                borderLeft: isExpanded ? `3px solid ${row.sColor}` : "3px solid transparent",
                              }}
                            >
                              {/* Rank */}
                              <td style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700,
                                color: C.textDim, textAlign: "center", padding: "9px 8px",
                                borderBottom: `1px solid ${C.border}22` }}>
                                {idx + 1}
                              </td>

                              {/* Score bar */}
                              <td style={{ padding: "9px 10px", borderBottom: `1px solid ${C.border}22`,
                                minWidth: 90 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 3,
                                    overflow: "hidden", minWidth: 50 }}>
                                    <div style={{ width: `${row.score}%`, height: "100%",
                                      background: row.sColor, borderRadius: 3, transition: "width 0.4s" }} />
                                  </div>
                                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800,
                                    color: row.sColor, minWidth: 22, textAlign: "right" }}>
                                    {row.score}
                                  </span>
                                </div>
                              </td>

                              {/* Signal badge */}
                              <td style={{ padding: "9px 8px", borderBottom: `1px solid ${C.border}22` }}>
                                <span style={SIG_STYLE(row.sColor)}>{row.signal}</span>
                              </td>

                              {/* Ticker */}
                              <td style={{ padding: "9px 10px", borderBottom: `1px solid ${C.border}22` }}>
                                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text }}>
                                  {row.ticker}
                                </div>
                                {ref && (
                                  <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, marginTop: 1 }}>
                                    {ref.company}
                                  </div>
                                )}
                              </td>

                              {/* Sector */}
                              <td style={{ fontFamily: MONO, fontSize: 9, color: C.textDim,
                                padding: "9px 10px", borderBottom: `1px solid ${C.border}22`,
                                whiteSpace: "nowrap" }}>
                                {ref?.sector || "—"}
                              </td>

                              {/* Live price */}
                              <td style={{ padding: "9px 10px", borderBottom: `1px solid ${C.border}22`,
                                textAlign: "right", minWidth: 72 }}>
                                {livePrice > 0 ? (
                                  <>
                                    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800,
                                      color: liveChg >= 0 ? C.green : C.red }}>
                                      ${livePrice.toFixed(2)}
                                    </div>
                                    <div style={{ fontFamily: MONO, fontSize: 8,
                                      color: liveChg >= 0 ? C.green : C.red }}>
                                      {liveChg >= 0 ? "+" : ""}{liveChg.toFixed(2)}%
                                    </div>
                                  </>
                                ) : (
                                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>—</span>
                                )}
                              </td>

                              {/* RSI */}
                              <td style={{ fontFamily: MONO, fontSize: 10, textAlign: "center",
                                padding: "9px 8px", borderBottom: `1px solid ${C.border}22`,
                                color: row.rsiVal === null ? C.textDim
                                  : row.rsiVal < 30 ? C.green
                                  : row.rsiVal > 70 ? C.red
                                  : C.text,
                                fontWeight: row.rsiVal !== null ? 700 : 400 }}>
                                {row.rsiVal !== null ? row.rsiVal.toFixed(0) : "—"}
                              </td>

                              {/* MACD */}
                              <td style={{ textAlign: "center", padding: "9px 8px",
                                borderBottom: `1px solid ${C.border}22` }}>
                                {row.macdBull === null ? (
                                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>—</span>
                                ) : row.macdBull ? (
                                  <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.green }}>▲ BULL</span>
                                ) : (
                                  <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.red }}>▼ BEAR</span>
                                )}
                              </td>

                              {/* EMA cross */}
                              <td style={{ fontFamily: MONO, fontSize: 9, textAlign: "center",
                                padding: "9px 8px", borderBottom: `1px solid ${C.border}22`,
                                color: emaCol, fontWeight: 700 }}>
                                {emaLabel}
                              </td>

                              {/* Zone */}
                              <td style={{ fontFamily: MONO, fontSize: 9, textAlign: "center",
                                padding: "9px 8px", borderBottom: `1px solid ${C.border}22`,
                                color: zoneCol, fontWeight: 700, whiteSpace: "nowrap" }}>
                                {zoneLbl}
                              </td>

                              {/* Upside */}
                              <td style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800,
                                textAlign: "center", padding: "9px 8px",
                                borderBottom: `1px solid ${C.border}22`,
                                color: C.amber }}>
                                {ref?.upside || "—"}
                              </td>

                              {/* Thesis */}
                              <td style={{ fontFamily: MONO, fontSize: 9, color: C.textSec,
                                padding: "9px 10px", borderBottom: `1px solid ${C.border}22`,
                                whiteSpace: "nowrap" }}>
                                {ref?.thesis || "—"}
                                <span style={{ marginLeft: 6, color: C.accent, fontSize: 9 }}>
                                  {isExpanded ? "▲" : "▼"}
                                </span>
                              </td>
                            </tr>

                            {/* ── Deep Dive row ── */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={12}
                                  style={{ background: themeMode === "dark" ? "#081221" : "#f4f8ff",
                                    borderLeft: `3px solid ${row.sColor}`,
                                    borderBottom: `2px solid ${row.sColor}44`,
                                    padding: "16px 18px" }}>

                                  {isLoading ? (
                                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim,
                                      textAlign: "center", padding: "24px 0" }}>
                                      ⌛ Loading deep dive data for {row.ticker}…
                                    </div>
                                  ) : (
                                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>

                                      {/* ── Left: TradingView mini chart ── */}
                                      <div style={{ flex: "0 0 340px", minWidth: 280 }}>
                                        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700,
                                          color: C.textDim, marginBottom: 6, letterSpacing: "0.06em" }}>
                                          📊 CHART
                                        </div>
                                        <div style={{ borderRadius: 6, overflow: "hidden",
                                          border: `1px solid ${C.border}` }}>
                                          <iframe
                                            title={`tv-${row.ticker}`}
                                            scrolling="no"
                                            style={{ width: "100%", height: 220, border: "none" }}
                                            srcDoc={`<!DOCTYPE html><html><head><style>body{margin:0;padding:0;overflow:hidden;background:#0c1525}</style></head><body><div class="tradingview-widget-container"><div id="tv_chart"></div><script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js" async>{"symbol":"${row.ticker}","width":"100%","height":220,"locale":"en","dateRange":"3M","colorTheme":"${themeMode}","isTransparent":false,"autosize":true,"largeChartUrl":""}<\/script></div></body></html>`}
                                          />
                                        </div>
                                      </div>

                                      {/* ── Middle: Signals + Technicals ── */}
                                      <div style={{ flex: "1 1 200px", minWidth: 180 }}>
                                        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700,
                                          color: C.textDim, marginBottom: 6, letterSpacing: "0.06em" }}>
                                          ⚡ SIGNALS ({row.signals?.length || 0})
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                          {(row.signals || []).length === 0 ? (
                                            <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>
                                              No signals — run scan for live data
                                            </span>
                                          ) : (row.signals || []).map((sig, si) => (
                                            <div key={si} style={{ display: "flex", alignItems: "center",
                                              gap: 6, fontFamily: MONO, fontSize: 9,
                                              color: sig.bull ? C.green : C.red }}>
                                              <span>{sig.bull ? "▲" : "▼"}</span>
                                              <span>{sig.txt}</span>
                                            </div>
                                          ))}
                                        </div>

                                        {/* Entry zones */}
                                        {ref && (
                                          <div style={{ marginTop: 12 }}>
                                            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700,
                                              color: C.textDim, marginBottom: 6, letterSpacing: "0.06em" }}>
                                              🎯 ENTRY ZONES
                                            </div>
                                            {[
                                              { label: "Deep Value", val: ref.e3, col: "#00e676" },
                                              { label: "Better",     val: ref.e2, col: "#4caf50" },
                                              { label: "Starter",    val: ref.e1, col: "#26a69a" },
                                              { label: "Trigger ▲",  val: ref.trigger, col: "#ffd700" },
                                              { label: "Stop ✂",     val: ref.stop,    col: C.red },
                                            ].map(z => (
                                              <div key={z.label} style={{ display: "flex", justifyContent: "space-between",
                                                fontFamily: MONO, fontSize: 9, padding: "2px 0",
                                                borderBottom: `1px solid ${C.border}22` }}>
                                                <span style={{ color: z.col }}>{z.label}</span>
                                                <span style={{ color: z.col, fontWeight: 700 }}>
                                                  ${Number(z.val).toFixed(2)}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>

                                      {/* ── Right: Fundamentals ── */}
                                      <div style={{ flex: "1 1 200px", minWidth: 180 }}>
                                        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700,
                                          color: C.textDim, marginBottom: 6, letterSpacing: "0.06em" }}>
                                          📋 FUNDAMENTALS
                                        </div>
                                        {fd ? (
                                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                            {[
                                              ["Market Cap",    fd.marketCap ? `$${(fd.marketCap/1e9).toFixed(2)}B` : "—"],
                                              ["Revenue TTM",   fd.revenue   ? `$${(fd.revenue/1e9).toFixed(2)}B`   : "—"],
                                              ["Gross Margin",  fd.grossMargin  ? `${(fd.grossMargin*100).toFixed(1)}%`  : "—"],
                                              ["Rev Growth",    fd.revenueGrowth ? `${(fd.revenueGrowth*100).toFixed(1)}%` : "—"],
                                              ["P/S Ratio",     fd.priceToSales ? `${Number(fd.priceToSales).toFixed(1)}×`  : "—"],
                                              ["P/E Ratio",     fd.trailingPE   ? `${Number(fd.trailingPE).toFixed(1)}×`   : "—"],
                                              ["Debt/Equity",   fd.debtToEquity ? `${Number(fd.debtToEquity).toFixed(2)}` : "—"],
                                              ["Cash",          fd.totalCash    ? `$${(fd.totalCash/1e9).toFixed(2)}B`     : "—"],
                                              ["52W Range",     (yH > 0 && yL > 0) ? `$${yL.toFixed(2)} – $${yH.toFixed(2)}` : "—"],
                                            ].map(([k, v]) => (
                                              <div key={k} style={{ display: "flex", justifyContent: "space-between",
                                                fontFamily: MONO, fontSize: 9, padding: "2px 0",
                                                borderBottom: `1px solid ${C.border}22` }}>
                                                <span style={{ color: C.textDim }}>{k}</span>
                                                <span style={{ color: C.text, fontWeight: 600 }}>{v}</span>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>
                                            {deepData ? "No fundamental data available" : "Loading…"}
                                          </div>
                                        )}
                                      </div>

                                      {/* ── Far right: News ── */}
                                      <div style={{ flex: "1 1 220px", minWidth: 200 }}>
                                        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700,
                                          color: C.textDim, marginBottom: 6, letterSpacing: "0.06em" }}>
                                          📰 RECENT NEWS
                                        </div>
                                        {deepData?.news?.length > 0 ? (
                                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                            {deepData.news.slice(0, 6).map((n, ni) => {
                                              const title = n.title || n.headline || "";
                                              const src   = n.source || n.publisher || "";
                                              const url   = n.url || n.link || "#";
                                              const bear  = ["fall","drop","loss","miss","cut","lawsuit","probe","fraud",
                                                "decline","sell","downgrade","warning","fail"].some(w =>
                                                title.toLowerCase().includes(w));
                                              const bull  = ["win","award","contract","surge","beat","record","launch",
                                                "expand","partnership","upgrade","buy","strong","profit","growth",
                                                "milestone"].some(w => title.toLowerCase().includes(w));
                                              return (
                                                <a key={ni} href={url} target="_blank" rel="noopener noreferrer"
                                                  style={{ display: "block", textDecoration: "none",
                                                    padding: "6px 8px", borderRadius: 4,
                                                    background: bear ? C.redBg : bull ? C.greenBg : (themeMode === "dark" ? "#0d1e33" : "#eef4ff"),
                                                    border: `1px solid ${bear ? C.red : bull ? C.green : C.border}44` }}>
                                                  <div style={{ fontFamily: MONO, fontSize: 9,
                                                    color: bear ? C.red : bull ? C.green : C.text,
                                                    lineHeight: 1.4 }}>
                                                    {title.length > 90 ? title.slice(0, 90) + "…" : title}
                                                  </div>
                                                  {src && (
                                                    <div style={{ fontFamily: MONO, fontSize: 8,
                                                      color: C.textDim, marginTop: 2 }}>
                                                      {src}
                                                    </div>
                                                  )}
                                                </a>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>
                                            {deepData ? "No recent news found" : "Loading…"}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Legend ── */}
              {scanResults.length > 0 && (
                <div style={{ marginTop: 10, padding: "8px 14px",
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
                  display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>
                    {[["STRONG BUY","#00e676"],["BUY","#4caf50"],["WATCH","#26a69a"],["NEUTRAL","#ffaa00"],["AVOID","#ff4444"]].map(([l,c]) => (
                      <span key={l} style={{ marginRight: 14 }}>
                        <span style={{ color: c }}>■</span> {l}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginLeft: "auto" }}>
                    Click any row to expand deep dive ↓ · Score = RSI + MACD + EMA + Zone + Volume + Sentiment
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {activeTab === "sectors" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                SECTOR PERFORMANCE — LIVE
              </div>
              {sectorData.length > 0 && (
                <button
                  onClick={async () => {
                    const sorted = [...sectorData].sort((a, b) => (b.changesPercentage || 0) - (a.changesPercentage || 0));
                    const lines = ["🏭 *Sector Snapshot*\n"];
                    sorted.forEach((q, i) => {
                      const chg = q.changesPercentage || 0;
                      const icon = chg >= 0 ? "🟢" : "🔴";
                      const tag = i < 3 ? " ▲ LEADING" : i >= sorted.length - 3 ? " ▼ LAGGING" : "";
                      lines.push(`${icon} *${q.symbol}* ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%${tag}`);
                    });
                    try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) }); } catch {}
                  }}
                  style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 4, padding: "5px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >PUSH BRIEF</button>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <div style={{ minWidth: 420, maxWidth: 560, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent }}>WEATHER ({WEATHER_ZIP})</div>
                  <button
                    onClick={fetchWeather}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                  >
                    {weatherLoading ? "..." : "REFRESH"}
                  </button>
                </div>
                {weatherError && <div style={{ fontSize: 11, color: C.red }}>{weatherError}</div>}
                {!weatherError && !weatherData && <div style={{ fontSize: 11, color: C.textDim }}>Loading weather...</div>}
                {!weatherError && weatherData && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text }}>{weatherData.temp.toFixed(0)}°F</span>
                    <span style={{ fontSize: 11, color: C.textSec }}>{weatherCodeLabel(weatherData.code)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>H/L {weatherData.high.toFixed(0)}°/{weatherData.low.toFixed(0)}°</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Wind {weatherData.wind.toFixed(0)} mph</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: weatherData.rainChance >= 50 ? C.red : C.green }}>Rain {weatherData.rainChance.toFixed(0)}%</span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
              {[...sectorData]
                .sort((a, b) => (b.changesPercentage || 0) - (a.changesPercentage || 0))
                .map((q, i) => {
                  const chg = q.changesPercentage || 0;
                  const isUp = chg >= 0;
                  const isLeader = i < 3;
                  const isLagger = i >= sectorData.length - 3;
                  return (
                    <div key={q.symbol} style={{
                      background: C.card, borderRadius: 5, padding: 18,
                      border: `1px solid ${isLeader ? C.green + "40" : isLagger ? C.red + "30" : C.border}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{q.symbol}</span>
                        {isLeader && <Badge color={C.green}>LEADING</Badge>}
                        {isLagger && <Badge color={C.red}>LAGGING</Badge>}
                      </div>
                      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, marginBottom: 10 }}>{q._sectorName}</div>
                      <div style={{
                        fontFamily: MONO, fontSize: 26, fontWeight: 800,
                        color: isUp ? C.green : C.red, marginBottom: 8,
                      }}>
                        {isUp ? "+" : ""}{chg.toFixed(2)}%
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: MONO, color: C.textDim, marginBottom: 8 }}>
                        <span>${q.price?.toFixed(2)}</span>
                        <span>Vol: {q.volume ? (q.volume / 1e6).toFixed(1) + "M" : "—"}</span>
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          onClick={() => setWatchlistSymbols(prev => watchlistSymbols.includes(q.symbol) ? prev.filter(s => s !== q.symbol) : Array.from(new Set([...prev, q.symbol])))}
                          style={{ flex: 1, fontFamily: MONO, fontSize: 9, padding: "3px 0", background: watchlistSymbols.includes(q.symbol) ? `${C.red}18` : `${C.green}18`, color: watchlistSymbols.includes(q.symbol) ? C.red : C.green, border: `1px solid ${watchlistSymbols.includes(q.symbol) ? C.red : C.green}44`, borderRadius: 3, cursor: "pointer" }}
                        >{watchlistSymbols.includes(q.symbol) ? "−WL" : "+WL"}</button>
                        <button
                          onClick={() => { setTerminalSymbol(q.symbol); setActiveTab("terminal"); }}
                          style={{ flex: 1, fontFamily: MONO, fontSize: 9, padding: "3px 0", background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 3, cursor: "pointer" }}
                        >CHART</button>
                        <button
                          onClick={async () => {
                            const msg = `🏭 *${q.symbol}* ${q._sectorName || ""}\n${chg >= 0 ? "🟢" : "🔴"} ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%  $${q.price?.toFixed(2)}${isLeader ? "  ▲ LEADING" : isLagger ? "  ▼ LAGGING" : ""}`;
                            try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                          }}
                          style={{ fontFamily: MONO, fontSize: 9, padding: "3px 5px", background: C.surface, color: C.textDim, border: `1px solid ${C.textDim}44`, borderRadius: 3, cursor: "pointer" }}
                          title="Push to Telegram"
                        >PUSH</button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Deep Dive */}
        {activeTab === "macro" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                MACRO DASHBOARD V2 — {macroTone.toUpperCase()}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge color={macroTone.includes("Risk-On") ? C.green : macroTone.includes("Risk-Off") ? C.red : C.amber}>{macroTone}</Badge>
                <button
                  onClick={async () => {
                    const spy = macroData.find(m => m.symbol === "SPY");
                    const qqq = macroData.find(m => m.symbol === "QQQ");
                    const vix = macroData.find(m => m._label === "VIX" || m.symbol === "VIXY");
                    const usd = macroData.find(m => m.symbol === "UUP");
                    const lines = [
                      `📊 *Macro Snapshot*  — ${macroTone}`,
                      `SPY ${spy ? (spy.changesPercentage >= 0 ? "+" : "") + spy.changesPercentage.toFixed(2) + "%" : "—"}  QQQ ${qqq ? (qqq.changesPercentage >= 0 ? "+" : "") + qqq.changesPercentage.toFixed(2) + "%" : "—"}`,
                      `VIX ${vix ? (vix.changesPercentage >= 0 ? "+" : "") + vix.changesPercentage.toFixed(2) + "%" : "—"}  USD ${usd ? (usd.changesPercentage >= 0 ? "+" : "") + usd.changesPercentage.toFixed(2) + "%" : "—"}`,
                    ];
                    const nextEvt = macroEventCalendar[0];
                    if (nextEvt) lines.push(`Next: ${nextEvt.title} — ${formatCountdown(nextEvt.tteMs)}`);
                    try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) }); } catch {}
                  }}
                  style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 4, padding: "5px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >PUSH BRIEF</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "9px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em" }}>ECONOMIC CALENDAR + COUNTDOWN</span>
                  <Badge color={macroEventAlerts.length ? C.red : C.green}>{macroEventAlerts.length ? "RISK WINDOW" : "CLEAR"}</Badge>
                </div>
                <div style={{ padding: 8, display: "grid", gap: 6 }}>
                  {macroEventCalendar.map((e) => (
                    <div key={e.id} style={{ border: `1px solid ${e.phase === "live" ? `${C.red}66` : e.phase === "imminent" ? `${C.amber}66` : C.border}`, borderRadius: 6, padding: "7px 8px", background: e.phase === "live" ? C.redBg : e.phase === "imminent" ? C.amberBg : C.surface }}>
                      <div style={{ display: "grid", gridTemplateColumns: "66px 1fr 110px 84px", gap: 8, alignItems: "center" }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700 }}>{e.tag}</span>
                        <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{e.title}</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                          {e.time.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: e.phase === "live" ? C.red : e.phase === "imminent" ? C.amber : C.textSec, fontWeight: 700 }}>
                          {e.phase === "live" ? "LIVE" : formatCountdown(e.tteMs)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>AUTO RISK ACTIONS</div>
                <div style={{ fontSize: 11, color: C.textSec, marginBottom: 6 }}>
                  Next event: <span style={{ fontFamily: MONO, color: C.text, fontWeight: 700 }}>{macroEventCalendar[0]?.title || "N/A"}</span>
                </div>
                <div style={{ fontSize: 11, color: C.textSec, marginBottom: 8 }}>
                  Countdown: <span style={{ fontFamily: MONO, color: C.accent, fontWeight: 700 }}>{macroEventCalendar[0] ? formatCountdown(macroEventCalendar[0].tteMs) : "—"}</span>
                </div>
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 11, color: C.textSec }}>1. T-90m: no new oversized entries.</div>
                  <div style={{ fontSize: 11, color: C.textSec }}>2. T-30m: reduce beta and tighten stops.</div>
                  <div style={{ fontSize: 11, color: C.textSec }}>3. T+15m: wait for post-release structure before adds.</div>
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                    Fed/CPI/Jobs/PCE/Minutes are estimated recurring schedule until provider calendar API is connected.
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
              {[
                { k: "SPY", t: "US EQUITY RISK" },
                { k: "QQQ", t: "GROWTH BETA" },
                { k: "IWM", t: "SMALL-CAP BREADTH" },
                { k: "UUP", t: "USD PRESSURE" },
                { k: "USO", t: "OIL / INFLATION" },
                { k: "GLD", t: "DEFENSIVE METAL" },
                { k: "TLT", t: "LONG DURATION" },
                { k: "BTCUSD", t: "RISK SENTIMENT" },
                { k: "ETHUSD", t: "ALT LEADER" },
                { k: "SOLUSD", t: "HIGH-BETA ALT" },
              ].map(({ k, t }) => {
                const q = macroData.find((m) => m.symbol === k);
                if (!q) return null;
                const d1 = q.delta1d ?? q.changesPercentage ?? 0;
                const d7 = q.delta1w ?? 0;
                return (
                  <div key={k} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{q._label || q.symbol}</span>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{t}</span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800 }}>${q.price?.toFixed(2)}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, marginBottom: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: d1 >= 0 ? C.green : C.red }}>1D {d1 >= 0 ? "+" : ""}{d1.toFixed(2)}%</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: d7 >= 0 ? C.green : C.red }}>1W {d7 >= 0 ? "+" : ""}{d7.toFixed(2)}%</span>
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button
                        onClick={() => setWatchlistSymbols(prev => watchlistSymbols.includes(k) ? prev.filter(s => s !== k) : Array.from(new Set([...prev, k])))}
                        style={{ flex: 1, fontFamily: MONO, fontSize: 9, padding: "3px 0", background: watchlistSymbols.includes(k) ? `${C.red}18` : `${C.green}18`, color: watchlistSymbols.includes(k) ? C.red : C.green, border: `1px solid ${watchlistSymbols.includes(k) ? C.red : C.green}44`, borderRadius: 3, cursor: "pointer" }}
                      >{watchlistSymbols.includes(k) ? "−WL" : "+WL"}</button>
                      <button
                        onClick={() => { setTerminalSymbol(k); setActiveTab("terminal"); }}
                        style={{ flex: 1, fontFamily: MONO, fontSize: 9, padding: "3px 0", background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 3, cursor: "pointer" }}
                      >CHART</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>BTC DOMINANCE (PROXY)</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>BTC / (BTC+ETH+SOL)</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: C.accent }}>
                  {Number(cryptoSnapshot.btcDomProxy || 0).toFixed(1)}%
                </div>
                <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 11, color: C.textSec }}>
                  Alt momentum spread:
                  <span style={{ color: Number(cryptoSnapshot.altStrength || 0) >= 0 ? C.green : C.red, fontWeight: 700, marginLeft: 6 }}>
                    {Number(cryptoSnapshot.altStrength || 0) >= 0 ? "+" : ""}{Number(cryptoSnapshot.altStrength || 0).toFixed(2)}%
                  </span>
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, marginBottom: 6 }}>CRYPTO COMPLEX</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { k: "BTCUSD", t: "BTC" },
                    { k: "ETHUSD", t: "ETH" },
                    { k: "SOLUSD", t: "SOL" },
                  ].map(({ k, t }) => {
                    const q = macroData.find((m) => m.symbol === k);
                    const chg = Number(q?.changesPercentage || 0);
                    return (
                      <div key={`cx-${k}`} style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: 8, background: C.surface }}>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{t}</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text }}>
                          ${Number(q?.price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: chg >= 0 ? C.green : C.red }}>
                          {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.textSec, marginBottom: 10 }}>
              Regime filter: use macro tone first, then sector/stock relative strength, then entry trigger.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {macroData.map((q) => {
                const chg = q.changesPercentage || 0;
                const up = chg >= 0;
                return (
                  <div key={q.symbol} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>{q._label || q.symbol}</span>
                      <Badge color={up ? C.green : C.red}>{up ? "UP" : "DOWN"}</Badge>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, color: C.text }}>${q.price?.toFixed(2)}</div>
                    <div style={{ marginTop: 6, marginBottom: 10, fontFamily: MONO, fontSize: 15, color: up ? C.green : C.red, fontWeight: 700 }}>
                      {up ? "+" : ""}{chg.toFixed(2)}%
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button
                        onClick={() => setWatchlistSymbols(prev => watchlistSymbols.includes(q.symbol) ? prev.filter(s => s !== q.symbol) : Array.from(new Set([...prev, q.symbol])))}
                        style={{ flex: 1, fontFamily: MONO, fontSize: 9, padding: "3px 0", background: watchlistSymbols.includes(q.symbol) ? `${C.red}18` : `${C.green}18`, color: watchlistSymbols.includes(q.symbol) ? C.red : C.green, border: `1px solid ${watchlistSymbols.includes(q.symbol) ? C.red : C.green}44`, borderRadius: 3, cursor: "pointer" }}
                      >{watchlistSymbols.includes(q.symbol) ? "−WL" : "+WL"}</button>
                      <button
                        onClick={() => { setTerminalSymbol(q.symbol); setActiveTab("terminal"); }}
                        style={{ flex: 1, fontFamily: MONO, fontSize: 9, padding: "3px 0", background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 3, cursor: "pointer" }}
                      >CHART</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "alerts" && (
          <div>
            {(() => {
              const today = new Date().toISOString().slice(0, 10);
              const todayFired = tvWebhookRows.filter(r => r?.at && r.at.slice(0, 10) === today).length;
              return (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                    ALERT CENTER — {combinedAlerts.length} LIVE SIGNALS
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {todayFired > 0 && (
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, background: `${C.accent}12`, border: `1px solid ${C.accent}33`, borderRadius: 4, padding: "3px 8px" }}>
                        {todayFired} TV WEBHOOK{todayFired !== 1 ? "S" : ""} TODAY
                      </div>
                    )}
                    <Badge color={telegramOk ? C.green : C.textDim}>{telegramOk ? "TELEGRAM ON" : "TELEGRAM OFF"}</Badge>
                  </div>
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={customAlertSymbol}
                onChange={(e) => setCustomAlertSymbol(e.target.value.toUpperCase())}
                placeholder="Custom symbol (e.g. NVDA)"
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "8px 10px", minWidth: 220 }}
              />
              <input
                value={customAlertMin}
                onChange={(e) => setCustomAlertMin(e.target.value)}
                placeholder="Min score"
                style={{ width: 110, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "8px 10px" }}
              />
              <button onClick={() => {
                const symbol = customAlertSymbol.trim().toUpperCase();
                const minScore = Math.max(1, Math.min(99, Number(customAlertMin || 70)));
                if (!symbol) return;
                setCustomAlerts((prev) => {
                  const next = prev.filter((x) => x.symbol !== symbol);
                  next.push({ symbol, minScore });
                  return next;
                });
                setCustomAlertSymbol("");
              }} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 11, padding: "8px 10px", cursor: "pointer" }}>
                ADD CUSTOM ALERT
              </button>
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
              {combinedAlerts.map((a, idx) => {
                const alertColor = a.type === "risk" ? C.red : a.type === "flow" ? C.amber : C.green;
                const alertSide = a.type === "risk" ? "SELL" : "BUY";
                return (
                  <div key={`${a.symbol}-${idx}`} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button onClick={() => { setTerminalSymbol(a.symbol); setActiveTab("terminal"); }}
                          style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontWeight: 800, fontSize: 14, cursor: "pointer", padding: 0 }}>{a.symbol}</button>
                        <Badge color={alertColor}>{a.type}</Badge>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Priority {a.score}</span>
                        <button
                          onClick={() => setQuickLogModal({ symbol: a.symbol, price: 0, entry: "", stopLoss: "", target: "", size: "", side: alertSide, timeframe: "1D", style: "Alert", notes: a.text || "", score: a.score || 70, chg: 0, rvol: 0 })}
                          style={{ border: `1px solid ${alertColor}55`, background: `${alertColor}12`, color: alertColor, borderRadius: 4, padding: "3px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer", fontWeight: 700 }}
                        >LOG</button>
                        <button
                          onClick={async () => {
                            const emoji = a.type === "risk" ? "🔴" : a.type === "flow" ? "🟡" : "🟢";
                            const msg = `${emoji} *${a.symbol}* — ${a.type.toUpperCase()} Alert\nPriority: ${a.score}/100\n_${a.text}_`;
                            try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                          }}
                          style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textDim, borderRadius: 4, padding: "3px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                          title="Send to Telegram"
                        >NOTIFY</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: C.textSec, marginBottom: 8 }}>{a.text}</div>
                    <ScoreBar value={a.score} color={alertColor} />
                  </div>
                );
              })}
              {combinedAlerts.length === 0 && <div style={{ color: C.textDim, fontSize: 13 }}>No active alerts yet.</div>}
            </div>

            {/* Price target alerts panel */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.accent, fontWeight: 700 }}>PRICE TARGET ALERTS</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Server-side · Telegram notification when triggered</span>
                  {priceAlerts.some(a => a.status !== "active") && (
                    <button onClick={async () => {
                      await fetch("/api/price-alerts/clear-history", { method: "DELETE" });
                      loadPriceAlertList();
                    }} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "4px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}>
                      CLEAR HISTORY
                    </button>
                  )}
                </div>
              </div>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input value={paSymbol} onChange={e => setPaSymbol(e.target.value.toUpperCase())} placeholder="Symbol (e.g. NVDA)"
                  style={{ width: 130, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "7px 10px" }} />
                <select value={paDirection} onChange={e => setPaDirection(e.target.value)}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "7px 10px" }}>
                  <option value="above">Above</option>
                  <option value="below">Below</option>
                </select>
                <input value={paTarget} onChange={e => setPaTarget(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Price (e.g. 890)"
                  style={{ width: 100, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "7px 10px" }} />
                <input value={paNote} onChange={e => setPaNote(e.target.value)} placeholder="Note (optional)"
                  style={{ flex: 1, minWidth: 120, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "7px 10px" }} />
                <button onClick={async () => {
                  if (!paSymbol || !paTarget) return;
                  await fetch("/api/price-alerts", { method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ symbol: paSymbol, targetPrice: Number(paTarget), direction: paDirection, note: paNote }) });
                  setPaSymbol(""); setPaTarget(""); setPaNote("");
                  loadPriceAlertList();
                }} style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}12`, color: C.accent, borderRadius: 4, padding: "7px 12px", fontFamily: MONO, fontSize: 10, cursor: "pointer", fontWeight: 700 }}>
                  + SET ALERT
                </button>
              </div>
              {priceAlerts.length === 0 ? (
                <div style={{ padding: "14px 14px", color: C.textDim, fontSize: 12, fontFamily: MONO }}>No price alerts set. Add one above.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      {["SYMBOL", "DIRECTION", "TARGET", "LIVE", "DISTANCE", "NOTE", "STATUS", "CREATED", "ACTION"].map(h => (
                        <th key={h} style={{ padding: "7px 10px", textAlign: h === "NOTE" ? "left" : "center", fontFamily: MONO, fontSize: 10, color: C.textDim }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {priceAlerts.map(a => (
                      <tr key={a.id} style={{ borderTop: `1px solid ${C.border}`, opacity: a.status !== "active" ? 0.55 : 1 }}>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>
                          <button onClick={() => { setTerminalSymbol(a.symbol); setActiveTab("terminal"); }}
                            style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", padding: 0 }}>{a.symbol}</button>
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 11, color: a.direction === "above" ? C.green : C.red }}>{a.direction.toUpperCase()}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>${a.targetPrice.toLocaleString()}</td>
                        {(() => {
                          const liveQ = watchlistData.find(q => q.symbol === a.symbol);
                          const livePrice = liveQ?.price || null;
                          if (!livePrice || a.status !== "active") return (
                            <>
                              <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 11, color: C.textDim }}>—</td>
                              <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 11, color: C.textDim }}>—</td>
                            </>
                          );
                          const dist = ((a.targetPrice - livePrice) / livePrice) * 100;
                          const away = Math.abs(dist).toFixed(1);
                          const isBull = a.direction === "above";
                          const isClose = Math.abs(dist) < 1.5;
                          const distColor = isClose ? C.amber : (isBull ? (dist > 0 ? C.green : C.red) : (dist < 0 ? C.green : C.red));
                          const label = isBull ? (dist > 0 ? `${away}% away ▲` : `BREACHED ✓`) : (dist < 0 ? `${away}% away ▼` : `BREACHED ✓`);
                          return (
                            <>
                              <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 11, color: C.text }}>${livePrice.toFixed(2)}</td>
                              <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 10, fontWeight: 700, color: distColor }}>{label}</td>
                            </>
                          );
                        })()}
                        <td style={{ padding: "7px 10px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textSec, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.note || "—"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>
                          <span style={{ background: a.status === "active" ? `${C.green}22` : a.status === "triggered" ? `${C.accent}22` : `${C.amber}22`, color: a.status === "active" ? C.green : a.status === "triggered" ? C.accent : C.amber, borderRadius: 4, padding: "3px 7px", fontFamily: MONO, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{a.status}</span>
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 10, color: C.textSec }}>{new Date(a.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>
                          {a.status === "active" && (
                            <button onClick={async () => {
                              await fetch(`/api/price-alerts/${a.id}/cancel`, { method: "PATCH" });
                              loadPriceAlertList();
                            }} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "4px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}>CANCEL</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {tvWebhookRows.length > 0 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.accent, fontWeight: 700 }}>TRADINGVIEW WEBHOOK HISTORY ({tvWebhookRows.length})</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      value={tvWebhookFilter}
                      onChange={(e) => setTvWebhookFilter(e.target.value.toUpperCase())}
                      placeholder="Filter symbol…"
                      style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 10, padding: "4px 8px", width: 120, borderRadius: 4 }}
                    />
                    <button
                      onClick={() => setAlertSoundEnabled(v => !v)}
                      style={{ border: `1px solid ${alertSoundEnabled ? C.green : C.border}`, background: alertSoundEnabled ? `${C.green}12` : C.surface, color: alertSoundEnabled ? C.green : C.textDim, borderRadius: 4, padding: "4px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                      title={alertSoundEnabled ? "Mute alert sound" : "Enable alert sound"}
                    >{alertSoundEnabled ? "SOUND ON" : "MUTED"}</button>
                    <button
                      onClick={async () => {
                        setTvWebhookRows([]);
                        try { await fetch("/api/market/tv-alerts", { method: "DELETE" }); } catch {}
                      }}
                      style={{ border: `1px solid ${C.red}55`, background: `${C.red}12`, color: C.red, borderRadius: 4, padding: "4px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                    >CLEAR</button>
                    <Badge color={tvWebhookSecured ? C.green : C.amber}>{tvWebhookSecured ? "SECURED" : "OPEN"}</Badge>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: C.surface }}>
                        <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>TIME</th>
                        <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>SYMBOL</th>
                        <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>SIDE</th>
                        <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>TF</th>
                        <th style={{ padding: "7px 10px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>PRICE</th>
                        <th style={{ padding: "7px 10px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>SCORE</th>
                        <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>MESSAGE</th>
                        <th style={{ padding: "7px 10px", textAlign: "center", fontFamily: MONO, fontSize: 10, color: C.textDim }}>LOG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tvWebhookRows
                        .filter((row) => !tvWebhookFilter || String(row?.symbol || "").toUpperCase().includes(tvWebhookFilter))
                        .slice(0, 20)
                        .map((row, i) => {
                          const rowKey = `${row?.symbol}-${row?.at || i}`;
                          const side = String(row?.side || "INFO").toUpperCase();
                          const sideColor = side === "BUY" ? C.green : side === "SELL" ? C.red : C.textDim;
                          const px = Number(row?.price || 0);
                          const logged = tvWebhookLoggedRows[rowKey];
                          return (
                            <tr key={`tvh-${i}`} style={{ borderTop: `1px solid ${C.border}` }}>
                              <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 10, color: C.textDim, whiteSpace: "nowrap" }}>
                                {row?.at ? new Date(row.at).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                              </td>
                              <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 800 }}>
                                <button onClick={() => { if (row?.symbol) { setTerminalSymbol(row.symbol); setActiveTab("terminal"); } }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", padding: 0 }}>{row?.symbol || "?"}</button>
                              </td>
                              <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 11, color: sideColor, fontWeight: 700 }}>{side}</td>
                              <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 10, color: C.textDim }}>{row?.timeframe || "—"}</td>
                              <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 11, textAlign: "right", color: C.text }}>{px > 0 ? `$${px.toFixed(2)}` : "—"}</td>
                              <td style={{ padding: "7px 10px", fontFamily: MONO, fontSize: 11, textAlign: "right", color: C.accent }}>{row?.score || "—"}</td>
                              <td style={{ padding: "7px 10px", fontSize: 11, color: C.textSec, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row?.message || "—"}</td>
                              <td style={{ padding: "7px 10px", textAlign: "center" }}>
                                <button
                                  onClick={async () => {
                                    try {
                                      await fetch("/api/journal", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          ticker: row?.symbol || "TV",
                                          side: side === "BUY" ? "BUY" : side === "SELL" ? "SELL" : "WAIT",
                                          score: row?.score || 72,
                                          entry: px || 0,
                                          notes: row?.message || "",
                                          timeframe: row?.timeframe || "1D",
                                          style: "Swing",
                                        }),
                                      });
                                      setTvWebhookLoggedRows((prev) => ({ ...prev, [rowKey]: true }));
                                    } catch {}
                                  }}
                                  style={{ border: `1px solid ${logged ? C.green + "55" : C.border}`, background: logged ? `${C.green}12` : C.surface, color: logged ? C.green : C.accent, borderRadius: 4, padding: "3px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                                >{logged ? "OK ✓" : "LOG"}</button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "agent" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                AI AGENT - INSTITUTIONAL COPILOT
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge color={regime === "Risk-On" ? C.green : regime === "Risk-Off" ? C.red : C.amber}>{regime.toUpperCase()}</Badge>
                <button
                  onClick={() => setAgentPrompt("Give me market regime, top 5 longs, top 3 risks, and a clear execution plan.")}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  RESET PROMPT
                </button>
                <button
                  onClick={runAIAgent}
                  style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}12`, color: C.accent, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                >
                  {agentLoading ? "RUNNING..." : "RUN AGENT"}
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 8 }}>PROMPT</div>
                <textarea
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  placeholder="Ask: Is market bullish or bearish? What names should I focus on? Show risk plan for today."
                  style={{ width: "100%", minHeight: 106, resize: "vertical", background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "10px 12px", fontFamily: SANS, fontSize: 14, lineHeight: 1.45 }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {[
                    "Bullish or bearish today?",
                    "Top 5 long setups right now",
                    "Top risks and hedges now",
                    "Build me execution plan for today",
                    "Sector rotation — where is money flowing?",
                    "What's my biggest risk today?",
                    "Options flow summary — calls or puts leading?",
                    ...(terminalSymbol ? [`Analyze ${terminalSymbol} — entry, stop, target, score`] : []),
                  ].map((q) => (
                    <button
                      key={`aq-${q}`}
                      onClick={() => setAgentPrompt(q)}
                      style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 999, padding: "4px 9px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 8 }}>LIVE CONTEXT</div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}><b>Session:</b> {marketSession}</div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}><b>Regime:</b> {regime}</div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}><b>Flow Bias:</b> {flowBias}</div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}><b>Alerts:</b> {combinedAlerts.length}</div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}><b>Watchlist:</b> {watchlistData.length} symbols</div>
                <div style={{ fontSize: 12, color: C.textSec }}><b>Last run:</b> {agentRunAt || "Not yet"}</div>
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>AGENT OUTPUT</div>
                {agentOutput && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={async () => {
                        try {
                          const truncated = agentOutput.length > 4000 ? agentOutput.slice(0, 4000) + "\n…(truncated)" : agentOutput;
                          await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `🤖 *AI Agent — ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}*\n\n${truncated}` }) });
                        } catch {}
                      }}
                      style={{ border: `1px solid ${telegramOk ? C.green + "44" : C.border}`, background: telegramOk ? `${C.green}0f` : C.surface, color: telegramOk ? C.green : C.textDim, borderRadius: 4, padding: "4px 8px", fontFamily: MONO, fontSize: 9, cursor: telegramOk ? "pointer" : "not-allowed" }}
                      title={telegramOk ? "Send to Telegram" : "Telegram not configured"}
                    >SEND TO BOT</button>
                    <button
                      onClick={() => navigator.clipboard.writeText(agentOutput).catch(() => {})}
                      style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "4px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                    >COPY</button>
                  </div>
                )}
              </div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: SANS, fontSize: 14, lineHeight: 1.55, color: C.text }}>
                {agentOutput || "No output yet. Click RUN AGENT."}
              </pre>
            </div>
          </div>
        )}

        {activeTab === "workflow" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                TRADER WORKFLOW - DAILY EXECUTION ENGINE
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={scannerFilters.scope}
                  onChange={(e) => setScannerFilters((s) => ({ ...s, scope: e.target.value }))}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "6px 8px", fontFamily: MONO, fontSize: 10 }}
                >
                  <option value="watchlist">WATCHLIST MODE</option>
                  <option value="market">MARKET-WIDE MODE</option>
                </select>
                {scannerFilters.scope === "market" && (
                  <button
                    onClick={loadMarketUniverse}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                  >
                    {marketUniverseLoading ? "LOADING..." : `UNIVERSE ${marketUniverseData.length}`}
                  </button>
                )}
                <button
                  onClick={runWorkflowAuto}
                  style={{ border: `1px solid ${C.border}`, background: C.accent, color: "#fff", borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  DO IT FOR ME
                </button>
                <button
                  onClick={() => { setWorkflowState(DEFAULT_WORKFLOW); setWorkflowAutoPlan(null); }}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  RESET DAY
                </button>
              </div>
            </div>
            {/* Daily Game Plan */}
            <div style={{ background: C.card, border: `1px solid ${dailyGamePlan ? C.accent + "55" : C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em" }}>TODAY'S GAME PLAN</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{new Date().toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
                  {dailyGamePlan && (
                    <button
                      onClick={() => navigator.clipboard.writeText(dailyGamePlan).catch(() => {})}
                      style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 3, padding: "1px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                    >COPY</button>
                  )}
                  {dailyGamePlan && (
                    <button
                      onClick={() => setDailyGamePlan("")}
                      style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.red, borderRadius: 3, padding: "1px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                    >CLEAR</button>
                  )}
                </div>
              </div>
              <textarea
                value={dailyGamePlan}
                onChange={e => setDailyGamePlan(e.target.value)}
                placeholder="Write your plan for today before the market opens:&#10;— What is the market regime? (bullish / bearish / choppy)&#10;— Key names and why&#10;— Max trades today: ___  Max loss: ___&#10;— Rules for today:"
                rows={dailyGamePlan ? Math.min(Math.max(dailyGamePlan.split("\n").length + 1, 3), 8) : 5}
                style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 10px", fontFamily: SANS, fontSize: 13, color: C.text, resize: "vertical", outline: "none", lineHeight: 1.5 }}
              />
            </div>

            {workflowAutoPlan && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Auto Plan</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>Created {workflowAutoPlan.createdAt}</div>
                  </div>
                  <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Scope</div><div style={{ fontFamily: MONO, fontSize: 12 }}>{String(workflowAutoPlan.scope || "watchlist").toUpperCase()}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Primary</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800 }}>{workflowAutoPlan.symbol}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Inst. Score</div><div style={{ fontFamily: MONO, fontSize: 12, color: C.accent }}>{Number(workflowAutoPlan.score || 0).toFixed(1)}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Entry</div><div style={{ fontFamily: MONO, fontSize: 12 }}>${Number(workflowAutoPlan.entry || 0).toFixed(2)}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Stop</div><div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>${Number(workflowAutoPlan.stop || 0).toFixed(2)}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Target</div><div style={{ fontFamily: MONO, fontSize: 12, color: C.green }}>${Number(workflowAutoPlan.target || 0).toFixed(2)}</div></div>
                </div>
                <div style={{ marginBottom: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>WHY THIS NAME</div>
                    <button
                      onClick={async () => {
                        if (!workflowAutoPlan?.symbol) return;
                        try {
                          await fetch("/api/journal", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              ticker: workflowAutoPlan.symbol,
                              side: "BUY",
                              score: Math.round(Number(workflowAutoPlan.score || 72)),
                              entry: Number(workflowAutoPlan.entry || 0),
                              stopLoss: Number(workflowAutoPlan.stop || 0),
                              target: Number(workflowAutoPlan.target || 0),
                              notes: workflowAutoPlan.why || "Workflow auto-plan",
                              timeframe: "1D",
                              style: "Workflow",
                            }),
                          });
                        } catch {}
                      }}
                      style={{ border: `1px solid ${C.green}55`, background: `${C.green}12`, color: C.green, borderRadius: 4, padding: "4px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                    >LOG PLAN</button>
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45 }}>{workflowAutoPlan.why || "No rationale available."}</div>
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 6 }}>ALTERNATIVE CANDIDATES</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 8 }}>
                    {(workflowAutoPlan.candidates || []).slice(0, 3).map((cand) => (
                      <div key={`cand-${cand.symbol}`} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{cand.symbol}</span>
                          <span style={{ fontFamily: MONO, fontSize: 11, color: C.accent }}>{Number(cand.score || 0).toFixed(1)}</span>
                        </div>
                        <div style={{ fontSize: 10, color: C.textDim, minHeight: 32 }}>{cand.why}</div>
                        <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
                          <button
                            onClick={() => { setTerminalSymbol(cand.symbol); setActiveTab("terminal"); }}
                            style={{ border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, borderRadius: 4, padding: "4px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                          >CHART</button>
                          {cand.symbol !== workflowAutoPlan.symbol && (
                            <button
                              onClick={() => applyWorkflowPrimary(cand)}
                              style={{ border: `1px solid ${C.border}`, background: C.card, color: C.text, borderRadius: 4, padding: "4px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                            >SET PRIMARY</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>SESSION</div>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{marketSession}</div>
                <div style={{ fontSize: 11, color: C.textSec, marginTop: 6 }}>
                  Gainers: {sessionMovers.gainers.slice(0, 3).map((m) => m.symbol).join(", ") || "N/A"}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>BUY / UPGRADE</div>
                {(newsIntel.upgrades.slice(0, 2)).map((n, i) => (
                  <div key={`up-${i}`} style={{ fontSize: 11, color: C.green, marginBottom: 4 }}>{n.ticker}: {n.title.slice(0, 56)}</div>
                ))}
                {!newsIntel.upgrades.length && <div style={{ fontSize: 11, color: C.textDim }}>No bullish upgrade headlines.</div>}
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>SELL / DOWNGRADE</div>
                {(newsIntel.downgrades.slice(0, 2)).map((n, i) => (
                  <div key={`dn-${i}`} style={{ fontSize: 11, color: C.red, marginBottom: 4 }}>{n.ticker}: {n.title.slice(0, 56)}</div>
                ))}
                {!newsIntel.downgrades.length && <div style={{ fontSize: 11, color: C.textDim }}>No bearish downgrade headlines.</div>}
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>MACRO FLAGS</div>
                {(macroSignalFlags.red.slice(0, 2)).map((x, i) => <div key={`mr-${i}`} style={{ fontSize: 11, color: C.red, marginBottom: 3 }}>RED: {x}</div>)}
                {(macroSignalFlags.green.slice(0, 2)).map((x, i) => <div key={`mg-${i}`} style={{ fontSize: 11, color: C.green, marginBottom: 3 }}>GREEN: {x}</div>)}
                {!macroSignalFlags.red.length && !macroSignalFlags.green.length && <div style={{ fontSize: 11, color: C.textDim }}>No major macro flags.</div>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(280px, 1fr))", gap: 12, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, letterSpacing: "0.08em" }}>
                    WATCHLIST MOVERS
                  </div>
                  <button
                    onClick={fetchMarketMovers}
                    disabled={marketMoversLoading}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                  >
                    {marketMoversLoading ? "…" : "REFRESH"}
                  </button>
                </div>
                {!marketMovers && !marketMoversLoading && <div style={{ fontSize: 10, color: C.textDim }}>Loading…</div>}
                {marketMoversLoading && <div style={{ fontSize: 10, color: C.textDim }}>Fetching movers…</div>}
                {marketMovers && (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.green, fontWeight: 700, marginBottom: 4 }}>TOP GAINERS</div>
                    {(marketMovers.gainers || []).map((q) => (
                      <div key={`mv-g-${q.symbol}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}`, padding: "3px 0" }}>
                        <button onClick={() => { setTerminalSymbol(q.symbol); setActiveTab("terminal"); }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer", padding: 0 }}>{q.symbol}</button>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.green, fontWeight: 700 }}>+{Number(q.changesPercentage || 0).toFixed(2)}%</span>
                      </div>
                    ))}
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.red, fontWeight: 700, marginTop: 8, marginBottom: 4 }}>TOP LOSERS</div>
                    {(marketMovers.losers || []).map((q) => (
                      <div key={`mv-l-${q.symbol}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}`, padding: "3px 0" }}>
                        <button onClick={() => { setTerminalSymbol(q.symbol); setActiveTab("terminal"); }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer", padding: 0 }}>{q.symbol}</button>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.red, fontWeight: 700 }}>{Number(q.changesPercentage || 0).toFixed(2)}%</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>
                  PRE / POST MARKET MOVERS
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700 }}>PREMARKET</div>
                  {(prePostMovers.pre || []).map((q) => (
                    <div key={`wf-pre-${q.symbol}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}`, padding: "3px 0" }}>
                      <button onClick={() => { setTerminalSymbol(q.symbol); setActiveTab("terminal"); }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer", padding: 0 }}>{q.symbol}</button>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: q.pre >= 0 ? C.green : C.red, fontWeight: 700 }}>
                        {q.pre >= 0 ? "+" : ""}{q.pre.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                  {!prePostMovers.pre?.length && <div style={{ fontSize: 10, color: C.textDim }}>No premarket movers yet.</div>}
                </div>
                <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.purple, fontWeight: 700 }}>AFTERHOURS</div>
                  {(prePostMovers.post || []).map((q) => (
                    <div key={`wf-post-${q.symbol}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}`, padding: "3px 0" }}>
                      <button onClick={() => { setTerminalSymbol(q.symbol); setActiveTab("terminal"); }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer", padding: 0 }}>{q.symbol}</button>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: q.post >= 0 ? C.green : C.red, fontWeight: 700 }}>
                        {q.post >= 0 ? "+" : ""}{q.post.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                  {!prePostMovers.post?.length && <div style={{ fontSize: 10, color: C.textDim }}>No afterhours movers yet.</div>}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>
                  EARNINGS SURPRISE TRACKER
                </div>
                {(earningsSurpriseTracker || []).map((r) => {
                  const tone = r.status === "BEAT" ? C.green : r.status === "MISS" ? C.red : C.amber;
                  const bg = r.status === "BEAT" ? C.greenBg : r.status === "MISS" ? C.redBg : C.amberBg;
                  return (
                    <div key={`wf-est-${r.symbol}`} style={{ borderBottom: `1px solid ${C.border}`, padding: "6px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <button onClick={() => { setTerminalSymbol(r.symbol); setActiveTab("terminal"); }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer", padding: 0 }}>{r.symbol}</button>
                        <span style={{ fontFamily: MONO, fontSize: 9, color: tone, background: bg, border: `1px solid ${tone}44`, padding: "1px 6px", borderRadius: 999, fontWeight: 800 }}>{r.status}</span>
                      </div>
                      <div style={{ fontSize: 10, color: C.textDim }}>
                        Beat {r.beats} · Miss {r.misses}
                      </div>
                    </div>
                  );
                })}
                {!earningsSurpriseTracker.length && (
                  <div style={{ fontSize: 10, color: C.textDim }}>
                    No earnings surprise headlines detected yet.
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(260px, 1fr))", gap: 12 }}>
              {[
                { key: "premarket", title: "PREMARKET PLAN", color: C.accent, subtitle: "Build bias before open" },
                { key: "live", title: "LIVE EXECUTION", color: C.green, subtitle: "Only validated setups" },
                { key: "postmarket", title: "POSTMARKET REVIEW", color: C.purple, subtitle: "Close loop and improve" },
              ].map((section) => (
                <div key={section.key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: section.color }}>{section.title}</div>
                      <div style={{ fontSize: 10, color: C.textDim }}>{section.subtitle}</div>
                    </div>
                    <Badge color={workflowProgress[section.key].pct >= 100 ? C.green : C.amber}>
                      {workflowProgress[section.key].done}/{workflowProgress[section.key].total}
                    </Badge>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ height: 6, borderRadius: 4, background: C.border, overflow: "hidden" }}>
                      <div style={{ width: `${workflowProgress[section.key].pct}%`, height: "100%", background: section.color }} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                    {(workflowState[section.key]?.checklist || []).map((item) => (
                      <label key={item.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, color: C.textSec }}>
                        <input
                          type="checkbox"
                          checked={Boolean(item.done)}
                          onChange={(e) => updateWorkflowCheck(section.key, item.id, e.target.checked)}
                          style={{ marginTop: 2 }}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={workflowState[section.key]?.notes || ""}
                    onChange={(e) => updateWorkflowNotes(section.key, e.target.value)}
                    placeholder={`${section.title} notes...`}
                    style={{ width: "100%", minHeight: 90, resize: "vertical", background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: 8, fontFamily: SANS, fontSize: 12 }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "portfolio" && (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              PORTFOLIO MANAGER - LIVE P/L TRACKER
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Market Value</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>{formatNum(portfolioSummary.totalValue)}</div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Cost Basis</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>{formatNum(portfolioSummary.totalCost)}</div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Unrealized P/L</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: portfolioSummary.totalPnl >= 0 ? C.green : C.red }}>
                  {portfolioSummary.totalPnl >= 0 ? "+" : ""}{formatNum(portfolioSummary.totalPnl)}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Return %</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: portfolioSummary.totalPnlPct >= 0 ? C.green : C.red }}>
                  {portfolioSummary.totalPnlPct >= 0 ? "+" : ""}{portfolioSummary.totalPnlPct.toFixed(2)}%
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Winners / Losers</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>{portfolioSummary.winners} / {portfolioSummary.losers}</div>
              </div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>POSITIONS</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <a
                    href="/api/portfolio/export.csv"
                    download
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "6px 8px", fontFamily: MONO, fontSize: 10, cursor: "pointer", textDecoration: "none" }}
                  >
                    EXPORT CSV
                  </a>
                  <button
                    onClick={() => setPortfolioHoldings((prev) => [...prev, { symbol: "", shares: "0", avgCost: "0" }])}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "6px 8px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                  >
                    ADD POSITION
                  </button>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Ticker</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Shares</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Avg Cost</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Last</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Mkt Value</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>P/L</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>P/L %</th>
                      <th style={{ padding: "8px", textAlign: "center", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioRows.map((row) => (
                      <tr key={`p-${row.idx}`}>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}` }}>
                          <input
                            value={portfolioHoldings[row.idx]?.symbol || ""}
                            onChange={(e) => setPortfolioHoldings((prev) => prev.map((h, i) => i === row.idx ? { ...h, symbol: e.target.value.toUpperCase() } : h))}
                            style={{ width: 90, background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "6px 8px", fontFamily: MONO, fontSize: 11 }}
                          />
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right" }}>
                          <input
                            value={portfolioHoldings[row.idx]?.shares || ""}
                            onChange={(e) => setPortfolioHoldings((prev) => prev.map((h, i) => i === row.idx ? { ...h, shares: e.target.value.replace(/[^\d.]/g, "") } : h))}
                            style={{ width: 90, textAlign: "right", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "6px 8px", fontFamily: MONO, fontSize: 11 }}
                          />
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right" }}>
                          <input
                            value={portfolioHoldings[row.idx]?.avgCost || ""}
                            onChange={(e) => setPortfolioHoldings((prev) => prev.map((h, i) => i === row.idx ? { ...h, avgCost: e.target.value.replace(/[^\d.]/g, "") } : h))}
                            style={{ width: 100, textAlign: "right", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "6px 8px", fontFamily: MONO, fontSize: 11 }}
                          />
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.text }}>${(row.live?.price || 0).toFixed(2)}</td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.text }}>{formatNum(row.marketValue)}</td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: row.pnl >= 0 ? C.green : C.red }}>
                          {row.pnl >= 0 ? "+" : ""}{formatNum(row.pnl)}
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: row.pnlPct >= 0 ? C.green : C.red }}>
                          {row.pnlPct >= 0 ? "+" : ""}{row.pnlPct.toFixed(2)}%
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                            {row.symbol && (
                              <button
                                onClick={() => { setTerminalSymbol(row.symbol); setActiveTab("terminal"); }}
                                style={{ border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, borderRadius: 4, padding: "5px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                              >CHART</button>
                            )}
                            {row.symbol && (
                              <button
                                onClick={() => setWatchlistSymbols(prev => watchlistSymbols.includes(row.symbol) ? prev.filter(s => s !== row.symbol) : Array.from(new Set([...prev, row.symbol])))}
                                style={{ border: `1px solid ${watchlistSymbols.includes(row.symbol) ? C.red : C.green}44`, background: watchlistSymbols.includes(row.symbol) ? `${C.red}18` : `${C.green}18`, color: watchlistSymbols.includes(row.symbol) ? C.red : C.green, borderRadius: 4, padding: "5px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                              >{watchlistSymbols.includes(row.symbol) ? "−WL" : "+WL"}</button>
                            )}
                            <button
                              onClick={() => setPortfolioHoldings((prev) => prev.filter((_, i) => i !== row.idx))}
                              style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.red, borderRadius: 4, padding: "5px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                            >RM</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!portfolioRows.length && (
                      <tr>
                        <td colSpan={8} style={{ padding: 14, textAlign: "center", color: C.textDim, fontSize: 12 }}>
                          Add positions to start tracking live P/L.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {portfolioRows.length >= 2 && (() => {
              const CHART_COLORS = ["#4f8cff","#22c55e","#f59e0b","#a78bfa","#f43f5e","#06b6d4","#fb923c","#84cc16","#e879f9","#38bdf8","#fbbf24","#34d399","#f87171","#c084fc","#60a5fa"];
              const total = portfolioRows.reduce((s, r) => s + Math.max(r.marketValue, 0), 0);
              if (!total) return null;
              const cx = 100, cy = 100, outerR = 72, innerR = 44;
              let angle = -Math.PI / 2;
              const slices = portfolioRows.map((row, i) => {
                const pct = Math.max(row.marketValue, 0) / total;
                const startAngle = angle;
                angle += pct * 2 * Math.PI;
                return { row, pct, startAngle, endAngle: angle, color: CHART_COLORS[i % CHART_COLORS.length] };
              });
              function arcPath(start, end) {
                const x1 = cx + outerR * Math.cos(start), y1 = cy + outerR * Math.sin(start);
                const x2 = cx + outerR * Math.cos(end), y2 = cy + outerR * Math.sin(end);
                const large = end - start > Math.PI ? 1 : 0;
                return `M ${cx + innerR * Math.cos(start)} ${cy + innerR * Math.sin(start)} L ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} L ${cx + innerR * Math.cos(end)} ${cy + innerR * Math.sin(end)} A ${innerR} ${innerR} 0 ${large} 0 ${cx + innerR * Math.cos(start)} ${cy + innerR * Math.sin(start)} Z`;
              }
              return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginTop: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 12 }}>ALLOCATION</div>
                  <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                    <svg width={200} height={200} viewBox="0 0 200 200">
                      {slices.map((s, i) => (
                        <path key={i} d={arcPath(s.startAngle, s.endAngle)} fill={s.color} opacity={0.88} />
                      ))}
                      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill={C.textDim} fontFamily={MONO}>TOTAL</text>
                      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={13} fontWeight={800} fill={C.text} fontFamily={MONO}>{formatNum(total)}</text>
                    </svg>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "6px 16px", flex: 1, minWidth: 0 }}>
                      {slices.map((s, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                          <span style={{ fontFamily: MONO, fontSize: 11, color: C.text, fontWeight: 700 }}>{s.row.symbol}</span>
                          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{(s.pct * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === "scanner" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                SCANNER BUILDER — MOMENTUM + RELATIVE STRENGTH
              </div>
              <div style={{ display: "flex", align: "center", gap: 10 }}>
                {scannerRows.filter(r => r.scannerScore >= 70).length > 0 && (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.green, fontWeight: 700 }}>
                    ⭐ {scannerRows.filter(r => r.scannerScore >= 70).length} HIGH-SCORE SETUP{scannerRows.filter(r => r.scannerScore >= 70).length !== 1 ? "S" : ""}
                  </span>
                )}
                {lastUpdate && (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                    Last scan: {lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {dataFreshSec != null && dataFreshSec < 190 ? ` · refreshes in ${Math.max(0, 180 - dataFreshSec)}s` : ""}
                  </span>
                )}
              </div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, alignSelf: "center" }}>PRESETS:</span>
                {[
                  { label: "Momentum", f: { minPrice: "15", minChange: "2", minRvol: "1.5", minScore: "65", sector: "ALL" } },
                  { label: "Breakout", f: { minPrice: "20", minChange: "1", minRvol: "2", minScore: "70", sector: "ALL" } },
                  { label: "Pullback", f: { minPrice: "20", minChange: "-2", minRvol: "1.2", minScore: "60", sector: "ALL" } },
                  { label: "Short Setup", f: { minPrice: "15", minChange: "-1.5", minRvol: "1.5", minScore: "55", sector: "ALL" } },
                  { label: "RVOL Spike", f: { minPrice: "10", minChange: "0.5", minRvol: "3", minScore: "55", sector: "ALL" } },
                  { label: "Large Cap", f: { minPrice: "50", minChange: "0.3", minRvol: "1", minScore: "60", sector: "ALL" } },
                  { label: "Reset", f: { minPrice: "10", minChange: "0.5", minRvol: "1", minScore: "55", sector: "ALL" } },
                ].map(({ label, f }) => (
                  <button key={label} onClick={() => setScannerFilters(s => ({ ...s, ...f }))}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 999, padding: "3px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px, 1fr))", gap: 8, alignItems: "center" }}>
                <input value={scannerFilters.minPrice} onChange={(e) => setScannerFilters((s) => ({ ...s, minPrice: e.target.value.replace(/[^\d.]/g, "") }))} placeholder="Min Price" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                <input value={scannerFilters.minChange} onChange={(e) => setScannerFilters((s) => ({ ...s, minChange: e.target.value.replace(/[^\d.-]/g, "") }))} placeholder="Min |CHG%|" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                <input value={scannerFilters.minRvol} onChange={(e) => setScannerFilters((s) => ({ ...s, minRvol: e.target.value.replace(/[^\d.]/g, "") }))} placeholder="Min RVOL" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                <input value={scannerFilters.minScore} onChange={(e) => setScannerFilters((s) => ({ ...s, minScore: e.target.value.replace(/[^\d]/g, "") }))} placeholder="Min Score" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                <select value={scannerFilters.sector} onChange={(e) => setScannerFilters((s) => ({ ...s, sector: e.target.value }))} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}>
                  <option value="ALL">All Sectors</option>
                  {SECTOR_ETFS.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
                </select>
                <select value={scannerFilters.scope} onChange={(e) => setScannerFilters((s) => ({ ...s, scope: e.target.value }))} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}>
                  <option value="watchlist">Watchlist Scope</option>
                  <option value="market">Market-Wide Scope</option>
                </select>
                <button onClick={() => { setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); }} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "8px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>
                  REFRESH SCAN
                </button>
                <button onClick={runServerScreen} disabled={serverScreenLoading} style={{ border: `1px solid ${C.accent}`, background: serverScreenLoading ? C.surface : C.card, color: C.accent, borderRadius: 4, padding: "8px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>
                  {serverScreenLoading ? "SCREENING…" : "SERVER SCREEN"}
                </button>
              </div>
              {scannerFilters.scope === "market" && (
                <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                  Market universe: {marketUniverseData.length} symbols loaded {marketUniverseLoading ? "(loading...)" : ""}.
                  <button onClick={loadMarketUniverse} style={{ marginLeft: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, borderRadius: 4, padding: "4px 8px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>
                    RELOAD UNIVERSE
                  </button>
                </div>
              )}
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                MATCHES: {scannerRows.length}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Symbol</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Price</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>CHG%</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>RVOL</th>
                      <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Sector</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Score</th>
                      <th style={{ padding: "8px", textAlign: "center", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Flow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannerRows.map((q) => {
                      const flow = flowBySymbol.find((f) => f.symbol === q.symbol);
                      const chg = Number(q.changesPercentage || 0);
                      return (
                        <tr key={`scan-${q.symbol}`}>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontWeight: 700, color: C.text }}>
                            <div>{q.symbol}</div>
                            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                              <button
                                onClick={() => { setTerminalSymbol(q.symbol); setActiveTab("terminal"); }}
                                style={{ border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                              >CHART</button>
                              <button
                                onClick={() => openTradingView(q.symbol)}
                                style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                              >TV</button>
                              <a
                                href={`/workstation#${q.symbol}`}
                                target="_blank"
                                rel="noopener"
                                style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.purple, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer", textDecoration: "none" }}
                              >WS</a>
                              <button
                                onClick={() => setWatchlistSymbols((prev) => Array.from(new Set([...prev, q.symbol])))}
                                style={{ border: `1px solid ${C.green}55`, background: C.surface, color: C.green, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                                title="Add to watchlist"
                              >+WL</button>
                              <button
                                onClick={() => setQuickLogModal({ symbol: q.symbol, price: q.price || 0, entry: (q.price || 0).toFixed(2), stopLoss: "", target: "", size: "", side: "BUY", timeframe: "1D", style: "Breakout", notes: `Scanner hit · CHG ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}% · RVOL ${q.rvol.toFixed(2)}x · Score ${q.scannerScore}`, score: q.scannerScore || 0, chg, rvol: q.rvol || 0 })}
                                style={{ border: `1px solid ${C.accent}55`, background: C.surface, color: C.accent, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                                title="Quick log to journal"
                              >LOG</button>
                              <button
                                onClick={async () => {
                                  const msg = `🔍 *${q.symbol}* Scanner Hit\nPrice: $${q.price.toFixed(2)}  CHG: ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%\nRVOL: ${q.rvol.toFixed(2)}x  Score: ${q.scannerScore}${q.sectorEtf ? "\nSector: " + q.sectorEtf : ""}`;
                                  try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                                }}
                                style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                                title="Send to Telegram"
                              >PUSH</button>
                            </div>
                          </td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: C.text }}>${q.price.toFixed(2)}</td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: chg >= 0 ? C.green : C.red }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: q.rvol >= 1.2 ? C.green : C.text }}>{q.rvol.toFixed(2)}x</td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, fontFamily: MONO, color: C.textSec }}>{q.sectorEtf || "-"}</td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right" }}>
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: q.scannerScore >= 75 ? C.green : q.scannerScore >= 65 ? C.amber : C.red, background: q.scannerScore >= 75 ? `${C.green}18` : q.scannerScore >= 65 ? `${C.amber}18` : `${C.red}12`, padding: "2px 6px", borderRadius: 4 }}>
                              {q.scannerScore}
                            </span>
                          </td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                            {flow ? <Badge color={Number(flow.callPutRatio || 1) >= 1 ? C.green : C.red}>C/P {Number(flow.callPutRatio || 0).toFixed(2)}</Badge> : <span style={{ color: C.textDim, fontSize: 10 }}>-</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {!scannerRows.length && (
                      <tr>
                        <td colSpan={7} style={{ padding: 14, textAlign: "center", color: C.textDim, fontSize: 12 }}>
                          No symbols match current scanner filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {serverScreenResults !== null && (
              <div style={{ background: C.card, border: `1px solid ${C.accent}`, borderRadius: 8, overflow: "hidden", marginTop: 12 }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.accent }}>SERVER SCREEN RESULTS: {serverScreenResults.length}</span>
                  <button onClick={() => setServerScreenResults(null)} style={{ border: "none", background: "transparent", color: C.textDim, fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>CLEAR</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: C.surface }}>
                        <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Symbol</th>
                        <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Price</th>
                        <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>CHG%</th>
                        <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>RVOL</th>
                        <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Tech</th>
                        <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serverScreenResults.map((q) => {
                        const chg = Number(q.changesPercentage || 0);
                        return (
                          <tr key={`srv-${q.symbol}`}>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontWeight: 700, color: C.text }}>
                              <div>{q.symbol}</div>
                              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                                <button onClick={() => { setTerminalSymbol(q.symbol); setActiveTab("terminal"); }} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.accent, borderRadius: 4, padding: "2px 5px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}>CHART</button>
                                <button onClick={() => openTradingView(q.symbol)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "2px 5px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}>TV</button>
                                <a href={`/workstation#${q.symbol}`} target="_blank" rel="noopener" style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.purple, borderRadius: 4, padding: "2px 5px", fontFamily: MONO, fontSize: 9, cursor: "pointer", textDecoration: "none" }}>WS</a>
                                <button onClick={() => setWatchlistSymbols((prev) => Array.from(new Set([...prev, q.symbol])))} style={{ border: `1px solid ${C.green}55`, background: C.surface, color: C.green, borderRadius: 4, padding: "2px 5px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}>+WL</button>
                                <button onClick={() => setQuickLogModal({ symbol: q.symbol, price: Number(q.price) || 0, entry: (Number(q.price) || 0).toFixed(2), stopLoss: "", target: "", size: "", side: chg >= 0 ? "BUY" : "SELL", timeframe: "1D", style: "Breakout", notes: `Server scan · RVOL ${Number(q.rvol || 0).toFixed(2)}x · Score ${q.composite}`, score: Number(q.composite || 0), chg, rvol: Number(q.rvol || 0) })} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.green, borderRadius: 4, padding: "2px 5px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}>LOG</button>
                                <button onClick={async () => {
                                  const msg = `🔍 *${q.symbol}* Server Screen Hit\nPrice: $${Number(q.price || 0).toFixed(2)}  CHG: ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%\nRVOL: ${Number(q.rvol || 0).toFixed(2)}x  Score: ${q.composite}`;
                                  try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                                }} style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 4, padding: "2px 5px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }} title="Send to Telegram">PUSH</button>
                              </div>
                            </td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: C.text }}>${Number(q.price || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: chg >= 0 ? C.green : C.red }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: Number(q.rvol || 0) >= 1.2 ? C.green : C.text }}>{Number(q.rvol || 0).toFixed(2)}x</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: C.textSec }}>{q.tech}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: Number(q.composite || 0) >= 70 ? C.green : C.text }}>{q.composite}</td>
                          </tr>
                        );
                      })}
                      {!serverScreenResults.length && (
                        <tr>
                          <td colSpan={5} style={{ padding: 14, textAlign: "center", color: C.textDim, fontSize: 12 }}>No symbols matched the server-side screen filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "early" && (
          <EarlyEntryScanner
            watchlistData={watchlistData}
            macroData={macroData}
            sectorData={sectorData}
            onSelectSymbol={(sym) => { setTerminalSymbol(sym); setActiveTab("terminal"); }}
          />
        )}

        {activeTab === "backtest" && (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              BACKTEST LAB - BREAKOUT + RISK MODEL
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12, display: "grid", gridTemplateColumns: "180px 130px 130px auto", gap: 8, alignItems: "center" }}>
              <input value={backtestSymbol} onChange={(e) => setBacktestSymbol(e.target.value.toUpperCase())} placeholder="Ticker" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
              <select value={backtestTf} onChange={(e) => setBacktestTf(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}>
                <option value="1D">1D</option>
                <option value="1H">1H</option>
                <option value="15M">15M</option>
                <option value="5M">5M</option>
              </select>
              <input value={backtestLookback} onChange={(e) => setBacktestLookback(e.target.value.replace(/[^\d]/g, ""))} placeholder="Breakout bars" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
              <button onClick={runBacktest} style={{ justifySelf: "start", border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "8px 12px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>
                {backtestLoading ? "RUNNING..." : "RUN BACKTEST"}
              </button>
            </div>

            {backtestResult?.error && (
              <div style={{ background: C.redBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, color: C.red, marginBottom: 12, fontSize: 12 }}>
                {backtestResult.error}
              </div>
            )}

            {backtestResult && !backtestResult.error && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                  <button
                    onClick={async () => {
                      try {
                        await fetch("/api/journal", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            ticker: backtestSymbol,
                            side: "BUY",
                            score: Math.min(99, Math.round(50 + backtestResult.winRate / 2)),
                            entry: backtestResult.trades?.[0]?.entry || 0,
                            notes: `Backtest ${backtestTf} ${backtestResult.totalTrades} trades · ${backtestResult.winRate.toFixed(1)}% WR · ${backtestResult.netRet >= 0 ? "+" : ""}${backtestResult.netRet.toFixed(2)}% net · MaxDD ${backtestResult.maxDrawdown.toFixed(2)}%`,
                            timeframe: backtestTf,
                            style: "Backtest",
                          }),
                        });
                      } catch {}
                    }}
                    style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}12`, color: C.accent, borderRadius: 4, padding: "6px 12px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                  >LOG BACKTEST TO JOURNAL</button>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{backtestSymbol} · {backtestTf} · {backtestResult.totalTrades} trades</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Trades</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800 }}>{backtestResult.totalTrades}</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Win Rate</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: backtestResult.winRate >= 50 ? C.green : C.red }}>{backtestResult.winRate.toFixed(1)}%</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Avg Return</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: backtestResult.avgRet >= 0 ? C.green : C.red }}>{backtestResult.avgRet >= 0 ? "+" : ""}{backtestResult.avgRet.toFixed(2)}%</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Net Return</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: backtestResult.netRet >= 0 ? C.green : C.red }}>{backtestResult.netRet >= 0 ? "+" : ""}{backtestResult.netRet.toFixed(2)}%</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Max DD</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.red }}>{backtestResult.maxDrawdown.toFixed(2)}%</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Rule</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800 }}>Breakout {backtestResult.lookback}</div></div>
                </div>

                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 11, color: C.textDim }}>RECENT TRADES</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: C.surface }}>
                          <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Date</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Entry</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Stop</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Target</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Exit</th>
                          <th style={{ padding: "8px", textAlign: "center", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Outcome</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Return %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backtestResult.trades.map((t, i) => (
                          <tr key={`bt-${i}`}>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.textSec }}>{String(t.date || "").replace("T", " ").slice(0, 16)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 11 }}>${Number(t.entry || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 11 }}>${Number(t.stop || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 11 }}>${Number(t.target || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 11 }}>${Number(t.exit || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                              <Badge color={t.outcome === "target" ? C.green : t.outcome === "stop" ? C.red : C.amber}>{String(t.outcome || "").toUpperCase()}</Badge>
                            </td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 11, color: Number(t.retPct || 0) >= 0 ? C.green : C.red }}>
                              {Number(t.retPct || 0) >= 0 ? "+" : ""}{Number(t.retPct || 0).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "flow" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                OPTIONS FLOW — UNUSUAL ACTIVITY
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge color={String(optionsFlow?.source || "").includes("estimated") ? C.amber : C.green}>
                  {String(optionsFlow?.source || "").includes("estimated") ? "ESTIMATED" : "LIVE"}
                </Badge>
                <Badge color={flowBias === "CALL BIAS" ? C.green : flowBias === "PUT BIAS" ? C.red : C.amber}>{flowBias}</Badge>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                  Calls {formatNum(flowCallNotional)} · Puts {formatNum(flowPutNotional)}
                </span>
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 8 }}>FLOW FILTERS</div>
              <div style={{ display: "grid", gridTemplateColumns: "160px 140px 170px 180px auto", gap: 8, alignItems: "center" }}>
                <select
                  value={flowFilters.flowType}
                  onChange={(e) => setFlowFilters((prev) => ({ ...prev, flowType: e.target.value }))}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                >
                  <option value="all">All Flow</option>
                  <option value="sweep">Sweeps</option>
                  <option value="darkpool">Dark Pool</option>
                  <option value="block">Block</option>
                </select>
                <input
                  value={flowFilters.minNotional}
                  onChange={(e) => setFlowFilters((prev) => ({ ...prev, minNotional: e.target.value.replace(/[^\d]/g, "") }))}
                  placeholder="Min notional"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 11, color: C.textSec }}>
                  <input
                    type="checkbox"
                    checked={Boolean(flowFilters.unusualOnly)}
                    onChange={(e) => setFlowFilters((prev) => ({ ...prev, unusualOnly: e.target.checked }))}
                  />
                  Unusual only
                </label>
                <input
                  value={flowFilters.autoAlertNotional}
                  onChange={(e) => setFlowFilters((prev) => ({ ...prev, autoAlertNotional: e.target.value.replace(/[^\d]/g, "") }))}
                  placeholder="Auto-alert threshold"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <button
                  onClick={() => { setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); }}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, padding: "8px 10px", borderRadius: 4, fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  APPLY
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.9fr", gap: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                  BY SYMBOL
                </div>
                <div>
                  {flowBySymbol.map((row) => (
                    <div key={row.symbol} style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: MONO, fontSize: 13, color: C.text, fontWeight: 700 }}>{row.symbol}</span>
                        <Badge color={Number(row.callPutRatio || 0) >= 1 ? C.green : C.red}>C/P {Number(row.callPutRatio || 0).toFixed(2)}</Badge>
                      </div>
                      <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, marginBottom: 6 }}>Expiry {row.expiration || "—"}</div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          onClick={() => { setTerminalSymbol(row.symbol); setActiveTab("terminal"); }}
                          style={{ fontFamily: MONO, fontSize: 9, padding: "2px 7px", background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 3, cursor: "pointer" }}
                        >CHART</button>
                        <button
                          onClick={() => setWatchlistSymbols(prev => watchlistSymbols.includes(row.symbol) ? prev.filter(s => s !== row.symbol) : Array.from(new Set([...prev, row.symbol])))}
                          style={{ fontFamily: MONO, fontSize: 9, padding: "2px 7px", background: watchlistSymbols.includes(row.symbol) ? `${C.red}18` : `${C.green}18`, color: watchlistSymbols.includes(row.symbol) ? C.red : C.green, border: `1px solid ${watchlistSymbols.includes(row.symbol) ? C.red : C.green}44`, borderRadius: 3, cursor: "pointer" }}
                        >{watchlistSymbols.includes(row.symbol) ? "−WL" : "+WL"}</button>
                      </div>
                    </div>
                  ))}
                  {!flowBySymbol.length && <div style={{ padding: 12, color: C.textDim, fontSize: 12 }}>No options flow yet.</div>}
                </div>
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                  TOP FLOW TAPE
                </div>
                <div>
                  {flowRows.map((row, idx) => (
                    <div key={`${row.symbol}-${row.side}-${row.strike}-${idx}`} style={{ display: "grid", gridTemplateColumns: "62px 52px 70px 70px 72px 90px 88px 82px auto", gap: 8, alignItems: "center", padding: "9px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.text, fontWeight: 700 }}>{row.symbol}</span>
                      <Badge color={row.side === "CALL" ? C.green : C.red}>{row.side}</Badge>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>K {Number(row.strike || 0).toFixed(0)}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{row.expiry || "—"}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>Vol {row.volume || 0}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>OI {row.openInterest || 0}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{formatNum(row.notional || 0)}</span>
                      <Badge color={row.unusual ? C.amber : C.textDim}>{row.tradeType || "TAPE"}</Badge>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          onClick={() => { setTerminalSymbol(row.symbol); setActiveTab("terminal"); }}
                          style={{ border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, borderRadius: 4, padding: "4px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                        >CHART</button>
                        <button
                          onClick={async () => {
                            try {
                              await fetch("/api/journal", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  ticker: row.symbol,
                                  side: row.side === "CALL" ? "BUY" : "SELL",
                                  score: row.unusual ? 85 : 72,
                                  entry: Number(row.underlyingPrice || row.strike || 0),
                                  notes: `${row.tradeType || "FLOW"} · K${Number(row.strike || 0).toFixed(0)} ${row.expiry || ""} · ${formatNum(row.notional || 0)} notional${row.unusual ? " · UNUSUAL" : ""}`,
                                  timeframe: "1D",
                                  style: "Options",
                                }),
                              });
                            } catch {}
                          }}
                          style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.accent, borderRadius: 4, padding: "4px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                        >LOG</button>
                      </div>
                    </div>
                  ))}
                  {!flowRows.length && <div style={{ padding: 12, color: C.textDim, fontSize: 12 }}>No flow tape available yet.</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "rotation" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                ROTATION ENGINE — CAPITAL FLOW RANKING
              </div>
              {rotationRank.length > 0 && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={async () => {
                      const msg = rotationRank.slice(0, 10).map((q, i) =>
                        `${i + 1}. *${q.symbol}* RS ${q.relVsSpy >= 0 ? "+" : ""}${q.relVsSpy.toFixed(2)}% RVOL ${q.rvol.toFixed(2)}x`
                      ).join("\n");
                      try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `📊 *Rotation Top 10*\n\n${msg}` }) }); } catch {}
                    }}
                    style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 4, padding: "5px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                  >PUSH TOP 10</button>
                  <button
                    onClick={() => {
                      const header = "Rank,Symbol,Name,RS vs SPY %,RVOL,Price,Tag\n";
                      const rows = rotationRank.slice(0, 20).map((q, i) =>
                        `${i + 1},${q.symbol},"${q.name || ""}",${q.relVsSpy.toFixed(2)},${q.rvol.toFixed(2)},${q.price || ""},${i < 3 ? "LEADER" : i > 8 ? "LAGGER" : "NEUTRAL"}`
                      ).join("\n");
                      const blob = new Blob([header + rows], { type: "text/csv" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = `rotation-${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click();
                    }}
                    style={{ border: `1px solid ${C.accent}40`, background: `${C.accent}10`, color: C.accent, borderRadius: 4, padding: "5px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                  >EXPORT CSV</button>
                </div>
              )}
            </div>
            {rotationRank.length > 0 && (() => {
              const leaders = rotationRank.filter(q => q.relVsSpy >= 1).length;
              const laggers = rotationRank.filter(q => q.relVsSpy <= -1).length;
              const neutral = rotationRank.length - leaders - laggers;
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
                  {[
                    { label: "TOTAL", value: rotationRank.length, color: C.text },
                    { label: "LEADERS (RS ≥ +1%)", value: leaders, color: C.green },
                    { label: "NEUTRAL", value: neutral, color: C.amber },
                    { label: "LAGGERS (RS ≤ -1%)", value: laggers, color: C.red },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px" }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{label}</div>
                      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              {[...rotationRank].slice(0, 20).map((q, idx) => (
                <div key={q.symbol} style={{ display: "grid", gridTemplateColumns: "56px 1fr 150px 128px 116px auto", gap: 12, alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: MONO, color: C.textDim, fontSize: 12 }}>#{idx + 1}</span>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700 }}>{q.symbol}</div>
                    <div style={{ fontSize: 12, color: C.textDim }}>{q.name}</div>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 15, color: q.relVsSpy >= 0 ? C.green : C.red, fontWeight: 700 }}>
                    RS vs SPY {q.relVsSpy >= 0 ? "+" : ""}{q.relVsSpy.toFixed(2)}%
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 15, color: C.textSec, fontWeight: 700 }}>
                    RVOL {q.rvol.toFixed(2)}x
                  </div>
                  <Badge color={idx < 3 ? C.green : idx > 8 ? C.red : C.amber}>
                    {idx < 3 ? "LEADER" : idx > 8 ? "LAGGER" : "NEUTRAL"}
                  </Badge>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => { setTerminalSymbol(q.symbol); setActiveTab("terminal"); }}
                      style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.accent, borderRadius: 4, padding: "5px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                    >CHART</button>
                    <button
                      onClick={() => setWatchlistSymbols(prev => watchlistSymbols.includes(q.symbol) ? prev.filter(s => s !== q.symbol) : Array.from(new Set([...prev, q.symbol])))}
                      style={{ border: `1px solid ${watchlistSymbols.includes(q.symbol) ? C.red : C.green}55`, background: C.surface, color: watchlistSymbols.includes(q.symbol) ? C.red : C.green, borderRadius: 4, padding: "5px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                    >{watchlistSymbols.includes(q.symbol) ? "−WL" : "+WL"}</button>
                    <button
                      onClick={async () => {
                        try {
                          await fetch("/api/journal", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              ticker: q.symbol,
                              side: q.relVsSpy >= 0 ? "BUY" : "SELL",
                              score: Math.round(Math.min(99, 60 + (q.composite || 0) * 0.3 + Number(q.relVsSpy || 0))),
                              entry: Number(q.price || 0),
                              notes: `Rotation #${idx + 1} · RS ${q.relVsSpy >= 0 ? "+" : ""}${q.relVsSpy.toFixed(2)}% · RVOL ${q.rvol.toFixed(2)}x`,
                              timeframe: "1D",
                              style: "Swing",
                            }),
                          });
                        } catch {}
                      }}
                      style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "5px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                    >LOG</button>
                    <button
                      onClick={async () => {
                        const msg = `🔄 *${q.symbol}* Rotation #${idx + 1}\nRS vs SPY: ${q.relVsSpy >= 0 ? "+" : ""}${q.relVsSpy.toFixed(2)}%  RVOL: ${q.rvol.toFixed(2)}x\nStatus: ${idx < 3 ? "LEADER" : idx > 8 ? "LAGGER" : "NEUTRAL"}`;
                        try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                      }}
                      style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 4, padding: "5px 8px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                      title="Send to Telegram"
                    >PUSH</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "tools" && (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              PRO TOOLBOX — EXECUTION DISCIPLINE
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent }}>Position Sizing Engine Pro</div>
                  <Badge color={riskPlan.regime === "Risk-On" || riskPlan.regime === "Goldilocks" ? C.green : riskPlan.regime === "Risk-Off" ? C.red : C.amber}>
                    {riskPlan.regime}
                  </Badge>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(100px, 1fr))", gap: 8, marginBottom: 8 }}>
                  <input value={riskAccount} onChange={(e) => setRiskAccount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Account $" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <input value={riskPct} onChange={(e) => setRiskPct(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Risk %" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <input value={riskEntry} onChange={(e) => setRiskEntry(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Entry" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <input value={riskStop} onChange={(e) => setRiskStop(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Stop" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <select value={riskSide} onChange={(e) => setRiskSide(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}>
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(100px, 1fr))", gap: 8, marginBottom: 10 }}>
                  <input value={riskMaxPosPct} onChange={(e) => setRiskMaxPosPct(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Max Pos %" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <input value={riskCorrCap} onChange={(e) => setRiskCorrCap(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Corr Cap 0-1" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <input value={riskAtrPct} onChange={(e) => setRiskAtrPct(e.target.value.replace(/[^\d.]/g, ""))} placeholder="ATR % Proxy" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <input value={riskSlipBps} onChange={(e) => setRiskSlipBps(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Slip bps" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <select value={riskSetupQuality} onChange={(e) => setRiskSetupQuality(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}>
                    <option value="A+">A+ Setup</option>
                    <option value="A">A Setup</option>
                    <option value="B">B Setup</option>
                    <option value="C">C Setup</option>
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>Risk Budget $ (Adj)</div><div style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>${riskPlan.riskDollars.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>Per-share Risk</div><div style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>${riskPlan.perShare.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>Final Size (Shares)</div><div style={{ fontFamily: MONO, fontSize: 14, color: C.accent, fontWeight: 700 }}>{riskPlan.shares}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>Position $</div><div style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>${riskPlan.position.toFixed(0)}</div></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>Est. $ Risk</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.red }}>${riskPlan.estRisk.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>T1 (1R)</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.green }}>${riskPlan.t1.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>T2 (2R)</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.green }}>${riskPlan.t2.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>Stop Distance</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{riskPlan.stopPct.toFixed(2)}%</div></div>
                </div>
                <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div style={{ fontSize: 10, color: C.textSec }}>Base Risk Budget: <span style={{ fontFamily: MONO, color: C.text }}>${riskPlan.baseRiskDollars.toFixed(2)}</span></div>
                  <div style={{ fontSize: 10, color: C.textSec }}>Regime Mult: <span style={{ fontFamily: MONO, color: C.text }}>{riskPlan.regimeMult.toFixed(2)}x</span> · Quality: <span style={{ fontFamily: MONO, color: C.text }}>{riskPlan.qualityMult.toFixed(2)}x</span></div>
                  <div style={{ fontSize: 10, color: C.textSec }}>Vol Adj: <span style={{ fontFamily: MONO, color: C.text }}>{riskPlan.volAdj.toFixed(2)}x</span> · Corr Cap: <span style={{ fontFamily: MONO, color: C.text }}>{riskPlan.corrCap.toFixed(2)}x</span></div>
                </div>
                <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                  <button
                    onClick={async () => {
                      const sym = (terminalSymbol || selectedStock?.symbol || "").toUpperCase();
                      if (!sym || !riskPlan.shares) return;
                      try {
                        await fetch("/api/journal", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            ticker: sym,
                            side: riskSide === "short" ? "SELL" : "BUY",
                            score: 72,
                            entry: Number(riskEntry) || 0,
                            stopLoss: Number(riskStop) || 0,
                            target: riskPlan.t1 || 0,
                            notes: `${riskSetupQuality} setup · ${riskPlan.shares} shares · risk $${riskPlan.estRisk.toFixed(0)} · regime ${riskPlan.regime}`,
                            timeframe: "1D",
                            style: "Swing",
                          }),
                        });
                      } catch {}
                    }}
                    style={{ border: `1px solid ${C.green}55`, background: `${C.green}12`, color: C.green, borderRadius: 4, padding: "6px 12px", fontFamily: MONO, fontSize: 10, cursor: "pointer", fontWeight: 700 }}
                  >LOG TRADE TO JOURNAL</button>
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, marginBottom: 10 }}>Live Opportunity Scanner</div>
                {scannerRank.map((q, i) => (
                  <div key={`${q.symbol}-${i}`} style={{ display: "grid", gridTemplateColumns: "56px 1fr 66px", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{q.symbol}</span>
                    <span style={{ fontSize: 11, color: C.textSec }}>5m {q.delta5m >= 0 ? "+" : ""}{(q.delta5m || 0).toFixed(2)}% · RS {q.rel >= 0 ? "+" : ""}{q.rel.toFixed(2)}%</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: q.score >= 8 ? C.green : q.score >= 3 ? C.amber : C.red, textAlign: "right" }}>{q.score.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, marginBottom: 10 }}>Data Provider Keys (Local)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input
                  type="password"
                  value={providerKeys.finnhubKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, finnhubKey: e.target.value.trim() }))}
                  placeholder="Finnhub API Key"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <input
                  type="password"
                  value={providerKeys.fmpKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, fmpKey: e.target.value.trim() }))}
                  placeholder="FMP API Key"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <input
                  type="password"
                  value={providerKeys.polygonKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, polygonKey: e.target.value.trim() }))}
                  placeholder="Polygon API Key"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
                <input
                  type="password"
                  value={providerKeys.uwKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, uwKey: e.target.value.trim() }))}
                  placeholder="Unusual Whales API Key"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <input
                  type="password"
                  value={providerKeys.tradierKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, tradierKey: e.target.value.trim() }))}
                  placeholder="Tradier API Key (Options Flow)"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <button
                  onClick={() => { setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); }}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, padding: "8px 10px", borderRadius: 4, fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  APPLY
                </button>
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
                Keys are saved in local storage on this browser only. Add Polygon, Unusual Whales, and Tradier keys for richer options flow and provider coverage.
              </div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.cyan }}>TradingView Webhook Bridge</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Badge color={tvWebhookSecured ? C.green : C.amber}>{tvWebhookSecured ? "SECURED" : "OPEN"}</Badge>
                  <Badge color={tvWebhookRows.length ? C.green : C.amber}>{tvWebhookRows.length ? `${tvWebhookRows.length} RECEIVED` : "WAITING"}</Badge>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input
                  type="password"
                  value={tvWebhookToken}
                  onChange={(e) => setSettings((s) => ({ ...s, tvWebhookToken: e.target.value.trim() }))}
                  placeholder="Webhook token (must match TV_WEBHOOK_SECRET on server)"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <button
                  onClick={runTvWebhookTest}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "8px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  TEST
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input
                  readOnly
                  value={tvWebhookUrl}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <button
                  onClick={() => { try { navigator.clipboard.writeText(tvWebhookUrl); } catch {} }}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "8px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  COPY URL
                </button>
              </div>
              <div style={{ fontSize: 11, color: C.textSec, marginBottom: 6 }}>
                In TradingView alert, use this webhook URL and JSON message body:
              </div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, fontFamily: MONO, fontSize: 10, color: C.textSec }}>
{`{"symbol":"{{ticker}}","side":"BUY","price":"{{close}}","timeframe":"{{interval}}","message":"{{exchange}}:{{ticker}} breakout"}`}
              </pre>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
                Incoming TradingView signals are merged into Alerts, AI Agent, and Market Report automatically.
                {tvWebhookSecured ? " Token verification is ON." : " Set TV_WEBHOOK_SECRET on server to lock this endpoint."}
              </div>
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                {(tvWebhookRows || []).slice(0, 4).map((r, i) => (
                  <div key={`tv-row-${i}`} style={{ display: "grid", gridTemplateColumns: "80px 1fr 70px", gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>{r.symbol}</span>
                    <span style={{ fontSize: 11, color: C.textSec }}>{r.message || "Signal received"}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, textAlign: "right" }}>{String(r.side || "INFO").toUpperCase()}</span>
                  </div>
                ))}
                {!tvWebhookRows.length && <div style={{ fontSize: 11, color: C.textDim }}>No TradingView webhook alerts received yet.</div>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {[
                {
                  t: "Risk Calculator",
                  d: "Set max risk per trade (0.5%–1%), derive share size from stop distance before entry.",
                },
                {
                  t: "Technical Trigger Matrix",
                  d: "Require 3 of 5: trend alignment, RVOL > 1.2, RS > 0, reclaim/hold key average, clean structure.",
                },
                {
                  t: "Fundamental Quality Check",
                  d: "Check revenue/EPS trend, balance sheet, margins, and catalyst window before scaling position size.",
                },
                {
                  t: "Macro Gate",
                  d: "Only take aggressive longs when macro tone is Risk-On; reduce size when regime conflicts.",
                },
                {
                  t: "Rotation Checklist",
                  d: "Confirm stock > sector ETF and sector ETF > SPY before rotating capital to a new leader.",
                },
                {
                  t: "Post-Trade Journal",
                  d: "Log setup type, regime, entry/exit, invalidation respect, and lesson to improve process edge.",
                },
              ].map((x) => (
                <div key={x.t} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, marginBottom: 8 }}>{x.t}</div>
                  <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45 }}>{x.d}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "journal" && (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 10 }}>
              TRADE JOURNAL — PERFORMANCE TRACKER
            </div>

            {/* Today / Week P&L strip */}
            {journalEntries.length > 0 && (() => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const weekStart = (() => {
                const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10);
              })();
              const closed = journalEntries.filter(e => e.status === "closed" && e.pnl != null && e.closedAt);
              const todayTrades = closed.filter(e => (e.closedAt || "").slice(0, 10) === todayStr);
              const weekTrades  = closed.filter(e => (e.closedAt || "").slice(0, 10) >= weekStart);
              const todayPnl = todayTrades.reduce((s, e) => s + e.pnl, 0);
              const weekPnl  = weekTrades.reduce((s, e) => s + e.pnl, 0);
              const todayWins = todayTrades.filter(e => e.pnl > 0).length;
              const curStreak = journalStats?.currentStreak || 0;
              const streakLabel = curStreak > 0 ? `🔥 ${curStreak}W` : curStreak < 0 ? `❄️ ${Math.abs(curStreak)}L` : "—";
              const streakColor = curStreak > 0 ? C.green : curStreak < 0 ? C.red : C.textDim;
              return (
                <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  {[
                    { label: "TODAY P/L", value: todayTrades.length ? `${todayPnl >= 0 ? "+" : ""}$${Math.round(todayPnl)}` : "—", color: todayTrades.length ? (todayPnl >= 0 ? C.green : C.red) : C.textDim, sub: todayTrades.length ? `${todayTrades.length} trade${todayTrades.length !== 1 ? "s" : ""} · ${todayWins}W/${todayTrades.length - todayWins}L` : "no trades today" },
                    { label: "THIS WEEK", value: weekTrades.length ? `${weekPnl >= 0 ? "+" : ""}$${Math.round(weekPnl)}` : "—", color: weekTrades.length ? (weekPnl >= 0 ? C.green : C.red) : C.textDim, sub: weekTrades.length ? `${weekTrades.length} trades` : "no trades this week" },
                    { label: "STREAK", value: streakLabel, color: streakColor, sub: `best ${journalStats?.longestWinStreak || 0}W` },
                    { label: "WIN RATE", value: journalStats?.closed ? `${journalStats.winRate ?? 0}%` : "—", color: (journalStats?.winRate || 0) >= 50 ? C.green : C.amber, sub: journalStats?.closed ? `${journalStats.wins}W / ${journalStats.losses}L` : "" },
                  ].map(({ label, value, color, sub }) => (
                    <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", minWidth: 110 }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.06em" }}>{label}</div>
                      <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color, marginTop: 1 }}>{value}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 1 }}>{sub}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Stats bar */}
            {journalStats && journalEntries.length > 0 && (() => {
              const closedTrades = [...journalEntries]
                .filter(e => e.status === "closed" && e.pnl != null && e.closedAt)
                .sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));
              const equityCurve = closedTrades.reduce((acc, e) => {
                acc.push((acc[acc.length - 1] || 0) + e.pnl);
                return acc;
              }, []);
              const totalPnl = journalStats.totalPnl;
              const equityFinal = totalPnl != null ? `${totalPnl >= 0 ? "+" : ""}$${Math.round(totalPnl)}` : "—";
              const equityColor = totalPnl == null ? C.textDim : totalPnl >= 0 ? C.green : C.red;
              const eW = 280, eH = 52;
              let sparkPath = "";
              if (equityCurve.length >= 2) {
                const minY = Math.min(...equityCurve, 0);
                const maxY = Math.max(...equityCurve, 0);
                const range = Math.max(maxY - minY, 1);
                const pts = equityCurve.map((v, i) => {
                  const x = (i / (equityCurve.length - 1)) * eW;
                  const y = eH - ((v - minY) / range) * (eH - 6) - 3;
                  return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
                });
                sparkPath = pts.join(" ");
              }
              const openIds = Object.keys(liveJournalPnl);
              const totalLivePnl = openIds.reduce((s, id) => s + liveJournalPnl[id].livePnl, 0);
              const livePnlColor = openIds.length === 0 ? C.textDim : totalLivePnl >= 0 ? C.green : C.red;
              const livePnlDisplay = openIds.length > 0 ? `${totalLivePnl >= 0 ? "+" : ""}$${Math.round(totalLivePnl)}` : "—";
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 12 }}>
                  {[
                    { label: "TRADES", value: journalEntries.length },
                    { label: "OPEN", value: journalStats.open ?? 0 },
                    { label: "WIN RATE", value: journalStats.closed ? `${journalStats.winRate ?? 0}%` : "—" },
                    { label: "TOTAL P/L", value: equityFinal, color: equityColor },
                    { label: "AVG P/L", value: journalStats.avgPnl != null ? `${journalStats.avgPnl >= 0 ? "+" : ""}$${Math.round(journalStats.avgPnl)}` : "—" },
                    { label: "BEST TRADE", value: journalStats.bestTrade ? `${journalStats.bestTrade.ticker} +$${Math.round(journalStats.bestTrade.pnl)}` : "—" },
                    { label: `LIVE UNRLZD (${openIds.length})`, value: livePnlDisplay, color: livePnlColor },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{label}</div>
                      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: color || C.text, marginTop: 2 }}>{value}</div>
                    </div>
                  ))}
                  {equityCurve.length >= 2 && (
                    <div style={{ gridColumn: "1 / -1", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 16 }}>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 2 }}>EQUITY CURVE ({equityCurve.length} closed)</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: equityColor, fontWeight: 700 }}>{equityFinal} cumulative P/L</div>
                      </div>
                      <svg width={eW} height={eH} style={{ overflow: "visible", flex: 1 }}>
                        <line x1="0" y1={eH / 2} x2={eW} y2={eH / 2} stroke={C.border} strokeWidth="1" strokeDasharray="3,3" />
                        <path d={sparkPath} fill="none" stroke={equityColor} strokeWidth="1.8" strokeLinejoin="round" />
                        <circle cx={eW} cy={(() => {
                          const minY = Math.min(...equityCurve, 0);
                          const maxY = Math.max(...equityCurve, 0);
                          const range = Math.max(maxY - minY, 1);
                          return eH - ((equityCurve[equityCurve.length - 1] - minY) / range) * (eH - 6) - 3;
                        })()} r="3" fill={equityColor} />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Performance analytics row */}
            {journalEntries.length > 0 && (() => {
              const closed = journalEntries.filter(e => e.status === "closed" && e.pnl != null).sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));
              if (closed.length < 2) return null;
              const wins = closed.filter(e => e.pnl > 0);
              const losses = closed.filter(e => e.pnl <= 0);
              const avgWin = wins.length ? wins.reduce((s, e) => s + e.pnl, 0) / wins.length : 0;
              const avgLoss = losses.length ? Math.abs(losses.reduce((s, e) => s + e.pnl, 0) / losses.length) : 0;
              const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : wins.length ? Infinity : 0;
              const rFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
              let curStreak = 0, maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
              closed.forEach(e => {
                if (e.pnl > 0) { curWin++; curLoss = 0; maxWinStreak = Math.max(maxWinStreak, curWin); }
                else { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss); }
              });
              const lastPnl = closed[closed.length - 1].pnl;
              curStreak = closed.slice().reverse().findIndex(e => lastPnl > 0 ? e.pnl <= 0 : e.pnl > 0);
              if (curStreak === -1) curStreak = closed.length;
              let peak = 0, runningPnl = 0, maxDd = 0;
              closed.forEach(e => { runningPnl += e.pnl; if (runningPnl > peak) peak = runningPnl; const dd = peak - runningPnl; if (dd > maxDd) maxDd = dd; });
              const expectancy = closed.length ? closed.reduce((s, e) => s + e.pnl, 0) / closed.length : 0;
              return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>PERFORMANCE ANALYTICS ({closed.length} closed trades)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                    <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>AVG WIN</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.green }}>+${avgWin.toFixed(0)}</div></div>
                    <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>AVG LOSS</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.red }}>-${avgLoss.toFixed(0)}</div></div>
                    <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>R-FACTOR</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: rFactor >= 1.5 ? C.green : rFactor >= 1 ? C.amber : C.red }}>{isFinite(rFactor) ? rFactor.toFixed(2) : "∞"}</div></div>
                    <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>PROFIT FACTOR</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: profitFactor >= 1.5 ? C.green : profitFactor >= 1 ? C.amber : C.red }}>{isFinite(profitFactor) ? profitFactor.toFixed(2) : "∞"}</div></div>
                    <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>EXPECTANCY</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: expectancy >= 0 ? C.green : C.red }}>{expectancy >= 0 ? "+" : ""}${expectancy.toFixed(0)}</div></div>
                    <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>MAX DRAWDOWN</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: maxDd > 0 ? C.red : C.textDim }}>{maxDd > 0 ? `-$${maxDd.toFixed(0)}` : "—"}</div></div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>STREAKS</div>
                      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>
                        <span style={{ color: closed.length ? (closed[closed.length-1].pnl > 0 ? C.green : C.red) : C.textDim }}>
                          {closed.length ? `${closed[closed.length-1].pnl > 0 ? "▲" : "▼"}${curStreak}` : "—"}
                        </span>
                        <span style={{ color: C.textDim, fontSize: 9 }}>{" "}NOW</span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 2 }}>
                        <span style={{ color: C.green }}>W{maxWinStreak}</span>
                        <span>{" / "}</span>
                        <span style={{ color: C.red }}>L{maxLossStreak}</span>
                        <span>{" best"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Style breakdown */}
            {journalEntries.length > 2 && (() => {
              const closed = journalEntries.filter(e => e.status === "closed" && e.pnl != null);
              if (closed.length < 2) return null;
              const byStyle = {};
              closed.forEach(e => {
                const s = e.style || "Other";
                if (!byStyle[s]) byStyle[s] = { trades: 0, wins: 0, pnl: 0 };
                byStyle[s].trades++;
                if (e.pnl > 0) byStyle[s].wins++;
                byStyle[s].pnl += e.pnl;
              });
              const rows = Object.entries(byStyle).sort((a, b) => b[1].pnl - a[1].pnl);
              if (rows.length < 2) return null;
              return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>PERFORMANCE BY STYLE</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {rows.map(([style, s]) => {
                      const wr = Math.round((s.wins / s.trades) * 100);
                      const pnlColor = s.pnl >= 0 ? C.green : C.red;
                      return (
                        <div key={style} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", minWidth: 100 }}>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 3 }}>{style.toUpperCase()}</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: pnlColor }}>{s.pnl >= 0 ? "+" : ""}${Math.round(s.pnl)}</div>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 1 }}>{s.trades} trades · <span style={{ color: wr >= 50 ? C.green : C.red }}>{wr}% WR</span></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Monthly P/L chart */}
            {journalEntries.length > 1 && (() => {
              const closed = journalEntries.filter(e => e.status === "closed" && e.pnl != null && e.closedAt);
              if (closed.length < 3) return null;
              const byMonth = {};
              closed.forEach(e => {
                const d = new Date(e.closedAt);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                if (!byMonth[key]) byMonth[key] = { pnl: 0, trades: 0, wins: 0 };
                byMonth[key].pnl += e.pnl;
                byMonth[key].trades++;
                if (e.pnl > 0) byMonth[key].wins++;
              });
              const months = Object.keys(byMonth).sort().slice(-8);
              if (months.length < 2) return null;
              const rows = months.map(k => ({ key: k, ...byMonth[k] }));
              const maxAbs = Math.max(...rows.map(r => Math.abs(r.pnl)), 1);
              const MABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 10 }}>MONTHLY P/L</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80 }}>
                    {rows.map(r => {
                      const [yr, mo] = r.key.split("-");
                      const label = MABBR[parseInt(mo, 10) - 1] + " '" + yr.slice(2);
                      const pct = Math.abs(r.pnl) / maxAbs;
                      const barH = Math.max(Math.round(pct * 60), 4);
                      const col = r.pnl >= 0 ? C.green : C.red;
                      const wr = Math.round((r.wins / r.trades) * 100);
                      return (
                        <div key={r.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }} title={`${r.trades} trades · ${wr}% WR · ${r.pnl >= 0 ? "+" : ""}$${Math.round(r.pnl)}`}>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: col, fontWeight: 700 }}>{r.pnl >= 0 ? "+" : ""}${Math.round(r.pnl)}</div>
                          <div style={{ width: "100%", height: barH, background: col, borderRadius: "3px 3px 0 0", opacity: 0.75, transition: "height 0.3s ease" }} />
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, whiteSpace: "nowrap" }}>{label}</div>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: wr >= 50 ? C.green : C.red }}>{wr}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Toolbar */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              {["all", "open", "closed", "cancelled"].map(f => (
                <button key={f} onClick={() => setJournalFilter(f)}
                  style={{ border: `1px solid ${journalFilter === f ? C.accent : C.border}`, background: journalFilter === f ? `${C.accent}18` : C.surface, color: journalFilter === f ? C.accent : C.textSec, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer", textTransform: "uppercase" }}>
                  {f}
                </button>
              ))}
              <input
                value={journalTickerSearch}
                onChange={e => setJournalTickerSearch(e.target.value.toUpperCase())}
                placeholder="Search ticker…"
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 10, padding: "6px 8px", width: 120, borderRadius: 4 }}
              />
              <select value={journalStyleFilter} onChange={e => setJournalStyleFilter(e.target.value)}
                style={{ background: C.surface, border: `1px solid ${journalStyleFilter !== "all" ? C.purple : C.border}`, color: journalStyleFilter !== "all" ? C.purple : C.textSec, fontFamily: MONO, fontSize: 10, padding: "6px 8px", borderRadius: 4 }}>
                <option value="all">All Styles</option>
                {["Breakout","Pullback","Reversal","Momentum","Scalp","Swing","Day Trade","Watchlist","Scanner","Workflow","Terminal","Backtest","Analyzer"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={journalDateRange} onChange={e => setJournalDateRange(e.target.value)}
                style={{ background: C.surface, border: `1px solid ${journalDateRange !== "all" ? C.amber : C.border}`, color: journalDateRange !== "all" ? C.amber : C.textSec, fontFamily: MONO, fontSize: 10, padding: "6px 8px", borderRadius: 4 }}>
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
              </select>
              <button onClick={loadJournalTab} disabled={journalLoading}
                style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer", marginLeft: "auto" }}>
                {journalLoading ? "LOADING…" : "REFRESH"}
              </button>
              <a href="/api/journal/export.csv" download
                style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer", textDecoration: "none" }}>
                EXPORT CSV
              </a>
            </div>

            {/* Journal table */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              {journalEntries.length === 0 && !journalLoading && (
                <div style={{ padding: 24, textAlign: "center", color: C.textDim, fontSize: 13, fontFamily: MONO }}>
                  No journal entries yet. Use LOG buttons throughout the platform to start tracking trades.
                </div>
              )}
              {journalLoading && (
                <div style={{ padding: 24, textAlign: "center", color: C.textDim, fontSize: 12, fontFamily: MONO }}>LOADING…</div>
              )}
              {journalEntries.length > 0 && (() => {
                const SORT_KEYS = { DATE: "openedAt", TICKER: "ticker", SIDE: "side", TF: "timeframe", SCORE: "score", ENTRY: "entry", "P/L": "pnl", STATUS: "status" };
                const sortFn = (a, b) => {
                  const key = SORT_KEYS[journalSort.col];
                  if (!key) return 0;
                  const va = a[key] ?? "";
                  const vb = b[key] ?? "";
                  const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
                  return journalSort.dir === "asc" ? cmp : -cmp;
                };
                const _drStart = (() => {
                  const now = new Date();
                  if (journalDateRange === "today") { const d = new Date(now); d.setHours(0,0,0,0); return d; }
                  if (journalDateRange === "week")  { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d; }
                  if (journalDateRange === "month") { return new Date(now.getFullYear(), now.getMonth(), 1); }
                  if (journalDateRange === "quarter") { const q = Math.floor(now.getMonth() / 3); return new Date(now.getFullYear(), q * 3, 1); }
                  return null;
                })();
                const filtered = journalEntries.filter(e => {
                  if (journalFilter !== "all" && e.status !== journalFilter) return false;
                  if (journalTickerSearch && !String(e.ticker || "").toUpperCase().includes(journalTickerSearch)) return false;
                  if (journalStyleFilter !== "all" && String(e.style || "").toLowerCase() !== journalStyleFilter.toLowerCase()) return false;
                  if (_drStart) { const t = new Date(e.openedAt || 0); if (t < _drStart) return false; }
                  return true;
                }).sort(sortFn);
                if (!filtered.length) return (
                  <div style={{ padding: 20, textAlign: "center", color: C.textDim, fontSize: 12, fontFamily: MONO }}>
                    No entries {journalFilter !== "all" ? `with status "${journalFilter}"` : ""}{journalTickerSearch ? ` matching "${journalTickerSearch}"` : ""}{journalStyleFilter !== "all" ? ` with style "${journalStyleFilter}"` : ""}.
                  </div>
                );
                const SortTh = ({ col, children, align }) => {
                  const sortable = !!SORT_KEYS[col];
                  const active = journalSort.col === col;
                  return (
                    <th onClick={sortable ? () => setJournalSort(s => ({ col, dir: s.col === col && s.dir === "desc" ? "asc" : "desc" })) : undefined}
                      style={{ padding: "8px 10px", textAlign: align || "center", fontFamily: MONO, fontSize: 10, color: active ? C.accent : C.textDim, fontWeight: 600, cursor: sortable ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}>
                      {children}{active ? (journalSort.dir === "desc" ? " ↓" : " ↑") : ""}
                    </th>
                  );
                };
                return (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: C.surface }}>
                        {["DATE","TICKER","SIDE","TF","SCORE","ENTRY","SL","TARGET","R:R","P/L","STATUS","NOTES","ACTION"].map(h => (
                          <SortTh key={h} col={h} align={h === "NOTES" ? "left" : "center"}>{h}</SortTh>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(e => {
                        const livePnlData = liveJournalPnl[e.id];
                        const pnlColor = livePnlData ? (livePnlData.livePnl >= 0 ? C.green : C.red) : e.pnl == null ? C.textSec : e.pnl >= 0 ? C.green : C.red;
                        return (
                          <React.Fragment key={e.id}>
                            <tr style={{ borderTop: `1px solid ${C.border}` }}>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 11, color: C.textSec }}>{new Date(e.openedAt).toLocaleDateString()}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>
                                <button onClick={() => { setTerminalSymbol(e.ticker); setActiveTab("terminal"); }}
                                  style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", padding: 0 }}>{e.ticker}</button>
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 11, color: e.side === "BUY" ? C.green : e.side === "SELL" ? C.red : C.amber, fontWeight: 700 }}>{e.side}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 11, color: C.textSec }}>{e.timeframe || "—"}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 11, color: C.textSec }}>{e.score}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 11, color: C.text }}>
                                {e.entry ? `$${e.entry}` : "—"}
                                {livePnlData && <div style={{ fontSize: 9, fontFamily: MONO, color: C.textDim, marginTop: 1 }}>{`$${livePnlData.livePrice.toFixed(2)}`}</div>}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 11, color: C.red }}>{e.stopLoss ? `$${e.stopLoss}` : "—"}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 11, color: C.green }}>{e.target ? `$${e.target}` : "—"}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 11 }}>
                                {(() => {
                                  if (!e.entry || !e.stopLoss || !e.target) return <span style={{ color: C.textDim }}>—</span>;
                                  const risk = Math.abs(e.entry - e.stopLoss);
                                  const reward = Math.abs(e.target - e.entry);
                                  if (risk <= 0) return <span style={{ color: C.textDim }}>—</span>;
                                  const rr = reward / risk;
                                  const rrColor = rr >= 3 ? C.green : rr >= 2 ? C.accent : rr >= 1 ? C.amber : C.red;
                                  return <span style={{ color: rrColor, fontWeight: 700 }}>{rr.toFixed(1)}R</span>;
                                })()}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: pnlColor }}>
                                {livePnlData ? (
                                  <div>
                                    <div>{livePnlData.livePnl >= 0 ? "+" : ""}${livePnlData.livePnl.toFixed(2)}</div>
                                    <div style={{ fontSize: 9, color: pnlColor, opacity: 0.8 }}>{livePnlData.livePnlPct >= 0 ? "+" : ""}{livePnlData.livePnlPct.toFixed(2)}% LIVE</div>
                                  </div>
                                ) : e.pnl != null ? `${e.pnl >= 0 ? "+" : ""}$${e.pnl.toFixed(2)}` : "—"}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                <span style={{ background: e.status === "open" ? `${C.green}22` : e.status === "closed" ? `${C.accent}22` : `${C.amber}22`, color: e.status === "open" ? C.green : e.status === "closed" ? C.accent : C.amber, borderRadius: 4, padding: "3px 7px", fontFamily: MONO, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{e.status}</span>
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textSec, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.notes || "—"}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                                  {e.status === "open" && (
                                    <button onClick={() => { setJournalCloseId(e.id); setJournalClosePrice(livePnlData ? String(livePnlData.livePrice.toFixed(2)) : ""); }}
                                      style={{ border: `1px solid ${C.green}55`, background: `${C.green}12`, color: C.green, borderRadius: 4, padding: "4px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}>CLOSE</button>
                                  )}
                                  <button
                                    onClick={() => {
                                      const rr = e.entry && e.stopLoss && e.target ? ((e.target - e.entry) / Math.max(0.001, e.entry - e.stopLoss)).toFixed(2) : "—";
                                      const w = window.open("", "_blank", "width=700,height=820");
                                      w.document.write(`<!DOCTYPE html><html><head><title>Trade Sheet – ${e.ticker}</title>
<style>body{font-family:Inter,Arial,sans-serif;padding:32px 40px;color:#0f172a;font-size:13px;}h1{font-size:22px;font-weight:900;margin:0 0 4px;}h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:24px 0 8px;}table{width:100%;border-collapse:collapse;margin-bottom:16px;}td{padding:7px 10px;border-bottom:1px solid #e2e8f0;}td:first-child{font-weight:700;width:36%;}.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:800;}.green{background:#dcfce7;color:#15803d;}.red{background:#fee2e2;color:#b91c1c;}.blue{background:#dbeafe;color:#1d4ed8;}.amber{background:#fef9c3;color:#92400e;}.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;}@media print{body{padding:16px;}}</style>
</head><body>
<h1>${e.ticker} Trade Sheet</h1>
<span class="badge ${e.side === "BUY" ? "green" : e.side === "SELL" ? "red" : "blue"}">${e.side}</span>
<span class="badge ${e.status === "open" ? "blue" : e.status === "closed" ? "green" : "amber"}" style="margin-left:6px">${String(e.status).toUpperCase()}</span>
<h2>Plan</h2>
<table>
<tr><td>Entry</td><td>${e.entry ? "$" + e.entry : "—"}</td></tr>
<tr><td>Stop Loss</td><td>${e.stopLoss ? "$" + e.stopLoss : "—"}</td></tr>
<tr><td>Target</td><td>${e.target ? "$" + e.target : "—"}</td></tr>
<tr><td>R:R</td><td>${rr}</td></tr>
<tr><td>Score</td><td>${e.score}/100</td></tr>
<tr><td>Timeframe</td><td>${e.timeframe || "—"}</td></tr>
<tr><td>Style</td><td>${e.style || "—"}</td></tr>
</table>
<h2>Result</h2>
<table>
<tr><td>Status</td><td>${String(e.status).toUpperCase()}</td></tr>
<tr><td>Close Price</td><td>${e.closePrice ? "$" + e.closePrice : "—"}</td></tr>
<tr><td>P/L</td><td>${e.pnl != null ? (e.pnl >= 0 ? "+" : "") + "$" + Number(e.pnl).toFixed(2) : "—"}</td></tr>
</table>
<h2>Notes</h2>
<p style="line-height:1.6;padding:8px;background:#f8fafc;border-radius:6px;white-space:pre-wrap">${e.notes || "No notes."}</p>
<div class="footer">Dixie AM Trading Platform · Logged ${new Date(e.openedAt).toLocaleString()} · Printed ${new Date().toLocaleString()}</div>
<script>setTimeout(()=>{window.print();},300);</script>
</body></html>`);
                                      w.document.close();
                                    }}
                                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "4px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                                  >PRINT</button>
                                  <button
                                    onClick={async () => {
                                      if (!window.confirm(`Delete journal entry for ${e.ticker}?`)) return;
                                      await fetch(`/api/journal/${e.id}`, { method: "DELETE" });
                                      loadJournalTab();
                                    }}
                                    style={{ border: `1px solid ${C.red}55`, background: `${C.red}0f`, color: C.red, borderRadius: 4, padding: "4px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                                  >DEL</button>
                                  <button
                                    onClick={() => { setJournalEditId(journalEditId === e.id ? null : e.id); setJournalEditNotes(e.notes || ""); setJournalEditEntry(String(e.entry || "")); setJournalEditSL(String(e.stopLoss || "")); setJournalEditTarget(String(e.target || "")); setJournalEditSize(String(e.size || "")); }}
                                    style={{ border: `1px solid ${C.accent}55`, background: journalEditId === e.id ? `${C.accent}28` : `${C.accent}0f`, color: C.accent, borderRadius: 4, padding: "4px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                                  >EDIT</button>
                                </div>
                              </td>
                            </tr>
                            {journalEditId === e.id && (
                              <tr style={{ background: `${C.accent}06`, borderTop: `1px solid ${C.accent}33` }}>
                                <td colSpan={13} style={{ padding: "10px 12px" }}>
                                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 0 auto" }}>
                                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>ENTRY</div>
                                      <input type="number" step="0.01" value={journalEditEntry} onChange={e2 => setJournalEditEntry(e2.target.value)} placeholder="Entry $"
                                        style={{ width: 90, background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "5px 8px", fontFamily: MONO, fontSize: 11, borderRadius: 4 }} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 0 auto" }}>
                                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>STOP</div>
                                      <input type="number" step="0.01" value={journalEditSL} onChange={e2 => setJournalEditSL(e2.target.value)} placeholder="SL $"
                                        style={{ width: 90, background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "5px 8px", fontFamily: MONO, fontSize: 11, borderRadius: 4 }} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 0 auto" }}>
                                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>TARGET</div>
                                      <input type="number" step="0.01" value={journalEditTarget} onChange={e2 => setJournalEditTarget(e2.target.value)} placeholder="Target $"
                                        style={{ width: 90, background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "5px 8px", fontFamily: MONO, fontSize: 11, borderRadius: 4 }} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 0 auto" }}>
                                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>SHARES</div>
                                      <input type="number" step="1" value={journalEditSize} onChange={e2 => setJournalEditSize(e2.target.value)} placeholder="Qty"
                                        style={{ width: 80, background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "5px 8px", fontFamily: MONO, fontSize: 11, borderRadius: 4 }} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 160 }}>
                                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>NOTES</div>
                                      <textarea
                                        value={journalEditNotes}
                                        onChange={e2 => setJournalEditNotes(e2.target.value)}
                                        autoFocus
                                        rows={2}
                                        placeholder="Trade notes…"
                                        style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "5px 8px", fontFamily: SANS, fontSize: 12, resize: "vertical", borderRadius: 4 }}
                                      />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignSelf: "flex-end" }}>
                                      <button onClick={async () => {
                                        const patch = { notes: journalEditNotes };
                                        if (journalEditEntry) patch.entry = Number(journalEditEntry);
                                        if (journalEditSL) patch.stopLoss = Number(journalEditSL);
                                        if (journalEditTarget) patch.target = Number(journalEditTarget);
                                        if (journalEditSize) patch.size = Number(journalEditSize);
                                        await fetch(`/api/journal/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
                                        setJournalEditId(null);
                                        loadJournalTab();
                                      }} style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}18`, color: C.accent, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>SAVE</button>
                                      <button onClick={() => setJournalEditId(null)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>CANCEL</button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                            {journalCloseId === e.id && (
                              <tr style={{ background: `${C.green}08`, borderTop: `1px solid ${C.green}44` }}>
                                <td colSpan={13} style={{ padding: "10px 12px" }}>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>Close price:</span>
                                    <input type="number" step="0.01" value={journalClosePrice} onChange={e2 => setJournalClosePrice(e2.target.value)}
                                      placeholder="e.g. 184.50" autoFocus
                                      style={{ width: 120, background: C.surface, border: `1px solid ${C.green}55`, color: C.text, padding: "6px 8px", fontFamily: MONO, fontSize: 11 }} />
                                    {liveJournalPnl[e.id] && <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Live: ${liveJournalPnl[e.id].livePrice.toFixed(2)}</span>}
                                    <button onClick={async () => {
                                      const cp = Number(journalClosePrice);
                                      if (!cp) return;
                                      await fetch(`/api/journal/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "closed", closePrice: cp }) });
                                      setJournalCloseId(null);
                                      loadJournalTab();
                                    }} style={{ border: `1px solid ${C.green}55`, background: `${C.green}18`, color: C.green, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>CONFIRM</button>
                                    <button onClick={() => setJournalCloseId(null)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>CANCEL</button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        )}

      {activeTab === "analyzer" && (() => {
        const runAnalysis = (inputText) => {
          const blocks = (inputText || analyzerInput)
            .split(/\n{2,}|---+/)
            .map(b => b.trim())
            .filter(b => b.length > 8);
          const results = blocks.map(block => {
            const parsed = parseTelegramAlert(block);
            const scored = scoreAlert(parsed);
            return { parsed, scored, id: Math.random().toString(36).slice(2) };
          }).filter(r => r.parsed && r.parsed.symbol);
          results.sort((a, b) => b.scored.score - a.scored.score);
          setAnalyzerResults(results);
          setAnalyzerExpanded(results[0]?.id || null);
        };

        const decisionStyle = (d) => {
          const map = { ENTER: C.green, WAIT: C.amber, AVOID: C.red, HOLD: C.accent, TRIM: C.purple, EXIT: C.red };
          return map[d] || C.textDim;
        };
        const gradeColor = (g) => {
          if (g === "A+") return C.green;
          if (g === "A")  return C.accent;
          if (g === "B")  return C.amber;
          return C.red;
        };
        const scoreBar = (s) => {
          const color = s >= 80 ? C.green : s >= 70 ? C.accent : s >= 60 ? C.amber : C.red;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, height: 6, background: `${color}22`, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${s}%`, height: "100%", background: color, borderRadius: 3 }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color, minWidth: 28 }}>{s}</span>
            </div>
          );
        };

        const top3 = analyzerResults.slice(0, 3);
        const rest = analyzerResults.slice(3);

        return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                  TELEGRAM / TRADINGVIEW ALERT ANALYZER
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 3 }}>
                  Paste one or more alerts separated by blank lines or ---. Institution-grade scoring. A+ only.
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => { setAnalyzerInput(ANALYZER_SAMPLES.join("\n\n---\n\n")); }}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >LOAD SAMPLES</button>
              </div>
            </div>

            {/* Telegram connection status bar */}
            {(() => {
              const sendTest = async () => {
                setTgStatus("sending");
                setTgMsg("");
                try {
                  const res = await fetch("/api/telegram/test", { method: "POST" });
                  const data = await res.json();
                  if (data.ok) { setTgStatus("ok"); setTgMsg("✓ Message delivered!"); }
                  else { setTgStatus(res.status === 503 ? "unconfigured" : "error"); setTgMsg(data.error || "Unknown error"); }
                } catch (e) { setTgStatus("error"); setTgMsg(String(e.message || e)); }
              };
              const getChatId = async () => {
                try {
                  const r = await fetch("/api/telegram/getchatid");
                  const d = await r.json();
                  if (!d.ok) { alert("❌ " + d.error); return; }
                  if (d.hint) { alert("⚠ " + d.hint); return; }
                  const lines = d.chats.map(c =>
                    `Chat ID: ${c.id}\nType: ${c.type}${c.title ? "\nTitle: " + c.title : ""}${c.username ? "\nUsername: @" + c.username : ""}${c.firstName ? "\nName: " + c.firstName : ""}`
                  ).join("\n\n---\n\n");
                  alert("Found chats (use the ID that matches your group/channel):\n\n" + lines + "\n\n→ Copy the correct Chat ID and paste it into Render env vars as TELEGRAM_CHAT_ID");
                } catch(e) { alert("❌ " + e.message); }
              };
              const statusColor = tgStatus === "ok" ? C.green : tgStatus === "unconfigured" ? C.amber : tgStatus === "error" ? C.red : C.textDim;
              const statusText  = tgStatus === "sending" ? "Sending…" : tgStatus === "ok" ? "✓ Connected" : tgStatus === "unconfigured" ? "⚠ Not configured" : tgStatus === "error" ? "✕ Error" : "Not tested";
              const isError     = tgStatus === "error" || tgStatus === "unconfigured";
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: C.card, border: `1px solid ${isError ? C.red + "55" : C.border}`, borderRadius: 6, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.06em" }}>TELEGRAM BOT</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: statusColor }}>{statusText}</span>
                    {tgMsg && <span style={{ fontFamily: MONO, fontSize: 10, color: statusColor }}>{tgMsg}</span>}
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <button onClick={getChatId}
                        style={{ border: "1px solid #7c3aed55", background: "#7c3aed12", color: "#7c3aed", borderRadius: 4, padding: "5px 12px", fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                      >GET CHAT ID</button>
                      <button onClick={sendTest} disabled={tgStatus === "sending"}
                        style={{ border: `1px solid ${C.green}55`, background: `${C.green}12`, color: C.green, borderRadius: 4, padding: "5px 12px", fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                      >{tgStatus === "sending" ? "SENDING…" : "SEND TEST"}</button>
                    </div>
                  </div>
                  {isError && (
                    <div style={{ marginTop: 6, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, fontFamily: MONO, fontSize: 10, color: "#dc2626" }}>
                      <strong>Fix: </strong>
                      {tgStatus === "unconfigured"
                        ? 'Go to Render.com → your service → Environment → set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID'
                        : 'Your TELEGRAM_CHAT_ID is wrong ("chat not found"). Click GET CHAT ID above, copy the correct ID, then update it in Render → Environment → TELEGRAM_CHAT_ID'
                      }
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Input area */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 14 }}>
              <textarea
                value={analyzerInput}
                onChange={e => setAnalyzerInput(e.target.value)}
                placeholder={`Paste alert(s) here. Separate multiple alerts with a blank line or ---\n\nExample:\n🚨 NVDA LONG\nPrice: $875\nVWAP: Above\nEMA: 9 > 21 Bullish\nRVOL: 2.4x\nEntry: $872–875\nStop: $862\nT1: $895  T2: $912  T3: $930`}
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "10px 12px", borderRadius: 6, resize: "vertical", minHeight: 160, lineHeight: 1.6, width: "100%", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button
                  onClick={() => runAnalysis()}
                  style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 4, padding: "10px 16px", fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                >ANALYZE</button>
                <button
                  onClick={() => { setAnalyzerInput(""); setAnalyzerResults([]); setAnalyzerExpanded(null); }}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "8px 12px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >CLEAR</button>
              </div>
            </div>

            {analyzerResults.length === 0 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 32, textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, marginBottom: 6 }}>No alerts analyzed yet</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Click LOAD SAMPLES to test with demo alerts, or paste your own above.</div>
              </div>
            )}

            {analyzerResults.length > 0 && (
              <div style={{ display: "grid", gap: 12 }}>

                {/* Summary ranking table */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, letterSpacing: "0.08em" }}>
                      SIGNAL RANKING — {analyzerResults.length} ALERT{analyzerResults.length !== 1 ? "S" : ""} ANALYZED
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Top 3 highlighted</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: C.surface }}>
                          {["#","SYMBOL","DIR","TF","PRICE","VWAP","EMA","RVOL","SCORE","GRADE","DECISION","RISK LEVEL"].map(h => (
                            <th key={h} style={{ padding: "8px 10px", fontFamily: MONO, fontSize: 9, color: C.textDim, fontWeight: 700, textAlign: h === "#" || h === "SCORE" ? "center" : "left", whiteSpace: "nowrap", letterSpacing: "0.06em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analyzerResults.map((r, idx) => {
                          const { parsed: p, scored: s } = r;
                          const isTop = idx < 3;
                          const isSelected = analyzerExpanded === r.id;
                          const riskLevel = s.risks.length === 0 ? "LOW" : s.risks.length <= 1 ? "MODERATE" : "HIGH";
                          const riskColor = riskLevel === "LOW" ? C.green : riskLevel === "MODERATE" ? C.amber : C.red;
                          return (
                            <tr
                              key={r.id}
                              onClick={() => setAnalyzerExpanded(isSelected ? null : r.id)}
                              style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer", background: isSelected ? `${C.accent}0a` : isTop ? `${C.green}04` : "transparent", transition: "background 0.1s" }}
                            >
                              <td style={{ padding: "9px 10px", textAlign: "center" }}>
                                {isTop && <span style={{ background: idx === 0 ? C.green : idx === 1 ? C.accent : C.amber, color: "#fff", borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, fontWeight: 800 }}>#{idx + 1}</span>}
                                {!isTop && <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>#{idx + 1}</span>}
                              </td>
                              <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: isTop ? C.text : C.textSec }}>{p.symbol || "—"}</td>
                              <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 11, fontWeight: 700, color: p.direction === "LONG" ? C.green : p.direction === "SHORT" ? C.red : C.textDim }}>{p.direction || "—"}</td>
                              <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 10, color: C.textSec }}>{p.timeframe || "—"}</td>
                              <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 11, color: C.text }}>{p.price ? `$${p.price.toFixed(2)}` : "—"}</td>
                              <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 10, fontWeight: 700, color: p.vwapStatus === "above" ? C.green : p.vwapStatus === "below" ? C.red : C.textDim }}>
                                {p.vwapStatus ? p.vwapStatus.toUpperCase() : "—"}
                              </td>
                              <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 10, color: p.emaTrend === "bullish" ? C.green : p.emaTrend === "bearish" ? C.red : C.textDim }}>
                                {p.emaTrend ? p.emaTrend.toUpperCase() : "—"}
                              </td>
                              <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 10, color: (p.rvol || 0) >= 2 ? C.green : (p.rvol || 0) >= 1.5 ? C.amber : C.textDim }}>
                                {p.rvol != null ? `${p.rvol.toFixed(1)}x` : "—"}
                              </td>
                              <td style={{ padding: "9px 10px", minWidth: 100 }}>{scoreBar(s.score)}</td>
                              <td style={{ padding: "9px 10px", textAlign: "center" }}>
                                <span style={{ background: `${gradeColor(s.grade)}18`, color: gradeColor(s.grade), border: `1px solid ${gradeColor(s.grade)}44`, borderRadius: 4, padding: "3px 7px", fontFamily: MONO, fontSize: 10, fontWeight: 800 }}>{s.grade}</span>
                              </td>
                              <td style={{ padding: "9px 10px" }}>
                                <span style={{ background: `${decisionStyle(s.decision)}18`, color: decisionStyle(s.decision), border: `1px solid ${decisionStyle(s.decision)}44`, borderRadius: 4, padding: "4px 9px", fontFamily: MONO, fontSize: 11, fontWeight: 900, letterSpacing: "0.04em" }}>{s.decision}</span>
                              </td>
                              <td style={{ padding: "9px 10px" }}>
                                <span style={{ color: riskColor, fontFamily: MONO, fontSize: 10, fontWeight: 700 }}>{riskLevel}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Detailed breakdown for expanded alert */}
                {analyzerExpanded && (() => {
                  const r = analyzerResults.find(x => x.id === analyzerExpanded);
                  if (!r) return null;
                  const { parsed: p, scored: s } = r;
                  const idx = analyzerResults.indexOf(r);
                  const isTop3 = idx < 3;
                  const headerColor = s.decision === "ENTER" ? C.green : s.decision === "WAIT" ? C.amber : C.red;

                  return (
                    <div style={{ background: C.card, border: `1px solid ${headerColor}44`, borderRadius: 8, overflow: "hidden" }}>
                      {/* Breakdown header */}
                      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: `${headerColor}0c`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text }}>{p.symbol}</span>
                          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: p.direction === "LONG" ? C.green : C.red }}>{p.direction || "—"}</span>
                          {p.timeframe && <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{p.timeframe}</span>}
                          <span style={{ background: `${headerColor}18`, color: headerColor, border: `1px solid ${headerColor}44`, borderRadius: 4, padding: "3px 8px", fontFamily: MONO, fontSize: 12, fontWeight: 900 }}>{s.decision}</span>
                          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Score: <span style={{ color: gradeColor(s.grade), fontWeight: 800 }}>{s.score}/100</span></span>
                          {p.symbol && (
                            <button
                              onClick={() => { setTerminalSymbol(p.symbol); setActiveTab("terminal"); }}
                              style={{ border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, borderRadius: 4, padding: "4px 9px", fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                            >CHART</button>
                          )}
                          {p.symbol && (
                            <button
                              onClick={() => setWatchlistSymbols(prev => watchlistSymbols.includes(p.symbol) ? prev.filter(s => s !== p.symbol) : Array.from(new Set([...prev, p.symbol])))}
                              style={{ border: `1px solid ${watchlistSymbols.includes(p.symbol) ? C.red : C.green}44`, background: watchlistSymbols.includes(p.symbol) ? `${C.red}15` : `${C.green}15`, color: watchlistSymbols.includes(p.symbol) ? C.red : C.green, borderRadius: 4, padding: "4px 9px", fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                            >{watchlistSymbols.includes(p.symbol) ? "−WL" : "+WL"}</button>
                          )}
                        </div>
                        <button onClick={() => setAnalyzerExpanded(null)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "4px 8px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>CLOSE ✕</button>
                      </div>

                      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

                        {/* Trade Plan */}
                        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 10 }}>TRADE PLAN</div>
                          {[
                            { label: "Entry Zone", value: s.suggestedEntry ? (s.suggestedEntryHigh && s.suggestedEntryHigh !== s.suggestedEntry ? `$${s.suggestedEntry.toFixed(2)} – $${s.suggestedEntryHigh.toFixed(2)}` : `$${s.suggestedEntry.toFixed(2)}`): "—", color: C.accent },
                            { label: "Stop Loss",  value: s.suggestedStop  ? `$${s.suggestedStop.toFixed(2)}`  : "⚠ NOT DEFINED", color: C.red },
                            { label: "Target 1",   value: s.suggestedT1    ? `$${s.suggestedT1.toFixed(2)}`    : "—", color: C.green },
                            { label: "Target 2",   value: s.suggestedT2    ? `$${s.suggestedT2.toFixed(2)}`    : "—", color: C.green },
                            { label: "Target 3",   value: s.suggestedT3    ? `$${s.suggestedT3.toFixed(2)}`    : "—", color: C.green },
                            { label: "R:R to T1",  value: s.rrRatio != null ? `${s.rrRatio.toFixed(1)}:1`     : "—", color: s.rrRatio >= 2 ? C.green : s.rrRatio >= 1 ? C.amber : C.red },
                            { label: "Invalidate", value: s.invalidation, color: C.red },
                          ].map(({ label, value, color }) => (
                            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 8 }}>
                              <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, flexShrink: 0 }}>{label}</span>
                              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color, textAlign: "right" }}>{value}</span>
                            </div>
                          ))}
                          {/* Log to Journal button */}
                          <button
                            onClick={async () => {
                              if (!p.symbol) return;
                              try {
                                await fetch("/api/journal", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    ticker: p.symbol,
                                    side: p.direction === "SHORT" ? "SELL" : "BUY",
                                    score: s.score,
                                    entry: s.suggestedEntry || 0,
                                    stopLoss: s.suggestedStop || 0,
                                    target: s.suggestedT1 || 0,
                                    timeframe: p.timeframe || "1D",
                                    style: "Analyzer",
                                    notes: `Alert Analyzer · Grade ${s.grade} · ${s.decision} · ${p.setupType} · RVOL ${p.rvol != null ? p.rvol.toFixed(1) + "x" : "n/a"} · VWAP ${p.vwapStatus || "?"} · EMA ${p.emaTrend || "?"}`,
                                  }),
                                });
                                alert(`${p.symbol} logged to journal.`);
                              } catch {}
                            }}
                            style={{ marginTop: 10, width: "100%", border: `1px solid ${C.green}55`, background: `${C.green}12`, color: C.green, borderRadius: 4, padding: "7px 0", fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                          >LOG TO JOURNAL</button>
                        </div>

                        {/* Signal Analysis */}
                        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 10 }}>SIGNAL ANALYSIS</div>

                          {/* Score bar */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Setup Score</span>
                              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: gradeColor(s.grade) }}>{s.score}/100 — {s.grade}</span>
                            </div>
                            <div style={{ height: 8, background: `${gradeColor(s.grade)}22`, borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ width: `${s.score}%`, height: "100%", background: gradeColor(s.grade), borderRadius: 4 }} />
                            </div>
                          </div>

                          {s.positives.length > 0 && (
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontFamily: MONO, fontSize: 9, color: C.green, fontWeight: 700, marginBottom: 5, letterSpacing: "0.06em" }}>✓ STRENGTHS</div>
                              {s.positives.map((p, i) => (
                                <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 4 }}>
                                  <span style={{ color: C.green, fontSize: 10, flexShrink: 0, marginTop: 1 }}>+</span>
                                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textSec, lineHeight: 1.4 }}>{p}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {s.warnings.length > 0 && (
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontFamily: MONO, fontSize: 9, color: C.amber, fontWeight: 700, marginBottom: 5, letterSpacing: "0.06em" }}>⚠ CAUTIONS</div>
                              {s.warnings.map((w, i) => (
                                <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 4 }}>
                                  <span style={{ color: C.amber, fontSize: 10, flexShrink: 0, marginTop: 1 }}>!</span>
                                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textSec, lineHeight: 1.4 }}>{w}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {s.risks.length > 0 && (
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: 9, color: C.red, fontWeight: 700, marginBottom: 5, letterSpacing: "0.06em" }}>✗ RISK FLAGS</div>
                              {s.risks.map((r, i) => (
                                <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 4 }}>
                                  <span style={{ color: C.red, fontSize: 10, flexShrink: 0, marginTop: 1 }}>✕</span>
                                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textSec, lineHeight: 1.4 }}>{r}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Raw alert + context */}
                        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 10 }}>RAW ALERT + CONTEXT</div>

                          {/* Parsed fields */}
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, fontWeight: 700, marginBottom: 6, letterSpacing: "0.06em" }}>PARSED FIELDS</div>
                            {[
                              ["Symbol",    p.symbol || "—"],
                              ["Direction", p.direction || "—"],
                              ["Timeframe", p.timeframe || "—"],
                              ["Price",     p.price ? `$${p.price.toFixed(2)}` : "—"],
                              ["VWAP",      p.vwapStatus ? `${p.vwapStatus.toUpperCase()}${p.vwapValue ? ` ($${p.vwapValue.toFixed(2)})` : ""}` : "—"],
                              ["EMA",       p.emaTrend ? p.emaTrend.toUpperCase() : "—"],
                              ["RVOL",      p.rvol != null ? `${p.rvol.toFixed(1)}x` : "—"],
                              ["Setup",     p.setupType || "—"],
                            ].map(([label, val]) => (
                              <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{label}</span>
                                <span style={{ fontFamily: MONO, fontSize: 10, color: C.text, fontWeight: 600 }}>{val}</span>
                              </div>
                            ))}
                          </div>

                          {/* Raw text */}
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, fontWeight: 700, marginBottom: 5, letterSpacing: "0.06em" }}>RAW TEXT</div>
                          <pre style={{ margin: 0, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 10px", fontFamily: MONO, fontSize: 10, color: C.textSec, whiteSpace: "pre-wrap", maxHeight: 180, overflowY: "auto", lineHeight: 1.5 }}>{p.raw}</pre>

                          {/* WS link */}
                          {p.symbol && (
                            <a href={`/workstation#${p.symbol}`} target="_blank" rel="noopener" style={{ display: "block", marginTop: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.textSec, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, textAlign: "center", textDecoration: "none" }}>
                              Open {p.symbol} in Workstation →
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Cards for top 3 if no expanded view */}
                {!analyzerExpanded && top3.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                    {top3.map((r, idx) => {
                      const { parsed: p, scored: s } = r;
                      const headerColor = s.decision === "ENTER" ? C.green : s.decision === "WAIT" ? C.amber : C.red;
                      const rankLabels = ["BEST SETUP", "2ND BEST", "3RD BEST"];
                      return (
                        <div key={r.id} onClick={() => setAnalyzerExpanded(r.id)} style={{ background: C.card, border: `2px solid ${headerColor}44`, borderRadius: 8, overflow: "hidden", cursor: "pointer" }}>
                          <div style={{ padding: "8px 12px", background: `${headerColor}10`, borderBottom: `1px solid ${headerColor}33`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: headerColor, letterSpacing: "0.08em" }}>{rankLabels[idx]}</span>
                            <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>click to expand</span>
                          </div>
                          <div style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                              <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>{p.symbol}</span>
                              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: p.direction === "LONG" ? C.green : p.direction === "SHORT" ? C.red : C.textDim }}>{p.direction || "—"}</span>
                            </div>
                            <div style={{ marginBottom: 8 }}>{scoreBar(s.score)}</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ background: `${headerColor}18`, color: headerColor, border: `1px solid ${headerColor}44`, borderRadius: 4, padding: "3px 8px", fontFamily: MONO, fontSize: 11, fontWeight: 900 }}>{s.decision}</span>
                              <span style={{ background: `${gradeColor(s.grade)}18`, color: gradeColor(s.grade), borderRadius: 4, padding: "3px 8px", fontFamily: MONO, fontSize: 10, fontWeight: 700 }}>{s.grade}</span>
                              {p.rvol != null && <span style={{ background: C.surface, color: (p.rvol >= 2 ? C.green : p.rvol >= 1.5 ? C.amber : C.textDim), borderRadius: 4, padding: "3px 7px", fontFamily: MONO, fontSize: 10 }}>RVOL {p.rvol.toFixed(1)}x</span>}
                            </div>
                            {s.suggestedEntry && (
                              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                <div style={{ background: C.surface, borderRadius: 4, padding: "5px 8px" }}>
                                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>ENTRY</div>
                                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.accent, fontWeight: 700 }}>${s.suggestedEntry.toFixed(2)}</div>
                                </div>
                                {s.suggestedStop && (
                                  <div style={{ background: C.surface, borderRadius: 4, padding: "5px 8px" }}>
                                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>STOP</div>
                                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.red, fontWeight: 700 }}>${s.suggestedStop.toFixed(2)}</div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ══════════════════ DEALS TAB ══════════════════ */}
      {activeTab === "deals" && (() => {
        const DEAL_CATS = [
          { id: "electronics", label: "🖥️ Electronics" },
          { id: "realestate",  label: "🏠 Real Estate" },
          { id: "cars",        label: "🚗 Cars" },
          { id: "furniture",   label: "🛋️ Furniture" },
          { id: "general",     label: "🛒 General" },
          { id: "jobs",        label: "💼 Jobs" },
        ];
        const catLabel = DEAL_CATS.find(c => c.id === dealsCategory)?.label || dealsCategory;
        const showLocation = dealsCategory === "realestate" || dealsCategory === "cars";
        const SOURCE_META = [["reddit","Reddit","#ff4500"],["slickdeals","SlickDeals","#e31c23"],["dealnews","DealNews","#0066cc"],["google","Google","#4285f4"],["dealslist","DealsList","#16a34a"]];
        const allSourcesBlocked = Object.keys(dealsSources).length > 0 && Object.values(dealsSources).every(v => v === 0 || v === -1);
        return (
          <div style={{ maxWidth: 1400, margin: "0 auto" }}>
            {/* Header */}
            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text }}>🛒 DEALS FINDER</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 2 }}>Powered by Reddit deal communities — 100% free · Set Telegram alerts</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => fetch("/api/deals/ping").then(r => r.json()).then(d => alert(d.ok ? "✅ Server alive — deals endpoint working!" : "❌ Endpoint error")).catch(e => alert("❌ " + e.message))}
                  style={{ background: `${C.green}14`, border: `1px solid ${C.green}44`, color: C.green, fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "6px 12px", borderRadius: 5, cursor: "pointer" }}
                >🔌 PING</button>
                <button
                  onClick={() => fetch("/api/deals/debug").then(r => r.json()).then(d => alert("Source test:\n" + Object.entries(d.status || {}).map(([k,v]) => `${k}: ${v}`).join("\n"))).catch(e => alert("❌ " + e.message))}
                  style={{ background: "#7c3aed18", border: "1px solid #7c3aed44", color: "#7c3aed", fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "6px 12px", borderRadius: 5, cursor: "pointer" }}
                >🔬 DEBUG</button>
                <button
                  onClick={() => fetch("/api/deals/test-alert", { method: "POST" }).then(() => alert("Test Telegram alert sent!"))}
                  style={{ background: `${C.accent}14`, border: `1px solid ${C.accent}44`, color: C.accent, fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "6px 12px", borderRadius: 5, cursor: "pointer" }}
                >📱 TEST TELEGRAM</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 340px", gap: 16 }}>
              {/* LEFT: Search + Results */}
              <div>
                {/* Search panel */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                  {/* Category tabs */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", scrollbarWidth: "none" }}>
                    {DEAL_CATS.map(c => (
                      <button key={c.id} onClick={() => setDealsCategory(c.id)}
                        style={{ background: dealsCategory === c.id ? `${C.accent}18` : C.surface, border: `1px solid ${dealsCategory === c.id ? C.accent : C.border}`, color: dealsCategory === c.id ? C.accent : C.textSec, borderRadius: 20, padding: "5px 12px", fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {c.label}
                      </button>
                    ))}
                  </div>

                  {/* Search inputs row */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      value={dealsQuery}
                      onChange={e => setDealsQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && runDealsSearch()}
                      placeholder={`Search ${catLabel} deals… (leave blank for hot deals)`}
                      style={{ flex: "2 1 200px", border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "9px 12px", fontFamily: MONO, fontSize: 12, outline: "none" }}
                    />
                    <input
                      value={dealsMaxPrice}
                      onChange={e => setDealsMaxPrice(e.target.value)}
                      placeholder="Max $ price"
                      type="number"
                      style={{ flex: "0 1 110px", border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "9px 12px", fontFamily: MONO, fontSize: 12, outline: "none" }}
                    />
                    <button onClick={runDealsSearch} disabled={dealsLoading}
                      style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 6, padding: "9px 18px", fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: dealsLoading ? 0.7 : 1, flexShrink: 0 }}>
                      {dealsLoading ? "SEARCHING…" : "SEARCH"}
                    </button>
                    <button onClick={addDealsWatch} disabled={!dealsQuery.trim() || dealsWatchesLoading}
                      title="Save this search — get Telegram alerts when new deals appear"
                      style={{ background: `${C.green}14`, border: `1px solid ${C.green}44`, color: C.green, borderRadius: 6, padding: "9px 14px", fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: !dealsQuery.trim() ? 0.5 : 1, flexShrink: 0 }}>
                      🔔 WATCH
                    </button>
                  </div>

                  {dealsError && (
                    <div style={{ marginTop: 10, padding: "8px 12px", background: C.redBg, border: `1px solid ${C.red}44`, borderRadius: 6, fontFamily: MONO, fontSize: 10, color: C.red }}>
                      ⚠ {dealsError}
                    </div>
                  )}
                </div>

                {/* Results */}
                {dealsLoading && (
                  <div style={{ textAlign: "center", padding: 40, fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                    ⟳ Searching for deals…
                  </div>
                )}
                {!dealsLoading && dealsResults.length === 0 && !dealsError && !dealsSearched && (
                  <div style={{ textAlign: "center", padding: 40, fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                    Enter a search above and press SEARCH, or leave blank for hot deals.<br/>
                    <span style={{ fontSize: 10, marginTop: 4, display: "block" }}>
                      Sources: Reddit · SlickDeals · DealNews · Google News · DealsList
                    </span>
                    <span style={{ fontSize: 10, color: C.textDim }}>
                      Examples: "gaming laptop" · "iPhone 15" · "TV under 500" · "used car deals"
                    </span>
                  </div>
                )}
                {!dealsLoading && dealsResults.length === 0 && !dealsError && dealsSearched && (
                  <div style={{ textAlign: "center", padding: 40, fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{allSourcesBlocked ? "🚫" : "🔍"}</div>
                    {allSourcesBlocked ? (
                      <div>
                        <span style={{ color: C.red, fontWeight: 700 }}>All deal sources blocked or unreachable.</span><br/>
                        <span style={{ fontSize: 10, marginTop: 4, display: "block" }}>The server could not reach any deal site. Common on cloud servers.<br/>Click DEBUG above to see which sources work.</span>
                      </div>
                    ) : (
                      <div>
                        <span>No deals found for that search.</span><br/>
                        <span style={{ fontSize: 10, marginTop: 4, display: "block" }}>Try a broader term or leave blank for hot deals.</span>
                      </div>
                    )}
                    {Object.keys(dealsSources).length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
                        {SOURCE_META.map(([key, label, color]) => {
                          const v = dealsSources[key];
                          const bad = v === 0 || v === -1;
                          return (
                            <span key={key} style={{ background: bad ? C.surface : color, color: bad ? C.textDim : "#fff", border: `1px solid ${bad ? C.border : color}`, borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 700 }}>
                              {bad ? "✕" : "✓"} {label}{v > 0 ? " " + v : ""}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <button onClick={runDealsSearch} style={{ marginTop: 12, background: C.accent, border: "none", color: "#fff", borderRadius: 6, padding: "8px 18px", fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      TRY AGAIN
                    </button>
                  </div>
                )}
                {!dealsLoading && dealsResults.length > 0 && (
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <span style={{ color: C.text, fontWeight: 700 }}>{dealsResults.length} RESULTS</span>
                      {dealsQuery && <span style={{ color: C.textDim }}>for "{dealsQuery}"</span>}
                      {Object.keys(dealsSources).length > 0 && <span>·</span>}
                      {SOURCE_META.map(([key, label, color]) => {
                        const v = dealsSources[key];
                        if (v === undefined) return null;
                        const bad = v === 0 || v === -1;
                        return (
                          <span key={key} style={{ background: bad ? C.surface : color, color: bad ? C.textDim : "#fff", border: `1px solid ${bad ? C.border : "transparent"}`, borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>
                            {bad ? ("✕ " + label) : (label + " " + v)}
                          </span>
                        );
                      })}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                      {dealsResults.map(deal => {
                        const srcColors = { reddit:"#ff4500", slickdeals:"#e31c23", dealnews:"#0066cc", google:"#4285f4", dealslist:"#16a34a" };
                        const srcLabels = { reddit:"Reddit", slickdeals:"SlickDeals", dealnews:"DealNews", google:"Google News", dealslist:"DealsList" };
                        const catIcons  = { electronics:"💻", realestate:"🏠", cars:"🚗", furniture:"🛋️", jobs:"💼", luxury:"💎", general:"🛒" };
                        const srcColor  = srcColors[deal.sourceKey] || C.accent;
                        const srcLabel  = srcLabels[deal.sourceKey] || deal.source || "Deal";
                        const catIcon   = catIcons[deal.category]   || "🛒";
                        return (
                          <div key={deal.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                            {/* Image area */}
                            <div style={{ width: "100%", height: 160, background: theme === "dark" ? "#111827" : "#f0f2f5", position: "relative", overflow: "hidden", flexShrink: 0 }}>
                              {deal.image ? (
                                <img src={deal.image} alt=""
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                  onError={e => { e.target.style.display = "none"; }}
                                />
                              ) : (
                                <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                  <span style={{ fontSize: 38 }}>{catIcon}</span>
                                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{srcLabel}</span>
                                </div>
                              )}
                              {/* Source badge top-left */}
                              <div style={{ position: "absolute", top: 8, left: 8, background: srcColor, borderRadius: 5, padding: "2px 7px" }}>
                                <span style={{ fontFamily: MONO, fontSize: 9, color: "#fff", fontWeight: 700 }}>{srcLabel}</span>
                              </div>
                              {/* Age badge top-right */}
                              {deal.age !== null && (
                                <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.65)", borderRadius: 5, padding: "2px 6px" }}>
                                  <span style={{ fontFamily: MONO, fontSize: 9, color: "#e5e7eb" }}>
                                    {deal.age < 24 ? `${deal.age}h ago` : `${Math.floor(deal.age / 24)}d ago`}
                                  </span>
                                </div>
                              )}
                              {/* Upvote score bottom-left (Reddit only) */}
                              {deal.score > 0 && (
                                <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(0,0,0,0.65)", borderRadius: 5, padding: "2px 6px" }}>
                                  <span style={{ fontFamily: MONO, fontSize: 9, color: "#f59e0b", fontWeight: 700 }}>▲ {deal.score?.toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                            {/* Card body */}
                            <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>
                                {deal.title}
                              </div>
                              {deal.description && (
                                <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, lineHeight: 1.4 }}>
                                  {deal.description.slice(0, 100)}{deal.description.length > 100 ? "…" : ""}
                                </div>
                              )}
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 6 }}>
                                {deal.price && <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.green }}>{deal.price}</span>}
                                {deal.comments > 0 && <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>💬 {deal.comments}</span>}
                              </div>
                              <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
                                <a href={deal.link} target="_blank" rel="noopener noreferrer"
                                  style={{ flex: 1, background: srcColor, color: "#fff", textDecoration: "none", borderRadius: 5, padding: "6px 0", fontFamily: MONO, fontSize: 10, fontWeight: 700, textAlign: "center", display: "block" }}>
                                  VIEW DEAL →
                                </a>
                                {deal.sourceKey === "reddit" && deal.redditLink && deal.redditLink !== deal.link && (
                                  <a href={deal.redditLink} target="_blank" rel="noopener noreferrer"
                                    style={{ background: "#ff4500", color: "#fff", textDecoration: "none", borderRadius: 5, padding: "6px 8px", fontFamily: MONO, fontSize: 10, fontWeight: 700, display: "block" }}>
                                    💬
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT: Watches + Recent Alerts */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Active watches */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.text, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>🔔 TELEGRAM WATCHES ({dealsWatches.length})</span>
                    <button onClick={fetchDealsWatches} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 9, cursor: "pointer" }}>REFRESH</button>
                  </div>
                  {dealsWatches.length === 0 ? (
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, padding: "12px 0" }}>
                      No watches yet.<br/>
                      Search for something then click 🔔 WATCH to get Telegram alerts every 30 min when new deals appear.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {dealsWatches.map(w => (
                        <div key={w.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "9px 10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.query}</div>
                            <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 2 }}>
                              {w.category.toUpperCase()}{w.maxPrice ? ` · max $${w.maxPrice}` : ""}{w.location ? ` · ${w.location}` : ""}
                            </div>
                            <div style={{ fontFamily: MONO, fontSize: 9, color: w.lastAlerted ? C.green : C.textDim, marginTop: 2 }}>
                              {w.lastAlerted ? `Last alerted: ${new Date(w.lastAlerted).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not yet checked"}
                            </div>
                          </div>
                          <button onClick={() => removeDealsWatch(w.id)}
                            style={{ background: C.redBg, border: `1px solid ${C.red}44`, color: C.red, borderRadius: 4, padding: "3px 7px", fontFamily: MONO, fontSize: 9, cursor: "pointer", flexShrink: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Telegram alerts */}
                {dealsAlerts.length > 0 && (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.text, marginBottom: 10 }}>
                      📨 RECENT TELEGRAM ALERTS
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {dealsAlerts.slice(0, 10).map(a => (
                        <div key={a.id} style={{ background: `${C.green}08`, border: `1px solid ${C.green}22`, borderRadius: 7, padding: "8px 10px" }}>
                          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.text }}>{a.query} <span style={{ color: C.green, fontWeight: 900 }}>+{a.count} new</span></div>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 2 }}>{new Date(a.at).toLocaleString()}</div>
                          {a.preview?.map((p, i) => (
                            <div key={i} style={{ fontFamily: SANS, fontSize: 10, color: C.textSec, marginTop: 3 }}>
                              • {p.title.slice(0, 50)}{p.title.length > 50 ? "…" : ""} {p.price && <span style={{ color: C.green, fontWeight: 700 }}>{p.price}</span>}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Info box */}
                <div style={{ background: `${C.accent}08`, border: `1px solid ${C.accent}22`, borderRadius: 10, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.accent, marginBottom: 6 }}>HOW DEAL ALERTS WORK</div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, lineHeight: 1.6 }}>
                    1. Search or browse hot deals by category<br/>
                    2. Click 🔔 WATCH to save the search<br/>
                    3. Server checks Reddit every 30 min<br/>
                    4. New posts → instant Telegram message<br/>
                    5. Works 24/7 even when browser is closed<br/><br/>
                    <span style={{ color: C.accent, fontWeight: 700 }}>✓ 100% Free — no API key needed</span><br/>
                    Sources: r/deals, r/buildapcsales, r/frugal,<br/>
                    r/realestate, r/cardeals, r/techdeals + more
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════ COT TAB ══════════════════ */}
      {activeTab === "cot" && (() => {
        const green  = "#00c878";
        const red    = "#ff4455";
        const yellow = "#f5c842";
        const blue   = "#4a9eff";
        const dim    = C.textDim;

        function scoreColor(score) {
          if (score === undefined || score === null) return dim;
          if (score >= 60)  return green;
          if (score >= 25)  return "#6ec97a";
          if (score >= -24) return blue;
          if (score >= -59) return "#ff8855";
          return red;
        }

        function scoreBar(score) {
          if (score === undefined || score === null) return "─";
          const pct = Math.round(((score + 100) / 200) * 20);
          const filled = Math.max(0, Math.min(20, pct));
          const bar = "█".repeat(filled) + "░".repeat(20 - filled);
          return bar;
        }

        function biasTag(label = "") {
          const l = label.toLowerCase();
          const col = l.includes("strong bullish") ? green
                    : l.includes("bullish")         ? "#6ec97a"
                    : l.includes("strong bearish")  ? red
                    : l.includes("bearish")         ? "#ff8855"
                    : l.includes("crowded")         ? yellow
                    : blue;
          return (
            <span style={{ background: `${col}1a`, border: `1px solid ${col}44`, color: col,
              fontFamily: MONO, fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "2px 7px",
              letterSpacing: "0.05em" }}>
              {label || "—"}
            </span>
          );
        }

        const summary   = cotData?.summary || {};
        const allBiases = cotData?.allBiases || {};
        const fresh     = cotData?.fresh;
        const repDate   = cotData?.reportDate;

        const CATEGORY_GROUPS = [
          { label: "Equity Indexes", biasKey: summary.equityBias, keys: ["sp500","nasdaq","dow","russell"] },
          { label: "Bonds / Rates",  biasKey: summary.bondBias,   keys: ["10y","2y"] },
          { label: "Dollar",         biasKey: summary.dollarBias, keys: ["dxy","eurusd","usdjpy","gbpusd"] },
          { label: "Gold / Metals",  biasKey: summary.goldBias,   keys: ["gold","silver"] },
          { label: "Energy",         biasKey: summary.oilBias,    keys: ["crude","natgas"] },
          { label: "Bitcoin",        biasKey: summary.bitcoinBias,keys: ["bitcoin"] },
        ];

        return (
          <div style={{ padding: isMobile ? "10px 8px" : "18px 20px", maxWidth: 1100, margin: "0 auto" }}>

            {/* ── Header ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text, letterSpacing: "0.08em" }}>
                  📊 COMMITMENTS OF TRADERS
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: dim, marginTop: 3, letterSpacing: "0.06em" }}>
                  CFTC WEEKLY INSTITUTIONAL POSITIONING DATA
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {/* Freshness badge */}
                <div style={{ fontFamily: MONO, fontSize: 9, padding: "4px 10px", borderRadius: 5,
                  background: fresh ? `${green}18` : `${yellow}18`,
                  border: `1px solid ${fresh ? green : yellow}44`,
                  color: fresh ? green : yellow }}>
                  {fresh ? "✅ DATA FRESH" : "⚠️ MAY BE STALE"}
                </div>
                {repDate && (
                  <div style={{ fontFamily: MONO, fontSize: 9, color: dim, padding: "4px 10px",
                    border: `1px solid ${C.border}`, borderRadius: 5 }}>
                    COT date: {repDate}
                  </div>
                )}
                {/* Update button */}
                <button
                  disabled={cotRunning}
                  onClick={() => {
                    setCotRunning(true);
                    // Fire the async download (server returns 202 immediately; download takes ~60s)
                    fetch("/api/cot/run-update").catch(() => {});
                    // Poll /api/cot/status every 12s for up to 120s until biases appear
                    let attempts = 0;
                    const maxAttempts = 10;
                    const poll = () => {
                      attempts++;
                      fetch("/api/cot/status")
                        .then(r => r.json())
                        .then(d => {
                          const hasBiases = d.allBiases && Object.keys(d.allBiases).length > 0;
                          if (hasBiases || attempts >= maxAttempts) {
                            setCotData(d);
                            setCotRunning(false);
                          } else {
                            setTimeout(poll, 12000);
                          }
                        })
                        .catch(() => { if (attempts >= maxAttempts) setCotRunning(false); else setTimeout(poll, 12000); });
                    };
                    setTimeout(poll, 12000); // first check after 12s
                  }}
                  style={{ background: cotRunning ? C.surface : `${blue}1a`, border: `1px solid ${blue}55`,
                    color: blue, fontFamily: MONO, fontSize: 9, fontWeight: 700, padding: "5px 12px",
                    borderRadius: 5, cursor: cotRunning ? "not-allowed" : "pointer", letterSpacing: "0.05em" }}>
                  {cotRunning ? "⏳ DOWNLOADING…" : "⬇ UPDATE COT"}
                </button>
                {/* Send Telegram button */}
                <button
                  disabled={cotRunning}
                  onClick={() => {
                    setCotRunning(true); setCotLastSent(null);
                    fetch("/api/cot/run-now")
                      .then(r => r.json())
                      .then(d => setCotLastSent(d.ok ? "✅ Sent!" : `❌ ${d.message}`))
                      .catch(e => setCotLastSent(`❌ ${e.message}`))
                      .finally(() => setCotRunning(false));
                  }}
                  style={{ background: cotRunning ? C.surface : `${green}1a`, border: `1px solid ${green}55`,
                    color: green, fontFamily: MONO, fontSize: 9, fontWeight: 700, padding: "5px 12px",
                    borderRadius: 5, cursor: cotRunning ? "not-allowed" : "pointer", letterSpacing: "0.05em" }}>
                  📤 SEND TELEGRAM
                </button>
                {cotLastSent && (
                  <span style={{ fontFamily: MONO, fontSize: 9, color: cotLastSent.startsWith("✅") ? green : red }}>
                    {cotLastSent}
                  </span>
                )}
              </div>
            </div>

            {/* Stale warning */}
            {summary.staleWarning && (
              <div style={{ background: `${yellow}14`, border: `1px solid ${yellow}44`, borderRadius: 8,
                padding: "8px 14px", fontFamily: MONO, fontSize: 10, color: yellow, marginBottom: 14 }}>
                ⚠️ {summary.staleWarning}
              </div>
            )}

            {/* Error / loading */}
            {cotLoading && (
              <div style={{ textAlign: "center", padding: 40, fontFamily: MONO, fontSize: 11, color: dim }}>
                ⏳ Loading COT data…
              </div>
            )}
            {cotError && !cotLoading && (
              <div style={{ background: `${red}14`, border: `1px solid ${red}44`, borderRadius: 8,
                padding: "10px 14px", fontFamily: MONO, fontSize: 10, color: red, marginBottom: 14 }}>
                ❌ {cotError}
              </div>
            )}

            {!cotLoading && !cotError && !cotData && (
              <div style={{ textAlign: "center", padding: 40, fontFamily: MONO, fontSize: 11, color: dim }}>
                No COT data loaded yet. Click "UPDATE COT" to download the latest CFTC report.
              </div>
            )}

            {cotData && !cotLoading && (
              <>
                {/* ── Macro Bias Summary Row ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 16 }}>
                  {[
                    { label: "Equity Indexes", value: summary.equityBias },
                    { label: "Bonds / Rates",  value: summary.bondBias   },
                    { label: "Dollar",         value: summary.dollarBias },
                    { label: "Gold",           value: summary.goldBias   },
                    { label: "Oil / Energy",   value: summary.oilBias    },
                    { label: "Bitcoin",        value: summary.bitcoinBias },
                  ].map(({ label, value }) => {
                    const score = (summary.equity?.score) || 0;
                    return (
                      <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                        padding: "10px 12px" }}>
                        <div style={{ fontFamily: MONO, fontSize: 8, color: dim, letterSpacing: "0.08em", marginBottom: 5 }}>
                          {label.toUpperCase()}
                        </div>
                        {biasTag(value || "N/A")}
                      </div>
                    );
                  })}
                </div>

                {/* ── Market-by-market table ── */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                  padding: "14px 16px", marginBottom: 16, overflowX: "auto" }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.text,
                    letterSpacing: "0.08em", marginBottom: 12 }}>
                    MARKET POSITIONING TABLE
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: MONO }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {["MARKET","CATEGORY","SCORE","BIAS","13W PCT","52W PCT","WK CHG","REPORT DATE","STATUS"].map(h => (
                          <th key={h} style={{ padding: "4px 10px", textAlign: "left", color: dim,
                            fontWeight: 600, fontSize: 8, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(allBiases).map(([key, b]) => {
                        const sc = b.score || 0;
                        const col = scoreColor(sc);
                        const extreme = b.positioningExtreme;
                        return (
                          <tr key={key} style={{ borderBottom: `1px solid ${C.border}22`,
                            background: extreme ? `${yellow}08` : "transparent" }}>
                            <td style={{ padding: "6px 10px", color: C.text, fontWeight: 700, whiteSpace: "nowrap" }}>
                              {b.name || key}
                            </td>
                            <td style={{ padding: "6px 10px", color: dim, fontSize: 9 }}>
                              {b.category || "—"}
                            </td>
                            <td style={{ padding: "6px 10px", color: col, fontWeight: 800 }}>
                              {sc > 0 ? "+" : ""}{sc}
                            </td>
                            <td style={{ padding: "6px 10px" }}>
                              {biasTag(b.label || "—")}
                            </td>
                            <td style={{ padding: "6px 10px", color: dim }}>
                              {b.primaryPct13 !== undefined ? `${b.primaryPct13}%` : "—"}
                            </td>
                            <td style={{ padding: "6px 10px" }}>
                              <span style={{ color: b.primaryPct52 >= 90 ? yellow : b.primaryPct52 <= 10 ? yellow : dim }}>
                                {b.primaryPct52 !== undefined ? `${b.primaryPct52}%` : "—"}
                                {b.crowdedLong  ? " 🟡CL" : ""}
                                {b.crowdedShort ? " 🟡CS" : ""}
                              </span>
                            </td>
                            <td style={{ padding: "6px 10px",
                              color: b.weekChange > 0 ? green : b.weekChange < 0 ? red : dim }}>
                              {b.weekChange !== undefined
                                ? (b.weekChange > 0 ? "+" : "") + Number(b.weekChange).toLocaleString()
                                : "—"}
                            </td>
                            <td style={{ padding: "6px 10px", color: dim, fontSize: 9 }}>
                              {b.reportDate || "—"}
                            </td>
                            <td style={{ padding: "6px 10px", fontSize: 9 }}>
                              {extreme
                                ? <span style={{ color: yellow }}>⚠️ EXTREME</span>
                                : <span style={{ color: `${green}88` }}>OK</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {Object.keys(allBiases).length === 0 && (
                        <tr>
                          <td colSpan={9} style={{ padding: "20px 10px", textAlign: "center", color: dim, fontSize: 10 }}>
                            No data — click UPDATE COT to download CFTC report
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* ── Score bars ── */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  {Object.entries(allBiases).map(([key, b]) => {
                    const sc = b.score || 0;
                    const col = scoreColor(sc);
                    const pct = Math.max(0, Math.min(100, ((sc + 100) / 200) * 100));
                    return (
                      <div key={key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
                        padding: "10px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.text }}>
                            {b.name || key}
                          </span>
                          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: col }}>
                            {sc > 0 ? "+" : ""}{sc}
                          </span>
                        </div>
                        <div style={{ height: 5, background: C.surface, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 3,
                            transition: "width 0.4s ease" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                          <span style={{ fontFamily: MONO, fontSize: 8, color: red }}>BEARISH</span>
                          <span style={{ fontFamily: MONO, fontSize: 8, color: dim }}>NEUTRAL</span>
                          <span style={{ fontFamily: MONO, fontSize: 8, color: green }}>BULLISH</span>
                        </div>
                        {b.crowdedLong  && <div style={{ fontFamily: MONO, fontSize: 8, color: yellow, marginTop: 3 }}>⚠️ Crowded Long — monitor for reversal</div>}
                        {b.crowdedShort && <div style={{ fontFamily: MONO, fontSize: 8, color: yellow, marginTop: 3 }}>⚠️ Crowded Short — squeeze risk</div>}
                      </div>
                    );
                  })}
                </div>

                {/* ── COT Methodology note ── */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                  padding: "12px 16px", fontFamily: MONO, fontSize: 9, color: dim, lineHeight: 1.7 }}>
                  <div style={{ color: C.text, fontWeight: 700, marginBottom: 6 }}>ℹ️ COT METHODOLOGY</div>
                  COT data is released by the CFTC each Friday at 3:30 PM ET, reflecting positions as of the prior Tuesday close.<br/>
                  <strong style={{ color: C.text }}>TFF</strong> (Traders in Financial Futures) is used for equity indexes, rates, FX, and bonds.<br/>
                  <strong style={{ color: C.text }}>Disaggregated</strong> is used for commodities (gold, oil, gas).<br/>
                  <strong style={{ color: C.text }}>Legacy</strong> is used for Bitcoin.<br/>
                  Scores run from -100 (strong bearish) to +100 (strong bullish) based on asset-manager and leveraged-fund net positioning percentiles.<br/>
                  <strong style={{ color: yellow }}>⚠️ Crowded Long/Short</strong>: 52-week percentile above 90 or below 10 — high reversal risk.
                  <strong style={{ color: C.text }}>  COT is a higher-timeframe positioning bias, not a live entry signal.</strong>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ══════════════════ QURAN TAB ══════════════════ */}
      {activeTab === "quran" && (() => {
        const surahNum = quranSurah;
        const surahInfo = SURAH_LIST[surahNum - 1];
        const gold = "#c9a84c";
        const goldDim = "#c9a84c44";
        const goldBg  = "#c9a84c12";

        const fmtTime = (s) => {
          if (!s || !isFinite(s)) return "0:00";
          const m = Math.floor(s / 60);
          const sec = Math.floor(s % 60);
          return `${m}:${sec.toString().padStart(2, "0")}`;
        };

        const filteredSurahs = quranSearchQuery.trim()
          ? SURAH_LIST.filter(([n, ar, en]) =>
              en.toLowerCase().includes(quranSearchQuery.toLowerCase()) ||
              ar.includes(quranSearchQuery) ||
              String(n).startsWith(quranSearchQuery.trim())
            )
          : SURAH_LIST;

        return (
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            {/* ── Bismillah header ── */}
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 20, color: gold, letterSpacing: "0.08em", marginBottom: 4, direction: "rtl" }}>
                بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.14em" }}>QURAN RECITATION PLAYER</div>
            </div>

            {/* ── Main player card ── */}
            <div style={{ background: C.card, border: `1px solid ${goldDim}`, borderRadius: 18, padding: "22px 20px 18px", marginBottom: 14, boxShadow: `0 0 50px ${gold}08` }}>

              {/* Surah name */}
              <div style={{ textAlign: "center", marginBottom: 14, direction: "rtl" }}>
                <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 36, fontWeight: 900, color: gold, lineHeight: 1.2 }}>
                  {surahInfo?.[1]}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 4, direction: "ltr" }}>
                  {surahNum}. {surahInfo?.[2]}
                </div>
              </div>

              {/* ── Progress bar ── */}
              <div style={{ marginBottom: 12 }}>
                <input
                  type="range"
                  min="0"
                  max={quranDuration || 100}
                  step="1"
                  value={quranCurrentTime}
                  onChange={e => {
                    const t = Number(e.target.value);
                    setQuranCurrentTime(t);
                    if (quranAudioRef.current) quranAudioRef.current.currentTime = t;
                  }}
                  style={{ width: "100%", accentColor: gold, height: 4, cursor: "pointer" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 3 }}>
                  <span>{fmtTime(quranCurrentTime)}</span>
                  <span>{fmtTime(quranDuration)}</span>
                </div>
              </div>

              {/* ── Transport controls ── */}
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginBottom: 16 }}>
                {/* Prev surah */}
                <button
                  onClick={() => {
                    const prev = surahNum > 1 ? surahNum - 1 : 114;
                    quranWasPlaying.current = quranPlaying;
                    setQuranSurah(prev);
                    localStorage.setItem("quran_surah", String(prev));
                  }}
                  title="السورة السابقة"
                  style={{ background: C.surface, border: `1px solid ${goldDim}`, color: gold, borderRadius: 999, width: 46, height: 46, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >⏮</button>

                {/* Rewind 10s */}
                <button
                  onClick={() => { if (quranAudioRef.current) quranAudioRef.current.currentTime = Math.max(0, quranCurrentTime - 10); }}
                  title="-10 ثانية"
                  style={{ background: C.surface, border: `1px solid ${goldDim}`, color: gold, borderRadius: 999, width: 40, height: 40, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO }}
                >-10</button>

                {/* Play / Pause — shows spinner while loading */}
                <button
                  onClick={() => {
                    if (!quranAudioRef.current) return;
                    if (quranPlaying) {
                      quranAutoPlay.current = false;
                      quranAudioRef.current.pause();
                    } else {
                      quranAutoPlay.current     = true;
                      quranUsedFallback.current = false;  // allow fallback on fresh play attempt
                      setQuranAudioError(false);
                      setQuranLoading(true);
                      // Ensure src is set (re-apply in case it was cleared)
                      if (!quranAudioRef.current.src || quranAudioRef.current.src === window.location.href) {
                        quranAudioRef.current.src = qUrl(quranReciter, quranSurah);
                      }
                      // With preload="none", must call load() before play()
                      quranAudioRef.current.load();
                      // Don't show error here — onError handles fallback first, shows error only if both CDNs fail
                      quranAudioRef.current.play().catch(() => {});
                    }
                  }}
                  style={{ background: quranAudioError ? C.red : gold, border: "none", color: "#fff", borderRadius: 999, width: 68, height: 68, fontSize: quranLoading ? 18 : 28, cursor: "pointer", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 20px ${gold}44`, transition: "transform 0.1s", flexShrink: 0 }}
                >
                  {quranLoading ? "⌛" : quranPlaying ? "⏸" : "▶"}
                </button>

                {/* Forward 10s */}
                <button
                  onClick={() => { if (quranAudioRef.current && quranDuration) quranAudioRef.current.currentTime = Math.min(quranDuration, quranCurrentTime + 10); }}
                  title="+10 ثانية"
                  style={{ background: C.surface, border: `1px solid ${goldDim}`, color: gold, borderRadius: 999, width: 40, height: 40, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO }}
                >+10</button>

                {/* Next surah */}
                <button
                  onClick={() => {
                    const next = surahNum < 114 ? surahNum + 1 : 1;
                    quranWasPlaying.current = quranPlaying;
                    setQuranSurah(next);
                    localStorage.setItem("quran_surah", String(next));
                  }}
                  title="السورة التالية"
                  style={{ background: C.surface, border: `1px solid ${goldDim}`, color: gold, borderRadius: 999, width: 46, height: 46, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >⏭</button>
              </div>

              {/* ── Volume slider ── */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, direction: "ltr" }}>
                <span style={{ fontSize: 16 }}>{quranVolume === 0 ? "🔇" : quranVolume < 0.5 ? "🔉" : "🔊"}</span>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={quranVolume}
                  onChange={e => setQuranVolume(Number(e.target.value))}
                  style={{ flex: 1, accentColor: gold, cursor: "pointer" }}
                />
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, minWidth: 30 }}>{Math.round(quranVolume * 100)}%</span>
              </div>

              {/* ── Mode toggles ── */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", direction: "ltr", justifyContent: "center" }}>
                <button
                  onClick={() => setQuranRepeat(r => !r)}
                  style={{ background: quranRepeat ? `${gold}22` : C.surface, border: `1px solid ${quranRepeat ? gold : C.border}`, color: quranRepeat ? gold : C.textDim, borderRadius: 6, padding: "7px 14px", fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                >
                  🔂 <span>تكرار السورة</span>
                </button>
                <button
                  onClick={() => setQuranAutoNext(a => !a)}
                  style={{ background: quranAutoNext ? `${gold}22` : C.surface, border: `1px solid ${quranAutoNext ? gold : C.border}`, color: quranAutoNext ? gold : C.textDim, borderRadius: 6, padding: "7px 14px", fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                >
                  ▶▶ <span>تشغيل تلقائي</span>
                </button>
                <a
                  href={qUrl(quranReciter, surahNum)}
                  download={`${surahInfo?.[2] || surahNum}.mp3`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, padding: "7px 14px", fontFamily: MONO, fontSize: 10, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", gap: 5 }}
                >
                  ⬇ <span>تنزيل</span>
                </a>
              </div>

              {/* Audio error banner */}
              {quranAudioError && (
                <div style={{ marginTop: 14, background: themeMode === "dark" ? "#2a120a" : "#fff4f0", border: "1px solid #cc4400", borderRadius: 10, padding: "12px 14px", direction: "ltr", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "#ff6633" }}>⚠ تعذّر تشغيل الصوت — Audio unavailable</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: "#cc7755", marginTop: 4 }}>
                      {quranReciter.full
                        ? <>ملف الصوت غير متاح مؤقتاً — Audio file temporarily unavailable.<br/>Try a different surah or click RETRY.</>
                        : <>هذه السورة غير متوفرة لهذا القارئ — surah not available for this reciter.<br/>Switch to a ★ reciter (Al-Afasy or Maher Al-Muaiqly have all 114 surahs).</>
                      }
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      quranUsedFallback.current = false;
                      quranAutoPlay.current     = true;
                      setQuranAudioError(false);
                      setQuranLoading(true);
                      if (quranAudioRef.current) {
                        quranAudioRef.current.src = qUrl(quranReciter, surahNum);
                        quranAudioRef.current.load();
                        quranAudioRef.current.play().catch(() => {});
                      }
                    }}
                    style={{ background: "#cc4400", border: "none", color: "#fff", borderRadius: 5, padding: "8px 14px", fontFamily: MONO, fontSize: 9, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                  >RETRY</button>
                </div>
              )}
            </div>

            {/* ── Reciter selector ── */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.1em" }}>القارئ — RECITER</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>★ = مكتبة كاملة 114 سورة</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
                {QURAN_RECITERS.map(r => (
                  <button
                    key={r.id}
                    onClick={() => {
                      quranWasPlaying.current = quranPlaying;
                      setQuranReciter(r);
                      localStorage.setItem("quran_reciter", JSON.stringify(r));
                    }}
                    style={{
                      background: r.id === quranReciter.id ? `${gold}1a` : C.surface,
                      border: `1px solid ${r.id === quranReciter.id ? gold : C.border}`,
                      color: r.id === quranReciter.id ? gold : C.text,
                      borderRadius: 8, padding: "10px 12px", cursor: "pointer",
                      fontFamily: "Arial, sans-serif", fontSize: 13, textAlign: "right",
                      direction: "rtl", lineHeight: 1.4, transition: "background 0.12s",
                      position: "relative",
                    }}
                  >
                    {r.label}
                    {r.full && (
                      <span style={{ position: "absolute", top: 5, left: 7, fontFamily: MONO, fontSize: 9, color: r.id === quranReciter.id ? gold : "#c9a84c88", lineHeight: 1 }}>★</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Surah list (all 114, searchable) ── */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.1em" }}>
                  السور — ALL SURAHS ({filteredSurahs.length}/114)
                </div>
                <input
                  value={quranSearchQuery}
                  onChange={e => setQuranSearchQuery(e.target.value)}
                  placeholder="ابحث عن سورة  /  Search surah..."
                  style={{
                    border: `1px solid ${C.border}`, background: C.surface, color: C.text,
                    borderRadius: 6, padding: "7px 12px", fontFamily: "Arial, sans-serif", fontSize: 13,
                    outline: "none", width: 220, direction: "rtl",
                  }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 5, maxHeight: 400, overflowY: "auto", paddingRight: 4 }}>
                {filteredSurahs.map(([n, ar, en]) => {
                  const isActive = n === surahNum;
                  return (
                    <button
                      key={n}
                      onClick={() => {
                        quranWasPlaying.current = quranPlaying;
                        setQuranSurah(n);
                        localStorage.setItem("quran_surah", String(n));
                      }}
                      style={{
                        background: isActive ? `${gold}1e` : C.surface,
                        border: `1px solid ${isActive ? gold : C.border}`,
                        color: isActive ? gold : C.text,
                        borderRadius: 8, padding: "9px 8px",
                        cursor: "pointer", textAlign: "right", direction: "rtl",
                        transition: "background 0.1s",
                      }}
                    >
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, fontWeight: isActive ? 700 : 400 }}>{ar}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: isActive ? `${gold}bb` : C.textDim, marginTop: 2, direction: "ltr" }}>{n}. {en}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════ ATHAN TAB ══════════════════ */}
      {activeTab === "athan" && (() => {
        const gold = "#c9a84c";
        const PRAYER_NAMES = ["الفجر", "الشروق", "الظهر", "العصر", "المغرب", "العشاء"];
        const PRAYER_KEYS = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];
        const METHODS = [
          { id: 1, label: "University of Islamic Sciences, Karachi" },
          { id: 2, label: "Islamic Society of North America (ISNA)" },
          { id: 3, label: "Muslim World League" },
          { id: 4, label: "Umm Al-Qura University, Makkah" },
          { id: 5, label: "Egyptian General Authority" },
          { id: 9, label: "Kuwait" },
          { id: 11, label: "Qatar" },
          { id: 14, label: "Turkey" },
          { id: 15, label: "Singapore" },
        ];

        const loadByGeo = () => {
          if (!navigator.geolocation) { setAthanError("المتصفح لا يدعم تحديد الموقع"); return; }
          navigator.geolocation.getCurrentPosition(
            pos => { fetchPrayerTimes(pos.coords.latitude, pos.coords.longitude, null, null); },
            () => { setAthanError("رُفض إذن الموقع — أدخل المدينة يدوياً"); }
          );
        };

        // Parse "HH:MM" string to today's Date
        const parseTime = (str) => {
          if (!str) return null;
          const [h, m] = str.split(":").map(Number);
          const d = new Date(athanNow);
          d.setHours(h, m, 0, 0);
          return d;
        };

        const prayerTimes = PRAYER_KEYS.map((k, i) => ({
          key: k, name: PRAYER_NAMES[i],
          time: athanTimes ? parseTime(athanTimes[k]) : null,
          timeStr: athanTimes?.[k] || "—",
        }));

        const now = athanNow;
        const nextPrayer = prayerTimes.filter(p => p.key !== "Sunrise" && p.time && p.time > now).sort((a, b) => a.time - b.time)[0];
        const countdown = nextPrayer?.time ? Math.max(0, Math.floor((nextPrayer.time - now) / 1000)) : null;
        const cdH = countdown != null ? Math.floor(countdown / 3600) : 0;
        const cdM = countdown != null ? Math.floor((countdown % 3600) / 60) : 0;
        const cdS = countdown != null ? countdown % 60 : 0;

        return (
          <div dir="rtl" style={{ maxWidth: 780, margin: "0 auto" }}>
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 900, color: gold }}>أوقات الصلاة</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, direction: "ltr", marginTop: 4 }}>PRAYER TIMES</div>
            </div>

            {/* Date display */}
            <div style={{ background: C.card, border: `1px solid ${gold}44`, borderRadius: 12, padding: "12px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>{now.toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
                {athanHijri && <div style={{ fontSize: 12, color: gold, marginTop: 2 }}>{athanHijri.day} {athanHijri.month?.ar} {athanHijri.year} هـ</div>}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 18, color: C.text, fontWeight: 700, direction: "ltr" }}>
                {now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
            </div>

            {/* Next prayer countdown */}
            {nextPrayer && countdown != null && (
              <div style={{ background: `${gold}12`, border: `1px solid ${gold}66`, borderRadius: 12, padding: "16px 20px", marginBottom: 14, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: gold, marginBottom: 4 }}>الوقت المتبقي على {nextPrayer.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 900, color: gold, direction: "ltr" }}>
                  {String(cdH).padStart(2, "0")}:{String(cdM).padStart(2, "0")}:{String(cdS).padStart(2, "0")}
                </div>
              </div>
            )}

            {/* Prayer cards */}
            {athanTimes && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginBottom: 16 }}>
                {prayerTimes.map(p => {
                  const isNext = nextPrayer?.key === p.key;
                  const isPast = p.time && p.time < now;
                  return (
                    <div key={p.key} style={{ background: isNext ? `${gold}18` : C.card, border: `1px solid ${isNext ? gold : C.border}`, borderRadius: 10, padding: "14px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: isNext ? gold : C.text, fontFamily: "Arial, sans-serif", marginBottom: 6 }}>{p.name}</div>
                      <div style={{ fontFamily: MONO, fontSize: 14, color: isPast ? C.textDim : C.text, direction: "ltr" }}>{p.timeStr}</div>
                      {isNext && <div style={{ fontSize: 9, color: gold, fontFamily: MONO, marginTop: 4 }}>التالية</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {athanLoading && <div style={{ textAlign: "center", color: C.textDim, fontFamily: MONO, fontSize: 12, marginBottom: 14 }}>جاري تحميل أوقات الصلاة…</div>}
            {athanError && <div style={{ background: `${C.red}12`, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "10px 14px", color: C.red, fontSize: 13, marginBottom: 14 }}>{athanError}</div>}

            {/* Location + Settings */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 10 }}>الإعدادات</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <input value={athanCity} onChange={e => setAthanCity(e.target.value)} placeholder="المدينة (مثل: مكة)" dir="rtl"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "9px 10px", borderRadius: 6, fontSize: 13, fontFamily: "Arial, sans-serif" }}
                  onBlur={() => localStorage.setItem("athan_city", athanCity)} />
                <input value={athanCountry} onChange={e => setAthanCountry(e.target.value)} placeholder="الدولة (مثل: SA)" dir="rtl"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "9px 10px", borderRadius: 6, fontSize: 13, fontFamily: "Arial, sans-serif" }}
                  onBlur={() => localStorage.setItem("athan_country", athanCountry)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, marginBottom: 10 }}>
                <select value={athanMethod} onChange={e => { setAthanMethod(Number(e.target.value)); localStorage.setItem("athan_method", e.target.value); }}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "9px 10px", borderRadius: 6, fontSize: 12, fontFamily: "Arial, sans-serif" }} dir="rtl">
                  {METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <button onClick={loadByGeo}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.accent, borderRadius: 6, padding: "9px 12px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>
                  📍 موقعي
                </button>
                <button onClick={() => { if (athanCity && athanCountry) fetchPrayerTimes(null, null, athanCity, athanCountry); else loadByGeo(); }}
                  style={{ background: `${gold}18`, border: `1px solid ${gold}55`, color: gold, borderRadius: 6, padding: "9px 12px", fontFamily: MONO, fontSize: 10, cursor: "pointer", fontWeight: 700 }}>
                  تحديث
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textSec, cursor: "pointer" }}>
                  <input type="checkbox" checked={athanSoundOn} onChange={e => { setAthanSoundOn(e.target.checked); localStorage.setItem("athan_sound", e.target.checked ? "on" : "off"); }}
                    style={{ accentColor: gold }} />
                  تشغيل صوت الأذان
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: C.textSec }}>تنبيه قبل الصلاة:</span>
                  <select value={athanReminder} onChange={e => { setAthanReminder(Number(e.target.value)); localStorage.setItem("athan_reminder", e.target.value); }}
                    style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "4px 8px", borderRadius: 4, fontSize: 12, fontFamily: "Arial, sans-serif" }}>
                    <option value={5}>5 دقائق</option>
                    <option value={10}>10 دقائق</option>
                    <option value={15}>15 دقيقة</option>
                  </select>
                </div>
              </div>
            </div>
            {!athanTimes && !athanLoading && (
              <div style={{ textAlign: "center" }}>
                <button onClick={loadByGeo}
                  style={{ background: `${gold}18`, border: `1px solid ${gold}66`, color: gold, borderRadius: 10, padding: "14px 28px", fontFamily: "Arial, sans-serif", fontSize: 16, cursor: "pointer", fontWeight: 700 }}>
                  📍 اعرض أوقات الصلاة لموقعي
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ══════════════════ ATHKAR TAB ══════════════════ */}
      {activeTab === "athkar" && (() => {
        const gold = "#c9a84c";
        const CATEGORIES = [
          { id: "morning", label: "أذكار الصباح" },
          { id: "evening", label: "أذكار المساء" },
          { id: "afterPrayer", label: "أذكار بعد الصلاة" },
          { id: "sleep", label: "أذكار النوم" },
          { id: "istighfar", label: "الاستغفار" },
          { id: "salawat", label: "الصلاة على النبي" },
          { id: "duaa", label: "أدعية" },
        ];
        const catData = ATHKAR_DATA[athkarCategory];
        const saveProgress = (updated) => {
          setAthkarProgress(updated);
          try { localStorage.setItem("athkar_progress", JSON.stringify(updated)); } catch {}
        };
        const catItems = catData?.items || [];
        const allDone = catItems.every(item => (athkarProgress[item.id] || 0) >= item.count);

        return (
          <div dir="rtl" style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 900, color: gold }}>الأذكار</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, direction: "ltr", marginTop: 4 }}>ISLAMIC REMEMBRANCE</div>
            </div>

            {/* Category tabs */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setAthkarCategory(cat.id)}
                  style={{ border: `1px solid ${athkarCategory === cat.id ? gold : C.border}`, background: athkarCategory === cat.id ? `${gold}18` : C.surface, color: athkarCategory === cat.id ? gold : C.textSec, borderRadius: 20, padding: "6px 14px", fontFamily: "Arial, sans-serif", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {cat.label}
                </button>
              ))}
            </div>

            {allDone && (
              <div style={{ background: `${gold}14`, border: `1px solid ${gold}66`, borderRadius: 10, padding: "14px 16px", textAlign: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 18, color: gold, fontFamily: "Arial, sans-serif", fontWeight: 700 }}>✓ تم إكمال {catData.title}</div>
                <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>بارك الله فيك وتقبل منك</div>
                <button onClick={() => {
                  const reset = { ...athkarProgress };
                  catItems.forEach(item => { reset[item.id] = 0; });
                  saveProgress(reset);
                }} style={{ marginTop: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "6px 14px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>
                  إعادة
                </button>
              </div>
            )}

            {/* Dhikr items */}
            <div style={{ display: "grid", gap: 10 }}>
              {catItems.map(item => {
                const current = athkarProgress[item.id] || 0;
                const done = current >= item.count;
                const pct = Math.min(100, (current / item.count) * 100);
                return (
                  <div key={item.id} style={{ background: done ? `${gold}0a` : C.card, border: `1px solid ${done ? gold + "44" : C.border}`, borderRadius: 12, padding: "16px 14px", opacity: done ? 0.75 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: gold, fontFamily: MONO }}>{item.label}</div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: done ? gold : C.textSec }}>{current}/{item.count}</div>
                    </div>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 17, lineHeight: 2, color: C.text, textAlign: "right", marginBottom: 12, whiteSpace: "pre-wrap" }}>
                      {item.text}
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: 3, background: C.border, borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: done ? gold : C.accent, borderRadius: 2, transition: "width 0.2s" }} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => {
                          if (done) return;
                          const next = current + 1;
                          saveProgress({ ...athkarProgress, [item.id]: next });
                        }}
                        disabled={done}
                        style={{ flex: 1, background: done ? `${gold}18` : C.accent, border: "none", color: done ? gold : "#fff", borderRadius: 8, padding: "11px 0", fontFamily: "Arial, sans-serif", fontSize: 15, cursor: done ? "default" : "pointer", fontWeight: 700 }}>
                        {done ? "✓ مكتمل" : "عد — " + (item.count - current) + " متبقٍ"}
                      </button>
                      <button onClick={() => saveProgress({ ...athkarProgress, [item.id]: 0 })}
                        style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec, borderRadius: 8, padding: "11px 14px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>
                        إعادة
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ══════════════════ TASBIH TAB ══════════════════ */}
      {activeTab === "tasbih" && (() => {
        const gold = "#c9a84c";
        const effectiveTarget = tasbihCustomTarget ? Number(tasbihCustomTarget) : tasbihTarget;
        const pct = effectiveTarget > 0 ? Math.min(100, (tasbihCount / effectiveTarget) * 100) : 0;
        const done = tasbihCount >= effectiveTarget && effectiveTarget > 0;

        const doCount = () => {
          if (done) return;
          const next = tasbihCount + 1;
          setTasbihCount(next);
          localStorage.setItem("tasbih_count", String(next));
          if (next >= effectiveTarget) setTasbihCompleted(true);
        };

        const doReset = () => {
          setTasbihCount(0);
          setTasbihCompleted(false);
          localStorage.setItem("tasbih_count", "0");
        };

        return (
          <div dir="rtl" style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 900, color: gold }}>التسبيح</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, direction: "ltr", marginTop: 4 }}>DIGITAL TASBIH</div>
            </div>

            {/* Current dhikr */}
            <div style={{ background: C.card, border: `2px solid ${gold}44`, borderRadius: 20, padding: "28px 20px", marginBottom: 16 }}>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: 28, fontWeight: 900, color: gold, lineHeight: 1.7, marginBottom: 4 }}>
                {tasbihDhikr.text}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, direction: "ltr", marginBottom: 20 }}>
                {tasbihDhikr.transliteration}
              </div>

              {/* Big counter */}
              <div style={{ fontFamily: MONO, fontSize: 80, fontWeight: 900, color: done ? gold : C.text, lineHeight: 1, marginBottom: 8 }}>
                {tasbihCount}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, marginBottom: 20 }}>
                / {effectiveTarget}
              </div>

              {/* Progress ring-style bar */}
              <div style={{ height: 6, background: C.border, borderRadius: 3, marginBottom: 20, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: done ? gold : C.accent, borderRadius: 3, transition: "width 0.1s" }} />
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 20 }}>{pct.toFixed(1)}%</div>

              {/* Big tap button */}
              <button
                onClick={doCount}
                disabled={done}
                onKeyDown={e => { if (e.code === "Space") { e.preventDefault(); doCount(); } }}
                style={{ width: 180, height: 180, borderRadius: "50%", background: done ? `${gold}14` : `${gold}22`, border: `3px solid ${done ? gold : gold + "66"}`, color: gold, fontSize: 44, cursor: done ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", transition: "transform 0.08s, background 0.1s", boxShadow: done ? `0 0 40px ${gold}22` : "none" }}
                onMouseDown={e => { if (!done) e.currentTarget.style.transform = "scale(0.94)"; }}
                onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
              >
                {done ? "✓" : "☝"}
              </button>
            </div>

            {/* Completed message */}
            {(done || tasbihCompleted) && (
              <div style={{ background: `${gold}14`, border: `1px solid ${gold}66`, borderRadius: 12, padding: "16px 20px", marginBottom: 14 }}>
                <div style={{ fontSize: 18, color: gold, fontWeight: 700 }}>تم إكمال الذكر</div>
                <div style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>بارك الله فيك</div>
              </div>
            )}

            {/* Controls */}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
              <button onClick={doReset}
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec, borderRadius: 8, padding: "10px 22px", fontFamily: "Arial, sans-serif", fontSize: 14, cursor: "pointer" }}>
                إعادة
              </button>
              {tasbihCount > 0 && <div style={{ display: "flex", alignItems: "center", fontFamily: MONO, fontSize: 11, color: C.textDim }}>العدد الحالي: {tasbihCount}</div>}
            </div>

            {/* Dhikr selector */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 8 }}>الذكر</div>
              <div style={{ display: "grid", gap: 6 }}>
                {TASBIH_DHIKR.map(d => (
                  <button key={d.id} onClick={() => { setTasbihDhikr(d); doReset(); }}
                    style={{ background: tasbihDhikr.id === d.id ? `${gold}18` : C.surface, border: `1px solid ${tasbihDhikr.id === d.id ? gold : C.border}`, color: tasbihDhikr.id === d.id ? gold : C.text, borderRadius: 8, padding: "10px 14px", fontFamily: "Arial, sans-serif", fontSize: 15, cursor: "pointer", textAlign: "right" }}>
                    {d.text}
                  </button>
                ))}
              </div>
            </div>

            {/* Target selector */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 8 }}>الهدف</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 10 }}>
                {[33, 99, 100, 1000].map(t => (
                  <button key={t} onClick={() => { setTasbihTarget(t); setTasbihCustomTarget(""); }}
                    style={{ background: tasbihTarget === t && !tasbihCustomTarget ? `${gold}18` : C.surface, border: `1px solid ${tasbihTarget === t && !tasbihCustomTarget ? gold : C.border}`, color: tasbihTarget === t && !tasbihCustomTarget ? gold : C.text, borderRadius: 8, padding: "8px 16px", fontFamily: MONO, fontSize: 13, cursor: "pointer" }}>
                    {t}
                  </button>
                ))}
              </div>
              <input type="number" value={tasbihCustomTarget} onChange={e => setTasbihCustomTarget(e.target.value)} placeholder="هدف مخصص…"
                style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "9px 12px", borderRadius: 8, fontFamily: MONO, fontSize: 12, textAlign: "center" }} />
            </div>
          </div>
        );
      })()}

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

      {marketReportOpen && (
        <div onClick={() => setMarketReportOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.24)", zIndex: 1250, display: "grid", placeItems: "start center", paddingTop: "10vh" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 960, maxWidth: "94vw", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 24px 60px rgba(15,27,45,0.18)", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, fontWeight: 700 }}>MARKET OVERALL REPORT</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 2 }}>{marketReportGeneratedAt || "Now"}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    try { navigator.clipboard.writeText(marketReportText || ""); } catch {}
                  }}
                  style={{ border: `1px solid ${C.border}`, background: C.card, color: C.textSec, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  COPY
                </button>
                <button
                  onClick={() => setMarketReportOpen(false)}
                  style={{ border: `1px solid ${C.border}`, background: C.card, color: C.textSec, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  CLOSE
                </button>
              </div>
            </div>
            <div style={{ padding: 14, maxHeight: "72vh", overflow: "auto", background: C.bg }}>
              {!marketReportData ? (
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
                  {marketReportText || "No report yet. Click MARKET REPORT to generate."}
                </pre>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 8 }}>EXECUTIVE BRIEF</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      <span style={{ background: `${marketReportData.verdict === "BULLISH" ? C.green : marketReportData.verdict === "BEARISH" ? C.red : C.amber}14`, border: `1px solid ${marketReportData.verdict === "BULLISH" ? C.green : marketReportData.verdict === "BEARISH" ? C.red : C.amber}55`, color: marketReportData.verdict === "BULLISH" ? C.green : marketReportData.verdict === "BEARISH" ? C.red : C.amber, borderRadius: 999, padding: "4px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 900 }}>
                        {marketReportData.verdict}
                      </span>
                      <span style={{ background: `${C.accent}12`, border: `1px solid ${C.accent}44`, color: C.accent, borderRadius: 999, padding: "4px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 800 }}>
                        SCORE {marketReportData.marketScore}/100
                      </span>
                      <span style={{ background: `${C.purple}12`, border: `1px solid ${C.purple}44`, color: C.purple, borderRadius: 999, padding: "4px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 800 }}>
                        CONVICTION {marketReportData.conviction}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: C.textSec, marginBottom: 5 }}><b>1D projection:</b> {marketReportData.projection1d}</div>
                    <div style={{ fontSize: 12, color: C.textSec, marginBottom: 5 }}><b>1W projection:</b> {marketReportData.projection1w}</div>
                    <div style={{ fontSize: 12, color: C.textSec }}><b>Macro vs Stocks/Crypto:</b> {marketReportData.macroVsStocksCrypto}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, marginBottom: 8 }}>DECISION MATRIX</div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}>
                        <b>Probabilities:</b>{" "}
                        <span style={{ color: C.green, fontWeight: 800 }}>Bull {marketReportData.scenario?.bull ?? 0}%</span>{" | "}
                        <span style={{ color: C.amber, fontWeight: 800 }}>Base {marketReportData.scenario?.base ?? 0}%</span>{" | "}
                        <span style={{ color: C.red, fontWeight: 800 }}>Bear {marketReportData.scenario?.bear ?? 0}%</span>
                      </div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}>
                        <b>Alignment score:</b>{" "}
                        <span style={{ color: (marketReportData.alignmentScore || 0) >= 65 ? C.green : (marketReportData.alignmentScore || 0) >= 45 ? C.amber : C.red, fontWeight: 800 }}>
                          {marketReportData.alignmentScore || 0}/100
                        </span>
                      </div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}>
                        <b>Macro risk count:</b>{" "}
                        <span style={{ color: (marketReportData.macroRiskCount || 0) >= 4 ? C.red : (marketReportData.macroRiskCount || 0) >= 2 ? C.amber : C.green, fontWeight: 800 }}>
                          {marketReportData.macroRiskCount || 0}
                        </span>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <b>Sector breadth:</b>{" "}
                        <span style={{ color: C.green, fontWeight: 700 }}>{marketReportData.sectorBreadth?.positive ?? 0} positive</span>{" / "}
                        <span style={{ color: C.red, fontWeight: 700 }}>{marketReportData.sectorBreadth?.negative ?? 0} negative</span>
                      </div>
                    </div>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.purple, marginBottom: 8 }}>EVENT WINDOW + TRIGGERS</div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}>
                        <b>Next events:</b>{" "}
                        {(marketReportData.eventWindow || []).join(" | ") || "No immediate high-impact events"}
                      </div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}>
                        <b>Turn bullish if:</b> {marketReportData.flipBullTrigger}
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <b>Turn bearish if:</b> {marketReportData.flipBearTrigger}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.green, marginBottom: 8 }}>DO NOW</div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {(marketReportData.doNow || []).map((x, i) => (
                          <div key={`do-${i}`} style={{ fontSize: 12, color: C.textSec }}>• {x}</div>
                        ))}
                      </div>
                    </div>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.red, marginBottom: 8 }}>AVOID NOW</div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {(marketReportData.avoidNow || []).map((x, i) => (
                          <div key={`avoid-${i}`} style={{ fontSize: 12, color: C.textSec }}>• {x}</div>
                        ))}
                      </div>
                    </div>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.amber, marginBottom: 8 }}>WATCH NOW</div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {(marketReportData.watchNow || []).map((x, i) => (
                          <div key={`watch-${i}`} style={{ fontSize: 12, color: C.textSec }}>• {x}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, marginBottom: 8 }}>PORTFOLIO ACTION</div>
                      <div style={{ fontSize: 12, color: C.textSec, marginBottom: 8 }}>
                        {marketReportData.portfolioAction}
                      </div>
                      <div style={{ fontSize: 12, color: C.textSec }}>
                        <b>Daily risk budget:</b>{" "}
                        <span style={{ fontWeight: 800, color: C.amber }}>{formatNum(marketReportData.dailyRiskBudget || 0)}</span>
                      </div>
                    </div>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.purple, marginBottom: 8 }}>CRYPTO REGIME</div>
                      <div style={{ fontSize: 12, color: C.textSec }}>
                        {marketReportData.cryptoRegimeNote}
                      </div>
                    </div>
                  </div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.cyan, marginBottom: 8 }}>TRADINGVIEW QUICK LINKS</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {(marketReportData.tradingViewLinks || []).map((x, i) => (
                        <a
                          key={`tv-link-${x.symbol}-${i}`}
                          href={x.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            textDecoration: "none",
                            background: `${C.accent}12`,
                            border: `1px solid ${C.accent}44`,
                            color: C.accent,
                            borderRadius: 999,
                            padding: "5px 10px",
                            fontFamily: MONO,
                            fontSize: 11,
                            fontWeight: 800
                          }}
                        >
                          {x.symbol}
                        </a>
                      ))}
                      {!marketReportData.tradingViewLinks?.length && (
                        <span style={{ fontSize: 12, color: C.textDim }}>No chart links available yet.</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.green, marginBottom: 8 }}>LONG IDEAS</div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {(marketReportData.longIdeas || []).map((x, i) => (
                          <div key={`li-${i}`} style={{ fontSize: 12, color: C.textSec }}>- {x}</div>
                        ))}
                        {!marketReportData.longIdeas?.length && <div style={{ fontSize: 12, color: C.textDim }}>No clean long ideas right now.</div>}
                      </div>
                    </div>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.red, marginBottom: 8 }}>SHORT / HEDGE IDEAS</div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {(marketReportData.shortIdeas || []).map((x, i) => (
                          <div key={`si-${i}`} style={{ fontSize: 12, color: C.textSec }}>- {x}</div>
                        ))}
                        {!marketReportData.shortIdeas?.length && <div style={{ fontSize: 12, color: C.textDim }}>No clear short ideas right now.</div>}
                      </div>
                    </div>
                  </div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.cyan, marginBottom: 8 }}>CONFIDENCE DRIVERS</div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {(marketReportData.confidenceDrivers || []).map((d, i) => (
                        <div key={`cd-${i}`} style={{ fontSize: 12, color: d.tone === "green" ? C.green : C.red }}>
                          <b>{d.tone === "green" ? "GREEN" : "RED"}:</b> {d.text}
                        </div>
                      ))}
                      {!marketReportData.confidenceDrivers?.length && <div style={{ fontSize: 12, color: C.textDim }}>No clear confidence drivers yet.</div>}
                    </div>
                  </div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, marginBottom: 8 }}>MARKET OVERVIEW</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ background: `${C.accent}12`, border: `1px solid ${C.accent}33`, color: C.accent, borderRadius: 999, padding: "4px 10px", fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>Session {marketReportData.session}</span>
                      <span style={{ background: `${marketReportData.regime === "Risk-On" ? C.green : marketReportData.regime === "Risk-Off" ? C.red : C.amber}12`, border: `1px solid ${marketReportData.regime === "Risk-On" ? C.green : marketReportData.regime === "Risk-Off" ? C.red : C.amber}33`, color: marketReportData.regime === "Risk-On" ? C.green : marketReportData.regime === "Risk-Off" ? C.red : C.amber, borderRadius: 999, padding: "4px 10px", fontFamily: MONO, fontSize: 11, fontWeight: 800 }}>Regime {marketReportData.regime}</span>
                      <span style={{ background: `${C.purple}12`, border: `1px solid ${C.purple}33`, color: C.purple, borderRadius: 999, padding: "4px 10px", fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>Tone {marketReportData.macroTone}</span>
                    </div>
                  </div>

                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.cyan, marginBottom: 8 }}>INDEX + MACRO SNAPSHOT</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {(marketReportData.indexRows || []).map((r) => {
                        const positive = r.invert ? r.value <= 0 : r.value >= 0;
                        const tone = positive ? C.green : C.red;
                        return (
                          <span key={`idx-${r.label}`} style={{ background: positive ? C.greenBg : C.redBg, border: `1px solid ${tone}33`, color: tone, borderRadius: 999, padding: "4px 10px", fontFamily: MONO, fontSize: 11, fontWeight: 800 }}>
                            {r.label} {r.value >= 0 ? "+" : ""}{r.value.toFixed(2)}%
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.green, marginBottom: 8 }}>BREADTH + LEADERSHIP</div>
                      <div style={{ fontSize: 12, color: C.textSec, marginBottom: 8 }}><b>Breadth:</b> {marketReportData.breadth.advancers} advancers / {marketReportData.breadth.decliners} decliners ({marketReportData.breadth.breadthPct}% positive)</div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}><b>Top gainers:</b> {(marketReportData.topGainers || []).map((q) => <span key={`g-${q.symbol}`} style={{ color: C.green, fontWeight: 700, marginRight: 8 }}>{q.symbol} {q.changesPercentage >= 0 ? "+" : ""}{Number(q.changesPercentage || 0).toFixed(2)}%</span>)}</div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}><b>Top losers:</b> {(marketReportData.topLosers || []).map((q) => <span key={`l-${q.symbol}`} style={{ color: C.red, fontWeight: 700, marginRight: 8 }}>{q.symbol} {Number(q.changesPercentage || 0).toFixed(2)}%</span>)}</div>
                      <div style={{ fontSize: 12 }}><b>Sector leaders:</b> {(marketReportData.sectorLeaders || []).map((s) => <span key={`sl-${s.symbol}`} style={{ color: C.green, fontWeight: 700, marginRight: 8 }}>{s.symbol} {Number(s.changesPercentage || 0) >= 0 ? "+" : ""}{Number(s.changesPercentage || 0).toFixed(2)}%</span>)}</div>
                    </div>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.red, marginBottom: 8 }}>RISK + FLOW + ALERTS</div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}><b>Macro green:</b> {(marketReportData.macroGreen || []).join(" | ") || "None"}</div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}><b>Macro red:</b> {(marketReportData.macroRed || []).join(" | ") || "None"}</div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}><b>Flow bias:</b> <span style={{ color: marketReportData.flowBias === "CALL BIAS" ? C.green : marketReportData.flowBias === "PUT BIAS" ? C.red : C.amber, fontWeight: 800 }}>{marketReportData.flowBias}</span></div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}><b>Call vs Put:</b> <span style={{ color: C.green, fontWeight: 700 }}>{formatNum(marketReportData.flowCallNotional)}</span> / <span style={{ color: C.red, fontWeight: 700 }}>{formatNum(marketReportData.flowPutNotional)}</span></div>
                      <div style={{ fontSize: 12 }}><b>Priority alerts:</b> {(marketReportData.priAlerts || []).map((a, idx) => <span key={`a-${idx}`} style={{ color: C.amber, fontWeight: 800, marginRight: 8 }}>{a.symbol}({a.score})</span>)}</div>
                    </div>
                  </div>

                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.purple, marginBottom: 8 }}>NEWS + EXECUTION FOCUS</div>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>
                      <b>Upgrades:</b> <span style={{ color: C.green, fontWeight: 800 }}>{marketReportData.upgradesCount}</span> | <b>Downgrades:</b> <span style={{ color: C.red, fontWeight: 800 }}>{marketReportData.downgradesCount}</span>
                    </div>
                    <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
                      {(marketReportData.headlines || []).map((n, i) => (
                        <div key={`h-${i}`} style={{ fontSize: 12, color: C.textSec }}>
                          <span style={{ fontFamily: MONO, color: C.accent, fontWeight: 700 }}>{i + 1}. {n.ticker || "MKT"}</span> - <span style={{ fontWeight: 600 }}>{n.title || "Headline unavailable"}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 6 }}>
                      <b>Rotation leaders:</b> {(marketReportData.rotationTop || []).map((q) => (
                        <span key={`r-${q.symbol}`} style={{ marginRight: 8 }}>
                          <span style={{ fontWeight: 800 }}>{q.symbol}</span>
                          <span style={{ color: Number(q.relVsSpy || 0) >= 0 ? C.green : C.red, fontWeight: 700 }}> RS {Number(q.relVsSpy || 0) >= 0 ? "+" : ""}{Number(q.relVsSpy || 0).toFixed(2)}%</span>
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 6 }}>
                      <b>Earnings watch:</b> {(marketReportData.earningsWatch || []).map((e, idx) => {
                        const isUpcoming = Number.isFinite(e.dayDiff) && e.dayDiff >= 0 && e.dayDiff <= 7;
                        const tone = isUpcoming ? C.amber : C.textSec;
                        return (
                          <span key={`earn-${idx}`} style={{ marginRight: 8, color: tone }}>
                            <span style={{ fontWeight: 800 }}>{e.symbol}</span> {e.timing}
                          </span>
                        );
                      })}
                      {!marketReportData.earningsWatch?.length && <span style={{ color: C.textDim }}> No earnings dates available.</span>}
                    </div>
                    <div style={{ fontSize: 12, color: C.textSec }}><b>Posture:</b> <span style={{ fontWeight: 700 }}>{marketReportData.posture}</span></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {paletteOpen && (
        <div onClick={() => setPaletteOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.18)", zIndex: 1200, display: "grid", placeItems: "start center", paddingTop: "14vh" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: "92vw", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 24px 60px rgba(15,27,45,0.18)" }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 8 }}>AXIOM COMMAND PALETTE (GO)</div>
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
                <button key={cmd} onClick={() => { runPaletteCommand(cmd); setPaletteOpen(false); setPaletteInput(""); }} style={{ textAlign: "left", border: `1px solid ${C.border}`, background: C.card, borderRadius: 6, padding: "8px 10px", cursor: "pointer", fontFamily: MONO, fontSize: 11, color: C.textSec }}>
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedStock && (
        <DeepDive
          stock={selectedStock}
          fundamentals={selectedFundamentals}
          onClose={() => setSelectedStock(null)}
          onExit={() => { setSelectedStock(null); setActiveTab("dashboard"); }}
          onOpenTradingView={openTradingView}
        />
      )}

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
              { section: "NAVIGATION" },
              { key: "Click any watchlist row", desc: "Open in terminal" },
              { key: "TV button", desc: "Open TradingView chart" },
              { key: "WS button", desc: "Open Workstation" },
              { key: "LOG button", desc: "Log trade to journal" },
            ].map((item, i) => item.section
              ? <div key={i} style={{ fontFamily: MONO, fontSize: 9, color: C.accent, letterSpacing: "0.12em", fontWeight: 700, marginTop: i > 0 ? 14 : 0, marginBottom: 6 }}>{item.section}</div>
              : <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                  <kbd style={{ fontFamily: MONO, fontSize: 11, background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 8px", color: C.text }}>{item.key}</kbd>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: C.textSec }}>{item.desc}</span>
                </div>
            )}
            <div style={{ marginTop: 16, fontFamily: MONO, fontSize: 10, color: C.textDim, textAlign: "center" }}>
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
                <span style={{ fontFamily: MONO, fontSize: 11, color: quickLogModal.chg >= 0 ? C.green : C.red, marginLeft: 8, fontWeight: 700 }}>{quickLogModal.chg >= 0 ? "+" : ""}{quickLogModal.chg.toFixed(2)}%</span>
                {quickLogModal.score > 0 && <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginLeft: 10 }}>Score {Math.round(quickLogModal.score)}</span>}
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
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
                  <input type="number" step={step || "0.01"} value={quickLogModal[key]}
                    onChange={e => setQuickLogModal(m => ({ ...m, [key]: e.target.value }))}
                    style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "6px 8px", fontFamily: MONO, fontSize: 12, color: C.text, outline: "none" }} />
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
                  <div style={{ fontFamily: MONO, fontSize: 10, color: rr >= 2 ? C.green : rr >= 1 ? C.amber : C.red, textAlign: "right", marginBottom: 10, fontWeight: 700 }}>
                    R:R {rr.toFixed(1)}:1 {rr >= 2 ? "✓" : rr >= 1 ? "~" : "✗"}
                  </div>
                );
              }
              return <div style={{ marginBottom: 10 }} />;
            })()}

            {/* Timeframe + Style */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>TIMEFRAME</div>
                <select value={quickLogModal.timeframe} onChange={e => setQuickLogModal(m => ({ ...m, timeframe: e.target.value }))}
                  style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "6px 8px", fontFamily: MONO, fontSize: 12, color: C.text }}>
                  {["1m","5m","15m","1H","4H","1D","1W"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>STYLE</div>
                <select value={quickLogModal.style} onChange={e => setQuickLogModal(m => ({ ...m, style: e.target.value }))}
                  style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "6px 8px", fontFamily: MONO, fontSize: 12, color: C.text }}>
                  {["Breakout","Pullback","Reversal","Momentum","Scalp","Swing","Watchlist"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>NOTES</div>
              <textarea rows={2} value={quickLogModal.notes} onChange={e => setQuickLogModal(m => ({ ...m, notes: e.target.value }))}
                style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "6px 8px", fontFamily: MONO, fontSize: 11, color: C.text, resize: "none", outline: "none" }} />
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
                style={{ border: `1px solid ${C.border}`, background: C.card, color: C.textSec, borderRadius: 5, padding: "11px 12px", fontFamily: MONO, fontSize: 11, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
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

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
        @keyframes axiomTickerLTR { 0% { transform: translateX(-55%); } 100% { transform: translateX(100%); } }
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


