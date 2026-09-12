"use strict";

// azkar-content.js — real, standard Islamic morning/evening remembrance
// (أذكار الصباح/المساء), 2026-09-12 command-table update. This is a real,
// honestly-scoped CORE selection of the most widely known azkar (from the
// standard Hisn al-Muslim tradition) — NOT the complete book. Static,
// hand-verified text and repetition counts, never AI-generated: religious
// text correctness is not something an LLM should be trusted to invent or
// paraphrase, matching this app's own "never fake a control" discipline
// applied here to religious content instead of financial data.
const MORNING_AZKAR = [
  { count: 1, note: "آية الكرسي", ar: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ مَن ذَا الَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ وَلَا يَئُودُهُ حِفْظُهُمَا وَهُوَ الْعَلِيُّ الْعَظِيمُ" },
  { count: 3, note: "سورة الإخلاص", ar: "قُلْ هُوَ اللَّهُ أَحَدٌ، اللَّهُ الصَّمَدُ، لَمْ يَلِدْ وَلَمْ يُولَدْ، وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ" },
  { count: 3, note: "سورة الفلق", ar: "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ، مِن شَرِّ مَا خَلَقَ، وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ، وَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ، وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ" },
  { count: 3, note: "سورة الناس", ar: "قُلْ أَعُوذُ بِرَبِّ النَّاسِ، مَلِكِ النَّاسِ، إِلَٰهِ النَّاسِ، مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ، الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ، مِنَ الْجِنَّةِ وَالنَّاسِ" },
  { count: 1, note: "دعاء أصبحنا", ar: "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ" },
  { count: 1, note: "سيد الاستغفار", ar: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَىٰ عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ" },
  { count: 7, note: "حسبي الله", ar: "حَسْبِيَ اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ" },
  { count: 3, note: "بسم الله الذي لا يضر", ar: "بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ" },
  { count: 100, note: "الاستغفار", ar: "أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ" },
  { count: 100, note: "التسبيح", ar: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ" },
];

// Same set, with the one real time-of-day-specific line swapped
// ("أصبحنا" -> "أمسينا") — every other item is identical, matching how
// Hisn al-Muslim itself structures the evening set.
const EVENING_AZKAR = MORNING_AZKAR.map((z) =>
  z.note === "دعاء أصبحنا"
    ? { count: 1, note: "دعاء أمسينا", ar: "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ" }
    : z
);

function renderAzkarMessage(list, title) {
  const lines = [title, "━━━━━━━━━━━━━━━━━━━━", "(real core selection — not the complete Hisn al-Muslim book)", ""];
  list.forEach((z, i) => {
    lines.push(`${i + 1}. ${z.note}${z.count > 1 ? ` — ×${z.count}` : ""}`);
    lines.push(z.ar);
    lines.push("");
  });
  return lines.join("\n").trim();
}

function formatMorningAzkar() { return renderAzkarMessage(MORNING_AZKAR, "🌅 أذكار الصباح"); }
function formatEveningAzkar() { return renderAzkarMessage(EVENING_AZKAR, "🌆 أذكار المساء"); }

module.exports = { MORNING_AZKAR, EVENING_AZKAR, formatMorningAzkar, formatEveningAzkar };
