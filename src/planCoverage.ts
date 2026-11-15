import { occurrences, scheduleOf } from './regular'
import { tripTime } from './domain'
import type { AppState, RecurringRule } from './types'
/** Display coverage: a round-trip date requires two distinct, compatible confirmed bookings. */
export function planCoverage(state: AppState, rule: RecurringRule) {
  const dates = occurrences(scheduleOf(rule)).map(({ date, plan }) => {
    const candidates = state.bookings.filter(
      (b) =>
        b.ruleId === rule.id &&
        b.personId === rule.personId &&
        b.occurrenceDate === date &&
        b.status === 'confirmed' &&
        b.seats > 0 &&
        state.trips.some((t) => t.id === b.tripId && t.date === date),
    )
    const matches = (b: (typeof candidates)[number], leg: typeof plan.outbound) => {
      const trip = state.trips.find((t) => t.id === b.tripId)!
      return (
        b.from === leg.from &&
        b.to === leg.to &&
        trip.stops.findIndex((s) => s.stopId === b.from) >= 0 &&
        trip.stops.findIndex((s) => s.stopId === b.to) >
          trip.stops.findIndex((s) => s.stopId === b.from)
      )
    }
    for (const out of candidates.filter((b) => matches(b, plan.outbound))) {
      if (!plan.returning) return { date, plan, covered: true, bookings: [out] }
      const back = candidates.find(
        (b) =>
          b.id !== out.id &&
          matches(b, plan.returning!) &&
          (!(b.groupId || out.groupId) || b.groupId === out.groupId) &&
          tripTime(
            state.trips.find((t) => t.id === b.tripId)!,
            b.from,
          ) >
            tripTime(
              state.trips.find((t) => t.id === out.tripId)!,
              out.to,
            ),
      )
      if (back) return { date, plan, covered: true, bookings: [out, back] }
    }
    return { date, plan, covered: false, bookings: candidates }
  })
  const covered = dates.filter((d) => d.covered).length
  const status: keyof typeof planStatusLabels =
    rule.status === 'paused'
      ? 'paused'
      : rule.status === 'cancelled'
        ? 'cancelled'
        : dates.length > 0 && covered === dates.length
          ? 'secured'
          : covered > 0
            ? 'partial'
            : 'waiting'
  return { dates, covered, total: dates.length, status }
}
export const planStatusLabels = {
  waiting: 'Čaká na zabezpečenie',
  partial: 'Čiastočne potvrdené',
  secured: 'Doprava zabezpečená',
  paused: 'Pozastavené',
  cancelled: 'Zrušené',
}
