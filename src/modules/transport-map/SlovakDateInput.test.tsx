// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { SlovakDateInput } from './SlovakDateInput'
afterEach(cleanup)
describe('Slovak date entry independent of browser locale', () => {
  it('displays Slovak dates and emits ISO only for valid dates in range', () => {
    const change = vi.fn()
    const { rerender } = render(
      <SlovakDateInput
        aria-label="Dátum"
        value="2026-11-16"
        min="2026-11-15"
        onValueChange={change}
      />,
    )
    const input = screen.getByLabelText('Dátum') as HTMLInputElement
    expect(input.value).toBe('16. 11. 2026')
    fireEvent.change(input, { target: { value: '31. 2. 2026' } })
    expect(input.checkValidity()).toBe(false)
    expect(change).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '14. 11. 2026' } })
    expect(input.checkValidity()).toBe(false)
    fireEvent.change(input, { target: { value: '18. 11. 2026' } })
    expect(change).toHaveBeenLastCalledWith('2026-11-18')
    fireEvent.change(input, { target: { value: 'invalid' } })
    rerender(<SlovakDateInput aria-label="Dátum" value="2026-11-20" onValueChange={change} />)
    expect(input.value).toBe('20. 11. 2026')
    expect(input.checkValidity()).toBe(true)
  })
  it('allows empty filters and normalizes the completed date on blur', () => {
    function Example() {
      const [date, setDate] = useState('2026-11-16')
      return <SlovakDateInput aria-label="Dátum" value={date} onValueChange={setDate} />
    }
    render(<Example />)
    const input = screen.getByLabelText('Dátum') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { value: '2.12.2026' } })
    fireEvent.blur(input)
    expect(input.value).toBe('2. 12. 2026')
  })
})
