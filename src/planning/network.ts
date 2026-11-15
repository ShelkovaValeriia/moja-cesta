import type { NetworkSnapshot, Path, PlanningStop, Point } from './types'

export function distance(a: Point, b: Point) {
  const rad = Math.PI / 180
  const x = (b.longitude - a.longitude) * rad * Math.cos(((a.latitude + b.latitude) * rad) / 2)
  const y = (b.latitude - a.latitude) * rad
  return Math.hypot(x, y) * 6371000
}
class Heap {
  values: [number, string][] = []
  push(value: [number, string]) {
    const a = this.values
    a.push(value)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p][0] <= value[0]) break
      a[i] = a[p]
      i = p
    }
    a[i] = value
  }
  pop() {
    const a = this.values,
      first = a[0],
      last = a.pop()!
    if (a.length) {
      let i = 0
      while (i * 2 + 1 < a.length) {
        let j = i * 2 + 1
        if (j + 1 < a.length && a[j + 1][0] < a[j][0]) j++
        if (last[0] <= a[j][0]) break
        a[i] = a[j]
        i = j
      }
      a[i] = last
    }
    return first
  }
}
type Edge = { to: string; meters: number; seconds: number; steps: boolean }
const speeds: Record<string, number> = {
  motorway: 80,
  motorway_link: 40,
  trunk: 65,
  trunk_link: 35,
  primary: 55,
  primary_link: 30,
  secondary: 45,
  secondary_link: 30,
  tertiary: 40,
  tertiary_link: 25,
  unclassified: 35,
  residential: 25,
  living_street: 15,
  service: 15,
  track: 10,
}

/** Pinned OSM graph. Travel times are model estimates, never live/operator times. */
export class RoadNetwork {
  private drive = new Map<string, Edge[]>()
  private walk = new Map<string, Edge[]>()
  private reverseWalk = new Map<string, Edge[]>()
  private trees = new Map<string, { times: Map<string, number>; previous: Map<string, string> }>()
  private paths = new Map<string, Path | null>()
  private stopNodes = new Map<string, string | null>()
  constructor(
    public readonly snapshot: NetworkSnapshot,
    public readonly stops: PlanningStop[],
  ) {
    const add = (graph: Map<string, Edge[]>, a: string, b: string, edge: Omit<Edge, 'to'>) => {
      graph.set(a, [...(graph.get(a) ?? []), { ...edge, to: b }])
      if (!graph.has(b)) graph.set(b, [])
    }
    for (const way of snapshot.ways) {
      const t = way.tags,
        h = t.highway ?? ''
      if (
        ['construction', 'proposed', 'abandoned'].includes(h) ||
        t.access === 'private' ||
        t.access === 'no'
      )
        continue
      const motor =
        speeds[h] !== undefined &&
        !['no', 'private'].includes(t.motor_vehicle ?? '') &&
        !['no', 'private'].includes(t.vehicle ?? '')
      const foot =
        !['motorway', 'motorway_link', 'trunk', 'trunk_link', 'raceway'].includes(h) &&
        !['no', 'private'].includes(t.foot ?? '')
      const speed = Math.min(speeds[h] ?? 25, Number.parseFloat(t.maxspeed ?? '') || Infinity)
      const oneway = t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout'
      for (let i = 1; i < way.nodes.length; i++) {
        const a = way.nodes[i - 1],
          b = way.nodes[i]
        if (!snapshot.nodes[a] || !snapshot.nodes[b]) continue
        const meters = distance(this.point(a), this.point(b))
        if (motor) {
          const e = { meters, seconds: meters / (speed / 3.6), steps: false }
          if (t.oneway !== '-1') add(this.drive, a, b, e)
          if (!oneway) add(this.drive, b, a, e)
        }
        if (foot) {
          const e = { meters, seconds: meters / 1.25, steps: h === 'steps' }
          add(this.walk, a, b, e)
          add(this.reverseWalk, b, a, e)
          if (t['oneway:foot'] !== 'yes') {
            add(this.walk, b, a, e)
            add(this.reverseWalk, a, b, e)
          }
        }
      }
    }
    for (const stop of stops) this.stopNodes.set(stop.id, this.nearest(stop, 'drive', 120))
  }
  point(id: string): Point {
    const p = this.snapshot.nodes[id]
    return { latitude: p[0], longitude: p[1] }
  }
  nearest(point: Point, mode: 'walk' | 'drive', maximum = 120) {
    let best: string | null = null,
      length = maximum
    for (const id of (mode === 'walk' ? this.walk : this.drive).keys()) {
      const d = distance(point, this.point(id))
      if (d < length) {
        best = id
        length = d
      }
    }
    return best
  }
  stopNode(id: string) {
    return this.stopNodes.get(id) ?? null
  }
  isStreetCandidate(node: string) {
    return this.drive.has(node) && this.walk.has(node)
  }
  walkNode(id: string) {
    const drive = this.stopNode(id)
    return drive && this.walk.has(drive) ? drive : null
  }
  private tree(
    start: string,
    mode: 'walk' | 'drive' | 'walk-reverse',
    speed: number,
    avoidSteps: boolean,
  ) {
    const key = `${mode}:${start}:${speed}:${avoidSteps}`
    const existing = this.trees.get(key)
    if (existing) return existing
    const graph = mode === 'drive' ? this.drive : mode === 'walk' ? this.walk : this.reverseWalk
    const times = new Map<string, number>([[start, 0]]),
      previous = new Map<string, string>()
    const heap = new Heap()
    heap.push([0, start])
    while (heap.values.length) {
      const [cost, node] = heap.pop()
      if (cost !== times.get(node)) continue
      for (const edge of graph.get(node) ?? []) {
        if (avoidSteps && edge.steps) continue
        const next = cost + (mode !== 'drive' ? edge.meters / (speed / 3.6) : edge.seconds)
        if (next < (times.get(edge.to) ?? Infinity)) {
          times.set(edge.to, next)
          previous.set(edge.to, node)
          heap.push([next, edge.to])
        }
      }
    }
    const result = { times, previous }
    if (this.trees.size >= 64) this.trees.delete(this.trees.keys().next().value!)
    this.trees.set(key, result)
    return result
  }
  walkSeconds(from: string, to: string, speed = 4.5, avoidSteps = false) {
    if (!this.walk.has(from) || !this.walk.has(to)) return Infinity
    return this.tree(to, 'walk-reverse', speed, avoidSteps).times.get(from) ?? Infinity
  }
  walkFromStop(from: string, to: string, speed = 4.5, avoidSteps = false) {
    if (!this.walk.has(from) || !this.walk.has(to)) return Infinity
    return this.tree(from, 'walk', speed, avoidSteps).times.get(to) ?? Infinity
  }
  /** Reachable street nodes for synthetic access sampling; no real homes are inferred. */
  accessNodes(stopId: string, minimum: number, maximum: number, speed = 4.5) {
    const node = this.walkNode(stopId)
    if (!node) return []
    return [...this.tree(node, 'walk', speed, true).times]
      .filter(([id, t]) => t >= minimum && t <= maximum && this.drive.has(id))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id]) => id)
  }
  drivePath(fromStop: string, toStop: string): Path | null {
    const key = `${fromStop}:${toStop}`
    if (this.paths.has(key)) return this.paths.get(key)!
    const from = this.stopNode(fromStop),
      to = this.stopNode(toStop)
    if (!from || !to) return null
    const tree = this.tree(from, 'drive', 0, false),
      seconds = tree.times.get(to)
    if (seconds === undefined) {
      this.paths.set(key, null)
      return null
    }
    const nodes = [to]
    while (nodes[0] !== from) nodes.unshift(tree.previous.get(nodes[0])!)
    const coordinates = nodes.map((id) => {
      const p = this.point(id)
      return [p.longitude, p.latitude]
    })
    let meters = 0
    for (let i = 1; i < nodes.length; i++)
      meters += distance(this.point(nodes[i - 1]), this.point(nodes[i]))
    const path = { seconds, meters, coordinates, nodes }
    this.paths.set(key, path)
    return path
  }
}
