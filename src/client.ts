import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'

export const client = generateClient<Schema>()

export type Habilitator = Schema['Habilitator']['type']
export type Relation = Schema['Relation']['type']

// Habilitator.type places the node: the three stacked layers, or the tools column beside them.
// Stored values stay in English; labels are what the UI shows.
export const TYPES = [
  { id: 'application', label: 'Aplicació', band: 'Aplicacions' },
  { id: 'enabler', label: 'Habilitador', band: 'Habilitadors' },
  { id: 'data', label: 'Component de dades', band: 'Components de dades' },
  { id: 'tool', label: 'Eina', band: 'Eines' },
] as const

export const typeLabel = (id: string | null | undefined) => TYPES.find((t) => t.id === id)?.label ?? id ?? ''

// Lifecycle stage; must match the enum on Habilitator.status in amplify/data/resource.ts.
export type Status = NonNullable<Habilitator['status']>
export const STATUSES: { id: Status; label: string }[] = [
  { id: 'conceptualization', label: 'Conceptualització' },
  { id: 'development', label: 'Desenvolupament' },
  { id: 'pre', label: 'PRE' },
  { id: 'pro', label: 'PRO' },
]

export const statusLabel = (id: string) => STATUSES.find((s) => s.id === id)?.label ?? id

// uses: a layer consumes the one below. references: links between data components.
export const RELATION_KINDS = ['uses', 'references']

const KIND_LABELS: Record<string, string> = {
  uses: 'utilitza',
  references: 'referencia',
}

export const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind

// ---------- Standard work process (read-only; seeded from process/*.yaml) ----------

export type Process = Schema['Process']['type']
export type Phase = Schema['Phase']['type']
export type Step = Schema['Step']['type']
export type Gate = Schema['Gate']['type']
export type Transition = Schema['Transition']['type']

export const GATE_LABELS: Record<string, { short: string; long: string }> = {
  dor: { short: 'DoR', long: 'Definition of Ready' },
  dod: { short: 'DoD', long: 'Definition of Done' },
}

export const TRANSITION_LABELS: Record<string, string> = {
  return: 'Retorn',
  loop: 'Cicle',
}
