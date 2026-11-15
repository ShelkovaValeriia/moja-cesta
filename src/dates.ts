import { validDate } from './regular'
export function parseDateText(text: string) {
  if (validDate(text)) return text
  const m = text.trim().match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/)
  if (!m) return ''
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return validDate(iso) ? iso : ''
}
