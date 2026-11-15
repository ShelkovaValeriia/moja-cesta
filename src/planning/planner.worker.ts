import snapshot from './data/network.json'
import { RoadNetwork } from './network'
import { PILOT_STOPS, createScenario } from './scenarios'
import { parseScenario } from './io'
import { planScenario } from './planner'
import { journeyDataset, resultDataset } from './presentation'
import { searchJourneys } from './journeys'
import type { Bundle, WorkerRequest, WorkerResponse } from './worker-types'
import type { Strategy } from './types'

let network: RoadNetwork, bundle: Bundle
const send = (message: WorkerResponse) => self.postMessage(message)
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  try {
    if (request.type === 'plan') {
      send({ type: 'progress', job: request.job, message: 'Pripravujeme cestnú a pešiu sieť…' })
      const input = request.input === undefined ? undefined : parseScenario(request.input, snapshot)
      network = new RoadNetwork(snapshot, input?.stops ?? PILOT_STOPS)
      const scenario = input ?? createScenario(request.kind, network, request.seed)
      const results = {} as Bundle['results'],
        datasets = {} as Bundle['datasets']
      for (const strategy of ['fixed', 'hybrid', 'transfers'] as Strategy[]) {
        send({
          type: 'progress',
          job: request.job,
          message: `Počítame ${strategy === 'fixed' ? 'pravidelné spoje' : strategy === 'hybrid' ? 'Fixed + Flex' : 'možnosti s regionálnym spojom'}…`,
        })
        results[strategy] = planScenario(scenario, strategy, network)
        datasets[strategy] = resultDataset(scenario, results[strategy], network)
      }
      bundle = { scenario, results, datasets }
      send({ type: 'result', job: request.job, bundle })
    } else {
      if (!bundle) throw new Error('Najprv načítajte scenár.')
      const result = bundle.results[request.strategy],
        query = request.query
      // Independent synthetic onward extension; never relabel an observed hub trip as Poprad demand.
      const external = [
        ...bundle.scenario.external,
        {
          id: 'synthetic-poprad-extension',
          name: 'Poprad · syntetické rozšírenie',
          date: query.date,
          synthetic: true,
          source: 'Modelová ukážka; septembrový cestovný poriadok nie je overený.',
          visits: [
            { stopId: '1', arrival: 474, departure: 475 },
            { stopId: 'poprad-demo', arrival: 565, departure: 566 },
          ],
        },
      ]
      const journeys = searchJourneys(
        query,
        result.runs,
        external,
        bundle.scenario.resources,
        network,
        bundle.scenario.policy,
      )
      send({
        type: 'journeys',
        job: request.job,
        journeys,
        dataset: journeyDataset(bundle.scenario, result, journeys, network, query.date),
      })
    }
  } catch (error) {
    send({
      type: 'error',
      job: request.job,
      message: error instanceof Error ? error.message : 'Výpočet sa nepodaril.',
    })
  }
}
