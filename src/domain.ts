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
  Driver,
  Person,
  RecurringRule,
  RideRequest,
  RiderStatus,
  StopProposal,
  Trip,
  SearchQuery,
  JourneyPlace,
  Vehicle,
  PhoneJourneyRequest,
} from './types'
import { LICENSE_CATEGORIES } from './types'
import { clock, minute } from './data'
import {
  assignmentConflict,
  canDrive,
  DEMO_FLEX_MINUTES,
  peakReservedSeats,
  previewFlexRequest,
} from './dispatchPlanning'
import { isTime24 } from './time'
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
  validPlace,
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
export const noShowOutcome = (booking: Booking) =>
  booking.noShow?.status === 'reported'
    ? undefined
    : (booking.noShow?.status ?? booking.noShowReview?.outcome)
export const dispatchPeople = (state: AppState) => [...state.people, ...state.phonePeople]
export function freeSeats(s: AppState, trip: Trip, from?: string, to?: string) {
  const start = from ? trip.stops.findIndex((x) => x.stopId === from) : 0
  const end = to ? trip.stops.findIndex((x) => x.stopId === to) : trip.stops.length - 1
  if (start < 0 || end <= start) return 0
  const capacity = s.vehicles.find((v) => v.id === trip.vehicleId)?.capacity ?? 0
  return Math.max(0, capacity - peakReservedSeats(s, trip, start, end))
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
      channel?: 'phone'
    }
  | {
      type: 'publishFixed'
      id: string
      templateId: string
      date: string
      departure: string
      driverId: string
      vehicleId: string
    }
  | { type: 'assignTrip'; id: string; driverId: string; vehicleId: string }
  | { type: 'addDriver'; driver: Driver }
  | { type: 'addVehicle'; vehicle: Vehicle }
  | { type: 'updateDriver'; driver: Driver }
  | { type: 'updateVehicle'; vehicle: Vehicle }
  | { type: 'removeDriver'; id: string }
  | { type: 'removeVehicle'; id: string }
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
  | {
      type: 'reviewNoShow'
      id: string
      outcome: NonNullable<Booking['noShowReview']>['outcome']
      reason: string
    }
  | { type: 'savePerson'; person: Person }
  | { type: 'registerPhonePerson'; person: Person }
  | { type: 'createPhoneRequest'; request: Omit<PhoneJourneyRequest, 'status' | 'createdAt'> }
  | { type: 'cancelPhoneRequest'; id: string }
  | { type: 'addRule'; rule: RecurringRule }
  | { type: 'ruleStatus'; id: string; status: RecurringRule['status'] }
  | { type: 'addProposal'; proposal: StopProposal }
  | {
      type: 'decideProposal'
      id: string
      approve: boolean
      reason?: string
      assessment?: StopProposal['assessment']
    }
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
function validateAssignment(s: AppState, trip: Trip) {
  const driver = s.drivers.find((d) => d.id === trip.driverId)
  const vehicle = s.vehicles.find((v) => v.id === trip.vehicleId)
  check(
    driver && vehicle && canDrive(driver, vehicle),
    'Vodič nemá potrebnú skupinu vodičského oprávnenia pre toto vozidlo.',
  )
  check(
    vehicle.capacity >= peakReservedSeats(s, trip),
    'Vozidlo nemá dostatočnú kapacitu pre existujúce rezervácie.',
  )
  const conflict = assignmentConflict(s, trip)
  check(
    !conflict,
    conflict
      ? `Vodič alebo vozidlo už má pridelenú jazdu ${conflict.line} o ${conflict.stops[0].time}. Skontrolujte čas jazdy aj presunu.`
      : '',
  )
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
      return applyRegularAction(s, action)
    case 'book': {
      const person = (action.channel === 'phone' ? dispatchPeople(s) : s.people).find(
        (p) => p.id === action.personId,
      )
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
          mine: action.channel !== 'phone',
          groupId: action.legs.length === 2 ? action.id : undefined,
          search: action.search,
          ...(action.channel === 'phone' && {
            channel: action.channel,
            assistance: person.mobility,
          }),
        })
      }
      break
    }
    case 'cancelBooking': {
      const b = s.bookings.find((b) => b.id === action.id)
      check(b && (b.mine || b.channel === 'phone'), 'Rezervácia sa nenašla.')
      const affected = s.bookings.filter(
        (x) =>
          (x.mine || x.channel === 'phone') &&
          (x.id === b.id || (b.groupId && x.groupId === b.groupId)),
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
        (r.channel === 'phone' ? dispatchPeople(s) : s.people).some((p) => p.id === r.personId),
        'Vyberte cestujúceho.',
      )
      if (r.channel === 'phone') {
        const person = dispatchPeople(s).find((p) => p.id === r.personId)!
        check(
          !isChild(person) || !personError(person),
          'Doplňte platný kontakt na zodpovedného dospelého.',
        )
      }
      if (r.returnDate || r.returnTime) {
        check(r.returnDate && r.returnTime, 'Doplňte dátum a čas návratu.')
        validateRoute(s, r.to, r.from, r.returnDate, r.returnTime, distinct)
        const outboundArrival = minute(r.time) + (r.timeMode === 'arrival' ? 0 : DEMO_FLEX_MINUTES)
        const returnDeparture =
          minute(r.returnTime) - (r.returnTimeMode === 'arrival' ? DEMO_FLEX_MINUTES : 0)
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
        createdByMe: r.channel !== 'phone',
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
      const own = s.bookings.filter(
        (b) => (b.mine || b.channel === 'phone') && b.groupId === r.id && b.status === 'confirmed',
      )
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
      const plan = previewFlexRequest(s, r)
      check(plan.ok, plan.ok ? '' : plan.reason)
      const [outbound, inbound] = plan.trips
      s.trips.push(...plan.trips)
      for (const req of s.requests.filter((candidate) => plan.requestIds.includes(candidate.id))) {
        req.status = 'approved'
        if (hasCustomPlaces(req)) req.placesStatus = 'approved'
        req.tripId = outbound.id
        req.returnTripId = inbound?.id
        for (const [index, t] of plan.trips.entries()) {
          const own = req.ownSeats
          for (const personId of req.members) {
            const person = (req.channel === 'phone' ? dispatchPeople(s) : s.people).find(
              (p) => p.id === personId,
            )
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
              name:
                (req.channel === 'phone' ? dispatchPeople(s) : s.people).find(
                  (p) => p.id === personId,
                )?.name ?? 'Cestujúci',
              seats,
              from: t.stops[0].stopId,
              to: t.stops[1].stopId,
              status: 'confirmed',
              riderStatus: 'expected',
              mine: req.channel !== 'phone',
              groupId: req.id,
              ...(req.channel === 'phone' && {
                channel: req.channel,
                assistance: dispatchPeople(s).find((p) => p.id === personId)?.mobility,
              }),
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
      }
      break
    }
    case 'addDriver':
    case 'updateDriver': {
      const { id, licenseCategories } = action.driver
      const name = action.driver.name.trim()
      check(name.length > 0 && name.length <= 80, 'Zadajte meno vodiča (najviac 80 znakov).')
      check(
        licenseCategories.length > 0 &&
          licenseCategories.every((category) => LICENSE_CATEGORIES.includes(category)),
        'Vyberte skupiny vodičského oprávnenia.',
      )
      const index = s.drivers.findIndex((driver) => driver.id === id)
      const driver = { id, name, licenseCategories: [...new Set(licenseCategories)] }
      if (action.type === 'updateDriver') {
        check(index >= 0, 'Vodič sa nenašiel.')
        check(
          s.trips
            .filter(
              (trip) =>
                trip.driverId === id && trip.status !== 'completed' && trip.date >= s.serviceDate,
            )
            .every((trip) => {
              const vehicle = s.vehicles.find((v) => v.id === trip.vehicleId)
              return vehicle && canDrive(driver, vehicle)
            }),
          'Vodič potrebuje tieto oprávnenia pre pridelené jazdy. Najprv ich prideľte inému vodičovi.',
        )
        s.drivers[index] = driver
      } else {
        check(index < 0, 'Vodič už bol pridaný.')
        s.drivers.push(driver)
      }
      break
    }
    case 'addVehicle':
    case 'updateVehicle': {
      const { id, capacity, requiredLicenseCategory } = action.vehicle
      const name = action.vehicle.name.trim()
      const plate = action.vehicle.plate.trim().toUpperCase().replace(/\s+/g, ' ')
      const plateKey = (value: string) => value.toUpperCase().replace(/[\s-]+/g, '')
      check(name.length > 0 && name.length <= 80, 'Zadajte názov vozidla (najviac 80 znakov).')
      check(
        /^[A-Z0-9]+$/.test(plateKey(plate)) && plate.length <= 20,
        'Zadajte platné evidenčné číslo.',
      )
      check(
        !s.vehicles.some(
          (vehicle) =>
            (action.type === 'addVehicle' && vehicle.id === id) ||
            (vehicle.id !== id && plateKey(vehicle.plate) === plateKey(plate)),
        ),
        'Vozidlo s týmto evidenčným číslom už existuje.',
      )
      check(
        requiredLicenseCategory && LICENSE_CATEGORIES.includes(requiredLicenseCategory),
        'Vyberte požadované vodičské oprávnenie.',
      )
      check(
        Number.isSafeInteger(capacity) && capacity > 0,
        'Počet miest musí byť kladné celé číslo.',
      )
      check(
        requiredLicenseCategory !== 'B' || capacity <= 8,
        'Pre skupinu B zadajte najviac 8 miest pre cestujúcich.',
      )
      const vehicle = { id, name, plate, capacity, requiredLicenseCategory }
      if (action.type === 'updateVehicle') {
        const index = s.vehicles.findIndex((v) => v.id === id)
        check(index >= 0, 'Vozidlo sa nenašlo.')
        const assigned = s.trips.filter(
          (trip) =>
            trip.vehicleId === id && trip.status !== 'completed' && trip.date >= s.serviceDate,
        )
        check(
          assigned.every((trip) => peakReservedSeats(s, trip) <= capacity),
          'Nová kapacita nestačí pre existujúce rezervácie. Najprv prideľte dotknutým jazdám iné vozidlo.',
        )
        check(
          assigned.every((trip) => {
            const driver = s.drivers.find((d) => d.id === trip.driverId)
            return driver && canDrive(driver, vehicle)
          }),
          'Pridelený vodič nemá nové požadované oprávnenie. Najprv zmeňte priradenie jazdy.',
        )
        s.vehicles[index] = vehicle
      } else s.vehicles.push(vehicle)
      break
    }
    case 'removeDriver': {
      check(
        s.drivers.some((driver) => driver.id === action.id),
        'Vodič sa nenašiel.',
      )
      check(
        !s.trips.some((trip) => trip.driverId === action.id),
        'Vodič má priradené jazdy. Najprv ich prideľte inému vodičovi.',
      )
      s.drivers = s.drivers.filter((driver) => driver.id !== action.id)
      if (s.activeDriverId === action.id) s.activeDriverId = s.drivers[0]?.id ?? ''
      break
    }
    case 'removeVehicle': {
      check(
        s.vehicles.some((vehicle) => vehicle.id === action.id),
        'Vozidlo sa nenašlo.',
      )
      check(
        !s.trips.some((trip) => trip.vehicleId === action.id),
        'Vozidlo má priradené jazdy. Najprv ich prideľte inému vozidlu.',
      )
      s.vehicles = s.vehicles.filter((vehicle) => vehicle.id !== action.id)
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
      const trip = s.trips.find((t) => t.id === action.id)
      check(
        trip?.status === 'scheduled' && trip.date >= s.serviceDate,
        'Priradenie je možné meniť iba pred začatím jazdy.',
      )
      validateAssignment(s, { ...trip, driverId: action.driverId, vehicleId: action.vehicleId })
      trip.driverId = action.driverId
      trip.vehicleId = action.vehicleId
      break
    }
    case 'publishFixed': {
      const template = s.trips.find((t) => t.id === action.templateId && t.kind === 'fixed')
      check(template, 'Vyberte vzor pravidelného spoja.')
      const day = new Date(`${action.date}T00:00:00Z`)
      check(
        /^\d{4}-\d{2}-\d{2}$/.test(action.date) &&
          Number.isFinite(day.getTime()) &&
          day.toISOString().slice(0, 10) === action.date &&
          action.date > s.serviceDate,
        'Pravidelný spoj zverejnite na budúci dátum.',
      )
      check(isTime24(action.departure), 'Zadajte čas odchodu vo formáte HH:mm.')
      const offset = minute(action.departure) - minute(template.stops[0].time)
      check(
        minute(template.stops.at(-1)!.time) + offset < 24 * 60,
        'Spoj musí prísť v ten istý deň.',
      )
      const stops = template.stops.map((stop) => ({
        ...stop,
        time: clock(minute(stop.time) + offset),
      }))
      check(
        !s.trips.some(
          (t) =>
            t.id === action.id ||
            (t.kind === 'fixed' &&
              t.date === action.date &&
              t.line === template.line &&
              t.stops.length === stops.length &&
              t.stops.every(
                (stop, index) =>
                  stop.stopId === stops[index].stopId && stop.time === stops[index].time,
              )),
        ),
        'Tento spoj už bol zverejnený.',
      )
      const trip: Trip = {
        ...template,
        id: action.id,
        date: action.date,
        stops,
        vehicleId: action.vehicleId,
        driverId: action.driverId,
        status: 'scheduled',
        requestIds: [],
      }
      validateAssignment(s, trip)
      s.trips.push(trip)
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
    case 'reviewNoShow': {
      if ('decision' in action) return applyRegularAction(s, action)
      const b = s.bookings.find((b) => b.id === action.id)
      const trip = s.trips.find((t) => t.id === b?.tripId)
      check(
        b?.status === 'confirmed' && b.riderStatus === 'absent' && !noShowOutcome(b) && trip,
        'Záznam neprítomnosti už nie je možné posúdiť.',
      )
      const reason = action.reason.trim()
      check(
        reason.length >= 5 && reason.length <= 300,
        'Zapíšte odôvodnenie posúdenia (5 až 300 znakov).',
      )
      if (action.outcome === 'corrected') {
        check(trip.status === 'active' || trip.status === 'completed', 'Jazda ešte nezačala.')
        if (trip.status === 'active' && trip.navigation)
          check(
            trip.navigation.phase === 'stopped' &&
              trip.stops[trip.navigation.stopIndex]?.stopId === b.from,
            'Oprava aktívnej jazdy je možná iba na zastávke nástupu. Kontaktujte dispečera.',
          )
        if (trip.status === 'active') {
          check(
            freeSeats(s, trip, b.from, b.to) >= b.seats,
            'Na obnovenie rezervácie nie je dostatok miest.',
          )
        }
        b.riderStatus = trip.status === 'active' ? 'expected' : 'alighted'
      }
      b.noShowReview = { outcome: action.outcome, reason, reviewedAt: new Date().toISOString() }
      b.noShow ??= { status: 'reported', driverId: trip.driverId, history: [] }
      b.noShow.status = action.outcome
      b.noShow.reason = reason
      b.noShow.history.push({ action: action.outcome, reason })
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
    case 'createPhoneRequest': {
      const r = action.request
      const person = dispatchPeople(s).find((p) => p.id === r.personId)
      check(person, 'Vyberte cestujúceho.')
      check(
        !isChild(person) || !personError(person),
        'Doplňte platný kontakt na zodpovedného dospelého.',
      )
      const fromAddress = r.fromAddress.trim(),
        toAddress = r.toAddress.trim()
      check(
        [fromAddress, toAddress].every((address) => address.length >= 3 && address.length <= 200),
        'Vyplňte adresu odchodu aj cieľa (3 až 200 znakov).',
      )
      const addressKey = (address: string) =>
        address.toLocaleLowerCase('sk-SK').replace(/\s+/g, ' ')
      check(
        addressKey(fromAddress) !== addressKey(toAddress),
        'Adresa odchodu a cieľa musí byť odlišná.',
      )
      const validateCriteria = (leg: { date: string; time: string; timeMode: string }) => {
        const parsed = new Date(`${leg.date}T12:00:00Z`)
        check(
          /^\d{4}-\d{2}-\d{2}$/.test(leg.date) &&
            !Number.isNaN(parsed.getTime()) &&
            parsed.toISOString().slice(0, 10) === leg.date &&
            leg.date >= s.serviceDate,
          'Vyberte platný dnešný alebo budúci dátum.',
        )
        check(isTime24(leg.time), 'Zadajte platný čas.')
        check(
          leg.timeMode === 'departure' || leg.timeMode === 'arrival',
          'Vyberte odchod alebo príchod do.',
        )
      }
      validateCriteria(r)
      if (r.returnJourney) {
        validateCriteria(r.returnJourney)
        check(
          `${r.returnJourney.date}T${r.returnJourney.time}` > `${r.date}T${r.time}`,
          'Čas návratu musí byť neskôr ako čas cesty tam.',
        )
      }
      check(Number.isSafeInteger(r.seats) && r.seats > 0, 'Vyberte kladný celý počet cestujúcich.')
      check(r.assistance.trim().length <= 300, 'Pokyny k pomoci môžu mať najviac 300 znakov.')
      check(
        r.id.trim() && !s.phoneRequests.some((item) => item.id === r.id),
        'Požiadavka už bola zapísaná.',
      )
      s.phoneRequests.unshift({
        ...r,
        fromAddress,
        toAddress,
        assistance: r.assistance.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      })
      break
    }
    case 'cancelPhoneRequest': {
      const request = s.phoneRequests.find((r) => r.id === action.id)
      check(request?.status === 'pending', 'Túto požiadavku už nemožno zrušiť.')
      request.status = 'cancelled'
      break
    }
    case 'registerPhonePerson': {
      const person = {
        ...action.person,
        passengerCode: action.person.passengerCode ?? generatePassengerCode(usedPassengerCodes(s)),
      }
      const error = personError(person)
      check(!error, error ?? 'Skontrolujte údaje cestujúceho.')
      check(person.contact.trim().length > 0, 'Zadajte telefónne číslo cestujúceho.')
      check(!isChild(person), 'Registráciu dieťaťa vybavte cez oprávneného zástupcu.')
      check(!dispatchPeople(s).some((p) => p.id === person.id), 'Identifikátor už existuje.')
      const codeError = passengerCodeError(s, person)
      check(!codeError, codeError ?? 'Skontrolujte číslo cestujúceho.')
      s.phonePeople.push({
        ...person,
        contact: person.contact.trim(),
        phoneManaged: true,
        isAccountOwner: false,
      })
      ;(s.externalPassengers ??= []).push({ id: person.id, passengerCode: person.passengerCode })
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
      if (action.approve) {
        const assessment = action.assessment
        check(
          assessment &&
            assessment.walking.trim() &&
            assessment.boarding.trim() &&
            assessment.vehicleSafety.trim(),
          'Doplňte posúdenie pešej trasy, nástupu a bezpečnosti vozidla.',
        )
        p.assessment = {
          walking: assessment.walking.trim(),
          boarding: assessment.boarding.trim(),
          vehicleSafety: assessment.vehicleSafety.trim(),
        }
      }
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

export { canDrive } from './dispatchPlanning'

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
