import { expect, it } from 'vitest'
import { createInitialState, addDays } from './data'
import { defaultDay, weekdayOf } from './regular'
import { planCoverage } from './planCoverage'
function fixture() {
  const s = createInitialState(),
    rule = {
      ...s.rules[0],
      start: s.serviceDate,
      end: addDays(s.serviceDate, 14),
      dayPlans: [defaultDay(weekdayOf(s.serviceDate))],
    }
  s.rules = [rule]
  s.bookings = []
  return { s, rule }
}
function addPair(s: ReturnType<typeof createInitialState>, offset: number) {
  const date = addDays(s.serviceDate, offset)
  for (const [index, from, to, tripIndex] of [
    [0, 'mat', 'school', 1],
    [1, 'school', 'mat', 3],
  ] as const)
    s.bookings.push({
      id: `b-${offset}-${index}`,
      ruleId: s.rules[0].id,
      personId: s.rules[0].personId,
      occurrenceDate: date,
      tripId: `t-${offset}-${tripIndex}`,
      from,
      to,
      status: 'confirmed',
      riderStatus: 'expected',
      name: 'Demo',
      seats: 1,
      mine: true,
      groupId: `pair-${offset}`,
    })
}
it('counts complete dates: zero yellow, two round trips (four bookings) blue, all obligations green', () => {
  const { s, rule } = fixture()
  expect(planCoverage(s, rule)).toMatchObject({ status: 'waiting', covered: 0, total: 3 })
  addPair(s, 0)
  addPair(s, 7)
  expect(planCoverage(s, rule)).toMatchObject({ status: 'partial', covered: 2, total: 3 })
  rule.end = addDays(s.serviceDate, 7)
  expect(planCoverage(s, rule)).toMatchObject({ status: 'secured', covered: 2, total: 2 })
})
it('does not count a missing, cancelled or unrelated return, or repeated outbound bookings', () => {
  const { s, rule } = fixture()
  addPair(s, 0)
  s.bookings[1].status = 'cancelled'
  s.bookings.push({ ...s.bookings[0], id: 'out-again' })
  expect(planCoverage(s, rule).status).toBe('waiting')
  s.bookings[1].status = 'confirmed'
  s.bookings[1].groupId = 'another-pair'
  expect(planCoverage(s, rule).covered).toBe(0)
  s.bookings[1].groupId = 'pair-0'
  expect(planCoverage(s, rule).covered).toBe(1)
})
it('excludes skipped dates and keeps pause/cancellation as special states', () => {
  const { s, rule } = fixture()
  addPair(s, 0)
  rule.exceptions = [
    { date: addDays(s.serviceDate, 7), type: 'skip' },
    { date: addDays(s.serviceDate, 14), type: 'skip' },
  ]
  expect(planCoverage(s, rule)).toMatchObject({ status: 'secured', total: 1 })
  rule.status = 'paused'
  expect(planCoverage(s, rule).status).toBe('paused')
  rule.status = 'cancelled'
  expect(planCoverage(s, rule).status).toBe('cancelled')
})
it('supports one-way dates and does not label a schedule with zero required dates secured', () => {
  const { s, rule } = fixture()
  rule.dayPlans[0].returning = undefined
  addPair(s, 0)
  expect(planCoverage(s, rule).covered).toBe(1)
  rule.exceptions = [0, 7, 14].map((offset) => ({
    date: addDays(s.serviceDate, offset),
    type: 'skip',
  }))
  expect(planCoverage(s, rule)).toMatchObject({ total: 0, status: 'waiting' })
})
