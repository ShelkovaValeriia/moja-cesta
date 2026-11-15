import { chooseStops, suggestStops } from './access'
import { driveMinutes, dutyErrors, findMatches, improveDraftRuns, newRun, runErrors } from './fleet'
import { searchJourneys } from './journeys'
import { calendarDays, economicSummary, marginalKilometreCost } from './economics'
import type { RoadNetwork } from './network'
import type {
  DemandAccess,
  Metrics,
  PlanResult,
  Run,
  Scenario,
  StopPlan,
  Strategy,
  Unserved,
} from './types'

const explanation = {
  NO_WALKABLE_STOP:
    'Chýba pešo dostupné miesto v povolenom čase. Potrebný je návrh alebo kontrola zastávky.',
  NO_FEASIBLE_INSERTION:
    'V obmedzenom hľadaní sa nenašlo vloženie so splnenou kapacitou, časmi, prestávkou a presunom k ďalšiemu záväzku.',
  NO_FIXED_OPTION: 'Publikované modelové spoje nespĺňajú túto cestu, jej čas alebo voľné miesta.',
  RETURN_UNAVAILABLE: 'Potrebný návrat sa nepodarilo zabezpečiť. Oba smery zostávajú nepotvrdené.',
}
// Inputs are immutable experiment snapshots. Proposal coverage is independent of the strategy.
const proposalCache = new WeakMap<Scenario, PlanResult['stopSuggestions']>()

export function measure(
  scenario: Scenario,
  result: Pick<PlanResult, 'runs' | 'allocations' | 'stops'>,
  network: RoadNetwork,
): Metrics {
  const { runs, allocations } = result,
    { policy } = scenario
  const fleet: Metrics['fleet'] = {
    ownedBuses: scenario.resources.length,
    usedBuses: new Set(runs.map((r) => r.resourceId)).size,
    peakBusyBuses: 0,
    calendarDays: calendarDays(scenario.dates),
    vehicleDays: scenario.resources.length * calendarDays(scenario.dates),
    managedMovements: scenario.demand
      .filter((d) => allocations[d.id]?.runIds.length)
      .reduce((n, d) => n + d.seats, 0),
    externalMovements: scenario.demand
      .filter((d) => allocations[d.id] && !allocations[d.id].runIds.length)
      .reduce((n, d) => n + d.seats, 0),
    buses: scenario.resources.map((r) => ({
      id: r.id,
      capacity: r.capacity,
      runs: runs.filter((run) => run.resourceId === r.id).length,
      km: 0,
      driverMinutes: 0,
    })),
  }
  const busyEvents = new Map<string, [number, number][]>()
  let vehicleKm = 0,
    deadheadKm = 0,
    passengerKm = 0,
    seatKm = 0,
    peak = 0,
    driverMinutes = 0
  for (const run of runs) {
    const capacity = scenario.resources.find((r) => r.id === run.resourceId)!.capacity
    for (let i = 0; i < run.visits.length - 1; i++) {
      const km = network.drivePath(run.visits[i].stopId, run.visits[i + 1].stopId)!.meters / 1000
      const load = run.allocations
        .filter((a) => a.pickup <= i && a.dropoff > i)
        .reduce((n, a) => n + a.seats, 0)
      vehicleKm += km
      fleet.buses.find((b) => b.id === run.resourceId)!.km += km
      passengerKm += load * km
      seatKm += capacity * km
      peak = Math.max(peak, load)
      if (!load) deadheadKm += km
    }
  }
  for (const resource of scenario.resources) {
    const usage = fleet.buses.find((b) => b.id === resource.id)!
    for (const date of scenario.dates) {
      const day = runs
        .filter((r) => r.resourceId === resource.id && r.date === date)
        .sort((a, b) => a.visits[0].arrival - b.visits[0].arrival)
      if (!day.length) continue
      const events = busyEvents.get(date) ?? []
      busyEvents.set(date, events)
      let previous = resource.depot
      for (const [index, run] of day.entries()) {
        const km = network.drivePath(previous, run.visits[0].stopId)!.meters / 1000
        vehicleKm += km
        usage.km += km
        deadheadKm += km
        seatKm += km * resource.capacity
        events.push(
          [
            run.visits[0].arrival -
              driveMinutes(network, previous, run.visits[0].stopId) -
              (index ? policy.preparationMinutes : 0),
            1,
          ],
          [run.visits.at(-1)!.departure, -1],
        )
        previous = run.visits.at(-1)!.stopId
      }
      const back = network.drivePath(previous, resource.depot)!.meters / 1000
      vehicleKm += back
      usage.km += back
      deadheadKm += back
      seatKm += back * resource.capacity
      const paidMinutes =
        day.at(-1)!.visits.at(-1)!.departure +
        driveMinutes(network, previous, resource.depot) -
        (day[0].visits[0].arrival - driveMinutes(network, resource.depot, day[0].visits[0].stopId))
      driverMinutes += paidMinutes
      usage.driverMinutes += paidMinutes
      const finish = day.at(-1)!.visits.at(-1)!.departure,
        returnMinutes = driveMinutes(network, previous, resource.depot)
      if (returnMinutes) events.push([finish, 1], [finish + returnMinutes, -1])
    }
  }
  for (const events of busyEvents.values()) {
    let busy = 0
    for (const [, change] of events.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
      busy += change
      fleet.peakBusyBuses = Math.max(fleet.peakBusyBuses, busy)
    }
  }
  const served = scenario.demand.filter((d) => allocations[d.id]).reduce((n, d) => n + d.seats, 0)
  const walks = Object.values(allocations)
    .map((a) => a.walkSeconds)
    .sort((a, b) => a - b)
  const orders = [...new Set(scenario.demand.flatMap((d) => (d.orderId ? [d.orderId] : [])))]
  const completeOrders = orders.filter((id) =>
    scenario.demand.filter((d) => d.orderId === id).every((d) => allocations[d.id]),
  ).length
  const usedStops = new Set(runs.flatMap((r) => r.visits.map((v) => v.stopId)))
  const stopCost =
    usedStops.size * policy.stopCost +
    [...usedStops].reduce(
      (sum, id) => sum + (scenario.stops.find((s) => s.id === id)?.openingCost ?? 0),
      0,
    )
  const economics = scenario.economics
    ? economicSummary({ fleet, vehicleKm, driverMinutes, stopCost }, policy, scenario.economics)
    : null
  return {
    movements: scenario.demand.reduce((n, d) => n + d.seats, 0),
    served,
    unserved: scenario.demand.reduce((n, d) => n + d.seats, 0) - served,
    stops: usedStops.size,
    runs: runs.length,
    vehicleKm,
    deadheadKm,
    passengerKm,
    seatKm,
    driverMinutes,
    peak,
    fleet,
    economics,
    cost:
      economics?.totalCost ??
      vehicleKm * policy.kilometreCost +
        (driverMinutes / 60) * policy.driverHourCost +
        fleet.vehicleDays * policy.vehicleDayCost +
        stopCost,
    revenue: economics
      ? economics.totalRevenue
      : policy.farePerMovement === null
        ? null
        : fleet.managedMovements * policy.farePerMovement,
    walkP95Seconds: walks[Math.max(0, Math.ceil(walks.length * 0.95) - 1)] ?? 0,
    completeOrders,
    pendingOrders: orders.length - completeOrders,
  }
}

export function validatePlan(
  scenario: Scenario,
  result: PlanResult,
  network: RoadNetwork,
): string[] {
  const demand = new Map(scenario.demand.map((d) => [d.id, d])),
    access = new Map(result.stops.access.map((a) => [a.demandId, a]))
  const errors = result.runs.flatMap((run) =>
    runErrors(
      run,
      demand,
      access,
      scenario.resources.find((r) => r.id === run.resourceId)!,
      network,
      scenario.policy,
    ).map((e) => `${run.id}:${e}`),
  )
  for (const resource of scenario.resources)
    errors.push(
      ...dutyErrors(result.runs, resource, network, scenario.policy).map(
        (e) => `${resource.id}:${e}`,
      ),
    )
  for (const fixed of scenario.fixed) {
    const actual = result.runs.find((r) => r.id === fixed.id)
    if (
      !actual ||
      JSON.stringify(actual.visits) !== JSON.stringify(fixed.visits) ||
      actual.resourceId !== fixed.resourceId
    )
      errors.push(`${fixed.id}:FIXED_CHANGED`)
  }
  const assigned = result.runs.flatMap((r) => r.allocations.map((a) => a.demandId))
  if (new Set(assigned).size !== assigned.length) errors.push('DUPLICATE_MOVEMENT')
  for (const d of scenario.demand) {
    if (Boolean(result.allocations[d.id]) === result.unserved.some((u) => u.demandId === d.id))
      errors.push(`${d.id}:RECONCILIATION`)
    if (d.orderId) {
      const group = scenario.demand.filter((a) => a.orderId === d.orderId)
      if (
        group.some((a) => result.allocations[a.id]) &&
        group.some((a) => !result.allocations[a.id])
      )
        errors.push(`${d.orderId}:PARTIAL_ORDER`)
    }
  }
  return errors
}

function solve(
  scenario: Scenario,
  strategy: Strategy,
  network: RoadNetwork,
  stops: StopPlan,
): PlanResult {
  const demand = new Map(scenario.demand.map((d) => [d.id, d])),
    access = new Map(stops.access.map((a) => [a.demandId, a]))
  let runs: Run[] = structuredClone(scenario.fixed)
  const unserved: Unserved[] = [],
    journeys: PlanResult['journeys'] = Object.create(null)
  const ordered = [...scenario.demand].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.latestArrival - b.latestArrival || a.id.localeCompare(b.id),
  )
  for (const d of ordered) {
    if (stops.uncovered.includes(d.id)) {
      unserved.push({
        demandId: d.id,
        code: 'NO_WALKABLE_STOP',
        reason: explanation.NO_WALKABLE_STOP,
      })
      continue
    }
    const match = findMatches(
      d,
      runs,
      demand,
      access,
      scenario.resources,
      network,
      scenario.policy,
    )[0]
    if (match) {
      runs = runs.map((r) => (r.id === match.candidate.id ? match.candidate : r))
      continue
    }
    if (strategy !== 'fixed') {
      const candidate = newRun(
        d,
        runs,
        demand,
        access,
        scenario.resources,
        network,
        scenario.policy,
        `flex:${scenario.id}:${d.id}`,
      )
      if (candidate) {
        runs.push(candidate)
        continue
      }
    }
    if (strategy === 'transfers') {
      const option = searchJourneys(
        {
          date: d.date,
          from: d.from,
          to: d.to,
          earliest:
            d.earliestPickup +
            Math.ceil(
              (access.get(d.id)?.pickups.find((a) => a.stopId === d.from)?.seconds ?? Infinity) /
                60,
            ),
          latest:
            d.latestArrival -
            Math.ceil(
              (access.get(d.id)?.dropoffs.find((a) => a.stopId === d.to)?.seconds ?? Infinity) / 60,
            ),
          seats: d.seats,
          maximumTransfers: 2,
          walkSpeedKmh: d.walkSpeedKmh,
          maxWalkSeconds: d.maxWalkSeconds,
          avoidSteps: d.avoidSteps,
        },
        [],
        scenario.external,
        scenario.resources,
        network,
        scenario.policy,
      )[0]
      // Only external-only alternatives are used in this allocation pass; mixed journeys need coordinated internal segment allocations.
      if (option) {
        journeys[d.id] = option
        continue
      }
    }
    const code = strategy === 'fixed' ? 'NO_FIXED_OPTION' : 'NO_FEASIBLE_INSERTION'
    unserved.push({ demandId: d.id, code, reason: explanation[code] })
  }
  // Synthetic linked orders are all-or-nothing; no outward allocation survives an unavailable return.
  const assigned = new Set([
    ...runs.flatMap((r) => r.allocations.map((a) => a.demandId)),
    ...Object.keys(journeys),
  ])
  for (const orderId of new Set(scenario.demand.flatMap((d) => (d.orderId ? [d.orderId] : [])))) {
    const group = scenario.demand.filter((d) => d.orderId === orderId)
    const chronology = [...group].sort((a, b) => a.earliestPickup - b.earliestPickup)
    const times = chronology.map((d) => {
      const run = runs.find((r) => r.allocations.some((a) => a.demandId === d.id)),
        allocation = run?.allocations.find((a) => a.demandId === d.id)
      return run && allocation
        ? {
            departure: run.visits[allocation.pickup].departure,
            arrival: run.visits[allocation.dropoff].arrival,
          }
        : journeys[d.id]
          ? { departure: journeys[d.id].legs[0].departure, arrival: journeys[d.id].arrival }
          : null
    })
    if (
      group.some((d) => !assigned.has(d.id)) ||
      times.some((t, i) => i && t && times[i - 1] && t.departure <= times[i - 1]!.arrival)
    ) {
      for (const d of group) {
        runs = runs.map((r) => ({
          ...r,
          allocations: r.allocations.filter((a) => a.demandId !== d.id),
        }))
        delete journeys[d.id]
        const old = unserved.findIndex((u) => u.demandId === d.id)
        if (old >= 0) unserved.splice(old, 1)
        unserved.push({
          demandId: d.id,
          code: 'RETURN_UNAVAILABLE',
          reason: explanation.RETURN_UNAVAILABLE,
        })
      }
    }
  }
  runs = runs.filter((r) => r.locked || r.allocations.length)
  runs = improveDraftRuns(runs, demand, access, scenario.resources, network, {
    ...scenario.policy,
    kilometreCost: marginalKilometreCost(scenario.policy, scenario.economics),
  })
  const allocations: PlanResult['allocations'] = Object.create(null)
  for (const run of runs)
    for (const a of run.allocations) {
      const choices = access.get(a.demandId)!
      const first = choices.pickups.find((s) => s.stopId === run.visits[a.pickup].stopId)!.seconds
      const last = choices.dropoffs.find((s) => s.stopId === run.visits[a.dropoff].stopId)!.seconds
      allocations[a.demandId] = { runIds: [run.id], walkSeconds: Math.max(first, last) }
    }
  for (const id of Object.keys(journeys))
    allocations[id] = {
      runIds: [],
      walkSeconds: Math.max(
        ...[...access.get(id)!.pickups, ...access.get(id)!.dropoffs].map((a) => a.seconds),
      ),
    }
  const result: PlanResult = {
    scenarioId: scenario.id,
    strategy,
    algorithm: 'network-cover-insertion-v1',
    stops,
    runs,
    allocations,
    journeys,
    unserved,
    metrics: measure(scenario, { runs, allocations, stops }, network),
    notices: [
      'Heuristický plán; nepreukazuje globálne optimum. Nenájdené vloženie nie je dôkaz, že žiadne riešenie neexistuje.',
      'Výsledok je simulácia, nie rezervácia ani publikovaný cestovný poriadok.',
    ],
    stopSuggestions: [],
  }
  const errors = validatePlan(scenario, result, network)
  if (errors.length) throw new Error(`Plán neprešiel kontrolou: ${errors.slice(0, 5).join(', ')}`)
  return result
}

export function planScenario(
  scenario: Scenario,
  strategy: Strategy,
  network: RoadNetwork,
): PlanResult {
  const minimum = chooseStops(scenario.demand, scenario.stops, network, scenario.policy.stopCost)
  // Compare a finite minimum-stop solution with all eligible stops: routing cost can overturn stop count alone.
  const all: StopPlan = {
    ...minimum,
    selected: scenario.stops
      .filter((s) => s.status !== 'proposed' && network.walkNode(s.id))
      .map((s) => s.id),
    access: [],
  }
  const eligible = new Set(all.selected)
  all.access = scenario.demand.map((d): DemandAccess => ({
    demandId: d.id,
    pickups: scenario.stops
      .filter((s) => eligible.has(s.id))
      .flatMap((s) => {
        const seconds = network.walkSeconds(
          d.accessNode,
          network.walkNode(s.id)!,
          d.walkSpeedKmh,
          d.avoidSteps,
        )
        return seconds <= d.maxWalkSeconds ? [{ stopId: s.id, seconds }] : []
      }),
    dropoffs: scenario.stops
      .filter((s) => eligible.has(s.id))
      .flatMap((s) => {
        const seconds = network.walkFromStop(
          network.walkNode(s.id)!,
          d.egressNode,
          d.walkSpeedKmh,
          d.avoidSteps,
        )
        return seconds <= d.maxWalkSeconds ? [{ stopId: s.id, seconds }] : []
      }),
  }))
  const a = solve(scenario, strategy, network, minimum)
  const candidates =
    all.selected.length === minimum.selected.length
      ? [a]
      : [a, solve(scenario, strategy, network, all)]
  const best = candidates.sort(
    (x, y) =>
      y.metrics.served - x.metrics.served ||
      x.metrics.cost - y.metrics.cost ||
      x.metrics.walkP95Seconds - y.metrics.walkP95Seconds,
  )[0]
  if (!proposalCache.has(scenario))
    proposalCache.set(scenario, suggestStops(scenario.demand, minimum, network))
  return { ...best, stopSuggestions: proposalCache.get(scenario)! }
}
