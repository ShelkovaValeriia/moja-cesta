import { DispatcherModal as Modal } from '../components/DispatcherModal'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Phone, UserRoundX } from 'lucide-react'
import { useStore } from '../context'
import { uid } from '../data'
import { noShowOutcome } from '../domain'
import type { Booking } from '../types'
import { Notice, PageTitle } from '../components/ui'
import { PhoneRequestForm } from '../components/PhoneRequestForm'
import { formatPassengerCode, generatePassengerCode, usedPassengerCodes } from '../passengerCodes'

function PhoneRegistration({ onCreated }: { onCreated: (id: string) => void }) {
  const { state, act } = useStore()
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [mobility, setMobility] = useState('')
  return (
    <section className="card chart-card stack">
      <h2>Nový telefonický cestujúci</h2>
      <p className="muted">
        Demo evidencia v tomto prehliadači. Identifikátor pomôže nájsť cestujúceho pri ďalšom
        hovore.
      </p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          const id = `MC-${uid().slice(0, 8).toUpperCase()}`
          const passengerCode = generatePassengerCode(usedPassengerCodes(state))
          if (
            act(
              {
                type: 'registerPhonePerson',
                person: {
                  id,
                  passengerCode,
                  name: name.trim(),
                  relation: 'Telefonický cestujúci',
                  age: 'Dospelý',
                  contact: contact.trim(),
                  mobility: mobility.trim() || 'Bez obmedzení',
                },
              },
              `Cestujúci bol zapísaný. ID cestujúceho: ${formatPassengerCode(passengerCode)}`,
            )
          )
            onCreated(id)
        }}
      >
        <div className="form-grid">
          <label className="field">
            <span>Meno a priezvisko</span>
            <input
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Telefónne číslo</span>
            <input
              required
              type="tel"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Pomoc pri nastupovaní (voliteľné)</span>
            <input
              maxLength={100}
              value={mobility}
              onChange={(event) => setMobility(event.target.value)}
            />
          </label>
        </div>
        <button className="btn" type="submit">
          Zapísať cestujúceho a pokračovať na cestu
        </button>
      </form>
    </section>
  )
}

const reviewLabels = {
  confirmed: 'Neprítomnosť potvrdená',
  excused: 'Neprítomnosť ospravedlnená',
  corrected: 'Chybný záznam opravený',
}

export function DispatcherSupport() {
  const { state } = useStore()
  const [registering, setRegistering] = useState(false)
  const [newPersonId, setNewPersonId] = useState<string | null>(null)
  const pending =
    state.phoneRequests.filter((r) => r.status === 'pending').length +
    state.requests.filter((r) => r.channel === 'phone' && r.status === 'pending').length
  const noShows = state.bookings.filter(
    (b) => b.riderStatus === 'absent' && !noShowOutcome(b),
  ).length
  return (
    <>
      <PageTitle title="Podpora cestujúcich" />
      <div className="support-categories spaced">
        <Link
          className="card support-category"
          to="/dispatcher/support/phone"
          aria-label="Telefonické rezervácie"
        >
          <span className="icon-tile">
            <Phone size={22} />
          </span>
          <div>
            <h2>Telefonické rezervácie</h2>
            <p>Požiadavky, rezervácie a história telefonických ciest.</p>
            <span className="small muted">{pending} čaká na naplánovanie</span>
          </div>
          <ArrowRight size={20} />
        </Link>
        <Link
          className="card support-category"
          to="/dispatcher/support/no-shows"
          aria-label="Neprítomnosť cestujúcich"
        >
          <span className="icon-tile">
            <UserRoundX size={22} />
          </span>
          <div>
            <h2>Neprítomnosť cestujúcich</h2>
            <p>Posúdenie záznamov vodičov a prehľad vyriešených prípadov.</p>
            <span className="small muted">{noShows} čaká na posúdenie</span>
          </div>
          <ArrowRight size={20} />
        </Link>
      </div>
      <div className="dispatch-actions spaced">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => setRegistering((value) => !value)}
        >
          {registering ? 'Zavrieť formulár' : 'Pridať telefonického cestujúceho'}
        </button>
      </div>
      {registering && (
        <PhoneRegistration
          onCreated={(id) => {
            setNewPersonId(id)
            setRegistering(false)
          }}
        />
      )}
      <PhoneRequestForm key={newPersonId ?? 'intake'} selectedId={newPersonId} />
    </>
  )
}

export function NoShowModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { state, act } = useStore()
  const [outcome, setOutcome] = useState<keyof typeof reviewLabels>('confirmed')
  const [reason, setReason] = useState('')
  const completed = state.trips.find((t) => t.id === booking.tripId)?.status === 'completed'
  return (
    <Modal title="Posúdiť neprítomnosť" onClose={onClose} actionErrors>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (
            act(
              { type: 'reviewNoShow', id: booking.id, outcome, reason },
              'Posúdenie bolo uložené.',
            )
          )
            onClose()
        }}
      >
        <p>{booking.name}</p>
        <label className="field">
          <span>Výsledok posúdenia</span>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as keyof typeof reviewLabels)}
          >
            {Object.entries(reviewLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {outcome === 'corrected' && (
          <Notice>
            {completed
              ? 'Opravu použite po overení, že cestujúci absolvoval jazdu.'
              : 'Oprava vráti cestujúceho do zoznamu čakajúcich na nástup.'}
          </Notice>
        )}
        <label className="field">
          <span>Odôvodnenie posúdenia</span>
          <textarea
            required
            minLength={5}
            maxLength={300}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="btn">Uložiť posúdenie</button>
      </form>
    </Modal>
  )
}
