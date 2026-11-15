import type { AppState, Booking, RideRequest } from './types'
import { localInstant } from './regularPlanning'
import { estimatedDeparture } from './search'
import { clock } from './data'

export const WITHDRAWAL_NOTICE =
  'Účasť nemožno zrušiť 24 hodín alebo menej pred odchodom z vašej nástupnej zastávky. Kontaktujte dispečera.'

/** Actual boarding times take precedence; pending demand uses the existing demo Flex estimate. */
export function requestWithdrawalError(
  state: AppState,
  request: RideRequest,
  now = Date.now(),
): string | null {
  if (request.status === 'rejected' || request.status === 'cancelled') return null
  const bookings = state.bookings.filter(
    (b) =>
      (b.mine || b.channel === 'phone') && b.groupId === request.id && b.status === 'confirmed',
  )
  const departures = bookings.map((b) => {
    const trip = state.trips.find((t) => t.id === b.tripId),
      stop = trip?.stops.find((s) => s.stopId === b.from)
    return trip && stop ? localInstant(trip.date, stop.time) : NaN
  })
  if (!departures.length) {
    const trip = state.trips.find((t) => t.id === request.tripId)
    const pickup = trip?.stops.find((s) => s.stopId === request.from)
    if (trip && pickup) departures.push(localInstant(trip.date, pickup.time))
    else
      departures.push(
        localInstant(request.date, clock(estimatedDeparture(request.time, request.timeMode))),
      )
    if (request.returnDate && request.returnTime) {
      departures.push(
        localInstant(
          request.returnDate,
          clock(estimatedDeparture(request.returnTime, request.returnTimeMode ?? 'departure')),
        ),
      )
    }
  }
  return departures.every((instant) => Number.isFinite(instant) && instant - now > 86400000)
    ? null
    : WITHDRAWAL_NOTICE
}

export function requestBookingWithdrawalError(state: AppState, booking: Booking, now = Date.now()) {
  const request = state.requests.find((r) => r.id === booking.groupId)
  return request ? requestWithdrawalError(state, request, now) : null
}
