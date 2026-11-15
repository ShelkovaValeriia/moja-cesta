import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../context'
import { uid } from '../data'
import { dispatchPeople } from '../domain'
import type { TimeMode } from '../types'
import { Notice } from './ui'
import { SlovakDateInput } from './SlovakDateInput'
import { TimePicker } from './TimePicker'
import { formatPassengerCode } from '../passengerCodes'

function TimeCriteria({
  date,
  time,
  mode,
  onDate,
  onTime,
  onMode,
  returning = false,
}: {
  date: string
  time: string
  mode: TimeMode
  onDate: (value: string) => void
  onTime: (value: string) => void
  onMode: (value: TimeMode) => void
  returning?: boolean
}) {
  const { state } = useStore()
  return (
    <div className="form-grid">
      <SlovakDateInput
        label={returning ? 'Dátum návratu' : 'Dátum cesty'}
        min={state.serviceDate}
        value={date}
        onChange={onDate}
      />
      <label className="field">
        <span>{returning ? 'Čas návratu podľa' : 'Čas podľa'}</span>
        <select value={mode} onChange={(e) => onMode(e.target.value as TimeMode)}>
          <option value="departure">Odchodu</option>
          <option value="arrival">Príchodu do</option>
        </select>
      </label>
      <TimePicker label={returning ? 'Čas návratu' : 'Čas cesty'} value={time} onChange={onTime} />
    </div>
  )
}

export function PhoneRequestForm({ selectedId }: { selectedId: string | null }) {
  const { state, act } = useStore()
  const navigate = useNavigate()
  const [personId, setPersonId] = useState(selectedId ?? dispatchPeople(state)[0]?.id ?? '')
  const [lookup, setLookup] = useState('')
  const [lookupError, setLookupError] = useState(false)
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [date, setDate] = useState(state.serviceDate)
  const [time, setTime] = useState('08:00')
  const [timeMode, setTimeMode] = useState<TimeMode>('departure')
  const [seats, setSeats] = useState(1)
  const [roundTrip, setRoundTrip] = useState(false)
  const [returnDate, setReturnDate] = useState(state.serviceDate)
  const [returnTime, setReturnTime] = useState('16:00')
  const [returnMode, setReturnMode] = useState<TimeMode>('departure')
  const [assistance, setAssistance] = useState(
    dispatchPeople(state).find((p) => p.id === personId)?.mobility ?? '',
  )
  const person = dispatchPeople(state).find((p) => p.id === personId)
  function selectPerson(id: string) {
    setPersonId(id)
    setAssistance(dispatchPeople(state).find((p) => p.id === id)?.mobility ?? '')
  }
  return (
    <section className="card chart-card stack">
      <div>
        <h2>Nová telefonická požiadavka</h2>
        <p className="muted">Zapíšte, odkiaľ a kam sa cestujúci potrebuje dostať.</p>
      </div>
      <div className="phone-lookup">
        <label className="field">
          <span>Vyhľadať podľa identifikátora</span>
          <input
            value={lookup}
            onChange={(e) => {
              setLookup(e.target.value)
              setLookupError(false)
            }}
            placeholder="123 456 alebo MC-XXXXXXXX"
          />
        </label>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            const match = dispatchPeople(state).find(
              (p) =>
                p.id.toLowerCase() === lookup.trim().toLowerCase() ||
                p.passengerCode === lookup.replace(/\s+/g, ''),
            )
            setLookupError(!match)
            if (match) selectPerson(match.id)
          }}
        >
          Vyhľadať
        </button>
      </div>
      {lookupError && (
        <p className="field-error" role="alert">
          Cestujúci s týmto identifikátorom sa nenašiel.
        </p>
      )}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          const id = uid()
          if (
            act(
              {
                type: 'createPhoneRequest',
                request: {
                  id,
                  personId,
                  fromAddress,
                  toAddress,
                  date,
                  time,
                  timeMode,
                  seats,
                  assistance,
                  ...(roundTrip && {
                    returnJourney: { date: returnDate, time: returnTime, timeMode: returnMode },
                  }),
                },
              },
              'Telefonická požiadavka bola zapísaná. Čaká na naplánovanie.',
            )
          )
            navigate(`/dispatcher/support/phone?search=${encodeURIComponent(id)}`)
        }}
      >
        <fieldset>
          <legend>Typ cesty</legend>
          <div className="dispatch-actions">
            <label className="approve-place-checkbox">
              <input
                type="radio"
                name="phoneJourneyType"
                checked={!roundTrip}
                onChange={() => setRoundTrip(false)}
              />
              Jednosmerná
            </label>
            <label className="approve-place-checkbox">
              <input
                type="radio"
                name="phoneJourneyType"
                checked={roundTrip}
                onChange={() => setRoundTrip(true)}
              />
              Spiatočná
            </label>
          </div>
        </fieldset>
        <div className="form-grid">
          <label className="field">
            <span>Cestujúci</span>
            <select required value={personId} onChange={(e) => selectPerson(e.target.value)}>
              <option value="">Vyberte cestujúceho</option>
              {dispatchPeople(state).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.phoneManaged ? formatPassengerCode(p.passengerCode) : p.relation}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Počet cestujúcich</span>
            <input
              required
              type="number"
              min={1}
              step={1}
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
            />
          </label>
        </div>
        {person && (
          <p className="small muted">
            Kontakt: {person.contact || 'Neuvedený'}
            {person.passengerCode && (
              <>
                {' '}
                · ID cestujúceho: <strong>{formatPassengerCode(person.passengerCode)}</strong>
              </>
            )}
          </p>
        )}
        <div className="form-grid">
          <label className="field">
            <span>Adresa odchodu</span>
            <input
              required
              minLength={3}
              maxLength={200}
              autoComplete="off"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="Ulica, číslo domu, obec"
            />
          </label>
          <label className="field">
            <span>Cieľová adresa</span>
            <input
              required
              minLength={3}
              maxLength={200}
              autoComplete="off"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="Ulica, číslo domu, obec"
            />
          </label>
        </div>
        <fieldset className="stack">
          <legend>{roundTrip ? 'Cesta tam' : 'Termín cesty'}</legend>
          <TimeCriteria
            date={date}
            time={time}
            mode={timeMode}
            onDate={setDate}
            onTime={setTime}
            onMode={setTimeMode}
          />
        </fieldset>
        {roundTrip && (
          <fieldset className="stack">
            <legend>Cesta späť</legend>
            <p className="small muted">
              Z cieľovej adresy späť na adresu odchodu. Obe cesty čakajú na spoločné naplánovanie.
            </p>
            <TimeCriteria
              returning
              date={returnDate}
              time={returnTime}
              mode={returnMode}
              onDate={setReturnDate}
              onTime={setReturnTime}
              onMode={setReturnMode}
            />
          </fieldset>
        )}
        <label className="field">
          <span>Pomoc počas cesty (voliteľné)</span>
          <textarea
            rows={2}
            maxLength={300}
            value={assistance}
            onChange={(e) => setAssistance(e.target.value)}
            placeholder="Napríklad pomoc pri nastupovaní. Bez zdravotných diagnóz."
          />
        </label>
        <Notice>
          Miesto nástupu a výstupu určí plánovanie podľa zadaných adries. Požiadavka ešte nie je
          potvrdená rezervácia. V deme automatické plánovanie zatiaľ nie je pripojené.
        </Notice>
        <button className="btn" type="submit" disabled={!person}>
          Zapísať telefonickú požiadavku
        </button>
      </form>
    </section>
  )
}
