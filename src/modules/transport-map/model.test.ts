import { describe, expect, it } from 'vitest'
import pilot from './demo/pilot-data.json'
import { filterRoutes, routeLines, routesAtPoint, validSelection } from './model'
import { EMPTY_FILTERS, EMPTY_SELECTION } from './config'
import { parseMapDataset } from './validation'
import type { MapDataset } from './types'

const dataset = parseMapDataset(pilot.dataset)
describe('map data and geographic selection', () => {
  it('imports all six real pilot municipalities and preserves full directional patterns', () => {
    expect(dataset.area.focusLocations.map((p) => p.name)).toEqual([
      'Spišská Stará Ves',
      'Havka',
      'Zálesie',
      'Jezersko',
      'Lechnica',
      'Veľká Lesná',
    ])
    expect(dataset.routes).toHaveLength(16)
    expect(dataset.stops).toHaveLength(88)
    expect(
      dataset.routes.every((r) => r.kind === 'external' && r.geometrySource === 'schematic'),
    ).toBe(true)
    expect(dataset.stops.some((s) => s.municipality === 'Matiašovce')).toBe(true)
  })
  it('filters case and diacritics consistently and never guesses unknown service dates', () => {
    const found = filterRoutes(dataset, { ...EMPTY_FILTERS, query: 'VELKA LESNA' })
    expect(found.length).toBeGreaterThan(0)
    expect(
      found.every((r) =>
        r.stops.some(
          (s) => dataset.stops.find((stop) => stop.id === s.stopId)?.municipality === 'Veľká Lesná',
        ),
      ),
    ).toBe(true)
    expect(filterRoutes(dataset, { ...EMPTY_FILTERS, date: '2026-09-08' })).toHaveLength(0)
    expect(filterRoutes(dataset, { ...EMPTY_FILTERS, kind: 'flex' })).toHaveLength(0)
  })
  it('requires both municipality and route kind filters to match', () => {
    const found = filterRoutes(dataset, {
      ...EMPTY_FILTERS,
      municipality: 'Havka',
      kind: 'external',
    })
    expect(found.length).toBeGreaterThan(0)
    expect(
      filterRoutes(dataset, { ...EMPTY_FILTERS, municipality: 'Havka', query: 'neexistuje' }),
    ).toHaveLength(0)
  })
  it('converts GeoJSON longitude/latitude without reversing the route stop order', () => {
    const route = {
      ...dataset.routes[0],
      geometrySource: 'published' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [20.4, 49.3],
          [20.5, 49.4],
        ],
      },
    }
    expect(routeLines(route)).toEqual([
      [
        { latitude: 49.3, longitude: 20.4 },
        { latitude: 49.4, longitude: 20.5 },
      ],
    ])
  })
  it('returns both routes on a shared section in either travel direction', () => {
    const base = dataset.routes[0]
    const routes = [
      {
        ...base,
        id: 'out',
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [20, 49],
            [21, 49],
          ],
        },
      },
      {
        ...base,
        id: 'back',
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [21, 49],
            [20, 49],
          ],
        },
      },
    ]
    expect(
      routesAtPoint(routes, { longitude: 20.5, latitude: 49.005 }, (p) => ({
        x: p.longitude * 1000,
        y: p.latitude * 1000,
      })).map((r) => r.id),
    ).toEqual(['out', 'back'])
    expect(
      routesAtPoint(routes, { longitude: 20.5, latitude: 49.1 }, (p) => ({
        x: p.longitude * 1000,
        y: p.latitude * 1000,
      })),
    ).toHaveLength(0)
  })
  it('rejects unknown stop references, duplicate occurrences and invalid geometry', () => {
    const clone = (): MapDataset => structuredClone(dataset)
    const badStop = clone()
    badStop.routes = [
      {
        ...badStop.routes[0],
        stops: [
          { occurrenceId: 'a', stopId: 'absent' },
          { occurrenceId: 'b', stopId: 'absent' },
        ],
      },
    ]
    expect(() => parseMapDataset(badStop)).toThrow('neznámu zastávku')
    const duplicate = clone(),
      route = duplicate.routes[0]
    duplicate.routes = [{ ...route, stops: [route.stops[0], route.stops[0]] }]
    expect(() => parseMapDataset(duplicate)).toThrow('jedinečné')
    expect(() =>
      parseMapDataset({
        ...dataset,
        area: {
          ...dataset.area,
          bounds: [
            { latitude: 100, longitude: 20 },
            { latitude: 101, longitude: 21 },
          ],
        },
      }),
    ).toThrow('rozsahu')
  })
  it('never accepts a selected stop occurrence from another route', () => {
    const route = dataset.routes[0],
      other = dataset.routes[1]
    expect(
      validSelection(dataset, {
        ...EMPTY_SELECTION,
        routeId: route.id,
        stopOccurrenceId: other.stops[0].occurrenceId,
      }).stopOccurrenceId,
    ).toBeNull()
  })
})
