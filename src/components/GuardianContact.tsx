import { useState } from 'react'
import { useStore } from '../context'
import { isChild, validPhone } from '../people'
export function GuardianContact({ personId }: { personId: string }) {
  const { state, act } = useStore(),
    [phone, setPhone] = useState(''),
    [error, setError] = useState('')
  const person = state.people.find((p) => p.id === personId),
    owner = state.people.find((p) => p.isAccountOwner)
  if (!person || !isChild(person) || validPhone(person.contact)) return null
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (!validPhone(phone)) {
          setError('Zadajte platný telefón zodpovedného dospelého (7 až 15 číslic).')
          return
        }
        act(
          { type: 'savePerson', person: { ...person, contact: phone } },
          'Kontakt bol uložený do rodinného profilu. Rozvrh zostáva zachovaný.',
        )
      }}
    >
      <h2>Doplniť kontakt</h2>
      <p>Pred novým rezervovaním pre dieťa doplňte telefón rodiča alebo zákonného zástupcu.</p>
      <label className="field">
        <span>Kontakt na rodiča alebo zákonného zástupcu</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={!!error}
        />
        {error && <small role="alert">{error}</small>}
      </label>
      {owner && validPhone(owner.contact) && (
        <button type="button" className="text-link" onClick={() => setPhone(owner.contact)}>
          Použiť môj kontakt
        </button>
      )}
      <button className="btn">Uložiť kontakt do profilu</button>
    </form>
  )
}
