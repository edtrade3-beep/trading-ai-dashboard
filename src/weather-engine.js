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

// Real extended daily forecast (2026-09-16, explicit request: "30 days
// weather forecast telegram forecast"). Open-Meteo's real forecast model
// (the same free, no-key provider fetchRealWeather already uses) only
// produces genuine daily forecasts out to 16 days — there is no real
// weather-model data source for a true 30-day daily forecast; days beyond
// ~16 would be climate-normal guesses, not a real forecast. Rather than
// fabricate 14 extra days, this returns the real maximum (16 real days)
// and says so honestly in the rendered text.
const MAX_REAL_FORECAST_DAYS = 16;

async function fetchExtendedForecast(days = MAX_REAL_FORECAST_DAYS) {
  const forecastDays = Math.max(1, Math.min(MAX_REAL_FORECAST_DAYS, Math.round(days)));
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LOCATION.lat}&longitude=${LOCATION.lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto&forecast_days=${forecastDays}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.daily?.time?.length) throw new Error("real extended forecast fetch failed");
  return j;
}

function renderExtendedForecastText(j) {
  const d = j.daily || {};
  const dates = d.time || [];
  const lines = [`🌤 ${dates.length}-Day Forecast — ${LOCATION.label}`, ""];
  dates.forEach((dateStr, i) => {
    const label = WEATHER_CODE_LABELS[d.weather_code?.[i]] ?? `Code ${d.weather_code?.[i]}`;
    const hi = d.temperature_2m_max?.[i], lo = d.temperature_2m_min?.[i];
    const rain = d.precipitation_probability_max?.[i];
    const dow = new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    lines.push(`${dow}: ${Math.round(hi)}°/${Math.round(lo)}°F, ${label}${rain != null ? ` · rain ${rain}%` : ""}`);
  });
  if (dates.length < 30) {
    lines.push("", `(Real weather models only forecast ${MAX_REAL_FORECAST_DAYS} real days out — no honest data source exists for a genuine 30-day forecast, so this isn't padded with guesses.)`);
  }
  return lines.join("\n");
}

module.exports = { fetchRealWeather, renderWeatherText, fetchExtendedForecast, renderExtendedForecastText, MAX_REAL_FORECAST_DAYS };
