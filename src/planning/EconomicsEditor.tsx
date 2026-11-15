import { useState } from 'react'
import { DEFAULT_ECONOMICS } from './economics'
import type { Scenario } from './types'

const fields = [
  ['purchasePricePerBus', 'Kúpna cena jedného autobusu (€)', 0, 1000000],
  ['residualValuePerBus', 'Zostatková hodnota autobusu (€)', 0, 1000000],
  ['depreciationYears', 'Doba odpisovania (roky)', 0.1, 50],
  ['litresPer100Km', 'Spotreba paliva (l / 100 km)', 0, 100],
  ['fuelPricePerLitre', 'Cena paliva (€ / l)', 0, 20],
  ['vehicleDayCost', 'Poistenie a iné fixné náklady (€ / autobus / deň)', 0, 10000],
  ['kilometreCost', 'Servis a pneumatiky bez paliva (€ / km)', 0, 100],
  ['driverHourCost', 'Celkový náklad na vodiča (€ / hod.)', 0, 1000],
  ['overheadPerDay', 'Réžia celej služby (€ / deň)', 0, 10000],
  ['farePerMovement', 'Naše cestovné za pohyb jednej osoby (€)', 0, 1000],
  ['supportPerDay', 'Modelový príspevok na službu (€ / deň)', 0, 100000],
] as const
type Field = (typeof fields)[number][0]

export function EconomicsEditor({
  scenario,
  onApply,
}: {
  scenario: Scenario
  onApply: (scenario: Scenario) => void
}) {
  const [values, setValues] = useState<Record<Field, string>>(() => {
    const initial = { ...(scenario.economics ?? DEFAULT_ECONOMICS), ...scenario.policy }
    return Object.fromEntries(
      fields.map(([id]) => [id, initial[id] === null ? '' : String(initial[id]).replace('.', ',')]),
    ) as Record<Field, string>
  })
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  return (
    <details className="scenario-economics-editor">
      <summary>Ekonomické predpoklady · upraviť a prepočítať</summary>
      <p className="scenario-note">
        Všetky ceny sú modelové, v jednotnej báze bez DPH. Výsledok nezahŕňa daň z príjmov ani
        úroky. Cestovné patrí našej flotile iba za pohyby, ktoré sama obslúži.
      </p>
      {!scenario.economics && (
        <p className="scenario-note">
          Starší scenár nemá oddelené palivo a odpisy. Pred prepočtom skontrolujte aj sadzbu servisu
          bez paliva.
        </p>
      )}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          const next: Partial<Record<Field, number | null>> = {},
            invalid: Partial<Record<Field, string>> = {}
          for (const [id, , min, max] of fields) {
            const text = values[id].trim().replace(',', '.')
            if (id === 'farePerMovement' && !text) {
              next[id] = null
              continue
            }
            const number = Number(text)
            if (
              !text ||
              !/^(\d+(\.\d*)?|\.\d+)$/.test(text) ||
              !Number.isFinite(number) ||
              number < min ||
              number > max
            )
              invalid[id] =
                `Zadajte číslo od ${min.toLocaleString('sk-SK')} do ${max.toLocaleString('sk-SK')}.`
            else next[id] = number
          }
          if (next.residualValuePerBus! > next.purchasePricePerBus!)
            invalid.residualValuePerBus = 'Zostatková hodnota nemôže presiahnuť kúpnu cenu.'
          setErrors(invalid)
          if (Object.keys(invalid).length) return
          onApply({
            ...scenario,
            policy: {
              ...scenario.policy,
              kilometreCost: next.kilometreCost!,
              driverHourCost: next.driverHourCost!,
              vehicleDayCost: next.vehicleDayCost!,
              farePerMovement: next.farePerMovement!,
            },
            economics: {
              purchasePricePerBus: next.purchasePricePerBus!,
              residualValuePerBus: next.residualValuePerBus!,
              depreciationYears: next.depreciationYears!,
              litresPer100Km: next.litresPer100Km!,
              fuelPricePerLitre: next.fuelPricePerLitre!,
              overheadPerDay: next.overheadPerDay!,
              supportPerDay: next.supportPerDay!,
            },
          })
        }}
      >
        <div className="scenario-controls">
          {fields.map(([id, label]) => (
            <label key={id}>
              {label}
              <input
                inputMode="decimal"
                value={values[id]}
                aria-invalid={Boolean(errors[id])}
                aria-describedby={errors[id] ? `economic-error-${id}` : undefined}
                onChange={(event) => setValues({ ...values, [id]: event.target.value })}
              />
              {errors[id] && (
                <span className="scenario-field-error" id={`economic-error-${id}`}>
                  {errors[id]}
                </span>
              )}
            </label>
          ))}
        </div>
        <p className="scenario-note">
          Prázdne cestovné znamená neznáme tržby a výsledok. Nula znamená bezplatnú jazdu. Príspevok
          je predpoklad, nie potvrdená dotácia.
        </p>
        <button className="btn" type="submit">
          Prepočítať všetky stratégie
        </button>
      </form>
    </details>
  )
}
