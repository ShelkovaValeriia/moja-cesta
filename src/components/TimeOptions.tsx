import type { TimeMode, TimePreference } from '../types'
import { preferenceLabels } from '../search'
export function TimeOptions({
  mode,
  preference,
  onModeChange,
  onPreferenceChange,
  returning = false,
}: {
  mode: TimeMode
  preference: TimePreference
  onModeChange: (mode: TimeMode) => void
  onPreferenceChange: (preference: TimePreference) => void
  returning?: boolean
}) {
  return (
    <>
      <fieldset>
        <legend>{returning ? 'Čas cesty späť' : 'Čas cesty'}</legend>
        <div className="radio-row">
          <label>
            <input
              type="radio"
              name={returning ? 'return-time-mode' : 'outbound-time-mode'}
              checked={mode === 'departure'}
              onChange={() => onModeChange('departure')}
            />
            Odchod
          </label>
          <label>
            <input
              type="radio"
              name={returning ? 'return-time-mode' : 'outbound-time-mode'}
              checked={mode === 'arrival'}
              onChange={() => onModeChange('arrival')}
            />
            Príchod do
          </label>
        </div>
      </fieldset>
      <label className="field">
        <span>
          {returning ? 'Časová preferencia späť' : 'Časová preferencia'} <small>(nepovinné)</small>
        </span>
        <select
          value={preference}
          onChange={(e) => onPreferenceChange(e.target.value as TimePreference)}
        >
          {Object.entries(preferenceLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
