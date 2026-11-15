export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type TimeMode = 'departure' | 'arrival'
export type TimePreference = 'none' | 'earlier' | 'later'
export const LICENSE_CATEGORIES = ['B', 'D1', 'D'] as const
export type LicenseCategory = (typeof LICENSE_CATEGORIES)[number]
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
  navigation?: {
    stopIndex: number
    phase: 'moving' | 'stopped'
    processedStops: number[]
    startedAt?: string
    endedAt?: string
  }
  id: string
  line: string
  kind: 'fixed' | 'flex'
  date: string
  vehicleId: string
  driverId: string | null
  stops: { stopId: string; time: string; place?: JourneyPlace }[]
  status: 'scheduled' | 'active' | 'completed'
  requestIds: string[]
  excludedDates?: string[]
}
export interface Person {
  passengerCode?: string
  id: string
  name: string
  isAccountOwner?: boolean
  phoneManaged?: boolean
  relation: string
  age: string
  contact: string
  mobility: string
  walk?: number
  favoriteStops?: string[]
}
export interface Booking {
  passengerId?: string
  riderCorrections?: {
    from: RiderStatus
    to: RiderStatus
    stopIndex: number
    driverId: string
    at: string
  }[]
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
  channel?: 'phone'
  assistance?: string
  ruleId?: string
  occurrenceDate?: string
  noShow?: {
    recordedAt?: string
    status: 'reported' | 'confirmed' | 'corrected' | 'excused'
    reason?: string
    history: { action: string; reason: string }[]
    driverId: string | null
  }
  noShowReview?: {
    outcome: 'confirmed' | 'excused' | 'corrected'
    reason: string
    reviewedAt: string
  }
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
  channel?: 'phone'
  fromPlace?: JourneyPlace
  toPlace?: JourneyPlace
  placesStatus?: 'pending' | 'approved'
  createdByMe?: boolean
  reason?: string
  tripId?: string
  returnTripId?: string
}
/** Address intake awaiting geocoding, safe pickup selection and journey planning. */
export interface PhoneJourneyRequest {
  id: string
  personId: string
  fromAddress: string
  toAddress: string
  date: string
  time: string
  timeMode: TimeMode
  seats: number
  assistance: string
  returnJourney?: { date: string; time: string; timeMode: TimeMode }
  status: 'pending' | 'cancelled'
  createdAt: string
}
export interface RecurringRule {
  planStatus?: 'submitted' | 'partial' | 'confirmed' | 'attention'
  submittedAt?: string
  id: string
  from: string
  to: string
  time: string
  days: number[]
  start: string
  end: string
  personId: string
  status: 'active' | 'paused' | 'cancelled'
  purpose?: 'school' | 'work' | 'other'
  dayPlans?: WeeklyDayPlan[]
  exceptions?: ScheduleException[]
  revision?: number
  automaticBookingPause?: { until: string; reason: string }
}
export interface RegularLeg {
  from: string
  to: string
  time: string
  timeMode: TimeMode
  timePreference: TimePreference
  fromPlace?: JourneyPlace
  toPlace?: JourneyPlace
  fromStopConfirmed?: boolean
  toStopConfirmed?: boolean
}
export interface WeeklyDayPlan {
  services?: { out?: string; back?: string }
  weekday: number
  outbound: RegularLeg
  returning?: RegularLeg
}
export interface ScheduleException {
  date: string
  type: 'skip' | 'replace'
  plan?: WeeklyDayPlan
}
export interface WeeklySchedule {
  id: string
  personId: string
  start: string
  end: string
  purpose: 'school' | 'work' | 'other'
  dayPlans: WeeklyDayPlan[]
  exceptions: ScheduleException[]
}
export interface OccurrenceSelection {
  date: string
  outboundTripId: string
  returnTripId?: string
}
export interface StopProposal {
  id: string
  name: string
  village: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  rejectionReason?: string
  assessment?: { walking: string; boarding: string; vehicleSafety: string }
}
export interface AppState {
  submissionManagement?: Record<
    string,
    {
      removed?: boolean
      rejectedReason?: string
      history: { operation: 'edit' | 'decline' | 'remove'; at: string; reason: string }[]
    }
  >
  externalPassengers?: { id: string; passengerCode: string }[]
  regularTasks?: import('./regularPlanning').RegularTask[]
  regularCheckedAt?: string
  version: number
  serviceDate: string
  vehicles: Vehicle[]
  drivers: Driver[]
  activeDriverId: string
  trips: Trip[]
  bookings: Booking[]
  requests: RideRequest[]
  phoneRequests: PhoneJourneyRequest[]
  phonePeople: Person[]
  people: Person[]
  rules: RecurringRule[]
  stops: Stop[]
  proposals: StopProposal[]
  notifications?: { id: string; bookingId: string; text: string }[]
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
