import { validPoint } from './model'
import { parseRouteGeometry } from './validation'
import type {
  AddressResult,
  GeocodingService,
  MapArea,
  MapPoint,
  RouteGeometry,
  RoutingService,
} from './types'

type ServiceOptions = { apiKey: string; area: MapArea; fetch?: typeof globalThis.fetch }
type Feature = {
  properties?: Record<string, unknown>
  geometry?: { type: string; coordinates: unknown }
}
function address(feature: Feature, index = 0): AddressResult | null {
  const p = feature.properties ?? {}
  if (typeof p.lat !== 'number' || typeof p.lon !== 'number') return null
  const position = { latitude: Number(p.lat), longitude: Number(p.lon) }
  if (!validPoint(position) || typeof p.formatted !== 'string') return null
  return {
    id: String(p.place_id ?? `${position.latitude},${position.longitude}-${index}`),
    label: p.formatted,
    position,
    precision: String(p.result_type ?? 'unknown'),
  }
}
async function request(url: URL, signal: AbortSignal, fetcher: typeof fetch) {
  const response = await fetcher(url.toString(), {
    signal,
    referrerPolicy: 'strict-origin-when-cross-origin',
  })
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? 'Služba dosiahla limit požiadaviek. Skúste to neskôr.'
        : 'Geografická služba je momentálne nedostupná.',
    )
  return await response.json()
}
/** Browser keys must be restricted to the deployment's origins. No public Nominatim calls. */
export function createGeoapifyGeocoder(options: ServiceOptions): GeocodingService {
  const fetcher = options.fetch ?? globalThis.fetch
  const base = (path: string) => {
    const url = new URL(`https://api.geoapify.com/v1/geocode/${path}`)
    url.searchParams.set('apiKey', options.apiKey)
    url.searchParams.set('lang', 'sk')
    return url
  }
  return {
    attribution: 'Vyhľadávanie adries: Geoapify · OpenStreetMap',
    async search(text, signal) {
      if (text.trim().length < 3) return []
      const url = base('autocomplete'),
        [sw, ne] = options.area.bounds
      url.searchParams.set('text', text.trim())
      url.searchParams.set('limit', '5')
      url.searchParams.set('filter', 'countrycode:sk')
      url.searchParams.set(
        'bias',
        `rect:${sw.longitude},${sw.latitude},${ne.longitude},${ne.latitude}`,
      )
      const data = await request(url, signal, fetcher)
      return ((data.features ?? []) as Feature[]).flatMap((f, i) => {
        const result = address(f, i)
        return result ? [result] : []
      })
    },
    async reverse(point, signal) {
      const url = base('reverse')
      url.searchParams.set('lat', String(point.latitude))
      url.searchParams.set('lon', String(point.longitude))
      url.searchParams.set('limit', '1')
      const data = await request(url, signal, fetcher)
      return data.features?.[0] ? address(data.features[0]) : null
    },
  }
}
/** Optional candidate geometry; callers must not replace a published service with its result. */
export function createGeoapifyRouting(
  options: Pick<ServiceOptions, 'apiKey' | 'fetch'>,
): RoutingService {
  return {
    async route(points: readonly MapPoint[], profile, signal) {
      if (points.length < 2 || points.some((p) => !validPoint(p)))
        throw new Error('Trasa potrebuje aspoň dva platné body.')
      const url = new URL('https://api.geoapify.com/v1/routing')
      url.searchParams.set('apiKey', options.apiKey)
      url.searchParams.set('waypoints', points.map((p) => `${p.latitude},${p.longitude}`).join('|'))
      url.searchParams.set('mode', profile)
      const data = await request(url, signal, options.fetch ?? globalThis.fetch)
      const feature = data.features?.[0]
      if (
        !feature?.geometry ||
        !['LineString', 'MultiLineString'].includes(feature.geometry.type) ||
        !Number.isFinite(feature.properties?.distance) ||
        !Number.isFinite(feature.properties?.time)
      )
        throw new Error('Pre vybrané body sa nepodarilo nájsť cestnú trasu.')
      return {
        geometry: parseRouteGeometry(feature.geometry) as RouteGeometry,
        distanceMeters: feature.properties.distance,
        durationSeconds: feature.properties.time,
      }
    },
  }
}

/** Inject a contracted/self-hosted OSRM endpoint in production. Demo hosts have no SLA. */
export function createOsrmRouting(options: {
  endpoint: string
  fetch?: typeof globalThis.fetch
  intervalMs?: number
  /** Geographic display tolerance only, never permission to relocate an operational stop. */
  snapRadiusMeters?: number
}): RoutingService {
  let queue: Promise<unknown> = Promise.resolve()
  let previousStart = 0
  return {
    route(points, profile, signal) {
      const task = queue
        .catch(() => undefined)
        .then(async () => {
          signal.throwIfAborted()
          if (profile !== 'drive') throw new Error('Tento smerovač podporuje iba cestnú dopravu.')
          if (points.length < 2 || points.some((p) => !validPoint(p)))
            throw new Error('Trasa potrebuje aspoň dva platné body.')
          const delay = Math.max(0, (options.intervalMs ?? 1100) - (Date.now() - previousStart))
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
          signal.throwIfAborted()
          previousStart = Date.now()
          const coordinates = points.map((p) => `${p.longitude},${p.latitude}`).join(';')
          const url = new URL(
            `${options.endpoint.replace(/\/$/, '')}/route/v1/driving/${coordinates}`,
          )
          url.searchParams.set('geometries', 'geojson')
          url.searchParams.set('overview', 'full')
          url.searchParams.set('steps', 'false')
          url.searchParams.set('continue_straight', 'false')
          // Reject distant snapping rather than silently moving a stop to another village.
          url.searchParams.set(
            'radiuses',
            points.map(() => String(options.snapRadiusMeters ?? 100)).join(';'),
          )
          const data = await request(
            url,
            AbortSignal.any([signal, AbortSignal.timeout(25000)]),
            options.fetch ?? globalThis.fetch,
          )
          const route = data.routes?.[0]
          if (
            data.code !== 'Ok' ||
            !route ||
            !Number.isFinite(route.distance) ||
            !Number.isFinite(route.duration)
          )
            throw new Error('Pre vybrané zastávky sa nepodarilo nájsť cestnú trasu.')
          const geometry = parseRouteGeometry(route.geometry)
          if (!geometry) throw new Error('Cestná služba nevrátila priebeh trasy.')
          return {
            geometry,
            distanceMeters: route.distance,
            durationSeconds: route.duration,
          }
        })
      queue = task
      return task
    },
  }
}
