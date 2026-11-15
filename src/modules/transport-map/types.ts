/** Public contracts deliberately contain no application store, router or Leaflet types. */
export interface MapPoint {
  latitude: number
  longitude: number
}
export type MapBounds = readonly [MapPoint, MapPoint]
export interface FocusLocation {
  id: string
  name: string
  position: MapPoint
  kind: 'village' | 'city' | 'demo'
}
export interface MapArea {
  id: string
  name: string
  /** A camera/search envelope, not an administrative boundary or pickup authorization. */
  bounds: MapBounds
  focusLocations: readonly FocusLocation[]
}
export interface MapStop {
  id: string
  name: string
  municipality: string
  position: MapPoint
  status: 'approved' | 'proposed' | 'demo' | 'external'
}
export interface RouteStop {
  /** Unique within the directional pattern, including repeated visits to the same stop. */
  occurrenceId: string
  stopId: string
  time?: string
}
export interface RouteGeometry {
  type: 'LineString' | 'MultiLineString'
  /** GeoJSON order: longitude, latitude. */
  coordinates: number[][] | number[][][]
}
export interface MapRouteSegment {
  id: string
  code: string
  kind: 'fixed' | 'flex' | 'external'
  name: string
  geometry: RouteGeometry
  departure?: string
  arrival?: string
  demo: boolean
  sourceUrl?: string
  /** Complete published stop sequence, including stops without verified coordinates. */
  timetableStops?: readonly { name: string; time: string }[]
}
export interface MapLandmark {
  id: string
  name: string
  kind: 'school' | 'healthcare' | 'shop' | 'hospital'
  position: MapPoint
  sourceUrl: string
  coordinateSourceUrl: string
}
export interface MapRoute {
  /** Identifies one directional route pattern, not a seat reservation. */
  id: string
  code: string
  name: string
  direction: string
  kind: 'fixed' | 'flex' | 'external'
  stops: readonly RouteStop[]
  geometry?: RouteGeometry
  geometrySource: 'published' | 'computed' | 'schematic'
  segments?: readonly MapRouteSegment[]
  demoNote?: string
  /** Omit unknown calendars; a date filter must not guess availability. */
  serviceDates?: readonly string[]
  departures?: readonly { date: string; time: string }[]
  request?: {
    id: string
    date: string
    time: string
    timeMode: 'departure' | 'arrival'
    passengers: number
    status: 'pending' | 'approved'
  }
}
export interface MapDataset {
  name: string
  demo: boolean
  area: MapArea
  stops: readonly MapStop[]
  routes: readonly MapRoute[]
  landmarks?: readonly MapLandmark[]
}
export type MapMode = 'network' | 'route' | 'stop-picker' | 'place-picker'
export interface MapFilters {
  query: string
  kind: 'all' | MapRoute['kind']
  municipality: string
  date: string
  layer?: 'all' | 'routes' | 'requests'
  timeFrom?: string
  timeTo?: string
}
export interface PlaceSelection {
  position: MapPoint
  label: string
  source: 'map' | 'search' | 'geolocation' | 'stop'
  /** Set only when explicitly selecting a supplied stop. An address is never a stop. */
  stopId?: string
  address?: string
  addressPrecision?: string
}
export interface MapSelection {
  routeId: string | null
  stopOccurrenceId: string | null
  place: PlaceSelection | null
}
export interface StopSelection {
  routeId: string
  occurrenceId: string
  index: number
  stop: MapStop
}
export interface AddressResult {
  id: string
  label: string
  position: MapPoint
  precision: string
}
export interface GeocodingService {
  attribution: string
  search: (text: string, signal: AbortSignal) => Promise<readonly AddressResult[]>
  reverse: (point: MapPoint, signal: AbortSignal) => Promise<AddressResult | null>
}
export interface RoutingService {
  route: (
    points: readonly MapPoint[],
    profile: 'drive' | 'walk',
    signal: AbortSignal,
  ) => Promise<{ geometry: RouteGeometry; distanceMeters: number; durationSeconds: number }>
}
export interface MapTileSource {
  url: string
  attribution: string
  maxZoom: number
}
export interface TransportMapProps {
  dataset: MapDataset
  mode?: MapMode
  selection?: MapSelection
  initialSelection?: Partial<MapSelection>
  filters?: MapFilters
  onSelectionChange?: (selection: MapSelection) => void
  onFiltersChange?: (filters: MapFilters) => void
  onRouteSelect?: (routeId: string | null) => void
  onRequestOpen?: (requestId: string) => void
  onStopSelect?: (selection: StopSelection) => void
  onPlaceConfirm?: (place: PlaceSelection) => void
  geocoder?: GeocodingService
  /** Computes missing road geometry. Published shapes always take precedence. */
  routing?: RoutingService
  tiles?: MapTileSource
  /** Optional authoritative coverage check. The viewport envelope is not used for this. */
  isPlaceAllowed?: (point: MapPoint) => boolean
  className?: string
}
