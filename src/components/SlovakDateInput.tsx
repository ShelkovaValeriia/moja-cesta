import { DateInput } from './DateInput'

export function SlovakDateInput({
  value,
  onChange,
  label,
  min,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  min?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <DateInput
        required
        value={value}
        min={min}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
