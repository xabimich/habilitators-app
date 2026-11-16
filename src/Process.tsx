// "Procés de treball": the standard process, one row per phase (stacked), each row a CSS Grid of
// steps with its DoR/DoD gates at the ends. A step with sub-steps (e.g. sprints) is drawn as a cycle
// repeated `iterations` times. An SVG layer on top draws every arrow from the measured element boxes.
// Read-only: the data is seeded from process/*.yaml.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { client, GATE_LABELS, type Gate, type Phase, type Process as ProcessT, type Step, type Transition } from './client'
import { Badge, Select } from './dss'
import { showToast } from './toast'
import StepPanel, { type Selection } from './StepPanel'

type Data = { processes: ProcessT[]; phases: Phase[]; steps: Step[]; gates: Gate[]; transitions: Transition[] }
type Col = { kind: 'step'; step: Step; children: Step[] } | { kind: 'gate'; gate: Gate }
type Box = { left: number; right: number; top: number; bottom: number }
type Pt = [number, number]

const GATE_WIDTH = 32
const GAP = 14 // between columns
const SIDE = 20 // left/right padding of the strip; the arrow between phases runs in the left one
const MIN_STEP = 112
const MAX_STEP = 168
const LANE = 22 // vertical distance between nested return arrows
const R = 8 // corner radius

async function loadAll(): Promise<Data> {
  // Small dataset: everything in one go.
  const opts = { limit: 1000 }
  const res = await Promise.all([
    client.models.Process.list(opts),
    client.models.Phase.list(opts),
    client.models.Step.list(opts),
    client.models.Gate.list(opts),
    client.models.Transition.list(opts),
  ])
  const errors = res.flatMap((r) => r.errors ?? [])
  if (errors.length) throw new Error(errors.map((e) => e.message).join(', '))
  const [processes, phases, steps, gates, transitions] = res.map((r) => r.data)
  return { processes, phases, steps, gates, transitions } as Data
}

// Orthogonal polyline with rounded corners.
function path(pts: Pt[]) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1]
    const [x, y] = pts[i]
    const [x2, y2] = pts[i + 1]
    const r = Math.min(R, Math.hypot(x - x0, y - y0) / 2, Math.hypot(x2 - x, y2 - y) / 2)
    d += ` L ${x - Math.sign(x - x0) * r} ${y - Math.sign(y - y0) * r} Q ${x} ${y} ${x + Math.sign(x2 - x) * r} ${y + Math.sign(y2 - y) * r}`
  }
  const [lx, ly] = pts[pts.length - 1]
  return `${d} L ${lx} ${ly}`
}

const midY = (b: Box) => (b.top + b.bottom) / 2
const midX = (b: Box) => (b.left + b.right) / 2

export default function ProcessView() {
  const [data, setData] = useState<Data | null>(null)
  const [processId, setProcessId] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)

  useEffect(() => {
    loadAll().then(
      (d) => {
        d.processes.sort((a, b) => a.name.localeCompare(b.name))
        setData(d)
        setProcessId((id) => id || d.processes[0]?.id || '')
      },
      (e: Error) => {
        showToast(e.message, 'error')
        setData({ processes: [], phases: [], steps: [], gates: [], transitions: [] })
      },
    )
  }, [])

  // Everything for the selected process, in display order.
  const view = useMemo(() => {
    if (!data) return null
    const phases = data.phases.filter((p) => p.processId === processId).sort((a, b) => a.order - b.order)
    const all = data.steps.filter((s) => s.processId === processId)
    const steps = all.filter((s) => !s.parentStepId).sort((a, b) => a.order - b.order) // top level
    const childrenOf = (id: string) => all.filter((s) => s.parentStepId === id).sort((a, b) => a.order - b.order)
    const gates = data.gates.filter((g) => g.processId === processId)
    const transitions = data.transitions.filter((t) => t.processId === processId)

    const rows = phases.map((phase) => {
      const gate = (kind: string) => gates.find((g) => g.phaseId === phase.id && g.kind === kind)
      const dor = gate('dor')
      const dod = gate('dod')
      const phaseSteps = steps.filter((s) => s.phaseId === phase.id)
      const cols: Col[] = [
        ...(dor ? [{ kind: 'gate' as const, gate: dor }] : []),
        ...phaseSteps.map((step) => ({ kind: 'step' as const, step, children: childrenOf(step.id) })),
        ...(dod ? [{ kind: 'gate' as const, gate: dod }] : []),
      ]

      // Returns inside the row run in lanes under it: shorter spans closer to the cards,
      // overlapping spans on different lanes.
      const colOf = new Map(cols.flatMap((c, i) => (c.kind === 'step' ? [[c.step.id, i] as const] : [])))
      const backs = transitions
        .filter((t) => colOf.has(t.fromStepId) && colOf.has(t.toStepId))
        .map((t) => {
          const a = colOf.get(t.fromStepId)!
          const b = colOf.get(t.toStepId)!
          return { t, lo: Math.min(a, b), hi: Math.max(a, b), lane: 0 }
        })
        .sort((x, y) => x.hi - x.lo - (y.hi - y.lo))
      const lanes: { lo: number; hi: number }[][] = []
      for (const b of backs) {
        let lane = lanes.findIndex((l) => l.every((o) => b.hi < o.lo || b.lo > o.hi))
        if (lane < 0) lane = lanes.push([]) - 1
        lanes[lane].push(b)
        b.lane = lane
      }
      return { phase, cols, steps: phaseSteps, backs, laneCount: lanes.length }
    })

    // Transitions between rows (e.g. backlog -> increments) run in the gap between the rows.
    const phaseOf = new Map(steps.map((s) => [s.id, phases.findIndex((p) => p.id === s.phaseId)]))
    const crossing = transitions.filter(
      (t) => phaseOf.has(t.fromStepId) && phaseOf.has(t.toStepId) && phaseOf.get(t.fromStepId) !== phaseOf.get(t.toStepId),
    )

    return { phases, steps, all, rows, crossing, phaseOf, transitions }
  }, [data, processId])

  // Where the next repetition of a cycle picks up: the target of a transition from its last sub-step
  // (e.g. acceptance -> sprint), otherwise its first sub-step.
  const resumeIndex = (children: Step[]) => {
    const last = children.at(-1)
    const t = view?.transitions.find((x) => x.fromStepId === last?.id && children.some((c) => c.id === x.toStepId))
    return Math.max(0, children.findIndex((c) => c.id === t?.toStepId))
  }

  // ---------- step width: fit the widest row on screen when possible ----------

  const scrollRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setAvailable(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [view])

  const stepWidth = useMemo(() => {
    if (!view || !available) return MIN_STEP
    const fits = view.rows.map(({ cols }) => {
      const gates = cols.filter((c) => c.kind === 'gate').length
      const cycles = cols.filter((c) => c.kind === 'step' && c.children.length).length
      const units = cols.length - gates + cycles // a cycle is two steps wide
      const fixed = 2 * SIDE + gates * GATE_WIDTH + (cols.length - 1 + cycles) * GAP
      return units ? (available - fixed) / units : MAX_STEP
    })
    return Math.floor(Math.max(MIN_STEP, Math.min(MAX_STEP, ...fits)))
  }, [view, available])

  // ---------- measure elements for the SVG layer ----------

  const flowRef = useRef<HTMLDivElement>(null)
  const els = useRef(new Map<string, HTMLElement>())
  const reg = (key: string) => (el: HTMLElement | null) => {
    if (el) els.current.set(key, el)
    else els.current.delete(key)
  }
  const [boxes, setBoxes] = useState<Map<string, Box>>(new Map())
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const flow = flowRef.current
    if (!flow) return
    const measure = () => {
      const f = flow.getBoundingClientRect()
      const next = new Map<string, Box>()
      for (const [key, el] of els.current) {
        const r = el.getBoundingClientRect()
        next.set(key, { left: r.left - f.left, right: r.right - f.left, top: r.top - f.top, bottom: r.bottom - f.top })
      }
      setBoxes(next)
      setSize({ width: flow.scrollWidth, height: flow.scrollHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(flow)
    return () => ro.disconnect()
  }, [view, stepWidth])

  if (!data || !view) {
    return (
      <div className="empty">
        <dss-spinner />
      </div>
    )
  }
  if (view.steps.length === 0) {
    return (
      <div className="empty">
        <p className="dss-subtitle--lg">Encara no hi ha cap procés</p>
        <p className="dss-body--md">
          Carrega'l amb <code>npm run seed:process</code>.
        </p>
      </div>
    )
  }

  const process = data.processes.find((p) => p.id === processId)
  const stepNumber = new Map(view.steps.map((s, i) => [s.id, i + 1]))
  const colWidth = (c: Col) =>
    c.kind === 'gate' ? GATE_WIDTH : c.children.length ? 2 * stepWidth + GAP : stepWidth
  const selectedId = selection?.kind === 'step' ? selection.step.id : selection?.gate.id

  // ---------- arrows ----------

  const forward: string[] = []
  const bypass: string[] = []
  const cycle: string[] = []
  const backs: { key: string; kind: string; d: string; label?: string | null; at: Pt }[] = []

  // Several return ends on one card (inside a row or from another row) are spread apart.
  const ends = new Map<string, number>()
  const slots = new Map<string, number>()
  const count = (id: string) => ends.set(id, (ends.get(id) ?? 0) + 1)
  for (const row of view.rows) for (const { t } of row.backs) [t.fromStepId, t.toStepId].forEach(count)
  for (const t of view.crossing) count(t.toStepId)
  const endX = (id: string, box: Box) => {
    const n = ends.get(id) ?? 1
    const k = slots.get(id) ?? 0
    slots.set(id, k + 1)
    return midX(box) + (k - (n - 1) / 2) * 16
  }

  view.rows.forEach((row, r) => {
    const rowBoxes = row.steps.map((s) => boxes.get(s.id))
    // Forward flow inside the row; an optional step can be skipped (arc above it).
    row.steps.forEach((s, i) => {
      const a = rowBoxes[i]
      const b = rowBoxes[i + 1]
      if (a && b) forward.push(path([[a.right, midY(a)], [b.left - 1, midY(a)]]))
      const prev = rowBoxes[i - 1]
      if (s.optional && prev && b) {
        const y = Math.min(prev.top, b.top) - 16
        bypass.push(path([[midX(prev), prev.top], [midX(prev), y], [midX(b), y], [midX(b), b.top - 1]]))
      }
    })

    // Into the next row: out past the last column, down into the gap, back to the left margin, in.
    const nextRow = view.rows[r + 1]
    const last = row.steps.at(-1)
    const first = nextRow?.steps[0]
    const a = last && boxes.get(last.id)
    const b = first && boxes.get(first.id)
    const lastCol = row.cols.at(-1)
    const end = lastCol && boxes.get(lastCol.kind === 'gate' ? lastCol.gate.id : lastCol.step.id)
    const block = boxes.get(`phase:${row.phase.id}`)
    if (a && b && end && block) {
      const gapY = block.bottom + 12
      forward.push(
        path([[a.right, midY(a)], [end.right + 10, midY(a)], [end.right + 10, gapY], [SIDE / 2, gapY], [SIDE / 2, midY(b)], [b.left - 1, midY(b)]]),
      )
    }

    // Sub-step cycles: along each repetition, then wrap to where the next one picks up; the last
    // repetition wraps to the "× n" marker under that column.
    for (const col of row.cols) {
      if (col.kind !== 'step' || !col.children.length) continue
      const n = col.step.iterations ?? 1
      const resume = col.children[resumeIndex(col.children)]
      for (let it = 0; it < n; it++) {
        const chips = col.children.map((c) => boxes.get(`${c.id}@${it}`))
        chips.forEach((c, j) => {
          const d = chips[j + 1]
          if (c && d) cycle.push(path([[c.right, midY(c)], [d.left - 1, midY(c)]]))
        })
        const tail = chips.at(-1)
        const head = boxes.get(it + 1 < n ? `${resume.id}@${it + 1}` : `more:${col.step.id}`)
        if (tail && head) {
          const y = (tail.bottom + head.top) / 2
          const x2 = midX(head)
          backs.push({
            key: `wrap:${col.step.id}:${it}`,
            kind: 'loop',
            d: path([[midX(tail), tail.bottom], [midX(tail), y], [x2, y], [x2, head.top - 1]]),
            at: [0, 0],
          })
        }
      }
    }

    // Returns inside the row, in lanes under it.
    const cardsBottom = Math.max(0, ...rowBoxes.map((x) => x?.bottom ?? 0))
    for (const { t, lane } of row.backs) {
      const from = boxes.get(t.fromStepId)
      const to = boxes.get(t.toStepId)
      if (!from || !to) continue
      const x1 = endX(t.fromStepId, from)
      const x2 = endX(t.toStepId, to)
      const y = cardsBottom + 18 + lane * LANE
      backs.push({
        key: t.id,
        kind: t.kind ?? 'return',
        d: path([[x1, from.bottom], [x1, y], [x2, y], [x2, to.bottom + 1]]),
        label: t.label,
        at: [(x1 + x2) / 2, y],
      })
    }
  })

  // Between rows: leave the source sideways, run along the gap above the lower row, enter the target.
  for (const t of view.crossing) {
    const from = boxes.get(t.fromStepId)
    const to = boxes.get(t.toStepId)
    const up = view.phaseOf.get(t.fromStepId)! > view.phaseOf.get(t.toStepId)!
    const lower = view.phases[Math.max(view.phaseOf.get(t.fromStepId)!, view.phaseOf.get(t.toStepId)!)]
    const block = boxes.get(`phase:${lower.id}`)
    const source = boxes.get(`phase:${view.phases[view.phaseOf.get(t.fromStepId)!].id}`)
    if (!from || !to || !block || !source) continue
    const y = block.top - 12
    // Going up: leave past the right edge of the source row so the line doesn't cross its header.
    const x1 = Math.max(from.right + GAP / 2, source.right + 10)
    const x2 = endX(t.toStepId, to)
    const pts: Pt[] = up
      ? [[from.right, midY(from)], [x1, midY(from)], [x1, y], [x2, y], [x2, to.bottom + 1]]
      : [[midX(from), from.bottom], [midX(from), y], [x2, y], [x2, to.top - 1]]
    backs.push({ key: t.id, kind: t.kind ?? 'return', d: path(pts), label: t.label, at: [(x1 + x2) / 2, y] })
  }

  return (
    <div className="process">
      {data.processes.length > 1 && (
        <div className="process-picker">
          <Select
            label="Procés"
            size="sm"
            value={processId}
            options={data.processes.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(id) => {
              if (id) setProcessId(id)
              setSelection(null)
            }}
          />
        </div>
      )}
      {process?.description && <p className="process-description dss-body--md">{process.description}</p>}

      <div ref={scrollRef} className="process-scroll">
        <div ref={flowRef} className="process-flow" style={{ padding: `0 ${SIDE}px` }}>
          {view.rows.map((row, r) => {
            const hasOptional = row.steps.some((s) => s.optional)
            return (
              <section key={row.phase.id} ref={reg(`phase:${row.phase.id}`)} className={`phase-block phase-${r % 3}`}>
                <div className="phase-header">
                  <span className="dss-subtitle--md">{row.phase.name}</span>
                  <small>{row.steps.length === 1 ? '1 pas' : `${row.steps.length} passos`}</small>
                </div>
                <div
                  className="phase-row"
                  style={{
                    gridTemplateColumns: row.cols.map((c) => `${colWidth(c)}px`).join(' '),
                    columnGap: GAP,
                    marginTop: hasOptional ? 28 : 12,
                  }}
                >
                  {row.cols.map((col) => {
                    if (col.kind === 'gate') {
                      const g = col.gate
                      const label = GATE_LABELS[g.kind ?? '']
                      return (
                        <button
                          key={g.id}
                          ref={reg(g.id)}
                          type="button"
                          className={`gate${selectedId === g.id ? ' selected' : ''}`}
                          title={`${label?.long ?? g.kind}${g.name ? `: ${g.name}` : ''}`}
                          onClick={() => setSelection({ kind: 'gate', gate: g })}
                        >
                          <strong>{label?.short ?? g.kind}</strong>
                          <span>{g.name ?? label?.long}</span>
                        </button>
                      )
                    }
                    const s = col.step
                    const head = (
                      <span className="step-head">
                        <span className="step-number">{stepNumber.get(s.id)}</span>
                        {s.optional && <Badge label="Opcional" status="neutral" />}
                      </span>
                    )
                    if (col.children.length) {
                      return (
                        <div key={s.id} ref={reg(s.id)} className={`step step--cycle${selectedId === s.id ? ' selected' : ''}`}>
                          <button type="button" className="cycle-title" onClick={() => setSelection({ kind: 'step', step: s })}>
                            {head}
                            <span className="step-name">{s.name}</span>
                          </button>
                          {Array.from({ length: s.iterations ?? 1 }, (_, it) => (
                            <div key={it} className="cycle-row" style={{ gridTemplateColumns: `20px repeat(${col.children.length}, 1fr)` }}>
                              <span className="cycle-iteration">S{it + 1}</span>
                              {col.children.map((c) => (
                                <button
                                  key={c.id}
                                  ref={reg(`${c.id}@${it}`)}
                                  type="button"
                                  className={`cycle-step${selectedId === c.id ? ' selected' : ''}`}
                                  onClick={() => setSelection({ kind: 'step', step: c })}
                                >
                                  {c.name}
                                </button>
                              ))}
                            </div>
                          ))}
                          <div className="cycle-row" style={{ gridTemplateColumns: `20px repeat(${col.children.length}, 1fr)` }}>
                            <span className="cycle-iteration">…</span>
                            <span
                              ref={reg(`more:${s.id}`)}
                              className="cycle-more"
                              style={{ gridColumn: resumeIndex(col.children) + 2 }}
                              title="Es poden afegir tants sprints com calgui"
                            >
                              × n
                            </span>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <button
                        key={s.id}
                        ref={reg(s.id)}
                        type="button"
                        className={`step${s.optional ? ' optional' : ''}${selectedId === s.id ? ' selected' : ''}`}
                        onClick={() => setSelection({ kind: 'step', step: s })}
                      >
                        {head}
                        <span className="step-name">{s.name}</span>
                        {s.aim && <span className="step-aim">{s.aim}</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="phase-lanes" style={{ height: row.laneCount ? 16 + row.laneCount * LANE : 8 }} />
              </section>
            )
          })}

          <svg className="process-arrows" width={size.width} height={size.height} aria-hidden="true">
            <defs>
              {['forward', 'return', 'loop'].map((k) => (
                <marker
                  key={k}
                  id={`arrow-${k}`}
                  className={`marker-${k}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              ))}
            </defs>
            {forward.map((d) => (
              <path key={d} d={d} className="arrow arrow-forward" markerEnd="url(#arrow-forward)" />
            ))}
            {bypass.map((d) => (
              <path key={d} d={d} className="arrow arrow-bypass" markerEnd="url(#arrow-forward)" />
            ))}
            {cycle.map((d) => (
              <path key={d} d={d} className="arrow arrow-forward" markerEnd="url(#arrow-forward)" />
            ))}
            {backs.map(({ key, kind, d, label, at }) => (
              <g key={key}>
                <path d={d} className={`arrow arrow-${kind}`} markerEnd={`url(#arrow-${kind})`} />
                {label && (
                  <text x={at[0]} y={at[1]} className={`arrow-label arrow-label-${kind}`}>
                    {label}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div className="process-legend">
        <span className="legend-forward">Flux</span>
        {bypass.length > 0 && <span className="legend-bypass">Pas opcional</span>}
        <span className="legend-return">Retorn</span>
        <span className="legend-loop">Cicle</span>
      </div>

      {selection && (
        <StepPanel
          selection={selection}
          phases={view.phases}
          steps={view.all}
          transitions={view.transitions}
          onSelectStep={(step) => setSelection({ kind: 'step', step })}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  )
}
