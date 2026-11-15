import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, Upload, FlaskConical, BusFront } from 'lucide-react'
import { TransportMap } from '../modules/transport-map'
import { parseMapDataset } from '../modules/transport-map/validation'
import type { MapCardContext, MapDataset } from '../modules/transport-map'
import type { Bundle, WorkerRequest, WorkerResponse } from '../planning/worker-types'
import type { Journey, Metrics, Scenario, Strategy } from '../planning/types'
import { EconomicsEditor } from '../planning/EconomicsEditor'
import { exportScenario } from '../planning/io'
import { slovakCount, timeLabel } from '../planning/presentation'
import { dateLabel } from '../data'
import { TimePicker } from '../components/TimePicker'
import '../planning/scenarios.css'

const strategyLabels: Record<Strategy, string> = {
  fixed: 'Iba pravidelné',
  hybrid: 'Pravidelné + Flex',
  transfers: 'Hybrid + regionálny model',
}
const format = (n: number, digits = 0) =>
  n.toLocaleString('sk-SK', { maximumFractionDigits: digits })
const money = (n: number | null | undefined) =>
  n == null ? 'Nezadané' : n.toLocaleString('sk-SK', { style: 'currency', currency: 'EUR' })
type View = 'routes' | 'comparison' | 'coverage' | 'journeys' | 'sources' | 'unserved'
const tabs: [View, string][] = [
  ['routes', 'Spoje'],
  ['comparison', 'Porovnanie'],
  ['coverage', 'Peší prístup'],
  ['journeys', 'Prestupy'],
  ['unserved', 'Nepokryté'],
  ['sources', 'Podklady'],
]
function download(name: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function PlanningScenarios() {
  const worker = useRef<Worker | null>(null)
  const [request, setRequest] = useState<{
    id: number
    kind: 'coordinated' | 'pressure'
    input?: unknown
  }>({ id: 1, kind: 'coordinated' })
  const [loaded, setLoaded] = useState<{ job: number; bundle: Bundle } | null>(null)
  const [status, setStatus] = useState<{ job: number; text: string } | null>(null)
  const [error, setError] = useState('')
  const [rawDataset, setRawDataset] = useState<MapDataset | null>(null)
  const [strategy, setStrategy] = useState<Strategy>('hybrid')
  const [date, setDate] = useState('2026-09-08')
  const [view, setView] = useState<View>('routes')
  const [journeyResult, setJourneyResult] = useState<{
    journeys: Journey[]
    dataset: MapDataset
  } | null>(null)
  const [query, setQuery] = useState({
    from: '9',
    to: 'poprad-demo',
    earliest: '06:00',
    latest: '11:00',
  })
  const [searching, setSearching] = useState(false)
  const [routeText, setRouteText] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [queryRevision, setQueryRevision] = useState(0)
  const queryJob = useRef(0)
  const uploadRevision = useRef(0)
  const bundle = loaded?.job === request.id ? loaded.bundle : null

  useEffect(() => {
    if (rawDataset) return
    const current = new Worker(new URL('../planning/planner.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.current = current
    current.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress' && message.job === request.id)
        setStatus({ job: request.id, text: message.message })
      if (message.type === 'result' && message.job === request.id) {
        setLoaded({ job: request.id, bundle: message.bundle })
        setDate(message.bundle.scenario.dates[0])
        setError('')
      }
      if (message.type === 'journeys' && message.job === queryJob.current) {
        setJourneyResult(message)
        setSearching(false)
      }
      if (
        message.type === 'error' &&
        (message.job === request.id || message.job === queryJob.current)
      ) {
        setError(message.message)
        setSearching(false)
      }
    }
    current.onerror = () => {
      setError('Výpočet sa nepodarilo spustiť. Skúste načítať scenár znovu.')
      setSearching(false)
    }
    const message: WorkerRequest = {
      type: 'plan',
      job: request.id,
      kind: request.kind,
      seed: 20260908,
      input: request.input,
    }
    current.postMessage(message)
    return () => {
      current.terminate()
      worker.current = null
    }
  }, [request, rawDataset])

  function resetView() {
    setView('routes')
    setJourneyResult(null)
    setSearching(false)
    setError('')
    setRouteText('')
    setKindFilter('all')
    queryJob.current++
  }
  function chooseScenario(kind: 'coordinated' | 'pressure') {
    uploadRevision.current++
    resetView()
    setRawDataset(null)
    setRequest((old) => ({ id: old.id + 1, kind }))
  }
  function updateEconomics(scenario: Scenario) {
    uploadRevision.current++
    changeContext()
    setError('')
    setRequest((old) => ({ ...old, id: old.id + 1, input: { scenario } }))
  }
  async function importFile(file?: File) {
    if (!file) return
    const revision = ++uploadRevision.current
    try {
      if (file.size > 5_000_000) throw new Error('Súbor môže mať najviac 5 MB.')
      const input: unknown = JSON.parse(await file.text())
      if (revision !== uploadRevision.current) return
      const value = input as Record<string, unknown>
      if (value && (value.scenario || value.schemaVersion)) {
        resetView()
        setRawDataset(null)
        setRequest((old) => ({ ...old, id: old.id + 1, input }))
      } else {
        const data = parseMapDataset(value.dataset ?? value)
        resetView()
        setRawDataset(data)
      }
    } catch (e) {
      if (revision !== uploadRevision.current) return
      setError(e instanceof Error ? e.message : 'Súbor sa nepodarilo načítať.')
    }
  }
  function changeContext() {
    setJourneyResult(null)
    setSearching(false)
    queryJob.current++
  }
  function search() {
    if (!bundle || !worker.current) return
    const minutes = (text: string) => Number(text.slice(0, 2)) * 60 + Number(text.slice(3))
    if (minutes(query.latest) <= minutes(query.earliest)) {
      setError('Príchod musí nasledovať po odchode.')
      return
    }
    setError('')
    setSearching(true)
    setJourneyResult(null)
    queryJob.current += 10000
    worker.current.postMessage({
      type: 'journeys',
      job: queryJob.current,
      strategy,
      query: {
        date,
        from: query.from,
        to: query.to,
        earliest: minutes(query.earliest),
        latest: minutes(query.latest),
        seats: 1,
        maximumTransfers: 2,
        walkSpeedKmh: 4.5,
        maxWalkSeconds: bundle.scenario.policy.walkSeconds,
        avoidSteps: false,
      },
    } satisfies WorkerRequest)
    setQueryRevision((n) => n + 1)
  }
  const result = bundle?.results[strategy]
  const dataset =
    rawDataset ??
    (view === 'journeys' && journeyResult ? journeyResult.dataset : bundle?.datasets[strategy])
  const metadata = () => (
    <>
      <div className="scenario-heading">
        <FlaskConical size={21} />
        <div>
          <h1>Laboratórium dopravy</h1>
          <p>Reálne počty · simulované podmienky</p>
        </div>
      </div>
      <details className="scenario-settings" open={!bundle && !rawDataset ? true : undefined}>
        <summary>
          Nastavenia · {rawDataset?.name ?? bundle?.scenario.name ?? 'Scenár'}
          {bundle && ` · ${dateLabel(date)}`}
        </summary>
        <div className="scenario-controls">
          <label>
            Scenár
            <select
              aria-label="Scenár"
              value={rawDataset ? 'import-map' : request.input ? 'import' : request.kind}
              onChange={(e) => chooseScenario(e.target.value as 'coordinated' | 'pressure')}
            >
              <option value="coordinated">Zladené cesty</option>
              <option value="pressure">Rozptýlené cesty a časový tlak</option>
              {request.input !== undefined && (
                <option value="import">Načítaný alebo upravený scenár</option>
              )}
              {rawDataset && <option value="import-map">Načítané trasy</option>}
            </select>
          </label>
          {!rawDataset && (
            <label>
              Stratégia
              <select
                aria-label="Stratégia"
                value={strategy}
                onChange={(e) => {
                  setStrategy(e.target.value as Strategy)
                  changeContext()
                }}
              >
                {Object.entries(strategyLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {bundle && !rawDataset && (
            <label>
              Deň
              <select
                aria-label="Deň scenára"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  changeContext()
                }}
              >
                {bundle.scenario.dates.map((d) => (
                  <option key={d} value={d}>
                    {dateLabel(d)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="scenario-files">
          <label className="text-link">
            <Upload size={16} /> Načítať JSON
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Načítať scenár alebo trasy"
              onChange={(e) => {
                void importFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          {bundle && !rawDataset && (
            <button
              className="text-link"
              onClick={() =>
                download(`${bundle.scenario.id}.json`, exportScenario(bundle.scenario))
              }
            >
              <Download size={16} /> Scenár
            </button>
          )}
          {dataset && (
            <button
              className="text-link"
              onClick={() => download('trasy.json', JSON.stringify({ dataset }, null, 2))}
            >
              <Download size={16} /> Trasy
            </button>
          )}
        </div>
      </details>
      {!rawDataset && bundle && (
        <nav className="scenario-tabs" aria-label="Výsledky scenára">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className={view === id ? 'selected' : ''}
              aria-pressed={view === id}
              onClick={() => {
                setView(id)
                changeContext()
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {error && (
        <p className="scenario-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
  function renderCard(map: MapCardContext) {
    if (map.route && map.view === 'stops') {
      const route = map.route,
        run = result?.runs.find((r) => route.id === `${bundle!.scenario.id}:${strategy}:${r.id}`)
      const selected = map.selection.stopOccurrenceId
      return (
        <div className="scenario-card stack">
          <button className="text-link" onClick={map.showRoutes}>
            <ArrowLeft size={18} /> Späť na zoznam
          </button>
          <span className="scenario-badge">
            {rawDataset ? 'Načítané trasy' : 'Simulácia'} · {route.code}
          </span>
          <h2>{route.name}</h2>
          <p className="muted">{route.direction}</p>
          {run && (
            <p>
              {dateLabel(run.date)} · {run.resourceId} ·{' '}
              {run.allocations.reduce((n, a) => n + a.seats, 0)} pohybov
            </p>
          )}
          <ol className="timeline">
            {route.stops.map(
              (stop, i) =>
                (!selected || selected === stop.occurrenceId) && (
                  <li key={stop.occurrenceId}>
                    <time>{stop.time}</time>
                    <span className="timeline-dot" />
                    <div>
                      <strong>Zastávka {i + 1}</strong>
                      <small>{map.dataset.stops.find((s) => s.id === stop.stopId)?.name}</small>
                      {run && (
                        <small>
                          Nástup{' '}
                          {run.allocations
                            .filter((a) => a.pickup === i)
                            .reduce((n, a) => n + a.seats, 0)}{' '}
                          · Výstup{' '}
                          {run.allocations
                            .filter((a) => a.dropoff === i)
                            .reduce((n, a) => n + a.seats, 0)}
                        </small>
                      )}
                    </div>
                  </li>
                ),
            )}
          </ol>
          {selected && (
            <button className="text-link" onClick={() => map.selectRoute(route.id)}>
              Všetky zastávky
            </button>
          )}
          {route.segments?.map((segment) => (
            <div key={segment.id} className="scenario-leg">
              <strong>{segment.code}</strong>
              <p>
                {segment.name} · {segment.departure} – {segment.arrival}
              </p>
            </div>
          ))}
          <p className="scenario-note">
            {route.demoNote ?? 'Načítaná geometria nie je dôkazom prevádzkovej uskutočniteľnosti.'}
          </p>
        </div>
      )
    }
    const shown = map.routes.filter(
      (route) =>
        (rawDataset || route.serviceDates?.includes(date)) &&
        (kindFilter === 'all' || route.kind === kindFilter) &&
        `${route.name} ${route.code}`
          .toLocaleLowerCase('sk')
          .includes(routeText.toLocaleLowerCase('sk')),
    )
    return (
      <div className="scenario-card stack">
        {metadata()}
        {rawDataset && (
          <p className="scenario-note">
            Zobrazený je výlučne načítaný súbor. Prevádzkové kapacity a kalendáre neboli overené.
          </p>
        )}
        {(view === 'routes' || rawDataset) && (
          <>
            <div className="scenario-controls">
              <label>
                Hľadať
                <input
                  aria-label="Hľadať trasu"
                  value={routeText}
                  onChange={(e) => setRouteText(e.target.value)}
                  placeholder="Obec alebo spoj"
                />
              </label>
              <label>
                Typ
                <select
                  aria-label="Typ spoja"
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value)}
                >
                  <option value="all">Všetky</option>
                  <option value="fixed">Pravidelné</option>
                  <option value="flex">Flex</option>
                  <option value="external">Regionálne</option>
                </select>
              </label>
            </div>
            <p className="muted">
              {slovakCount(shown.length, 'spoj', 'spoje', 'spojov')} · Vyberte celý riadok pre trasu
              a zastávky.
            </p>
            {shown.map((route) => (
              <button
                className="scenario-route"
                key={route.id}
                onClick={() => map.selectRoute(route.id)}
              >
                <span className="scenario-route-top">
                  <BusFront size={18} /> {route.code} ·{' '}
                  {route.kind === 'fixed'
                    ? 'Pravidelný'
                    : route.kind === 'flex'
                      ? 'Flex'
                      : 'Regionálny'}
                </span>
                <strong>{route.name}</strong>
                <span>{route.direction}</span>
              </button>
            ))}
            {!shown.length && <p>Pre tento filter nie je dostupný spoj.</p>}
          </>
        )}
        {bundle && result && !rawDataset && view === 'comparison' && (
          <>
            <h2>Rovnaký dopyt, tri stratégie</h2>
            <p className="scenario-note">
              Celé obdobie {bundle.scenario.dates.map((d) => dateLabel(d)).join(', ')}. Počítané
              možnosti ciest v simulácii, nie potvrdené rezervácie.
            </p>
            <p className="scenario-fleet-summary">
              <strong>Spoločná flotila: {result.metrics.fleet.ownedBuses} autobusy</strong> ·{' '}
              {bundle.scenario.resources.map((r) => r.capacity).join(' + ')} miest. Tie isté vozidlá
              sa striedajú na pravidelných aj Flex jazdách.
            </p>
            <p className="scenario-note">
              Vybraná stratégia:{' '}
              {result.metrics.economics?.profit == null
                ? 'výsledok zatiaľ nepoznáme'
                : `${result.metrics.economics.profit < 0 ? 'modelová strata' : result.metrics.economics.profit > 0 ? 'modelový zisk' : 'vyrovnaný model'} ${money(Math.abs(result.metrics.economics.profit))}`}{' '}
              za celé obdobie.
            </p>
            <EconomicsEditor
              key={request.id}
              scenario={bundle.scenario}
              onApply={updateEconomics}
            />
            <div className="scenario-table">
              <table aria-label="Porovnanie dopravy a ekonomiky">
                <thead>
                  <tr>
                    <th>Ukazovateľ</th>
                    {Object.values(strategyLabels).map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Autobusy vo flotile (financované)', (m) => format(m.fleet.ownedBuses)],
                      ['Skutočne nasadené autobusy', (m) => format(m.fleet.usedBuses)],
                      ['Najviac autobusov súčasne', (m) => format(m.fleet.peakBusyBuses)],
                      ['Počet jázd (nie autobusov)', (m) => format(m.runs)],
                      ['Pokryté pohyby', (m) => `${m.served} / ${m.movements}`],
                      ['Z toho obslúžené našou flotilou', (m) => format(m.fleet.managedMovements)],
                      ['Z toho iba regionálnym modelom', (m) => format(m.fleet.externalMovements)],
                      ['Nepokryté', (m) => format(m.unserved)],
                      ['Všetky km', (m) => format(m.vehicleKm, 1)],
                      ['Prázdne km', (m) => format(m.deadheadKm, 1)],
                      [
                        'Priemerná obsadenosť',
                        (m) => `${format(m.vehicleKm ? m.passengerKm / m.vehicleKm : 0, 1)} os.`,
                      ],
                      [
                        'Kúpa celej flotily — vstupná investícia',
                        (m) => money(m.economics?.fleetInvestment),
                      ],
                      ['Odpisy autobusov za obdobie', (m) => money(m.economics?.depreciation)],
                      [
                        'Poistenie a fixné náklady flotily',
                        (m) => money(m.economics?.standingCosts),
                      ],
                      [
                        'Spotreba paliva',
                        (m) =>
                          m.economics ? `${format(m.economics.fuelLitres, 1)} l` : 'Nezadané',
                      ],
                      ['Náklady na palivo', (m) => money(m.economics?.fuelCost)],
                      ['Servis a pneumatiky bez paliva', (m) => money(m.economics?.maintenance)],
                      ['Platený čas vodičov', (m) => `${format(m.driverMinutes / 60, 1)} hod.`],
                      ['Náklady na vodičov', (m) => money(m.economics?.drivers)],
                      ['Zastávky a zriadenie miest', (m) => money(m.economics?.stops)],
                      ['Réžia služby', (m) => money(m.economics?.overhead)],
                      ['Celkové modelové náklady za obdobie', (m) => money(m.economics?.totalCost)],
                      ['Naše tržby z cestovného', (m) => money(m.economics?.ticketRevenue)],
                      ['Modelový príspevok na službu', (m) => money(m.economics?.supportRevenue)],
                      ['Celkové modelové výnosy', (m) => money(m.economics?.totalRevenue)],
                      ['Modelový zisk / strata', (m) => money(m.economics?.profit)],
                      [
                        'Je model ziskový?',
                        (m) =>
                          m.economics?.profit == null
                            ? 'Nezadané tržby'
                            : m.economics.profit > 0
                              ? 'Áno — modelový zisk'
                              : m.economics.profit < 0
                                ? 'Nie — modelová strata'
                                : 'Vyrovnaný výsledok',
                      ],
                      [
                        'Zisková marža',
                        (m) =>
                          m.economics?.marginPercent == null
                            ? '—'
                            : `${format(m.economics.marginPercent, 1)} %`,
                      ],
                      [
                        'Prevádzková peňažná bilancia bez odpisov',
                        (m) => money(m.economics?.operatingCashBalance),
                      ],
                      [
                        'Cestovné na pokrytie nákladov / náš pohyb',
                        (m) => money(m.economics?.breakEvenFare),
                      ],
                      [
                        'Potrebný celkový príspevok pri zadanom cestovnom',
                        (m) => money(m.economics?.requiredSupport),
                      ],
                      [
                        'Náklad / pokrytý pohyb',
                        (m) =>
                          m.served && m.economics ? money(m.economics.totalCost / m.served) : '—',
                      ],
                      [
                        'Pešia cesta, 95. percentil',
                        (m) => `${format(m.walkP95Seconds / 60, 1)} min`,
                      ],
                      [
                        'Celé spiatočné objednávky',
                        (m) => `${m.completeOrders} / ${m.completeOrders + m.pendingOrders}`,
                      ],
                    ] as [string, (m: Metrics) => string][]
                  ).map(([label, get]) => (
                    <tr
                      key={label}
                      className={
                        label === 'Modelový zisk / strata' ||
                        label === 'Celkové modelové náklady za obdobie' ||
                        label === 'Celkové modelové výnosy'
                          ? 'scenario-total-row'
                          : undefined
                      }
                    >
                      <th>{label}</th>
                      {Object.values(bundle.results).map((r) => (
                        <td
                          key={r.strategy}
                          data-strategy={strategyLabels[r.strategy]}
                          data-profit={
                            label === 'Modelový zisk / strata' &&
                            r.metrics.economics?.profit != null
                              ? r.metrics.economics.profit < 0
                                ? 'loss'
                                : 'gain'
                              : undefined
                          }
                        >
                          {get(r.metrics)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="scenario-note">
              Kúpna cena sa nepripočítava k odpisom druhýkrát. Fixné náklady a odpisy platia aj pre
              nevyužité autobusy počas celého obdobia. Spotreba zahŕňa prázdne presuny. Výsledok je
              model, nie zistený skutočný zisk; regionálnemu dopravcovi nepripisujeme naše tržby ani
              naše náklady. Regionálny model nemá overený septembrový cestovný poriadok.
            </p>
            {!result.metrics.economics && (
              <p className="scenario-note">
                Tento starší import nemá úplné ekonomické vstupy. Doplňte ich v ekonomických
                predpokladoch.
              </p>
            )}
            <details className="scenario-economics-editor">
              <summary>Nasadenie jednotlivých autobusov · {strategyLabels[strategy]}</summary>
              {result.metrics.fleet.buses.map((bus) => (
                <p className="scenario-note" key={bus.id}>
                  <strong>{bus.id}</strong> · {bus.capacity} miest · {bus.runs} jázd ·{' '}
                  {format(bus.km, 1)} km · {format(bus.driverMinutes / 60, 1)} platených hodín
                  vodiča
                </p>
              ))}
            </details>
          </>
        )}
        {bundle && result && !rawDataset && view === 'coverage' && (
          <>
            <h2>Prístup k zastávkam</h2>
            {result.stopSuggestions.length > 0 && (
              <section className="scenario-leg">
                <h3>Návrhy nových miest</h3>
                <p>
                  Vyžadujú kontrolu bezpečnosti a schválenie. Potenciálny peší dosah ešte
                  nepotvrdzuje dostupnosť vozidla.
                </p>
                {result.stopSuggestions.map((p) => (
                  <p key={p.stop.id}>
                    <strong>{p.stop.name}</strong> · potenciálne {p.potentialMovements} pohybov
                  </p>
                ))}
              </section>
            )}
            <p>
              Rozpočet {bundle.scenario.policy.walkSeconds / 60} min po pešej sieti. Výber:{' '}
              {result.stops.method === 'exact-subsets'
                ? 'presné porovnanie konečnej množiny'
                : 'heuristika'}
              ; prevádzkový plán porovnáva aj všetky dostupné zastávky.
            </p>
            <p>
              {result.stops.uncovered.length} pohybov nemá prípustný peší prístup. Výsledok platí
              pre syntetické prístupové body, nie pre všetkých obyvateľov.
            </p>
            {bundle.scenario.stops
              .filter((s) => result.stops.selected.includes(s.id))
              .map((s) => (
                <div className="scenario-leg" key={s.id}>
                  <strong>{s.name}</strong>
                  <p>
                    {
                      result.stops.access.filter(
                        (a) =>
                          a.pickups.some((p) => p.stopId === s.id) ||
                          a.dropoffs.some((p) => p.stopId === s.id),
                      ).length
                    }{' '}
                    pohybov má toto miesto v pešom dosahu · ukážkové miesto
                  </p>
                </div>
              ))}
          </>
        )}
        {bundle && result && !rawDataset && view === 'unserved' && (
          <>
            <h2>Nepokryté pohyby</h2>
            <p>
              {result.unserved.length} z {bundle.scenario.demand.length} za celé obdobie. Dôvody
              hľadania nie sú dôkazom globálnej nemožnosti.
            </p>
            {[...new Set(result.unserved.map((u) => u.code))].map((code) => {
              const group = result.unserved.filter((u) => u.code === code)
              return (
                <div className="scenario-leg" key={code}>
                  <strong>{group.length} pohybov</strong>
                  <p>{group[0].reason}</p>
                </div>
              )
            })}
            {!result.unserved.length && <p>Všetky zadané pohyby majú modelovú možnosť.</p>}
          </>
        )}
        {bundle && !rawDataset && view === 'sources' && (
          <>
            <h2>Čo je skutočné a čo modelové</h2>
            <p>
              Zdroj: matica SSV, 8. – 10. 9. 2026. 26 párov, 172 pohybov. Rozdelenie dní: 58 / 57 /
              57.
            </p>
            {bundle.scenario.assumptions.map((s) => (
              <p className="scenario-note" key={s}>
                {s}
              </p>
            ))}
            <p>
              OSM © prispievatelia OpenStreetMap, ODbL. Sieť: {bundle.scenario.networkVersion}.
              Seed: {bundle.scenario.seed}.
            </p>
            <details>
              <summary>Predpoklady nákladov</summary>
              <p>
                {bundle.scenario.policy.kilometreCost} €/km ·{' '}
                {bundle.scenario.policy.driverHourCost} €/hod. platenej doby vrátane čakania ·{' '}
                {bundle.scenario.policy.vehicleDayCost} €/vozidlo/deň ·{' '}
                {bundle.scenario.policy.stopCost} €/miesto.
              </p>
            </details>
            <p className="scenario-note">
              Izolovaný experiment nemení existujúce rezervácie, vodičov ani záznamy dispečera.
            </p>
          </>
        )}
        {bundle && !rawDataset && view === 'journeys' && (
          <>
            <h2>Celá cesta s prestupmi</h2>
            <p className="scenario-note">
              Vyhľadanie pre jedného ďalšieho cestujúceho kontroluje voľné segmenty. Rozšírenie do
              Popradu je samostatná syntetická ukážka mimo 172 pozorovaných pohybov.
            </p>
            <div className="scenario-controls">
              {(['from', 'to'] as const).map((side) => (
                <label key={side}>
                  {side === 'from' ? 'Odkiaľ' : 'Kam'}
                  <select
                    aria-label={side === 'from' ? 'Prestup odkiaľ' : 'Prestup kam'}
                    value={query[side]}
                    onChange={(e) => {
                      setQuery({ ...query, [side]: e.target.value })
                      changeContext()
                    }}
                  >
                    {bundle.scenario.stops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    {side === 'to' && (
                      <option value="poprad-demo">Poprad · modelové rozšírenie</option>
                    )}
                  </select>
                </label>
              ))}
              <TimePicker
                label="Najskorší odchod"
                value={query.earliest}
                onChange={(value) => {
                  setQuery({ ...query, earliest: value })
                  changeContext()
                }}
              />
              <TimePicker
                label="Príchod do"
                value={query.latest}
                onChange={(value) => {
                  setQuery({ ...query, latest: value })
                  changeContext()
                }}
              />
            </div>
            <button className="btn" disabled={searching} onClick={search}>
              {searching ? 'Hľadáme…' : 'Nájsť možnosti cesty'}
            </button>
            {journeyResult && (
              <>
                <p>
                  {slovakCount(journeyResult.journeys.length, 'možnosť', 'možnosti', 'možností')} ·
                  bez potvrdenia rezervácie
                </p>
                {journeyResult.dataset.routes.map((route, i) => (
                  <button
                    className="scenario-route"
                    key={route.id}
                    onClick={() => map.selectRoute(route.id)}
                  >
                    <strong>{route.name}</strong>
                    <span>
                      {timeLabel(journeyResult.journeys[i].arrival)} ·{' '}
                      {slovakCount(
                        journeyResult.journeys[i].transfers,
                        'prestup',
                        'prestupy',
                        'prestupov',
                      )}{' '}
                      · pešo {journeyResult.journeys[i].walkMinutes} min
                    </span>
                  </button>
                ))}
                {!journeyResult.journeys.length && (
                  <p>
                    Pre tento čas, kapacitu a prestupové podmienky sa nenašla možnosť. Skúste iný
                    čas.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    )
  }
  return (
    <main className="scenario-screen" aria-label="Simulácia plánovania dopravy">
      <Link className="btn scenario-back" to="/dispatcher">
        <ArrowLeft size={18} /> Dispečer
      </Link>
      {dataset ? (
        <TransportMap
          key={`${request.id}:${rawDataset ? 'import' : strategy}:${date}:${view === 'journeys' ? queryRevision : 'runs'}`}
          dataset={dataset}
          height="container"
          chrome="compact"
          renderCard={renderCard}
          cardLabel="Plánovanie a scenáre"
        />
      ) : (
        <div className="scenario-loading">
          <FlaskConical size={32} />
          <h1>Pripravujeme scenár</h1>
          <p role="status">{status?.job === request.id ? status.text : 'Načítavame plánovanie…'}</p>
          {metadata()}
        </div>
      )}
    </main>
  )
}
