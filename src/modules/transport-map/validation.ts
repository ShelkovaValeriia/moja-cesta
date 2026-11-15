import { validPoint } from './model'
import type { MapDataset, MapPoint, RouteGeometry } from './types'

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Očakáva sa objekt mapových údajov.')
  return value as Record<string, unknown>
}
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000)
    throw new Error('Chýba platný názov alebo identifikátor.')
  return value
}
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value) || value.length > 100000)
    throw new Error('Neplatný zoznam mapových údajov.')
  return value
}
function point(value: unknown): MapPoint {
  const p = record(value)
  if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number')
    throw new Error('Súradnice musia byť čísla.')
  const result = { latitude: p.latitude, longitude: p.longitude }
  if (!validPoint(result)) throw new Error('Súradnice sú mimo platného rozsahu.')
  return result
}
function unique(ids: readonly string[]) {
  if (new Set(ids).size !== ids.length) throw new Error('Identifikátory musia byť jedinečné.')
}
function sourceUrl(value: unknown) {
  const url = text(value)
  if (new URL(url).protocol !== 'https:') throw new Error('Zdroj musí používať HTTPS.')
  return url
}
function time(value: unknown) {
  const result = text(value)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) throw new Error('Čas musí používať formát HH:mm.')
  return result
}
export function parseRouteGeometry(value: unknown): RouteGeometry | undefined {
  if (value === undefined) return undefined
  const g = record(value)
  if (g.type !== 'LineString' && g.type !== 'MultiLineString')
    throw new Error('Trasa musí mať GeoJSON LineString alebo MultiLineString.')
  const line = (value: unknown) => {
    const coordinates = array(value).map((v) => {
      const pair = array(v)
      if (
        pair.length < 2 ||
        typeof pair[0] !== 'number' ||
        typeof pair[1] !== 'number' ||
        !validPoint({ longitude: pair[0], latitude: pair[1] })
      )
        throw new Error('Neplatné GeoJSON súradnice. Poradie je dĺžka, šírka.')
      return [pair[0], pair[1]]
    })
    if (coordinates.length < 2) throw new Error('Cestná geometria potrebuje aspoň dva body.')
    return coordinates
  }
  return {
    type: g.type,
    coordinates: g.type === 'LineString' ? line(g.coordinates) : array(g.coordinates).map(line),
  }
}
/** Validate imported fixtures and keep only the public map contract. Source objects remain untouched. */
export function parseMapDataset(value: unknown): MapDataset {
  const root = record(value),
    area = record(root.area),
    bounds = array(area.bounds)
  if (bounds.length !== 2) throw new Error('Oblasť potrebuje dva rohy zobrazenia.')
  const sw = point(bounds[0]),
    ne = point(bounds[1])
  if (sw.latitude >= ne.latitude || sw.longitude >= ne.longitude)
    throw new Error('Neplatné poradie rohov oblasti.')
  const focusLocations = array(area.focusLocations).map((value) => {
    const f = record(value)
    if (f.kind !== 'village' && f.kind !== 'city' && f.kind !== 'demo')
      throw new Error('Neplatný typ pilotného miesta.')
    return { id: text(f.id), name: text(f.name), position: point(f.position), kind: f.kind }
  })
  const stops = array(root.stops).map((value) => {
    const s = record(value)
    if (
      s.status !== 'approved' &&
      s.status !== 'proposed' &&
      s.status !== 'demo' &&
      s.status !== 'external'
    )
      throw new Error('Neplatný stav zastávky.')
    return {
      id: text(s.id),
      name: text(s.name),
      municipality: text(s.municipality),
      position: point(s.position),
      status: s.status,
    }
  })
  unique(stops.map((s) => s.id))
  unique(focusLocations.map((f) => f.id))
  const stopIds = new Set(stops.map((s) => s.id))
  const routes = array(root.routes).map((value) => {
    const r = record(value)
    if (r.kind !== 'fixed' && r.kind !== 'flex' && r.kind !== 'external')
      throw new Error('Neplatný typ linky.')
    if (
      r.geometrySource !== 'published' &&
      r.geometrySource !== 'computed' &&
      r.geometrySource !== 'schematic'
    )
      throw new Error('Trasa musí uvádzať pôvod geometrie.')
    const routeStops = array(r.stops).map((value) => {
      const s = record(value),
        stopId = text(s.stopId)
      if (!stopIds.has(stopId)) throw new Error(`Trasa odkazuje na neznámu zastávku: ${stopId}`)
      if (
        s.time !== undefined &&
        (typeof s.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time))
      )
        throw new Error('Čas musí používať formát HH:mm.')
      return {
        occurrenceId: text(s.occurrenceId),
        stopId,
        ...(s.time === undefined ? {} : { time: s.time as string }),
      }
    })
    if (routeStops.length < 2) throw new Error('Trasa potrebuje aspoň dve zastávky.')
    unique(routeStops.map((s) => s.occurrenceId))
    const shape = parseRouteGeometry(r.geometry)
    if (!shape && r.geometrySource !== 'schematic')
      throw new Error('Publikovaná alebo vypočítaná trasa potrebuje geometriu.')
    const serviceDates =
      r.serviceDates === undefined
        ? undefined
        : array(r.serviceDates).map((date) => {
            const s = text(date)
            if (
              !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
              Number.isNaN(Date.parse(s)) ||
              new Date(s).toISOString().slice(0, 10) !== s
            )
              throw new Error('Neplatný dátum premávky.')
            return s
          })
    return {
      id: text(r.id),
      code: text(r.code),
      name: text(r.name),
      direction: text(r.direction),
      kind: r.kind,
      stops: routeStops,
      geometrySource: r.geometrySource,
      ...(r.demoNote === undefined ? {} : { demoNote: text(r.demoNote) }),
      ...(r.segments === undefined
        ? {}
        : {
            segments: array(r.segments).map((value) => {
              const s = record(value),
                geometry = parseRouteGeometry(s.geometry)
              if (
                !geometry ||
                !['fixed', 'flex', 'external'].includes(String(s.kind)) ||
                typeof s.demo !== 'boolean'
              )
                throw new Error('Neplatný úsek spoločnej cesty.')
              return {
                id: text(s.id),
                code: text(s.code),
                name: text(s.name),
                kind: s.kind,
                geometry,
                demo: s.demo,
                ...(s.departure === undefined ? {} : { departure: time(s.departure) }),
                ...(s.arrival === undefined ? {} : { arrival: time(s.arrival) }),
                ...(s.sourceUrl === undefined ? {} : { sourceUrl: sourceUrl(s.sourceUrl) }),
                ...(s.timetableStops === undefined
                  ? {}
                  : {
                      timetableStops: array(s.timetableStops).map((value) => {
                        const stop = record(value)
                        return { name: text(stop.name), time: time(stop.time) }
                      }),
                    }),
              }
            }),
          }),
      ...(shape ? { geometry: shape } : {}),
      ...(serviceDates ? { serviceDates } : {}),
      ...(r.departures === undefined
        ? {}
        : {
            departures: array(r.departures).map((value) => {
              const d = record(value),
                date = text(d.date),
                time = text(d.time)
              if (
                !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                Number.isNaN(Date.parse(date)) ||
                new Date(date).toISOString().slice(0, 10) !== date ||
                !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
              )
                throw new Error('Neplatný dátum alebo čas odchodu.')
              return { date, time }
            }),
          }),
      ...(r.request === undefined
        ? {}
        : {
            request: (() => {
              const q = record(r.request),
                date = text(q.date),
                time = text(q.time)
              if (
                !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                Number.isNaN(Date.parse(date)) ||
                new Date(date).toISOString().slice(0, 10) !== date ||
                !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
                !Number.isInteger(q.passengers) ||
                Number(q.passengers) < 1 ||
                !['departure', 'arrival'].includes(String(q.timeMode)) ||
                !['pending', 'approved'].includes(String(q.status)) ||
                r.kind !== 'flex' ||
                !serviceDates?.includes(date)
              )
                throw new Error('Neplatná verejná požiadavka.')
              return {
                id: text(q.id),
                date,
                time,
                timeMode: q.timeMode,
                passengers: q.passengers,
                status: q.status,
              }
            })(),
          }),
    }
  })
  unique(routes.map((r) => r.id))
  if (typeof root.demo !== 'boolean') throw new Error('Údaje musia rozlišovať demo zobrazenie.')
  return {
    name: text(root.name),
    demo: root.demo,
    area: { id: text(area.id), name: text(area.name), bounds: [sw, ne], focusLocations },
    stops,
    routes,
    ...(root.landmarks === undefined
      ? {}
      : {
          landmarks: array(root.landmarks).map((value) => {
            const p = record(value)
            if (!['school', 'healthcare', 'shop', 'hospital'].includes(String(p.kind)))
              throw new Error('Neplatný typ budovy.')
            return {
              id: text(p.id),
              name: text(p.name),
              kind: p.kind,
              position: point(p.position),
              sourceUrl: sourceUrl(p.sourceUrl),
              coordinateSourceUrl: sourceUrl(p.coordinateSourceUrl),
            }
          }),
        }),
  } as MapDataset
}
