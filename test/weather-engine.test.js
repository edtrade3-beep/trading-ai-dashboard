"use strict";
// weather-engine.test.js — Master Agent, real weather ("كيف داير الجو
// اليوم في المكان ديالي"). Covers renderWeatherText only — fetchRealWeather
// itself makes a real live network call to Open-Meteo, exercised live
// instead of mocked (same convention as this session's other engines).
const assert = require("node:assert");
const { renderWeatherText } = require("../src/weather-engine");

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

console.log(`\n${passed} checks passed.`);
if (!process.exitCode) console.log("WEATHER-ENGINE TEST OK");
