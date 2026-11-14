import { useState } from 'react'
import {
  Crown,
  Check,
  HeartHandshake,
  MapPin,
  Pencil,
  Plus,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useStore } from '../context'
import { uid } from '../data'
import { isChild, personError, validContact } from '../people'
import type { Person } from '../types'
import { Modal, Notice, PageTitle } from '../components/ui'
import { StopProposalModal } from './Dispatcher'
export function FamilyPage() {
  const { state, act } = useStore(),
    [editing, setEditing] = useState<Person | null>(null),
    [proposal, setProposal] = useState(false),
    [error, setError] = useState('')
  const add = () =>
    setEditing({
      id: uid(),
      name: '',
      relation: 'Rodina',
      age: 'Dospelý',
      contact: '',
      mobility: 'Bez obmedzení',
    })
  function set<K extends keyof Person>(key: K, value: Person[K]) {
    setEditing((p) => (p ? { ...p, [key]: value } : null))
    setError('')
  }
  return (
    <>
      <PageTitle
        eyebrow="CESTUJEME SPOLU"
        title="Profil a rodina"
        description="Rezervujte cestu pre seba aj pre svojich blízkych."
        action={
          <button className="btn" onClick={add}>
            <Plus size={18} /> Pridať človeka
          </button>
        }
      />
      <div className="family-grid">
        {state.people.map((p, i) => (
          <article key={p.id} className="card person-card">
            <div className="section-heading">
              <span
                className={`person-avatar person-${i % 3} ${p.isAccountOwner ? 'account-owner-avatar' : ''}`}
              >
                {p.name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')}
                {p.isAccountOwner && (
                  <span className="account-owner-crown" aria-label="Správca účtu">
                    <Crown size={13} />
                  </span>
                )}
              </span>
              <button
                className="icon-button"
                aria-label={`Upraviť profil ${p.name}`}
                onClick={() => {
                  setEditing({ ...p })
                  setError('')
                }}
              >
                <Pencil size={18} />
              </button>
            </div>
            <div className="person-relation">
              <span className="relation-label">{p.relation}</span>
              {p.isAccountOwner && <span className="account-owner-label">Správca účtu</span>}
            </div>
            <h2>{p.name}</h2>
            <p className="muted">{p.age}</p>
            <div className="person-details">
              <p>
                <HeartHandshake size={17} />
                {p.mobility}
              </p>
            </div>
            <button
              className="btn btn-secondary btn-wide"
              onClick={() => {
                setEditing({ ...p })
                setError('')
              }}
            >
              Upraviť profil <Pencil size={15} />
            </button>
          </article>
        ))}
      </div>
      <div className="card family-note">
        <span className="icon-tile">
          <UsersRound />
        </span>
        <div>
          <h3>Jeden profil, celá rodina.</h3>
          <p>
            Pri každej rezervácii vyberiete, kto bude cestovať. Vodič vidí len meno a údaje potrebné
            pre jazdu.
          </p>
        </div>
      </div>
      <div className="mb-5">
        <button className="text-link" onClick={() => setProposal(true)}>
          <MapPin size={16} /> Chýba vám zastávka? Navrhnite novú.
        </button>
      </div>
      {proposal && <StopProposalModal onClose={() => setProposal(false)} />}
      <Notice>
        Ide o vymyslené demonštračné profily uložené v tomto prehliadači. Nie sú potrebné doklady
        ani registrácia.
      </Notice>
      {editing && (
        <Modal
          title={
            state.people.some((p) => p.id === editing.id)
              ? 'Upraviť profil'
              : 'Pridať človeka do rodiny'
          }
          onClose={() => setEditing(null)}
        >
          <form
            noValidate
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              const validation = personError(editing)
              if (validation) {
                setError(validation)
                return
              }
              if (act({ type: 'savePerson', person: editing }, 'Profil cestujúceho bol uložený.'))
                setEditing(null)
            }}
          >
            <div className="form-grid">
              <label className="field">
                <span>Meno a priezvisko</span>
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={editing.name}
                  onChange={(e) => set('name', e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>Vzťah</span>
                <select value={editing.relation} onChange={(e) => set('relation', e.target.value)}>
                  {['Ja', 'Dcéra', 'Syn', 'Mama', 'Otec', 'Rodina', 'Blízky človek'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Veková kategória</span>
                <select value={editing.age} onChange={(e) => set('age', e.target.value)}>
                  {['Dieťa (do 6 rokov)', 'Dieťa (6–15 rokov)', 'Dospelý', 'Senior (65+)'].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                <span>
                  {isChild(editing) ? (
                    'Kontakt na rodiča alebo zákonného zástupcu'
                  ) : (
                    <>
                      Kontakt pre upozornenia <small>nepovinné</small>
                    </>
                  )}
                </span>
                <input
                  required={isChild(editing)}
                  maxLength={100}
                  value={editing.contact}
                  onChange={(e) => set('contact', e.target.value)}
                  placeholder="Telefón alebo e-mail"
                  aria-invalid={
                    !!error &&
                    ((isChild(editing) && !editing.contact.trim()) ||
                      (!!editing.contact.trim() && !validContact(editing.contact)))
                  }
                />
              </label>
              <label className="field">
                <span>Mobilita</span>
                <select value={editing.mobility} onChange={(e) => set('mobility', e.target.value)}>
                  {[
                    'Bez obmedzení',
                    'Pomoc pri nastupovaní',
                    'Chodítko alebo palica',
                    'Miesto na skladací vozík',
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            {isChild(editing) &&
              !editing.contact &&
              state.people.find((p) => p.isAccountOwner)?.contact && (
                <button
                  className="text-link"
                  type="button"
                  onClick={() =>
                    set('contact', state.people.find((p) => p.isAccountOwner)!.contact)
                  }
                >
                  Použiť môj kontakt
                </button>
              )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Notice>
              {isChild(editing)
                ? 'Pri dieťati je kontakt na zodpovedného dospelého povinný.'
                : 'Pri dospelom je kontakt voliteľný.'}{' '}
              V demo verzii sa upozornenia neodosielajú.
            </Notice>
            <button className="btn" type="submit">
              <Check size={18} /> Uložiť profil
            </button>
          </form>
        </Modal>
      )}
    </>
  )
}
export function DriverProfile() {
  const { state } = useStore(),
    driver = state.drivers.find((d) => d.id === state.activeDriverId)
  return (
    <>
      <PageTitle
        eyebrow="VODIČ"
        title="Môj profil"
        description="Demonštračný profil vodiča Moja Cesta."
      />
      <div className="card driver-profile">
        <span className="person-avatar">
          <UserRound size={34} />
        </span>
        <h2>{driver?.name ?? 'Vodič nie je vybraný'}</h2>
        <p className="muted">Vodič mikrobusu · Zamagurie</p>
        <div className="driver-profile-facts">
          <div>
            <strong>Skupiny vodičského oprávnenia</strong>
            <div className="license-categories">
              {driver?.licenseCategories.length ? (
                driver.licenseCategories.map((c) => (
                  <span className="badge confirmed" key={c}>
                    {c}
                  </span>
                ))
              ) : (
                <span>Nie sú uvedené</span>
              )}
            </div>
          </div>
          <p>
            <strong>Priradenie k jazdám</strong>Vodič a vozidlo sa priraďujú samostatne ku každej
            jazde.
          </p>
        </div>
        <Notice>
          Uvedené skupiny oprávnenia sú demonštračné údaje. Kompatibilita sa overuje podľa
          požiadavky konkrétneho vozidla.
        </Notice>
      </div>
    </>
  )
}
