// @vitest-environment jsdom
import { createInitialState as guardianTestSeed } from './data'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import LocationMap from './components/LocationMap'
import { TimePicker } from './components/TimePicker'
import { createInitialState } from './data'
import { readQuery } from './search'
import type { AppState, JourneyPlace } from './types'
const saved = (): AppState => JSON.parse(localStorage.getItem('moja-cesta-demo-v1')!)
beforeEach(() => {
  localStorage.clear()
  const guardianSeed = guardianTestSeed()
  guardianSeed.people[1].contact = '+421 900 123 456'
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(guardianSeed))
  window.history.replaceState({ idx: 0 }, '', '/passenger/search')
  window.scrollTo = vi.fn()
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
  for (const key of ['clientWidth', 'offsetWidth'] as const)
    vi.spyOn(HTMLElement.prototype, key, 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('location-leaflet') ? 600 : 0
    })
  for (const key of ['clientHeight', 'offsetHeight'] as const)
    vi.spyOn(HTMLElement.prototype, key, 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('location-leaflet') ? 340 : 0
    })
  const native = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('location-leaflet')
      ? {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 600,
          bottom: 340,
          width: 600,
          height: 340,
          toJSON: () => ({}),
        }
      : native.call(this)
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
describe('24-hodinový ovládač', () => {
  it('ponúka 00–23 a 00–59 bez systémového AM/PM a uchová HH:mm', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [value, setValue] = useState('06:00')
      return <TimePicker label="Čas" value={value} onChange={setValue} />
    }
    render(<Harness />)
    expect((screen.getByLabelText('Čas') as HTMLInputElement).type).toBe('text')
    await user.click(screen.getByRole('button', { name: 'Čas: vybrať čas' }))
    const hours = screen.getByRole('combobox', { name: 'Čas: hodiny' }),
      minutes = screen.getByRole('combobox', { name: 'Čas: minúty' })
    expect(
      within(hours)
        .getAllByRole('option')
        .map((x) => x.textContent),
    ).toEqual(Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')))
    expect(within(minutes).getAllByRole('option')).toHaveLength(60)
    await user.selectOptions(hours, '17')
    await user.selectOptions(minutes, '45')
    expect((screen.getByLabelText('Čas') as HTMLInputElement).value).toBe('17:45')
    expect(document.body.textContent).not.toMatch(/\b(?:AM|PM)\b/)
  })
})
describe('Skutočný Leaflet v DOM', () => {
  it('vyberie kliknutý bod, zobrazí marker, priblíži a umožní posun klávesnicou', async () => {
    const user = userEvent.setup(),
      selected = vi.fn()
    function Harness() {
      const [point, setPoint] = useState<JourneyPlace | null>(null)
      return (
        <LocationMap
          selected={point}
          stops={createInitialState().stops}
          onSelect={(p) => {
            selected(p)
            setPoint(p)
          }}
          onTileError={() => {}}
        />
      )
    }
    const view = render(<Harness />),
      map = view.container.querySelector('.location-leaflet') as HTMLElement
    fireEvent.click(map, { clientX: 300, clientY: 170 })
    expect(selected).toHaveBeenCalled()
    expect(selected.mock.calls.at(-1)![0].type).toBe('custom')
    expect(selected.mock.calls.at(-1)![0].latitude).toBeCloseTo(49.383, 3)
    expect(selected.mock.calls.at(-1)![0].longitude).toBeCloseTo(20.367, 3)
    expect(view.container.querySelector('.location-chosen-marker')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Priblížiť' }))
    await waitFor(() =>
      expect(
        Array.from(view.container.querySelectorAll('img.leaflet-tile')).some((img) =>
          (img as HTMLImageElement).src.includes('/14/'),
        ),
      ).toBe(true),
    )
    await waitFor(() => expect(view.container.querySelector('.leaflet-pan-anim')).toBeNull())
    map.focus()
    fireEvent.keyDown(document, { key: 'ArrowRight', keyCode: 39, which: 39 })
    await waitFor(() => expect(view.container.querySelector('.leaflet-pan-anim')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Vybrať stred mapy' }))
    await waitFor(() => expect(selected.mock.calls.at(-1)![0].longitude).toBeGreaterThan(20.367))
  })
})
describe('Miesto na mape v celom scenári', () => {
  it('uchová body oboch polí, umožní ich zmenu a výber existujúcej zastávky', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Odkiaľ: Vybrať na mape' }))
    const fromDialog = screen.getByRole('dialog', { name: 'Vybrať miesto odchodu' })
    await waitFor(() => expect(fromDialog.querySelector('.location-leaflet')).toBeTruthy())
    fireEvent.click(fromDialog.querySelector('.location-leaflet')!, { clientX: 360, clientY: 170 })
    await user.type(within(fromDialog).getByLabelText('Názov alebo adresa nepovinné'), 'Pri bráne')
    await user.click(within(fromDialog).getByRole('button', { name: 'Potvrdiť miesto' }))
    expect((screen.getByRole('combobox', { name: 'Odkiaľ' }) as HTMLInputElement).value).toBe(
      'Pri bráne',
    )
    let q = readQuery(new URLSearchParams(window.location.search))
    expect(q.fromPlace?.type).toBe('custom')
    expect(q.fromStopConfirmed).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Kam: Vybrať na mape' }))
    const toDialog = screen.getByRole('dialog', { name: 'Vybrať cieľ cesty' })
    await user.selectOptions(within(toDialog).getByLabelText('Existujúca zastávka'), 'school')
    await user.click(within(toDialog).getByRole('button', { name: 'Potvrdiť miesto' }))
    q = readQuery(new URLSearchParams(window.location.search))
    expect(q.toPlace).toMatchObject({ type: 'stop', stopId: 'school' })
    expect(q.to).toBe('school')
    const point = q.fromPlace
    await user.click(screen.getByRole('button', { name: 'Vymeniť zastávky' }))
    q = readQuery(new URLSearchParams(window.location.search))
    expect(q.toPlace).toEqual(point)
    expect(q.from).toBe('school')
    await user.click(screen.getByRole('button', { name: 'Kam: Vybrať na mape' }))
    const edit = screen.getByRole('dialog', { name: 'Vybrať cieľ cesty' })
    await waitFor(() => expect(edit.querySelector('.location-leaflet')).toBeTruthy())
    fireEvent.click(edit.querySelector('.location-leaflet')!, { clientX: 330, clientY: 170 })
    await user.click(within(edit).getByRole('button', { name: 'Potvrdiť miesto' }))
    expect(readQuery(new URLSearchParams(window.location.search)).toPlace?.longitude).not.toBe(
      point?.longitude,
    )
  })
  it('nepovolí pravidelnú rezerváciu vlastného bodu bez potvrdenia zastávky', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Odkiaľ: Vybrať na mape' }))
    const dialog = screen.getByRole('dialog', { name: 'Vybrať miesto odchodu' })
    await waitFor(() => expect(dialog.querySelector('.location-leaflet')).toBeTruthy())
    fireEvent.click(dialog.querySelector('.location-leaflet')!, { clientX: 330, clientY: 170 })
    await user.click(within(dialog).getByRole('button', { name: 'Potvrdiť miesto' }))
    const place = readQuery(new URLSearchParams(window.location.search)).fromPlace
    await user.click(screen.getByRole('button', { name: 'Hľadať' }))
    const out = screen.getByRole('region', { name: 'Cesta tam' })
    await user.click(within(out).getAllByRole('button', { name: 'Vybrať spoj' })[0])
    expect(
      (screen.getByRole('button', { name: 'Pokračovať k rezervácii' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Použiť túto zastávku' }))
    await user.click(screen.getByRole('link', { name: 'Pokračovať k rezervácii' }))
    expect(readQuery(new URLSearchParams(window.location.search)).fromPlace).toEqual(place)
    expect(screen.getByLabelText('Vybraní cestujúci')).toBeTruthy()
  })
  it('prenesie bod do žiadosti, vyžiada súhlas dispečera a ukáže dohodnuté miesto vodičovi', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Pre koho hľadáte cestu?'), 'mother')
    await user.clear(screen.getByLabelText('Čas'))
    await user.type(screen.getByLabelText('Čas'), '11:00')
    await user.click(screen.getByRole('button', { name: 'Odkiaľ: Vybrať na mape' }))
    const dialog = screen.getByRole('dialog', { name: 'Vybrať miesto odchodu' })
    await waitFor(() => expect(dialog.querySelector('.location-leaflet')).toBeTruthy())
    fireEvent.click(dialog.querySelector('.location-leaflet')!, { clientX: 330, clientY: 170 })
    await user.type(
      within(dialog).getByLabelText('Názov alebo adresa nepovinné'),
      'Pri zelenej bráne',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Potvrdiť miesto' }))
    const place = readQuery(new URLSearchParams(window.location.search)).fromPlace
    await user.click(screen.getByRole('button', { name: 'Hľadať' }))
    await user.click(screen.getByRole('link', { name: 'Pozrieť požiadavky' }))
    await user.click(screen.getByRole('link', { name: 'Vytvoriť novú požiadavku' }))
    expect((screen.getByRole('combobox', { name: 'Odkiaľ' }) as HTMLInputElement).value).toBe(
      'Pri zelenej bráne',
    )
    await user.click(screen.getByRole('button', { name: 'Odoslať požiadavku' }))
    const req = saved().requests[0]
    expect(req.fromPlace).toEqual(place)
    expect(req.placesStatus).toBe('pending')
    expect(saved().stops).toHaveLength(6)
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Demonštračná rola' }),
      'dispatcher',
    )
    await user.click(document.querySelector('a[href="/dispatcher/requests"]')!)
    await user.click(screen.getByRole('button', { name: `Schváliť požiadavku ${req.id}` }))
    const approve = screen.getByRole('button', { name: 'Schváliť a naplánovať' })
    expect((approve as HTMLButtonElement).disabled).toBe(true)
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Schvaľujem navrhované miesta nástupu a výstupu pre túto jazdu.',
      }),
    )
    await user.click(approve)
    const r = saved().requests.find((r) => r.id === req.id)!,
      trip = saved().trips.find((t) => t.id === r.tripId)!
    expect(r.placesStatus).toBe('approved')
    expect(trip.stops[0].place).toEqual(place)
    expect(saved().stops).toHaveLength(6)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Demonštračná rola' }), 'driver')
    const profileState = { ...saved(), activeDriverId: trip.driverId! }
    localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(profileState))
    fireEvent(
      window,
      new StorageEvent('storage', {
        key: 'moja-cesta-demo-v1',
        newValue: JSON.stringify(profileState),
      }),
    )
    await user.click(document.querySelector(`a[href="/driver/trips/${trip.id}"]`)!)
    expect(document.querySelector('main')?.textContent).toContain('Pri zelenej bráne')
    expect(document.querySelector('main')?.textContent).not.toContain('point:')
  })
})
describe('Správca rodinného účtu', () => {
  it('zobrazí korunu iba podľa príznaku aj po premenovaní a zmene poradia', () => {
    const s = createInitialState()
    s.people = s.people.reverse()
    s.people.find((p) => p.id === 'me')!.name = 'Iné meno správcu'
    s.people.find((p) => p.id === 'mother')!.name = 'Zuzana Nováková'
    localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(s))
    window.history.replaceState({ idx: 0 }, '', '/passenger/profile')
    render(<App />)
    expect(document.querySelectorAll('.account-owner-crown')).toHaveLength(1)
    const owner = screen.getByRole('heading', { name: 'Iné meno správcu' }).closest('article')!
    expect(owner.querySelector('.account-owner-crown')).toBeTruthy()
    expect(within(owner).getByText('Správca účtu')).toBeTruthy()
    expect(
      screen
        .getByRole('heading', { name: 'Zuzana Nováková' })
        .closest('article')
        ?.querySelector('.account-owner-crown'),
    ).toBeNull()
  })
})

describe('Súkromie verejného prehľadu požiadaviek', () => {
  it('nevykreslí presnú adresu ani súradnice cudzieho návrhu v zozname alebo detaile', async () => {
    const user = userEvent.setup(),
      s = createInitialState()
    s.requests.unshift({
      id: 'private-point',
      from: 'mat',
      to: 'ssv',
      date: s.serviceDate,
      time: '11:00',
      timeMode: 'departure',
      passengers: 1,
      ownSeats: 0,
      members: [],
      status: 'pending',
      accessibility: '',
      fromPlace: {
        type: 'custom',
        latitude: 49.3544,
        longitude: 20.3613,
        name: 'Súkromná adresa 123',
      },
      placesStatus: 'pending',
      createdByMe: false,
    })
    localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(s))
    window.history.replaceState({ idx: 0 }, '', '/passenger/requests')
    render(<App />)
    expect(document.querySelector('main')?.textContent).not.toContain('Súkromná adresa')
    await user.click(document.querySelector('a[href="/passenger/requests/private-point"]')!)
    expect(document.querySelector('main')?.textContent).not.toContain('Súkromná adresa')
    expect(document.querySelector('main')?.textContent).not.toContain('49.354400')
    expect(screen.getByText(/Presné navrhované miesto nie je verejné/)).toBeTruthy()
  })
})
