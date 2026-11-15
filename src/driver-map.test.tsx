// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { createInitialState } from './data'
import type { AppState } from './types'
const saved = (): AppState => JSON.parse(localStorage.getItem('moja-cesta-demo-v1')!)
beforeEach(() => {
  localStorage.clear()
  window.history.replaceState({}, '', '/driver/map')
  window.scrollTo = vi.fn()
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(createInitialState()))
})
afterEach(cleanup)
it('adds the map tab in the requested order and offers only assigned unfinished Fixed and Flex runs', () => {
  const s = saved()
  render(<App />)
  for (const nav of screen
    .getAllByRole('navigation')
    .filter((n) => n.getAttribute('aria-label')?.includes('navigácia'))) {
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Dnešné jazdy', 'Mapa', 'Aktuálna jazda', 'Profil'])
  }
  const select = screen.getByLabelText('Vybrať jazdu')
  const options = within(select).getAllByRole('option') as HTMLOptionElement[]
  expect(
    options
      .slice(1)
      .map((o) => o.value)
      .sort(),
  ).toEqual(
    s.trips
      .filter((t) => t.driverId === s.activeDriverId && t.status !== 'completed')
      .map((t) => t.id)
      .sort(),
  )
  expect(options.some((o) => o.textContent?.includes('Pravidelná'))).toBe(true)
  expect(options.some((o) => o.textContent?.includes('Flexibilná'))).toBe(true)
})
it('renders the full ordered route, totals and vehicle without changing state', async () => {
  const user = userEvent.setup(),
    s = saved()
  s.bookings.push({ ...s.bookings[1], id: 'cancelled-extra', seats: 8, status: 'cancelled' })
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(s))
  const before = JSON.stringify(s)
  render(<App />)
  await user.selectOptions(screen.getByLabelText('Vybrať jazdu'), 't-0-1')
  expect(document.querySelector('.driver-navigation-map')?.getAttribute('data-trip-id')).toBe(
    't-0-1',
  )
  expect(document.querySelector('.driver-navigation-map')?.getAttribute('data-stop-count')).toBe(
    '3',
  )
  const stops = Array.from(document.querySelectorAll('.driver-map-stops li'))
  expect(stops.map((e) => e.querySelector('h3')?.textContent)).toEqual([
    'Matiašovce, centrum',
    'Spišská Stará Ves, námestie',
    'Spišská Stará Ves, škola',
  ])
  expect(stops.map((e) => e.querySelector('time')?.textContent)).toEqual([
    '07:15',
    '07:22',
    '07:29',
  ])
  expect(stops[0].textContent).toContain('Nastúpi: 3')
  expect(stops[1].textContent).toContain('Vystúpi: 1')
  expect(stops[2].textContent).toContain('Vystúpi: 2')
  expect(screen.getByText(/Ford Tourneo/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Začať jazdu' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Nastúpil' })).toBeNull()
  expect(JSON.stringify(saved())).toBe(before)
  expect(document.querySelector('.leaflet-container')).toBeNull()
})
it('links directly from a card and keeps active execution progress intact while switching to a Flex route', async () => {
  const user = userEvent.setup(),
    s = saved()
  s.trips.find((t) => t.id === 't-0-1')!.status = 'active'
  s.trips.find((t) => t.id === 't-0-1')!.navigation = {
    stopIndex: 1,
    phase: 'stopped',
    processedStops: [0],
    startedAt: '2026-11-15T08:00:00Z',
  }
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(s))
  window.history.replaceState({}, '', '/driver')
  render(<App />)
  const card = document
    .querySelector('a[href="/driver/trips/t-0-1"]')!
    .closest('.driver-trip-shell')!
  await user.click(within(card as HTMLElement).getByRole('link', { name: 'Zobraziť trasu' }))
  expect((screen.getByLabelText('Vybrať jazdu') as HTMLSelectElement).value).toBe('t-0-1')
  expect(saved().trips.find((t) => t.id === 't-0-1')?.navigation).toEqual(
    s.trips.find((t) => t.id === 't-0-1')?.navigation,
  )
  await user.selectOptions(screen.getByLabelText('Vybrať jazdu'), 'flex-seed')
  expect(document.querySelector('.driver-navigation-map')?.getAttribute('data-trip-id')).toBe(
    'flex-seed',
  )
  expect(document.querySelectorAll('.driver-map-stops li')).toHaveLength(2)
  expect(saved().trips.find((t) => t.id === 't-0-1')?.status).toBe('active')
})
it('rejects another driver’s or completed trip URL without exposing its details', () => {
  const s = saved(),
    other = s.trips.find((t) => t.driverId !== s.activeDriverId)!
  window.history.replaceState({}, '', `/driver/map?tripId=${other.id}`)
  render(<App />)
  expect(document.querySelector('.driver-map-preview')).toBeNull()
  expect(screen.getByText(/Vybraná jazda nie je dostupná/)).toBeTruthy()
})
it('shows the required empty state when there are no unfinished assigned trips', () => {
  const s = saved()
  s.trips.filter((t) => t.driverId === s.activeDriverId).forEach((t) => (t.status = 'completed'))
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(s))
  render(<App />)
  expect(screen.getByText('Nemáte naplánované žiadne jazdy.')).toBeTruthy()
  expect(screen.queryByLabelText('Vybrať jazdu')).toBeNull()
})
