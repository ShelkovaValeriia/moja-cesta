// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { createInitialState } from './data'
import { bookingAssistance, freeSeats, transition } from './domain'
import { loadState, STORAGE_KEY } from './storage'

function phoneState() {
  const state = createInitialState()
  return transition(state, {
    type: 'registerPhonePerson',
    person: {
      ...state.people.find((p) => p.id === 'mother')!,
      id: 'phone-passenger',
      name: 'Telefonická cestujúca',
      passengerCode: undefined,
      contact: '+421 900 123 456',
      mobility: 'Pomoc pri nastupovaní',
    },
  })
}
const book = (personId = 'phone-passenger') => ({
  type: 'book' as const,
  id: 'phone-seat',
  personId,
  channel: 'phone' as const,
  seats: 1,
  legs: [{ tripId: 't-0-1', from: 'mat', to: 'ssv' }],
})

beforeEach(() => {
  localStorage.clear()
  window.scrollTo = vi.fn()
})
afterEach(cleanup)

it('rejects duplicate phone seats without changing the booking or capacity', () => {
  const state = transition(phoneState(), book())
  const before = structuredClone(state)
  expect(() => transition(state, { ...book(), id: 'duplicate' })).toThrow(
    'Tento cestujúci už má rezerváciu',
  )
  expect(state).toEqual(before)
  expect(freeSeats(state, state.trips[0], 'mat', 'ssv')).toBe(
    freeSeats(before, before.trips[0], 'mat', 'ssv'),
  )
})

it('checks the permanent internal ID even when a legacy booking has no personId', () => {
  const state = transition(phoneState(), book())
  const booking = state.bookings.find((b) => b.id === 'phone-seat-0')!
  booking.passengerId = 'phone-passenger'
  delete booking.personId
  expect(() => transition(state, { ...book(), id: 'duplicate' })).toThrow(
    'Tento cestujúci už má rezerváciu',
  )
})

it('prevents a household passenger from duplicating a phone booking through the app', () => {
  const state = transition(createInitialState(), book('mother'))
  expect(() =>
    transition(state, { ...book('mother'), id: 'app-duplicate', channel: undefined }),
  ).toThrow('Tento cestujúci už má rezerváciu')
  state.bookings.find((b) => b.id === 'phone-seat-0')!.status = 'cancelled'
  expect(
    transition(state, { ...book('mother'), id: 'replacement', channel: undefined }).bookings.find(
      (b) => b.id === 'replacement-0',
    )?.status,
  ).toBe('confirmed')
})

it('resolves legacy assistance from either profile registry and hides unrestricted mobility', () => {
  const state = transition(phoneState(), book())
  const booking = state.bookings.find((b) => b.id === 'phone-seat-0')!
  delete booking.assistance
  expect(bookingAssistance(state, booking)).toBe('Pomoc pri nastupovaní')
  const mother = state.people.find((p) => p.id === 'mother')!
  mother.mobility = 'Pomoc pri vystupovaní'
  expect(bookingAssistance(state, { ...booking, passengerId: mother.id })).toBe(
    'Pomoc pri vystupovaní',
  )
  mother.mobility = 'Bez obmedzení'
  expect(bookingAssistance(state, { ...booking, passengerId: mother.id })).toBeUndefined()
})

it('shows saved phone assistance at boarding and alighting without exposing the name', async () => {
  const user = userEvent.setup()
  let state = transition(phoneState(), book())
  state.bookings = state.bookings.filter((b) => b.id === 'phone-seat-0')
  state.activeDriverId = state.trips.find((t) => t.id === 't-0-1')!.driverId!
  state = transition(state, { type: 'startNavigation', id: 't-0-1', now: new Date().toISOString() })
  state = transition(state, {
    type: 'navigationArrive',
    id: 't-0-1',
    now: new Date().toISOString(),
  })
  // A booking snapshot remains available even if the passenger registry changes later.
  state.phonePeople[0].mobility = 'Bez obmedzení'
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  window.history.replaceState({}, '', '/driver/navigation/t-0-1')
  render(<App />)
  expect(screen.getByText('Pomoc pri nastupovaní')).toBeTruthy()
  expect(screen.queryByText('Telefonická cestujúca')).toBeNull()
  const stop = within(screen.getByRole('region', { name: 'Spracovanie zastávky' }))
  await user.click(stop.getByRole('button', { name: 'Nastúpil' }))
  expect(loadState().bookings[0].riderStatus).toBe('boarded')
  await user.click(stop.getByRole('button', { name: 'Pokračovať v jazde' }))
  await user.click(screen.getByRole('button', { name: 'Dorazil som na zastávku' }))
  expect(screen.getByText('Pomoc pri nastupovaní')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Vystúpil' }))
  expect(loadState().bookings[0].riderStatus).toBe('alighted')
})
