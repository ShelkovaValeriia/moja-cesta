import { coordinates } from '../places'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BusFront,
  Check,
  CircleHelp,
  Info,
  MapPin,
  X,
  UsersRound,
} from 'lucide-react'
import { useStore } from '../context'
import { stopName, tripTime, villageName, freeSeats, tripPlaceName } from '../domain'
import { dateLabel, minute } from '../data'
import type { RideRequest, Trip } from '../types'
const statusLabels: Record<string, string> = {
  pending: 'Čaká na spracovanie',
  approved: 'Schválená',
  rejected: 'Zamietnutá',
  cancelled: 'Zrušená',
  scheduled: 'Naplánovaná',
  active: 'Prebieha',
  completed: 'Dokončená',
  confirmed: 'Potvrdená',
  expected: 'Čaká na nástup',
  boarded: 'Vo vozidle',
  alighted: 'Vystúpil',
  absent: 'Neprišiel',
  paused: 'Pozastavené',
}
export function Badge({ status, children }: { status?: string; children?: ReactNode }) {
  return (
    <span className={`badge ${status ?? ''}`}>
      {status === 'confirmed' || status === 'approved' ? (
        <Check size={12} />
      ) : (
        <span className="badge-dot" />
      )}
      {children ?? statusLabels[status ?? ''] ?? status}
    </span>
  )
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
  back,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
  back?: string
}) {
  const navigate = useNavigate()
  return (
    <div className="page-title">
      {back && (
        <Link
          className="back-link"
          to={back}
          onClick={(e) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            e.preventDefault()
            if (typeof window.history.state?.idx === 'number' && window.history.state.idx > 0)
              navigate(-1)
            else navigate(back, { replace: true })
          }}
        >
          <ArrowLeft size={16} /> Späť
        </Link>
      )}
      <div className="title-row">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {description && <p className="page-description">{description}</p>}
        </div>
        {action}
      </div>
    </div>
  )
}
export function Empty({
  title = 'Zatiaľ tu nič nie je',
  text = 'Keď pribudne nová cesta, nájdete ju tu.',
  action,
}: {
  title?: string
  text?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="icon-tile">
        <BusFront />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode
  tone?: 'info' | 'warning' | 'success'
}) {
  return (
    <div className={`notice ${tone}`}>
      <Info size={19} />
      <div>{children}</div>
    </div>
  )
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    d?.showModal()
    return () => d?.close()
  }, [])
  return (
    <dialog
      aria-labelledby={titleId}
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="modal">
        <div className="section-heading">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label="Zavrieť" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
export function StopSelect({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  const { state } = useStore()
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        <option value="">Vyberte zastávku</option>
        {state.stops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  )
}
export function PersonSelect({
  value,
  onChange,
  label = 'Cestujúci',
  excludedIds = [],
}: {
  value: string
  onChange: (value: string) => void
  label?: string
  excludedIds?: string[]
}) {
  const { state } = useStore()
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {state.people.map((p) => (
          <option key={p.id} value={p.id} disabled={excludedIds.includes(p.id)}>
            {p.name} · {p.relation}
          </option>
        ))}
      </select>
    </label>
  )
}
export function TripRoute({ trip, from, to }: { trip: Trip; from?: string; to?: string }) {
  const { state } = useStore()
  const a = from ?? trip.stops[0].stopId,
    b = to ?? trip.stops.at(-1)!.stopId
  return (
    <div className="trip-route">
      <div>
        <strong>{tripTime(trip, a)}</strong>
        <span>{trip.stops.find((s) => s.stopId === a)?.place?.name ?? villageName(state, a)}</span>
        <small>
          {trip.stops.find((s) => s.stopId === a)?.place?.type === 'custom'
            ? coordinates(trip.stops.find((s) => s.stopId === a)!.place!)
            : stopName(state, a).split(', ')[1]}
        </small>
      </div>
      <div className="route-line">
        <span>{minute(tripTime(trip, b)) - minute(tripTime(trip, a))} min</span>
        <i />
        <small>Priamy spoj</small>
      </div>
      <div>
        <strong>{tripTime(trip, b)}</strong>
        <span>{trip.stops.find((s) => s.stopId === b)?.place?.name ?? villageName(state, b)}</span>
        <small>
          {trip.stops.find((s) => s.stopId === b)?.place?.type === 'custom'
            ? coordinates(trip.stops.find((s) => s.stopId === b)!.place!)
            : stopName(state, b).split(', ')[1]}
        </small>
      </div>
    </div>
  )
}
export function TripCard({
  trip,
  from,
  to,
  action,
  compact = false,
}: {
  trip: Trip
  from?: string
  to?: string
  action?: ReactNode
  compact?: boolean
}) {
  const { state } = useStore()
  return (
    <article className={`card trip-card ${compact ? 'compact' : ''}`}>
      <div className="trip-top">
        <span className="line-label">
          <BusFront size={17} />
          {trip.kind === 'fixed' ? 'Pravidelný spoj' : 'Doprava na požiadanie'}
          <b>{trip.line}</b>
        </span>
        <Badge status={trip.status === 'scheduled' ? 'confirmed' : trip.status}>
          {trip.status === 'scheduled' ? 'Podľa cestovného poriadku' : undefined}
        </Badge>
      </div>
      <TripRoute trip={trip} from={from} to={to} />
      <div className="trip-bottom">
        <span className="muted">
          {dateLabel(trip.date)} · {freeSeats(state, trip, from, to)} voľných miest
        </span>
        {action}
      </div>
    </article>
  )
}
export function RequestCard({
  request: r,
  search = '',
}: {
  request: RideRequest
  search?: string
}) {
  const { state } = useStore()
  return (
    <article className="card request-card">
      <div className="trip-top">
        <span className="small muted">POŽIADAVKA · {r.id.slice(0, 6).toUpperCase()}</span>
        <Badge status={r.status} />
      </div>
      <h3>
        {villageName(state, r.from)} <ArrowRight size={17} /> {villageName(state, r.to)}
      </h3>
      <p className="muted">
        {dateLabel(r.date)} · {r.timeMode === 'arrival' ? 'Príchod do' : 'Odchod'} {r.time}
        {r.returnDate ? ' · Spiatočná' : ''}
      </p>
      <div className="trip-bottom">
        <span className="interested">
          <UsersRound size={18} />
          {r.passengers}{' '}
          {r.passengers === 1 ? 'záujemca' : r.passengers <= 4 ? 'záujemcovia' : 'záujemcov'}
        </span>
        <Link to={`/passenger/requests/${r.id}${search}`} className="text-link">
          Zobraziť <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  )
}
export function HelpContent() {
  return (
    <div className="stack">
      <p>Moja Cesta spája pravidelné mikrobusové spoje s dopravou na požiadanie v Zamagurí.</p>
      <div className="help-step">
        <span>1</span>
        <div>
          <h3>Vyhľadajte spojenie</h3>
          <p>Zvoľte zastávky a čas. Na pravidelnom spoji si rovno rezervujte miesto.</p>
        </div>
      </div>
      <div className="help-step">
        <span>2</span>
        <div>
          <h3>Nenašli ste vhodný spoj?</h3>
          <p>
            Pridajte sa k požiadavke alebo vytvorte vlastnú. Dispečer preverí dostupnosť mikrobusu.
          </p>
        </div>
      </div>
      <div className="help-step">
        <span>3</span>
        <div>
          <h3>Počkajte na potvrdenie</h3>
          <p>
            Samotná požiadavka ešte nie je rezervácia. Potvrdenú jazdu nájdete v časti Moje cesty.
          </p>
        </div>
      </div>
      <div className="help-contact">
        <h3>Kontakt na dispečera</h3>
        <p>
          Dispečer vám pomôže s výberom zastávky, rezerváciou aj požiadavkou pre blízkeho človeka. V
          tejto demo verzii nie je telefónny kontakt ani odosielanie správ pripojené.
        </p>
      </div>
      <Notice>
        Ide o demonštračnú verziu. Neobjednáva skutočnú dopravu ani neposiela oznámenia.
      </Notice>
    </div>
  )
}
export function HelpLink({ onClick }: { onClick: () => void }) {
  return (
    <button className="help-link" onClick={onClick}>
      <CircleHelp size={18} /> Potrebujete poradiť?
    </button>
  )
}
export function StopTimeline({ trip, from, to }: { trip: Trip; from?: string; to?: string }) {
  const { state } = useStore()
  return (
    <ol className="timeline">
      {trip.stops.map((s) => (
        <li key={s.stopId}>
          <time>{s.time}</time>
          <span className="timeline-dot" />
          <div>
            <strong>{tripPlaceName(state, trip, s.stopId)}</strong>
            {s.stopId === from && <span className="timeline-role">Nástup</span>}
            {s.stopId === to && <span className="timeline-role">Výstup</span>}
            <small>
              <MapPin size={12} />{' '}
              {s.place?.type === 'custom'
                ? `Dohodnuté miesto · ${coordinates(s.place)}`
                : 'Zastávka mikrobusu'}
            </small>
          </div>
        </li>
      ))}
    </ol>
  )
}
