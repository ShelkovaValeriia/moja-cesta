import type { MapDataset } from '../modules/transport-map'
import type { JourneyQuery } from './journeys'
import type { Journey, PlanResult, Scenario, Strategy } from './types'
export interface Bundle {
  scenario: Scenario
  results: Record<Strategy, PlanResult>
  datasets: Record<Strategy, MapDataset>
}
export type WorkerRequest =
  | { type: 'plan'; job: number; kind: 'coordinated' | 'pressure'; seed: number; input?: unknown }
  | { type: 'journeys'; job: number; strategy: Strategy; query: JourneyQuery }
export type WorkerResponse =
  | { type: 'progress'; job: number; message: string }
  | { type: 'result'; job: number; bundle: Bundle }
  | { type: 'journeys'; job: number; journeys: Journey[]; dataset: MapDataset }
  | { type: 'error'; job: number; message: string }
