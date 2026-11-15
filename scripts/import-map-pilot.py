"""Extract public map features only from the team's GTFS. Never modifies source data.

Run: python -X utf8 scripts/import-map-pilot.py
No spreadsheet packages or network access required.
"""
import csv
import hashlib
import io
import json
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data a podklady/03_Podklady z dispecingu IDS Vychod/gtfs.zip'
OUTPUT = ROOT / 'src/modules/transport-map/demo/pilot-data.json'
FOCUS = ['Spišská Stará Ves', 'Havka', 'Zálesie', 'Jezersko', 'Lechnica', 'Veľká Lesná']


def main():
    with ZipFile(SOURCE) as archive:
        def read(name):
            return list(csv.DictReader(io.StringIO(archive.read(name).decode('utf-8-sig'))))
        source_stops = {s['stop_id']: s for s in read('stops.txt')}
        source_routes = {r['route_id']: r for r in read('routes.txt')}
        feed = read('feed_info.txt')[0]
        stop_times = defaultdict(list)
        for row in read('stop_times.txt'):
            stop_times[row['trip_id']].append(row)
        for rows in stop_times.values():
            rows.sort(key=lambda row: int(row['stop_sequence']))
        patterns = {}
        for trip in read('trips.txt'):
            times = stop_times[trip['trip_id']]
            municipalities = {source_stops[t['stop_id']]['stop_name'].split(',')[0] for t in times}
            if FOCUS[0] not in municipalities or not municipalities.intersection(FOCUS[1:]):
                continue
            key = (trip['route_id'], tuple(t['stop_id'] for t in times))
            patterns.setdefault(key, (trip, times))
        used = {stop_id for (_, ids) in patterns for stop_id in ids}
        stops = [{
            'id': f"gtfs:{s['stop_id']}",
            'name': s['stop_name'].replace(',', ', '),
            'municipality': s['stop_name'].split(',')[0],
            'position': {'latitude': float(s['stop_lat']), 'longitude': float(s['stop_lon'])},
            'status': 'external',
        } for stop_id, s in source_stops.items() if stop_id in used]
        by_id = {s['id']: s for s in stops}
        routes = []
        for (route_id, ids), (_, times) in patterns.items():
            route = source_routes[route_id]
            digest = hashlib.sha256('|'.join(ids).encode()).hexdigest()[:10]
            pattern_id = f'gtfs:{route_id}:{digest}'
            routes.append({
                'id': pattern_id,
                'code': route['route_short_name'],
                'name': route['route_long_name'].rstrip('<>'),
                'direction': f"{by_id['gtfs:' + ids[0]]['name']} → {by_id['gtfs:' + ids[-1]]['name']}",
                'kind': 'external',
                'geometrySource': 'schematic',
                'stops': [{
                    'occurrenceId': f"{pattern_id}:{row['stop_sequence']}",
                    'stopId': f"gtfs:{row['stop_id']}",
                    # Pattern aggregates several runs. Never invent a common departure time.
                } for row in times],
            })
        focus = []
        for i, name in enumerate(FOCUS):
            candidates = [s for s in stops if s['municipality'] == name]
            if not candidates:
                raise ValueError(f'Missing focus municipality: {name}')
            representative = next((s for s in candidates if ', AS' in s['name'] or ', OcÚ' in s['name']), candidates[0])
            focus.append({'id': f'pilot:{i}', 'name': name, 'position': representative['position'], 'kind': 'city' if i == 0 else 'village'})
        dataset = {
            'name': 'Spišská Stará Ves a päť obcí',
            'demo': True,
            'area': {
                'id': 'ssv-pilot', 'name': 'Zamagurie · pilotná oblasť',
                'bounds': [{'latitude': 49.2, 'longitude': 20.1}, {'latitude': 49.48, 'longitude': 20.6}],
                'focusLocations': focus,
            },
            'stops': stops, 'routes': routes,
        }
        result = {
            'dataset': dataset,
            'provenance': {
                'source': str(SOURCE.relative_to(ROOT)).replace('\\', '/'),
                'sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                'publisher': feed['feed_publisher_name'],
                'validFrom': feed['feed_start_date'], 'validThrough': feed['feed_end_date'],
                'version': feed['feed_version'],
                'notes': [
                    'Historical external timetable snapshot; not a current schedule or managed fleet.',
                    'No shapes.txt in source. Dashed lines connect ordered stops and are not road geometry.',
                    'Pattern times and calendars omitted: this map does not claim current trip availability.',
                    'Full directional stop sequences retained, including intermediate non-pilot municipalities.',
                ],
            },
        }
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'Imported {len(stops)} stops, {len(routes)} patterns, {len(focus)} focus locations.')
        print(f"Feed validity: {feed['feed_start_date']}–{feed['feed_end_date']}; no road shapes supplied.")


if __name__ == '__main__':
    main()
