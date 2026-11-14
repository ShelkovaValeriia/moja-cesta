import { useId, useRef, useState } from 'react'
import { MapPin, Map } from 'lucide-react'
import { useStore } from '../context'
import type { JourneyPlace } from '../types'
import { coordinates } from '../places'
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
export function StopAutocomplete({
  label,
  value,
  onChange,
  place,
  onMapPick,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  place?: JourneyPlace
  onMapPick?: (draft: string) => void
}) {
  const { state } = useStore()
  const id = useId(),
    container = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState(''),
    [focused, setFocused] = useState(false),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0)
  const selected =
    place?.type === 'custom' ? place.name : (state.stops.find((s) => s.id === value)?.name ?? '')
  const text = focused ? draft : selected
  const matches = state.stops.filter((s) => normalize(s.name).includes(normalize(text)))
  function choose(stopId: string) {
    onChange(stopId)
    setDraft(state.stops.find((s) => s.id === stopId)?.name ?? '')
    setOpen(false)
  }
  return (
    <div
      className="stop-autocomplete"
      ref={container}
      onBlur={(e) => {
        if (!container.current?.contains(e.relatedTarget as Node | null)) {
          setFocused(false)
          setOpen(false)
        }
      }}
    >
      <div className="place-label-row">
        <label htmlFor={id}>{label}</label>
        {onMapPick && (
          <button
            className="text-link place-map-button"
            type="button"
            aria-label={`${label}: Vybrať na mape`}
            onClick={() => {
              setOpen(false)
              onMapPick(
                focused && !value
                  ? draft
                  : place?.type === 'custom' && place.name !== 'Vybrané miesto na mape'
                    ? place.name
                    : '',
              )
            }}
          >
            <Map size={15} />
            Vybrať na mape
          </button>
        )}
      </div>
      <div className="autocomplete-input">
        <MapPin size={19} />
        <input
          id={id}
          role="combobox"
          autoComplete="off"
          required
          value={text}
          placeholder="Obec alebo zastávka"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined}
          onFocus={() => {
            setDraft(selected)
            setFocused(true)
            setOpen(true)
            setActive(0)
          }}
          onChange={(e) => {
            setDraft(e.target.value)
            setOpen(true)
            setActive(0)
            onChange(
              state.stops.find((s) => normalize(s.name) === normalize(e.target.value.trim()))?.id ??
                '',
            )
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              return
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setOpen(true)
              setActive((i) =>
                Math.max(0, Math.min(matches.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))),
              )
            }
            if (e.key === 'Enter' && open && matches[active]) {
              e.preventDefault()
              choose(matches[active].id)
            }
          }}
        />
      </div>
      {place?.type === 'custom' && (
        <small className="place-coordinate-caption">{coordinates(place)} · Vlastný bod</small>
      )}
      {open && (
        <div
          className="stop-options"
          id={`${id}-options`}
          role="listbox"
          aria-label={`${label}: zastávky`}
        >
          {matches.length ? (
            matches.map((s, i) => (
              <button
                key={s.id}
                id={`${id}-option-${i}`}
                type="button"
                role="option"
                aria-selected={value === s.id}
                className={i === active ? 'highlighted' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s.id)}
              >
                <MapPin size={16} />
                {s.name}
              </button>
            ))
          ) : (
            <div className="unknown-place">
              <p>Žiadna zastávka sa nenašla. Zadanú adresu môžete označiť na mape.</p>
              {onMapPick && (
                <button
                  type="button"
                  className="text-link"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setOpen(false)
                    onMapPick(draft)
                  }}
                >
                  Vybrať zadané miesto na mape
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
