import { formatPassengerCode } from './passengerCodes'
// @vitest-environment jsdom
import { createInitialState as guardianTestSeed } from './data'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { addDays, createInitialState, today, dateLabel } from './data'
import type { AppState } from './types'
const saved = (): AppState => JSON.parse(localStorage.getItem('moja-cesta-demo-v1')!)
beforeEach(() => {
  localStorage.clear()
  const guardianSeed = guardianTestSeed()
  guardianSeed.people[1].contact = '+421 900 123 456'
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(guardianSeed))
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
async function pickStop(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  text: string,
  option: string,
) {
  const input = screen.getByRole('combobox', { name: label })
  await user.clear(input)
  await user.type(input, text)
  await user.click(screen.getByRole('option', { name: option }))
}
async function goToSearch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('link', { name: 'Vyhľadať spojenie' }))
}
describe('Samostatné kroky cestujúceho', () => {
  it('hlavná stránka má iba hlavné vstupy a jednotnú navigáciu', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Kam sa chcete vybrať?' })).toBeTruthy()
    expect(document.querySelector('main form')).toBeNull()
    expect(screen.getByRole('link', { name: /Pravidelné linky/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Moje cesty Vaše/ })).toBeTruthy()
    for (const nav of screen
      .getAllByRole('navigation')
      .filter((n) => n.getAttribute('aria-label')?.includes('navigácia'))) {
      expect(
        within(nav)
          .getAllByRole('link')
          .map((a) => a.textContent),
      ).toEqual(['Domov', 'Cesty', 'Mapa', 'Profil'])
    }
    await user.click(screen.getByRole('button', { name: /Pomoc a kontakt/ }))
    expect(screen.getByRole('dialog', { name: 'Pomoc a kontakt' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Zavrieť' }))
    await user.click(screen.getByRole('link', { name: /Pravidelné linky/ }))
    expect(screen.getByRole('heading', { name: 'Pravidelné linky' })).toBeTruthy()
    await user.click(screen.getAllByRole('button', { name: 'Zobraziť zastávky a časy' })[0])
    expect(document.querySelector('.timeline')).toBeTruthy()
  })
  it('vyhľadá, zobrazí mapu, pridá skupinu a synchronizuje ju s dispečerom a vodičom', async () => {
    const user = userEvent.setup()
    render(<App />)
    await goToSearch(user)
    await pickStop(user, 'Odkiaľ', 'Lech', 'Lechnica, kostol')
    await user.clear(screen.getByLabelText('Čas'))
    await user.type(screen.getByLabelText('Čas'), '11:00')
    await user.click(screen.getByRole('button', { name: 'Hľadať' }))
    expect(screen.getByRole('heading', { name: 'Možnosti cesty' })).toBeTruthy()
    expect(document.querySelector('main form')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Pravidelný spoj' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Zadať požiadavku' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Vytvoriť novú požiadavku' })).toBeNull()
    await user.click(screen.getByRole('link', { name: 'Pozrieť požiadavky' }))
    expect(screen.getByRole('heading', { name: 'Požiadavky na mape' })).toBeTruthy()
    expect(document.querySelectorAll('.request-card')).toHaveLength(1)
    expect(screen.getByLabelText('Parametre vyhľadávania').textContent).toContain('11:00')
    await user.click(screen.getByRole('link', { name: 'Zobraziť' }))
    expect(screen.getByText('O túto cestu má záujem 2 ľudia.')).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Pre koho rezervujete'), 'mother')
    await user.clear(screen.getByLabelText('Počet cestujúcich'))
    await user.type(screen.getByLabelText('Počet cestujúcich'), '2')
    await user.click(screen.getByRole('button', { name: 'Pridať sa k požiadavke' }))
    expect(screen.getByText('O túto cestu má záujem 4 ľudia.')).toBeTruthy()
    expect(saved().requests.find((r) => r.id === 'r2')?.status).toBe('pending')
    expect(saved().bookings).toHaveLength(createInitialState().bookings.length)
    expect(
      (screen.getByRole('option', { name: 'Mária Kováčová · Mama' }) as HTMLOptionElement).disabled,
    ).toBe(true)
    await user.selectOptions(screen.getByLabelText('Pre koho rezervujete'), 'daughter')
    await user.clear(screen.getByLabelText('Počet cestujúcich'))
    await user.type(screen.getByLabelText('Počet cestujúcich'), '1')
    await user.click(screen.getByRole('button', { name: 'Pridať sa k požiadavke' }))
    expect(saved().requests.find((r) => r.id === 'r2')?.passengers).toBe(5)
    await user.click(screen.getByRole('link', { name: 'Zobraziť moje cesty' }))
    expect(screen.getByRole('tab', { name: /Požiadavky/ }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(document.querySelector('main')?.textContent).toContain('Lechnica → Spišská Stará Ves')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Demonštračná rola' }),
      'dispatcher',
    )
    await user.click(document.querySelector('a[href="/dispatcher/requests"]')!)
    const approve = screen.getByRole('button', { name: 'Schváliť požiadavku r2' })
    expect(approve.closest('tr')?.querySelector('.people-count')?.textContent).toBe('5')
    await user.click(approve)
    await user.click(screen.getByRole('button', { name: 'Schváliť a naplánovať' }))
    const tripId = saved().requests.find((r) => r.id === 'r2')?.tripId
    expect(tripId).toBeTruthy()
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Demonštračná rola' }),
      'passenger',
    )
    await user.click(document.querySelector('a[href="/passenger/journeys"]')!)
    expect(document.querySelector('main')?.textContent).toContain('Mária Kováčová')
    expect(document.querySelector('main')?.textContent).toContain('Ema Nováková')
    expect(document.querySelector('main .linked-return')).toBeNull()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Demonštračná rola' }), 'driver')
    await user.click(document.querySelector(`a[href="/driver/trips/${tripId}"]`)!)
    expect(screen.queryByText(/Mária K\./)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Začať jazdu' }))
    await user.click(screen.getByRole('button', { name: 'Dorazil som na zastávku' }))
    expect(
      screen.getAllByText(
        formatPassengerCode(saved().people.find((p) => p.id === 'mother')!.passengerCode),
      ).length,
    ).toBeGreaterThan(0)
  })
  it('prenesie celú spiatočnú cestu cez výsledky, mapu, úpravu a novú požiadavku', async () => {
    const user = userEvent.setup()
    const view = render(<App />)
    await goToSearch(user)
    await pickStop(user, 'Odkiaľ', 'Halig', 'Haligovce, obecný úrad')
    await pickStop(user, 'Kam', 'škola', 'Spišská Stará Ves, škola')
    const date = addDays(today(), 2),
      returnDate = addDays(today(), 3)
    await user.clear(screen.getByLabelText('Dátum'))
    await user.type(screen.getByLabelText('Dátum'), date)
    await user.clear(screen.getByLabelText('Čas'))
    await user.type(screen.getByLabelText('Čas'), '08:45')
    await user.click(screen.getAllByRole('radio', { name: 'Príchod do' })[0])
    await user.click(screen.getByRole('button', { name: 'Spiatočná' }))
    await user.clear(screen.getByLabelText('Dátum návratu'))
    await user.type(screen.getByLabelText('Dátum návratu'), returnDate)
    await user.clear(screen.getByLabelText('Čas návratu'))
    await user.type(screen.getByLabelText('Čas návratu'), '15:40')
    await user.click(screen.getByRole('button', { name: 'Hľadať' }))
    await user.click(screen.getByRole('link', { name: 'Pozrieť požiadavky' }))
    expect(screen.getByRole('heading', { name: 'Nenašli sme vhodnú požiadavku' })).toBeTruthy()
    await user.click(screen.getByRole('link', { name: 'Zmeniť vyhľadávanie' }))
    expect((screen.getByRole('combobox', { name: 'Odkiaľ' }) as HTMLInputElement).value).toBe(
      'Haligovce, obecný úrad',
    )
    expect((screen.getByLabelText('Dátum návratu') as HTMLInputElement).value).toBe(
      dateLabel(returnDate),
    )
    expect(
      (screen.getAllByRole('radio', { name: 'Príchod do' })[0] as HTMLInputElement).checked,
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Hľadať' }))
    await user.click(screen.getByRole('link', { name: 'Pozrieť požiadavky' }))
    await user.click(screen.getByRole('link', { name: 'Vytvoriť novú požiadavku' }))
    expect(screen.getByRole('heading', { name: 'Nová požiadavka' })).toBeTruthy()
    expect((screen.getByLabelText('Odkiaľ') as HTMLInputElement).value).toBe(
      'Haligovce, obecný úrad',
    )
    expect((screen.getByLabelText('Kam') as HTMLInputElement).value).toBe(
      'Spišská Stará Ves, škola',
    )
    expect((screen.getByLabelText('Dátum') as HTMLInputElement).value).toBe(dateLabel(date))
    expect((screen.getByLabelText('Čas') as HTMLInputElement).value).toBe('08:45')
    expect((screen.getByLabelText('Dátum návratu') as HTMLInputElement).value).toBe(
      dateLabel(returnDate),
    )
    expect((screen.getByLabelText('Čas návratu') as HTMLInputElement).value).toBe('15:40')
    expect(
      (screen.getAllByRole('radio', { name: 'Príchod do' })[0] as HTMLInputElement).checked,
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Odoslať požiadavku' }))
    expect(screen.getByText('Požiadavka bola odoslaná.')).toBeTruthy()
    expect(saved().requests[0]).toMatchObject({
      from: 'hal',
      to: 'school',
      date,
      time: '08:45',
      timeMode: 'arrival',
      returnDate,
      returnTime: '15:40',
      status: 'pending',
    })
    expect(saved().bookings).toHaveLength(createInitialState().bookings.length)
    view.unmount()
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Ste súčasťou tejto cesty' })).toBeTruthy()
  })
  it('vymení zastávky a umožní vybrať zastávku klávesnicou', async () => {
    const user = userEvent.setup()
    render(<App />)
    await goToSearch(user)
    await user.click(screen.getByRole('button', { name: 'Vymeniť zastávky' }))
    expect((screen.getByRole('combobox', { name: 'Odkiaľ' }) as HTMLInputElement).value).toBe(
      'Spišská Stará Ves, námestie',
    )
    const input = screen.getByRole('combobox', { name: 'Odkiaľ' })
    await user.clear(input)
    await user.type(input, 'Lech')
    await user.keyboard('{ArrowDown}{Enter}')
    expect((input as HTMLInputElement).value).toBe('Lechnica, kostol')
  })
})
