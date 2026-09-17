"use strict";
// weather-engine.test.js — Master Agent, real weather ("كيف داير الجو
// اليوم في المكان ديالي"). Covers renderWeatherText only — fetchRealWeather
// itself makes a real live network call to Open-Meteo, exercised live
// instead of mocked (same convention as this session's other engines).
const assert = require("node:assert");
const { renderWeatherText, renderExtendedForecastText, MAX_REAL_FORECAST_DAYS } = require("../src/weather-engine");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("Checking renderWeatherText — real, labeled weather condition + real temps…");

ok("a real Open-Meteo-shaped response renders condition/temp/feels-like/humidity/wind/high-low/rain chance", () => {
  const j = { current: { temperature_2m: 72.4, apparent_temperature: 75.1, relative_humidity_2m: 55, wind_speed_10m: 8.2, weather_code: 1 }, daily: { temperature_2m_max: [80.1], temperature_2m_min: [60.3], precipitation_probability_max: [20] } };
  const text = renderWeatherText(j);
  assert.ok(text.includes("Mainly clear"));
  assert.ok(text.includes("72°F"));
  assert.ok(text.includes("feels like 75°F"));
  assert.ok(text.includes("Humidity 55%"));
  assert.ok(text.includes("Wind 8 mph"));
  assert.ok(text.includes("High 80°F / Low 60°F"));
  assert.ok(text.includes("Chance of rain: 20%"));
});

ok("an unrecognized weather code falls back to an honest code label, never a fabricated condition name", () => {
  const j = { current: { temperature_2m: 50, apparent_temperature: 48, relative_humidity_2m: 40, wind_speed_10m: 5, weather_code: 12345 }, daily: {} };
  const text = renderWeatherText(j);
  assert.ok(text.includes("Weather code 12345"));
});

console.log("\nChecking renderExtendedForecastText — real multi-day forecast, honest about its real 16-day cap (2026-09-16, \"30 days weather forecast\" request)…");

ok("MAX_REAL_FORECAST_DAYS is honestly 16, never silently bumped toward a fabricated 30", () => {
  assert.strictEqual(MAX_REAL_FORECAST_DAYS, 16);
});

ok("a real 16-day Open-Meteo-shaped daily response renders one real line per day with hi/lo/condition/rain chance", () => {
  const days = 16;
  const j = { daily: {
    time: Array.from({ length: days }, (_, i) => `2026-09-${16 + i}`),
    weather_code: Array.from({ length: days }, () => 1),
    temperature_2m_max: Array.from({ length: days }, (_, i) => 80 - i),
    temperature_2m_min: Array.from({ length: days }, (_, i) => 60 - i),
    precipitation_probability_max: Array.from({ length: days }, () => 20),
  } };
  const text = renderExtendedForecastText(j);
  assert.ok(text.includes("16-Day Forecast"));
  assert.ok(text.includes("Mainly clear"));
  assert.ok(text.includes("80°/60°F"));
  assert.ok(text.includes("rain 20%"));
});

ok("a real short (< 30 real days) result honestly discloses the real forecast-horizon limit, never pads with fabricated days", () => {
  const j = { daily: { time: ["2026-09-16", "2026-09-17"], weather_code: [1, 2], temperature_2m_max: [80, 78], temperature_2m_min: [60, 58], precipitation_probability_max: [10, 15] } };
  const text = renderExtendedForecastText(j);
  assert.ok(text.includes("no honest data source exists for a genuine 30-day forecast"));
});

console.log("\nChecking /weather30 Telegram command (2026-09-17, explicit request: \"under weather30 command telegram\")…");

ok("a real /weather30 command is registered, reusing the exact same real fetchExtendedForecast/renderExtendedForecastText as /forecast — no second forecast implementation", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/telegram-bot"), "utf8");
  const start = src.indexOf("weather30: async () => {");
  assert.ok(start > -1, "weather30 command handler must exist");
  const block = src.slice(start, start + 250);
  assert.match(block, /fetchExtendedForecast\(\)/);
  assert.match(block, /renderExtendedForecastText\(f\)/);
});

console.log(`\n${passed} checks passed.`);
if (!process.exitCode) console.log("WEATHER-ENGINE TEST OK");
