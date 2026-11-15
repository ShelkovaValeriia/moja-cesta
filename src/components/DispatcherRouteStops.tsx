import type { RoutePoint } from '../dispatcherRoutes'

export function DispatcherRouteStops({ points }: { points: RoutePoint[] }) {
  return (
    <ol className="dispatch-stop-points" role="list" aria-label="Miesta v poradí jazdy">
      {points.map((point, index) => (
        <li key={index}>
          <span>{point.name}</span>
          {point.time && <time>{point.time}</time>}
        </li>
      ))}
    </ol>
  )
}
