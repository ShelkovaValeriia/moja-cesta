/** Pure planning contracts. No React, application store, passenger identity or Leaflet. */
export interface Point {
  latitude: number
  longitude: number
}
export interface PlanningStop extends Point {
  id: string
  name: string
  municipality: string
  hub: boolean
  platformIds: string[]
  status: 'demo' | 'proposed' | 'approved'
  openingCost: number
}
export interface NetworkSnapshot {
  source: string
  timestamp: string
  license: string
  nodes: Record<string, number[]>
  ways: { id: string; nodes: string[]; tags: Record<string, string | undefined> }[]
}
export interface Demand {
  id: string
  date: string
  from: string
  to: string
  seats: number
  sourceCell: string
  unit: number
  accessNode: string
  egressNode: string
  walkSpeedKmh: number
  maxWalkSeconds: number
  avoidSteps: boolean
  earliestPickup: number
  latestArrival: number
  maxRideMinutes: number
  orderId?: string
}
export interface Resource {
  id: string
  driverId: string
  capacity: number
  depot: string
  start: number
  end: number
  breaks: { start: number; end: number }[]
}
export interface Policy {
  walkSeconds: number
  dwellMinutes: number
  preparationMinutes: number
  transferMarginMinutes: number
  maximumTransferWaitMinutes: number
  /** With economics enabled: maintenance/tyres only; fuel is a separate component. */
  kilometreCost: number
  driverHourCost: number
  /** Standing insurance/ownership expenses, excluding purchase depreciation, fuel and wages. */
  vehicleDayCost: number
  stopCost: number
  farePerMovement: number | null
}
export interface Visit {
  stopId: string
  arrival: number
  departure: number
}
export interface Allocation {
  demandId: string
  pickup: number
  dropoff: number
  seats: number
}
export interface Run {
  id: string
  date: string
  kind: 'fixed' | 'flex'
  resourceId: string
  visits: Visit[]
  allocations: Allocation[]
  locked: boolean
}
export type Strategy = 'fixed' | 'hybrid' | 'transfers'
export interface ExternalService {
  id: string
  name: string
  date: string
  synthetic: boolean
  source: string
  visits: Visit[]
}
export interface Scenario {
  schemaVersion: 1
  id: string
  name: string
  seed: number
  sourceHash: string
  networkVersion: string
  timezone: 'Europe/Bratislava'
  dates: string[]
  assumptions: string[]
  stops: PlanningStop[]
  demand: Demand[]
  resources: Resource[]
  fixed: Run[]
  external: ExternalService[]
  policy: Policy
  economics?: EconomicsAssumptions
}
export interface EconomicsAssumptions {
  purchasePricePerBus: number
  residualValuePerBus: number
  depreciationYears: number
  litresPer100Km: number
  fuelPricePerLitre: number
  overheadPerDay: number
  supportPerDay: number
}
export interface FleetMetrics {
  ownedBuses: number
  usedBuses: number
  peakBusyBuses: number
  calendarDays: number
  vehicleDays: number
  managedMovements: number
  externalMovements: number
  buses: { id: string; capacity: number; runs: number; km: number; driverMinutes: number }[]
}
export interface EconomicsSummary {
  fleetInvestment: number
  depreciation: number
  standingCosts: number
  fuelLitres: number
  fuelCost: number
  drivers: number
  maintenance: number
  stops: number
  overhead: number
  totalCost: number
  ticketRevenue: number | null
  supportRevenue: number
  totalRevenue: number | null
  profit: number | null
  operatingCashBalance: number | null
  marginPercent: number | null
  breakEvenFare: number | null
  requiredSupport: number | null
}
export interface AccessChoice {
  stopId: string
  seconds: number
}
export interface DemandAccess {
  demandId: string
  pickups: AccessChoice[]
  dropoffs: AccessChoice[]
}
export interface StopPlan {
  selected: string[]
  uncovered: string[]
  access: DemandAccess[]
  method: 'exact-subsets' | 'greedy'
  objective: number
}
export interface Path {
  seconds: number
  meters: number
  coordinates: number[][]
  nodes: string[]
}
export interface JourneyLeg {
  serviceId: string
  kind: 'fixed' | 'flex' | 'external' | 'walk'
  from: string
  to: string
  departure: number
  arrival: number
  seatsSecured: boolean
}
export interface Journey {
  legs: JourneyLeg[]
  arrival: number
  transfers: number
  walkMinutes: number
}
export type FailureCode =
  | 'NO_WALKABLE_STOP'
  | 'STOP_REVIEW_REQUIRED'
  | 'NO_FEASIBLE_INSERTION'
  | 'NO_FIXED_OPTION'
  | 'RETURN_UNAVAILABLE'
export interface Unserved {
  demandId: string
  code: FailureCode
  reason: string
}
export interface Metrics {
  movements: number
  served: number
  unserved: number
  stops: number
  runs: number
  vehicleKm: number
  deadheadKm: number
  passengerKm: number
  seatKm: number
  driverMinutes: number
  cost: number
  revenue: number | null
  peak: number
  walkP95Seconds: number
  completeOrders: number
  pendingOrders: number
  fleet: FleetMetrics
  economics: EconomicsSummary | null
}
export interface PlanResult {
  scenarioId: string
  strategy: Strategy
  algorithm: string
  stops: StopPlan
  runs: Run[]
  unserved: Unserved[]
  metrics: Metrics
  allocations: Record<string, { runIds: string[]; walkSeconds: number }>
  journeys: Record<string, Journey>
  notices: string[]
  stopSuggestions: { stop: PlanningStop; potentialMovements: number }[]
}
