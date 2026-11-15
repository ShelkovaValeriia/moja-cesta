import { PassengerMapSurface } from '../maps/PassengerMapSurface'
import { DateInput } from '../components/DateInput'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useStore } from '../context'
import { queryString, readQuery } from '../search'
import { Empty, PageTitle, TripCard } from '../components/ui'
export function PassengerLines() {
  const { state } = useStore(),
    [date, setDate] = useState(state.serviceDate)
  const trips = state.trips
    .filter((t) => t.kind === 'fixed' && t.date === date)
    .sort((a, b) => a.stops[0].time.localeCompare(b.stops[0].time))
  return (
    <PassengerMapSurface
      trips={trips}
      renderDetails={(map) => {
        const t = trips.find((trip) => trip.id === map.route?.id)
        return (
          t && (
            <Link
              className="btn btn-wide"
              to={`/passenger/search?${queryString({ ...readQuery(new URLSearchParams()), from: t.stops[0].stopId, to: t.stops.at(-1)!.stopId, date, time: t.stops[0].time, timeMode: 'departure', roundTrip: false, returnDate: date, returnTime: '17:00' })}`}
            >
              Vyhľadať na trase <ArrowRight size={16} />
            </Link>
          )
        )
      }}
    >
      {(map) => (
        <div className="passenger-flow">
          <PageTitle
            title="Pravidelné linky"
            description="Stabilné trasy a časy, na ktoré sa môžete spoľahnúť."
            back="/passenger"
          />
          <label className="field service-date">
            <span>Dátum cestovania</span>
            <DateInput required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="stack spaced">
            {trips.map((t) => (
              <TripCard
                key={t.id}
                trip={t}
                selected={map.selection.routeId === t.id}
                onSelect={() => map.selectRoute(t.id)}
              />
            ))}
            {!trips.length && (
              <Empty
                title="Na tento deň nie sú dostupné pravidelné spoje"
                text="Vyberte iný dátum. Ukážkový cestovný poriadok obsahuje najbližších 8 dní."
              />
            )}
          </div>
        </div>
      )}
    </PassengerMapSurface>
  )
}
