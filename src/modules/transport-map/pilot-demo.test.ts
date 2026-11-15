import { describe, it, expect } from 'vitest'
import { createInitialState } from '../../data'
import { createPilotDemo, PILOT_DEMO_DATE } from './demo/pilot-demo'
import { parseMapDataset } from './validation'
import { filterRoutes, segmentColor } from './model'
import { EMPTY_FILTERS } from './config'
import { formatSlovakDate, parseSlovakDate } from './locale'

describe('active managed pilot and researched public transfer', () => {
  it('excludes all supplied GTFS public routes and retains the five complete village journeys', () => {
    const data = createPilotDemo(createInitialState())
    expect(data.routes.some((r) => r.id.startsWith('gtfs:') || r.kind === 'external')).toBe(false)
    expect(data.routes.filter((r) => r.segments)).toHaveLength(5)
    expect(data.routes.filter((r) => r.id.startsWith('demo:managed:'))).toHaveLength(10)
    for (const route of data.routes.filter((r) => r.segments)) {
      expect(route.segments!.map((s) => s.kind)).toEqual(['fixed', 'external'])
      expect(route.segments!.map((s) => s.demo)).toEqual([true, false])
      expect(route.segments![0].arrival! < route.segments![1].departure!).toBe(true)
      expect(route.segments![1].departure).toBe('10:30')
      expect(route.segments![1].arrival).toBe('11:58')
      expect(route.segments![1].timetableStops).toHaveLength(35)
      expect(route.geometry?.type).toBe('MultiLineString')
      expect(route.serviceDates).toEqual([PILOT_DEMO_DATE])
    }
    expect(
      filterRoutes(data, { ...EMPTY_FILTERS, date: '2026-11-15' }).some((r) => r.segments),
    ).toBe(false)
    expect(segmentColor(0)).not.toBe(segmentColor(1))
  })
  it('preserves segment/landmark provenance through validation and rejects unsafe links', () => {
    const data = createPilotDemo(createInitialState()),
      validated = parseMapDataset(data)
    expect(validated.routes[0].segments).toEqual(data.routes[0].segments)
    expect(validated.landmarks?.map((p) => p.kind)).toEqual(['school', 'healthcare', 'shop'])
    expect(() =>
      parseMapDataset({
        ...data,
        landmarks: [{ ...data.landmarks![0], sourceUrl: 'javascript:alert(1)' }],
      }),
    ).toThrow('HTTPS')
    expect(() =>
      parseMapDataset({
        ...data,
        routes: [
          { ...data.routes[0], segments: [{ ...data.routes[0].segments![0], departure: '9 PM' }] },
        ],
      }),
    ).toThrow('HH:mm')
  })
  it('formats Slovak dates and rejects ambiguous or impossible dates without changing ISO storage', () => {
    expect(formatSlovakDate('2026-11-16')).toBe('16. 11. 2026')
    expect(parseSlovakDate('16. 11. 2026')).toBe('2026-11-16')
    expect(parseSlovakDate('29.2.2028')).toBe('2028-02-29')
    expect(parseSlovakDate('29.2.2026')).toBeNull()
    expect(parseSlovakDate('11/16/2026')).toBeNull()
    expect(parseSlovakDate('')).toBe('')
  })
})
