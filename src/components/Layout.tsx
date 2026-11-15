import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  Bell,
  BusFront,
  CalendarDays,
  ChartNoAxesColumn,
  Check,
  CircleHelp,
  ClipboardList,
  FlaskConical,
  Compass,
  Home,
  LayoutGrid,
  MapPin,
  Phone,
  RotateCcw,
  Settings2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore } from '../context'
import { Badge, HelpContent, Modal } from './ui'
export function Logo() {
  return (
    <Link to="/passenger" className="logo" aria-label="Moja Cesta, domov">
      <svg width="37" height="37" viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="14" fill="currentColor" />
        <path
          d="M12 33V17a5 5 0 0 1 10 0v11a5 5 0 0 0 10 0V15"
          stroke="#e0eac2"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="32" cy="13" r="4" fill="#e0eac2" />
      </svg>
      <span>
        moja<span className="logo-light">cesta</span>
        <small>BLIŽŠIE K SEBE.</small>
      </span>
    </Link>
  )
}
const passengerNav: [string, string, LucideIcon][] = [
  ['/passenger', 'Domov', Home],
  ['/passenger/journeys', 'Cesty', CalendarDays],
  ['/passenger/requests', 'Mapa', MapPin],
  ['/passenger/profile', 'Profil', UserRound],
]
const driverNav: [string, string, LucideIcon][] = [
  ['/driver', 'Dnešné jazdy', BusFront],
  ['/driver/map', 'Mapa', MapPin],
  ['/driver/current', 'Aktuálna jazda', Compass],
  ['/driver/profile', 'Profil', UserRound],
]
const dispatcherNav: [string, string, LucideIcon][] = [
  ['/dispatcher', 'Prehľad', LayoutGrid],
  ['/dispatcher/fixed', 'Pravidelné spoje', BusFront],
  ['/dispatcher/requests', 'Požadované cesty', BusFront],
  ['/dispatcher/submissions', 'Požiadavky', ClipboardList],
  ['/dispatcher/schedule', 'Rozvrh jázd', CalendarDays],
  ['/dispatcher/vehicles', 'Vozidlá', UsersRound],
  ['/dispatcher/support', 'Podpora cestujúcich', Phone],
  ['/dispatcher/statistics', 'Štatistiky', ChartNoAxesColumn],
  ['/dispatcher/scenarios', 'Scenáre', FlaskConical],
]
export function Layout() {
  const { pathname } = useLocation(),
    navigate = useNavigate(),
    { state, toast, dismissToast, reset, storageWarning } = useStore()
  const [modal, setModal] = useState<'help' | 'reset' | 'notifications' | null>(null)
  const role = pathname.startsWith('/driver')
    ? 'driver'
    : pathname.startsWith('/dispatcher')
      ? 'dispatcher'
      : 'passenger'
  const nav = role === 'driver' ? driverNav : role === 'dispatcher' ? dispatcherNav : passengerNav
  const mapPage = [
    '/passenger/requests',
    '/passenger/results',
    '/passenger/lines',
    '/driver/map',
  ].includes(pathname)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  const navUrl = (url: string) => url
  const navClass = (url: string, isActive: boolean) => {
    if (role !== 'passenger') return isActive ? 'active' : undefined
    const active =
      url === '/passenger/journeys'
        ? [
            '/passenger/journeys',
            '/passenger/search',
            '/passenger/results',
            '/passenger/book',
            '/passenger/recurring',
            '/passenger/lines',
          ].some((p) => pathname === p || pathname.startsWith(`${p}/`))
        : url === '/passenger'
          ? pathname === url
          : pathname === url || pathname.startsWith(`${url}/`)
    return active ? 'active' : undefined
  }
  const pending = state.requests.filter((r) => r.status === 'pending').length
  return (
    <>
      <a href="#main" className="skip-link">
        Prejsť na obsah
      </a>
      <header className="header">
        <div className="header-inner">
          <Logo />
          {role !== 'dispatcher' && (
            <nav aria-label="Hlavná navigácia" className="desktop-nav">
              {nav.map(([url, label, Icon]) => (
                <NavLink
                  key={url}
                  end={url === `/${role}`}
                  to={navUrl(url)}
                  className={({ isActive }) => navClass(url, isActive)}
                >
                  <Icon size={17} />
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="header-actions">
            <label className="role-switch">
              <Settings2 size={15} />
              <span className="sr-only">Demonštračná rola</span>
              <select value={role} onChange={(e) => navigate(`/${e.target.value}`)}>
                <option value="passenger">Cestujúci</option>
                <option value="driver">Vodič</option>
                <option value="dispatcher">Dispečer</option>
              </select>
            </label>
            <button
              className="icon-button notification-button"
              onClick={() => setModal('notifications')}
              aria-label="Oznámenia"
            >
              <Bell size={20} />
              <i />
            </button>
            <Link
              to={role === 'dispatcher' ? '/dispatcher' : `/${role}/profile`}
              className="avatar"
              aria-label="Otvoriť profil"
            >
              {role === 'passenger'
                ? (state.people
                    .find((p) => p.id === 'me')
                    ?.name.split(' ')
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join('') ?? 'MC')
                : role === 'driver'
                  ? (state.drivers
                      .find((d) => d.id === state.activeDriverId)
                      ?.name.split(' ')
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join('') ?? 'MC')
                  : 'DK'}
            </Link>
          </div>
        </div>
      </header>
      <div
        className={`app-frame ${role === 'dispatcher' ? 'with-sidebar' : ''} ${mapPage ? 'map-frame' : ''}`}
      >
        {role === 'dispatcher' && (
          <aside className="sidebar">
            <p className="eyebrow">DISPEČERSKÉ CENTRUM</p>
            <nav aria-label="Navigácia dispečera">
              {nav.map(([url, label, Icon]) => (
                <NavLink key={url} to={url} end={url === '/dispatcher'}>
                  <Icon size={19} />
                  {label}
                  {url.endsWith('requests') && <span className="nav-count">{pending}</span>}
                </NavLink>
              ))}
            </nav>
          </aside>
        )}
        <main
          id="main"
          className={`main ${role === 'dispatcher' ? 'dispatcher-main' : role === 'passenger' ? 'passenger-main' : 'driver-main'} ${mapPage ? 'map-main' : ''}`}
          tabIndex={-1}
        >
          {storageWarning && (
            <div role="alert" className="notice warning">
              Prehliadač nepovolil uloženie. Zmeny fungujú do obnovenia stránky.
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <footer
        className={`footer ${role === 'dispatcher' ? 'dispatcher-footer' : ''} ${mapPage ? 'map-page-footer' : ''}`}
      >
        <span>
          © {new Date().getFullYear()} Moja Cesta
          {role !== 'dispatcher' && (
            <>
              <span className="footer-divider">/</span> Sme tu pre Zamagurie.
            </>
          )}
        </span>
        <div>
          <button onClick={() => setModal('help')}>
            <CircleHelp size={15} /> Pomoc
          </button>
          <button onClick={() => setModal('reset')}>
            <RotateCcw size={14} /> Obnoviť demo údaje
          </button>
          <span className="demo-label">
            <span /> Demonštračná verzia
          </span>
        </div>
      </footer>
      {role !== 'dispatcher' && (
        <nav className="bottom-nav" aria-label="Mobilná navigácia">
          {nav.map(([url, label, Icon]) => (
            <NavLink
              key={url}
              end={url === `/${role}`}
              to={navUrl(url)}
              className={({ isActive }) => navClass(url, isActive)}
            >
              <Icon size={21} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? 'toast-error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <CircleHelp size={21} /> : <Check size={21} />}
          <span>{toast.message}</span>
          <button className="icon-button" onClick={dismissToast} aria-label="Zavrieť oznámenie">
            <X size={17} />
          </button>
        </div>
      )}
      {modal === 'help' && (
        <Modal title="Ako funguje Moja Cesta" onClose={() => setModal(null)}>
          <HelpContent />
        </Modal>
      )}
      {modal === 'reset' && (
        <Modal title="Obnoviť demo údaje?" onClose={() => setModal(null)}>
          <p>
            Vaše skúšobné rezervácie, požiadavky a zmeny sa vymažú. Obnovia sa pôvodné demonštračné
            údaje pre všetky tri roly.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setModal(null)}>
              Ponechať zmeny
            </button>
            <button
              className="btn"
              onClick={() => {
                reset()
                setModal(null)
                navigate(`/${role}`)
              }}
            >
              <RotateCcw size={17} /> Obnoviť údaje
            </button>
          </div>
        </Modal>
      )}
      {modal === 'notifications' && (
        <Modal title="Vaše oznámenia" onClose={() => setModal(null)}>
          <div className="stack">
            <p className="muted">
              Aktuálny stav demonštračných ciest. Oznámenia sa neposielajú mimo aplikácie.
            </p>
            {role === 'passenger' &&
              state.notifications?.map((n) => (
                <div className="notification-item" key={n.id}>
                  <p>{n.text}</p>
                  <Link
                    onClick={() => setModal(null)}
                    className="text-link"
                    to="/passenger/journeys"
                  >
                    Zobraziť rezervácie
                  </Link>
                </div>
              ))}
            {role === 'passenger' ? (
              state.requests
                .filter((r) => r.members.length)
                .map((r) => (
                  <div className="notification-item" key={r.id}>
                    <Badge status={r.status} />
                    <p>
                      {state.stops.find((s) => s.id === r.from)?.village} →{' '}
                      {state.stops.find((s) => s.id === r.to)?.village}
                    </p>
                    <Link
                      onClick={() => setModal(null)}
                      to={`/passenger/requests/${r.id}`}
                      className="text-link"
                    >
                      Detail požiadavky <ArrowUpRight size={15} />
                    </Link>
                  </div>
                ))
            ) : (
              <p>
                {pending} požiadaviek čaká na spracovanie. Aktuálne je naplánovaných{' '}
                {state.trips.filter((t) => t.date === state.serviceDate).length} jázd.
              </p>
            )}
            {role === 'passenger' && (
              <Link
                onClick={() => setModal(null)}
                to="/passenger/journeys"
                className="btn btn-secondary"
              >
                Zobraziť moje cesty
              </Link>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
