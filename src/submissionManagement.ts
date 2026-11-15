import type { Action } from './domain'
import { requestParticipants, validateRequestDetails } from './domain'
import { hasCustomPlaces } from './places'
import { applyRegularAction, validDate } from './regular'
import { isTime24 } from './time'
import { isChild, personError } from './people'
import type { AppState, PhoneJourneyRequest, RideRequest, WeeklySchedule } from './types'

export type SubmissionDraft =
  | { kind: 'ride'; value: RideRequest }
  | { kind: 'phone'; value: PhoneJourneyRequest }
  | { kind: 'regular'; value: WeeklySchedule }
export type SubmissionAction =
  | { type: 'editSubmission'; draft: SubmissionDraft; reason: string; acknowledgeRelease: boolean }
  | {
      type: 'declineSubmission' | 'removeSubmission'
      key: string
      reason: string
      acknowledgeRelease: boolean
    }

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

/** Dispatcher corrections release seats, never alter the published service or other groups. */
export function manageSubmission(
  state: AppState,
  action: SubmissionAction,
  run: (state: AppState, action: Action) => AppState,
) {
  let s = state
  const key =
    action.type === 'editSubmission' ? `${action.draft.kind}:${action.draft.value.id}` : action.key
  const separator = key.indexOf(':')
  const kind = key.slice(0, separator),
    id = key.slice(separator + 1)
  const old =
    kind === 'ride'
      ? s.requests.find((r) => r.id === id)
      : kind === 'phone'
        ? s.phoneRequests.find((r) => r.id === id)
        : kind === 'regular'
          ? s.rules.find((r) => r.id === id)
          : undefined
  assert(old && !s.submissionManagement?.[key]?.removed, 'Požiadavka sa nenašla.')
  const reason = action.reason.trim()
  assert(reason.length >= 5 && reason.length <= 500, 'Uveďte dôvod zmeny (5 až 500 znakov).')

  // Old demo groups had a dedicated Flex trip but no booking groupId. Link only unambiguous groups.
  if (kind === 'ride') {
    const ride = s.requests.find((r) => r.id === id)!
    for (const tripId of [ride.tripId, ride.returnTripId].filter(Boolean)) {
      if (s.bookings.some((b) => b.tripId === tripId && b.groupId === id)) continue
      const trip = s.trips.find((t) => t.id === tripId)
      const bookings = s.bookings.filter((b) => b.tripId === tripId && b.status === 'confirmed')
      assert(
        trip?.kind === 'flex' &&
          trip.requestIds.length === 1 &&
          trip.requestIds[0] === id &&
          bookings.length > 0 &&
          bookings.every((b) => !b.groupId) &&
          bookings.reduce((sum, b) => sum + b.seats, 0) === ride.passengers,
        'Chýba jednoznačné prepojenie rezervácií. Najprv skontrolujte pridelenú jazdu.',
      )
      bookings.forEach((b) => {
        b.groupId = id
      })
    }
  }

  const linked = s.bookings.filter((b) =>
    kind === 'ride' ? b.groupId === id : kind === 'regular' ? b.ruleId === id : false,
  )
  const active = linked.filter((b) => b.status === 'confirmed')
  const affected = active.filter(
    (b) =>
      kind === 'ride' ||
      (s.trips.find((t) => t.id === b.tripId)?.date ?? s.serviceDate) >= s.serviceDate,
  )
  const journeys = new Set(affected.flatMap((b) => (b.groupId ? [b.groupId] : [])))
  const coordinated = s.bookings.filter(
    (b) =>
      b.status === 'confirmed' &&
      (affected.some((a) => a.id === b.id) || (b.groupId && journeys.has(b.groupId))),
  )
  assert(
    coordinated.every((b) => linked.some((item) => item.id === b.id)),
    'Rezervácia patrí aj k inej požiadavke. Najprv skontrolujte prepojené podania.',
  )
  assert(
    coordinated.every((b) => {
      const trip = s.trips.find((t) => t.id === b.tripId)
      return (
        trip?.status === 'scheduled' && trip.date >= s.serviceDate && b.riderStatus === 'expected'
      )
    }),
    'Začatú alebo uskutočnenú cestu nemožno meniť. Zachovajte aj zabezpečený návrat.',
  )
  if (kind === 'ride') {
    const ride = s.requests.find((r) => r.id === id)!
    assert(
      !ride.tripId || linked.length > 0,
      'Chýba overiteľné prepojenie rezervácií. Najprv skontrolujte pridelenú jazdu.',
    )
  }
  assert(
    !affected.length || action.acknowledgeRelease,
    'Potvrďte uvoľnenie všetkých dotknutých budúcich rezervácií vrátane návratu.',
  )

  if (action.type === 'editSubmission') {
    const draft = action.draft
    if (draft.kind === 'phone') {
      const previous = s.phoneRequests.find((r) => r.id === id)!
      s.phoneRequests = s.phoneRequests.filter((r) => r.id !== id)
      s = run(s, { type: 'createPhoneRequest', request: { ...draft.value, id } })
      s.phoneRequests.find((r) => r.id === id)!.createdAt = previous.createdAt
    } else if (draft.kind === 'ride') {
      const previous = s.requests.find((r) => r.id === id)!
      const r = { ...previous, ...draft.value, id, channel: previous.channel }
      assert(r.accessibility.length <= 300, 'Pokyny k pomoci môžu mať najviac 300 znakov.')
      assert(
        validDate(r.date) && (!r.returnDate || validDate(r.returnDate)),
        'Zadajte platný kalendárny dátum.',
      )
      assert(
        ['departure', 'arrival'].includes(r.timeMode) &&
          (!r.returnDate || ['departure', 'arrival'].includes(r.returnTimeMode ?? 'departure')) &&
          isTime24(r.time),
        'Skontrolujte časové kritériá.',
      )
      const participants = requestParticipants(r)
      const people = [...s.people, ...s.phonePeople]
      for (const [personId, seats] of Object.entries(participants)) {
        const person = people.find((p) => p.id === personId)
        assert(
          person && Number.isInteger(seats) && seats > 0,
          'Skontrolujte cestujúcich a počty miest.',
        )
        assert(
          !isChild(person) || !personError(person),
          'Doplňte kontakt na zodpovedného dospelého.',
        )
      }
      assert(
        Object.values(participants).reduce((sum, seats) => sum + seats, 0) <= r.passengers,
        'Celkový počet miest nemôže byť menší než počet miest uvedených cestujúcich.',
      )
      validateRequestDetails(s, r)
      s.requests[s.requests.findIndex((item) => item.id === id)] = {
        ...r,
        status: 'pending',
        placesStatus: hasCustomPlaces(r) ? 'pending' : undefined,
        members: Object.keys(participants),
        memberSeats: participants,
        personId: Object.keys(participants)[0],
        ownSeats: Object.values(participants).reduce((a, b) => a + b, 0),
        createdByMe: previous.createdByMe,
        tripId: undefined,
        returnTripId: undefined,
        reason: undefined,
        left: false,
      }
    } else {
      const previous = s.rules.find((r) => r.id === id)!
      // An explicit correction reopens a declined/cancelled plan, without confirming any seats.
      if (previous.status === 'cancelled') previous.status = 'active'
      s = applyRegularAction(s, {
        type: 'saveWeeklySchedule',
        schedule: draft.value,
        reservations: [],
        acceptPartial: false,
        acknowledgeRelease: action.acknowledgeRelease,
      })
      s.rules.find((r) => r.id === id)!.planStatus = 'submitted'
      s.regularTasks = s.regularTasks?.filter((t) => t.ruleId !== id)
    }
  } else if (kind === 'ride') {
    const r = s.requests.find((r) => r.id === id)!
    r.status = action.type === 'declineSubmission' ? 'rejected' : 'cancelled'
    r.reason = reason
  } else if (kind === 'phone') {
    s.phoneRequests.find((r) => r.id === id)!.status = 'cancelled'
  } else {
    s.rules.find((r) => r.id === id)!.status = 'cancelled'
    s.regularTasks = s.regularTasks?.filter((t) => t.ruleId !== id)
  }
  // Find bookings again because validation may return a cloned state.
  const released = new Set(affected.map((b) => b.id))
  s.bookings
    .filter((b) => released.has(b.id))
    .forEach((b) => {
      b.status = 'cancelled'
      ;(s.notifications ??= []).unshift({
        id: `submission:${key}:${b.id}:${Date.now()}`,
        bookingId: b.id,
        text: `Rezervácia bola zrušená pri spracovaní požiadavky. Dôvod: ${reason}. Zmenená požiadavka vyžaduje nové potvrdenie oboch smerov.`,
      })
    })
  const metadata = (s.submissionManagement ??= {})
  metadata[key] = {
    removed: action.type === 'removeSubmission',
    rejectedReason: action.type === 'declineSubmission' ? reason : undefined,
    history: [
      ...(metadata[key]?.history ?? []),
      {
        operation:
          action.type === 'editSubmission'
            ? 'edit'
            : action.type === 'declineSubmission'
              ? 'decline'
              : 'remove',
        at: new Date().toISOString(),
        reason,
      },
    ],
  }
  return s
}
