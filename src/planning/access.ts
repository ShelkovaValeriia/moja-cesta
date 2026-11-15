import type { Demand, DemandAccess, PlanningStop, StopPlan } from './types'
import { RoadNetwork } from './network'

/** Cover both ends using actual graph paths; proposed stops are ineligible. */
export function chooseStops(
  demand: Demand[],
  stops: PlanningStop[],
  network: RoadNetwork,
  stopCost: number,
): StopPlan {
  const eligible = stops.filter((s) => s.status !== 'proposed' && network.walkNode(s.id))
  const access: DemandAccess[] = demand.map((d) => ({
    demandId: d.id,
    pickups: eligible.flatMap((s) => {
      const seconds = network.walkSeconds(
        d.accessNode,
        network.walkNode(s.id)!,
        d.walkSpeedKmh,
        d.avoidSteps,
      )
      return seconds <= d.maxWalkSeconds ? [{ stopId: s.id, seconds }] : []
    }),
    dropoffs: eligible.flatMap((s) => {
      const seconds = network.walkFromStop(
        network.walkNode(s.id)!,
        d.egressNode,
        d.walkSpeedKmh,
        d.avoidSteps,
      )
      return seconds <= d.maxWalkSeconds ? [{ stopId: s.id, seconds }] : []
    }),
  }))
  const uncovered = access
    .filter((a) => !a.pickups.length || !a.dropoffs.length)
    .map((a) => a.demandId)
  const requirements = access.flatMap((a) => [a.pickups, a.dropoffs]).filter((a) => a.length)
  const masks = requirements.map((a) =>
    a.reduce((mask, c) => mask | (1 << eligible.findIndex((s) => s.id === c.stopId)), 0),
  )
  let selected: string[] = [],
    objective = Infinity
  // Exact finite-candidate cover for the pilot, bounded to avoid exponential UI hangs.
  if (eligible.length <= 18) {
    for (let mask = 0; mask < 2 ** eligible.length; mask++) {
      let cost = 0
      for (let i = 0; i < eligible.length; i++)
        if (mask & (1 << i)) cost += stopCost + eligible[i].openingCost
      if (cost >= objective || masks.some((r) => !(mask & r))) continue
      selected = eligible.filter((_, i) => mask & (1 << i)).map((s) => s.id)
      objective = cost
    }
  } else {
    // Set-based greedy path avoids 32-bit masks for larger imported candidate pools.
    const remaining = new Set(requirements.map((_, i) => i))
    while (remaining.size) {
      const best = eligible
        .map((s) => ({
          s,
          covers: [...remaining].filter((i) => requirements[i].some((c) => c.stopId === s.id)),
        }))
        .filter((s) => s.covers.length)
        .sort(
          (a, b) =>
            (stopCost + a.s.openingCost) / a.covers.length -
              (stopCost + b.s.openingCost) / b.covers.length || a.s.id.localeCompare(b.s.id),
        )[0]
      if (!best) break
      selected.push(best.s.id)
      best.covers.forEach((i) => remaining.delete(i))
    }
    objective = selected.reduce(
      (sum, id) => sum + stopCost + eligible.find((s) => s.id === id)!.openingCost,
      0,
    )
  }
  return {
    selected,
    uncovered,
    method: eligible.length <= 18 ? 'exact-subsets' : 'greedy',
    objective,
    access: access.map((a) => ({
      ...a,
      pickups: a.pickups
        .filter((c) => selected.includes(c.stopId))
        .sort((a, b) => a.seconds - b.seconds),
      dropoffs: a.dropoffs
        .filter((c) => selected.includes(c.stopId))
        .sort((a, b) => a.seconds - b.seconds),
    })),
  }
}

/** Proposals only: greedy pedestrian coverage of uncovered access ends, never operational approval. */
export function suggestStops(demand: Demand[], plan: StopPlan, network: RoadNetwork, limit = 5) {
  const missing = plan.access.flatMap((a) => {
    const d = demand.find((d) => d.id === a.demandId)!
    return [
      ...(!a.pickups.length ? [{ d, node: d.accessNode, origin: true }] : []),
      ...(!a.dropoffs.length ? [{ d, node: d.egressNode, origin: false }] : []),
    ]
  })
  const pool = [...new Set(missing.map((m) => m.node))].filter((n) => network.isStreetCandidate(n))
  const left = new Set(missing.map((_, i) => i)),
    suggestions: { stop: PlanningStop; potentialMovements: number }[] = []
  const candidates = pool.map((node) => ({
    node,
    covered: missing.flatMap((m, i) => {
      const seconds = m.origin
        ? network.walkSeconds(m.node, node, m.d.walkSpeedKmh, m.d.avoidSteps)
        : network.walkFromStop(node, m.node, m.d.walkSpeedKmh, m.d.avoidSteps)
      return seconds <= m.d.maxWalkSeconds ? [i] : []
    }),
  }))
  while (left.size && suggestions.length < limit) {
    const best = candidates
      .map((c) => ({ node: c.node, covered: c.covered.filter((i) => left.has(i)) }))
      .sort((a, b) => b.covered.length - a.covered.length || a.node.localeCompare(b.node))[0]
    if (!best?.covered.length) break
    const d = missing[best.covered[0]].d,
      stopId = missing[best.covered[0]].origin ? d.from : d.to
    const municipality =
      network.stops.find((s) => s.id === stopId)?.municipality ?? 'Pilotná oblasť'
    suggestions.push({
      stop: {
        id: `proposal:${best.node}`,
        name: `Návrh ${suggestions.length + 1} · ${municipality}`,
        municipality,
        ...network.point(best.node),
        hub: false,
        status: 'proposed',
        openingCost: 10,
        platformIds: [],
      },
      potentialMovements: new Set(best.covered.map((i) => missing[i].d.id)).size,
    })
    best.covered.forEach((i) => left.delete(i))
  }
  return suggestions
}
