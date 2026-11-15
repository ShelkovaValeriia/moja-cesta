/* global fetch, AbortSignal, console, URL */
import { readFile, writeFile } from 'node:fs/promises'
const base = new URL('../src/modules/transport-map/demo/', import.meta.url)
const pilot = JSON.parse(await readFile(new URL('pilot-data.json', base), 'utf8')).dataset
const representative = (municipality) =>
  pilot.stops.find((s) => s.municipality === municipality && /, (AS|OcÚ|centrum)/.test(s.name)) ??
  pilot.stops.find((s) => s.municipality === municipality)
const geography = {
  ...pilot,
  name: 'Moja Cesta · pilotná geografia',
  routes: [],
  stops: [...new Set(pilot.stops.map((s) => s.municipality))].map((m) => ({
    ...representative(m),
    status: 'demo',
  })),
}
await writeFile(new URL('pilot-geography.json', base), JSON.stringify(geography, null, 2) + '\n')
const oldCache = JSON.parse(await readFile(new URL('road-cache.json', base), 'utf8'))
const paths = Object.fromEntries(
  Object.entries(oldCache.paths).filter(([k]) => k.split('|').length === 2),
)
// Public station map, independently sourced from the newly researched operator connection.
const stationUrl = 'https://poi.oma.sk/w494293007'
const station = await (await fetch(stationUrl, { signal: AbortSignal.timeout(25000) })).text()
const latitude = Number(station.match(/property='place:location:latitude' content='([^']+)'/)?.[1])
const longitude = Number(
  station.match(/property='place:location:longitude' content='([^']+)'/)?.[1],
)
if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
  throw new Error('Missing verified Poprad station coordinates')
const points = [
  representative('Spišská Stará Ves').position,
  representative('Reľov').position,
  { latitude, longitude },
]
const url = `https://router.project-osrm.org/route/v1/driving/${points.map((p) => `${p.longitude},${p.latitude}`).join(';')}?overview=full&geometries=geojson&continue_straight=false`
const response = await fetch(url, { signal: AbortSignal.timeout(25000) })
const result = await response.json()
if (result.code !== 'Ok') throw new Error('Road routing failed')
await writeFile(
  new URL('pilot-road-cache.json', base),
  JSON.stringify({ source: oldCache.source, paths }, null, 2) + '\n',
)
await writeFile(
  new URL('transfer-road.json', base),
  JSON.stringify(
    {
      source: {
        engine: 'OSRM driving',
        retrievedAt: new Date().toISOString(),
        stationSource: stationUrl,
        note: 'Computed road corridor via Reľov; not the operator-published bus shape. Intermediate stop coordinates are not inferred.',
      },
      destination: {
        id: 'web:poprad-as',
        name: 'Poprad, AS',
        municipality: 'Poprad',
        position: { latitude, longitude },
        status: 'external',
      },
      geometry: result.routes[0].geometry,
    },
    null,
    2,
  ) + '\n',
)
console.log('Saved geographic-only pilot, hub roads and computed Poprad corridor')
