import { DriverMap } from './pages/DriverMap'
import { ActiveDriverTrip } from './pages/ActiveDriverTrip'
import { Component, lazy, Suspense } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { StoreProvider } from './store'
import { Layout } from './components/Layout'
import { Empty, PageTitle } from './components/ui'
import { PassengerHome } from './pages/PassengerHome'
import { PassengerLines } from './pages/PassengerLines'
import { ResultsPage, SearchPage } from './pages/Search'
import { NewRequest, RequestDetail, RequestsPage } from './pages/Requests'
import { BookingPage } from './pages/Booking'
import { JourneysPage } from './pages/Journeys'
import { DriverProfile, FamilyPage } from './pages/Family'
import { RecurringEditor, RecurringPage } from './pages/Recurring'
import { DispatcherSubmissions } from './pages/DispatcherSubmissions'
import { DispatcherMap } from './pages/DispatcherMap'
import { DriverPage, DriverTrip } from './pages/Driver'
import { DispatcherSupport } from './pages/DispatcherSupport'
import { DispatcherNoShows, DispatcherPhoneRecords } from './pages/DispatcherSupportRecords'
import {
  DispatcherOverview,
  DispatcherRequests,
  DispatcherRequestRoute,
  DispatcherTripRoute,
  DispatcherStatistics,
  DispatcherStops,
  DispatcherTrips,
  DispatcherVehicles,
} from './pages/Dispatcher'
const PlanningScenarios = lazy(() => import('./pages/PlanningScenarios'))
function LegacyScheduleRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/dispatcher/schedule${search}`} replace />
}
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() {
    return { error: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }
  render() {
    if (this.state.error)
      return (
        <main className="error-boundary">
          <h1>Vráťme sa na správnu cestu.</h1>
          <p>Aplikáciu sa nepodarilo zobraziť. Skúste ju znovu načítať.</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Načítať znova
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              localStorage.removeItem('moja-cesta-demo-v1')
              window.location.assign('/passenger')
            }}
          >
            Obnoviť demo údaje
          </button>
        </main>
      )
    return this.props.children
  }
}
export default function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="dispatcher/scenarios"
              element={
                <Suspense fallback={<p role="status">Načítavame scenáre…</p>}>
                  <PlanningScenarios />
                </Suspense>
              }
            />
            <Route path="dispatcher/map/:kind/:id" element={<DispatcherMap />} />
            <Route path="driver/navigation/:id" element={<ActiveDriverTrip />} />
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/passenger" replace />} />
              <Route path="passenger" element={<PassengerHome />} />
              <Route path="passenger/lines" element={<PassengerLines />} />
              <Route path="passenger/search" element={<SearchPage />} />
              <Route path="passenger/results" element={<ResultsPage />} />
              <Route path="passenger/requests" element={<RequestsPage />} />
              <Route path="passenger/requests/new" element={<NewRequest />} />
              <Route path="passenger/requests/:id" element={<RequestDetail />} />
              <Route path="passenger/book/:id" element={<BookingPage />} />
              <Route path="passenger/journeys" element={<JourneysPage />} />
              <Route path="passenger/recurring" element={<RecurringPage />} />
              <Route path="passenger/recurring/new" element={<RecurringEditor />} />
              <Route path="passenger/recurring/:id/edit" element={<RecurringEditor />} />
              <Route path="passenger/profile" element={<FamilyPage />} />
              <Route path="driver" element={<DriverPage />} />
              <Route path="driver/map" element={<DriverMap />} />
              <Route path="driver/current" element={<DriverTrip />} />
              <Route path="driver/trips/:id" element={<DriverTrip />} />
              <Route path="driver/profile" element={<DriverProfile />} />
              <Route path="dispatcher" element={<DispatcherOverview />} />
              <Route path="dispatcher/requests" element={<DispatcherRequests />} />
              <Route path="dispatcher/submissions" element={<DispatcherSubmissions />} />
              <Route path="dispatcher/requests/:id/route" element={<DispatcherRequestRoute />} />
              <Route path="dispatcher/fixed" element={<DispatcherTrips kind="fixed" />} />
              <Route path="dispatcher/fixed/:id" element={<DispatcherTripRoute kind="fixed" />} />
              <Route path="dispatcher/schedule" element={<DispatcherTrips kind="all" />} />
              <Route path="dispatcher/flex" element={<LegacyScheduleRedirect />} />
              <Route path="dispatcher/flex/:id" element={<DispatcherTripRoute kind="flex" />} />
              <Route path="dispatcher/vehicles" element={<DispatcherVehicles />} />
              <Route path="dispatcher/stops" element={<DispatcherStops />} />
              <Route path="dispatcher/support" element={<DispatcherSupport />} />
              <Route path="dispatcher/support/phone" element={<DispatcherPhoneRecords />} />
              <Route path="dispatcher/support/no-shows" element={<DispatcherNoShows />} />
              <Route path="dispatcher/statistics" element={<DispatcherStatistics />} />
              <Route
                path="dispatcher/regular-needs"
                element={<Navigate to="/dispatcher/submissions" replace />}
              />
              <Route
                path="*"
                element={
                  <>
                    <PageTitle title="Táto cesta zatiaľ nikam nevedie" />
                    <Empty
                      text="Stránka sa nenašla. Vráťte sa na hlavnú stránku."
                      action={
                        <Link className="btn" to="/passenger">
                          Späť domov
                        </Link>
                      }
                    />
                  </>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </StoreProvider>
    </ErrorBoundary>
  )
}
