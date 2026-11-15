/** Public GTFS stops only. Cache road paths for the pilot; never send passenger locations.
 * Run: node scripts/cache-map-roads.mjs
 * OSRM demo policy: sequential requests, at most one per second. Reuses existing entries.
 */
/* global URL, fetch, AbortSignal, console */
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

const base = new URL('../src/modules/transport-map/demo/', import.meta.url)
const { dataset } = JSON.parse(await readFile(new URL('pilot-data.json', base), 'utf8'))
const output = new URL('road-cache.json', base)
let cache
try {
  cache = JSON.parse(await readFile(output, 'utf8'))
} catch {
  cache = { paths: {} }
}
const key = (points) =>
  points.map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`).join('|')
const patterns = dataset.routes.map((r) =>
  r.stops.map((s) => dataset.stops.find((x) => x.id === s.stopId).position),
)
// Include every directed hub connection for the six pilot locations and older demo requests.
const municipalities = [
  ...new Set([
    ...dataset.area.focusLocations.map((x) => x.name),
    'Matiašovce',
    'Červený Kláštor',
    'Haligovce',
  ]),
]
const representative = (name) =>
  dataset.stops.find((s) => s.municipality === name && /, (AS|OcÚ|centrum)/.test(s.name)) ??
  dataset.stops.find((s) => s.municipality === name)
const hub = representative('Spišská Stará Ves')
for (const name of municipalities.filter((n) => n !== hub.municipality)) {
  const stop = representative(name)
  patterns.push([stop.position, hub.position], [hub.position, stop.position])
}
cache.source = {
  engine: 'OSRM driving',
  endpoint: 'https://router.project-osrm.org',
  map: 'OpenStreetMap contributors',
  purpose: 'Computed road candidates through public GTFS stops; not operator-published bus shapes',
  retrievedAt: new Date().toISOString(),
}
let count = 0
for (const points of patterns) {
  const id = key(points)
  if (cache.paths[id]) continue
  const coordinates = points.map((p) => `${p.longitude},${p.latitude}`).join(';')
  const url = `${cache.source.endpoint}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false&continue_straight=false&radiuses=${points.map(() => '100').join(';')}`
  const response = await fetch(url, {
    signal: AbortSignal.timeout(25000),
    headers: { 'User-Agent': 'MojaCesta-pilot-demo/1.0' },
  })
  if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`)
  const result = await response.json()
  if (result.code !== 'Ok' || result.routes?.[0]?.geometry?.type !== 'LineString')
    throw new Error(`OSRM ${result.code}: ${result.message}`)
  const route = result.routes[0]
  cache.paths[id] = {
    geometry: route.geometry,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  }
  await writeFile(output, JSON.stringify(cache) + '\n')
  console.log(
    `Cached ${++count}: ${points.length} stops, ${route.geometry.coordinates.length} road vertices`,
  )
  await setTimeout(1100)
}
console.log(`${Object.keys(cache.paths).length} cached paths`)
