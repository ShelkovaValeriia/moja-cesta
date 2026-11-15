import { useEffect, useRef, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { formatSlovakDate, parseSlovakDate } from './locale'

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'onInput'
> & {
  value: string
  onValueChange: (iso: string) => void
}
/** A native date field follows the browser's locale, even when lang="sk". */
export function SlovakDateInput({ value, onValueChange, min, max, onBlur, ...props }: Props) {
  const [draft, setDraft] = useState<{ base: string; text: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const displayed = draft?.base === value ? draft.text : formatSlovakDate(value)
  const parsed = parseSlovakDate(displayed)
  const message =
    parsed === null
      ? 'Zadajte platný dátum vo formáte DD. MM. RRRR.'
      : parsed && ((min && parsed < String(min)) || (max && parsed > String(max)))
        ? 'Dátum je mimo povoleného rozsahu.'
        : ''
  useEffect(() => {
    input.current?.setCustomValidity(message)
  }, [message])
  return (
    <input
      {...props}
      ref={input}
      type="text"
      inputMode="numeric"
      lang="sk"
      placeholder="DD. MM. RRRR"
      value={displayed}
      aria-invalid={message ? true : undefined}
      onChange={(e) => {
        const text = e.target.value,
          iso = parseSlovakDate(text)
        const error =
          iso === null
            ? 'Zadajte platný dátum vo formáte DD. MM. RRRR.'
            : iso && ((min && iso < String(min)) || (max && iso > String(max)))
              ? 'Dátum je mimo povoleného rozsahu.'
              : ''
        e.target.setCustomValidity(error)
        setDraft({ base: !error && iso !== null ? iso : value, text })
        if (!error && iso !== null) onValueChange(iso)
      }}
      onBlur={(e) => {
        if (e.target.validity.valid) setDraft(null)
        onBlur?.(e)
      }}
    />
  )
}
