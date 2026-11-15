// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { createInitialState, addDays } from './data'
import { transition } from './domain'
import { defaultDay, weekdayOf } from './regular'
import { localInstant } from './regularPlanning'
import type { WeeklySchedule } from './types'
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
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
function fixture() {
  const s = createInitialState()
  s.rules = []
  const date = addDays(s.serviceDate, 7)
  const schedule: WeeklySchedule = {
    id: 'plan',
    personId: 'mother',
    purpose: 'work',
    start: date,
    end: date,
    dayPlans: [defaultDay(weekdayOf(date))],
    exceptions: [],
  }
  const now = new Date(localInstant(s.serviceDate, '10:00')).toISOString()
  return { s, schedule, now }
}
it('requires work/school and five calendar days, preserving state on failure', () => {
  const { s, schedule, now } = fixture()
  expect(() =>
    transition(s, { type: 'submitRegularPlan', schedule: { ...schedule, purpose: 'other' }, now }),
  ).toThrow('účel')
  const date = addDays(s.serviceDate, 4)
  expect(() =>
    transition(s, {
      type: 'submitRegularPlan',
      schedule: { ...schedule, start: date, end: date, dayPlans: [defaultDay(weekdayOf(date))] },
      now,
    }),
  ).toThrow('5 kalendárnych')
  expect(s.rules).toHaveLength(0)
})
it('submits one demand plan, then secures assigned trips and both directions only during explicit processing', () => {
  const { s, schedule, now } = fixture()
  const submitted = transition(s, { type: 'submitRegularPlan', schedule, now })
  expect(submitted.bookings).toHaveLength(s.bookings.length)
  expect(submitted.regularTasks?.[0].status).toBe('pending')
  const confirmed = transition(submitted, { type: 'processRegularPlans', now })
  expect(confirmed.bookings.filter((b) => b.ruleId === 'plan')).toHaveLength(2)
  expect(confirmed.regularTasks?.[0].details).toContain('07:')
  expect(confirmed.rules[0].planStatus).toBe('confirmed')
  expect(transition(confirmed, { type: 'processRegularPlans', now }).bookings).toHaveLength(
    confirmed.bookings.length,
  )
})
it('keeps missing return or missing driver as a dispatcher task and flags overdue without rejecting demand', () => {
  for (const missing of ['return', 'driver']) {
    const { s, schedule, now } = fixture()
    s.trips = s.trips.filter(
      (t) => !(missing === 'return' && t.date === schedule.start && t.stops[0].stopId === 'school'),
    )
    if (missing === 'driver')
      s.trips.filter((t) => t.date === schedule.start).forEach((t) => (t.driverId = null))
    let next = transition(s, { type: 'submitRegularPlan', schedule, now })
    next = transition(next, {
      type: 'processRegularPlans',
      now: new Date(localInstant(schedule.start, '12:00')).toISOString(),
    })
    expect(next.bookings.filter((b) => b.ruleId === 'plan')).toHaveLength(0)
    expect(next.regularTasks?.[0].status).toBe('overdue')
    expect(next.rules[0].status).toBe('active')
  }
})
it('reports late confirmation honestly and updates coverage instead of adding demand twice', () => {
  const { s, schedule, now } = fixture()
  let n = transition(s, { type: 'submitRegularPlan', schedule, now })
  n = transition(n, {
    type: 'processRegularPlans',
    now: new Date(localInstant(schedule.start, '06:00')).toISOString(),
  })
  expect(n.regularTasks?.[0].status).toBe('confirmedLate')
  expect(n.notifications?.some((m) => m.text.includes('Oneskorené'))).toBe(true)
})
it('shows four equal home cards and submits without a passenger service selection stage', async () => {
  const user = userEvent.setup()
  render(<App />)
  expect(document.querySelectorAll('.home-destinations > .home-destination')).toHaveLength(4)
  await user.click(screen.getByRole('link', { name: /Pravidelne cestujem/ }))
  await user.click(screen.getByRole('button', { name: 'Pokračovať k rozvrhu' }))
  expect(screen.getByRole('alert').textContent).toContain('účel')
  await user.selectOptions(screen.getByRole('combobox', { name: /Účel cesty/ }), 'work')
  await user.click(screen.getByRole('button', { name: 'Pokračovať k rozvrhu' }))
  await user.click(screen.getByRole('button', { name: 'Pridať prvý deň' }))
  await user.click(screen.getByRole('button', { name: 'Uložiť deň' }))
  await user.click(screen.getByRole('button', { name: 'Skontrolovať plán' }))
  expect(screen.queryByRole('button', { name: 'Vybrať spoj' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Odoslať pravidelný plán' }))
  expect(screen.getByRole('heading', { name: 'Moje pravidelné cesty' })).toBeTruthy()
})

it('does not confirm a trip retroactively after its departure', () => {
  const { s, schedule, now } = fixture()
  const submitted = transition(s, { type: 'submitRegularPlan', schedule, now })
  const checked = transition(submitted, {
    type: 'processRegularPlans',
    now: new Date(localInstant(schedule.start, '23:59')).toISOString(),
  })
  expect(checked.bookings.filter((b) => b.ruleId === 'plan')).toHaveLength(0)
  expect(checked.regularTasks?.[0].status).toBe('overdue')
})
