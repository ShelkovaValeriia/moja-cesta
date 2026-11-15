import { useState } from 'react'
import { useStore } from '../context'
import { dispatchPeople, requestParticipants } from '../domain'
import { scheduleOf, weekdays, weekdayOf } from '../regular'
import type { SubmissionDraft } from '../submissionManagement'
import type { RegularLeg, TimeMode, WeeklyDayPlan } from '../types'
import { DateInput } from './DateInput'
import { TimePicker } from './TimePicker'
import { DispatcherModal } from './DispatcherModal'

type Criteria = { date: string; time: string; timeMode: TimeMode }
function CriteriaFields({
  value,
  onChange,
  label,
}: {
  value: Criteria
  onChange: (value: Criteria) => void
  label: string
}) {
  return (
    <fieldset className="stack">
      <legend>{label}</legend>
      <label className="field">
        <span>Dátum</span>
        <DateInput
          required
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
        />
      </label>
      <TimePicker
        label="Čas (HH:mm)"
        value={value.time}
        onChange={(time) => onChange({ ...value, time })}
      />
      <label className="field">
        <span>Časové kritérium</span>
        <select
          value={value.timeMode}
          onChange={(e) => onChange({ ...value, timeMode: e.target.value as TimeMode })}
        >
          <option value="departure">Odchod</option>
          <option value="arrival">Príchod do</option>
        </select>
      </label>
    </fieldset>
  )
}

function LegFields({
  value,
  onChange,
  label,
}: {
  value: RegularLeg
  onChange: (value: RegularLeg) => void
  label: string
}) {
  const { state } = useStore()
  return (
    <fieldset className="stack">
      <legend>{label}</legend>
      {(['from', 'to'] as const).map((field) => {
        const place = field === 'from' ? value.fromPlace : value.toPlace
        return (
          <label className="field" key={field}>
            <span>{field === 'from' ? 'Odkiaľ' : 'Kam'}</span>
            <select
              value={place?.type === 'custom' ? '__custom' : value[field]}
              onChange={(e) =>
                onChange({
                  ...value,
                  [field]: e.target.value,
                  [field === 'from' ? 'fromPlace' : 'toPlace']: undefined,
                  [field === 'from' ? 'fromStopConfirmed' : 'toStopConfirmed']: true,
                })
              }
            >
              {place?.type === 'custom' && (
                <option value="__custom">{place.name} (zadaný bod)</option>
              )}
              {state.stops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                </option>
              ))}
            </select>
          </label>
        )
      })}
      <TimePicker
        label="Čas (HH:mm)"
        value={value.time}
        onChange={(time) => onChange({ ...value, time })}
      />
      <label className="field">
        <span>Časové kritérium</span>
        <select
          value={value.timeMode}
          onChange={(e) => onChange({ ...value, timeMode: e.target.value as TimeMode })}
        >
          <option value="departure">Odchod</option>
          <option value="arrival">Príchod do</option>
        </select>
      </label>
    </fieldset>
  )
}

function DayFields({
  value,
  onChange,
}: {
  value: WeeklyDayPlan
  onChange: (p: WeeklyDayPlan) => void
}) {
  return (
    <div className="stack">
      <LegFields
        label="Cesta tam"
        value={value.outbound}
        onChange={(outbound) => onChange({ ...value, outbound, services: undefined })}
      />
      <label className="submission-check">
        <input
          type="checkbox"
          checked={!!value.returning}
          onChange={(e) =>
            onChange({
              ...value,
              services: undefined,
              returning: e.target.checked
                ? {
                    ...value.outbound,
                    from: value.outbound.to,
                    to: value.outbound.from,
                    fromPlace: value.outbound.toPlace,
                    toPlace: value.outbound.fromPlace,
                    time: '16:00',
                  }
                : undefined,
            })
          }
        />
        Spiatočná cesta
      </label>
      {value.returning && (
        <LegFields
          label="Cesta späť"
          value={value.returning}
          onChange={(returning) => onChange({ ...value, returning, services: undefined })}
        />
      )}
    </div>
  )
}

export function DispatcherSubmissionEditor({
  submissionKey,
  operation,
  onClose,
}: {
  submissionKey: string
  operation: 'edit' | 'decline' | 'remove'
  onClose: () => void
}) {
  const { state, act } = useStore()
  const [kind, ...parts] = submissionKey.split(':')
  const id = parts.join(':')
  const [draft, setDraft] = useState<SubmissionDraft>(() =>
    kind === 'ride'
      ? { kind: 'ride', value: structuredClone(state.requests.find((r) => r.id === id)!) }
      : kind === 'phone'
        ? { kind: 'phone', value: structuredClone(state.phoneRequests.find((r) => r.id === id)!) }
        : { kind: 'regular', value: scheduleOf(state.rules.find((r) => r.id === id)!) },
  )
  const [reason, setReason] = useState('')
  const [acknowledge, setAcknowledge] = useState(false)
  const title =
    operation === 'edit'
      ? 'Upraviť požiadavku'
      : operation === 'decline'
        ? 'Zamietnuť požiadavku'
        : 'Odstrániť požiadavku'
  const personField = (personId: string, onChange: (id: string) => void) => (
    <label className="field">
      <span>Cestujúci</span>
      <select value={personId} required onChange={(e) => onChange(e.target.value)}>
        {(draft.kind === 'phone' || (draft.kind === 'ride' && draft.value.channel === 'phone')
          ? dispatchPeople(state)
          : state.people
        ).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <DispatcherModal title={title} onClose={onClose} actionErrors>
      <form
        className="stack submission-editor"
        onSubmit={(e) => {
          e.preventDefault()
          const common = { reason, acknowledgeRelease: acknowledge }
          if (
            act(
              operation === 'edit'
                ? { type: 'editSubmission', draft, ...common }
                : {
                    type: operation === 'decline' ? 'declineSubmission' : 'removeSubmission',
                    key: submissionKey,
                    ...common,
                  },
              operation === 'edit'
                ? 'Požiadavka bola opravená a čaká na nové posúdenie.'
                : operation === 'decline'
                  ? 'Požiadavka bola zamietnutá.'
                  : 'Požiadavka bola odstránená z prehľadu.',
            )
          )
            onClose()
        }}
      >
        <p className="small muted">
          Požiadavka {id}. Zmena sa týka celého podania vrátane spiatočnej cesty. Budúce rezervácie
          sa uvoľnia a opravené podanie vyžaduje nové potvrdenie. Začatú cestu nemožno meniť.
        </p>
        {operation === 'remove' && (
          <p>Záznam sa odstráni z prehľadu. História podania a rezervácií zostane zachovaná.</p>
        )}
        {operation === 'edit' && draft.kind === 'phone' && (
          <>
            {personField(draft.value.personId, (personId) =>
              setDraft({ ...draft, value: { ...draft.value, personId } }),
            )}
            {(['fromAddress', 'toAddress'] as const).map((field) => (
              <label className="field" key={field}>
                <span>{field === 'fromAddress' ? 'Adresa odchodu' : 'Adresa cieľa'}</span>
                <input
                  required
                  minLength={3}
                  maxLength={200}
                  value={draft.value[field]}
                  onChange={(e) =>
                    setDraft({ ...draft, value: { ...draft.value, [field]: e.target.value } })
                  }
                />
              </label>
            ))}
            <CriteriaFields
              label="Cesta tam"
              value={draft.value}
              onChange={(criteria) =>
                setDraft({ ...draft, value: { ...draft.value, ...criteria } })
              }
            />
            <label className="submission-check">
              <input
                type="checkbox"
                checked={!!draft.value.returnJourney}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    value: {
                      ...draft.value,
                      returnJourney: e.target.checked
                        ? { date: draft.value.date, time: '16:00', timeMode: 'departure' }
                        : undefined,
                    },
                  })
                }
              />
              Spiatočná cesta
            </label>
            {draft.value.returnJourney && (
              <CriteriaFields
                label="Cesta späť"
                value={draft.value.returnJourney}
                onChange={(returnJourney) =>
                  setDraft({ ...draft, value: { ...draft.value, returnJourney } })
                }
              />
            )}
            <label className="field">
              <span>Počet miest</span>
              <input
                type="number"
                min={1}
                required
                value={draft.value.seats}
                onChange={(e) =>
                  setDraft({ ...draft, value: { ...draft.value, seats: Number(e.target.value) } })
                }
              />
            </label>
            <label className="field">
              <span>Pomoc pri cestovaní</span>
              <textarea
                maxLength={300}
                value={draft.value.assistance}
                onChange={(e) =>
                  setDraft({ ...draft, value: { ...draft.value, assistance: e.target.value } })
                }
              />
            </label>
          </>
        )}
        {operation === 'edit' && draft.kind === 'ride' && (
          <>
            <LegFields
              label="Trasa a čas cesty tam"
              value={{ ...draft.value, timePreference: draft.value.timePreference ?? 'none' }}
              onChange={(leg) => setDraft({ ...draft, value: { ...draft.value, ...leg } })}
            />
            <label className="field">
              <span>Dátum cesty tam</span>
              <DateInput
                required
                value={draft.value.date}
                onChange={(e) =>
                  setDraft({ ...draft, value: { ...draft.value, date: e.target.value } })
                }
              />
            </label>
            <label className="submission-check">
              <input
                type="checkbox"
                checked={!!draft.value.returnDate}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    value: {
                      ...draft.value,
                      returnDate: e.target.checked ? draft.value.date : undefined,
                      returnTime: e.target.checked ? '16:00' : undefined,
                      returnTimeMode: 'departure',
                    },
                  })
                }
              />
              Spiatočná cesta
            </label>
            {draft.value.returnDate && (
              <CriteriaFields
                label="Cesta späť"
                value={{
                  date: draft.value.returnDate,
                  time: draft.value.returnTime ?? '',
                  timeMode: draft.value.returnTimeMode ?? 'departure',
                }}
                onChange={(v) =>
                  setDraft({
                    ...draft,
                    value: {
                      ...draft.value,
                      returnDate: v.date,
                      returnTime: v.time,
                      returnTimeMode: v.timeMode,
                    },
                  })
                }
              />
            )}
            <label className="field">
              <span>Celkový počet miest</span>
              <input
                type="number"
                min={1}
                max={8}
                required
                value={draft.value.passengers}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    value: { ...draft.value, passengers: Number(e.target.value) },
                  })
                }
              />
            </label>
            <p className="small muted">Celkový počet zahŕňa aj záujemcov bez uvedeného mena.</p>
            {Object.entries(requestParticipants(draft.value)).map(([personId, seats]) => (
              <fieldset className="stack" key={personId}>
                {personField(personId, (replacement) => {
                  const participants = { ...requestParticipants(draft.value) }
                  delete participants[personId]
                  participants[replacement] = (participants[replacement] ?? 0) + seats
                  setDraft({
                    ...draft,
                    value: {
                      ...draft.value,
                      members: Object.keys(participants),
                      memberSeats: participants,
                    },
                  })
                })}
                <label className="field">
                  <span>Miesta cestujúceho</span>
                  <input
                    required
                    type="number"
                    min={1}
                    max={8}
                    value={seats}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        value: {
                          ...draft.value,
                          memberSeats: {
                            ...requestParticipants(draft.value),
                            [personId]: Number(e.target.value),
                          },
                        },
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  onClick={() => {
                    const participants = { ...requestParticipants(draft.value) }
                    delete participants[personId]
                    setDraft({
                      ...draft,
                      value: {
                        ...draft.value,
                        members: Object.keys(participants),
                        memberSeats: participants,
                        passengers: draft.value.passengers - seats,
                      },
                    })
                  }}
                >
                  Odstrániť cestujúceho
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              className="btn btn-small btn-secondary"
              disabled={
                !(draft.value.channel === 'phone' ? dispatchPeople(state) : state.people).some(
                  (p) => !Object.hasOwn(requestParticipants(draft.value), p.id),
                )
              }
              onClick={() => {
                const participants = { ...requestParticipants(draft.value) }
                const person = (
                  draft.value.channel === 'phone' ? dispatchPeople(state) : state.people
                ).find((p) => !Object.hasOwn(participants, p.id))
                if (!person) return
                participants[person.id] = 1
                const count = Object.values(participants).reduce((sum, seats) => sum + seats, 0)
                setDraft({
                  ...draft,
                  value: {
                    ...draft.value,
                    memberSeats: participants,
                    members: Object.keys(participants),
                    passengers: Math.max(draft.value.passengers, count),
                  },
                })
              }}
            >
              Pridať uvedeného cestujúceho
            </button>
            <label className="field">
              <span>Pomoc pri cestovaní</span>
              <textarea
                maxLength={300}
                value={draft.value.accessibility}
                onChange={(e) =>
                  setDraft({ ...draft, value: { ...draft.value, accessibility: e.target.value } })
                }
              />
            </label>
          </>
        )}
        {operation === 'edit' && draft.kind === 'regular' && (
          <>
            <p>
              Upravujete celý pravidelný plán. Jednotlivé výnimky sú uvedené pod týždenným rozvrhom.
            </p>
            {personField(draft.value.personId, (personId) =>
              setDraft({ ...draft, value: { ...draft.value, personId } }),
            )}
            {(['start', 'end'] as const).map((field) => (
              <label className="field" key={field}>
                <span>{field === 'start' ? 'Od dátumu' : 'Do dátumu'}</span>
                <DateInput
                  required
                  value={draft.value[field]}
                  onChange={(e) =>
                    setDraft({ ...draft, value: { ...draft.value, [field]: e.target.value } })
                  }
                />
              </label>
            ))}
            {draft.value.dayPlans.map((plan, index) => (
              <fieldset className="stack" key={index}>
                <legend>Deň plánu {index + 1}</legend>
                <label className="field">
                  <span>Deň týždňa</span>
                  <select
                    value={plan.weekday}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        value: {
                          ...draft.value,
                          dayPlans: draft.value.dayPlans.map((p, i) =>
                            i === index ? { ...p, weekday: Number(e.target.value) } : p,
                          ),
                        },
                      })
                    }
                  >
                    {weekdays.map((day, i) => (
                      <option key={day} value={i + 1}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
                <DayFields
                  value={plan}
                  onChange={(p) =>
                    setDraft({
                      ...draft,
                      value: {
                        ...draft.value,
                        dayPlans: draft.value.dayPlans.map((old, i) => (i === index ? p : old)),
                      },
                    })
                  }
                />
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      value: {
                        ...draft.value,
                        dayPlans: draft.value.dayPlans.filter((_, i) => i !== index),
                      },
                    })
                  }
                >
                  Odstrániť deň plánu
                </button>
              </fieldset>
            ))}
            {draft.value.dayPlans.length < 7 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const weekday =
                    [1, 2, 3, 4, 5, 6, 7].find(
                      (day) => !draft.value.dayPlans.some((p) => p.weekday === day),
                    ) ?? 1
                  setDraft({
                    ...draft,
                    value: {
                      ...draft.value,
                      dayPlans: [
                        ...draft.value.dayPlans,
                        {
                          weekday,
                          outbound: {
                            from: state.stops[0].id,
                            to: state.stops[1].id,
                            time: '08:00',
                            timeMode: 'departure',
                            timePreference: 'none',
                          },
                        },
                      ],
                    },
                  })
                }}
              >
                Pridať deň plánu
              </button>
            )}
            {draft.value.exceptions.map((exception, index) => (
              <fieldset className="stack" key={index}>
                <legend>Výnimka {index + 1}</legend>
                <label className="field">
                  <span>Dátum výnimky</span>
                  <DateInput
                    required
                    value={exception.date}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        value: {
                          ...draft.value,
                          exceptions: draft.value.exceptions.map((old, i) =>
                            i === index
                              ? {
                                  ...old,
                                  date: e.target.value,
                                  plan: old.plan
                                    ? { ...old.plan, weekday: weekdayOf(e.target.value) }
                                    : undefined,
                                }
                              : old,
                          ),
                        },
                      })
                    }
                  />
                </label>
                <p>{exception.type === 'skip' ? 'Vynechaný dátum' : 'Náhradný plán'}</p>
                {exception.plan && (
                  <DayFields
                    value={exception.plan}
                    onChange={(plan) =>
                      setDraft({
                        ...draft,
                        value: {
                          ...draft.value,
                          exceptions: draft.value.exceptions.map((old, i) =>
                            i === index ? { ...old, plan } : old,
                          ),
                        },
                      })
                    }
                  />
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      value: {
                        ...draft.value,
                        exceptions: draft.value.exceptions.filter((_, i) => i !== index),
                      },
                    })
                  }
                >
                  Odstrániť výnimku
                </button>
              </fieldset>
            ))}
          </>
        )}
        <label className="field">
          <span>
            Dôvod{' '}
            {operation === 'decline'
              ? 'zamietnutia'
              : operation === 'remove'
                ? 'odstránenia'
                : 'opravy'}
          </span>
          <textarea
            required
            minLength={5}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label className="submission-check">
          <input
            type="checkbox"
            checked={acknowledge}
            onChange={(e) => setAcknowledge(e.target.checked)}
          />
          Potvrdzujem uvoľnenie dotknutých budúcich rezervácií v oboch smeroch.
        </label>
        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Späť
          </button>
          <button className="btn" type="submit">
            {operation === 'edit' ? 'Uložiť opravu' : title}
          </button>
        </div>
      </form>
    </DispatcherModal>
  )
}
