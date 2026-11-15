# AGENTS.md — Moja Cesta

> **Project instructions and living product specification for Codex and other AI coding agents.**
> Updated: 2026-11-14. Project: **Moja Cesta** (formerly discussed as SmartRide).
> **Use this file as the product baseline, but inspect the actual repository before editing.** Current user instructions take priority over this document. If a conflict arises, ask only when genuinely necessary; otherwise preserve working code and identify the unresolved decision explicitly.

## 0. Immediate instructions for an AI agent

1. **Do not silently redesign the agreed user flows.** Build on the existing React/TypeScript/Vite frontend. The user prefers its current minimal, warm, dark-green and cream design.
2. **Do not introduce BlaBlaCar, CommunityRide, carpooling, private driver offers, or their old three-choice request flow.** They were expressly removed after the mentor meeting on 2026-11-14.
3. **Fixed and Flex use the same managed fleet.** Fixed routes are guaranteed *as scheduled services* and Flex uses unused vehicle/driver windows only when it cannot disrupt Fixed.
4. **Seat reservations are essential**, because the intended category-B minibus fleet may have as few as eight passenger seats. Check the *actual configured capacity per vehicle* and occupied seats on each leg; do not assume every vehicle seats eight.
5. **Round trips (`spiatočná cesta`) are all-or-nothing for the user's own bookings:** do not permanently confirm an outward trip if the required return cannot be arranged. Use bounded provisional holds and coordinated confirmation, not indefinite seat blocking.
6. **Support the entire family and people without smartphones:** adults can make bookings for children and authorized relatives; accessibility and assistance for seniors are core product goals, not decorative enhancements.
7. **User-proposed stops are proposals, not legal/operational stops until reviewed.** Evaluate actual walkable paths, age-related needs, functional mobility limitations, and vehicle safety before approval. Do not store diagnoses unnecessarily.
8. **No-show consequences must be fair and limited:** documented warnings and review; a configurable *temporary restriction of recurring automatic booking* may be considered for repeated unjustified no-shows, but never an automatic total travel ban or an unapproved fine.
9. **Public maps must not expose identifiable passengers**, exact home addresses, telephone numbers, medical details, or the identities of children.
10. **UI language is Slovak.** Internal code, domain names and technical documentation can be in English. Time always uses Slovak-local 24-hour `HH:mm` (never AM/PM).
11. **Keep mock/demo features clearly identified.** Do not claim that localStorage, an SVG map, fabricated travel times, virtual GPS, or an unconnected regional bus constitutes live transit service.
12. Never replace existing files wholesale, rewrite the project from scratch, run destructive commands, or move the frontend structure without examining it and obtaining justification.

## 1. Mission and product concept

**Moja Cesta** is a regional rural mobility platform, first prototyped for a small cluster of villages in the Prešov region of Slovakia, intended to scale to many municipalities and routes.

The central insight is a **hybrid transport operating model**:

- **FIXED / `Pravidelné spoje`:** published, stable, reliable bus/minibus trips designed from aggregated *repeating* travel needs (e.g. to work, school, school return, work return). Their time and route do not change or get canceled merely because today fewer passengers booked.
- **FLEX / `Doprava na požiadanie`:** the *same managed vehicles*, during the genuinely free periods between Fixed commitments, can handle additional passenger requests. Compatible requests may be clustered and inserted into feasible vehicle itineraries. All safety, time, capacity, driver availability and subsequent Fixed commitments remain hard constraints.
- **External public transport integration:** the platform should analyze pre-existing regional buses and potentially trains. Sometimes the best use of our minibus is **feeding passengers to a suitable existing regional stop** for a connection rather than taking them all the way to a distant final address.
- **Demand-driven planning and evidence:** collect privacy-respecting travel-demand and operating statistics to help dispatchers redesign future schedules, choose stops, identify underserved places, and compare strategies.
- **Access for all:** senior-friendly web experience, reservation through a dispatcher, possible automated phone workflow after hours, bookings for family members, clear explanation and outcome for every request.

The project is NOT a new nationwide timetable catalog; it is a scalable journey-planning and minibus operation system for underserved regions. The search UI is **A → B, when?**, not a static hard-coded list of routes in one village.

### Hard distinction: fixed schedule vs. on-demand confirmation

- Published Fixed service is a transport obligation, independent of booking count.
- A passenger seat on Fixed is confirmed only after a successful reservation (and remains subject to actual operating disruptions).
- A Flex request, a cluster of interested passengers, and a draft Flex route are **not** a confirmed ride.
- Only a feasible, assigned, authorized Flex trip with capacity and operational approval can be confirmed.
- An external operator's published connection is a schedule option, not a seat held in that operator's system.

## 2. Current project status and priorities

The user reports an existing **working frontend prototype**, generated by Codex, using **React + TypeScript + Vite + Tailwind + Lucide** at the repository root (`src/pages`, `src/components`, `src/domain.ts`, `src/store.tsx`, `src/styles.css`). It reportedly contains:

- Passenger search, results, map placeholder, reservations, requests, family profiles, recurring reservations.
- Driver's assigned-day trips, passenger roster, boarding/alighting/no-show actions.
- Dispatcher overview, Fixed/Flex trips, request approval, fleet, stops, analytics.
- Shared demo state in `localStorage`, with basic cross-role interaction; test/build/lint checks reportedly passed.

**This is a user/Codex report, not independently verified repository inspection.** Agents MUST check current files before assuming any screen or business rule already works. A screenshot or generative design image is a reference, not proof of implementation.

**Immediate goal:** deliver a polished interactive multi-role demo and then a truthful Fixed+Flex simulation, without wasting hackathon time building enterprise infrastructure first.

- **P0:** stable working frontend; coherent passenger/driver/dispatcher workflows; shared mock state; seat checks; request lifecycle; Fixed/Flex planning demo; basic metrics; no broken paths.
- **P1:** interactive real map and stop pinning, route-time engine, configurable simulated demand, richer family/round-trip rules, dispatcher controls, realistic simulation event stream.
- **P2 / integrations:** Spring Boot backend, persistent PostgreSQL/PostGIS, real transit feeds, GPS, telephony/IVR, production authentication, notifications, robust operating/legal verification.

A real algorithm is more valuable for the hackathon than superficial completion of every enterprise feature. Do not imply P2 is ready when only mock UI exists.

## 3. Fleet, drivers, and operational constraints

- Candidate vehicle model: small minibus/MPV within category **B**, where the driver may transport **up to eight passengers plus driver** provided the registered vehicle and other license conditions meet the applicable rules (including maximum authorized mass). **Regulatory and service-operation requirements must be confirmed by the organizer; this is not a blanket permit for commercial transport.**
- Each `Vehicle` has its own `passengerCapacity`, registered seating, accessibility features, required license category, operational hours, and status.
- **Reservations are mandatory in the proposed operation** because physical seat availability is limited.
- Driver has one or more categories (`B`, potentially other categories); a driver profile **does not permanently own or get assigned a vehicle**.
- Vehicle and driver are assigned to a **specific trip/duty** by the dispatcher. One driver can work with different vehicles on different assignments, and one vehicle can have different drivers over time.
- Assignment checks driver-license compatibility, vehicle availability, driver duty, breaks and overlaps.
- Fleet count, exact types and capacity are **open inputs**; using one or two virtual eight-seat vehicles is a simulation assumption, not a confirmed customer resource.
- GPS availability and feed access are **unknown**. Simulate vehicle location if needed, visibly labeled demo. Never claim live tracking without integration.

## 4. Product roles and permission boundaries

### Passenger (`Cestujúci`)

Search route/date/time, choose one-way or round trip, pick passengers, review Fixed options, view existing Flex requests, join or create a request, reserve a seat, manage recurring reservations, see trip status/cancellations, see map and propose a new stop, manage allowed family profiles and contact preferences.

### Dispatcher (`Dispečer`)

Review demand, compare candidate Fixed routes, publish/revise future Fixed schedules, configure service parameters, assign vehicles and drivers, review/cluster/approve/reject Flex requests, inspect capacity and conflicts, approve safe stop proposals, handle passenger phone inquiries, review disputes/no-shows, view statistics and simulation.

### Driver (`Vodič`)

See **only assigned trips**, assigned vehicle **per trip**, ordered stops/times, booked passengers relevant to each stop, board/alight/no-show actions, upcoming pickups, occupancy, delays and operational notes. The driver must never see irrelevant health details or other users' travel history.

### Guest / delegate / admin (future)

Guests can read publicly available schedules and search without sign-up. Booking via user account or dispatcher pathway; do not require smartphones for passengers. Delegates/guardians are scoped to expressly authorized passengers. Admin/config access separated from operational dispatch. Frontend demo may use a **role switcher without authentication**, explicitly labeled demo-only; production must enforce RBAC server-side.

## 5. Passenger information architecture: canonical flow

**The specific sequence below was user-approved; preserve it.** Minimalist, mobile-first, and accessible also on desktop.

1. **`Domov`**: logo, `Kam sa chcete vybrať?`, short subtitle, large **`Vyhľadať spojenie`** button; shortcuts `Pravidelné linky`, `Moje cesty`, `Pomoc a kontakt`. Do **not** put the full search form on the home screen.
2. **`Vyhľadať spojenie`**: separate search screen; **`Typ cesty` (`Jednosmerná` / `Spiatočná`) FIRST**, then **`Pre koho hľadáte cestu?`** and passenger count/selection, then origin/destination, date/time, departure vs. desired arrival, optional time preference. Return journey has independent date, time, departure/arrival toggle and optional time preference.
3. **`Možnosti cesty`**: just two branches: **`Pravidelný spoj`** (0..N suitable published departures with available seats) and **`Zadať požiadavku`** / `Pozrieť požiadavky`. Do not render BlaBlaCar, car-only or transport-type selection. **Do not auto-select the first offered Fixed route**; passenger chooses explicitly, independently for outbound and return. Allow expanding the **full actual ordered stop sequence for BOTH directions**.
4. **`Požiadavky na mape`**: map of existing **bus/Flex requests** and nearby stops, filtering by route, date and time; list existing compatible requests before asking for a new one. For current MVP an honest, clearly demo-labeled attractive SVG map placeholder is acceptable; real interactive map is a next phase.
5. **`Detail požiadavky`**: show route/time, passenger-interest count, status, and **`Pridať sa k požiadavke`**; joining increases interest/prioritization, but does **NOT** guarantee transport. Avoid duplicate joining by the same person; count *passengers*, not only clicks/accounts.
6. **`Nová požiadavka`**: if no matching existing request, create Flex request. Pre-fill all fields already entered in search, including return parameters and family member. Do **not** open the removed three-choice screen (`Len autobus` / `Len auto` / `Je mi to jedno`).
7. **`Rezervácia miesta`**: confirmation of earlier-selected passengers, pickup/dropoff stops, capacity, and both directions where relevant. **Never ask the person to reselect passengers only at the end.**
8. **`Moje cesty`**: upcoming, requests, history, cancellations, details, and recurring reservations. Compact header: user explicitly asked to remove the descriptive subtitle `Vaše rezervácie, spoločné požiadavky aj predošlé cesty.` to provide more room for trips.
9. **`Profil a rodina`**: main account + linked passenger profiles. Main account manager (e.g. demo Zuzana Nováková) has a small crown icon and label **`Správca účtu`**, based on a stable ownership property, not position in a list. Person does not require own account or smartphone to be a passenger.
10. **`Mapa`**: future interactive network of approved stops and routes, public aggregated requests, and safe stop proposals, keeping private residential detail confidential.

### Search details and UI rules

- Origin and destination can be chosen by typing/selecting a stop/address **or by placing a point on a map**. Preserve coordinate + label + origin type (`APPROVED_STOP`, `SELECTED_POINT`, etc.).
- A user-placed pin is **not** automatically an approved pickup stop or a legal route destination. For Fixed, map it to an existing approved stop; for Flex, submit proposed pickup/dropoff for dispatcher routing/safety review.
- Search for one or both directions. If `Spiatočná`, show `Cesta tam` and `Cesta späť`, both with full route information and independent time criteria.
- Time criteria: **`Odchod`** vs. **`Príchod do`**, for **both directions**; optional `Časová preferencia`: `Bez preferencie`, `Radšej skôr`, `Radšej neskôr`. Treat the preference as soft ranking, not an unannounced hard filter.
- Slovak locale/date, **24-hour time HH:mm** throughout all pages, including native time inputs (use a reliable 24-hour picker if browser locale cannot guarantee it).
- Back button goes to the **previous workflow step** and preserves entered data, selections, passengers, dates and filters. Browser Back behaves consistently; direct-link fallback is sensible.
- No inactive fake buttons. Include good empty, pending, success and error states; mobile nav must not overlap cards when scrolling; avoid duplicate sticky/fixed UI in the driver view.
- Visually: warm off-white background, dark green brand, cream/subtle green surfaces, generous whitespace, large accessible tap targets, clear Slovak copy; do not copy a smartphone bezel/status bar into the actual page.

## 6. Booking another person; whole-family support

Separate **who manages** a booking from **who actually travels**:

- `Account` / `Household` represents the managing user; `Passenger` represents each traveler; `PassengerAccess` documents the account holder's authority for a person.
- An adult can book for their school-age child, parent, grandparent, spouse or another **authorized** person. Example household: Zuzana (account manager), Ema (child), Mária (grandmother).
- The adult need not travel alongside the child or senior. Each passenger needs their own seat and pickup/dropoff data.
- The managing adult can set recurring school or work bookings for the authorized passenger, specify notifications, and see their permitted trip status.
- **For a child, require a contact for a responsible parent/legal guardian** and validate it before saving the child profile/booking. Contact may be inherited/selected from a known authorized account if accurate and confirmed.
- For a competent adult relative, do not infer consent or permission solely from the family relationship: obtain appropriate delegation/authorization and restrict who sees travel history.
- Driver receives a limited manifest: human-readable name OR booking code (per final privacy decision), pickup/dropoff stop, count, and only operational assistance instructions (e.g., needs help boarding), never medical diagnosis.
- Children: no private-ride feature exists; follow local safeguarding/transport rules and handle guardian-facing boarding/arrival alerts only for verified authorized users.
- Avoid collecting unnecessary DOB, medical history, ID scans or diagnostic details; collect a **functional accessibility requirement** only when needed.
- Current passenger profile UX: user explicitly removed **`Pohodlná pešia vzdialenosť (m)`** and **`Obľúbené zastávky`** from the visible `Upraviť profil` dialog. This does **not** cancel route/stop accessibility requirements: optional walking capability may be captured through appropriate trip assistance or dispatcher planning data rather than reintroducing those fields without approval.

## 7. Senior-first and offline/phone access (`Úplná podpora seniorov`)

**Core goal: nobody should lose access to transport because they lack a smartphone.**

- The app should be understandable for seniors: clear language, high contrast, readable text, large controls, low cognitive load, few steps, obvious confirmation and cancellation, no complex travel jargon; use accessible forms and keyboard navigation.
- A resident with a button/feature phone may call a **dispatcher during staffed hours**. Dispatcher can create/cancel bookings and Flex requests on behalf of that person without requiring the rider to log in or possess a smartphone.
- **After-hours automated telephone line / IVR** is a proposed extension to solve the grandmother-wants-to-request-a-trip-at-night problem. Simple keypad navigation (`DTMF`), saved destinations/stops, repeat request or voicemail; dispatcher queue fallback. This is a proposed feature, **not proof that a real phone line exists**.
- A submitted voicemail/IVR request is **pending**, not a confirmed ride. Fully automatic confirmation is permitted only if feasibility and capacity are genuinely verified; otherwise provide a definite decision deadline/next-step description. No silent assumptions of a next-morning service.
- Notification channels can include SMS, automated voice callback and contact through designated authorized relative; do not falsely promise actual SMS/call integration in the mock demo.
- Repeated trips for seniors may be set up by authorized relatives, or by a dispatcher after appropriately verifying the person.
- Also make changing or canceling a reservation easy via every supported channel; reducing no-shows is more valuable than punishing people.

## 8. Mandatory seat booking and physical capacity

**Booking != demand request.** Strictly distinguish:

- `DemandIntent`: aggregate *repeating need*, used to DESIGN Fixed routes.
- `RideRequest`: a concrete date/time Flex request; may be joined by several riders.
- `DemandGroup` / request cluster: combined expressed interests; priority may increase with interested passenger count but it is not yet a ride.
- `TripInstance`: an assigned actual planned execution of Fixed or Flex with vehicle, ordered stops, service date.
- `Reservation`: seat allocation of an actual passenger on a real trip segment, with status and possible provisional hold.

Capacity must be checked **on each consecutive road/stop segment**:

`occupancy(segment i) = sum(reserved seats where pickupIndex <= i and alightIndex > i for active HELD/CONFIRMED reservations)`

All segments must satisfy `occupancy <= vehicle.passengerCapacity`. A seat freed after someone exits may be used by a different passenger later on the same trip.

- Check concurrent booking of the last seat atomically server-side, with transactions/locks and idempotency; localStorage mock checks are *not* production concurrency safety.
- Handle seat counts correctly for a parent booking several people or joining a clustered request.
- Permit cancellation to release capacity. The driver must record actual boarding and alighting; avoid logically impossible events (alighting before boarding, double boarding, boarding on wrong trip).
- Overbooking or altering already-confirmed trips to accept later requests is prohibited.

## 9. One-way vs. round-trip — `Obojsmerná / spiatočná jazda` (CRITICAL)

**The biggest product safety/reliability invariant:** A rider cannot be told they have a fully confirmed round trip if only the outbound ride has been secured. It is unacceptable to leave a person stranded in town because a later Flex return request is denied.

- User chooses `Jednosmerná` vs. `Spiatočná` before entering trip details. Outbound and return have **independent** date, desired departure vs. desired arrival, and optional earlier/later preferences.
- Represent a round trip as **one** `JourneyOrder` with `OUTBOUND` and `RETURN` legs, each of which can include multiple trip or transit segments.
- If both directions are Fixed and seats are available, reserve both **atomically** (one transaction): all succeed or neither remains reserved.
- If outbound is Fixed but return requires Flex, make a **time-bounded provisional hold (`HELD`)** on Fixed seats while the Flex decision is pending; then confirm both together if feasible. If Flex fails or the hold expires, release the hold; do not silently convert to one-way. Never block the last Fixed seat indefinitely.
- If return is Fixed and outbound requires Flex, apply the symmetric rule; if both require Flex, evaluate both before confirmation.
- For a request composed of several internal transport segments, every necessary **internally bookable** segment must be secured before the order is marked `CONFIRMED`.
- Display both directions and their independent statuses during processing; the **overall** order is `PENDING` until both are safe to confirm. Passenger sees clear outcomes, including alternative times.
- Notify of the final decision **before the first departure**, not after the person has already traveled away.
- External public transport that cannot be booked through our system is not guaranteed. Show that distinction in plain language; do not promise another operator holds seats or waits.
- User may **explicitly choose** to switch to a one-way journey if they wish; the app must never downgrade automatically.
- Holds must have a policy-controlled expiry, be cleaned up, and never cause more seats to be temporarily blocked than capacity permits. Specific hold duration is not yet approved.
- An existing mock feature named "joint booking" is not enough by itself: tests must cover mixed Fixed+Flex, failure, concurrent seat consumption, expiry, cancellation, return time before outbound arrival and trip shifts.

### Example (synthetic)

Outbound village → town at 08:00 has a Fixed seat. Return town → village at 15:00 needs Flex approval. Mark outbound seat `HELD` (bounded) and order `PENDING`. If return can be provided before hold deadline, confirm both; otherwise release the outbound seat and tell the user the complete round trip could not be secured.

## 10. Repeated bookings and no-show protection (`Ochrana pred stratou miestenky`)

**Two complementary goals:** (a) protect scarce seats from repeated no-shows and (b) protect users from unfair penalties or accidental loss of travel access.

- `RecurringBookingRule` permits one authorized manager to create repeat bookings for work/school over a **specified interval** (roughly one to two months was discussed but is NOT a final hard-coded length). Days of week, direction(s), riders, active period, notification settings, exceptions and holidays should be represented.
- Recurring rule creation ≠ confirmed seat forever. Materialized trip reservations must still pass actual capacity checks and have an explicit status. A sensible rolling booking window is a **proposal**, not an adopted rule.
- The driver sees the expected manifest and records `Nastúpil`, `Vystúpil`, `Neprišiel`; record who and when marked it. Passengers/delegates can cancel in advance through app/dispatcher/phone pathway.
- Multiple unexplained no-shows **without prior cancellation** waste a scarce seat. The system should identify repeated patterns, remind/warn people, and allow dispute/error correction and exceptions (service delay, emergency, boarding verification error).
- **Proposed proportional consequence (requires stakeholder approval): temporary suspension of the automatic recurring-booking privilege**, e.g. an illustrative period of two weeks. **Not** an automatic fine, legal sanction, blanket ban on using transport, permanent removal of account, or suspension of ordinary one-off manual bookings.
- Do not hard-code a penalty threshold, specific number of no-shows, suspension duration or appeal deadlines as settled policy. Make policy configurable and preferably human-reviewed, with notice and reinstatement.
- No-show must not be attributed blindly to the account manager vs. actual rider: separate `Passenger`, `Booking`, and `CreatedBy`; handle parents making children’s bookings responsibly.
- To protect legitimate reservations: clear cancellation/confirmation states, reminders (when available), hold expiry, duplicate booking prevention, driver verification and an audit trail.

## 11. Geographic data, stops, and accessibility

### Map and coordinates

- Pilot example: **Spišská Stará Ves, Matiašovce, Spišské Hanušovce, Červený Kláštor, Lechnica, Haligovce, Veľká Lesná** (geographic choice remains adjustable).
- Map should show Fixed routes, approved stops, existing aggregate Flex requests, proposed stops (clearly marked as not approved), optional vehicle location and external connections.
- Allow text-based address/stop search **and a map click to pick origin/destination**. Store lat/lon and label, do not reverse-geocode by invention. Maintain appropriate privacy (public map should not reveal home doorsteps).
- Prefer real **walkable paths along streets, footways, safe crossings and accessible terrain**, not straight-line distance, for time/distance from traveler to stop.
- Consider where a minibus may legally/safely stop, driving directions, road width/access, proximity to intersections, safe pedestrian approach and accessibility of boarding.

### Age, disability, mobility and safe proposed/new stops

**This is a core product requirement, not an optional decoration:**

- Children, adults, older residents and individuals with limited mobility can have **different practical abilities** to reach a stop and board a minibus. Some need a shorter walk, fewer crossings, flatter path, low-floor boarding or assistance. Do not assume every person in the same age group is identical.
- A passenger may suggest a new stop closer to home/necessary destination when existing stops are unsuitable; this becomes a `StopProposal` (coordinates, purpose, access issues, possible functional requirements), **not an automatically active boarding location**.
- Dispatcher reviews and may approve/reject or adjust it; operational safety and legal suitability must be checked before use by Fixed/Flex routing.
- For proposed stops, compare candidates on **actual pedestrian route**, walking effort/time, safety for children, step-free access where needed, accessibility at different times of day, and vehicle stopping feasibility.
- An approved new stop can benefit several residents; aggregate requests without exposing who requested it. A dispatcher may prefer safe shared virtual stops instead of door-to-door pickup.
- Avoid asking for a diagnosis or detailed health history. Store minimal functional descriptions (e.g., `needsBoardingAssistance`, `wheelchairAccessRequired`, `avoidStairs`) with consent/permission and restricted access. The exact accessibility model needs review with operators.
- User-specific comfortable walking distance fields were removed from the *profile-edit UI*. Do not sneak them back there without approval. Accessibility still needs to inform stop planning, possibly through a simple assistance choice during route/request creation and dispatcher tooling.
- Do not uncritically reproduce historical example default distance thresholds by age; those were brainstorming examples, not adopted legal or product rules.

## 12. Existing public transport and good transfers

- Import existing region-wide bus timetables (potentially train in future) from approved GTFS/CSV/official provider feeds as available; validate calendar dates, directions, stop order, time zone and import version.
- Search the *complete journey* A→B, not merely our own lines: walk to stop → managed Fixed/Flex minibus → regional bus/train → final access walk, optionally transfer back in reverse.
- Offer a **feeder** trip to an appropriate hub when this serves riders more efficiently than driving the minibus to a distant city. This also allows the minibus to serve more nearby residents.
- Transfers must be **feasible and humane**, accounting for actual walking between platforms/stops, boarding, accessibility needs, realistic delay margin and avoiding excessive waits. All numeric time preferences and operational buffers are **configurable and not settled**; this AGENTS file deliberately does not prescribe a magic 10/20/40-minute rule.
- Choose the best option with passenger reliability as a priority; do not optimize minibus mileage at the cost of stranding a senior or causing unrealistic transfers.
- Do not claim booking, guaranteed connection or live delay information from another operator without actual commercial/technical integration.
- Real public data feeds for the candidate region have not been confirmed available in a unified public GTFS API; allow importing manually prepared demo timetables and label their provenance.

## 13. Fixed planning — strategic and dispatcher-approved

Inputs: aggregated `DemandIntent` by date/weekdays/destination/arrival/departure windows; approved stops, walk routing/accessibility, roads/travel times, fleet/driver duties, existing public transport and connection opportunities.

Suggested MVP procedure:

1. Cluster recurrent demands by geographic corridor, travel direction, days and time windows.
2. Check if existing public transport already serves these demands acceptably.
3. Match requests to approved safe, accessible stops; generate stop proposals for uncovered areas, but keep them pending review.
4. Create alternative Fixed route/timetable candidates for the available vehicles and work schedules, checking segment-by-segment capacity, realistic travel/boarding times and transfer opportunities.
5. Score candidates by number of people served, reliability, balanced accessibility, operational mileage, empty kilometers and fleet requirements.
6. Show explainable alternatives to dispatcher. Only dispatcher publication turns a plan into a Fixed timetable.
7. Once published, do not silently alter/cancel Fixed to satisfy a new Flex request or because today's seats are empty.

Do not conflate a clustering output with a route that has been officially approved or deployed.

## 14. Flex planning — operational request insertion

Flex requests arrive over time, perhaps by web, an authorized relative, dispatcher, or eventually telephone system. Existing compatible requests can be joined, increasing interested-passenger count/priority, though no guarantee is made.

Build vehicle availability windows **between immutable Fixed commitments**, factoring:

- End of previous trip and location.
- Time to reach candidate Flex pickup and travel through all pickup/dropoff stops.
- Boarding/alighting time; required accessible assistance.
- Driver duty, breaks, rest, vehicle service/unavailability.
- **Deadheading/repositioning back to the origin of the next Fixed trip**, plus configurable operational buffer.
- Real travel times through road network and maximum capacity on each segment.
- Time windows and previously confirmed Flex commitments; no silent degradation.

For MVP prefer an explainable deterministic **greedy pickup-and-delivery insertion**:

1. Find candidate vehicles/windows; consider shared trip with existing compatible requests.
2. Try inserting pickup *before* dropoff at each feasible position.
3. Recompute ETA, occupancy, driving time, waiting, next Fixed start and accessibility constraints.
4. Reject infeasible candidates with a machine-readable reason (`NO_CAPACITY`, `FIXED_CONFLICT`, `INACCESSIBLE_STOP`, `DRIVER_UNAVAILABLE`, `TIME_WINDOW`, etc.).
5. Rank feasible options by passengers served, reliability and cost, and show dispatcher the plan and tradeoffs.
6. Confirm only after required dispatcher approval and final capacity/time recheck; record decisions for analytics.

Avoid a fixed arbitrary mock duration such as `24 minutes` being represented as a real computed result. For current frontend, mock travel times may remain if explicitly labeled demo, until routing integration is built.

## 15. Reservation, request and journey lifecycle

Suggested statuses — inspect existing `src/domain.ts` before renaming anything:

- `RideRequest`: `PENDING`, `GROUPED`, `PLANNED`, `APPROVED`, `REJECTED`, `CANCELLED` (and optionally `EXPIRED`). A request can be considered/approved only as part of a feasible trip assignment.
- `TripInstance`: `DRAFT`, `PLANNED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `DISRUPTED`.
- `Reservation`: `HELD`, `CONFIRMED`, `CANCELLED`, `RELEASED`, `BOARDED`, `COMPLETED`, `NO_SHOW`, distinguishing operational boarding events from capacity status where possible.
- `JourneyOrder`: `DRAFT`, `PENDING`, `CONFIRMED`, `REJECTED`, `CANCELLED`, `COMPLETED`.
- `StopProposal`: `PENDING`, `APPROVED`, `REJECTED`.
- Recurrence rule: `ACTIVE`, `PAUSED`, `ENDED`; separate per-date exceptions.

These are **suggested semantics**. Prefer correct transition constraints and existing implemented fields over invasive renames for a demo. Centralize transitions in domain functions/services; UI should not change state to arbitrary strings.

## 16. Dispatcher UX

- `Prehľad`: today’s Fixed commitments, Flex pending/approved, vehicle utilization, capacities, delays, unresolved user needs and actionable alerts.
- `Pravidelné spoje`: view/publish future schedules, assigned vehicle/driver, ordered stops, and whether a change affects existing bookings.
- `Požiadavky`: request clusters, route/datetime/passenger interest, priority, reasons for reject, alternatives; approving must create/attach to a feasible operational Flex trip, not merely flip an isolated badge.
- `Flexibilné jazdy`: visualize tentative insertion and real assigned runs, vehicle availability windows, constraints and route segments.
- `Vozidlá` / `Vodiči`: distinct assets; capabilities and driver license categories, duties and *per-trip* assignments.
- `Zastávky`: original approved stops + proposed locations, walking/accessibility/safety assessment; approve/reject with explanation.
- `Podpora cestujúcich`: phone reservations, cancellation, changes on behalf of verified rider, senior assistance, disputed no-show corrections.
- `Štatistiky`: service coverage, demand, passenger count, utilization, unsatisfied trips, fleet mileage and comparison between planning modes.

## 17. Driver UX

- `Moje dnešné jazdy`: list of **driver-assigned** runs, not all fleet runs; in demo may show all with a truthful demo label until assignment exists.
- Detail: type (Fixed/Flex), vehicle + registration + physical capacity, route timeline/ordered stops, passengers scheduled at each stop, current occupancy and delays.
- Actions: `Začať jazdu`, `Nastúpil`, `Vystúpil`, `Neprišiel`, `Ukončiť jazdu`; enforce valid transitions and append audit events. Restrict passenger data visibility to needed pickup/dropoff information.
- Driver's `Môj profil` should display **license category/categories** (`Skupiny vodičského oprávnenia`, e.g. B), not a permanent list of assigned vehicles or capacities.
- On mobile, don't duplicate fixed/sticky navigation or buttons as scrolling occurs; respect bottom safe area and avoid overlays on content.

## 18. Simulator: pilot scope, input datasets, scenarios

**Pilot candidate (not final):** Spišská Stará Ves with adjacent villages (Matiašovce, Spišské Hanušovce, Červený Kláštor, Lechnica, Haligovce, Veľká Lesná), with service area configuration designed for expansion.

### Real datasets to obtain/import

- OSM road, walk and geographic network; stops; schools, workplaces, shops, clinics, transfer nodes.
- Distances/times and geometry for walking and vehicle profiles from Valhalla or another interchangeable routing adapter; cache and source versions.
- Actual region public-transport stop times and calendars (GTFS if obtainable, otherwise verified CSV/manual fixtures).
- Vehicle capacities/driver availability from operator, **or clearly synthetic values** for prototype.
- Optional municipality populations/age distributions (aggregated), actual GPS and delays only if available and lawful.

### Synthetic datasets

- Recurring commute/school demand, including outbound/return preferences.
- One-off daytime clinic/market requests, different time windows and mobility needs.
- Families reserving for children or seniors.
- Scenarios with insufficient capacity, impossible returns, too-long/slim transfers, proposed stops and cancellations/no-shows.
- Fixed `seed` and virtual clock for repeatability; no real private resident data.

### Core demo sequence

1. Import/visualize selected geographical area and existing regional links.
2. Generate aggregated recurring needs and show clusters/heatmap **without exposing households**.
3. Compute candidate Fixed schedules; dispatcher compares and publishes one.
4. Run a virtual day with a minute-by-minute clock and incoming one-off Flex requests.
5. Cluster/merge similar requests, compute feasible insertions, approve feasible runs, and show **why** others are rejected.
6. Show buses moving on the map (virtual GPS labeled simulation), reservations and boarding, and ensure Fixed departures remain intact.
7. Compare three strategies on **the same input seed**: Fixed only vs Fixed+Flex vs Fixed+Flex+external feeder connections.

### Metrics and formulas

- Requests (passengers) submitted, approved, declined, unserved; distinguish requests from unique passengers and seats.
- Served passenger journeys / rate, including whole round trips rather than counting a failed return as a successful complete journey.
- Fixed on-time starts and arrivals (actual simulated vs. published), delays and operational disruptions.
- Vehicle seat-occupancy-weighted mileage / mean onboard occupancy; availability and peak segment occupancy.
- Vehicle distance, empty/deadhead kilometers, travel duration, wait times and walk distances.
- Number and walking access of covered settlements/stops, children/seniors/assistance needs satisfied (aggregated only).
- Cancellation/no-show rate and effects of reminders/recurrence, with no public personal attribution.
- Simultaneous conflicts prevented, occupied seats over capacity (must be zero), and missed Fixed commitments (must be zero in planned feasible solutions).
- All demonstration graphs must clearly say **simulated/example data**, never imply real statistically measured demand.

## 19. Technical stack and code structure (guidance, not a demand to rewrite)

### Existing reported frontend

- React + TypeScript + Vite + Tailwind CSS + Lucide icons.
- Current files reported include `src/pages/`, `src/components/`, `src/domain.ts`, `src/store.tsx`, `src/styles.css`.
- Shared demo state in `localStorage` and role selector without auth; history transitions and form-state persistence should work.
- Do not assume current frontend includes an API server; decouple components from persistence so backend can later replace storage.

### Target backend for real functionality

- Java 21, Spring Boot, Spring Web, Validation, Data JPA/Hibernate, Maven, Flyway.
- PostgreSQL + PostGIS; place/stop geometry and bounding boxes; versioned timetable imports.
- Java modules in modular monolith: `identity`, `passenger`, `geography`, `transit`, `demand`, `fleet`, `fixed`, `flex`, `journey`, `booking`, `dispatch`, `simulation`, `notification`, `analytics`.
- Routing adapter for OSM/Valhalla automobile/minibus + pedestrian route/matrix, with cached times and demo fallback.
- External transit imports: GTFS Static when available, CSV fallback; optional real-time later.
- REST typed DTO API; SSE for simulation/status streaming if justified; no premature microservices or infrastructure overengineering.
- Docker Compose for local environment; authenticate/authorize server-side for production, no pretending role selector is security.
- Repo may currently have frontend at root; **inspect before imposing a different monorepo layout**. Proposed future: `backend/`, `data/`, `infra/`, `docs/` beside existing frontend.

### Suggested domain objects

`ServiceArea`, `Place`, `Stop`, `StopProposal`, `RoadTravelTime`, `ExternalRoute`, `ExternalTrip`, `ExternalStopTime`, `Account`, `Passenger`, `PassengerAccess`, `Vehicle`, `Driver`, `DriverLicenseCategory`, `DriverDuty`, `DemandIntent`, `DemandGroup`, `RideRequest`, `FixedRouteTemplate`, `FixedTripSchedule`, `TripInstance`, `TripStop`, `VehicleAssignment`, `JourneyOrder`, `JourneyLeg`, `Reservation`, `RecurringBookingRule`, `BoardingEvent`, `NoShowRecord`, `RecurringBookingRestriction`, `SimulationRun`, `SimulationEvent`, `PlanningDecision`, `AuditEvent`.

Avoid schema overengineering in MVP: start with existing types and grow by migration, keeping clear boundaries between request, trip and reservation.

### API shape examples (proposals, not contractual endpoints)

- `POST /api/journeys/search` — A/B, outbound/return, departure/arrival, passengers/preferences.
- `GET /api/stops`, `POST /api/stop-proposals` — approved stops and suggestions.
- `GET /api/trips`, `GET /api/trips/{id}` — published Fixed and confirmed Flex instances.
- `GET /api/ride-requests`, `POST /api/ride-requests`, `POST /api/ride-requests/{id}/join` — Flex demand.
- `POST /api/journey-orders`, `POST /api/journey-orders/{id}/confirm` — linked booking with capacity transaction.
- `POST /api/reservations/{id}/cancel` — release a seat.
- `POST /api/driver/trips/{id}/boarding-events` — check-in/out/no-show, audited.
- `POST /api/dispatch/fixed-plans/generate`, `POST /api/dispatch/fixed-plans/{id}/publish` — strategic planning.
- `POST /api/dispatch/flex-plans/simulate`, `POST /api/dispatch/flex-plans/{id}/approve` — operational planning.
- `POST /api/simulations`, `GET /api/simulations/{id}/events`, `GET /api/analytics` — repeatable demo/metrics.

Use idempotency keys and optimistic/pessimistic concurrency control as appropriate when implementing real APIs; do not build mock-only promises into production client semantics.

## 20. Privacy, accessibility and safety

- Minimize personal data. Share only necessary information with driver; consider booking ID vs. name and role-controlled access, pending operator/legal guidance.
- Child's contact: verified parent/guardian. Adult-relative booking: explicit delegation. Don't show passenger whereabouts or medical needs on public maps.
- Functional requirements, not diagnoses: mobility assistance, step-free need, boarding assistance, safe walking route and stop suitability.
- Readable accessible UI, keyboard support, labeled inputs, large interactive targets, no reliance only on color or tiny badges for status.
- Log dispatcher decisions, manual overrides, boarding corrections, no-show reviews, stop approval and round-trip hold transitions for accountability.
- Minimize retention; privacy/security terms and lawful basis must be reviewed before real deployment (especially location, child data, phone and GPS tracking).
- Never store actual secret credentials, private personal records, or real contact numbers inside synthetic demo fixtures.
- Distinguish operational service reliability from an absolute promise that external buses, weather and traffic never disrupt travel.

## 21. Testing invariants and acceptance scenarios

**At minimum, preserve or add tests covering:**

1. One-way Fixed booking reduces segment capacity; cannot oversubscribe last seat even under concurrent requests (server-side when available).
2. Seat released after a rider alights can be reused on subsequent trip segment, not before.
3. Round-trip with both Fixed legs confirms both atomically; if one leg lacks capacity, confirms neither.
4. Fixed outbound plus pending Flex return does not display confirmed round trip; bounded HELD is released on failure/expiry.
5. Returning journey cannot leave before outbound destination arrival.
6. Unapproved stop pin cannot become a pickup stop for a real Fixed/confirmed Flex trip.
7. Given child's profile, require guardian contact; household owner may book for authorized child/senior; unauthorized relative access denied.
8. Joining the same request twice does not double-count a passenger; additional riders increase interest but do not confirm transport.
9. A Flex route that risks next Fixed departure (including reposition travel and driver breaks) is rejected with reason.
10. A driver cannot mark `Vystúpil` before `Nastúpil`, and no-show is reviewable/correctable.
11. Repeated no-show does not automatically ban single manual booking; restrictions only apply if approved configurable policy.
12. Search results do not auto-select first departure, correctly display both stop sequences and preserve fields on Back.
13. All time entry/display is 24-hour Slovak and correctly handles local time/calendar.
14. Driver profile shows licence categories, not a permanent fleet assignment; trips show their own vehicle.
15. Mobile page scroll does not duplicate sticky controls or hide content under bottom navigation.
16. Synthetic simulation with fixed seed is reproducible; outputs distinguish simulated vs. real data.
17. External public transit is not represented as bookable/guaranteed without integration.
18. Personal identities/addresses are not included in public map request markers.
19. Map-selected arbitrary point does not silently become an approved official stop.
20. Cancel/rebook changes capacity and updates all authorized role views correctly.

When editing frontend, run installed typecheck, lint, unit tests and build; when adding backend, Maven tests and DB migrations. If a tool/browser is unavailable, state exactly what could not be verified rather than claim visual verification.

## 22. How coding agents should work in this repository

1. **Inspect** `package.json`, README, source tree, app router, store/domain types, tests and Git status before changing anything. Do not infer the current code solely from AGENTS.md.
2. **Preserve working behavior** and the approved UX flow. Prefer small type-safe edits; no sweeping rewrite, no unnecessary UI redesign, no unnecessary dependencies.
3. **Use the user's latest decision as source of truth.** Older descriptions/ERD/image mockups may show removed carpool or a three-type request form; these are obsolete. Preserve useful style but not obsolete functionality.
4. **Respect module boundaries**. Place business invariants in domain/service functions rather than scattered UI conditionals. Use reusable design primitives and shared data types.
5. **Keep mock operations meaningful**, not dead buttons. Mutations update all relevant shared views and persist in the demo store; reset demo data should be possible.
6. **Do not fabricate integrations**. Mark placeholder map, synthetic routes, travel times and GPS as demo. No fake success notifications for unconfirmed on-demand trips.
7. **Don't hard-code operational policy not approved by mentors**: exact buffer minutes, transfer waits, no-show counts, hold periods, vehicle inventory, recurrence horizon, driver rules. Keep parameters configurable and document assumptions.
8. **Propose decisions separately** when there is a real unresolved business/legal question; do not silently decide it inside code.
9. **Do not edit unrelated files** or commit secret/config data. Use feature branch/PR workflow when Git operations are requested; don't push directly to main without instruction.
10. **Report actual verification**: touched files, changed behavior, commands and outcomes, assumptions, remaining risks. Never claim tests passed unless executed.

## 23. Explicitly rejected or superseded ideas

- **No BlaBlaCar / CommunityRide / private rides.** Mentors agreed to remove them.
- **No requirement that Fixed departures are determined by daily Flex requests.** Fixed is designed from aggregated demand, then approved/published.
- **No promise that a submitted Flex request is automatically fulfilled.** Approval depends on real planning feasibility.
- **No permanently assigned vehicle in a driver's personal profile.** Assign per trip; driver license categories belong to the driver.
- **No automatic first selected Fixed departure.** Selection must be user-driven.
- **No full search form on `Domov`.** It lives on its own page.
- **No repeated personal-info selection only at the final reservation step.** Choose passengers up front.
- **No blocking entire passenger access as punishment for no-show**, no arbitrary fine, no unapproved hard-coded thresholds.
- **No static single-village route catalog as core UI.** It must scale to route search across service areas.
- **No assumed arbitrary universal transfer-wait numbers.** Use configurable passenger/dispatcher-specific rules and real schedule data.
- **No auto-activation of suggested stops** and no route-distance-as-straight-line accessibility calculation.

## 24. Product decisions still requiring organizer approval

1. Actual vehicles, registration category, capacity, accessibility features, fleet count, driver shifts and operating permits.
2. Whether every vehicle has GPS, real-time data API, acceptable tracking and retention.
3. Driver manifest data: passenger name vs. reservation code; consent/legal basis, children's data, authorized notifications.
4. Details of the no-show policy: threshold, warning, exceptions, review, suspension length and appeal/correction.
5. Exact expiry rules of round-trip seat holds, review deadlines and handling of conflicting demand.
6. Whether Flex requests can be auto-confirmed or need dispatcher sign-off, and before what deadline.
7. Phone line/IVR/SMS availability, provider and how after-hours requests are handled.
8. Actual road/travel-time sources, safe stops, accessibility verification and official transit data/feed availability.
9. Allowed maximum detour, transfer constraints, walking effort and other region-specific parameters.
10. Permanent pilot service area and data permission/reuse licenses.

## 25. Definition of success

A useful demo lets mentors:

1. See a **credible Slovak mobile passenger app** with separate search, Fixed options, existing Flex request map/list and booking for self/child/senior.
2. Create a request, see it reflected in dispatcher, have it grouped/planned/approved, then see assigned driver and rider manifest.
3. Follow an entire **round trip** with clear no-stranding protection and no falsely guaranteed return.
4. Observe a minibus perform published morning/midday/evening Fixed journeys while serving feasible Flex requests in available windows.
5. Understand why a request or proposed stop was accepted/rejected, including walking/accessibility and vehicle safety.
6. See how feeder rides connect to existing public transport without overstating reservation guarantees.
7. Compare Fixed-only vs hybrid strategies using **reproducible synthetic data** and meaningful operational KPIs.
8. Clearly distinguish what is already functional, what is simulated, and what still needs real operator integrations.

---

**Summary for every future AI teammate:** Moja Cesta = **reliable demand-designed Fixed routes + feasible Flex rides between them, with shared small-capacity vehicles, mandatory booking, safe two-way journeys, family/senior accessibility, stop proposals, existing regional transit connections and evidence-based planning**. Privacy, practical feasibility and honest status representation take priority over flashy features.

## 26. Regular plans — latest user decision

- Only school/work purposes are allowed for new submissions, with an explicit required choice. Preserve legacy records without silently inventing a purpose.
- Submit at least five calendar days before the first occurrence; maximum twelve calendar months. Passenger steps are basic details, independent weekly days, review and submission. No passenger service selection.
- Submission is demand, not a reservation. System/dispatcher must secure assigned vehicles, compatible drivers and segment seats, confirming both round-trip legs together at least 24 hours before first departure. Confirmation includes exact departure/arrival stops and times. Missing transport creates an open dispatcher task, never automatic rejection.
- Track submitted/partial/secured/attention statuses and per-date deadlines. Late confirmation must explicitly report the missed deadline. Unknown arrival-mode departure uses a conservative preliminary deadline before the start of the travel day.
- Demo processing is explicit in the open application, with current time or a user-selected Bratislava simulation instant. No closed-app scheduling, outbound notifications, real-time service or year-long guarantees are claimed.
- Preserve guardian telephone requirements, existing profiles, reservations, atomic returns, exceptions and demand statistics.
- Domov has four equal cards in a 2 × 2 grid below search. Field errors are red and local, invalid controls have red borders. Display dates numerically as `14. 11. 2026`, time as `HH:mm`.

## 27. Active driver trip execution

- Assigned drivers start a trip and enter `/driver/navigation/:id`, a separate viewport-filling execution screen outside the standard role layout. Back to overview leaves the trip active. Completed runs cannot be restarted.
- `DriverNavigationMap` is a replaceable presentation adapter receiving the trip and current stop index. Until the teammate supplies the map, render only the local static illustration. No map APIs, GPS simulation, turn instructions or live-position claims.
- Persist `Trip.navigation` in the existing store: ordered current stop, moving/stopped phase, processed stop indexes, actual start/end instants. Legacy active trips retain unknown start time rather than inventing one.
- Arrive explicitly before opening the stop panel. Rider transitions are allowed only at their applicable current stop while stopped. Preserve capacity, alight-after-board and no-show review invariants. Continue requires processing every relevant reservation; no automatic progression.
- Completion requires all ordered stops plus all boarding/alighting/no-show records resolved, no one aboard. Show transported seat count, no-show seat count and recorded start/end times. No new sanctions.

### Driver overview and pre-trip privacy

- Driver identity comes from the current mock profile; no driver picker in the driver interface. Keep the general passenger/driver/dispatcher role switch.
- `Moje dnešné jazdy` contains one daily list of all assigned trips; no separate highlighted next-trip block. Every card opens its trip details.
- Before starting, show each ordered stop’s planned time and aggregate boarding/alighting seat counts from confirmed bookings. Do not show passenger manifests or attendance controls until arrival in active navigation.
- Omit the redundant driver/type/licence assignment text row in driver details. Preserve internal assignment and licence checks and dispatcher presentation. Card chips and statuses must scroll with their own cards without floating or overlapping route names.

### Driver mark corrections and daily run emphasis

- At an open stop, both boarded and absent marks expose the same `Zmeniť označenie` action. Toggle only to the opposite pickup mark; an erroneous alighting may be restored to aboard at its drop-off stop. Enforce current assigned driver, active trip, stopped phase and correct stop in domain logic.
- Recheck physical occupancy and, when restoring a no-show, reservation capacity on every leg. Persist correction history and corrected no-show status; update shared bookings and notifications without sanctions. Corrections are forbidden after closing the stop.
- Daily cards use actual execution status: muted `Ukončená`, distinct active `Prebieha` with resume action, and exactly one light-green earliest scheduled card marked `Nasledujúca jazda`. Preserve time ordering. Never infer completion from the clock.

## 28. Permanent passenger identification codes

- Every household passenger, including children and relatives, has a unique permanent six-digit string `passengerCode` (leading zeroes are retained). A new profile may supply it or generate a free code. Retry collisions, validate against all household and external demo passengers, and never change an existing code through normal profile edits. Apply the same allocator to future account registration.
- Bookings refer to immutable internal `passengerId`; existing `personId` is retained as a compatible internal-ID alias. Never bind bookings or permissions to display codes or infer identities from names. Resolve one profile code for all of that passenger’s bookings.
- Migrate older profiles and bookings without deleting them. Anonymous legacy demo reservations get separate external passenger registry entries without inventing family membership or merging matching names. Group fixtures remain single reservations with a seat count.
- Driver screens show passenger codes, seats and pickup/dropoff information, never passenger names/initials. Keep operational assistance and existing boarding/correction/capacity rules. Public request maps must not reveal passenger identity or codes.
- Family cards show formatted `ID cestujúceho: 123 456` and a copy action. This demo checks a shared store/localStorage and reads current persisted state before saving profiles. localStorage is not a cross-user uniqueness guarantee or authentication mechanism. Production requires a server-side unique database constraint on passengerCode, transactional collision retry and immutable passenger-ID foreign keys.

## 29. Read-only driver route map

- Driver navigation order: `Dnešné jazdy | Mapa | Aktuálna jazda | Profil`. `/driver/map?tripId=…` previews any current-driver assigned unfinished Fixed or Flex trip across service dates. Reject completed or other-driver IDs.
- Daily cards provide a separate `Zobraziť trasu` link for unfinished trips; do not nest interactive links. Preserve the normal trip-detail and active-trip transitions.
- Reuse `DriverNavigationMap` with the selected trip, current stop index and optional ordered `DriverMapStop[]` (names, IDs, planned times, known coordinates and aggregate boarding/alighting counts). Keep only the static illustration until the teammate integrates a real map. Do not claim that the placeholder draws the actual road route.
- The map page displays actual ordered stops, start/end, planned times and assigned vehicle without passenger identities. It is view-only: no start, arrival, rider or booking mutations. Active-trip navigation remains a separate execution screen.

## 30. Shared interactive map integration

- The user's map integration replaces the static-map restrictions in sections 27 and 29. Keep `src/modules/transport-map` independent of the application store/router: map tiles, camera/zoom, one selected road route, numbered stop occurrences, point selection and optional geographic service adapters are its responsibilities. It emits selections and never books, approves, assigns vehicles or advances driver execution.
- Reuse `TransportMap` with `height="container"`, `chrome="compact"` and a host `renderCard(context)` for each workflow. Keep the map as the background and workflow information in one scrollable, expandable bottom card. Standalone `/map.html` retains its default browser card and demo dataset.
- Application projections and service configuration belong in `src/maps/applicationMap.ts`. Public request maps receive only shared stop positions and aggregate request fields. Never pass the store, passenger profiles/codes, assistance notes or private residential pins to the public map. Do not import archival public-bus fixtures or standalone synthetic schedules into application trips.
- Requests preserve existing search context, filters, links and request lifecycle; one route click selects and opens its stops, back returns to requests. Place picking preserves coordinates and stop/custom origin, manual naming and the existing safety/approval flow. Driver preview shows only assigned unfinished trips. Active navigation retains its existing explicit arrival, roster and guarded stop progression inside the host card; map selection cannot mutate execution.
- Missing road geometry is computed through ordered coordinates; missing/failed geometry has an honest notice and never becomes a straight connector. Public OSRM is a demo fallback for public stops only. Private driver pickups require explicitly configured `VITE_MAP_OSRM_URL` and `VITE_MAP_PRIVATE_ROUTING=true` for a suitable provider. No GPS, turn-by-turn instructions or operational travel-time promises are introduced.

## 31. Connection map and request withdrawal

- General passenger Map navigation clears the previous workflow context and offers Fixed services and aggregate requests with type, date, time, direction and text filters. Search request-stage maps remain request-only; regular lines and Fixed search results display their own eligible trips on the shared map, with no default route selected. One tap selects a route and opens its information. Booking selection remains explicit and round-trip validation unchanged.
- Passenger withdrawal from a request and its linked reservations is blocked at or within 24 elapsed hours before departure from the passenger boarding stop (Bratislava calendar/time converted to an instant). Check all linked directions atomically. Actual assigned pickup times take precedence. Pending arrival-mode requests use the same explicitly synthetic 24-minute Flex timing already used by this demo's planner; production needs an actual pickup timetable. Joining within 24 hours remains allowed; joining an approved ride must atomically secure all linked legs, respect configured segment capacity, guardian validation and scheduled future departure.
- This browser/localStorage implementation is demo validation, not server-authoritative clock, authentication or transactional concurrency.

## 32. Whole route cards and reliable preset geometry

- Passenger map route lists use the entire Fixed/request card as the selection control, including keyboard Enter/Space, without nested show-map buttons or links. Selection draws one route and replaces the entire list with its detail card; back restores the list and filters. Regular-line and search hosts follow the same pattern, preserving search inputs, stop acceptance and atomic round-trip booking.
- The original misplaced Lechnica demo point is repaired from supplied GTFS public stop 46701, preserving edited/custom locations and reservations; the legacy church label remains unverified. Exact legacy stop-coordinate references migrate too.
- Preset public road geometry is cached by exact ordered coordinates in `src/maps/demo-road-cache.json`, regenerated with `scripts/cache-application-roads.mjs`. All preset trip patterns and public ordered stop pairs must be covered and tested without network. Custom geometry uses the configured provider and existing privacy rules. Do not loosen snapping arbitrarily or fake road lines.
