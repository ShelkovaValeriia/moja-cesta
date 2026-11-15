import type { Trip } from '../types'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '../context'
import { TransportMap, type MapCardContext } from '../modules/transport-map'
import { applicationRouting, tripDataset } from '../maps/applicationMap'
export interface DriverMapStop {
  stopId: string
  name: string
  time: string
  latitude?: number
  longitude?: number
  boarding: number
  alighting: number
}
/** Authorized driver projection. Map selections never advance operational trip state. */
export function DriverNavigationMap({
  trip,
  stopIndex,
  stops,
  renderCard,
}: {
  trip?: Trip
  stopIndex: number
  stops?: readonly DriverMapStop[]
  renderCard: (context: MapCardContext) => ReactNode
}) {
  const { state } = useStore()
  const dataset = useMemo(() => tripDataset(state.stops, trip), [state.stops, trip])
  const routing = useMemo(() => applicationRouting(state.stops), [state.stops])
  return (
    <div
      className={`driver-navigation-map ${trip ? 'driver-map-preview' : ''}`}
      data-trip-id={trip?.id}
      data-stop-index={stopIndex}
      data-stop-count={stops?.length ?? trip?.stops.length ?? 0}
    >
      <TransportMap
        key={`${trip?.id ?? 'none'}:${stopIndex}`}
        dataset={dataset}
        routing={routing}
        height="container"
        chrome="compact"
        mode="route"
        initialSelection={{
          routeId: trip?.id ?? null,
          stopOccurrenceId: trip ? `${trip.id}:${stopIndex}` : null,
        }}
        cardLabel="Pridelená jazda"
        renderCard={(context) => (
          <>
            <p className="map-demo-coordinates">Demo trasa · bez GPS a živých dopravných údajov</p>
            {trip && !dataset.routes.length && (
              <p role="status">
                Niektoré zastávky nemajú súradnice. Trasu nemožno zakresliť, poradie a časy
                zostávajú dostupné.
              </p>
            )}
            {renderCard(context)}
          </>
        )}
      />
    </div>
  )
}
