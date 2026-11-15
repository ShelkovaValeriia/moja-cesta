import { describe, expect, it } from 'vitest'
import { addDays, createInitialState } from './data'
import { freeSeats, transition } from './domain'
import { dispatcherSubmissions } from './dispatcherSubmissions'
import { occurrences, scheduleOf } from './regular'
import { restoreState } from './storage'
import type { AppState, PhoneJourneyRequest } from './types'

const common = { reason: 'Oprava údajov po telefonáte', acknowledgeRelease: true }
function phone(state: AppState): PhoneJourneyRequest {
  return {
    id: 'phone-edit',
    personId: 'mother',
    fromAddress: 'Hlavná 12, Matiašovce',
    toAddress: 'Námestie 1, Spišská Stará Ves',
    date: state.serviceDate,
    time: '08:00',
    timeMode: 'arrival',
    seats: 2,
    assistance: '',
    status: 'pending',
    createdAt: '2026-11-15T00:00:00Z',
    returnJourney: { date: state.serviceDate, time: '16:00', timeMode: 'departure' },
  }
}
function reserved() {
  const s = createInitialState()
  const r = s.requests[0]
  const trips = s.trips.filter((t) => t.kind === 'fixed' && t.date > s.serviceDate).slice(0, 2)
  r.status = 'approved'
  r.tripId = trips[0].id
  r.returnTripId = trips[1].id
  r.date = trips[0].date
  r.returnDate = trips[1].date
  r.returnTime = '18:00'
  for (const [i, trip] of trips.entries())
    s.bookings.push({
      id: `edit-booking-${i}`,
      tripId: trip.id,
      groupId: r.id,
      name: 'Skupina',
      seats: 3,
      from: trip.stops[0].stopId,
      to: trip.stops.at(-1)!.stopId,
      status: 'confirmed',
      riderStatus: 'expected',
      mine: false,
    })
  return s
}

describe('Dispatcher submission corrections', () => {
  it('expands all regular days to exact dates with replacements and skipped days', () => {
    const s = createInitialState()
    for (const rule of s.rules) {
      const record = dispatcherSubmissions(s).find((r) => r.key === `regular:${rule.id}`)!
      const dates = occurrences(scheduleOf(rule), rule.start, rule.end).map((o) => o.date)
      expect([...new Set(record.legs.map((l) => l.date))]).toEqual(dates)
      expect(record.legs.every((l) => /^\d{2}\.\d{2}\.\d{4}$/.test(l.when))).toBe(true)
    }
    s.requests[0].date = '2026-11-15'
    expect(dispatcherSubmissions(s).find((r) => r.id === 'r1')!.legs[0].when).toBe('15.11.2026')
  })

  it('corrects phone addresses, passenger and both time criteria without creating seats', () => {
    const s = createInitialState()
    s.phoneRequests = [phone(s)]
    const changed = {
      ...s.phoneRequests[0],
      personId: 'me',
      toAddress: 'Nová 9, Spišská Stará Ves',
      returnJourney: {
        date: addDays(s.serviceDate, 1),
        time: '17:40',
        timeMode: 'arrival' as const,
      },
    }
    const next = transition(s, {
      type: 'editSubmission',
      draft: { kind: 'phone', value: changed },
      ...common,
    })
    expect(next.phoneRequests[0]).toMatchObject({ ...changed, status: 'pending' })
    expect(next.bookings).toEqual(s.bookings)
    expect(next.people).toEqual(s.people)
    expect(s.phoneRequests[0].personId).toBe('mother')
    expect(next.submissionManagement?.['phone:phone-edit'].history[0].operation).toBe('edit')
  })

  it('rejects invalid calendar dates and impossible return times atomically', () => {
    const s = reserved(),
      before = structuredClone(s)
    for (const invalid of [
      { date: '2027-02-30' },
      { returnDate: s.requests[0].date, returnTime: '01:00' },
      { passengers: 0 },
      { memberSeats: { nobody: 1 } },
    ]) {
      expect(() =>
        transition(s, {
          type: 'editSubmission',
          draft: { kind: 'ride', value: { ...s.requests[0], ...invalid } },
          ...common,
        }),
      ).toThrow()
      expect(s).toEqual(before)
    }
  })

  it('releases outward and return seats on correction, preserving shared trips and other passengers', () => {
    const s = reserved(),
      r = s.requests[0]
    const next = transition(s, {
      type: 'editSubmission',
      draft: { kind: 'ride', value: { ...r, time: '10:15' } },
      ...common,
    })
    expect(next.requests[0]).toMatchObject({
      status: 'pending',
      time: '10:15',
      passengers: r.passengers,
    })
    expect(next.requests[0].tripId).toBeUndefined()
    expect(
      next.bookings.filter((b) => b.groupId === r.id).every((b) => b.status === 'cancelled'),
    ).toBe(true)
    expect(next.bookings.filter((b) => b.groupId !== r.id)).toEqual(
      s.bookings.filter((b) => b.groupId !== r.id),
    )
    expect(next.trips).toEqual(s.trips)
    const trip = s.trips.find((t) => t.id === r.tripId)!
    expect(freeSeats(next, trip)).toBeGreaterThanOrEqual(freeSeats(s, trip))
    expect(next.requests[0].memberSeats).toEqual({ me: 1 })
    expect(dispatcherSubmissions(next).find((r) => r.id === 'r1')!.unidentifiedSeats).toBe(2)
  })

  it('requires acknowledgement and protects a return after outward boarding', () => {
    const s = reserved()
    expect(() =>
      transition(s, {
        type: 'removeSubmission',
        key: 'ride:r1',
        ...common,
        acknowledgeRelease: false,
      }),
    ).toThrow('Potvrďte')
    s.bookings.find((b) => b.id === 'edit-booking-0')!.riderStatus = 'boarded'
    for (const type of ['declineSubmission', 'removeSubmission'] as const) {
      expect(() => transition(s, { type, key: 'ride:r1', ...common })).toThrow('návrat')
    }
    expect(() =>
      transition(s, {
        type: 'editSubmission',
        draft: { kind: 'ride', value: s.requests[0] },
        ...common,
      }),
    ).toThrow('návrat')
    expect(s.bookings.find((b) => b.id === 'edit-booking-1')!.status).toBe('confirmed')
  })

  it('declines every source with a reason and persists removal without deleting history', () => {
    let s = createInitialState()
    s.phoneRequests = [phone(s)]
    const keys = ['ride:r1', 'phone:phone-edit', `regular:${s.rules[0].id}`]
    for (const key of keys) {
      expect(() =>
        transition(s, { type: 'declineSubmission', key, ...common, reason: '' }),
      ).toThrow('dôvod')
      s = transition(s, { type: 'declineSubmission', key, ...common })
      expect(dispatcherSubmissions(s).find((r) => r.key === key)!.status).toBe('rejected')
      s = transition(s, { type: 'removeSubmission', key, ...common })
      expect(dispatcherSubmissions(s).some((r) => r.key === key)).toBe(false)
    }
    const restored = restoreState(JSON.parse(JSON.stringify(s)))!
    expect(dispatcherSubmissions(restored).some((r) => keys.includes(r.key))).toBe(false)
    expect(restored.requests.some((r) => r.id === 'r1')).toBe(true)
    expect(restored.submissionManagement?.['ride:r1'].history).toHaveLength(2)
  })

  it('corrects anonymous app demand without inventing a passenger', () => {
    const s = createInitialState(),
      r = s.requests[1]
    const next = transition(s, {
      type: 'editSubmission',
      draft: { kind: 'ride', value: { ...r, time: '12:15' } },
      ...common,
    })
    const record = dispatcherSubmissions(next).find((item) => item.key === `ride:${r.id}`)!
    expect(record.people).toEqual([])
    expect(record.unidentifiedSeats).toBe(r.passengers)
    expect(next.requests).toHaveLength(s.requests.length)
    expect(next.people).toEqual(s.people)
  })

  it('safely supports old dedicated Flex group reservations', () => {
    const s = createInitialState()
    const next = transition(s, { type: 'declineSubmission', key: 'ride:r3', ...common })
    expect(next.bookings.find((b) => b.id === 'b5')!.status).toBe('cancelled')
    expect(next.bookings.find((b) => b.id === 'b6')!.status).toBe('confirmed')
    expect(next.trips).toEqual(s.trips)
  })

  it('edits the whole recurring plan, releases future seats and resets stale planning tasks', () => {
    const s = createInitialState(),
      rule = s.rules[0],
      schedule = scheduleOf(rule)
    const trip = s.trips.find((t) => t.kind === 'fixed' && t.date > s.serviceDate)!
    s.bookings.push({
      id: 'regular-edit',
      ruleId: rule.id,
      tripId: trip.id,
      name: 'Cestujúci',
      from: trip.stops[0].stopId,
      to: trip.stops.at(-1)!.stopId,
      seats: 1,
      mine: true,
      status: 'confirmed',
      riderStatus: 'expected',
    })
    const next = transition(s, {
      type: 'editSubmission',
      draft: {
        kind: 'regular',
        value: {
          ...schedule,
          personId: 'me',
          dayPlans: schedule.dayPlans.map((p) => ({
            ...p,
            outbound: { ...p.outbound, time: '08:15' },
          })),
        },
      },
      ...common,
    })
    expect(next.rules.find((r) => r.id === rule.id)!.dayPlans![0].outbound.time).toBe('08:15')
    expect(next.bookings.find((b) => b.id === 'regular-edit')!.status).toBe('cancelled')
    expect(next.rules.find((r) => r.id === rule.id)!.planStatus).toBe('submitted')
    expect(next.trips).toEqual(s.trips)
  })

  it('preserves a paused plan when correcting its details', () => {
    const s = createInitialState()
    const rule = s.rules[0]
    rule.status = 'paused'
    rule.personId = 'me'
    const next = transition(s, {
      type: 'editSubmission',
      draft: { kind: 'regular', value: scheduleOf(rule) },
      ...common,
    })
    expect(next.rules.find((r) => r.id === rule.id)!.status).toBe('paused')
  })
})
