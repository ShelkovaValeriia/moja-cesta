import { bookingPassengerCode, formatPassengerCode } from '../passengerCodes'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, UsersRound, X, Pencil } from 'lucide-react'
import { useStore } from '../context'
import { activeBookings, tripPlaceName } from '../domain'
import { stopProcessed } from '../driverNavigation'
import { DriverNavigationMap } from '../components/DriverNavigationMap'
import { Badge, Empty, Notice } from '../components/ui'
const timeOf = (time?: string) =>
  time
    ? new Date(time).toLocaleTimeString('sk-SK', {
        timeZone: 'Europe/Bratislava',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
    : 'Nezaznamenané'
export function ActiveDriverTrip() {
  const { id } = useParams(),
    { state, act, toast, storageWarning } = useStore(),
    trip = state.trips.find((t) => t.id === id && t.driverId === state.activeDriverId)
  if (!trip)
    return (
      <main className="main">
        <Empty
          text="Pridelená jazda sa nenašla."
          action={<Link to="/driver">Späť na jazdy</Link>}
        />
      </main>
    )
  const bookings = activeBookings(state, trip.id),
    vehicle = state.vehicles.find((v) => v.id === trip.vehicleId),
    nav = trip.navigation,
    stop = trip.stops[nav?.stopIndex ?? 0],
    occupied = bookings.filter((b) => b.riderStatus === 'boarded').reduce((n, b) => n + b.seats, 0)
  const event = (type: 'navigationArrive' | 'navigationContinue') =>
    act(
      { type, id: trip.id, now: new Date().toISOString() },
      type === 'navigationArrive' ? 'Zastávka je otvorená.' : 'Postup jazdy bol uložený.',
    )
  if (trip.status === 'completed')
    return (
      <main className="main driver-finished stack">
        <Badge status="completed" />
        <h1>Jazda bola ukončená</h1>
        <p>
          Linka {trip.line} · {vehicle?.name}
        </p>
        <div className="card stack">
          <p>
            Prevezení cestujúci:{' '}
            <strong>
              {bookings
                .filter((b) => b.riderStatus === 'alighted')
                .reduce((n, b) => n + b.seats, 0)}
            </strong>
          </p>
          <p>
            Neúčasti:{' '}
            <strong>
              {bookings.filter((b) => b.riderStatus === 'absent').reduce((n, b) => n + b.seats, 0)}
            </strong>
          </p>
          <p>Začiatok: {timeOf(nav?.startedAt)}</p>
          <p>Koniec: {timeOf(nav?.endedAt)}</p>
        </div>
        <Link className="btn" to="/driver">
          Späť na dnešné jazdy
        </Link>
      </main>
    )
  if (trip.status !== 'active' || !stop)
    return (
      <main className="main">
        <Empty
          text="Jazda ešte nebola začatá."
          action={<Link to={`/driver/trips/${trip.id}`}>Otvoriť jazdu</Link>}
        />
      </main>
    )
  const boarding = bookings.filter((b) => b.from === stop.stopId),
    alighting = bookings.filter((b) => b.to === stop.stopId),
    ready = stopProcessed(state, trip),
    last = (nav?.stopIndex ?? 0) === trip.stops.length - 1
  return (
    <main className="driver-navigation" aria-label="Aktívna jazda">
      <DriverNavigationMap
        trip={trip}
        stopIndex={nav?.stopIndex ?? 0}
        renderCard={() =>
          nav?.phase !== 'stopped' ? (
            <section className="driver-navigation-next card">
              <span>
                Nasledujúca zastávka · {(nav?.stopIndex ?? 0) + 1} / {trip.stops.length}
              </span>
              <h1>{tripPlaceName(state, trip, stop.stopId)}</h1>
              <p>
                Plánovaný príchod <strong>{stop.time}</strong>
              </p>
              <p className="small muted">
                Všetky úkony vykonávajte až po bezpečnom zastavení vozidla.
              </p>
              <button className="btn" onClick={() => event('navigationArrive')}>
                Dorazil som na zastávku
              </button>
            </section>
          ) : (
            <section className="driver-stop-sheet" aria-label="Spracovanie zastávky">
              <div className="stack">
                <h1>{tripPlaceName(state, trip, stop.stopId)}</h1>
                <p>
                  Plánovaný čas {stop.time} · Vo vozidle{' '}
                  <strong>
                    {occupied} / {vehicle?.capacity}
                  </strong>{' '}
                  · Voľné miesta: {(vehicle?.capacity ?? 0) - occupied}
                </p>
                <p className="small muted">
                  Vozidlo musí zostať bezpečne zastavené. Najskôr označte výstupy, aby sa uvoľnili
                  miesta.
                </p>
                <h2>Nastupujúci</h2>
                {!boarding.length && <p>Na tejto zastávke nikto nenastupuje.</p>}
                {boarding.map((b) => (
                  <article className="navigation-rider" key={b.id}>
                    <div>
                      <strong>{formatPassengerCode(bookingPassengerCode(state, b))}</strong>
                      {b.personId &&
                        state.people.find((p) => p.id === b.personId)?.mobility !==
                          'Bez obmedzení' && (
                          <small>{state.people.find((p) => p.id === b.personId)?.mobility}</small>
                        )}
                      <span>
                        {b.seats} {b.seats === 1 ? 'miesto' : 'miesta'}
                      </span>
                      <small>
                        Nástup: {tripPlaceName(state, trip, b.from)} · Výstup:{' '}
                        {tripPlaceName(state, trip, b.to)}
                      </small>
                      <Badge status={b.riderStatus} />
                    </div>
                    <div className="regular-actions">
                      {b.riderStatus === 'expected' ? (
                        <>
                          <button
                            className="btn"
                            disabled={
                              b.riderStatus !== 'expected' ||
                              occupied + b.seats > (vehicle?.capacity ?? 0)
                            }
                            onClick={() =>
                              act(
                                { type: 'rider', id: b.id, status: 'boarded' },
                                'Nástup bol zaznamenaný.',
                              )
                            }
                          >
                            <Check size={18} />
                            Nastúpil
                          </button>
                          <button
                            className="btn btn-secondary"
                            disabled={b.riderStatus !== 'expected'}
                            onClick={() =>
                              act(
                                { type: 'rider', id: b.id, status: 'absent' },
                                'Neúčasť bola nahlásená bez automatickej sankcie.',
                              )
                            }
                          >
                            <X size={18} />
                            Neprišiel
                          </button>
                        </>
                      ) : (
                        (b.riderStatus === 'boarded' || b.riderStatus === 'absent') && (
                          <button
                            className="btn btn-secondary rider-correct"
                            onClick={() =>
                              act(
                                {
                                  type: 'correctRider',
                                  id: b.id,
                                  status: b.riderStatus === 'boarded' ? 'absent' : 'boarded',
                                  now: new Date().toISOString(),
                                },
                                'Označenie a obsadenosť boli opravené.',
                              )
                            }
                          >
                            <Pencil size={17} />
                            Zmeniť označenie
                          </button>
                        )
                      )}
                    </div>
                  </article>
                ))}
                <h2>Vystupujúci</h2>
                {!alighting.length && <p>Na tejto zastávke nikto nevystupuje.</p>}
                {alighting.map((b) => (
                  <article className="navigation-rider" key={b.id}>
                    <div>
                      <strong>{formatPassengerCode(bookingPassengerCode(state, b))}</strong>
                      {b.personId &&
                        state.people.find((p) => p.id === b.personId)?.mobility !==
                          'Bez obmedzení' && (
                          <small>{state.people.find((p) => p.id === b.personId)?.mobility}</small>
                        )}
                      <span>
                        {b.seats} {b.seats === 1 ? 'miesto' : 'miesta'}
                      </span>
                      <small>
                        Nástup: {tripPlaceName(state, trip, b.from)} · Výstup:{' '}
                        {tripPlaceName(state, trip, b.to)}
                      </small>
                      <Badge status={b.riderStatus} />
                    </div>
                    {b.riderStatus === 'alighted' ? (
                      <button
                        className="btn btn-secondary rider-correct"
                        onClick={() =>
                          act(
                            {
                              type: 'correctRider',
                              id: b.id,
                              status: 'boarded',
                              now: new Date().toISOString(),
                            },
                            'Výstup bol opravený; cestujúci je opäť vo vozidle.',
                          )
                        }
                      >
                        <Pencil size={17} />
                        Zmeniť označenie
                      </button>
                    ) : (
                      <>
                        {' '}
                        <button
                          className="btn btn-secondary"
                          disabled={b.riderStatus !== 'boarded'}
                          onClick={() =>
                            act(
                              { type: 'rider', id: b.id, status: 'alighted' },
                              'Výstup bol zaznamenaný.',
                            )
                          }
                        >
                          <Check size={18} />
                          Vystúpil
                        </button>
                      </>
                    )}
                  </article>
                ))}
                {!ready && (
                  <Notice tone="warning">
                    Pred pokračovaním spracujte každého cestujúceho na tejto zastávke.
                  </Notice>
                )}
                <button
                  className="btn driver-stop-continue"
                  disabled={!ready}
                  onClick={() => event('navigationContinue')}
                >
                  {last ? 'Ukončiť jazdu' : 'Pokračovať v jazde'}
                </button>
                <p className="small muted">
                  Späť na prehľad nezruší ani neukončí jazdu. Priebeh je uložený v tomto
                  prehliadači.
                </p>
              </div>
            </section>
          )
        }
      />
      <header className="driver-navigation-top">
        <Link className="btn btn-secondary" to="/driver">
          <ArrowLeft size={18} />
          Späť na prehľad
        </Link>
        <div>
          <strong>Aktívna jazda</strong>
          <span>
            Linka {trip.line} · {trip.kind === 'fixed' ? 'Pravidelná' : 'Flexibilná'}
          </span>
        </div>
        <span>
          <UsersRound size={19} /> {occupied} / {vehicle?.capacity ?? 0}
        </span>
      </header>
      {storageWarning && (
        <p className="driver-navigation-error" role="alert">
          Stav sa nepodarilo uložiť do prehliadača. Pred obnovením stránky skontrolujte úložisko.
        </p>
      )}
      {toast?.error && (
        <p className="driver-navigation-error" role="alert">
          {toast.message}
        </p>
      )}
    </main>
  )
}
