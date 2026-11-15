import { parseDateText } from '../dates'
import { useId, useState } from 'react'
import type { InputHTMLAttributes, ChangeEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { dateLabel, today } from '../data'
import { validDate } from '../regular'
import { TimePicker } from './TimePicker'
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & { value: string }
export function DateInput({ value, onChange, min, max, id, ...props }: Props) {
  const generated = useId(),
    [draft, setDraft] = useState<string | null>(null),
    [open, setOpen] = useState(false),
    [month, setMonth] = useState((validDate(value) ? value : today()).slice(0, 7)),
    [error, setError] = useState('')
  const inputId = id ?? generated
  const send = (iso: string, e?: ChangeEvent<HTMLInputElement>) =>
    onChange?.({
      ...e,
      target: { ...e?.target, value: iso },
      currentTarget: { ...e?.currentTarget, value: iso },
    } as ChangeEvent<HTMLInputElement>)
  const rangeError = (iso: string) =>
    iso && ((min && iso < String(min)) || (max && iso > String(max)))
      ? 'Dátum je mimo povoleného obdobia.'
      : ''
  function change(text: string, e: ChangeEvent<HTMLInputElement>) {
    setDraft(text)
    const iso = parseDateText(text)
    send(iso, e)
    const message = !iso && text ? 'Zadajte platný dátum vo formáte 19. 11. 2026.' : rangeError(iso)
    setError(message)
    e.target.setCustomValidity(message)
  }
  const start = new Date(`${month}-01T12:00:00Z`),
    offset = (start.getUTCDay() + 6) % 7,
    count = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
  const move = (n: number) => {
    const d = new Date(`${month}-01T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + n)
    setMonth(d.toISOString().slice(0, 7))
  }
  return (
    <span
      className="localized-date"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <span className="localized-date-row">
        <input
          {...props}
          id={inputId}
          type="text"
          inputMode="numeric"
          placeholder="19. 11. 2026"
          lang="sk-SK"
          value={draft ?? (validDate(value) ? dateLabel(value) : value)}
          aria-invalid={!!error || props['aria-invalid']}
          aria-describedby={error ? `${inputId}-error` : props['aria-describedby']}
          onChange={(e) => change(e.target.value, e)}
          onBlur={(e) => {
            if (parseDateText(e.target.value)) {
              setDraft(null)
            }
            props.onBlur?.(e)
          }}
        />
        <button
          type="button"
          disabled={props.disabled}
          className="icon-button"
          aria-label="Otvoriť kalendár"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open)
            if (validDate(value)) setMonth(value.slice(0, 7))
          }}
        >
          <CalendarDays size={18} />
        </button>
      </span>
      {error && (
        <small id={`${inputId}-error`} className="form-error">
          {error}
        </small>
      )}
      {open && (
        <span className="localized-calendar" role="dialog" aria-label="Slovenský kalendár">
          <span className="localized-calendar-heading">
            <button
              className="icon-button"
              type="button"
              aria-label="Predchádzajúci mesiac"
              onClick={() => move(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <strong>
              {start.toLocaleDateString('sk-SK', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </strong>
            <button
              className="icon-button"
              type="button"
              aria-label="Nasledujúci mesiac"
              onClick={() => move(1)}
            >
              <ChevronRight size={18} />
            </button>
          </span>
          <span className="localized-calendar-grid">
            {['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'].map((d) => (
              <span key={d}>{d}</span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`empty-${i}`} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const iso = `${month}-${String(i + 1).padStart(2, '0')}`
              return (
                <button
                  type="button"
                  key={iso}
                  disabled={!!rangeError(iso)}
                  aria-label={dateLabel(iso)}
                  aria-pressed={value === iso}
                  onClick={() => {
                    send(iso)
                    setDraft(null)
                    setError('')
                    setOpen(false)
                    const field = document.getElementById(inputId) as HTMLInputElement | null
                    field?.setCustomValidity('')
                    field?.focus()
                  }}
                >
                  {i + 1}
                </button>
              )
            })}
          </span>
          <button className="text-link" type="button" onClick={() => setOpen(false)}>
            Zavrieť kalendár
          </button>
        </span>
      )}
    </span>
  )
}
export function DateTimeInput({ value, onChange, ...props }: Props) {
  return (
    <span className="stack">
      <DateInput
        {...props}
        aria-label="Dátum demonštračnej kontroly"
        value={value.slice(0, 10)}
        onChange={(e) =>
          onChange?.({
            target: {
              value: e.target.value ? `${e.target.value}T${value.slice(11, 16) || '00:00'}` : '',
            },
          } as ChangeEvent<HTMLInputElement>)
        }
      />
      <TimePicker
        label="Čas demonštračnej kontroly"
        value={value.slice(11, 16) || '00:00'}
        onChange={(time) =>
          onChange?.({
            target: { value: `${value.slice(0, 10) || today()}T${time}` },
          } as ChangeEvent<HTMLInputElement>)
        }
      />
    </span>
  )
}
