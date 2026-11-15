import { dateLabel } from './data'
import { stopName } from './domain'
import type { AppState, RideRequest, Trip } from './types'

export type RoutePoint = {
  name: string
  time?: string
  proposed?: boolean
}

export type RouteView = { label: string; points: RoutePoint[]; trip?: Trip }

export function tripRouteView(state: AppState, trip: Trip, label = 'Trasa spoja'): RouteView {
  return {
    label: `${label} · ${dateLabel(trip.date)}`,
    trip,
    points: trip.stops.map(({ stopId, time, place }) => ({
      name: place?.name ?? stopName(state, stopId),
      time,
    })),
  }
}

export function requestRouteViews(
  state: AppState,
  request: RideRequest,
  planned: Trip[] = [],
): RouteView[] {
  const endpoints = [
    { id: request.from, place: request.fromPlace },
    { id: request.to, place: request.toPlace },
  ].map(({ id, place }) => ({
    name: place?.name ?? stopName(state, id),
  }))
  const outbound = state.trips.find((t) => t.id === request.tripId) ?? planned[0]
  const inbound = state.trips.find((t) => t.id === request.returnTripId) ?? planned[1]
  const views = [
    outbound
      ? tripRouteView(state, outbound, 'Cesta tam')
      : { label: `Cesta tam · ${dateLabel(request.date)}`, points: endpoints },
  ]
  if (request.returnDate || inbound) {
    views.push(
      inbound
        ? tripRouteView(state, inbound, 'Cesta späť')
        : {
            label: `Cesta späť · ${dateLabel(request.returnDate!)}`,
            points: [...endpoints].reverse(),
          },
    )
  }
  return views
}
