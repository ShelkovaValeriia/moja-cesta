import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialState } from './data'
import { dispatcherMapDataset } from './dispatcherMapDataset'
import { applicationRouting, requestDataset } from './maps/applicationMap'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('dispatcher-only map projections', () => {
  it('projects full Fixed and Flex trip stop sequences including repeated stops without passenger data', () => {
    const state = createInitialState(),
      before = structuredClone(state)
    for (const kind of ['fixed', 'flex'] as const) {
      const original = state.trips.find((t) => t.kind === kind)!
      const trip = { ...original, stops: [...original.stops, original.stops[0]] }
      const dataset = dispatcherMapDataset(state, { kind: 'trip', value: trip })
      expect(dataset.routes).toHaveLength(1)
      expect(dataset.routes[0].id).toBe(trip.id)
      expect(dataset.stops.map((s) => s.name)).toEqual(
        trip.stops.map((s) => state.stops.find((stop) => stop.id === s.stopId)!.name),
      )
      expect(dataset.routes[0].stops.map((s) => s.time)).toEqual(trip.stops.map((s) => s.time))
      expect(new Set(dataset.routes[0].stops.map((s) => s.occurrenceId)).size).toBe(
        trip.stops.length,
      )
      expect(JSON.stringify(dataset)).not.toMatch(
        /passengerCode|memberSeats|contact|assistance|bookings/,
      )
    }
    expect(state).toEqual(before)
  })

  it('uses the assigned itinerary for approved requests, rather than a direct endpoint shortcut', () => {
    const state = createInitialState()
    const trip = state.trips.find((t) => t.kind === 'fixed' && t.stops.length > 2)!
    const request = { ...state.requests[0], status: 'approved' as const, tripId: trip.id }
    const dataset = dispatcherMapDataset(state, { kind: 'request', value: request })
    expect(dataset.routes[0].id).toBe(trip.id)
    expect(dataset.routes[0].stops).toHaveLength(trip.stops.length)
    expect(dataset.stops.map((s) => s.position)).toEqual(
      trip.stops.map((s) => {
        const stop = state.stops.find((known) => known.id === s.stopId)!
        return { latitude: stop.latitude, longitude: stop.longitude }
      }),
    )
  })

  it('retains exact proposed endpoints for dispatch without leaking them to the public passenger projection', async () => {
    const state = createInitialState()
    const request = {
      ...state.requests[0],
      fromPlace: {
        type: 'custom' as const,
        name: 'Súkromná adresa 123',
        latitude: 49.371234,
        longitude: 20.412345,
      },
      members: ['private-traveler'],
      accessibility: 'Private assistance note',
    }
    const dataset = dispatcherMapDataset(state, { kind: 'request', value: request })
    expect(dataset.stops[0]).toMatchObject({
      position: { latitude: 49.371234, longitude: 20.412345 },
      status: 'proposed',
    })
    expect(dataset.routes[0].request?.status).toBe('pending')
    expect(dataset.routes[0].stops.every((s) => !s.time)).toBe(true)
    expect(JSON.stringify(dataset)).not.toMatch(/private-traveler|Private assistance note/)
    const publicData = JSON.stringify(requestDataset(state.stops, [request]))
    expect(publicData).not.toMatch(/Súkromná adresa|49.371234|20.412345/)
    vi.stubEnv('VITE_MAP_PRIVATE_ROUTING', '')
    const fetcher = vi.spyOn(globalThis, 'fetch')
    await expect(
      applicationRouting(state.stops).route(
        dataset.stops.map((s) => s.position),
        'drive',
        new AbortController().signal,
      ),
    ).rejects.toThrow('neverejné')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps rejected submissions inspectable without presenting them as confirmed trips', () => {
    const state = createInitialState()
    const request = { ...state.requests[0], status: 'rejected' as const, tripId: state.trips[0].id }
    const dataset = dispatcherMapDataset(state, { kind: 'request', value: request })
    expect(dataset.routes[0].id).toBe(`request:${request.id}`)
    expect(dataset.routes[0].request).toBeUndefined()
    expect(dataset.routes[0].departures).toBeUndefined()
  })

  it('never connects across an unlocated intermediate stop or replaces a missing endpoint', () => {
    const state = createInitialState()
    const trip = {
      ...state.trips[0],
      stops: [...state.trips[0].stops, { stopId: 'missing', time: '12:30' }],
    }
    expect(dispatcherMapDataset(state, { kind: 'trip', value: trip }).routes).toEqual([])
    const request = { ...state.requests[0], to: 'missing' }
    const dataset = dispatcherMapDataset(state, { kind: 'request', value: request })
    expect(dataset.routes).toEqual([])
    expect(dataset.stops).toHaveLength(1)
  })

  it('resolves the preset dispatcher routes from the shared cached road data when offline', async () => {
    const state = createInitialState()
    const router = applicationRouting(state.stops)
    const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const datasets = [
      ...state.trips
        .filter((t) => t.date === state.serviceDate)
        .map((value) => dispatcherMapDataset(state, { kind: 'trip', value })),
      ...state.requests.map((value) => dispatcherMapDataset(state, { kind: 'request', value })),
    ]
    for (const dataset of datasets)
      for (const route of dataset.routes) {
        const points = route.stops.map(
          (s) => dataset.stops.find((stop) => stop.id === s.stopId)!.position,
        )
        const result = await router.route(points, 'drive', new AbortController().signal)
        expect(result.geometry.coordinates.length).toBeGreaterThan(points.length)
      }
    expect(fetcher).not.toHaveBeenCalled()
  })
})
