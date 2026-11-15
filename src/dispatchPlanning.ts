import { clock, minute } from './data'
import { distanceMeters, samePlace, stopPlace, tripPointId } from './places'
import { isTime24 } from './time'
import type { AppState, Driver, RideRequest, Trip, Vehicle } from './types'

export const DEMO_FLEX_MINUTES = 24
export const DEMO_TURNAROUND_MINUTES = 10
const DEMO_TRANSFER_KMH = 35

export function canDrive(driver: Driver, vehicle: Vehicle): boolean {
  return (
    !!vehicle.requiredLicenseCategory &&
    driver.licenseCategories.includes(vehicle.requiredLicenseCategory)
  )
}

export function peakReservedSeats(
  state: AppState,
  trip: Trip,
  start = 0,
  end = trip.stops.length - 1,
) {
  const bookings = state.bookings
    .filter((b) => b.tripId === trip.id && b.status === 'confirmed' && b.riderStatus !== 'absent')
    .map((b) => ({
      from: trip.stops.findIndex((s) => s.stopId === b.from),
      to: trip.stops.findIndex((s) => s.stopId === b.to),
      seats: b.seats,
    }))
  let peak = 0
  for (let i = start; i < end; i++) {
    const seats = bookings
      .filter((b) => b.from >= 0 && b.from <= i && i < b.to)
      .reduce((sum, b) => sum + b.seats, 0)
    peak = Math.max(peak, seats)
  }
  return peak
}

function transferMinutes(state: AppState, from: Trip['stops'][number], to: Trip['stops'][number]) {
  if (from.stopId === to.stopId) return 0
  const a = from.place ?? stopPlace(state.stops.find((s) => s.id === from.stopId))
  const b = to.place ?? stopPlace(state.stops.find((s) => s.id === to.stopId))
  return a && b ? Math.ceil((distanceMeters(a, b) / 1000 / DEMO_TRANSFER_KMH) * 60) : null
}

export function assignmentConflict(state: AppState, trip: Trip, planned: Trip[] = []) {
  const day = [...state.trips, ...planned].filter((t) => t.id !== trip.id && t.date === trip.date)
  const schedules = [
    day.filter((t) => t.vehicleId === trip.vehicleId),
    day.filter((t) => trip.driverId && t.driverId === trip.driverId),
  ]
  const start = trip.stops[0].time,
    end = trip.stops.at(-1)!.time
  const conflicts = (before: Trip, after: Trip) => {
    const last = before.stops.at(-1)!,
      first = after.stops[0]
    const gap = minute(first.time) - minute(last.time)
    const transfer = transferMinutes(state, last, first)
    const turnaround = before.kind === 'flex' || after.kind === 'flex' ? DEMO_TURNAROUND_MINUTES : 0
    return transfer === null || gap < transfer + turnaround
  }
  for (const schedule of schedules) {
    const overlap = schedule.find((t) => t.stops[0].time < end && t.stops.at(-1)!.time > start)
    if (overlap) return overlap
    const previous = schedule
      .filter((t) => t.stops.at(-1)!.time <= start)
      .sort((a, b) => b.stops.at(-1)!.time.localeCompare(a.stops.at(-1)!.time))[0]
    if (previous && conflicts(previous, trip)) return previous
    const next = schedule
      .filter((t) => t.stops[0].time >= end)
      .sort((a, b) => a.stops[0].time.localeCompare(b.stops[0].time))[0]
    if (next && conflicts(trip, next)) return next
  }
}

function relatedRequests(state: AppState, request: RideRequest) {
  const custom = (place: RideRequest['fromPlace']) => (place?.type === 'custom' ? place : undefined)
  return state.requests
    .filter(
      (r) =>
        r.id !== request.id &&
        r.status === 'pending' &&
        r.passengers > 0 &&
        r.from === request.from &&
        r.to === request.to &&
        samePlace(custom(r.fromPlace), custom(request.fromPlace)) &&
        samePlace(custom(r.toPlace), custom(request.toPlace)) &&
        r.date === request.date &&
        r.time === request.time &&
        r.timeMode === request.timeMode &&
        r.returnDate === request.returnDate &&
        r.returnTime === request.returnTime &&
        (r.returnTimeMode ?? 'departure') === (request.returnTimeMode ?? 'departure'),
    )
    .sort((a, b) => b.passengers - a.passengers || a.id.localeCompare(b.id))
}

function flexTrip(state: AppState, request: RideRequest, returning: boolean): Trip | undefined {
  const date = returning ? request.returnDate : request.date
  const time = returning ? request.returnTime : request.time
  const mode = returning ? request.returnTimeMode : request.timeMode
  if (!date || !time || !isTime24(time) || date < state.serviceDate) return undefined
  const departure = minute(time) - (mode === 'arrival' ? DEMO_FLEX_MINUTES : 0)
  const arrival = departure + DEMO_FLEX_MINUTES
  if (departure < 0 || arrival >= 24 * 60 || !Number.isFinite(departure)) return undefined

  const from = returning ? request.toPlace : request.fromPlace
  const to = returning ? request.fromPlace : request.toPlace
  const number = state.trips.filter((t) => t.kind === 'flex').length + (returning ? 2 : 1)
  return {
    id: `flex-${request.id}${returning ? '-return' : ''}`,
    line: `F${String(number).padStart(2, '0')}`,
    kind: 'flex',
    date,
    vehicleId: '',
    driverId: null,
    stops: [
      {
        stopId: tripPointId(returning ? request.to : request.from, from),
        time: clock(departure),
        place: from,
      },
      {
        stopId: tripPointId(returning ? request.from : request.to, to),
        time: clock(arrival),
        place: to,
      },
    ],
    status: 'scheduled',
    requestIds: [],
  }
}

function assignments(state: AppState, trip: Trip, seats: number, planned: Trip[] = []) {
  return state.vehicles.flatMap((vehicle) => {
    if (vehicle.capacity < seats) return []
    return state.drivers.flatMap((driver) => {
      const assigned = { ...trip, vehicleId: vehicle.id, driverId: driver.id }
      return canDrive(driver, vehicle) && !assignmentConflict(state, assigned, planned)
        ? [assigned]
        : []
    })
  })
}

export type FlexPlan =
  | { ok: true; trips: Trip[]; requestIds: string[]; seats: number; waiting: number }
  | {
      ok: false
      code: 'TIME_WINDOW' | 'NO_CAPACITY' | 'DRIVER_UNAVAILABLE' | 'SCHEDULE_CONFLICT'
      reason: string
    }

export function previewFlexRequest(state: AppState, request: RideRequest): FlexPlan {
  const outbound = flexTrip(state, request, false)
  const roundTrip = !!(request.returnDate || request.returnTime)
  const inbound = roundTrip ? flexTrip(state, request, true) : undefined
  if (
    !outbound ||
    (roundTrip && !inbound) ||
    (inbound &&
      `${inbound.date}T${inbound.stops[0].time}` <=
        `${outbound.date}T${outbound.stops.at(-1)!.time}`)
  ) {
    return {
      ok: false,
      code: 'TIME_WINDOW',
      reason: 'Zvolené časy musia byť v rámci dňa a návrat musí nasledovať po príchode do cieľa.',
    }
  }

  const vehicles = state.vehicles.filter((v) => v.capacity >= request.passengers)
  if (!vehicles.length)
    return {
      ok: false,
      code: 'NO_CAPACITY',
      reason: 'Žiadne vozidlo nemá dostatočnú kapacitu pre túto požiadavku.',
    }
  if (!vehicles.some((v) => state.drivers.some((d) => canDrive(d, v)))) {
    return {
      ok: false,
      code: 'DRIVER_UNAVAILABLE',
      reason: 'Vozidlo nie je dostupné s vodičom s potrebným oprávnením.',
    }
  }
  const pairs = assignments(state, outbound, request.passengers).flatMap((trip) =>
    inbound
      ? assignments(state, inbound, request.passengers, [trip]).map((back) => [trip, back])
      : [[trip]],
  )
  if (!pairs.length)
    return {
      ok: false,
      code: 'SCHEDULE_CONFLICT',
      reason:
        'Vozidlo nie je dostupné. Jazda, presun alebo čas na prípravu koliduje s plánom vozidla či vodiča. Skúste iný čas.',
    }

  const related = relatedRequests(state, request)
  const plans = pairs.map((trips) => {
    const capacity = Math.min(
      ...trips.map((t) => state.vehicles.find((v) => v.id === t.vehicleId)!.capacity),
    )
    let seats = request.passengers
    const requestIds = [request.id],
      members = new Set(request.members)
    for (const candidate of related) {
      if (
        seats + candidate.passengers > capacity ||
        candidate.members.some((id) => members.has(id))
      )
        continue
      seats += candidate.passengers
      requestIds.push(candidate.id)
      candidate.members.forEach((id) => members.add(id))
    }
    return {
      trips: trips.map((t) => ({ ...t, requestIds })),
      requestIds,
      seats,
      waiting: related.length + 1 - requestIds.length,
    }
  })
  return { ok: true, ...plans.sort((a, b) => b.seats - a.seats)[0] }
}
