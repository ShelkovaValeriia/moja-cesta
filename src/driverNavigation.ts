import { transition, freeSeats } from './domain'
import type { AppState, Trip } from './types'
export function stopProcessed(state: AppState, trip: Trip) {
  const stop = trip.stops[trip.navigation?.stopIndex ?? 0]
  return (
    !!stop &&
    state.bookings
      .filter((b) => b.tripId === trip.id && b.status === 'confirmed')
      .every(
        (b) =>
          (b.from !== stop.stopId || b.riderStatus !== 'expected') &&
          (b.to !== stop.stopId || b.riderStatus === 'alighted' || b.riderStatus === 'absent'),
      )
  )
}
export type NavigationAction =
  | { type: 'correctRider'; id: string; status: 'boarded' | 'absent'; now: string }
  | {
      type: 'startNavigation' | 'navigationArrive' | 'navigationContinue'
      id: string
      now: string
    }
export function navigationTransition(state: AppState, action: NavigationAction) {
  let s = structuredClone(state)
  if (action.type === 'correctRider') {
    const booking = s.bookings.find((b) => b.id === action.id && b.status === 'confirmed')
    const trip = s.trips.find((t) => t.id === booking?.tripId)
    if (
      !booking ||
      !trip ||
      trip.status !== 'active' ||
      trip.driverId !== s.activeDriverId ||
      trip.navigation?.phase !== 'stopped'
    )
      throw new Error('Označenie možno meniť iba na otvorenej zastávke pridelenej aktívnej jazdy.')
    if (!Number.isFinite(Date.parse(action.now))) throw new Error('Neplatný čas opravy.')
    const stop = trip.stops[trip.navigation.stopIndex]?.stopId
    const pickup =
      stop === booking.from &&
      ((booking.riderStatus === 'boarded' && action.status === 'absent') ||
        (booking.riderStatus === 'absent' && action.status === 'boarded'))
    const dropoff =
      stop === booking.to && booking.riderStatus === 'alighted' && action.status === 'boarded'
    if (!pickup && !dropoff) throw new Error('Túto značku už nemožno zmeniť na aktuálnej zastávke.')
    const occupied = s.bookings
      .filter(
        (b) => b.tripId === trip.id && b.status === 'confirmed' && b.riderStatus === 'boarded',
      )
      .reduce((n, b) => n + b.seats, 0)
    const capacity = s.vehicles.find((v) => v.id === trip.vehicleId)?.capacity ?? 0
    if (action.status === 'boarded' && occupied + booking.seats > capacity)
      throw new Error(
        'Kapacita vozidla je naplnená. Najskôr opravte ostatné záznamy alebo označte výstup.',
      )
    if (
      booking.riderStatus === 'absent' &&
      freeSeats(s, trip, booking.from, booking.to) < booking.seats
    )
      throw new Error('Na niektorom úseku už nie je dosť voľných miest. Kontaktujte dispečera.')
    const before = booking.riderStatus,
      oldHistory = booking.noShow?.history ?? []
    if (dropoff) {
      booking.riderStatus = 'boarded'
    } else {
      if (before === 'absent' && booking.noShow) {
        booking.noShow.status = 'corrected'
        booking.noShow.reason = 'Vodič opravil označenie pred odchodom zo zastávky.'
        booking.noShow.history.push({ action: 'correct', reason: booking.noShow.reason })
      }
      booking.riderStatus = 'expected'
      s = transition(s, { type: 'rider', id: booking.id, status: action.status })
      if (action.status === 'absent' && oldHistory.length)
        s.bookings.find((b) => b.id === booking.id)!.noShow!.history.unshift(...oldHistory)
    }
    const updated = s.bookings.find((b) => b.id === booking.id)!
    ;(updated.riderCorrections ??= []).push({
      from: before,
      to: action.status,
      stopIndex: trip.navigation.stopIndex,
      driverId: s.activeDriverId,
      at: action.now,
    })
    if (updated.mine)
      (s.notifications ??= []).unshift({
        id: `${updated.id}:correction:${updated.riderCorrections.length}`,
        bookingId: updated.id,
        text: `Vodič opravil označenie rezervácie: ${action.status === 'absent' ? 'Neprišiel' : 'Vo vozidle'}. Automatická sankcia sa neuplatnila.`,
      })
    return s
  }
  let trip = s.trips.find((t) => t.id === action.id)
  if (!trip || trip.driverId !== s.activeDriverId)
    throw new Error('Jazda nie je pridelená tomuto vodičovi.')
  if (!Number.isFinite(Date.parse(action.now))) throw new Error('Neplatný čas udalosti.')
  if (action.type === 'startNavigation') {
    if (trip.status !== 'scheduled') throw new Error('Jazda už bola začatá alebo dokončená.')
    if (!trip.stops.length) throw new Error('Jazda nemá zastávky.')
    s = transition(s, { type: 'tripStatus', id: trip.id, status: 'active' })
    trip = s.trips.find((t) => t.id === action.id)!
    trip.navigation = { stopIndex: 0, phase: 'moving', processedStops: [], startedAt: action.now }
    return s
  }
  if (trip.status !== 'active') throw new Error('Najskôr začnite jazdu.')
  trip.navigation ??= { stopIndex: 0, phase: 'moving', processedStops: [] }
  const nav = trip.navigation
  if (action.type === 'navigationArrive') {
    if (nav.phase !== 'moving') throw new Error('Zastávka je už otvorená.')
    nav.phase = 'stopped'
    return s
  }
  if (nav.phase !== 'stopped') throw new Error('Najskôr potvrďte príchod na zastávku.')
  if (!stopProcessed(s, trip))
    throw new Error('Najskôr označte všetky nástupy, výstupy a neprítomnosti na tejto zastávke.')
  nav.processedStops.push(nav.stopIndex)
  if (nav.stopIndex === trip.stops.length - 1) {
    s = transition(s, { type: 'tripStatus', id: trip.id, status: 'completed' })
    s.trips.find((t) => t.id === action.id)!.navigation!.endedAt = action.now
  } else {
    nav.stopIndex++
    nav.phase = 'moving'
  }
  return s
}
