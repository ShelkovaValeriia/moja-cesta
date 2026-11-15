// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DateInput } from './components/DateInput'
import { parseDateText } from './dates'
import { StoreContext } from './context'
import { createInitialState, addDays } from './data'
import { defaultDay, weekdayOf } from './regular'
import { RecurringPage } from './pages/Recurring'
import { JourneysPage } from './pages/Journeys'
import { FamilyPage } from './pages/Family'
import type { AppState } from './types'
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
afterEach(cleanup)
function mount(element: React.ReactNode, s = createInitialState()) {
  const act = vi.fn(() => true)
  render(
    <StoreContext.Provider
      value={{
        state: s,
        act,
        reset: vi.fn(),
        toast: null,
        dismissToast: vi.fn(),
        storageWarning: false,
      }}
    >
      <MemoryRouter>{element}</MemoryRouter>
    </StoreContext.Provider>,
  )
  return act
}
it('displays Slovak dates, accepts Slovak input and selects days in the local calendar while emitting ISO', async () => {
  const user = userEvent.setup(),
    change = vi.fn()
  function Sample() {
    const [date, setDate] = useState('2026-11-19')
    return (
      <label>
        Dátum
        <DateInput
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            change(e.target.value)
          }}
        />
      </label>
    )
  }
  render(<Sample />)
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('19. 11. 2026')
  await user.clear(screen.getByRole('textbox'))
  await user.type(screen.getByRole('textbox'), '20. 11. 2026')
  await user.tab()
  expect(change).toHaveBeenLastCalledWith('2026-11-20')
  await user.click(screen.getByRole('button', { name: 'Otvoriť kalendár' }))
  await user.click(screen.getByRole('button', { name: 'Nasledujúci mesiac' }))
  await user.click(screen.getByRole('button', { name: '1. 12. 2026' }))
  expect(change).toHaveBeenLastCalledWith('2026-12-01')
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('1. 12. 2026')
  expect(document.querySelector('input[type=date]')).toBeNull()
})
it('validates dates and enforces calendar bounds', async () => {
  expect(parseDateText('29. 2. 2027')).toBe('')
  expect(parseDateText('29. 2. 2028')).toBe('2028-02-29')
  const user = userEvent.setup()
  render(<DateInput aria-label="Dátum" value="2026-11-19" min="2026-11-19" max="2026-11-20" />)
  await user.click(screen.getByRole('button', { name: 'Otvoriť kalendár' }))
  expect((screen.getByRole('button', { name: '18. 11. 2026' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  expect((screen.getByRole('button', { name: '20. 11. 2026' }) as HTMLButtonElement).disabled).toBe(
    false,
  )
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('has four tabs, displays existing regular plans and retains edit routes without a duplicate top link', async () => {
  const user = userEvent.setup()
  mount(<JourneysPage />)
  expect(screen.getAllByRole('tab')).toHaveLength(4)
  expect(screen.queryByRole('link', { name: 'Moje pravidelné cesty' })).toBeNull()
  await user.click(screen.getByRole('tab', { name: /Moje pravidelné cesty/ }))
  expect(screen.getAllByRole('link', { name: 'Upraviť rozvrh' })[0].getAttribute('href')).toContain(
    '/passenger/recurring/',
  )
  await user.click(screen.getByRole('tab', { name: /História/ }))
  expect(screen.getByRole('tab', { name: /História/ }).getAttribute('aria-selected')).toBe('true')
})
function booked(partial: boolean): AppState {
  const s = createInitialState()
  const r = {
    ...s.rules[0],
    start: s.serviceDate,
    end: partial ? addDays(s.serviceDate, 7) : s.serviceDate,
    dayPlans: [defaultDay(weekdayOf(s.serviceDate))],
    planStatus: 'confirmed' as const,
  }
  s.rules = [r]
  for (const [i, tripId, from, to] of [
    [0, 't-0-1', 'mat', 'school'],
    [1, 't-0-3', 'school', 'mat'],
  ] as const)
    s.bookings.push({
      id: `ux-${i}`,
      tripId,
      from,
      to,
      personId: r.personId,
      name: 'Demo',
      seats: 1,
      ruleId: r.id,
      occurrenceDate: s.serviceDate,
      status: 'confirmed',
      riderStatus: 'expected',
      mine: true,
    })
  return s
}
it('shows a partly booked plan blue even when its stored plan status says confirmed', () => {
  mount(<RecurringPage />, booked(true))
  expect(screen.getByText('Čiastočne potvrdené').className).toContain('partial')
  expect(screen.queryByText('Doprava zabezpečená')).toBeNull()
})
it('shows fully covered plans green and gives the four actions the same button class and working handlers', async () => {
  const user = userEvent.setup(),
    act = mount(<RecurringPage />, booked(false))
  expect(screen.getByText('Doprava zabezpečená').className).toContain('secured')
  for (const label of ['Upraviť rozvrh', 'Pozastaviť', 'Vynechať konkrétny deň', 'Zrušiť']) {
    const element = screen.getByRole(label === 'Upraviť rozvrh' ? 'link' : 'button', {
      name: label,
    })
    expect(element.className).toContain('btn btn-secondary')
    expect(element.querySelector('svg')).toBeTruthy()
  }
  await user.click(screen.getByRole('button', { name: 'Pozastaviť' }))
  await user.click(screen.getByRole('button', { name: 'Potvrdiť pozastavenie' }))
  expect(act).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'ruleStatus', status: 'paused' }),
    expect.any(String),
  )
})
it('removes only the stop-proposal entry from the family page', () => {
  mount(<FamilyPage />)
  expect(screen.queryByText(/Chýba vám zastávka/)).toBeNull()
  expect(screen.getByRole('heading', { name: 'Profil a rodina' })).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /Upraviť profil/ }).length).toBeGreaterThan(0)
})
it('shows an empty-state message instead of an empty confirmation accordion', () => {
  const s = booked(false)
  s.bookings = s.bookings.filter((b) => !b.ruleId)
  s.regularTasks = []
  mount(<RecurringPage />, s)
  expect(screen.getByText('Zatiaľ nie sú dostupné žiadne potvrdenia ani termíny.')).toBeTruthy()
  expect(screen.queryByText('Potvrdenia a lehoty podľa dátumov')).toBeNull()
  expect(screen.getByText('Čaká na zabezpečenie').className).toContain('waiting')
})
it('renders real trip details without tasks and gives the date accordion a chevron and nonempty body', async () => {
  const user = userEvent.setup()
  mount(<RecurringPage />, booked(false))
  const summary = screen.getByText('Potvrdenia a lehoty podľa dátumov')
  expect(summary.querySelector('svg')).toBeTruthy()
  await user.click(summary)
  const date = document.querySelector('.regular-confirmation-date') as HTMLDetailsElement
  await user.click(date.querySelector('summary')!)
  expect(date.open).toBe(true)
  expect(date.querySelector('.regular-confirmation-body')?.textContent).toContain('Linka 102')
  expect(date.querySelectorAll('.regular-confirmation-body p')).toHaveLength(2)
  expect(screen.queryByText('Dopravné potreby podľa dátumov (0)')).toBeNull()
})
it('keeps stale confirmations pending and displays the real deadline and reason', async () => {
  const s = booked(false)
  s.bookings = s.bookings.filter((b) => !b.ruleId)
  s.regularTasks = [
    {
      id: 'task',
      ruleId: s.rules[0].id,
      date: s.serviceDate,
      deadline: new Date(s.serviceDate + 'T06:00:00Z').toISOString(),
      status: 'confirmed',
      details: 'Neplatné potvrdenie',
      reason: 'Čaká na návrat.',
    },
  ]
  const user = userEvent.setup()
  mount(<RecurringPage />, s)
  await user.click(screen.getByText('Potvrdenia a lehoty podľa dátumov'))
  await user.click(document.querySelector('.regular-confirmation-date summary')!)
  expect(screen.getByText(/Lehota potvrdenia:/)).toBeTruthy()
  expect(screen.getByText('Čaká na návrat.')).toBeTruthy()
  expect(screen.queryByText('Neplatné potvrdenie')).toBeNull()
})
