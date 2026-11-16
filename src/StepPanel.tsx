// Read-only side panel for a process step (aim, actors, referent, deliverables, time, transitions)
// or a gate (DoR/DoD criteria).
import type { ReactNode } from 'react'
import { GATE_LABELS, TRANSITION_LABELS, type Gate, type Phase, type Step, type Transition } from './client'
import { Badge, Chip, Drawer, Link } from './dss'

export type Selection = { kind: 'step'; step: Step } | { kind: 'gate'; gate: Gate }

type Props = {
  selection: Selection
  phases: Phase[]
  steps: Step[] // all steps of the process, including sub-steps of cycles
  transitions: Transition[]
  onSelectStep: (step: Step) => void
  onClose: () => void
}

const items = (xs: (string | null)[] | null | undefined) => (xs ?? []).filter((x): x is string => !!x)

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <p className="dss-subtitle--sm">{label}</p>
      {children}
    </section>
  )
}

const Pending = () => <p className="pending dss-body--md">Pendent de definir</p>

function TextField({ label, value }: { label: string; value: string | null | undefined }) {
  return <Field label={label}>{value ? <p className="dss-body--md">{value}</p> : <Pending />}</Field>
}

function ListField({ label, values, chips }: { label: string; values: string[]; chips?: boolean }) {
  return (
    <Field label={label}>
      {values.length === 0 ? (
        <Pending />
      ) : chips ? (
        <div className="chips">
          {values.map((v) => (
            <Chip key={v} label={v} />
          ))}
        </div>
      ) : (
        <ul className="dss-body--md">
          {values.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      )}
    </Field>
  )
}

export default function StepPanel({ selection, phases, steps, transitions, onSelectStep, onClose }: Props) {
  const phaseName = (id: string) => phases.find((p) => p.id === id)?.name ?? ''

  if (selection.kind === 'gate') {
    const g = selection.gate
    const label = GATE_LABELS[g.kind ?? '']
    const phase = phaseName(g.phaseId)
    return (
      <Drawer open title={g.name ?? label?.long ?? 'Porta'} onClose={onClose}>
        <div className="form">
          <div className="row">
            <Badge label={label?.short ?? g.kind ?? ''} status={g.kind === 'dod' ? 'ideal' : 'info'} />
            <span className="dss-body--md">
              {g.kind === 'dor' ? 'Entrada a' : 'Sortida de'} la fase <strong>{phase}</strong>
            </span>
          </div>
          <TextField label="Tipus" value={label?.long} />
          <ListField label="Criteris" values={items(g.criteria)} />
        </div>
      </Drawer>
    )
  }

  const s = selection.step
  const byId = new Map(steps.map((x) => [x.id, x]))
  const childrenOf = (id: string) => steps.filter((x) => x.parentStepId === id).sort((a, b) => a.order - b.order)
  const topLevel = steps.filter((x) => !x.parentStepId).sort((a, b) => a.order - b.order)
  const parent = s.parentStepId ? byId.get(s.parentStepId) : undefined
  // A sub-step moves within its cycle; the last one starts the cycle again.
  const siblings = parent ? childrenOf(parent.id) : topLevel
  const index = siblings.findIndex((x) => x.id === s.id)
  const prev = siblings[index - 1]
  const next = siblings[index + 1]
  // The last sub-step starts the next repetition: where a transition says, otherwise at the first one.
  const restart = parent && !next && !transitions.some((t) => t.fromStepId === s.id) ? siblings[0] : undefined
  const children = childrenOf(s.id)
  const number = parent ? `${topLevel.indexOf(parent) + 1}.${index + 1}` : `${index + 1}`
  const links = [
    ...(parent ? [{ key: 'parent', label: 'Forma part de', step: parent }] : []),
    ...(prev ? [{ key: 'prev', label: 'Pas anterior', step: prev }] : []),
    ...(next ? [{ key: 'next', label: 'Pas següent', step: next }] : []),
    ...(restart ? [{ key: 'restart', label: 'Torna a començar', step: restart }] : []),
    ...transitions
      .filter((t) => t.fromStepId === s.id && byId.has(t.toStepId))
      .map((t) => ({
        key: t.id,
        label: `${TRANSITION_LABELS[t.kind ?? ''] ?? t.kind} cap a${t.label ? ` (${t.label})` : ''}`,
        step: byId.get(t.toStepId)!,
      })),
    ...transitions
      .filter((t) => t.toStepId === s.id && byId.has(t.fromStepId))
      .map((t) => ({
        key: `${t.id}-in`,
        label: `${TRANSITION_LABELS[t.kind ?? ''] ?? t.kind} des de${t.label ? ` (${t.label})` : ''}`,
        step: byId.get(t.fromStepId)!,
      })),
  ]

  return (
    <Drawer open title={s.name} onClose={onClose}>
      <div className="form">
        <div className="row">
          <Badge label={`Pas ${number}`} status="info" />
          <span className="dss-body--md">
            Fase <strong>{phaseName(s.phaseId)}</strong>
          </span>
          {s.optional && <Badge label="Opcional" status="neutral" />}
        </div>
        <TextField label="Objectiu" value={s.aim} />
        {children.length > 0 && (
          <Field label={`Cicle (es mostren ${s.iterations ?? 1} repeticions, se n'hi poden afegir més)`}>
            <ol className="dss-body--md">
              {children.map((c) => (
                <li key={c.id}>
                  <Link label={c.name} onClick={() => onSelectStep(c)} />
                </li>
              ))}
            </ol>
          </Field>
        )}
        <ListField label="Actors" values={items(s.actors)} chips />
        <TextField label="Referent" value={s.referent} />
        <ListField label="Lliurables" values={items(s.deliverables)} />
        <TextField label="Temps" value={s.time} />
        <Field label="Transicions">
          <ul className="transitions dss-body--md">
            {links.map((l) => (
              <li key={l.key}>
                <span>{l.label}:</span> <Link label={l.step.name} onClick={() => onSelectStep(l.step)} />
              </li>
            ))}
          </ul>
        </Field>
      </div>
    </Drawer>
  )
}
