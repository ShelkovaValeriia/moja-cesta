# Pilot planning and scenarios

Open **Dispečer → Scenáre**, or `/dispatcher/scenarios`. The fullscreen map uses the existing `TransportMap`; the scenario host supplies its bottom card. It never writes to the application's store or localStorage and never publishes or reserves services.

## What runs

- `network.ts`: Dijkstra on a pinned public OSM snapshot, with separate directed vehicle and pedestrian graphs. Car one-ways do not become pedestrian one-ways. Stairs can be excluded. Unknown/private/non-road connections do not become straight-line travel. Vehicle travel times use documented model speeds, not traffic or operator observations.
- `access.ts`: pedestrian coverage at both journey ends with individual walking profiles. Exact finite-subset stop selection for up to 18 candidates; greedy fallback for larger programmatic inputs. Uncovered access ends produce a bounded set of new stop proposals with potential coverage counts; these remain ineligible pending safety review. No guarantee of covering residents absent from the input.
- `fleet.ts`: segment capacity, passenger time/ride limits, dwell, vehicle/driver duty, breaks, depot and between-trip repositioning; feasible request matching and pickup/dropoff insertion. Three bounded relocate-improvement passes minimize configured fleet distance/time cost. Locked Fixed and approved-style timetables are never moved.
- `planner.ts`: compares the minimum-stop layout with all eligible stops using actual resulting service and fleet cost. This is a heuristic joint solution, not a proof of globally optimal routes. Synthetic linked outward/return demand is all-or-nothing. A failed heuristic insertion is reported as not found, not proven impossible.
- `journeys.ts`: dated event search with arrival/transfer/walking alternatives, segment seat checks and pedestrian platform transfers. Searches internal/internal and internal/external connections, with no fake public seat guarantee. Results are candidate journeys, not reservations. The comparison allocator uses external-only alternatives for otherwise unserved demand; it does not yet allocate reservations across multiple internal runs.
- `planner.worker.ts`: performs the experiment outside the UI thread. Switching scenarios terminates its worker; stale query results are ignored.
- `io.ts`: bounded versioned scenario import, field allowlisting, reference/calendar/source reconciliation. Imported stop approvals become sandbox/demo status. Imported operational results/KPIs are not trusted; scenario inputs are recomputed.
- `presentation.ts`: public map projection with one selected run or one complete journey. No access points, passengers or contact fields reach the map. Public street context remains visible if external raster tiles fail; this is a limited local network drawing, not a full offline basemap.

The existing operational approval flow in `dispatchPlanning.ts` remains separate. These pure planning contracts provide the integration boundary for a later reviewed replacement; they do not silently change existing reservations or the current 24-hour withdrawal rule. Production booking atomicity, authentication and hold expiry need their own server implementation.

## Evidence and assumptions

`data/pilot.json` is extracted from the supplied 8.–10. 9. 2026 SSV matrix and explicitly cross-referenced to supplied GTFS platform IDs. It preserves 26 nonzero OD cells / 172 movements, nine village stop groups and four hub stop groups. Geographic platform identity is retained, but our service's permission to use it is not assumed. The map marker uses a nearby driving-network node (at most 120 m) while original coordinates remain in the input.

Both seeded scenarios conserve each OD count. Date allocation is 58/57/57. Exact times, access nodes, walking profiles, three same-day return linkages, two vehicles of eight seats, driver duties, 24 frozen Fixed runs and cost inputs are simulation assumptions. They are not inferred individual residents or actual observed daily travel. Selected access nodes are street-network points, not identified homes or a complete residential population.

The standard walking budget is 480 seconds. Speeds are 4.5 km/h and 3.2 km/h in the fixture, with functional step avoidance. OSM paths and tags cannot certify a safe crossing, wheelchair access, stopping permission, road turn restrictions or legal vehicle suitability. The small graph does not implement turn-restriction relations, live traffic, elevation or production vehicle-dimension routing. Use an appropriate geographic provider for deployment.

The supplied GTFS expires before September. All September external services in this workspace are explicitly synthetic. The Poprad example is a separate synthetic onward extension, excluded from the 172-movement comparison, with a previously computed public road corridor, not an operator shape. A dated real timetable requires a separate validated importer; the existing November fixture is not shifted into September.

Costs cover our shared simulated fleet, paid duty span including idle time, stops and all driving including empty travel. The comparison shows owned, used and peak busy buses, plus the trips/km/hours assigned to each bus. Ownership costs apply to the whole available fleet over the inclusive calendar period, including standby and idle dates, rather than charging a new bus for each route.

`economics.ts` separates upfront fleet investment from period depreciation (straight-line, 365-day year), standing costs, fuel, non-fuel maintenance, drivers, stops and overhead. The purchase price is not added to depreciation in the period cost. Default purchase/residual values (€45,000/€9,000), eight-year depreciation, consumption (10 l/100 km), fuel (€1.60/l), fare (€2 per managed movement) and all other rates are editable **simulation assumptions**, not market quotes or signed funding. The editor recalculates all strategies on the same fleet and demand; fuel's marginal cost also informs draft route improvement. It does not relax vehicle scheduling or add resources.

Revenue counts each internally served passenger movement once; external-only movements earn no fare for our fleet. Optional daily contract/support income is a declared assumption. The table reports profit/loss, margin, operating cash balance before depreciation, break-even fare and total support needed at the entered fare. Amounts use a consistent model basis excluding VAT; income tax and interest are outside this model. Operating cash balance excludes the separately shown initial purchase. An unknown fare remains unknown, while zero fare represents free travel. Older scenario imports without economics remain readable, with no invented fuel split or profitability until inputs are supplied. External operators' costs/fares are outside our fleet accounts. These results do not establish real-world profit or savings.

## Import and export

`public/scenarios/coordinated.json` and `pressure.json` are reproducible scenario inputs. `*-routes.json` contains only each computed hybrid run dataset. Load either using **Nastavenia → Načítať JSON**. The current dataset is replaced, never appended to application seeds. A route-only import is explicitly not operational validation. Use the whole card to draw its route and show ordered stops; Back restores the list.

The workspace also exports **Scenár** (recomputable input) and **Trasy** (current public dataset). Scenario imports require the pinned network version, up to 18 stop candidates / 1,000 demand units / 31 dates / eight vehicle-driver resources and a 5 MB file. The initial model supports explicit same-day two-leg linked orders. It rejects unsupported actual external calendars instead of guessing dates.

Re-export shipped fixtures and computed comparison metrics offline:

```sh
npm run planning:export
```

Re-extract the supplied matrix/crosswalk, retaining the pinned graph:

```sh
python -X utf8 scripts/prepare-planning-data.py
```

Refresh public geographic data only when deliberately updating snapshot provenance:

```sh
python -X utf8 scripts/prepare-planning-data.py --refresh-network
npm run planning:export
```

The script queries a public bounding box through Overpass. It never reads/sends passenger positions or modifies source spreadsheets/CSV/GTFS. The pinned OSM snapshot includes its extraction timestamp, query, endpoint and ODbL attribution. Retain those when redistributing derived geographic data. Older scenario inputs intentionally fail network-version validation after a refresh.

Tests cover conservation, actual network reachability, walking thresholds, one-way handling, segment limits, driver breaks/repositioning, transfer margins, linked-return failure, parser corruption/prototype keys, whole-card selection, exclusive import and application storage isolation. Browser QA must additionally verify worker startup, actual map rendering, mobile layout and external tile failure.
