import type { RideRequest } from '../types'
export function Landscape() {
  return (
    <svg
      className="landscape"
      viewBox="0 0 620 350"
      role="img"
      aria-label="Ilustrácia zeleného mikrobusu v krajine Zamaguria"
    >
      <circle cx="454" cy="85" r="37" fill="#ede8d3" />
      <path d="M25 230L154 92l91 94L351 57l231 185" fill="#dce3d6" />
      <path d="m154 92 35 36-28-8-16 11-19-10zM351 57l49 56-29-12-20 14-26-18z" fill="#fafbf5" />
      <path d="M0 250Q113 141 238 219T620 190V350H0Z" fill="#c3d2b3" />
      <path d="M0 294Q150 192 351 261T620 224V350H0Z" fill="#93ae87" />
      <path d="M265 350Q273 292 389 263t100-55" fill="none" stroke="#f1eee2" strokeWidth="39" />
      <path
        d="M265 350Q273 292 389 263t100-55"
        fill="none"
        stroke="#c9c4b2"
        strokeWidth="1.5"
        strokeDasharray="8 12"
      />
      <g transform="translate(90 183)">
        <path d="M0 29 29 4l29 25" fill="#687b5c" />
        <path d="M7 28h44v40H7z" fill="#f8f5e9" />
        <path d="M24 47h12v21H24z" fill="#a9b999" />
        <path d="M14 35h9v9h-9zM35 35h9v9h-9z" fill="#9fb4a4" />
      </g>
      <g transform="translate(153 171)">
        <path d="m0 27 22-22 22 22" fill="#637959" />
        <path d="M6 26h32v42H6z" fill="#e8e8d6" />
        <path d="M15 34h9v10h-9zM18 51h9v17h-9z" fill="#91a68b" />
      </g>
      <g fill="#4d7655">
        <path d="m54 198-18 39h36zM50 220l-21 44h42z" />
        <path d="m550 204-21 44h42zM550 228l-27 48h54z" />
        <path d="m511 177-16 34h32z" />
      </g>
      <g stroke="#667d55" strokeWidth="4">
        <path d="M52 253v28M550 264v26M511 203v17" />
      </g>
      <g transform="translate(283 219) rotate(-7)">
        <ellipse cx="87" cy="70" rx="88" ry="10" fill="#718b6b" opacity=".3" />
        <path d="M8 22q1-20 24-20h92q16 0 24 15l17 29v18H5V30z" fill="#25553e" />
        <path d="M21 9h98q13 0 19 13l10 19H20z" fill="#c8dcd1" />
        <path d="M57 9v32M96 9v32" stroke="#25553e" strokeWidth="6" />
        <path d="M20 45h131" stroke="#a9c48f" strokeWidth="3" />
        <rect x="16" y="48" width="27" height="5" rx="2" fill="#d8e4b7" />
        <rect x="143" y="48" width="16" height="7" rx="2" fill="#f7f4d5" />
        <path d="M3 61h165" stroke="#183c2e" strokeWidth="6" />
        <circle cx="37" cy="64" r="13" fill="#263a32" />
        <circle cx="37" cy="64" r="6" fill="#bcc7b7" />
        <circle cx="133" cy="64" r="13" fill="#263a32" />
        <circle cx="133" cy="64" r="6" fill="#bcc7b7" />
        <text x="70" y="55" fontSize="9" fill="#ecf1df" fontFamily="sans-serif">
          moja cesta
        </text>
      </g>
      <g transform="translate(443 213)">
        <path d="M0 0v39" stroke="#425e48" strokeWidth="3" />
        <rect
          x="-10"
          y="-9"
          width="20"
          height="24"
          rx="4"
          fill="#f6f8e9"
          stroke="#425e48"
          strokeWidth="2"
        />
        <path d="M-5-3h10v9H-5z" fill="#64866a" />
      </g>
      <path d="M220 80q9-9 18 0m0 0q9-9 18 0" fill="none" stroke="#82927b" strokeWidth="2" />
    </svg>
  )
}
export function RegionMap({ requests = [] }: { requests?: RideRequest[] }) {
  const positions: Record<string, [number, number]> = {
    lech: [220, 220],
    cer: [380, 131],
    hal: [586, 190],
    mat: [748, 120],
    ssv: [868, 221],
    school: [868, 221],
  }
  const counts = requests.reduce<Record<string, number>>((all, r) => {
    all[r.from] = (all[r.from] ?? 0) + r.passengers
    return all
  }, {})
  const directions = requests.filter(
    (r, i, all) => all.findIndex((x) => x.from === r.from && x.to === r.to) === i,
  )

  return (
    <div className="region-map">
      <svg
        viewBox="120 0 860 400"
        role="img"
        aria-label="Schematická mapa obcí Matiašovce, Haligovce, Lechnica, Červený Kláštor a Spišská Stará Ves"
      >
        <rect width="1100" height="400" fill="#edf0e6" />
        <path d="M0 0h350l-30 92-107 55-27 102L0 235Z" fill="#e1e8d8" />
        <path d="m704 0-70 95 45 105 142 24 90 176h189V0Z" fill="#e0e8d7" />
        <path d="M0 340q200-65 370 3t340-15 390-40" fill="none" stroke="#cee1e2" strokeWidth="19" />
        <path
          d="m30 230 190-10 160-89 206 59 162-70 120 101 202 10M220 220l75 180M586 190l-75 210M748 120l60-120M868 221l-68 179"
          fill="none"
          stroke="#d1d5c8"
          strokeWidth="16"
          strokeLinejoin="round"
        />
        <path
          d="m30 230 190-10 160-89 206 59 162-70 120 101 202 10M220 220l75 180M586 190l-75 210M748 120l60-120M868 221l-68 179"
          fill="none"
          stroke="#fffdf6"
          strokeWidth="11"
          strokeLinejoin="round"
        />
        <defs>
          <marker
            id="request-direction-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#567a55" />
          </marker>
        </defs>
        {directions.map((r) => {
          const from = positions[r.from],
            to = positions[r.to]
          if (!from || !to) return null
          return (
            <path
              key={r.id}
              d={`M${from[0]} ${from[1]} Q${(from[0] + to[0]) / 2} ${Math.min(from[1], to[1]) - 45} ${to[0]} ${to[1]}`}
              fill="none"
              stroke="#567a55"
              strokeWidth="3"
              strokeDasharray="7 6"
              markerEnd="url(#request-direction-arrow)"
            />
          )
        })}
        {[
          [220, 220, 'Lechnica'],
          [380, 131, 'Červený Kláštor'],
          [586, 190, 'Haligovce'],
          [748, 120, 'Matiašovce'],
          [868, 221, 'Spišská Stará Ves'],
        ].map(([x, y, label]) => (
          <g key={label} transform={`translate(${x} ${y})`}>
            <circle r="7" fill="white" stroke="#315a42" strokeWidth="3" />
            <rect x="-83" y="19" width="166" height="29" rx="7" fill="#ffffff" fillOpacity=".92" />
            <text
              y="38"
              textAnchor="middle"
              fill="#3c5143"
              fontSize="14"
              fontWeight="600"
              fontFamily="sans-serif"
            >
              {label}
            </text>
          </g>
        ))}
        {Object.entries(counts).map(([stopId, n]) => {
          const point = positions[stopId]
          if (!point) return null
          return (
            <g key={stopId} transform={`translate(${point[0]} ${point[1] - 43})`}>
              <path d="m-15 12 15 14 15-14" fill="#28533d" />
              <rect x="-23" y="-22" width="46" height="37" rx="12" fill="#28533d" />
              <text y="3" fill="white" textAnchor="middle" fontSize="17" fontWeight="600">
                {n}
              </text>
            </g>
          )
        })}
        <text x="53" y="69" fill="#94a08a" fontSize="14" letterSpacing="5">
          PIENINY
        </text>
        <text x="800" y="352" fill="#94a08a" fontSize="13" letterSpacing="4">
          ZAMAGURIE
        </text>
        <text x="65" y="350" fill="#8da9b0" fontSize="13" fontStyle="italic">
          Dunajec
        </text>
      </svg>
      <div className="map-note">
        <span className="badge-dot" /> Ilustračná schéma regiónu · polohy nie sú presné
      </div>
      <div className="map-key">
        <span className="map-marker" /> Záujem cestujúcich
      </div>
    </div>
  )
}
