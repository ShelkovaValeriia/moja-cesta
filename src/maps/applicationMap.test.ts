import { afterEach, expect, it, vi } from 'vitest'
import { createInitialState } from '../data'
import { applicationRouting, requestDataset, tripDataset } from './applicationMap'

afterEach(() => vi.unstubAllEnvs())

it('projects public requests without private locations, identities or assistance fields', () => {
  const state = createInitialState()
  const request = {
    ...state.requests[0],
    fromPlace: {
      type: 'custom' as const,
      name: 'Súkromný dom 123',
      latitude: 49.371234,
      longitude: 20.412345,
    },
    accessibility: 'Súkromná poznámka',
    members: ['secret-passenger-code'],
  }
  const dataset = requestDataset(state.stops, [request])
  const serialized = JSON.stringify(dataset)
  expect(dataset.routes).toHaveLength(1)
  expect(dataset.routes[0].request?.passengers).toBe(request.passengers)
  for (const secret of [
    'Súkromný dom',
    '49.371234',
    '20.412345',
    'Súkromná poznámka',
    'secret-passenger-code',
    'memberSeats',
  ])
    expect(serialized).not.toContain(secret)
  expect(dataset.routes[0].stops.map((s) => s.stopId)).toEqual([request.from, request.to])
})

it('keeps driver stop occurrences, planned times and approved coordinates in exact trip order', () => {
  const state = createInitialState(),
    trip = state.trips[0]
  const loop = { ...trip, stops: [...trip.stops, trip.stops[0]] }
  const dataset = tripDataset(state.stops, loop)
  expect(dataset.routes[0].stops.map((s) => s.time)).toEqual(loop.stops.map((s) => s.time))
  expect(new Set(dataset.routes[0].stops.map((s) => s.occurrenceId)).size).toBe(loop.stops.length)
  expect(dataset.stops[0].position).toEqual(dataset.stops.at(-1)?.position)
  expect(JSON.stringify(dataset)).not.toMatch(/passenger|bookings|guardian|contact/)
  const incomplete = tripDataset(state.stops, {
    ...trip,
    stops: [...trip.stops, { stopId: 'unknown', time: '12:00' }],
  })
  expect(incomplete.routes).toEqual([])
})

it('never transmits a private driver pickup point to the default public road service', async () => {
  vi.stubEnv('VITE_MAP_PRIVATE_ROUTING', '')
  const routing = applicationRouting(createInitialState().stops)
  await expect(
    routing.route(
      [
        { latitude: 49.371234, longitude: 20.412345 },
        { latitude: 49.383, longitude: 20.366 },
      ],
      'drive',
      new AbortController().signal,
    ),
  ).rejects.toThrow('neverejné body')
})
