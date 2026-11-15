import { afterEach, expect, it, vi } from 'vitest'
import { createInitialState } from './data'
import { transition } from './domain'
import { localInstant } from './regularPlanning'
import { requestWithdrawalError } from './requestWithdrawal'

afterEach(() => vi.restoreAllMocks())
it('locks exactly at 24 hours from boarding, not the start of a multistop trip', () => {
  const s = createInitialState(),
    trip = s.trips[0],
    request = s.requests[0]
  request.status = 'approved'
  request.tripId = trip.id
  s.bookings = [
    {
      ...s.bookings[0],
      groupId: request.id,
      tripId: trip.id,
      from: trip.stops[1].stopId,
      mine: true,
      status: 'confirmed',
    },
  ]
  const cutoff = localInstant(trip.date, trip.stops[1].time) - 86400000
  expect(requestWithdrawalError(s, request, cutoff - 1)).toBeNull()
  expect(requestWithdrawalError(s, request, cutoff)).toContain('24 hodín')
  expect(requestWithdrawalError(s, request, cutoff + 1)).toContain('24 hodín')
})
it('protects both cancellation entry points and leaves every round-trip leg intact', () => {
  const s = createInitialState(),
    request = s.requests[0],
    trip = s.trips[0]
  request.status = 'approved'
  request.tripId = trip.id
  request.members = ['me']
  s.bookings = [0, 1].map((n) => ({
    ...s.bookings[0],
    id: `b${n}`,
    tripId: trip.id,
    from: trip.stops[0].stopId,
    groupId: request.id,
    mine: true,
    status: 'confirmed' as const,
    riderStatus: 'expected' as const,
  }))
  vi.spyOn(Date, 'now').mockReturnValue(localInstant(trip.date, trip.stops[0].time) - 86400000)
  const before = JSON.stringify(s)
  expect(() => transition(s, { type: 'cancelRequest', id: request.id })).toThrow('24 hodín')
  expect(() => transition(s, { type: 'cancelBooking', id: 'b0' })).toThrow('24 hodín')
  expect(JSON.stringify(s)).toBe(before)
})
it('rejects late joining when the assigned vehicle has no seats, without changing interest', () => {
  const s = createInitialState(),
    r = s.requests[0],
    trip = s.trips[0]
  r.status = 'approved'
  r.tripId = trip.id
  r.members = []
  r.ownSeats = 0
  s.vehicles.find((v) => v.id === trip.vehicleId)!.capacity = 0
  vi.spyOn(Date, 'now').mockReturnValue(localInstant(trip.date, trip.stops[0].time) - 3600000)
  const before = JSON.stringify(s)
  expect(() => transition(s, { type: 'joinRequest', id: r.id, personId: 'me' })).toThrow(
    'voľných miest',
  )
  expect(JSON.stringify(s)).toBe(before)
})
it('still permits joining a pending request inside 24 hours', () => {
  const s = createInitialState(),
    r = s.requests[1]
  r.members = []
  r.ownSeats = 0
  vi.spyOn(Date, 'now').mockReturnValue(localInstant(r.date, r.time) - 3600000)
  const next = transition(s, { type: 'joinRequest', id: r.id, personId: 'me' })
  expect(next.requests.find((x) => x.id === r.id)?.members).toContain('me')
  expect(() => transition(next, { type: 'cancelRequest', id: r.id })).toThrow('24 hodín')
})
it('allows late joining an approved service only with real segment seats in every direction', () => {
  const s = createInitialState(),
    r = s.requests[0],
    trip = s.trips[0]
  r.status = 'approved'
  r.tripId = trip.id
  r.members = []
  r.ownSeats = 0
  r.passengers = 0
  vi.spyOn(Date, 'now').mockReturnValue(localInstant(trip.date, trip.stops[0].time) - 3600000)
  const joined = transition(s, { type: 'joinRequest', id: r.id, personId: 'me', seats: 1 })
  expect(joined.bookings.length).toBe(s.bookings.length + 1)
  r.returnDate = trip.date
  r.returnTripId = 'missing'
  const before = JSON.stringify(s)
  expect(() => transition(s, { type: 'joinRequest', id: r.id, personId: 'me', seats: 1 })).toThrow()
  expect(JSON.stringify(s)).toBe(before)
})
