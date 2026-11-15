import { ArrowLeft } from 'lucide-react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../context'
import { DispatcherRouteMap } from '../components/DispatcherRouteMap'
import type { DispatcherMapRoute } from '../dispatcherMapDataset'
import '../components/dispatcher-map.css'

export function DispatcherMap() {
  const { kind, id } = useParams()
  const { state } = useStore()
  const location = useLocation()
  const navigate = useNavigate()
  const trip = kind === 'trip' ? state.trips.find((t) => t.id === id) : undefined
  const request = kind === 'request' ? state.requests.find((r) => r.id === id) : undefined
  const route: DispatcherMapRoute | undefined = trip
    ? { kind: 'trip', value: trip }
    : request
      ? { kind: 'request', value: request }
      : undefined
  const fallback =
    kind === 'request'
      ? '/dispatcher/requests'
      : trip?.kind === 'fixed'
        ? '/dispatcher/fixed'
        : '/dispatcher/schedule'
  const returnTo: unknown = location.state?.returnTo
  const hasReturn =
    typeof returnTo === 'string' &&
    /^\/dispatcher\/(fixed|schedule|requests)(?:[/?]|$)/.test(returnTo)

  if (!route) return <Navigate to={fallback} replace />
  return (
    <main className="dispatcher-map-screen" aria-label="Mapa trasy dispečera">
      <DispatcherRouteMap route={route} />
      <button
        className="btn dispatcher-map-back"
        onClick={() => {
          if (hasReturn && window.history.state?.idx > 0) navigate(-1)
          else navigate(hasReturn ? returnTo : fallback, { replace: true })
        }}
      >
        <ArrowLeft size={20} aria-hidden="true" /> Späť
      </button>
    </main>
  )
}
