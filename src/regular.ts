import { addDays, minute } from './data'
import { canDrive, findTrips, freeSeats, tripTime } from './domain'
import { distanceMeters, inRegion, regularStopsAccepted, stopPlace, validPlace } from './places'
import { isChild, personError } from './people'
import { isTime24 } from './time'
import type {
  AppState,
  Booking,
  OccurrenceSelection,
  RecurringRule,
  RegularLeg,
  ScheduleException,
  Trip,
  WeeklyDayPlan,
  WeeklySchedule,
} from './types'

export const weekdays = ['Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota', 'Nedeľa']
export const purposeLabels = { school: 'Do školy', work: 'Do práce', other: 'Iné' }
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  )
}
export function maxScheduleEnd(start: string) {
  if (!validDate(start)) return ''
  const d = new Date(`${start}T12:00:00Z`),
    year = d.getUTCFullYear() + 1
  const day = Math.min(
    d.getUTCDate(),
    new Date(Date.UTC(year, d.getUTCMonth() + 1, 0)).getUTCDate(),
  )
  return `${year}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
export function plansOf(rule: RecurringRule): WeeklyDayPlan[] {
  return structuredClone(
    rule.dayPlans ??
      rule.days.map((weekday) => ({
        weekday,
        outbound: {
          from: rule.from,
          to: rule.to,
          time: rule.time,
          timeMode: 'departure',
          timePreference: 'none',
        },
      })),
  )
}
export function scheduleOf(rule: RecurringRule): WeeklySchedule {
  return {
    id: rule.id,
    personId: rule.personId,
    start: rule.start,
    end: rule.end,
    purpose: rule.purpose ?? 'other',
    dayPlans: plansOf(rule),
    exceptions: structuredClone(rule.exceptions ?? []),
  }
}
export const defaultDay = (weekday = 1): WeeklyDayPlan => ({
  weekday,
  outbound: {
    from: 'mat',
    to: 'school',
    time: '07:45',
    timeMode: 'arrival',
    timePreference: 'none',
  },
  returning: {
    from: 'school',
    to: 'mat',
    time: '13:30',
    timeMode: 'departure',
    timePreference: 'none',
  },
})
export function copyDay(plan: WeeklyDayPlan, weekday: number): WeeklyDayPlan {
  const copy = structuredClone(plan)
  delete copy.services
  return { ...copy, weekday }
}
export function putDay(plans: WeeklyDayPlan[], plan: WeeklyDayPlan) {
  return [...plans.filter((p) => p.weekday !== plan.weekday), structuredClone(plan)].sort(
    (a, b) => a.weekday - b.weekday,
  )
}
export function removeDay(plans: WeeklyDayPlan[], weekday: number) {
  return plans.filter((p) => p.weekday !== weekday)
}
export function scheduleError(s: AppState, schedule: WeeklySchedule): string | null {
  const person = s.people.find((p) => p.id === schedule.personId)
  if (!person) return 'Vyberte cestujúceho z rodinných profilov.'
  if (isChild(person) && personError(person)) return personError(person)
  if (!validDate(schedule.start) || !validDate(schedule.end) || schedule.end < schedule.start)
    return 'Zadajte platný začiatok a koniec obdobia.'
  if (schedule.end > maxScheduleEnd(schedule.start))
    return 'Obdobie môže trvať najviac 12 mesiacov.'
  if (schedule.end < s.serviceDate) return 'Obdobie už uplynulo. Vyberte budúci termín.'
  if (!schedule.dayPlans.length) return 'Pridajte aspoň jeden deň.'
  if (new Set(schedule.dayPlans.map((p) => p.weekday)).size !== schedule.dayPlans.length)
    return 'Rovnaký deň nemožno pridať dvakrát.'
  for (const p of schedule.dayPlans) {
    const error = dayError(s, p)
    if (error) return `${weekdays[p.weekday - 1] ?? 'Deň'}: ${error}`
  }
  if (new Set(schedule.exceptions.map((e) => e.date)).size !== schedule.exceptions.length)
    return 'Pre dátum môže existovať iba jedna výnimka.'
  for (const e of schedule.exceptions) {
    if (
      !validDate(e.date) ||
      e.date < schedule.start ||
      e.date > schedule.end ||
      !schedule.dayPlans.some((p) => p.weekday === weekdayOf(e.date))
    )
      return 'Výnimka musí patriť k dňu rozvrhu.'
    if (e.type !== 'skip' && e.type !== 'replace') return 'Neplatný typ výnimky.'
    if (
      e.type === 'replace' &&
      (!e.plan || e.plan.weekday !== weekdayOf(e.date) || dayError(s, e.plan))
    )
      return 'Skontrolujte náhradný plán pre konkrétny dátum.'
  }
  return null
}
export function dayError(s: AppState, plan: WeeklyDayPlan): string | null {
  if (!Number.isInteger(plan.weekday) || plan.weekday < 1 || plan.weekday > 7)
    return 'Vyberte deň týždňa.'
  for (const leg of [plan.outbound, ...(plan.returning ? [plan.returning] : [])]) {
    if (!isTime24(leg.time)) return 'Zadajte platný čas HH:mm.'
    if (
      !['departure', 'arrival'].includes(leg.timeMode) ||
      !['none', 'earlier', 'later'].includes(leg.timePreference)
    )
      return 'Skontrolujte časové podmienky.'
    if (!s.stops.some((x) => x.id === leg.from) || !s.stops.some((x) => x.id === leg.to))
      return 'Vyberte zastávky alebo body na mape.'
    if (leg.from === leg.to) {
      const stop = s.stops.find((x) => x.id === leg.from),
        known = stop && stopPlace(stop)
      const from = leg.fromPlace ?? known,
        to = leg.toPlace ?? known
      if (
        !from ||
        !to ||
        !(leg.fromPlace?.type === 'custom' || leg.toPlace?.type === 'custom') ||
        distanceMeters(from, to) <= 5
      )
        return 'Miesta nástupu a výstupu musia byť odlišné.'
    }
    for (const [id, place] of [
      [leg.from, leg.fromPlace],
      [leg.to, leg.toPlace],
    ] as const) {
      if (!place) continue
      if (!validPlace(place) || !inRegion(place.latitude, place.longitude))
        return 'Vyberte platné miesto v obsluhovanom regióne.'
      if (place.type === 'stop') {
        const stop = s.stops.find((x) => x.id === id),
          known = stop && stopPlace(stop)
        if (place.stopId !== id || !known || distanceMeters(place, known) >= 2)
          return 'Miesto musí zodpovedať vybranej zastávke.'
      }
    }
  }
  return null
}
export function occurrences(schedule: WeeklySchedule, from = schedule.start, to = schedule.end) {
  const result: { date: string; plan: WeeklyDayPlan }[] = []
  const end = to < schedule.end ? to : schedule.end
  if (
    !validDate(schedule.start) ||
    !validDate(end) ||
    schedule.end > maxScheduleEnd(schedule.start)
  )
    return result
  for (
    let date = from > schedule.start ? from : schedule.start;
    date <= end;
    date = addDays(date, 1)
  ) {
    const exception = schedule.exceptions.find((e) => e.date === date)
    if (exception?.type === 'skip') continue
    const plan = exception?.plan ?? schedule.dayPlans.find((p) => p.weekday === weekdayOf(date))
    if (plan) result.push({ date, plan })
  }
  return result
}
function replaceable(s: AppState, b: Booking, id: string, date?: string) {
  const trip = s.trips.find((t) => t.id === b.tripId)
  const pairUnstarted =
    !b.groupId ||
    s.bookings
      .filter((x) => x.groupId === b.groupId && x.status === 'confirmed')
      .every(
        (x) =>
          x.riderStatus === 'expected' &&
          s.trips.find((t) => t.id === x.tripId)?.status === 'scheduled',
      )
  return (
    pairUnstarted &&
    b.ruleId === id &&
    b.status === 'confirmed' &&
    b.riderStatus === 'expected' &&
    trip?.status === 'scheduled' &&
    trip.date >= s.serviceDate &&
    (!date || trip.date === date)
  )
}
export const releasableBookings = (s: AppState, id: string, date?: string) =>
  s.bookings.filter((b) => replaceable(s, b, id, date))
export function previewState(s: AppState, id: string): AppState {
  return { ...s, bookings: s.bookings.filter((b) => !replaceable(s, b, id)) }
}
export function fixedOptions(s: AppState, leg: RegularLeg, date: string, personId: string) {
  const target = minute(leg.time)
  return findTrips(s, leg.from, leg.to, date)
    .filter(
      (t) =>
        t.status === 'scheduled' &&
        !t.excludedDates?.includes(date) &&
        s.drivers.some(
          (d) =>
            d.id === t.driverId && s.vehicles.some((v) => v.id === t.vehicleId && canDrive(d, v)),
        ) &&
        (leg.timeMode === 'arrival'
          ? tripTime(t, leg.to) <= leg.time
          : leg.timePreference === 'none'
            ? tripTime(t, leg.from) >= leg.time
            : true),
    )
    .map((trip) => ({
      trip,
      seats: freeSeats(s, trip, leg.from, leg.to),
      duplicate: s.bookings.some(
        (b) => b.tripId === trip.id && b.personId === personId && b.status === 'confirmed',
      ),
    }))
    .sort((a, b) => {
      const point = (t: Trip) => minute(tripTime(t, leg.timeMode === 'arrival' ? leg.to : leg.from))
      const favored = (t: Trip) =>
        leg.timePreference === 'earlier' ? point(t) <= target : point(t) >= target
      return (
        (leg.timePreference === 'none' ? 0 : Number(favored(b.trip)) - Number(favored(a.trip))) ||
        Math.abs(point(a.trip) - target) - Math.abs(point(b.trip) - target)
      )
    })
}
export function checkSchedule(s: AppState, schedule: WeeklySchedule) {
  const view = previewState(s, schedule.id)
  return occurrences(schedule, s.serviceDate).map(({ date, plan }) => {
    const out = fixedOptions(view, plan.outbound, date, schedule.personId)
    const back = plan.returning ? fixedOptions(view, plan.returning, date, schedule.personId) : []
    const ready =
      regularStopsAccepted(plan.outbound) &&
      (!plan.returning || regularStopsAccepted(plan.returning))
    const canUse = (o: (typeof out)[number]) => o.seats >= 1 && !o.duplicate
    const available =
      ready &&
      out.some(
        (a) =>
          canUse(a) &&
          (!plan.returning ||
            back.some(
              (b) =>
                canUse(b) &&
                tripTime(b.trip, plan.returning!.from) > tripTime(a.trip, plan.outbound.to),
            )),
      )
    const published = out.length > 0 && (!plan.returning || back.length > 0)
    const reason = !ready
      ? 'Pre Fixed potvrďte existujúce zastávky. Bod na mape zostáva iba návrhom.'
      : !out.length || (plan.returning && !back.length)
        ? 'Chýba vhodný schválený spoj pre jeden alebo oba smery.'
        : out.every((o) => o.duplicate) || (plan.returning && back.every((o) => o.duplicate))
          ? 'Cestujúci už má rezerváciu. Nevytvoríme druhé miesto.'
          : !available
            ? 'Nedostatok miest alebo návrat pred príchodom do cieľa.'
            : 'Vyberte konkrétne spoje; zatiaľ bez rezervácie.'
    return { date, plan, out, back, available, published, reason }
  })
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
export type RegularAction =
  | {
      type: 'saveWeeklySchedule'
      schedule: WeeklySchedule
      reservations: OccurrenceSelection[]
      acceptPartial: boolean
      acknowledgeRelease?: boolean
    }
  | { type: 'scheduleException'; id: string; exception: ScheduleException }
  | { type: 'removeScheduleException'; id: string; date: string }
  | { type: 'pauseAutomaticBooking'; id: string; until: string; reason: string }
  | { type: 'resumeAutomaticBooking'; id: string; reason: string }
  | { type: 'reviewNoShow'; id: string; decision: 'confirm' | 'correct'; reason: string }

export function changeRuleStatus(s: AppState, id: string, status: RecurringRule['status']) {
  const rule = s.rules.find((r) => r.id === id)
  assert(rule && rule.status !== 'cancelled', 'Rozvrh sa nenašiel.')
  assert(['active', 'paused', 'cancelled'].includes(status), 'Neplatný stav rozvrhu.')
  if (status !== 'active')
    releasableBookings(s, id).forEach((b) => {
      b.status = 'cancelled'
    })
  rule.status = status
}
export function applyRegularAction(s: AppState, action: RegularAction): AppState {
  if (action.type === 'saveWeeklySchedule') {
    const schedule = structuredClone(action.schedule),
      old = s.rules.find((r) => r.id === schedule.id)
    const error = scheduleError(s, schedule)
    assert(!error, error ?? 'Skontrolujte rozvrh.')
    assert(!old || old.status !== 'cancelled', 'Zrušený rozvrh už nemožno meniť.')
    assert(
      !releasableBookings(s, schedule.id).length || action.acknowledgeRelease,
      'Potvrďte opätovnú kontrolu a nahradenie budúcich rezervácií.',
    )
    const proposed = occurrences(schedule, s.serviceDate)
    const otherNeeds = new Set(
      s.rules
        .filter(
          (r) =>
            r.id !== schedule.id && r.personId === schedule.personId && r.status !== 'cancelled',
        )
        .flatMap((r) =>
          occurrences(scheduleOf(r), s.serviceDate).map(
            ({ date, plan }) =>
              `${date}:${plan.outbound.from}:${plan.outbound.to}:${plan.outbound.time}:${plan.outbound.timeMode}`,
          ),
        ),
    )
    assert(
      !proposed.some(({ date, plan }) =>
        otherNeeds.has(
          `${date}:${plan.outbound.from}:${plan.outbound.to}:${plan.outbound.time}:${plan.outbound.timeMode}`,
        ),
      ),
      'Rovnaká pravidelná potreba už existuje pre tohto cestujúceho. Upravte pôvodný rozvrh.',
    )
    const revision = (old?.revision ?? 0) + 1
    releasableBookings(s, schedule.id).forEach((b) => {
      b.status = 'cancelled'
    })
    const checks = checkSchedule(s, schedule)
    assert(checks.length, 'V období nie je žiadny budúci deň podľa rozvrhu.')
    assert(
      new Set(action.reservations.map((r) => r.date)).size === action.reservations.length,
      'Dátum nemožno potvrdiť dvakrát.',
    )
    if (action.reservations.length) {
      assert(
        !old || old.status === 'active',
        'Najskôr obnovte pozastavený rozvrh a znova skontrolujte spoje.',
      )
      assert(
        !old?.automaticBookingPause || old.automaticBookingPause.until < s.serviceDate,
        'Automatické rezervovanie je dočasne pozastavené. Ručná jednorazová rezervácia zostáva dostupná.',
      )
      assert(
        action.reservations.length === checks.length || action.acceptPartial,
        'Výslovne potvrďte rezerváciu dostupných dátumov a uloženie ostatných ako potrieb.',
      )
    }
    const person = s.people.find((p) => p.id === schedule.personId)!
    for (const selection of action.reservations) {
      const row = checks.find((r) => r.date === selection.date)
      assert(row?.available, 'Pre zvolený dátum nie je zabezpečená celá cesta.')
      assert(
        Boolean(selection.returnTripId) === Boolean(row.plan.returning),
        'Spiatočná cesta: oba smery alebo žiadny.',
      )
      const legs = [
        { leg: row.plan.outbound, id: selection.outboundTripId, options: row.out },
        ...(row.plan.returning
          ? [{ leg: row.plan.returning, id: selection.returnTripId!, options: row.back }]
          : []),
      ]
      let outward: Trip | undefined
      for (const [i, { leg, id, options }] of legs.entries()) {
        const trip = options.find((o) => o.trip.id === id)?.trip
        assert(
          trip && trip.kind === 'fixed' && trip.status === 'scheduled',
          'Vyberte konkrétny schválený Fixed spoj.',
        )
        assert(regularStopsAccepted(leg), 'Pre pravidelný spoj potvrďte existujúce zastávky.')
        assert(
          freeSeats(s, trip, leg.from, leg.to) >= 1,
          'Na vybranom úseku už nie je voľné miesto. Nebola potvrdená žiadna zmena.',
        )
        assert(
          !s.bookings.some(
            (b) => b.tripId === trip.id && b.personId === person.id && b.status === 'confirmed',
          ),
          'Cestujúci už má rezerváciu na tento spoj.',
        )
        if (outward)
          assert(
            tripTime(trip, leg.from) > tripTime(outward, row.plan.outbound.to),
            'Návrat musí nasledovať po príchode do cieľa.',
          )
        const groupId = `regular:${schedule.id}:${revision}:${row.date}`
        s.bookings.push({
          id: `${groupId}:${i}`,
          groupId: legs.length === 2 ? groupId : undefined,
          ruleId: schedule.id,
          occurrenceDate: row.date,
          tripId: trip.id,
          personId: person.id,
          name: person.name,
          seats: 1,
          from: leg.from,
          to: leg.to,
          status: 'confirmed',
          riderStatus: 'expected',
          mine: true,
        })
        outward = trip
      }
    }
    const first = schedule.dayPlans[0].outbound
    const rule: RecurringRule = {
      ...old,
      ...schedule,
      from: first.from,
      to: first.to,
      time: first.time,
      days: schedule.dayPlans.map((p) => p.weekday).sort((a, b) => a - b),
      revision,
      status: old?.status ?? 'active',
    }
    if (old) s.rules[s.rules.findIndex((r) => r.id === old.id)] = rule
    else s.rules.unshift(rule)
  } else if (action.type === 'scheduleException' || action.type === 'removeScheduleException') {
    const rule = s.rules.find((r) => r.id === action.id)
    assert(rule && rule.status !== 'cancelled', 'Rozvrh sa nenašiel.')
    const date = action.type === 'scheduleException' ? action.exception.date : action.date
    assert(date >= s.serviceDate, 'Minulé dátumy nemožno meniť.')
    if (action.type === 'removeScheduleException')
      assert(
        rule.exceptions?.some((e) => e.date === date),
        'Výnimka sa nenašla.',
      )
    const bookings = s.bookings.filter(
      (b) =>
        b.ruleId === rule.id &&
        b.status === 'confirmed' &&
        s.trips.find((t) => t.id === b.tripId)?.date === date,
    )
    assert(
      bookings.every((b) => replaceable(s, b, rule.id, date)),
      'Začatú cestu už nemožno vynechať ani meniť.',
    )
    const exceptions = (rule.exceptions ?? []).filter((e) => e.date !== date)
    if (action.type === 'scheduleException') exceptions.push(structuredClone(action.exception))
    const error = scheduleError(s, { ...scheduleOf(rule), exceptions })
    assert(!error, error ?? 'Skontrolujte výnimku.')
    bookings.forEach((b) => {
      b.status = 'cancelled'
    })
    rule.exceptions = exceptions
  } else if (action.type === 'resumeAutomaticBooking') {
    const rule = s.rules.find((r) => r.id === action.id)
    assert(
      rule?.automaticBookingPause && action.reason.trim().length >= 5,
      'Vyberte obmedzený rozvrh a uveďte dôvod ukončenia obmedzenia.',
    )
    delete rule.automaticBookingPause
    ;(s.notifications ??= []).unshift({
      id: `${rule.id}:resume:${s.notifications?.length ?? 0}`,
      bookingId: `rule:${rule.id}`,
      text: `Dočasné obmedzenie automatických rezervácií bolo ukončené. Dôvod: ${action.reason.trim()}. Nové miesta potvrďte po kontrole spojení.`,
    })
  } else if (action.type === 'pauseAutomaticBooking') {
    const rule = s.rules.find((r) => r.id === action.id)
    assert(rule && rule.status !== 'cancelled', 'Rozvrh sa nenašiel.')
    assert(
      validDate(action.until) && action.until >= s.serviceDate && action.reason.trim().length >= 5,
      'Uveďte dôvod a koniec dočasného obmedzenia.',
    )
    assert(
      s.bookings.some((b) => b.ruleId === rule.id && b.noShow?.status === 'confirmed'),
      'Najskôr individuálne overte záznamy neúčasti. Automatické obmedzenie sa neuplatňuje.',
    )
    rule.automaticBookingPause = { until: action.until, reason: action.reason.trim() }
    ;(s.notifications ??= []).unshift({
      id: `${rule.id}:pause:${action.until}`,
      bookingId: `rule:${rule.id}`,
      text: `Nové automatické rezervovanie bolo po individuálnom posúdení pozastavené do ${action.until}. Dôvod: ${action.reason.trim()}. Existujúce miesta a ručné rezervácie zostávajú dostupné.`,
    })
  } else {
    const b = s.bookings.find((b) => b.id === action.id)
    assert(
      b?.noShow && b.noShow.status !== 'corrected',
      'Záznam neúčasti sa nenašiel alebo už bol opravený.',
    )
    assert(action.reason.trim().length >= 5, 'Uveďte dôvod kontroly alebo opravy.')
    if (action.decision === 'correct') {
      const trip = s.trips.find((t) => t.id === b.tripId)!
      if (trip.status === 'active' && trip.navigation)
        assert(
          trip.navigation.phase === 'stopped' &&
            trip.stops[trip.navigation.stopIndex]?.stopId === b.from,
          'Oprava aktívnej jazdy je možná iba na zastávke nástupu. Kontaktujte dispečera.',
        )
      assert(
        trip.status === 'completed' || freeSeats(s, trip, b.from, b.to) >= b.seats,
        'Miesto už obsadil iný cestujúci. Opravu musí vyriešiť dispečer po uvoľnení miesta.',
      )
      b.riderStatus = 'expected'
    }
    b.noShow.status = action.decision === 'correct' ? 'corrected' : 'confirmed'
    b.noShow.reason = action.reason.trim()
    b.noShow.history.push({ action: action.decision, reason: action.reason.trim() })
    if (b.mine)
      (s.notifications ??= []).unshift({
        id: `${b.id}:review:${b.noShow.history.length}`,
        bookingId: b.id,
        text:
          action.decision === 'correct'
            ? 'Chybná neúčasť bola opravená. Žiadna sankcia sa neuplatnila.'
            : 'Dispečer overil záznam neúčasti. Ak nesúhlasíte, kontaktujte podporu. Automatická sankcia sa neuplatnila.',
      })
  }
  return s
}

/** Calendar demand is the source of truth; confirmed bookings cover it rather than adding demand. */
export function regularDemand(s: AppState, from: string, to: string) {
  const rows = s.rules
    .filter((r) => r.status === 'active')
    .flatMap((rule) =>
      occurrences(scheduleOf(rule), from, to).map(({ date, plan }) => {
        const legs = [plan.outbound, ...(plan.returning ? [plan.returning] : [])]
        const coveredLegs = legs.filter((leg) =>
          s.bookings.some(
            (b) =>
              b.ruleId === rule.id &&
              b.occurrenceDate === date &&
              b.status === 'confirmed' &&
              b.personId === rule.personId &&
              b.from === leg.from &&
              b.to === leg.to &&
              s.trips.find((t) => t.id === b.tripId)?.date === date,
          ),
        ).length
        const covered = coveredLegs === legs.length
        const capacityGap =
          !covered &&
          legs.some((leg) => {
            const options = fixedOptions(s, leg, date, rule.personId)
            return options.length > 0 && options.every((o) => o.seats < 1 && !o.duplicate)
          })
        return {
          ruleId: rule.id,
          personId: rule.personId,
          purpose: rule.purpose ?? 'other',
          date,
          plan,
          legs,
          covered,
          coveredLegs,
          capacityGap,
        }
      }),
    )
  const people = new Set(rows.map((r) => r.personId)).size
  const requested = rows.reduce((n, r) => n + r.legs.length, 0)
  // Round trips only count as covered when both directions are secured.
  const covered = rows.reduce((n, r) => n + (r.covered ? r.legs.length : 0), 0)
  const routes = new Map<
    string,
    {
      from: string
      to: string
      time: string
      timeMode: string
      requested: number
      unmet: number
      capacityGap: number
    }
  >()
  for (const row of rows)
    for (const leg of row.legs) {
      const key = `${leg.from}|${leg.to}|${leg.time}|${leg.timeMode}`
      const route = routes.get(key) ?? { ...leg, requested: 0, unmet: 0, capacityGap: 0 }
      route.requested++
      if (!row.covered) route.unmet++
      if (!row.covered) {
        const options = fixedOptions(s, leg, row.date, row.personId)
        if (options.length && options.every((o) => o.seats < 1 && !o.duplicate)) route.capacityGap++
      }
      routes.set(key, route)
    }
  return {
    rows,
    people,
    requested,
    covered,
    unmet: requested - covered,
    school: new Set(rows.filter((r) => r.purpose === 'school').map((r) => r.personId)).size,
    work: new Set(rows.filter((r) => r.purpose === 'work').map((r) => r.personId)).size,
    byWeekday: weekdays.map((label, i) => ({
      label,
      count: rows.filter((r) => weekdayOf(r.date) === i + 1).reduce((n, r) => n + r.legs.length, 0),
    })),
    routes: [...routes.values()].sort((a, b) => b.requested - a.requested),
  }
}

/** Deterministic capacity-only planning estimate; does not change any trip or vehicle. */
export function regularCapacityGaps(s: AppState, from: string, to: string) {
  const demand = regularDemand(s, from, to)
  const additionalByTrip = new Map<string, number[]>()
  const missing = new Map<string, number>()
  const peakShortage = (trip: Trip, added: number[]) => {
    const capacity = s.vehicles.find((v) => v.id === trip.vehicleId)?.capacity ?? 0
    return Math.max(
      0,
      ...added.map(
        (n, i) =>
          n +
          capacity -
          freeSeats(s, trip, trip.stops[i].stopId, trip.stops[i + 1].stopId) -
          capacity,
      ),
    )
  }
  for (const row of demand.rows.filter((r) => !r.covered))
    for (const leg of row.legs) {
      const options = fixedOptions(s, leg, row.date, row.personId)
      if (options.some((o) => o.duplicate)) continue // No second seat for an existing passenger booking.
      const candidates = options
        .map(({ trip }) => {
          const added =
            additionalByTrip.get(trip.id) ?? Array.from({ length: trip.stops.length - 1 }, () => 0)
          const next = added.map(
            (n, i) =>
              n +
              (i >= trip.stops.findIndex((p) => p.stopId === leg.from) &&
              i < trip.stops.findIndex((p) => p.stopId === leg.to)
                ? 1
                : 0),
          )
          return { trip, next, increment: peakShortage(trip, next) - peakShortage(trip, added) }
        })
        .sort((a, b) => a.increment - b.increment)
      if (candidates.length) additionalByTrip.set(candidates[0].trip.id, candidates[0].next)
      else {
        const key = `${row.date}:${leg.from}:${leg.to}:${leg.time}:${leg.timeMode}`
        missing.set(key, (missing.get(key) ?? 0) + 1)
      }
    }
  const additionalSeatPlaces = [...additionalByTrip].reduce(
    (n, [id, added]) =>
      n +
      peakShortage(
        s.trips.find((t) => t.id === id)!,
        added,
      ),
    0,
  )
  const largestCapacity = Math.max(0, ...s.vehicles.map((v) => v.capacity))
  const additionalDepartures = largestCapacity
    ? [...missing.values()].reduce((n, count) => n + Math.ceil(count / largestCapacity), 0)
    : null
  return {
    additionalSeatPlaces,
    additionalDepartures,
    missingGroups: missing.size,
    missingPassengerLegs: [...missing.values()].reduce((n, c) => n + c, 0),
  }
}
