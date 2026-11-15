import pilot from './data/pilot.json'
import type { NetworkSnapshot, Scenario, Visit } from './types'

const object = (value: unknown, path: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path}: očakáva sa objekt.`)
  return value as Record<string, unknown>
}
const string = (v: unknown, path: string) => {
  if (typeof v !== 'string' || !v.trim() || v.length > 1200)
    throw new Error(`${path}: neplatný text.`)
  return v
}
const number = (v: unknown, path: string, low: number, high: number) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < low || v > high)
    throw new Error(`${path}: číslo musí byť od ${low} do ${high}.`)
  return v
}
const integer = (v: unknown, path: string, low: number, high: number) => {
  const n = number(v, path, low, high)
  if (!Number.isInteger(n)) throw new Error(`${path}: očakáva sa celé číslo.`)
  return n
}
const list = (v: unknown, path: string, max: number): unknown[] => {
  if (!Array.isArray(v) || v.length > max)
    throw new Error(`${path}: neplatný zoznam (najviac ${max}).`)
  return v
}
const boolean = (v: unknown, path: string) => {
  if (typeof v !== 'boolean') throw new Error(`${path}: očakáva sa áno/nie.`)
  return v
}
function unique(ids: string[], path: string) {
  if (ids.length !== new Set(ids).size) throw new Error(`${path}: duplicitný identifikátor.`)
}
function date(v: unknown, path: string) {
  const d = string(v, path)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
    !Number.isFinite(Date.parse(d)) ||
    new Date(d).toISOString().slice(0, 10) !== d
  )
    throw new Error(`${path}: neplatný kalendárny dátum.`)
  return d
}

/** Allowlist parser. Uploaded results are recomputed, never trusted as allocations or KPIs. */
export function parseScenario(value: unknown, snapshot: NetworkSnapshot): Scenario {
  const envelope = object(value, 'súbor')
  const root = object(envelope.scenario ?? envelope, 'scenario')
  if (root.schemaVersion !== 1) throw new Error('Nepodporovaná verzia scenára.')
  if (root.timezone !== 'Europe/Bratislava')
    throw new Error('Scenár musí používať Europe/Bratislava.')
  if (root.networkVersion !== snapshot.timestamp)
    throw new Error('Scenár používa inú verziu siete. Vyžaduje sa zhodný pripnutý OSM podklad.')
  const dates = list(root.dates, 'dates', 31).map((d, i) => date(d, `dates[${i}]`))
  unique(dates, 'dates')
  if (!dates.length) throw new Error('Chýbajú dni scenára.')
  const stops = list(root.stops, 'stops', 18).map((value, i) => {
    const s = object(value, `stops[${i}]`),
      p = `stops[${i}]`
    const state = string(s.status, `${p}.status`)
    if (!['demo', 'proposed', 'approved'].includes(state))
      throw new Error(`${p}: neplatný stav zastávky.`)
    return {
      id: string(s.id, `${p}.id`),
      name: string(s.name, `${p}.name`),
      municipality: string(s.municipality, `${p}.municipality`),
      latitude: number(s.latitude, `${p}.latitude`, 49.27, 49.405),
      longitude: number(s.longitude, `${p}.longitude`, 20.31, 20.5),
      hub: boolean(s.hub, `${p}.hub`),
      platformIds: list(s.platformIds, `${p}.platformIds`, 20).map((v) => string(v, p)),
      status: state === 'proposed' ? ('proposed' as const) : ('demo' as const),
      openingCost: number(s.openingCost, `${p}.openingCost`, 0, 10000),
    }
  })
  if (stops.length < 2) throw new Error('Potrebné sú aspoň dve zastávky.')
  unique(
    stops.map((s) => s.id),
    'stops',
  )
  const stopIds = new Set(stops.map((s) => s.id))
  const ref = (v: unknown, p: string) => {
    const id = string(v, p)
    if (!stopIds.has(id)) throw new Error(`${p}: neznáma zastávka ${id}.`)
    return id
  }
  const day = (v: unknown, p: string) => {
    const d = date(v, p)
    if (!dates.includes(d)) throw new Error(`${p}: deň mimo scenára.`)
    return d
  }
  const minute = (v: unknown, p: string) => integer(v, p, 0, 1439)
  const interval = (v: unknown, p: string) => {
    const x = object(v, p),
      start = minute(x.start, `${p}.start`),
      end = minute(x.end, `${p}.end`)
    if (end <= start) throw new Error(`${p}: koniec musí nasledovať po začiatku.`)
    return { start, end }
  }
  const resources = list(root.resources, 'resources', 8).map((value, i) => {
    const r = object(value, `resources[${i}]`),
      p = `resources[${i}]`,
      duty = interval(r, p)
    return {
      id: string(r.id, `${p}.id`),
      driverId: string(r.driverId, `${p}.driverId`),
      depot: ref(r.depot, `${p}.depot`),
      capacity: integer(r.capacity, `${p}.capacity`, 1, 64),
      ...duty,
      breaks: list(r.breaks, `${p}.breaks`, 8).map((b) => interval(b, p)),
    }
  })
  if (!resources.length) throw new Error('Chýbajú modelové vozidlá a vodiči.')
  unique(
    resources.map((r) => r.id),
    'resources',
  )
  unique(
    resources.map((r) => r.driverId),
    'driverId',
  )
  const node = (v: unknown, p: string) => {
    const id = string(v, p)
    if (!Object.hasOwn(snapshot.nodes, id)) throw new Error(`${p}: bod nie je v pripnutej sieti.`)
    return id
  }
  const demand = list(root.demand, 'demand', 1000).map((value, i) => {
    const d = object(value, `demand[${i}]`),
      p = `demand[${i}]`
    const earliestPickup = minute(d.earliestPickup, `${p}.earliestPickup`),
      latestArrival = minute(d.latestArrival, `${p}.latestArrival`)
    if (latestArrival <= earliestPickup) throw new Error(`${p}: neplatné časové okno.`)
    return {
      id: string(d.id, `${p}.id`),
      date: day(d.date, p),
      from: ref(d.from, `${p}.from`),
      to: ref(d.to, `${p}.to`),
      sourceCell: string(d.sourceCell, `${p}.sourceCell`),
      unit: integer(d.unit, `${p}.unit`, 0, 100000),
      seats: integer(d.seats, `${p}.seats`, 1, 64),
      accessNode: node(d.accessNode, `${p}.accessNode`),
      egressNode: node(d.egressNode, `${p}.egressNode`),
      walkSpeedKmh: number(d.walkSpeedKmh, `${p}.walkSpeedKmh`, 1, 7),
      maxWalkSeconds: integer(d.maxWalkSeconds, `${p}.maxWalkSeconds`, 0, 3600),
      avoidSteps: boolean(d.avoidSteps, `${p}.avoidSteps`),
      earliestPickup,
      latestArrival,
      maxRideMinutes: integer(d.maxRideMinutes, `${p}.maxRideMinutes`, 1, 240),
      ...(d.orderId === undefined ? {} : { orderId: string(d.orderId, `${p}.orderId`) }),
    }
  })
  unique(
    demand.map((d) => d.id),
    'demand',
  )
  unique(
    demand.map((d) => `${d.sourceCell}:${d.unit}`),
    'sourceCell/unit',
  )
  const visits = (value: unknown, p: string): Visit[] => {
    const v = list(value, p, 30).map((v, i) => {
      const x = object(v, `${p}[${i}]`)
      return {
        stopId: ref(x.stopId, `${p}[${i}].stopId`),
        arrival: minute(x.arrival, `${p}[${i}].arrival`),
        departure: minute(x.departure, `${p}[${i}].departure`),
      }
    })
    if (
      v.length < 2 ||
      v.some((a, i) => a.arrival > a.departure || (i > 0 && a.arrival < v[i - 1].departure))
    )
      throw new Error(`${p}: neplatné poradie alebo časy zastávok.`)
    return v
  }
  const fixed = list(root.fixed, 'fixed', 250).map((value, i) => {
    const r = object(value, `fixed[${i}]`),
      p = `fixed[${i}]`,
      resourceId = string(r.resourceId, `${p}.resourceId`)
    if (!resources.some((r) => r.id === resourceId)) throw new Error(`${p}: neznáme vozidlo.`)
    if (
      r.kind !== 'fixed' ||
      r.locked !== true ||
      list(r.allocations, `${p}.allocations`, 0).length
    )
      throw new Error(`${p}: vstup obsahuje iba nemenné modelové Fixed záväzky bez rezervácií.`)
    return {
      id: string(r.id, `${p}.id`),
      date: day(r.date, `${p}.date`),
      resourceId,
      kind: 'fixed' as const,
      locked: true,
      allocations: [],
      visits: visits(r.visits, `${p}.visits`),
    }
  })
  const external = list(root.external, 'external', 100).map((value, i) => {
    const r = object(value, `external[${i}]`),
      p = `external[${i}]`
    // This experiment only supports synthetic September external services. Real feeds need validated calendars.
    if (r.synthetic !== true)
      throw new Error(`${p}: skutočný verejný spoj vyžaduje samostatne overený kalendár a pôvod.`)
    return {
      id: string(r.id, `${p}.id`),
      name: string(r.name, `${p}.name`),
      date: day(r.date, `${p}.date`),
      synthetic: true,
      source: string(r.source, `${p}.source`),
      visits: visits(r.visits, `${p}.visits`),
    }
  })
  unique(
    [...fixed, ...external].map((r) => r.id),
    'services',
  )
  const p = object(root.policy, 'policy')
  const policy = {
    walkSeconds: integer(p.walkSeconds, 'policy.walkSeconds', 0, 3600),
    dwellMinutes: integer(p.dwellMinutes, 'policy.dwellMinutes', 1, 15),
    preparationMinutes: integer(p.preparationMinutes, 'policy.preparationMinutes', 0, 60),
    transferMarginMinutes: integer(p.transferMarginMinutes, 'policy.transferMarginMinutes', 0, 60),
    maximumTransferWaitMinutes: integer(
      p.maximumTransferWaitMinutes,
      'policy.maximumTransferWaitMinutes',
      0,
      240,
    ),
    kilometreCost: number(p.kilometreCost, 'policy.kilometreCost', 0, 100),
    driverHourCost: number(p.driverHourCost, 'policy.driverHourCost', 0, 1000),
    vehicleDayCost: number(p.vehicleDayCost, 'policy.vehicleDayCost', 0, 10000),
    stopCost: number(p.stopCost, 'policy.stopCost', 0, 10000),
    farePerMovement:
      p.farePerMovement === null
        ? null
        : number(p.farePerMovement, 'policy.farePerMovement', 0, 1000),
  }
  const sourceHash = string(root.sourceHash, 'sourceHash')
  const economics =
    root.economics === undefined
      ? undefined
      : (() => {
          const e = object(root.economics, 'economics')
          const purchasePricePerBus = number(
            e.purchasePricePerBus,
            'economics.purchasePricePerBus',
            0,
            1000000,
          )
          return {
            purchasePricePerBus,
            residualValuePerBus: number(
              e.residualValuePerBus,
              'economics.residualValuePerBus',
              0,
              purchasePricePerBus,
            ),
            depreciationYears: number(e.depreciationYears, 'economics.depreciationYears', 0.1, 50),
            litresPer100Km: number(e.litresPer100Km, 'economics.litresPer100Km', 0, 100),
            fuelPricePerLitre: number(e.fuelPricePerLitre, 'economics.fuelPricePerLitre', 0, 20),
            overheadPerDay: number(e.overheadPerDay, 'economics.overheadPerDay', 0, 10000),
            supportPerDay: number(e.supportPerDay, 'economics.supportPerDay', 0, 100000),
          }
        })()
  if (sourceHash === pilot.sha256) {
    if (
      demand.length !== 172 ||
      demand.some((d) => d.seats !== 1) ||
      pilot.cells.some(
        (c) =>
          demand.filter(
            (d) => d.sourceCell === `${c.from}:${c.to}` && d.from === c.from && d.to === c.to,
          ).length !== c.count,
      )
    )
      throw new Error('Zdrojová matica: všetkých 26 párov a 172 pohybov musí zostať zachovaných.')
  }
  for (const id of new Set(demand.flatMap((d) => (d.orderId ? [d.orderId] : [])))) {
    const group = demand.filter((d) => d.orderId === id)
    if (group.length !== 2 || group[0].date !== group[1].date)
      throw new Error(`orderId ${id}: toto demo podporuje dva smery v rovnaký deň.`)
  }
  return {
    schemaVersion: 1,
    id: string(root.id, 'id'),
    name: string(root.name, 'name'),
    seed: integer(root.seed, 'seed', 0, 4294967295),
    sourceHash,
    networkVersion: snapshot.timestamp,
    timezone: 'Europe/Bratislava',
    dates,
    stops,
    resources,
    demand,
    fixed,
    external,
    policy,
    ...(economics ? { economics } : {}),
    assumptions: list(root.assumptions, 'assumptions', 30).map((v) => string(v, 'assumptions')),
  }
}

export function exportScenario(scenario: Scenario) {
  return JSON.stringify({ format: 'moja-cesta/scenario', version: 1, scenario }, null, 2)
}
