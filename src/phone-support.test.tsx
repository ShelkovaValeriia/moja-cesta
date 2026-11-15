// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { addDays, createInitialState } from './data'
import { freeSeats, noShowOutcome, transition } from './domain'
import { loadState, restoreState, STORAGE_KEY } from './storage'
import type { PhoneJourneyRequest } from './types'

function request(id = 'phone-1'): PhoneJourneyRequest {
  return {
    id,
    personId: 'mother',
    fromAddress: 'Hlavná 12, Matiašovce',
    toAddress: 'Námestie 1, Spišská Stará Ves',
    date: createInitialState().serviceDate,
    time: '08:00',
    timeMode: 'arrival',
    seats: 2,
    assistance: 'Pomoc pri nastupovaní',
    status: 'pending',
    createdAt: '2026-11-15T00:00:00Z',
  }
}
beforeEach(() => {
  localStorage.clear()
  window.scrollTo = vi.fn()
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
afterEach(cleanup)

describe('Adresná telefonická požiadavka', () => {
  it('uloží oba smery bez pridelenia zastávky, vytvorenia jazdy alebo blokovania miest', () => {
    const state = createInitialState()
    const data = {
      ...request(),
      fromAddress: '  Hlavná 12, Matiašovce  ',
      returnJourney: {
        date: addDays(state.serviceDate, 1),
        time: '16:30',
        timeMode: 'departure' as const,
      },
    }
    const next = transition(state, { type: 'createPhoneRequest', request: data })
    expect(next.phoneRequests[0]).toMatchObject({
      fromAddress: 'Hlavná 12, Matiašovce',
      status: 'pending',
      timeMode: 'arrival',
      returnJourney: data.returnJourney,
    })
    expect(next.trips).toEqual(state.trips)
    expect(next.bookings).toEqual(state.bookings)
    expect(next.requests).toEqual(state.requests)
    expect(next.stops).toEqual(state.stops)
    expect(() => transition(next, { type: 'createPhoneRequest', request: data })).toThrow(
      'už bola zapísaná',
    )
    const cancelled = transition(next, { type: 'cancelPhoneRequest', id: data.id })
    expect(cancelled.phoneRequests[0].status).toBe('cancelled')
    expect(cancelled.phoneRequests[0].returnJourney).toEqual(data.returnJourney)
    expect(cancelled.bookings).toEqual(state.bookings)
  })

  it('odmietne neplatné adresy, čas, dátum, skorý návrat a chýbajúci kontakt dieťaťa', () => {
    const state = createInitialState()
    const before = structuredClone(state)
    for (const invalid of [
      { fromAddress: '  ' },
      { toAddress: request().fromAddress.toUpperCase() },
      { time: '8 PM' },
      { date: '2099-02-30' },
      { seats: 0 },
      { seats: 1.5 },
      { returnJourney: { date: state.serviceDate, time: '07:00', timeMode: 'departure' as const } },
    ])
      expect(() =>
        transition(state, { type: 'createPhoneRequest', request: { ...request(), ...invalid } }),
      ).toThrow()
    expect(state).toEqual(before)
    state.people.find((p) => p.id === 'daughter')!.contact = ''
    expect(() =>
      transition(state, {
        type: 'createPhoneRequest',
        request: { ...request(), personId: 'daughter' },
      }),
    ).toThrow('zodpovedného dospelého')
  })

  it('načíta staršie úložisko aj nové adresy bez straty existujúcich rezervácií', () => {
    const state = createInitialState()
    const legacy = { ...state, phoneRequests: undefined }
    expect(restoreState(legacy)?.phoneRequests).toEqual([])
    expect(restoreState(legacy)?.bookings).toEqual(state.bookings)
    state.phoneRequests = [request()]
    expect(restoreState(JSON.parse(JSON.stringify(state)))?.phoneRequests).toEqual(
      state.phoneRequests,
    )
  })

  it('z formulára uloží nezávislé kritériá návratu a presmeruje na vlastný záznam', async () => {
    const user = userEvent.setup()
    window.history.replaceState({ idx: 0 }, '', '/dispatcher/support')
    render(<App />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByLabelText('Služba')).toBeNull()
    expect(screen.queryByLabelText('Nástup')).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'Spiatočná' }))
    await user.selectOptions(screen.getByLabelText('Cestujúci'), 'mother')
    await user.type(screen.getByLabelText('Adresa odchodu'), request().fromAddress)
    await user.type(screen.getByLabelText('Cieľová adresa'), request().toAddress)
    await user.selectOptions(screen.getByLabelText('Čas podľa'), 'arrival')
    await user.selectOptions(screen.getByLabelText('Čas návratu podľa'), 'arrival')
    const returnDate = addDays(createInitialState().serviceDate, 1).split('-').reverse().join('. ')
    await user.clear(screen.getByLabelText('Dátum návratu'))
    await user.type(screen.getByLabelText('Dátum návratu'), returnDate)
    await user.click(screen.getByRole('button', { name: 'Zapísať telefonickú požiadavku' }))
    await screen.findByRole('heading', { name: 'Telefonické rezervácie' })
    const saved = loadState().phoneRequests[0]
    expect(saved.timeMode).toBe('arrival')
    expect(saved.returnJourney).toEqual({
      date: addDays(saved.date, 1),
      time: '16:00',
      timeMode: 'arrival',
    })
    expect(window.location.search).toContain(saved.id)
    expect(within(screen.getByRole('article')).getByText('Čaká na naplánovanie')).toBeTruthy()
    expect(screen.getByText(/Miesta vo vozidle zatiaľ nie sú rezervované/)).toBeTruthy()
  })
})

describe('Samostatné prehľady podpory', () => {
  it('vyhľadá telefonického cestujúceho podľa trvalého šesťmiestneho kódu', async () => {
    const user = userEvent.setup()
    const state = createInitialState()
    const mother = state.people.find((p) => p.id === 'mother')!
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState({ idx: 0 }, '', '/dispatcher/support')
    render(<App />)
    await user.type(screen.getByLabelText('Vyhľadať podľa identifikátora'), mother.passengerCode!)
    await user.click(screen.getByRole('button', { name: 'Vyhľadať' }))
    expect((screen.getByLabelText('Cestujúci') as HTMLSelectElement).value).toBe('mother')
  })

  it('zjednotí posúdenie pravidelnej rezervácie s podporou a zachová starší audit', () => {
    const state = createInitialState()
    const booking = state.bookings[0]
    state.trips.find((t) => t.id === booking.tripId)!.status = 'active'
    const reported = transition(state, { type: 'rider', id: booking.id, status: 'absent' })
    const reviewed = transition(reported, {
      type: 'reviewNoShow',
      id: booking.id,
      decision: 'confirm',
      reason: 'Overené počas telefonátu.',
    })
    const result = reviewed.bookings.find((b) => b.id === booking.id)!
    expect(noShowOutcome(result)).toBe('confirmed')
    expect(result.noShow?.history.at(-1)?.action).toBe('confirm')
    expect(() =>
      transition(reviewed, {
        type: 'reviewNoShow',
        id: booking.id,
        outcome: 'excused',
        reason: 'Opakované posúdenie.',
      }),
    ).toThrow('už nie je možné')
    const legacy = JSON.parse(JSON.stringify(reported))
    legacy.bookings.find((b: { id: string }) => b.id === booking.id).noShow = {
      recordedAt: '2026-11-15T08:00:00Z',
      driverId: 'd1',
    }
    const restored = restoreState(legacy)!.bookings.find((b) => b.id === booking.id)!
    expect(restored.noShow).toMatchObject({
      recordedAt: '2026-11-15T08:00:00Z',
      status: 'reported',
      history: [],
    })
    expect(noShowOutcome(restored)).toBeUndefined()
  })

  it('otvorí obe kategórie zo samostatných kariet', async () => {
    const user = userEvent.setup()
    window.history.replaceState({ idx: 0 }, '', '/dispatcher/support')
    render(<App />)
    await user.click(screen.getByRole('link', { name: 'Telefonické rezervácie' }))
    expect(window.location.pathname).toBe('/dispatcher/support/phone')
    await user.click(screen.getByRole('link', { name: 'Späť' }))
    await screen.findByRole('heading', { name: 'Podpora cestujúcich' })
    await user.click(screen.getByRole('link', { name: 'Neprítomnosť cestujúcich' }))
    expect(window.location.pathname).toBe('/dispatcher/support/no-shows')
    expect(screen.getByLabelText('Stav záznamu')).toBeTruthy()
  })

  it('filtruje meno bez diakritiky, telefón, návratový dátum, stav aj typ a stránkuje', async () => {
    const user = userEvent.setup()
    const state = createInitialState()
    state.people.find((p) => p.id === 'mother')!.contact = '+421 900 123 456'
    state.phoneRequests = Array.from({ length: 25 }, (_, i) => ({
      ...request(`phone-${i}`),
      returnJourney: { date: addDays(state.serviceDate, 1), time: '16:00', timeMode: 'departure' },
    }))
    state.phoneRequests.push({ ...request('cancelled'), status: 'cancelled' })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState({ idx: 0 }, '', '/dispatcher/support/phone')
    render(<App />)
    expect(screen.getAllByRole('article')).toHaveLength(20)
    await user.click(screen.getByRole('button', { name: 'Ďalšia' }))
    expect(screen.getAllByRole('article')).toHaveLength(6)
    await user.type(screen.getByLabelText('Vyhľadať záznam'), 'maria')
    expect(window.location.search).not.toContain('page=')
    await user.clear(screen.getByLabelText('Vyhľadať záznam'))
    await user.type(screen.getByLabelText('Vyhľadať záznam'), '+421900123456')
    expect(screen.getAllByRole('article')).toHaveLength(20)
    fireEvent.change(screen.getByLabelText('Dátum cesty'), {
      target: { value: addDays(state.serviceDate, 1) },
    })
    await user.selectOptions(screen.getByLabelText('Stav záznamu'), 'pending')
    expect(screen.getAllByRole('article')).toHaveLength(20)
    await user.selectOptions(screen.getByLabelText('Typ záznamu'), 'booking')
    expect(screen.queryByRole('article')).toBeNull()
    await user.selectOptions(screen.getByLabelText('Typ záznamu'), 'request')
    expect(screen.getAllByRole('article')).toHaveLength(20)
  })

  it('zachová a zruší staršiu telefonickú rezerváciu s uvoľnením miest', async () => {
    const user = userEvent.setup()
    const initial = createInitialState()
    const trip = initial.trips.find((t) => t.id === 't-0-4')!
    const state = transition(initial, {
      type: 'book',
      id: 'phone-booking',
      personId: 'mother',
      seats: 1,
      channel: 'phone',
      legs: [{ tripId: trip.id, from: 'mat', to: 'ssv' }],
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState(
      { idx: 0 },
      '',
      '/dispatcher/support/phone?kind=booking&status=confirmed',
    )
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Zrušiť rezerváciu' }))
    const modal = within(screen.getByRole('dialog', { name: 'Zrušiť telefonickú rezerváciu' }))
    expect(modal.queryByRole('checkbox')).toBeNull()
    await user.click(modal.getByRole('button', { name: 'Potvrdiť zrušenie' }))
    expect(loadState().bookings.find((b) => b.id === 'phone-booking-0')?.status).toBe('cancelled')
    expect(freeSeats(loadState(), trip, 'mat', 'ssv')).toBe(freeSeats(initial, trip, 'mat', 'ssv'))
  })

  it('posúdi neprítomnosť na samostatnej stránke a zohľadní výsledok vo filtroch', async () => {
    const user = userEvent.setup()
    const state = createInitialState()
    const booking = state.bookings[0]
    booking.riderStatus = 'absent'
    booking.noShow = {
      recordedAt: new Date().toISOString(),
      driverId: 'd1',
      status: 'reported',
      history: [],
    }
    state.trips.find((t) => t.id === booking.tripId)!.status = 'active'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState({ idx: 0 }, '', '/dispatcher/support/no-shows?status=unreviewed')
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Posúdiť neprítomnosť' }))
    const modal = within(screen.getByRole('dialog', { name: 'Posúdiť neprítomnosť' }))
    await user.selectOptions(modal.getByLabelText('Výsledok posúdenia'), 'excused')
    await user.type(
      modal.getByLabelText('Odôvodnenie posúdenia'),
      'Cestujúci nahlásil mimoriadnu udalosť.',
    )
    await user.click(modal.getByRole('button', { name: 'Uložiť posúdenie' }))
    expect(screen.queryByRole('article')).toBeNull()
    await user.selectOptions(screen.getByLabelText('Stav záznamu'), 'excused')
    expect(screen.getByText('Neprítomnosť ospravedlnená', { selector: 'strong' })).toBeTruthy()
    expect(loadState().bookings.find((b) => b.id === booking.id)?.noShowReview?.outcome).toBe(
      'excused',
    )
  })
})
