import type { AppState, Booking, Person } from './types'
export const validPassengerCode = (code: unknown): code is string =>
  typeof code === 'string' && /^\d{6}$/.test(code)
export const formatPassengerCode = (code?: string) =>
  validPassengerCode(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : 'ID nie je dostupné'
export function generatePassengerCode(
  used: Iterable<string>,
  random = () => {
    const bytes = new Uint32Array(1)
    crypto.getRandomValues(bytes)
    return bytes[0] % 1000000
  },
) {
  const taken = new Set(used)
  if (taken.size >= 1000000) throw new Error('Nie je dostupné voľné identifikačné číslo.')
  // Retry collisions; a bounded random phase plus exhaustive scan guarantees termination even with a broken RNG.
  for (let i = 0; i < 100; i++) {
    const code = String(Math.abs(Math.trunc(random())) % 1000000).padStart(6, '0')
    if (!taken.has(code)) return code
  }
  for (let i = 0; i < 1000000; i++) {
    const code = String(i).padStart(6, '0')
    if (!taken.has(code)) return code
  }
  throw new Error('Nie je dostupné voľné identifikačné číslo.')
}
export function usedPassengerCodes(s: AppState) {
  return [
    ...s.people.map((p) => p.passengerCode ?? ''),
    ...(s.externalPassengers ?? []).map((p) => p.passengerCode),
  ].filter(validPassengerCode)
}
export function passengerCodeError(s: AppState, p: Person) {
  const current = s.people.find((x) => x.id === p.id)
  if (!validPassengerCode(p.passengerCode)) return 'Zadajte šesťmiestne identifikačné číslo.'
  if (current?.passengerCode && current.passengerCode !== p.passengerCode)
    return 'Identifikačné číslo existujúceho cestujúceho je nemenné.'
  if (
    s.people.some((x) => x.id !== p.id && x.passengerCode === p.passengerCode) ||
    s.externalPassengers?.some((x) => x.id !== p.id && x.passengerCode === p.passengerCode)
  )
    return 'Toto identifikačné číslo sa už používa.'
  return null
}
/** Existing personId is the legacy internal passenger ID, never a display code. Unknown legacy riders are not merged by name. */
export function ensurePassengerIdentity(s: AppState): AppState {
  const reserved = new Set(usedPassengerCodes(s)),
    seen = new Set<string>()
  s.people = s.people.map((p) => {
    let code = p.passengerCode
    if (!validPassengerCode(code) || seen.has(code)) {
      code = generatePassengerCode(reserved)
      reserved.add(code)
    }
    seen.add(code)
    return { ...p, passengerCode: code }
  })
  s.externalPassengers = (s.externalPassengers ?? [])
    .filter((p) => !s.people.some((x) => x.id === p.id))
    .map((p) => {
      let code = p.passengerCode
      if (!validPassengerCode(code) || seen.has(code)) {
        code = generatePassengerCode(reserved)
        reserved.add(code)
      }
      seen.add(code)
      return { ...p, passengerCode: code }
    })
  for (const booking of s.bookings) {
    const id = booking.personId ?? booking.passengerId ?? `legacy-passenger:${booking.id}`
    booking.passengerId = id
    if (s.people.some((p) => p.id === id)) booking.personId = id
    if (!s.people.some((p) => p.id === id) && !s.externalPassengers.some((p) => p.id === id)) {
      const code = generatePassengerCode(reserved)
      reserved.add(code)
      s.externalPassengers.push({ id, passengerCode: code })
    }
  }
  return s
}
export function bookingPassengerCode(s: AppState, b: Booking) {
  const id = b.passengerId ?? b.personId
  return (
    s.people.find((p) => p.id === id)?.passengerCode ??
    s.externalPassengers?.find((p) => p.id === id)?.passengerCode
  )
}
