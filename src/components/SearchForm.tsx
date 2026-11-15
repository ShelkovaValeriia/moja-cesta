import { DateInput } from './DateInput'
import { TimePicker } from './TimePicker'
import { useState } from 'react'
import { ArrowDownUp, ArrowRight, Search } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../context'
import { readQuery, queryString, chronologyError } from '../search'
import type { SearchQuery } from '../types'
import { JourneyPlaceField } from './JourneyPlaceField'
import { RegularStopsNotice } from './RegularStopsNotice'
import { samePlace } from '../places'
import { PersonSelect } from './ui'
import { TimeOptions } from './TimeOptions'
export function SearchForm() {
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate(),
    { state } = useStore()
  const [q, setQ] = useState<SearchQuery>(() => readQuery(params)),
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
    if (!state.people.some((p) => p.id === q.personId)) {
      setError('Vyberte cestujúceho.')
      return
    }
    if (!Number.isInteger(q.seats) || q.seats < 1 || q.seats > 8) {
      setError('Vyberte 1 až 8 cestujúcich.')
      return
    }
    if (!state.stops.some((s) => s.id === q.from) || !state.stops.some((s) => s.id === q.to)) {
      setError('Vyberte obe zastávky z ponuky.')
      return
    }
    if (q.from === q.to && ((!q.fromPlace && !q.toPlace) || samePlace(q.fromPlace, q.toPlace))) {
      setError('Vyberte dve rôzne zastávky.')
      return
    }
    if (q.date < state.serviceDate) {
      setError('Vyberte dnešný alebo budúci dátum.')
      return
    }
    const chronology = chronologyError(state, q)
    if (chronology) {
      setError(chronology)
      return
    }
    navigate(`/passenger/results?${queryString(q)}`)
  }
  return (
    <form className="card journey-search-form" onSubmit={submit}>
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
          label="Pre koho hľadáte cestu?"
          value={q.personId}
          onChange={(value) => set('personId', value)}
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
      <div className="search-stop-fields">
        <JourneyPlaceField label="Odkiaľ" side="from" query={q} onChange={update} />
        <button
          type="button"
          className="exchange-stops"
          aria-label="Vymeniť zastávky"
          onClick={() =>
            update({
              ...q,
              from: q.to,
              to: q.from,
              fromPlace: q.toPlace,
              toPlace: q.fromPlace,
              fromStopConfirmed: q.toStopConfirmed,
              toStopConfirmed: q.fromStopConfirmed,
            })
          }
        >
          <ArrowDownUp size={19} />
        </button>
        <JourneyPlaceField label="Kam" side="to" query={q} onChange={update} />
      </div>
      <RegularStopsNotice query={q} onChange={update} />
      <div className="form-grid">
        <label className="field">
          <span>Dátum</span>
          <DateInput
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
              <DateInput
                min={q.date}
                required
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
          <p className="muted small">Cestu tam aj späť potvrdíme spoločne.</p>
        </section>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="btn btn-wide journey-primary" type="submit">
        <Search size={20} />
        Hľadať
        <ArrowRight size={19} />
      </button>
    </form>
  )
}
