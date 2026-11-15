import { useEffect, useMemo, useRef, useState } from 'react'
import { roadRouteKey, routeStops } from './model'
import type { MapDataset, RouteGeometry, RoutingService } from './types'

/** No passenger fields cross the routing boundary, only ordered public stop coordinates. */
export function useRoadRoutes(dataset: MapDataset, routing?: RoutingService) {
  const [results, setResults] = useState<{
    provider?: RoutingService
    paths: Record<string, RouteGeometry>
  }>({ paths: {} })
  const [failures, setFailures] = useState<{ provider?: RoutingService; keys: string[] }>({
    keys: [],
  })
  const [attempt, setAttempt] = useState(0)
  const cache = useRef<{ provider?: RoutingService; paths: Record<string, RouteGeometry> }>({
    paths: {},
  })
  const paths = useMemo(
    () => (results.provider === routing ? results.paths : {}),
    [results, routing],
  )
  const unresolved = useMemo(
    () => dataset.routes.filter((r) => !r.geometry && !paths[roadRouteKey(r, dataset.stops)]),
    [dataset, paths],
  )
  useEffect(() => {
    if (!routing) return
    if (cache.current.provider !== routing) cache.current = { provider: routing, paths: {} }
    const controller = new AbortController()
    const seen = new Set<string>()
    async function resolve() {
      const failed: string[] = []
      for (const route of dataset.routes) {
        const key = roadRouteKey(route, dataset.stops)
        if (route.geometry || cache.current.paths[key] || seen.has(key)) continue
        seen.add(key)
        try {
          const points = routeStops(route, dataset.stops).map(({ stop }) => stop.position)
          const result = await routing!.route(points, 'drive', controller.signal)
          if (controller.signal.aborted) return
          cache.current.paths[key] = result.geometry
          setResults((old) => ({
            provider: routing,
            paths: { ...(old.provider === routing ? old.paths : {}), [key]: result.geometry },
          }))
        } catch {
          if (controller.signal.aborted) return
          failed.push(key)
        }
      }
      if (!controller.signal.aborted) setFailures({ provider: routing, keys: failed })
    }
    void resolve()
    return () => controller.abort()
  }, [dataset, routing, attempt])
  const routed = useMemo(
    () => ({
      ...dataset,
      routes: dataset.routes.map((r) => {
        const geometry = paths[roadRouteKey(r, dataset.stops)]
        return !r.geometry && geometry ? { ...r, geometry, geometrySource: 'computed' as const } : r
      }),
    }),
    [dataset, paths],
  )
  return {
    dataset: routed,
    missing: unresolved.length,
    failed: failures.provider === routing ? failures.keys.length : 0,
    retry: () => setAttempt((n) => n + 1),
  }
}
