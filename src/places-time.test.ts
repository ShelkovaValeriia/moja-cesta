import { describe, expect, it } from 'vitest'
import { createInitialState as createSeed } from './data'
import { formatTime, isTime24, normalizeTime } from './time'
import {
  customPlace,
  nearestStop,
  regularStopsAccepted,
  selectJourneyPlace,
  stopPlace,
  validPlace,
} from './places'
import { matchingRequests, queryString, readQuery } from './search'
import { freeSeats, transition } from './domain'
import { restoreState } from './storage'
import type { RideRequest } from './types'
const query = () => readQuery(new URLSearchParams())
const point = customPlace(49.3544, 20.3613, 'Pri bráne')
const request = (id = 'point-request'): RideRequest => ({
  id,
  from: 'mat',
  to: 'ssv',
  fromPlace: point,
  date: createInitialState().serviceDate,
  time: '11:00',
  timeMode: 'departure',
  passengers: 2,
  status: 'pending',
  members: ['mother'],
  personId: 'mother',
  ownSeats: 2,
  accessibility: '',
})
describe('Jednotný 24-hodinový čas', () => {
  it('správne prepočíta polnoc, poludnie a jednociferné staršie časy', () => {
    expect(normalizeTime('12:00 AM')).toBe('00:00')
    expect(normalizeTime('12:00 PM')).toBe('12:00')
    expect(normalizeTime('05:00 PM')).toBe('17:00')
    expect(normalizeTime('6:5')).toBe('06:05')
    expect(normalizeTime('24:00')).toBeNull()
    expect(normalizeTime('23:60')).toBeNull()
    expect(normalizeTime('00:00 PM')).toBeNull()
    expect(formatTime('05:00 PM')).toBe('17:00')
    expect(formatTime('00:00')).toBe('00:00')
    expect(isTime24('06:00 AM')).toBe(false)
  })
  it('normalizuje všetky staršie uložené časy bez zmeny rezervácií', () => {
    const s = createInitialState()
    s.trips[0].stops[0].time = '06:40 AM'
    s.requests[0].time = '05:00 PM'
    s.rules[0].time = '7:15 AM'
    s.bookings[0].search = { ...query(), time: '12:00 AM', returnTime: '05:00 PM' }
    const restored = restoreState(s)!
    expect(restored.trips[0].stops[0].time).toBe('06:40')
    expect(restored.requests[0].time).toBe('17:00')
    expect(restored.rules[0].time).toBe('07:15')
    expect(restored.bookings[0].search).toMatchObject({ time: '00:00', returnTime: '17:00' })
    expect(restored.bookings[0].status).toBe('confirmed')
    expect(readQuery(new URLSearchParams('time=05%3A00+PM&returnTime=12%3A00+AM'))).toMatchObject({
      time: '17:00',
      returnTime: '00:00',
    })
  })
})
describe('Body na mape a existujúce zastávky', () => {
  it('nájde blízku demo zastávku a zachová vlastný bod v URL', () => {
    const s = createInitialState()
    expect(nearestStop(s.stops, point)?.stop.id).toBe('mat')
    const q = selectJourneyPlace(query(), 'from', point, s.stops)
    expect(q.from).toBe('mat')
    expect(q.fromPlace?.type).toBe('custom')
    expect(q.fromStopConfirmed).toBe(false)
    expect(regularStopsAccepted(q)).toBe(false)
    expect(readQuery(new URLSearchParams(queryString(q)))).toEqual(q)
    expect(s.stops).toHaveLength(6)
    expect(validPlace({ ...point, latitude: NaN })).toBe(false)
  })
  it('výber existujúcej zastávky na mape používa jej skutočnú identitu', () => {
    const s = createInitialState(),
      q = selectJourneyPlace(
        query(),
        'to',
        stopPlace(s.stops.find((x) => x.id === 'cer'))!,
        s.stops,
      )
    expect(q.to).toBe('cer')
    expect(q.toPlace).toMatchObject({ type: 'stop', stopId: 'cer' })
    expect(regularStopsAccepted(q)).toBe(true)
  })
  it('nepotvrdí pravidelný spoj bez výslovného súhlasu so zastávkou', () => {
    const s = createInitialState(),
      q = { ...selectJourneyPlace(query(), 'from', point, s.stops), personId: 'mother', seats: 2 }
    const booking = {
      type: 'book' as const,
      id: 'map-book',
      personId: 'mother',
      seats: 2,
      search: q,
      legs: [{ tripId: 't-0-1', from: 'mat', to: 'ssv' }],
    }
    expect(() => transition(s, booking)).toThrow('potvrďte')
    const n = transition(s, { ...booking, search: { ...q, fromStopConfirmed: true } })
    expect(n.bookings.find((b) => b.id === 'map-book-0')).toMatchObject({
      from: 'mat',
      to: 'ssv',
      seats: 2,
    })
    expect(n.bookings.find((b) => b.id === 'map-book-0')?.search?.fromPlace).toEqual(point)
    expect(n.stops).toHaveLength(6)
  })
  it('uchová súradnice v žiadosti a vyžaduje súhlas dispečera pred vytvorením jazdy', () => {
    let s = transition(createInitialState(), { type: 'createRequest', request: request() })
    expect(s.requests[0]).toMatchObject({ fromPlace: point, placesStatus: 'pending' })
    expect(() =>
      transition(s, { type: 'decideRequest', id: 'point-request', approve: true }),
    ).toThrow('schváľte')
    s = transition(s, {
      type: 'decideRequest',
      id: 'point-request',
      approve: true,
      approvePlaces: true,
    })
    const req = s.requests[0],
      trip = s.trips.find((t) => t.id === req.tripId)!
    expect(req.placesStatus).toBe('approved')
    expect(trip.stops[0].place).toEqual(point)
    expect(trip.stops[0].stopId).toMatch(/^point:/)
    expect(s.bookings.find((b) => b.groupId === req.id)?.from).toBe(trip.stops[0].stopId)
    expect(freeSeats(s, trip)).toBe(6)
    expect(s.stops).toHaveLength(6)
  })
  it('rôzne vlastné body pri rovnakej zastávke automaticky nezlúči', () => {
    let s = transition(createInitialState(), { type: 'createRequest', request: request('first') })
    s = transition(s, {
      type: 'createRequest',
      request: { ...request('second'), fromPlace: customPlace(49.3548, 20.362, 'Iná brána') },
    })
    const q = {
      ...query(),
      from: 'mat',
      to: 'ssv',
      time: '11:00',
      personId: 'me',
      fromPlace: point,
      fromStopConfirmed: false,
    }
    expect(matchingRequests(s, q).map((r) => r.id)).toEqual(['first'])
    s = transition(s, { type: 'decideRequest', id: 'first', approve: true, approvePlaces: true })
    expect(s.requests.find((r) => r.id === 'second')?.status).toBe('pending')
  })
  it('umožní Flex medzi rôznymi bodmi blízko rovnakej zastávky a zachová obe strany', () => {
    let s = transition(createInitialState(), {
      type: 'createRequest',
      request: {
        ...request('nearby'),
        to: 'mat',
        toPlace: customPlace(49.356, 20.364, 'Druhá brána'),
        returnDate: createInitialState().serviceDate,
        returnTime: '13:30',
      },
    })
    s = transition(s, { type: 'decideRequest', id: 'nearby', approve: true, approvePlaces: true })
    const r = s.requests[0],
      out = s.trips.find((t) => t.id === r.tripId)!,
      back = s.trips.find((t) => t.id === r.returnTripId)!
    expect(out.stops[0].stopId).not.toBe(out.stops[1].stopId)
    expect(back.stops[0].place).toEqual(out.stops[1].place)
    expect(back.stops[1].place).toEqual(out.stops[0].place)
  })
})
describe('Vlastník účtu je dátový príznak', () => {
  it('migruje starý stabilný identifikátor a zachová výslovne určeného vlastníka', () => {
    const s = createInitialState()
    s.version = 2
    s.people = s.people
      .map((p) => {
        const copy = { ...p }
        delete copy.isAccountOwner
        return copy
      })
      .reverse()
    s.people.find((p) => p.id === 'me')!.name = 'Iné meno'
    const migrated = restoreState(s)!
    expect(migrated.people.filter((p) => p.isAccountOwner).map((p) => p.id)).toEqual(['me'])
    s.people = s.people.map((p) => ({ ...p, isAccountOwner: p.id === 'mother' }))
    expect(
      restoreState(s)!
        .people.filter((p) => p.isAccountOwner)
        .map((p) => p.id),
    ).toEqual(['mother'])
  })
  it('bežná úprava profilu nepridáva vlastnícke oprávnenie', () => {
    const s = createInitialState(),
      n = transition(s, { type: 'savePerson', person: { ...s.people[2], isAccountOwner: true } })
    expect(n.people[2].isAccountOwner).toBe(false)
    const owner = transition(s, {
      type: 'savePerson',
      person: { ...s.people[0], isAccountOwner: false },
    })
    expect(owner.people[0].isAccountOwner).toBe(true)
  })
})

describe('Ochrana detského kontaktu pri novej rezervácii', () => {
  it('ponechá staré údaje, ale bez kontaktu dospelého nepotvrdí nové miesto pre dieťa', () => {
    const s = createInitialState()
    s.people.find((p) => p.id === 'daughter')!.contact = ''
    expect(() =>
      transition(s, {
        type: 'book',
        id: 'child',
        personId: 'daughter',
        seats: 1,
        legs: [{ tripId: 't-0-1', from: 'mat', to: 'ssv' }],
      }),
    ).toThrow('rodiča')
  })
})

function createInitialState() {
  const s = createSeed()
  s.people.find((p) => p.id === 'daughter')!.contact = '+421 900 123 456'
  return s
}
