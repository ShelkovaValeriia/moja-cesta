import { describe, expect, it } from 'vitest'
import { createInitialState, addDays } from './data'
import { matchingRequests, queryString, readQuery } from './search'
import type { SearchQuery } from './types'
describe('Prenos vyhľadávania a relevantné požiadavky', () => {
  const state = createInitialState()
  const q: SearchQuery = {
    ...readQuery(new URLSearchParams()),
    from: 'lech',
    to: 'ssv',
    date: state.serviceDate,
    time: '11:00',
    timeMode: 'departure',
    roundTrip: false,
    returnDate: state.serviceDate,
    returnTime: '17:00',
  }
  it('zachová všetky polia vrátane spiatočnej cesty v URL', () => {
    const round = { ...q, roundTrip: true, returnDate: addDays(q.date, 1), returnTime: '15:40' }
    expect(readQuery(new URLSearchParams(queryString(round)))).toEqual(round)
  })
  it('vyberie skutočnú zhodu podľa smeru, dátumu a času', () => {
    expect(matchingRequests(state, q).map((r) => r.id)).toEqual(['r2'])
    expect(matchingRequests(state, { ...q, from: q.to, to: q.from })).toEqual([])
    expect(matchingRequests(state, { ...q, date: addDays(q.date, 2) })).toEqual([])
    expect(matchingRequests(state, { ...q, time: '18:00' })).toEqual([])
  })
  it('neponúkne zamietnutú požiadavku ani jednosmernú pri povinnom návrate', () => {
    expect(matchingRequests(state, { ...q, time: '08:30' })).toEqual([])
    expect(matchingRequests(state, { ...q, roundTrip: true })).toEqual([])
  })
  it('zohľadní časový režim a návrat oboch smerov', () => {
    const s = structuredClone(state)
    s.requests[1].returnDate = q.date
    s.requests[1].returnTime = '17:10'
    expect(
      matchingRequests(s, { ...q, roundTrip: true, timeMode: 'arrival', time: '11:24' }).map(
        (r) => r.id,
      ),
    ).toEqual(['r2'])
    expect(matchingRequests(s, { ...q, roundTrip: true, returnTime: '19:00' })).toEqual([])
  })
})
