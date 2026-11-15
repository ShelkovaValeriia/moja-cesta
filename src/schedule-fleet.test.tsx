// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { addDays, createInitialState } from './data'
import { freeSeats, transition } from './domain'
import { loadState, STORAGE_KEY } from './storage'

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

describe('Úprava flotily', () => {
  it('chráni aj plne obsadené budúce jazdy pred znížením kapacity', () => {
    const state = createInitialState()
    const trip = state.trips.find((t) => t.date > state.serviceDate)!
    const vehicle = state.vehicles.find((v) => v.id === trip.vehicleId)!
    state.bookings.push({
      id: 'future-full',
      tripId: trip.id,
      name: 'Skupina',
      seats: vehicle.capacity,
      from: trip.stops[0].stopId,
      to: trip.stops.at(-1)!.stopId,
      status: 'confirmed',
      riderStatus: 'expected',
      mine: false,
    })
    expect(() =>
      transition(state, {
        type: 'updateVehicle',
        vehicle: { ...vehicle, capacity: vehicle.capacity - 1 },
      }),
    ).toThrow('existujúce rezervácie')
  })

  it('zníži dostupné miesta, ale nedovolí ohroziť rezervácie ani oprávnenia', () => {
    const state = createInitialState()
    state.bookings = state.bookings.filter(
      (b) => state.trips.find((t) => t.id === b.tripId)?.date === state.serviceDate,
    )
    const trip = state.trips[0]
    const vehicle = state.vehicles.find((v) => v.id === trip.vehicleId)!
    const next = transition(state, { type: 'updateVehicle', vehicle: { ...vehicle, capacity: 7 } })
    expect(freeSeats(next, trip)).toBe(freeSeats(state, trip) - 1)
    const full = structuredClone(next)
    full.bookings = [
      {
        id: 'full',
        tripId: trip.id,
        name: 'Skupina',
        seats: 7,
        from: trip.stops[0].stopId,
        to: trip.stops.at(-1)!.stopId,
        status: 'confirmed',
        riderStatus: 'expected',
        mine: false,
      },
    ]
    const before = structuredClone(full)
    expect(() =>
      transition(full, { type: 'updateVehicle', vehicle: { ...vehicle, capacity: 6 } }),
    ).toThrow('existujúce rezervácie')
    expect(full).toEqual(before)
    const driver = state.drivers.find((d) => d.id === trip.driverId)!
    const licensed = transition(next, {
      type: 'updateDriver',
      driver: { ...driver, licenseCategories: ['B', 'D1'] },
    })
    expect(licensed.drivers.find((d) => d.id === driver.id)?.licenseCategories).toContain('D1')
    expect(() =>
      transition(next, { type: 'updateDriver', driver: { ...driver, licenseCategories: ['D'] } }),
    ).toThrow('pridelené jazdy')
    expect(() =>
      transition(next, {
        type: 'updateVehicle',
        vehicle: { ...vehicle, requiredLicenseCategory: 'D' },
      }),
    ).toThrow('oprávnenie')
    expect(() =>
      transition(next, {
        type: 'updateVehicle',
        vehicle: { ...vehicle, plate: state.vehicles[1].plate },
      }),
    ).toThrow('evidenčným číslom')
  })

  it('uloží kapacitu a nové oprávnenie z predvyplnených formulárov', async () => {
    const user = userEvent.setup()
    const state = createInitialState()
    state.bookings = state.bookings.filter(
      (b) => state.trips.find((t) => t.id === b.tripId)?.date === state.serviceDate,
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState({ idx: 0 }, '', '/dispatcher/vehicles')
    render(<App />)
    await user.click(screen.getAllByRole('button', { name: 'Upraviť vozidlo' })[0])
    const vehicle = within(screen.getByRole('dialog', { name: 'Upraviť vozidlo' }))
    expect((vehicle.getByLabelText('Názov vozidla') as HTMLInputElement).value).toBeTruthy()
    await user.clear(vehicle.getByRole('spinbutton'))
    await user.type(vehicle.getByRole('spinbutton'), '7')
    await user.click(vehicle.getByRole('button', { name: 'Uložiť zmeny' }))
    expect(loadState().vehicles[0].capacity).toBe(7)
    await user.click(screen.getAllByRole('button', { name: 'Upraviť vodiča' })[0])
    const driver = within(screen.getByRole('dialog', { name: 'Upraviť vodiča' }))
    await user.click(driver.getByRole('checkbox', { name: 'D1' }))
    await user.click(driver.getByRole('button', { name: 'Uložiť zmeny' }))
    expect(loadState().drivers[0].licenseCategories).toContain('D1')
  })
})

describe('Rozvrh', () => {
  it('zobrazí všetky jazdy vybraného dňa a zachová dátum po návrate z detailu', async () => {
    const user = userEvent.setup()
    const state = createInitialState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState({ idx: 0 }, '', '/dispatcher/schedule')
    render(<App />)
    const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows()).toHaveLength(state.trips.filter((t) => t.date === state.serviceDate).length)
    expect(screen.getByRole('link', { name: 'Detail spoja F01 o 10:00' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Flexibilné jazdy' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Zastávky' })).toBeNull()
    const nextDay = addDays(state.serviceDate, 1)
    const [year, month, day] = nextDay.split('-')
    await user.clear(screen.getByLabelText('Dátum prevádzky'))
    await user.type(screen.getByLabelText('Dátum prevádzky'), `${day}. ${month}. ${year}`)
    expect(rows()).toHaveLength(state.trips.filter((t) => t.date === nextDay).length)
    expect(screen.queryByRole('link', { name: 'Detail spoja F01 o 10:00' })).toBeNull()
    await user.click(within(rows()[0]).getByRole('link'))
    await user.click(screen.getByRole('link', { name: 'Späť' }))
    expect(window.location.search).toContain(nextDay)
    expect(await screen.findByRole('heading', { name: 'Rozvrh jázd' })).toBeTruthy()
  })
})
