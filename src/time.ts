/** Persisted times use HH:mm; only this boundary accepts legacy 12-hour values. */
export function normalizeTime(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{1,2})(?:\s*(AM|PM))?$/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2]),
    period = match[3]?.toUpperCase()
  if (minute > 59 || hour > (period ? 12 : 23) || (period && hour < 1)) return null
  if (period) hour = (hour % 12) + (period === 'PM' ? 12 : 0)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
export const isTime24 = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const formatter = new Intl.DateTimeFormat('sk-SK', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
})
export function formatTime(value: string) {
  const normalized = normalizeTime(value)
  if (!normalized) return '—'
  return formatter.format(
    new Date(Date.UTC(2000, 0, 1, Number(normalized.slice(0, 2)), Number(normalized.slice(3)))),
  )
}
