import GLib from "gi://GLib?version=2.0"
import { createState } from "ags"
import fetch from "ags/fetch"

/**
 * ============================================================================
 * Where you are
 * ============================================================================
 *
 * Everything geographic in the shell reads from here: the forecast, and the
 * wireframe city model on the weather panel. It used to be two hardcoded
 * numbers at the top of state/weather.ts, which meant a fresh install showed
 * you New York's weather standing on New York's skyline.
 *
 * Resolved by IP, cached to disk, and re-checked every few hours so the shell
 * follows a laptop that travels. That is approximate -- usually your town or
 * the next one over, which is exactly the resolution a forecast and a 1.8km
 * city model need.
 *
 * ---------------------------------------------------------------------------
 * TO PIN IT MANUALLY -- if the IP guess is wrong, or you would rather not ask:
 * fill in OVERRIDE below and nothing is ever looked up.
 *
 *     const OVERRIDE: Fix | null = {
 *       latitude: 36.213,
 *       longitude: -86.3011,
 *       label: "LEBANON, TN",
 *     }
 *
 * Find coordinates at https://geocoding-api.open-meteo.com/v1/search?name=YourCity
 * ---------------------------------------------------------------------------
 */

export type Fix = {
  latitude: number
  longitude: number
  /** what to print on the panel */
  label: string
}

/** Set this to skip the lookup entirely. */
const OVERRIDE: Fix | null = null

/**
 * Used until a real fix arrives, and if every lookup fails. Null Island would
 * be more honest but renders as an empty grey plate; Greenwich at least has
 * buildings on it, and the label says plainly that it is a fallback.
 */
const FALLBACK: Fix = {
  latitude: 51.4779,
  longitude: -0.0015,
  label: "LOCATION UNKNOWN",
}

/**
 * How long a fix is trusted before it is quietly re-checked.
 *
 * Six hours because that is the shape of actually moving: a drive, a flight, a
 * hotel. Anything shorter spends requests to confirm you are still at your desk.
 */
const TTL_MS = 6 * 3_600_000

/**
 * How often staleness is tested. Deliberately much shorter than the TTL and
 * deliberately a *test* rather than a lookup: a suspended laptop runs no
 * timers, so a machine that slept for nine hours is noticed on the tick after
 * it wakes instead of on a schedule that quietly skipped.
 */
const CHECK_MS = 30 * 60_000

/**
 * How far a new answer has to sit from the old one to be believed, in metres.
 *
 * IP geolocation jitters: the same desk resolves to a slightly different point
 * depending on which provider answered and which record they hold, and a
 * couple of those wobbles would be enough to re-key the city cache and re-hit
 * Overpass for a model of the same town. Five kilometres is comfortably past
 * the jitter and comfortably inside "this is somewhere else" -- the city model
 * is only 1.8km across, so a real move is never this small.
 */
const MOVED_M = 5_000

/**
 * Providers, tried in order until one answers.
 *
 * More than one because they all rate-limit, and a free tier that has been hit
 * a few times today returns 429 -- which is a bad reason to spend the rest of
 * the day showing the wrong city. Each is free and keyless.
 *
 * They disagree on field names, so each carries its own reader.
 */
const PROVIDERS: Array<{
  url: string
  read: (data: any) => Fix | null
}> = [
  {
    url: "https://ipapi.co/json/",
    read: (d) => make(d?.latitude, d?.longitude, d?.city, d?.region_code ?? d?.region),
  },
  {
    // http, not https: TLS is a paid feature here. Nothing secret is being
    // sent -- the request body is empty and the answer is our own rough
    // whereabouts, which the network operator already knows.
    url: "http://ip-api.com/json/?fields=status,city,region,regionName,lat,lon",
    read: (d) => (d?.status === "success" ? make(d.lat, d.lon, d.city, d.region) : null),
  },
]

/** Shared shape-check, so a provider reader is one line. */
function make(lat: unknown, lon: unknown, city: unknown, region: unknown): Fix | null {
  const latitude = Number(lat)
  const longitude = Number(lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const town = String(city ?? "").trim()
  const state = String(region ?? "").trim()
  const label = (town && state ? `${town}, ${state}` : town || "LOCATED").toUpperCase()

  return { latitude, longitude, label }
}

/**
 * Great-circle distance in metres.
 *
 * Only ever asked about two points a few kilometres apart, where a flat
 * approximation would do -- but haversine is four lines and does not need a
 * caveat about latitude.
 */
function metresBetween(a: Fix, b: Fix): number {
  const R = 6_371_000
  const toRad = Math.PI / 180

  const dLat = (b.latitude - a.latitude) * toRad
  const dLon = (b.longitude - a.longitude) * toRad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * toRad) * Math.cos(b.latitude * toRad) * Math.sin(dLon / 2) ** 2

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// ============================
// CACHE
// ============================
//  The fix plus when it was taken. The timestamp is the whole reason this file
//  is more than two numbers: without it there is no way to tell a fix from
//  this morning from one cached in a different state last year.

type Cached = Fix & { at: number }

const CACHE = `${GLib.get_user_cache_dir()}/ags/location.json`

function readCache(): Cached | null {
  try {
    const [ok, bytes] = GLib.file_get_contents(CACHE)
    if (!ok) return null
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof parsed?.latitude !== "number" || typeof parsed?.longitude !== "number") {
      return null
    }

    //  `at` is missing from caches written before this file learned to expire.
    //  Treated as epoch rather than as now, so an install carrying one of those
    //  re-checks on its next start instead of trusting it for another six hours.
    return { ...(parsed as Fix), at: Number(parsed.at) || 0 }
  } catch {
    return null
  }
}

function writeCache(fix: Fix, at: number) {
  try {
    GLib.mkdir_with_parents(`${GLib.get_user_cache_dir()}/ags`, 0o755)
    GLib.file_set_contents(CACHE, JSON.stringify({ ...fix, at }))
  } catch (error) {
    console.warn("location: could not cache:", error)
  }
}

// ============================
// STATE
// ============================

const cached = readCache()

/**
 * The current fix.
 *
 * Deliberately EAGER rather than lazy. Every other network-backed value in
 * state/ waits for a subscriber, but this one is what the others are keyed on:
 * the weather poll and the city model both need it before they can build a
 * request, and having them each wait on a lazy accessor they might start in
 * either order is a race for no benefit.
 */
//  Rebuilt field by field rather than passed straight through: `cached` also
//  carries its timestamp, and spreading that into the shared state would put an
//  `at` on a value the rest of the shell reads as a plain Fix.
const seed: Fix | null = cached
  ? { latitude: cached.latitude, longitude: cached.longitude, label: cached.label }
  : null

const [fix, setFix] = createState<Fix>(OVERRIDE ?? seed ?? FALLBACK)

export { fix as location }

/** Synchronous read, for the module-scope consumers that cannot await. */
export function currentFix(): Fix {
  return fix.peek()
}

/**
 * True once we are working from something better than FALLBACK.
 *
 * A flag rather than a label comparison: the label is provider text, and
 * deciding whether we know where we are by string-matching it is the kind of
 * thing that breaks the day a provider names a real town "Unknown".
 */
let real = Boolean(OVERRIDE || cached)
export function hasRealFix(): boolean {
  return real
}

/** When the fix we are holding was taken. 0 while we are on the fallback. */
let takenAt = OVERRIDE ? Date.now() : (cached?.at ?? 0)

// ============================
// RESOLVING
// ============================

/** Guards against a slow lookup overlapping the next staleness tick. */
let resolving = false

/**
 * Ask each provider in turn, and decide what the answer means.
 *
 * Three outcomes, and the difference between the last two is the point of the
 * whole exercise:
 *
 *   nobody answered   -> change nothing, try again on the next tick. A fix from
 *                        this morning beats the fallback, and an aeroplane's
 *                        wifi portal is not evidence that you have not moved.
 *   same place        -> keep the fix exactly as it is, including its label,
 *                        and only stamp it fresh. Publishing a jittered
 *                        duplicate would re-fetch a city model we already have.
 *   somewhere new     -> publish it. state/weather.ts refetches on the spot and
 *                        state/city.ts builds the new skyline.
 */
async function resolve(): Promise<void> {
  if (resolving) return
  resolving = true

  try {
    for (const provider of PROVIDERS) {
      try {
        const response = await fetch(provider.url)
        if (!response.ok) {
          console.warn(`location: ${provider.url} -> HTTP ${response.status}`)
          continue
        }

        const resolved = provider.read(await response.json())
        if (!resolved) {
          console.warn(`location: ${provider.url} -> no usable coordinates`)
          continue
        }

        const held = fix.peek()
        const moved = !real || metresBetween(held, resolved) > MOVED_M

        takenAt = Date.now()
        real = true

        if (moved) {
          writeCache(resolved, takenAt)
          setFix(resolved)
          console.log(`location: now ${resolved.label}`)
        } else {
          // same place; just stop it looking stale
          writeCache(held, takenAt)
        }

        return
      } catch (error) {
        console.warn(`location: ${provider.url} ->`, error)
      }
    }

    console.warn("location: every provider failed; keeping the fix we have")
  } finally {
    resolving = false
  }
}

/** Re-resolve now, whatever the cache says. Wired to the panel's refresh. */
export function refreshLocation(): void {
  void resolve()
}

if (!OVERRIDE) {
  const stale = () => Date.now() - takenAt > TTL_MS

  if (stale()) void resolve()

  //  Not Timer.interval: that fires immediately as well, which would double up
  //  with the staleness check above on every start.
  setInterval(() => {
    if (stale()) void resolve()
  }, CHECK_MS)
}
