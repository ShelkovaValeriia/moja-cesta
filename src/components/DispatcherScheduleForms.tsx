import { DispatcherModal as Modal } from './DispatcherModal'
import { useState } from 'react'
import { addDays, dateLabel, uid } from '../data'
import { useStore } from '../context'
import { canDrive, tripPlaceName } from '../domain'
import type { Trip } from '../types'
import { Notice, StopTimeline } from './ui'
import { TimePicker } from './TimePicker'

export function AssignmentFields({
  vehicleId,
  driverId,
  setVehicleId,
  setDriverId,
}: {
  vehicleId: string
  driverId: string
  setVehicleId: (id: string) => void
  setDriverId: (id: string) => void
}) {
  const { state } = useStore()
  const vehicle = state.vehicles.find((v) => v.id === vehicleId)
  return (
    <div className="form-grid">
      <label className="field">
        <span>Vozidlo</span>
        <select
          required
          value={vehicleId}
          onChange={(e) => {
            setVehicleId(e.target.value)
            setDriverId('')
          }}
        >
          <option value="">Vyberte vozidlo</option>
          {state.vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.capacity} miest
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Vodič</span>
        <select required value={driverId} onChange={(e) => setDriverId(e.target.value)}>
          <option value="">Vyberte vodiča</option>
          {state.drivers.map((d) => (
            <option key={d.id} value={d.id} disabled={!vehicle || !canDrive(d, vehicle)}>
              {d.name} · {d.licenseCategories.join(', ') || 'bez evidovaného oprávnenia'}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

export function TripAssignmentForm({ trip, onDone }: { trip: Trip; onDone: () => void }) {
  const { act } = useStore()
  const [vehicleId, setVehicleId] = useState(trip.vehicleId)
  const [driverId, setDriverId] = useState(trip.driverId ?? '')
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (
          act(
            { type: 'assignTrip', id: trip.id, driverId, vehicleId },
            'Priradenie jazdy bolo uložené.',
          )
        )
          onDone()
      }}
    >
      <h3>Zmeniť priradenie jazdy</h3>
      <AssignmentFields {...{ vehicleId, driverId, setVehicleId, setDriverId }} />
      <button className="btn" disabled={vehicleId === trip.vehicleId && driverId === trip.driverId}>
        Uložiť priradenie
      </button>
    </form>
  )
}

export function PublishFixedModal({
  date,
  onClose,
  onPublish,
}: {
  date: string
  onClose: () => void
  onPublish: (date: string) => void
}) {
  const { state, act } = useStore()
  const earliest = addDays(state.serviceDate, 1)
  const [serviceDate, setServiceDate] = useState(date >= earliest ? date : earliest)
  const [templateId, setTemplateId] = useState('')
  const [departure, setDeparture] = useState('')
  const [driverId, setDriverId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const templates = [
    ...new Map(
      [...state.trips]
        .reverse()
        .filter((trip) => trip.kind === 'fixed')
        .map((trip) => [JSON.stringify([trip.line, trip.stops.map((stop) => stop.stopId)]), trip]),
    ).values(),
  ]
  const template = templates.find((trip) => trip.id === templateId)

  return (
    <Modal title="Zverejniť pravidelný spoj" onClose={onClose} actionErrors>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (
            act(
              {
                type: 'publishFixed',
                id: uid(),
                templateId,
                date: serviceDate,
                departure,
                driverId,
                vehicleId,
              },
              'Pravidelný spoj bol zverejnený v demo cestovnom poriadku.',
            )
          )
            onPublish(serviceDate)
        }}
      >
        <Notice>
          Pridáte jeden odchod na budúci deň. Poradie zastávok a jazdné časy prevezmete zo zvolenej
          trasy.
        </Notice>
        <label className="field">
          <span>Vzor pravidelného spoja</span>
          <select
            required
            value={templateId}
            onChange={(e) => {
              const trip = templates.find((t) => t.id === e.target.value)
              setTemplateId(e.target.value)
              setDeparture(trip?.stops[0].time ?? '')
              setVehicleId(trip?.vehicleId ?? '')
              setDriverId(trip?.driverId ?? '')
            }}
          >
            <option value="">Vyberte trasu</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.line} · {tripPlaceName(state, t, t.stops[0].stopId)} →{' '}
                {tripPlaceName(state, t, t.stops.at(-1)!.stopId)} · {t.stops.length} zastávok
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Dátum nového spoja</span>
            <input
              type="date"
              min={earliest}
              required
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
            />
          </label>
          <TimePicker label="Čas odchodu" value={departure} onChange={setDeparture} />
        </div>
        <AssignmentFields {...{ vehicleId, driverId, setVehicleId, setDriverId }} />
        {template && (
          <details>
            <summary>Zastávky vzoru z {dateLabel(template.date)}</summary>
            <StopTimeline trip={template} />
          </details>
        )}
        <button className="btn">Zverejniť spoj</button>
      </form>
    </Modal>
  )
}
