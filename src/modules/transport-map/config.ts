import type { MapArea, MapFilters, MapSelection, MapTileSource } from './types'

export const PRESOVSKY_KRAJ: MapArea = {
  id: 'sk-presovsky-kraj',
  name: 'Prešovský kraj',
  // Deliberately approximate viewing/search envelope, not an administrative polygon.
  bounds: [
    { latitude: 48.75, longitude: 19.7 },
    { latitude: 49.5, longitude: 22.65 },
  ],
  // Populate from the team's five villages + city; never infer them from the old demo.
  focusLocations: [],
}
export const DEFAULT_TILES: MapTileSource = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">prispievatelia OpenStreetMap</a>',
  maxZoom: 19,
}
export const EMPTY_FILTERS: MapFilters = { query: '', kind: 'all', municipality: '', date: '' }
export const EMPTY_SELECTION: MapSelection = {
  routeId: null,
  stopOccurrenceId: null,
  place: null,
}
