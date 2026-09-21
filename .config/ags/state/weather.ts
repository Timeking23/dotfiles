import { createExternal, createMemo } from "ags"
import fetch from "ags/fetch"

import { location } from "./location"

// ============================
// CONFIG — edit these two numbers
// ============================
// Open-Meteo needs no API key and no signup. WHERE is decided by
// state/location.ts, not here.

//  Coordinates come from state/location.ts, which resolves them by IP, caches
//  them, and re-checks every few hours -- a new fix refetches this immediately
//  rather than waiting for the next tick. To pin them by hand, see OVERRIDE in
//  that file.
const TEMPERATURE_UNIT = "fahrenheit" // or "celsius"
const WIND_SPEED_UNIT = "mph" // or "kmh"

/** Open-Meteo throttles on the free tier at ~10k calls/day; 15 min is plenty. */
const REFRESH_MS = 15 * 60_000

/** how many days the strip along the bottom shows */
export const FORECAST_DAYS = 5

//  timezone=auto matters: sunrise and sunset come back as local wall-clock
//  strings, and without it they arrive in UTC and read several hours wrong.
//  Visibility is only offered hourly, so it is picked out of the hourly series
//  by matching the current hour rather than asked for as a current field.
//  Built per request rather than once at import: the coordinates arrive
//  asynchronously on a first run, so a URL frozen at module load would pin the
//  shell to the fallback location for the rest of the session.
function endpoint(): string {
  const { latitude, longitude } = location.peek()

  return (
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${latitude}&longitude=${longitude}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day" +
    ",wind_speed_10m,wind_direction_10m" +
    "&hourly=visibility" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset" +
    `&forecast_days=${FORECAST_DAYS}&timezone=auto` +
    `&temperature_unit=${TEMPERATURE_UNIT}&wind_speed_unit=${WIND_SPEED_UNIT}`
  )
}

export type Day = {
  /** YYYY-MM-DD */
  date: string
  code: number
  high: number
  low: number
}

export type Weather = {
  temperature: number
  feelsLike: number
  humidity: number
  code: number
  isDay: boolean
  windSpeed: number
  /** degrees clockwise from north */
  windFrom: number
  /** metres, as the API reports it; -1 when the hour could not be matched */
  visibility: number
  /** local wall-clock "HH:MM", already in the location's timezone */
  sunrise: string
  sunset: string
  forecast: Day[]
}

// ============================
// WMO 4677 CODE TABLE
// ============================
// Open-Meteo reports conditions as WMO codes, not strings. Each entry is
// [label, day glyph, night glyph] — night falls back to the day glyph wherever
// the distinction does not exist (it never rains differently after dark).
//
// Nerd Font glyphs, not Adwaita `-symbolic` icon names, for the same reason
// state/status.ts gives: an icon name resolves against whatever icon theme is
// installed and renders NOTHING when it misses, silently. The font is already
// a hard dependency of every label on the bar, so a glyph cannot go missing.
// Every codepoint below was checked against the installed
// JetBrainsMonoNerdFont-Regular.ttf charset.

const G = {
  daySunny: "\u{e30d}", // nf-weather-day_sunny
  nightClear: "\u{e32b}", // nf-weather-night_clear
  dayCloudy: "\u{e302}", // nf-weather-day_cloudy
  nightCloudy: "\u{e37e}", // nf-weather-night_alt_cloudy
  overcast: "\u{e312}", // nf-weather-cloudy
  dayFog: "\u{e303}", // nf-weather-day_fog
  nightFog: "\u{e346}", // nf-weather-night_fog
  sprinkle: "\u{e328}", // nf-weather-sprinkle
  showers: "\u{e319}", // nf-weather-showers
  dayRain: "\u{e308}", // nf-weather-day_rain
  nightRain: "\u{e325}", // nf-weather-night_alt_rain
  rain: "\u{e318}", // nf-weather-rain
  sleet: "\u{e3ad}", // nf-weather-sleet
  daySnow: "\u{e30a}", // nf-weather-day_snow
  nightSnow: "\u{e327}", // nf-weather-night_alt_snow
  snow: "\u{e31a}", // nf-weather-snow
  dayStorm: "\u{e30f}", // nf-weather-day_storm
  nightStorm: "\u{e32a}", // nf-weather-night_alt_storm
  storm: "\u{e31d}", // nf-weather-thunderstorm
  none: "\u{e374}", // nf-weather-na
} as const

/** Secondary glyphs, for the dossier rows rather than the key face. */
export const WX_GLYPH = {
  thermometer: "\u{e350}", // nf-weather-thermometer
  humidity: "\u{e373}", // nf-weather-humidity
  windy: "\u{e31e}", // nf-weather-windy
} as const

type Condition = [string, string, string]

const CONDITIONS: Record<number, Condition> = {
  0: ["Clear", G.daySunny, G.nightClear],
  1: ["Mostly clear", G.dayCloudy, G.nightCloudy],
  2: ["Partly cloudy", G.dayCloudy, G.nightCloudy],
  3: ["Overcast", G.overcast, G.overcast],
  45: ["Fog", G.dayFog, G.nightFog],
  48: ["Freezing fog", G.dayFog, G.nightFog],
  51: ["Light drizzle", G.sprinkle, G.sprinkle],
  53: ["Drizzle", G.sprinkle, G.sprinkle],
  55: ["Heavy drizzle", G.showers, G.showers],
  56: ["Freezing drizzle", G.sleet, G.sleet],
  57: ["Freezing drizzle", G.sleet, G.sleet],
  61: ["Light rain", G.dayRain, G.nightRain],
  63: ["Rain", G.rain, G.rain],
  65: ["Heavy rain", G.rain, G.rain],
  66: ["Freezing rain", G.sleet, G.sleet],
  67: ["Freezing rain", G.sleet, G.sleet],
  71: ["Light snow", G.daySnow, G.nightSnow],
  73: ["Snow", G.snow, G.snow],
  75: ["Heavy snow", G.snow, G.snow],
  77: ["Snow grains", G.snow, G.snow],
  80: ["Light showers", G.showers, G.showers],
  81: ["Showers", G.showers, G.showers],
  82: ["Heavy showers", G.showers, G.showers],
  85: ["Snow showers", G.snow, G.snow],
  86: ["Snow showers", G.snow, G.snow],
  95: ["Thunderstorm", G.dayStorm, G.nightStorm],
  96: ["Thunderstorm, hail", G.storm, G.storm],
  99: ["Thunderstorm, hail", G.storm, G.storm],
}

const UNKNOWN: Condition = ["\u2014", G.none, G.none]

function describe(code: number): Condition {
  return CONDITIONS[code] ?? UNKNOWN
}

// ============================
// SHAPING
// ============================

/**
 * Visibility for the current hour.
 *
 * Open-Meteo has no `current` visibility field, only an hourly series, so the
 * current timestamp ("2026-09-09T19:30") is truncated to its hour and matched
 * against hourly.time. Returns -1 rather than 0 when it cannot be matched:
 * zero is a real reading and would show as a dense fog.
 */
function pickVisibility(hourly: any, currentTime: string): number {
  const times: string[] = hourly?.time ?? []
  const values: number[] = hourly?.visibility ?? []
  if (!times.length || !values.length) return -1

  const hour = String(currentTime ?? "").slice(0, 13)
  const at = times.findIndex((t) => t.slice(0, 13) === hour)
  return at >= 0 ? (values[at] ?? -1) : -1
}

/** "2026-09-09T06:30" -> "06:30". The API already returns local time. */
function clockOf(stamp: string | undefined): string {
  return stamp ? stamp.slice(11, 16) : ""
}

// ============================
// STATE
// ============================

/**
 * Response to Weather.
 *
 * Split out so the producer below is only control flow -- it has enough of that
 * to follow without twenty lines of field mapping in the middle of it.
 */
function shape(payload: any): Weather {
  const { current, hourly, daily } = payload

  return {
    temperature: current.temperature_2m,
    feelsLike: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    code: current.weather_code,
    isDay: current.is_day === 1,
    windSpeed: current.wind_speed_10m,
    windFrom: current.wind_direction_10m,
    visibility: pickVisibility(hourly, current.time),
    sunrise: clockOf(daily?.sunrise?.[0]),
    sunset: clockOf(daily?.sunset?.[0]),
    forecast: (daily?.time ?? []).map((date: string, i: number) => ({
      date,
      code: daily.weather_code[i],
      high: daily.temperature_2m_max[i],
      low: daily.temperature_2m_min[i],
    })),
  }
}

/** Which coordinates a reading belongs to, at the precision of the request. */
function coordKey(): string {
  const { latitude, longitude } = location.peek()
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`
}

/**
 * The forecast.
 *
 * createExternal rather than createPoll, for one reason: a poll can only be
 * driven by its own clock, and this has a second thing that should drive it.
 * state/location.ts re-checks where you are every few hours, and the whole
 * point of that is wasted if a laptop that woke up two states over keeps
 * showing the old town until the next quarter-hour tick happens to come round.
 * So the interval is ours, and a new fix resets it and refetches immediately.
 *
 * Still lazy, exactly like the poll it replaces: the producer runs when the
 * first widget subscribes and is torn down when the last one goes away, so a
 * session that never opens the weather panel never makes the call.
 */
export const weather = createExternal<Weather | null>(null, (set) => {
  let cancelled = false
  let timer: ReturnType<typeof setInterval> | null = null

  /**
   * Which request the answer is allowed to come from.
   *
   * A move fires a second fetch while the first is still in the air, and they
   * can land in either order -- without this, the slower reply from the town
   * you left overwrites the one from the town you are in and sits there until
   * the next tick.
   */
  let generation = 0

  async function refresh() {
    const mine = ++generation

    try {
      const response = await fetch(endpoint())
      if (!response.ok) {
        console.error(`weather: HTTP ${response.status}`)
        return
      }

      const shaped = shape(await response.json())
      //  Nothing set on the failure paths, here or below: the accessor keeps the
      //  last good reading, so a dropped wifi connection does not blank the panel.
      if (cancelled || mine !== generation) return
      set(shaped)
    } catch (error) {
      console.error("weather:", error)
    }
  }

  function restart() {
    if (timer) clearInterval(timer)
    timer = setInterval(refresh, REFRESH_MS)
    void refresh()
  }

  restart()

  //  Only on a real move. location.ts already filters out IP jitter, but it
  //  publishes a label change on its own too, and a new label over the same
  //  coordinates is not a reason to spend a request.
  let key = coordKey()
  const unsubscribe = location.subscribe(() => {
    const next = coordKey()
    if (next === key) return
    key = next
    restart()
  })

  return () => {
    cancelled = true
    unsubscribe()
    if (timer) clearInterval(timer)
  }
})

const degree = TEMPERATURE_UNIT === "fahrenheit" ? "°F" : "°C"

export const weatherGlyph = createMemo(() => {
  const current = weather()
  if (!current) return G.none

  const [, day, night] = describe(current.code)
  return current.isDay ? day : night
})

export const weatherLabel = createMemo(() => {
  const current = weather()
  if (!current) return "…"

  return `${Math.round(current.temperature)}${degree}`
})

export const weatherDetail = createMemo(() => {
  const current = weather()
  if (!current) return "Fetching weather…"

  const [label] = describe(current.code)
  return `${label} · feels like ${Math.round(current.feelsLike)}${degree}`
})

// Individual fields, for dossier-style label/value rows.

export const weatherCondition = createMemo(() => {
  const current = weather()
  return current ? describe(current.code)[0].toUpperCase() : "----"
})

export const weatherFeelsLike = createMemo(() => {
  const current = weather()
  return current ? `${Math.round(current.feelsLike)}${degree}` : "----"
})

export const weatherHumidity = createMemo(() => {
  const current = weather()
  return current ? `${current.humidity}%` : "----"
})

export const weatherTooltip = createMemo(() => {
  const current = weather()
  if (!current) return "Weather unavailable"

  const [label] = describe(current.code)
  return `${label}\n${Math.round(current.temperature)}${degree}, ${current.humidity}% humidity`
})

// ============================
// WIDGET FIELDS
// ============================
//  Everything below is shaped for the panel's tiles: already rounded, already
//  suffixed, already a dash when there is nothing to show. A widget that has to
//  decide how to format a null is a widget that formats it differently in two
//  places.

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                 "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]

/** Degrees to a 16-point compass name. The API reports the direction wind comes FROM. */
export function compassOf(degrees: number): string {
  return COMPASS[Math.round(degrees / 22.5) % 16]
}

export const windDirection = createMemo(() => {
  const c = weather()
  return c ? `${Math.round(c.windFrom)}° from ${compassOf(c.windFrom)}` : "----"
})

export const windSpeed = createMemo(() => {
  const c = weather()
  return c ? `${Math.round(c.windSpeed)} ${TEMPERATURE_UNIT === "fahrenheit" ? "mph" : "km/h"}` : "----"
})

export const visibility = createMemo(() => {
  const c = weather()
  if (!c || c.visibility < 0) return "----"

  // reported in metres; miles alongside fahrenheit, kilometres otherwise
  return TEMPERATURE_UNIT === "fahrenheit"
    ? `${(c.visibility / 1609.34).toFixed(1)} mi`
    : `${(c.visibility / 1000).toFixed(1)} km`
})

export const sunrise = createMemo(() => weather()?.sunrise || "--:--")
export const sunset = createMemo(() => weather()?.sunset || "--:--")

/** The big centre figure has no unit on it -- the degree ring is the unit. */
export const temperatureOnly = createMemo(() => {
  const c = weather()
  return c ? `${Math.round(c.temperature)}°` : "--°"
})

/** Just the figure. The label is the widget's job, not this string's. */
export const feelsLikeOnly = createMemo(() => {
  const c = weather()
  return c ? `${Math.round(c.feelsLike)}°` : "--°"
})

export type ForecastCell = {
  date: string
  label: string
  glyph: string
  high: string
  low: string
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/**
 * The strip along the bottom.
 *
 * Day zero is labelled "Today" rather than by name -- the whole point of the
 * row is relative, and reading "Wednesday" next to a panel already showing
 * Wednesday's weather is a small stumble every time.
 *
 * Dates are split by hand instead of through Date parsing: "2026-09-09" fed to
 * new Date() is read as UTC midnight, which lands on the previous day for
 * anyone west of Greenwich and shifts the whole row by one.
 */
export const forecast = createMemo<ForecastCell[]>(() => {
  const c = weather()
  if (!c) return []

  return c.forecast.map((day, i) => {
    const [y, m, d] = day.date.split("-").map(Number)
    const weekday = new Date(y, m - 1, d).getDay()
    const [, glyph] = describe(day.code)

    return {
      date: day.date,
      label: i === 0 ? "Today" : WEEKDAY[weekday],
      glyph,
      high: `${Math.round(day.high)}°`,
      low: `${Math.round(day.low)}°`,
    }
  })
})

// ============================
// MOOD
// ============================
//  Which piece of art the panel wears. One folder per mood under
//  assets/weather/, generated by assets/gen-weather-bg.py -- drop your own
//  .jpg files into any of them and they are used instead.

export type Mood =
  | "clear-day"
  | "clear-night"
  | "clouds"
  | "rain"
  | "hail"
  | "wind"
  | "snow"
  | "storm"
  | "fog"

/** above this the sky stops mattering and it is simply windy */
const WINDY_MPH = 25

/**
 * WMO code to a mood.
 *
 * Two of these are not WMO conditions at all. Hail is pulled out of codes 96
 * and 99, which the table calls "thunderstorm, hail" and which deserve their
 * own look rather than sharing the storm art. Wind is not in the code table in
 * any form, so it is decided from wind speed -- and only for skies that are
 * otherwise unremarkable, because rain at 30mph is still rain.
 */
export const weatherMood = createMemo<Mood>(() => {
  const c = weather()
  if (!c) return "clouds"

  const code = c.code

  if (code === 96 || code === 99) return "hail"
  if (code >= 95) return "storm"
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow"
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain"
  if (code === 45 || code === 48) return "fog"

  // clear or lightly clouded, so wind is allowed to take over
  if (c.windSpeed >= WINDY_MPH) return "wind"

  if (code === 0 || code === 1) return c.isDay ? "clear-day" : "clear-night"
  return "clouds"
})
