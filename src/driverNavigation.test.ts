import { expect, it } from 'vitest'
import { createInitialState } from './data'
import { transition } from './domain'
import { restoreState } from './storage'
const now = '2026-11-15T08:00:00Z'
function fixture(kind: 'fixed' | 'flex' = 'fixed') {
  const s = createInitialState()
  s.trips = [{ ...s.trips.find((t) => t.id === 't-0-1')!, id: 'run', kind }]
  s.bookings = [
    {
      id: 'a',
      tripId: 'run',
      name: 'Demo A',
      from: 'mat',
      to: 'ssv',
      seats: 1,
      status: 'confirmed',
      riderStatus: 'expected',
      mine: true,
    },
    {
      id: 'b',
      tripId: 'run',
      name: 'Demo B',
      from: 'mat',
      to: 'school',
      seats: 2,
      status: 'confirmed',
      riderStatus: 'expected',
      mine: false,
    },
  ]
  return s
}
it.each(['fixed', 'flex'] as const)(
  'processes every stop and passenger for %s with persisted timestamps',
  (kind) => {
    let s = transition(fixture(kind), { type: 'startNavigation', id: 'run', now })
    expect(() => transition(s, { type: 'rider', id: 'a', status: 'boarded' })).toThrow('zastavení')
    s = transition(s, { type: 'navigationArrive', id: 'run', now })
    expect(() => transition(s, { type: 'navigationContinue', id: 'run', now })).toThrow('všetky')
    expect(() => transition(s, { type: 'rider', id: 'a', status: 'alighted' })).toThrow()
    s = transition(s, { type: 'rider', id: 'a', status: 'boarded' })
    s = transition(s, { type: 'rider', id: 'b', status: 'absent' })
    expect(s.bookings[1].noShow?.status).toBe('reported')
    s = transition(s, { type: 'navigationContinue', id: 'run', now })
    expect(s.trips[0].navigation?.stopIndex).toBe(1)
    s = restoreState(JSON.parse(JSON.stringify(s)))!
    expect(s.trips[0].navigation?.phase).toBe('moving')
    s = transition(s, { type: 'navigationArrive', id: 'run', now })
    s = transition(s, { type: 'rider', id: 'a', status: 'alighted' })
    s = transition(s, { type: 'navigationContinue', id: 'run', now })
    expect(() => transition(s, { type: 'tripStatus', id: 'run', status: 'completed' })).toThrow(
      'zastávky',
    )
    s = transition(s, { type: 'navigationArrive', id: 'run', now })
    s = transition(s, { type: 'navigationContinue', id: 'run', now: '2026-11-15T09:00:00Z' })
    expect(s.trips[0].status).toBe('completed')
    expect(s.trips[0].navigation).toMatchObject({
      processedStops: [0, 1, 2],
      startedAt: now,
      endedAt: '2026-11-15T09:00:00Z',
    })
    expect(() => transition(s, { type: 'startNavigation', id: 'run', now })).toThrow()
  },
)
it('prevents occupancy above capacity and alighting at the wrong stop', () => {
  let s = fixture()
  s.vehicles.find((v) => v.id === s.trips[0].vehicleId)!.capacity = 2
  s = transition(s, { type: 'startNavigation', id: 'run', now })
  s = transition(s, { type: 'navigationArrive', id: 'run', now })
  s = transition(s, { type: 'rider', id: 'a', status: 'boarded' })
  expect(() => transition(s, { type: 'rider', id: 'b', status: 'boarded' })).toThrow('Kapacita')
  expect(() => transition(s, { type: 'rider', id: 'a', status: 'alighted' })).toThrow('aktuálnej')
  expect(s.bookings[1].riderStatus).toBe('expected')
})
it('rejects wrong drivers and cannot skip an unvisited stop even with no passengers', () => {
  let s = fixture()
  s.activeDriverId = 'd2'
  expect(() => transition(s, { type: 'startNavigation', id: 'run', now })).toThrow('pridelená')
  s.activeDriverId = 'd1'
  s.bookings = []
  s = transition(s, { type: 'startNavigation', id: 'run', now })
  expect(() => transition(s, { type: 'navigationContinue', id: 'run', now })).toThrow('príchod')
  expect(() => transition(s, { type: 'tripStatus', id: 'run', status: 'completed' })).toThrow(
    'zastávky',
  )
})
it('cannot complete with a passenger still aboard, including inconsistent manifests', () => {
  let s = fixture()
  s = transition(s, { type: 'startNavigation', id: 'run', now })
  s.trips[0].navigation = { stopIndex: 2, phase: 'stopped', processedStops: [0, 1], startedAt: now }
  s.bookings[0].riderStatus = 'boarded'
  s.bookings[1].riderStatus = 'absent'
  expect(() => transition(s, { type: 'navigationContinue', id: 'run', now })).toThrow('výstup')
  expect(s.trips[0].status).toBe('active')
})
it('corrects boarded and absent symmetrically, updates reservations, and preserves no-show audit', () => {
  let s = transition(fixture(), { type: 'startNavigation', id: 'run', now })
  s = transition(s, { type: 'navigationArrive', id: 'run', now })
  s = transition(s, { type: 'rider', id: 'a', status: 'boarded' })
  s = transition(s, { type: 'correctRider', id: 'a', status: 'absent', now })
  expect(s.bookings[0].riderStatus).toBe('absent')
  expect(s.bookings[0].noShow?.status).toBe('reported')
  s = transition(s, { type: 'correctRider', id: 'a', status: 'boarded', now })
  expect(s.bookings[0].riderStatus).toBe('boarded')
  expect(s.bookings[0].noShow?.status).toBe('corrected')
  expect(s.bookings[0].riderCorrections).toHaveLength(2)
  expect(restoreState(JSON.parse(JSON.stringify(s)))!.bookings[0].riderCorrections).toHaveLength(2)
})
it('blocks correction after closing a stop and blocks changes by another driver', () => {
  let s = transition(fixture(), { type: 'startNavigation', id: 'run', now })
  s = transition(s, { type: 'navigationArrive', id: 'run', now })
  s = transition(s, { type: 'rider', id: 'a', status: 'boarded' })
  s = transition(s, { type: 'rider', id: 'b', status: 'absent' })
  const other = { ...s, activeDriverId: 'd2' }
  expect(() => transition(other, { type: 'correctRider', id: 'a', status: 'absent', now })).toThrow(
    'pridelenej',
  )
  s = transition(s, { type: 'navigationContinue', id: 'run', now })
  expect(() => transition(s, { type: 'correctRider', id: 'a', status: 'absent', now })).toThrow(
    'otvorenej',
  )
  s = transition(s, { type: 'navigationArrive', id: 'run', now })
  expect(() => transition(s, { type: 'correctRider', id: 'b', status: 'boarded', now })).toThrow(
    'aktuálnej',
  )
})
it('restores an erroneous alighting only while its stop is open and requires processing it again', () => {
  let s = transition(fixture(), { type: 'startNavigation', id: 'run', now })
  s = transition(s, { type: 'navigationArrive', id: 'run', now })
  s = transition(s, { type: 'rider', id: 'a', status: 'boarded' })
  s = transition(s, { type: 'rider', id: 'b', status: 'absent' })
  s = transition(s, { type: 'navigationContinue', id: 'run', now })
  s = transition(s, { type: 'navigationArrive', id: 'run', now })
  s = transition(s, { type: 'rider', id: 'a', status: 'alighted' })
  s = transition(s, { type: 'correctRider', id: 'a', status: 'boarded', now })
  expect(s.bookings[0].riderStatus).toBe('boarded')
  expect(() => transition(s, { type: 'navigationContinue', id: 'run', now })).toThrow('všetky')
  s = transition(s, { type: 'rider', id: 'a', status: 'alighted' })
  s = transition(s, { type: 'navigationContinue', id: 'run', now })
  expect(() => transition(s, { type: 'correctRider', id: 'a', status: 'boarded', now })).toThrow()
})
it('does not restore absent passengers beyond physical or reserved capacity', () => {
  let s = fixture()
  s.vehicles.find((v) => v.id === s.trips[0].vehicleId)!.capacity = 2
  s = transition(s, { type: 'startNavigation', id: 'run', now })
  s = transition(s, { type: 'navigationArrive', id: 'run', now })
  s = transition(s, { type: 'rider', id: 'a', status: 'absent' })
  s = transition(s, { type: 'rider', id: 'b', status: 'boarded' })
  expect(() => transition(s, { type: 'correctRider', id: 'a', status: 'boarded', now })).toThrow(
    'Kapacita',
  )
  s.bookings[1].riderStatus = 'expected'
  expect(() => transition(s, { type: 'correctRider', id: 'a', status: 'boarded', now })).toThrow(
    'úseku',
  )
  expect(s.bookings[0].riderStatus).toBe('absent')
})
it('prevents restoring an alighted passenger when newly boarded riders already use the capacity', () => {
  let s = fixture()
  s.vehicles.find((v) => v.id === s.trips[0].vehicleId)!.capacity = 1
  s.bookings = s.bookings.slice(0, 1)
  s = transition(s, { type: 'startNavigation', id: 'run', now })
  s = transition(s, { type: 'navigationArrive', id: 'run', now })
  s = transition(s, { type: 'rider', id: 'a', status: 'boarded' })
  s = transition(s, { type: 'navigationContinue', id: 'run', now })
  s = transition(s, { type: 'navigationArrive', id: 'run', now })
  s = transition(s, { type: 'rider', id: 'a', status: 'alighted' })
  s.bookings.push({
    ...s.bookings[0],
    id: 'new-rider',
    from: 'ssv',
    to: 'school',
    riderStatus: 'expected',
  })
  s = transition(s, { type: 'rider', id: 'new-rider', status: 'boarded' })
  expect(() => transition(s, { type: 'correctRider', id: 'a', status: 'boarded', now })).toThrow(
    'Kapacita',
  )
})
