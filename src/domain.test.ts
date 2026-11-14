import { describe, expect, it } from 'vitest'
import { createInitialState } from './data'
import { activeBookings, findTrips, freeSeats, transition } from './domain'
import type { Action } from './domain'
import type { RideRequest } from './types'
const book = (tripId = 't-0-1', seats = 1, personId = 'me'): Action => ({
  type: 'book',
  id: 'new',
  personId,
  seats,
  legs: [{ tripId, from: 'mat', to: 'ssv' }],
})
const request = (overrides: Partial<RideRequest> = {}): RideRequest => ({
  id: 'new-request',
  from: 'mat',
  to: 'ssv',
  date: createInitialState().serviceDate,
  time: '09:30',
  timeMode: 'departure',
  passengers: 2,
  status: 'pending',
  members: ['me'],
  ownSeats: 2,
  personId: 'me',
  accessibility: '',
  ...overrides,
})
describe('Rezervácie a vyhľadávanie', () => {
  it('nájde iba spoje v správnom smere a rešpektuje odchod aj príchod', () => {
    const s = createInitialState()
    expect(findTrips(s, 'mat', 'ssv', s.serviceDate, '07:00').map((t) => t.id)).toEqual([
      't-0-0',
      't-0-1',
      't-0-4',
    ])
    expect(
      findTrips(s, 'mat', 'ssv', s.serviceDate, '07:30', 'arrival').map((t) => t.id),
    ).toContain('t-0-1')
    expect(
      findTrips(s, 'ssv', 'mat', s.serviceDate).every(
        (t) =>
          t.stops.findIndex((x) => x.stopId === 'mat') >
          t.stops.findIndex((x) => x.stopId === 'ssv'),
      ),
    ).toBe(true)
  })
  it('odpočíta miesta a uvoľní ich po zrušení', () => {
    const s = createInitialState(),
      t = s.trips.find((t) => t.id === 't-0-1')!
    expect(freeSeats(s, t, 'mat', 'ssv')).toBe(5)
    const n = transition(s, book())
    expect(freeSeats(n, t, 'mat', 'ssv')).toBe(4)
    expect(freeSeats(transition(n, { type: 'cancelBooking', id: 'new-0' }), t, 'mat', 'ssv')).toBe(
      5,
    )
    expect(s.bookings).toHaveLength(7)
  })
  it('nepovolí prekročiť kapacitu alebo duplicitnú rezerváciu', () => {
    const s = createInitialState()
    expect(() => transition(s, book('t-0-1', 6))).toThrow('dostatok')
    const n = transition(s, book())
    expect(() => transition(n, book())).toThrow('už má rezerváciu')
  })
  it('počíta obsadenosť po úsekoch trasy', () => {
    const s = createInitialState(),
      t = s.trips.find((t) => t.id === 't-0-1')!
    expect(freeSeats(s, t, 'ssv', 'school')).toBe(6)
    expect(freeSeats(s, t, 'school', 'mat')).toBe(0)
  })
  it('potvrdí oba smery atomicky a zruší ich spolu', () => {
    const s = createInitialState()
    const n = transition(s, {
      type: 'book',
      id: 'pair',
      personId: 'mother',
      seats: 2,
      legs: [
        { tripId: 't-0-1', from: 'mat', to: 'ssv' },
        { tripId: 't-0-5', from: 'ssv', to: 'mat' },
      ],
    })
    expect(n.bookings.filter((b) => b.groupId === 'pair')).toHaveLength(2)
    const cancelled = transition(n, { type: 'cancelBooking', id: 'pair-0' })
    expect(
      cancelled.bookings.filter((b) => b.groupId === 'pair').every((b) => b.status === 'cancelled'),
    ).toBe(true)
  })
  it('nevytvorí cestu tam, ak nie sú miesta späť', () => {
    const s = createInitialState()
    s.bookings.push({
      id: 'full',
      tripId: 't-0-5',
      name: 'Skupina',
      seats: 8,
      from: 'ssv',
      to: 'mat',
      status: 'confirmed',
      riderStatus: 'expected',
      mine: false,
    })
    const before = structuredClone(s)
    expect(() =>
      transition(s, {
        type: 'book',
        id: 'pair',
        personId: 'mother',
        seats: 1,
        legs: [
          { tripId: 't-0-1', from: 'mat', to: 'ssv' },
          { tripId: 't-0-5', from: 'ssv', to: 'mat' },
        ],
      }),
    ).toThrow('dostatok')
    expect(s).toEqual(before)
  })
})
describe('Spoločné požiadavky a dispečer', () => {
  it('pridanie zvýši záujem bez vytvorenia rezervácie', () => {
    const s = createInitialState(),
      n = transition(s, { type: 'joinRequest', id: 'r2', personId: 'mother' })
    expect(n.requests.find((r) => r.id === 'r2')?.passengers).toBe(3)
    expect(n.bookings).toHaveLength(s.bookings.length)
    expect(() => transition(n, { type: 'joinRequest', id: 'r2', personId: 'mother' })).toThrow(
      'už pridali',
    )
  })
  it('validuje novú požiadavku a spätný čas', () => {
    const s = createInitialState()
    expect(() => transition(s, { type: 'createRequest', request: request({ to: 'mat' }) })).toThrow(
      'odlišné',
    )
    expect(() =>
      transition(s, {
        type: 'createRequest',
        request: request({ returnDate: s.serviceDate, returnTime: '08:00' }),
      }),
    ).toThrow('neskôr')
    expect(() =>
      transition(s, { type: 'createRequest', request: request({ passengers: 9 }) }),
    ).toThrow('1 až 8')
  })
  it('schválenie vytvorí jazdu a spoločné rezervácie pre vodiča', () => {
    const s = transition(createInitialState(), { type: 'createRequest', request: request() }),
      n = transition(s, { type: 'decideRequest', id: 'new-request', approve: true }),
      r = n.requests.find((r) => r.id === 'new-request')!
    expect(r.status).toBe('approved')
    expect(activeBookings(n, r.tripId!).reduce((n, b) => n + b.seats, 0)).toBe(2)
    expect(n.bookings.some((b) => b.mine && b.tripId === r.tripId)).toBe(true)
  })
  it('spojí požiadavky s rovnakou trasou a časom', () => {
    let s = transition(createInitialState(), { type: 'createRequest', request: request() })
    s.requests.push(request({ id: 'related', members: [], ownSeats: 0, personId: undefined }))
    s = transition(s, { type: 'decideRequest', id: 'new-request', approve: true })
    const a = s.requests.find((r) => r.id === 'new-request')!,
      b = s.requests.find((r) => r.id === 'related')!
    expect(a.tripId).toBe(b.tripId)
    expect(s.trips.find((t) => t.id === a.tripId)?.requestIds).toHaveLength(2)
  })
  it('nezasiahne do pravidelného cestovného poriadku', () => {
    const s = transition(createInitialState(), {
        type: 'createRequest',
        request: request({ time: '07:10' }),
      }),
      before = structuredClone(s)
    expect(() =>
      transition(s, { type: 'decideRequest', id: 'new-request', approve: true }),
    ).toThrow('Vozidlo nie je dostupné')
    expect(s).toEqual(before)
  })
  it('ak spätná Flex cesta koliduje, nevznikne ani jedna', () => {
    const s = transition(createInitialState(), {
      type: 'createRequest',
      request: request({ returnDate: createInitialState().serviceDate, returnTime: '12:10' }),
    })
    s.trips.push({
      ...s.trips[0],
      id: 'blocked',
      vehicleId: 'v2',
      stops: [
        { stopId: 'ssv', time: '12:00' },
        { stopId: 'mat', time: '12:50' },
      ],
    })
    const before = structuredClone(s)
    expect(() =>
      transition(s, { type: 'decideRequest', id: 'new-request', approve: true }),
    ).toThrow('Vozidlo nie je dostupné')
    expect(s).toEqual(before)
  })
  it('vyžaduje dôvod zamietnutia a sprístupní ho cestujúcemu', () => {
    const s = createInitialState()
    expect(() =>
      transition(s, { type: 'decideRequest', id: 'r1', approve: false, reason: '' }),
    ).toThrow('dôvod')
    const n = transition(s, {
      type: 'decideRequest',
      id: 'r1',
      approve: false,
      reason: 'Vozidlo nie je dostupné.',
    })
    expect(n.requests.find((r) => r.id === 'r1')?.reason).toBe('Vozidlo nie je dostupné.')
  })
  it('zruší len vlastnú účasť a ponechá záujem ostatných', () => {
    const s = transition(createInitialState(), { type: 'joinRequest', id: 'r2', personId: 'me' }),
      n = transition(s, { type: 'cancelRequest', id: 'r2' })
    expect(n.requests.find((r) => r.id === 'r2')?.passengers).toBe(2)
    expect(n.requests.find((r) => r.id === 'r2')?.members).toEqual([])
  })
})
describe('Vodič a spoločný životný cyklus', () => {
  it('nepovolí výstup pred nástupom ani nástup pred začiatkom', () => {
    const s = createInitialState()
    expect(() => transition(s, { type: 'rider', id: 'b2', status: 'boarded' })).toThrow('začnite')
    const active = transition(s, { type: 'tripStatus', id: 't-0-1', status: 'active' })
    expect(() => transition(active, { type: 'rider', id: 'b2', status: 'alighted' })).toThrow(
      'po nástupe',
    )
  })
  it('zaznamená nástup, výstup, neprítomnosť a dokončenie jazdy', () => {
    let s = createInitialState()
    s = transition(s, { type: 'tripStatus', id: 't-0-1', status: 'active' })
    s = transition(s, { type: 'rider', id: 'b2', status: 'boarded' })
    expect(() => transition(s, { type: 'tripStatus', id: 't-0-1', status: 'completed' })).toThrow(
      'všetkých',
    )
    s = transition(s, { type: 'rider', id: 'b2', status: 'alighted' })
    s = transition(s, { type: 'rider', id: 'b3', status: 'absent' })
    s = transition(s, { type: 'tripStatus', id: 't-0-1', status: 'completed' })
    expect(s.trips.find((t) => t.id === 't-0-1')?.status).toBe('completed')
  })
  it('nezapne dve jazdy toho istého vozidla', () => {
    const s = transition(createInitialState(), {
      type: 'tripStatus',
      id: 't-0-0',
      status: 'active',
    })
    expect(() => transition(s, { type: 'tripStatus', id: 't-0-4', status: 'active' })).toThrow(
      'prebiehajúcu jazdu',
    )
  })
})

describe('Zrušenie schválenej požiadavky', () => {
  it('pri zrušení vlastnej rezervácie zachová ostatných cestujúcich', () => {
    let s = transition(createInitialState(), { type: 'joinRequest', id: 'r2', personId: 'me' })
    s = transition(s, { type: 'decideRequest', id: 'r2', approve: true })
    const own = s.bookings.find((b) => b.mine && b.groupId === 'r2')!
    const other = s.bookings.find((b) => !b.mine && b.groupId === 'r2')!
    s = transition(s, { type: 'cancelBooking', id: own.id })
    expect(s.bookings.find((b) => b.id === other.id)?.status).toBe('confirmed')
    expect(s.requests.find((r) => r.id === 'r2')?.passengers).toBe(2)
    expect(s.requests.find((r) => r.id === 'r2')?.left).toBe(true)
  })
  it('pri zrušení požiadavky zruší obe vlastné rezervácie a zachová ostatných', () => {
    let s = transition(createInitialState(), {
      type: 'createRequest',
      request: request({ returnDate: createInitialState().serviceDate, returnTime: '15:30' }),
    })
    s = transition(s, { type: 'decideRequest', id: 'new-request', approve: true })
    expect(s.bookings.filter((b) => b.mine && b.groupId === 'new-request')).toHaveLength(2)
    s = transition(s, { type: 'cancelRequest', id: 'new-request' })
    expect(
      s.bookings
        .filter((b) => b.mine && b.groupId === 'new-request')
        .every((b) => b.status === 'cancelled'),
    ).toBe(true)
  })
})

describe('Pridanie skupiny k požiadavke', () => {
  it('pripočíta celú skupinu a ponechá požiadavku nepotvrdenú', () => {
    const before = createInitialState(),
      after = transition(before, { type: 'joinRequest', id: 'r2', personId: 'mother', seats: 3 })
    expect(after.requests.find((r) => r.id === 'r2')?.passengers).toBe(5)
    expect(after.requests.find((r) => r.id === 'r2')?.ownSeats).toBe(3)
    expect(after.requests.find((r) => r.id === 'r2')?.status).toBe('pending')
    expect(after.bookings).toEqual(before.bookings)
  })
  it('blokuje opakované pridanie toho istého profilu a prekročenie kapacity', () => {
    const s = transition(createInitialState(), {
      type: 'joinRequest',
      id: 'r2',
      personId: 'mother',
      seats: 2,
    })
    expect(() =>
      transition(s, { type: 'joinRequest', id: 'r2', personId: 'mother', seats: 1 }),
    ).toThrow('už pridali')
    expect(() =>
      transition(s, { type: 'joinRequest', id: 'r2', personId: 'me', seats: 5 }),
    ).toThrow('kapacitu')
    expect(() =>
      transition(s, { type: 'joinRequest', id: 'r2', personId: 'me', seats: 0 }),
    ).toThrow('1 až 8')
  })
  it('umožní inému rodinnému profilu pridať sa a vytvorí jeho vlastný záznam vodiča', () => {
    let s = transition(createInitialState(), {
      type: 'joinRequest',
      id: 'r2',
      personId: 'mother',
      seats: 2,
    })
    s = transition(s, { type: 'joinRequest', id: 'r2', personId: 'daughter', seats: 1 })
    s = transition(s, { type: 'decideRequest', id: 'r2', approve: true })
    expect(s.bookings.find((b) => b.groupId === 'r2' && b.personId === 'mother')?.seats).toBe(2)
    expect(s.bookings.find((b) => b.groupId === 'r2' && b.personId === 'daughter')?.seats).toBe(1)
    s = transition(s, { type: 'cancelRequest', id: 'r2' })
    expect(s.requests.find((r) => r.id === 'r2')?.passengers).toBe(2)
    expect(
      s.bookings.filter((b) => b.groupId === 'r2' && b.mine).every((b) => b.status === 'cancelled'),
    ).toBe(true)
    expect(s.bookings.find((b) => b.groupId === 'r2' && !b.mine)?.status).toBe('confirmed')
  })
})
