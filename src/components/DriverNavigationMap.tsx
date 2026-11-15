import type { Trip } from '../types'
export interface DriverMapStop {
  stopId: string
  name: string
  time: string
  latitude?: number
  longitude?: number
  boarding: number
  alighting: number
}
/** Replace this isolated presentation adapter when the team's real map is ready. No GPS or map API. */
export function DriverNavigationMap({
  trip,
  stopIndex,
  stops,
}: {
  trip: Trip
  stopIndex: number
  stops?: readonly DriverMapStop[]
}) {
  return (
    <div
      className="driver-navigation-map"
      data-trip-id={trip.id}
      data-stop-index={stopIndex}
      data-stop-count={stops?.length ?? trip.stops.length}
    >
      <img
        src="/images/driver-map-placeholder.svg"
        alt="Statická ilustračná mapa. Nezobrazuje skutočnú trasu ani polohu vozidla."
      />
      <span>Ilustračná mapa · bez GPS</span>
    </div>
  )
}
