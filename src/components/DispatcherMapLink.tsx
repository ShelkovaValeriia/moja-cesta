import { Map } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

export function DispatcherMapLink({ kind, id }: { kind: 'trip' | 'request'; id: string }) {
  const location = useLocation()
  return (
    <Link
      className="btn btn-small btn-secondary dispatch-map-link"
      to={`/dispatcher/map/${kind}/${encodeURIComponent(id)}`}
      state={{ returnTo: `${location.pathname}${location.search}` }}
    >
      <Map size={17} aria-hidden="true" /> Zobraziť na mape
    </Link>
  )
}
