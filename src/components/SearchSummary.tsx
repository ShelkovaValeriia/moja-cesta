import { coordinates } from '../places'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Pencil } from 'lucide-react'
import { useStore } from '../context'
import { dateLabel } from '../data'
import { stopName } from '../domain'
import { queryString, preferenceLabels } from '../search'
import type { SearchQuery } from '../types'
export function SearchSummary({ query: q }: { query: SearchQuery }) {
  const { state } = useStore()
  return (
    <section className="search-summary" aria-label="Parametre vyhľadávania">
      <div>
        <h2>
          <span>
            {q.fromPlace?.name ?? stopName(state, q.from)}
            {q.fromPlace?.type === 'custom' && (
              <small className="summary-coordinates">{coordinates(q.fromPlace)}</small>
            )}
          </span>
          <ArrowRight size={18} />
          <span>
            {q.toPlace?.name ?? stopName(state, q.to)}
            {q.toPlace?.type === 'custom' && (
              <small className="summary-coordinates">{coordinates(q.toPlace)}</small>
            )}
          </span>
        </h2>
        <p>
          <CalendarDays size={16} />
          {dateLabel(q.date)} · {q.timeMode === 'arrival' ? 'Príchod do' : 'Odchod'} {q.time}
          {q.timePreference !== 'none' && ` · ${preferenceLabels[q.timePreference]}`}
          {q.roundTrip &&
            ` · Návrat ${dateLabel(q.returnDate)} · ${q.returnTimeMode === 'arrival' ? 'Príchod do' : 'Odchod'} ${q.returnTime}${q.returnTimePreference !== 'none' ? ` · ${preferenceLabels[q.returnTimePreference]}` : ''}`}
        </p>
        <p className="search-passengers">
          {state.people.find((p) => p.id === q.personId)?.name ?? 'Neznámy cestujúci'} · {q.seats}{' '}
          {q.seats === 1 ? 'miesto' : 'miesta'}
        </p>
      </div>
      <Link className="text-link" to={`/passenger/search?${queryString(q)}`}>
        <Pencil size={15} />
        Zmeniť vyhľadávanie
      </Link>
    </section>
  )
}
