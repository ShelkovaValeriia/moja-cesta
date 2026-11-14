import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, CalendarDays, Clock3, MapPin, Plus, UsersRound } from 'lucide-react'
import { useStore } from '../context'
import { dateLabel, uid } from '../data'
import { requestParticipants, stopName } from '../domain'
import { matchingRequests, queryString, readQuery } from '../search'
import { coordinates, hasCustomPlaces, samePlace } from '../places'
import type { SearchQuery } from '../types'
import { SearchSummary } from '../components/SearchSummary'
import { RegionMap } from '../components/Illustrations'
import { TimeOptions } from '../components/TimeOptions'
import { TimePicker } from '../components/TimePicker'
import { JourneyPlaceField } from '../components/JourneyPlaceField'
import { Badge, Empty, Notice, PageTitle, PersonSelect, RequestCard } from '../components/ui'
export function RequestsPage() {
  const { state } = useStore(),
    [params, setParams] = useSearchParams(),
    hasSearch = params.has('from') && params.has('to'),
    q = readQuery(params),
    qs = params.size ? `?${params.toString()}` : '',
    showAll = params.get('view') === 'all',
    date = params.get('filterDate') ?? '',
    direction = params.get('filterTo') ?? ''
  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const requests = (
    hasSearch && !showAll
      ? matchingRequests(state, q)
      : state.requests.filter((r) => r.status === 'pending' || r.status === 'approved')
  ).filter((r) => (!date || r.date === date) && (!direction || r.to === direction))
  return (
    <div className="passenger-flow map-step">
      <PageTitle
        title="Požiadavky na mape"
        back={hasSearch ? `/passenger/results${qs}` : '/passenger'}
      />
      {hasSearch ? (
        <SearchSummary query={q} />
      ) : (
        <p className="map-intro">
          Pozrite si spoločné cesty v okolí alebo{' '}
          <Link className="text-link" to="/passenger/search">
            vyhľadajte svoju trasu <ArrowRight size={16} />
          </Link>
          .
        </p>
      )}
      <RegionMap requests={requests} />
      <div className="requests-toolbar">
        <div>
          <h2>
            Dostupné požiadavky <span className="count">{requests.length}</span>
          </h2>
          <p className="muted small">
            {hasSearch && !showAll
              ? 'Rovnaké zastávky a dátum, čas v rozmedzí ±60 minút.'
              : 'Existujúce autobusové požiadavky v regióne.'}
          </p>
        </div>
        {hasSearch && (
          <button
            className="text-link"
            onClick={() => {
              const next = new URLSearchParams(params)
              if (showAll) next.delete('view')
              else next.set('view', 'all')
              next.delete('filterDate')
              next.delete('filterTo')
              setParams(next, { replace: true })
            }}
          >
            {showAll ? 'Iba pre moje vyhľadávanie' : 'Zobraziť všetky požiadavky'}
          </button>
        )}
      </div>
      {(!hasSearch || showAll) && (
        <div className="request-filters">
          <label className="field">
            <span>Filter podľa dátumu</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setFilter('filterDate', e.target.value)}
            />
          </label>
          <label className="field">
            <span>Smer</span>
            <select value={direction} onChange={(e) => setFilter('filterTo', e.target.value)}>
              <option value="">Všetky smery</option>
              {state.stops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="request-grid">
        {requests.map((r) => (
          <RequestCard key={r.id} request={r} search={qs} />
        ))}
      </div>
      {!requests.length && (
        <Empty
          title="Nenašli sme vhodnú požiadavku"
          text="Pre túto trasu, dátum a čas zatiaľ nikto nepožiadal o jazdu. Vytvorte novú požiadavku s už vyplnenými údajmi."
        />
      )}
      <div className="map-create-action">
        <Link className="btn btn-wide journey-primary" to={`/passenger/requests/new${qs}`}>
          <Plus size={20} />
          Vytvoriť novú požiadavku
        </Link>
        <p>Požiadavka ešte nie je potvrdená jazda. Dostupnosť preverí dispečer.</p>
      </div>
    </div>
  )
}
export function RequestDetail() {
  const { id } = useParams(),
    [params, setParams] = useSearchParams(),
    { state, act } = useStore(),
    q = readQuery(params),
    [person, setPerson] = useState(q.personId),
    [seats, setSeats] = useState(q.seats)
  function updateJoin(personId: string, count: number) {
    setPerson(personId)
    setSeats(count)
    const next = new URLSearchParams(params)
    next.set('personId', personId)
    next.set('seats', String(count))
    setParams(next, { replace: true })
  }
  const r = state.requests.find((r) => r.id === id),
    qs = (() => {
      const next = new URLSearchParams(params)
      next.delete('created')
      return next.size ? `?${next.toString()}` : ''
    })()
  if (!r)
    return (
      <>
        <PageTitle title="Požiadavka sa nenašla" back={`/passenger/requests${qs}`} />
        <Empty
          text="Mohla byť odstránená po obnovení demo údajov."
          action={
            <Link className="btn" to={`/passenger/requests${qs}`}>
              Späť na požiadavky
            </Link>
          }
        />
      </>
    )
  const canViewPlace = r.createdByMe === true
  const availablePeople = state.people.filter((p) => !r.members.includes(p.id)),
    remaining = 8 - r.passengers
  const fallbackQuery = queryString({
    ...q,
    from: r.from,
    to: r.to,
    date: r.date,
    time: r.time,
    timeMode: r.timeMode,
    timePreference: r.timePreference ?? 'none',
    roundTrip: !!r.returnDate,
    returnDate: r.returnDate ?? r.date,
    returnTime: r.returnTime ?? '17:00',
    returnTimeMode: r.returnTimeMode ?? 'departure',
    returnTimePreference: r.returnTimePreference ?? 'none',
    fromPlace: canViewPlace ? r.fromPlace : undefined,
    toPlace: canViewPlace ? r.toPlace : undefined,
  })
  return (
    <div className="passenger-flow request-detail-step">
      <PageTitle title="Detail požiadavky" back={`/passenger/requests${qs}`} />
      {params.get('created') === 'true' && (
        <Notice tone="success">
          <strong>Požiadavka bola odoslaná.</strong>
          <p>Nájdete ju v časti Moje cesty. Teraz čaká na posúdenie dispečerom.</p>
        </Notice>
      )}
      {params.has('from') && <SearchSummary query={{ ...q, personId: person, seats }} />}
      <div className="detail-grid request-detail-layout">
        <div className="card detail-card">
          <div className="section-heading">
            <span className="line-label">
              <MapPin size={18} />
              Doprava na požiadanie
            </span>
            <Badge status={r.status} />
          </div>
          <div className="request-route">
            <div>
              <span className="route-endpoint" />
              <div>
                <small>ODKIAĽ</small>
                <h2>
                  {canViewPlace
                    ? (r.fromPlace?.name ?? stopName(state, r.from))
                    : stopName(state, r.from)}
                </h2>
              </div>
            </div>
            <i />
            <div>
              <span className="route-endpoint filled" />
              <div>
                <small>KAM</small>
                <h2>
                  {canViewPlace
                    ? (r.toPlace?.name ?? stopName(state, r.to))
                    : stopName(state, r.to)}
                </h2>
              </div>
            </div>
          </div>
          <div className="detail-facts">
            <div>
              <CalendarDays />
              <span>
                Dátum<strong>{dateLabel(r.date)}</strong>
              </span>
            </div>
            <div>
              <Clock3 />
              <span>
                {r.timeMode === 'arrival' ? 'Príchod do' : 'Odchod'}
                <strong>{r.time}</strong>
              </span>
            </div>
            <div>
              <UsersRound />
              <span>
                Záujem o jazdu
                <strong>
                  {r.passengers} {r.passengers === 1 ? 'cestujúci' : 'cestujúcich'}
                </strong>
              </span>
            </div>
          </div>
          {hasCustomPlaces(r) && !canViewPlace && (
            <Notice>
              Presné navrhované miesto nie je verejné. Je dostupné iba autorovi a oprávnenému
              prevádzkovému tímu.
            </Notice>
          )}
          {hasCustomPlaces(r) && (
            <Notice tone={r.placesStatus === 'approved' ? 'success' : 'warning'}>
              <strong>
                {r.placesStatus === 'approved'
                  ? 'Miesta boli schválené dispečerom'
                  : 'Navrhované miesta čakajú na súhlas dispečera'}
              </strong>
              {canViewPlace && r.fromPlace?.type === 'custom' && (
                <p>
                  Nástup: {r.fromPlace.name} · {coordinates(r.fromPlace)}
                </p>
              )}
              {canViewPlace && r.toPlace?.type === 'custom' && (
                <p>
                  Výstup: {r.toPlace.name} · {coordinates(r.toPlace)}
                </p>
              )}
            </Notice>
          )}
          <p className="request-interest">
            O túto cestu má záujem {r.passengers}{' '}
            {r.passengers === 1 ? 'človek' : r.passengers <= 4 ? 'ľudia' : 'ľudí'}.
          </p>
          {r.returnDate && (
            <Notice>
              <strong>Spiatočná cesta</strong>
              <p>
                Návrat {dateLabel(r.returnDate)} ·{' '}
                {r.returnTimeMode === 'arrival' ? 'Príchod do' : 'Odchod'} {r.returnTime}. Oba smery
                sa posudzujú spoločne.
              </p>
            </Notice>
          )}
          {canViewPlace && r.accessibility && (
            <p className="muted">Dostupnosť: {r.accessibility}</p>
          )}
          {r.status === 'rejected' && (
            <Notice tone="warning">
              <strong>Dôvod zamietnutia</strong>
              <p>{r.reason}</p>
            </Notice>
          )}
        </div>
        <aside className="card detail-aside">
          <h2>
            {r.members.length
              ? 'Ste súčasťou tejto cesty'
              : r.status === 'pending'
                ? 'Pridať sa k požiadavke'
                : 'Stav požiadavky'}
          </h2>
          <p className="muted">
            {r.status === 'approved'
              ? 'Dispečer naplánoval demonštračnú jazdu. Účastníci majú miesto v zozname cestujúcich.'
              : 'Pridaním sa zvýšite počet záujemcov o túto požiadavku. Potvrdenie jazdy zatiaľ nie je zaručené.'}
          </p>
          {r.members.length > 0 && (
            <div className="joined-passengers">
              <Badge status={r.status} />
              {Object.entries(requestParticipants(r)).map(([personId, n]) => (
                <p key={personId}>
                  {state.people.find((p) => p.id === personId)?.name} · {n}{' '}
                  {n === 1 ? 'miesto' : 'miesta'}
                </p>
              ))}
              <Link className="btn btn-secondary btn-wide" to="/passenger/journeys?tab=requests">
                Zobraziť moje cesty <ArrowRight size={17} />
              </Link>
            </div>
          )}
          {r.status === 'pending' && availablePeople.length > 0 && remaining > 0 && (
            <form
              className="join-request-form"
              onSubmit={(e) => {
                e.preventDefault()
                act(
                  { type: 'joinRequest', id: r.id, personId: person, seats },
                  'Pridali ste sa k požiadavke. Jazda zatiaľ nie je potvrdená.',
                )
              }}
            >
              {r.members.length > 0 && <h3>Pridať ďalšieho cestujúceho</h3>}
              {r.members.includes(person) && (
                <Notice>
                  Tento cestujúci sa už pridal. Pre ďalšiu osobu vyberte iný rodinný profil.
                </Notice>
              )}
              <PersonSelect
                label="Pre koho rezervujete"
                value={person}
                onChange={(id) => updateJoin(id, seats)}
                excludedIds={r.members}
              />
              <label className="field">
                <span>Počet cestujúcich</span>
                <input
                  type="number"
                  min={1}
                  max={remaining}
                  required
                  value={seats}
                  onChange={(e) => updateJoin(person, Number(e.target.value))}
                />
              </label>
              <p className="small muted">
                K požiadavke sa môže pridať ešte {remaining}{' '}
                {remaining === 1 ? 'cestujúci' : 'cestujúcich'}.
              </p>
              <button
                className="btn btn-wide journey-primary"
                type="submit"
                disabled={
                  r.members.includes(person) ||
                  seats > remaining ||
                  !state.people.some((p) => p.id === person)
                }
              >
                <Plus size={19} />
                Pridať sa k požiadavke
              </button>
            </form>
          )}
          {r.status === 'pending' && remaining <= 0 && (
            <Notice>Požiadavka už dosiahla kapacitu 8 cestujúcich.</Notice>
          )}
          {r.status === 'pending' && availablePeople.length === 0 && (
            <Notice>
              Všetci vaši rodinní cestujúci sa už pridali. Rovnakého cestujúceho nemožno pridať
              znova.
            </Notice>
          )}
          {r.members.length > 0 && r.status !== 'rejected' && r.status !== 'cancelled' && (
            <button
              className="btn btn-ghost btn-wide"
              onClick={() => act({ type: 'cancelRequest', id: r.id }, 'Vaša účasť bola zrušená.')}
            >
              Zrušiť moju účasť
            </button>
          )}
          {r.status !== 'pending' && !r.members.length && (
            <Link
              className="btn btn-secondary btn-wide"
              to={`/passenger/requests/new${qs || `?${fallbackQuery}`}`}
            >
              Vytvoriť vlastnú požiadavku
            </Link>
          )}
          <Notice>
            {r.status === 'pending'
              ? 'Samotný záujem nie je rezervácia miesta. Dispečer preverí vozidlo aj nadväznosť na pravidelné spoje.'
              : 'Všetky zmeny prebiehajú iba v tejto demo aplikácii.'}
          </Notice>
        </aside>
      </div>
    </div>
  )
}
export function NewRequest() {
  const [params, setParams] = useSearchParams(),
    { state, act } = useStore(),
    navigate = useNavigate(),
    [q, setQ] = useState<SearchQuery>(() => readQuery(params)),
    [accessibility, setAccessibility] = useState(''),
    [error, setError] = useState('')
  function update(next: SearchQuery) {
    setQ(next)
    setParams(new URLSearchParams(queryString(next)), { replace: true })
  }
  const set = <K extends keyof SearchQuery>(key: K, value: SearchQuery[K]) =>
    update({
      ...q,
      [key]: value,
      ...(key === 'date' && String(value) > q.returnDate ? { returnDate: String(value) } : {}),
    })
  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (q.from === q.to && ((!q.fromPlace && !q.toPlace) || samePlace(q.fromPlace, q.toPlace))) {
      setError('Vyberte dve rôzne zastávky.')
      return
    }
    const id = uid()
    if (
      act(
        {
          type: 'createRequest',
          request: {
            id,
            from: q.from,
            to: q.to,
            fromPlace: q.fromPlace,
            toPlace: q.toPlace,
            date: q.date,
            time: q.time,
            timeMode: q.timeMode,
            timePreference: q.timePreference,
            passengers: q.seats,
            personId: q.personId,
            ownSeats: q.seats,
            members: [q.personId],
            status: 'pending',
            returnDate: q.roundTrip ? q.returnDate : undefined,
            returnTime: q.roundTrip ? q.returnTime : undefined,
            returnTimeMode: q.roundTrip ? q.returnTimeMode : undefined,
            returnTimePreference: q.roundTrip ? q.returnTimePreference : undefined,
            accessibility,
          },
        },
        'Požiadavka bola odoslaná. Nájdete ju aj v časti Moje cesty.',
      )
    )
      navigate(`/passenger/requests/${id}?${queryString(q)}&created=true`)
  }
  return (
    <div className="passenger-flow new-request-step">
      <PageTitle
        eyebrow="DOPRAVA PODĽA VÁS"
        title="Nová požiadavka"
        description="Povedzte nám, čo potrebujete. O ďalšom postupe rozhodne dispečer."
        back={`/passenger/requests?${queryString(q)}`}
      />
      <div className="detail-grid new-request-layout">
        <form className="card form-card" onSubmit={submit}>
          <fieldset>
            <legend>Typ cesty</legend>
            <div className="segmented journey-type">
              <button
                type="button"
                aria-pressed={!q.roundTrip}
                className={!q.roundTrip ? 'selected' : ''}
                onClick={() => set('roundTrip', false)}
              >
                Jednosmerná
              </button>
              <button
                type="button"
                aria-pressed={q.roundTrip}
                className={q.roundTrip ? 'selected' : ''}
                onClick={() => set('roundTrip', true)}
              >
                Spiatočná
              </button>
            </div>
          </fieldset>
          <div className="form-grid">
            <PersonSelect
              label="Pre koho rezervujete"
              value={q.personId}
              onChange={(v) => set('personId', v)}
            />
            <label className="field">
              <span>Počet cestujúcich</span>
              <input
                type="number"
                required
                min={1}
                max={8}
                value={q.seats}
                onChange={(e) => set('seats', Number(e.target.value))}
              />
            </label>
          </div>
          <Link to="/passenger/profile" className="text-link small">
            Pridať človeka do rodiny <ArrowRight size={14} />
          </Link>
          <h2>Kam sa potrebujete dostať?</h2>
          <div className="form-grid">
            <JourneyPlaceField label="Odkiaľ" side="from" query={q} onChange={update} />
            <JourneyPlaceField label="Kam" side="to" query={q} onChange={update} />
            <label className="field">
              <span>Dátum</span>
              <input
                type="date"
                required
                min={state.serviceDate}
                value={q.date}
                onChange={(e) => set('date', e.target.value)}
              />
            </label>
            <TimePicker label="Čas" value={q.time} onChange={(value) => set('time', value)} />
          </div>
          <TimeOptions
            mode={q.timeMode}
            preference={q.timePreference}
            onModeChange={(v) => set('timeMode', v)}
            onPreferenceChange={(v) => set('timePreference', v)}
          />
          {q.roundTrip && (
            <section className="return-search-fields" aria-label="Cesta späť">
              <h2>Cesta späť</h2>
              <div className="form-grid">
                <label className="field">
                  <span>Dátum návratu</span>
                  <input
                    type="date"
                    required
                    min={q.date}
                    value={q.returnDate}
                    onChange={(e) => set('returnDate', e.target.value)}
                  />
                </label>
                <TimePicker
                  label="Čas návratu"
                  value={q.returnTime}
                  onChange={(value) => set('returnTime', value)}
                />
              </div>
              <TimeOptions
                returning
                mode={q.returnTimeMode}
                preference={q.returnTimePreference}
                onModeChange={(v) => set('returnTimeMode', v)}
                onPreferenceChange={(v) => set('returnTimePreference', v)}
              />
              <p className="small muted">
                Obe strany sa posúdia spoločne. Samostatná jednosmerná rezervácia nevznikne.
              </p>
            </section>
          )}
          <label className="field">
            <span>
              Požiadavky na dostupnosť <small>nepovinné</small>
            </span>
            <textarea
              maxLength={300}
              rows={3}
              placeholder="Napríklad pomoc pri nastupovaní alebo miesto na pomôcku."
              value={accessibility}
              onChange={(e) => setAccessibility(e.target.value)}
            />
          </label>
          {hasCustomPlaces(q) && (
            <Notice>
              Vlastné body sa odošlú ako navrhované miesta nástupu alebo výstupu. Musí ich schváliť
              dispečer.
            </Notice>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-wide journey-primary">
            Odoslať požiadavku <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </div>
  )
}
