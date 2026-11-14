import type { Person } from './types'
export const isChild = (person: Pick<Person, 'age'>) => person.age.startsWith('Dieťa')
export function validContact(value: string) {
  const text = value.trim()
  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text) ||
    (/^\+?[\d\s().-]+$/.test(text) &&
      text.replace(/\D/g, '').length >= 7 &&
      text.replace(/\D/g, '').length <= 15)
  )
}
export function personError(person: Person): string | null {
  if (person.name.trim().length < 2) return 'Zadajte meno a priezvisko cestujúceho.'
  if (isChild(person) && !person.contact.trim())
    return 'Pre dieťa vyplňte kontakt na rodiča alebo zákonného zástupcu.'
  if (person.contact.trim() && !validContact(person.contact))
    return 'Zadajte platný telefón (7 až 15 číslic) alebo e-mail.'
  return null
}
