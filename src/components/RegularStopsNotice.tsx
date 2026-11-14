import type { SearchQuery } from '../types'
import { useStore } from '../context'
import { coordinates, distanceMeters } from '../places'
import { Check, MapPin } from 'lucide-react'
export function RegularStopsNotice({
  query: q,
  onChange,
}: {
  query: SearchQuery
  onChange: (query: SearchQuery) => void
}) {
  const { state } = useStore()
  const items = (
    [
      ['from', 'Nástup'],
      ['to', 'Výstup'],
    ] as const
  ).flatMap(([side, label]) => {
    const place = side === 'from' ? q.fromPlace : q.toPlace,
      confirmed = side === 'from' ? q.fromStopConfirmed : q.toStopConfirmed,
      stop = state.stops.find((s) => s.id === q[side])
    return place?.type === 'custom' ? [{ side, label, place, confirmed, stop }] : []
  })
  if (!items.length) return null
  return (
    <div className="regular-stop-notice">
      <p>
        <MapPin size={18} />
        <strong>Pravidelný spoj používa schválené zastávky.</strong>
      </p>
      {items.map((item) => (
        <div className="suggested-stop" key={item.side}>
          <div>
            <span>
              {item.label}: {item.place.name}
            </span>
            <small>{coordinates(item.place)}</small>
            <p>
              Navrhnutá zastávka: <strong>{item.stop?.name ?? 'Nie je dostupná'}</strong>
              {item.stop?.latitude !== undefined &&
                item.stop.longitude !== undefined &&
                ` · približne ${Math.round(distanceMeters(item.place, { latitude: item.stop.latitude, longitude: item.stop.longitude }))} m vzdušnou čiarou`}
            </p>
          </div>
          {item.confirmed ? (
            <span className="badge confirmed">
              <Check size={13} />
              Zastávka potvrdená
            </span>
          ) : (
            <button
              className="btn btn-small btn-secondary"
              type="button"
              disabled={!item.stop}
              onClick={() => onChange({ ...q, [`${item.side}StopConfirmed`]: true })}
            >
              Použiť túto zastávku
            </button>
          )}
        </div>
      ))}
      <p className="small muted">
        V požiadavke na jazdu zostane váš pôvodný bod ako návrh pre dispečera. Pešia trasa sa
        nepočíta.
      </p>
    </div>
  )
}
