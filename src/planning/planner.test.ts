import { describe, expect, it } from 'vitest'
import snapshot from './data/network.json'
import pilot from './data/pilot.json'
import { RoadNetwork } from './network'
import { allocateDates, createScenario, PILOT_STOPS } from './scenarios'
import { measure, planScenario, validatePlan } from './planner'
import { exportScenario, parseScenario } from './io'
import { resultDataset } from './presentation'

describe('Source-backed scenario planning', () => {
  it('preserves every observed OD cell and the declared daily allocation', () => {
    const cells = allocateDates()
    expect(cells).toHaveLength(26)
    expect(cells.reduce((n, c) => n + c.count, 0)).toBe(172)
    expect([0, 1, 2].map((i) => cells.reduce((n, c) => n + c.dates[i], 0))).toEqual([58, 57, 57])
    for (const c of cells) expect(c.dates.reduce((n, a) => n + a, 0)).toBe(c.count)
  })
  it('routes and evaluates both seeded scenarios without overcapacity or changing Fixed commitments', () => {
    const network = new RoadNetwork(snapshot, PILOT_STOPS)
    for (const stop of PILOT_STOPS) {
      expect(network.walkNode(stop.id), stop.name).toBeTruthy()
      expect(network.drivePath('1', stop.id), stop.name).toBeTruthy()
    }
    for (const kind of ['coordinated', 'pressure'] as const) {
      const scenario = createScenario(kind, network)
      expect(scenario.demand).toHaveLength(172)
      for (const cell of pilot.cells)
        expect(
          scenario.demand.filter((d) => d.sourceCell === `${cell.from}:${cell.to}`),
        ).toHaveLength(cell.count)
      const result = planScenario(scenario, 'hybrid', network)
      const restored = parseScenario(JSON.parse(exportScenario(scenario)), snapshot)
      expect(restored).toEqual(scenario)
      expect(validatePlan(scenario, result, network)).toEqual([])
      expect(result.metrics.served + result.metrics.unserved).toBe(172)
      expect(result.metrics.peak).toBeLessThanOrEqual(8)
      expect(result.metrics.walkP95Seconds).toBeLessThanOrEqual(480)
      expect(result.metrics.served).toBeGreaterThan(0)
      expect(result.metrics.deadheadKm).toBeLessThanOrEqual(result.metrics.vehicleKm)
      expect(result.metrics.fleet.ownedBuses).toBe(2)
      expect(result.metrics.fleet.usedBuses).toBeLessThanOrEqual(2)
      expect(result.metrics.fleet.peakBusyBuses).toBeLessThanOrEqual(2)
      expect(result.runs.length).toBeGreaterThan(result.metrics.fleet.usedBuses)
      expect(result.metrics.fleet.buses.reduce((sum, bus) => sum + bus.km, 0)).toBeCloseTo(
        result.metrics.vehicleKm,
        6,
      )
      expect(result.metrics.fleet.managedMovements + result.metrics.fleet.externalMovements).toBe(
        result.metrics.served,
      )
      expect(result.metrics.economics!.fuelLitres).toBeCloseTo(result.metrics.vehicleKm / 10, 6)
      const legacy = { ...scenario }
      delete legacy.economics
      expect(parseScenario(legacy, snapshot).economics).toBeUndefined()
      expect(measure(legacy, result, network).economics).toBeNull()
      const invalidEconomics = structuredClone(scenario)
      invalidEconomics.economics!.fuelPricePerLitre = -1
      expect(() => parseScenario(invalidEconomics, snapshot)).toThrow('fuelPricePerLitre')
      const costed = {
        ...scenario,
        stops: scenario.stops.map((s) => (s.id === '1' ? { ...s, openingCost: 1000 } : s)),
      }
      expect(measure(costed, result, network).cost - result.metrics.cost).toBeCloseTo(1000, 6)
      if (kind === 'coordinated') expect(planScenario(scenario, 'hybrid', network)).toEqual(result)
      const projected = resultDataset(scenario, result, network)
      expect(projected.routes).toHaveLength(result.runs.length)
      expect(JSON.stringify(projected)).not.toMatch(
        /accessNode|egressNode|passengerCode|phone|sourceCell/,
      )
      const corrupted = structuredClone(scenario)
      corrupted.demand.pop()
      expect(() => parseScenario(corrupted, snapshot)).toThrow('172')
      const invalidDate = structuredClone(scenario)
      invalidDate.dates[0] = '2026-02-30'
      expect(() => parseScenario(invalidDate, snapshot)).toThrow('kalendárny')
      const unknownNode = structuredClone(scenario)
      unknownNode.demand[0].accessNode = '__proto__'
      expect(() => parseScenario(unknownNode, snapshot)).toThrow('sieti')
    }
  }, 120000)
})
