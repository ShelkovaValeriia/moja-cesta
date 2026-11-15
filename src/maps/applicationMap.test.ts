import { afterEach, expect, it, vi } from 'vitest'
import { createInitialState } from '../data'
import {
  applicationRouting,
  requestDataset,
  tripDataset,
  publicTripDataset,
} from './applicationMap'
import { restoreState } from '../storage'

afterEach(() => vi.unstubAllEnvs())

it('draws every preset public trip and request from cached full road geometry with network unavailable', async () => {
  const state = createInitialState(),
    router = applicationRouting(state.stops)
  const fixed = publicTripDataset(state.stops, state.trips)
  const requests = requestDataset(state.stops, state.requests)
  const failedFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
  try {
    for (const dataset of [fixed, requests])
      for (const route of dataset.routes) {
        const points = route.stops.map(
          (s) => dataset.stops.find((stop) => stop.id === s.stopId)!.position,
        )
        const result = await router.route(points, 'drive', new AbortController().signal)
        expect(result.geometry.type).toBe('LineString')
        expect(result.geometry.coordinates.length).toBeGreaterThan(route.stops.length)
      }
    expect(failedFetch).not.toHaveBeenCalled()
  } finally {
    failedFetch.mockRestore()
  }
})

it('repairs only the misplaced legacy Lechnica point without resetting bookings or edited stop coordinates', () => {
  const state = createInitialState(),
    lech = state.stops.find((s) => s.id === 'lech')!
  lech.latitude = 49.39
  lech.longitude = 20.443
  const restored = restoreState(state)!
  expect(restored.stops.find((s) => s.id === 'lech')).toMatchObject({
    latitude: 49.384365,
    longitude: 20.407579,
  })
  expect(restored.bookings).toEqual(state.bookings)
  expect(restored.requests).toEqual(state.requests)
  lech.latitude = 49.385
  expect(restoreState(state)!.stops.find((s) => s.id === 'lech')?.latitude).toBe(49.385)
})

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
