import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import Soup from "gi://Soup?version=3.0"
import { createExternal } from "ags"

import { currentFix, hasRealFix, location, type Fix } from "./location"

/**
 * ============================================================================
 * Your city, as building footprints
 * ============================================================================
 *
 * Real building outlines and heights for the area around LATITUDE/LONGITUDE,
 * so the weather panel's plate is a wireframe model of where you actually live
 * rather than an abstract surface.
 *
 * ---------------------------------------------------------------------------
 * WHY OPENSTREETMAP AND NOT GOOGLE / APPLE MAPS
 * ---------------------------------------------------------------------------
 * Neither exposes 3D building geometry through a free API, and both prohibit
 * pulling their map tiles apart to get at it. OSM publishes the same thing
 * openly: `building` ways carry a footprint polygon, and most carry either an
 * explicit `height` or a `building:levels` count you can multiply up. That is
 * exactly the data a LiDAR city render is made of.
 *
 * Fetched through Overpass, which needs no key and no signup.
 *
 * ---------------------------------------------------------------------------
 * FETCHED ONCE PER PLACE -- buildings do not move, so the only thing that can
 * invalidate a model is you moving. The result is written to the cache
 * directory under a key made from the coordinates, so every later start in the
 * same town reads it from there and a town you have not modelled yet fetches
 * once. state/location.ts re-checks where you are every few hours; when it
 * reports somewhere genuinely new, the skyline here follows it.
 *
 * TO CHANGE WHAT IT SHOWS -> HOME_RADII below.
 *
 *    500    a few blocks, towers legible individually
 *   1000    a downtown core                              (default)
 *   2500    a small city end to end; individual buildings become texture
 * ---------------------------------------------------------------------------
 */

/**
 * Half-width of the fetched square, in metres -- the STARTING radius, and the
 * one every non-home fetch uses.
 */
const RADIUS_M = 900

/**
 * Radius ladder tried AT HOME, narrowest first.
 *
 * A downtown fills 900m. A small town does not -- Lebanon TN has 52 mapped
 * buildings inside that box and 365 inside 3km -- and the first version of
 * this module answered that by going and modelling the nearest big city
 * instead. Which is a better picture, and the wrong one: standing on
 * Nashville's skyline is not where you live.
 *
 * So home gets several chances before anywhere else gets one. All four are
 * counted in a single cheap request (see probeHome) and only the winner is
 * actually fetched, so this costs two round trips, not eight. The tightest
 * radius that fills the plate wins -- a real downtown stays at 900m where
 * individual towers are legible, and only a town that needs the width gets it.
 *
 * Past ~4km the buildings genuinely are a pixel each, so the ladder stops
 * rather than widening forever; a town that thin falls through to step 2.
 */
const HOME_RADII = [900, 1200, 1600] as const

/**
 * Buildings that have to be VISIBLE for a plate to count as worth drawing.
 *
 * Not "in the fetched box" -- see probeHome. A small town has forty or fifty
 * structures in its centre and that is the whole town; holding it to a
 * downtown's 260 is how this ended up deciding Lebanon did not exist.
 */
const HOME_FLOOR = 25

/**
 * How far in CityMesh's camera sits. Kept here, with visibleRadius, because
 * the FETCH depends on it: what the camera can see is what decides whether a
 * radius is worth choosing, and the widget is the thing that knows.
 *
 *   1  the whole modelled square, fitted
 *   4  street view -- individual buildings and the road between them
 */
export const CAMERA_ZOOM = 4

/**
 * The radius the camera can actually see, in metres, for a given model radius.
 *
 * CityMesh fits the modelled square inside the plate and then zooms in, so the
 * visible circle is the fitted half-diagonal over the zoom -- about a third of
 * the radius, not all of it. A 900m model shows its middle 320m.
 *
 * Shared rather than written out twice on purpose. The widget culls by this
 * and the probe counts by it, and the version where the widget used a fixed
 * 340m regardless of radius drew a 3.6km model as a tiny island of buildings
 * in the centre of an empty grid -- correct for 900m, and for nothing else.
 */
export function visibleRadius(modelRadius: number): number {
  return (Math.SQRT2 * modelRadius) / CAMERA_ZOOM
}

/** below this, the plate looks empty and it is worth casting wider */
const ENOUGH = 260

/**
 * Cap on buildings kept. Overpass will happily return ten thousand; drawing
 * that as wireframe at 20fps will not happen, and past a few hundred the
 * picture is solid glow anyway. The tallest are kept -- they are what gives a
 * skyline its shape.
 */
const MAX_BUILDINGS = 1400

/**
 * Server-side cap on ways returned. Must be >= MAX_BUILDINGS, and must exist at
 * all -- see the note on the query below.
 */
const FETCH_LIMIT = 1800

/** ring points kept per building; a footprint needs a silhouette, not detail */
const MAX_RING = 10

/**
 * Street classes worth drawing, and how prominent each is.
 *
 * Footways, cycleways, service roads and driveways are deliberately absent:
 * they roughly triple the way count, and at this scale they are noise filling
 * the gaps between blocks rather than structure you can read.
 */
const ROAD_RANK: Record<string, 0 | 1 | 2> = {
  motorway: 2,
  motorway_link: 2,
  trunk: 2,
  trunk_link: 2,
  primary: 2,
  primary_link: 2,
  secondary: 1,
  secondary_link: 1,
  tertiary: 1,
  tertiary_link: 1,
  residential: 0,
  unclassified: 0,
  living_street: 0,
}

/** points kept per street; enough for a curve, not a survey */
const MAX_PATH = 24

/** storeys to metres, for buildings tagged with levels but no height */
const METRES_PER_LEVEL = 3.2

/**
 * Fallback heights, in metres, for buildings carrying neither `height` nor
 * `building:levels` -- which in a small town is most of them.
 *
 * A flat 8m for everything makes a town render as 50 identical boxes, which
 * reads as a bug rather than as a place. These are rough real-world storey
 * counts by what the building IS, which is the one thing OSM almost always
 * does record.
 */
const TYPE_HEIGHT: Record<string, number> = {
  house: 6,
  detached: 6,
  bungalow: 4,
  garage: 3,
  garages: 3,
  shed: 3,
  hut: 3,
  cabin: 4,
  residential: 9,
  apartments: 15,
  dormitory: 15,
  hotel: 18,
  commercial: 11,
  retail: 8,
  supermarket: 9,
  office: 14,
  industrial: 12,
  warehouse: 11,
  school: 9,
  university: 14,
  hospital: 18,
  church: 16,
  cathedral: 28,
  chapel: 10,
  civic: 12,
  government: 16,
  public: 12,
  train_station: 12,
  stadium: 24,
  parking: 9,
}

/** last resort, when even the type is just "yes" */
const DEFAULT_HEIGHT = 7

/**
 * Overpass instances, tried in turn.
 *
 * The main instance is intermittent, not slow and not picky: measured here,
 * the SAME query eight times in a row gave 200, 504, 504, 429, 429, 200, 504,
 * 200 -- roughly two in five. A 504 from it means "ask again", which is why
 * askOverpass retries rather than giving up on the endpoint. The 429s are
 * self-inflicted: it allows two slots per IP and answers a third with one.
 */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  // listed on the OSM wiki with no rate limit of its own
  "https://overpass.private.coffee/api/interpreter",
]

/** Overpass rejects requests that do not identify themselves -- see postText. */
const USER_AGENT = "ags-desktop-shell/1.0 (weather panel city model)"
const CACHE_DIR = `${GLib.get_user_cache_dir()}/ags`

export type Building = {
  /** footprint in local metres east/north of centre: [x0, y0, x1, y1, ...] */
  ring: number[]
  /** metres */
  height: number
}

/** A street, as a polyline in local metres: [x0, y0, x1, y1, ...] */
export type Road = {
  path: number[]
  /** 0 minor .. 2 major; drives how brightly it is drawn */
  rank: 0 | 1 | 2
}

export type City = {
  buildings: Building[]
  roads: Road[]
  /** half-width of the modelled square, metres */
  radius: number
  /** tallest building, metres -- the vertical scale the widget normalises to */
  tallest: number
  label: string
  /**
   * Set on the generated town: shown, but never written to the cache.
   *
   * The cache is forever, and the generated town is what you get when Overpass
   * would not talk to us -- which is a bad afternoon, not a fact about where
   * you live. Caching it would freeze one outage into every later start.
   */
  provisional?: boolean
}

/**
 * Which model the current fix wants.
 *
 * No radius in it: the radius is chosen adaptively per location now, so it is
 * an OUTPUT of the fetch rather than an input to it.
 *
 * Doubles as the identity the producer below compares against, which is why it
 * is its own function -- "have we already modelled where we are" and "where
 * would that model be on disk" have to agree, and they only reliably agree if
 * they are the same string.
 */
function cacheKey(): string {
  const { latitude, longitude } = currentFix()
  return `${latitude.toFixed(3)}_${longitude.toFixed(3)}`
}

function cachePath(): string {
  return `${CACHE_DIR}/city-${cacheKey()}.json`
}

function readCache(): City | null {
  try {
    const [ok, bytes] = GLib.file_get_contents(cachePath())
    if (!ok) return null
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    return Array.isArray(parsed?.buildings) ? (parsed as City) : null
  } catch {
    return null
  }
}

function writeCache(city: City) {
  try {
    GLib.mkdir_with_parents(CACHE_DIR, 0o755)
    GLib.file_set_contents(cachePath(), JSON.stringify(city))
  } catch (error) {
    console.warn("city: could not cache:", error)
  }
}

/** "15", "15 m", "15.5" -> metres; anything else -> null */
function parseHeight(raw: unknown): number | null {
  if (typeof raw !== "string") return null
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Footprint area in square metres, by the shoelace formula. */
function ringArea(ring: number[]): number {
  let sum = 0
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length
    sum += ring[i] * ring[j + 1] - ring[j] * ring[i + 1]
  }
  return Math.abs(sum) / 2
}

function heightOf(tags: Record<string, string> | undefined, area: number): number {
  const explicit = parseHeight(tags?.["height"]) ?? parseHeight(tags?.["building:height"])
  if (explicit) return explicit

  const levels = parseHeight(tags?.["building:levels"])
  if (levels) return levels * METRES_PER_LEVEL

  const byType = TYPE_HEIGHT[tags?.["building"] ?? ""]
  if (byType) return byType

  //  Nothing but `building=yes`. Footprint area is a weak but real signal --
  //  a 2000m² building is not a shed -- so this leans on it gently rather than
  //  giving every untagged structure the same box.
  const scaled = DEFAULT_HEIGHT * (0.75 + Math.min(1.9, Math.sqrt(area) / 26))
  return Math.max(3, scaled)
}

/**
 * POST a body and read the response, through Soup directly.
 *
 * NOT ags/fetch, and not for fun. gnim's fetch calls
 * `set_request_body_from_bytes(null, ...)` -- a null content type -- so a POST
 * goes out with no Content-Type header at all, and Overpass answers that with
 * 406 Not Acceptable no matter what you put in `headers`. The same query from
 * curl succeeds, which is what made it worth chasing rather than working
 * around. Soup is already the thing ags/fetch is built on; this just sets the
 * one field it leaves null.
 */
/**
 * Hard ceiling on a single request, in seconds.
 *
 * Without this the whole chain can stall forever: if Soup's callback never
 * fires -- a connection that hangs rather than refusing -- the promise neither
 * resolves nor rejects, and every fallback after it silently never runs. That
 * is exactly what happened here, and it looks identical to "still loading".
 */
const REQUEST_TIMEOUT_S = 45

function postText(url: string, body: string, contentType: string): Promise<string> {
  const session = new Soup.Session()

  //  REQUIRED. Soup sends no User-Agent by default, and Overpass answers a
  //  request without one with 406 Not Acceptable -- which is what every
  //  previous attempt here was hitting, through ags/fetch and through Soup
  //  alike. Their usage policy also asks that it identify the application,
  //  which is only fair for a free service being asked to do real work.
  session.user_agent = USER_AGENT
  const message = Soup.Message.new("POST", url)
  if (!message) return Promise.reject(new Error(`bad url: ${url}`))

  message.set_request_body_from_bytes(
    contentType,
    new GLib.Bytes(new TextEncoder().encode(body)),
  )

  return new Promise((resolve, reject) => {
    let settled = false

    const cancel = new Gio.Cancellable()

    const timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, REQUEST_TIMEOUT_S, () => {
      if (!settled) {
        settled = true
        cancel.cancel()
        reject(new Error(`timed out after ${REQUEST_TIMEOUT_S}s`))
      }
      return GLib.SOURCE_REMOVE
    })

    session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancel, (_s, res) => {
      if (settled) return
      settled = true
      GLib.source_remove(timer)

      try {
        const status = message.get_status()
        if (status !== Soup.Status.OK) {
          reject(new Error(`HTTP ${status}`))
          return
        }

        const bytes = session.send_and_read_finish(res)
        const data = bytes?.get_data()
        resolve(data ? new TextDecoder().decode(data) : "")
      } catch (error) {
        reject(error as Error)
      }
    })
  })
}

/** Promise wrapper around a GLib timeout, so backoff can be awaited. */
function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
      resolve()
      return GLib.SOURCE_REMOVE
    })
  })
}

/**
 * Seconds to wait after a full round of endpoints has failed.
 *
 * One entry per gap, so this also sets how many rounds there are. Spaced wide
 * on purpose: retrying a couple of seconds apart is what turns Overpass's 504s
 * into 429s, which are a real block rather than a hiccup. Three rounds across
 * two endpoints is six chances at roughly two-in-five each, which is enough.
 */
const BACKOFF_S = [4, 11]

/**
 * What to wait instead when an endpoint said 429 rather than 504.
 *
 * The OSM wiki's own figure: "If you receive an HTTP error code such as 429 or
 * 406, pause for 30 seconds before making a new request." A 504 is the server
 * being busy and is worth asking about again shortly; a 429 is the server
 * telling us to stop, and retrying inside four seconds is how a hiccup turns
 * into a block that outlasts the whole fetch.
 */
const RATE_LIMIT_PAUSE_S = 30

/**
 * Run a query, retrying until an Overpass instance answers it.
 *
 * A 504 here is transient -- the same query moments later succeeds -- so this
 * is a retry loop, not just a fallback chain.
 *
 * The endpoints are RACED, not queued. Asked in turn, the main instance fails
 * in about five seconds and the mirror then takes its full 45s to time out,
 * so one round costs fifty seconds and three rounds cost two and a half
 * minutes -- for a query that succeeds in four seconds whenever it succeeds
 * at all. Raced, a round costs whatever the FASTEST answer costs, and a
 * permanently slow mirror stops being a tax on every attempt.
 *
 * They are separate servers with separate rate limits, so asking both at once
 * spends one slot on each rather than two on either.
 */
async function askOverpass(query: string): Promise<string> {
  let last: unknown = null
  let rateLimited = false

  for (let round = 0; round <= BACKOFF_S.length; round++) {
    try {
      return await Promise.any(
        ENDPOINTS.map((endpoint) =>
          postText(endpoint, query, "text/plain").catch((error) => {
            console.warn(`city: ${endpoint} ->`, error)
            throw error
          }),
        ),
      )
    } catch (error) {
      //  AggregateError: every endpoint rejected this round.
      last = error
      rateLimited = String((error as AggregateError)?.errors ?? error).includes("429")
    }

    if (round < BACKOFF_S.length) {
      await sleep(rateLimited ? RATE_LIMIT_PAUSE_S : BACKOFF_S[round])
    }
  }

  throw last ?? new Error("no overpass endpoint answered")
}


// ============================================================================
//  SYNTHETIC TOWN
// ============================================================================
//  What gets drawn when OSM has little or nothing for where you are.
//
//  Most of the United States is not mapped building-by-building in OSM, and
//  Overpass answers a wide query over a rural county with a 504 rather than
//  with the handful of structures that are there. Either way the plate comes
//  out empty, which looks like a bug.
//
//  So: a plausible town, generated. This is honest for a reason particular to
//  American development -- suburban housing is built to a small number of
//  standard lot and setback dimensions, so a generic grid of 12x9m houses on
//  18x30m lots really does look like most towns, and a small commercial core
//  of taller boxes really is what sits at the middle of one.
//
//  Everything below is DETERMINISTIC, seeded from the coordinates. The same
//  place always generates the same town -- it is a stand-in, not a slideshow,
//  and one that reshuffled every restart would be worse than none.

/** standard-ish American suburban dimensions, metres */
const LOT_W = 18
const LOT_D = 30
const HOUSE_W = 12
const HOUSE_D = 9
const ROAD_W = 12
/** blocks are this many lots across before the next street */
const LOTS_PER_BLOCK = 6

/** seeded 0..1 */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** an axis-aligned box footprint, as the ring format the renderer wants */
function boxRing(cx: number, cy: number, w: number, d: number): number[] {
  const hw = w / 2
  const hd = d / 2
  return [cx - hw, cy - hd, cx + hw, cy - hd, cx + hw, cy + hd, cx - hw, cy + hd]
}

function syntheticTown(radius: number, seed: number, label: string): City {
  const buildings: Building[] = []
  const roads: Road[] = []

  const blockW = LOT_W * LOTS_PER_BLOCK + ROAD_W
  const blockD = LOT_D * 2 + ROAD_W

  //  The streets the blocks are laid out against. Drawn explicitly rather than
  //  left as the gaps between buildings -- a grid you can only infer from the
  //  spaces reads as a circuit board, not a town.
  for (let y = -radius; y <= radius; y += blockD) {
    roads.push({ path: [-radius, y, radius, y], rank: 0 })
  }
  for (let x = -radius; x <= radius; x += blockW) {
    roads.push({ path: [x, -radius, x, radius], rank: 0 })
  }
  // one main street each way through the middle
  roads.push({ path: [-radius, 0, radius, 0], rank: 2 })
  roads.push({ path: [0, -radius, 0, radius], rank: 2 })

  let n = 0
  for (let by = -radius; by < radius; by += blockD) {
    for (let bx = -radius; bx < radius; bx += blockW) {
      // two facing rows of lots per block, backs to each other
      for (let row = 0; row < 2; row++) {
        const y = by + ROAD_W / 2 + LOT_D * (row + 0.5)

        for (let lot = 0; lot < LOTS_PER_BLOCK; lot++) {
          const x = bx + ROAD_W / 2 + LOT_W * (lot + 0.5)
          if (Math.hypot(x, y) > radius) continue

          const r = rand(++n + seed)

          // a fifth of lots are empty -- parks, corner stores, the ones that
          // never got built on. A perfectly full grid reads as a circuit board.
          if (r < 0.2) continue

          // houses face the street, so alternate rows are rotated
          const w = row ? HOUSE_W : HOUSE_D
          const d = row ? HOUSE_D : HOUSE_W

          // jitter within the setback, so the rows are regular but not ruled
          const jx = (rand(n * 3.1 + seed) - 0.5) * 2.5
          const jy = (rand(n * 7.3 + seed) - 0.5) * 2.5

          // single storey mostly, two storey often enough to break the skyline
          const storeys = r < 0.62 ? 1 : 2
          const height = storeys * 3.2 + rand(n * 5.7 + seed) * 1.2

          buildings.push({ ring: boxRing(x + jx, y + jy, w, d), height })
        }
      }
    }
  }

  // ---- a small commercial core ----
  //  Every American town of any size has four to six blocks of two-to-five
  //  storey main street at its middle, and it is what stops the model reading
  //  as an endless identical subdivision.
  const coreR = Math.min(radius * 0.3, 260)
  for (let i = 0; i < 26; i++) {
    const a = rand(i * 11.7 + seed) * Math.PI * 2
    const rr = Math.sqrt(rand(i * 4.9 + seed)) * coreR
    const x = Math.cos(a) * rr
    const y = Math.sin(a) * rr

    const w = 20 + rand(i * 2.3 + seed) * 26
    const d = 16 + rand(i * 8.1 + seed) * 22
    // two to five storeys, with one or two reaching a little higher
    const height = 7 + rand(i * 6.6 + seed) * 12 + (rand(i * 9.4 + seed) > 0.85 ? 14 : 0)

    buildings.push({ ring: boxRing(x, y, w, d), height })
  }

  //  Thin evenly if the grid overshot what we can draw. Every Nth rather than
  //  the tallest: keeping the tallest of a uniform subdivision would delete the
  //  houses and leave only the commercial core floating in space.
  let kept = buildings
  if (buildings.length > MAX_BUILDINGS) {
    const stride = Math.ceil(buildings.length / MAX_BUILDINGS)
    kept = buildings.filter((_, i) => i % stride === 0)
  }

  const tallest = kept.reduce((m, b) => Math.max(m, b.height), 1)

  return {
    buildings: kept,
    roads,
    radius,
    tallest,
    // said plainly. A generated town presented as the real one would be a lie.
    label: `${label} · MODEL`,
    provisional: true,
  }
}


// ============================================================================
//  FINDING SOMEWHERE WORTH MODELLING
// ============================================================================
//  Most of the United States is not mapped building-by-building in OSM, so the
//  box around a small town comes back with a few dozen structures and renders
//  as an empty plate.
//
//  Rather than invent a town, go and find a real one. Overpass knows where the
//  places are: every city and town is a `place` node carrying a name and
//  usually a population. So when home is too thin, this asks what is nearby,
//  picks the best candidate, and models that instead -- labelled with its name
//  and how far away it is, so it is never passed off as your street.

/** how far to look for somewhere with real coverage */
const NEARBY_RADIUS_M = 70_000

export type Place = {
  name: string
  latitude: number
  longitude: number
  population: number
  /** kilometres from home */
  distanceKm: number
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dy = (bLat - aLat) * 111.32
  const dx = (bLon - aLon) * 111.32 * Math.cos((aLat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

async function fetchNearbyPlaces(): Promise<Place[]> {
  const { latitude, longitude } = currentFix()

  const query =
    `[out:json][timeout:25];` +
    `node["place"~"^(city|town)$"](around:${NEARBY_RADIUS_M},${latitude},${longitude});` +
    `out body 80;`

  try {
    const text = await askOverpass(query)
    const { elements } = JSON.parse(text)
    if (!Array.isArray(elements)) return []

    return elements
      .map((el: any): Place | null => {
        const name = el?.tags?.name
        if (!name || typeof el.lat !== "number" || typeof el.lon !== "number") return null

        // population is a free-text tag; "1,234" and "" both turn up
        const population = parseInt(String(el.tags.population ?? "0").replace(/[^0-9]/g, ""), 10) || 0

        return {
          name,
          latitude: el.lat,
          longitude: el.lon,
          population,
          distanceKm: haversineKm(latitude, longitude, el.lat, el.lon),
        }
      })
      .filter((p): p is Place => p !== null)
  } catch (error) {
    console.warn("city: could not look up nearby places:", error)
    return []
  }
}

/**
 * Rank candidates by "worth modelling".
 *
 * Population alone sends you to the biggest city in the state regardless of
 * distance; distance alone sends you to the nearest hamlet, which has the same
 * coverage problem as home. Dividing by distance splits the difference -- a
 * city ten times the size is worth going several times as far for, which is
 * also roughly how people think about where "their" city is.
 */
function score(p: Place): number {
  return p.population / (1 + p.distanceKm / 20)
}

/**
 * Home, at whichever radius actually shows something.
 *
 * Walks HOME_RADII and returns the first box that fills the plate. If none
 * does, it returns the fullest one it got rather than nothing: a thin model of
 * your own town is still a candidate at step 3, and it is a better last resort
 * than a generated grid.
 *
 * A rung that comes back null is skipped rather than fatal. Overpass answers a
 * wide box over a sparsely mapped county with a 504 often enough that treating
 * one as "home has nothing" would send half these installs to the next city
 * over on a bad afternoon.
 */
/**
 * The town centre nearest home.
 *
 * The whole reason this exists: an IP fix is a guess at which town you are in,
 * not a point in it. ip-api puts this machine at 36.2130,-86.3011, which is a
 * FIELD -- zero buildings within the 320m the camera can actually see, while
 * the real centre of the same town, 1.2km away, has 42. The model was being
 * built around an empty paddock and then, reasonably, concluding there was no
 * town here and going to look at Nashville instead.
 *
 * So the model centres on the nearest OSM `place` node, which is where the
 * town actually is. The WEATHER still uses the raw fix -- that one is about
 * where you are standing, and a mile matters less to a forecast than to a
 * picture. Returns home unchanged if nothing is near enough to snap to.
 */
const SNAP_RADIUS_M = 8000

async function townCentre(): Promise<Fix> {
  const home = currentFix()

  const query =
    `[out:json][timeout:25];` +
    `node["place"~"^(city|town|village)$"](around:${SNAP_RADIUS_M},${home.latitude},${home.longitude});` +
    `out body 30;`

  try {
    const { elements } = JSON.parse(await askOverpass(query))
    if (!Array.isArray(elements) || !elements.length) return home

    let nearest: any = null
    let best = Infinity

    for (const el of elements) {
      if (typeof el?.lat !== "number" || typeof el?.lon !== "number") continue
      const d = haversineKm(home.latitude, home.longitude, el.lat, el.lon)
      if (d < best) {
        best = d
        nearest = el
      }
    }

    if (!nearest) return home

    //  Keep the label the IP gave us when it is the same town -- "LEBANON, TN"
    //  reads better than the bare "Lebanon" on the node. Only when we have
    //  snapped to somewhere genuinely different does the node get to rename it.
    const name = String(nearest.tags?.name ?? "")
    const sameTown = name && home.label.toUpperCase().includes(name.toUpperCase())

    console.info(`city: snapped to ${name || "place node"} ${best.toFixed(1)}km from the fix`)

    return {
      latitude: nearest.lat,
      longitude: nearest.lon,
      label: sameTown ? home.label : name.toUpperCase() || home.label,
    }
  } catch (error) {
    console.warn("city: could not find a town centre:", error)
    return home
  }
}

/**
 * How many buildings sit inside each of HOME_RADII, in ONE request.
 *
 * `out count` returns a tally instead of geometry, and Overpass takes several
 * output statements per query, so every candidate radius costs one small round
 * trip between them, in well under a second. Fetching each radius properly and
 * looking at what came back meant four full geometry requests against a server
 * that answers two in five and rate-limits the rest -- and most of them were
 * spent confirming a box was too small to use.
 *
 * Counted inside the circle the CAMERA can see, not the box we fetch. Those
 * are very different numbers -- the box is 900m across and the view is 320m --
 * and it is the visible one that decides whether the plate looks like a town.
 * Measured against the box, downtown Lebanon scores 52 and looks empty,
 * because all 52 are outside the view.
 */
async function probeHome(centre: Fix): Promise<number[]> {
  const { latitude, longitude } = centre

  const query =
    `[out:json][timeout:30];` +
    HOME_RADII.map(
      (radius) =>
        `way["building"](around:${Math.round(visibleRadius(radius))},${latitude},${longitude});out count;`,
    ).join("")

  const { elements } = JSON.parse(await askOverpass(query))
  if (!Array.isArray(elements)) throw new Error("probe returned no counts")

  return elements.map((el: any) => parseInt(el?.tags?.total ?? "0", 10) || 0)
}

/**
 * The tightest radius worth drawing, or null if home has nothing at any of them.
 *
 * Tightest rather than fullest: the widget scales the whole plate to the
 * radius, so a wider box draws the same town SMALLER. Past about 1600m a
 * 12m house is under three pixels across and the model stops reading as
 * buildings and starts reading as thin bright strips, which is why HOME_RADII
 * stops where it does rather than widening until the count looks good.
 */
function chooseRadius(counts: number[]): number | null {
  const full = HOME_RADII.findIndex((_, i) => counts[i] >= ENOUGH)
  if (full >= 0) return HOME_RADII[full]

  // no downtown here; take the widest view that still has a town in it
  for (let i = HOME_RADII.length - 1; i >= 0; i--) {
    if (counts[i] >= HOME_FLOOR) return HOME_RADII[i]
  }

  return null
}

type HomeAttempt = {
  /** the model, or null if home is genuinely too thin to draw */
  model: City | null
  /** we never got an answer, as opposed to getting a disappointing one */
  unreachable: boolean
}

async function fetchHome(): Promise<HomeAttempt> {
  const centre = await townCentre()

  let counts: number[]
  try {
    counts = await probeHome(centre)
  } catch (error) {
    console.warn("city: could not probe home:", error)
    return { model: null, unreachable: true }
  }

  console.info(
    `city: ${centre.label} visible buildings -- ` +
      HOME_RADII.map((r, i) => `${r}m:${counts[i] ?? 0}`).join(" "),
  )

  const radius = chooseRadius(counts)
  if (radius === null) return { model: null, unreachable: false }

  try {
    return {
      model: await fetchAt(radius, centre.latitude, centre.longitude, centre.label),
      unreachable: false,
    }
  } catch {
    return { model: null, unreachable: true } // already logged
  }
}

async function fetchCity(): Promise<City | null> {
  const home = currentFix()

  // ---- 1. where you actually are ----
  //  No second opinion on the result. fetchHome has already counted what the
  //  camera can see and picked a radius on it; re-testing the model here
  //  against a count of the whole fetched BOX is how a perfectly good
  //  downtown-Lebanon plate of 52 buildings used to lose to Nashville.
  const { model: local, unreachable } = await fetchHome()
  if (local) return local

  // ---- 2. the nearest place with real coverage ----
  //  Only once home cannot be drawn at any radius -- open country, or an area
  //  OSM has barely touched.
  //  Tried in rank order, because population is a proxy for OSM coverage and
  //  not a guarantee of it -- a city can still be thinly mapped.
  const places = (await fetchNearbyPlaces())
    .filter((p) => p.distanceKm > 2) // skip home itself
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3)

  for (const place of places) {
    const label = `${place.name.toUpperCase()} · ${Math.round(place.distanceKm)}KM`

    try {
      const candidate = await fetchAt(RADIUS_M, place.latitude, place.longitude, label)
      if (!candidate || candidate.buildings.length < ENOUGH) continue

      //  If home was merely unreachable, this is a stand-in for a question we
      //  never got to ask. Show it now; do not cache it. Overpass rate-limits
      //  per IP and a restart is the most likely thing to have used the slots
      //  up, so the next start is a genuinely better chance -- and caching this
      //  would settle for the neighbouring city permanently over one outage.
      return unreachable ? { ...candidate, provisional: true } : candidate
    } catch {
      continue // already logged
    }
  }

  // ---- 3. nothing real is reachable ----
  //  Last resort only. A generated grid is uniform in a way no real town is,
  //  so it is genuinely the worst of the three and is labelled as a model.
  //  Not cached either -- see `provisional`.
  const seed = Math.abs(home.latitude * 1000 + home.longitude * 7919)
  return syntheticTown(820, seed, home.label)
}

async function fetchAt(
  RADIUS_M: number,
  latitude: number,
  longitude: number,
  label: string,
): Promise<City | null> {

  // metres -> degrees. Longitude degrees shorten with latitude, so the box is
  // widened by 1/cos(lat) to stay square on the ground.
  const dLat = RADIUS_M / 111_320
  const dLon = dLat / Math.max(0.15, Math.cos((latitude * Math.PI) / 180))

  const south = latitude - dLat
  const north = latitude + dLat
  const west = longitude - dLon
  const east = longitude + dLon

  //  `out geom` inlines each way's node coordinates, so one request is enough --
  //  without it we would get node ids and have to resolve them separately.
  //
  //  The trailing count is NOT optional. Uncapped, a 2km box over a dense city
  //  is tens of thousands of ways and Overpass answers with a 504 rather than
  //  with buildings. Capping server-side means it stops looking once it has
  //  enough, which is the difference between a 40-second timeout and 500ms.
  //  Buildings AND streets in ONE request. Overpass is the slow part of this
  //  whole module and it is under no obligation to answer us at all, so asking
  //  twice for one picture is the wrong trade -- a union costs it barely more
  //  than the building query alone.
  const roadFilter = Object.keys(ROAD_RANK).join("|")
  const query =
    `[out:json][timeout:20];(` +
    `way["building"](${south},${west},${north},${east});` +
    `way["highway"~"^(${roadFilter})$"](${south},${west},${north},${east});` +
    `);out geom ${FETCH_LIMIT};`

  try {
    //  POSTed as the request body rather than passed as ?data=. The query is
    //  full of brackets, quotes and semicolons; URL-encoding it into a GET got
    //  a 400 from Overpass every time, and an uncapped one got a 504.
    const text = await askOverpass(query)
    const { elements } = JSON.parse(text)
    if (!Array.isArray(elements)) return null

    const mPerLat = 111_320
    const mPerLon = mPerLat * Math.cos((latitude * Math.PI) / 180)

    const buildings: Building[] = []
    const roads: Road[] = []

    /** lat/lon geometry -> local metres, thinned to at most `cap` points */
    function toLocal(geometry: any[], cap: number): number[] {
      const stride = Math.max(1, Math.floor(geometry.length / cap))
      const out: number[] = []
      for (let i = 0; i < geometry.length; i += stride) {
        const p = geometry[i]
        if (typeof p?.lat !== "number" || typeof p?.lon !== "number") continue
        out.push((p.lon - longitude) * mPerLon, (p.lat - latitude) * mPerLat)
      }
      // always keep the last point, or streets stop short of their junctions
      const last = geometry[geometry.length - 1]
      if (last && typeof last.lat === "number") {
        out.push((last.lon - longitude) * mPerLon, (last.lat - latitude) * mPerLat)
      }
      return out
    }

    for (const el of elements) {
      const geometry = el?.geometry
      if (!Array.isArray(geometry) || geometry.length < 2) continue

      const rank = ROAD_RANK[el?.tags?.highway ?? ""]
      if (rank !== undefined) {
        const path = toLocal(geometry, MAX_PATH)
        if (path.length >= 4) roads.push({ path, rank })
        continue
      }

      if (geometry.length < 3) continue
      const ring = toLocal(geometry, MAX_RING)
      if (ring.length < 6) continue

      buildings.push({ ring, height: heightOf(el.tags, ringArea(ring)) })
    }

    //  Keep the tallest, but only once there are more than we can draw.
    //
    //  Sorting by height and slicing was the first version and it was wrong:
    //  under the cap it still reordered everything, and over the cap it threw
    //  away every low building, which left scattered towers standing in empty
    //  space. A city reads as a city because of its FLOOR -- the low mass
    //  between the towers is most of what you are actually looking at.
    let kept = buildings
    if (buildings.length > MAX_BUILDINGS) {
      kept = buildings.slice().sort((a, b) => b.height - a.height).slice(0, MAX_BUILDINGS)
    }

    const tallest = kept.reduce((m, b) => Math.max(m, b.height), 1)

    if (!kept.length) {
      console.warn("city: no buildings found around these coordinates")
      return null
    }

    return { buildings: kept, roads, radius: RADIUS_M, tallest, label }
  } catch (error) {
    //  Rethrown, not swallowed into a null. "Overpass would not answer" and
    //  "there is nothing here" are the same value otherwise, and the caller
    //  has to tell them apart: one means your town is empty, the other means
    //  we are rate-limited and should try again next start rather than
    //  cementing somewhere else in the cache.
    console.warn("city:", error)
    throw error
  }
}

/**
 * The model, once it is known.
 *
 * `createExternal` rather than a poll: buildings do not move, so there is no
 * interval -- the only thing that can invalidate this model is YOU moving, and
 * state/location.ts says when that happens. The producer fires when the first
 * subscriber appears -- the first time the weather panel is opened, not at
 * startup, so a session that never opens it never makes the call.
 */
export const city = createExternal<City | null>(null, (set) => {
  let cancelled = false

  /**
   * The fix we have already modelled, or null for none yet.
   *
   * This was a plain `started` boolean, which is the same thing for an install
   * that never travels and wrong for one that does: once it flipped, a later
   * location change could not get a new skyline out of it. Holding the key
   * instead means a *different* fix re-attempts and the same fix still cannot
   * re-fetch, which is the property the boolean was actually there for.
   */
  let modelled: string | null = null

  /** Which attempt is allowed to publish; see the note in state/weather.ts. */
  let generation = 0

  /**
   * Fetch, but only once we know where we are, and only for somewhere new.
   *
   * On a first run the location is still being resolved when the panel opens,
   * and the fix reads as the fallback. Fetching then would model Greenwich,
   * cache it under Greenwich's key, and then sit there looking wrong -- so this
   * waits, and the location accessor wakes it when the real fix lands.
   */
  function attempt() {
    if (cancelled || !hasRealFix()) return

    const key = cacheKey()
    if (key === modelled) return
    modelled = key

    const mine = ++generation

    //  The old town's file is left where it is rather than cleaned up. It is a
    //  few hundred kilobytes, and coming home is then instant instead of
    //  another Overpass round trip.
    const cached = readCache()
    if (cached) {
      set(cached)
      return
    }

    fetchCity().then((fetched) => {
      //  The generation check is not paranoia here: fetchCity reads the fix at
      //  several points across its awaits and writeCache resolves the path at
      //  write time, so a fetch that straddles a move could otherwise file one
      //  town's buildings under the other town's key -- permanently, since this
      //  cache has no expiry.
      if (cancelled || mine !== generation || !fetched) return
      if (!fetched.provisional) writeCache(fetched)
      set(fetched)
    })
  }

  attempt()
  const unsubscribe = location.subscribe(attempt)

  return () => {
    cancelled = true
    unsubscribe()
  }
})
