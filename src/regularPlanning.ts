import { addDays, dateLabel } from './data'
import { checkSchedule, scheduleError, scheduleOf } from './regular'
import { freeSeats, tripTime } from './domain'
import { personError } from './people'
import type { AppState, WeeklySchedule } from './types'
export interface RegularTask {
  id: string
  ruleId: string
  date: string
  deadline: string
  status: 'pending' | 'overdue' | 'confirmed' | 'confirmedLate'
  reason: string
  details?: string
}
/** Convert a Bratislava civil date/time to an instant, including DST. */
export function localInstant(date: string, time: string) {
  const target = Date.parse(`${date}T${time}:00Z`)
  let instant = target
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Bratislava',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .format(new Date(instant))
      .replace(' ', 'T')
    instant += target - Date.parse(parts + 'Z')
  }
  return instant
}
export function submitRegularPlan(s: AppState, schedule: WeeklySchedule, now: string) {
  const error = scheduleError(s, schedule)
  if (error) throw new Error(error)
  if (!['school', 'work'].includes(schedule.purpose))
    throw new Error('Vyberte účel Do práce alebo Do školy.')
  const rows = checkSchedule(s, schedule)
  const first = rows[0]?.date
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bratislava',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now))
  if (!first || first < addDays(today, 5))
    throw new Error('Prvá cesta musí byť najmenej o 5 kalendárnych dní.')
  return rows
}
export function processRegularPlans(s: AppState, now: string) {
  const instant = Date.parse(now)
  if (!Number.isFinite(instant)) throw new Error('Neplatný čas kontroly.')
  s.regularTasks ??= []
  const validIds = new Set(
    s.rules
      .filter((r) => r.status === 'active' && r.planStatus)
      .flatMap((r) => checkSchedule(s, scheduleOf(r)).map((row) => `${r.id}:${row.date}`)),
  )
  s.regularTasks = s.regularTasks.filter((t) => validIds.has(t.id))
  for (const rule of s.rules.filter((r) => r.status === 'active' && r.planStatus)) {
    const person = s.people.find((p) => p.id === rule.personId)
    for (const row of checkSchedule(s, scheduleOf(rule))) {
      const id = `${rule.id}:${row.date}`,
        prior = s.regularTasks.find((t) => t.id === id)
      const existing = s.bookings.filter(
        (b) => b.ruleId === rule.id && b.occurrenceDate === row.date && b.status === 'confirmed',
      )
      if (existing.length === (row.plan.returning ? 2 : 1) && prior?.status.startsWith('confirmed'))
        continue
      const out = row.out.find(
        (o) =>
          localInstant(row.date, tripTime(o.trip, row.plan.outbound.from)) > instant &&
          o.seats > 0 &&
          !o.duplicate &&
          (!row.plan.returning ||
            row.back.some(
              (b) =>
                b.seats > 0 &&
                !b.duplicate &&
                tripTime(b.trip, row.plan.returning!.from) > tripTime(o.trip, row.plan.outbound.to),
            )),
      )
      const back =
        out && row.plan.returning
          ? row.back.find(
              (b) =>
                b.seats > 0 &&
                !b.duplicate &&
                tripTime(b.trip, row.plan.returning!.from) >
                  tripTime(out.trip, row.plan.outbound.to),
            )
          : undefined
      const departure = out
        ? tripTime(out.trip, row.plan.outbound.from)
        : row.plan.outbound.timeMode === 'arrival'
          ? '00:00'
          : row.plan.outbound.time
      const deadline = new Date(localInstant(row.date, departure) - 86400000).toISOString()
      const allowedPause =
        !rule.automaticBookingPause || rule.automaticBookingPause.until < s.serviceDate
      const legs = out
        ? [
            { trip: out.trip, leg: row.plan.outbound },
            ...(back && row.plan.returning ? [{ trip: back.trip, leg: row.plan.returning }] : []),
          ]
        : []
      const ready = !!(
        row.available &&
        out &&
        (!row.plan.returning || back) &&
        person &&
        !personError(person) &&
        allowedPause &&
        legs.every(({ trip, leg }) => freeSeats(s, trip, leg.from, leg.to) > 0)
      )
      const task: RegularTask = {
        id,
        ruleId: rule.id,
        date: row.date,
        deadline,
        status: ready
          ? instant <= Date.parse(deadline)
            ? 'confirmed'
            : 'confirmedLate'
          : instant > Date.parse(deadline)
            ? 'overdue'
            : 'pending',
        reason: ready ? 'Miesto a oba potrebné smery sú zabezpečené.' : row.reason,
      }
      if (ready) {
        const group = `plan:${id}:${rule.revision ?? 0}`
        legs.forEach(({ trip, leg }, i) =>
          s.bookings.push({
            id: `${group}:${i}`,
            groupId: legs.length === 2 ? group : undefined,
            ruleId: rule.id,
            occurrenceDate: row.date,
            tripId: trip.id,
            personId: person!.id,
            name: person!.name,
            seats: 1,
            from: leg.from,
            to: leg.to,
            status: 'confirmed',
            riderStatus: 'expected',
            mine: true,
          }),
        )
        task.details = legs
          .map(
            ({ trip, leg }) =>
              `${tripTime(trip, leg.from)} ${s.stops.find((p) => p.id === leg.from)?.name} → ${tripTime(trip, leg.to)} ${s.stops.find((p) => p.id === leg.to)?.name} · linka ${trip.line}`,
          )
          .join(' / ')
      }
      if (!prior || prior.status !== task.status || prior.details !== task.details)
        (s.notifications ??= []).unshift({
          id: `${id}:${now}`,
          bookingId: id,
          text: task.details
            ? `${dateLabel(row.date)}: ${task.status === 'confirmedLate' ? 'Oneskorené potvrdenie – lehota 24 hodín nebola dodržaná. ' : ''}${task.details}. Miesto potvrdené.`
            : `${dateLabel(row.date)}: ${task.status === 'overdue' ? 'Lehota potvrdenia uplynula. ' : 'Plán bol prijatý. '}Dispečer zabezpečuje dopravu; miesto zatiaľ nie je potvrdené.`,
        })
      if (prior) Object.assign(prior, task)
      else s.regularTasks.push(task)
    }
    const tasks = s.regularTasks.filter((t) => t.ruleId === rule.id)
    rule.planStatus = tasks.every((t) => t.status === 'confirmed')
      ? 'confirmed'
      : tasks.some((t) => t.status === 'overdue' || t.status === 'confirmedLate')
        ? 'attention'
        : tasks.some((t) => t.status === 'confirmed')
          ? 'partial'
          : 'submitted'
  }
  s.regularCheckedAt = now
  return s
}

export function deadlineLabel(value: string) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bratislava',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
  return `${dateLabel(date)} · ${new Date(value).toLocaleTimeString('sk-SK', { timeZone: 'Europe/Bratislava', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`
}
