// @vitest-environment jsdom
import { createInitialState as guardianTestSeed } from './data'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { createInitialState } from './data'
import { queryString, readQuery } from './search'
import type { AppState } from './types'
const saved = (): AppState => JSON.parse(localStorage.getItem('moja-cesta-demo-v1')!)
beforeEach(() => {
  localStorage.clear()
  const guardianSeed = guardianTestSeed()
  guardianSeed.people[1].contact = '+421 900 123 456'
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(guardianSeed))
  window.history.replaceState({ idx: 0 }, '', '/passenger')
  window.scrollTo = vi.fn()
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
afterEach(cleanup)
const setUrl = (path: string) => window.history.replaceState({ idx: 0 }, '', path)
describe('Vyhľadávanie, výber a potvrdenie miest', () => {
  it('začína typom cesty a výberom cestujúceho, nevyberá spoj a ukáže zastávky oboch smerov', async () => {
    const user = userEvent.setup()
    setUrl('/passenger/search')
    const view = render(<App />)
    const form = document.querySelector('main form')!
    expect(form.firstElementChild?.querySelector('legend')?.textContent).toBe('Typ cesty')
    expect(screen.getByLabelText('Pre koho hľadáte cestu?')).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Pre koho hľadáte cestu?'), 'mother')
    await user.clear(screen.getByLabelText('Počet cestujúcich'))
    await user.type(screen.getByLabelText('Počet cestujúcich'), '2')
    await user.click(screen.getByRole('button', { name: 'Spiatočná' }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Časová preferencia späť (nepovinné)' }),
      'later',
    )
    await user.click(screen.getByRole('button', { name: 'Hľadať' }))
    expect(screen.queryAllByRole('button', { name: 'Vybrané' })).toHaveLength(0)
    expect(
      (screen.getByRole('button', { name: 'Rezervovať cestu tam aj späť' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    await user.click(
      within(screen.getByRole('region', { name: 'Cesta tam' })).getAllByRole('button', {
        name: 'Vybrať spoj',
      })[0],
    )
    expect(document.querySelectorAll('.tm-panel .timeline li')).toHaveLength(6)
    expect(screen.queryByRole('link', { name: 'Rezervovať cestu tam aj späť' })).toBeNull()
    await user.click(
      within(screen.getByRole('region', { name: 'Cesta späť' })).getAllByRole('button', {
        name: 'Vybrať spoj',
      })[0],
    )
    const returnStops = Array.from(document.querySelectorAll('.tm-panel .timeline li small')).map(
      (el) => el.textContent,
    )
    expect(returnStops).toEqual([
      'Spišská Stará Ves, škola',
      'Spišská Stará Ves, námestie',
      'Matiašovce, centrum',
      'Haligovce, obecný úrad',
      'Červený Kláštor, centrum',
      'Lechnica, kostol',
    ])
    expect(
      Array.from(document.querySelectorAll('.tm-panel .timeline time')).map((el) => el.textContent),
    ).toEqual(['17:05', '17:12', '17:19', '17:26', '17:33', '17:40'])
    await user.click(screen.getByRole('link', { name: 'Rezervovať cestu tam aj späť' }))
    expect(document.querySelector('.booking-form input')).toBeNull()
    expect(document.querySelector('.booking-form select')).toBeNull()
    expect(screen.getByLabelText('Vybraní cestujúci').textContent).toContain('Mária Kováčová')
    expect(screen.getByLabelText('Vybraní cestujúci').textContent).toContain('2 miesta')
    await user.click(screen.getByRole('button', { name: 'Potvrdiť rezerváciu' }))
    const bookings = saved().bookings.filter((b) => b.personId === 'mother')
    expect(bookings).toHaveLength(2)
    expect(bookings.every((b) => b.seats === 2)).toBe(true)
    expect(bookings[0].groupId).toBe(bookings[1].groupId)
    expect(bookings[0].search).toMatchObject({
      personId: 'mother',
      seats: 2,
      roundTrip: true,
      returnTimePreference: 'later',
    })
    view.unmount()
  })
  it('prenesie skupinu na mapu, detail a novú požiadavku bez opätovného výberu', async () => {
    const user = userEvent.setup(),
      s = createInitialState(),
      q = {
        ...readQuery(new URLSearchParams()),
        from: 'lech',
        to: 'ssv',
        time: '11:00',
        personId: 'mother',
        seats: 3,
      }
    setUrl(`/passenger/results?${queryString(q)}`)
    render(<App />)
    await user.click(screen.getByRole('link', { name: 'Pozrieť požiadavky' }))
    expect(screen.getByLabelText('Parametre vyhľadávania').textContent).toContain(
      'Mária Kováčová · 3 miesta',
    )
    await user.click(screen.getAllByRole('button', { name: /^Požiadavka / })[0])
    await user.click(screen.getByRole('link', { name: 'Zobraziť' }))
    expect((screen.getByLabelText('Pre koho rezervujete') as HTMLSelectElement).value).toBe(
      'mother',
    )
    expect((screen.getByLabelText('Počet cestujúcich') as HTMLInputElement).value).toBe('3')
    await user.click(screen.getByRole('button', { name: 'Pridať sa k požiadavke' }))
    expect(saved().requests.find((r) => r.id === 'r2')).toMatchObject({
      passengers: 5,
      personId: 'mother',
      ownSeats: 3,
      status: 'pending',
    })
    expect(saved().bookings).toHaveLength(s.bookings.length)
    await user.click(screen.getByRole('link', { name: 'Späť' }))
    await screen.findByRole('heading', { name: 'Požiadavky na mape' })
    await user.click(screen.getByRole('link', { name: 'Vytvoriť novú požiadavku' }))
    expect((screen.getByLabelText('Pre koho rezervujete') as HTMLSelectElement).value).toBe(
      'mother',
    )
    expect((screen.getByLabelText('Počet cestujúcich') as HTMLInputElement).value).toBe('3')
  })
})
describe('Návrat v scenári a systémová história', () => {
  it('šípky a tlačidlo Back zachovajú celý rozpracovaný formulár', async () => {
    const user = userEvent.setup(),
      s = createInitialState()
    s.requests[1].returnDate = s.serviceDate
    s.requests[1].returnTime = '17:24'
    s.requests[1].returnTimeMode = 'arrival'
    localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(s))
    render(<App />)
    await user.click(screen.getByRole('link', { name: 'Vyhľadať spojenie' }))
    await user.selectOptions(screen.getByLabelText('Pre koho hľadáte cestu?'), 'mother')
    await user.clear(screen.getByLabelText('Počet cestujúcich'))
    await user.type(screen.getByLabelText('Počet cestujúcich'), '2')
    const from = screen.getByRole('combobox', { name: 'Odkiaľ' })
    await user.clear(from)
    await user.type(from, 'Lech')
    await user.click(screen.getByRole('option', { name: 'Lechnica, kostol' }))
    await user.clear(screen.getByLabelText('Čas'))
    await user.type(screen.getByLabelText('Čas'), '11:00')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Časová preferencia (nepovinné)' }),
      'earlier',
    )
    await user.click(screen.getByRole('button', { name: 'Spiatočná' }))
    const returnRegion = screen.getByRole('region', { name: 'Cesta späť' })
    await user.clear(within(returnRegion).getByLabelText('Čas návratu'))
    await user.type(within(returnRegion).getByLabelText('Čas návratu'), '17:24')
    await user.click(within(returnRegion).getByRole('radio', { name: 'Príchod do' }))
    await user.selectOptions(
      within(returnRegion).getByRole('combobox', { name: 'Časová preferencia späť (nepovinné)' }),
      'later',
    )
    await user.click(screen.getByRole('button', { name: 'Hľadať' }))
    await user.click(screen.getByRole('link', { name: 'Pozrieť požiadavky' }))
    await user.click(screen.getAllByRole('button', { name: /^Požiadavka / })[0])
    await user.click(screen.getByRole('link', { name: 'Zobraziť' }))
    await user.click(screen.getByRole('link', { name: 'Späť' }))
    await screen.findByRole('heading', { name: 'Požiadavky na mape' })
    await user.click(screen.getByRole('link', { name: 'Späť' }))
    await screen.findByRole('heading', { name: 'Možnosti cesty' })
    await act(async () => {
      window.history.back()
    })
    await screen.findByRole('heading', { name: 'Vyhľadať spojenie' })
    expect((screen.getByLabelText('Pre koho hľadáte cestu?') as HTMLSelectElement).value).toBe(
      'mother',
    )
    expect((screen.getByLabelText('Počet cestujúcich') as HTMLInputElement).value).toBe('2')
    expect((screen.getByRole('combobox', { name: 'Odkiaľ' }) as HTMLInputElement).value).toBe(
      'Lechnica, kostol',
    )
    expect(
      (
        screen.getByRole('combobox', {
          name: 'Časová preferencia (nepovinné)',
        }) as HTMLSelectElement
      ).value,
    ).toBe('earlier')
    const returned = screen.getByRole('region', { name: 'Cesta späť' })
    expect(
      (within(returned).getByRole('radio', { name: 'Príchod do' }) as HTMLInputElement).checked,
    ).toBe(true)
    expect((within(returned).getByLabelText('Čas návratu') as HTMLInputElement).value).toBe('17:24')
    expect(
      (
        within(returned).getByRole('combobox', {
          name: 'Časová preferencia späť (nepovinné)',
        }) as HTMLSelectElement
      ).value,
    ).toBe('later')
    await act(async () => {
      window.history.forward()
    })
    await screen.findByRole('heading', { name: 'Možnosti cesty' })
  })
  it('pri priamom URL použije predchádzajúci krok ako bezpečnú náhradu', async () => {
    const user = userEvent.setup(),
      q = {
        ...readQuery(new URLSearchParams()),
        from: 'lech',
        to: 'ssv',
        time: '11:00',
        personId: 'mother',
        seats: 2,
      }
    setUrl(`/passenger/requests/r2?${queryString(q)}`)
    render(<App />)
    await user.click(screen.getByRole('link', { name: 'Späť' }))
    await screen.findByRole('heading', { name: 'Požiadavky na mape' })
    await user.click(screen.getByRole('link', { name: 'Späť' }))
    await screen.findByRole('heading', { name: 'Možnosti cesty' })
    await user.click(screen.getByRole('link', { name: 'Späť' }))
    await screen.findByRole('heading', { name: 'Vyhľadať spojenie' })
    expect((screen.getByLabelText('Pre koho hľadáte cestu?') as HTMLSelectElement).value).toBe(
      'mother',
    )
  })
})
describe('Profily, skryté staré polia a vodičov zoznam', () => {
  it('skryje staré nastavenia a vyžaduje platný kontakt pri zmene veku na dieťa', async () => {
    const user = userEvent.setup()
    setUrl('/passenger/profile')
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Upraviť profil Zuzana Nováková' }))
    const dialog = screen.getByRole('dialog', { name: 'Upraviť profil' })
    expect(within(dialog).queryByText('Obľúbené zastávky')).toBeNull()
    expect(within(dialog).queryByLabelText('Pohodlná pešia vzdialenosť (m)')).toBeNull()
    await user.selectOptions(
      within(dialog).getByLabelText('Veková kategória'),
      'Dieťa (do 6 rokov)',
    )
    const contact = within(dialog).getByLabelText('Kontakt na rodiča alebo zákonného zástupcu')
    expect((contact as HTMLInputElement).required).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: 'Uložiť profil' }))
    expect(within(dialog).getByRole('alert').textContent).toContain('rodiča')
    await user.type(contact, 'chyba')
    await user.click(within(dialog).getByRole('button', { name: 'Uložiť profil' }))
    expect(within(dialog).getByRole('alert').textContent).toContain('platný')
    await user.clear(contact)
    await user.type(contact, '+421 900 123 456')
    await user.click(within(dialog).getByRole('button', { name: 'Uložiť profil' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(saved().people[0]).toMatchObject({
      age: 'Dieťa (do 6 rokov)',
      contact: '+421 900 123 456',
      walk: 500,
      favoriteStops: ['mat', 'ssv'],
    })
    expect(saved().bookings.find((b) => b.id === 'b1')?.status).toBe('confirmed')
  })
  it('ukáže iba kategórie v profile a vozidlo s vodičom na konkrétnej jazde', async () => {
    const user = userEvent.setup()
    setUrl('/driver/profile')
    render(<App />)
    const main = document.querySelector('main')!
    expect(main.textContent).toContain('Skupiny vodičského oprávnenia')
    expect(main.textContent).not.toContain('Pridelené vozidlá')
    expect(main.textContent).not.toContain('Volkswagen')
    expect(main.querySelector('.license-categories')?.textContent).toBe('B')
    await user.click(document.querySelector('a[href="/driver"]')!)
    await user.click(document.querySelector('a[href="/driver/trips/t-0-1"]')!)
    expect(main.textContent).toContain('Ford Tourneo')
    expect(main.textContent).toContain('KK 316 MC')
    expect(main.textContent).toContain('Kapacita vozidla: 8')
    expect(main.textContent).not.toContain('Vodič: Martin Kováč')
    expect(main.textContent).not.toContain('Typ jazdy: Pravidelná')
  })
  it('dlhý plán vykreslí každý pridelený spoj len raz vrátane zvýraznenej jazdy', () => {
    const s = createInitialState(),
      template = s.trips.find((t) => t.id === 't-0-1')!
    for (let i = 0; i < 30; i++)
      s.trips.push({ ...template, id: `long-list-${i}`, line: `L${i}`, requestIds: [] })
    localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(s))
    setUrl('/driver')
    render(<App />)
    const assigned = s.trips.filter(
      (t) => t.driverId === s.activeDriverId && t.date === s.serviceDate,
    )
    for (const trip of assigned)
      expect(document.querySelectorAll(`main a[href="/driver/trips/${trip.id}"]`)).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Moje dnešné jazdy' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Mobilná navigácia' })).toBeTruthy()
  })
})
