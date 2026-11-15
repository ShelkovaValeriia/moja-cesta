/** ISO remains the storage/API format; only Slovak dates and 24-hour times reach the UI. */
export function formatSlovakDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return match ? `${Number(match[3])}. ${Number(match[2])}. ${match[1]}` : ''
}
export function parseSlovakDate(text: string): string | null {
  if (!text.trim()) return ''
  const match = /^\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*$/.exec(text)
  const iso = match
    ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
    : text.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const date = new Date(`${iso}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null
}
