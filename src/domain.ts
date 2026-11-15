import {
  ensurePassengerIdentity,
  passengerCodeError,
  generatePassengerCode,
  usedPassengerCodes,
} from './passengerCodes'
import { navigationTransition } from './driverNavigation'
import type { NavigationAction } from './driverNavigation'
import { submitRegularPlan, processRegularPlans, localInstant } from './regularPlanning'
import type { WeeklySchedule } from './types'
import type {
  AppState,
  Booking,
  Person,
  RecurringRule,
  RideRequest,
  RiderStatus,
  StopProposal,
  Trip,
  Driver,
  Vehicle,
  SearchQuery,
  JourneyPlace,
} from './types'
import { clock, minute } from './data'
import { isChild, personError } from './people'
import {
  applyRegularAction,
  changeRuleStatus,
  scheduleError,
  scheduleOf,
  checkSchedule,
} from './regular'
import type { RegularAction } from './regular'
import {
  hasCustomPlaces,
  regularStopsAccepted,
  samePlace,
  validPlace,
  tripPointId,
  tripPointName,
  inRegion,
  distanceMeters,
  stopPlace,
} from './places'
export const stopName = (s: AppState, id: string) =>
  s.stops.find((x) => x.id === id)?.name ?? 'Neznáma zastávka'
export const villageName = (s: AppState, id: string) =>
  s.stops.find((x) => x.id === id)?.village ?? id
export const tripTime = (t: Trip, stopId: string) =>
  t.stops.find((x) => x.stopId === stopId)?.time ?? '—'
export function freeSeats(s: AppState, trip: Trip, from?: string, to?: string) {
  const start = from ? trip.stops.findIndex((x) => x.stopId === from) : 0
  const end = to ? trip.stops.findIndex((x) => x.stopId === to) : trip.stops.length - 1
  if (start < 0 || end <= start) return 0
  const capacity = s.vehicles.find((v) => v.id === trip.vehicleId)?.capacity ?? 0
  let occupied = 0
  for (let i = start; i < end; i++) {
    const count = s.bookings
      .filter(
        (b) =>
          b.tripId === trip.id &&
          b.status === 'confirmed' &&
          b.riderStatus !== 'absent' &&
          trip.stops.findIndex((x) => x.stopId === b.from) <= i &&
          trip.stops.findIndex((x) => x.stopId === b.to) > i,
      )
      .reduce((sum, b) => sum + b.seats, 0)
    occupied = Math.max(occupied, count)
  }
  return Math.max(0, capacity - occupied)
}
export function findTrips(
  s: AppState,
  from: string,
  to: string,
  date: string,
  time = '00:00',
  mode: 'departure' | 'arrival' = 'departure',
) {
  return s.trips
    .filter(
      (t) =>
        t.kind === 'fixed' &&
        t.date === date &&
        t.status !== 'completed' &&
        t.stops.findIndex((x) => x.stopId === from) >= 0 &&
        t.stops.findIndex((x) => x.stopId === to) > t.stops.findIndex((x) => x.stopId === from) &&
        (mode === 'departure' ? tripTime(t, from) >= time : tripTime(t, to) <= time),
    )
    .sort((a, b) => tripTime(a, from).localeCompare(tripTime(b, from)))
}
export type Action =
  | NavigationAction
  | {
      type: 'submitRegularPlan'
      schedule: WeeklySchedule
      now: string
      acknowledgeRelease?: boolean
    }
  | { type: 'processRegularPlans'; now: string }
  | RegularAction
  | {
      type: 'book'
      legs: { tripId: string; from: string; to: string }[]
      personId: string
      seats: number
      id: string
      search?: SearchQuery
    }
  | { type: 'assignTrip'; id: string; driverId: string; vehicleId: string }
  | { type: 'selectDriver'; id: string }
  | { type: 'cancelBooking'; id: string }
  | { type: 'createRequest'; request: RideRequest }
  | { type: 'joinRequest'; id: string; personId: string; seats?: number }
  | { type: 'cancelRequest'; id: string }
  | {
      type: 'decideRequest'
      id: string
      approve: boolean
      reason?: string
      approvePlaces?: boolean
    }
  | { type: 'tripStatus'; id: string; status: 'active' | 'completed' }
  | { type: 'rider'; id: string; status: RiderStatus }
  | { type: 'savePerson'; person: Person }
  | { type: 'addRule'; rule: RecurringRule }
  | { type: 'ruleStatus'; id: string; status: RecurringRule['status'] }
  | { type: 'addProposal'; proposal: StopProposal }
  | { type: 'decideProposal'; id: string; approve: boolean; reason?: string }
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function validateRoute(
  s: AppState,
  from: string,
  to: string,
  date: string,
  time: string,
  allowSame = false,
) {
  check(
    s.stops.some((x) => x.id === from) && s.stops.some((x) => x.id === to),
    'Vyberte zastávku z ponuky.',
  )
  check(from !== to || allowSame, 'Miesto nástupu a výstupu musí byť odlišné.')
  check(
    /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= s.serviceDate,
    'Vyberte dnešný alebo budúci dátum.',
  )
  check(/^([01]\d|2[0-3]):[0-5]\d$/.test(time), 'Zadajte platný čas.')
}
function planFlex(
  s: AppState,
  request: RideRequest,
  id: string,
  from: string,
  to: string,
  date: string,
  time: string,
  places: { from?: JourneyPlace; to?: JourneyPlace } = {
    from: request.fromPlace,
    to: request.toPlace,
  },
): Trip {
  const departure = request.timeMode === 'arrival' ? minute(time) - 24 : minute(time)
  check(
    departure >= 0 && departure + 24 < 24 * 60,
    'Pre túto jazdu nie je dostupný denný časový úsek.',
  )
  let assignment: { vehicle: Vehicle; driver: Driver } | undefined
  const conflicts = (t: Trip) =>
    t.date === date &&
    t.status !== 'completed' &&
    departure < minute(t.stops.at(-1)!.time) + 10 &&
    departure + 24 + 10 > minute(t.stops[0].time)
  for (const vehicle of s.vehicles) {
    if (
      vehicle.capacity < request.passengers ||
      s.trips.some((t) => t.vehicleId === vehicle.id && conflicts(t))
    )
      continue
    const driver = s.drivers.find(
      (d) => canDrive(d, vehicle) && !s.trips.some((t) => t.driverId === d.id && conflicts(t)),
    )
    if (driver) {
      assignment = { vehicle, driver }
      break
    }
  }
  check(
    assignment,
    'Vozidlo nie je dostupné alebo chýba voľný vodič s potrebným oprávnením. Jazda by zasiahla do existujúceho spoja alebo prekročila kapacitu. Vyberte iný čas.',
  )
  const { vehicle, driver } = assignment
  return {
    id,
    line: `F${s.trips.filter((t) => t.kind === 'flex').length + 1}`.padEnd(3, '0'),
    kind: 'flex',
    date,
    vehicleId: vehicle.id,
    driverId: driver.id,
    stops: [
      { stopId: tripPointId(from, places.from), time: clock(departure), place: places.from },
      { stopId: tripPointId(to, places.to), time: clock(departure + 24), place: places.to },
    ],
    status: 'scheduled',
    requestIds: [request.id],
  }
}
export function transition(state: AppState, action: Action): AppState {
  return ensurePassengerIdentity(applyTransition(state, action))
}
function applyTransition(state: AppState, action: Action): AppState {
  const s = structuredClone(state)
  switch (action.type) {
    case 'correctRider':
    case 'startNavigation':
    case 'navigationArrive':
    case 'navigationContinue':
      return navigationTransition(s, action)
    case 'processRegularPlans':
      return processRegularPlans(s, action.now)
    case 'submitRegularPlan': {
      submitRegularPlan(s, action.schedule, action.now)
      const next = applyRegularAction(s, {
        type: 'saveWeeklySchedule',
        schedule: action.schedule,
        reservations: [],
        acceptPartial: false,
        acknowledgeRelease: action.acknowledgeRelease,
      })
      const rule = next.rules.find((r) => r.id === action.schedule.id)!
      rule.planStatus = 'submitted'
      rule.submittedAt = action.now
      next.regularTasks = next.regularTasks?.filter((t) => t.ruleId !== rule.id)
      // Submission creates dispatcher tasks but never reserves seats.
      for (const row of checkSchedule(next, action.schedule))
        next.regularTasks = (next.regularTasks ?? []).concat({
          id: `${rule.id}:${row.date}`,
          ruleId: rule.id,
          date: row.date,
          deadline: new Date(
            localInstant(
              row.date,
              row.plan.outbound.timeMode === 'arrival' ? '00:00' : row.plan.outbound.time,
            ) - 86400000,
          ).toISOString(),
          status: 'pending',
          reason:
            'Plán čaká na spracovanie systémom a dispečerom. Pri chýbajúcom spoji treba zabezpečiť dopravu.',
        })
      return next
    }

    case 'saveWeeklySchedule':
    case 'scheduleException':
    case 'removeScheduleException':
    case 'pauseAutomaticBooking':
    case 'resumeAutomaticBooking':
    case 'reviewNoShow':
      return applyRegularAction(s, action)
    case 'book': {
      const person = s.people.find((p) => p.id === action.personId)
      check(person, 'Vyberte cestujúceho.')
      if (isChild(person))
        check(
          !personError(person),
          personError(person) ?? 'Doplňte kontakt na zodpovedného dospelého.',
        )
      check(Number.isInteger(action.seats) && action.seats > 0, 'Vyberte platný počet miest.')
      check(
        action.legs.length === 1 || action.legs.length === 2,
        'Vyberte jednu cestu alebo obe smery spiatočnej cesty.',
      )
      if (action.search) {
        check(
          regularStopsAccepted(action.search),
          'Pre pravidelný spoj potvrďte navrhnuté zastávky. Vlastný bod nie je schválená zastávka.',
        )
        validateRequestedPlace(s, action.search.from, action.search.fromPlace)
        validateRequestedPlace(s, action.search.to, action.search.toPlace)
        check(
          action.search.personId === action.personId &&
            action.search.seats === action.seats &&
            action.legs.length === (action.search.roundTrip ? 2 : 1),
          'Rezervácia musí zodpovedať vyhľadávaniu vrátane oboch smerov a počtu miest.',
        )
        check(
          action.legs[0].from === action.search.from && action.legs[0].to === action.search.to,
          'Nástup a výstup musia zodpovedať potvrdeným zastávkam.',
        )
      }
      for (const [i, leg] of action.legs.entries()) {
        const trip = s.trips.find((t) => t.id === leg.tripId)
        check(
          trip && trip.status === 'scheduled' && trip.date >= s.serviceDate,
          'Tento spoj už nie je možné rezervovať.',
        )
        check(
          freeSeats(s, trip, leg.from, leg.to) >= action.seats,
          'Na vybranom spoji nie je dostatok voľných miest. Rezervácia nebola vytvorená.',
        )
        check(
          !s.bookings.some(
            (b) =>
              b.tripId === trip.id &&
              b.personId === person.id &&
              b.mine &&
              b.status === 'confirmed',
          ),
          'Tento cestujúci už má rezerváciu na vybraný spoj.',
        )
        if (i === 1) {
          const first = action.legs[0],
            outbound = s.trips.find((t) => t.id === first.tripId)!
          check(
            leg.from === first.to && leg.to === first.from,
            'Spiatočná cesta musí smerovať späť na pôvodnú zastávku.',
          )
          check(
            `${trip.date}T${tripTime(trip, leg.from)}` >
              `${outbound.date}T${tripTime(outbound, first.to)}`,
            'Návrat musí nasledovať po príchode do cieľa.',
          )
        }
        s.bookings.push({
          id: `${action.id}-${i}`,
          tripId: trip.id,
          personId: person.id,
          name: person.name,
          seats: action.seats,
          from: leg.from,
          to: leg.to,
          status: 'confirmed',
          riderStatus: 'expected',
          mine: true,
          groupId: action.legs.length === 2 ? action.id : undefined,
          search: action.search,
        })
      }
      break
    }
    case 'cancelBooking': {
      const b = s.bookings.find((b) => b.id === action.id)
      check(b && b.mine, 'Rezervácia sa nenašla.')
      const affected = s.bookings.filter(
        (x) => x.mine && (x.id === b.id || (b.groupId && x.groupId === b.groupId)),
      )
      check(
        affected.every(
          (x) =>
            s.trips.find((t) => t.id === x.tripId)?.status === 'scheduled' &&
            x.riderStatus === 'expected',
        ),
        'Začatú alebo dokončenú cestu už nemožno zrušiť.',
      )
      affected.forEach((x) => {
        x.status = 'cancelled'
      })
      const request = s.requests.find((r) => r.id === b.groupId && r.members.length)
      if (request) {
        request.passengers -= request.ownSeats
        request.ownSeats = 0
        request.members = []
        request.memberSeats = {}
        request.personId = undefined
        request.left = true
        if (!request.passengers) request.status = 'cancelled'
      }
      break
    }
    case 'createRequest': {
      const r = action.request
      validateRequestedPlace(s, r.from, r.fromPlace)
      validateRequestedPlace(s, r.to, r.toPlace)
      const a = r.fromPlace ?? stopPlace(s.stops.find((stop) => stop.id === r.from)!),
        b = r.toPlace ?? stopPlace(s.stops.find((stop) => stop.id === r.to)!)
      const distinct = hasCustomPlaces(r) && !!a && !!b && distanceMeters(a, b) > 5
      validateRoute(s, r.from, r.to, r.date, r.time, distinct)
      check(
        Number.isInteger(r.passengers) && r.passengers >= 1 && r.passengers <= 8,
        'Jedna požiadavka môže mať 1 až 8 cestujúcich.',
      )
      check(
        s.people.some((p) => p.id === r.personId),
        'Vyberte cestujúceho.',
      )
      if (r.returnDate || r.returnTime) {
        check(r.returnDate && r.returnTime, 'Doplňte dátum a čas návratu.')
        validateRoute(s, r.to, r.from, r.returnDate, r.returnTime, distinct)
        const outboundArrival = minute(r.time) + (r.timeMode === 'arrival' ? 0 : 24)
        const returnDeparture = minute(r.returnTime) - (r.returnTimeMode === 'arrival' ? 24 : 0)
        check(
          returnDeparture >= 0 && outboundArrival < 24 * 60,
          'Zvolený čas presahuje denný časový úsek jazdy.',
        )
        check(
          `${r.returnDate}T${clock(returnDeparture)}` > `${r.date}T${clock(outboundArrival)}`,
          'Návrat musí byť neskôr ako príchod do cieľa.',
        )
      }
      s.requests.unshift({
        ...r,
        status: 'pending',
        createdByMe: true,
        placesStatus: hasCustomPlaces(r) ? 'pending' : undefined,
        ownSeats: r.passengers,
        members: [r.personId!],
        memberSeats: { [r.personId!]: r.passengers },
      })
      break
    }
    case 'joinRequest': {
      const r = s.requests.find((r) => r.id === action.id)
      check(r && r.status === 'pending', 'K tejto požiadavke sa už nedá pridať.')
      check(
        !r.members.includes(action.personId),
        'K tejto požiadavke ste sa už pridali pre vybraného cestujúceho.',
      )
      const seats = action.seats ?? 1
      check(Number.isInteger(seats) && seats >= 1 && seats <= 8, 'Vyberte 1 až 8 cestujúcich.')
      check(r.passengers + seats <= 8, 'Počet cestujúcich by prekročil kapacitu 8 miest.')
      check(
        s.people.some((p) => p.id === action.personId),
        'Vyberte cestujúceho.',
      )
      r.memberSeats = { ...requestParticipants(r), [action.personId]: seats }
      r.members.push(action.personId)
      r.left = false
      r.passengers += seats
      r.ownSeats += seats
      r.personId ??= action.personId
      break
    }
    case 'cancelRequest': {
      const r = s.requests.find((r) => r.id === action.id)
      check(r && r.members.length, 'Požiadavka sa nenašla.')
      const own = s.bookings.filter((b) => b.mine && b.groupId === r.id && b.status === 'confirmed')
      check(
        own.every((b) => s.trips.find((t) => t.id === b.tripId)?.status === 'scheduled'),
        'Počas jazdy nemožno požiadavku zrušiť.',
      )
      own.forEach((b) => {
        b.status = 'cancelled'
      })
      r.passengers -= r.ownSeats
      r.ownSeats = 0
      r.members = []
      r.memberSeats = {}
      r.personId = undefined
      r.left = true
      if (r.passengers === 0) r.status = 'cancelled'
      break
    }
    case 'decideRequest': {
      const r = s.requests.find((r) => r.id === action.id)
      check(r && r.status === 'pending', 'Táto požiadavka už bola spracovaná.')
      if (!action.approve) {
        check(
          action.reason && action.reason.trim().length >= 5,
          'Uveďte dôvod zamietnutia (aspoň 5 znakov).',
        )
        r.status = 'rejected'
        r.reason = action.reason.trim()
        break
      }
      check(
        !hasCustomPlaces(r) || action.approvePlaces === true,
        'Najskôr schváľte navrhované miesta nástupu a výstupu.',
      )
      const compatible = s.requests.filter(
        (x) =>
          x.status === 'pending' &&
          x.from === r.from &&
          x.to === r.to &&
          samePlace(
            x.fromPlace?.type === 'custom' ? x.fromPlace : undefined,
            r.fromPlace?.type === 'custom' ? r.fromPlace : undefined,
          ) &&
          samePlace(
            x.toPlace?.type === 'custom' ? x.toPlace : undefined,
            r.toPlace?.type === 'custom' ? r.toPlace : undefined,
          ) &&
          x.date === r.date &&
          x.time === r.time &&
          x.timeMode === r.timeMode &&
          x.returnDate === r.returnDate &&
          x.returnTime === r.returnTime &&
          (x.returnTimeMode ?? 'departure') === (r.returnTimeMode ?? 'departure'),
      )
      const total = compatible.reduce((n, x) => n + x.passengers, 0)
      check(
        total <= 8,
        'Súvisiace požiadavky prekračujú kapacitu 8 miest. Nie je možné ich potvrdiť spolu.',
      )
      const outbound = planFlex(
        s,
        { ...r, passengers: total },
        `flex-${r.id}`,
        r.from,
        r.to,
        r.date,
        r.time,
      )
      outbound.requestIds = compatible.map((x) => x.id)
      s.trips.push(outbound)
      let inbound: Trip | undefined
      if (r.returnDate && r.returnTime) {
        inbound = planFlex(
          s,
          { ...r, passengers: total, timeMode: r.returnTimeMode ?? 'departure' },
          `flex-${r.id}-return`,
          r.to,
          r.from,
          r.returnDate,
          r.returnTime,
          { from: r.toPlace, to: r.fromPlace },
        )
        inbound.requestIds = outbound.requestIds
        check(
          `${inbound.date}T${inbound.stops[0].time}` >
            `${outbound.date}T${outbound.stops.at(-1)!.time}`,
          'Návrat musí nasledovať po príchode do cieľa. Oba smery zostali nepotvrdené.',
        )
        s.trips.push(inbound)
      }
      compatible.forEach((req) => {
        req.status = 'approved'
        if (hasCustomPlaces(req)) req.placesStatus = 'approved'
        req.tripId = outbound.id
        req.returnTripId = inbound?.id
        for (const [index, t] of [outbound, ...(inbound ? [inbound] : [])].entries()) {
          const own = req.ownSeats
          for (const personId of req.members) {
            const person = s.people.find((p) => p.id === personId)
            if (person && isChild(person))
              check(
                !personError(person),
                personError(person) ?? 'Doplňte kontakt na zodpovedného dospelého.',
              )
          }
          for (const [personId, seats] of Object.entries(requestParticipants(req))) {
            s.bookings.push({
              id: `approved-${req.id}-${index}-own-${personId}`,
              tripId: t.id,
              personId,
              name: s.people.find((p) => p.id === personId)?.name ?? 'Cestujúci',
              seats,
              from: t.stops[0].stopId,
              to: t.stops[1].stopId,
              status: 'confirmed',
              riderStatus: 'expected',
              mine: true,
              groupId: req.id,
            })
          }
          if (req.passengers - own > 0)
            s.bookings.push({
              id: `approved-${req.id}-${index}-others`,
              tripId: t.id,
              name: 'Skupina cestujúcich',
              seats: req.passengers - own,
              from: t.stops[0].stopId,
              to: t.stops[1].stopId,
              status: 'confirmed',
              riderStatus: 'expected',
              mine: false,
              groupId: req.id,
            })
        }
      })
      break
    }
    case 'selectDriver': {
      check(
        s.drivers.some((d) => d.id === action.id),
        'Vodič sa nenašiel.',
      )
      s.activeDriverId = action.id
      break
    }
    case 'assignTrip': {
      const trip = s.trips.find((t) => t.id === action.id),
        driver = s.drivers.find((d) => d.id === action.driverId),
        vehicle = s.vehicles.find((v) => v.id === action.vehicleId)
      check(trip?.status === 'scheduled', 'Priradenie je možné meniť iba pred začatím jazdy.')
      check(
        driver && vehicle && canDrive(driver, vehicle),
        'Vodič nemá potrebnú skupinu vodičského oprávnenia pre toto vozidlo.',
      )
      const oldCapacity = s.vehicles.find((v) => v.id === trip.vehicleId)?.capacity ?? 0
      check(
        vehicle.capacity >= oldCapacity - freeSeats(s, trip),
        'Vozidlo nemá dostatočnú kapacitu pre existujúce rezervácie.',
      )
      check(
        !s.trips.some(
          (t) =>
            t.id !== trip.id &&
            t.date === trip.date &&
            t.status !== 'completed' &&
            (t.vehicleId === vehicle.id || t.driverId === driver.id) &&
            minute(trip.stops[0].time) < minute(t.stops.at(-1)!.time) &&
            minute(trip.stops.at(-1)!.time) > minute(t.stops[0].time),
        ),
        'Vodič alebo vozidlo už má pridelenú jazdu v tomto čase.',
      )
      trip.driverId = driver.id
      trip.vehicleId = vehicle.id
      break
    }
    case 'tripStatus': {
      const t = s.trips.find((t) => t.id === action.id)
      check(t, 'Jazda sa nenašla.')
      if (action.status === 'active') {
        check(t.status === 'scheduled', 'Jazda už bola začatá.')
        const vehicle = s.vehicles.find((v) => v.id === t.vehicleId),
          driver = s.drivers.find((d) => d.id === t.driverId)
        check(
          vehicle && driver && canDrive(driver, vehicle),
          'Vodič nemá potrebnú skupinu vodičského oprávnenia pre toto vozidlo alebo nie je priradený.',
        )
        check(
          !s.trips.some((x) => x.id !== t.id && x.driverId === driver.id && x.status === 'active'),
          'Vodič už má prebiehajúcu jazdu. Najskôr ju ukončite.',
        )
        check(
          !s.trips.some((x) => x.vehicleId === t.vehicleId && x.status === 'active'),
          'Vozidlo už má prebiehajúcu jazdu. Najskôr ju ukončite.',
        )
      } else {
        check(t.status === 'active', 'Najskôr začnite jazdu.')
        if (t.navigation)
          check(
            t.navigation.processedStops.length === t.stops.length &&
              t.navigation.processedStops.every((stop, i) => stop === i),
            'Najskôr spracujte všetky zastávky v poradí.',
          )
        check(
          !s.bookings.some(
            (b) =>
              b.tripId === t.id &&
              b.status === 'confirmed' &&
              (b.riderStatus === 'boarded' || b.riderStatus === 'expected'),
          ),
          'Najskôr označte výstup alebo neprítomnosť všetkých cestujúcich.',
        )
      }
      t.status = action.status
      break
    }
    case 'rider': {
      const b = s.bookings.find((b) => b.id === action.id)
      check(b && b.status === 'confirmed', 'Rezervácia nie je aktívna.')
      const t = s.trips.find((t) => t.id === b.tripId)
      check(t?.status === 'active', 'Najskôr začnite jazdu.')
      if (t.navigation) {
        check(t.driverId === s.activeDriverId, 'Jazda nie je pridelená tomuto vodičovi.')
        check(t.navigation.phase === 'stopped', 'Úkony vykonávajte až po zastavení vozidla.')
        check(
          t.stops[t.navigation.stopIndex]?.stopId ===
            (action.status === 'alighted' ? b.to : b.from),
          'Tento cestujúci sa nespracúva na aktuálnej zastávke.',
        )
      }
      check(
        (b.riderStatus === 'expected' &&
          (action.status === 'boarded' || action.status === 'absent')) ||
          (b.riderStatus === 'boarded' && action.status === 'alighted'),
        'Tento krok nie je dostupný. Výstup je možný až po nástupe.',
      )
      if (action.status === 'boarded') {
        const occupied = s.bookings
          .filter(
            (x) => x.tripId === t.id && x.status === 'confirmed' && x.riderStatus === 'boarded',
          )
          .reduce((n, x) => n + x.seats, 0)
        check(
          occupied + b.seats <= s.vehicles.find((v) => v.id === t.vehicleId)!.capacity,
          'Najskôr označte výstup cestujúcich. Kapacita vozidla je naplnená.',
        )
      }
      b.riderStatus = action.status
      if (action.status === 'absent') {
        b.noShow = {
          status: 'reported',
          driverId: t.driverId ?? '',
          history: [{ action: 'reported', reason: 'Neúčasť zaznamenal priradený vodič.' }],
        }
        if (b.mine)
          (s.notifications ??= []).unshift({
            id: `${b.id}:no-show`,
            bookingId: b.id,
            text: `Pri rezervácii ${b.name} bola zaznamenaná neúčasť. Ak ide o omyl, kontaktujte dispečera. Záznam ešte nebol overený.`,
          })
      }
      break
    }
    case 'savePerson': {
      const input = action.person
      const old = s.people.find((p) => p.id === input.id)
      const person = {
        ...input,
        passengerCode:
          input.passengerCode ?? old?.passengerCode ?? generatePassengerCode(usedPassengerCodes(s)),
      }
      const codeError = passengerCodeError(s, person)
      check(!codeError, codeError ?? 'Skontrolujte číslo cestujúceho.')
      const error = personError(person)
      check(!error, error ?? 'Skontrolujte profil cestujúceho.')
      const index = s.people.findIndex((p) => p.id === person.id)
      if (index >= 0)
        s.people[index] = {
          ...s.people[index],
          ...input,
          isAccountOwner: s.people[index].isAccountOwner === true,
          contact: person.contact.trim(),
        }
      else
        s.people.push({
          ...input,
          isAccountOwner: false,
          contact: person.contact.trim(),
        })
      s.bookings
        .filter((b) => b.personId === person.id)
        .forEach((b) => {
          b.name = person.name
        })
      break
    }
    case 'addRule': {
      const r = action.rule
      validateRoute(s, r.from, r.to, r.start, r.time)
      check(r.days.length > 0, 'Vyberte aspoň jeden deň.')
      check(r.end >= r.start, 'Koniec platnosti musí nasledovať po začiatku.')
      check(
        s.people.some((p) => p.id === r.personId),
        'Vyberte cestujúceho.',
      )
      const error = scheduleError(s, scheduleOf(r))
      check(!error, error ?? 'Skontrolujte rozvrh.')
      check(!s.rules.some((x) => x.id === r.id), 'Rozvrh už existuje.')
      s.rules.unshift(r)
      break
    }
    case 'ruleStatus': {
      changeRuleStatus(s, action.id, action.status)
      break
    }
    case 'addProposal': {
      check(
        action.proposal.name.trim().length >= 3 && action.proposal.village.trim().length >= 3,
        'Vyplňte názov zastávky a obec.',
      )
      s.proposals.unshift(action.proposal)
      break
    }
    case 'decideProposal': {
      const p = s.proposals.find((p) => p.id === action.id)
      check(p && p.status === 'pending', 'Návrh už bol spracovaný.')
      if (!action.approve) check(action.reason?.trim(), 'Uveďte dôvod zamietnutia.')
      p.status = action.approve ? 'approved' : 'rejected'
      p.rejectionReason = action.reason
      if (action.approve) s.stops.push({ id: p.id, name: p.name, village: p.village })
      break
    }
  }
  return s
}
export const activeBookings = (s: AppState, tripId: string): Booking[] =>
  s.bookings.filter((b) => b.tripId === tripId && b.status === 'confirmed')

// Staršie uložené demo údaje mali iba jedného hlavného cestujúceho.
export function requestParticipants(request: RideRequest): Record<string, number> {
  if (request.memberSeats) return request.memberSeats
  return request.members.length && request.personId ? { [request.personId]: request.ownSeats } : {}
}

/** Demo uses the categories explicitly recorded for the registered vehicle; no legal-category inference. */
export function canDrive(driver: Driver, vehicle: Vehicle): boolean {
  return (
    !!vehicle.requiredLicenseCategory &&
    driver.licenseCategories.includes(vehicle.requiredLicenseCategory)
  )
}

export const tripPlaceName = (state: AppState, trip: Trip, id: string) =>
  tripPointName(trip, id, stopName(state, id))
function validateRequestedPlace(state: AppState, id: string, place?: JourneyPlace) {
  if (!place) return
  check(
    validPlace(place) && inRegion(place.latitude, place.longitude),
    'Vyberte platný bod v obsluhovanom regióne Zamagurie.',
  )
  if (place.type === 'stop') {
    const stop = state.stops.find((s) => s.id === id),
      known = stop && stopPlace(stop)
    check(
      place.stopId === id && known && distanceMeters(place, known) < 2,
      'Vybraná poloha nezodpovedá existujúcej zastávke.',
    )
  }
}
