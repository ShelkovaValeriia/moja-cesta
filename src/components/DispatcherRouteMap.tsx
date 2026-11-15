import { useMemo, useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { useStore } from '../context'
import { TransportMap } from '../modules/transport-map'
import type { MapSelection } from '../modules/transport-map'
import { applicationRouting } from '../maps/applicationMap'
import { dispatcherMapDataset } from '../dispatcherMapDataset'
import type { DispatcherMapRoute } from '../dispatcherMapDataset'

/** Reuses the passenger map renderer without its booking workflow or application mutations. */
export function DispatcherRouteMap({ route }: { route: DispatcherMapRoute }) {
  const { state } = useStore()
  const dataset = useMemo(() => dispatcherMapDataset(state, route), [state, route])
  const routing = useMemo(() => applicationRouting(state.stops), [state.stops])
  const mapElement = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<MapSelection>({
    routeId: dataset.routes[0]?.id ?? null,
    stopOccurrenceId: null,
    place: null,
  })
  const selectedRoute = dataset.routes.find((item) => item.id === selection.routeId)
  const selectedIndex =
    selectedRoute?.stops.findIndex((stop) => stop.occurrenceId === selection.stopOccurrenceId) ?? -1
  const visit = selectedIndex >= 0 ? selectedRoute?.stops[selectedIndex] : undefined
  const stop = visit ? dataset.stops.find((item) => item.id === visit.stopId) : undefined
  return (
    <div
      ref={mapElement}
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
        selection={selection}
        onSelectionChange={setSelection}
        renderCard={() => null}
      />
      {stop && visit && (
        <aside className="dispatcher-selected-stop" aria-label="Detail vybraného bodu">
          <div aria-live="polite" aria-atomic="true">
            <p className="small muted">
              <MapPin size={16} aria-hidden="true" />
              {stop.status === 'proposed' ? 'Navrhované miesto' : 'Zastávka'} {selectedIndex + 1}
            </p>
            <h2>{stop.name}</h2>
            {stop.municipality && <p className="small muted">{stop.municipality}</p>}
            {visit.time && (
              <p>
                Plánovaný čas <time>{visit.time}</time>
              </p>
            )}
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Zavrieť detail zastávky"
            onClick={() => {
              setSelection({ ...selection, stopOccurrenceId: null })
              mapElement.current?.querySelector<HTMLElement>('.tm-leaflet')?.focus()
            }}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </aside>
      )}
      {!dataset.routes.length && (
        <p role="status" className="dispatcher-map-notice">
          Niektoré miesta nemajú súradnice. Trasu nemožno zakresliť.
        </p>
      )}
    </div>
  )
}
