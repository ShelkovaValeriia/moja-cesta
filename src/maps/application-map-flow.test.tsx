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
  window.history.replaceState({}, '', '/passenger/requests?scope=requests')
})
afterEach(cleanup)

it('general Map offers both types while regular lines and search retain scoped trips with no default route', async () => {
  window.history.replaceState({}, '', '/passenger/requests')
  let view = render(<App />)
  expect((await screen.findByTestId('visible-map-routes')).textContent).toBe('')
  expect(screen.getByRole('heading', { name: 'Mapa spojov' })).toBeTruthy()
  expect(document.querySelector('.trip-card')).toBeTruthy()
  expect(document.querySelector('.request-card')).toBeTruthy()
  const routeCard = screen.getAllByRole('button', { name: /^Pravidelný spoj / })[0]
  expect(routeCard.querySelector('button,a')).toBeNull()
  fireEvent.keyDown(routeCard, { key: 'Enter' })
  expect(screen.getByRole('heading', { name: 'Zastávky pravidelného spoja' })).toBeTruthy()
  expect(document.querySelector('.route-choice-card')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Späť na spojenia' }))
  fireEvent.click(screen.getByText('Filtrovať dátum, čas a smer'))
  fireEvent.change(screen.getByLabelText('Typ spojenia'), { target: { value: 'fixed' } })
  expect(document.querySelector('.request-card')).toBeNull()
  view.unmount()
  window.history.replaceState({}, '', '/passenger/lines')
  view = render(<App />)
  expect((await screen.findByTestId('visible-map-routes')).textContent).toBe('')
  expect(document.querySelector('.request-card')).toBeNull()
  fireEvent.click(screen.getAllByRole('button', { name: /^Pravidelný spoj / })[0])
  expect(screen.getByTestId('visible-map-routes').textContent).toMatch(/^t-/)
  view.unmount()
  window.history.replaceState({}, '', '/passenger/results')
  render(<App />)
  expect((await screen.findByTestId('visible-map-routes')).textContent).toBe('')
  fireEvent.click(screen.getAllByRole('button', { name: 'Vybrať spoj' })[0])
  expect(screen.getByTestId('visible-map-routes').textContent).toMatch(/^t-/)
  expect(document.querySelector('.timeline')).toBeTruthy()
})

it('uses the request workflow card, replaces its one selected route and opens stops on one click', async () => {
  render(<App />)
  const canvas = await screen.findByTestId('visible-map-routes')
  expect(canvas.textContent).toBe('')
  const card = screen.getByRole('complementary', { name: 'Požiadavky na cestu' })
  const buttons = within(card).getAllByRole('button', { name: /^Požiadavka / })
  fireEvent.click(buttons[0])
  const firstRoute = canvas.textContent
  expect(firstRoute).toMatch(/^request:/)
  fireEvent.click(within(card).getByRole('button', { name: 'Späť na požiadavky' }))
  fireEvent.click(within(card).getAllByRole('button', { name: /^Požiadavka / })[1])
  expect(canvas.textContent).not.toBe(firstRoute)
  expect(canvas.textContent?.split(',')).toHaveLength(1)
  expect(document.querySelector('.route-choice-card')).toBeNull()
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
