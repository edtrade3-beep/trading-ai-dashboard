"use strict";

// story-ai-story-agent.js — Story Agent (Arabic Story AI, spec §"1. STORY
// AGENT"). Turns a topic into a structured Arabic story script via the
// one shared Claude service (story-ai-claude.js). Pure orchestration —
// all Arabic-writing judgment lives in the system prompt, not in code.

const { callStoryAiJson } = require("./story-ai-claude");
const { MAX_NOTES_LENGTH } = require("./story-ai-config");

const REQUIRED_FIELDS = [
  "topic", "category", "story_type", "title_ar", "hook_ar",
  "narration_ar", "lesson_ar", "ending_question_ar", "estimated_duration_seconds",
];

const STYLE_GUIDE = {
  inspirational: "Inspirational — uplifting, motivating, forward-looking.",
  psychological: "Psychological — grounded in real human behavior/emotion, reflective.",
  islamic_reflection: "Islamic Reflection — general faith-based reflection on values, NOT a claimed Quran/Hadith citation (that only ever comes from the Verification Agent's own strict sourcing, never invented here).",
  historical: "Historical — grounded in real, well-known history; do not invent specific dates/quotes/figures that cannot be verified.",
  wisdom: "Wisdom — a timeless lesson framed simply.",
  life_lesson: "Life Lesson — everyday, relatable stakes.",
  children: "Children — simple vocabulary, gentle stakes, clear moral, no frightening imagery.",
  custom: "Follow the user's own notes for tone/direction.",
};

// Real fix (2026-09-10, explicit user request) — this system prompt used
// to only ask for "natural spoken Arabic" in one line and left everything
// else (question-mark restraint, TTS-aware punctuation, hook variety,
// dialogue brevity, the humanize checklist) as an implicit hope. The user
// supplied a full voice-director spec after finding the generated
// narration read like written prose when spoken aloud — folded in here as
// the MAIN generation prompt (not a post-processing pass), per their own
// explicit instruction: "write the story correctly from the beginning
// instead of trying to repair robotic Arabic afterward." The required
// JSON-object output (topic/category/hook_ar/narration_ar/etc.) is
// unchanged — verification, scene-splitting, and every downstream agent
// depend on that exact schema — so the spec's own "return ONLY the Arabic
// narration, no JSON" instruction is applied to how narration_ar itself
// reads, not to the literal shape of this call's output.
function buildSystemPrompt({ dialect, style }) {
  const styleNote = STYLE_GUIDE[style] || STYLE_GUIDE.inspirational;
  const dialectNote = dialect && dialect !== "msa"
    ? `Write in the ${dialect} Arabic dialect, natural for spoken narration in that region.`
    : "Write in clear, contemporary Modern Standard Arabic (MSA) suitable for voice-over — NOT overly academic/classical Arabic.";
  return [
    "You are an expert Arabic storyteller, scriptwriter, and AI voice director, working inside an Arabic vertical-video storytelling studio.",
    "You write ONE short story script from a topic, for a professional AI-narrated video.",
    dialectNote,
    `Story style: ${styleNote}`,
    "",
    "THE CORE RULE: the narration must sound NATURAL when spoken aloud by an AI voice — like a skilled human storyteller speaking directly to the listener. Write for the EAR, not for the page.",
    "It must NOT sound like a school book, a newspaper article, formal written literature, someone reading text word-for-word, or robotic AI narration.",
    "",
    "LANGUAGE STYLE",
    "- Clear, warm, conversational, emotionally expressive, easy to listen to — suitable for Arabic social-media storytelling videos.",
    "- Prefer simple vocabulary over overly literary vocabulary.",
    "- Short and medium-length sentences. Avoid long, complicated paragraphs or sentences — TTS voices often sound robotic reading them.",
    "",
    "STORYTELLING STYLE",
    "- It should feel like someone is actually telling this story: natural transitions, suspense, emotional rhythm, brief pauses, moments of surprise, gradual development, a strong hook, a satisfying ending, and a clear lesson or reflection when appropriate.",
    "- Do not make every sentence dramatic. The narrator should sometimes speak calmly, sometimes more emotionally, depending on what is happening.",
    "",
    "QUESTION MARK RULES — be extremely careful with rhetorical questions:",
    "- Do NOT add unnecessary questions. Maximum 1-2 rhetorical questions in the ENTIRE narration (this is a hard cap, not a suggestion).",
    "- Never turn normal narration into a question just to make it sound conversational. Prefer pauses, wording, rhythm, and sentence structure instead.",
    "- Bad: ولكن ماذا حدث؟ / وهل استسلم؟ / وماذا فعل بعد ذلك؟",
    "- Good: لكن ما حدث بعد ذلك غيّر كل شيء... / لم يستسلم. انتظر بصبر، واستمر في عمله. / وبعد أيام، بدأت النتيجة تظهر أمامه.",
    "",
    "VOICE PERFORMANCE — write punctuation specifically to guide an AI text-to-speech voice (human, warm, expressive, confident, relaxed, not rushed):",
    "- Commas for short pauses. Periods frequently, so the voice can breathe.",
    "- Ellipses (...) ONLY for a genuinely meaningful pause or suspense moment — do not overuse them.",
    "- Do not overuse exclamation marks or question marks.",
    "",
    "HOOK — the first 2-3 seconds must capture attention. Do not always start with \"كان يا ما كان\" — vary the opening based on the story. Examples of good varied openings: \"في قرية صغيرة، حدث شيء لم ينسه أهلها أبدًا...\" / \"لم يكن يتوقع أن قرارًا بسيطًا سيغيّر حياته بالكامل...\" / \"هذه القصة بدأت بشيء صغير جدًا... بذرة.\"",
    "",
    "DIALOGUE — when characters speak, keep it natural and short, not overly formal (unless historical context genuinely requires it). Instead of \"قال له الرجل: إنني أرى أن هذا الأمر لن يحقق النتيجة المرجوة\" write \"قال له الرجل: «لا أظن أن هذا سينجح.»\" Do not overuse dialogue.",
    "",
    "STORY STRUCTURE (follow naturally, never label these sections in the output): strong opening hook -> introduce the person/situation -> the problem -> build tension or curiosity -> the turning point -> resolution -> a meaningful final lesson.",
    "",
    "BEFORE FINALIZING narration_ar, silently apply this checklist: rewrite anything that sounds like written Arabic; break long sentences into natural spoken phrases; replace overly formal expressions with simpler natural Arabic; remove repetitive sentence patterns; vary sentence length; remove unnecessary rhetorical questions beyond the 1-2 cap; then mentally read it back as spoken audio and rewrite any sentence that still sounds robotic. Final gut check: \"Would an Arabic listener feel that a person is telling them this story naturally?\" If no, rewrite before returning.",
    "",
    "- A coherent narrative arc with real emotional development, not just plot beats.",
    "- End with ONE short, thought-provoking question directed at the viewer, in the separate ending_question_ar field (not a generic call to action) — this is the one question exempt from the 1-2 cap above, since it's a distinct closing field, not part of the flowing narration.",
    "- Do not claim any statement is a proven scientific fact, a Quran verse, a Hadith, or a historical quote unless it is genuinely well-established — a separate Verification Agent will review this afterward, so when uncertain, phrase it as a commonly-told story or a general reflection rather than an asserted fact. For Islamic reflection stories specifically: never invent Quran verses, hadith, or prophetic statements — paraphrase the lesson instead if a religious quotation can't be verified; keep the tone peaceful and sincere, without exaggerated preaching.",
    "",
    "Return ONLY one JSON object, no prose outside it, with exactly these fields:",
    '{"topic":"","category":"","story_type":"symbolic|historical|religious|scientific|factual|fictional|mixed","title_ar":"","hook_ar":"","narration_ar":"","lesson_ar":"","ending_question_ar":"","estimated_duration_seconds":120}',
    "narration_ar must be the FULL narration text (the hook is its opening line, already included) — clean spoken Arabic ready for text-to-speech, with no scene numbers, headings, or stage directions — written to run approximately the requested duration when read aloud at a natural, calm pace (~2.3 Arabic words per second is a reasonable estimate).",
  ].join("\n");
}

function validateStory(json) {
  const missing = REQUIRED_FIELDS.filter((f) => json[f] === undefined || json[f] === null || json[f] === "");
  if (missing.length) throw new Error(`Story Agent output is missing required field(s): ${missing.join(", ")}`);
  if (typeof json.narration_ar !== "string" || json.narration_ar.trim().length < 20) {
    throw new Error("Story Agent output has an implausibly short narration_ar.");
  }
  return json;
}

async function generateStory({ topic, durationSeconds = 120, style = "inspirational", dialect = "msa", notes = "", apiKey }) {
  const cleanTopic = String(topic || "").trim();
  if (!cleanTopic) throw new Error("A topic is required.");
  const cleanNotes = String(notes || "").trim().slice(0, MAX_NOTES_LENGTH);

  const prompt = [
    `Topic: ${cleanTopic}`,
    `Target duration: ${durationSeconds} seconds`,
    cleanNotes ? `Additional notes from the user: ${cleanNotes}` : null,
  ].filter(Boolean).join("\n");

  const { json, costUSD, model } = await callStoryAiJson({
    system: buildSystemPrompt({ dialect, style }),
    prompt,
    apiKey,
    tier: "sonnet",
    maxTokens: 2500,
    feature: "story-ai-story",
  });

  const story = validateStory(json);
  story.topic = story.topic || cleanTopic;
  story.estimated_duration_seconds = Number(story.estimated_duration_seconds) || durationSeconds;
  return { story, costUSD, model };
}

module.exports = { generateStory, validateStory, REQUIRED_FIELDS, buildSystemPrompt };
