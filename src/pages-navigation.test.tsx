// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { createInitialState, dateLabel } from './data'
import { appHref } from './navigation'
import { STORAGE_KEY } from './storage'

beforeEach(() => {
  vi.stubEnv('MODE', 'github-pages')
  vi.stubEnv('BASE_URL', '/moja-cesta/')
  localStorage.clear()
  window.scrollTo = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('GitHub Pages navigation', () => {
  it('opens a dispatcher deep link, preserves its date on refresh, and switches roles', async () => {
    const user = userEvent.setup()
    const state = createInitialState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    const url = `/moja-cesta/#/dispatcher/schedule?date=${state.serviceDate}`
    window.history.replaceState({ idx: 0 }, '', url)
    const view = render(<App />)
    expect(screen.getByRole('heading', { name: 'Rozvrh jázd' })).toBeTruthy()
    expect(screen.getByLabelText('Dátum prevádzky').getAttribute('value')).toBe(
      dateLabel(state.serviceDate),
    )
    expect(screen.getByRole('link', { name: 'Pravidelné spoje' }).getAttribute('href')).toBe(
      '#/dispatcher/fixed',
    )

    view.unmount()
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Rozvrh jázd' })).toBeTruthy()
    expect(window.location.pathname + window.location.hash).toBe(url)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Demonštračná rola' }), 'driver')
    expect(await screen.findByRole('heading', { name: 'Moje dnešné jazdy' })).toBeTruthy()
    expect(window.location.pathname).toBe('/moja-cesta/')
    expect(window.location.hash).toBe('#/driver')

    window.history.back()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Rozvrh jázd' })).toBeTruthy())
    expect(window.location.hash).toBe(`#/dispatcher/schedule?date=${state.serviceDate}`)
  })

  it('keeps the skip link from replacing the hash route', async () => {
    const user = userEvent.setup()
    window.history.replaceState({ idx: 0 }, '', '/moja-cesta/#/dispatcher/fixed')
    render(<App />)
    await user.click(screen.getByRole('link', { name: 'Prejsť na obsah' }))
    expect(document.activeElement).toBe(screen.getByRole('main'))
    expect(window.location.hash).toBe('#/dispatcher/fixed')
    expect(screen.getByRole('heading', { name: 'Pravidelné spoje' })).toBeTruthy()
  })

  it('keeps standalone map links inside the project and preserves development URLs', () => {
    expect(appHref('/passenger')).toBe('/moja-cesta/#/passenger')
    expect(appHref('/passenger/requests/r1?date=2026-11-15')).toBe(
      '/moja-cesta/#/passenger/requests/r1?date=2026-11-15',
    )
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('BASE_URL', '/')
    expect(appHref('/passenger')).toBe('/passenger')
  })
})
