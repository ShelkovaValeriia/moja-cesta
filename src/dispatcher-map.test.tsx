// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { addDays, createInitialState } from './data'
import { loadState, STORAGE_KEY } from './storage'

beforeEach(() => {
  localStorage.clear()
  window.scrollTo = vi.fn()
  // Leaflet needs a measured viewport; jsdom otherwise reports zero-sized map elements.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1024)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(768)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1024)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(768)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 1024, 768),
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function expectFullscreen(kind: 'trip' | 'request', id: string) {
  const main = screen.getByRole('main', { name: 'Mapa trasy dispečera' })
  await screen.findByRole('region', { name: /^Mapa: / })
  expect(main.className).toBe('dispatcher-map-screen')
  expect(screen.getByRole('button', { name: 'Späť' })).toBeTruthy()
  expect(main.querySelector('.tm-leaflet')).toBeTruthy()
  expect(main.querySelector('.dispatcher-map-placeholder')).toBeNull()
  expect(screen.queryByRole('complementary')).toBeNull()
  expect(screen.queryByRole('navigation')).toBeNull()
  expect(screen.queryByRole('banner')).toBeNull()
  expect(screen.queryByRole('heading')).toBeNull()
  expect(main.querySelector('[data-route-id]')?.getAttribute('data-route-id')).toBe(id)
  expect(main.querySelector('[data-route-kind]')?.getAttribute('data-route-kind')).toBe(kind)
}

describe('Fullscreen dispatcher interactive maps', () => {
  it.each(['/dispatcher/fixed', '/dispatcher/schedule'])(
    'opens each trip from %s and preserves the selected date on return',
    async (path) => {
      const user = userEvent.setup()
      const state = createInitialState()
      const date = addDays(state.serviceDate, 1)
      const url = `${path}?date=${date}`
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      window.history.replaceState({ idx: 0 }, '', url)
      render(<App />)
      const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows)
        expect(within(row).getByRole('link', { name: 'Zobraziť na mape' })).toBeTruthy()
      const link = within(rows[0]).getByRole('link', { name: 'Zobraziť na mape' })
      const id = decodeURIComponent(link.getAttribute('href')!.split('/').at(-1)!)
      await user.click(link)
      await expectFullscreen('trip', id)
      await user.click(screen.getByRole('button', { name: 'Späť' }))
      await screen.findByRole('heading', {
        name: path.endsWith('fixed') ? 'Pravidelné spoje' : 'Rozvrh jázd',
      })
      expect(window.location.pathname + window.location.search).toBe(url)
      expect(loadState().bookings).toEqual(state.bookings)
      expect(loadState().trips).toEqual(state.trips)
    },
  )

  it('opens requested journeys separately from itinerary and approval, then returns to the same filters', async () => {
    const user = userEvent.setup()
    const url = '/dispatcher/requests?status=pending&sort=date'
    window.history.replaceState({ idx: 0 }, '', url)
    render(<App />)
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    const row = within(rows[0])
    expect(row.getByRole('button', { name: /Schváliť požiadavku/ })).toBeTruthy()
    const link = row.getByRole('link', { name: 'Zobraziť na mape' })
    const id = decodeURIComponent(link.getAttribute('href')!.split('/').at(-1)!)
    await user.click(link)
    await expectFullscreen('request', id)
    await user.click(screen.getByRole('button', { name: 'Späť' }))
    await screen.findByRole('heading', { name: 'Požadované cesty' })
    expect(window.location.pathname + window.location.search).toBe(url)
  })

  it('supports a direct trip map URL with a useful back fallback', async () => {
    const user = userEvent.setup()
    const trip = createInitialState().trips.find((t) => t.kind === 'fixed')!
    window.history.replaceState({ idx: 0 }, '', `/dispatcher/map/trip/${trip.id}`)
    render(<App />)
    await expectFullscreen('trip', trip.id)
    await user.click(screen.getByRole('button', { name: 'Späť' }))
    await screen.findByRole('heading', { name: 'Pravidelné spoje' })
  })

  it('opens a map from itinerary details and returns to those details', async () => {
    const user = userEvent.setup()
    const url = '/dispatcher/requests/r1/route'
    window.history.replaceState({ idx: 0 }, '', url)
    render(<App />)
    await user.click(screen.getByRole('link', { name: 'Zobraziť na mape' }))
    await expectFullscreen('request', 'r1')
    await user.click(screen.getByRole('button', { name: 'Späť' }))
    await screen.findByRole('heading', { name: 'Itinerár' })
    expect(window.location.pathname).toBe(url)
  })

  it('returns an invalid map URL to its source list', async () => {
    window.history.replaceState({ idx: 0 }, '', '/dispatcher/map/request/missing')
    render(<App />)
    await screen.findByRole('heading', { name: 'Požadované cesty' })
    expect(window.location.pathname).toBe('/dispatcher/requests')
  })

  it('allows marker selection and zoom without changing trips or reservations', async () => {
    const user = userEvent.setup()
    const state = createInitialState(),
      trip = state.trips[0]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState({ idx: 0 }, '', `/dispatcher/map/trip/${trip.id}`)
    render(<App />)
    await expectFullscreen('trip', trip.id)
    // Leaflet copies MouseEvent coordinates for its preclick event; jsdom PointerEvent differs.
    fireEvent.click(await screen.findByTitle('Zastávka 1'), { clientX: 512, clientY: 384 })
    expect(document.querySelector('.tm-stop-icon-selected')?.textContent).toBe('1')
    let detail = within(screen.getByRole('complementary', { name: 'Detail vybraného bodu' }))
    expect(
      detail.getByRole('heading', {
        name: state.stops.find((s) => s.id === trip.stops[0].stopId)!.name,
      }),
    ).toBeTruthy()
    expect(detail.getByText(trip.stops[0].time)).toBeTruthy()
    fireEvent.click(screen.getByTitle('Zastávka 2'), { clientX: 540, clientY: 400 })
    detail = within(screen.getByRole('complementary', { name: 'Detail vybraného bodu' }))
    expect(
      detail.getByRole('heading', {
        name: state.stops.find((s) => s.id === trip.stops[1].stopId)!.name,
      }),
    ).toBeTruthy()
    expect(detail.getByText(trip.stops[1].time)).toBeTruthy()
    expect(detail.queryByText(trip.stops[0].time)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Priblížiť' }))
    await user.click(screen.getByRole('button', { name: 'Zobraziť všetky viditeľné trasy' }))
    expect(screen.getByRole('complementary', { name: 'Detail vybraného bodu' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Zavrieť detail zastávky' }))
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(document.querySelector('.tm-stop-icon-selected')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rozbaliť kartu' })).toBeNull()
    expect(loadState().bookings).toEqual(state.bookings)
    expect(loadState().requests).toEqual(state.requests)
    expect(loadState().trips).toEqual(state.trips)
  })

  it('shows each occurrence of a repeated stop with its own number and time', async () => {
    const state = createInitialState(),
      trip = state.trips[0]
    trip.stops = [trip.stops[0], trip.stops[1], { ...trip.stops[0], time: '09:45' }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState({ idx: 0 }, '', `/dispatcher/map/trip/${trip.id}`)
    render(<App />)
    await expectFullscreen('trip', trip.id)
    fireEvent.click(await screen.findByTitle('Zastávka 3'), { clientX: 512, clientY: 384 })
    const detail = within(screen.getByRole('complementary', { name: 'Detail vybraného bodu' }))
    expect(detail.getByText('Zastávka 3')).toBeTruthy()
    expect(
      detail.getByRole('heading', {
        name: state.stops.find((s) => s.id === trip.stops[0].stopId)!.name,
      }),
    ).toBeTruthy()
    expect(detail.getByText('09:45')).toBeTruthy()
    expect(detail.queryByText(trip.stops[0].time)).toBeNull()
  })

  it('identifies a pending proposed point without inventing a scheduled stop time', async () => {
    const state = createInitialState(),
      request = state.requests[0]
    request.fromPlace = {
      type: 'custom',
      name: 'Navrhovaný nástup pri obecnom úrade',
      latitude: 49.371234,
      longitude: 20.412345,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState({ idx: 0 }, '', `/dispatcher/map/request/${request.id}`)
    render(<App />)
    await expectFullscreen('request', request.id)
    fireEvent.click(await screen.findByTitle('Zastávka 1'), { clientX: 512, clientY: 384 })
    const detail = within(screen.getByRole('complementary', { name: 'Detail vybraného bodu' }))
    expect(detail.getByText('Navrhované miesto 1')).toBeTruthy()
    expect(detail.getByRole('heading', { name: request.fromPlace.name })).toBeTruthy()
    expect(detail.queryByText(/Plánovaný čas/)).toBeNull()
  })

  it('retains Back and explains an unlocated stop without inventing a route', async () => {
    const state = createInitialState(),
      trip = state.trips[0]
    trip.stops.push({ stopId: 'missing', time: '12:00' })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState({ idx: 0 }, '', `/dispatcher/map/trip/${trip.id}`)
    render(<App />)
    await expectFullscreen('trip', trip.id)
    expect(
      screen.getByText('Niektoré miesta nemajú súradnice. Trasu nemožno zakresliť.'),
    ).toBeTruthy()
    expect(document.querySelector('.tm-stop-icon')).toBeNull()
    expect(screen.getByRole('button', { name: 'Späť' })).toBeTruthy()
  })
})
