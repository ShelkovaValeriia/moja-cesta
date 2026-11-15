import type { AppState } from '../../../types'
import type { MapDataset, MapRoute, RouteGeometry } from '../types'
import { PRESOVSKY_KRAJ } from '../config'
import { roadRouteKey, routeLines } from '../model'
import { parseMapDataset, parseRouteGeometry } from '../validation'
import { publicRequestRoutes } from './request-adapter'
import { PILOT_LANDMARKS } from './landmarks'
import rawGeography from './pilot-geography.json'
import roads from './pilot-road-cache.json'
import road from './transfer-road.json'
import connection from './public-connection.json'

const geography = parseMapDataset(rawGeography)
const paths = Object.fromEntries(
  Object.entries(roads.paths).map(([key, value]) => [key, parseRouteGeometry(value.geometry)]),
) as Record<string, RouteGeometry>
const externalGeometry = parseRouteGeometry(road.geometry)!
const destination = { ...road.destination, status: 'external' as const }
export const PILOT_DEMO_DATE = connection.date

/** Active demo contains geographic points only from the old feed, never its public routes. */
export function createPilotDemo(state: AppState): MapDataset {
  const base: MapDataset = {
    ...geography,
    area: { ...PRESOVSKY_KRAJ, focusLocations: geography.area.focusLocations },
    stops: [...geography.stops, destination],
    landmarks: PILOT_LANDMARKS,
    routes: [],
  }
  const hub = base.stops.find((s) => s.municipality === 'Spišská Stará Ves')!
  const routes: MapRoute[] = []
  for (const [index, village] of geography.area.focusLocations
    .filter((p) => p.kind !== 'city')
    .entries()) {
    const stop = base.stops.find((s) => s.municipality === village.name)!
    for (const reverse of [false, true]) {
      const from = reverse ? hub : stop,
        to = reverse ? stop : hub
      const route: MapRoute = {
        id: `demo:managed:${village.id}:${reverse ? 'back' : 'out'}`,
        code: `M${index + 1}`,
        name: 'Moja Cesta · ukážkový spoj',
        direction: `${from.municipality} → ${to.municipality}`,
        kind: 'fixed',
        geometrySource: 'schematic',
        serviceDates: [connection.date],
        departures: [{ date: connection.date, time: reverse ? '14:00' : '09:30' }],
        stops: [
          { occurrenceId: 'pickup', stopId: from.id, time: reverse ? '14:00' : '09:30' },
          { occurrenceId: 'dropoff', stopId: to.id, time: reverse ? '14:40' : '10:10' },
        ],
        demoNote:
          'Ukážkový cestovný poriadok našej dopravy. Časy a zastávky sú scenár demonštrácie, nie publikovaná ani rezervovaná služba.',
      }
      const geometry = paths[roadRouteKey(route, base.stops)]
      if (geometry) {
        route.geometry = geometry
        route.geometrySource = 'computed'
      }
      routes.push(route)
      if (!reverse && geometry) {
        const segments = [
          {
            id: `${route.id}:feeder`,
            code: route.code,
            kind: 'fixed' as const,
            name: `Moja Cesta · ${village.name} → Spišská Stará Ves`,
            geometry,
            departure: '09:30',
            arrival: '10:10',
            demo: true,
          },
          {
            id: 'web:public-poprad',
            code: connection.code,
            kind: 'external' as const,
            name: 'SAD Poprad · Spišská Stará Ves → Poprad',
            geometry: externalGeometry,
            departure: connection.departure,
            arrival: connection.arrival,
            demo: false,
            sourceUrl: connection.sourceUrls[0],
            timetableStops: connection.stops.map(([name, time]) => ({ name, time })),
          },
        ]
        routes.push({
          ...route,
          id: `demo:transfer:${village.id}`,
          code: `T${index + 1}`,
          name: 'Ukážka s prestupom',
          direction: `${village.name} → Poprad`,
          segments,
          stops: [
            ...route.stops,
            { occurrenceId: 'destination', stopId: destination.id, time: connection.arrival },
          ],
          geometry: {
            type: 'MultiLineString',
            coordinates: segments.flatMap((s) =>
              routeLines(s).map((line) => line.map((p) => [p.longitude, p.latitude])),
            ),
          },
          demoNote:
            'Ukážka na 16. 11. 2026. Prestup v Spišskej Starej Vsi: príchod naším ukážkovým spojom 10:10, verejný autobus 10:30. Rezerva 20 minút je iba súčasť scenára. V Reľove autobus pokračuje bez ďalšieho prestupu. Miesto u dopravcu nie je rezervované. Cestný priebeh je vypočítaný, nie overený dopravcom.',
        })
      }
    }
  }
  for (const route of publicRequestRoutes(state, base)) {
    const geometry = paths[roadRouteKey(route, base.stops)]
    routes.push(geometry ? { ...route, geometry, geometrySource: 'computed' } : route)
  }
  // Put complete journeys first; selecting remains an explicit user action.
  return {
    ...base,
    routes: [...routes.filter((r) => r.segments), ...routes.filter((r) => !r.segments)],
  }
}
