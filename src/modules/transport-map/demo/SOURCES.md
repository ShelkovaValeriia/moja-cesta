# Pilot map research — 15 November 2026

## Public buses: successful timetable research, qualified Košice result

The active demo no longer imports the 16 historical public patterns in `pilot-data.json`. They remain an archival importer/test fixture only. `pilot-geography.json` contains public geographic points, with `demo` status for illustrative managed boarding locations; these are not operational approvals. `pilot-road-cache.json` contains only hub road paths, no historical public-route records.

**Košice:** the operator lists [eurobus 802435](https://www.eurobus.sk/cestovny-poriadok/primestska-doprava-kosice), and its [current PDF, 1 September–12 December 2026](https://www.eurobus.sk/public/media/0221/802435_2.pdf) mentions Spišská Stará Ves in the title and stop rows. Visual inspection of the complete timetable shows no populated departure at Spišská Stará Ves, AS in the displayed runs. Finding a line title is not enough to establish a usable direct departure. The demo therefore does not invent a Spišská Stará Ves–Košice service. This does not establish that no multi-transfer journey to Košice exists.

**Poprad:** the [SAD Poprad directory](https://sadpp.sk/doprava/rad/) links independently downloaded current timetables:

- [072828, effective 1 October 2026](https://sadpp.sk/wp-content/uploads/2026/09/072828.pdf), page 3: working-day run 24 leaves Spišská Stará Ves, AS at **10:30**, reaches Reľov, OcÚ **10:48**. Page 5, note M explicitly says run 24 continues as 071828/24 to Poprad.
- [071828, effective 15 October 2026](https://sadpp.sk/wp-content/uploads/2026/10/071828.pdf), page 4: working-day run 24 leaves Reľov **10:48**, Kežmarok AS arrival/departure **11:27/11:30**, arrives Poprad AS **11:58**.

Both tables and their calendar notes were visually rendered and checked. `public-connection.json` is a manually transcribed **single-date fixture for Monday 16 November 2026**, not a full calendar importer, live feed, seat reservation or guaranteed connection. Passing/skipped stops are excluded; arrival and departure at Kežmarok AS are both retained. There are 35 timed records. The public journey is one through service with a line-number change at Reľov. The passenger transfers once, from our simulated feeder to that service in Spišská Stará Ves.

T1–T5 demonstrate the five pilot villages → hub → Poprad. Managed feeder times (09:30–10:10), afternoon reverse feeder runs and the 20-minute interchange interval are explicitly synthetic scenario values, not adopted operating policy or published managed services. They create no reservations. Public-bus times are sourced separately. The map displays only this selected general journey, with a blue solid feeder and orange dashed public portion.

Geometry is OSRM driving through the hub and Reľov to the [mapped Poprad station](https://poi.oma.sk/w494293007), a computed road corridor **not an operator-published bus shape**. Intermediate public stops have the complete timetable sequence in the card; their unverified coordinates are not invented or turned into map markers. For precise bus geometry and broader dated planning, obtain an authorized current GTFS/shapes feed or verified operator itineraries.

## Public building locations: three found

| Building                              | Identity/address source                                                                     | Coordinate source                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Základná škola Spišská Stará Ves      | [Official school contact page](https://zs231ssv.edupage.org/contact/)                       | Explicit point in that page's embedded map: 49.383853490514, 20.357666015625                                 |
| Zdravotné stredisko Spišská Stará Ves | [Official town health directory](https://www.spisskastaraves.sk/zdravotnictvo/)             | [OMA/OpenStreetMap building w58781062](https://poi.oma.sk/w58781062): 49.378302624970495, 20.360938483155934 |
| COOP Jednota, SNP 53                  | [Retailer's own store page](https://cooppoprad.sk/predajna/spisska-st-ves-snp-c-53-pj-104/) | Explicit place point in that page's embedded map: 49.38452692578073, 20.359355733835056                      |

The healthcare building is labelled a **health centre**, not a hospital. We do not infer opening hours, services, accessibility, entrances, emergency availability or safe boarding approval from a map point. Marker popups expose both source links. Public points are cached locally, not re-queried per visitor. OpenStreetMap attribution remains visible. Overpass/OSM API requests were rejected/rate-limited during research; no failed lookup is represented as a successful integration.

`scripts/research-map-sources.mjs` downloads research documents; temporary HTML/PDF files are ignored under `tmp/map-research/`. `scripts/cache-map-transfer.mjs` generates geographic-only pilot data and caches the computed road corridor. It never reads or sends private passenger pins.
