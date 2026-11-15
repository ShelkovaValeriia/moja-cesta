import { describe, it, expect } from 'vitest'
import { createInitialState } from '../../data'
import { publicRequestRoutes } from './demo/request-adapter'
import pilot from './demo/pilot-data.json'
import { parseMapDataset } from './validation'
import { filterRoutes, routeColor, stopDisplayPoint } from './model'
import { EMPTY_FILTERS } from './config'

const dataset = parseMapDataset(pilot.dataset)
describe('public request map and rendering semantics', () => {
  it('filters requests inclusively by date and requested time, excluding unknown timetables', () => {
    const state = createInitialState(),
      requests = publicRequestRoutes(state, dataset)
    const data = { ...dataset, routes: [...dataset.routes, ...requests] }
    const date = requests[0].request!.date
    const found = filterRoutes(data, {
      ...EMPTY_FILTERS,
      layer: 'requests',
      date,
      timeFrom: '09:30',
      timeTo: '11:00',
    })
    expect(found.length).toBeGreaterThan(0)
    expect(
      found.every(
        (r) =>
          r.request &&
          r.request.time >= '09:30' &&
          r.request.time <= '11:00' &&
          r.request.date === date,
      ),
    ).toBe(true)
    expect(
      filterRoutes(data, { ...EMPTY_FILTERS, date, timeFrom: '14:00', timeTo: '10:00' }),
    ).toEqual([])
    expect(filterRoutes(data, { ...EMPTY_FILTERS, date: '2099-01-01', layer: 'requests' })).toEqual(
      [],
    )
    expect(filterRoutes(data, { ...EMPTY_FILTERS, layer: 'routes' })).toEqual(dataset.routes)
    expect(parseMapDataset(data).routes.at(-1)?.request).toEqual(requests.at(-1)?.request)
  })
  it('never copies private addresses, contacts, identities or assistance notes into public features', () => {
    const state = createInitialState()
    state.requests[0] = {
      ...state.requests[0],
      accessibility: 'PRIVATE_ASSISTANCE',
      members: ['PRIVATE_PERSON'],
      fromPlace: { type: 'custom', latitude: 49.3333, longitude: 20.3333, name: 'PRIVATE_HOME' },
    }
    const text = JSON.stringify(publicRequestRoutes(state, dataset))
    expect(text).not.toContain('PRIVATE_')
    expect(text).not.toContain('49.3333')
  })
  it('keeps colors stable through filtering and distinguishes pilot bus services', () => {
    const codes = [...new Set(dataset.routes.map((r) => r.code))]
    const colors = codes.map((code) => routeColor(dataset.routes.find((r) => r.code === code)!))
    expect(new Set(colors).size).toBe(codes.length)
    expect(routeColor(dataset.routes[0])).toBe(
      routeColor({ ...dataset.routes[0], id: 'other-direction' }),
    )
  })
  it('aligns the visible marker with route geometry while keeping original stop coordinates intact', () => {
    const route = {
      ...dataset.routes[0],
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [20, 49],
          [21, 49],
        ],
      },
    }
    const point = { longitude: 20.5, latitude: 49.01 }
    expect(stopDisplayPoint(route, point)).toEqual({ longitude: 20.5, latitude: 49 })
    expect(point.latitude).toBe(49.01)
  })
})
