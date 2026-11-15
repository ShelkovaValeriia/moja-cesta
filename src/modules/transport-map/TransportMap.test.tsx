// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TransportMap } from './TransportMap'
import type { AddressResult, GeocodingService, MapDataset, MapRoute } from './types'
import { parseMapDataset } from './validation'
import pilot from './demo/pilot-data.json'

vi.mock('./MapCanvas', () => ({
  default: ({
    onPick,
    routes,
    onRouteClick,
  }: {
    onPick: (p: { latitude: number; longitude: number }) => void
    routes: readonly MapRoute[]
    onRouteClick: (routeId: string) => void
  }) => (
    <div>
      <output data-testid="drawn-routes">{routes.map((r) => r.id).join(',')}</output>
      <button onClick={() => routes[0] && onRouteClick(routes[0].id)}>Vybraná trasa na mape</button>
      <button onClick={() => onPick({ latitude: 49.31, longitude: 20.35 })}>Bod A</button>
      <button onClick={() => onPick({ latitude: 49.32, longitude: 20.36 })}>Bod B</button>
    </div>
  ),
}))
const dataset = parseMapDataset(pilot.dataset)
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
describe('independent map module interactions', () => {
  it('draws only the selected route, opens stops on its first click, and returns to the list', async () => {
    render(<TransportMap dataset={dataset} />)
    expect((await screen.findByTestId('drawn-routes')).textContent).toBe('')
    const card = screen.getByRole('complementary', { name: 'Trasy a zastávky' })
    const first = () =>
      within(card).getByRole('button', { name: new RegExp(`^${dataset.routes[0].code}`) })
    fireEvent.click(first())
    expect(screen.getByTestId('drawn-routes').textContent).toBe(dataset.routes[0].id)
    expect(within(card).getByRole('button', { name: 'Všetky trasy' })).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Všetky trasy' }))
    expect(within(card).getByRole('heading', { name: 'Trasy v okolí' })).toBeTruthy()
    expect(screen.getByTestId('drawn-routes').textContent).toBe(dataset.routes[0].id)
    const second = within(card).getAllByRole('button', {
      name: new RegExp(`^${dataset.routes[1].code}`),
    })[0]
    fireEvent.click(second)
    expect(screen.getByTestId('drawn-routes').textContent).toBe(dataset.routes[1].id)
    fireEvent.click(screen.getByRole('button', { name: 'Vybraná trasa na mape' }))
    expect(within(card).getByRole('button', { name: 'Všetky trasy' })).toBeTruthy()
  })
  it('requires explicit route selection and clears it when filters exclude it', async () => {
    const selected = vi.fn()
    render(<TransportMap dataset={dataset} onRouteSelect={selected} />)
    expect(selected).not.toHaveBeenCalled()
    const list = screen.getByRole('complementary', { name: 'Trasy a zastávky' })
    fireEvent.click(
      within(list).getByRole('button', { name: new RegExp(`^${dataset.routes[0].code}`) }),
    )
    expect(selected).toHaveBeenCalledWith(dataset.routes[0].id)
    expect(within(list).getByRole('list')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Hľadať linku, obec alebo zastávku'), {
      target: { value: 'neexistuje' },
    })
    expect(screen.getByText('Žiadne zodpovedajúce trasy')).toBeTruthy()
    expect(selected).toHaveBeenLastCalledWith(null)
  })
  it('distinguishes repeated visits to the same stop in a directional pattern', () => {
    const stop = dataset.stops[0],
      second = dataset.stops[1]
    const loop: MapDataset = {
      ...dataset,
      routes: [
        {
          ...dataset.routes[0],
          id: 'loop',
          stops: [
            { occurrenceId: 'a1', stopId: stop.id },
            { occurrenceId: 'b', stopId: second.id },
            { occurrenceId: 'a2', stopId: stop.id },
          ],
        },
      ],
    }
    const selected = vi.fn()
    render(
      <TransportMap
        dataset={loop}
        mode="stop-picker"
        initialSelection={{ routeId: 'loop' }}
        onStopSelect={selected}
      />,
    )
    const buttons = screen.getAllByRole('button', {
      name: new RegExp(stop.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    })
    fireEvent.click(buttons.at(-1)!)
    expect(selected.mock.calls[0][0]).toMatchObject({
      occurrenceId: 'a2',
      index: 2,
      routeId: 'loop',
      stop: { id: stop.id },
    })
  })
  it('keeps exact chosen coordinates when reverse geocoding returns a nearby building', async () => {
    const geocoder: GeocodingService = {
      attribution: 'Test',
      search: async () => [],
      reverse: async () => ({
        id: 'house',
        label: 'Najbližšia budova',
        position: { latitude: 49.319, longitude: 20.359 },
        precision: 'building',
      }),
    }
    const confirmed = vi.fn()
    render(
      <TransportMap
        dataset={dataset}
        mode="place-picker"
        geocoder={geocoder}
        onPlaceConfirm={confirmed}
      />,
    )
    const pickA = await screen.findByRole('button', { name: 'Bod A' })
    vi.useFakeTimers()
    fireEvent.click(pickA)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdiť miesto' }))
    expect(confirmed.mock.calls[0][0]).toMatchObject({
      position: { latitude: 49.31, longitude: 20.35 },
      label: 'Najbližšia budova',
      source: 'map',
    })
    expect(confirmed.mock.calls[0][0].stopId).toBeUndefined()
  })
  it('ignores an old reverse lookup even if the provider ignores abort', async () => {
    const pending: ((value: AddressResult | null) => void)[] = []
    const geocoder: GeocodingService = {
      attribution: 'Test',
      search: async () => [],
      reverse: () => new Promise((resolve) => pending.push(resolve)),
    }
    render(<TransportMap dataset={dataset} mode="place-picker" geocoder={geocoder} />)
    const pickA = await screen.findByRole('button', { name: 'Bod A' })
    vi.useFakeTimers()
    fireEvent.click(pickA)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Bod B' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    await act(async () => {
      pending[1]({
        id: 'b',
        label: 'Nové miesto',
        position: { latitude: 49.32, longitude: 20.36 },
        precision: 'street',
      })
    })
    await act(async () => {
      pending[0]({
        id: 'a',
        label: 'Staré miesto',
        position: { latitude: 49.31, longitude: 20.35 },
        precision: 'street',
      })
    })
    expect(screen.getByText('Nové miesto')).toBeTruthy()
    expect(screen.queryByText('Staré miesto')).toBeNull()
  })
})
