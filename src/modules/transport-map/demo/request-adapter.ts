import type { AppState } from '../../../types'
import type { MapDataset, MapRoute } from '../types'

/** Public projection only. Never copy custom pins, notes, people, members or home labels. */
export function publicRequestRoutes(state: AppState, dataset: MapDataset): MapRoute[] {
  const result: MapRoute[] = []
  for (const request of state.requests) {
    if (request.status !== 'pending' && request.status !== 'approved') continue
    const from = state.stops.find((s) => s.id === request.from)
    const to = state.stops.find((s) => s.id === request.to)
    const representative = (municipality: string | undefined) =>
      dataset.stops.find(
        (s) => s.municipality === municipality && /, (AS|OcÚ|centrum)/.test(s.name),
      ) ?? dataset.stops.find((s) => s.municipality === municipality)
    const a = representative(from?.village)
    const b = representative(to?.village)
    if (!a || !b || a.id === b.id) continue
    const legs = [
      { from: a, to: b, date: request.date, time: request.time, mode: request.timeMode },
      ...(request.returnDate && request.returnTime
        ? [
            {
              from: b,
              to: a,
              date: request.returnDate,
              time: request.returnTime,
              mode: request.returnTimeMode ?? ('departure' as const),
            },
          ]
        : []),
    ]
    for (const [index, leg] of legs.entries())
      result.push({
        id: `request:${request.id}:${index}`,
        code: `P${state.requests.indexOf(request) + 1}${index ? 'S' : ''}`,
        name: 'Požiadavka na spoj',
        direction: `${leg.from.municipality} → ${leg.to.municipality}`,
        kind: 'flex',
        geometrySource: 'schematic',
        serviceDates: [leg.date],
        stops: [
          { occurrenceId: 'pickup', stopId: leg.from.id },
          { occurrenceId: 'dropoff', stopId: leg.to.id },
        ],
        request: {
          id: request.id,
          date: leg.date,
          time: leg.time,
          timeMode: leg.mode,
          passengers: request.passengers,
          status: request.status,
        },
      })
  }
  return result
}
