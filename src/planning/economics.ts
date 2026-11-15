import type { EconomicsAssumptions, EconomicsSummary, FleetMetrics, Policy } from './types'

/** Illustrative editable inputs; no claim about market prices, actual vehicles or signed funding. */
export const DEFAULT_ECONOMICS: EconomicsAssumptions = {
  purchasePricePerBus: 45000,
  residualValuePerBus: 9000,
  depreciationYears: 8,
  litresPer100Km: 10,
  fuelPricePerLitre: 1.6,
  overheadPerDay: 15,
  supportPerDay: 0,
}

export function calendarDays(dates: string[]) {
  if (!dates.length) return 0
  const sorted = [...dates].sort()
  return Math.round((Date.parse(sorted.at(-1)!) - Date.parse(sorted[0])) / 86400000) + 1
}

export function economicSummary(
  inputs: {
    fleet: FleetMetrics
    vehicleKm: number
    driverMinutes: number
    stopCost: number
  },
  policy: Policy,
  assumptions: EconomicsAssumptions,
): EconomicsSummary {
  const { fleet, vehicleKm, driverMinutes, stopCost } = inputs
  const fleetInvestment = fleet.ownedBuses * assumptions.purchasePricePerBus
  // Straight-line ownership allocation on a declared 365-day year, also for idle/standby buses.
  const depreciation =
    (fleet.vehicleDays * (assumptions.purchasePricePerBus - assumptions.residualValuePerBus)) /
    (assumptions.depreciationYears * 365)
  const standingCosts = fleet.vehicleDays * policy.vehicleDayCost
  const fuelLitres = (vehicleKm * assumptions.litresPer100Km) / 100
  const fuelCost = fuelLitres * assumptions.fuelPricePerLitre
  const drivers = (driverMinutes / 60) * policy.driverHourCost
  const maintenance = vehicleKm * policy.kilometreCost
  const overhead = fleet.calendarDays * assumptions.overheadPerDay
  const totalCost =
    depreciation + standingCosts + fuelCost + drivers + maintenance + stopCost + overhead
  const ticketRevenue =
    policy.farePerMovement === null ? null : fleet.managedMovements * policy.farePerMovement
  const supportRevenue = fleet.calendarDays * assumptions.supportPerDay
  const totalRevenue = ticketRevenue === null ? null : ticketRevenue + supportRevenue
  const profit = totalRevenue === null ? null : totalRevenue - totalCost
  return {
    fleetInvestment,
    depreciation,
    standingCosts,
    fuelLitres,
    fuelCost,
    drivers,
    maintenance,
    stops: stopCost,
    overhead,
    totalCost,
    ticketRevenue,
    supportRevenue,
    totalRevenue,
    profit,
    operatingCashBalance: totalRevenue === null ? null : totalRevenue - (totalCost - depreciation),
    marginPercent: totalRevenue && profit !== null ? (profit / totalRevenue) * 100 : null,
    breakEvenFare: fleet.managedMovements
      ? Math.max(0, (totalCost - supportRevenue) / fleet.managedMovements)
      : null,
    requiredSupport: ticketRevenue === null ? null : Math.max(0, totalCost - ticketRevenue),
  }
}

export function marginalKilometreCost(policy: Policy, economics?: EconomicsAssumptions) {
  return (
    policy.kilometreCost +
    (economics ? (economics.litresPer100Km / 100) * economics.fuelPricePerLitre : 0)
  )
}
