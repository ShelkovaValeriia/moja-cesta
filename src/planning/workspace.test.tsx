// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PlanningScenarios from '../pages/PlanningScenarios'
import App from '../App'
import { RoadNetwork } from './network'
import snapshot from './data/network.json'
import { PILOT_STOPS, createScenario } from './scenarios'
import { planScenario } from './planner'
import { resultDataset } from './presentation'
import type { Bundle, WorkerRequest, WorkerResponse } from './worker-types'
import type { MapRoute } from '../modules/transport-map'

vi.mock('../modules/transport-map/MapCanvas', () => ({
  default: ({ routes }: { routes: MapRoute[] }) => (
    <output data-testid="drawn-routes">{routes.map((r) => r.id).join(',')}</output>
  ),
}))
let bundle: Bundle
class FakeWorker {
  onmessage: ((event: { data: WorkerResponse }) => void) | null = null
  onerror = null
  stopped = false
  postMessage(message: WorkerRequest) {
    if (message.type === 'plan')
      queueMicrotask(() => {
        if (!this.stopped) this.onmessage?.({ data: { type: 'result', job: message.job, bundle } })
      })
  }
  terminate() {
    this.stopped = true
  }
}
beforeAll(() => {
  vi.stubGlobal('Worker', FakeWorker)
  const network = new RoadNetwork(snapshot, PILOT_STOPS),
    scenario = createScenario('coordinated', network)
  const hybrid = planScenario(scenario, 'hybrid', network),
    dataset = resultDataset(scenario, hybrid, network)
  bundle = {
    scenario,
    results: {
      fixed: { ...hybrid, strategy: 'fixed' },
      hybrid,
      transfers: { ...hybrid, strategy: 'transfers' },
    },
    datasets: { fixed: dataset, hybrid: dataset, transfers: dataset },
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  window.history.replaceState(null, '', '/')
})

it('starts unselected, opens the whole route card and preserves application storage', async () => {
  const user = userEvent.setup()
  localStorage.setItem('moja-cesta-demo-v1', 'preserved-application-data')
  render(
    <MemoryRouter>
      <PlanningScenarios />
    </MemoryRouter>,
  )
  await screen.findByRole('button', { name: 'Porovnanie' })
  await waitFor(() => expect(screen.getByTestId('drawn-routes').textContent).toBe(''))
  const card = document.querySelector<HTMLButtonElement>('.scenario-route')!
  expect(card).toBeTruthy()
  await user.click(card)
  await waitFor(() => expect(screen.getByTestId('drawn-routes').textContent).not.toBe(''))
  expect(screen.getByText('Zastávka 1')).toBeTruthy()
  expect(document.querySelector('.scenario-route')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Späť na zoznam' }))
  expect(document.querySelector('.scenario-route')).toBeTruthy()
  expect(localStorage.getItem('moja-cesta-demo-v1')).toBe('preserved-application-data')
})

it('replaces the list with only uploaded map routes and rejects malformed JSON', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <PlanningScenarios />
    </MemoryRouter>,
  )
  await screen.findByRole('button', { name: 'Porovnanie' })
  await user.click(screen.getByText(/^Nastavenia ·/))
  const route = {
    ...bundle.datasets.hybrid.routes[0],
    id: 'only-imported-route',
    name: 'Výlučne načítaná trasa',
  }
  const file = new File(['fixture'], 'one-route.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', {
    value: async () => JSON.stringify({ dataset: { ...bundle.datasets.hybrid, routes: [route] } }),
  })
  await user.upload(screen.getByLabelText('Načítať scenár alebo trasy'), file)
  await screen.findByRole('button', { name: /Výlučne načítaná trasa/ })
  expect(document.querySelectorAll('.scenario-route')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Porovnanie' })).toBeNull()
  const invalid = new File(['bad'], 'bad.json', { type: 'application/json' })
  Object.defineProperty(invalid, 'text', { value: async () => '{malformed' })
  await user.upload(screen.getByLabelText('Načítať scenár alebo trasy'), invalid)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(document.querySelectorAll('.scenario-route')).toHaveLength(1)
})

it('opens the scenario workspace through the Pages hash router and returns to dispatcher', async () => {
  const user = userEvent.setup()
  vi.stubEnv('MODE', 'github-pages')
  vi.stubEnv('BASE_URL', '/moja-cesta/')
  localStorage.clear()
  window.scrollTo = vi.fn()
  window.history.replaceState(null, '', '/moja-cesta/#/dispatcher/scenarios')
  render(<App />)
  await screen.findByRole('button', { name: 'Porovnanie' })
  expect(screen.getByRole('link', { name: 'Dispečer' }).getAttribute('href')).toBe('#/dispatcher')
  expect(document.querySelector('.scenario-route')).toBeTruthy()
  await user.click(screen.getByRole('link', { name: 'Dispečer' }))
  await screen.findByRole('heading', { name: /Prehľad/ })
  expect(window.location.pathname).toBe('/moja-cesta/')
  expect(window.location.hash).toBe('#/dispatcher')
})
