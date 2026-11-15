import { driveMinutes } from './fleet'
import type { RoadNetwork } from './network'
import type { ExternalService, Journey, JourneyLeg, Policy, Resource, Run, Visit } from './types'

export interface JourneyQuery {
  date: string
  from: string
  to: string
  earliest: number
  latest: number
  seats: number
  maximumTransfers: number
  walkSpeedKmh: number
  maxWalkSeconds: number
  avoidSteps: boolean
}
interface Service {
  id: string
  kind: 'fixed' | 'flex' | 'external'
  visits: Visit[]
  run?: Run
}

export function segmentSeats(run: Run, from: number, to: number, capacity: number) {
  let free = capacity
  for (let i = from; i < to; i++)
    free = Math.min(
      free,
      capacity -
        run.allocations
          .filter((a) => a.pickup <= i && a.dropoff > i)
          .reduce((n, a) => n + a.seats, 0),
    )
  return free
}

/** Event label search keeps nondominated arrival/transfer/walking alternatives. */
export function searchJourneys(
  query: JourneyQuery,
  runs: Run[],
  external: ExternalService[],
  resources: Resource[],
  network: RoadNetwork,
  policy: Policy,
): Journey[] {
  const services: Service[] = [
    ...runs
      .filter((r) => r.date === query.date)
      .map((r) => ({ id: r.id, kind: r.kind, visits: r.visits, run: r })),
    ...external
      .filter((r) => r.date === query.date)
      .map((r) => ({ id: r.id, kind: 'external' as const, visits: r.visits })),
  ]
  interface Label {
    stop: string
    time: number
    legs: JourneyLeg[]
    used: string[]
    walking: number
  }
  const queue: Label[] = [
    { stop: query.from, time: query.earliest, legs: [], used: [], walking: 0 },
  ]
  const labels = new Map<string, Label[]>(),
    finished: Journey[] = []
  const walk = (a: string, b: string) => {
    if (a === b) return 0
    const from = network.walkNode(a),
      to = network.walkNode(b)
    return from && to
      ? network.walkSeconds(from, to, query.walkSpeedKmh, query.avoidSteps)
      : Infinity
  }
  while (queue.length) {
    queue.sort((a, b) => a.time - b.time || a.used.length - b.used.length)
    const current = queue.shift()!
    if (current.time > query.latest) continue
    const finalWalk = current.used.length ? walk(current.stop, query.to) : Infinity
    if (
      finalWalk <= query.maxWalkSeconds &&
      current.time + Math.ceil(finalWalk / 60) <= query.latest
    ) {
      const minutes = Math.ceil(finalWalk / 60)
      finished.push({
        legs: minutes
          ? [
              ...current.legs,
              {
                serviceId: `walk:${current.stop}:${query.to}`,
                kind: 'walk',
                from: current.stop,
                to: query.to,
                departure: current.time,
                arrival: current.time + minutes,
                seatsSecured: false,
              },
            ]
          : current.legs,
        arrival: current.time + minutes,
        transfers: current.used.length - 1,
        walkMinutes: current.walking + minutes,
      })
      if (current.stop === query.to) continue
    }
    if (current.used.length > query.maximumTransfers) continue
    for (const service of services) {
      if (current.used.includes(service.id)) continue
      for (let i = 0; i < service.visits.length - 1; i++) {
        const start = service.visits[i],
          seconds = walk(current.stop, start.stopId)
        if (seconds > query.maxWalkSeconds) continue
        const walking = Math.ceil(seconds / 60),
          margin = current.used.length ? policy.transferMarginMinutes : 0
        const ready = current.time + walking + margin
        if (
          start.departure < ready ||
          (current.used.length &&
            start.departure - current.time - walking > policy.maximumTransferWaitMinutes)
        )
          continue
        for (let j = i + 1; j < service.visits.length; j++) {
          const end = service.visits[j]
          if (end.arrival > query.latest) continue
          if (
            service.run &&
            segmentSeats(
              service.run,
              i,
              j,
              resources.find((r) => r.id === service.run!.resourceId)!.capacity,
            ) < query.seats
          )
            continue
          const walkingLeg: JourneyLeg[] = walking
            ? [
                {
                  serviceId: `walk:${current.stop}:${start.stopId}`,
                  kind: 'walk',
                  from: current.stop,
                  to: start.stopId,
                  departure: current.time,
                  arrival: current.time + walking,
                  seatsSecured: false,
                },
              ]
            : []
          const next: Label = {
            stop: end.stopId,
            time: end.arrival,
            used: [...current.used, service.id],
            walking: current.walking + walking,
            legs: [
              ...current.legs,
              ...walkingLeg,
              {
                serviceId: service.id,
                kind: service.kind,
                from: start.stopId,
                to: end.stopId,
                departure: start.departure,
                arrival: end.arrival,
                seatsSecured: false,
              },
            ],
          }
          const previous = labels.get(next.stop) ?? []
          // Different used-service histories retain their own labels to avoid cycle-pruning valid alternatives.
          const history = [...next.used].sort().join('|')
          if (
            previous.some(
              (p) =>
                [...p.used].sort().join('|') === history &&
                p.time === next.time &&
                p.walking <= next.walking,
            )
          )
            continue
          labels.set(next.stop, [
            ...previous.filter(
              (p) =>
                !(
                  [...p.used].sort().join('|') === history &&
                  next.time === p.time &&
                  next.walking <= p.walking
                ),
            ),
            next,
          ])
          queue.push(next)
        }
      }
    }
  }
  return finished
    .filter(
      (a) =>
        !finished.some(
          (b) =>
            b !== a &&
            b.arrival <= a.arrival &&
            b.transfers <= a.transfers &&
            b.walkMinutes <= a.walkMinutes &&
            (b.arrival < a.arrival || b.transfers < a.transfers || b.walkMinutes < a.walkMinutes),
        ),
    )
    .sort(
      (a, b) => a.arrival - b.arrival || a.transfers - b.transfers || a.walkMinutes - b.walkMinutes,
    )
    .slice(0, 5)
}

/** The planning layer never claims a booking. Evaluate both directions before making any seat changes. */
export function evaluateRoundTrip(outbound: Journey[], returning: Journey[]) {
  const pair = outbound
    .flatMap((out) =>
      returning
        .filter((back) => back.legs[0]?.departure > out.arrival)
        .map((back) => ({ outbound: out, returning: back })),
    )
    .sort(
      (a, b) =>
        a.outbound.arrival - b.outbound.arrival || a.returning.arrival - b.returning.arrival,
    )[0]
  return pair
    ? { status: 'candidate' as const, ...pair, externalSeatsGuaranteed: false as const }
    : { status: 'pending' as const, reason: 'RETURN_UNAVAILABLE' as const }
}

/** Validate externally supplied chronology without substituting road durations for public timetables. */
export function serviceChronology(visits: Visit[], network?: RoadNetwork) {
  return (
    visits.length >= 2 &&
    visits.every(
      (v, i) =>
        v.arrival <= v.departure &&
        (!i ||
          v.arrival >=
            visits[i - 1].departure +
              (network ? driveMinutes(network, visits[i - 1].stopId, v.stopId) : 0)),
    )
  )
}
