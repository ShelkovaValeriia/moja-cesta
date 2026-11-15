import type { JourneyPlace, SearchQuery, Stop, Trip } from './types'
export const REGION_CENTER: [number, number] = [49.383, 20.367]
export const REGION_BOUNDS: [[number, number], [number, number]] = [
  [49.25, 20.2],
  [49.49, 20.64],
]
/** Approximate demo stop locations, not surveyed boarding coordinates. */
export const DEMO_STOP_COORDINATES: Record<string, [number, number]> = {
  mat: [49.354, 20.361],
  ssv: [49.383, 20.366],
  school: [49.3818, 20.3653],
  hal: [49.371, 20.436],
  cer: [49.394, 20.414],
  lech: [49.39, 20.443],
}
export function validPlace(value: unknown): value is JourneyPlace {
  if (!value || typeof value !== 'object') return false
  const p = value as JourneyPlace
  return (
    (p.type === 'custom' || (p.type === 'stop' && typeof p.stopId === 'string')) &&
    typeof p.name === 'string' &&
    p.name.length > 0 &&
    p.name.length <= 200 &&
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    p.latitude >= -90 &&
    p.latitude <= 90 &&
    p.longitude >= -180 &&
    p.longitude <= 180
  )
}
export const inRegion = (lat: number, lng: number) =>
  lat >= REGION_BOUNDS[0][0] &&
  lat <= REGION_BOUNDS[1][0] &&
  lng >= REGION_BOUNDS[0][1] &&
  lng <= REGION_BOUNDS[1][1]
export const coordinates = (p: Pick<JourneyPlace, 'latitude' | 'longitude'>) =>
  `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`
export const customPlace = (latitude: number, longitude: number, name = ''): JourneyPlace => ({
  type: 'custom',
  latitude: Number(latitude.toFixed(6)),
  longitude: Number(longitude.toFixed(6)),
  name: name.trim().slice(0, 200) || 'Vybrané miesto na mape',
})
export function stopPlace(stop: Stop | undefined): JourneyPlace | undefined {
  return stop && typeof stop.latitude === 'number' && typeof stop.longitude === 'number'
    ? {
        type: 'stop',
        latitude: stop.latitude,
        longitude: stop.longitude,
        name: stop.name,
        stopId: stop.id,
      }
    : undefined
}
export function distanceMeters(
  a: Pick<JourneyPlace, 'latitude' | 'longitude'>,
  b: Pick<JourneyPlace, 'latitude' | 'longitude'>,
) {
  const rad = (n: number) => (n * Math.PI) / 180,
    lat = rad(b.latitude - a.latitude),
    lng = rad(b.longitude - a.longitude),
    h =
      Math.sin(lat / 2) ** 2 +
      Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(lng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}
export function nearestStop(stops: Stop[], place: JourneyPlace) {
  return stops
    .flatMap((stop) => {
      const p = stopPlace(stop)
      return p ? [{ stop, distance: distanceMeters(place, p) }] : []
    })
    .sort((a, b) => a.distance - b.distance)[0]
}
export function selectJourneyPlace(
  q: SearchQuery,
  side: 'from' | 'to',
  place: JourneyPlace,
  stops: Stop[],
): SearchQuery {
  const stop =
    place.type === 'stop'
      ? stops.find((s) => s.id === place.stopId)
      : nearestStop(stops, place)?.stop
  return {
    ...q,
    [side]: stop?.id ?? '',
    [`${side}Place`]: place,
    [`${side}StopConfirmed`]: place.type === 'stop',
  }
}
export const regularStopsAccepted = (
  q: Pick<SearchQuery, 'fromPlace' | 'toPlace' | 'fromStopConfirmed' | 'toStopConfirmed'>,
) =>
  [
    q.fromPlace?.type === 'custom' ? q.fromStopConfirmed === true : true,
    q.toPlace?.type === 'custom' ? q.toStopConfirmed === true : true,
  ].every(Boolean)
export const hasCustomPlaces = (value: { fromPlace?: JourneyPlace; toPlace?: JourneyPlace }) =>
  value.fromPlace?.type === 'custom' || value.toPlace?.type === 'custom'
export function samePlace(a: JourneyPlace | undefined, b: JourneyPlace | undefined) {
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    a.type === b.type &&
    a.stopId === b.stopId &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude
  )
}
export const tripPointId = (stopId: string, place?: JourneyPlace) =>
  place?.type === 'custom'
    ? `point:${place.latitude.toFixed(6)},${place.longitude.toFixed(6)}`
    : stopId
export const tripPointName = (trip: Trip, stopId: string, fallback: string) =>
  trip.stops.find((s) => s.stopId === stopId)?.place?.name ?? fallback
