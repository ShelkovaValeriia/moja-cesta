import { DateInput, DateTimeInput } from '../components/DateInput'
import { localInstant, deadlineLabel } from '../regularPlanning'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../context'
import { addDays, dateLabel } from '../data'
import { stopName, tripTime } from '../domain'
import { purposeLabels, regularCapacityGaps, regularDemand, validDate } from '../regular'
import { Badge, Notice, PageTitle } from '../components/ui'

export function RegularDemandStats() {
  const { state } = useStore(),
    [from, setFrom] = useState(state.serviceDate),
    [to, setTo] = useState(addDays(state.serviceDate, 30))
  const valid = validDate(from) && validDate(to) && to >= from
  const stats = regularDemand(state, valid ? from : '9999-01-01', valid ? to : '0000-01-01')
  const estimates = valid
    ? regularCapacityGaps(state, from, to)
    : {
        additionalSeatPlaces: 0,
        additionalDepartures: 0,
        missingGroups: 0,
        missingPassengerLegs: 0,
      }
  return (
    <section className="stack regular-demand-stats">
      <div className="section-heading">
        <h2>Pravidelné dopravné potreby</h2>
        <span className="muted small">Živé prepočty z uložených demo rozvrhov</span>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Štatistika od</span>
          <DateInput value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>Štatistika do</span>
          <DateInput min={from} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {!valid && (
        <p role="alert" className="form-error">
          Vyberte platné obdobie štatistiky.
        </p>
      )}
      <div className="regular-metrics" aria-label="Súhrn pravidelného dopytu">
        {[
          [stats.people, 'ľudí s potrebou'],
          [stats.requested, 'osobných ciest'],
          [stats.covered, 'pokrytých ciest'],
          [stats.unmet, 'nepokrytých ciest'],
          [stats.school, 'školákov podľa účelu'],
          [stats.work, 'pracujúcich podľa účelu'],
        ].map(([value, label]) => (
          <article className="card" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>
      <Notice>
        Počítame skutočné dátumy a výnimky v období. Pozastavené a zrušené rozvrhy sú vylúčené.
        Potvrdená rezervácia pokrýva potrebu a nezvyšuje dopyt druhýkrát. Spiatočná cesta je pokrytá
        až po zabezpečení oboch smerov. Pokrytie:{' '}
        {stats.requested ? Math.round((stats.covered / stats.requested) * 100) : 0} %.
      </Notice>
      <div className="card stack">
        <h3>Počet požadovaných osobných ciest podľa dní</h3>
        <div className="regular-week-metrics">
          {stats.byWeekday.map((d) => (
            <div key={d.label}>
              <span>{d.label}</span>
              <strong>{d.count}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="card stack">
        <h3>Smery, čas a chýbajúce miesta</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Smer</th>
                <th>Čas</th>
                <th>Dopyt</th>
                <th>Nepokryté</th>
                <th>Dopyt pri plných spojoch</th>
              </tr>
            </thead>
            <tbody>
              {stats.routes.map((r, i) => (
                <tr key={i}>
                  <td>
                    {stopName(state, r.from)} → {stopName(state, r.to)}
                  </td>
                  <td>
                    {r.timeMode === 'arrival' ? 'Príchod do' : 'Odchod'} {r.time}
                  </td>
                  <td>{r.requested}</td>
                  <td>{r.unmet}</td>
                  <td>{r.capacityGap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!stats.routes.length && <p>V období nie je aktívny pravidelný dopyt.</p>}
        <p>
          <strong>{estimates.missingGroups}</strong> rôznych požiadaviek na dátum, smer a čas nemá
          vhodný publikovaný spoj.
        </p>
        <p>
          Orientačný kapacitný deficit: <strong>{estimates.additionalSeatPlaces}</strong> ďalších
          miest v konkrétnych publikovaných odchodoch. Pre chýbajúce smery:{' '}
          <strong>{estimates.additionalDepartures ?? 'neurčené'}</strong> nových odchodov pri
          samostatnej obsluhe každého smeru a času.
        </p>
        <p className="small muted">
          Ide o kapacitný odhad z aktuálnych vozidiel a kalendára. Miesta sa sčítavajú cez konkrétne
          odchody, nie ako zväčšenie vozidla. Odhad nových odchodov používa najväčšiu
          nakonfigurovanú kapacitu. Zlúčenie smerov, časový súlad spiatočných ciest, cestné trasy a
          smeny musí posúdiť dispečer; nejde o schválený plán ani počet potrebných vozidiel.
        </p>
      </div>
      <details className="card">
        <summary>Podklady pre plánovanie FIXED ({stats.rows.length} dní cestujúcich)</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dátum</th>
                <th>Účel</th>
                <th>Smer</th>
                <th>Čas tam / späť</th>
                <th>Pokrytie</th>
              </tr>
            </thead>
            <tbody>
              {stats.rows.map((r) => (
                <tr key={`${r.ruleId}:${r.date}`}>
                  <td>{dateLabel(r.date)}</td>
                  <td>{purposeLabels[r.purpose]}</td>
                  <td>
                    {stopName(state, r.plan.outbound.from)} → {stopName(state, r.plan.outbound.to)}
                  </td>
                  <td>
                    {r.plan.outbound.time} / {r.plan.returning?.time ?? 'len tam'}
                  </td>
                  <td>
                    <Badge status={r.covered ? 'confirmed' : 'pending'}>
                      {r.covered ? 'Pokryté rezerváciou' : 'Dopravná potreba'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
function NoShowReview() {
  const { state, act } = useStore(),
    [reason, setReason] = useState(''),
    [until, setUntil] = useState(''),
    [ruleId, setRuleId] = useState('')
  const records = state.bookings.filter((b) => b.noShow)
  return (
    <section className="card stack regular-no-show">
      <h2>Kontrola neúčastí</h2>
      <Notice>
        Vodič záznam nahlási; dispečer ho overí alebo opraví s dôvodom. Žiadny počet neúčastí
        automaticky neblokuje cestovanie. Ručné rezervácie zostávajú dostupné.
      </Notice>
      <label className="field">
        <span>Dôvod kontroly alebo dočasného obmedzenia</span>
        <textarea
          minLength={5}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {!records.length && <p>Zatiaľ nebola zaznamenaná neúčasť.</p>}
      {records.map((b) => {
        const trip = state.trips.find((t) => t.id === b.tripId)
        return (
          <article className="regular-occurrence" key={b.id}>
            <strong>
              {b.name} · {trip && dateLabel(trip.date)} · {trip && tripTime(trip, b.from)}
            </strong>
            <span>
              {b.noShow?.status === 'reported'
                ? 'Nahlásené, čaká na overenie'
                : b.noShow?.status === 'corrected'
                  ? 'Opravené'
                  : 'Overená neúčasť'}
            </span>
            {b.noShow?.reason && <p>{b.noShow.reason}</p>}
            <div className="regular-actions">
              <button
                className="btn btn-small btn-secondary"
                disabled={reason.trim().length < 5 || b.noShow?.status !== 'reported'}
                onClick={() =>
                  act(
                    { type: 'reviewNoShow', id: b.id, decision: 'confirm', reason },
                    'Neúčasť bola overená. Automatická sankcia sa neuplatnila.',
                  )
                }
              >
                Overiť záznam
              </button>
              <button
                className="btn btn-small btn-secondary"
                disabled={reason.trim().length < 5 || b.noShow?.status === 'corrected'}
                onClick={() =>
                  act(
                    { type: 'reviewNoShow', id: b.id, decision: 'correct', reason },
                    'Chybná neúčasť bola opravená.',
                  )
                }
              >
                Opraviť chybnú neúčasť
              </button>
            </div>
            <details>
              <summary>História kontroly</summary>
              {b.noShow?.history.map((e, i) => (
                <p key={i}>{e.reason}</p>
              ))}
            </details>
          </article>
        )
      })}
      {state.rules
        .filter(
          (r) => r.automaticBookingPause && r.automaticBookingPause.until >= state.serviceDate,
        )
        .map((r) => (
          <div className="regular-occurrence" key={r.id}>
            <strong>
              {state.people.find((p) => p.id === r.personId)?.name} — obmedzenie do{' '}
              {dateLabel(r.automaticBookingPause!.until)}
            </strong>
            <p>{r.automaticBookingPause!.reason}</p>
            <button
              className="btn btn-secondary"
              disabled={reason.trim().length < 5}
              onClick={() =>
                act(
                  { type: 'resumeAutomaticBooking', id: r.id, reason },
                  'Obmedzenie bolo ukončené. Nové miesta vyžadujú kontrolu.',
                )
              }
            >
              Ukončiť dočasné obmedzenie
            </button>
          </div>
        ))}
      <h3>Dočasne pozastaviť nové automatické rezervovanie</h3>
      <p className="small muted">
        Len po individuálnom posúdení overených opakovaných porušení a informovaní správcu účtu.
        Prah ani trvanie nie sú nastavené automaticky. Existujúce rezervácie sa týmto krokom
        nerušia.
      </p>
      <div className="form-grid">
        <label className="field">
          <span>Rozvrh na individuálne posúdenie</span>
          <select value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
            <option value="">Vyberte rozvrh</option>
            {state.rules
              .filter((r) => r.status !== 'cancelled')
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {state.people.find((p) => p.id === r.personId)?.name} · {r.id}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Pozastaviť do</span>
          <DateInput
            min={state.serviceDate}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
      </div>
      <button
        className="btn btn-secondary"
        disabled={
          !ruleId ||
          !validDate(until) ||
          until < state.serviceDate ||
          reason.trim().length < 5 ||
          !records.some((b) => b.ruleId === ruleId && b.noShow?.status === 'confirmed')
        }
        onClick={() =>
          act(
            { type: 'pauseAutomaticBooking', id: ruleId, until, reason },
            'Nové automatické rezervovanie bolo dočasne pozastavené. Ručné rezervácie zostávajú dostupné.',
          )
        }
      >
        Potvrdiť individuálne pozastavenie
      </button>
    </section>
  )
}
export function RegularDemandPage() {
  return (
    <div className="stack">
      <PageTitle
        title="Pravidelné dopravné potreby"
        description="Podklady pre budúce stabilné linky, oddelené od potvrdených miest."
      />
      <PlanningTasks />
      <RegularDemandStats />
      <NoShowReview />
      <Link className="text-link" to="/dispatcher/statistics">
        Ďalšie štatistiky dopravy
      </Link>
    </div>
  )
}

function PlanningTasks() {
  const { state, act } = useStore(),
    [clock, setClock] = useState('')
  return (
    <section className="card stack regular-no-show">
      <h2>Zabezpečenie pravidelných plánov</h2>
      <Notice>
        Demo spracúva plány a lehoty iba po stlačení tlačidla. Pri zatvorenej aplikácii nebeží
        žiadny proces ani odosielanie SMS. Bez vhodného priradeného vozidla, vodiča a miest zostáva
        úloha otvorená pre dispečera. Nové spoje treba najskôr naplánovať a schváliť.
      </Notice>
      <button
        className="btn"
        onClick={() =>
          act(
            { type: 'processRegularPlans', now: new Date().toISOString() },
            'Plány a lehoty boli skontrolované.',
          )
        }
      >
        Spracovať plány aktuálnym časom
      </button>
      <fieldset className="field">
        <legend>Demonštračný čas kontroly (Europe/Bratislava)</legend>
        <DateTimeInput value={clock} onChange={(e) => setClock(e.target.value)} />
      </fieldset>
      <button
        className="btn btn-secondary"
        disabled={!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(clock)}
        onClick={() =>
          act(
            {
              type: 'processRegularPlans',
              now: new Date(localInstant(clock.slice(0, 10), clock.slice(11, 16))).toISOString(),
            },
            'Demonštračná kontrola bola vykonaná. Nejde o prácu na pozadí.',
          )
        }
      >
        Spustiť kontrolu v zvolenom čase
      </button>
      {state.regularCheckedAt && (
        <p>
          Posledná kontrola:{' '}
          {dateLabel(
            new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava' }).format(
              new Date(state.regularCheckedAt),
            ),
          )}{' '}
          ·{' '}
          {new Date(state.regularCheckedAt).toLocaleTimeString('sk-SK', {
            timeZone: 'Europe/Bratislava',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          })}
        </p>
      )}
      {state.regularTasks
        ?.filter((t) => state.rules.some((r) => r.id === t.ruleId && r.status === 'active'))
        .map((t) => (
          <article className="regular-occurrence" key={t.id}>
            <strong>
              {dateLabel(t.date)} · {t.ruleId}
            </strong>
            <span>
              {t.status === 'confirmed'
                ? 'Potvrdené'
                : t.status === 'confirmedLate'
                  ? 'Potvrdené po lehote 24 hodín'
                  : t.status === 'overdue'
                    ? 'Naliehavá úloha – lehota uplynula'
                    : 'Otvorená úloha dispečera'}
            </span>
            <p>{t.details ?? t.reason}</p>
            <p>Lehota: {deadlineLabel(t.deadline)}</p>
            {!t.details && (
              <p>
                Zabezpečte vhodný spoj alebo kontaktujte cestujúceho. Potreba nebola zamietnutá. Pri
                neznámom čase odchodu je predbežná lehota konzervatívne určená pred začiatkom dňa.
              </p>
            )}
          </article>
        ))}
    </section>
  )
}
