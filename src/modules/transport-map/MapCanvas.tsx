import { Fragment, useEffect, useRef } from 'react'
import { divIcon, latLngBounds } from 'leaflet'
import {
  MapContainer,
  Marker,
  Popup,
  Polyline,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  boundsOf,
  boundsOfRoutes,
  pointKey,
  routeLines,
  routeStops,
  routeColor,
  stopDisplayPoint,
  stopLabel,
  segmentColor,
} from './model'
import type {
  MapBounds,
  MapDataset,
  MapPoint,
  MapRoute,
  MapSelection,
  MapStop,
  MapTileSource,
  StopSelection,
} from './types'

export interface CameraRequest {
  token: number
  bounds?: MapBounds
  point?: MapPoint
}
interface Props {
  dataset: MapDataset
  routes: readonly MapRoute[]
  selection: MapSelection
  pickPlace: boolean
  tiles: MapTileSource
  camera: CameraRequest | null
  onPick: (point: MapPoint) => void
  onRouteClick: (routeId: string) => void
  onStop: (selection: StopSelection) => void
  onTileError: () => void
  onPlaceStop?: (stop: MapStop) => void
  topPadding: number
  bottomPadding?: number
  showRoadContext?: boolean
}
const latLng = (p: MapPoint): [number, number] => [p.latitude, p.longitude]
const toBounds = (bounds: MapBounds) => latLngBounds(bounds.map(latLng))
const icons = {
  stop: divIcon({
    className: 'tm-stop-icon',
    html: '<span></span>',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  }),
  selected: divIcon({
    className: 'tm-stop-icon tm-stop-icon-selected',
    html: '<span></span>',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  }),
  city: divIcon({
    className: 'tm-focus-icon tm-focus-city',
    html: '<span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  }),
  village: divIcon({
    className: 'tm-focus-icon',
    html: '<span></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  }),
}
function Camera({
  camera,
  selection,
  routes,
  dataset,
  pickPlace,
  onPick,
  topPadding,
  bottomPadding,
}: Props) {
  const userMoving = useRef(false)
  const map = useMapEvents({
    click: (e) => {
      if (pickPlace) {
        userMoving.current = false
        const point = { latitude: e.latlng.lat, longitude: e.latlng.lng }
        onPick(point)
        map.panTo(e.latlng, { animate: false })
      }
    },
    dragstart: () => {
      userMoving.current = true
    },
    moveend: () => {
      if (pickPlace && userMoving.current) {
        userMoving.current = false
        const p = map.getCenter()
        onPick({ latitude: p.lat, longitude: p.lng })
      }
    },
  })
  useEffect(() => {
    const container = map.getContainer()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key.startsWith('Arrow')) userMoving.current = true
    }
    const wheel = () => {
      userMoving.current = true
    }
    container.addEventListener('keydown', keyboard, true)
    container.addEventListener('wheel', wheel, { passive: true })
    return () => {
      container.removeEventListener('keydown', keyboard, true)
      container.removeEventListener('wheel', wheel)
    }
  }, [map])
  const lastRoute = useRef<string | null>(null)
  useEffect(() => {
    map.getContainer().setAttribute('role', 'region')
    map.getContainer().setAttribute('aria-label', `Mapa: ${dataset.area.name}`)
  }, [map, dataset.area.name])
  useEffect(() => {
    map.attributionControl.setPrefix(false)
    let frame = 0
    const resize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false, debounceMoveend: true }))
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : undefined
    observer?.observe(map.getContainer())
    if (map.getContainer().parentElement) observer?.observe(map.getContainer().parentElement!)
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    resize()
    return () => {
      observer?.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
    }
  }, [map])
  useEffect(() => {
    if (!camera) return
    if (camera.bounds)
      map.fitBounds(toBounds(camera.bounds), {
        paddingTopLeft: [32, topPadding],
        paddingBottomRight: [32, bottomPadding ?? Math.round(map.getSize().y * 0.4)],
        maxZoom: 15,
        animate: false,
      })
    if (camera.point)
      map.setView(latLng(camera.point), Math.max(map.getZoom(), 16), { animate: false })
  }, [camera, map, topPadding, bottomPadding])
  useEffect(() => {
    if (!pickPlace || !selection.place) return
    const center = map.getCenter()
    if (
      pointKey({ latitude: center.lat, longitude: center.lng }) !==
      pointKey(selection.place.position)
    ) {
      map.panTo(latLng(selection.place.position), { animate: false })
    }
  }, [map, pickPlace, selection.place])
  useEffect(() => {
    if (pickPlace) return
    if (lastRoute.current === selection.routeId) return
    lastRoute.current = selection.routeId
    const route = routes.find((r) => r.id === selection.routeId)
    if (!route) return
    const bounds = boundsOfRoutes([route], dataset.stops)
    if (bounds)
      map.fitBounds(toBounds(bounds), {
        paddingTopLeft: [32, topPadding],
        paddingBottomRight: [32, bottomPadding ?? Math.round(map.getSize().y * 0.4)],
        maxZoom: 15,
        animate: false,
      })
  }, [selection.routeId, routes, dataset.stops, map, pickPlace, topPadding, bottomPadding])
  useEffect(() => {
    if (!selection.stopOccurrenceId || pickPlace) return
    const route = routes.find((r) => r.id === selection.routeId)
    const occurrence = route?.stops.find((s) => s.occurrenceId === selection.stopOccurrenceId)
    const stop = dataset.stops.find((s) => s.id === occurrence?.stopId)
    if (stop)
      map.panInside(latLng(route ? stopDisplayPoint(route, stop.position) : stop.position), {
        paddingTopLeft: [45, topPadding],
        paddingBottomRight: [45, bottomPadding ?? Math.round(map.getSize().y * 0.4)],
        animate: false,
      })
  }, [
    selection.stopOccurrenceId,
    selection.routeId,
    dataset.stops,
    routes,
    map,
    pickPlace,
    topPadding,
    bottomPadding,
  ])
  return null
}
function Routes({
  dataset,
  routes,
  selection,
  pickPlace,
  onRouteClick,
  onStop,
  onPlaceStop,
}: Props) {
  const selected = routes.find((r) => r.id === selection.routeId)
  return (
    <>
      {pickPlace &&
        dataset.stops.map((stop, index) => (
          <Marker
            key={stop.id}
            position={latLng(stop.position)}
            title={stop.name}
            alt={stop.name}
            icon={divIcon({
              className: 'tm-stop-icon',
              html: `<span>${index + 1}</span>`,
              iconSize: [44, 44],
              iconAnchor: [22, 22],
            })}
            eventHandlers={{ click: () => onPlaceStop?.(stop) }}
          >
            <Tooltip>{stop.name}</Tooltip>
          </Marker>
        ))}
      {[...routes]
        .sort((a, b) => Number(a.id === selected?.id) - Number(b.id === selected?.id))
        .map((route) => {
          const active = route.id === selected?.id
          const lines = routeLines(route).map((line) => line.map(latLng))
          return (
            <Fragment key={route.id}>
              <Polyline
                positions={lines}
                interactive={false}
                pathOptions={{
                  color: '#fffef8',
                  weight: active ? 10 : 7,
                  opacity: selected && !active ? 0.35 : 0.9,
                }}
              />
              {(route.segments ?? [route]).map((segment, index) => (
                <Polyline
                  key={segment.id}
                  positions={routeLines(segment).map((line) => line.map(latLng))}
                  interactive={false}
                  pathOptions={{
                    color: route.segments ? segmentColor(index) : routeColor(segment),
                    weight: active ? 7 : 5,
                    opacity: 1,
                    dashArray: segment.kind === 'external' ? '10 9' : undefined,
                  }}
                />
              ))}
              {!pickPlace && (
                <Polyline
                  positions={lines}
                  bubblingMouseEvents={false}
                  pathOptions={{ color: 'transparent', weight: 28, opacity: 0 }}
                  eventHandlers={{
                    click: () => onRouteClick(route.id),
                  }}
                />
              )}
            </Fragment>
          )
        })}
      {selected &&
        !pickPlace &&
        routeLines(selected).flatMap((line, lineIndex) =>
          line.flatMap((b, i) => {
            if (!i || i % Math.max(1, Math.ceil(line.length / 5))) return []
            const a = line[i - 1]
            const dx = (b.longitude - a.longitude) * Math.cos((a.latitude * Math.PI) / 180)
            const dy = b.latitude - a.latitude
            if (!dx && !dy) return []
            const angle = (-Math.atan2(dy, dx) * 180) / Math.PI
            return [
              <Marker
                key={`direction-${lineIndex}-${i}`}
                position={[(a.latitude + b.latitude) / 2, (a.longitude + b.longitude) / 2]}
                interactive={false}
                keyboard={false}
                icon={divIcon({
                  className: 'tm-direction-icon',
                  html: `<span style="transform:rotate(${angle}deg)">➤</span>`,
                  iconSize: [24, 24],
                  iconAnchor: [12, 12],
                })}
              />,
            ]
          }),
        )}
      {selected &&
        !pickPlace &&
        routeStops(selected, dataset.stops).map(({ stop, occurrenceId, index, time }) => (
          <Marker
            key={occurrenceId}
            position={latLng(stopDisplayPoint(selected, stop.position))}
            icon={divIcon({
              className: `tm-stop-icon ${selection.stopOccurrenceId === occurrenceId ? 'tm-stop-icon-selected' : ''}`,
              html: `<span style="border-color:${selected.segments ? segmentColor(index === selected.stops.length - 1 ? selected.segments.length - 1 : 0) : routeColor(selected)}">${index + 1}</span>`,
              iconSize: [44, 44],
              iconAnchor: [22, 22],
            })}
            title={stopLabel(selected, index, stop)}
            alt={stopLabel(selected, index, stop)}
            keyboard
            eventHandlers={{
              click: () => onStop({ routeId: selected.id, occurrenceId, index, stop }),
            }}
          >
            <Tooltip direction="top">
              {stopLabel(selected, index, stop)}
              {time ? ` · ${time}` : ''}
            </Tooltip>
          </Marker>
        ))}
      {!selected &&
        !pickPlace &&
        dataset.area.focusLocations.map((location) => (
          <Marker
            key={location.id}
            position={latLng(location.position)}
            icon={location.kind === 'city' ? icons.city : icons.village}
            interactive={false}
            keyboard={false}
          >
            <Tooltip
              permanent
              direction={location.kind === 'city' ? 'top' : 'bottom'}
              offset={location.kind === 'city' ? [0, -7] : [0, 7]}
              className="tm-focus-label"
            >
              {location.name}
            </Tooltip>
          </Marker>
        ))}
      {dataset.landmarks?.map((place) => (
        <Marker
          key={place.id}
          position={latLng(place.position)}
          title={place.name}
          alt={place.name}
          icon={divIcon({
            className: `tm-landmark-icon tm-landmark-${place.kind}`,
            html: `<span aria-hidden="true">${place.kind === 'school' ? '🏫' : place.kind === 'shop' ? '🛒' : '✚'}</span>`,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          })}
        >
          <Tooltip>{place.name}</Tooltip>
          <Popup>
            <strong>{place.name}</strong>
            <p>Orientačný bod · nie zastávka</p>
            <a href={place.sourceUrl} target="_blank" rel="noreferrer">
              Zdroj informácií
            </a>
            {' · '}
            <a href={place.coordinateSourceUrl} target="_blank" rel="noreferrer">
              Poloha na mape
            </a>
          </Popup>
        </Marker>
      ))}
    </>
  )
}
export default function MapCanvas(props: Props) {
  const initialBounds =
    boundsOf(
      props.pickPlace && props.selection.place
        ? [props.selection.place.position]
        : props.dataset.area.focusLocations.map((p) => p.position),
    ) ?? props.dataset.area.bounds
  // A separate camera request focuses the six pilot locations. Never fit on every render.
  return (
    <MapContainer
      className="tm-leaflet"
      bounds={toBounds(initialBounds)}
      boundsOptions={{
        paddingTopLeft: [32, props.topPadding],
        paddingBottomRight: [32, 32],
        maxZoom: props.pickPlace && props.selection.place ? 16 : 14,
      }}
      minZoom={5}
      maxZoom={props.tiles.maxZoom}
      zoomControl={false}
      keyboard
      scrollWheelZoom
      zoomAnimation={false}
      fadeAnimation={false}
      aria-label={`Interaktívna mapa: ${props.dataset.area.name}`}
    >
      <TileLayer
        key={props.tiles.url}
        url={props.tiles.url}
        attribution={props.tiles.attribution}
        maxZoom={props.tiles.maxZoom}
        eventHandlers={{ tileerror: props.onTileError }}
      />
      <ZoomControl
        position="topright"
        zoomInTitle="Priblížiť"
        zoomOutTitle="Oddialiť"
        zoomInText="+"
        zoomOutText="−"
      />
      {props.showRoadContext && props.dataset.roadContext && (
        <Polyline
          positions={(props.dataset.roadContext.type === 'LineString'
            ? [props.dataset.roadContext.coordinates as number[][]]
            : (props.dataset.roadContext.coordinates as number[][][])
          ).map((line) => line.map((p): [number, number] => [p[1], p[0]]))}
          interactive={false}
          pathOptions={{ color: '#9aa88d', weight: 2, opacity: 0.7 }}
        />
      )}
      <Camera {...props} />
      <Routes {...props} />
    </MapContainer>
  )
}
