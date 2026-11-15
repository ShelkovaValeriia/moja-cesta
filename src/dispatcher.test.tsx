// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { addDays, createInitialState } from './data'
import { findTrips, transition } from './domain'
import { previewFlexRequest } from './dispatchPlanning'
import { STORAGE_KEY, loadState } from './storage'
import { bookingPassengerCode } from './passengerCodes'

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

describe('Plánovanie dopravy', () => {
  it('uchová priradené jazdy pri odstraňovaní flotily a odstráni voľné položky', () => {
    const state = createInitialState()
    expect(() => transition(state, { type: 'removeVehicle', id: state.vehicles[0].id })).toThrow(
      'priradené jazdy',
    )
    expect(() => transition(state, { type: 'removeDriver', id: state.drivers[0].id })).toThrow(
      'priradené jazdy',
    )
    const withExtras = transition(
      transition(state, {
        type: 'addVehicle',
        vehicle: {
          id: 'spare',
          name: 'Rezerva',
          plate: 'KK 900 AA',
          capacity: 6,
          requiredLicenseCategory: 'B',
        },
      }),
      {
        type: 'addDriver',
        driver: { id: 'spare-driver', name: 'Nový Vodič', licenseCategories: ['B'] },
      },
    )
    const withoutExtras = transition(
      transition(withExtras, { type: 'removeVehicle', id: 'spare' }),
      { type: 'removeDriver', id: 'spare-driver' },
    )
    expect(withoutExtras.vehicles.some((v) => v.id === 'spare')).toBe(false)
    expect(withoutExtras.drivers.some((d) => d.id === 'spare-driver')).toBe(false)
  })

  it('zapíše samostatného telefonického cestujúceho bez účtu v rodine', () => {
    const state = createInitialState()
    const next = transition(state, {
      type: 'registerPhonePerson',
      person: {
        id: 'MC-12345678',
        name: 'Anna Kováčová',
        relation: 'Telefonický cestujúci',
        age: 'Dospelý',
        contact: '+421 900 123 456',
        mobility: 'Pomoc pri nástupe',
      },
    })
    expect(next.phonePeople.find((p) => p.id === 'MC-12345678')).toMatchObject({
      phoneManaged: true,
      isAccountOwner: false,
      name: 'Anna Kováčová',
    })
    expect(next.people).toEqual(state.people)
    const phonePerson = next.phonePeople[0]
    const booked = transition(next, {
      type: 'book',
      id: 'phone-seat',
      personId: phonePerson.id,
      seats: 1,
      channel: 'phone',
      legs: [{ tripId: 't-0-4', from: 'mat', to: 'ssv' }],
    })
    const booking = booked.bookings.find((b) => b.id === 'phone-seat-0')!
    expect(booking.name).toBe(phonePerson.name)
    expect(bookingPassengerCode(booked, booking)).toBe(phonePerson.passengerCode)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(booked))
    expect(loadState().phonePeople[0].passengerCode).toBe(phonePerson.passengerCode)
    expect(loadState().people).toEqual(state.people)
  })

  it('zamietne Flex jazdu, ak po výstupe chýba čas na presun k pravidelnému spoju', () => {
    const state = createInitialState()
    state.vehicles = [state.vehicles[0]]
    state.trips = [state.trips[2]]
    const request = { ...state.requests[0], to: 'lech', time: '11:35' }
    state.requests = [request]
    const before = structuredClone(state)
    expect(previewFlexRequest(state, request)).toMatchObject({
      ok: false,
      code: 'SCHEDULE_CONFLICT',
    })
    expect(() =>
      transition(state, { type: 'decideRequest', id: request.id, approve: true }),
    ).toThrow('presun')
    expect(state).toEqual(before)
  })

  it('ponechá požiadavky nad skutočnou kapacitou čakať', () => {
    const state = createInitialState()
    state.vehicles.forEach((v) => {
      v.capacity = 4
    })
    const a = state.requests[0]
    state.requests.push({
      ...a,
      id: 'group',
      passengers: 2,
      ownSeats: 0,
      members: [],
      personId: undefined,
    })
    expect(previewFlexRequest(state, a)).toMatchObject({ ok: true, seats: 3, waiting: 1 })
    const next = transition(state, { type: 'decideRequest', id: a.id, approve: true })
    expect(next.requests.find((r) => r.id === 'group')?.status).toBe('pending')
    expect(next.bookings.filter((b) => b.groupId === a.id).reduce((n, b) => n + b.seats, 0)).toBe(3)
  })

  it('zverejní odchod pre cestujúcich, kontroluje kolízie a zachová pôvodné rezervácie', () => {
    const state = createInitialState()
    const action = {
      type: 'publishFixed' as const,
      id: 'published',
      templateId: 't-0-1',
      date: addDays(state.serviceDate, 1),
      departure: '09:30',
      vehicleId: 'v2',
      driverId: 'd1',
    }
    expect(() => transition(state, { ...action, departure: '07:20' })).toThrow('pridelenú jazdu')
    const next = transition(state, action)
    expect(
      findTrips(next, 'mat', 'ssv', action.date, '09:30')
        .find((t) => t.id === action.id)
        ?.stops.map((s) => s.time),
    ).toEqual(['09:30', '09:37', '09:44'])
    expect(next.bookings).toEqual(state.bookings)
    expect(() => transition(next, { ...action, id: 'duplicate' })).toThrow('už bol zverejnený')
  })

  it('vyžaduje posúdenie zastávky a uchová odôvodnenú opravu neprítomnosti', () => {
    const state = createInitialState()
    const action = { type: 'decideProposal' as const, id: 'p1', approve: true }
    expect(() => transition(state, action)).toThrow('pešej trasy')
    const approved = transition(state, {
      ...action,
      assessment: { walking: 'Chodník', boarding: 'Rovný nástup', vehicleSafety: 'Záliv' },
    })
    expect(approved.stops.find((s) => s.id === 'p1')?.name).toBe(state.proposals[0].name)
    const onTrip = transition(approved, { type: 'tripStatus', id: 't-0-1', status: 'active' })
    const absent = transition(onTrip, { type: 'rider', id: 'b2', status: 'absent' })
    const corrected = transition(absent, {
      type: 'reviewNoShow',
      id: 'b2',
      outcome: 'corrected',
      reason: 'Vodič označil nesprávny riadok.',
    })
    expect(corrected.bookings.find((b) => b.id === 'b2')).toMatchObject({
      riderStatus: 'expected',
      noShow: { driverId: 'd1' },
      noShowReview: { outcome: 'corrected' },
    })
  })
})

describe('Dispečerské rozhranie', () => {
  it('otvorí tú istú Flex jazdu z prehľadu aj zo zoznamu', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/dispatcher')
    render(<App />)
    const overviewLink = screen.getByRole('link', { name: /10:00.*Červený Kláštor.*F01/ })
    const href = overviewLink.getAttribute('href')
    await user.click(overviewLink)
    expect(screen.getByRole('heading', { name: /Červený Kláštor.*Spišská Stará Ves/ })).toBeTruthy()
    await user.click(screen.getByRole('link', { name: 'Rozvrh jázd' }))
    const listLink = screen.getByRole('link', { name: 'Detail spoja F01 o 10:00' })
    expect(listLink.getAttribute('href')).toBe(href)
    await user.click(listLink)
    expect(screen.getByRole('heading', { name: 'Spojené požiadavky' })).toBeTruthy()
  })

  it('zobrazí oba smery požiadavky v dispečerskom itinerári', async () => {
    const user = userEvent.setup()
    const state = createInitialState()
    state.requests[0].returnDate = state.serviceDate
    state.requests[0].returnTime = '16:00'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState({}, '', '/dispatcher')
    render(<App />)
    const routeLink = () =>
      within(screen.getByRole('row', { name: /Matiašovce.*09:30/ })).getByRole('link', {
        name: /Matiašovce.*Spišská Stará Ves/,
      })
    const href = routeLink().getAttribute('href')
    await user.click(routeLink())
    expect(screen.getByRole('heading', { name: 'Itinerár' })).toBeTruthy()
    expect(screen.getAllByRole('list', { name: 'Miesta v poradí jazdy' })).toHaveLength(2)
    await user.click(screen.getByRole('link', { name: 'Späť' }))
    await user.click(await screen.findByRole('link', { name: 'Všetky požadované cesty' }))
    await user.click(screen.getByRole('button', { name: 'Čakajúce' }))
    expect(routeLink().getAttribute('href')).toBe(href)
    await user.click(routeLink())
    await user.click(screen.getByRole('link', { name: 'Späť' }))
    await screen.findByRole('heading', { name: 'Požadované cesty' })
    expect(window.location.search).toBe('?status=pending')
  })

  it('na priamej adrese zobrazí aj medzizastávky priradenej jazdy', () => {
    const state = createInitialState()
    const trip = state.trips.find((t) => t.id === 'flex-seed')!
    trip.stops.splice(1, 0, { stopId: 'hal', time: '10:12' })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState({}, '', '/dispatcher/requests/r3/route')
    render(<App />)
    const stops = within(screen.getByRole('list', { name: 'Miesta v poradí jazdy' })).getAllByRole(
      'listitem',
    )
    expect(stops).toHaveLength(3)
    expect(stops[1].textContent).toContain('Haligovce, obecný úrad')
    expect(within(stops[1]).getByText('10:12')).toBeTruthy()
  })

  it('spracuje požiadavku priamo v detaile a odstráni rozhodovacie akcie', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/dispatcher/requests/r1/route')
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Schváliť požiadavku' }))
    const approval = within(screen.getByRole('dialog', { name: 'Naplánovať flexibilnú jazdu' }))
    await user.click(approval.getByRole('button', { name: 'Zavrieť' }))
    await user.click(screen.getByRole('button', { name: 'Zamietnuť požiadavku' }))
    const rejection = within(screen.getByRole('dialog', { name: 'Zamietnuť požiadavku' }))
    await user.type(rejection.getByRole('textbox'), 'Cestujúci požiadal o iný termín.')
    await user.click(rejection.getByRole('button', { name: 'Zamietnuť požiadavku' }))
    expect(window.location.pathname).toBe('/dispatcher/requests/r1/route')
    expect(loadState().requests.find((r) => r.id === 'r1')?.status).toBe('rejected')
    expect(screen.queryByRole('button', { name: 'Schváliť požiadavku' })).toBeNull()
    expect(screen.getByText('Cestujúci požiadal o iný termín.')).toBeTruthy()
  })

  it('zachová itinerár a odstráni kartu Zastávky', async () => {
    const user = userEvent.setup()
    const state = createInitialState()
    const legacy = { ...state.proposals[0] }
    state.proposals = [legacy, { ...legacy, id: 'unplaced', name: 'Návrh bez polohy' }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.history.replaceState({}, '', '/dispatcher/fixed')
    render(<App />)
    await user.click(screen.getByRole('link', { name: 'Detail spoja 101 o 06:40' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByText('07:15')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Zastávky' })).toBeNull()
  })

  it('zverejní nový pravidelný odchod z formulára a zobrazí ho vo vybraný deň', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/dispatcher/fixed')
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Zverejniť pravidelný spoj' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Zverejniť pravidelný spoj' }))
    const template = dialog.getByRole('option', { name: /^102.*Matiašovce, centrum →/ })
    await user.selectOptions(
      dialog.getByRole('combobox', { name: 'Vzor pravidelného spoja' }),
      template,
    )
    await user.click(dialog.getByRole('button', { name: 'Zverejniť spoj' }))
    expect(dialog.getByText('Tento spoj už bol zverejnený.')).toBeTruthy()
    const departure = dialog.getByRole('textbox', { name: 'Čas odchodu' })
    await user.clear(departure)
    await user.type(departure, '09:30')
    await user.click(dialog.getByRole('button', { name: 'Zverejniť spoj' }))
    expect(screen.getByRole('link', { name: 'Detail spoja 102 o 09:30' })).toBeTruthy()
  })

  it('pridá vozidlo a vodiča a priradí ich z detailu spoja', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/dispatcher/vehicles')
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Pridať vozidlo' }))
    const vehicleForm = within(screen.getByRole('dialog', { name: 'Pridať vozidlo' }))
    await user.type(vehicleForm.getByRole('textbox', { name: 'Názov vozidla' }), 'Rezervné vozidlo')
    const plate = vehicleForm.getByRole('textbox', { name: 'Evidenčné číslo' })
    await user.type(plate, 'kk482mc')
    await user.selectOptions(vehicleForm.getByRole('combobox'), 'B')
    await user.type(vehicleForm.getByRole('spinbutton'), '6')
    await user.click(vehicleForm.getByRole('button', { name: 'Pridať vozidlo' }))
    expect(vehicleForm.getByText('Vozidlo s týmto evidenčným číslom už existuje.')).toBeTruthy()
    await user.clear(plate)
    await user.type(plate, 'kk 998 mc')
    await user.click(vehicleForm.getByRole('button', { name: 'Pridať vozidlo' }))
    expect(screen.getByRole('heading', { name: 'Rezervné vozidlo' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Pridať vodiča' }))
    const driverForm = within(screen.getByRole('dialog', { name: 'Pridať vodiča' }))
    await user.type(driverForm.getByRole('textbox'), 'Ján Testovací')
    await user.click(driverForm.getByRole('checkbox', { name: 'B' }))
    await user.click(driverForm.getByRole('checkbox', { name: 'D1' }))
    await user.click(driverForm.getByRole('button', { name: 'Pridať vodiča' }))
    const registered = loadState()
    const vehicle = registered.vehicles.find((v) => v.plate === 'KK 998 MC')!
    const driver = registered.drivers.find((d) => d.name === 'Ján Testovací')!
    expect(vehicle.capacity).toBe(6)
    expect(driver.licenseCategories).toEqual(['B', 'D1'])

    await user.click(screen.getByRole('link', { name: 'Pravidelné spoje' }))
    await user.click(screen.getByRole('link', { name: 'Detail spoja 102 o 07:15' }))
    await user.click(screen.getByRole('button', { name: 'Zmeniť vozidlo alebo vodiča' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Priradenie jazdy' }))
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Vozidlo' }), vehicle.id)
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Vodič' }), driver.id)
    await user.click(dialog.getByRole('button', { name: 'Uložiť priradenie' }))
    expect(loadState().trips.find((t) => t.id === 't-0-1')).toMatchObject({
      vehicleId: vehicle.id,
      driverId: driver.id,
    })
  })

  it('zapíše adresnú telefonickú požiadavku bez overovacieho políčka a umožní ju zrušiť', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/dispatcher/support')
    render(<App />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Cestujúci' }), 'mother')
    await user.type(screen.getByLabelText('Adresa odchodu'), 'Hlavná 12, Matiašovce')
    await user.type(screen.getByLabelText('Cieľová adresa'), 'Námestie 1, Spišská Stará Ves')
    const submit = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Zapísať telefonickú požiadavku',
    })
    expect(screen.queryByRole('checkbox')).toBeNull()
    await user.click(submit)
    const request = loadState().phoneRequests[0]
    expect(request).toMatchObject({
      status: 'pending',
      personId: 'mother',
      fromAddress: 'Hlavná 12, Matiašovce',
      toAddress: 'Námestie 1, Spišská Stará Ves',
      assistance: 'Pomoc pri nastupovaní',
    })
    expect(await screen.findByRole('heading', { name: 'Telefonické rezervácie' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Zrušiť požiadavku' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Zrušiť telefonickú požiadavku' }))
    await user.click(dialog.getByRole('button', { name: 'Potvrdiť zrušenie' }))
    expect(loadState().phoneRequests.find((r) => r.id === request.id)?.status).toBe('cancelled')
  })
})
