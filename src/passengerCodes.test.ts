import { expect, it } from 'vitest'
import { createInitialState } from './data'
import { transition } from './domain'
import { restoreState } from './storage'
import {
  generatePassengerCode,
  ensurePassengerIdentity,
  bookingPassengerCode,
  passengerCodeError,
  usedPassengerCodes,
} from './passengerCodes'
it('retries collisions, preserves leading zeroes and has a terminating fallback', () => {
  let tries = 0
  expect(generatePassengerCode(['123456'], () => (++tries === 1 ? 123456 : 42))).toBe('000042')
  expect(tries).toBe(2)
  expect(generatePassengerCode(['000000'], () => 0)).toBe('000001')
})
it('assigns unique stable codes to every legacy family profile without losing data or bookings', () => {
  const s = createInitialState()
  s.version = 4
  s.people.forEach((p) => delete p.passengerCode)
  const old = structuredClone(s)
  const restored = restoreState(s)!
  expect(restored.people.every((p) => /^\d{6}$/.test(p.passengerCode!))).toBe(true)
  expect(new Set(usedPassengerCodes(restored)).size).toBe(usedPassengerCodes(restored).length)
  const again = restoreState(JSON.parse(JSON.stringify(restored)))!
  expect(again.people).toEqual(restored.people)
  restored.people.forEach((p, i) => expect(p).toMatchObject(old.people[i]))
  expect(restored.bookings).toEqual(old.bookings)
  expect(s).toEqual(old)
})
it('rejects a taken number, invalid format and changing an existing permanent number', () => {
  const s = createInitialState(),
    person = {
      ...s.people[0],
      id: 'new',
      isAccountOwner: false,
      passengerCode: s.people[1].passengerCode,
    }
  expect(() => transition(s, { type: 'savePerson', person })).toThrow(
    'Toto identifikačné číslo sa už používa.',
  )
  expect(() =>
    transition(s, { type: 'savePerson', person: { ...person, passengerCode: 'abc123' } }),
  ).toThrow('šesťmiestne')
  expect(() =>
    transition(s, { type: 'savePerson', person: { ...s.people[0], passengerCode: '999999' } }),
  ).toThrow('nemenné')
  expect(s.people).toHaveLength(3)
})
it('creates profiles with a supplied or generated number and does not grant account ownership', () => {
  const s = createInitialState(),
    person = { ...s.people[0], id: 'new', passengerCode: '000001' }
  const n = transition(s, { type: 'savePerson', person })
  expect(n.people.find((p) => p.id === 'new')).toMatchObject({
    passengerCode: '000001',
    isAccountOwner: false,
  })
  expect(passengerCodeError(n, person)).toBeNull()
  const m = transition(n, {
    type: 'savePerson',
    person: { ...person, id: 'auto', passengerCode: undefined },
  })
  expect(m.people.find((p) => p.id === 'auto')?.passengerCode).toMatch(/^\d{6}$/)
})
it('resolves the same code through immutable passenger IDs across different bookings and name edits', () => {
  const s = createInitialState()
  s.people[1].contact = '+421 900 123 456'
  const one = transition(s, {
    type: 'book',
    id: 'out',
    personId: 'daughter',
    seats: 1,
    legs: [{ tripId: 't-0-1', from: 'mat', to: 'school' }],
  })
  const two = transition(one, {
    type: 'book',
    id: 'back',
    personId: 'daughter',
    seats: 1,
    legs: [{ tripId: 't-0-3', from: 'school', to: 'mat' }],
  })
  const renamed = transition(two, {
    type: 'savePerson',
    person: { ...two.people[1], name: 'Nové meno' },
  })
  const bookings = renamed.bookings.filter((b) => b.personId === 'daughter')
  expect(bookings).toHaveLength(2)
  expect(
    bookings.every(
      (b) =>
        b.passengerId === 'daughter' &&
        bookingPassengerCode(renamed, b) === s.people[1].passengerCode,
    ),
  ).toBe(true)
})
it('repairs duplicate codes and never merges unlinked external riders by their names', () => {
  const s = createInitialState()
  s.people[1].passengerCode = s.people[0].passengerCode
  s.bookings.push({ ...s.bookings[1], id: 'another', passengerId: undefined, personId: undefined })
  const n = ensurePassengerIdentity(s)
  expect(new Set(usedPassengerCodes(n)).size).toBe(usedPassengerCodes(n).length)
  expect(n.bookings.find((b) => b.id === 'another')!.passengerId).not.toBe(
    n.bookings[1].passengerId,
  )
})

it('keeps canonical passengerId compatible with existing internal-ID capacity and duplicate checks', () => {
  const s = createInitialState()
  const booking = s.bookings.find((b) => b.personId === 'me')!
  delete booking.personId
  const normalized = ensurePassengerIdentity(s)
  expect(normalized.bookings.find((b) => b.id === booking.id)?.personId).toBe('me')
  expect(() =>
    transition(normalized, {
      type: 'book',
      id: 'duplicate',
      personId: 'me',
      seats: 1,
      legs: [{ tripId: booking.tripId, from: booking.from, to: booking.to }],
    }),
  ).toThrow('už má rezerváciu')
})
