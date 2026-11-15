import type { RegularLeg, SearchQuery, WeeklyDayPlan } from '../types'
import { weekdays } from '../regular'
import { JourneyPlaceField } from './JourneyPlaceField'
import { TimePicker } from './TimePicker'
import { TimeOptions } from './TimeOptions'
import { RegularStopsNotice } from './RegularStopsNotice'

function queryOf(leg: RegularLeg): SearchQuery {
  return {
    ...leg,
    personId: '',
    seats: 1,
    date: '',
    roundTrip: false,
    returnDate: '',
    returnTime: '17:00',
    returnTimeMode: 'departure',
    returnTimePreference: 'none',
  }
}
function legOf(q: SearchQuery): RegularLeg {
  return {
    from: q.from,
    to: q.to,
    time: q.time,
    timeMode: q.timeMode,
    timePreference: q.timePreference,
    fromPlace: q.fromPlace,
    toPlace: q.toPlace,
    fromStopConfirmed: q.fromStopConfirmed,
    toStopConfirmed: q.toStopConfirmed,
  }
}
export function RegularLegEditor({
  leg,
  onChange,
  returning = false,
}: {
  leg: RegularLeg
  onChange: (leg: RegularLeg) => void
  returning?: boolean
}) {
  const query = queryOf(leg)
  return (
    <fieldset className="regular-leg stack">
      <legend>{returning ? 'Cesta späť' : 'Cesta tam'}</legend>
      <div className="form-grid">
        <JourneyPlaceField
          label={returning ? 'Odkiaľ späť' : 'Odkiaľ'}
          side="from"
          query={query}
          onChange={(q) => onChange(legOf(q))}
        />
        <JourneyPlaceField
          label={returning ? 'Kam späť' : 'Kam'}
          side="to"
          query={query}
          onChange={(q) => onChange(legOf(q))}
        />
      </div>
      <TimePicker
        label={returning ? 'Čas späť' : 'Čas'}
        value={leg.time}
        onChange={(time) => onChange({ ...leg, time })}
      />
      <TimeOptions
        mode={leg.timeMode}
        preference={leg.timePreference}
        onModeChange={(timeMode) => onChange({ ...leg, timeMode })}
        onPreferenceChange={(timePreference) => onChange({ ...leg, timePreference })}
        returning={returning}
      />
      <RegularStopsNotice query={query} onChange={(q) => onChange(legOf(q))} />
    </fieldset>
  )
}
export function WeeklyDayEditor({
  plan,
  onChange,
  usedDays = [],
  fixedWeekday = false,
}: {
  plan: WeeklyDayPlan
  onChange: (plan: WeeklyDayPlan) => void
  usedDays?: number[]
  fixedWeekday?: boolean
}) {
  return (
    <div className="stack">
      <label className="field">
        <span>Deň týždňa</span>
        <select
          disabled={fixedWeekday}
          value={plan.weekday}
          onChange={(e) => onChange({ ...plan, weekday: Number(e.target.value) })}
        >
          {weekdays.map((d, i) => (
            <option key={d} value={i + 1} disabled={usedDays.includes(i + 1)}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Typ cesty</legend>
        <div className="radio-row">
          <label>
            <input
              type="radio"
              name="regular-trip-kind"
              checked={!plan.returning}
              onChange={() => onChange({ ...plan, returning: undefined })}
            />
            Jednosmerná
          </label>
          <label>
            <input
              type="radio"
              name="regular-trip-kind"
              checked={!!plan.returning}
              onChange={() =>
                onChange({
                  ...plan,
                  returning: {
                    ...structuredClone(plan.outbound),
                    from: plan.outbound.to,
                    to: plan.outbound.from,
                    fromPlace: plan.outbound.toPlace,
                    toPlace: plan.outbound.fromPlace,
                    fromStopConfirmed: plan.outbound.toStopConfirmed,
                    toStopConfirmed: plan.outbound.fromStopConfirmed,
                    time: '13:30',
                    timeMode: 'departure',
                  },
                })
              }
            />
            Spiatočná
          </label>
        </div>
      </fieldset>
      <RegularLegEditor
        leg={plan.outbound}
        onChange={(outbound) => onChange({ ...plan, outbound })}
      />
      {plan.returning && (
        <RegularLegEditor
          returning
          leg={plan.returning}
          onChange={(returning) => onChange({ ...plan, returning })}
        />
      )}
    </div>
  )
}
