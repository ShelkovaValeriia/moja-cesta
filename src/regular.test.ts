import { describe, expect, it } from 'vitest'
import { createInitialState as createSeed } from './data'
import { freeSeats, transition } from './domain'
import {
  checkSchedule,
  copyDay,
  defaultDay,
  maxScheduleEnd,
  occurrences,
  plansOf,
  putDay,
  regularDemand,
  removeDay,
  scheduleError,
  scheduleOf,
} from './regular'
import { restoreState } from './storage'
import type { AppState, Booking, OccurrenceSelection, Trip, WeeklySchedule } from './types'
const MON = '2026-11-16',
  TUE = '2026-11-17'
function fixture() {
  const s = createInitialState()
  s.serviceDate = MON
  s.rules = []
  s.bookings = []
  s.notifications = []
  const trip = (id: string, date: string, back = false, time = back ? '13:30' : '07:15'): Trip => ({
    id,
    line: back ? '102' : '101',
    date,
    kind: 'fixed',
    driverId: 'd1',
    vehicleId: 'v1',
    status: 'scheduled',
    requestIds: [],
    stops: back
      ? [
          { stopId: 'school', time },
          { stopId: 'ssv', time: time.slice(0, 3) + '37' },
          { stopId: 'mat', time: time.slice(0, 3) + '44' },
        ]
      : [
          { stopId: 'mat', time },
          { stopId: 'ssv', time: '07:22' },
          { stopId: 'school', time: '07:29' },
        ],
  })
  s.trips = [
    trip('out', MON),
    trip('back', MON, true),
    trip('tue-out', TUE),
    trip('tue-back', TUE, true, '15:00'),
  ]
  const schedule: WeeklySchedule = {
    id: 'weekly-test',
    personId: 'daughter',
    purpose: 'school',
    start: MON,
    end: TUE,
    dayPlans: [defaultDay(1)],
    exceptions: [],
  }
  return { s, schedule }
}
function save(
  s: AppState,
  schedule: WeeklySchedule,
  reservations: OccurrenceSelection[] = [],
  acceptPartial = false,
  acknowledgeRelease = false,
) {
  return transition(s, {
    type: 'saveWeeklySchedule',
    schedule,
    reservations,
    acceptPartial,
    acknowledgeRelease,
  })
}
const selected = { date: MON, outboundTripId: 'out', returnTripId: 'back' }
const fill = (tripId: string, from = 'school', to = 'mat', seats = 8): Booking => ({
  id: `fill-${tripId}`,
  tripId,
  from,
  to,
  seats,
  name: 'Demo',
  status: 'confirmed',
  riderStatus: 'expected',
  mine: false,
})
describe('Independent weekly days and calendar validation', () => {
  it('copies all nested fields independently and keeps weekdays in calendar order', () => {
    const monday = defaultDay(1)
    monday.outbound.fromPlace = { type: 'custom', name: 'Bod', latitude: 49.383, longitude: 20.367 }
    const tuesday = copyDay(monday, 2)
    tuesday.returning!.time = '15:00'
    tuesday.outbound.fromPlace!.name = 'Iný bod'
    expect(monday.returning!.time).toBe('13:30')
    expect(monday.outbound.fromPlace.name).toBe('Bod')
    const list = putDay(putDay([], tuesday), monday)
    expect(list.map((p) => p.weekday)).toEqual([1, 2])
    expect(removeDay(list, 2)).toEqual([monday])
  })
  it('supports different routes, modes and one-way plans on different days', () => {
    const { s, schedule } = fixture(),
      tuesday = copyDay(defaultDay(), 2)
    tuesday.returning = undefined
    tuesday.outbound.from = 'hal'
    tuesday.outbound.to = 'cer'
    tuesday.outbound.timeMode = 'departure'
    schedule.dayPlans.push(tuesday)
    const saved = save(s, schedule)
    expect(plansOf(saved.rules[0])).toEqual(schedule.dayPlans)
    expect(occurrences(schedule)).toHaveLength(2)
  })
  it('rejects duplicated weekdays and invalid dates', () => {
    const { s, schedule } = fixture()
    schedule.dayPlans.push(defaultDay(1))
    expect(() => save(s, schedule)).toThrow('dvakrát')
    schedule.dayPlans.pop()
    schedule.start = '2026-02-30'
    expect(scheduleError(s, schedule)).toContain('platný')
  })
  it('enforces calendar 12 months including leap-year bounds', () => {
    const { s, schedule } = fixture()
    expect(maxScheduleEnd('2028-02-29')).toBe('2029-02-28')
    schedule.end = '2027-11-16'
    expect(scheduleError(s, schedule)).toBeNull()
    schedule.end = '2027-11-17'
    expect(() => save(s, schedule)).toThrow('12 mesiacov')
  })
  it('requires the responsible adult contact and an existing family profile', () => {
    const { s, schedule } = fixture()
    s.people.find((p) => p.id === 'daughter')!.contact = ''
    expect(() => save(s, schedule)).toThrow('kontakt')
    schedule.personId = 'unknown'
    expect(() => save(s, schedule)).toThrow('rodinných')
  })
})
describe('Regular needs and concrete seat reservations', () => {
  it('checking and saving only demand does not reserve any seats', () => {
    const { s, schedule } = fixture()
    expect(checkSchedule(s, schedule)[0].available).toBe(true)
    expect(s.bookings).toHaveLength(0)
    const n = save(s, schedule)
    expect(n.bookings).toHaveLength(0)
    expect(regularDemand(n, MON, TUE)).toMatchObject({
      people: 1,
      requested: 2,
      covered: 0,
      unmet: 2,
      school: 1,
    })
  })
  it('reserves both directions together, links the person and reduces segment capacity', () => {
    const { s, schedule } = fixture()
    const n = save(s, schedule, [selected])
    expect(n.bookings).toHaveLength(2)
    expect(
      n.bookings.every(
        (b) => b.personId === 'daughter' && b.ruleId === schedule.id && b.occurrenceDate === MON,
      ),
    ).toBe(true)
    expect(n.bookings[0].groupId).toBe(n.bookings[1].groupId)
    expect(freeSeats(n, n.trips[0], 'mat', 'school')).toBe(7)
    expect(regularDemand(n, MON, TUE)).toMatchObject({ requested: 2, covered: 2, unmet: 0 })
  })
  it('rejects a half-confirmed round trip without any mutation', () => {
    const { s, schedule } = fixture()
    const before = structuredClone(s)
    expect(() => save(s, schedule, [{ date: MON, outboundTripId: 'out' }])).toThrow('oba smery')
    expect(s).toEqual(before)
  })
  it('does not confirm anything when the return is full or absent', () => {
    const { s, schedule } = fixture()
    s.bookings.push(fill('back'))
    expect(checkSchedule(s, schedule)[0].available).toBe(false)
    expect(() => save(s, schedule, [selected])).toThrow('celá cesta')
    expect(s.rules).toHaveLength(0)
    expect(s.bookings).toHaveLength(1)
    s.trips = s.trips.filter((t) => t.id !== 'back')
    expect(checkSchedule(s, schedule)[0].reason).toContain('Chýba')
  })
  it('rechecks the last seat when another booking is created after preview', () => {
    const { s, schedule } = fixture()
    s.vehicles[0].capacity = 1
    expect(checkSchedule(s, schedule)[0].available).toBe(true)
    const occupied = transition(s, {
      type: 'book',
      id: 'single',
      personId: 'me',
      seats: 1,
      legs: [{ tripId: 'out', from: 'mat', to: 'school' }],
    })
    expect(() => save(occupied, schedule, [selected])).toThrow('celá cesta')
    expect(occupied.bookings).toHaveLength(1)
  })
  it('requires explicit consent to confirm part of the calendar period', () => {
    const { s, schedule } = fixture()
    schedule.end = '2026-11-23'
    expect(() => save(s, schedule, [selected])).toThrow('Výslovne')
    const n = save(s, schedule, [selected], true)
    expect(regularDemand(n, MON, schedule.end)).toMatchObject({
      requested: 4,
      covered: 2,
      unmet: 2,
    })
    expect(n.bookings).toHaveLength(2)
  })
  it('does not duplicate a passenger seat already booked once', () => {
    const { s, schedule } = fixture()
    const one = transition(s, {
      type: 'book',
      id: 'single',
      personId: 'daughter',
      seats: 1,
      legs: [{ tripId: 'out', from: 'mat', to: 'school' }],
    })
    expect(checkSchedule(one, schedule)[0].available).toBe(false)
    expect(() => save(one, schedule, [selected])).toThrow('celá cesta')
    expect(one.bookings).toHaveLength(1)
  })
  it('requires review before replacing old future bookings and reuses their capacity', () => {
    const { s, schedule } = fixture()
    s.vehicles[0].capacity = 1
    const one = save(s, schedule, [selected])
    expect(checkSchedule(one, schedule)[0].available).toBe(true)
    expect(() => save(one, schedule, [selected])).toThrow('nahradenie')
    const two = save(one, schedule, [selected], false, true)
    expect(two.bookings.filter((b) => b.status === 'confirmed')).toHaveLength(2)
    expect(two.bookings.filter((b) => b.status === 'cancelled')).toHaveLength(2)
  })
  it('keeps independent return origins/destinations and validates actual chronology', () => {
    const { s, schedule } = fixture()
    schedule.dayPlans[0].returning!.from = 'ssv'
    const n = save(s, schedule, [selected])
    expect(n.bookings[1].from).toBe('ssv')
    s.trips[1].stops = [
      { stopId: 'ssv', time: '07:20' },
      { stopId: 'mat', time: '07:28' },
    ]
    schedule.dayPlans[0].returning!.time = '07:46'
    schedule.dayPlans[0].returning!.timePreference = 'earlier'
    expect(() => save(s, schedule, [selected])).toThrow('celá cesta')
  })
  it('keeps arbitrary map points as needs until official stops are explicitly accepted', () => {
    const { s, schedule } = fixture()
    schedule.dayPlans[0].outbound.fromPlace = {
      type: 'custom',
      name: 'Vybraný bod',
      latitude: 49.383,
      longitude: 20.367,
    }
    expect(checkSchedule(s, schedule)[0].available).toBe(false)
    expect(() => save(s, schedule, [selected])).toThrow('celá cesta')
    expect(save(s, schedule).rules[0].dayPlans![0].outbound.fromPlace).toEqual(
      schedule.dayPlans[0].outbound.fromPlace,
    )
    schedule.dayPlans[0].outbound.fromStopConfirmed = true
    expect(save(s, schedule, [selected]).bookings).toHaveLength(2)
    expect(s.stops).toHaveLength(6)
  })
  it('never reserves unpublished future dates, Flex trips, or trips without compatible assignments', () => {
    const { s, schedule } = fixture()
    s.trips[0].kind = 'flex'
    expect(checkSchedule(s, schedule)[0].available).toBe(false)
    s.trips[0].kind = 'fixed'
    s.trips[0].driverId = null
    expect(checkSchedule(s, schedule)[0].available).toBe(false)
    s.trips[0].driverId = 'd1'
    s.vehicles[0].requiredLicenseCategory = 'D'
    expect(checkSchedule(s, schedule)[0].available).toBe(false)
  })
})
describe('Calendar exceptions, lifecycle and live demand statistics', () => {
  it('counts exact calendar dates, different weekdays and one-way vs return', () => {
    const { s, schedule } = fixture()
    schedule.end = '2026-11-24'
    schedule.dayPlans.push({ ...copyDay(defaultDay(), 2), returning: undefined })
    const n = save(s, schedule)
    expect(regularDemand(n, MON, '2026-11-24')).toMatchObject({ requested: 6, unmet: 6 })
    expect(regularDemand(n, MON, MON).requested).toBe(2)
  })
  it('skips one concrete date, releases both seats and preserves the weekly plan', () => {
    const { s, schedule } = fixture()
    const n = save(s, schedule, [selected])
    const skip = transition(n, {
      type: 'scheduleException',
      id: schedule.id,
      exception: { date: MON, type: 'skip' },
    })
    expect(skip.bookings.every((b) => b.status === 'cancelled')).toBe(true)
    expect(skip.rules[0].dayPlans).toEqual(schedule.dayPlans)
    expect(regularDemand(skip, MON, TUE).requested).toBe(0)
    expect(freeSeats(skip, skip.trips[0], 'mat', 'school')).toBe(8)
    const restored = transition(skip, {
      type: 'removeScheduleException',
      id: schedule.id,
      date: MON,
    })
    expect(regularDemand(restored, MON, TUE)).toMatchObject({ requested: 2, unmet: 2 })
  })
  it('edits just one date and requires new explicit booking confirmation', () => {
    const { s, schedule } = fixture()
    const n = save(s, schedule, [selected]),
      plan = defaultDay(1)
    plan.returning!.time = '16:00'
    const changed = transition(n, {
      type: 'scheduleException',
      id: schedule.id,
      exception: { date: MON, type: 'replace', plan },
    })
    expect(changed.rules[0].dayPlans![0].returning!.time).toBe('13:30')
    expect(occurrences(scheduleOf(changed.rules[0]))[0].plan.returning!.time).toBe('16:00')
    expect(changed.bookings.filter((b) => b.status === 'confirmed')).toHaveLength(0)
    expect(regularDemand(changed, MON, TUE).unmet).toBe(2)
  })
  it('updates demand when edited, paused, resumed or cancelled without auto-confirmation', () => {
    const { s, schedule } = fixture()
    let n = save(s, schedule, [selected])
    n = transition(n, { type: 'ruleStatus', id: schedule.id, status: 'paused' })
    expect(regularDemand(n, MON, TUE).requested).toBe(0)
    expect(n.bookings.every((b) => b.status === 'cancelled')).toBe(true)
    n = transition(n, { type: 'ruleStatus', id: schedule.id, status: 'active' })
    expect(regularDemand(n, MON, TUE)).toMatchObject({ requested: 2, unmet: 2 })
    const edited = scheduleOf(n.rules[0])
    edited.dayPlans[0].returning = undefined
    n = save(n, edited)
    expect(regularDemand(n, MON, TUE).requested).toBe(1)
    n = transition(n, { type: 'ruleStatus', id: schedule.id, status: 'cancelled' })
    expect(regularDemand(n, MON, TUE).requested).toBe(0)
  })
  it('does not allow a date exception to cancel a journey already started', () => {
    const { s, schedule } = fixture()
    const n = save(s, schedule, [selected])
    n.trips[0].status = 'active'
    expect(() =>
      transition(n, {
        type: 'scheduleException',
        id: schedule.id,
        exception: { date: MON, type: 'skip' },
      }),
    ).toThrow('Začatú')
  })
  it('identifies only the affected direction when return seats are full', () => {
    const { s, schedule } = fixture()
    s.bookings.push(fill('back'))
    const n = save(s, schedule),
      stats = regularDemand(n, MON, TUE)
    expect(stats.routes.find((r) => r.from === 'school')?.capacityGap).toBe(1)
    expect(stats.routes.find((r) => r.from === 'mat')?.capacityGap).toBe(0)
    expect(stats.covered).toBe(0)
  })
  it('prevents duplicating an already registered regular need', () => {
    const { s, schedule } = fixture()
    const n = save(s, schedule)
    expect(() => save(n, { ...schedule, id: 'another' })).toThrow('Rovnaká pravidelná potreba')
  })
})
describe('Migration and fair no-show handling', () => {
  it('migrates old rules as needs, preserving original records, bookings and nested times', () => {
    const { s } = fixture()
    const legacy = {
      id: 'old',
      from: 'mat',
      to: 'school',
      time: '07:15 AM',
      days: [1, 3],
      start: MON,
      end: TUE,
      personId: 'daughter',
      status: 'active' as const,
    }
    s.version = 1
    s.rules = [legacy]
    s.bookings.push(fill('out', 'mat', 'school', 1))
    const n = restoreState(s)!
    expect(n.version).toBe(5)
    expect(n.rules[0].id).toBe('old')
    expect(n.rules[0].dayPlans?.[0].outbound.time).toBe('07:15')
    expect(n.rules[0].dayPlans?.[0].returning).toBeUndefined()
    expect(n.bookings).toEqual(s.bookings.map((b) => expect.objectContaining(b)))
    expect(regularDemand(n, MON, TUE).covered).toBe(0)
    expect(legacy.time).toBe('07:15 AM')
  })
  it('preserves version 4 plans, exceptions and confirmed reservations through reload', () => {
    const { s, schedule } = fixture()
    const n = save(s, schedule, [selected])
    const restored = restoreState(JSON.parse(JSON.stringify(n)))!
    expect(restored.rules).toEqual(n.rules)
    expect(restored.bookings).toEqual(n.bookings)
  })
  it('notifies the manager, permits correction and applies no automatic penalty', () => {
    const { s, schedule } = fixture()
    let n = save(s, schedule, [selected])
    n = transition(n, { type: 'tripStatus', id: 'out', status: 'active' })
    const id = n.bookings[0].id
    n = transition(n, { type: 'rider', id, status: 'absent' })
    expect(n.notifications?.[0].text).toContain('neúčasť')
    expect(n.bookings[0].noShow?.status).toBe('reported')
    expect(n.rules[0].automaticBookingPause).toBeUndefined()
    n = transition(n, {
      type: 'reviewNoShow',
      id,
      decision: 'correct',
      reason: 'Nesprávna značka vodiča.',
    })
    expect(n.bookings[0].riderStatus).toBe('expected')
    expect(n.bookings[0].noShow?.status).toBe('corrected')
  })
  it('allows a reviewed temporary automatic-booking pause without blocking manual bookings', () => {
    const { s, schedule } = fixture()
    let n = save(s, schedule, [selected])
    n = transition(n, { type: 'tripStatus', id: 'out', status: 'active' })
    const id = n.bookings[0].id
    n = transition(n, { type: 'rider', id, status: 'absent' })
    expect(() =>
      transition(n, {
        type: 'pauseAutomaticBooking',
        id: schedule.id,
        until: TUE,
        reason: 'Individuálne posúdenie.',
      }),
    ).toThrow('overte')
    n = transition(n, {
      type: 'reviewNoShow',
      id,
      decision: 'confirm',
      reason: 'Overené dispečerom po rozhovore.',
    })
    n = transition(n, {
      type: 'pauseAutomaticBooking',
      id: schedule.id,
      until: TUE,
      reason: 'Individuálne posúdenie.',
    })
    expect(n.bookings[1].status).toBe('confirmed')
    const manual = transition(n, {
      type: 'book',
      id: 'manual',
      personId: 'daughter',
      seats: 1,
      legs: [{ tripId: 'tue-out', from: 'mat', to: 'school' }],
    })
    expect(manual.bookings.some((b) => b.id === 'manual-0')).toBe(true)
  })
})

describe('Capacity estimates and time criteria', () => {
  it('counts additional seats from actual vehicle capacity and never resizes vehicles', async () => {
    const { regularCapacityGaps } = await import('./regular')
    const { s, schedule } = fixture()
    s.vehicles[0].capacity = 2
    s.bookings.push(fill('back', 'school', 'mat', 2))
    const n = save(s, schedule),
      estimate = regularCapacityGaps(n, MON, TUE)
    expect(estimate.additionalSeatPlaces).toBe(1)
    expect(estimate.additionalDepartures).toBe(0)
    expect(n.vehicles[0].capacity).toBe(2)
    n.trips = n.trips.filter((t) => t.id !== 'back')
    expect(regularCapacityGaps(n, MON, TUE)).toMatchObject({
      missingPassengerLegs: 1,
      additionalDepartures: 1,
    })
  })
  it('uses actual trip chronology when the outward arrival deadline is later than the chosen return', () => {
    const { s, schedule } = fixture()
    schedule.dayPlans[0].outbound.time = '08:00'
    schedule.dayPlans[0].returning!.time = '07:35'
    s.trips[1].stops = [
      { stopId: 'school', time: '07:40' },
      { stopId: 'mat', time: '07:55' },
    ]
    expect(save(s, schedule, [selected]).bookings).toHaveLength(2)
  })
  it('rejects forged existing-stop coordinates', () => {
    const { s, schedule } = fixture()
    schedule.dayPlans[0].outbound.fromPlace = {
      type: 'stop',
      stopId: 'mat',
      name: 'Bod',
      latitude: 49.383,
      longitude: 20.367,
    }
    expect(() => save(s, schedule, [selected])).toThrow('zastávke')
  })
})

describe('Preserving a secured return after departure', () => {
  it('does not release the return when a schedule is paused or cancelled after outward travel starts', () => {
    const { s, schedule } = fixture()
    let n = save(s, schedule, [selected])
    n = transition(n, { type: 'tripStatus', id: 'out', status: 'active' })
    for (const status of ['paused', 'cancelled'] as const) {
      const changed = transition(n, { type: 'ruleStatus', id: schedule.id, status })
      expect(changed.bookings.every((b) => b.status === 'confirmed')).toBe(true)
    }
  })
  it('keeps both existing legs when a weekly edit is saved after outward travel starts', () => {
    const { s, schedule } = fixture()
    let n = save(s, schedule, [selected])
    n = transition(n, { type: 'tripStatus', id: 'out', status: 'active' })
    const changed = save(n, schedule)
    expect(changed.bookings.every((b) => b.status === 'confirmed')).toBe(true)
  })
})

describe('Desired map locations beside existing stops', () => {
  it('saves a custom point and a distinct official stop even when their nearest stop ID is the same', () => {
    const { s, schedule } = fixture()
    schedule.dayPlans[0].returning = undefined
    schedule.dayPlans[0].outbound.to = 'mat'
    const stop = s.stops.find((x) => x.id === 'mat')!
    schedule.dayPlans[0].outbound.fromPlace = {
      type: 'custom',
      latitude: stop.latitude! + 0.001,
      longitude: stop.longitude!,
      name: 'Navrhované miesto',
    }
    const n = save(s, schedule)
    expect(n.rules).toHaveLength(1)
    expect(n.bookings).toHaveLength(0)
    expect(checkSchedule(n, schedule)[0].available).toBe(false)
  })
})

function createInitialState() {
  const s = createSeed()
  s.people.find((p) => p.id === 'daughter')!.contact = '+421 900 123 456'
  return s
}
