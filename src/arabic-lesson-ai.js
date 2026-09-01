// arabic-lesson-ai.js — "LEARN SOMETHING NEW": generates one fresh Arabic
// lesson for the Coach. Topics rotate across trading, money, discipline,
// psychology, faith, family. Extracted from routes/market.js (2026-09-01
// audit fix #5b).
"use strict";
const { callAnthropicApi, MODELS } = require("./anthropic");

const TOPICS = ["تداول وأسواق", "إدارة المال والمخاطر", "الانضباط والعادات",
  "علم النفس وضبط العواطف", "الحكمة والإيمان", "القيادة والشخصية القوية", "الأب والزوج"];

const SYSTEM = `أنت مدرّب نخبة يكتب درساً واحداً جديداً ومفيداً باللغة العربية الفصحى. الدرس قصير وعميق وعملي. أعِد JSON فقط بهذا الشكل بالضبط، بلا أي نص خارج الـ JSON:
{"title":"عنوان قصير","teach":"شرح من 2-3 جمل يعلّم الفكرة بعمق","deep":"جملة أو جملتان تضيفان بُعداً أعمق أو مثالاً","practice":"تمرين عملي واحد يُطبَّق اليوم","mantra":"جملة واحدة تُحفظ وتُردَّد"}`;

async function generateLesson(recentTitles, key) {
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  const prompt = `اكتب درساً جديداً في موضوع: ${topic}.${recentTitles.length ? ` تجنّب تكرار هذه العناوين السابقة: ${recentTitles.join("، ")}.` : ""} أعِد JSON فقط.`;
  const raw = await callAnthropicApi(prompt, key, { model: MODELS.haiku, maxTokens: 500, system: SYSTEM, cache: true });
  let lesson;
  try {
    const m = (raw || "").match(/\{[\s\S]*\}/);
    lesson = JSON.parse(m ? m[0] : raw);
  } catch {
    throw new Error("could not parse lesson");
  }
  return { lesson, topic };
}

module.exports = { generateLesson };
