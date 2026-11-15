// Deterministic, offline export using the same core as the worker, not a second planner.
/* global console */
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { RoadNetwork } = await server.ssrLoadModule('/src/planning/network.ts')
  const { default: snapshot } = await server.ssrLoadModule('/src/planning/data/network.json')
  const { createScenario, PILOT_STOPS } = await server.ssrLoadModule('/src/planning/scenarios.ts')
  const { planScenario } = await server.ssrLoadModule('/src/planning/planner.ts')
  const { exportScenario } = await server.ssrLoadModule('/src/planning/io.ts')
  const { resultDataset } = await server.ssrLoadModule('/src/planning/presentation.ts')
  await mkdir('public/scenarios', { recursive: true })
  const summary = []
  for (const kind of ['coordinated', 'pressure']) {
    const network = new RoadNetwork(snapshot, PILOT_STOPS)
    const scenario = createScenario(kind, network)
    await writeFile(`public/scenarios/${kind}.json`, exportScenario(scenario) + '\n')
    const comparison = {}
    for (const strategy of ['fixed', 'hybrid', 'transfers']) {
      const result = planScenario(scenario, strategy, network)
      comparison[strategy] = result.metrics
      if (strategy === 'hybrid')
        await writeFile(
          `public/scenarios/${kind}-routes.json`,
          JSON.stringify({ dataset: resultDataset(scenario, result, network) }) + '\n',
        )
    }
    summary.push({
      id: kind,
      name: scenario.name,
      sourceHash: scenario.sourceHash,
      networkVersion: scenario.networkVersion,
      algorithm: 'network-cover-insertion-v1',
      seed: scenario.seed,
      simulated: true,
      comparison,
    })
    console.log(kind, JSON.stringify(comparison))
  }
  await writeFile('public/scenarios/results.json', JSON.stringify(summary, null, 2) + '\n')
} finally {
  await server.close()
}
