/* global URL, URLSearchParams, fetch, AbortSignal, console */
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

// Public geographic demo fixtures only. No accounts, bookings, addresses or private pins.
const places = await readFile(new URL('../src/places.ts', import.meta.url), 'utf8')
const stops = Object.fromEntries(
  [...places.matchAll(/^\s*(\w+):\s*\[([\d.]+),\s*([\d.]+)\]/gm)].map((m) => [
    m[1],
    [Number(m[2]), Number(m[3])],
  ]),
)
if (Object.keys(stops).length !== 6)
  throw new Error('Review the public demo stop inventory before regenerating.')
const patterns = Object.keys(stops).flatMap((from) =>
  Object.keys(stops)
    .filter((to) => from !== to)
    .map((to) => [from, to]),
)
const data = await readFile(new URL('../src/data.ts', import.meta.url), 'utf8')
for (const match of data.matchAll(/stops:\s*\[([^\]]+)\]/g)) {
  const ids = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  if (ids.length > 1 && ids.every((id) => stops[id])) patterns.push(ids)
}
const routes = {}
for (const pattern of patterns) {
  const points = pattern.map((id) => stops[id]),
    key = `drive:${points.map((p) => p.join(',')).join(';')}`
  if (routes[key]) continue
  const url = new URL(
    `https://router.project-osrm.org/route/v1/driving/${points.map(([lat, lon]) => `${lon},${lat}`).join(';')}`,
  )
  url.search = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    steps: 'false',
    continue_straight: 'false',
    radiuses: points.map(() => '300').join(';'),
  }).toString()
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  const result = await response.json(),
    route = result.routes?.[0]
  if (!response.ok || result.code !== 'Ok' || !route?.geometry)
    throw new Error(`${pattern.join(' → ')}: ${result.code} ${result.message ?? ''}`)
  routes[key] = {
    geometry: route.geometry,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  }
  console.log(pattern.join(' → '))
  await setTimeout(1100)
}
await writeFile(
  new URL('../src/maps/demo-road-cache.json', import.meta.url),
  JSON.stringify(
    {
      source:
        'OSRM / OpenStreetMap; computed demo corridors, not an operator bus shape or stop-safety approval',
      generatedAt: new Date().toISOString(),
      stops,
      routes,
    },
    null,
    2,
  ) + '\n',
)
