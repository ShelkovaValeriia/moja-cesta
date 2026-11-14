import { useEffect, useRef } from 'react'
import { divIcon, DomEvent } from 'leaflet'
import { MapContainer, Marker, TileLayer, ZoomControl, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { JourneyPlace, Stop } from '../types'
import { customPlace, REGION_BOUNDS, REGION_CENTER, stopPlace } from '../places'
const stopIcon = divIcon({
  className: 'location-stop-marker',
  html: '<span></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})
const chosenIcon = divIcon({
  className: 'location-chosen-marker',
  html: '<span></span>',
  iconSize: [32, 40],
  iconAnchor: [16, 38],
})
function Controls({
  selected,
  onSelect,
}: {
  selected: JourneyPlace | null
  onSelect: (place: JourneyPlace) => void
}) {
  const centerButton = useRef<HTMLButtonElement>(null)
  const map = useMapEvents({
    click: (e) => {
      onSelect(customPlace(e.latlng.lat, e.latlng.lng))
    },
  })
  useEffect(() => {
    map.attributionControl.setPrefix(false)
    if (centerButton.current) {
      DomEvent.disableClickPropagation(centerButton.current)
      DomEvent.disableScrollPropagation(centerButton.current)
    }
    const id = window.setTimeout(() => map.invalidateSize(), 0)
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => map.invalidateSize())
        : undefined
    observer?.observe(map.getContainer())
    return () => {
      window.clearTimeout(id)
      observer?.disconnect()
    }
  }, [map])
  useEffect(() => {
    if (selected) map.panTo([selected.latitude, selected.longitude], { animate: false })
  }, [map, selected])
  return (
    <button
      type="button"
      ref={centerButton}
      className="map-center-choice"
      onClick={() => {
        const point = map.getCenter()
        onSelect(customPlace(point.lat, point.lng))
      }}
    >
      Vybrať stred mapy
    </button>
  )
}
export default function LocationMap({
  selected,
  stops,
  onSelect,
  onTileError,
}: {
  selected: JourneyPlace | null
  stops: Stop[]
  onSelect: (place: JourneyPlace) => void
  onTileError: () => void
}) {
  const center: [number, number] = selected
    ? [selected.latitude, selected.longitude]
    : REGION_CENTER
  return (
    <MapContainer
      className="location-leaflet"
      center={center}
      zoom={13}
      minZoom={10}
      maxZoom={19}
      maxBounds={REGION_BOUNDS}
      maxBoundsViscosity={1}
      zoomAnimation={false}
      fadeAnimation={false}
      zoomControl={false}
      scrollWheelZoom
      keyboard
      aria-label="Mapa výberu miesta v Zamagurí"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution={
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">prispievatelia OpenStreetMap</a>'
        }
        maxZoom={19}
        eventHandlers={{ tileerror: onTileError }}
      />
      <ZoomControl
        position="topleft"
        zoomInTitle="Priblížiť"
        zoomOutTitle="Oddialiť"
        zoomInText="+"
        zoomOutText="−"
      />
      {stops.map((stop) => {
        const place = stopPlace(stop)
        return place ? (
          <Marker
            key={stop.id}
            position={[place.latitude, place.longitude]}
            icon={stopIcon}
            title={stop.name}
            alt={`Zastávka: ${stop.name}`}
            keyboard
            eventHandlers={{ click: () => onSelect(place) }}
          />
        ) : null
      })}
      {selected && (
        <Marker
          position={[selected.latitude, selected.longitude]}
          icon={chosenIcon}
          title="Vybrané miesto"
          alt="Vybrané miesto na mape"
        />
      )}
      <Controls selected={selected} onSelect={onSelect} />
    </MapContainer>
  )
}
