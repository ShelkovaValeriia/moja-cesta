"""Read-only source extraction and public OSM snapshot for the scenario planner.

Run with Python 3: python -X utf8 scripts/prepare-planning-data.py
Downloads only a public bounding box, never passenger locations. Source files are unchanged.
"""
import argparse
import csv
import hashlib
import io
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'data a podklady/03_Podklady z dispecingu IDS Vychod'
OUTPUT = ROOT / 'src/planning/data'
FOCUS = ['Havka', 'Zálesie', 'Jezersko', 'Lechnica', 'Veľká Lesná']


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--refresh-network', action='store_true')
    options = args.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = SOURCES / 'matica_SSV_8.-10.9.2026.csv'
    rows = [r for r in csv.reader(io.StringIO(source.read_bytes().decode('cp1250')), delimiter=';')
            if r and r[0].isdigit()]
    selected = [r for r in rows if r[1].split(',')[0] in FOCUS or r[1].startswith('Spišská Stará Ves')]
    with ZipFile(SOURCES / 'gtfs.zip') as archive:
        stops = list(csv.DictReader(io.StringIO(archive.read('stops.txt').decode('utf-8-sig'))))
    crosswalk = []
    for row in selected:
        label = row[1].rstrip(',')
        matches = [s for s in stops if s['stop_name'] == label]
        if not matches:
            raise ValueError(f'Missing explicit stop match: {label}')
        # Preserve every platform, with a declared representative for this simulation.
        crosswalk.append({'id': row[0], 'name': label.replace(',', ', '),
                          'municipality': label.split(',')[0], 'hub': row[0] in ['1', '2', '3', '4'],
                          'latitude': float(matches[0]['stop_lat']), 'longitude': float(matches[0]['stop_lon']),
                          'platformIds': [s['stop_id'] for s in matches]})
    cells = []
    for a in selected:
        for b in selected:
            if a[1].startswith('Spišská Stará Ves') == b[1].startswith('Spišská Stará Ves'):
                continue
            count = int(a[int(b[0]) + 1])
            if count:
                cells.append({'from': a[0], 'to': b[0], 'count': count})
    assert len(cells) == 26 and sum(c['count'] for c in cells) == 172
    pilot = {'source': str(source.relative_to(ROOT)).replace('\\', '/'),
             'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
             'period': ['2026-09-08', '2026-09-09', '2026-09-10'],
             'stops': crosswalk, 'cells': cells}
    (OUTPUT / 'pilot.json').write_text(json.dumps(pilot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    network_file = OUTPUT / 'network.json'
    if network_file.exists() and not options.refresh_network:
        print('Retained pinned OSM snapshot; use --refresh-network to update it.')
        return
    query = '[out:json][timeout:60];way["highway"](49.27,20.31,49.405,20.50);(._;>;);out body;'
    failure = None
    for endpoint in ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']:
        try:
            request = urllib.request.Request(endpoint, data=urllib.parse.urlencode({'data': query}).encode(),
                                             headers={'User-Agent': 'MojaCesta-research-demo/1.0'})
            with urllib.request.urlopen(request, timeout=75) as response:
                data = json.load(response)
            elements = data['elements']
            if not elements:
                raise ValueError('Empty OSM snapshot')
            nodes = {str(n['id']): [n['lat'], n['lon']] for n in elements if n['type'] == 'node'}
            ways = [{'id': str(w['id']), 'nodes': [str(n) for n in w['nodes']], 'tags': w['tags']}
                    for w in elements if w['type'] == 'way' and 'highway' in w.get('tags', {})]
            result = {'source': endpoint, 'license': 'ODbL 1.0; © OpenStreetMap contributors',
                      'timestamp': data.get('osm3s', {}).get('timestamp_osm_base', ''),
                      'query': query, 'nodes': nodes, 'ways': ways}
            network_file.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
            print(f'Extracted 26 OD cells, 13 stop groups; OSM: {len(nodes)} nodes, {len(ways)} ways.')
            return
        except Exception as error:
            failure = error
            print(f'{endpoint}: {error}', flush=True)
            time.sleep(1)
    raise RuntimeError(f'No geographic snapshot downloaded: {failure}')


if __name__ == '__main__':
    main()
