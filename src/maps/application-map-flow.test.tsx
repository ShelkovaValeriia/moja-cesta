// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../App'
import { createInitialState } from '../data'
import type { MapRoute } from '../modules/transport-map'

vi.mock('../modules/transport-map/MapCanvas', () => ({
  default: ({ routes }: { routes: readonly MapRoute[] }) => (
    <output data-testid="visible-map-routes">{routes.map((r) => r.id).join(',')}</output>
  ),
}))
vi.mock('./applicationMap', async (original) => ({
  ...(await original<object>()),
  applicationRouting: () => undefined,
}))
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(createInitialState()))
  window.scrollTo = vi.fn()
  window.history.replaceState({}, '', '/passenger/requests')
})
afterEach(cleanup)

it('uses the request workflow card, replaces its one selected route and opens stops on a second click', async () => {
  render(<App />)
  const canvas = await screen.findByTestId('visible-map-routes')
  expect(canvas.textContent).toBe('')
  const card = screen.getByRole('complementary', { name: 'Požiadavky na cestu' })
  const buttons = within(card).getAllByRole('button', { name: /^Zobraziť trasu / })
  fireEvent.click(buttons[0])
  const firstRoute = canvas.textContent
  expect(firstRoute).toMatch(/^request:/)
  fireEvent.click(buttons[1])
  expect(canvas.textContent).not.toBe(firstRoute)
  expect(canvas.textContent?.split(',')).toHaveLength(1)
  fireEvent.click(within(card).getByRole('button', { name: 'Zobraziť zastávky' }))
  expect(within(card).getByRole('heading', { name: 'Zastávky požiadavky' })).toBeTruthy()
  fireEvent.click(within(card).getByRole('button', { name: 'Zastávka 1' }))
  expect(
    within(card).getByRole('button', { name: 'Zastávka 1' }).getAttribute('aria-pressed'),
  ).toBe('true')
  fireEvent.click(within(card).getByRole('button', { name: 'Späť na požiadavky' }))
  expect(within(card).getByRole('heading', { name: /Dostupné požiadavky/ })).toBeTruthy()
  fireEvent.click(screen.getByText('Filtrovať dátum, čas a smer'))
  fireEvent.change(screen.getByLabelText('Čas od'), { target: { value: '23:58' } })
  expect(canvas.textContent).toBe('')
  expect(new URLSearchParams(window.location.search).get('filterTimeFrom')).toBe('23:58')
})
