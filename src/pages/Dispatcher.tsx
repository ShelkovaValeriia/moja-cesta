import { DispatcherModal as Modal } from '../components/DispatcherModal'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  BusFront,
  Check,
  ChartNoAxesColumn,
  Clock3,
  ClipboardList,
  MapPin,
  Plus,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { useStore } from '../context'
import {
  activeBookings,
  findTrips,
  freeSeats,
  stopName,
  tripTime,
  villageName,
  tripPlaceName,
  noShowOutcome,
} from '../domain'
import { dateLabel, minute, uid } from '../data'
import { coordinates, hasCustomPlaces } from '../places'
import { preferenceLabels } from '../search'
import type { RideRequest, StopProposal, Trip } from '../types'
import { Badge, Empty, Notice, PageTitle } from '../components/ui'
import { AddDriverModal, AddVehicleModal } from '../components/DispatcherFleetForms'
import { SlovakDateInput } from '../components/SlovakDateInput'
import { DispatcherRouteStops } from '../components/DispatcherRouteStops'
import '../components/dispatcher.css'
import { requestRouteViews, tripRouteView } from '../dispatcherRoutes'
import { PublishFixedModal, TripAssignmentForm } from '../components/DispatcherScheduleForms'
import {
  DEMO_FLEX_MINUTES,
  DEMO_TURNAROUND_MINUTES,
  peakReservedSeats,
  previewFlexRequest,
} from '../dispatchPlanning'
function Kpis() {
  const { state } = useStore(),
    trips = state.trips.filter((t) => t.date === state.serviceDate),
    count = state.bookings
      .filter((b) => b.status === 'confirmed' && trips.some((t) => t.id === b.tripId))
      .reduce((n, b) => n + b.seats, 0),
    capacity = trips.reduce(
      (n, t) => n + (state.vehicles.find((v) => v.id === t.vehicleId)?.capacity ?? 0),
      0,
    ),
    peak = trips.reduce((sum, trip) => sum + peakReservedSeats(state, trip), 0)
  return (
    <div className="kpi-grid">
      {[
        [BusFront, 'Dnešné jazdy', trips.length, 'Pravidelné aj flexibilné'],
        [
          ClipboardList,
          'Nové požiadavky',
          state.requests.filter((r) => r.date === state.serviceDate && r.status === 'pending')
            .length,
          'Na dnešný deň',
        ],
        [
          Clock3,
          'Čakajúce požiadavky',
          state.requests.filter((r) => r.status === 'pending').length,
          'Všetky termíny',
        ],
        [UsersRound, 'Počet cestujúcich', count, 'Rezervácie na dnešné jazdy'],
        [
          ChartNoAxesColumn,
          'Vyťaženosť vozidiel',
          `${capacity ? Math.round((peak / capacity) * 100) : 0} %`,
          'Podľa najplnšieho úseku každej jazdy',
        ],
      ].map(([Icon, label, note, sub]) => {
        const I = Icon as typeof BusFront
        return (
          <div className="card kpi" key={String(label)}>
            <div>
              <span>{String(label)}</span>
              <I size={18} />
            </div>
            <strong>{String(note)}</strong>
            <small>{String(sub)}</small>
          </div>
        )
      })}
    </div>
  )
}
function RequestTable({
  requests,
  decide,
}: {
  requests: RideRequest[]
  decide: (r: RideRequest, approve: boolean) => void
}) {
  const { state } = useStore()
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Trasa</th>
            <th>Dátum a čas</th>
            <th>Záujem</th>
            <th>Stav</th>
            <th className="align-right">Akcie</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} className="dispatch-request-row">
              <td>
                <Link
                  className="dispatch-request-route"
                  to={`/dispatcher/requests/${encodeURIComponent(r.id)}/route`}
                >
                  <strong>{r.fromPlace?.name ?? villageName(state, r.from)}</strong>
                  <span className="table-secondary">
                    → {r.toPlace?.name ?? villageName(state, r.to)}
                    {r.returnDate ? ' · spiatočná' : ''}
                  </span>
                </Link>
              </td>
              <td>
                {dateLabel(r.date)}
                <span className="table-secondary">
                  {r.timeMode === 'arrival' ? 'Príchod do' : 'Odchod'} {r.time}
                </span>
              </td>
              <td>
                <span className="people-count">
                  <UsersRound size={16} />
                  {r.passengers}
                </span>
              </td>
              <td>
                <Badge status={r.status} />
              </td>
              <td>
                <div className="table-actions">
                  {r.status === 'pending' ? (
                    <>
                      <button
                        className="table-icon approve"
                        title="Schváliť požiadavku"
                        aria-label={`Schváliť požiadavku ${r.id}`}
                        onClick={() => decide(r, true)}
                      >
                        <Check size={20} />
                      </button>
                      <button
                        className="table-icon reject"
                        title="Zamietnuť požiadavku"
                        aria-label={`Zamietnuť požiadavku ${r.id}`}
                        onClick={() => decide(r, false)}
                      >
                        <X size={20} />
                      </button>
                    </>
                  ) : (
                    <button className="text-link" onClick={() => decide(r, true)}>
                      Detail <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!requests.length && (
        <Empty
          title="Žiadne požiadavky"
          text="Pre zvolený filter zatiaľ nie sú dostupné žiadne údaje."
        />
      )}
    </div>
  )
}
function RequestDecision({
  request: r,
  approve,
  onClose,
}: {
  request: RideRequest
  approve: boolean
  onClose: () => void
}) {
  const { state, act } = useStore(),
    [reason, setReason] = useState(''),
    [approvePlaces, setApprovePlaces] = useState(false)
  const plan = approve && r.status === 'pending' ? previewFlexRequest(state, r) : null
  const alternatives =
    plan && !plan.ok && !hasCustomPlaces(r) && !r.returnDate
      ? findTrips(state, r.from, r.to, r.date, r.time, r.timeMode)
          .filter(
            (trip) =>
              trip.status === 'scheduled' && freeSeats(state, trip, r.from, r.to) >= r.passengers,
          )
          .slice(0, 3)
      : []
  return (
    <Modal
      title={
        r.status !== 'pending'
          ? 'Detail požiadavky'
          : approve
            ? 'Naplánovať flexibilnú jazdu'
            : 'Zamietnuť požiadavku'
      }
      onClose={onClose}
      actionErrors
    >
      <div className="stack">
        <Badge status={r.status} />
        <h3>
          {r.fromPlace?.name ?? stopName(state, r.from)} →{' '}
          {r.toPlace?.name ?? stopName(state, r.to)}
        </h3>
        <p>
          {dateLabel(r.date)} · {r.timeMode === 'arrival' ? 'Príchod do' : 'Odchod'} {r.time} ·{' '}
          {r.passengers} cestujúci
        </p>
        {r.returnDate && (
          <Notice>
            Spiatočná cesta: {dateLabel(r.returnDate)} ·{' '}
            {r.returnTimeMode === 'arrival' ? 'Príchod do' : 'Odchod'} {r.returnTime}. Obe strany sa
            plánujú naraz.
          </Notice>
        )}
        {hasCustomPlaces(r) && (
          <Notice tone={r.placesStatus === 'approved' ? 'success' : 'warning'}>
            <strong>
              {r.placesStatus === 'approved'
                ? 'Schválené vlastné miesta'
                : 'Navrhované vlastné miesta'}
            </strong>
            {r.fromPlace?.type === 'custom' && (
              <p>
                Nástup: {r.fromPlace.name} · {coordinates(r.fromPlace)}
              </p>
            )}
            {r.toPlace?.type === 'custom' && (
              <p>
                Výstup: {r.toPlace.name} · {coordinates(r.toPlace)}
              </p>
            )}
          </Notice>
        )}
        {r.accessibility && <p>Požiadavky na dostupnosť: {r.accessibility}</p>}
        {r.status === 'pending' ? (
          approve ? (
            <>
              <p className="small muted">
                Demo výpočet používa {DEMO_FLEX_MINUTES} minút na jazdu a {DEMO_TURNAROUND_MINUTES}{' '}
                minút na prípravu medzi jazdami. Čas presunu vychádza zo vzdialenosti vzdušnou
                čiarou.
              </p>
              {plan?.ok ? (
                <section className="stack" aria-label="Návrh flexibilnej jazdy">
                  <h3>Návrh jazdy</h3>
                  <p>
                    {plan.requestIds.length} požiadavky · {plan.seats} miest na rezerváciu
                  </p>
                  {plan.trips.map((trip, i) => (
                    <div className="assigned-trip" key={trip.id}>
                      <strong>
                        {i === 0 ? 'Cesta tam' : 'Cesta späť'} · {dateLabel(trip.date)} ·{' '}
                        {trip.stops[0].time} – {trip.stops.at(-1)!.time}
                      </strong>
                      <p>
                        {state.vehicles.find((v) => v.id === trip.vehicleId)?.name} ·{' '}
                        {state.drivers.find((d) => d.id === trip.driverId)?.name}
                      </p>
                    </div>
                  ))}
                  {!!plan.waiting && (
                    <Notice>
                      Počet súvisiacich požiadaviek, ktoré zostanú čakať: {plan.waiting}.
                    </Notice>
                  )}
                </section>
              ) : (
                plan && <Notice tone="warning">{plan.reason}</Notice>
              )}
              {alternatives.length > 0 && (
                <section className="stack">
                  <h3>Pravidelné spoje s voľnými miestami</h3>
                  <ul>
                    {alternatives.map((t) => (
                      <li key={t.id}>
                        {t.line} · {tripTime(t, r.from)} – {tripTime(t, r.to)} ·{' '}
                        {freeSeats(state, t, r.from, r.to)} voľných miest
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {hasCustomPlaces(r) && (
                <label className="approve-place-checkbox">
                  <input
                    type="checkbox"
                    checked={approvePlaces}
                    onChange={(e) => setApprovePlaces(e.target.checked)}
                  />
                  Schvaľujem navrhované miesta nástupu a výstupu pre túto jazdu.
                </label>
              )}
              <button
                className="btn"
                disabled={!plan?.ok || (hasCustomPlaces(r) && !approvePlaces)}
                onClick={() => {
                  if (
                    act(
                      { type: 'decideRequest', id: r.id, approve: true, approvePlaces },
                      'Požiadavka bola schválená a jazda naplánovaná. Súvisiace rezervácie sú vytvorené.',
                    )
                  )
                    onClose()
                }}
              >
                <Check size={17} />
                Schváliť a naplánovať
              </button>
            </>
          ) : (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault()
                if (
                  act(
                    { type: 'decideRequest', id: r.id, approve: false, reason },
                    'Požiadavka bola zamietnutá. Cestujúci vidí dôvod.',
                  )
                )
                  onClose()
              }}
            >
              <label className="field">
                <span>Dôvod zamietnutia</span>
                <textarea
                  required
                  minLength={5}
                  maxLength={300}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Napríklad: V tomto čase nie je dostupné vozidlo."
                />
              </label>
              <button className="btn btn-danger" type="submit">
                Zamietnuť požiadavku
              </button>
            </form>
          )
        ) : (
          <>
            {r.reason && <Notice tone="warning">{r.reason}</Notice>}
            {r.tripId && (
              <p className="muted">
                Priradená jazda: {state.trips.find((t) => t.id === r.tripId)?.line} ·{' '}
                {
                  state.vehicles.find(
                    (v) => v.id === state.trips.find((t) => t.id === r.tripId)?.vehicleId,
                  )?.name
                }
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
export function DispatcherOverview() {
  const { state } = useStore(),
    [decision, setDecision] = useState<{ id: string; approve: boolean } | null>(null),
    request = state.requests.find((r) => r.id === decision?.id),
    requests = state.requests
      .filter((r) => r.status === 'pending')
      .sort((a, b) => b.passengers - a.passengers)
      .slice(0, 4),
    trips = state.trips
      .filter((t) => t.date === state.serviceDate)
      .sort((a, b) => a.stops[0].time.localeCompare(b.stops[0].time))
  return (
    <>
      <PageTitle
        eyebrow={dateLabel(state.serviceDate, true)}
        title="Prehľad dopravy"
        action={
          <span className="operational">
            <span />
            Demonštračná prevádzka
          </span>
        }
      />
      <Kpis />
      <section className="card chart-card stack spaced">
        <h2>Na spracovanie</h2>
        <Link className="text-link" to="/dispatcher/support">
          Neposúdená neprítomnosť ·{' '}
          {state.bookings.filter((b) => b.riderStatus === 'absent' && !noShowOutcome(b)).length}
        </Link>
      </section>
      <div className="section-heading section-spaced">
        <h2>Požiadavky na spracovanie</h2>
        <Link className="text-link" to="/dispatcher/requests">
          Všetky požiadavky <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="card table-card">
        <RequestTable
          requests={requests}
          decide={(r, approve) => setDecision({ id: r.id, approve })}
        />
      </div>
      <div className="dispatcher-lower">
        <section className="card schedule-card">
          <div className="section-heading">
            <h2>Dnešný cestovný poriadok</h2>
            <BusFront size={20} />
          </div>
          {trips.map((t) => (
            <Link
              className="schedule-row dispatch-schedule-link"
              key={t.id}
              to={tripDetailsPath(t)}
            >
              <time>{t.stops[0].time}</time>
              <span className={`schedule-dot ${t.kind}`} />
              <div>
                <strong>
                  {tripPlaceName(state, t, t.stops[0].stopId)} →{' '}
                  {tripPlaceName(state, t, t.stops.at(-1)!.stopId)}
                </strong>
                <small>
                  {t.kind === 'fixed' ? 'Pravidelný spoj' : 'Flexibilná jazda'} {t.line} ·{' '}
                  {state.vehicles.find((v) => v.id === t.vehicleId)?.plate}
                </small>
              </div>
              <Badge status={t.status} />
            </Link>
          ))}
        </section>
        <section className="card fleet-summary">
          <div className="section-heading">
            <h2>Naše vozidlá</h2>
            <Link aria-label="Všetky vozidlá" to="/dispatcher/vehicles" className="icon-button">
              <ArrowUpRight size={20} />
            </Link>
          </div>
          {state.vehicles.slice(0, 2).map((v) => (
            <div className="fleet-mini" key={v.id}>
              <span className="icon-tile">
                <BusFront />
              </span>
              <h3>{v.name}</h3>
              <p className="muted">
                {v.plate} · {v.capacity} miest
              </p>
              <Badge
                status={
                  state.trips.some((t) => t.vehicleId === v.id && t.status === 'active')
                    ? 'active'
                    : 'confirmed'
                }
              >
                {state.trips.some((t) => t.vehicleId === v.id && t.status === 'active')
                  ? 'Na trase'
                  : 'Pripravené na jazdu'}
              </Badge>
            </div>
          ))}
          {state.vehicles.length > 2 && (
            <Link className="fleet-more" to="/dispatcher/vehicles">
              +{state.vehicles.length - 2} ďalších vozidiel <ArrowRight size={16} />
            </Link>
          )}
        </section>
      </div>
      {decision && request && (
        <RequestDecision
          request={request}
          approve={decision.approve}
          onClose={() => setDecision(null)}
        />
      )}
    </>
  )
}
export function DispatcherRequests() {
  const [filters, setFilters] = useSearchParams()
  const requestedStatus = filters.get('status')
  const status =
    requestedStatus && ['pending', 'approved', 'rejected', 'cancelled'].includes(requestedStatus)
      ? requestedStatus
      : 'all'
  const sort = filters.get('sort') === 'date' ? 'date' : 'interest'
  function setFilter(key: 'status' | 'sort', value: string) {
    const next = new URLSearchParams(filters)
    if (value === 'all' || value === 'interest') next.delete(key)
    else next.set(key, value)
    setFilters(next, { replace: true })
  }
  const { state } = useStore(),
    [decision, setDecision] = useState<{ id: string; approve: boolean } | null>(null),
    request = state.requests.find((r) => r.id === decision?.id),
    requests = state.requests
      .filter((r) => status === 'all' || r.status === status)
      .sort((a, b) =>
        sort === 'interest'
          ? b.passengers - a.passengers
          : `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
      )
  return (
    <>
      <PageTitle title="Požiadavky" />
      <div className="list-toolbar">
        <div className="segmented">
          <button
            className={status === 'all' ? 'selected' : ''}
            onClick={() => setFilter('status', 'all')}
          >
            Všetky
          </button>
          <button
            className={status === 'pending' ? 'selected' : ''}
            onClick={() => setFilter('status', 'pending')}
          >
            Čakajúce
          </button>
          <button
            className={status === 'approved' ? 'selected' : ''}
            onClick={() => setFilter('status', 'approved')}
          >
            Schválené
          </button>
          <button
            className={status === 'rejected' ? 'selected' : ''}
            onClick={() => setFilter('status', 'rejected')}
          >
            Zamietnuté
          </button>
          <button
            className={status === 'cancelled' ? 'selected' : ''}
            onClick={() => setFilter('status', 'cancelled')}
          >
            Zrušené
          </button>
        </div>
        <label className="sort-label">
          Zoradiť
          <select
            aria-label="Zoradenie požiadaviek"
            value={sort}
            onChange={(e) => setFilter('sort', e.target.value)}
          >
            <option value="interest">Najväčší záujem</option>
            <option value="date">Dátum a čas</option>
          </select>
        </label>
      </div>
      <div className="card table-card">
        <RequestTable
          requests={requests}
          decide={(r, approve) => setDecision({ id: r.id, approve })}
        />
      </div>
      {decision && request && (
        <RequestDecision
          request={request}
          approve={decision.approve}
          onClose={() => setDecision(null)}
        />
      )}
    </>
  )
}
export function DispatcherRequestRoute() {
  const { id } = useParams()
  const { state } = useStore()
  const [decision, setDecision] = useState<{ id: string; approve: boolean } | null>(null)
  const request = state.requests.find((r) => r.id === id)
  if (!request) {
    return (
      <>
        <PageTitle title="Požiadavka sa nenašla" back="/dispatcher/requests" />
        <Empty title="Trasa nie je dostupná" text="Vyberte požiadavku zo zoznamu." />
      </>
    )
  }

  const plan = request.status === 'pending' ? previewFlexRequest(state, request) : null
  const views = requestRouteViews(state, request, plan?.ok ? plan.trips : undefined)
  const from = request.fromPlace?.name ?? stopName(state, request.from)
  const to = request.toPlace?.name ?? stopName(state, request.to)
  return (
    <>
      <PageTitle
        title={`${from} → ${to}`}
        back="/dispatcher/requests"
        action={<Badge status={request.status} />}
      />
      <section className="card chart-card stack dispatch-route-detail">
        <div className="dispatch-route-header">
          <div>
            <h2>Itinerár</h2>
            <p className="dispatch-route-group muted">
              <UsersRound size={16} aria-hidden="true" />
              {request.passengers} cest. ·{' '}
              {views.length > 1 ? 'Spiatočná cesta' : 'Jednosmerná cesta'}
            </p>
          </div>
        </div>
        {request.accessibility && (
          <p>
            <strong>Požiadavky na dostupnosť</strong> · {request.accessibility}
          </p>
        )}
        {request.reason && <Notice tone="warning">{request.reason}</Notice>}
        {plan && !plan.ok && <Notice tone="warning">{plan.reason}</Notice>}
        <div className="stack dispatch-route-legs">
          {views.map((view, index) => {
            const time = index === 0 ? request.time : request.returnTime
            const mode = index === 0 ? request.timeMode : request.returnTimeMode
            const preference = index === 0 ? request.timePreference : request.returnTimePreference
            const trip = view.trip
            const vehicle = state.vehicles.find((v) => v.id === trip?.vehicleId)
            const driver = state.drivers.find((d) => d.id === trip?.driverId)
            return (
              <section key={index} className="dispatch-route-leg stack" aria-label={view.label}>
                <div className="dispatch-route-leg-header">
                  <h3>{view.label}</h3>
                  <span className="small muted">
                    {trip
                      ? request.status === 'pending'
                        ? 'Predbežný plán jazdy'
                        : `Spoj ${trip.line}`
                      : 'Zadaný nástup a výstup'}
                  </span>
                </div>
                {(time || vehicle || driver) && (
                  <div className="driver-summary dispatch-route-summary">
                    {time && (
                      <div>
                        <Clock3 aria-hidden="true" />
                        <span>
                          {mode === 'arrival' ? 'Požadovaný príchod do' : 'Požadovaný odchod'}
                          <strong>
                            <time>{time}</time>
                          </strong>
                          {preference && preference !== 'none' && (
                            <small>{preferenceLabels[preference]}</small>
                          )}
                        </span>
                      </div>
                    )}
                    {vehicle && (
                      <div>
                        <BusFront aria-hidden="true" />
                        <span>
                          Vozidlo<strong>{vehicle.name}</strong>
                          <small>
                            {vehicle.plate} · {vehicle.capacity} miest
                          </small>
                        </span>
                      </div>
                    )}
                    {driver && (
                      <div>
                        <UserRound aria-hidden="true" />
                        <span>
                          Vodič<strong>{driver.name}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <DispatcherRouteStops points={view.points} />
              </section>
            )
          })}
        </div>
        {request.status === 'pending' && (
          <div className="dispatch-route-decisions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setDecision({ id: request.id, approve: false })}
            >
              <X size={18} aria-hidden="true" /> Zamietnuť požiadavku
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setDecision({ id: request.id, approve: true })}
            >
              <Check size={18} aria-hidden="true" /> Schváliť požiadavku
            </button>
          </div>
        )}
      </section>
      {decision?.id === request.id && (
        <RequestDecision
          request={request}
          approve={decision.approve}
          onClose={() => setDecision(null)}
        />
      )}
    </>
  )
}
function tripDetailsPath(trip: Trip) {
  return `/dispatcher/${trip.kind}/${encodeURIComponent(trip.id)}`
}

export function DispatcherTripRoute({ kind }: { kind: Trip['kind'] }) {
  const { id } = useParams()
  const { state } = useStore()
  const trip = state.trips.find((t) => t.id === id && t.kind === kind)
  const back = kind === 'fixed' ? '/dispatcher/fixed' : '/dispatcher/schedule'
  if (!trip)
    return (
      <>
        <PageTitle title="Jazda sa nenašla" back={back} />
        <Empty title="Trasa nie je dostupná" text="Vyberte jazdu z cestovného poriadku." />
      </>
    )
  return <TripRouteDetail key={trip.id} trip={trip} back={back} />
}

function TripRouteDetail({ trip, back }: { trip: Trip; back: string }) {
  const { state } = useStore()
  const [editing, setEditing] = useState(false)
  const vehicle = state.vehicles.find((v) => v.id === trip.vehicleId)
  const driver = state.drivers.find((d) => d.id === trip.driverId)
  const view = tripRouteView(state, trip)
  const bookings = activeBookings(state, trip.id)
  const requests = state.requests.filter((r) => trip.requestIds.includes(r.id))
  return (
    <>
      <PageTitle
        eyebrow={`${trip.kind === 'fixed' ? 'Spoj' : 'Flex jazda'} ${trip.line} · ${dateLabel(trip.date)}`}
        title={`${view.points[0].name} → ${view.points.at(-1)!.name}`}
        back={back}
        action={<Badge status={trip.status} />}
      />
      <section className="card chart-card stack dispatch-route-detail">
        <div className="dispatch-route-header">
          <h2>Itinerár</h2>
        </div>
        <div className="driver-summary dispatch-route-summary">
          <div>
            <BusFront aria-hidden="true" />
            <span>
              Vozidlo<strong>{vehicle?.name ?? 'Nepriradené'}</strong>
              {vehicle && (
                <small>
                  {vehicle.plate} · {vehicle.capacity} miest
                </small>
              )}
            </span>
          </div>
          <div>
            <UserRound aria-hidden="true" />
            <span>
              Vodič<strong>{driver?.name ?? 'Nepriradený'}</strong>
              {vehicle?.requiredLicenseCategory && (
                <small>Požadované oprávnenie {vehicle.requiredLicenseCategory}</small>
              )}
            </span>
          </div>
          <div>
            <UsersRound aria-hidden="true" />
            <span>
              Voľné miesta na celej trase
              <strong>
                {freeSeats(state, trip)} / {vehicle?.capacity ?? 0}
              </strong>
              <small>
                {bookings.reduce((sum, booking) => sum + booking.seats, 0)} rezervovaných miest na
                trase
              </small>
            </span>
          </div>
        </div>
        <div className="dispatch-route-leg">
          <DispatcherRouteStops points={view.points} />
        </div>
        {trip.status === 'scheduled' && trip.date >= state.serviceDate && (
          <div className="dispatch-route-decisions">
            <button className="btn btn-secondary" type="button" onClick={() => setEditing(true)}>
              Zmeniť vozidlo alebo vodiča
            </button>
          </div>
        )}
      </section>
      {requests.length > 0 && (
        <section className="card chart-card stack spaced">
          <h2>Spojené požiadavky</h2>
          <ul className="stack">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  className="text-link"
                  to={`/dispatcher/requests/${encodeURIComponent(r.id)}/route`}
                >
                  {r.fromPlace?.name ?? villageName(state, r.from)} →{' '}
                  {r.toPlace?.name ?? villageName(state, r.to)}
                  {' · '}
                  {r.passengers} cest. <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {editing && (
        <Modal title="Priradenie jazdy" onClose={() => setEditing(false)} actionErrors>
          <TripAssignmentForm trip={trip} onDone={() => setEditing(false)} />
        </Modal>
      )}
    </>
  )
}
export function DispatcherTrips({ kind }: { kind: 'fixed' | 'flex' | 'all' }) {
  const [filters, setFilters] = useSearchParams()
  const { state } = useStore(),
    date = filters.get('date') ?? state.serviceDate,
    [publishing, setPublishing] = useState(false),
    trips = state.trips
      .filter((t) => (kind === 'all' || t.kind === kind) && t.date === date)
      .sort((a, b) => a.stops[0].time.localeCompare(b.stops[0].time))
  function setDate(value: string) {
    setFilters(value === state.serviceDate ? {} : { date: value }, { replace: true })
  }
  return (
    <>
      <PageTitle
        title={kind === 'fixed' ? 'Pravidelné spoje' : 'Rozvrh jázd'}
        action={
          <div className="schedule-date">
            <SlovakDateInput label="Dátum prevádzky" value={date} onChange={setDate} />
          </div>
        }
      />
      {kind === 'fixed' && (
        <button className="btn btn-secondary" onClick={() => setPublishing(true)}>
          <Plus size={17} /> Zverejniť pravidelný spoj
        </button>
      )}
      <div className="card table-card spaced">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Spoj a trasa</th>
                <th>Odchod / príchod</th>
                <th>Vozidlo a vodič</th>
                <th>Voľné miesta</th>
                <th>Stav</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id} className="dispatch-request-row">
                  <td>
                    <Link
                      className="dispatch-request-route"
                      to={tripDetailsPath(t)}
                      aria-label={`Detail spoja ${t.line} o ${t.stops[0].time}`}
                    >
                      <strong>
                        {t.line} · {tripPlaceName(state, t, t.stops[0].stopId)}
                      </strong>
                      <span className="table-secondary">
                        {t.kind === 'fixed' ? 'Pravidelný spoj' : 'Schválená Flex jazda'}
                      </span>
                      <span className="table-secondary">
                        → {tripPlaceName(state, t, t.stops.at(-1)!.stopId)}
                        {t.kind === 'flex' ? ` · ${t.requestIds.length} požiadavky` : ''}
                      </span>
                    </Link>
                  </td>
                  <td>
                    <strong>{t.stops[0].time}</strong>
                    <span className="table-secondary">{t.stops.at(-1)!.time}</span>
                  </td>
                  <td>
                    {state.vehicles.find((v) => v.id === t.vehicleId)?.name}
                    <span className="table-secondary">
                      {state.vehicles.find((v) => v.id === t.vehicleId)?.plate}
                    </span>
                    <span className="table-secondary">
                      {state.drivers.find((d) => d.id === t.driverId)?.name ?? 'Vodič nepriradený'}
                    </span>
                  </td>
                  <td>
                    {freeSeats(state, t)} /{' '}
                    {state.vehicles.find((v) => v.id === t.vehicleId)?.capacity}
                  </td>
                  <td>
                    <Badge status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!trips.length && (
          <Empty
            title="Na tento deň nie sú naplánované spoje"
            text="Vyberte iný dátum. Flex jazdy pribúdajú po spracovaní požiadaviek."
          />
        )}
      </div>
      {kind !== 'fixed' && (
        <>
          <Notice>
            Ďalšiu flexibilnú jazdu vytvoríte schválením požiadavky.{' '}
            <Link to="/dispatcher/requests" className="text-link">
              Prejsť na požiadavky <ArrowRight size={15} />
            </Link>
          </Notice>
          {date && (
            <details className="card chart-card spaced">
              <summary>Voľné okná vozidiel</summary>
              <VehicleWindows date={date} />
            </details>
          )}
        </>
      )}
      {kind === 'fixed' && publishing && (
        <PublishFixedModal
          date={date}
          onClose={() => setPublishing(false)}
          onPublish={(publishedDate) => {
            setDate(publishedDate)
            setPublishing(false)
          }}
        />
      )}
    </>
  )
}
function VehicleWindows({ date }: { date: string }) {
  const { state } = useStore()
  return (
    <section className="card chart-card stack spaced">
      <h2>Medzery v pláne vozidiel</h2>
      <p className="small muted">
        Medzery medzi pridelenými jazdami. Návrh Flex jazdy zohľadní aj čas presunu, odstup a
        dostupnosť vodiča.
      </p>
      {state.vehicles.map((vehicle) => {
        const trips = state.trips
          .filter((t) => t.date === date && t.vehicleId === vehicle.id)
          .sort((a, b) => a.stops[0].time.localeCompare(b.stops[0].time))
        let cursor = '00:00'
        const windows: string[] = []
        for (const trip of trips) {
          const start = trip.stops[0].time,
            end = trip.stops.at(-1)!.time
          if (cursor < start) windows.push(`${cursor} – ${start}`)
          if (cursor < end) cursor = end
        }
        if (cursor < '23:59') windows.push(`${cursor} – koniec dňa`)
        return (
          <div key={vehicle.id} className="assigned-trip">
            <strong>{vehicle.name}</strong>
            <p>{windows.join(' · ')}</p>
          </div>
        )
      })}
    </section>
  )
}
export function DispatcherVehicles() {
  const { state, act } = useStore(),
    [vehicleId, setVehicleId] = useState<string | null>(null),
    [adding, setAdding] = useState<'vehicle' | 'driver' | null>(null),
    [editing, setEditing] = useState<{ kind: 'vehicle' | 'driver'; id: string } | null>(null),
    [removing, setRemoving] = useState<{ kind: 'vehicle' | 'driver'; id: string } | null>(null)
  const assignedTrips = state.trips.filter(
    (t) => t.vehicleId === vehicleId && t.date === state.serviceDate,
  )
  return (
    <>
      <PageTitle
        title="Vozidlá"
        action={
          <div className="dispatch-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setAdding('vehicle')}
            >
              <Plus size={17} /> Pridať vozidlo
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setAdding('driver')}>
              <Plus size={17} /> Pridať vodiča
            </button>
          </div>
        }
      />
      <div className="vehicles-grid">
        {state.vehicles.map((v) => {
          const trips = state.trips.filter(
              (t) => t.vehicleId === v.id && t.date === state.serviceDate,
            ),
            active = trips.some((t) => t.status === 'active')
          return (
            <article key={v.id} className="card vehicle-card">
              <div className="vehicle-illustration">
                <BusFront size={92} strokeWidth={1.2} />
                <span>{v.plate}</span>
              </div>
              <div className="vehicle-content">
                <div className="section-heading">
                  <h2>{v.name}</h2>
                  <Badge status={active ? 'active' : 'confirmed'}>
                    {active ? 'Na trase' : 'Pripravené'}
                  </Badge>
                </div>
                <p className="muted">
                  {v.plate} · Skupina {v.requiredLicenseCategory ?? 'neurčená'}
                </p>
                <div className="vehicle-facts">
                  <div>
                    <UsersRound size={19} />
                    <strong>{v.capacity}</strong>
                    <span>miest pre cestujúcich</span>
                  </div>
                  <div>
                    <BusFront size={19} />
                    <strong>{trips.length}</strong>
                    <span>dnešných jázd</span>
                  </div>
                </div>
                <button className="btn btn-secondary btn-wide" onClick={() => setVehicleId(v.id)}>
                  Zobraziť pridelené jazdy <ArrowRight size={16} />
                </button>
                <button
                  className="btn btn-secondary btn-wide"
                  type="button"
                  onClick={() => setEditing({ kind: 'vehicle', id: v.id })}
                >
                  Upraviť vozidlo
                </button>
                <button
                  className="text-link fleet-remove"
                  type="button"
                  onClick={() => setRemoving({ kind: 'vehicle', id: v.id })}
                >
                  Odstrániť vozidlo
                </button>
              </div>
            </article>
          )
        })}
      </div>
      <section className="card chart-card stack spaced">
        <h2>Vodiči</h2>
        {state.drivers.map((driver) => (
          <div className="assigned-trip" key={driver.id}>
            <strong>{driver.name}</strong>
            <p>Skupiny oprávnenia: {driver.licenseCategories.join(', ') || 'Neurčené'}</p>
            <p>
              {
                state.trips.filter((t) => t.date === state.serviceDate && t.driverId === driver.id)
                  .length
              }{' '}
              pridelených jázd na {dateLabel(state.serviceDate)}
            </p>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setEditing({ kind: 'driver', id: driver.id })}
            >
              Upraviť vodiča
            </button>
            <button
              className="text-link fleet-remove"
              type="button"
              onClick={() => setRemoving({ kind: 'driver', id: driver.id })}
            >
              Odstrániť vodiča
            </button>
          </div>
        ))}
      </section>
      {vehicleId && (
        <Modal title="Pridelené jazdy vozidla" onClose={() => setVehicleId(null)}>
          <div className="stack">
            {!assignedTrips.length && <p>Vozidlo dnes nemá pridelené jazdy.</p>}
            {assignedTrips.map((t) => (
              <Link className="assigned-trip" key={t.id} to={tripDetailsPath(t)}>
                <strong>
                  {t.stops[0].time} – {t.stops.at(-1)!.time}
                </strong>
                <p>
                  {tripPlaceName(state, t, t.stops[0].stopId)} →{' '}
                  {tripPlaceName(state, t, t.stops.at(-1)!.stopId)}
                </p>
                <Badge status={t.status} />
              </Link>
            ))}
          </div>
        </Modal>
      )}
      {adding === 'vehicle' && <AddVehicleModal onClose={() => setAdding(null)} />}
      {adding === 'driver' && <AddDriverModal onClose={() => setAdding(null)} />}
      {editing?.kind === 'vehicle' && (
        <AddVehicleModal
          vehicle={state.vehicles.find((v) => v.id === editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'driver' && (
        <AddDriverModal
          driver={state.drivers.find((d) => d.id === editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <Modal
          title={removing.kind === 'vehicle' ? 'Odstrániť vozidlo' : 'Odstrániť vodiča'}
          onClose={() => setRemoving(null)}
          actionErrors
        >
          <div className="stack">
            <p>
              Odstrániť{' '}
              {removing.kind === 'vehicle'
                ? state.vehicles.find((v) => v.id === removing.id)?.name
                : state.drivers.find((d) => d.id === removing.id)?.name}{' '}
              z demo evidencie?
            </p>
            <p className="muted">Položku možno odstrániť až po preradení všetkých jej jázd.</p>
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => {
                if (
                  act(
                    {
                      type: removing.kind === 'vehicle' ? 'removeVehicle' : 'removeDriver',
                      id: removing.id,
                    },
                    'Položka bola odstránená.',
                  )
                )
                  setRemoving(null)
              }}
            >
              Odstrániť
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
export function DispatcherStops() {
  const { state, act } = useStore(),
    [reject, setReject] = useState<StopProposal | null>(null),
    [review, setReview] = useState<StopProposal | null>(null),
    [reason, setReason] = useState(''),
    [show, setShow] = useState(false)
  return (
    <>
      <PageTitle
        title="Zastávky"
        action={
          <div className="dispatch-actions">
            <button className="btn btn-secondary" onClick={() => setShow(true)}>
              <Plus size={17} />
              Navrhnúť zastávku
            </button>
          </div>
        }
      />
      <div className="stops-grid">
        {state.stops.map((s) => (
          <div className="card stop-card" key={s.id}>
            <span className="icon-tile">
              <MapPin />
            </span>
            <div>
              <h3>{s.name}</h3>
              <p className="muted small">{s.village}</p>
            </div>
            <Badge status="confirmed">Aktívna</Badge>
          </div>
        ))}
      </div>
      <div className="section-heading section-spaced">
        <h2>Návrhy nových zastávok</h2>
        <span className="count">
          {state.proposals.filter((p) => p.status === 'pending').length}
        </span>
      </div>
      <div className="stack">
        {state.proposals.map((p) => (
          <article className="card proposal-card" key={p.id}>
            <div>
              <h3>{p.name}</h3>
              <p>
                {p.village} · {p.reason}
              </p>
              <Badge status={p.status} />
              {p.rejectionReason && <p className="small muted">Dôvod: {p.rejectionReason}</p>}
              {p.assessment && (
                <dl className="small">
                  <dt>Pešia trasa</dt>
                  <dd>{p.assessment.walking}</dd>
                  <dt>Prístupnosť a nástup</dt>
                  <dd>{p.assessment.boarding}</dd>
                  <dt>Bezpečnosť zastavenia</dt>
                  <dd>{p.assessment.vehicleSafety}</dd>
                </dl>
              )}
            </div>
            {p.status === 'pending' && (
              <div className="proposal-actions">
                <button className="btn btn-small" onClick={() => setReview(p)}>
                  <Check size={16} />
                  Posúdiť návrh
                </button>
                <button
                  className="btn btn-small btn-secondary"
                  onClick={() => {
                    setReject(p)
                    setReason('')
                  }}
                >
                  Zamietnuť
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {reject && (
        <Modal title="Zamietnuť návrh zastávky" onClose={() => setReject(null)} actionErrors>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              if (
                act(
                  { type: 'decideProposal', id: reject.id, approve: false, reason },
                  'Návrh bol zamietnutý.',
                )
              )
                setReject(null)
            }}
          >
            <label className="field">
              <span>Dôvod zamietnutia</span>
              <textarea required value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <button className="btn btn-danger">Zamietnuť návrh</button>
          </form>
        </Modal>
      )}
      {show && <StopProposalModal onClose={() => setShow(false)} />}
      {review && <StopAssessmentModal proposal={review} onClose={() => setReview(null)} />}
    </>
  )
}
function StopAssessmentModal({
  proposal,
  onClose,
}: {
  proposal: StopProposal
  onClose: () => void
}) {
  const { act } = useStore()
  const [assessment, setAssessment] = useState({ walking: '', boarding: '', vehicleSafety: '' })
  const fields = [
    ['walking', 'Pešia trasa a bezpečnosť priechodov'],
    ['boarding', 'Prístupnosť a podmienky nástupu'],
    ['vehicleSafety', 'Bezpečné zastavenie vozidla'],
  ] as const
  return (
    <Modal title="Posúdiť návrh zastávky" onClose={onClose} actionErrors>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (
            act(
              { type: 'decideProposal', id: proposal.id, approve: true, assessment },
              'Zastávka bola schválená v demo prevádzke.',
            )
          )
            onClose()
        }}
      >
        <p>
          {proposal.name} · {proposal.village}
        </p>
        {fields.map(([key, title]) => (
          <label className="field" key={key}>
            <span>{title}</span>
            <textarea
              required
              rows={2}
              maxLength={300}
              value={assessment[key]}
              onChange={(e) => setAssessment({ ...assessment, [key]: e.target.value })}
            />
          </label>
        ))}
        <button className="btn">Schváliť zastávku</button>
      </form>
    </Modal>
  )
}
export function StopProposalModal({ onClose }: { onClose: () => void }) {
  const { act } = useStore(),
    [name, setName] = useState(''),
    [village, setVillage] = useState(''),
    [reason, setReason] = useState('')
  return (
    <>
      <Modal title="Navrhnúť novú zastávku" onClose={onClose}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (
              act(
                {
                  type: 'addProposal',
                  proposal: {
                    id: uid(),
                    name,
                    village,
                    reason,
                    status: 'pending',
                  },
                },
                'Návrh novej zastávky bol odoslaný dispečerovi.',
              )
            )
              onClose()
          }}
        >
          <label className="field">
            <span>Názov zastávky</span>
            <input
              required
              minLength={3}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Obec</span>
            <input
              required
              minLength={3}
              maxLength={80}
              value={village}
              onChange={(e) => setVillage(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Prečo by tu mala byť zastávka?</span>
            <textarea maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <Notice>
            Návrh posúdi dispečer. Schválenie zastávky automaticky nemení existujúce trasy.
          </Notice>
          <button className="btn" type="submit">
            Odoslať návrh <ArrowRight size={17} />
          </button>
        </form>
      </Modal>
    </>
  )
}
export function DispatcherStatistics() {
  const { state } = useStore(),
    counts = ['pending', 'approved', 'rejected', 'cancelled'].map((status) => ({
      status,
      count: state.requests.filter((r) => r.status === status).length,
    })),
    total = state.requests.length
  const destinations = Object.entries(
    state.requests.reduce<Record<string, number>>((acc, r) => {
      const name = villageName(state, r.to)
      acc[name] = (acc[name] ?? 0) + r.passengers
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1])
  const hours = Array.from({ length: 12 }, (_, i) => ({
      hour: i + 6,
      count: state.requests
        .filter((r) => Math.floor(minute(r.time) / 60) === i + 6)
        .reduce((n, r) => n + r.passengers, 0),
    })),
    max = Math.max(...hours.map((h) => h.count), 1)
  return (
    <>
      <PageTitle
        eyebrow="DÁTA PRE LEPŠIE CESTY"
        title="Štatistiky"
        description="Čo nám obyvatelia hovoria o doprave v regióne."
        action={
          <Link className="btn btn-secondary" to="/dispatcher/regular-needs">
            Pravidelné dopravné potreby <ArrowRight size={17} />
          </Link>
        }
      />
      <Kpis />
      <div className="stats-grid">
        <section className="card chart-card">
          <div className="section-heading">
            <h2>Záujem počas dňa</h2>
            <span className="muted small">Počet cestujúcich</span>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label={hours.map((h) => `${h.hour}:00 — ${h.count} cestujúcich`).join(', ')}
          >
            {hours.map((h) => (
              <div className="chart-column" key={h.hour}>
                <span>{h.count || ''}</span>
                <div style={{ height: `${(h.count / max) * 170 + 4}px` }} />
                <small>{String(h.hour).padStart(2, '0')}</small>
              </div>
            ))}
          </div>
          <p className="small muted">Požadovaný čas z uložených demo požiadaviek.</p>
        </section>
        <section className="card chart-card">
          <h2>Stav požiadaviek</h2>
          <div className="donut-wrap">
            <div
              className="donut"
              style={{
                background: `conic-gradient(#315e44 0 ${(counts[1].count / Math.max(total, 1)) * 100}%, #a7b99b ${(counts[1].count / Math.max(total, 1)) * 100}% ${((counts[1].count + counts[0].count) / Math.max(total, 1)) * 100}%, #d5c5b6 ${((counts[1].count + counts[0].count) / Math.max(total, 1)) * 100}% ${((counts[1].count + counts[0].count + counts[2].count) / Math.max(total, 1)) * 100}%, #dce1d4 0 100%)`,
              }}
            >
              <div>
                <strong>{total}</strong>
                <span>požiadaviek</span>
              </div>
            </div>
            <div className="chart-legend">
              {counts.map((c) => (
                <div key={c.status}>
                  <Badge status={c.status} />
                  <strong>{c.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="card chart-card">
          <h2>Najžiadanejšie ciele</h2>
          <div className="popular-routes">
            {destinations.map(([name, n]) => (
              <div key={name}>
                <div>
                  <span>
                    <MapPin size={16} />
                    {name}
                  </span>
                  <strong>{n} osôb</strong>
                </div>
                <div className="progress">
                  <span style={{ width: `${(n / Math.max(destinations[0][1], 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
