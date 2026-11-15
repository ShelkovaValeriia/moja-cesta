import { Link, useParams, Navigate } from 'react-router-dom'
import { BusFront, ChevronRight, Map, MapPin, Play, UsersRound } from 'lucide-react'
import { useStore } from '../context'
import { activeBookings, tripPlaceName, canDrive } from '../domain'
import { dateLabel } from '../data'
import { Badge, Empty, Notice, PageTitle } from '../components/ui'
export function DriverPage() {
  const { state } = useStore(),
    driver = state.drivers.find((d) => d.id === state.activeDriverId),
    trips = state.trips
      .filter((t) => t.date === state.serviceDate && t.driverId === state.activeDriverId)
      .sort((a, b) => a.stops[0].time.localeCompare(b.stops[0].time))
  const next = trips.find((t) => t.status === 'scheduled')
  return (
    <div className="driver-page">
      <PageTitle
        eyebrow={`VODIČ · ${dateLabel(state.serviceDate, true)}`}
        title="Moje dnešné jazdy"
        description={`Dobrý deň, ${driver?.name.split(' ')[0] ?? 'vodič'}. Všetko pre vašu pokojnú cestu.`}
      />
      <div className="section-heading">
        <h2>Dnešný plán</h2>
        <span className="muted small">{trips.length} pridelených jázd</span>
      </div>
      <div className="driver-trip-list">
        {trips.length ? (
          trips.map((t) => {
            const v = state.vehicles.find((v) => v.id === t.vehicleId)!
            return (
              <div className="card driver-trip-shell" key={t.id}>
                <Link
                  className={`driver-trip-item ${t.status === 'completed' ? 'driver-run-completed' : t.status === 'active' ? 'driver-run-active' : t.id === next?.id ? 'driver-run-next' : ''}`}
                  to={`/driver/trips/${t.id}`}
                  key={t.id}
                >
                  <div className="driver-departure">
                    <strong>{t.stops[0].time}</strong>
                    <small>{t.stops.at(-1)!.time}</small>
                  </div>
                  <div className="driver-trip-info">
                    <div className="trip-top">
                      <span className={`kind-tag ${t.kind}`}>
                        {t.kind === 'fixed' ? 'Pravidelný spoj' : 'Na požiadanie'} · {t.line}
                      </span>
                      <Badge status={t.status}>
                        {t.status === 'completed'
                          ? 'Ukončená'
                          : t.status === 'active'
                            ? 'Prebieha'
                            : 'Naplánovaná'}
                      </Badge>
                      {t.id === next?.id && (
                        <span className="driver-next-label">Nasledujúca jazda</span>
                      )}
                    </div>
                    <h3>
                      {tripPlaceName(state, t, t.stops[0].stopId)} →{' '}
                      {tripPlaceName(state, t, t.stops.at(-1)!.stopId)}
                    </h3>
                    <p>
                      {v.name} · {v.plate}
                    </p>
                    <span className="small muted">
                      <UsersRound size={15} />{' '}
                      {activeBookings(state, t.id).reduce((n, b) => n + b.seats, 0)} / {v.capacity}{' '}
                      rezervovaných miest
                    </span>
                  </div>
                  {t.status === 'active' ? (
                    <span className="btn btn-secondary driver-resume">Pokračovať v jazde</span>
                  ) : (
                    <ChevronRight className="muted" size={21} />
                  )}
                </Link>
                {t.status !== 'completed' && (
                  <div className="driver-route-action">
                    <Link
                      className="btn btn-secondary"
                      to={`/driver/map?tripId=${encodeURIComponent(t.id)}`}
                    >
                      <Map size={17} />
                      Zobraziť trasu
                    </Link>
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <Empty
            title="Dnes nemáte naplánovanú jazdu"
            text="Nové jazdy sa objavia po naplánovaní dispečerom."
          />
        )}
      </div>
    </div>
  )
}
export function DriverTrip() {
  const { id } = useParams(),
    { state, act } = useStore(),
    trip = id
      ? state.trips.find((t) => t.id === id && t.driverId === state.activeDriverId)
      : (state.trips.find((t) => t.status === 'active' && t.driverId === state.activeDriverId) ??
        state.trips.find(
          (t) =>
            t.date === state.serviceDate &&
            t.driverId === state.activeDriverId &&
            t.status === 'scheduled' &&
            activeBookings(state, t.id).length,
        ))
  if (!trip)
    return (
      <>
        <PageTitle title="Aktuálne nemáte žiadnu jazdu" back="/driver" />
        <Empty
          text="Pozrite si dnešný plán jázd."
          action={
            <Link className="btn" to="/driver">
              Dnešné jazdy
            </Link>
          }
        />
      </>
    )
  if (trip.status === 'active' || trip.status === 'completed')
    return <Navigate to={`/driver/navigation/${trip.id}`} replace />
  const assignedDriver = state.drivers.find((d) => d.id === trip.driverId)
  const bookings = activeBookings(state, trip.id),
    vehicle = state.vehicles.find((v) => v.id === trip.vehicleId)!,
    occupied = bookings.filter((b) => b.riderStatus === 'boarded').reduce((n, b) => n + b.seats, 0)
  const next =
    trip.stops.find((s) =>
      bookings.some(
        (b) =>
          (b.riderStatus === 'expected' && b.from === s.stopId) ||
          (b.riderStatus === 'boarded' && b.to === s.stopId),
      ),
    ) ?? trip.stops[0]
  return (
    <>
      <PageTitle
        eyebrow={`JAZDA ${trip.line} · ${dateLabel(trip.date)}`}
        title={`${tripPlaceName(state, trip, trip.stops[0].stopId)} → ${tripPlaceName(state, trip, trip.stops.at(-1)!.stopId)}`}
        back="/driver"
        action={<Badge status={trip.status} />}
      />
      <div className="driver-summary">
        <div>
          <BusFront />
          <span>
            Vozidlo<strong>{vehicle.name}</strong>
            <small>Evidenčné číslo: {vehicle.plate}</small>
            <small>Kapacita vozidla: {vehicle.capacity} cestujúcich</small>
          </span>
        </div>
        <div>
          <UsersRound />
          <span>
            Vo vozidle
            <strong>
              {occupied} / {vehicle.capacity} cestujúcich
            </strong>
            <small>{bookings.reduce((n, b) => n + b.seats, 0)} rezervovaných miest na trase</small>
          </span>
        </div>
        <div>
          <MapPin />
          <span>
            Nasledujúca zastávka
            <strong>{tripPlaceName(state, trip, next.stopId)}</strong>
            <small>Plánovaný čas {next.time}</small>
          </span>
        </div>
      </div>
      {(!assignedDriver || !canDrive(assignedDriver, vehicle)) && (
        <Notice tone="warning">
          Priradenie vodiča a vozidla nie je kompatibilné. Jazdu musí upraviť dispečer.
        </Notice>
      )}
      <div className="driver-controls">
        <button
          className="btn"
          disabled={!assignedDriver || !canDrive(assignedDriver, vehicle)}
          onClick={() =>
            act(
              { type: 'startNavigation', id: trip.id, now: new Date().toISOString() },
              'Jazda bola začatá.',
            )
          }
        >
          <Play size={18} />
          Začať jazdu
        </button>
      </div>
      <section className="card driver-stops">
        <div className="inner-heading">
          <h2>Zastávky a cestujúci</h2>
          <p className="muted small">Údaje sa zdieľajú s cestujúcimi a dispečerom.</p>
        </div>
        {trip.stops.map((s, i) => {
          const boarding = bookings
              .filter((b) => b.from === s.stopId)
              .reduce((n, b) => n + b.seats, 0),
            alighting = bookings.filter((b) => b.to === s.stopId).reduce((n, b) => n + b.seats, 0)
          return (
            <div className="driver-stop" key={s.stopId}>
              <div className="driver-stop-heading">
                <time>{s.time}</time>
                <span className="stop-number">{i + 1}</span>
                <h3>{tripPlaceName(state, trip, s.stopId)}</h3>
              </div>
              <div className="driver-stop-counts">
                <span>
                  Nastúpi: <strong>{boarding}</strong>{' '}
                  {boarding >= 1 && boarding <= 4 ? 'cestujúci' : 'cestujúcich'}
                </span>
                <span>
                  Vystúpi: <strong>{alighting}</strong>{' '}
                  {alighting >= 1 && alighting <= 4 ? 'cestujúci' : 'cestujúcich'}
                </span>
              </div>
            </div>
          )
        })}
      </section>
    </>
  )
}
