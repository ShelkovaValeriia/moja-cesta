import { useId, useRef, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { isTime24, normalizeTime } from '../time'
const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
export function TimePicker({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string
  value: string
  onChange: (time: string) => void
  required?: boolean
}) {
  const id = useId(),
    ref = useRef<HTMLDivElement>(null),
    [open, setOpen] = useState(false)
  const parts = normalizeTime(value)?.split(':') ?? ['00', '00']
  return (
    <div
      className="field time-picker"
      ref={ref}
      lang="sk-SK"
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="time-picker-input">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="HH:mm"
          pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
          maxLength={8}
          required={required}
          value={value}
          aria-invalid={value.length > 0 && !isTime24(value)}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            const formatted = normalizeTime(value)
            if (formatted && formatted !== value) onChange(formatted)
          }}
        />
        <button
          className="icon-button"
          type="button"
          aria-label={`${label}: vybrať čas`}
          aria-expanded={open}
          aria-controls={`${id}-picker`}
          onClick={() => setOpen(!open)}
        >
          <Clock3 size={20} />
        </button>
      </div>
      {open && (
        <div
          className="time-picker-options"
          id={`${id}-picker`}
          role="group"
          aria-label={`${label}: výber času`}
        >
          <label>
            <span>Hodiny</span>
            <select
              aria-label={`${label}: hodiny`}
              value={parts[0]}
              onChange={(e) => onChange(`${e.target.value}:${parts[1]}`)}
            >
              {hours.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </label>
          <b aria-hidden="true">:</b>
          <label>
            <span>Minúty</span>
            <select
              aria-label={`${label}: minúty`}
              value={parts[1]}
              onChange={(e) => onChange(`${parts[0]}:${e.target.value}`)}
            >
              {minutes.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <button type="button" className="text-link" onClick={() => setOpen(false)}>
            Hotovo
          </button>
        </div>
      )}
    </div>
  )
}
