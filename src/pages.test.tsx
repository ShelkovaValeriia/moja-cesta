import { DriverMap } from './pages/DriverMap'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { StoreContext } from './context'
import { createInitialState } from './data'
import { Layout } from './components/Layout'
import { PassengerHome } from './pages/PassengerHome'
import { PassengerLines } from './pages/PassengerLines'
import { SearchPage, ResultsPage } from './pages/Search'
import { NewRequest, RequestDetail, RequestsPage } from './pages/Requests'
import { BookingPage } from './pages/Booking'
import { JourneysPage } from './pages/Journeys'
import { FamilyPage, DriverProfile } from './pages/Family'
import { RecurringEditor, RecurringPage } from './pages/Recurring'
import { RegularDemandPage } from './pages/RegularDemand'
import { DriverPage, DriverTrip } from './pages/Driver'
import { DispatcherSupport } from './pages/DispatcherSupport'
import { DispatcherNoShows, DispatcherPhoneRecords } from './pages/DispatcherSupportRecords'
import {
  DispatcherOverview,
  DispatcherRequests,
  DispatcherStatistics,
  DispatcherStops,
  DispatcherTrips,
  DispatcherVehicles,
} from './pages/Dispatcher'
const routes: [string, ReactNode, string][] = [
  ['/passenger', <PassengerHome />, 'Kam sa chcete'],
  ['/passenger/lines', <PassengerLines />, 'Pravidelné linky'],
  ['/passenger/search', <SearchPage />, 'Vyhľadať spojenie'],
  ['/passenger/results', <ResultsPage />, 'Pravidelný spoj'],
  ['/passenger/results?roundTrip=true', <ResultsPage />, 'Oba smery sú dostupné'],
  ['/passenger/requests', <RequestsPage />, 'Požiadavky na mape'],
  ['/passenger/requests/new', <NewRequest />, 'Nová požiadavka'],
  ['/passenger/requests/:id', <RequestDetail />, 'Detail požiadavky'],
  ['/passenger/book/:id', <BookingPage />, 'Rezervácia miesta'],
  ['/passenger/journeys', <JourneysPage />, 'Moje cesty'],
  ['/passenger/profile', <FamilyPage />, 'Profil a rodina'],
  ['/passenger/recurring', <RecurringPage />, 'Moje pravidelné cesty'],
  ['/passenger/recurring/new', <RecurringEditor />, 'Pravidelné cestovanie'],
  ['/dispatcher/regular-needs', <RegularDemandPage />, 'Pravidelné dopravné potreby'],
  ['/driver', <DriverPage />, 'Moje dnešné jazdy'],
  ['/driver/map', <DriverMap />, 'Mapa'],
  ['/driver/trips/:id', <DriverTrip />, 'Zastávky a cestujúci'],
  ['/driver/profile', <DriverProfile />, 'Môj profil'],
  ['/dispatcher', <DispatcherOverview />, 'Prehľad dopravy'],
  ['/dispatcher/requests', <DispatcherRequests />, 'Požiadavky'],
  ['/dispatcher/fixed', <DispatcherTrips kind="fixed" />, 'Pravidelné spoje'],
  ['/dispatcher/schedule', <DispatcherTrips kind="all" />, 'Rozvrh jázd'],
  ['/dispatcher/vehicles', <DispatcherVehicles />, 'Vozidlá'],
  ['/dispatcher/stops', <DispatcherStops />, 'Zastávky'],
  ['/dispatcher/statistics', <DispatcherStatistics />, 'Štatistiky'],
  ['/dispatcher/support', <DispatcherSupport />, 'Podpora cestujúcich'],
  ['/dispatcher/support/phone', <DispatcherPhoneRecords />, 'Telefonické rezervácie'],
  ['/dispatcher/support/no-shows', <DispatcherNoShows />, 'Neprítomnosť cestujúcich'],
]
describe('Všetky hlavné obrazovky sa vykreslia s spoločnými údajmi', () => {
  for (const [path, element, label] of routes)
    it(path, () => {
      const url = path.replace(
        ':id',
        path.includes('book') || path.includes('trips') ? 't-0-1' : 'r1',
      )
      const html = renderToString(
        <StoreContext.Provider
          value={{
            state: createInitialState(),
            act: () => true,
            reset: () => {},
            toast: null,
            dismissToast: () => {},
            storageWarning: false,
          }}
        >
          <MemoryRouter initialEntries={[url]}>
            <Routes>
              <Route element={<Layout />}>
                <Route path={path.split('?')[0]} element={element} />
              </Route>
            </Routes>
          </MemoryRouter>
        </StoreContext.Provider>,
      )
      expect(html).toContain(label)
      expect(html).toContain('Demonštračná verzia')
      expect(html).not.toContain('undefined')
      expect(html).not.toContain('type="time"')
      expect(html).not.toMatch(/\b(?:AM|PM)\b/)
    })
})
