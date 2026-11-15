import { roadRouteKey } from '../model'
import { parseRouteGeometry } from '../validation'
import type { MapDataset, RouteGeometry } from '../types'
import cached from './road-cache.json'

const paths = Object.fromEntries(
  Object.entries(cached.paths).map(([key, value]) => [key, parseRouteGeometry(value.geometry)]),
) as Record<string, RouteGeometry>

/** Source GTFS stays intact; computed candidates never overwrite published shapes. */
export function withPilotRoads(dataset: MapDataset): MapDataset {
  return {
    ...dataset,
    routes: dataset.routes.map((route) => {
      const geometry = paths[roadRouteKey(route, dataset.stops)]
      return !route.geometry && geometry
        ? { ...route, geometry, geometrySource: 'computed' }
        : route
    }),
  }
}
