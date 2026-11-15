import { requestBookingWithdrawalError } from '../requestWithdrawal'
import { RecurringPage } from './Recurring'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, CalendarDays, Ticket, UsersRound } from 'lucide-react'
import { useStore } from '../context'
import { dateLabel } from '../data'
import { tripTime, villageName, tripPlaceName } from '../domain'
import type { Booking } from '../types'
import { Badge, Empty, Modal, Notice, PageTitle, TripCard } from '../components/ui'
export function JourneysPage() {
  const [params] = useSearchParams()
  const { state, act } = useStore(),
    [tab, setTab] = useState(
      ['requests', 'history', 'regular'].includes(params.get('tab') ?? '')
        ? params.get('tab')!
        : 'upcoming',
    ),
    [detail, setDetail] = useState<Booking | null>(null),
    [cancel, setCancel] = useState<Booking | null>(null)
  const tripOf = (b: Booking) => state.trips.find((t) => t.id === b.tripId)!
  const upcoming = state.bookings.filter(
    (b) => b.mine && b.status === 'confirmed' && tripOf(b)?.status !== 'completed',
  )
  const history = state.bookings.filter(
    (b) => b.mine && (b.status === 'cancelled' || tripOf(b)?.status === 'completed'),
  )
  const ownRequests = state.requests.filter((r) => r.members.length > 0 || r.left)
  const items = tab === 'history' ? history : upcoming
  const unique = items.filter(
    (b, i, arr) => !b.groupId || arr.findIndex((x) => x.groupId === b.groupId) === i,
  )
  function canCancel(b: Booking) {
    return (
      b.status === 'confirmed' &&
      !requestBookingWithdrawalError(state, b) &&
      state.bookings
        .filter((x) => x.mine && (x.id === b.id || (b.groupId && x.groupId === b.groupId)))
        .every((x) => tripOf(x)?.status === 'scheduled' && x.riderStatus === 'expected')
    )
  }
  return (
    <div className="journeys-page">
      <PageTitle
        title="Moje cesty"
        action={
          <Link className="btn btn-secondary" to="/passenger/search">
            <ArrowRight size={18} /> Vyhľadať spojenie
          </Link>
        }
      />
      <div className="tabs" role="tablist" aria-label="Typ cesty">
        {[
          ['upcoming', 'Nadchádzajúce', upcoming.length],
          ['requests', 'Požiadavky', ownRequests.length],
          ['history', 'História', history.length],
          [
            'regular',
            'Moje pravidelné cesty',
            state.rules.filter((r) => r.status !== 'cancelled').length,
          ],
        ].map(([id, label, n]) => (
          <button
            role="tab"
            aria-selected={tab === id}
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(String(id))}
          >
            {label}
            <span>{n}</span>
          </button>
        ))}
      </div>
      {tab === 'regular' ? (
        <RecurringPage embedded />
      ) : tab === 'requests' ? (
        <div className="stack">
          {ownRequests.length ? (
            ownRequests.map((r) => (
              <article className="card journey-card" key={r.id}>
                <div className="journey-icon">
                  <UsersRound />
                </div>
                <div className="journey-info">
                  <div className="journey-heading">
                    <h3>
                      {r.fromPlace?.name ?? villageName(state, r.from)} →{' '}
                      {r.toPlace?.name ?? villageName(state, r.to)}
                    </h3>
                    <Badge status={r.left ? 'cancelled' : r.status} />
                  </div>
                  <p>
                    {dateLabel(r.date)} · {r.time} · {r.ownSeats}{' '}
                    {r.ownSeats === 1 ? 'miesto' : 'miesta'}
                    {r.returnDate ? ' · Tam aj späť' : ''}
                  </p>
                  <small className="muted">
                    {r.left
                      ? 'Vaša účasť bola zrušená. Záujem ostatných cestujúcich zostáva zachovaný.'
                      : r.status === 'pending'
                        ? 'Čaká na posúdenie dispečerom. Miesto zatiaľ nie je potvrdené.'
                        : r.status === 'rejected'
                          ? r.reason
                          : 'Dispečer naplánoval jazdu. Rezerváciu nájdete v nadchádzajúcich cestách.'}
                  </small>
                </div>
                <Link className="btn btn-secondary" to={`/passenger/requests/${r.id}`}>
                  Detail <ArrowRight size={16} />
                </Link>
              </article>
            ))
          ) : (
            <Empty
              title="Zatiaľ nemáte požiadavku"
              text="Pridajte sa k spoločnej ceste alebo vytvorte vlastnú."
              action={
                <Link to="/passenger/requests" className="btn">
                  Pozrieť požiadavky
                </Link>
              }
            />
          )}
        </div>
      ) : (
        <div className="stack">
          {unique.length ? (
            unique.map((b) => {
              const trip = tripOf(b),
                companions = b.groupId
                  ? items.filter(
                      (x) => x.groupId === b.groupId && x.tripId === b.tripId && x.id !== b.id,
                    )
                  : [],
                linked = b.groupId
                  ? items.filter(
                      (x, index, all) =>
                        x.groupId === b.groupId &&
                        x.tripId !== b.tripId &&
                        (b.ruleId || (x.from === b.to && x.to === b.from)) &&
                        all.findIndex((y) => y.groupId === b.groupId && y.tripId === x.tripId) ===
                          index,
                    )
                  : []
              return (
                <article className="card journey-card" key={b.id}>
                  <div className="journey-icon">
                    <Ticket />
                  </div>
                  <div className="journey-info">
                    <div className="journey-heading">
                      <h3>
                        {tripPlaceName(state, trip, b.from)} → {tripPlaceName(state, trip, b.to)}
                      </h3>
                      <Badge
                        status={
                          b.status === 'cancelled'
                            ? 'cancelled'
                            : trip.status === 'completed'
                              ? 'completed'
                              : 'confirmed'
                        }
                      />
                    </div>
                    <p>
                      <CalendarDays size={15} />
                      {dateLabel(trip.date)} · {tripTime(trip, b.from)}{' '}
                      <span className="inline-separator">/</span> {b.name} · {b.seats}{' '}
                      {b.seats === 1 ? 'miesto' : 'miesta'}
                    </p>
                    {companions.length > 0 && (
                      <small className="journey-companions">
                        Spolu cestujú aj:{' '}
                        {companions
                          .map(
                            (p) => `${p.name} · ${p.seats} ${p.seats === 1 ? 'miesto' : 'miesta'}`,
                          )
                          .join(', ')}
                      </small>
                    )}
                    {linked.map((l) => (
                      <small key={l.id} className="linked-return">
                        ↔ Späť {dateLabel(tripOf(l).date)} o {tripTime(tripOf(l), l.from)} · rovnaká
                        rezervácia
                      </small>
                    ))}
                    {trip.status === 'active' && <Badge status={b.riderStatus} />}
                    {b.ruleId && (
                      <small className="linked-return">
                        Pravidelná rezervácia · konkrétny potvrdený dátum
                      </small>
                    )}
                    {b.noShow && (
                      <small className="muted">
                        {b.noShow.status === 'corrected'
                          ? 'Chybná neúčasť bola opravená.'
                          : b.noShow.status === 'reported'
                            ? 'Nahlásená neúčasť čaká na overenie dispečerom.'
                            : 'Neúčasť overená dispečerom. Pri nesúhlase kontaktujte podporu.'}
                      </small>
                    )}
                  </div>
                  <div className="journey-actions">
                    {requestBookingWithdrawalError(state, b) && (
                      <p className="small muted">{requestBookingWithdrawalError(state, b)}</p>
                    )}
                    <button className="btn btn-secondary" onClick={() => setDetail(b)}>
                      Detail <ArrowRight size={16} />
                    </button>
                    {canCancel(b) && (
                      <button className="text-link danger-text" onClick={() => setCancel(b)}>
                        Zrušiť rezerváciu
                      </button>
                    )}
                  </div>
                </article>
              )
            })
          ) : (
            <Empty
              title={tab === 'history' ? 'Vaše predošlé cesty budú tu' : 'Kam sa vydáme nabudúce?'}
              text={
                tab === 'history'
                  ? 'Dokončené aj zrušené rezervácie nájdete v histórii.'
                  : 'Zatiaľ nemáte nadchádzajúcu rezerváciu.'
              }
              action={
                <Link to="/passenger/search" className="btn">
                  Vyhľadať spojenie
                </Link>
              }
            />
          )}
        </div>
      )}
      {detail && (
        <Modal title="Detail rezervácie" onClose={() => setDetail(null)}>
          <div className="stack">
            <Badge
              status={
                detail.status === 'cancelled'
                  ? 'cancelled'
                  : tripOf(detail).status === 'completed'
                    ? 'completed'
                    : 'confirmed'
              }
            />
            <p>
              <strong>{detail.name}</strong> · {detail.seats}{' '}
              {detail.seats === 1 ? 'miesto' : 'miesta'}
            </p>
            <TripCard trip={tripOf(detail)} from={detail.from} to={detail.to} />
            {detail.groupId &&
              state.bookings
                .filter((b) => b.groupId === detail.groupId && b.mine && b.id !== detail.id)
                .map((b) => (
                  <div key={b.id} className="stack">
                    <p>
                      <strong>{b.name}</strong> · {b.seats} {b.seats === 1 ? 'miesto' : 'miesta'}
                    </p>
                    <TripCard trip={tripOf(b)} from={b.from} to={b.to} />
                  </div>
                ))}
            <Notice>
              Stav u vodiča:{' '}
              {detail.riderStatus === 'expected'
                ? 'čaká na nástup'
                : detail.riderStatus === 'boarded'
                  ? 'vo vozidle'
                  : detail.riderStatus === 'alighted'
                    ? 'cesta ukončená'
                    : 'neprišiel'}
              .
            </Notice>
            {canCancel(detail) && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setCancel(detail)
                  setDetail(null)
                }}
              >
                Zrušiť rezerváciu
              </button>
            )}
          </div>
        </Modal>
      )}
      {cancel && (
        <Modal title="Zrušiť rezerváciu?" onClose={() => setCancel(null)}>
          <p>
            Miesto sa uvoľní pre ďalších cestujúcich.
            {cancel.groupId
              ? ' Zrušia sa všetky vaše miesta v tejto spojenej rezervácii. Pri spiatočnej ceste sa zrušia obe strany.'
              : ''}
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setCancel(null)}>
              Ponechať rezerváciu
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                act(
                  { type: 'cancelBooking', id: cancel.id },
                  'Rezervácia bola zrušená. Miesto je opäť dostupné.',
                )
                setCancel(null)
              }}
            >
              Áno, zrušiť
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
