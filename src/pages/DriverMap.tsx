import { useSearchParams } from 'react-router-dom'
import { useStore } from '../context'
import { activeBookings, tripPlaceName } from '../domain'
import { dateLabel } from '../data'
import { DriverNavigationMap } from '../components/DriverNavigationMap'
import type { DriverMapStop } from '../components/DriverNavigationMap'
import { Empty, Notice, PageTitle } from '../components/ui'
import { ArrowLeft } from 'lucide-react'
export function DriverMap() {
  const { state } = useStore(),
    [params, setParams] = useSearchParams()
  const trips = state.trips
    .filter((t) => t.driverId === state.activeDriverId && t.status !== 'completed')
    .sort((a, b) => a.date.localeCompare(b.date) || a.stops[0].time.localeCompare(b.stops[0].time))
  const selected = trips.find((t) => t.id === params.get('tripId'))
  const vehicle = state.vehicles.find((v) => v.id === selected?.vehicleId)
  const bookings = selected ? activeBookings(state, selected.id) : []
  const stops: DriverMapStop[] =
    selected?.stops.map((stop) => {
      const known = state.stops.find((s) => s.id === stop.stopId)
      return {
        stopId: stop.stopId,
        name: tripPlaceName(state, selected, stop.stopId),
        time: stop.time,
        latitude: stop.place?.latitude ?? known?.latitude,
        longitude: stop.place?.longitude ?? known?.longitude,
        boarding: bookings.filter((b) => b.from === stop.stopId).reduce((n, b) => n + b.seats, 0),
        alighting: bookings.filter((b) => b.to === stop.stopId).reduce((n, b) => n + b.seats, 0),
      }
    }) ?? []
  return (
    <DriverNavigationMap
      trip={selected}
      stopIndex={selected?.navigation?.stopIndex ?? 0}
      stops={stops}
      renderCard={(map) => (
        <div className="driver-map-page stack">
          <PageTitle
            title="Mapa"
            description="Prehľad celej pridelenej trasy. Otvorenie mapy nezačína jazdu."
          />
          {!trips.length ? (
            <Empty text="Nemáte naplánované žiadne jazdy." />
          ) : (
            <>
              <label className="field">
                <span>Vybrať jazdu</span>
                <select
                  value={selected?.id ?? ''}
                  onChange={(e) => {
                    const next = new URLSearchParams(params)
                    if (e.target.value) next.set('tripId', e.target.value)
                    else next.delete('tripId')
                    setParams(next)
                  }}
                >
                  <option value="">Vyberte pridelenú jazdu</option>
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {dateLabel(t.date)} · {t.stops[0].time} ·{' '}
                      {t.kind === 'fixed' ? 'Pravidelná' : 'Flexibilná'} {t.line} ·{' '}
                      {tripPlaceName(state, t, t.stops[0].stopId)} →{' '}
                      {tripPlaceName(state, t, t.stops.at(-1)!.stopId)}
                    </option>
                  ))}
                </select>
              </label>
              {params.has('tripId') && !selected && (
                <Notice tone="warning">
                  Vybraná jazda nie je dostupná medzi vašimi nezavŕšenými jazdami. Vyberte inú
                  pridelenú jazdu.
                </Notice>
              )}
              {selected ? (
                <>
                  <section className="card driver-map-summary stack">
                    <h2>
                      Linka {selected.line} ·{' '}
                      {selected.kind === 'fixed' ? 'Pravidelná' : 'Flexibilná'}
                    </h2>
                    <p>
                      {dateLabel(selected.date)} ·{' '}
                      {vehicle
                        ? `${vehicle.name} · ${vehicle.plate} · ${vehicle.capacity} miest`
                        : 'Vozidlo nie je priradené'}
                    </p>
                    <p>
                      <strong>Začiatok:</strong> {stops[0]?.name} · {stops[0]?.time}
                    </p>
                    <p>
                      <strong>Cieľ:</strong> {stops.at(-1)?.name} · {stops.at(-1)?.time}
                    </p>
                  </section>
                  <section className="card driver-map-stops">
                    {map.view === 'stops' && (
                      <button className="text-link" onClick={map.showRoutes}>
                        <ArrowLeft size={18} /> Späť na celú trasu
                      </button>
                    )}
                    <h2>{map.view === 'stops' ? 'Vybraná zastávka' : 'Zastávky na trase'}</h2>
                    <ol>
                      {stops.map(
                        (s, i) =>
                          (map.view !== 'stops' ||
                            map.selection.stopOccurrenceId === `${selected.id}:${i}`) && (
                            <li key={`${s.stopId}:${i}`}>
                              <span className="stop-number">{i + 1}</span>
                              <div>
                                <h3>{s.name}</h3>
                                <p>
                                  Plánovaný príchod <time>{s.time}</time>
                                </p>
                                <p>
                                  Nastúpi: <strong>{s.boarding}</strong> · Vystúpi:{' '}
                                  <strong>{s.alighting}</strong>
                                </p>
                              </div>
                              <button
                                className="text-link"
                                aria-pressed={
                                  map.selection.stopOccurrenceId === `${selected.id}:${i}`
                                }
                                disabled={!map.route}
                                onClick={() => {
                                  const visit = map.route?.stops[i],
                                    stop = map.dataset.stops.find((s) => s.id === visit?.stopId)
                                  if (visit && stop)
                                    map.selectStop({
                                      routeId: selected.id,
                                      occurrenceId: visit.occurrenceId,
                                      index: i,
                                      stop,
                                    })
                                }}
                              >
                                Zobraziť bod {i + 1}
                              </button>
                            </li>
                          ),
                      )}
                    </ol>
                  </section>
                </>
              ) : (
                <Notice>Vyberte jazdu a zobrazte jej trasu, zastávky a pridelené vozidlo.</Notice>
              )}
            </>
          )}
        </div>
      )}
    />
  )
}
