import type { AppState, RideRequest, Trip } from '../types'
import { REGION_BOUNDS } from '../places'
import {
  createOsrmRouting,
  type MapDataset,
  type MapRoute,
  type MapStop,
  type RoutingService,
} from '../modules/transport-map'

/** Application projection: never pass the store, bookings or passenger profiles to the map. */
export function stopDataset(stops: AppState['stops']): MapDataset {
  const publicStops: MapStop[] = stops.flatMap((stop) =>
    Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)
      ? [
          {
            id: stop.id,
            name: stop.name,
            municipality: stop.village,
            position: { latitude: stop.latitude!, longitude: stop.longitude! },
            status: 'demo' as const,
          },
        ]
      : [],
  )
  return {
    name: 'Moja Cesta · demonštračné údaje',
    demo: true,
    area: {
      id: 'moja-cesta-zamagurie',
      name: 'Zamagurie · Prešovský kraj',
      bounds: [
        { latitude: REGION_BOUNDS[0][0], longitude: REGION_BOUNDS[0][1] },
        { latitude: REGION_BOUNDS[1][0], longitude: REGION_BOUNDS[1][1] },
      ],
      focusLocations: publicStops
        .filter(
          (stop, index, all) =>
            all.findIndex((s) => s.municipality === stop.municipality) === index,
        )
        .map((stop) => ({
          id: `municipality:${stop.municipality}`,
          name: stop.municipality,
          position: stop.position,
          kind: 'demo',
        })),
    },
    stops: publicStops,
    routes: [],
  }
}

/** Public requests use shared stop positions, never requested residential points or their labels. */
export function requestDataset(
  stops: AppState['stops'],
  requests: readonly RideRequest[],
): MapDataset {
  const base = stopDataset(stops)
  return {
    ...base,
    routes: requests.flatMap((request): MapRoute[] => {
      const from = base.stops.find((s) => s.id === request.from),
        to = base.stops.find((s) => s.id === request.to)
      if (!from || !to || !['pending', 'approved'].includes(request.status)) return []
      return [
        {
          id: `request:${request.id}`,
          code: 'Flex',
          name: `${from.municipality} → ${to.municipality}`,
          direction: `${from.name} → ${to.name}`,
          kind: 'flex',
          geometrySource: 'computed',
          stops: [
            { stopId: from.id, occurrenceId: 'from' },
            { stopId: to.id, occurrenceId: 'to' },
          ],
          serviceDates: [request.date],
          request: {
            id: request.id,
            date: request.date,
            time: request.time,
            timeMode: request.timeMode,
            passengers: request.passengers,
            status: request.status as 'pending' | 'approved',
          },
        },
      ]
    }),
  }
}

/** Only call this at the authorized driver boundary, after selecting an assigned trip. */
export function tripDataset(stops: AppState['stops'], trip?: Trip): MapDataset {
  const base = stopDataset(stops)
  if (!trip) return base
  const ordered = trip.stops.map((visit, index): MapStop | null => {
    const known = base.stops.find((s) => s.id === visit.stopId)
    if (visit.place)
      return {
        id: `${trip.id}:${index}`,
        name: visit.place.name,
        municipality: known?.municipality ?? '',
        position: { latitude: visit.place.latitude, longitude: visit.place.longitude },
        status: 'demo',
      }
    return known ? { ...known, id: `${trip.id}:${index}` } : null
  })
  // Do not invent coordinates or connect across an unlocated intermediate stop.
  if (ordered.length < 2 || ordered.some((s) => !s))
    return { ...base, stops: ordered.filter((s): s is MapStop => !!s) }
  const located = ordered as MapStop[]
  return {
    ...base,
    stops: located,
    routes: [
      {
        id: trip.id,
        code: trip.line,
        name: `${located[0].name} → ${located.at(-1)!.name}`,
        direction: trip.kind === 'fixed' ? 'Pravidelná jazda' : 'Flexibilná jazda',
        kind: trip.kind,
        geometrySource: 'computed',
        serviceDates: [trip.date],
        stops: located.map((s, i) => ({
          stopId: s.id,
          occurrenceId: `${trip.id}:${i}`,
          time: trip.stops[i].time,
        })),
      },
    ],
  }
}

const endpoint = import.meta.env.VITE_MAP_OSRM_URL || 'https://router.project-osrm.org'
// The existing synthetic stop positions are approximate (the hub is ~204 m from its road).
// This display-only tolerance does not alter pickup coordinates or approve any stop.
const roadService = createOsrmRouting({ endpoint, snapRadiusMeters: 300 })
const roadCache = new Map<string, Awaited<ReturnType<RoutingService['route']>>>()
/** Public demo roads are optional; private pickup coordinates require an explicitly configured service. */
export function applicationRouting(publicStops: AppState['stops']): RoutingService {
  const allowed = new Set(publicStops.map((s) => `${s.latitude},${s.longitude}`))
  return {
    async route(points, profile, signal) {
      if (
        !points.every((p) => allowed.has(`${p.latitude},${p.longitude}`)) &&
        !(import.meta.env.VITE_MAP_OSRM_URL && import.meta.env.VITE_MAP_PRIVATE_ROUTING === 'true')
      )
        throw new Error('Pre neverejné body nie je nakonfigurovaný smerovač.')
      const key = `${profile}:${points.map((p) => `${p.latitude},${p.longitude}`).join(';')}`
      if (roadCache.has(key)) return roadCache.get(key)!
      const result = await roadService.route(points, profile, signal)
      if (roadCache.size >= 1000) roadCache.clear()
      roadCache.set(key, result)
      return result
    },
  }
}
