import type { MapLandmark } from '../types'

/** Public building locations, never passenger destinations or approved boarding stops. */
export const PILOT_LANDMARKS: readonly MapLandmark[] = [
  {
    id: 'ssv-school',
    name: 'Základná škola Spišská Stará Ves',
    kind: 'school',
    position: { latitude: 49.383853490514, longitude: 20.357666015625 },
    sourceUrl: 'https://zs231ssv.edupage.org/contact/',
    coordinateSourceUrl: 'https://zs231ssv.edupage.org/contact/',
  },
  {
    id: 'ssv-health-centre',
    name: 'Zdravotné stredisko Spišská Stará Ves',
    kind: 'healthcare',
    position: { latitude: 49.378302624970495, longitude: 20.360938483155934 },
    sourceUrl: 'https://www.spisskastaraves.sk/zdravotnictvo/',
    coordinateSourceUrl: 'https://poi.oma.sk/w58781062',
  },
  {
    id: 'ssv-coop',
    name: 'COOP Jednota · SNP 53',
    kind: 'shop',
    position: { latitude: 49.38452692578073, longitude: 20.359355733835056 },
    sourceUrl: 'https://cooppoprad.sk/predajna/spisska-st-ves-snp-c-53-pj-104/',
    coordinateSourceUrl: 'https://cooppoprad.sk/predajna/spisska-st-ves-snp-c-53-pj-104/',
  },
]
