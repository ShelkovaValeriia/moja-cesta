import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, ArrowDownUp, BusFront, Check, MapPin } from 'lucide-react'
import { useStore } from '../context'
import { SearchForm } from '../components/SearchForm'
import { regularStopsAccepted } from '../places'
import { RegularStopsNotice } from '../components/RegularStopsNotice'
import { SearchSummary } from '../components/SearchSummary'
import { availableTrips, queryString, readQuery, validReturn } from '../search'
import type { Trip } from '../types'
import { Empty, Notice, PageTitle, StopTimeline, TripCard } from '../components/ui'
export function SearchPage() {
  return (
    <div className="passenger-flow search-step">
      <PageTitle
        title="Vyhľadať spojenie"
        description="Vyberte si, odkiaľ, kam a kedy chcete cestovať."
        back="/passenger"
        action={
          <Link className="text-link" to="/passenger/journeys">
            Moje cesty <ArrowRight size={17} />
          </Link>
        }
      />
      <SearchForm />
    </div>
  )
}
function SelectableTrip({
  trip,
  from,
  to,
  selected,
  onSelect,
}: {
  trip: Trip
  from: string
  to: string
  selected: boolean
  onSelect: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={selected ? 'selected-trip' : ''}>
      <TripCard
        trip={trip}
        from={from}
        to={to}
        action={
          <button
            className={`btn ${selected ? '' : 'btn-secondary'}`}
            aria-pressed={selected}
            onClick={onSelect}
          >
            {selected ? (
              <>
                <Check size={16} />
                Vybrané
              </>
            ) : (
              'Vybrať spoj'
            )}
          </button>
        }
      />
      <button
        className="stops-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <MapPin size={15} />
        {expanded ? 'Skryť zastávky' : 'Zobraziť zastávky'}
      </button>
      {expanded && (
        <div className="card">
          <StopTimeline trip={trip} from={from} to={to} />
        </div>
      )}
    </div>
  )
}
export function ResultsPage() {
  const { state } = useStore(),
    [params, setParams] = useSearchParams(),
    q = readQuery(params),
    qs = queryString(q)
  const [outbound, setOutbound] = useState(params.get('outboundTripId') ?? ''),
    [inbound, setInbound] = useState(params.get('returnTripId') ?? '')
  const matches = availableTrips(state, q),
    allReturns = q.roundTrip ? availableTrips(state, q, true) : []
  const out = matches.find((t) => t.id === outbound)
  const returns = allReturns.filter((t) =>
    out ? validReturn(out, t, q) : !matches.length || matches.some((o) => validReturn(o, t, q)),
  )
  const back = returns.find((t) => t.id === inbound)
  const hasPair = matches.some((o) => allReturns.some((b) => validReturn(o, b, q)))
  const ready = !!out && (!q.roundTrip || !!back) && regularStopsAccepted(q)
  function choose(outId: string, backId: string) {
    setOutbound(outId)
    setInbound(backId)
    const next = new URLSearchParams(qs)
    if (outId) next.set('outboundTripId', outId)
    if (backId) next.set('returnTripId', backId)
    setParams(next, { replace: true })
  }
  const nextParams = new URLSearchParams(qs)
  if (out) nextParams.set('outboundTripId', out.id)
  if (q.roundTrip && back) nextParams.set('returnTripId', back.id)
  return (
    <div className="passenger-flow options-step">
      <PageTitle title="Možnosti cesty" back={`/passenger/search?${qs}`} />
      <SearchSummary query={q} />
      <RegularStopsNotice
        query={q}
        onChange={(next) => {
          const p = new URLSearchParams(queryString(next))
          if (outbound) p.set('outboundTripId', outbound)
          if (inbound) p.set('returnTripId', inbound)
          setParams(p, { replace: true })
        }}
      />
      <div className="journey-options">
        <section aria-labelledby="regular-option">
          <div className="section-heading">
            <h2 id="regular-option">
              <BusFront size={23} />
              Pravidelný spoj
            </h2>
            <span className="muted small">
              {matches.length} {matches.length === 1 ? 'spoj' : 'spoje'}
            </span>
          </div>
          {q.roundTrip && (
            <Notice tone={hasPair ? 'success' : 'warning'}>
              <strong>
                {hasPair
                  ? 'Oba smery sú dostupné'
                  : matches.length || allReturns.length
                    ? 'Jedna strana čaká na riešenie'
                    : 'Nie je možné potvrdiť oba smery'}
              </strong>
              <p>
                {hasPair
                  ? 'Vyberte jeden spoj pre cestu tam a jeden pre cestu späť. Obe rezervácie potvrdíme naraz.'
                  : 'O obe strany môžete požiadať po prezretí existujúcich požiadaviek. Samostatná jednosmerná rezervácia nevznikne.'}
              </p>
            </Notice>
          )}
          {!matches.length && (
            <Empty
              title="Nenašli sme pravidelný spoj s voľným miestom"
              text={`Pre vašu skupinu (${q.seats} ${q.seats === 1 ? 'miesto' : 'miesta'}) nie je v tomto čase dostupné spojenie. Zmeňte vyhľadávanie alebo si nižšie pozrite požiadavky.`}
            />
          )}
          <section className="stack" aria-label="Cesta tam">
            <h3 className="direction-title">
              <ArrowRight size={17} />
              Cesta tam
            </h3>
            {matches.map((t) => (
              <SelectableTrip
                key={t.id}
                trip={t}
                from={q.from}
                to={q.to}
                selected={out?.id === t.id}
                onSelect={() => choose(t.id, back && validReturn(t, back, q) ? back.id : '')}
              />
            ))}
          </section>
          {q.roundTrip && (
            <section className="stack return-results" aria-label="Cesta späť">
              <h3 className="direction-title">
                <ArrowDownUp size={17} />
                Cesta späť
              </h3>
              {returns.length ? (
                returns.map((t) => (
                  <SelectableTrip
                    key={t.id}
                    trip={t}
                    from={q.to}
                    to={q.from}
                    selected={back?.id === t.id}
                    onSelect={() => choose(out?.id ?? '', t.id)}
                  />
                ))
              ) : (
                <Empty
                  title="Spiatočný spoj nie je dostupný"
                  text="Jednu stranu samostatne nepotvrdíme. Pozrite si požiadavky na spoločnú cestu tam aj späť."
                />
              )}
            </section>
          )}
          <div className="selection-continue">
            {ready ? (
              <Link
                className="btn btn-wide journey-primary"
                to={`/passenger/book/${out.id}?${nextParams.toString()}`}
              >
                {q.roundTrip ? 'Rezervovať cestu tam aj späť' : 'Pokračovať k rezervácii'}
                <ArrowRight size={18} />
              </Link>
            ) : (
              <>
                <button className="btn btn-wide journey-primary" disabled>
                  {q.roundTrip ? 'Rezervovať cestu tam aj späť' : 'Pokračovať k rezervácii'}
                  <ArrowRight size={18} />
                </button>
                <p className="small muted">
                  {!regularStopsAccepted(q)
                    ? 'Najskôr potvrďte navrhnuté zastávky pre pravidelný spoj.'
                    : q.roundTrip
                      ? 'Najskôr vyberte spoj v oboch smeroch.'
                      : 'Najskôr vyberte spoj.'}
                </p>
              </>
            )}
          </div>
        </section>
        <section className="card request-option" aria-labelledby="request-option">
          <span className="icon-tile">
            <MapPin size={25} />
          </span>
          <div>
            <h2 id="request-option">Zadať požiadavku</h2>
            <p>
              Nevyhovuje vám pravidelný spoj? Pozrite si existujúce požiadavky alebo vytvorte
              vlastnú.
            </p>
          </div>
          <Link to={`/passenger/requests?${qs}`} className="btn btn-wide journey-primary">
            Pozrieť požiadavky <ArrowRight size={18} />
          </Link>
        </section>
      </div>
    </div>
  )
}
