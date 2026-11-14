import { TimePicker } from '../components/TimePicker'
import { useState } from 'react'
import { CalendarCheck2, Check, Pause, Play, Plus, X } from 'lucide-react'
import { useStore } from '../context'
import { addDays, dateLabel, uid } from '../data'
import { villageName } from '../domain'
import { Badge, Empty, Modal, Notice, PageTitle, PersonSelect, StopSelect } from '../components/ui'
const days = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne']
export function RecurringPage() {
  const { state, act } = useStore(),
    [show, setShow] = useState(false),
    [from, setFrom] = useState('mat'),
    [to, setTo] = useState('school'),
    [time, setTime] = useState('07:15'),
    [person, setPerson] = useState('daughter'),
    [selected, setSelected] = useState([1, 2, 3, 4, 5]),
    [start, setStart] = useState(state.serviceDate),
    [end, setEnd] = useState(addDays(state.serviceDate, 30))
  const rules = state.rules.filter((r) => r.status !== 'cancelled')
  return (
    <>
      <PageTitle
        eyebrow="KAŽDÝ TÝŽDEŇ JEDNODUCHŠIE"
        title="Pravidelné rezervácie"
        description="Uložte si svoje opakované cesty do školy či do práce."
        back="/passenger/journeys"
        action={
          <button className="btn" onClick={() => setShow(true)}>
            <Plus size={18} /> Nové pravidlo
          </button>
        }
      />
      <Notice>
        Ukážkové pravidlá sa ukladajú v prehliadači. Zatiaľ automaticky nevytvárajú rezervácie ani
        neblokujú miesta v konkrétnych spojoch.
      </Notice>
      <div className="stack spaced">
        {rules.length ? (
          rules.map((r) => (
            <article className="card rule-card" key={r.id}>
              <span className="icon-tile">
                <CalendarCheck2 />
              </span>
              <div>
                <div className="journey-heading">
                  <h3>
                    {villageName(state, r.from)} → {villageName(state, r.to)}
                  </h3>
                  <Badge status={r.status === 'active' ? 'confirmed' : 'paused'}>
                    {r.status === 'active' ? 'Aktívne pravidlo' : 'Pozastavené'}
                  </Badge>
                </div>
                <p>
                  {r.time} · {state.people.find((p) => p.id === r.personId)?.name}
                </p>
                <div className="weekday-pills">
                  {days.map((d, i) => (
                    <span key={d} className={r.days.includes(i + 1) ? 'chosen' : ''}>
                      {d}
                    </span>
                  ))}
                </div>
                <small className="muted">
                  {dateLabel(r.start)} – {dateLabel(r.end)}
                </small>
              </div>
              <div className="rule-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    act(
                      {
                        type: 'ruleStatus',
                        id: r.id,
                        status: r.status === 'active' ? 'paused' : 'active',
                      },
                      r.status === 'active'
                        ? 'Pravidlo bolo pozastavené.'
                        : 'Pravidlo je opäť aktívne.',
                    )
                  }
                >
                  {r.status === 'active' ? <Pause size={16} /> : <Play size={16} />}{' '}
                  {r.status === 'active' ? 'Pozastaviť' : 'Obnoviť'}
                </button>
                <button
                  className="text-link danger-text"
                  onClick={() =>
                    act(
                      { type: 'ruleStatus', id: r.id, status: 'cancelled' },
                      'Pravidlo bolo zrušené.',
                    )
                  }
                >
                  <X size={15} /> Zrušiť pravidlo
                </button>
              </div>
            </article>
          ))
        ) : (
          <Empty
            title="Pravidelné cesty máte vo vlastných rukách"
            text="Pridajte prvé pravidlo a zjednodušte si plánovanie."
          />
        )}
      </div>
      {show && (
        <Modal title="Nové pravidlo rezervácie" onClose={() => setShow(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              if (
                act(
                  {
                    type: 'addRule',
                    rule: {
                      id: uid(),
                      from,
                      to,
                      time,
                      personId: person,
                      days: selected,
                      start,
                      end,
                      status: 'active',
                    },
                  },
                  'Pravidlo bolo uložené. Automatické rezervácie sú zatiaľ simulované.',
                )
              )
                setShow(false)
            }}
          >
            <div className="form-grid">
              <StopSelect label="Odkiaľ" value={from} onChange={setFrom} />
              <StopSelect label="Kam" value={to} onChange={setTo} />
              <TimePicker label="Čas odchodu" value={time} onChange={(value) => setTime(value)} />
              <PersonSelect value={person} onChange={setPerson} />
            </div>
            <fieldset>
              <legend>Dni v týždni</legend>
              <div className="weekday-buttons">
                {days.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={selected.includes(i + 1)}
                    className={selected.includes(i + 1) ? 'chosen' : ''}
                    onClick={() =>
                      setSelected(
                        selected.includes(i + 1)
                          ? selected.filter((x) => x !== i + 1)
                          : [...selected, i + 1],
                      )
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="form-grid">
              <label className="field">
                <span>Platnosť od</span>
                <input
                  type="date"
                  min={state.serviceDate}
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Platnosť do</span>
                <input
                  type="date"
                  min={start}
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
            <button type="submit" className="btn">
              <Check size={17} /> Vytvoriť pravidlo
            </button>
          </form>
        </Modal>
      )}
    </>
  )
}
