import type {
  MapBounds,
  MapDataset,
  MapFilters,
  MapPoint,
  MapRoute,
  MapSelection,
  MapStop,
} from './types'

export const normalizeText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sk')
    .trim()
export const validPoint = (p: MapPoint) =>
  Number.isFinite(p.latitude) &&
  Number.isFinite(p.longitude) &&
  Math.abs(p.latitude) <= 90 &&
  Math.abs(p.longitude) <= 180
export const pointKey = (p: MapPoint) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`
export const formatPoint = (p: MapPoint) => `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`
export const formatStopCount = (count: number) =>
  `${count} ${count === 1 ? 'zastávka' : count >= 2 && count <= 4 ? 'zastávky' : 'zastávok'}`
export const formatPatternCount = (count: number) =>
  `${count} ${count === 1 ? 'smerový variant' : count >= 2 && count <= 4 ? 'smerové varianty' : 'smerových variantov'}`
export function routeStops(route: MapRoute, stops: readonly MapStop[]) {
  return route.stops.flatMap((occurrence, index) => {
    const stop = stops.find((s) => s.id === occurrence.stopId)
    return stop ? [{ ...occurrence, index, stop }] : []
  })
}
/** Managed stops use route-order numbers, never invented place names. */
export function stopLabel(route: MapRoute, index: number, stop: MapStop) {
  return route.kind === 'external' ? stop.name : `Zastávka ${index + 1}`
}
export function roadRouteKey(route: MapRoute, stops: readonly MapStop[]) {
  return routeStops(route, stops)
    .map(({ stop }) => pointKey(stop.position))
    .join('|')
}
export function filterRoutes(dataset: MapDataset, filters: MapFilters) {
  const words = normalizeText(filters.query).split(/\s+/).filter(Boolean)
  return dataset.routes.filter((route) => {
    const stops = routeStops(route, dataset.stops)
    const text = normalizeText(
      [
        route.code,
        route.name,
        route.direction,
        ...(route.segments?.flatMap((s) => [
          s.code,
          s.name,
          ...(s.timetableStops?.map((stop) => stop.name) ?? []),
        ]) ?? []),
        ...stops.flatMap(({ stop }) => [stop.name, stop.municipality]),
      ].join(' '),
    )
    return (
      (filters.layer !== 'requests' || !!route.request) &&
      (filters.layer !== 'routes' || !route.request) &&
      (filters.kind === 'all' ||
        route.kind === filters.kind ||
        route.segments?.some((s) => s.kind === filters.kind)) &&
      (!filters.municipality ||
        stops.some(({ stop }) => stop.municipality === filters.municipality)) &&
      (!filters.date || route.serviceDates?.includes(filters.date) === true) &&
      (!(filters.timeFrom || filters.timeTo) || matchesTime(route, filters)) &&
      words.every((word) => text.includes(word))
    )
  })
}
export function matchesTime(route: MapRoute, filters: MapFilters) {
  const start = filters.timeFrom || '00:00',
    end = filters.timeTo || '23:59'
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) ||
    start > end
  )
    return false
  const entries = route.request
    ? [{ date: route.request.date, time: route.request.time }]
    : (route.departures ?? [])
  return entries.some(
    (entry) =>
      (!filters.date || filters.date === entry.date) && entry.time >= start && entry.time <= end,
  )
}
/** Stable across filtering and selection. Reverse directions of one bus line share its color. */
export function routeColor<T extends { code: string }>(route: T) {
  let hash = 0
  for (const char of route.code) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return `hsl(${((hash * 137.508) % 360).toFixed(2)}, 82%, 43%)`
}
/** Distinct vehicles/legs within one selected journey must remain easy to tell apart. */
export const segmentColor = (index: number) =>
  ['#146de0', '#e56800', '#8538c7', '#007e67', '#d11d61'][index % 5]
/** Render stops on the line without moving their authoritative geographic coordinates. */
export function stopDisplayPoint(route: MapRoute, point: MapPoint): MapPoint {
  let best = point,
    minimum = Infinity
  const scale = Math.cos((point.latitude * Math.PI) / 180)
  for (const line of routeLines(route))
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i]
      const dx = (b.longitude - a.longitude) * scale,
        dy = b.latitude - a.latitude
      const t =
        dx || dy
          ? Math.max(
              0,
              Math.min(
                1,
                ((point.longitude - a.longitude) * scale * dx +
                  (point.latitude - a.latitude) * dy) /
                  (dx * dx + dy * dy),
              ),
            )
          : 0
      const candidate = {
        latitude: a.latitude + t * (b.latitude - a.latitude),
        longitude: a.longitude + t * (b.longitude - a.longitude),
      }
      const distance = Math.hypot(
        (candidate.longitude - point.longitude) * scale,
        candidate.latitude - point.latitude,
      )
      if (distance < minimum) {
        minimum = distance
        best = candidate
      }
    }
  return best
}
export function routeLines(route: Pick<MapRoute, 'geometry'>): MapPoint[][] {
  // Missing geometry is a routing task, never a straight line across buildings/fields.
  if (!route.geometry) return []
  const lines =
    route.geometry.type === 'LineString'
      ? [route.geometry.coordinates as number[][]]
      : (route.geometry.coordinates as number[][][])
  return lines.map((line) => line.map(([longitude, latitude]) => ({ latitude, longitude })))
}
export function boundsOf(points: readonly MapPoint[]): MapBounds | null {
  const valid = points.filter(validPoint)
  if (!valid.length) return null
  return [
    {
      latitude: Math.min(...valid.map((p) => p.latitude)),
      longitude: Math.min(...valid.map((p) => p.longitude)),
    },
    {
      latitude: Math.max(...valid.map((p) => p.latitude)),
      longitude: Math.max(...valid.map((p) => p.longitude)),
    },
  ]
}
export function boundsOfRoutes(routes: readonly MapRoute[], stops: readonly MapStop[]) {
  return boundsOf(
    routes.flatMap((r) => [
      ...routeLines(r).flat(),
      ...routeStops(r, stops).map(({ stop }) => stop.position),
    ]),
  )
}
export function validSelection(dataset: MapDataset, selection: MapSelection): MapSelection {
  const route = dataset.routes.find((r) => r.id === selection.routeId)
  return {
    routeId: route?.id ?? null,
    stopOccurrenceId: route?.stops.some((s) => s.occurrenceId === selection.stopOccurrenceId)
      ? selection.stopOccurrenceId
      : null,
    place: selection.place && validPoint(selection.place.position) ? selection.place : null,
  }
}
type XY = { x: number; y: number }
function segmentDistance(p: XY, a: XY, b: XY) {
  const dx = b.x - a.x,
    dy = b.y - a.y
  const t =
    dx || dy
      ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
      : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
/** Resolve every route under the pointer, not just the uppermost painted SVG path. */
export function routesAtPoint(
  routes: readonly MapRoute[],
  point: MapPoint,
  project: (point: MapPoint) => XY,
  tolerance = 14,
) {
  const p = project(point)
  return routes.filter((route) =>
    routeLines(route).some((line) =>
      line.some(
        (b, i) => i > 0 && segmentDistance(p, project(line[i - 1]), project(b)) <= tolerance,
      ),
    ),
  )
}
