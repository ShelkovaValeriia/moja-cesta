import { ChevronDown } from 'lucide-react'
import { useStore } from '../context'
import { dateLabel } from '../data'
import { stopName, tripTime } from '../domain'
import { deadlineLabel } from '../regularPlanning'
import { planCoverage } from '../planCoverage'
import type { RecurringRule } from '../types'
export function PlanConfirmations({ rule }: { rule: RecurringRule }) {
  const { state } = useStore(),
    coverage = planCoverage(state, rule)
  const tasks = (state.regularTasks ?? []).filter(
    (t) => t.ruleId === rule.id && coverage.dates.some((d) => d.date === t.date),
  )
  const dates = [
    ...new Set([
      ...tasks.map((t) => t.date),
      ...coverage.dates.filter((d) => d.bookings.length).map((d) => d.date),
    ]),
  ].sort()
  if (!dates.length)
    return (
      <p className="regular-confirmations-empty">
        Zatiaľ nie sú dostupné žiadne potvrdenia ani termíny.
      </p>
    )
  return (
    <details className="regular-confirmations">
      <summary>
        <ChevronDown size={18} aria-hidden="true" />
        Potvrdenia a lehoty podľa dátumov
      </summary>
      <div className="regular-confirmations-content">
        {dates.map((date) => {
          const row = coverage.dates.find((d) => d.date === date)!,
            task = tasks.find((t) => t.date === date)
          return (
            <details className="regular-confirmation-date" key={date}>
              <summary>
                <ChevronDown size={17} aria-hidden="true" />
                <span>{dateLabel(date)}</span>
                <span
                  className={`regular-plan-badge ${row.covered ? 'secured' : rule.status === 'paused' ? 'paused' : 'waiting'}`}
                >
                  {row.covered
                    ? 'Potvrdené'
                    : rule.status === 'paused'
                      ? 'Pozastavené'
                      : 'Čaká na zabezpečenie'}
                </span>
              </summary>
              <div className="regular-confirmation-body">
                {row.covered ? (
                  row.bookings.map((b) => {
                    const trip = state.trips.find((t) => t.id === b.tripId)!
                    return (
                      <p key={b.id}>
                        <strong>Linka {trip.line}</strong> · {tripTime(trip, b.from)}{' '}
                        {stopName(state, b.from)} → {tripTime(trip, b.to)} {stopName(state, b.to)}
                      </p>
                    )
                  })
                ) : (
                  <>
                    <p>
                      {task?.deadline
                        ? `Lehota potvrdenia: ${deadlineLabel(task.deadline)}`
                        : 'Presnú lehotu a dopravu musí doplniť dispečer. Miesto zatiaľ nie je potvrdené.'}
                    </p>
                    <p>{task?.reason || 'Čaká sa na zabezpečenie všetkých potrebných smerov.'}</p>
                  </>
                )}
                {task?.status === 'confirmedLate' && (
                  <p className="form-error">Potvrdenie bolo doručené po lehote 24 hodín.</p>
                )}
                {task?.status === 'overdue' && !row.covered && (
                  <p className="form-error">Lehota potvrdenia uplynula. Kontaktujte dispečera.</p>
                )}
              </div>
            </details>
          )
        })}
      </div>
    </details>
  )
}
