import { createPortal } from 'react-dom'
import { useMemo, useState } from 'react'
import { Check, MapPin } from 'lucide-react'
import type { JourneyPlace } from '../types'
import { useStore } from '../context'
import { coordinates, customPlace, inRegion, stopPlace } from '../places'
import { Modal } from './ui'
import { TransportMap, EMPTY_SELECTION } from '../modules/transport-map'
import { stopDataset } from '../maps/applicationMap'
export function PlacePickerModal({
  side,
  initial,
  draftName = '',
  onConfirm,
  onClose,
}: {
  side: 'from' | 'to'
  initial?: JourneyPlace
  draftName?: string
  onConfirm: (place: JourneyPlace) => void
  onClose: () => void
}) {
  const { state } = useStore(),
    [selected, setSelected] = useState<JourneyPlace | null>(initial ?? null),
    [name, setName] = useState(
      initial?.type === 'custom' && initial.name !== 'Vybrané miesto na mape'
        ? initial.name
        : draftName,
    ),
    [latitude, setLatitude] = useState(initial?.latitude.toString() ?? ''),
    [longitude, setLongitude] = useState(initial?.longitude.toString() ?? ''),
    [error, setError] = useState('')
  const dataset = useMemo(() => stopDataset(state.stops), [state.stops])
  function choose(place: JourneyPlace) {
    if (!inRegion(place.latitude, place.longitude)) {
      setError('Vyberte miesto v obsluhovanom regióne Zamagurie.')
      return
    }
    setSelected(place)
    setLatitude(place.latitude.toString())
    setLongitude(place.longitude.toString())
    setError('')
  }
  const final =
    selected?.type === 'custom'
      ? customPlace(selected.latitude, selected.longitude, name)
      : selected
  return createPortal(
    <Modal
      title={side === 'from' ? 'Vybrať miesto odchodu' : 'Vybrať cieľ cesty'}
      onClose={onClose}
    >
      <div className="place-picker-map">
        <TransportMap
          dataset={dataset}
          mode="place-picker"
          chrome="compact"
          height="container"
          selection={{
            ...EMPTY_SELECTION,
            place: selected
              ? {
                  position: { latitude: selected.latitude, longitude: selected.longitude },
                  label: selected.name,
                  source: selected.type === 'stop' ? 'stop' : 'map',
                  stopId: selected.stopId,
                }
              : null,
          }}
          isPlaceAllowed={(p) => inRegion(p.latitude, p.longitude)}
          onSelectionChange={({ place }) => {
            if (!place) return
            const stop = place.stopId && state.stops.find((s) => s.id === place.stopId)
            const known = stop && stopPlace(stop)
            choose(known || customPlace(place.position.latitude, place.position.longitude))
          }}
          renderCard={() => (
            <div className="place-picker-content">
              {final && (
                <div className="selected-place" role="status">
                  <MapPin size={21} />
                  <div>
                    <strong>{final.name}</strong>
                    <p>{coordinates(final)}</p>
                    <small>
                      {final.type === 'stop'
                        ? 'Existujúca demo zastávka'
                        : 'Vlastný bod · nie je schválenou zastávkou'}
                    </small>
                  </div>
                </div>
              )}
              {selected?.type !== 'stop' && (
                <label className="field">
                  <span>
                    Názov alebo adresa <small>nepovinné</small>
                  </span>
                  <input
                    maxLength={200}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Vlastný názov, ak ho poznáte"
                  />
                </label>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="btn btn-wide"
                type="button"
                disabled={!final || !!error}
                onClick={() => {
                  if (final) {
                    onConfirm(final)
                    onClose()
                  }
                }}
              >
                <Check size={18} />
                Potvrdiť miesto
              </button>
              <label className="field">
                <span>Existujúca zastávka</span>
                <select
                  value={selected?.type === 'stop' ? selected.stopId : ''}
                  onChange={(e) => {
                    const stop = state.stops.find((s) => s.id === e.target.value),
                      place = stop && stopPlace(stop)
                    if (place) choose(place)
                  }}
                >
                  <option value="">Vyberte bod na mape alebo zastávku</option>
                  {state.stops
                    .filter((s) => stopPlace(s))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              <details className="coordinate-entry">
                <summary>Zadať súradnice</summary>
                <div className="form-grid">
                  <label className="field">
                    <span>Zemepisná šírka</span>
                    <input
                      type="number"
                      step="any"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Zemepisná dĺžka</span>
                    <input
                      type="number"
                      step="any"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (
                      !latitude.trim() ||
                      !longitude.trim() ||
                      !Number.isFinite(Number(latitude)) ||
                      !Number.isFinite(Number(longitude))
                    ) {
                      setError('Vyplňte obe platné súradnice.')
                      return
                    }
                    choose(customPlace(Number(latitude), Number(longitude)))
                  }}
                >
                  Zobraziť bod
                </button>
              </details>
              <p className="muted">
                Posuňte alebo priblížte mapu a kliknite na miesto. Očíslované body označujú
                existujúce demo zastávky.
              </p>
              <p className="map-demo-coordinates">
                Polohy zastávok sú ukážkové. Mapa © prispievatelia OpenStreetMap.
              </p>
            </div>
          )}
        />
      </div>
    </Modal>,
    document.body,
  )
}
