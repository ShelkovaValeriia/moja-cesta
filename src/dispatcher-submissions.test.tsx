// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { addDays, createInitialState } from './data'
import { dispatcherSubmissions, matchesSubmission } from './dispatcherSubmissions'
import { STORAGE_KEY, loadState } from './storage'

beforeEach(() => {
  localStorage.clear()
  window.scrollTo = vi.fn()
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
afterEach(cleanup)

describe('Podania cestujúcich pre dispečera', () => {
  it('zobrazí skutočných členov skupiny a nepredstiera mená neznámych záujemcov', () => {
    const state = createInitialState()
    const before = structuredClone(state)
    const records = dispatcherSubmissions(state)
    const known = records.find((r) => r.key === 'ride:r1')!
    expect(known.people[0].name).toBe(state.people.find((p) => p.id === 'me')!.name)
    expect(known.unidentifiedSeats).toBe(2)
    const anonymous = records.find((r) => r.key === 'ride:r2')!
    expect(anonymous.people).toEqual([])
    expect(anonymous.unidentifiedSeats).toBe(state.requests[1].passengers)
    expect(state).toEqual(before)
  })

  it('zachová samostatné adresy a časové kritériá oboch smerov telefonického podania', () => {
    const state = createInitialState()
    state.phoneRequests = [
      {
        id: 'address-request',
        personId: 'mother',
        fromAddress: 'Hlavná 12, Matiašovce',
        toAddress: 'Námestie 1, Spišská Stará Ves',
        date: state.serviceDate,
        time: '08:30',
        timeMode: 'arrival',
        seats: 2,
        assistance: '',
        status: 'pending',
        createdAt: new Date().toISOString(),
        returnJourney: {
          date: addDays(state.serviceDate, 1),
          time: '17:45',
          timeMode: 'departure',
        },
      },
    ]
    const before = structuredClone(state)
    const record = dispatcherSubmissions(state, addDays(state.serviceDate, 1)).find(
      (r) => r.key === 'phone:address-request',
    )!
    expect(record.people[0].name).toBe(state.people.find((p) => p.id === 'mother')!.name)
    expect(record.legs.map((leg) => [leg.from, leg.to, leg.time, leg.timeMode])).toEqual([
      ['Hlavná 12, Matiašovce', 'Námestie 1, Spišská Stará Ves', '08:30', 'arrival'],
      ['Námestie 1, Spišská Stará Ves', 'Hlavná 12, Matiašovce', '17:45', 'departure'],
    ])
    expect(matchesSubmission(record, 'maria')).toBe(true)
    expect(matchesSubmission(record, record.people[0].code!)).toBe(true)
    expect(state).toEqual(before)
  })

  it('filtruje pravidelné plány podľa skutočného dňa a výnimiek', () => {
    const state = createInitialState()
    state.requests = []
    const plan = {
      weekday: 1,
      outbound: {
        from: 'mat',
        to: 'ssv',
        time: '07:45',
        timeMode: 'arrival' as const,
        timePreference: 'none' as const,
      },
      returning: {
        from: 'ssv',
        to: 'mat',
        time: '16:30',
        timeMode: 'departure' as const,
        timePreference: 'none' as const,
      },
    }
    state.rules = [
      {
        ...state.rules[0],
        id: 'weekly',
        start: '2026-11-16',
        end: '2026-11-23',
        days: [1],
        dayPlans: [plan],
        exceptions: [
          { date: '2026-11-16', type: 'skip' },
          {
            date: '2026-11-23',
            type: 'replace',
            plan: { ...plan, outbound: { ...plan.outbound, time: '09:10' } },
          },
        ],
      },
    ]
    expect(dispatcherSubmissions(state, '2026-11-16')).toHaveLength(0)
    const [record] = dispatcherSubmissions(state, '2026-11-23')
    expect(record.legs.map((leg) => leg.time)).toEqual(['09:10', '16:30'])
    expect(record.legs.every((leg) => leg.date === '2026-11-23')).toBe(true)
    expect(record.statusLabel).toBe('Aktívny plán')
    expect(dispatcherSubmissions(state, '2026-11-24')).toHaveLength(0)
  })
})

describe('Navigácia a evidencia požiadaviek', () => {
  it('uloží opravu, zamietnutie aj odstránenie cez formuláre dispečera', async () => {
    const user = userEvent.setup()
    window.history.replaceState({ idx: 0 }, '', '/dispatcher/submissions?search=r2')
    render(<App />)
    const card = () => within(screen.getByRole('article', { name: 'Požiadavka r2' }))
    expect(card().getByRole('columnheader', { name: 'Dátum' })).toBeTruthy()
    await user.click(card().getByRole('button', { name: 'Upraviť' }))
    let dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Čas (HH:mm)'), { target: { value: '12:15' } })
    await user.type(dialog.getByLabelText('Dôvod opravy'), 'Cestujúci opravil čas')
    await user.click(dialog.getByRole('button', { name: 'Uložiť opravu' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(card().getByText('12:15')).toBeTruthy()
    expect(loadState().requests.find((r) => r.id === 'r2')!.time).toBe('12:15')
    await user.click(card().getByRole('button', { name: 'Zamietnuť' }))
    dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText('Dôvod zamietnutia'), 'Cestujúci cestu nepotrebuje')
    await user.click(dialog.getByRole('button', { name: 'Zamietnuť požiadavku' }))
    expect(loadState().requests.find((r) => r.id === 'r2')!.status).toBe('rejected')
    await user.click(card().getByRole('button', { name: 'Odstrániť' }))
    dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText('Dôvod odstránenia'), 'Duplicitné podanie')
    await user.click(dialog.getByRole('button', { name: 'Odstrániť požiadavku' }))
    expect(screen.queryByRole('article', { name: 'Požiadavka r2' })).toBeNull()
    expect(loadState().submissionManagement?.['ride:r2'].history).toHaveLength(3)
  })

  it('oddelí požadované cesty od podaní a odstráni stránku pravidelných potrieb', async () => {
    const user = userEvent.setup()
    window.history.replaceState({ idx: 0 }, '', '/dispatcher')
    render(<App />)
    const nav = within(screen.getByRole('navigation', { name: 'Navigácia dispečera' }))
    expect(nav.queryByRole('link', { name: 'Pravidelné dopravné potreby' })).toBeNull()
    await user.click(nav.getByRole('link', { name: /^Požadované cesty/ }))
    expect(screen.getByRole('heading', { name: 'Požadované cesty' })).toBeTruthy()
    await user.click(nav.getByRole('link', { name: 'Požiadavky' }))
    expect(window.location.pathname).toBe('/dispatcher/submissions')
    const request = within(screen.getByRole('article', { name: 'Požiadavka r1' }))
    expect(request.getByRole('heading', { name: 'Kto cestuje' })).toBeTruthy()
    expect(
      request.getByText(createInitialState().people.find((p) => p.id === 'me')!.name),
    ).toBeTruthy()
    const row = request.getAllByRole('row')[1]
    expect(within(row).getByText('Matiašovce, centrum')).toBeTruthy()
    expect(within(row).getByText('Spišská Stará Ves, škola')).toBeTruthy()
    expect(within(row).getByText('09:30')).toBeTruthy()
    expect(screen.queryByText('Pravidelné dopravné potreby')).toBeNull()
  })

  it('starý odkaz otvorí nový prehľad a štatistiky odkazujú na nový prehľad', async () => {
    const user = userEvent.setup()
    window.history.replaceState({ idx: 0 }, '', '/dispatcher/regular-needs')
    render(<App />)
    await screen.findByRole('heading', { name: 'Požiadavky' })
    expect(window.location.pathname).toBe('/dispatcher/submissions')
    await user.click(screen.getByRole('link', { name: 'Štatistiky' }))
    expect(document.querySelector('a[href="/dispatcher/regular-needs"]')).toBeNull()
    const links = screen.getAllByRole('link', { name: 'Požiadavky' })
    expect(links.every((link) => link.getAttribute('href') === '/dispatcher/submissions')).toBe(
      true,
    )
  })

  it('vyhľadáva a stránkuje podania bez zmeny rezervácií', async () => {
    const user = userEvent.setup()
    const state = createInitialState()
    state.rules = []
    state.requests = Array.from({ length: 25 }, (_, i) => ({
      ...state.requests[0],
      id: `submission-${i}`,
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState({ idx: 0 }, '', '/dispatcher/submissions')
    render(<App />)
    expect(screen.getAllByRole('article')).toHaveLength(20)
    await user.click(screen.getByRole('button', { name: 'Ďalšia' }))
    expect(screen.getAllByRole('article')).toHaveLength(5)
    await user.type(screen.getByLabelText('Vyhľadať požiadavku'), 'submission-24')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(window.location.search).not.toContain('page=')
    await user.selectOptions(screen.getByLabelText('Zdroj požiadavky'), 'phone')
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText('Žiadne zodpovedajúce požiadavky')).toBeTruthy()
    expect(loadState().bookings).toEqual(state.bookings)
    expect(loadState().requests).toEqual(state.requests)
    expect(loadState().trips).toEqual(state.trips)
  })
})
