"use strict";

// weather-engine.js — Master Agent, real weather (2026-09-11, explicit
// user request: "كيف داير الجو اليوم في المكان ديالي" — "how's the weather
// today where I live" — "the system will detect the area where I live").
// This platform has exactly one real, already-established server-side
// notion of "where I live": src/prayer-times.js's LOCATION (Fairfield, OH
// 45014 — the same real coordinates already used for prayer times and
// matching the dealership's own real address elsewhere in this app).
// Reusing it here means "my location" resolves to the same real place
// everywhere in the platform, not a second, independently-guessed one.
//
// Uses Open-Meteo (api.open-meteo.com) — real live data, free, no API key
// required, so this needed zero new paid dependency or credential to add.
const { LOCATION } = require("./prayer-times");

const WEATHER_CODE_LABELS = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
  85: "Slight snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
};

async function fetchRealWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LOCATION.lat}&longitude=${LOCATION.lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.current) throw new Error("real weather fetch failed");
  return j;
}

function renderWeatherText(j) {
  const c = j.current || {};
  const label = WEATHER_CODE_LABELS[c.weather_code] ?? `Weather code ${c.weather_code}`;
  const hi = j.daily?.temperature_2m_max?.[0];
  const lo = j.daily?.temperature_2m_min?.[0];
  const rainChance = j.daily?.precipitation_probability_max?.[0];
  const lines = [
    `🌤 Weather — ${LOCATION.label}`,
    `${label}, ${Math.round(c.temperature_2m)}°F (feels like ${Math.round(c.apparent_temperature)}°F)`,
    `Humidity ${c.relative_humidity_2m}% · Wind ${Math.round(c.wind_speed_10m)} mph`,
  ];
  if (hi != null && lo != null) lines.push(`Today: High ${Math.round(hi)}°F / Low ${Math.round(lo)}°F`);
  if (rainChance != null) lines.push(`Chance of rain: ${rainChance}%`);
  return lines.join("\n");
}

module.exports = { fetchRealWeather, renderWeatherText };
