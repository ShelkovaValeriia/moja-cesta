import { useMemo } from 'react'
import { useStore } from '../context'
import { TransportMap } from '../modules/transport-map'
import { applicationRouting } from '../maps/applicationMap'
import { dispatcherMapDataset } from '../dispatcherMapDataset'
import type { DispatcherMapRoute } from '../dispatcherMapDataset'

/** Reuses the passenger map renderer without its booking workflow or application mutations. */
export function DispatcherRouteMap({ route }: { route: DispatcherMapRoute }) {
  const { state } = useStore()
  const dataset = useMemo(() => dispatcherMapDataset(state, route), [state, route])
  const routing = useMemo(() => applicationRouting(state.stops), [state.stops])
  return (
    <div
      className="dispatcher-route-map"
      data-route-kind={route.kind}
      data-route-id={route.value.id}
    >
      <TransportMap
        key={`${route.kind}:${route.value.id}`}
        dataset={dataset}
        routing={routing}
        chrome="map"
        height="container"
        mode="route"
        initialSelection={{ routeId: dataset.routes[0]?.id ?? null }}
        renderCard={() => null}
      />
      {!dataset.routes.length && (
        <p role="status" className="dispatcher-map-notice">
          Niektoré miesta nemajú súradnice. Trasu nemožno zakresliť.
        </p>
      )}
    </div>
  )
}
