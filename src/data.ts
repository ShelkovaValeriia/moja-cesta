import { ensurePassengerIdentity } from './passengerCodes'
import type { AppState, Trip, WeeklyDayPlan } from './types'
import { DEMO_STOP_COORDINATES } from './places'
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bratislava',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const dateLabel = (date: string, _long = false) => {
  void _long // Retain the legacy call signature; all visible dates are now numeric.
  return new Date(`${date}T12:00:00`).toLocaleDateString('sk-SK', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
}
export const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
export const clock = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
export const uid = () => crypto.randomUUID()
export function createInitialState(): AppState {
  const date = today()
  const stops = [
    { id: 'mat', name: 'Matiašovce, centrum', village: 'Matiašovce' },
    { id: 'ssv', name: 'Spišská Stará Ves, námestie', village: 'Spišská Stará Ves' },
    { id: 'school', name: 'Spišská Stará Ves, škola', village: 'Spišská Stará Ves' },
    { id: 'hal', name: 'Haligovce, obecný úrad', village: 'Haligovce' },
    { id: 'cer', name: 'Červený Kláštor, centrum', village: 'Červený Kláštor' },
    { id: 'lech', name: 'Lechnica, kostol', village: 'Lechnica' },
  ]
  const templates = [
    {
      line: '101',
      stops: ['lech', 'cer', 'hal', 'mat', 'ssv', 'school'],
      start: '06:40',
      vehicleId: 'v1',
    },
    { line: '102', stops: ['mat', 'ssv', 'school'], start: '07:15', vehicleId: 'v2' },
    {
      line: '101',
      stops: ['school', 'ssv', 'mat', 'hal', 'cer', 'lech'],
      start: '12:10',
      vehicleId: 'v1',
    },
    { line: '102', stops: ['school', 'ssv', 'mat'], start: '14:30', vehicleId: 'v2' },
    { line: '101', stops: ['mat', 'ssv', 'school'], start: '16:10', vehicleId: 'v1' },
    {
      line: '101',
      stops: ['school', 'ssv', 'mat', 'hal', 'cer', 'lech'],
      start: '17:05',
      vehicleId: 'v1',
    },
  ]
  const trips: Trip[] = Array.from({ length: 8 }, (_, day) =>
    templates.map((t, i) => ({
      id: `t-${day}-${i}`,
      line: t.line,
      kind: 'fixed' as const,
      date: addDays(date, day),
      vehicleId: t.vehicleId,
      driverId: t.vehicleId === 'v2' || t.start === '16:10' ? 'd1' : 'd2',
      stops: t.stops.map((stopId, j) => ({ stopId, time: clock(minute(t.start) + j * 7) })),
      status: 'scheduled' as const,
      requestIds: [],
    })),
  ).flat()
  trips.push(
    {
      id: 'flex-seed',
      line: 'F01',
      kind: 'flex',
      date,
      vehicleId: 'v2',
      driverId: 'd1',
      stops: [
        { stopId: 'cer', time: '10:00' },
        { stopId: 'ssv', time: '10:24' },
      ],
      status: 'scheduled',
      requestIds: ['r3'],
    },
    {
      id: 'flex-seed-2',
      line: 'F02',
      kind: 'flex',
      date,
      vehicleId: 'v1',
      driverId: 'd2',
      stops: [
        { stopId: 'hal', time: '15:00' },
        { stopId: 'ssv', time: '15:24' },
      ],
      status: 'scheduled',
      requestIds: ['r8'],
    },
  )
  trips.push({
    id: 'history-trip',
    line: '102',
    kind: 'fixed',
    date: addDays(date, -1),
    vehicleId: 'v2',
    driverId: 'd1',
    stops: [
      { stopId: 'mat', time: '07:15' },
      { stopId: 'ssv', time: '07:22' },
      { stopId: 'school', time: '07:29' },
    ],
    status: 'completed',
    requestIds: [],
  })
  const crowdedDay = Array.from({ length: 7 }, (_, i) => i + 1).find(
    (i) => new Date(`${addDays(date, i)}T12:00:00Z`).getUTCDay() === 2,
  )!
  return ensurePassengerIdentity({
    version: 5,
    phoneRequests: [],
    phonePeople: [],
    activeDriverId: 'd1',
    drivers: [
      { id: 'd1', name: 'Martin Kováč', licenseCategories: ['B'] },
      { id: 'd2', name: 'Lucia Horváthová', licenseCategories: ['B'] },
    ],
    serviceDate: date,
    stops: stops.map((s) => ({
      ...s,
      latitude: DEMO_STOP_COORDINATES[s.id]?.[0],
      longitude: DEMO_STOP_COORDINATES[s.id]?.[1],
    })),
    trips,
    vehicles: [
      {
        id: 'v1',
        name: 'Volkswagen Transporter',
        plate: 'KK 482 MC',
        capacity: 8,
        requiredLicenseCategory: 'B',
      },
      {
        id: 'v2',
        name: 'Ford Tourneo',
        plate: 'KK 316 MC',
        capacity: 8,
        requiredLicenseCategory: 'B',
      },
    ],
    people: [
      {
        id: 'me',
        passengerCode: '123456',
        name: 'Zuzana Nováková',
        isAccountOwner: true,
        relation: 'Ja',
        age: 'Dospelý',
        contact: '',
        mobility: 'Bez obmedzení',
        walk: 500,
        favoriteStops: ['mat', 'ssv'],
      },
      {
        id: 'daughter',
        passengerCode: '234567',
        name: 'Ema Nováková',
        isAccountOwner: false,
        relation: 'Dcéra',
        age: 'Dieťa (6–15 rokov)',
        contact: 'rodic.ema@example.test',
        mobility: 'Bez obmedzení',
        walk: 300,
        favoriteStops: ['mat', 'school'],
      },
      {
        id: 'mother',
        passengerCode: '345678',
        name: 'Mária Kováčová',
        isAccountOwner: false,
        relation: 'Mama',
        age: 'Senior (65+)',
        contact: '',
        mobility: 'Pomoc pri nastupovaní',
        walk: 100,
        favoriteStops: ['mat', 'ssv'],
      },
    ],
    bookings: [
      {
        id: 'b1',
        tripId: 't-0-4',
        personId: 'me',
        name: 'Zuzana Nováková',
        seats: 1,
        from: 'mat',
        to: 'ssv',
        status: 'confirmed',
        riderStatus: 'expected',
        mine: true,
      },
      {
        id: 'b2',
        tripId: 't-0-1',
        name: 'Peter K.',
        seats: 2,
        from: 'mat',
        to: 'school',
        status: 'confirmed',
        riderStatus: 'expected',
        mine: false,
      },
      {
        id: 'b3',
        tripId: 't-0-1',
        name: 'Anna M.',
        seats: 1,
        from: 'mat',
        to: 'ssv',
        status: 'confirmed',
        riderStatus: 'expected',
        mine: false,
      },
      {
        id: 'b4',
        tripId: 't-0-4',
        name: 'Ján H.',
        seats: 2,
        from: 'mat',
        to: 'school',
        status: 'confirmed',
        riderStatus: 'expected',
        mine: false,
      },
      {
        id: 'b5',
        tripId: 'flex-seed',
        name: 'Skupina cestujúcich',
        seats: 4,
        from: 'cer',
        to: 'ssv',
        status: 'confirmed',
        riderStatus: 'expected',
        mine: false,
      },
      {
        id: 'b6',
        tripId: 'flex-seed-2',
        name: 'Skupina cestujúcich',
        seats: 3,
        from: 'hal',
        to: 'ssv',
        status: 'confirmed',
        riderStatus: 'expected',
        mine: false,
      },
      {
        id: 'b-history',
        tripId: 'history-trip',
        personId: 'me',
        name: 'Zuzana Nováková',
        seats: 1,
        from: 'mat',
        to: 'ssv',
        status: 'confirmed',
        riderStatus: 'alighted',
        mine: true,
      },
      {
        id: 'b-regular-full-demo',
        tripId: `t-${crowdedDay}-5`,
        name: 'Demo skupina — plný návrat',
        seats: 8,
        from: 'school',
        to: 'mat',
        status: 'confirmed',
        riderStatus: 'expected',
        mine: false,
      },
    ],
    requests: Array.from({ length: 12 }, (_, i) => ({
      id: `r${i + 1}`,
      from: ['mat', 'lech', 'cer', 'hal'][i % 4],
      to: i % 3 === 0 ? 'school' : 'ssv',
      date: addDays(date, i > 7 ? 1 : 0),
      time: [
        '09:30',
        '11:00',
        '10:00',
        '13:20',
        '15:30',
        '08:30',
        '11:40',
        '15:00',
        '10:30',
        '14:00',
        '09:00',
        '13:00',
      ][i],
      timeMode: 'departure' as const,
      passengers: [3, 2, 4, 1, 5, 2, 3, 3, 2, 4, 1, 2][i],
      status:
        i === 2 || i === 7
          ? ('approved' as const)
          : i === 5
            ? ('rejected' as const)
            : ('pending' as const),
      members: i === 0 || i === 5 ? ['me'] : [],
      personId: i === 0 || i === 5 ? 'me' : undefined,
      ownSeats: i === 0 || i === 5 ? 1 : 0,
      accessibility: '',
      reason: i === 5 ? 'V tomto čase nie je dostupné vozidlo. Skúste spoj o 07:15.' : undefined,
      tripId: i === 2 ? 'flex-seed' : i === 7 ? 'flex-seed-2' : undefined,
    })),
    rules: [
      {
        id: 'rule1',
        from: 'mat',
        to: 'school',
        time: '07:45',
        days: [1, 2, 3, 4, 5],
        start: date,
        end: addDays(date, 30),
        personId: 'daughter',
        status: 'active',
        purpose: 'school',
        dayPlans: [1, 2, 3, 4, 5].map((weekday): WeeklyDayPlan => ({
          weekday,
          outbound: {
            from: 'mat',
            to: 'school',
            time: '07:45',
            timeMode: 'arrival',
            timePreference: 'none',
          },
          returning:
            weekday === 3
              ? undefined
              : {
                  from: 'school',
                  to: 'mat',
                  time: weekday === 2 ? '15:00' : '13:30',
                  timeMode: 'departure',
                  timePreference: 'none',
                },
        })),
        exceptions: [],
      },
      {
        id: 'rule-work',
        personId: 'me',
        from: 'mat',
        to: 'ssv',
        time: '07:30',
        days: [1, 3, 5],
        start: date,
        end: addDays(date, 30),
        status: 'active',
        purpose: 'work',
        dayPlans: [1, 3, 5].map((weekday): WeeklyDayPlan => ({
          weekday,
          outbound: {
            from: 'mat',
            to: 'ssv',
            time: '07:30',
            timeMode: 'arrival',
            timePreference: 'none',
          },
          returning: {
            from: 'ssv',
            to: 'mat',
            time: '17:00',
            timeMode: 'departure',
            timePreference: 'none',
          },
        })),
        exceptions: [],
      },
      {
        id: 'rule-varied',
        personId: 'mother',
        from: 'hal',
        to: 'ssv',
        time: '08:00',
        days: [2, 4],
        start: date,
        end: addDays(date, 30),
        status: 'active',
        purpose: 'other',
        dayPlans: [
          {
            weekday: 2,
            outbound: {
              from: 'hal',
              to: 'ssv',
              time: '08:00',
              timeMode: 'arrival',
              timePreference: 'none',
            },
          },
          {
            weekday: 4,
            outbound: {
              from: 'cer',
              to: 'lech',
              time: '11:00',
              timeMode: 'arrival',
              timePreference: 'none',
            },
          },
        ],
        exceptions: [],
      },
    ],
    proposals: [
      {
        id: 'p1',
        name: 'Matiašovce, horný koniec',
        village: 'Matiašovce',
        reason: 'Bližšie k obyvateľom hornej časti obce.',
        status: 'pending',
      },
    ],
  })
}
