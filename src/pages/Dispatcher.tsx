import { useState } from 'react'
import { Link } from 'react-router-dom'
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
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react'
import { useStore } from '../context'
import { activeBookings, freeSeats, stopName, villageName, tripPlaceName } from '../domain'
import { dateLabel, minute, uid } from '../data'
import { coordinates, hasCustomPlaces } from '../places'
import type { RideRequest, StopProposal, Trip } from '../types'
import { Badge, Empty, Modal, Notice, PageTitle, StopTimeline } from '../components/ui'
function Kpis() {
  const { state } = useStore(),
    trips = state.trips.filter((t) => t.date === state.serviceDate),
    count = state.bookings
      .filter((b) => b.status === 'confirmed' && trips.some((t) => t.id === b.tripId))
      .reduce((n, b) => n + b.seats, 0),
    capacity = trips.reduce(
      (n, t) => n + (state.vehicles.find((v) => v.id === t.vehicleId)?.capacity ?? 0),
      0,
    )
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
          `${capacity ? Math.round((count / capacity) * 100) : 0} %`,
          'Priemerná rezervovanosť',
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
            <tr key={r.id}>
              <td>
                <strong>{r.fromPlace?.name ?? villageName(state, r.from)}</strong>
                <span className="table-secondary">
                  → {r.toPlace?.name ?? villageName(state, r.to)}
                  {r.returnDate ? ' · spiatočná' : ''}
                </span>
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
                        <Check size={18} />
                      </button>
                      <button
                        className="table-icon reject"
                        title="Zamietnuť požiadavku"
                        aria-label={`Zamietnuť požiadavku ${r.id}`}
                        onClick={() => decide(r, false)}
                      >
                        <X size={18} />
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
              <Notice>
                <ShieldCheck size={18} /> Preveríme kapacitu aj časový odstup 10 minút od ostatných
                jázd. Existujúce pravidelné spoje sa neposúvajú.
              </Notice>
              <p className="small muted">
                Požiadavky s rovnakou trasou, dátumom a časom sa spoja. Ukážková dĺžka flexibilnej
                jazdy je 24 minút; nejde o výpočet skutočnej trasy.
              </p>
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
                disabled={hasCustomPlaces(r) && !approvePlaces}
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
    [decision, setDecision] = useState<{ r: RideRequest; approve: boolean } | null>(null),
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
        eyebrow={`DISPEČERSKÉ CENTRUM · ${dateLabel(state.serviceDate, true)}`}
        title="Dobrý deň, Daniela."
        description="Váš prehľad dopravy v Zamagurí. Všetko na správnej ceste."
        action={
          <span className="operational">
            <span />
            Demonštračná prevádzka
          </span>
        }
      />
      <Kpis />
      <div className="section-heading section-spaced">
        <h2>Požiadavky na spracovanie</h2>
        <Link className="text-link" to="/dispatcher/requests">
          Všetky požiadavky <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="card table-card">
        <RequestTable requests={requests} decide={(r, approve) => setDecision({ r, approve })} />
      </div>
      <div className="dispatcher-lower">
        <section className="card schedule-card">
          <div className="section-heading">
            <h2>Dnešný cestovný poriadok</h2>
            <BusFront size={20} />
          </div>
          {trips.map((t) => (
            <div className="schedule-row" key={t.id}>
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
            </div>
          ))}
        </section>
        <section className="card fleet-summary">
          <div className="section-heading">
            <h2>Naše vozidlá</h2>
            <Link aria-label="Všetky vozidlá" to="/dispatcher/vehicles" className="icon-button">
              <ArrowUpRight size={20} />
            </Link>
          </div>
          {state.vehicles.map((v) => (
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
          <div className="fleet-note">
            <ShieldCheck size={20} />
            <p>Pravidelné spoje majú vždy prednosť pri plánovaní.</p>
          </div>
        </section>
      </div>
      {decision && (
        <RequestDecision
          request={decision.r}
          approve={decision.approve}
          onClose={() => setDecision(null)}
        />
      )}
    </>
  )
}
export function DispatcherRequests() {
  const { state } = useStore(),
    [status, setStatus] = useState('all'),
    [sort, setSort] = useState('interest'),
    [decision, setDecision] = useState<{ r: RideRequest; approve: boolean } | null>(null),
    requests = state.requests
      .filter((r) => status === 'all' || r.status === status)
      .sort((a, b) =>
        sort === 'interest'
          ? b.passengers - a.passengers
          : `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
      )
  return (
    <>
      <PageTitle
        eyebrow="HLAS OBYVATEĽOV"
        title="Požiadavky"
        description="Posúďte záujem a naplánujte jazdy, ktoré rešpektujú pravidelné spoje."
      />
      <div className="list-toolbar">
        <div className="segmented">
          <button className={status === 'all' ? 'selected' : ''} onClick={() => setStatus('all')}>
            Všetky
          </button>
          <button
            className={status === 'pending' ? 'selected' : ''}
            onClick={() => setStatus('pending')}
          >
            Čakajúce
          </button>
          <button
            className={status === 'approved' ? 'selected' : ''}
            onClick={() => setStatus('approved')}
          >
            Schválené
          </button>
          <button
            className={status === 'rejected' ? 'selected' : ''}
            onClick={() => setStatus('rejected')}
          >
            Zamietnuté
          </button>
        </div>
        <label className="sort-label">
          Zoradiť
          <select
            aria-label="Zoradenie požiadaviek"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="interest">Najväčší záujem</option>
            <option value="date">Dátum a čas</option>
          </select>
        </label>
      </div>
      <div className="card table-card">
        <RequestTable requests={requests} decide={(r, approve) => setDecision({ r, approve })} />
      </div>
      <p className="page-footnote">
        Schválenie vytvorí Flex jazdu a pridá cestujúcich do zoznamu vodiča. Zmeny sú len
        demonštračné.
      </p>
      {decision && (
        <RequestDecision
          request={decision.r}
          approve={decision.approve}
          onClose={() => setDecision(null)}
        />
      )}
    </>
  )
}
function TripDetailModal({ trip: t, onClose }: { trip: Trip; onClose: () => void }) {
  const { state } = useStore(),
    vehicle = state.vehicles.find((v) => v.id === t.vehicleId)!
  return (
    <Modal title={`Detail spoja ${t.line}`} onClose={onClose}>
      <div className="stack">
        <Badge status={t.status} />
        <p>
          {dateLabel(t.date)} · {vehicle.name} · {vehicle.plate}
        </p>
        <div className="trip-assignment-info">
          <span>
            Vodič:{' '}
            <strong>{state.drivers.find((d) => d.id === t.driverId)?.name ?? 'Nepriradený'}</strong>
          </span>
          <span>
            Vozidlo: <strong>{vehicle.name}</strong>
          </span>
          <span>
            Evidenčné číslo: <strong>{vehicle.plate}</strong>
          </span>
          <span>
            Kapacita vozidla: <strong>{vehicle.capacity}</strong>
          </span>
          <span>
            Požadované oprávnenie: <strong>{vehicle.requiredLicenseCategory ?? 'Neurčené'}</strong>
          </span>
          <span>
            Typ jazdy: <strong>{t.kind === 'fixed' ? 'Pravidelná' : 'Flexibilná'}</strong>
          </span>
        </div>
        <StopTimeline trip={t} />
        <Notice>
          {freeSeats(state, t)} z {vehicle.capacity} miest voľných na celej trase. Rezervovaných
          osôb na trase: {activeBookings(state, t.id).reduce((n, b) => n + b.seats, 0)}.
        </Notice>
        {t.requestIds.length > 0 && (
          <div>
            <h3>Spojené požiadavky</h3>
            {t.requestIds.map((id) => {
              const r = state.requests.find((r) => r.id === id)
              return (
                <p key={id} className="muted">
                  {r
                    ? `${r.fromPlace?.name ?? villageName(state, r.from)} → ${r.toPlace?.name ?? villageName(state, r.to)} · ${r.passengers} cestujúci`
                    : 'Požiadavka sa nenašla'}
                </p>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
export function DispatcherTrips({ kind }: { kind: 'fixed' | 'flex' }) {
  const { state } = useStore(),
    [date, setDate] = useState(state.serviceDate),
    [detail, setDetail] = useState<Trip | null>(null),
    trips = state.trips
      .filter((t) => t.kind === kind && t.date === date)
      .sort((a, b) => a.stops[0].time.localeCompare(b.stops[0].time))
  return (
    <>
      <PageTitle
        eyebrow="PLÁNOVANIE DOPRAVY"
        title={kind === 'fixed' ? 'Pravidelné spoje' : 'Flexibilné jazdy'}
        description={
          kind === 'fixed'
            ? 'Stabilné trasy, na ktoré sa obyvatelia môžu spoľahnúť.'
            : 'Jazdy na požiadanie, naplánované medzi pravidelnými spojmi.'
        }
        action={
          <label className="field">
            <span>Dátum prevádzky</span>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        }
      />
      {kind === 'flex' && (
        <Notice>
          Ďalšiu flexibilnú jazdu vytvoríte schválením požiadavky.{' '}
          <Link to="/dispatcher/requests" className="text-link">
            Prejsť na požiadavky <ArrowRight size={15} />
          </Link>
        </Notice>
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
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>
                      {t.line} · {tripPlaceName(state, t, t.stops[0].stopId)}
                    </strong>
                    <span className="table-secondary">
                      → {tripPlaceName(state, t, t.stops.at(-1)!.stopId)}
                      {kind === 'flex' ? ` · ${t.requestIds.length} požiadavky` : ''}
                    </span>
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
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Detail spoja ${t.line} o ${t.stops[0].time}`}
                      onClick={() => setDetail(t)}
                    >
                      <ArrowUpRight size={19} />
                    </button>
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
      {detail && <TripDetailModal trip={detail} onClose={() => setDetail(null)} />}
    </>
  )
}
export function DispatcherVehicles() {
  const { state } = useStore(),
    [vehicleId, setVehicleId] = useState<string | null>(null)
  return (
    <>
      <PageTitle
        eyebrow="NAŠA FLOTILA"
        title="Vozidlá"
        description="Dva mikrobusy. Jedna spoločná sieť dopravy."
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
                <p className="muted">{v.plate} · Mikrobus</p>
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
              </div>
            </article>
          )
        })}
      </div>
      {vehicleId && (
        <Modal title="Pridelené jazdy vozidla" onClose={() => setVehicleId(null)}>
          <div className="stack">
            {state.trips
              .filter((t) => t.vehicleId === vehicleId && t.date === state.serviceDate)
              .map((t) => (
                <div className="assigned-trip" key={t.id}>
                  <strong>
                    {t.stops[0].time} – {t.stops.at(-1)!.time}
                  </strong>
                  <p>
                    {tripPlaceName(state, t, t.stops[0].stopId)} →{' '}
                    {tripPlaceName(state, t, t.stops.at(-1)!.stopId)}
                  </p>
                  <Badge status={t.status} />
                </div>
              ))}
          </div>
        </Modal>
      )}
    </>
  )
}
export function DispatcherStops() {
  const { state, act } = useStore(),
    [reject, setReject] = useState<StopProposal | null>(null),
    [reason, setReason] = useState(''),
    [show, setShow] = useState(false)
  return (
    <>
      <PageTitle
        eyebrow="BLÍZKO K OBYVATEĽOM"
        title="Zastávky"
        description="Existujúce zastávky a návrhy nových miest nástupu."
        action={
          <button className="btn btn-secondary" onClick={() => setShow(true)}>
            <Plus size={17} />
            Navrhnúť zastávku
          </button>
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
            </div>
            {p.status === 'pending' && (
              <div className="proposal-actions">
                <button
                  className="btn btn-small"
                  onClick={() =>
                    act(
                      { type: 'decideProposal', id: p.id, approve: true },
                      'Zastávka bola schválená a pridaná do vyhľadávania.',
                    )
                  }
                >
                  <Check size={16} />
                  Schváliť
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
        <Modal title="Zamietnuť návrh zastávky" onClose={() => setReject(null)}>
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
    </>
  )
}
export function StopProposalModal({ onClose }: { onClose: () => void }) {
  const { act } = useStore(),
    [name, setName] = useState(''),
    [village, setVillage] = useState(''),
    [reason, setReason] = useState('')
  return (
    <Modal title="Navrhnúť novú zastávku" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (
            act(
              {
                type: 'addProposal',
                proposal: { id: uid(), name, village, reason, status: 'pending' },
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
        <section className="card stats-summary">
          <span className="icon-tile">
            <ShieldCheck size={25} />
          </span>
          <h2>
            Stabilný základ.
            <br />
            Flexibilné možnosti.
          </h2>
          <p>
            Flex jazdy plánujeme iba vo voľných časových oknách. Pravidelný cestovný poriadok má
            vždy prednosť.
          </p>
          <Link className="text-link" to="/dispatcher/flex">
            Pozrieť flexibilné jazdy <ArrowRight size={17} />
          </Link>
        </section>
      </div>
      <p className="page-footnote">
        Všetky prehľady vychádzajú z lokálnych demonštračných dát. Nejde o skutočné prevádzkové
        štatistiky.
      </p>
    </>
  )
}
