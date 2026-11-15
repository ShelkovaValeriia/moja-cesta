// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EconomicsEditor } from './EconomicsEditor'
import { DEFAULT_ECONOMICS } from './economics'
import { DEFAULT_POLICY } from './scenarios'
import type { Scenario } from './types'

const scenario: Scenario = {
  schemaVersion: 1,
  id: 'test',
  name: 'Test',
  seed: 1,
  sourceHash: 'test',
  networkVersion: 'test',
  timezone: 'Europe/Bratislava',
  dates: ['2026-09-08'],
  assumptions: [],
  stops: [],
  demand: [],
  resources: [],
  fixed: [],
  external: [],
  policy: { ...DEFAULT_POLICY },
  economics: { ...DEFAULT_ECONOMICS },
}
afterEach(cleanup)

it('accepts Slovak decimals and an explicit zero fare without modifying the original scenario', async () => {
  const user = userEvent.setup(),
    apply = vi.fn()
  render(<EconomicsEditor scenario={scenario} onApply={apply} />)
  await user.click(screen.getByText(/Ekonomické predpoklady/))
  const fuel = screen.getByLabelText('Cena paliva (€ / l)')
  await user.clear(fuel)
  await user.type(fuel, '1,8')
  const fare = screen.getByLabelText('Naše cestovné za pohyb jednej osoby (€)')
  await user.clear(fare)
  await user.type(fare, '0')
  await user.click(screen.getByRole('button', { name: 'Prepočítať všetky stratégie' }))
  expect(apply).toHaveBeenCalledOnce()
  expect(apply.mock.calls[0][0].economics.fuelPricePerLitre).toBe(1.8)
  expect(apply.mock.calls[0][0].policy.farePerMovement).toBe(0)
  expect(apply.mock.calls[0][0].resources).toBe(scenario.resources)
  expect(scenario.economics!.fuelPricePerLitre).toBe(1.6)
})

it('keeps missing fares unknown and blocks blank cost inputs or an excessive residual', async () => {
  const user = userEvent.setup(),
    apply = vi.fn()
  render(<EconomicsEditor scenario={scenario} onApply={apply} />)
  await user.click(screen.getByText(/Ekonomické predpoklady/))
  await user.clear(screen.getByLabelText('Naše cestovné za pohyb jednej osoby (€)'))
  await user.click(screen.getByRole('button', { name: 'Prepočítať všetky stratégie' }))
  expect(apply.mock.calls[0][0].policy.farePerMovement).toBeNull()
  apply.mockClear()
  const purchase = screen.getByLabelText('Kúpna cena jedného autobusu (€)')
  await user.clear(purchase)
  await user.click(screen.getByRole('button', { name: 'Prepočítať všetky stratégie' }))
  expect(apply).not.toHaveBeenCalled()
  expect(purchase.getAttribute('aria-invalid')).toBe('true')
  await user.type(purchase, '100')
  await user.click(screen.getByRole('button', { name: 'Prepočítať všetky stratégie' }))
  expect(apply).not.toHaveBeenCalled()
  expect(screen.getByText('Zostatková hodnota nemôže presiahnuť kúpnu cenu.')).toBeTruthy()
})
