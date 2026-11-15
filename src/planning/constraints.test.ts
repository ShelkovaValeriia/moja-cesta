import { describe, expect, it } from 'vitest'
import { RoadNetwork } from './network'
import { chooseStops, suggestStops } from './access'
import { DEFAULT_POLICY } from './scenarios'
import { dutyErrors, findMatches, runErrors } from './fleet'
import { evaluateRoundTrip, searchJourneys } from './journeys'
import type { Demand, DemandAccess, NetworkSnapshot, PlanningStop, Resource, Run } from './types'

const stops: PlanningStop[] = [0, 1, 2].map((i) => ({
  id: String(i),
  name: `Miesto ${i}`,
  municipality: 'Test',
  latitude: 0,
  longitude: i * 0.005,
  status: 'demo',
  openingCost: 0,
  hub: i === 0,
  platformIds: [],
}))
const snapshot: NetworkSnapshot = {
  source: 'test',
  timestamp: 'test',
  license: 'test',
  nodes: { a: [0, 0], b: [0, 0.005], c: [0, 0.01], isolated: [0.01, 0.02] },
  ways: [{ id: 'road', nodes: ['a', 'b', 'c'], tags: { highway: 'residential', oneway: 'yes' } }],
}
const network = new RoadNetwork(snapshot, stops)
const resource: Resource = {
  id: 'v',
  driverId: 'driver',
  capacity: 2,
  depot: '0',
  start: 300,
  end: 1100,
  breaks: [{ start: 720, end: 750 }],
}
const d: Demand = {
  id: 'd',
  sourceCell: '0:1',
  unit: 0,
  from: '0',
  to: '1',
  date: '2026-09-08',
  seats: 1,
  accessNode: 'a',
  egressNode: 'b',
  walkSpeedKmh: 4.5,
  maxWalkSeconds: 480,
  avoidSteps: false,
  earliestPickup: 350,
  latestArrival: 450,
  maxRideMinutes: 90,
}
const access = (id = 'd'): DemandAccess => ({
  demandId: id,
  pickups: [{ stopId: '0', seconds: 0 }],
  dropoffs: [{ stopId: '1', seconds: 0 }],
})
const run: Run = {
  id: 'r',
  date: d.date,
  resourceId: 'v',
  kind: 'fixed',
  locked: true,
  visits: [
    { stopId: '0', arrival: 359, departure: 360 },
    { stopId: '1', arrival: 365, departure: 366 },
  ],
  allocations: [],
}

describe('Planning hard constraints', () => {
  it('uses a directed vehicle graph and a separate walk graph', () => {
    expect(network.drivePath('0', '2')).toBeTruthy()
    expect(network.drivePath('2', '0')).toBeNull()
    expect(network.walkSeconds('c', 'a')).toBeGreaterThan(0)
    expect(network.walkSeconds('isolated', 'a')).toBe(Infinity)
  })
  it('accepts a walking boundary and rejects one second beyond it, including proposed stops', () => {
    const seconds = network.walkSeconds('a', 'b')
    const only = [{ ...stops[1] }]
    const graph = new RoadNetwork(snapshot, stops)
    const boundary = { ...d, maxWalkSeconds: seconds, egressNode: 'a' }
    expect(chooseStops([boundary], only, graph, 2).uncovered).toEqual([])
    expect(
      chooseStops([{ ...boundary, maxWalkSeconds: seconds - 1 }], only, graph, 2).uncovered,
    ).toEqual(['d'])
    expect(
      chooseStops([boundary], [{ ...only[0], status: 'proposed' }], graph, 2).uncovered,
    ).toEqual(['d'])
  })
  it('enforces the eight-minute budget on measured 480 / 481 second paths', () => {
    const speed = (network.walkSeconds('a', 'b', 4.5) * 4.5) / 480
    const at = { ...d, maxWalkSeconds: 480, walkSpeedKmh: speed, egressNode: 'b' }
    expect(network.walkSeconds('a', 'b', speed)).toBeCloseTo(480, 8)
    expect(chooseStops([at], [stops[1]], network, 2).uncovered).toEqual([])
    const over = { ...at, walkSpeedKmh: (speed * 480) / 481 }
    expect(network.walkSeconds('a', 'b', over.walkSpeedKmh)).toBeCloseTo(481, 8)
    const rejected = chooseStops([over], [stops[1]], network, 2)
    expect(rejected.uncovered).toEqual(['d'])
    const proposals = suggestStops([over], rejected, network)
    expect(proposals[0].stop.status).toBe('proposed')
    expect(proposals[0].potentialMovements).toBe(1)
    expect(rejected.uncovered).toEqual(['d'])
  })
  it('offers a late join with spare seats without modifying a locked timetable', () => {
    const twoWay = new RoadNetwork(
      {
        ...snapshot,
        ways: snapshot.ways.map((w) => ({ ...w, tags: { ...w.tags, oneway: 'no' } })),
      },
      stops,
    )
    const d2 = { ...d, id: 'next' }
    const candidates = findMatches(
      d2,
      [run],
      new Map([
        [d.id, d],
        [d2.id, d2],
      ]),
      new Map([
        [d.id, access()],
        [d2.id, access('next')],
      ]),
      [resource],
      twoWay,
      DEFAULT_POLICY,
    )
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0].candidate.visits).toEqual(run.visits)
    expect(run.allocations).toEqual([])
  })
  it('checks every occupied segment, respects locked timetables and allows seats after alighting', () => {
    const demands = new Map([
      ['d', d],
      ['next', { ...d, id: 'next' }],
    ])
    const choices = new Map([
      ['d', access()],
      ['next', access('next')],
    ])
    const full = { ...run, allocations: [{ demandId: 'd', pickup: 0, dropoff: 1, seats: 1 }] }
    const matches = findMatches(
      { ...d, id: 'next' },
      [full],
      demands,
      choices,
      [{ ...resource, capacity: 1 }],
      network,
      DEFAULT_POLICY,
    )
    expect(matches).toEqual([])
    const noCommitments: Resource = { ...resource, depot: '0', end: 1100 }
    expect(runErrors(full, demands, choices, noCommitments, network, DEFAULT_POLICY)).toEqual([])
    expect(
      runErrors(
        {
          ...full,
          allocations: [...full.allocations, { demandId: 'next', pickup: 0, dropoff: 1, seats: 1 }],
        },
        demands,
        choices,
        { ...resource, capacity: 1 },
        network,
        DEFAULT_POLICY,
      ),
    ).toContain('NO_CAPACITY')
  })
  it('rejects an assignment when the return to depot is impossible or it overlaps a break', () => {
    expect(dutyErrors([run], resource, network, DEFAULT_POLICY)).toContain('DEPOT_RETURN')
    expect(
      dutyErrors(
        [
          {
            ...run,
            visits: [
              { stopId: '0', arrival: 721, departure: 722 },
              { stopId: '1', arrival: 727, departure: 728 },
            ],
          },
        ],
        resource,
        network,
        DEFAULT_POLICY,
      ),
    ).toContain('DRIVER_BREAK')
  })
  it('rejects tight transfers, keeps external seats unreserved and checks both round-trip directions', () => {
    const external = (departure: number) => [
      {
        id: 'public',
        date: d.date,
        name: 'Model',
        synthetic: true,
        source: 'test',
        visits: [
          { stopId: '1', arrival: departure - 1, departure },
          { stopId: '2', arrival: departure + 5, departure: departure + 6 },
        ],
      },
    ]
    const query = {
      date: d.date,
      from: '0',
      to: '2',
      earliest: 355,
      latest: 390,
      seats: 1,
      maximumTransfers: 2,
      walkSpeedKmh: 4.5,
      maxWalkSeconds: 0,
      avoidSteps: false,
    }
    expect(
      searchJourneys(query, [run], external(369), [resource], network, DEFAULT_POLICY),
    ).toEqual([])
    const options = searchJourneys(query, [run], external(370), [resource], network, DEFAULT_POLICY)
    expect(options[0].transfers).toBe(1)
    expect(options[0].legs.every((l) => !l.seatsSecured)).toBe(true)
    expect(evaluateRoundTrip(options, []).status).toBe('pending')
    expect(
      evaluateRoundTrip(options, [
        {
          ...options[0],
          legs: options[0].legs.map((l) => ({
            ...l,
            departure: l.departure + 100,
            arrival: l.arrival + 100,
          })),
          arrival: options[0].arrival + 100,
        },
      ]).status,
    ).toBe('candidate')
  })
})
