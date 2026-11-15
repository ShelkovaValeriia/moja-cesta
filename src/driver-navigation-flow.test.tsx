import { bookingPassengerCode, formatPassengerCode } from './passengerCodes'
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
  window.scrollTo = vi.fn()
  window.history.replaceState({}, '', '/driver/trips/t-0-1')
  const s = createInitialState()
  s.bookings = [
    {
      id: 'a',
      tripId: 't-0-1',
      name: 'Demo Anna',
      personId: 'me',
      from: 'mat',
      to: 'ssv',
      seats: 1,
      mine: true,
      status: 'confirmed',
      riderStatus: 'expected',
    },
    {
      id: 'b',
      tripId: 't-0-1',
      name: 'Demo Boris',
      from: 'mat',
      to: 'school',
      seats: 2,
      mine: false,
      status: 'confirmed',
      riderStatus: 'expected',
    },
  ]
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(s))
})
afterEach(cleanup)
it('runs a fullscreen trip, resumes after safe exit and reload, and completes with a truthful summary', async () => {
  const user = userEvent.setup()
  let view = render(<App />)
  await user.click(screen.getByRole('button', { name: 'Začať jazdu' }))
  expect(screen.getByRole('main', { name: 'Aktívna jazda' })).toBeTruthy()
  expect(screen.queryByRole('combobox', { name: 'Demonštračná rola' })).toBeNull()
  expect(document.querySelector('.driver-navigation-map img')?.getAttribute('src')).toBe(
    '/images/driver-map-placeholder.svg',
  )
  expect(screen.queryByRole('button', { name: 'Nastúpil' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Dorazil som na zastávku' }))
  const next = screen.getByRole('button', { name: 'Pokračovať v jazde' }) as HTMLButtonElement
  expect(next.disabled).toBe(true)
  const anna = screen
    .getByText(
      formatPassengerCode(
        bookingPassengerCode(
          saved(),
          saved().bookings.find((b) => b.id === 'a')!,
        ),
      ),
    )
    .closest('article')!
  await user.click(within(anna).getByRole('button', { name: 'Nastúpil' }))
  const boris = screen
    .getByText(
      formatPassengerCode(
        bookingPassengerCode(
          saved(),
          saved().bookings.find((b) => b.id === 'b')!,
        ),
      ),
    )
    .closest('article')!
  await user.click(within(boris).getByRole('button', { name: 'Neprišiel' }))
  expect(saved().bookings[0].riderStatus).toBe('boarded')
  expect(saved().bookings[1].riderStatus).toBe('absent')
  view.unmount()
  view = render(<App />)
  expect(screen.getByRole('region', { name: 'Spracovanie zastávky' })).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Pokračovať v jazde' }))
  await user.click(screen.getByRole('link', { name: 'Späť na prehľad' }))
  expect(saved().trips.find((t) => t.id === 't-0-1')?.status).toBe('active')
  await user.click(document.querySelector('a[href="/driver/trips/t-0-1"]')!)
  expect(saved().trips.find((t) => t.id === 't-0-1')?.navigation?.stopIndex).toBe(1)
  await user.click(screen.getByRole('button', { name: 'Dorazil som na zastávku' }))
  await user.click(screen.getByRole('button', { name: 'Vystúpil' }))
  await user.click(screen.getByRole('button', { name: 'Pokračovať v jazde' }))
  await user.click(screen.getByRole('button', { name: 'Dorazil som na zastávku' }))
  expect((screen.getByRole('button', { name: 'Vystúpil' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  await user.click(screen.getByRole('button', { name: 'Ukončiť jazdu' }))
  expect(screen.getByRole('heading', { name: 'Jazda bola ukončená' })).toBeTruthy()
  expect(screen.getByText(/Prevezení cestujúci:/).textContent).toContain('1')
  expect(screen.getByText(/Neúčasti:/).textContent).toContain('2')
  const completed = saved().trips.find((t) => t.id === 't-0-1')!
  expect(completed.navigation?.startedAt).toBeTruthy()
  expect(completed.navigation?.endedAt).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Začať jazdu' })).toBeNull()
  view.unmount()
})
it('shows only real stop totals before starting, with no passenger identities or attendance actions', () => {
  render(<App />)
  expect(screen.queryByText('Demo A.')).toBeNull()
  expect(screen.queryByText('Demo B.')).toBeNull()
  for (const name of ['Nastúpil', 'Neprišiel', 'Vystúpil'])
    expect(screen.queryByRole('button', { name })).toBeNull()
  const stops = Array.from(document.querySelectorAll('.driver-stop'))
  expect(stops).toHaveLength(3)
  expect(stops[0].querySelector('.driver-stop-counts')?.textContent).toContain('Nastúpi: 3')
  expect(stops[1].querySelector('.driver-stop-counts')?.textContent).toContain('Vystúpi: 1')
  expect(stops[2].querySelector('.driver-stop-counts')?.textContent).toContain('Vystúpi: 2')
  expect(document.querySelector('.trip-assignment-info')).toBeNull()
  expect(screen.getByRole('button', { name: 'Začať jazdu' })).toBeTruthy()
})
it('excludes cancelled reservations from the pre-trip totals', () => {
  const s = saved()
  s.bookings[1].status = 'cancelled'
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(s))
  render(<App />)
  const stops = document.querySelectorAll('.driver-stop-counts')
  expect(stops[0].textContent).toContain('Nastúpi: 1')
  expect(stops[2].textContent).toContain('Vystúpi: 0')
})
it('lists all current-driver trips exactly once without a highlighted block or driver selector', () => {
  window.history.replaceState({}, '', '/driver')
  const s = saved()
  render(<App />)
  expect(screen.queryByLabelText('Vodič v ukážke')).toBeNull()
  expect(document.querySelector('.driver-current')).toBeNull()
  expect(screen.getByRole('combobox', { name: 'Demonštračná rola' })).toBeTruthy()
  const expected = s.trips.filter(
    (t) => t.date === s.serviceDate && t.driverId === s.activeDriverId,
  )
  expect(document.querySelectorAll('.driver-trip-item')).toHaveLength(expected.length)
  for (const t of expected) {
    const links = document.querySelectorAll(`a[href="/driver/trips/${t.id}"]`)
    expect(links).toHaveLength(1)
    expect(links[0].querySelector('.kind-tag')).toBeTruthy()
  }
  for (const t of s.trips.filter((t) => t.driverId !== s.activeDriverId))
    expect(document.querySelector(`a[href="/driver/trips/${t.id}"]`)).toBeNull()
})
it('does not expose stop or passenger information for another driver’s trip', () => {
  const s = saved(),
    other = s.trips.find((t) => t.date === s.serviceDate && t.driverId !== s.activeDriverId)!
  window.history.replaceState({}, '', `/driver/trips/${other.id}`)
  render(<App />)
  expect(screen.queryByRole('button', { name: 'Začať jazdu' })).toBeNull()
  expect(document.querySelector('.driver-stops')).toBeNull()
})
it('offers the same change action after boarding and no-show and allows undoing alighting before departure', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Začať jazdu' }))
  await user.click(screen.getByRole('button', { name: 'Dorazil som na zastávku' }))
  const anna = screen
      .getByText(
        formatPassengerCode(
          bookingPassengerCode(
            saved(),
            saved().bookings.find((b) => b.id === 'a')!,
          ),
        ),
      )
      .closest('article')!,
    boris = screen
      .getByText(
        formatPassengerCode(
          bookingPassengerCode(
            saved(),
            saved().bookings.find((b) => b.id === 'b')!,
          ),
        ),
      )
      .closest('article')!
  await user.click(within(anna).getByRole('button', { name: 'Nastúpil' }))
  await user.click(within(boris).getByRole('button', { name: 'Neprišiel' }))
  expect(within(anna).getByText('Vo vozidle')).toBeTruthy()
  expect(within(boris).getByText('Neprišiel')).toBeTruthy()
  expect(within(anna).getByRole('button', { name: 'Zmeniť označenie' }).className).toBe(
    within(boris).getByRole('button', { name: 'Zmeniť označenie' }).className,
  )
  await user.click(within(anna).getByRole('button', { name: 'Zmeniť označenie' }))
  expect(saved().bookings[0].riderStatus).toBe('absent')
  await user.click(within(anna).getByRole('button', { name: 'Zmeniť označenie' }))
  expect(saved().bookings[0].riderStatus).toBe('boarded')
  await user.click(within(boris).getByRole('button', { name: 'Zmeniť označenie' }))
  expect(saved().bookings[1].riderStatus).toBe('boarded')
  expect(screen.getByText(/Voľné miesta:/).textContent).toContain('5')
  await user.click(within(boris).getByRole('button', { name: 'Zmeniť označenie' }))
  await user.click(screen.getByRole('button', { name: 'Pokračovať v jazde' }))
  expect(screen.queryByRole('button', { name: 'Zmeniť označenie' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Dorazil som na zastávku' }))
  await user.click(screen.getByRole('button', { name: 'Vystúpil' }))
  await user.click(screen.getByRole('button', { name: 'Zmeniť označenie' }))
  expect(saved().bookings[0].riderStatus).toBe('boarded')
  expect(
    (screen.getByRole('button', { name: 'Pokračovať v jazde' }) as HTMLButtonElement).disabled,
  ).toBe(true)
})
it('styles actual completed and active runs separately and selects exactly one earliest scheduled run', () => {
  const s = saved()
  s.trips.find((t) => t.id === 't-0-1')!.status = 'completed'
  s.trips.find((t) => t.id === 'flex-seed')!.status = 'active'
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(s))
  window.history.replaceState({}, '', '/driver')
  render(<App />)
  const next = s.trips
    .filter(
      (t) =>
        t.date === s.serviceDate && t.driverId === s.activeDriverId && t.status === 'scheduled',
    )
    .sort((a, b) => a.stops[0].time.localeCompare(b.stops[0].time))[0]
  expect(screen.getAllByText('Nasledujúca jazda')).toHaveLength(1)
  expect(document.querySelector('.driver-run-next')?.getAttribute('href')).toBe(
    `/driver/trips/${next.id}`,
  )
  const completed = document.querySelector('a[href="/driver/trips/t-0-1"]')!
  expect(completed.className).toContain('driver-run-completed')
  expect(completed.textContent).toContain('Ukončená')
  const active = document.querySelector('a[href="/driver/trips/flex-seed"]')!
  expect(active.className).toContain('driver-run-active')
  expect(active.textContent).toContain('Pokračovať v jazde')
  expect(active.textContent).toContain('Prebieha')
})
