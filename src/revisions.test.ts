import { describe, expect, it } from 'vitest'
import { addDays, createInitialState as createSeed } from './data'
import { availableTrips, chronologyError, queryString, readQuery, validReturn } from './search'
import { canDrive, transition } from './domain'
import { personError, validContact } from './people'
import { restoreState } from './storage'
import type { AppState, Trip, Vehicle } from './types'
const q = () => ({
  ...readQuery(new URLSearchParams()),
  date: createInitialState().serviceDate,
  returnDate: createInitialState().serviceDate,
})
describe('Cestujúci, kapacita a nezávislé časové preferencie', () => {
  it('prenesie oba režimy, preferencie, osobu a počet miest cez URL', () => {
    const search = {
      ...q(),
      personId: 'mother',
      seats: 3,
      roundTrip: true,
      time: '08:00',
      timeMode: 'arrival' as const,
      timePreference: 'earlier' as const,
      returnTimeMode: 'departure' as const,
      returnTimePreference: 'later' as const,
    }
    expect(readQuery(new URLSearchParams(queryString(search)))).toEqual(search)
  })
  it('uprednostní skorší odchod a ponechá neskorší ako alternatívu', () => {
    const s = createInitialState(),
      query = { ...q(), time: '08:00', timePreference: 'earlier' as const }
    const results = availableTrips(s, query)
    expect(results[0].id).toBe('t-0-1')
    expect(results.map((t) => t.id)).toContain('t-0-4')
    expect(availableTrips(s, { ...query, timePreference: 'none' })[0].id).toBe('t-0-4')
    expect(availableTrips(s, { ...query, timePreference: 'later' })[0].id).toBe('t-0-4')
  })
  it('nevylúči všetky spoje, keď preferovaná časová strana neexistuje', () => {
    expect(
      availableTrips(createInitialState(), { ...q(), time: '23:00', timePreference: 'later' })[0]
        .id,
    ).toBe('t-0-4')
    expect(
      availableTrips(createInitialState(), { ...q(), time: '05:00', timePreference: 'earlier' })[0]
        .id,
    ).toBe('t-0-0')
  })
  it('dodrží najneskorší príchod a prepočíta kapacitu pre celú skupinu', () => {
    const s = createInitialState()
    expect(
      availableTrips(s, {
        ...q(),
        time: '07:30',
        timeMode: 'arrival',
        timePreference: 'later',
      }).every((t) => t.stops.find((x) => x.stopId === 'ssv')!.time <= '07:30'),
    ).toBe(true)
    expect(availableTrips(s, { ...q(), seats: 6 }).map((t) => t.id)).toEqual(['t-0-0'])
  })
  it('nezávisle vyhľadá návrat podľa príchodu a chráni skutočnú chronológiu', () => {
    const s = createInitialState(),
      query = {
        ...q(),
        roundTrip: true,
        time: '07:00',
        returnTime: '15:00',
        returnTimeMode: 'arrival' as const,
      }
    const back = availableTrips(s, query, true)
    expect(back[0].id).toBe('t-0-3')
    expect(back.some((t) => t.id === 't-0-5')).toBe(false)
    expect(chronologyError(s, { ...query, time: '17:00', returnTime: '08:00' })).toContain(
      'príchod',
    )
    expect(chronologyError(s, { ...query, returnDate: addDays(query.date, -1) })).toContain('Dátum')
    expect(
      validReturn(
        s.trips.find((t) => t.id === 't-0-4')!,
        s.trips.find((t) => t.id === 't-0-3')!,
        query,
      ),
    ).toBe(false)
  })
  it('nepotvrdí jednosmerné alebo iné množstvo miest oproti povinnej spiatočnej ceste', () => {
    const s = createInitialState(),
      search = { ...q(), personId: 'mother', seats: 2, roundTrip: true }
    expect(() =>
      transition(s, {
        type: 'book',
        id: 'mismatch',
        personId: 'mother',
        seats: 1,
        search,
        legs: [{ tripId: 't-0-1', from: 'mat', to: 'ssv' }],
      }),
    ).toThrow('vyhľadávaniu')
  })
  it('naplánuje Flex návrat podľa samostatného režimu Príchod do', () => {
    let s = createInitialState()
    s = transition(s, {
      type: 'createRequest',
      request: {
        id: 'round-arrival',
        from: 'mat',
        to: 'ssv',
        date: s.serviceDate,
        time: '09:30',
        timeMode: 'departure',
        timePreference: 'earlier',
        passengers: 2,
        personId: 'mother',
        members: ['mother'],
        ownSeats: 2,
        status: 'pending',
        accessibility: '',
        returnDate: s.serviceDate,
        returnTime: '11:30',
        returnTimeMode: 'arrival',
        returnTimePreference: 'later',
      },
    })
    s = transition(s, { type: 'decideRequest', id: 'round-arrival', approve: true })
    const req = s.requests.find((r) => r.id === 'round-arrival')!,
      trip = s.trips.find((t) => t.id === req.returnTripId)!
    expect(trip.stops.map((x) => x.time)).toEqual(['11:06', '11:30'])
    expect(s.bookings.filter((b) => b.groupId === req.id && b.mine)).toHaveLength(2)
  })
  it('nevytvorí Flex návrat, ktorý odchádza pred príchodom do cieľa', () => {
    const s = createInitialState()
    expect(() =>
      transition(s, {
        type: 'createRequest',
        request: {
          id: 'invalid-return',
          from: 'mat',
          to: 'ssv',
          date: s.serviceDate,
          time: '09:30',
          timeMode: 'departure',
          passengers: 1,
          personId: 'me',
          members: ['me'],
          ownSeats: 1,
          status: 'pending',
          accessibility: '',
          returnDate: s.serviceDate,
          returnTime: '10:00',
          returnTimeMode: 'arrival',
        },
      }),
    ).toThrow('príchod')
  })
})
describe('Bezpečná úprava rodinného profilu', () => {
  it('dieťa potrebuje platný kontakt na dospelého; dospelý ho mať nemusí', () => {
    const s = createInitialState(),
      child = { ...s.people[1], contact: '' }
    expect(personError(child)).toContain('rodiča')
    expect(() => transition(s, { type: 'savePerson', person: child })).toThrow('rodiča')
    expect(personError({ ...child, contact: 'nie-je-kontakt' })).toContain('platný')
    expect(personError({ ...child, contact: '+421 900 123 456' })).toBeNull()
    expect(personError({ ...child, contact: 'rodic@example.test' })).toContain('telefón')
    expect(personError({ ...child, age: 'Dospelý', contact: '' })).toBeNull()
    expect(validContact('123')).toBe(false)
  })
  it('odstránené staré nastavenia sa zachovajú bez nového overovania a nezmenia rezervácie', () => {
    const s = createInitialState(),
      person = { ...s.people[0], name: 'Zuzana Kováčová', walk: -100, favoriteStops: ['mat'] }
    const n = transition(s, { type: 'savePerson', person })
    expect(n.people[0].walk).toBe(-100)
    expect(n.people[0].favoriteStops).toEqual(['mat'])
    expect(n.bookings.find((b) => b.id === 'b1')).toMatchObject({
      personId: 'me',
      name: 'Zuzana Kováčová',
      seats: 1,
      status: 'confirmed',
    })
  })
})
describe('Vodič, vozidlo a konkrétne priradenie jazdy', () => {
  it('nepredpokladá kompatibilitu B s D1 alebo neznámym vozidlom', () => {
    const s = createInitialState(),
      driver = s.drivers[0],
      vehicle = s.vehicles[0]
    expect(driver.licenseCategories).toEqual(['B'])
    expect(canDrive(driver, vehicle)).toBe(true)
    expect(canDrive(driver, { ...vehicle, requiredLicenseCategory: 'D1' })).toBe(false)
    expect(canDrive(driver, { ...vehicle, requiredLicenseCategory: null })).toBe(false)
    expect(
      canDrive(
        { ...driver, licenseCategories: ['B', 'D1'] },
        { ...vehicle, requiredLicenseCategory: 'D1' },
      ),
    ).toBe(true)
  })
  it('kontroluje oprávnenie a kapacitu pri priradení a začatí jazdy', () => {
    const s = createInitialState()
    s.vehicles.push({ ...s.vehicles[0], id: 'large', requiredLicenseCategory: 'D1' })
    expect(() =>
      transition(s, { type: 'assignTrip', id: 't-0-1', driverId: 'd1', vehicleId: 'large' }),
    ).toThrow('oprávnenia')
    s.vehicles.push({ ...s.vehicles[0], id: 'small', capacity: 2 })
    expect(() =>
      transition(s, { type: 'assignTrip', id: 't-0-1', driverId: 'd1', vehicleId: 'small' }),
    ).toThrow('kapacitu')
    s.vehicles.find((v) => v.id === 'v2')!.requiredLicenseCategory = 'D'
    expect(() => transition(s, { type: 'tripStatus', id: 't-0-1', status: 'active' })).toThrow(
      'oprávnenia',
    )
  })
  it('priradí kompatibilného vodiča bez rozširovania jeho kategórií', () => {
    const s = createInitialState()
    s.drivers.push({ id: 'd3', name: 'Testovací vodič', licenseCategories: ['D1', 'D'] })
    s.vehicles.push({ ...s.vehicles[0], id: 'v3', requiredLicenseCategory: 'D1' })
    const n = transition(s, { type: 'assignTrip', id: 't-0-1', driverId: 'd3', vehicleId: 'v3' })
    expect(n.trips.find((t) => t.id === 't-0-1')).toMatchObject({ driverId: 'd3', vehicleId: 'v3' })
    expect(n.drivers[0].licenseCategories).toEqual(['B'])
  })
  it('neplánuje Flex bez voľného vodiča s potrebnou kategóriou', () => {
    const s = createInitialState()
    s.drivers.forEach((d) => {
      d.licenseCategories = []
    })
    expect(() => transition(s, { type: 'decideRequest', id: 'r2', approve: true })).toThrow(
      'oprávnením',
    )
  })
})
describe('Migrácia existujúcej simulácie z localStorage', () => {
  it('zachová staré rezervácie, požiadavky a profily vrátane skrytých polí', () => {
    const original = createInitialState(),
      legacy: Partial<AppState> = structuredClone(original)
    legacy.version = 1
    delete legacy.drivers
    delete legacy.activeDriverId
    legacy.trips = original.trips.map((t) => {
      const copy: Partial<Trip> = { ...t }
      delete copy.driverId
      return copy as Trip
    })
    legacy.vehicles = original.vehicles.map((v) => {
      const copy: Partial<Vehicle> = { ...v }
      delete copy.requiredLicenseCategory
      return copy as Vehicle
    })
    legacy.people![1].contact = ''
    const restored = restoreState(legacy)!
    expect(restored.version).toBe(5)
    expect(restored.bookings).toEqual(original.bookings)
    expect(restored.requests).toEqual(original.requests)
    expect(restored.people[1].contact).toBe('')
    expect(restored.people[1].walk).toBe(300)
    expect(restored.trips.every((t) => restored.drivers.some((d) => d.id === t.driverId))).toBe(
      true,
    )
  })
  it('nepridáva vodičovi chýbajúcu kategóriu a zachová neznámu požiadavku vozidla', () => {
    const state = createInitialState()
    state.drivers[0].licenseCategories = []
    state.vehicles[0].requiredLicenseCategory = null
    const restored = restoreState(state)!
    expect(restored.drivers[0].licenseCategories).toEqual([])
    expect(restored.vehicles[0].requiredLicenseCategory).toBeNull()
    expect(restoreState({ version: 1, trips: [] })).toBeNull()
  })
})

describe('Spoločné potvrdenie návratu zo starších požiadaviek', () => {
  it('nepotvrdí starší záznam s návratom pred skutočným príchodom', () => {
    const s = createInitialState()
    s.requests.unshift({
      id: 'legacy-round',
      from: 'mat',
      to: 'ssv',
      date: s.serviceDate,
      time: '11:00',
      timeMode: 'departure',
      passengers: 1,
      ownSeats: 1,
      members: ['me'],
      personId: 'me',
      status: 'pending',
      accessibility: '',
      returnDate: s.serviceDate,
      returnTime: '11:15',
    })
    const before = structuredClone(s)
    expect(() =>
      transition(s, { type: 'decideRequest', id: 'legacy-round', approve: true }),
    ).toThrow('príchode')
    expect(s).toEqual(before)
  })
  it('nezlúči odlišný režim času návratu do jednej požiadavky', () => {
    let s = createInitialState()
    const base = {
      from: 'mat',
      to: 'ssv',
      date: s.serviceDate,
      time: '09:30',
      timeMode: 'departure' as const,
      passengers: 1,
      ownSeats: 1,
      members: ['me'],
      personId: 'me',
      status: 'pending' as const,
      accessibility: '',
      returnDate: s.serviceDate,
      returnTime: '11:30',
    }
    s = transition(s, {
      type: 'createRequest',
      request: { ...base, id: 'arrive-back', returnTimeMode: 'arrival' },
    })
    s = transition(s, {
      type: 'createRequest',
      request: { ...base, id: 'depart-back', returnTimeMode: 'departure' },
    })
    s = transition(s, { type: 'decideRequest', id: 'arrive-back', approve: true })
    expect(s.requests.find((r) => r.id === 'depart-back')?.status).toBe('pending')
    expect(s.requests.find((r) => r.id === 'arrive-back')?.status).toBe('approved')
  })
})

function createInitialState() {
  const s = createSeed()
  s.people.find((p) => p.id === 'daughter')!.contact = '+421 900 123 456'
  return s
}
it('requires a guardian phone rather than an email and keeps adult contact optional', () => {
  const s = createInitialState(),
    child = { ...s.people[1], contact: 'parent@example.test' }
  expect(personError(child)).toContain('telefón')
  expect(() => transition(s, { type: 'savePerson', person: child })).toThrow('telefón')
  expect(personError({ ...child, contact: '+420 777 123 456' })).toBeNull()
  expect(personError({ ...child, age: 'Dospelý', contact: '' })).toBeNull()
})
