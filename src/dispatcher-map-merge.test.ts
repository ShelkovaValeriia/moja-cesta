import { afterEach, expect, it, vi } from 'vitest'
import { createInitialState } from './data'
import { transition } from './domain'
import { dispatcherSubmissions } from './dispatcherSubmissions'
import { requestDataset } from './maps/applicationMap'
import { localInstant } from './regularPlanning'
import { restoreState } from './storage'

afterEach(() => vi.restoreAllMocks())

it('keeps late passenger joins consistent with the dispatcher ledger and reviewed corrections', () => {
  const initial = createInitialState()
  const fixed = initial.trips.filter((t) => t.kind === 'fixed')
  let state = transition(initial, { type: 'joinRequest', id: 'r2', personId: 'mother', seats: 1 })
  state = transition(state, { type: 'decideRequest', id: 'r2', approve: true })
  const ride = state.requests.find((r) => r.id === 'r2')!
  const trip = state.trips.find((t) => t.id === ride.tripId)!
  vi.spyOn(Date, 'now').mockReturnValue(localInstant(trip.date, trip.stops[0].time) - 3600000)
  state = transition(state, { type: 'joinRequest', id: 'r2', personId: 'me', seats: 1 })
  const record = dispatcherSubmissions(state).find((r) => r.key === 'ride:r2')!
  expect(record.people.map((p) => [p.id, p.seats])).toEqual([
    ['mother', 1],
    ['me', 1],
  ])
  expect(record.unidentifiedSeats).toBe(2)
  expect(
    state.bookings
      .filter((b) => b.groupId === 'r2' && b.status === 'confirmed')
      .reduce((n, b) => n + b.seats, 0),
  ).toBe(4)
  const before = JSON.stringify(state)
  expect(() => transition(state, { type: 'cancelRequest', id: 'r2' })).toThrow('24 hodín')
  expect(JSON.stringify(state)).toBe(before)

  // Dispatcher corrections remain a distinct reviewed operation, with explicit seat release.
  state = transition(state, {
    type: 'editSubmission',
    draft: {
      kind: 'ride',
      value: { ...state.requests.find((r) => r.id === 'r2')!, time: '11:30' },
    },
    reason: 'Oprava času po telefonáte',
    acknowledgeRelease: true,
  })
  expect(dispatcherSubmissions(state).find((r) => r.key === 'ride:r2')?.status).toBe('pending')
  expect(
    requestDataset(state.stops, state.requests).routes.find((r) => r.request?.id === 'r2')?.request
      ?.time,
  ).toBe('11:30')
  expect(
    state.bookings.filter((b) => b.groupId === 'r2').every((b) => b.status === 'cancelled'),
  ).toBe(true)
  expect(state.trips.filter((t) => t.kind === 'fixed')).toEqual(fixed)
})

it('preserves telephone passengers and applies the pickup cutoff without leaking their identity to maps', () => {
  let state = createInitialState()
  state = transition(state, {
    type: 'registerPhonePerson',
    person: {
      id: 'phone-person-merge',
      name: 'Ukážkový telefonický cestujúci',
      passengerCode: '789012',
      relation: 'Iná osoba',
      age: 'Dospelý',
      contact: '+421 900 123 456',
      mobility: 'Bez obmedzení',
    },
  })
  state = transition(state, {
    type: 'createRequest',
    request: {
      ...state.requests[0],
      id: 'phone-journey-merge',
      from: 'mat',
      to: 'school',
      time: '10:45',
      passengers: 1,
      members: [],
      ownSeats: 0,
      personId: 'phone-person-merge',
      channel: 'phone',
    },
  })
  state = transition(state, { type: 'decideRequest', id: 'phone-journey-merge', approve: true })
  state = restoreState(state)!
  expect(state.people.some((p) => p.id === 'phone-person-merge')).toBe(false)
  expect(state.phonePeople.find((p) => p.id === 'phone-person-merge')?.passengerCode).toBe('789012')
  const booking = state.bookings.find(
    (b) => b.groupId === 'phone-journey-merge' && b.channel === 'phone',
  )!
  expect(booking.mine).toBe(false)
  const trip = state.trips.find((t) => t.id === booking.tripId)!
  const cutoff =
    localInstant(trip.date, trip.stops.find((s) => s.stopId === booking.from)!.time) - 86400000
  vi.spyOn(Date, 'now').mockReturnValue(cutoff)
  expect(() => transition(state, { type: 'cancelRequest', id: 'phone-journey-merge' })).toThrow(
    '24 hodín',
  )
  expect(() => transition(state, { type: 'cancelBooking', id: booking.id })).toThrow('24 hodín')
  vi.spyOn(Date, 'now').mockReturnValue(cutoff - 1)
  const cancelled = transition(state, { type: 'cancelRequest', id: 'phone-journey-merge' })
  expect(cancelled.bookings.find((b) => b.id === booking.id)?.status).toBe('cancelled')
  const publicMap = JSON.stringify(requestDataset(state.stops, state.requests))
  for (const secret of [
    'phone-person-merge',
    '789012',
    'Ukážkový telefonický cestujúci',
    '+421 900 123 456',
  ])
    expect(publicMap).not.toContain(secret)
})
