import { dateLabel } from './data'
import { dispatchPeople, requestParticipants, stopName } from './domain'
import { occurrences, plansOf, scheduleOf, validDate, weekdays } from './regular'
import type { AppState, RegularLeg, TimeMode, WeeklyDayPlan } from './types'

export type SubmissionSource = 'app' | 'phone' | 'regular'
export const submissionSources: Record<SubmissionSource, string> = {
  app: 'Aplikácia',
  phone: 'Telefonicky',
  regular: 'Pravidelný plán',
}
export interface SubmissionLeg {
  from: string
  to: string
  time: string
  timeMode: TimeMode
  when: string
  date?: string
  direction: string
}
export interface SubmissionPerson {
  id: string
  name: string
  code?: string
  seats: number
}
export interface DispatcherSubmission {
  key: string
  id: string
  source: SubmissionSource
  status: string
  statusLabel?: string
  people: SubmissionPerson[]
  unidentifiedSeats: number
  legs: SubmissionLeg[]
  period?: string
  notes: string[]
  href?: string
  sortDate: string
}

/** Read-only source records; this view never creates trips, seats or passenger identities. */
export function dispatcherSubmissions(state: AppState, date = ''): DispatcherSubmission[] {
  const people = new Map(dispatchPeople(state).map((p) => [p.id, p]))
  const person = (id: string, seats: number): SubmissionPerson => ({
    id,
    seats,
    name: people.get(id)?.name ?? 'Meno nie je uvedené',
    code: people.get(id)?.passengerCode,
  })
  const records: DispatcherSubmission[] = [
    ...state.requests.map((r): DispatcherSubmission => {
      const participants = Object.entries(requestParticipants(r)).filter(([, seats]) => seats > 0)
      const from = r.fromPlace?.name ?? stopName(state, r.from)
      const to = r.toPlace?.name ?? stopName(state, r.to)
      const legs: SubmissionLeg[] = [
        {
          from,
          to,
          date: r.date,
          when: dateLabel(r.date),
          time: r.time,
          timeMode: r.timeMode,
          direction: 'Cesta tam',
        },
      ]
      if (r.returnDate && r.returnTime)
        legs.push({
          from: to,
          to: from,
          date: r.returnDate,
          when: dateLabel(r.returnDate),
          time: r.returnTime,
          timeMode: r.returnTimeMode ?? 'departure',
          direction: 'Cesta späť',
        })
      return {
        key: `ride:${r.id}`,
        id: r.id,
        source: r.channel === 'phone' ? 'phone' : 'app',
        status: r.status,
        people: participants.map(([id, seats]) => person(id, seats)),
        unidentifiedSeats: Math.max(
          0,
          r.passengers - participants.reduce((sum, [, seats]) => sum + seats, 0),
        ),
        legs,
        notes: r.reason ? [r.reason] : [],
        sortDate: `${r.date}T${r.time}`,
        href: `/dispatcher/requests/${encodeURIComponent(r.id)}/route`,
      }
    }),
    ...state.phoneRequests.map((r): DispatcherSubmission => ({
      key: `phone:${r.id}`,
      id: r.id,
      source: 'phone',
      status: r.status,
      people: [person(r.personId, r.seats)],
      unidentifiedSeats: 0,
      legs: [
        {
          from: r.fromAddress,
          to: r.toAddress,
          date: r.date,
          when: dateLabel(r.date),
          time: r.time,
          timeMode: r.timeMode,
          direction: 'Cesta tam',
        },
        ...(r.returnJourney
          ? [
              {
                from: r.toAddress,
                to: r.fromAddress,
                date: r.returnJourney.date,
                when: dateLabel(r.returnJourney.date),
                time: r.returnJourney.time,
                timeMode: r.returnJourney.timeMode,
                direction: 'Cesta späť',
              },
            ]
          : []),
      ],
      notes:
        r.status === 'pending'
          ? ['Miesto nástupu a výstupu určí plánovanie. Požiadavka ešte nie je rezervácia miesta.']
          : [],
      sortDate: `${r.date}T${r.time}`,
      href: `/dispatcher/support/phone?search=${encodeURIComponent(r.id)}`,
    })),
    ...state.rules.map((r): DispatcherSubmission => {
      function leg(
        value: RegularLeg,
        when: string,
        direction: string,
        serviceDate?: string,
      ): SubmissionLeg {
        return {
          from: value.fromPlace?.name ?? stopName(state, value.from),
          to: value.toPlace?.name ?? stopName(state, value.to),
          time: value.time,
          timeMode: value.timeMode,
          when,
          direction,
          date: serviceDate,
        }
      }
      function day(plan: WeeklyDayPlan, serviceDate?: string) {
        const when = serviceDate ? dateLabel(serviceDate) : weekdays[plan.weekday - 1]
        return [
          leg(plan.outbound, when, 'Cesta tam', serviceDate),
          ...(plan.returning ? [leg(plan.returning, when, 'Cesta späť', serviceDate)] : []),
        ]
      }
      const legs = date
        ? validDate(date)
          ? occurrences(scheduleOf(r), date, date).flatMap((item) => day(item.plan, item.date))
          : []
        : [
            ...plansOf(r)
              .sort((a, b) => a.weekday - b.weekday)
              .flatMap((plan) => day(plan)),
            ...(r.exceptions ?? []).flatMap((exception) =>
              exception.type === 'replace' && exception.plan
                ? day(exception.plan, exception.date)
                : [],
            ),
          ]
      return {
        key: `regular:${r.id}`,
        id: r.id,
        source: 'regular',
        status: r.status,
        statusLabel:
          r.status === 'active'
            ? 'Aktívny plán'
            : r.status === 'paused'
              ? 'Pozastavený plán'
              : 'Zrušený plán',
        people: [person(r.personId, 1)],
        unidentifiedSeats: 0,
        legs,
        period: `${dateLabel(r.start)} – ${dateLabel(r.end)}`,
        sortDate: `${r.start}T${r.time}`,
        notes: [
          'Pravidelný plán sám osebe nepotvrdzuje miesto. Výnimky platia pred bežným týždňom.',
          ...(r.exceptions ?? [])
            .filter((e) => e.type === 'skip')
            .map((e) => `Vynechaný dátum: ${dateLabel(e.date)}`),
        ],
      }
    }),
  ]
  return records
    .filter((record) => !date || record.legs.some((leg) => leg.date === date))
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.key.localeCompare(b.key))
}

export function matchesSubmission(record: DispatcherSubmission, query: string) {
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '')
  const text = [
    record.id,
    submissionSources[record.source],
    ...record.people.flatMap((p) => [p.name, p.id, p.code ?? '']),
    ...record.legs.flatMap((leg) => [leg.from, leg.to, leg.time]),
  ].join(' ')
  return normalize(text).includes(normalize(query.trim()))
}
