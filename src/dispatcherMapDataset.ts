import { stopDataset, tripDataset } from './maps/applicationMap'
import { validPoint } from './modules/transport-map/model'
import type { MapDataset, MapStop } from './modules/transport-map'
import type { AppState, RideRequest, Trip } from './types'

export type DispatcherMapRoute =
  { kind: 'trip'; value: Trip } | { kind: 'request'; value: RideRequest }

/** Dispatcher-only projection. Profiles, bookings and operational mutations stay outside the map. */
export function dispatcherMapDataset(
  state: Pick<AppState, 'stops' | 'trips'>,
  route: DispatcherMapRoute,
): MapDataset {
  if (route.kind === 'trip') return tripDataset(state.stops, route.value)
  const request = route.value
  const assigned =
    request.status === 'approved'
      ? state.trips.find((trip) => trip.id === request.tripId)
      : undefined
  if (assigned) return tripDataset(state.stops, assigned)

  const base = stopDataset(state.stops)
  const id = `request:${request.id}`
  const endpoints = (['from', 'to'] as const).map((side): MapStop | null => {
    const known = base.stops.find((stop) => stop.id === request[side])
    const place = side === 'from' ? request.fromPlace : request.toPlace
    const position = place
      ? { latitude: place.latitude, longitude: place.longitude }
      : known?.position
    if (!position || !validPoint(position)) return null
    return {
      id: `${id}:${side}`,
      name: place?.name ?? known!.name,
      municipality: known?.municipality ?? '',
      position,
      status: place?.type === 'custom' && request.placesStatus !== 'approved' ? 'proposed' : 'demo',
    }
  })
  const stops = endpoints.filter((stop): stop is MapStop => !!stop)
  return {
    ...base,
    stops,
    // Never replace a missing endpoint with another stop or invent connecting geometry.
    routes:
      stops.length !== 2
        ? []
        : [
            {
              id,
              code: 'Flex',
              name: `${stops[0].name} → ${stops[1].name}`,
              direction: 'Požadovaná cesta',
              kind: 'flex',
              geometrySource: 'computed',
              serviceDates: [request.date],
              stops: stops.map((stop, index) => ({
                stopId: stop.id,
                occurrenceId: `${id}:${index}`,
              })),
              ...(['pending', 'approved'].includes(request.status) && {
                request: {
                  id: request.id,
                  date: request.date,
                  time: request.time,
                  timeMode: request.timeMode,
                  passengers: request.passengers,
                  status: request.status as 'pending' | 'approved',
                },
              }),
            },
          ],
  }
}
