import type { MapDataset, MapRoute, MapRouteSegment } from '../modules/transport-map'
import geography from '../modules/transport-map/demo/pilot-geography.json'
import corridor from '../modules/transport-map/demo/transfer-road.json'
import type { RoadNetwork } from './network'
import type { Journey, PlanResult, Run, Scenario } from './types'

export function timeLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
export function slovakCount(n: number, one: string, few: string, many: string) {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`
}
export function runGeometry(
  run: Run,
  network: RoadNetwork,
  start = 0,
  end = run.visits.length - 1,
) {
  const coordinates: number[][] = []
  for (let i = start; i < end; i++) {
    const path = network.drivePath(run.visits[i].stopId, run.visits[i + 1].stopId)
    if (!path)
      throw new Error(`Chýba cestný priebeh ${run.visits[i].stopId} → ${run.visits[i + 1].stopId}.`)
    coordinates.push(...path.coordinates.slice(coordinates.length ? 1 : 0))
  }
  if (coordinates.length < 2) throw new Error('Trasa nemá cestnú geometriu.')
  return { type: 'LineString' as const, coordinates }
}

/** Public aggregate projection. No access nodes, household locations or identities leave the planner. */
export function resultDataset(
  scenario: Scenario,
  result: PlanResult,
  network: RoadNetwork,
): MapDataset {
  const namespace = `${scenario.id}:${result.strategy}:`
  return {
    name: `${scenario.name} · simulácia`,
    demo: true,
    roadContext: {
      type: 'MultiLineString',
      coordinates: network.snapshot.ways
        .filter((w) =>
          [
            'primary',
            'secondary',
            'tertiary',
            'unclassified',
            'residential',
            'living_street',
            'service',
          ].includes(w.tags.highway ?? ''),
        )
        .map((w) =>
          w.nodes
            .filter((id) => network.snapshot.nodes[id])
            .map((id) => {
              const p = network.point(id)
              return [p.longitude, p.latitude]
            }),
        )
        .filter((line) => line.length > 1),
    },
    area: {
      ...geography.area,
      bounds: [geography.area.bounds[0], geography.area.bounds[1]],
      focusLocations: geography.area.focusLocations.map((l) => ({
        ...l,
        kind: l.kind === 'city' ? 'city' : 'village',
      })),
    },
    stops: scenario.stops
      .filter((s) => result.runs.some((r) => r.visits.some((v) => v.stopId === s.id)))
      .map((s) => ({
        id: s.id,
        name: s.name,
        municipality: s.municipality,
        status: 'demo',
        position: network.point(network.stopNode(s.id)!),
      })),
    routes: [...result.runs]
      .sort((a, b) => a.date.localeCompare(b.date) || a.visits[0].departure - b.visits[0].departure)
      .map((run, i): MapRoute => ({
        id: namespace + run.id,
        code: `${run.kind === 'fixed' ? 'P' : 'F'}${i + 1}`,
        kind: run.kind,
        name: [
          ...new Set(
            run.visits.map((v) => scenario.stops.find((s) => s.id === v.stopId)!.municipality),
          ),
        ].join(' → '),
        direction: `${timeLabel(run.visits[0].departure)} – ${timeLabel(run.visits.at(-1)!.arrival)}`,
        geometry: runGeometry(run, network),
        geometrySource: 'computed',
        serviceDates: [run.date],
        departures: [{ date: run.date, time: timeLabel(run.visits[0].departure) }],
        stops: run.visits.map((v, index) => ({
          stopId: v.stopId,
          occurrenceId: `${namespace}${run.id}:${index}`,
          time: timeLabel(v.departure),
        })),
        demoNote:
          'Simulovaný plán. Cestný priebeh z OSM; zastávky a prevádzkové časy nie sú schváleným cestovným poriadkom.',
      })),
  }
}

export function journeyDataset(
  scenario: Scenario,
  result: PlanResult,
  journeys: Journey[],
  network: RoadNetwork,
  date = scenario.dates[0],
): MapDataset {
  const base = resultDataset(scenario, result, network)
  const names = new Map(scenario.stops.map((s) => [s.id, s.name]))
  const poprad = { ...corridor.destination, id: 'poprad-demo', status: 'demo' as const }
  names.set(poprad.id, poprad.name)
  const stops = [
    ...scenario.stops
      .filter((s) => network.stopNode(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        municipality: s.municipality,
        status: 'demo' as const,
        position: network.point(network.stopNode(s.id)!),
      })),
    poprad,
  ]
  const routes = journeys.flatMap((journey, index): MapRoute[] => {
    const bus = journey.legs.filter((l) => l.kind !== 'walk')
    const segments: MapRouteSegment[] = []
    for (const [i, leg] of bus.entries()) {
      const run = result.runs.find((r) => r.id === leg.serviceId)
      let geometry
      if (run) {
        const p = run.visits.findIndex(
          (v) => v.stopId === leg.from && v.departure === leg.departure,
        )
        const q = run.visits.findIndex(
          (v, j) => j > p && v.stopId === leg.to && v.arrival === leg.arrival,
        )
        if (p < 0 || q < 0) return []
        geometry = runGeometry(run, network, p, q)
      } else if (leg.to === 'poprad-demo')
        geometry = { type: 'LineString' as const, coordinates: corridor.geometry.coordinates }
      else {
        const path = network.drivePath(leg.from, leg.to)
        if (!path) return []
        geometry = { type: 'LineString' as const, coordinates: path.coordinates }
      }
      segments.push({
        id: `${index}:${i}`,
        code:
          leg.kind === 'external'
            ? 'Modelový regionálny spoj'
            : leg.kind === 'fixed'
              ? 'Pravidelný spoj'
              : 'Flex',
        kind: leg.kind as 'fixed' | 'flex' | 'external',
        name: `${names.get(leg.from)} → ${names.get(leg.to)}`,
        geometry,
        departure: timeLabel(leg.departure),
        arrival: timeLabel(leg.arrival),
        demo: true,
      })
    }
    if (!segments.length) return []
    return [
      {
        id: `${scenario.id}:${result.strategy}:journey:${index}`,
        code: `C${index + 1}`,
        name: `${names.get(journey.legs[0].from)} → ${names.get(journey.legs.at(-1)!.to)}`,
        direction: slovakCount(journey.transfers, 'prestup', 'prestupy', 'prestupov'),
        kind: bus[0].kind as 'fixed' | 'flex' | 'external',
        geometrySource: 'computed',
        geometry: {
          type: 'MultiLineString',
          coordinates: segments.map((s) => s.geometry.coordinates as number[][]),
        },
        segments,
        serviceDates: [date],
        departures: [{ date, time: timeLabel(bus[0].departure) }],
        stops: journey.legs
          .flatMap((leg, i) => [
            {
              stopId: leg.from,
              occurrenceId: `${index}:${i}:from`,
              time: timeLabel(leg.departure),
            },
            { stopId: leg.to, occurrenceId: `${index}:${i}:to`, time: timeLabel(leg.arrival) },
          ])
          .filter((s, i, all) => !i || all[i - 1].stopId !== s.stopId),
        demoNote:
          'Modelová možnosť cesty, nie rezervácia. Regionálny spoj a jeho septembrové časy sú syntetické. Rozšírenie do Popradu sa nepočíta do 172 pohybov.',
      },
    ]
  })
  return { ...base, name: 'Modelové možnosti cesty', stops, routes }
}
