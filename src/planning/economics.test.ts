import { describe, expect, it } from 'vitest'
import { calendarDays, economicSummary } from './economics'
import { DEFAULT_POLICY } from './scenarios'
import type { EconomicsAssumptions, FleetMetrics } from './types'

const fleet: FleetMetrics = {
  ownedBuses: 2,
  usedBuses: 2,
  peakBusyBuses: 2,
  calendarDays: 3,
  vehicleDays: 6,
  managedMovements: 10,
  externalMovements: 5,
  buses: [],
}
const assumptions: EconomicsAssumptions = {
  purchasePricePerBus: 36500,
  residualValuePerBus: 7300,
  depreciationYears: 8,
  litresPer100Km: 10,
  fuelPricePerLitre: 2,
  overheadPerDay: 15,
  supportPerDay: 30,
}
const input = { fleet, vehicleKm: 100, driverMinutes: 120, stopCost: 5 }

describe('Shared-fleet economics', () => {
  it('reconciles a known cost and revenue example without adding purchase price to depreciation', () => {
    const result = economicSummary(input, DEFAULT_POLICY, assumptions)
    expect(result.fleetInvestment).toBe(73000)
    expect(result.depreciation).toBe(60)
    expect(result.standingCosts).toBe(150)
    expect(result.fuelLitres).toBe(10)
    expect(result.fuelCost).toBe(20)
    expect(result.drivers).toBe(24)
    expect(result.maintenance).toBe(15)
    expect(result.overhead).toBe(45)
    expect(result.totalCost).toBe(319)
    expect(result.ticketRevenue).toBe(20)
    expect(result.supportRevenue).toBe(90)
    expect(result.totalRevenue).toBe(110)
    expect(result.profit).toBe(-209)
    expect(result.operatingCashBalance).toBe(-149)
    expect(result.breakEvenFare).toBe(22.9)
    expect(result.requiredSupport).toBe(299)
  })
  it('charges an idle owned bus while fuel and wages remain tied to operation', () => {
    const result = economicSummary(
      { ...input, fleet: { ...fleet, ownedBuses: 3, vehicleDays: 9 } },
      DEFAULT_POLICY,
      assumptions,
    )
    expect(result.fleetInvestment).toBe(109500)
    expect(result.totalCost).toBe(424)
    expect(result.fuelCost).toBe(20)
    expect(result.drivers).toBe(24)
  })
  it('does not earn fare revenue from external-only movements or divide by zero passengers', () => {
    const morePublic = economicSummary(
      { ...input, fleet: { ...fleet, externalMovements: 500 } },
      DEFAULT_POLICY,
      assumptions,
    )
    expect(morePublic.ticketRevenue).toBe(20)
    const noRiders = economicSummary(
      { ...input, fleet: { ...fleet, managedMovements: 0 } },
      DEFAULT_POLICY,
      { ...assumptions, supportPerDay: 0 },
    )
    expect(noRiders.ticketRevenue).toBe(0)
    expect(noRiders.breakEvenFare).toBeNull()
    expect(noRiders.marginPercent).toBeNull()
    expect(noRiders.profit).toBe(-319)
  })
  it('distinguishes missing fares from free travel and reports profit only under explicit assumptions', () => {
    const unknown = economicSummary(
      input,
      { ...DEFAULT_POLICY, farePerMovement: null },
      assumptions,
    )
    expect(unknown.totalRevenue).toBeNull()
    expect(unknown.profit).toBeNull()
    const free = economicSummary(input, { ...DEFAULT_POLICY, farePerMovement: 0 }, assumptions)
    expect(free.ticketRevenue).toBe(0)
    expect(free.profit).toBe(-229)
    const supported = economicSummary(input, DEFAULT_POLICY, { ...assumptions, supportPerDay: 110 })
    expect(supported.profit).toBe(31)
    expect(supported.marginPercent).toBeCloseTo(8.857142857)
  })
  it('charges the complete calendar period including idle days and DST changes', () => {
    expect(calendarDays(['2026-09-10', '2026-09-08'])).toBe(3)
    expect(calendarDays(['2026-10-24', '2026-10-26'])).toBe(3)
    expect(calendarDays(['2026-12-31', '2027-01-01'])).toBe(2)
    expect(calendarDays([])).toBe(0)
  })
})
