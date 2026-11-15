import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useStore } from '../context'
import {
  dispatcherSubmissions,
  matchesSubmission,
  submissionSources,
} from '../dispatcherSubmissions'
import { formatPassengerCode } from '../passengerCodes'
import { Badge, Empty, PageTitle } from '../components/ui'
import { DateInput } from '../components/DateInput'

const PAGE_SIZE = 20

export function DispatcherSubmissions() {
  const { state } = useStore()
  const [params, setParams] = useSearchParams()
  const query = params.get('search') ?? '',
    source = params.get('source') ?? '',
    date = params.get('date') ?? '',
    status = params.get('status') ?? ''
  const records = dispatcherSubmissions(state, date).filter(
    (r) =>
      (!source || r.source === source) &&
      (!status || r.status === status) &&
      matchesSubmission(r, query),
  )
  const requestedPage = Number(params.get('page') ?? 1)
  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE))
  const page = Math.min(
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    pages,
  )
  function change(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  return (
    <>
      <PageTitle
        title="Požiadavky"
        description="Kto potrebuje cestovať, odkiaľ, kam a kedy. Podania z aplikácie, telefonickej podpory a pravidelné plány."
      />
      <section className="card chart-card support-filters" aria-label="Filtre požiadaviek">
        <label className="field support-search">
          <span>
            <Search size={15} /> Vyhľadať požiadavku
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => change('search', e.target.value)}
            placeholder="Meno, ID cestujúceho, miesto alebo čas"
          />
        </label>
        <label className="field">
          <span>Zdroj požiadavky</span>
          <select value={source} onChange={(e) => change('source', e.target.value)}>
            <option value="">Všetky zdroje</option>
            {Object.entries(submissionSources).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Dátum cesty</span>
          <DateInput value={date} onChange={(e) => change('date', e.target.value)} />
        </label>
        <label className="field">
          <span>Stav podania</span>
          <select value={status} onChange={(e) => change('status', e.target.value)}>
            <option value="">Všetky stavy</option>
            <option value="pending">Čaká na spracovanie</option>
            <option value="approved">Schválená požiadavka</option>
            <option value="rejected">Zamietnutá</option>
            <option value="cancelled">Zrušená</option>
            <option value="active">Aktívny plán</option>
            <option value="paused">Pozastavený plán</option>
          </select>
        </label>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => setParams({}, { replace: true })}
        >
          Vymazať filtre
        </button>
      </section>
      <div className="support-pagination">
        <span className="small muted" role="status">
          {records.length
            ? `${(page - 1) * PAGE_SIZE + 1} – ${Math.min(page * PAGE_SIZE, records.length)} z ${records.length} podaní`
            : '0 podaní'}
        </span>
        {pages > 1 && (
          <nav aria-label="Stránkovanie požiadaviek">
            <button
              className="btn btn-small btn-secondary"
              disabled={page === 1}
              onClick={() => change('page', String(page - 1))}
            >
              Predchádzajúca
            </button>
            <span>
              {page} / {pages}
            </span>
            <button
              className="btn btn-small btn-secondary"
              disabled={page === pages}
              onClick={() => change('page', String(page + 1))}
            >
              Ďalšia
            </button>
          </nav>
        )}
      </div>
      <div className="stack">
        {records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (
          <article
            className="card chart-card stack submission-card"
            key={r.key}
            aria-label={`Požiadavka ${r.id}`}
          >
            <div className="section-heading">
              <div>
                <p className="small muted">{submissionSources[r.source]}</p>
                <h2>Požiadavka {r.id}</h2>
              </div>
              <Badge status={r.status}>{r.statusLabel}</Badge>
            </div>
            <section className="submission-people" aria-label="Cestujúci">
              <h3>Kto cestuje</h3>
              {r.people.map((person) => (
                <p key={person.id}>
                  <strong>{person.name}</strong>
                  {person.code && <> · ID {formatPassengerCode(person.code)}</>} · {person.seats}{' '}
                  {person.seats === 1 ? 'miesto' : 'miest'}
                </p>
              ))}
              {r.unidentifiedSeats > 0 && (
                <p className="muted">
                  Ďalší záujemcovia: {r.unidentifiedSeats}. Ich mená nie sú v zázname uvedené.
                </p>
              )}
              {!r.people.length && !r.unidentifiedSeats && (
                <p className="muted">Údaje o cestujúcich nie sú v zázname uvedené.</p>
              )}
            </section>
            {r.period && <p className="small muted">Obdobie plánu: {r.period}</p>}
            <div className="table-wrap">
              <table aria-label={`Trasy požiadavky ${r.id}`}>
                <thead>
                  <tr>
                    <th>Odkiaľ</th>
                    <th>Kam</th>
                    <th>Dátum alebo deň</th>
                    <th>Požadovaný čas</th>
                  </tr>
                </thead>
                <tbody>
                  {r.legs.map((leg, index) => (
                    <tr key={index}>
                      <td>
                        {leg.from}
                        <span className="table-secondary">{leg.direction}</span>
                      </td>
                      <td>{leg.to}</td>
                      <td>{leg.when}</td>
                      <td>
                        {leg.timeMode === 'arrival' ? 'Príchod do' : 'Odchod'}{' '}
                        <strong>{leg.time}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.notes.map((note, index) => (
              <p className="small muted" key={index}>
                {note}
              </p>
            ))}
            {r.href && (
              <Link className="text-link" to={r.href}>
                {r.source === 'phone' && r.key.startsWith('phone:')
                  ? 'Otvoriť telefonický záznam'
                  : 'Otvoriť požadovanú cestu'}
              </Link>
            )}
          </article>
        ))}
      </div>
      {!records.length && (
        <Empty title="Žiadne zodpovedajúce požiadavky" text="Zmeňte vyhľadávanie alebo filtre." />
      )}
    </>
  )
}
