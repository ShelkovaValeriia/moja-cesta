import { useMemo, useState } from 'react'
import { ArrowUpRight, BusFront, Check, MapPin, Route, Upload } from 'lucide-react'
import {
  TransportMap,
  PRESOVSKY_KRAJ,
  EMPTY_SELECTION,
  createGeoapifyGeocoder,
  createGeoapifyRouting,
  parseMapDataset,
} from '../index'
import type { MapDataset, MapMode, MapSelection, PlaceSelection, StopSelection } from '../types'
import pilot from './pilot-data.json'
import './demo.css'

const original = parseMapDataset(pilot.dataset)
const initialDataset: MapDataset = {
  ...original,
  area: { ...PRESOVSKY_KRAJ, focusLocations: original.area.focusLocations },
}
const modes: { id: MapMode; label: string }[] = [
  { id: 'network', label: 'Všetky trasy' },
  { id: 'route', label: 'Jedna trasa' },
  { id: 'stop-picker', label: 'Výber zastávky' },
  { id: 'place-picker', label: 'Výber adresy' },
]
export function MapPlayground() {
  const [dataset, setDataset] = useState(initialDataset)
  const [datasetRevision, setDatasetRevision] = useState(0)
  const [mode, setMode] = useState<MapMode>('network')
  const [selection, setSelection] = useState<MapSelection>(EMPTY_SELECTION)
  const [event, setEvent] = useState<PlaceSelection | StopSelection | null>(null)
  const [error, setError] = useState('')
  const [routing, setRouting] = useState(false)
  const apiKey = import.meta.env.VITE_MAP_GEOAPIFY_KEY as string | undefined
  const geocoder = useMemo(
    () => (apiKey ? createGeoapifyGeocoder({ apiKey, area: dataset.area }) : undefined),
    [apiKey, dataset.area],
  )
  const selected = dataset.routes.find((r) => r.id === selection.routeId)
  async function loadFile(file: File | undefined) {
    if (!file) return
    try {
      if (file.size > 10_000_000) throw new Error('Súbor je príliš veľký. Použite najviac 10 MB.')
      const json = JSON.parse(await file.text())
      setDataset(parseMapDataset(json.dataset ?? json))
      setDatasetRevision((current) => current + 1)
      setSelection(EMPTY_SELECTION)
      setEvent(null)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Súbor sa nepodarilo načítať.')
    }
  }
  async function roadPreview() {
    if (!apiKey || !selected) return
    setRouting(true)
    setError('')
    try {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 20000)
      try {
        const positions = selected.stops.map(
          (s) => dataset.stops.find((stop) => stop.id === s.stopId)!.position,
        )
        const result = await createGeoapifyRouting({ apiKey }).route(
          positions,
          'drive',
          controller.signal,
        )
        setDataset((current) => ({
          ...current,
          routes: current.routes.map((r) =>
            r.id === selected.id
              ? { ...r, geometry: result.geometry, geometrySource: 'computed' }
              : r,
          ),
        }))
      } finally {
        window.clearTimeout(timer)
      }
    } catch {
      setError('Cestný náhľad sa nepodarilo vypočítať. Orientačná spojnica zostáva dostupná.')
    } finally {
      setRouting(false)
    }
  }
  return (
    <div className="map-demo-page">
      <header className="map-demo-header">
        <a className="map-demo-brand" href="/map.html">
          <span>
            <Route size={22} />
          </span>
          moja cesta<span className="map-demo-brand-dot">.</span>
        </a>
        <a className="map-demo-app-link" href="/passenger">
          Aplikácia
          <ArrowUpRight size={16} />
        </a>
      </header>
      <main>
        <div className="map-demo-intro">
          <div>
            <p>MAPOVÝ MODUL · PREŠOVSKÝ KRAJ</p>
            <h1>Všetky cesty na jednom mieste.</h1>
            <span>{dataset.name}. Vyberte trasu, zastávku alebo miesto.</span>
          </div>
          <span className="map-demo-pill">
            <span />
            Samostatný náhľad
          </span>
        </div>
        <div className="map-demo-focus" aria-label="Pilotné lokality">
          {dataset.area.focusLocations.map((location) => (
            <span key={location.id}>
              {location.kind === 'city' ? <BusFront size={13} /> : <MapPin size={12} />}
              {location.name}
            </span>
          ))}
        </div>
        <div className="map-demo-modes" aria-label="Režim mapy">
          {modes.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={mode === item.id}
              onClick={() => {
                setMode(item.id)
                setEvent(null)
              }}
            >
              {item.label}
            </button>
          ))}
          <label className="map-demo-upload">
            <Upload size={15} />
            <span>Vlastné dáta</span>
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Načítať vlastné mapové dáta"
              onChange={(e) => {
                void loadFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        </div>
        <TransportMap
          key={datasetRevision}
          dataset={dataset}
          mode={mode}
          selection={selection}
          onSelectionChange={setSelection}
          geocoder={geocoder}
          onStopSelect={setEvent}
          onPlaceConfirm={setEvent}
        />
        {selected && (
          <div className="map-demo-road">
            <span>Publikovanú trasu nemeníme. Cestný náhľad je iba vypočítaný návrh.</span>
            <button
              type="button"
              disabled={!apiKey || routing || selected.geometrySource === 'computed'}
              onClick={() => {
                void roadPreview()
              }}
            >
              {routing
                ? 'Počíta sa…'
                : selected.geometrySource === 'computed'
                  ? 'Cestný náhľad zobrazený'
                  : 'Vypočítať cestný náhľad'}
            </button>
            {!apiKey && <small>Vyžaduje pripojenie geografickej služby.</small>}
          </div>
        )}
        {error && (
          <p className="map-demo-error" role="alert">
            {error}
          </p>
        )}
        {event && (
          <section className="map-demo-result" aria-live="polite">
            <Check size={19} />
            <div>
              <strong>{'stop' in event ? 'Vybraná zastávka' : 'Potvrdené miesto'}</strong>
              <p>{'stop' in event ? event.stop.name : event.label}</p>
              <details>
                <summary>Údaje pre integráciu</summary>
                <pre>{JSON.stringify(event, null, 2)}</pre>
              </details>
            </div>
          </section>
        )}
        <details className="map-demo-provenance">
          <summary>O dátach a hraniciach ukážky</summary>
          <p>
            Východiskové dáta: dodané GTFS, Transdata, verzia {pilot.provenance.version}, platnosť
            1. 11. 2025 – 9. 2. 2026. Nejde o aktuálny cestovný poriadok ani o našu flotilu. Import
            zachováva 16 smerových variantov a 88 zastávok vrátane medzizastávok mimo pilotných
            obcí. Údaje neobsahujú cestné geometrie; prerušované spojnice nie sú cestné trasy.
            Obálka kraja slúži na zobrazenie a nepredstavuje presnú administratívnu hranicu.
            Importované vlastné dáta zostávajú iba v tejto karte.
          </p>
          <p>
            Adresy a cestné náhľady sa pripájajú cez VITE_MAP_GEOAPIFY_KEY. Bez kľúča funguje mapa,
            výber trás, zastávok a presného bodu s vlastným názvom.
          </p>
        </details>
      </main>
      <footer className="map-demo-footer">
        Moja Cesta · Bližšie k sebe.<span>Mapový modul · interaktívny prototyp</span>
      </footer>
    </div>
  )
}
