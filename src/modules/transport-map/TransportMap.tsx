import { SlovakDateInput } from './SlovakDateInput'
import { formatSlovakDate } from './locale'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BusFront,
  Check,
  ChevronRight,
  Crosshair,
  Layers3,
  LocateFixed,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { DEFAULT_TILES, EMPTY_FILTERS, EMPTY_SELECTION } from './config'
import {
  boundsOf,
  boundsOfRoutes,
  filterRoutes,
  formatPoint,
  formatStopCount,
  formatPatternCount,
  normalizeText,
  pointKey,
  routeStops,
  validPoint,
  validSelection,
  routeColor,
  stopLabel,
  segmentColor,
} from './model'
import { useAddressSearch, useReverseAddress } from './useAddresses'
import { useRoadRoutes } from './useRoadRoutes'
import type { CameraRequest } from './MapCanvas'
import type {
  MapBounds,
  MapFilters,
  MapPoint,
  MapSelection,
  PlaceSelection,
  StopSelection,
  TransportMapProps,
} from './types'
import './transport-map.css'
import './fullscreen.css'

const Canvas = lazy(() => import('./MapCanvas'))
const kindLabel = { fixed: 'Pravidelný spoj', flex: 'Flex', external: 'Regionálna linka' }
const statusLabel = {
  approved: 'Schválená zastávka',
  proposed: 'Neschválený návrh',
  demo: 'Ukážková zastávka',
  external: 'Zastávka verejnej dopravy',
}

export function TransportMap({
  dataset: suppliedDataset,
  mode = 'network',
  selection: controlledSelection,
  initialSelection,
  filters: controlledFilters,
  onSelectionChange,
  onFiltersChange,
  onRouteSelect,
  onRequestOpen,
  onStopSelect,
  onPlaceConfirm,
  geocoder,
  routing,
  tiles = DEFAULT_TILES,
  isPlaceAllowed,
  className = '',
  renderCard,
  cardLabel,
  chrome = 'browse',
  height = 'viewport',
}: TransportMapProps) {
  const [ownSelection, setOwnSelection] = useState<MapSelection>({
    ...EMPTY_SELECTION,
    ...initialSelection,
  })
  const roads = useRoadRoutes(
    suppliedDataset,
    routing,
    (controlledSelection ?? ownSelection).routeId,
  )
  const dataset = roads.dataset
  const [ownFilters, setOwnFilters] = useState<MapFilters>(EMPTY_FILTERS)
  const [camera, setCamera] = useState<CameraRequest | null>(null)
  const [tileError, setTileError] = useState(false)
  const [placeQuery, setPlaceQuery] = useState('')
  const [manualLabel, setManualLabel] = useState('')
  const [coordinateDraft, setCoordinateDraft] = useState({ latitude: '', longitude: '' })
  const [locationError, setLocationError] = useState('')
  const [locating, setLocating] = useState(false)
  const [confirmedKey, setConfirmedKey] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [cardView, setCardView] = useState<'routes' | 'stops'>('routes')
  const panel = useRef<HTMLElement>(null)
  const filters = controlledFilters ?? ownFilters
  const selection = validSelection(dataset, controlledSelection ?? ownSelection)
  const visible = useMemo(() => filterRoutes(dataset, filters), [dataset, filters])
  const route = visible.find((r) => r.id === selection.routeId)
  const current = route ? selection : { ...selection, routeId: null, stopOccurrenceId: null }
  const pickPlace = mode === 'place-picker'
  useEffect(() => {
    panel.current?.scrollTo?.({ top: 0 })
  }, [current.routeId, current.stopOccurrenceId, pickPlace, cardView])
  const displayedRoutes = !pickPlace && route ? [route] : []
  const municipalities = [...new Set(dataset.stops.map((s) => s.municipality))].sort((a, b) =>
    a.localeCompare(b, 'sk'),
  )
  const reverse = useReverseAddress(
    pickPlace && selection.place?.source !== 'stop' ? selection.place?.position : undefined,
    geocoder,
  )
  const addressSearch = useAddressSearch(pickPlace ? placeQuery : '', geocoder)
  const stopMatches = placeQuery.trim()
    ? dataset.stops
        .filter((s) => normalizeText(s.name).includes(normalizeText(placeQuery)))
        .slice(0, 5)
    : []
  const selectedOccurrence =
    route &&
    routeStops(route, dataset.stops).find((s) => s.occurrenceId === current.stopOccurrenceId)
  const placeAllowed =
    !!selection.place && (!isPlaceAllowed || isPlaceAllowed(selection.place.position))

  function select(next: MapSelection) {
    setOwnSelection(next)
    onSelectionChange?.(next)
  }
  function chooseRoute(id: string | null) {
    setCardView(id ? 'stops' : 'routes')
    select({ ...selection, routeId: id, stopOccurrenceId: null })
    onRouteSelect?.(id)
  }
  function changeFilters(patch: Partial<MapFilters>) {
    const next = { ...filters, ...patch }
    setOwnFilters(next)
    onFiltersChange?.(next)
    if (current.routeId && !filterRoutes(dataset, next).some((r) => r.id === current.routeId))
      chooseRoute(null)
  }
  function pick(position: MapPoint) {
    if (
      !validPoint(position) ||
      (selection.place && pointKey(selection.place.position) === pointKey(position))
    )
      return
    const next: MapSelection = {
      ...selection,
      place: { position, label: 'Vybrané miesto na mape', source: 'map' },
    }
    setOwnSelection(next)
    onSelectionChange?.(next)
    setManualLabel('')
    setLocationError('')
  }
  function lookAt(bounds?: MapBounds | null, point?: MapPoint) {
    if (bounds || point)
      setCamera((old) => ({ token: (old?.token ?? 0) + 1, bounds: bounds ?? undefined, point }))
  }
  function chooseStop(stopSelection: StopSelection) {
    setCardView('stops')
    select({
      ...selection,
      routeId: stopSelection.routeId,
      stopOccurrenceId: stopSelection.occurrenceId,
    })
    onStopSelect?.(stopSelection)
  }
  function choosePlace(place: PlaceSelection) {
    select({ ...selection, place })
    setManualLabel('')
    setPlaceQuery('')
    setLocationError('')
    lookAt(undefined, place.position)
  }
  function locate() {
    setLocationError('')
    if (!navigator.geolocation) {
      setLocationError('Tento prehliadač nepodporuje určenie polohy. Vyberte bod na mape.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        const point = { latitude: position.coords.latitude, longitude: position.coords.longitude }
        if (pickPlace) choosePlace({ position: point, label: 'Moja poloha', source: 'geolocation' })
        else lookAt(undefined, point)
      },
      () => {
        setLocating(false)
        setLocationError(
          'Polohu sa nepodarilo získať. Povoľte ju v prehliadači alebo vyberte miesto ručne.',
        )
      },
      { timeout: 10000, maximumAge: 30000 },
    )
  }
  const finalPlace: PlaceSelection | null = selection.place
    ? {
        ...selection.place,
        label:
          manualLabel.trim() ||
          (selection.place.source === 'stop'
            ? selection.place.label
            : (reverse.result?.label ?? selection.place.label)),
        address: selection.place.address ?? reverse.result?.label,
        addressPrecision: selection.place.addressPrecision ?? reverse.result?.precision,
      }
    : null
  const focusedBounds = boundsOf(dataset.area.focusLocations.map((p) => p.position))
  const hasSchematics = displayedRoutes.some((r) => r.geometrySource === 'schematic')

  const notices = (tileError || locationError || roads.missing > 0) && (
    <div className="tm-bottom-notices" role="status">
      {tileError && (
        <p>
          {chrome === 'map'
            ? 'Mapový podklad sa nepodarilo načítať.'
            : 'Mapový podklad sa nepodarilo úplne načítať. Zoznam trás, zastávok a zadanie súradníc zostávajú dostupné.'}
        </p>
      )}
      {locationError && <p>{locationError}</p>}
      {roads.missing > 0 && (
        <p>
          {roads.failed || !routing
            ? chrome === 'map'
              ? 'Cestnú trasu sa nepodarilo načítať.'
              : 'Niektoré cestné trasy sa nepodarilo načítať. Zoznam zostáva dostupný.'
            : 'Počítajú sa trasy po cestách…'}
          {!!roads.failed && (
            <button type="button" onClick={roads.retry}>
              Skúsiť znova
            </button>
          )}
        </p>
      )}
    </div>
  )

  return (
    <section
      className={`tm-shell ${expanded ? 'tm-expanded' : ''} tm-${chrome} tm-height-${height} ${className}`}
      aria-label="Mapa dopravy"
    >
      {chrome === 'browse' && (
        <div className="tm-toolbar">
          <div className="tm-area">
            <span className="tm-area-icon">
              <MapPin size={19} />
            </span>
            <div>
              <span className="tm-eyebrow">OBJAVTE SPOJENIA</span>
              <strong>{dataset.area.name}</strong>
            </div>
          </div>
          <div className="tm-view-actions">
            {!!dataset.area.focusLocations.length && (
              <button type="button" onClick={() => lookAt(focusedBounds)}>
                <Crosshair size={17} />
                <span>Pilotná oblasť</span>
              </button>
            )}
            <button type="button" onClick={() => lookAt(dataset.area.bounds)}>
              <Layers3 size={17} />
              <span>Celý kraj</span>
            </button>
          </div>
        </div>
      )}
      {chrome === 'browse' && !renderCard && !pickPlace && mode === 'network' && (
        <div className="tm-filters">
          <label className="tm-search">
            <Search size={18} />
            <input
              aria-label="Hľadať linku, obec alebo zastávku"
              placeholder="Linka, obec alebo zastávka"
              value={filters.query}
              onChange={(e) => changeFilters({ query: e.target.value })}
            />
            {filters.query && (
              <button
                type="button"
                aria-label="Vymazať hľadanie"
                onClick={() => changeFilters({ query: '' })}
              >
                <X size={17} />
              </button>
            )}
          </label>
          <details className="tm-filter-details">
            <summary>
              <SlidersHorizontal size={17} />
              Filtre{filters.kind !== 'all' || filters.municipality || filters.date ? ' •' : ''}
            </summary>
            <div className="tm-filter-fields">
              <label>
                Zobraziť
                <select
                  value={filters.layer ?? 'all'}
                  onChange={(e) => changeFilters({ layer: e.target.value as MapFilters['layer'] })}
                >
                  <option value="all">Spoje aj požiadavky</option>
                  <option value="routes">Iba spoje</option>
                  <option value="requests">Iba požiadavky</option>
                </select>
              </label>
              <label>
                Typ linky
                <select
                  value={filters.kind}
                  onChange={(e) => changeFilters({ kind: e.target.value as MapFilters['kind'] })}
                >
                  <option value="all">Všetky linky</option>
                  <option value="fixed">Pravidelné spoje</option>
                  <option value="flex">Flex</option>
                  <option value="external">Regionálne linky</option>
                </select>
              </label>
              <label>
                Obec na trase
                <select
                  value={filters.municipality}
                  onChange={(e) => changeFilters({ municipality: e.target.value })}
                >
                  <option value="">Všetky obce</option>
                  {municipalities.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label>
                Dátum premávky
                <SlovakDateInput
                  value={filters.date}
                  onValueChange={(value) => changeFilters({ date: value })}
                />
              </label>
              <small>Trasy bez známeho kalendára sa pri výbere dátumu nezobrazia.</small>
              <div className="tm-time-range">
                <label>
                  Čas od
                  <input
                    aria-label="Čas od"
                    type="text"
                    inputMode="numeric"
                    pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                    placeholder="00:00"
                    value={filters.timeFrom ?? ''}
                    onChange={(e) => changeFilters({ timeFrom: e.target.value })}
                  />
                </label>
                <label>
                  Čas do
                  <input
                    aria-label="Čas do"
                    type="text"
                    inputMode="numeric"
                    pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                    placeholder="23:59"
                    value={filters.timeTo ?? ''}
                    onChange={(e) => changeFilters({ timeTo: e.target.value })}
                  />
                </label>
              </div>
              {filters.timeFrom && filters.timeTo && filters.timeFrom > filters.timeTo && (
                <small role="alert">Čas do musí nasledovať po čase od v zvolenom dni.</small>
              )}
              <small>
                Pri požiadavkách filtrujeme požadovaný čas odchodu alebo príchodu. Záujem ešte nie
                je potvrdená jazda.
              </small>
              <button type="button" onClick={() => changeFilters(EMPTY_FILTERS)}>
                Zrušiť filtre
              </button>
            </div>
          </details>
        </div>
      )}
      <div className="tm-main">
        <div className={`tm-map-frame ${pickPlace ? 'tm-picking' : ''}`}>
          <Suspense
            fallback={
              <div className="tm-loading" role="status">
                Načítava sa mapa…
              </div>
            }
          >
            <Canvas
              key={dataset.area.id}
              dataset={dataset}
              routes={displayedRoutes}
              selection={current}
              pickPlace={pickPlace}
              tiles={tiles}
              camera={camera}
              onPick={pick}
              onRouteClick={chooseRoute}
              onStop={chooseStop}
              onTileError={() => setTileError(true)}
              onPlaceStop={(stop) =>
                choosePlace({
                  position: stop.position,
                  label: stop.name,
                  source: 'stop',
                  stopId: stop.id,
                })
              }
              topPadding={chrome === 'browse' ? 180 : 100}
              bottomPadding={chrome === 'map' ? 32 : undefined}
            />
          </Suspense>
          <div className="tm-map-buttons">
            {chrome === 'browse' && (
              <button
                type="button"
                aria-label="Moja poloha"
                title="Moja poloha"
                onClick={locate}
                disabled={locating}
              >
                <LocateFixed size={21} />
              </button>
            )}
            <button
              type="button"
              aria-label="Zobraziť všetky viditeľné trasy"
              title="Zobraziť viditeľné trasy"
              onClick={() =>
                lookAt(
                  boundsOfRoutes(displayedRoutes, dataset.stops) ??
                    focusedBounds ??
                    dataset.area.bounds,
                )
              }
            >
              <Crosshair size={21} />
            </button>
          </div>
          {pickPlace && (
            <div className="tm-center-pin" aria-hidden="true">
              <MapPin size={42} fill="currentColor" />
            </div>
          )}
          {pickPlace && (
            <div className="tm-map-hint">Posuňte mapu pod špendlíkom alebo kliknite na miesto</div>
          )}
          {!pickPlace && chrome !== 'map' && (
            <div className="tm-map-legend">
              <span className="tm-legend-line tm-managed-line" />
              Naša doprava
              <span className="tm-legend-line" />
              Existujúce linky
            </div>
          )}
        </div>
        <aside
          hidden={chrome === 'map'}
          ref={panel}
          className="tm-panel"
          aria-label={cardLabel ?? (pickPlace ? 'Výber miesta' : 'Trasy a zastávky')}
        >
          <button
            className="tm-sheet-handle"
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? 'Zmenšiť kartu' : 'Rozbaliť kartu'}
            onClick={() => setExpanded(!expanded)}
          >
            <span />
            {expanded ? 'Zmenšiť' : 'Viac informácií'}
          </button>
          {chrome === 'compact' && notices}
          {renderCard ? (
            renderCard({
              dataset,
              routes: visible,
              route,
              selection: current,
              view: cardView,
              selectRoute: chooseRoute,
              selectStop: chooseStop,
              showRoutes: () => {
                setCardView('routes')
                select({ ...selection, stopOccurrenceId: null })
              },
              showStops: () => setCardView('stops'),
            })
          ) : pickPlace ? (
            <>
              <div className="tm-panel-heading">
                <MapPin size={23} />
                <div>
                  <h2>Vyberte miesto</h2>
                  <p>Adresa alebo presný bod na mape</p>
                </div>
              </div>
              <label className="tm-search">
                <Search size={18} />
                <input
                  aria-label="Vyhľadať adresu alebo zastávku"
                  placeholder="Zadajte adresu alebo zastávku"
                  value={placeQuery}
                  onChange={(e) => setPlaceQuery(e.target.value)}
                />
              </label>
              {addressSearch.loading && (
                <p role="status" className="tm-muted">
                  Hľadajú sa adresy…
                </p>
              )}
              {(stopMatches.length > 0 || addressSearch.results.length > 0) && (
                <ul className="tm-address-results" aria-label="Nájdené miesta">
                  {stopMatches.map((stop) => (
                    <li key={stop.id}>
                      <button
                        type="button"
                        onClick={() =>
                          choosePlace({
                            position: stop.position,
                            label: stop.name,
                            source: 'stop',
                            stopId: stop.id,
                          })
                        }
                      >
                        <BusFront size={18} />
                        <span>
                          {stop.name}
                          <small>{statusLabel[stop.status]}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                  {addressSearch.results.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        onClick={() =>
                          choosePlace({
                            position: result.position,
                            label: result.label,
                            address: result.label,
                            addressPrecision: result.precision,
                            source: 'search',
                          })
                        }
                      >
                        <MapPin size={18} />
                        <span>
                          {result.label}
                          <small>
                            {result.precision === 'building'
                              ? 'Budova / adresa'
                              : 'Približná poloha · skontrolujte bod'}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {placeQuery.trim().length >= 3 &&
                !addressSearch.loading &&
                !addressSearch.results.length &&
                !stopMatches.length && (
                  <p className="tm-muted">
                    Nenašli sa žiadne miesta. Bod môžete vybrať priamo na mape.
                  </p>
                )}
              {!geocoder && (
                <p className="tm-note">
                  Vyhľadávanie adries nie je pripojené. Funguje výber bodu a vyhľadanie zastávok;
                  názov môžete doplniť ručne.
                </p>
              )}
              {addressSearch.error && (
                <p className="tm-notice" role="alert">
                  {addressSearch.error}
                </p>
              )}
              <div className="tm-place-summary" aria-live="polite">
                <span className="tm-eyebrow">VYBRANÉ MIESTO</span>
                <strong>{finalPlace?.label ?? 'Vyberte bod na mape'}</strong>
                {finalPlace && (
                  <>
                    <span className="tm-coordinates">{formatPoint(finalPlace.position)}</span>
                    <small>
                      {finalPlace.stopId
                        ? statusLabel[
                            dataset.stops.find((s) => s.id === finalPlace.stopId)?.status ??
                              'proposed'
                          ]
                        : 'Vlastný bod · nie je schválenou zastávkou'}
                    </small>
                  </>
                )}
                {reverse.loading && <small>Zisťuje sa adresa…</small>}
                {reverse.result && (
                  <small>Adresa je orientačná. Rozhoduje presný vybraný bod.</small>
                )}
                {reverse.error && <small>{reverse.error} Súradnice zostávajú zachované.</small>}
              </div>
              <label className="tm-field">
                Vlastný názov miesta <small>(nepovinné)</small>
                <input
                  value={manualLabel}
                  onChange={(e) => setManualLabel(e.target.value)}
                  maxLength={200}
                  placeholder="Napríklad pri hlavnom vchode"
                />
              </label>
              <details className="tm-coordinates-form">
                <summary>Zadať súradnice ručne</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const point = {
                      latitude: Number(coordinateDraft.latitude),
                      longitude: Number(coordinateDraft.longitude),
                    }
                    if (
                      !coordinateDraft.latitude.trim() ||
                      !coordinateDraft.longitude.trim() ||
                      !validPoint(point)
                    ) {
                      setLocationError('Vyplňte obe platné súradnice.')
                      return
                    }
                    choosePlace({ position: point, label: 'Vybrané miesto na mape', source: 'map' })
                  }}
                >
                  <label>
                    Šírka
                    <input
                      aria-label="Zemepisná šírka"
                      type="number"
                      step="any"
                      value={coordinateDraft.latitude}
                      onChange={(e) =>
                        setCoordinateDraft({ ...coordinateDraft, latitude: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Dĺžka
                    <input
                      aria-label="Zemepisná dĺžka"
                      type="number"
                      step="any"
                      value={coordinateDraft.longitude}
                      onChange={(e) =>
                        setCoordinateDraft({ ...coordinateDraft, longitude: e.target.value })
                      }
                    />
                  </label>
                  <button type="submit">Zobraziť bod</button>
                </form>
              </details>
              {!!selection.place && !placeAllowed && (
                <p className="tm-notice" role="alert">
                  Toto miesto je mimo podporovanej oblasti. Vyberte iný bod.
                </p>
              )}
              <button
                className="tm-primary"
                type="button"
                disabled={!finalPlace || !placeAllowed}
                onClick={() => {
                  if (finalPlace && placeAllowed) {
                    onPlaceConfirm?.(finalPlace)
                    setConfirmedKey(JSON.stringify(finalPlace))
                  }
                }}
              >
                <Check size={19} />
                Potvrdiť miesto
              </button>
              {finalPlace && confirmedKey === JSON.stringify(finalPlace) && (
                <p className="tm-success" role="status">
                  Miesto bolo vybrané. Výber bodu nepotvrdzuje jazdu.
                </p>
              )}
              {geocoder && <small className="tm-provider">{geocoder.attribution}</small>}
            </>
          ) : selectedOccurrence && route ? (
            <>
              <button
                type="button"
                className="tm-back"
                onClick={() => select({ ...selection, stopOccurrenceId: null })}
              >
                <ArrowLeft size={17} />
                Späť na trasu
              </button>
              <span className="tm-eyebrow">
                ZASTÁVKA · {selectedOccurrence.index + 1}. NA TRASE
              </span>
              <h2>{stopLabel(route, selectedOccurrence.index, selectedOccurrence.stop)}</h2>
              {route.kind !== 'external' && <p>{selectedOccurrence.stop.municipality}</p>}
              <p>{statusLabel[selectedOccurrence.stop.status]}</p>
              {selectedOccurrence.time && (
                <p>
                  Plánovaný čas: <time>{selectedOccurrence.time}</time>
                </p>
              )}
              <p className="tm-muted">{formatPoint(selectedOccurrence.stop.position)}</p>
              <div className="tm-selected-stop" role="status">
                Vybraná zastávka:{' '}
                <strong>
                  {stopLabel(route, selectedOccurrence.index, selectedOccurrence.stop)}
                </strong>
              </div>
              <h3>Linky cez túto zastávku</h3>
              <ul className="tm-route-list">
                {visible
                  .filter((r) => r.stops.some((s) => s.stopId === selectedOccurrence.stop.id))
                  .map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => chooseRoute(r.id)}>
                        <span className="tm-route-code" style={{ color: routeColor(r) }}>
                          {r.code}
                        </span>
                        <span>{r.direction}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          ) : route && (cardView === 'stops' || mode === 'route' || mode === 'stop-picker') ? (
            <>
              {mode === 'network' && (
                <button
                  type="button"
                  className="tm-back"
                  onClick={() => {
                    setCardView('routes')
                    select({ ...selection, stopOccurrenceId: null })
                  }}
                >
                  <ArrowLeft size={17} />
                  Všetky trasy
                </button>
              )}
              <div className="tm-route-heading">
                <span className="tm-route-code" style={{ color: routeColor(route) }}>
                  {route.code}
                </span>
                <span className="tm-tag">
                  {route.request
                    ? 'Požiadavka na spoj'
                    : route.segments
                      ? 'Cesta s prestupom'
                      : kindLabel[route.kind]}
                </span>
              </div>
              <h2>
                {route.direction.split(' → ')[0]}
                <ArrowRight className="tm-heading-arrow" size={18} />
                {route.direction.split(' → ').slice(1).join(' → ') || route.name}
              </h2>
              <p className="tm-muted">
                {route.segments
                  ? `${route.stops.length} body na mape · úplný rozpis verejných zastávok nižšie`
                  : formatStopCount(route.stops.length)}{' '}
                ·{' '}
                {route.geometrySource === 'schematic'
                  ? 'cestná trasa zatiaľ nie je dostupná'
                  : route.geometrySource === 'computed'
                    ? 'vypočítaný cestný náhľad'
                    : 'publikovaná trasa'}
              </p>
              {route.request && (
                <div className="tm-request-detail">
                  <p>
                    Verejné body iba zovšeobecňujú obce. Skutočné miesto nástupu preverí dispečer.
                  </p>
                  <strong>
                    {route.request.status === 'pending'
                      ? 'Čaká na posúdenie · jazda nie je potvrdená'
                      : 'Schválená požiadavka v demo systéme'}
                  </strong>
                  <p>
                    {formatSlovakDate(route.request.date)} ·{' '}
                    {route.request.timeMode === 'arrival' ? 'Príchod do' : 'Odchod'}{' '}
                    {route.request.time} · {route.request.passengers} záujemcov
                  </p>
                  {onRequestOpen && (
                    <button
                      className="tm-primary"
                      type="button"
                      onClick={() => onRequestOpen(route.request!.id)}
                    >
                      Detail požiadavky
                    </button>
                  )}
                </div>
              )}
              {route.kind === 'external' && (
                <p className="tm-note">
                  Regionálna linka iného dopravcu. Mapa nepotvrdzuje aktuálnu premávku ani
                  rezerváciu miesta.
                </p>
              )}
              {route.demoNote && <p className="tm-note">{route.demoNote}</p>}
              {route.segments?.map((segment, index) => (
                <section
                  key={segment.id}
                  className="tm-segment"
                  style={{ borderColor: segmentColor(index) }}
                >
                  <strong>
                    {index + 1}. {segment.name}
                  </strong>
                  <span>
                    {segment.departure} – {segment.arrival} · {segment.code}
                  </span>
                  <small>
                    {segment.demo
                      ? 'Ukážkový úsek našej dopravy · nejde o potvrdenú jazdu'
                      : 'Verejný autobus · rezervácia miesta nie je súčasťou ukážky'}
                  </small>
                  {segment.sourceUrl && (
                    <a href={segment.sourceUrl} target="_blank" rel="noreferrer">
                      Cestovný poriadok dopravcu
                    </a>
                  )}
                  {!!segment.timetableStops?.length && (
                    <details>
                      <summary>Všetky zastávky verejného autobusu</summary>
                      <ol>
                        {segment.timetableStops.map((stop, i) => (
                          <li key={i}>
                            {stop.name} · <time>{stop.time}</time>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </section>
              ))}
              <ol className="tm-stop-list">
                {routeStops(route, dataset.stops).map(({ occurrenceId, index, stop, time }) => (
                  <li key={occurrenceId}>
                    <button
                      type="button"
                      aria-pressed={current.stopOccurrenceId === occurrenceId}
                      onClick={() => chooseStop({ routeId: route.id, occurrenceId, index, stop })}
                    >
                      <span className="tm-stop-number">{index + 1}</span>
                      <span>
                        {stopLabel(route, index, stop)}
                        {route.kind !== 'external' && <small>{stop.municipality}</small>}
                        <small>{statusLabel[stop.status]}</small>
                      </span>
                      {time && <time>{time}</time>}
                      {current.stopOccurrenceId === occurrenceId && <Check size={17} />}
                    </button>
                  </li>
                ))}
              </ol>
              {selectedOccurrence && (
                <div className="tm-selected-stop" role="status">
                  <Check size={18} />
                  <span>
                    Vybraná zastávka:{' '}
                    <strong>
                      {stopLabel(route, selectedOccurrence.index, selectedOccurrence.stop)}
                    </strong>
                    <small>{formatPoint(selectedOccurrence.stop.position)}</small>
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="tm-panel-heading">
                <BusFront size={22} />
                <div>
                  <h2>
                    {mode === 'stop-picker'
                      ? 'Najprv vyberte trasu'
                      : mode === 'route'
                        ? 'Vyberte trasu'
                        : 'Trasy v okolí'}
                  </h2>
                  <p>{formatPatternCount(visible.length)}</p>
                </div>
              </div>
              <div className="tm-layer-tabs" aria-label="Obsah mapy">
                {(
                  [
                    ['all', 'Všetko'],
                    ['routes', 'Spoje'],
                    ['requests', 'Požiadavky'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={(filters.layer ?? 'all') === value}
                    onClick={() => changeFilters({ layer: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ul className="tm-route-list">
                {visible.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      aria-pressed={r.id === current.routeId}
                      onClick={() => chooseRoute(r.id)}
                    >
                      <span className="tm-route-code" style={{ color: routeColor(r) }}>
                        {r.code}
                      </span>
                      <span className="tm-route-info">
                        <strong>{r.direction}</strong>
                        <small>
                          {r.request
                            ? `${r.request.status === 'pending' ? 'Nepotvrdená požiadavka' : 'Schválená požiadavka'} · ${formatSlovakDate(r.request.date)} ${r.request.time} · ${r.request.passengers} záujemcov`
                            : r.segments
                              ? `Ukážka s prestupom · ${r.segments.length} úseky · ${r.departures?.[0] ? formatSlovakDate(r.departures[0].date) + ' ' + r.departures[0].time : ''}`
                              : `${r.demoNote ? 'Ukážkový spoj' : kindLabel[r.kind]} · ${formatStopCount(r.stops.length)}${r.departures?.[0] ? ' · ' + formatSlovakDate(r.departures[0].date) + ' ' + r.departures[0].time : ''}`}
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  </li>
                ))}
              </ul>
              {!visible.length && (
                <div className="tm-empty">
                  <Search size={28} />
                  <h3>Žiadne zodpovedajúce trasy</h3>
                  <p>
                    Skúste inú obec alebo zrušte filtre. Neznámy kalendár nie je potvrdená premávka.
                  </p>
                  <button type="button" onClick={() => changeFilters(EMPTY_FILTERS)}>
                    Zrušiť filtre
                  </button>
                </div>
              )}
              <p className="tm-note">
                Vyberte trasu v zozname. Opätovným kliknutím na vybranú trasu otvoríte jej zastávky.
              </p>
            </>
          )}
        </aside>
      </div>
      {chrome !== 'compact' && notices}
      <div className="tm-footer" hidden={chrome === 'map'}>
        <span>{dataset.demo ? 'Demonštračné zobrazenie' : dataset.name}</span>
        <span>
          {hasSchematics
            ? 'Chýbajúce cestné trasy sa nezobrazujú'
            : 'Výber na mape nie je rezervácia'}
        </span>
      </div>
    </section>
  )
}
