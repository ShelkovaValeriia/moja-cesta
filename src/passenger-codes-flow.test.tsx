// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { createInitialState } from './data'
import { formatPassengerCode, bookingPassengerCode } from './passengerCodes'
import type { AppState } from './types'
const saved = (): AppState => JSON.parse(localStorage.getItem('moja-cesta-demo-v1')!)
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/passenger/profile')
  window.scrollTo = vi.fn()
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(createInitialState()))
})
afterEach(cleanup)
it('creates a profile with a generated unique number, copies it and keeps it stable after reload', async () => {
  const user = userEvent.setup()
  let view = render(<App />)
  await user.click(screen.getByRole('button', { name: 'Pridať človeka' }))
  await user.type(screen.getByLabelText('Meno a priezvisko'), 'Nový cestujúci')
  const code = screen.getByRole('textbox', {
    name: /Identifikačné číslo cestujúceho/,
  }) as HTMLInputElement
  await user.type(code, '123456')
  await user.click(screen.getByRole('button', { name: 'Uložiť profil' }))
  expect(screen.getByRole('alert').textContent).toBe('Toto identifikačné číslo sa už používa.')
  expect(saved().people).toHaveLength(3)
  await user.click(screen.getByRole('button', { name: 'Vygenerovať číslo' }))
  const generated = code.value
  expect(generated).toMatch(/^\d{6}$/)
  expect(generated).not.toBe('123456')
  await user.click(screen.getByRole('button', { name: 'Uložiť profil' }))
  const person = saved().people.find((p) => p.name === 'Nový cestujúci')!
  expect(person.passengerCode).toBe(generated)
  const card = screen.getByRole('heading', { name: 'Nový cestujúci' }).closest('article')!
  await user.click(
    within(card).getByRole('button', {
      name: `Skopírovať číslo ${formatPassengerCode(generated)}`,
    }),
  )
  expect(await navigator.clipboard.readText()).toBe(generated)
  view.unmount()
  view = render(<App />)
  expect(
    screen.getByRole('heading', { name: 'Nový cestujúci' }).closest('article')?.textContent,
  ).toContain(formatPassengerCode(generated))
  await user.click(
    within(screen.getByRole('heading', { name: 'Nový cestujúci' }).closest('article')!).getByRole(
      'button',
      { name: 'Upraviť profil' },
    ),
  )
  expect(
    (screen.getByRole('textbox', { name: /Identifikačné číslo cestujúceho/ }) as HTMLInputElement)
      .readOnly,
  ).toBe(true)
  view.unmount()
})
it('shows only passenger numbers with seats and endpoints in driver boarding and alighting checks', async () => {
  const user = userEvent.setup()
  const s = saved()
  s.bookings = [
    {
      id: 'private',
      tripId: 't-0-1',
      personId: 'me',
      passengerId: 'me',
      name: 'Zuzana Nováková',
      seats: 1,
      from: 'mat',
      to: 'ssv',
      status: 'confirmed',
      riderStatus: 'expected',
      mine: true,
    },
  ]
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(s))
  window.history.replaceState({}, '', '/driver/trips/t-0-1')
  render(<App />)
  expect(document.querySelector('main')?.textContent).not.toContain('Zuzana')
  await user.click(screen.getByRole('button', { name: 'Začať jazdu' }))
  await user.click(screen.getByRole('button', { name: 'Dorazil som na zastávku' }))
  const code = formatPassengerCode(bookingPassengerCode(saved(), saved().bookings[0]))
  const row = screen.getByText(code).closest('article')!
  expect(row.textContent).not.toContain('Zuzana')
  expect(row.textContent).not.toContain('Nováková')
  expect(row.textContent).toContain('Nástup: Matiašovce')
  expect(row.textContent).toContain('Výstup: Spišská Stará Ves')
  await user.click(within(row).getByRole('button', { name: 'Nastúpil' }))
  await user.click(screen.getByRole('button', { name: 'Pokračovať v jazde' }))
  await user.click(screen.getByRole('button', { name: 'Dorazil som na zastávku' }))
  expect(screen.getByText(code)).toBeTruthy()
  expect(document.querySelector('main')?.textContent).not.toContain('Nováková')
  await user.click(screen.getByRole('button', { name: 'Vystúpil' }))
  expect(saved().bookings[0].personId).toBe('me')
  expect(saved().bookings[0].passengerId).toBe('me')
})
it('persists numbers assigned to legacy profiles immediately, before any mutation', () => {
  const s = saved()
  s.version = 4
  s.people.forEach((p) => delete p.passengerCode)
  localStorage.setItem('moja-cesta-demo-v1', JSON.stringify(s))
  let view = render(<App />)
  const codes = saved().people.map((p) => p.passengerCode)
  expect(codes.every((c) => /^\d{6}$/.test(c!))).toBe(true)
  view.unmount()
  view = render(<App />)
  expect(saved().people.map((p) => p.passengerCode)).toEqual(codes)
  view.unmount()
})
