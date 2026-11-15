import pilot from './data/pilot.json'
import type { RoadNetwork } from './network'
import { driveMinutes } from './fleet'
import type { Demand, PlanningStop, Policy, Run, Scenario } from './types'
import { DEFAULT_ECONOMICS } from './economics'

export const PILOT_STOPS: PlanningStop[] = pilot.stops.map((s) => ({
  ...s,
  status: 'demo',
  openingCost: 0,
}))
export const DEFAULT_POLICY: Policy = {
  walkSeconds: 480,
  dwellMinutes: 1,
  preparationMinutes: 3,
  transferMarginMinutes: 5,
  maximumTransferWaitMinutes: 45,
  kilometreCost: 0.15,
  driverHourCost: 12,
  vehicleDayCost: 25,
  stopCost: 2,
  farePerMovement: 2,
}
function randomGenerator(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 4294967296
  }
}
export function allocateDates() {
  const loads = [0, 0, 0]
  return [...pilot.cells]
    .sort((a, b) => Number(a.from) - Number(b.from) || Number(a.to) - Number(b.to))
    .map((cell) => {
      const dates = [0, 0, 0].map(() => Math.floor(cell.count / 3))
      const order = [0, 1, 2].sort((a, b) => loads[a] - loads[b] || a - b)
      for (const d of order.slice(0, cell.count % 3)) dates[d]++
      dates.forEach((n, i) => {
        loads[i] += n
      })
      return { ...cell, dates }
    })
}
function fixedRun(
  date: string,
  resourceId: string,
  start: number,
  sequence: string[],
  id: string,
  network: RoadNetwork,
  policy: Policy,
): Run {
  let time = start
  return {
    id,
    date,
    kind: 'fixed',
    resourceId,
    locked: true,
    allocations: [],
    visits: sequence.map((stopId, i) => {
      if (i) time += driveMinutes(network, sequence[i - 1], stopId)
      const arrival = time
      time += policy.dwellMinutes
      return { stopId, arrival, departure: time }
    }),
  }
}
export function createScenario(
  kind: 'coordinated' | 'pressure',
  network: RoadNetwork,
  seed = 20260908,
): Scenario {
  const random = randomGenerator(seed),
    pressure = kind === 'pressure'
  const policy = { ...DEFAULT_POLICY },
    demand: Demand[] = []
  const samples = new Map<string, string[]>()
  const accessPoint = (stop: string, slow: boolean, dispersed: boolean) => {
    const key = `${stop}:${slow}:${dispersed}`
    if (!samples.has(key))
      samples.set(
        key,
        network.accessNodes(stop, dispersed ? 430 : 80, dispersed ? 760 : 260, slow ? 3.2 : 4.5),
      )
    const nodes = samples.get(key)!
    return nodes.length
      ? nodes[Math.floor(random() * nodes.length)]
      : (network.walkNode(stop) ?? '')
  }
  for (const cell of allocateDates()) {
    let unit = 0
    cell.dates.forEach((count, dateIndex) => {
      for (let i = 0; i < count; i++) {
        const toward = PILOT_STOPS.find((s) => s.id === cell.to)!.hub
        const slow = random() < 0.12
        const dispersed = pressure && random() < 0.42
        let earliest: number, latest: number
        if (pressure) {
          if (
            toward &&
            (cell.from === '21' || cell.from === '55' || cell.from === '54' || cell.from === '53')
          ) {
            earliest = 415
            latest = 450
          } else {
            earliest = Math.round((toward ? 400 : 800) + random() * (toward ? 260 : 350))
            latest = earliest + 28 + Math.round(random() * 10)
          }
        } else {
          const wave = i % 3
          earliest = toward ? 375 + wave * 35 : 835 + wave * 45
          latest = earliest + (toward ? 95 : 100)
        }
        demand.push({
          id: `${kind}:${cell.from}-${cell.to}:${unit}`,
          sourceCell: `${cell.from}:${cell.to}`,
          unit: unit++,
          date: pilot.period[dateIndex],
          from: cell.from,
          to: cell.to,
          seats: 1,
          accessNode: toward
            ? accessPoint(cell.from, slow, dispersed)
            : (network.walkNode(cell.from) ?? ''),
          egressNode: toward
            ? (network.walkNode(cell.to) ?? '')
            : accessPoint(cell.to, slow, dispersed),
          walkSpeedKmh: slow ? 3.2 : 4.5,
          maxWalkSeconds: policy.walkSeconds,
          avoidSteps: slow,
          earliestPickup: earliest,
          latestArrival: latest,
          maxRideMinutes: pressure ? 45 : 85,
        })
      }
    })
  }
  // Link only explicitly synthetic compatible return units; preserve every observed OD count.
  for (const date of pilot.period) {
    const out = demand.find((d) => d.date === date && d.from === '9' && d.to === '1')
    const back = demand.find((d) => d.date === date && d.from === '1' && d.to === '9')
    if (out && back) {
      out.orderId = back.orderId = `${kind}:round:${date}`
    }
  }
  const resources = [1, 2].map((n) => ({
    id: `vehicle-${n}`,
    driverId: `demo-driver-${n}`,
    capacity: 8,
    depot: '1',
    start: 330,
    end: 1200,
    breaks: [{ start: 720, end: 750 }],
  }))
  const fixed: Run[] = []
  for (const date of pilot.period)
    for (const [index, sequence] of [
      ['1', '17', '59', '9', '1', '4'],
      ['1', '55', '54', '21', '1', '2'],
    ].entries())
      for (const start of [365, 550, 840, 1030]) {
        const ordered =
          start >= 840
            ? [sequence[0], ...sequence.slice(1, -1).reverse(), sequence.at(-1)!]
            : sequence
        fixed.push(
          fixedRun(
            date,
            resources[index].id,
            start,
            ordered.filter((id, i) => !i || id !== ordered[i - 1]),
            `fixed:${date}:${index}:${start}`,
            network,
            policy,
          ),
        )
      }
  return {
    schemaVersion: 1,
    id: kind,
    name: pressure ? 'Rozptýlené cesty a časový tlak' : 'Zladené cesty',
    seed,
    sourceHash: pilot.sha256,
    networkVersion: network.snapshot.timestamp,
    timezone: 'Europe/Bratislava',
    dates: [...pilot.period],
    stops: PILOT_STOPS.map((s) => ({ ...s })),
    demand,
    resources,
    fixed,
    policy,
    economics: { ...DEFAULT_ECONOMICS },
    external: pilot.period.map((date) => ({
      id: `synthetic-public:${date}`,
      date,
      name: 'Modelový regionálny spoj',
      synthetic: true,
      source: 'Syntetický cestovný poriadok pre experiment; nejde o spoj dopravcu.',
      visits: [
        { stopId: '55', arrival: 430, departure: 431 },
        { stopId: '21', arrival: 455, departure: 456 },
        { stopId: '1', arrival: 470, departure: 471 },
      ],
    })),
    assumptions: [
      '172 pohybov a pôvodné páry zastávok sú z dodanej matice. Nejde o 172 rôznych osôb ani o zistený neuspokojený dopyt.',
      'Rozdelenie na 58 / 57 / 57 pohybov, časy, prístupové body, pešie profily a tri spiatočné väzby sú simulované.',
      'Dve vozidlá po 8 miest, vodiči, smeny, prestávky, pravidelné záväzky a nákladové sadzby sú predpoklady experimentu.',
      'Kúpna cena, zostatková hodnota, odpisy, spotreba, cena paliva a cestovné sú upraviteľné modelové predpoklady, nie cenové ponuky. Podpora zadaná do modelu nie je prisľúbenou dotáciou.',
      'Zastávky sú ukážkové miesta bez prevádzkového schválenia. Nástupištia sú zachované v zdrojovom prepojení; simulácia používa uvedeného zástupcu.',
      'Časy jazdy sú vypočítané z OSM a modelových rýchlostí, bez premávky. Pešia sieť nepotvrdzuje bezpečnosť alebo bezbariérovosť v teréne.',
      'Septembrový verejný cestovný poriadok nie je overený. Regionálny spoj v experimente je výslovne syntetický; miesta u dopravcu nerezervujeme.',
    ],
  }
}
