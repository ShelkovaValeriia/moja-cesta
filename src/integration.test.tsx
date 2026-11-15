import { bookingPassengerCode, formatPassengerCode } from './passengerCodes'
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { AppState } from './types'
const saved = (): AppState => JSON.parse(localStorage.getItem('moja-cesta-demo-v1')!)
beforeEach(() => {
  localStorage.clear()
  window.history.replaceState({}, '', '/passenger')
  window.scrollTo = vi.fn()
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
afterEach(cleanup)
describe('Prepojené používateľské akcie v DOM', () => {
  it('rezervuje miesto, zobrazí ho vodičovi a uloží nástup', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(document.querySelector('main form')).toBeNull()
    await user.click(screen.getByRole('link', { name: 'Vyhľadať spojenie' }))
    expect(screen.getByRole('heading', { name: 'Vyhľadať spojenie' })).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Pre koho hľadáte cestu?'), 'mother')
    await user.click(screen.getByRole('button', { name: 'Hľadať' }))
    expect(screen.getByRole('heading', { name: 'Možnosti cesty' })).toBeTruthy()
    const tripCard = screen
      .getAllByRole('article')
      .find((card) => card.textContent?.includes('07:15'))!
    await user.click(within(tripCard).getByRole('button', { name: 'Vybrať spoj' }))
    await user.click(screen.getByRole('link', { name: 'Pokračovať k rezervácii' }))
    expect(screen.queryByLabelText('Cestujúci')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Potvrdiť rezerváciu' }))
    expect(screen.getByRole('heading', { name: 'Vaše miesto je rezervované.' })).toBeTruthy()
    const own = saved().bookings.find((b) => b.personId === 'mother')!
    expect(own.tripId).toBe('t-0-1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Demonštračná rola' }), 'driver')
    await user.click(document.querySelector('a[href="/driver/trips/t-0-1"]')!)
    expect(screen.queryByText('Mária K.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Vystúpil' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Začať jazdu' }))
    await user.click(screen.getByRole('button', { name: 'Dorazil som na zastávku' }))
    const inRow = screen
      .getByText(formatPassengerCode(saved().people.find((p) => p.id === 'mother')!.passengerCode))
      .closest('.navigation-rider') as HTMLElement
    await user.click(within(inRow).getByRole('button', { name: 'Nastúpil' }))
    expect(saved().bookings.find((b) => b.id === own.id)?.riderStatus).toBe('boarded')
    for (const name of ['Peter K.', 'Anna M.'])
      await user.click(
        within(
          screen
            .getByText(
              formatPassengerCode(
                bookingPassengerCode(
                  saved(),
                  saved().bookings.find((b) => b.name === name)!,
                ),
              ),
            )
            .closest('.navigation-rider') as HTMLElement,
        ).getByRole('button', { name: 'Neprišiel' }),
      )
    await user.click(screen.getByRole('button', { name: 'Pokračovať v jazde' }))
    await user.click(screen.getByRole('button', { name: 'Dorazil som na zastávku' }))
    const currentOut = screen
      .getByText(formatPassengerCode(saved().people.find((p) => p.id === 'mother')!.passengerCode))
      .closest('.navigation-rider') as HTMLElement
    await user.click(within(currentOut).getByRole('button', { name: 'Vystúpil' }))
    expect(saved().bookings.find((b) => b.id === own.id)?.riderStatus).toBe('alighted')
  })
  it('vytvorí požiadavku, schváli ju dispečerom a obnoví ju z localStorage', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/passenger/requests/new')
    const view = render(<App />)
    await user.clear(screen.getByLabelText('Čas'))
    await user.type(screen.getByLabelText('Čas'), '09:30')
    await user.clear(screen.getByLabelText('Počet cestujúcich'))
    await user.type(screen.getByLabelText('Počet cestujúcich'), '2')
    await user.click(screen.getByRole('button', { name: 'Odoslať požiadavku' }))
    const request = saved().requests[0]
    expect(request.status).toBe('pending')
    expect(request.passengers).toBe(2)
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Demonštračná rola' }),
      'dispatcher',
    )
    await user.click(document.querySelector('a[href="/dispatcher/requests"]')!)
    await user.click(screen.getByRole('button', { name: `Schváliť požiadavku ${request.id}` }))
    const dialog = screen.getByRole('dialog', { name: 'Naplánovať flexibilnú jazdu' })
    await user.click(within(dialog).getByRole('button', { name: 'Schváliť a naplánovať' }))
    expect(saved().requests.find((r) => r.id === request.id)?.status).toBe('approved')
    expect(saved().bookings.some((b) => b.mine && b.groupId === request.id)).toBe(true)
    view.unmount()
    window.history.replaceState({}, '', `/passenger/requests/${request.id}`)
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Ste súčasťou tejto cesty' })).toBeTruthy()
    expect(screen.getAllByText('Schválená').length).toBeGreaterThan(0)
  })
  it('validuje zhodné zastávky a nevytvorí požiadavku', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/passenger/requests/new')
    render(<App />)
    const originalStorage = localStorage.getItem('moja-cesta-demo-v1')
    await user.clear(screen.getByRole('combobox', { name: 'Kam' }))
    await user.type(screen.getByRole('combobox', { name: 'Kam' }), 'Matia')
    await user.click(screen.getByRole('option', { name: 'Matiašovce, centrum' }))
    await user.click(screen.getByRole('button', { name: 'Odoslať požiadavku' }))
    expect(screen.getByRole('alert').textContent).toContain('dve rôzne zastávky')
    expect(localStorage.getItem('moja-cesta-demo-v1')).toBe(originalStorage)
  })
})
