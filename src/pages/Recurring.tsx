import { planCoverage, planStatusLabels } from '../planCoverage'
import { PlanConfirmations } from '../components/PlanConfirmations'
import { DateInput } from '../components/DateInput'
import { submitRegularPlan } from '../regularPlanning'
import { GuardianContact } from '../components/GuardianContact'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  CalendarCheck2,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  CalendarMinus,
} from 'lucide-react'
import { useStore } from '../context'
import { addDays, dateLabel, uid } from '../data'
import { stopName, tripTime } from '../domain'
import {
  checkSchedule,
  copyDay,
  dayError,
  defaultDay,
  maxScheduleEnd,
  occurrences,
  plansOf,
  purposeLabels,
  regularDemand,
  releasableBookings,
  removeDay,
  putDay,
  scheduleError,
  scheduleOf,
  weekdays,
  weekdayOf,
} from '../regular'
import type {
  AppState,
  OccurrenceSelection,
  RecurringRule,
  RegularLeg,
  WeeklyDayPlan,
  WeeklySchedule,
} from '../types'
import { Badge, Empty, Modal, Notice, PageTitle, PersonSelect } from '../components/ui'
import { WeeklyDayEditor } from '../components/WeeklyDayEditor'

function routeLabel(state: AppState, leg: RegularLeg) {
  return `${leg.fromPlace?.name ?? stopName(state, leg.from)} → ${leg.toPlace?.name ?? stopName(state, leg.to)}`
}
export function DaySummary({ plan }: { plan: WeeklyDayPlan }) {
  const { state } = useStore()
  return (
    <div className="regular-day-summary">
      <strong>
        {weekdays[plan.weekday - 1]} — {plan.outbound.time} / {plan.returning?.time ?? 'len tam'}
      </strong>
      <span>
        {routeLabel(state, plan.outbound)} ·{' '}
        {plan.outbound.timeMode === 'arrival' ? 'Príchod do' : 'Odchod'} {plan.outbound.time}
      </span>
      {plan.returning && (
        <span>
          Späť: {routeLabel(state, plan.returning)} ·{' '}
          {plan.returning.timeMode === 'arrival' ? 'Príchod do' : 'Odchod'} {plan.returning.time}
        </span>
      )}
    </div>
  )
}
function ExceptionDialog({ rule, onClose }: { rule: RecurringRule; onClose: () => void }) {
  const { state, act } = useStore(),
    [date, setDate] = useState(''),
    [mode, setMode] = useState<'skip' | 'replace'>('skip'),
    [plan, setPlan] = useState<WeeklyDayPlan | null>(null)
  const dates = occurrences(scheduleOf(rule), state.serviceDate)
  return (
    <Modal title="Upraviť konkrétny dátum" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (
            act(
              {
                type: 'scheduleException',
                id: rule.id,
                exception: {
                  date,
                  type: mode,
                  plan: mode === 'replace' ? (plan ?? undefined) : undefined,
                },
              },
              'Výnimka bola uložená a príslušné budúce miesta boli uvoľnené.',
            )
          )
            onClose()
        }}
      >
        <Notice>
          Zmena sa týka iba tohto dátumu. Obe rezervácie spiatočnej cesty sa uvoľnia spoločne.
          Náhradný plán sa uloží ako potreba; spoje potom znova skontrolujte.
        </Notice>
        <label className="field">
          <span>Konkrétny dátum</span>
          <select
            required
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setPlan(structuredClone(dates.find((d) => d.date === e.target.value)?.plan ?? null))
            }}
          >
            <option value="">Vyberte dátum</option>
            {dates.map((d) => (
              <option key={d.date} value={d.date}>
                {dateLabel(d.date, true)} ·
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Výnimka</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="skip">Vynechať deň</option>
            <option value="replace">Zmeniť plán iba pre tento dátum</option>
          </select>
        </label>
        {mode === 'replace' && plan && (
          <WeeklyDayEditor plan={plan} onChange={setPlan} fixedWeekday />
        )}
        <button className="btn" disabled={!date}>
          {mode === 'skip' ? 'Vynechať dátum a uvoľniť miesta' : 'Uložiť náhradnú potrebu'}
        </button>
      </form>
    </Modal>
  )
}
export function RecurringPage({ embedded = false }: { embedded?: boolean }) {
  const { state, act } = useStore(),
    [exception, setException] = useState<RecurringRule | null>(null),
    [statusChange, setStatusChange] = useState<{
      rule: RecurringRule
      status: 'paused' | 'cancelled'
    } | null>(null)
  const rules = state.rules.filter((r) => r.status !== 'cancelled')
  return (
    <div className="regular-page">
      <PageTitle
        eyebrow={embedded ? undefined : 'KAŽDÝ TÝŽDEŇ JEDNODUCHŠIE'}
        title="Moje pravidelné cesty"
        back={embedded ? undefined : '/passenger/journeys'}
        action={
          <Link className="btn" to="/passenger/recurring/new">
            <Plus size={18} />
            Nový rozvrh
          </Link>
        }
      />
      <Notice>
        Dopravná potreba nie je rezervácia. Miesto je potvrdené iba pre konkrétny dátum a spoj
        uvedený nižšie. Rozvrh môže trvať najviac 12 mesiacov.
      </Notice>
      <div className="stack spaced">
        {!rules.length && (
          <Empty text="Nastavte prvý deň a postupne pridajte ďalšie pravidelné cesty." />
        )}
        {rules.map((rule) => {
          const demand = regularDemand({ ...state, rules: [rule] }, state.serviceDate, rule.end)
          const coverage = planCoverage(state, rule)
          const bookings = state.bookings.filter(
            (b) => b.ruleId === rule.id && b.status === 'confirmed',
          )
          const upcoming = bookings.filter((b) => {
            const t = state.trips.find((t) => t.id === b.tripId)
            return t && t.date >= state.serviceDate && t.status !== 'completed'
          })
          return (
            <article className="card regular-rule stack" key={rule.id}>
              <div className="section-heading">
                <div>
                  <h2>{state.people.find((p) => p.id === rule.personId)?.name ?? 'Cestujúci'}</h2>
                  <p>
                    {purposeLabels[rule.purpose ?? 'other']} · {dateLabel(rule.start)} –{' '}
                    {dateLabel(rule.end)}
                  </p>
                </div>
                <span className={`regular-plan-badge ${coverage.status}`}>
                  {planStatusLabels[coverage.status]}
                </span>
              </div>
              <PlanConfirmations rule={rule} />
              <div className="regular-week-list">
                {plansOf(rule)
                  .sort((a, b) => a.weekday - b.weekday)
                  .map((plan) => (
                    <DaySummary key={plan.weekday} plan={plan} />
                  ))}
              </div>
              <div className="regular-totals">
                <span>
                  <strong>{bookings.length}</strong> potvrdených rezervácií
                </span>
                <span>
                  <strong>{demand.unmet}</strong> nepokrytých osobných ciest
                </span>
              </div>
              {rule.automaticBookingPause &&
                rule.automaticBookingPause.until >= state.serviceDate && (
                  <Notice tone="warning">
                    Automatické rezervovanie je pozastavené do{' '}
                    {dateLabel(rule.automaticBookingPause.until)}:{' '}
                    {rule.automaticBookingPause.reason}. Ručné rezervovanie zostáva dostupné.
                    Existujúce potvrdené miesta zostávajú platné.
                  </Notice>
                )}
              <div className="regular-actions regular-plan-actions">
                <Link className="btn btn-secondary" to={`/passenger/recurring/${rule.id}/edit`}>
                  <Pencil size={16} />
                  Upraviť rozvrh
                </Link>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    rule.status === 'active'
                      ? setStatusChange({ rule, status: 'paused' })
                      : act(
                          { type: 'ruleStatus', id: rule.id, status: 'active' },
                          'Rozvrh bol obnovený ako potreba. Miesta potvrďte po novej kontrole spojení.',
                        )
                  }
                >
                  {rule.status === 'active' ? <Pause size={16} /> : <Play size={16} />}{' '}
                  {rule.status === 'active' ? 'Pozastaviť' : 'Obnoviť'}
                </button>
                <button className="btn btn-secondary" onClick={() => setException(rule)}>
                  <CalendarMinus size={16} />
                  Vynechať konkrétny deň
                </button>
                <button
                  className="btn btn-secondary danger-text"
                  onClick={() => setStatusChange({ rule, status: 'cancelled' })}
                >
                  <Trash2 size={16} /> Zrušiť
                </button>
              </div>
              <details className="regular-upcoming">
                <summary>Zobraziť najbližšie cesty ({upcoming.length})</summary>
                <div className="stack">
                  {!upcoming.length && (
                    <p>
                      Zatiaľ nie sú potvrdené konkrétne spoje. Upravte rozvrh a skontrolujte
                      spojenia.
                    </p>
                  )}
                  {upcoming
                    .sort((a, b) => (a.occurrenceDate ?? '').localeCompare(b.occurrenceDate ?? ''))
                    .map((b) => {
                      const trip = state.trips.find((t) => t.id === b.tripId)!
                      return (
                        <div className="regular-occurrence" key={b.id}>
                          <Badge status="confirmed">Potvrdená rezervácia</Badge>
                          <span>
                            {dateLabel(trip.date)} · {tripTime(trip, b.from)} ·{' '}
                            {stopName(state, b.from)} → {stopName(state, b.to)} · linka {trip.line}
                          </span>
                          <Link to="/passenger/journeys">Detail v Moje cesty</Link>
                        </div>
                      )
                    })}
                </div>
              </details>
              {demand.rows.some((r) => !r.covered) && (
                <details>
                  <summary>
                    Dopravné potreby podľa dátumov ({demand.rows.filter((r) => !r.covered).length})
                  </summary>
                  <div className="regular-need-dates">
                    {demand.rows
                      .filter((r) => !r.covered)
                      .map((r) => (
                        <p key={r.date}>
                          {dateLabel(r.date, true)} · {r.plan.outbound.time} /{' '}
                          {r.plan.returning?.time ?? 'len tam'} — Dopravná potreba, bez potvrdeného
                          miesta
                        </p>
                      ))}
                  </div>
                </details>
              )}
              {!!rule.exceptions?.length && (
                <div className="regular-exceptions">
                  <h3>Výnimky</h3>
                  {rule.exceptions.map((e) => (
                    <p key={e.date}>
                      {dateLabel(e.date)} · {e.type === 'skip' ? 'Vynechané' : 'Zmenený plán'}{' '}
                      {e.plan && `${e.plan.outbound.time} / ${e.plan.returning?.time ?? 'len tam'}`}{' '}
                      <button
                        type="button"
                        className="text-link"
                        disabled={e.date < state.serviceDate}
                        onClick={() =>
                          act(
                            { type: 'removeScheduleException', id: rule.id, date: e.date },
                            'Výnimka bola odstránená. Deň je opäť potrebou bez automatického potvrdenia.',
                          )
                        }
                      >
                        Odstrániť výnimku
                      </button>
                    </p>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>
      {exception && (
        <ExceptionDialog
          rule={state.rules.find((r) => r.id === exception.id)!}
          onClose={() => setException(null)}
        />
      )}
      {statusChange && (
        <Modal
          title={statusChange.status === 'paused' ? 'Pozastaviť rozvrh?' : 'Zrušiť rozvrh?'}
          onClose={() => setStatusChange(null)}
        >
          <div className="stack">
            <p>
              Uvoľní sa {releasableBookings(state, statusChange.rule.id).length} budúcich
              rezervácií, ktoré ešte nezačali.{' '}
              {statusChange.status === 'paused'
                ? 'Po obnovení bude potrebné znovu potvrdiť konkrétne spoje.'
                : 'História ciest zostane zachovaná.'}
            </p>
            <p>Začaté spiatočné cesty vrátane ich potvrdeného návratu zostanú zachované.</p>
            <div className="regular-actions">
              <button className="btn btn-secondary" onClick={() => setStatusChange(null)}>
                Ponechať rozvrh
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (
                    act(
                      { type: 'ruleStatus', id: statusChange.rule.id, status: statusChange.status },
                      'Rozvrh bol zmenený a budúce miesta boli uvoľnené.',
                    )
                  )
                    setStatusChange(null)
                }}
              >
                Potvrdiť {statusChange.status === 'paused' ? 'pozastavenie' : 'zrušenie'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
interface EditorDraft {
  schedule: WeeklySchedule
  day?: WeeklyDayPlan
  editingOriginal?: number
  lastDay?: WeeklyDayPlan
  selections?: Record<string, Partial<OccurrenceSelection>>
}
function loadDraft(key: string, fallback: () => EditorDraft): EditorDraft {
  try {
    const draft = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (draft?.schedule?.dayPlans && draft.schedule.exceptions) return draft
  } catch {
    /* A fresh draft remains available. */
  }
  return fallback()
}
export function RecurringEditor() {
  const { id } = useParams()
  return <ScheduleEditor key={id ?? 'new'} />
}
function ScheduleEditor() {
  const { id } = useParams(),
    { state, act } = useStore(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams()
  const rule = state.rules.find((r) => r.id === id),
    key = `moja-cesta-weekly-draft:${id ?? 'new'}`
  const [draft, setDraft] = useState<EditorDraft>(() =>
    loadDraft(key, () => ({
      schedule: rule
        ? scheduleOf(rule)
        : {
            id: uid(),
            personId: state.people[0]?.id ?? '',
            purpose: '' as WeeklySchedule['purpose'],
            start: addDays(state.serviceDate, 5),
            end: addDays(state.serviceDate, 30),
            dayPlans: [],
            exceptions: [],
          },
    })),
  )
  const [error, setError] = useState(''),
    [selections, setSelections] = useState<Record<string, Partial<OccurrenceSelection>>>(
      draft.selections ?? {},
    ),
    [release, setRelease] = useState(false)
  const schedule = draft.schedule,
    step = ['details', 'week', 'review'].includes(params.get('step') ?? '')
      ? params.get('step')!
      : 'details',
    checks = step === 'review' ? checkSchedule(state, schedule) : []
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify({ ...draft, selections }))
    } catch {
      /* Form remains usable without storage. */
    }
  }, [draft, key, selections])
  if (id && (!rule || rule.status === 'cancelled'))
    return (
      <Empty
        text="Rozvrh sa nenašiel."
        action={<Link to="/passenger/recurring">Moje pravidelné cesty</Link>}
      />
    )
  const update = (next: Partial<WeeklySchedule>) => {
    setDraft({ ...draft, schedule: { ...schedule, ...next } })
    setSelections({})
    setError('')
  }
  const go = (step: string) => {
    setParams({ step })
    setError('')
  }
  function addDay() {
    const weekday =
      weekdays.findIndex((_, i) => !schedule.dayPlans.some((p) => p.weekday === i + 1)) + 1
    if (!weekday) return
    setDraft({
      ...draft,
      day: copyDay(draft.lastDay ?? schedule.dayPlans.at(-1) ?? defaultDay(), weekday),
      editingOriginal: undefined,
    })
    setError('')
  }
  function save() {
    try {
      submitRegularPlan(state, schedule, new Date().toISOString())
    } catch (e) {
      setParams({ step: 'details' })
      setError(e instanceof Error ? e.message : 'Skontrolujte údaje.')
      return
    }
    if (
      act(
        {
          type: 'submitRegularPlan',
          schedule,
          now: new Date().toISOString(),
          acknowledgeRelease: release,
        },
        'Plán bol odoslaný. Miesta zatiaľ nie sú potvrdené.',
      )
    ) {
      sessionStorage.removeItem(key)
      navigate('/passenger/recurring')
    }
  }
  return (
    <div className="regular-editor">
      <PageTitle
        title={rule ? 'Upraviť pravidelné cestovanie' : 'Pravidelné cestovanie'}
        back="/passenger/recurring"
        description="Jeden deň po druhom. Každý má vlastné nastavenia."
      />
      <ol className="regular-steps" aria-label="Kroky nastavenia">
        <li aria-current={step === 'details' ? 'step' : undefined}>1. Základné údaje</li>
        <li aria-current={step === 'week' ? 'step' : undefined}>2. Týždenný rozvrh</li>
        <li aria-current={step === 'review' ? 'step' : undefined}>3. Kontrola a odoslanie</li>
      </ol>

      <GuardianContact personId={schedule.personId} />
      {step === 'details' && (
        <form
          className="card stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (!['school', 'work'].includes(schedule.purpose)) {
              setError('Vyberte účel Do práce alebo Do školy.')
              return
            }
            const validation = scheduleError(state, {
              ...schedule,
              dayPlans: schedule.dayPlans.length ? schedule.dayPlans : [defaultDay()],
            })
            if (validation) setError(validation)
            else go('week')
          }}
        >
          <h2>Pre koho a na aké obdobie?</h2>
          <PersonSelect
            label="Pre koho nastavujete rozvrh?"
            value={schedule.personId}
            onChange={(personId) => update({ personId })}
          />
          <p className="small muted">
            Používajú sa existujúce oprávnené rodinné profily. Pre dieťa je povinný kontakt rodiča
            alebo zákonného zástupcu.
          </p>
          {state.people.find((p) => p.id === schedule.personId)?.mobility && (
            <Notice>
              Požiadavka cestujúceho:{' '}
              {state.people.find((p) => p.id === schedule.personId)?.mobility}. Potrebnú asistenciu
              posúdi dispečer; bezbariérovosť vozidla zatiaľ demo neoveruje.
            </Notice>
          )}
          <label className="field">
            <span>Účel cesty</span>
            <select
              required
              aria-invalid={!!error && !['school', 'work'].includes(schedule.purpose)}
              value={schedule.purpose}
              onChange={(e) => update({ purpose: e.target.value as WeeklySchedule['purpose'] })}
            >
              <option value="">Vyberte účel cesty</option>
              {Object.entries(purposeLabels)
                .filter(([key]) => key !== 'other')
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
            {error && error.includes('účel') && (
              <small className="form-error" role="alert">
                {error}
              </small>
            )}
          </label>
          <div className="form-grid">
            <label className="field">
              <span>Platnosť od</span>
              <DateInput
                aria-invalid={!!error && !error.includes('účel')}

                required
                value={schedule.start}
                onChange={(e) => update({ start: e.target.value })}
              />
              {error && !error.includes('účel') && (
                <small className="form-error" role="alert">
                  {error}
                </small>
              )}
            </label>
            <label className="field">
              <span>Platnosť do</span>
              <DateInput
                aria-invalid={!!error && !error.includes('účel')}

                required
                min={schedule.start}
                max={maxScheduleEnd(schedule.start)}
                value={schedule.end}
                onChange={(e) => update({ end: e.target.value })}
              />
              {error && !error.includes('účel') && (
                <small className="form-error" role="alert">
                  {error}
                </small>
              )}
            </label>
          </div>

          <Notice>
            Prvá cesta najskôr o 5 kalendárnych dní. Najviac 12 mesiacov. Dĺžka obdobia nie je
            zárukou miest. Potvrdíme iba konkrétne publikované spoje s voľnou kapacitou.
          </Notice>
          <button className="btn">
            Pokračovať k rozvrhu <ArrowRight size={17} />
          </button>
        </form>
      )}
      {step === 'week' && (
        <div className="stack">
          <section className="card stack">
            <h2>Týždenný prehľad</h2>
            {!schedule.dayPlans.length && (
              <p>Začnite prvým dňom. Ďalší deň prevezme jeho nastavenia ako nezávislú kópiu.</p>
            )}
            {schedule.dayPlans
              .slice()
              .sort((a, b) => a.weekday - b.weekday)
              .map((plan) => (
                <article className="regular-day-card" key={plan.weekday}>
                  <DaySummary plan={plan} />
                  <div className="regular-actions">
                    <button
                      className="text-link"
                      onClick={() => {
                        setDraft({
                          ...draft,
                          day: structuredClone(plan),
                          editingOriginal: plan.weekday,
                        })
                        setError('')
                      }}
                    >
                      Upraviť {weekdays[plan.weekday - 1]}
                    </button>
                    <button
                      className="text-link danger-text"
                      onClick={() =>
                        update({
                          dayPlans: removeDay(schedule.dayPlans, plan.weekday),
                          exceptions: schedule.exceptions.filter(
                            (e) => weekdayOf(e.date) !== plan.weekday,
                          ),
                        })
                      }
                    >
                      <Trash2 size={15} />
                      Odstrániť {weekdays[plan.weekday - 1]}
                    </button>
                  </div>
                </article>
              ))}
            {!draft.day && schedule.dayPlans.length < 7 && (
              <button className="btn btn-secondary" onClick={addDay}>
                <Plus size={17} />
                {schedule.dayPlans.length ? 'Pridať ďalší deň' : 'Pridať prvý deň'}
              </button>
            )}
          </section>
          {draft.day && (
            <form
              className="card stack"
              aria-label="Nastavenie dňa"
              onSubmit={(e) => {
                e.preventDefault()
                const validation = dayError(state, draft.day!)
                if (validation) {
                  setError(validation)
                  return
                }
                if (
                  schedule.dayPlans.some(
                    (p) => p.weekday === draft.day!.weekday && p.weekday !== draft.editingOriginal,
                  )
                ) {
                  setError('Tento deň už je v rozvrhu.')
                  return
                }
                const plans = removeDay(schedule.dayPlans, draft.editingOriginal ?? 0)
                setDraft({
                  schedule: {
                    ...schedule,
                    dayPlans: putDay(plans, draft.day!),
                    exceptions: schedule.exceptions.filter(
                      (e) =>
                        draft.editingOriginal === draft.day!.weekday ||
                        weekdayOf(e.date) !== draft.editingOriginal,
                    ),
                  },
                  lastDay: structuredClone(draft.day!),
                })
                setSelections({})
                setError('')
              }}
            >
              {error && (
                <small className="form-error" role="alert">
                  {error}
                </small>
              )}
              <h2>{draft.editingOriginal ? 'Upraviť deň' : 'Nový deň'}</h2>
              <WeeklyDayEditor
                plan={draft.day}
                onChange={(day) => setDraft({ ...draft, day })}
                usedDays={schedule.dayPlans
                  .filter((p) => p.weekday !== draft.editingOriginal)
                  .map((p) => p.weekday)}
              />
              <div className="regular-actions">
                <button className="btn">Uložiť deň</button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setDraft({ ...draft, day: undefined, editingOriginal: undefined })
                    setError('')
                  }}
                >
                  Zahodiť úpravu dňa
                </button>
              </div>
            </form>
          )}
          {!draft.day && (
            <div className="regular-actions">
              <button className="btn btn-secondary" onClick={() => go('details')}>
                Späť na základné údaje
              </button>
              <button
                className="btn"
                disabled={!schedule.dayPlans.length}
                onClick={() => {
                  const validation = scheduleError(state, schedule)
                  if (validation) setError(validation)
                  else {
                    go('review')
                  }
                }}
              >
                <CalendarCheck2 size={18} />
                Skontrolovať plán
              </button>
            </div>
          )}
        </div>
      )}
      {step === 'review' && (
        <section className="card stack">
          <h2>Kontrola a odoslanie plánu</h2>
          {error && (
            <small className="form-error" role="alert">
              {error}
            </small>
          )}
          <p>
            {checks.length} plánovaných dní. Výber spojov a organizáciu dopravy zabezpečuje systém a
            dispečer. Plán nie je potvrdenou rezerváciou.
          </p>
          <Notice>
            Presné časy, nástup, výstup a miesto musia byť potvrdené najneskôr 24 hodín pred cestou.
            Pri spiatočnej ceste sa oba smery potvrdzujú spolu pred prvým odchodom. Dostupnosť na
            celý rok zatiaľ nie je zaručená.
          </Notice>
          {schedule.dayPlans.map((p) => (
            <DaySummary key={p.weekday} plan={p} />
          ))}
          {!!releasableBookings(state, schedule.id).length && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={release}
                onChange={(e) => setRelease(e.target.checked)}
              />
              Súhlasím s nahradením nezačatých budúcich rezervácií upraveným plánom.
            </label>
          )}
          <div className="regular-actions">
            <button className="btn btn-secondary" onClick={() => go('week')}>
              Späť na týždeň
            </button>
            <button className="btn" onClick={() => save()}>
              Odoslať pravidelný plán
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
