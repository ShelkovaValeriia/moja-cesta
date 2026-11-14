import { Link, useParams } from 'react-router-dom'
import {
  ArrowRight,
  BusFront,
  Check,
  ChevronRight,
  Clock3,
  MapPin,
  Play,
  Square,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { useStore } from '../context'
import { activeBookings, tripPlaceName, canDrive } from '../domain'
import { dateLabel } from '../data'
import { Badge, Empty, Notice, PageTitle } from '../components/ui'
const privateName = (name: string) => {
  const parts = name.split(' ')
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : name
}
export function DriverPage() {
  const { state, act } = useStore(),
    driver = state.drivers.find((d) => d.id === state.activeDriverId),
    trips = state.trips
      .filter((t) => t.date === state.serviceDate && t.driverId === state.activeDriverId)
      .sort((a, b) => a.stops[0].time.localeCompare(b.stops[0].time)),
    active =
      trips.find((t) => t.status === 'active') ??
      trips.find((t) => t.status === 'scheduled' && activeBookings(state, t.id).length) ??
      trips.find((t) => t.status === 'scheduled')
  return (
    <div className="driver-page">
      <PageTitle
        eyebrow={`VODIČ · ${dateLabel(state.serviceDate, true)}`}
        title="Moje dnešné jazdy"
        description={`Dobrý deň, ${driver?.name.split(' ')[0] ?? 'vodič'}. Všetko pre vašu pokojnú cestu.`}
        action={
          <label className="field driver-demo-selector">
            <span>Vodič v ukážke</span>
            <select
              value={state.activeDriverId}
              onChange={(e) =>
                act({ type: 'selectDriver', id: e.target.value }, 'Prehľad vodiča bol zmenený.')
              }
            >
              {state.drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        }
      />
      {active && (
        <section className="driver-current">
          <div>
            <span className="eyebrow">
              {active.status === 'active' ? 'PRÁVE PREBIEHA' : 'VAŠA NAJBLIŽŠIA JAZDA'}
            </span>
            <h2>
              {tripPlaceName(state, active, active.stops[0].stopId)} <ArrowRight size={23} />{' '}
              {tripPlaceName(state, active, active.stops.at(-1)!.stopId)}
            </h2>
            <p>
              <Clock3 size={18} /> {active.stops[0].time} <span>·</span>{' '}
              {state.vehicles.find((v) => v.id === active.vehicleId)?.name} <span>·</span>{' '}
              {activeBookings(state, active.id).reduce((n, b) => n + b.seats, 0)} cestujúci
            </p>
          </div>
          <Link className="btn btn-light" to={`/driver/trips/${active.id}`}>
            Otvoriť jazdu <ArrowRight size={18} />
          </Link>
        </section>
      )}
      <div className="section-heading">
        <h2>Dnešný plán</h2>
        <span className="muted small">{trips.length} pridelených jázd</span>
      </div>
      <div className="driver-trip-list">
        {trips.filter((t) => t.id !== active?.id).length ? (
          trips
            .filter((t) => t.id !== active?.id)
            .map((t) => {
              const v = state.vehicles.find((v) => v.id === t.vehicleId)!
              return (
                <Link className="card driver-trip-item" to={`/driver/trips/${t.id}`} key={t.id}>
                  <div className="driver-departure">
                    <strong>{t.stops[0].time}</strong>
                    <small>{t.stops.at(-1)!.time}</small>
                  </div>
                  <div className="driver-trip-info">
                    <div className="trip-top">
                      <span className={`kind-tag ${t.kind}`}>
                        {t.kind === 'fixed' ? 'Pravidelný spoj' : 'Na požiadanie'} · {t.line}
                      </span>
                      <Badge status={t.status} />
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
                  <ChevronRight className="muted" size={21} />
                </Link>
              )
            })
        ) : (
          <Empty
            title={
              active ? 'Ďalšie jazdy zatiaľ nie sú naplánované' : 'Dnes nemáte naplánovanú jazdu'
            }
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
  const allProcessed = bookings.every(
    (b) => b.riderStatus === 'alighted' || b.riderStatus === 'absent',
  )
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
            <strong>
              {trip.status === 'completed'
                ? 'Cesta je dokončená'
                : tripPlaceName(state, trip, next.stopId)}
            </strong>
            <small>Plánovaný čas {next.time}</small>
          </span>
        </div>
      </div>
      <div className="trip-assignment-info">
        <span>
          Vodič: <strong>{assignedDriver?.name ?? 'Nepriradený'}</strong>
        </span>
        <span>
          Typ jazdy: <strong>{trip.kind === 'fixed' ? 'Pravidelná' : 'Flexibilná'}</strong>
        </span>
        <span>
          Požadované oprávnenie: <strong>{vehicle.requiredLicenseCategory ?? 'Neurčené'}</strong>
        </span>
      </div>
      {(!assignedDriver || !canDrive(assignedDriver, vehicle)) && (
        <Notice tone="warning">
          Priradenie vodiča a vozidla nie je kompatibilné. Jazdu musí upraviť dispečer.
        </Notice>
      )}
      <div className="driver-controls">
        {trip.status === 'scheduled' ? (
          <button
            className="btn"
            disabled={!assignedDriver || !canDrive(assignedDriver, vehicle)}
            onClick={() =>
              act(
                { type: 'tripStatus', id: trip.id, status: 'active' },
                'Jazda bola začatá. Teraz môžete zaznamenať nástup cestujúcich.',
              )
            }
          >
            <Play size={18} /> Začať jazdu
          </button>
        ) : trip.status === 'active' ? (
          <>
            <button
              className="btn"
              disabled={!allProcessed}
              onClick={() =>
                act(
                  { type: 'tripStatus', id: trip.id, status: 'completed' },
                  'Jazda bola ukončená. Ďakujeme za bezpečnú cestu.',
                )
              }
            >
              <Square size={17} /> Ukončiť jazdu
            </button>
            {!allProcessed && (
              <p className="muted small">
                Pred ukončením označte výstup alebo neprítomnosť každého cestujúceho.
              </p>
            )}
          </>
        ) : (
          <Notice tone="success">Jazda je dokončená. Všetky zmeny sú uložené.</Notice>
        )}
      </div>
      <section className="card driver-stops">
        <div className="inner-heading">
          <h2>Zastávky a cestujúci</h2>
          <p className="muted small">Údaje sa zdieľajú s cestujúcimi a dispečerom.</p>
        </div>
        {trip.stops.map((s, i) => {
          const boarding = bookings.filter((b) => b.from === s.stopId),
            alighting = bookings.filter((b) => b.to === s.stopId)
          return (
            <div className="driver-stop" key={s.stopId}>
              <div className="driver-stop-heading">
                <time>{s.time}</time>
                <span className="stop-number">{i + 1}</span>
                <h3>{tripPlaceName(state, trip, s.stopId)}</h3>
              </div>
              <div className="stop-passengers">
                {!boarding.length && !alighting.length && (
                  <p className="small muted">Na tejto zastávke nie sú rezervovaní cestujúci.</p>
                )}
                {boarding.map((b) => (
                  <div className="rider-row" key={b.id}>
                    <span className="rider-avatar">
                      <UserRound size={19} />
                    </span>
                    <div>
                      <strong>
                        {privateName(b.name)} {b.seats > 1 && `· ${b.seats} osoby`}
                      </strong>
                      <small>Nástup · výstup: {tripPlaceName(state, trip, b.to)}</small>
                      <Badge status={b.riderStatus} />
                    </div>
                    <div className="rider-actions">
                      <button
                        className="btn btn-small"
                        disabled={trip.status !== 'active' || b.riderStatus !== 'expected'}
                        onClick={() =>
                          act(
                            { type: 'rider', id: b.id, status: 'boarded' },
                            'Nástup cestujúceho bol zaznamenaný.',
                          )
                        }
                      >
                        <Check size={16} /> Nastúpil
                      </button>
                      <button
                        className="btn btn-small btn-secondary"
                        disabled={trip.status !== 'active' || b.riderStatus !== 'expected'}
                        onClick={() =>
                          act(
                            { type: 'rider', id: b.id, status: 'absent' },
                            'Neprítomnosť bola zaznamenaná.',
                          )
                        }
                      >
                        <X size={15} /> Neprišiel
                      </button>
                    </div>
                  </div>
                ))}
                {alighting.map((b) => (
                  <div className="rider-row alighting" key={`out-${b.id}`}>
                    <span className="rider-avatar">
                      <UserRound size={19} />
                    </span>
                    <div>
                      <strong>
                        {privateName(b.name)} {b.seats > 1 && `· ${b.seats} osoby`}
                      </strong>
                      <small>Výstup · nástup: {tripPlaceName(state, trip, b.from)}</small>
                      <Badge status={b.riderStatus} />
                    </div>
                    <button
                      className="btn btn-small btn-secondary"
                      disabled={trip.status !== 'active' || b.riderStatus !== 'boarded'}
                      onClick={() =>
                        act(
                          { type: 'rider', id: b.id, status: 'alighted' },
                          'Výstup cestujúceho bol zaznamenaný.',
                        )
                      }
                    >
                      <Check size={16} /> Vystúpil
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </section>
    </>
  )
}
