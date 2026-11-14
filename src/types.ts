export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type TimeMode = 'departure' | 'arrival'
export type TimePreference = 'none' | 'earlier' | 'later'
export type LicenseCategory = 'B' | 'D1' | 'D'
export interface Driver {
  id: string
  name: string
  licenseCategories: LicenseCategory[]
}
export type RiderStatus = 'expected' | 'boarded' | 'alighted' | 'absent'
export interface JourneyPlace {
  type: 'stop' | 'custom'
  latitude: number
  longitude: number
  name: string
  stopId?: string
}
export interface Stop {
  id: string
  name: string
  village: string
  latitude?: number
  longitude?: number
}
export interface Vehicle {
  id: string
  name: string
  plate: string
  capacity: number
  requiredLicenseCategory: LicenseCategory | null
}
export interface Trip {
  id: string
  line: string
  kind: 'fixed' | 'flex'
  date: string
  vehicleId: string
  driverId: string | null
  stops: { stopId: string; time: string; place?: JourneyPlace }[]
  status: 'scheduled' | 'active' | 'completed'
  requestIds: string[]
}
export interface Person {
  id: string
  name: string
  isAccountOwner?: boolean
  relation: string
  age: string
  contact: string
  mobility: string
  walk?: number
  favoriteStops?: string[]
}
export interface Booking {
  id: string
  tripId: string
  personId?: string
  name: string
  seats: number
  from: string
  to: string
  status: 'confirmed' | 'cancelled'
  riderStatus: RiderStatus
  mine: boolean
  groupId?: string
  search?: SearchQuery
}
export interface RideRequest {
  id: string
  from: string
  to: string
  date: string
  time: string
  timeMode: TimeMode
  timePreference?: TimePreference
  passengers: number
  status: RequestStatus
  members: string[]
  personId?: string
  ownSeats: number
  memberSeats?: Record<string, number>
  left?: boolean
  returnDate?: string
  returnTime?: string
  returnTimeMode?: TimeMode
  returnTimePreference?: TimePreference
  accessibility: string
  fromPlace?: JourneyPlace
  toPlace?: JourneyPlace
  placesStatus?: 'pending' | 'approved'
  createdByMe?: boolean
  reason?: string
  tripId?: string
  returnTripId?: string
}
export interface RecurringRule {
  id: string
  from: string
  to: string
  time: string
  days: number[]
  start: string
  end: string
  personId: string
  status: 'active' | 'paused' | 'cancelled'
}
export interface StopProposal {
  id: string
  name: string
  village: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  rejectionReason?: string
}
export interface AppState {
  version: number
  serviceDate: string
  vehicles: Vehicle[]
  drivers: Driver[]
  activeDriverId: string
  trips: Trip[]
  bookings: Booking[]
  requests: RideRequest[]
  people: Person[]
  rules: RecurringRule[]
  stops: Stop[]
  proposals: StopProposal[]
}
export interface SearchQuery {
  fromPlace?: JourneyPlace
  toPlace?: JourneyPlace
  fromStopConfirmed?: boolean
  toStopConfirmed?: boolean
  personId: string
  seats: number
  timePreference: TimePreference
  returnTimeMode: TimeMode
  returnTimePreference: TimePreference
  from: string
  to: string
  date: string
  time: string
  timeMode: 'departure' | 'arrival'
  roundTrip: boolean
  returnDate: string
  returnTime: string
}
