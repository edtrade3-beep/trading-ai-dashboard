"use strict";

// story-ai-social-agent.js — Social Metadata Agent (spec §"SOCIAL
// OUTPUT" + "THUMBNAIL"). Arabic-first titles/captions/hashtags per
// platform, plus a short thumbnail text suggestion. Same shared Claude
// service as every other Story AI agent.

const { callStoryAiJson } = require("./story-ai-claude");

const SYSTEM_PROMPT = [
  "You are the Social Metadata Agent inside an Arabic storytelling video studio.",
  "Given a finished story, write Arabic-first social metadata for publishing a vertical short video.",
  "Keep every caption punchy and native to how creators actually write in Arabic on these platforms — not a translated announcement.",
  "Thumbnail text must be SHORT (3-6 Arabic words max) and create curiosity, never spoiling the ending.",
  "",
  "Return ONLY one JSON object, no prose outside it:",
  '{"youtube_title_ar":"","instagram_caption_ar":"","tiktok_caption_ar":"","facebook_caption_ar":"","hashtags":["#..."],"short_description_ar":"","thumbnail_text_ar":""}',
].join("\n");

function validateSocialMetadata(json) {
  const required = ["youtube_title_ar", "instagram_caption_ar", "tiktok_caption_ar", "facebook_caption_ar", "thumbnail_text_ar"];
  const missing = required.filter((f) => !json[f]);
  if (missing.length) throw new Error(`Social Metadata Agent output is missing: ${missing.join(", ")}`);
  json.hashtags = Array.isArray(json.hashtags) ? json.hashtags.slice(0, 15) : [];
  return json;
}

async function buildSocialMetadata({ story, apiKey }) {
  if (!story?.title_ar) throw new Error("A generated story is required for social metadata.");
  const prompt = [
    `Title: ${story.title_ar}`,
    `Hook: ${story.hook_ar || ""}`,
    `Lesson: ${story.lesson_ar || ""}`,
    `Category: ${story.category || ""}`,
  ].join("\n");

  const { json, costUSD, model } = await callStoryAiJson({
    system: SYSTEM_PROMPT,
    prompt,
    apiKey,
    tier: "haiku",
    maxTokens: 1200,
    feature: "story-ai-social",
  });

  return { metadata: validateSocialMetadata(json), costUSD, model };
}

module.exports = { buildSocialMetadata, validateSocialMetadata, SYSTEM_PROMPT };
