// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOsrmRouting } from './services'
import { routeLines, roadRouteKey, stopLabel } from './model'
import { withPilotRoads } from './demo/road-data'
import { publicRequestRoutes } from './demo/request-adapter'
import { createInitialState } from '../../data'
import { parseMapDataset } from './validation'
import { useRoadRoutes } from './useRoadRoutes'
import pilot from './demo/pilot-data.json'
import type { RoutingService } from './types'

const dataset = parseMapDataset(pilot.dataset)
const geometry = {
  type: 'LineString' as const,
  coordinates: [
    [20, 49],
    [20.1, 49.2],
    [20.2, 49.3],
  ],
}
afterEach(cleanup)
describe('road geometry and ordered stop numbers', () => {
  it('loads detailed road geometry for every imported pattern and demo request without altering source data', () => {
    const input = {
      ...dataset,
      routes: [...dataset.routes, ...publicRequestRoutes(createInitialState(), dataset)],
    }
    const result = withPilotRoads(input)
    expect(
      result.routes.every(
        (r) => r.geometrySource === 'computed' && routeLines(r).flat().length > r.stops.length,
      ),
    ).toBe(true)
    expect(dataset.routes.every((r) => !r.geometry && r.geometrySource === 'schematic')).toBe(true)
    expect(result.routes.map((r) => r.stops)).toEqual(input.routes.map((r) => r.stops))
    const published = { ...result.routes[0], geometrySource: 'published' as const, geometry }
    expect(withPilotRoads({ ...dataset, routes: [published] }).routes[0]).toBe(published)
  })
  it('never draws straight stop connectors and labels managed stops by occurrence order', () => {
    expect(routeLines(dataset.routes[0])).toEqual([])
    const stop = dataset.stops[0],
      route = { ...dataset.routes[0], kind: 'fixed' as const }
    expect(stopLabel(route, 0, stop)).toBe('Zastávka 1')
    expect(stopLabel(route, 2, stop)).toBe('Zastávka 3')
    expect(stopLabel(dataset.routes[0], 0, stop)).toBe(stop.name)
    expect(roadRouteKey(route, dataset.stops)).not.toBe(
      roadRouteKey({ ...route, stops: [...route.stops].reverse() }, dataset.stops),
    )
  })
  it('requests full road geometry through ordered stops and rejects missing/invalid responses', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'Ok', routes: [{ geometry, distance: 2500, duration: 400 }] }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'NoRoute' })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 1, duration: 1 }] })),
      )
    const router = createOsrmRouting({
      endpoint: 'https://roads.example',
      fetch: fetcher,
      intervalMs: 0,
    })
    const points = [
      { latitude: 49, longitude: 20 },
      { latitude: 49.3, longitude: 20.2 },
    ]
    const signal = new AbortController().signal
    expect(await router.route(points, 'drive', signal)).toEqual({
      geometry,
      distanceMeters: 2500,
      durationSeconds: 400,
    })
    const url = new URL(String(fetcher.mock.calls[0][0]))
    expect(url.pathname).toBe('/route/v1/driving/20,49;20.2,49.3')
    expect(url.searchParams.get('overview')).toBe('full')
    expect(url.searchParams.get('radiuses')).toBe('100;100')
    await expect(router.route(points, 'drive', signal)).rejects.toThrow('nepodarilo')
    await expect(router.route(points, 'drive', signal)).rejects.toThrow('nevrátila')
    const controller = new AbortController()
    controller.abort()
    await expect(router.route(points, 'drive', controller.signal)).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('ignores obsolete routing responses and never replaces published shapes', async () => {
    const pending: ((result: Awaited<ReturnType<RoutingService['route']>>) => void)[] = []
    const router: RoutingService = {
      route: vi.fn<RoutingService['route']>(() => new Promise((resolve) => pending.push(resolve))),
    }
    const input = { ...dataset, routes: [dataset.routes[0]] }
    const { result, rerender } = renderHook(({ data }) => useRoadRoutes(data, router), {
      initialProps: { data: input },
    })
    const published = {
      ...input,
      routes: [{ ...input.routes[0], geometry, geometrySource: 'published' as const }],
    }
    rerender({ data: published })
    await act(async () =>
      pending[0]({
        geometry: {
          ...geometry,
          coordinates: [
            [21, 50],
            [22, 51],
          ],
        },
        distanceMeters: 1,
        durationSeconds: 1,
      }),
    )
    expect(result.current.dataset.routes[0].geometry).toEqual(geometry)
    expect(result.current.missing).toBe(0)
  })
  it('retries failed routing without ever inventing a replacement line', async () => {
    const route = vi
      .fn<RoutingService['route']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ geometry, distanceMeters: 1, durationSeconds: 1 })
    const router = { route }
    const input = { ...dataset, routes: [dataset.routes[0]] }
    const { result } = renderHook(() => useRoadRoutes(input, router))
    await waitFor(() => expect(result.current.failed).toBe(1))
    expect(routeLines(result.current.dataset.routes[0])).toEqual([])
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.missing).toBe(0))
    expect(result.current.dataset.routes[0].geometry).toEqual(geometry)
    expect(route).toHaveBeenCalledTimes(2)
  })
})
