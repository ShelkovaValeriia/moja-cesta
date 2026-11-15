import { DispatcherModal as Modal } from '../components/DispatcherModal'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Search } from 'lucide-react'
import { useStore } from '../context'
import { dateLabel } from '../data'
import { dispatchPeople, noShowOutcome, stopName, tripPlaceName, tripTime } from '../domain'
import type { Action } from '../domain'
import type { AppState, Booking } from '../types'
import { Badge, Empty, PageTitle } from '../components/ui'
import { NoShowModal } from './DispatcherSupport'
import { formatPassengerCode } from '../passengerCodes'

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
const PAGE_SIZE = 20
function matches(search: string, text: string, contact: string) {
  const query = search.trim()
  return (
    normalize(text).includes(normalize(query)) ||
    (/^[+\d\s().-]+$/.test(query) &&
      query.replace(/\D/g, '').length > 0 &&
      contact.replace(/\D/g, '').includes(query.replace(/\D/g, '')))
  )
}
const reviewLabels = {
  confirmed: 'Neprítomnosť potvrdená',
  excused: 'Neprítomnosť ospravedlnená',
  corrected: 'Chybný záznam opravený',
}

function useFilters() {
  const [params, setParams] = useSearchParams()
  function change(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  const parsedPage = Number(params.get('page') ?? 1)
  return {
    params,
    change,
    clear: () => setParams({}, { replace: true }),
    page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  }
}

function RecordFilters({
  search,
  date,
  status,
  onChange,
  onClear,
  noShows = false,
  kind = '',
}: {
  search: string
  date: string
  status: string
  kind?: string
  noShows?: boolean
  onChange: (key: string, value: string) => void
  onClear: () => void
}) {
  return (
    <section className="card chart-card support-filters" aria-label="Filtre záznamov">
      <label className="field support-search">
        <span>
          <Search size={15} /> Vyhľadať záznam
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => onChange('search', e.target.value)}
          placeholder="Meno, identifikátor, telefón alebo adresa"
        />
      </label>
      <label className="field">
        <span>Dátum cesty</span>
        <input type="date" value={date} onChange={(e) => onChange('date', e.target.value)} />
      </label>
      <label className="field">
        <span>Stav záznamu</span>
        <select value={status} onChange={(e) => onChange('status', e.target.value)}>
          <option value="">Všetky stavy</option>
          {noShows ? (
            <>
              <option value="unreviewed">Čaká na posúdenie</option>
              {Object.entries(reviewLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </>
          ) : (
            <>
              <option value="pending">Čaká na naplánovanie</option>
              <option value="confirmed">Potvrdená rezervácia</option>
              <option value="approved">Schválená požiadavka</option>
              <option value="rejected">Zamietnutá</option>
              <option value="cancelled">Zrušená</option>
            </>
          )}
        </select>
      </label>
      {!noShows && (
        <label className="field">
          <span>Typ záznamu</span>
          <select value={kind} onChange={(e) => onChange('kind', e.target.value)}>
            <option value="">Všetky záznamy</option>
            <option value="request">Požiadavky</option>
            <option value="booking">Rezervácie</option>
          </select>
        </label>
      )}
      <button className="btn btn-secondary" type="button" onClick={onClear}>
        Vymazať filtre
      </button>
    </section>
  )
}

function Pagination({
  count,
  page,
  onPage,
}: {
  count: number
  page: number
  onPage: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  return (
    <div className="support-pagination">
      <span className="small muted" role="status">
        {count
          ? `${(page - 1) * PAGE_SIZE + 1} – ${Math.min(page * PAGE_SIZE, count)} z ${count}`
          : '0 záznamov'}
      </span>
      {pages > 1 && (
        <nav aria-label="Stránkovanie záznamov">
          <button
            className="btn btn-small btn-secondary"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Predchádzajúca
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            className="btn btn-small btn-secondary"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            Ďalšia
          </button>
        </nav>
      )}
    </div>
  )
}

interface PhoneRecord {
  id: string
  kind: 'request' | 'booking'
  name: string
  personId: string
  passengerCode?: string
  contact: string
  date: string
  time: string
  timeMode: string
  from: string
  to: string
  seats: number
  status: string
  assistance?: string
  planning?: boolean
  returnText?: string
  returnDate?: string
  href?: string
  reason?: string
  cancellation?: Action
}

function phoneRecords(state: AppState): PhoneRecord[] {
  const person = (id?: string) => ({
    name: dispatchPeople(state).find((p) => p.id === id)?.name ?? 'Telefonický cestujúci',
    personId: id ?? '',
    passengerCode: dispatchPeople(state).find((p) => p.id === id)?.passengerCode,
    contact: dispatchPeople(state).find((p) => p.id === id)?.contact ?? '',
  })
  return [
    ...state.phoneRequests.map((r): PhoneRecord => ({
      ...person(r.personId),
      id: r.id,
      kind: 'request',
      date: r.date,
      time: r.time,
      timeMode: r.timeMode,
      from: r.fromAddress,
      to: r.toAddress,
      seats: r.seats,
      status: r.status,
      assistance: r.assistance,
      planning: true,
      returnDate: r.returnJourney?.date,
      returnText:
        r.returnJourney &&
        `${dateLabel(r.returnJourney.date)} · ${r.returnJourney.timeMode === 'arrival' ? 'Príchod do' : 'Odchod'} ${r.returnJourney.time}`,
      cancellation: r.status === 'pending' ? { type: 'cancelPhoneRequest', id: r.id } : undefined,
    })),
    ...state.requests
      .filter(
        (r) =>
          r.channel === 'phone' &&
          !state.bookings.some((b) => b.channel === 'phone' && b.groupId === r.id),
      )
      .map((r): PhoneRecord => ({
        ...person(r.personId),
        id: r.id,
        kind: 'request',
        date: r.date,
        time: r.time,
        timeMode: r.timeMode,
        from: r.fromPlace?.name ?? stopName(state, r.from),
        to: r.toPlace?.name ?? stopName(state, r.to),
        seats: r.passengers,
        status: r.status,
        reason: r.reason,
        returnDate: r.returnDate,
        returnText:
          r.returnDate &&
          `${dateLabel(r.returnDate)} · ${r.returnTimeMode === 'arrival' ? 'Príchod do' : 'Odchod'} ${r.returnTime}`,
        href: `/dispatcher/requests/${encodeURIComponent(r.id)}/route`,
        cancellation:
          r.status === 'pending' && r.members.length
            ? { type: 'cancelRequest', id: r.id }
            : undefined,
      })),
    ...state.bookings
      .filter((b) => b.channel === 'phone')
      .flatMap((b): PhoneRecord[] => {
        const trip = state.trips.find((t) => t.id === b.tripId)
        if (!trip) return []
        return [
          {
            ...person(b.personId),
            name: b.name,
            id: b.id,
            kind: 'booking',
            date: trip.date,
            time: tripTime(trip, b.from),
            timeMode: 'departure',
            from: tripPlaceName(state, trip, b.from),
            to: tripPlaceName(state, trip, b.to),
            seats: b.seats,
            status: b.status,
            assistance: b.assistance,
            href: `/dispatcher/${trip.kind}/${encodeURIComponent(trip.id)}`,
            cancellation:
              b.status === 'confirmed' &&
              trip.status === 'scheduled' &&
              trip.date >= state.serviceDate &&
              b.riderStatus === 'expected'
                ? { type: 'cancelBooking', id: b.id }
                : undefined,
          },
        ]
      }),
  ].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || a.id.localeCompare(b.id),
  )
}

export function DispatcherPhoneRecords() {
  const { state, act } = useStore()
  const { params, change, clear, page: requestedPage } = useFilters()
  const [cancel, setCancel] = useState<PhoneRecord | null>(null)
  const search = params.get('search') ?? '',
    date = params.get('date') ?? '',
    status = params.get('status') ?? '',
    kind = params.get('kind') ?? ''
  const records = phoneRecords(state).filter(
    (r) =>
      (!search ||
        matches(
          search,
          `${r.name} ${r.personId} ${r.passengerCode ?? ''} ${formatPassengerCode(r.passengerCode)} ${r.contact} ${r.id} ${r.from} ${r.to}`,
          r.contact,
        )) &&
      (!date || r.date === date || r.returnDate === date) &&
      (!status || r.status === status) &&
      (!kind || r.kind === kind),
  )
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(records.length / PAGE_SIZE)))
  return (
    <>
      <PageTitle
        title="Telefonické rezervácie"
        back="/dispatcher/support"
        action={
          <Link className="btn btn-secondary" to="/dispatcher/support">
            Nová požiadavka
          </Link>
        }
      />
      <RecordFilters {...{ search, date, status, kind }} onChange={change} onClear={clear} />
      <Pagination count={records.length} page={page} onPage={(p) => change('page', String(p))} />
      <div className="stack">
        {records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (
          <article className="card chart-card stack" key={`${r.kind}-${r.id}`}>
            <div className="section-heading">
              <h2>{r.name}</h2>
              <Badge status={r.status}>
                {r.status === 'pending' ? 'Čaká na naplánovanie' : undefined}
              </Badge>
            </div>
            <p>
              <strong>{r.from}</strong> → <strong>{r.to}</strong>
            </p>
            <p className="muted">
              {dateLabel(r.date)} · {r.timeMode === 'arrival' ? 'Príchod do' : 'Odchod'} {r.time} ·{' '}
              {r.seats} miest · {r.kind === 'booking' ? 'Rezervácia' : 'Požiadavka'}
            </p>
            {r.returnText && <p>Spiatočná cesta: {r.returnText}</p>}
            {r.planning && r.status === 'pending' && (
              <p className="small muted">
                Miesto nástupu a výstupu určí plánovanie. Miesta vo vozidle zatiaľ nie sú
                rezervované.
              </p>
            )}
            {r.reason && <p>{r.reason}</p>}
            <details>
              <summary>Údaje záznamu</summary>
              <div className="stack support-record-details">
                <p>Identifikátor záznamu: {r.id}</p>
                <p>
                  ID cestujúceho:{' '}
                  {r.passengerCode
                    ? formatPassengerCode(r.passengerCode)
                    : r.personId || 'Neuvedený'}
                </p>
                <p>Kontakt: {r.contact || 'Neuvedený'}</p>
                {r.assistance && <p>Pomoc počas cesty: {r.assistance}</p>}
              </div>
            </details>
            <div className="dispatch-actions">
              {r.href && (
                <Link className="text-link" to={r.href}>
                  Detail cesty <ArrowRight size={15} />
                </Link>
              )}
              {r.cancellation && (
                <button className="btn btn-small btn-secondary" onClick={() => setCancel(r)}>
                  Zrušiť {r.kind === 'booking' ? 'rezerváciu' : 'požiadavku'}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!records.length && (
        <Empty
          title="Žiadne telefonické záznamy"
          text="Pre zvolené filtre sa nenašla rezervácia ani požiadavka."
          action={
            <button className="btn btn-secondary" onClick={clear}>
              Vymazať filtre
            </button>
          }
        />
      )}
      {cancel?.cancellation && (
        <Modal
          title={
            cancel.kind === 'booking'
              ? 'Zrušiť telefonickú rezerváciu'
              : 'Zrušiť telefonickú požiadavku'
          }
          onClose={() => setCancel(null)}
          actionErrors
        >
          <div className="stack">
            <p>
              {cancel.name} · {dateLabel(cancel.date)} · {cancel.time}
            </p>
            <p>
              {cancel.from} → {cancel.to}
            </p>
            <p>
              {cancel.kind === 'booking'
                ? 'Zrušením sa uvoľnia rezervované miesta. Pri spoločnej spiatočnej rezervácii sa zrušia oba smery.'
                : 'Zrušená požiadavka sa už nebude plánovať.'}
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setCancel(null)}>
                Ponechať cestu
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (cancel.cancellation && act(cancel.cancellation, 'Cesta bola zrušená.'))
                    setCancel(null)
                }}
              >
                Potvrdiť zrušenie
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

export function DispatcherNoShows() {
  const { state } = useStore()
  const { params, change, clear, page: requestedPage } = useFilters()
  const [reviewId, setReviewId] = useState<string | null>(null)
  const search = params.get('search') ?? '',
    date = params.get('date') ?? '',
    status = params.get('status') ?? ''
  const noShows = state.bookings
    .filter((b) => b.riderStatus === 'absent' || b.noShowReview || b.noShow)
    .filter((b) => {
      const trip = state.trips.find((t) => t.id === b.tripId),
        person = dispatchPeople(state).find((p) => p.id === b.personId)
      return (
        (!search ||
          matches(
            search,
            `${b.name} ${b.personId ?? ''} ${person?.passengerCode ?? ''} ${formatPassengerCode(person?.passengerCode)} ${person?.contact ?? ''} ${b.id} ${trip ? tripPlaceName(state, trip, b.from) + ' ' + tripPlaceName(state, trip, b.to) : ''}`,
            person?.contact ?? '',
          )) &&
        (!date || trip?.date === date) &&
        (!status || (noShowOutcome(b) ?? 'unreviewed') === status)
      )
    })
    .sort(
      (a, b) =>
        (b.noShow?.recordedAt ?? '').localeCompare(a.noShow?.recordedAt ?? '') ||
        a.id.localeCompare(b.id),
    )
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(noShows.length / PAGE_SIZE)))
  const review: Booking | undefined = state.bookings.find((b) => b.id === reviewId)
  return (
    <>
      <PageTitle title="Neprítomnosť cestujúcich" back="/dispatcher/support" />
      <RecordFilters noShows {...{ search, date, status }} onChange={change} onClear={clear} />
      <Pagination count={noShows.length} page={page} onPage={(p) => change('page', String(p))} />
      <div className="stack">
        {noShows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((b) => {
          const trip = state.trips.find((t) => t.id === b.tripId)
          return (
            <article className="card chart-card stack" key={b.id}>
              <h2>{b.name}</h2>
              {trip && (
                <>
                  <p>
                    {dateLabel(trip.date)} · {tripTime(trip, b.from)}
                  </p>
                  <p>
                    {tripPlaceName(state, trip, b.from)} → {tripPlaceName(state, trip, b.to)}
                  </p>
                </>
              )}
              {noShowOutcome(b) ? (
                <p>
                  <strong>{reviewLabels[noShowOutcome(b)!]}</strong> ·{' '}
                  {b.noShowReview?.reason ?? b.noShow?.reason}
                </p>
              ) : (
                <button className="btn btn-small btn-secondary" onClick={() => setReviewId(b.id)}>
                  Posúdiť neprítomnosť
                </button>
              )}
            </article>
          )
        })}
      </div>
      {!noShows.length && (
        <Empty
          title="Žiadne záznamy neprítomnosti"
          text="Záznamy vodičov zodpovedajúce zvoleným filtrom sa zobrazia tu."
        />
      )}
      {review && <NoShowModal booking={review} onClose={() => setReviewId(null)} />}
    </>
  )
}
