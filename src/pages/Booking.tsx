import { regularStopsAccepted } from '../places'
import { RegularStopsNotice } from '../components/RegularStopsNotice'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, ArrowDownUp, Check, ShieldCheck, Ticket, UsersRound } from 'lucide-react'
import { useStore } from '../context'
import { freeSeats, tripTime, villageName } from '../domain'
import { dateLabel, uid } from '../data'
import { queryString, readQuery, validReturn } from '../search'
import { Notice, PageTitle, StopTimeline, TripCard } from '../components/ui'
export function BookingPage() {
  const { id } = useParams(),
    [params, setParams] = useSearchParams(),
    { state, act } = useStore(),
    navigate = useNavigate(),
    q = readQuery(params)
  const t = state.trips.find((t) => t.id === id),
    r = state.trips.find((t) => t.id === params.get('returnTripId')),
    person = state.people.find((p) => p.id === q.personId)
  const [success, setSuccess] = useState(false)
  const from = params.get('from') ?? t?.stops[0].stopId ?? '',
    to = params.get('to') ?? t?.stops.at(-1)?.stopId ?? ''
  const resultParams = new URLSearchParams(queryString(q))
  if (t) resultParams.set('outboundTripId', t.id)
  if (r) resultParams.set('returnTripId', r.id)
  const backUrl = `/passenger/results?${resultParams.toString()}`
  if (!t)
    return (
      <>
        <PageTitle title="Spoj sa nenašiel" back={backUrl} />
        <Notice tone="warning">
          Vyhľadajte spojenie znova. Demonštračné údaje sa mohli obnoviť.
        </Notice>
      </>
    )
  const capacity = Math.min(
      freeSeats(state, t, from, to),
      ...(q.roundTrip && r ? [freeSeats(state, r, to, from)] : []),
    ),
    valid =
      Number.isInteger(q.seats) &&
      q.seats >= 1 &&
      q.seats <= 8 &&
      !!person &&
      regularStopsAccepted(q) &&
      t.status === 'scheduled' &&
      (!q.roundTrip || (!!r && r.status === 'scheduled' && validReturn(t, r, q))) &&
      capacity >= q.seats
  function confirm(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || !person) return
    if (
      act(
        {
          type: 'book',
          id: uid(),
          personId: person.id,
          seats: q.seats,
          search: { ...q, from, to },
          legs: [
            { tripId: t!.id, from, to },
            ...(q.roundTrip && r ? [{ tripId: r.id, from: to, to: from }] : []),
          ],
        },
        q.roundTrip
          ? 'Obe cesty boli spoločne rezervované.'
          : 'Miesto bolo rezervované. Prajeme príjemnú cestu!',
      )
    )
      setSuccess(true)
  }
  if (success)
    return (
      <div className="success-page card">
        <span className="success-icon">
          <Check size={34} />
        </span>
        <p className="eyebrow">VŠETKO JE PRIPRAVENÉ</p>
        <h1>{q.roundTrip ? 'Tam aj späť. Bez starostí.' : 'Vaše miesto je rezervované.'}</h1>
        <p>
          {person?.name} · {q.seats} {q.seats === 1 ? 'miesto' : 'miesta'}
          <br />
          {villageName(state, from)} → {villageName(state, to)}
          <br />
          {dateLabel(t.date)} · {tripTime(t, from)}
          {q.roundTrip && r ? ` · Návrat ${dateLabel(r.date)} o ${tripTime(r, to)}` : ''}
        </p>
        <Notice tone="success">
          Demonštračná rezervácia sa uložila. Vodič už vidí cestujúceho vo svojom zozname.
        </Notice>
        <button className="btn" onClick={() => navigate('/passenger/journeys')}>
          <Ticket size={18} />
          Zobraziť moje cesty
          <ArrowRight size={18} />
        </button>
        <Link className="text-link" to="/passenger">
          Späť na domov
        </Link>
      </div>
    )
  return (
    <>
      <PageTitle
        eyebrow="VAŠE MIESTO NA CESTE"
        title={q.roundTrip ? 'Rezervácia cesty tam aj späť' : 'Rezervácia miesta'}
        description="Skontrolujte cestu a potvrďte vybrané miesta."
        back={backUrl}
      />
      <RegularStopsNotice
        query={q}
        onChange={(next) => {
          const updated = new URLSearchParams(params)
          new URLSearchParams(queryString(next)).forEach((value, key) => updated.set(key, value))
          setParams(updated, { replace: true })
        }}
      />
      <div className="detail-grid">
        <section className="stack">
          <TripCard trip={t} from={from} to={to} />
          <div className="card">
            <div className="inner-heading">
              <h3>Zastávky spoja</h3>
            </div>
            <StopTimeline trip={t} from={from} to={to} />
          </div>
          {q.roundTrip && r && (
            <>
              <h3 className="direction-title">
                <ArrowDownUp size={18} />
                Spiatočná cesta
              </h3>
              <TripCard trip={r} from={to} to={from} />
              <div className="card">
                <StopTimeline trip={r} from={to} to={from} />
              </div>
            </>
          )}
          {!valid && (
            <Notice tone="warning">
              {!person
                ? 'Cestujúci sa nenašiel. Vyberte ho znova vo vyhľadávaní.'
                : capacity < q.seats
                  ? 'Pre vašu skupinu už nie je dostatok miest. Vyberte iný spoj.'
                  : 'Obe strany musia byť dostupné a návrat musí nasledovať po príchode do cieľa.'}
              <Link className="text-link" to={`/passenger/requests?${queryString(q)}`}>
                Pozrieť požiadavky
              </Link>
            </Notice>
          )}
        </section>
        <form className="card form-card booking-form" onSubmit={confirm}>
          <span className="icon-tile">
            <Ticket />
          </span>
          <h2>Potvrdenie rezervácie</h2>
          <div className="booking-passengers" aria-label="Vybraní cestujúci">
            <UsersRound size={21} />
            <div>
              <strong>{person?.name ?? 'Neznámy cestujúci'}</strong>
              <p>
                {q.seats} {q.seats === 1 ? 'cestujúci · 1 miesto' : `cestujúci · ${q.seats} miesta`}
              </p>
            </div>
          </div>
          <Link className="text-link" to={`/passenger/search?${queryString(q)}`}>
            Zmeniť cestujúcich alebo počet miest
          </Link>
          <p className="availability">
            <span />
            {capacity} voľných miest {q.roundTrip ? 'v oboch smeroch' : 'na tomto úseku'}
          </p>
          <Notice>
            <ShieldCheck size={17} />
            Miesta potvrdíme pre cestujúcich a počet zvolený pri vyhľadávaní.
          </Notice>
          {q.roundTrip && (
            <p className="small muted">
              Oba smery potvrdíme spolu. Pri nedostatku miest sa nevytvorí ani jedna rezervácia.
            </p>
          )}
          <button className="btn btn-wide" disabled={!valid} type="submit">
            Potvrdiť rezerváciu
            <ArrowRight size={18} />
          </button>
          <p className="small muted">Demo verzia · Bez platby a registrácie.</p>
        </form>
      </div>
    </>
  )
}
