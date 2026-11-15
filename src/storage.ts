import { ensurePassengerIdentity } from './passengerCodes'
import { normalizeTime } from './time'
import type { SearchQuery, WeeklyDayPlan } from './types'
import { plansOf } from './regular'
import { createInitialState } from './data'
import type { AppState, Driver, Vehicle } from './types'
export const STORAGE_KEY = 'moja-cesta-demo-v1'
/** Upgrade the existing local simulation without dropping bookings, requests or legacy profile fields. */
export function restoreState(value: unknown): AppState | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (
    ![1, 2, 3, 4, 5].includes(Number(raw.version)) ||
    !['trips', 'people', 'requests', 'bookings', 'vehicles', 'stops', 'rules', 'proposals'].every(
      (key) => Array.isArray(raw[key]),
    )
  )
    return null
  const old = raw as unknown as AppState,
    seed = createInitialState()
  const drivers: Driver[] = Array.isArray(old.drivers)
    ? old.drivers.map((d) => ({
        ...d,
        licenseCategories: Array.isArray(d.licenseCategories) ? d.licenseCategories : [],
      }))
    : seed.drivers
  const vehicles: Vehicle[] = old.vehicles.map((v) => ({
    ...v,
    requiredLicenseCategory:
      v.requiredLicenseCategory === undefined
        ? (seed.vehicles.find((x) => x.id === v.id)?.requiredLicenseCategory ?? null)
        : v.requiredLicenseCategory,
  }))
  const declaredOwner = old.people.some((p) => typeof p.isAccountOwner === 'boolean')
  const time = (value: string) => normalizeTime(value) ?? value
  const search = (query: SearchQuery | undefined) =>
    query ? { ...query, time: time(query.time), returnTime: time(query.returnTime) } : undefined
  const plan = (p: WeeklyDayPlan): WeeklyDayPlan => ({
    ...p,
    outbound: { ...p.outbound, time: time(p.outbound.time) },
    returning: p.returning ? { ...p.returning, time: time(p.returning.time) } : undefined,
  })
  return ensurePassengerIdentity({
    ...old,
    stops: old.stops.map((stop) => {
      const known = seed.stops.find((s) => s.id === stop.id)
      return {
        ...stop,
        latitude: stop.latitude ?? known?.latitude,
        longitude: stop.longitude ?? known?.longitude,
      }
    }),
    people: old.people.map((p) => ({
      ...p,
      isAccountOwner: declaredOwner ? p.isAccountOwner === true : p.id === 'me',
    })),
    requests: old.requests.map((r) => ({
      ...r,
      time: time(r.time),
      returnTime: r.returnTime ? time(r.returnTime) : undefined,
    })),
    rules: old.rules.map((r) => ({
      ...r,
      time: time(r.time),
      dayPlans: plansOf(r).map(plan),
      purpose: r.purpose ?? 'other',
      exceptions: (r.exceptions ?? []).map((e) => ({
        ...e,
        plan: e.plan ? plan(e.plan) : undefined,
      })),
    })),
    bookings: old.bookings.map((b) => ({ ...b, search: search(b.search) })),
    version: 5,
    drivers,
    vehicles,
    activeDriverId: drivers.some((d) => d.id === old.activeDriverId)
      ? old.activeDriverId
      : (drivers[0]?.id ?? ''),
    trips: old.trips.map((t) => ({
      ...t,
      stops: t.stops.map((stop) => ({ ...stop, time: time(stop.time) })),
      driverId:
        t.driverId === undefined
          ? (drivers.find(
              (d) => d.id === (t.vehicleId === 'v2' || t.stops[0]?.time === '16:10' ? 'd1' : 'd2'),
            )?.id ?? null)
          : t.driverId,
    })),
  })
}
export function loadState(): AppState {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (text) {
      const state = restoreState(JSON.parse(text))
      if (state) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
        } catch {
          /* Keep migrated data usable if persistence is unavailable. */
        }
        return state
      }
    }
  } catch {
    /* Preserve a usable demo when storage is unavailable or corrupted. */
  }
  const initial = createInitialState()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
  } catch {
    /* Keep the demo usable without persistence. */
  }
  return initial
}
