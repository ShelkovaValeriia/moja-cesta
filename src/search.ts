import { validPlace, samePlace } from './places'
import { normalizeTime } from './time'
import { today, minute } from './data'
import { findTrips, freeSeats, tripTime } from './domain'
import type { AppState, SearchQuery, TimeMode, TimePreference, Trip } from './types'
export const preferenceLabels: Record<TimePreference, string> = {
  none: 'Bez preferencie',
  earlier: 'Radšej skôr',
  later: 'Radšej neskôr',
}
const preference = (value: string | null): TimePreference =>
  value === 'earlier' || value === 'later' ? value : 'none'
export function readQuery(params: URLSearchParams): SearchQuery {
  const date = params.get('date') ?? today(),
    count = Number(params.get('seats') ?? 1)
  const parsePlace = (key: string) => {
    try {
      const value = JSON.parse(params.get(key) ?? 'null')
      return validPlace(value) ? value : undefined
    } catch {
      return undefined
    }
  }
  const fromPlace = parsePlace('fromPlace'),
    toPlace = parsePlace('toPlace')
  return {
    ...(fromPlace
      ? { fromPlace, fromStopConfirmed: params.get('fromStopConfirmed') === 'true' }
      : {}),
    ...(toPlace ? { toPlace, toStopConfirmed: params.get('toStopConfirmed') === 'true' } : {}),
    personId: params.get('personId') ?? 'me',
    seats: Number.isInteger(count) ? count : 0,
    from: params.get('from') ?? 'mat',
    to: params.get('to') ?? 'ssv',
    date,
    time: normalizeTime(params.get('time') ?? '06:00') ?? '',
    timeMode: params.get('timeMode') === 'arrival' ? 'arrival' : 'departure',
    timePreference: preference(params.get('timePreference')),
    roundTrip: params.get('roundTrip') === 'true',
    returnDate: params.get('returnDate') ?? date,
    returnTime: normalizeTime(params.get('returnTime') ?? '17:00') ?? '',
    returnTimeMode: params.get('returnTimeMode') === 'arrival' ? 'arrival' : 'departure',
    returnTimePreference: preference(params.get('returnTimePreference')),
  }
}
export const queryString = (q: SearchQuery) =>
  new URLSearchParams(
    Object.fromEntries(
      Object.entries(q)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [
          key,
          typeof value === 'object' ? JSON.stringify(value) : String(value),
        ]),
    ),
  ).toString()
/** Preferences rank the requested side of a departure time; arrival deadlines stay binding. */
export function availableTrips(state: AppState, q: SearchQuery, returning = false): Trip[] {
  if (!Number.isInteger(q.seats) || q.seats < 1 || q.seats > 8) return []
  const from = returning ? q.to : q.from,
    to = returning ? q.from : q.to,
    date = returning ? q.returnDate : q.date,
    time = returning ? q.returnTime : q.time,
    mode = returning ? q.returnTimeMode : q.timeMode,
    pref = returning ? q.returnTimePreference : q.timePreference,
    target = minute(time)
  const point = (t: Trip) => minute(tripTime(t, mode === 'arrival' ? to : from))
  const favored = (t: Trip) => (pref === 'earlier' ? point(t) <= target : point(t) >= target)
  return findTrips(state, from, to, date)
    .filter(
      (t) =>
        t.status === 'scheduled' &&
        freeSeats(state, t, from, to) >= q.seats &&
        (mode === 'arrival' ? point(t) <= target : pref === 'none' ? point(t) >= target : true),
    )
    .sort(
      (a, b) =>
        (pref === 'none' ? 0 : Number(favored(b)) - Number(favored(a))) ||
        Math.abs(point(a) - target) - Math.abs(point(b) - target) ||
        tripTime(a, from).localeCompare(tripTime(b, from)),
    )
}
export const validReturn = (out: Trip, back: Trip, q: SearchQuery) =>
  `${back.date}T${tripTime(back, q.to)}` > `${out.date}T${tripTime(out, q.to)}`
export function chronologyError(state: AppState, q: SearchQuery): string | null {
  if (!q.roundTrip) return null
  if (q.returnDate < q.date) return 'Dátum návratu nemôže byť pred cestou tam.'
  const outward = availableTrips(state, q),
    back = availableTrips(state, q, true)
  if (outward.some((t) => back.some((b) => validReturn(t, b, q)))) return null
  const shortest = (from: string, to: string) => {
    const durations = state.trips
      .filter((t) => t.kind === 'fixed')
      .flatMap((t) => {
        const a = t.stops.findIndex((s) => s.stopId === from),
          b = t.stops.findIndex((s) => s.stopId === to)
        return a >= 0 && b > a ? [minute(t.stops[b].time) - minute(t.stops[a].time)] : []
      })
    return durations.length ? Math.min(...durations) : 24
  }
  const arrival = minute(q.time) + (q.timeMode === 'departure' ? shortest(q.from, q.to) : 0),
    departure = minute(q.returnTime) - (q.returnTimeMode === 'arrival' ? shortest(q.to, q.from) : 0)
  return q.returnDate === q.date && departure <= arrival
    ? 'Návrat musí byť neskôr ako príchod do cieľa.'
    : null
}
const estimatedDeparture = (time: string, mode: TimeMode) =>
  minute(time) - (mode === 'arrival' ? 24 : 0)
export function matchingRequests(state: AppState, query: SearchQuery) {
  return state.requests
    .filter(
      (r) =>
        (r.status === 'pending' || r.status === 'approved') &&
        r.from === query.from &&
        r.to === query.to &&
        samePlace(
          r.fromPlace?.type === 'custom' ? r.fromPlace : undefined,
          query.fromPlace?.type === 'custom' ? query.fromPlace : undefined,
        ) &&
        samePlace(
          r.toPlace?.type === 'custom' ? r.toPlace : undefined,
          query.toPlace?.type === 'custom' ? query.toPlace : undefined,
        ) &&
        r.date === query.date &&
        Math.abs(
          estimatedDeparture(r.time, r.timeMode) - estimatedDeparture(query.time, query.timeMode),
        ) <= 60 &&
        Boolean(r.returnDate) === query.roundTrip &&
        (r.members.includes(query.personId) ||
          r.status === 'approved' ||
          r.passengers + query.seats <= 8) &&
        (!query.roundTrip ||
          (r.returnDate === query.returnDate &&
            !!r.returnTime &&
            Math.abs(
              estimatedDeparture(r.returnTime, r.returnTimeMode ?? 'departure') -
                estimatedDeparture(query.returnTime, query.returnTimeMode),
            ) <= 60)),
    )
    .sort(
      (a, b) =>
        Math.abs(
          estimatedDeparture(a.time, a.timeMode) - estimatedDeparture(query.time, query.timeMode),
        ) -
          Math.abs(
            estimatedDeparture(b.time, b.timeMode) - estimatedDeparture(query.time, query.timeMode),
          ) || b.passengers - a.passengers,
    )
}
