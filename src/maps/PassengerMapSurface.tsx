import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '../context'
import { TransportMap, type MapCardContext } from '../modules/transport-map'
import { applicationRouting, publicTripDataset } from './applicationMap'
import type { Trip } from '../types'

/** Presentation only: booking selections and round-trip checks remain owned by the host. */
export function PassengerMapSurface({
  trips,
  children,
  renderDetails,
}: {
  trips: readonly Trip[]
  children: (map: MapCardContext) => ReactNode
  renderDetails?: (map: MapCardContext) => ReactNode
}) {
  const { state } = useStore()
  const dataset = useMemo(() => publicTripDataset(state.stops, trips), [state.stops, trips])
  const routing = useMemo(() => applicationRouting(state.stops), [state.stops])
  return (
    <TransportMap
      dataset={dataset}
      routing={routing}
      chrome="compact"
      height="container"
      renderCard={(map) => (
        <>
          {map.view === 'stops' && map.route ? (
            <div className="stack">
              <button className="text-link" onClick={map.showRoutes}>
                ← Späť na spoje
              </button>
              <h2>
                Linka {map.route.code} · {map.route.name}
              </h2>
              <ol className="timeline">
                {map.route?.stops
                  .filter(
                    (s) =>
                      !map.selection.stopOccurrenceId ||
                      s.occurrenceId === map.selection.stopOccurrenceId,
                  )
                  .map((s) => (
                    <li key={s.occurrenceId}>
                      <time>{s.time}</time>
                      <span className="timeline-dot" />
                      <div>
                        <strong>Zastávka {map.route!.stops.indexOf(s) + 1}</strong>
                        <small>
                          {map.dataset.stops.find((stop) => stop.id === s.stopId)?.name}
                        </small>
                      </div>
                    </li>
                  ))}
              </ol>
              {renderDetails?.(map)}
            </div>
          ) : (
            children(map)
          )}
        </>
      )}
    />
  )
}
