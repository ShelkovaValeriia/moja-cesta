# Transport map module

Mobile-first, Slovak React/TypeScript module. Public entry: `index.ts`. No dependency on the application router, store, authentication or localStorage. Leaflet loads lazily. Application workflows reuse the renderer with their own bottom cards.

## Responsibilities and application hosts

The module renders tiles and road geometry, manages the camera/zoom, shows at most one selected journey, numbers stops by their actual occurrence order, and emits route/stop/place selections. It resolves missing road geometry through the injected provider only for the selected route. It does not select an operational itinerary, approve a stop, book seats, authorize a driver, change attendance or provide GPS/turn instructions.

`renderCard(context)` supplies workflow content to the same expandable bottom card. `context` exposes the filtered dataset/routes, selected route/stop/place, `view` (`routes` or `stops`), `selectRoute`, `selectStop`, `showRoutes` and `showStops`. Omitting the slot preserves the standalone browser. Use `chrome="compact"` to place workflow controls in the card, and `height="container"` inside a parent with a definite height. The canvas and its road/marker behavior remain shared.

Application projections live outside this independent module in `src/maps/applicationMap.ts`:

- `/passenger/requests`: existing search context, date/time/direction filters, public aggregate request list, explicit selection, stop detail and existing request/join/new-request links. Public endpoints are shared stops, never private proposed pickup pins. Interest remains distinct from confirmation.
- `PlacePickerModal`: reused by search and request/regular-plan fields; approved/demo stop selection, arbitrary coordinates and manual place name, preserving the existing `JourneyPlace` origin type and approval rules. No invented reverse-geocoded address. One shared Leaflet canvas replaces the former `LocationMap` implementation.
- `/driver/map`: assigned unfinished trips only, selected trip's full ordered stops, planned times, vehicle and aggregate boarding/alighting. No passenger identities or operational mutations.
- `/driver/navigation/:id`: the existing execution card for next-stop arrival and stopped attendance/continuation. `DriverNavigationMap` projects the authorized trip; selecting a pin cannot change the current operational stop or attendance. Existing domain guards remain authoritative.

The application uses its current store data, not the standalone pilot's synthetic services or historical bus feed. Public-stop road geometry uses `VITE_MAP_OSRM_URL` or the optional public OSRM demo fallback. Private trip points are blocked from the public fallback; a suitable explicitly configured router additionally requires `VITE_MAP_PRIVATE_ROUTING=true`. Missing coordinates or service failures leave cards/stop lists available with an honest notice. Demo stop coordinates remain approximate; road snapping does not approve their safety or alter stored pickup positions. Internet is needed for tiles and uncached roads.

The existing application fixtures are less precise than the standalone pilot geography. For their **display only**, the host uses a 300 m road-snap radius (the synthetic hub point is about 204 m from the nearest mapped road); the reusable OSRM adapter retains its 100 m default. The original `lech` point was approximately 1 km from a drivable road. It has been replaced with public stop 46701 (Lechnica) from the supplied Transdata GTFS geography; this does not verify the legacy demo church label or stopping safety. A narrow migration repairs only that original coordinate pair, including explicit stop references, preserving custom pins, edited coordinates and reservations. Operator-verified coordinates are still needed before real service.

## Standalone preview

Run `npm ci`, `npm run dev`, then open `/map.html`. Production `npm run build` includes both the application and this preview.

Default: Prešovský kraj, automatically framed around Spišská Stará Ves (hub), Havka, Zálesie, Jezersko, Lechnica and Veľká Lesná. `Pilotná oblasť` restores that frame; `Celý kraj` uses an approximate regional viewing envelope. This rectangle is **not** an administrative boundary or an authorization to collect passengers.

Map-first layout: the map fills the viewport on mobile and desktop. Information appears in a scrollable bottom card, expandable with an accessible button. **At most one general journey is drawn.** Initially no route is selected. Clicking a list entry selects/draws it and opens its stops immediately. The arrow returns to the list while keeping that route selected. Selecting another entry replaces the map route. Filtering away a selection clears it. A general journey may contain several transport legs, which are portions of that one journey, not simultaneously selected alternatives. Camera fitting reserves overlay space; touch/pinch/keyboard controls and 44px targets remain supported.

Colors identify bus services and stay stable through filtering/selection. Managed Fixed/Flex uses solid lines; external services use dashed lines, independently of geometry provenance. Pending requests remain explicitly unconfirmed. Circular stop markers are centered above the line and display **1, 2, … in stored route order**, including repeat visits. Managed stops are labelled `Zastávka 1`, `Zastávka 2`, …; external stop names remain verbatim from GTFS. Municipalities provide context, not invented stop names. Any visual alignment preserves original coordinates in callbacks and details. Markers have 44px hit targets.

`MapRoute.segments` represents the legs of a combined journey with their own ownership, geometry, times and provenance. Legs use contrasting colors (blue, orange, purple, …); solid/dashed styling still represents ownership. `timetableStops` carries the complete public sequence even when intermediate coordinates have not been verified. No invented intermediate pins are placed. Segment and landmark links are validated as HTTPS. `MapDataset.landmarks` accepts independently sourced school/healthcare/shop/hospital points with source links; popups identify them as landmarks rather than approved bus stops.

The fullscreen preview reads pending/approved requests from the shared application demo state, updates on storage/focus events, and exposes public aggregated features through `demo/request-adapter.ts`. It never copies private pins, assistance notes or passenger identities. An outward and required return are separate visual legs of the same request, not separate confirmations. Public representative stops are illustrative municipality locations, not assigned pickups.

`MapFilters.layer` selects all/routes/requests. `date`, `timeFrom`, `timeTo` filter by an inclusive same-day interval in Slovak-local HH:mm. A request uses its desired departure or desired-arrival time (shown in detail); timetable routes use explicitly supplied `departures`. Unknown times/calendars never pass an active time/date filter. Inverted or malformed intervals show no results. `MapRoute.request` carries public id/date/time/timeMode/passengers/status only; `onRequestOpen` delegates the detail/join flow to the host.

`SlovakDateInput` displays `D. M. YYYY` with day before month, regardless of the browser locale. It supports empty optional filters, validates real calendar dates and min/max constraints, and emits ISO `YYYY-MM-DD` to callers. The application retains its newer `DateInput` calendar and `TimePicker`; the standalone map uses its independent controls. Time remains 24-hour `HH:mm`; locale changes never alter stored dates/times.

## Integration

```tsx
import { TransportMap, EMPTY_SELECTION } from './modules/transport-map'
import type { MapDataset, MapSelection } from './modules/transport-map'

const [selection, setSelection] = useState<MapSelection>(EMPTY_SELECTION)

<TransportMap
  dataset={dataset as MapDataset}
  mode="network"
  selection={selection}
  onSelectionChange={setSelection}
  onRouteSelect={(id) => console.log('Directional route pattern', id)}
  onStopSelect={(value) => console.log(value.routeId, value.occurrenceId, value.stop.id)}
  onPlaceConfirm={(place) => console.log(place.position, place.label)}
/>
```

Presets: `network`, `route`, `stop-picker`, `place-picker`. Supply an initial/controlled route ID for single-route embedding. A route is never automatically selected. Filters are optionally controlled via `filters` and `onFiltersChange`; otherwise local. Filter changes remove incompatible route/stop selections. Route selection is not selection of a scheduled trip or a reservation.

`MapDataset` includes the service area, six focus locations, public stops and directional patterns. `MapRoute.geometry` uses GeoJSON `[longitude, latitude]`; `MapPoint` uses named `latitude`/`longitude`. Every occurrence references a supplied stop. `parseMapDataset` validates imported JSON and strips unrelated properties. Supply this contract through props; the older `MapPlayground` reference component also demonstrates JSON import.

`serviceDates` is optional. Without a known calendar, routes do not pass an active date filter. Do not populate it with guessed operating dates. Times, when supplied, must be Slovak-local `HH:mm`; GTFS after-midnight service-day times need normalization in a timetable adapter before display.

The module emits selections only. Parent application/domain services own booking, capacity, approvals and permissions. Supply already-authorized public features; never send household addresses, passenger identities, guardian contacts or medical notes into the public dataset. `isPlaceAllowed` can supply an authoritative geographic coverage check. `MapStop.status` distinguishes approved, proposed, external and demo locations; arbitrary pins never acquire a stop ID. A referenced external stop is not an approved managed-fleet pickup.

## Geographic services

The default OSM raster layer requires internet and visible attribution. It honors normal browser caching, does not prefetch and has no offline/SLA promise. Use the `tiles` prop to substitute your contracted hosting. Follow https://operations.osmfoundation.org/policies/tiles/.

Address autocomplete and reverse lookup are injected as a `GeocodingService`. The supplied Geoapify adapter requires a key. For the preview, copy `.env.example` to `.env.local`, configure `VITE_MAP_GEOAPIFY_KEY`, and restart Vite. Browser keys are public; restrict origins and quotas in the provider dashboard. No public Nominatim autocomplete is used. Only explicit search text or a selected point is sent to the configured geocoder, never passenger/account data. Review provider terms/privacy before real passenger use.

Autocomplete waits 350ms; reverse lookup waits 450ms after a point changes. Both abort old requests and ignore late responses. Reverse geocoding changes the label, **never** the selected coordinates. A coarse or missing result remains a point that the user can name manually. The module requests browser location only after `Moja poloha` is pressed. Location failure leaves map/manual selection available.

Road routing is part of the module: inject `routing: RoutingService` into `TransportMap`. Published geometries take priority. For missing geometry, the module requests a road path through **all stops in their stored order**, reuses successful results, ignores obsolete responses, and provides a retry after failure. It **never draws straight stop-to-stop connectors** as a fallback; failed routes remain selectable in the list with an explicit notice.

`createGeoapifyRouting` supports road/walk candidates with a configured key. `createOsrmRouting({ endpoint })` supports driving with full GeoJSON geometry, a maximum 100m stop snap, serial requests and a 25-second timeout. The preview uses Geoapify when its key is set, otherwise `VITE_MAP_OSRM_URL` or the public OSRM demo. It sends only public stop coordinates, never private request pins or passenger details. Replace the public demo with a contracted/self-hosted endpoint for deployment. The adapter defaults to at most one request per 1.1 seconds; the [OSRM demo usage policy](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) limits usage to one request per second and provides no availability guarantee. [OSRM route API](https://project-osrm.org/docs/v26.4.0/http) documents ordered waypoints and full road geometry.

The active fullscreen demo loads geographic-only `demo/pilot-geography.json`, 16 hub paths in `demo/pilot-road-cache.json`, the computed Poprad corridor in `demo/transfer-road.json`, and the newly researched public timetable in `demo/public-connection.json`. `createPilotDemo` builds five complete village–hub–Poprad journeys, ten synthetic managed feeder directions, and public request projections. The selected demonstration date is **16 November 2026**. Public bus times are independently sourced from the operator; feeder times are explicitly synthetic. Full provenance, exact timetable pages, operating-day restrictions and the qualified Košice search result are in [demo/SOURCES.md](demo/SOURCES.md).

Run `node scripts/cache-map-transfer.mjs` to regenerate geographic-only pilot data, hub cache and Poprad corridor. `scripts/cache-map-roads.mjs`, `demo/road-cache.json`, and `demo/pilot-data.json` remain archival import/reference fixtures; their historical public patterns are **not imported by the active fullscreen host or offered as public services**. Newly encountered combinations are computed by the injected routing service. Original supplied documents remain unchanged.

A computed driving path is not proof that a minibus can legally stop/drive there, nor the operator's verified bus shape; it cannot replace a published route or certify accessible walking. The interface can be adapted to the team's future Valhalla backend. No fleet assignment algorithm is embedded in the renderer.

## Supplied pilot data and provenance

`demo/pilot-data.json` is generated by `python -X utf8 scripts/import-map-pilot.py` from the supplied `data a podklady/03_Podklady z dispecingu IDS Vychod/gtfs.zip`. Re-running is deterministic; the source is never modified. The JSON records source SHA-256, publisher, version and validity.

The supplied feed is Transdata `20251106_1137`, valid **2025-11-01 to 2026-02-09**, and has no `shapes.txt`. The archival import extracts 16 directional patterns with 88 stops. Per the user's latest instruction, those historical public routes are excluded from the active demo; only public geographic positions are retained as illustrative demo points. The independently researched SAD Poprad through service is a separate fixture from current operator PDFs. The September 2026 movement counts are also separate and are not represented as current schedules or map vehicle positions.

## Verification

Run `npm test`, `npm run lint`, `npm run build`. Module tests cover supplied data, filters, unknown calendars, overlapping opposite directions, GeoJSON order, invalid imports, repeated stop visits, explicit selection, stale address/routing responses, retry, cached pilot coverage, numbered stops and suppression of straight-line fallbacks. The fullscreen host is fixed to all four viewport edges. Leaflet invalidates its layout after container, parent, window and visual-viewport resize, including mobile orientation/browser chrome changes. Browser checks must also cover real map gestures, responsive layouts and tile/network failures. Live Geoapify coverage/routing requires a configured key and is separate from mocked adapter tests.

The general passenger map now includes public Fixed trip projections as well as requests. Contextual regular-line and search-result maps keep their eligible trip sets and booking controls inside their host card; general navigation starts a new unscoped view. Request withdrawal uses the shared domain guard in `requestWithdrawal.ts`, including the linked reservation cancellation path.

## Whole-card selection and preset roads

All passenger route-list entries are complete keyboard-focusable card controls, with no nested show-on-map buttons or detail links. Selecting a card draws its one route and replaces the list with route details; the back arrow restores the list/filter/search state. Search detail retains explicit outbound/return selection, stop acceptance and the existing atomic reservation continuation.

`src/maps/demo-road-cache.json` contains 34 computed public road corridors covering every seeded trip pattern and ordered public stop pair. `node scripts/cache-application-roads.mjs` regenerates them through rate-limited OSRM calls. Keys include exact ordered coordinates, so changing a stop never reuses stale geometry. The application uses this cache for the default demo router; an explicitly configured router uses its own results. New routes still resolve through the injected road service, and failures never draw invented connectors. The cache is geometry only: it does not supply or validate the synthetic timetable, operational driveability, legal pickups or live traffic.
