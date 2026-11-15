import { useEffect, useMemo, useState } from 'react'
import {
  TransportMap,
  EMPTY_SELECTION,
  createGeoapifyGeocoder,
  createGeoapifyRouting,
  createOsrmRouting,
} from '../index'
import type { MapMode, MapSelection } from '../types'
import { loadState } from '../../../storage'
import { createPilotDemo } from './pilot-demo'
import connection from './public-connection.json'
import './fullscreen-demo.css'

export function FullscreenDemo() {
  const [state, setState] = useState(loadState)
  const [mode, setMode] = useState<MapMode>('network')
  const [selection, setSelection] = useState<MapSelection>(EMPTY_SELECTION)
  useEffect(() => {
    const update = () => setState(loadState())
    window.addEventListener('storage', update)
    window.addEventListener('focus', update)
    return () => {
      window.removeEventListener('storage', update)
      window.removeEventListener('focus', update)
    }
  }, [])
  const dataset = useMemo(() => createPilotDemo(state), [state])
  const apiKey = import.meta.env.VITE_MAP_GEOAPIFY_KEY as string | undefined
  const geocoder = useMemo(
    () => (apiKey ? createGeoapifyGeocoder({ apiKey, area: dataset.area }) : undefined),
    [apiKey, dataset.area],
  )
  const routing = useMemo(
    () =>
      apiKey
        ? createGeoapifyRouting({ apiKey })
        : createOsrmRouting({
            endpoint: import.meta.env.VITE_MAP_OSRM_URL || 'https://router.project-osrm.org',
          }),
    [apiKey],
  )
  return (
    <main className="fullscreen-map-demo">
      <TransportMap
        dataset={dataset}
        mode={mode}
        selection={selection}
        onSelectionChange={setSelection}
        geocoder={geocoder}
        routing={routing}
        onRequestOpen={(id) =>
          window.location.assign(`/passenger/requests/${encodeURIComponent(id)}`)
        }
      />
      <nav className="map-demo-floating-nav" aria-label="Režim mapy">
        <button type="button" aria-pressed={mode === 'network'} onClick={() => setMode('network')}>
          Trasy a požiadavky
        </button>
        <button
          type="button"
          aria-pressed={mode === 'place-picker'}
          onClick={() => setMode('place-picker')}
        >
          Vybrať miesto
        </button>
      </nav>
      <details className="map-demo-about">
        <summary aria-label="Informácie o ukážke">i</summary>
        <div>
          <strong>Moja Cesta · Prešovský kraj</strong>
          <p>Spišská Stará Ves, Havka, Zálesie, Jezersko, Lechnica, Veľká Lesná.</p>
          <p>
            Pôvodné verejné linky z dodaného GTFS nie sú zaradené. M1–M5 sú ukážky našej dopravy,
            T1–T5 celé cesty s prestupom do Popradu pre 16. 11. 2026. Cestné priebehy sú vypočítané
            cez OSRM; nejde o dopravcom publikované geometrie.
          </p>
          <p>
            Verejný autobus: 10:30 – 11:58, pracovný deň. V Reľove pokračuje bez ďalšieho prestupu.{' '}
            <a href={connection.sourceUrls[0]} target="_blank" rel="noreferrer">
              072828/24
            </a>
            {' + '}
            <a href={connection.sourceUrls[1]} target="_blank" rel="noreferrer">
              071828/24
            </a>
            . Košice: v nájdenom CP 802435 nie sú zverejnené odchody zo Spišskej Starej Vsi.
          </p>
          <p>
            Požiadavky: zdieľaný lokálny demo stav aplikácie. Čas je požadovaný odchod alebo
            príchod, nie potvrdený odchod vozidla. Súkromné body sú zovšeobecnené na verejné
            zastávky.
          </p>
          <p>
            Plná čiara: naša doprava / navrhovaný Flex. Prerušovaná: externá linka. Farebné úseky
            rozlišujú linky; farba nepotvrdzuje jazdu.
          </p>
          <a href="/passenger">Otvoriť aplikáciu →</a>
        </div>
      </details>
    </main>
  )
}
