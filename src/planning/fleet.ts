import type { Allocation, Demand, DemandAccess, Policy, Resource, Run, Visit } from './types'
import type { RoadNetwork } from './network'

export type AccessIndex = Map<string, DemandAccess>
export const driveMinutes = (network: RoadNetwork, a: string, b: string) => {
  const path = network.drivePath(a, b)
  return path ? Math.ceil(path.seconds / 60) : Infinity
}
function walkFor(access: AccessIndex, id: string, stop: string, side: 'pickups' | 'dropoffs') {
  return access.get(id)?.[side].find((a) => a.stopId === stop)?.seconds ?? Infinity
}

/** Shared independent evaluator. All mutations are made on candidates, never committed runs. */
export function runErrors(
  run: Run,
  demand: Map<string, Demand>,
  access: AccessIndex,
  resource: Resource,
  network: RoadNetwork,
  policy: Policy,
) {
  const errors: string[] = []
  if (run.visits.length < 2) return ['STOP_SEQUENCE']
  if (run.visits[0].arrival < resource.start || run.visits.at(-1)!.departure > resource.end)
    errors.push('DUTY_WINDOW')
  const occupancy = Array.from({ length: run.visits.length - 1 }, () => 0)
  for (let i = 0; i < run.visits.length; i++) {
    const v = run.visits[i]
    if (v.departure < v.arrival || v.departure - v.arrival < policy.dwellMinutes)
      errors.push('DWELL')
    if (
      i &&
      v.arrival <
        run.visits[i - 1].departure + driveMinutes(network, run.visits[i - 1].stopId, v.stopId)
    )
      errors.push('ROAD_TIME')
  }
  const ids = new Set<string>()
  for (const a of run.allocations) {
    const d = demand.get(a.demandId)
    if (
      !d ||
      d.date !== run.date ||
      ids.has(a.demandId) ||
      a.seats !== d.seats ||
      a.pickup < 0 ||
      a.dropoff <= a.pickup ||
      a.dropoff >= run.visits.length
    ) {
      errors.push('ALLOCATION')
      continue
    }
    ids.add(a.demandId)
    const pick = run.visits[a.pickup],
      drop = run.visits[a.dropoff]
    const firstWalk = walkFor(access, d.id, pick.stopId, 'pickups'),
      lastWalk = walkFor(access, d.id, drop.stopId, 'dropoffs')
    if (
      !Number.isFinite(firstWalk + lastWalk) ||
      firstWalk > d.maxWalkSeconds ||
      lastWalk > d.maxWalkSeconds
    )
      errors.push('WALK')
    if (
      pick.departure < d.earliestPickup + Math.ceil(firstWalk / 60) ||
      drop.arrival + Math.ceil(lastWalk / 60) > d.latestArrival
    )
      errors.push('TIME_WINDOW')
    if (drop.arrival - pick.departure > d.maxRideMinutes) errors.push('RIDE_TIME')
    for (let i = a.pickup; i < a.dropoff; i++) occupancy[i] += a.seats
  }
  if (occupancy.some((n) => n > resource.capacity)) errors.push('NO_CAPACITY')
  return [...new Set(errors)]
}

export function dutyErrors(runs: Run[], resource: Resource, network: RoadNetwork, policy: Policy) {
  const errors: string[] = []
  for (const date of new Set(runs.map((r) => r.date))) {
    const day = runs
      .filter((r) => r.date === date && r.resourceId === resource.id)
      .sort((a, b) => a.visits[0].arrival - b.visits[0].arrival)
    let end = resource.start,
      location = resource.depot
    for (const run of day) {
      const start = run.visits[0].arrival,
        finish = run.visits.at(-1)!.departure
      const travel = driveMinutes(network, location, run.visits[0].stopId)
      if (start < end + travel + (end === resource.start ? 0 : policy.preparationMinutes))
        errors.push('REPOSITION')
      const occupiedStart = start - travel
      if (resource.breaks.some((b) => occupiedStart < b.end && finish > b.start))
        errors.push('DRIVER_BREAK')
      end = finish
      location = run.visits.at(-1)!.stopId
    }
    const home = end + driveMinutes(network, location, resource.depot)
    if (home > resource.end) errors.push('DEPOT_RETURN')
    if (resource.breaks.some((b) => end < b.end && home > b.start)) errors.push('DRIVER_BREAK')
  }
  return [...new Set(errors)]
}

function schedule(
  stops: string[],
  allocations: Allocation[],
  demand: Map<string, Demand>,
  access: AccessIndex,
  earliest: number,
  policy: Policy,
  network: RoadNetwork,
): Visit[] {
  const visits: Visit[] = []
  let time = earliest
  for (let i = 0; i < stops.length; i++) {
    if (i) time += driveMinutes(network, stops[i - 1], stops[i])
    const pickups = allocations.filter((a) => a.pickup === i)
    const first = pickups.length
      ? Math.max(
          ...pickups.map(
            (a) =>
              demand.get(a.demandId)!.earliestPickup +
              Math.ceil(walkFor(access, a.demandId, stops[i], 'pickups') / 60),
          ),
        )
      : time
    // The first visit does not reserve a vehicle for hours before the first pickup.
    if (!i) time = Math.max(time, first - policy.dwellMinutes)
    const departure = Math.max(time + policy.dwellMinutes, first)
    visits.push({ stopId: stops[i], arrival: time, departure })
    time = departure
  }
  return visits
}
function withInserted(run: Run, stop: string, at: number) {
  return {
    stops: [
      ...run.visits.slice(0, at).map((v) => v.stopId),
      stop,
      ...run.visits.slice(at).map((v) => v.stopId),
    ],
    allocations: run.allocations.map((a) => ({
      ...a,
      pickup: a.pickup + Number(a.pickup >= at),
      dropoff: a.dropoff + Number(a.dropoff >= at),
    })),
  }
}

/** Existing stops first; insertion only into uncommitted draft Flex runs. */
export function insertionCandidates(
  run: Run,
  d: Demand,
  demand: Map<string, Demand>,
  access: AccessIndex,
  resource: Resource,
  network: RoadNetwork,
  policy: Policy,
): Run[] {
  const options = access.get(d.id)
  if (!options || run.date !== d.date || run.allocations.some((a) => a.demandId === d.id)) return []
  const results: Run[] = []
  for (const pick of options.pickups)
    for (const drop of options.dropoffs) {
      if (pick.stopId === drop.stopId) continue
      for (let p = 0; p < run.visits.length; p++)
        for (let q = p + 1; q < run.visits.length; q++) {
          if (run.visits[p].stopId !== pick.stopId || run.visits[q].stopId !== drop.stopId) continue
          const next = {
            ...run,
            allocations: [
              ...run.allocations,
              { demandId: d.id, pickup: p, dropoff: q, seats: d.seats },
            ],
          }
          if (!run.locked)
            next.visits = schedule(
              run.visits.map((v) => v.stopId),
              next.allocations,
              demand,
              access,
              run.visits[0].arrival,
              policy,
              network,
            )
          if (!runErrors(next, demand, access, resource, network, policy).length) results.push(next)
        }
      if (run.locked || run.visits.length >= 7) continue
      for (let p = 0; p <= run.visits.length; p++) {
        const one = withInserted(run, pick.stopId, p)
        for (let q = p + 1; q <= one.stops.length; q++) {
          const stops = [...one.stops.slice(0, q), drop.stopId, ...one.stops.slice(q)]
          if (stops.some((s, i) => i > 0 && s === stops[i - 1])) continue
          const allocations = [
            ...one.allocations.map((a) => ({
              ...a,
              pickup: a.pickup + Number(a.pickup >= q),
              dropoff: a.dropoff + Number(a.dropoff >= q),
            })),
            { demandId: d.id, pickup: p, dropoff: q, seats: d.seats },
          ]
          const next = {
            ...run,
            allocations,
            visits: schedule(
              stops,
              allocations,
              demand,
              access,
              run.visits[0].arrival,
              policy,
              network,
            ),
          }
          if (!runErrors(next, demand, access, resource, network, policy).length) results.push(next)
        }
      }
    }
  return results
}

export function runDistance(run: Run, network: RoadNetwork) {
  return run.visits
    .slice(1)
    .reduce(
      (n, v, i) => n + (network.drivePath(run.visits[i].stopId, v.stopId)?.meters ?? Infinity),
      0,
    )
}

export function findMatches(
  d: Demand,
  runs: Run[],
  demand: Map<string, Demand>,
  access: AccessIndex,
  resources: Resource[],
  network: RoadNetwork,
  policy: Policy,
) {
  return runs
    .filter((r) => r.date === d.date)
    .flatMap((run) => {
      const resource = resources.find((r) => r.id === run.resourceId)!
      return insertionCandidates(run, d, demand, access, resource, network, policy)
        .filter(
          (candidate) =>
            !dutyErrors(
              runs.map((r) => (r.id === run.id ? candidate : r)),
              resource,
              network,
              policy,
            ).length,
        )
        .map((candidate) => ({
          candidate,
          addedMeters: runDistance(candidate, network) - runDistance(run, network),
        }))
    })
    .sort(
      (a, b) =>
        a.addedMeters - b.addedMeters ||
        a.candidate.visits.at(-1)!.departure - b.candidate.visits.at(-1)!.departure ||
        a.candidate.id.localeCompare(b.candidate.id),
    )
}

/** Try new runs in every actual gap, including repositioning to both neighbouring commitments. */
export function newRun(
  d: Demand,
  runs: Run[],
  demand: Map<string, Demand>,
  access: AccessIndex,
  resources: Resource[],
  network: RoadNetwork,
  policy: Policy,
  id: string,
): Run | null {
  const choices: Run[] = [],
    options = access.get(d.id)
  if (!options) return null
  for (const resource of resources) {
    if (resource.capacity < d.seats) continue
    const day = runs
      .filter((r) => r.date === d.date && r.resourceId === resource.id)
      .sort((a, b) => a.visits[0].arrival - b.visits[0].arrival)
    for (const previous of [undefined, ...day])
      for (const pick of options.pickups)
        for (const drop of options.dropoffs) {
          if (pick.stopId === drop.stopId) continue
          const start =
            (previous?.visits.at(-1)!.departure ?? resource.start) +
            (previous ? policy.preparationMinutes : 0) +
            driveMinutes(network, previous?.visits.at(-1)!.stopId ?? resource.depot, pick.stopId)
          const allocations = [{ demandId: d.id, pickup: 0, dropoff: 1, seats: d.seats }]
          const candidate: Run = {
            id,
            date: d.date,
            resourceId: resource.id,
            kind: 'flex',
            locked: false,
            allocations,
            visits: schedule(
              [pick.stopId, drop.stopId],
              allocations,
              demand,
              access,
              start,
              policy,
              network,
            ),
          }
          if (
            !runErrors(candidate, demand, access, resource, network, policy).length &&
            !dutyErrors([...runs, candidate], resource, network, policy).length
          )
            choices.push(candidate)
        }
  }
  return (
    choices.sort(
      (a, b) =>
        runDistance(a, network) - runDistance(b, network) ||
        a.visits.at(-1)!.departure - b.visits.at(-1)!.departure ||
        a.resourceId.localeCompare(b.resourceId),
    )[0] ?? null
  )
}

/** Bounded relocate improvement. Only draft Flex is movable; each move rechecks all promises. */
export function improveDraftRuns(
  runs: Run[],
  demand: Map<string, Demand>,
  access: AccessIndex,
  resources: Resource[],
  network: RoadNetwork,
  policy: Policy,
) {
  let current = runs
  const cost = (day: Run[], resource: Resource) => {
    const ordered = [...day].sort((a, b) => a.visits[0].arrival - b.visits[0].arrival)
    let previous = resource.depot,
      meters = 0
    for (const run of ordered) {
      meters += network.drivePath(previous, run.visits[0].stopId)?.meters ?? Infinity
      meters += runDistance(run, network)
      previous = run.visits.at(-1)!.stopId
    }
    meters += network.drivePath(previous, resource.depot)?.meters ?? Infinity
    const first = ordered[0],
      last = ordered.at(-1)
    const minutes =
      first && last
        ? last.visits.at(-1)!.departure +
          driveMinutes(network, previous, resource.depot) -
          first.visits[0].arrival +
          driveMinutes(network, resource.depot, first.visits[0].stopId)
        : 0
    return (meters / 1000) * policy.kilometreCost + (minutes / 60) * policy.driverHourCost
  }
  for (let pass = 0; pass < 3; pass++) {
    let improved = false
    for (const run of current.filter((r) => !r.locked && r.kind === 'flex')) {
      const resource = resources.find((r) => r.id === run.resourceId)!
      let best = run,
        bestCost = cost(
          current.filter((r) => r.resourceId === resource.id && r.date === run.date),
          resource,
        )
      for (let from = 0; from < run.visits.length; from++)
        for (let to = 0; to < run.visits.length; to++) {
          if (from === to) continue
          const order = run.visits.map((_, i) => i).filter((i) => i !== from)
          order.splice(to, 0, from)
          const allocations = run.allocations.map((a) => ({
            ...a,
            pickup: order.indexOf(a.pickup),
            dropoff: order.indexOf(a.dropoff),
          }))
          if (allocations.some((a) => a.pickup >= a.dropoff)) continue
          const visits = schedule(
            order.map((i) => run.visits[i].stopId),
            allocations,
            demand,
            access,
            run.visits[0].arrival,
            policy,
            network,
          )
          const candidate = { ...run, visits, allocations }
          if (runErrors(candidate, demand, access, resource, network, policy).length) continue
          const day = current.map((r) => (r.id === run.id ? candidate : r))
          if (dutyErrors(day, resource, network, policy).length) continue
          const nextCost = cost(
            day.filter((r) => r.resourceId === resource.id && r.date === run.date),
            resource,
          )
          if (nextCost < bestCost - 0.000001) {
            best = candidate
            bestCost = nextCost
            improved = true
          }
        }
      current = current.map((r) => (r.id === run.id ? best : r))
    }
    if (!improved) break
  }
  return current
}
