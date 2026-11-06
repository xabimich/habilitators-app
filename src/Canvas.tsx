import { useMemo, type CSSProperties } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  type BuiltInEdge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import dagre from 'dagre'
import '@xyflow/react/dist/style.css'
import { statusLabel, TYPES, type Habilitator, type Relation } from './client'

const NODE_W = 180
const NODE_H = 64
const GAP_X = 40 // between cards in a row
const PAD = 24 // inside a band
const LABEL_H = 24 // title above the tools column
const GUTTER = 160 // title column on the left of each layer band, kept clear of edges
const ROW_GAP = 90 // between bands, room for edges

// Top to bottom. Anything not in a row goes to the side column.
const ROWS = ['application', 'enabler', 'data'] as const
const SIDE = 'tool'
const layerOf = (h: Habilitator) => {
  const t = h.type ?? ''
  return (ROWS as readonly string[]).includes(t) ? t : SIDE
}
const labelOf = (layer: string) => TYPES.find((t) => t.id === layer)?.band ?? layer

// Salut design system colour tokens (css/main.css).
const KIND_STYLE: Record<string, { stroke: string; dash?: string; arrow: boolean }> = {
  uses: { stroke: 'var(--color-neutral-500)', arrow: true },
  references: { stroke: 'var(--color-primary-500)', dash: '6 4', arrow: true },
}
const OTHER_KIND = { stroke: 'var(--color-neutral-300)', dash: '4 4', arrow: true }

// ---------- nodes ----------

type CardNode = Node<{ habilitator: Habilitator }, 'card'>
type BandNode = Node<{ label: string; layer: string; column: boolean }, 'band'>

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left]

function Card({ data, selected }: NodeProps<CardNode>) {
  const h = data.habilitator
  return (
    <div className={`card layer-${layerOf(h)}${selected ? ' selected' : ''}`}>
      {/* A source and target handle on every side; the layout picks which ones each edge uses. */}
      {SIDES.map((p) => (
        <Handle key={`s-${p}`} id={`s-${p}`} type="source" position={p} />
      ))}
      {SIDES.map((p) => (
        <Handle key={`t-${p}`} id={`t-${p}`} type="target" position={p} />
      ))}
      <span className="dss-body--sm dss-body--semibold" title={h.name}>
        {h.shortName || h.name}
      </span>
      <small className={`status status-${h.status ?? 'none'}`}>{h.status ? statusLabel(h.status) : 'Sense estat'}</small>
    </div>
  )
}

function Band({ data }: NodeProps<BandNode>) {
  return (
    <div className={`band layer-${data.layer}${data.column ? ' band--column' : ''}`}>
      <span className="dss-body--sm dss-body--bold" style={data.column ? undefined : { width: GUTTER }}>
        {data.label}
      </span>
    </div>
  )
}

const nodeTypes = { card: Card, band: Band }

// ---------- layout ----------

type Box = { x: number; y: number }
type Layout = { pos: Map<string, Box>; row: Map<string, number>; bands: BandNode[] }

// Order nodes with dagre so connected nodes end up near each other.
function dagreLayout(habilitators: Habilitator[], edges: [string, string, string][]) {
  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 70 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const h of habilitators) g.setNode(h.id, { width: NODE_W, height: NODE_H })
  for (const [from, to, id] of edges) g.setEdge(from, to, {}, id)
  dagre.layout(g)
  return new Map(habilitators.map((h) => [h.id, g.node(h.id) as Box]))
}

function band(id: string, layer: string, x: number, y: number, width: number, height: number, column = false): BandNode {
  return {
    id: `band-${id}`,
    type: 'band',
    position: { x, y },
    data: { label: labelOf(layer), layer, column },
    style: { width, height },
    selectable: false,
    draggable: false,
    focusable: false,
    zIndex: -1,
  }
}

// Fixed bands per layer; dagre only decides the left-to-right order inside each band.
function layeredLayout(habilitators: Habilitator[], edges: [string, string, string][]): Layout {
  const order = dagreLayout(habilitators, edges)
  const byX = (a: Habilitator, b: Habilitator) => order.get(a.id)!.x - order.get(b.id)!.x
  const rows = ROWS.map((layer) => habilitators.filter((h) => layerOf(h) === layer).sort(byX))
  const side = habilitators.filter((h) => layerOf(h) === SIDE).sort(byX)

  const rowW = (n: number) => Math.max(n, 1) * NODE_W + Math.max(n - 1, 0) * GAP_X
  const contentW = Math.max(...rows.map((r) => rowW(r.length)))
  const bandW = GUTTER + contentW + PAD
  const bandH = NODE_H + 2 * PAD

  const pos = new Map<string, Box>()
  const row = new Map<string, number>()
  const bands: BandNode[] = []

  rows.forEach((items, i) => {
    const y = i * (bandH + ROW_GAP)
    bands.push(band(ROWS[i], ROWS[i], 0, y, bandW, bandH))
    const startX = GUTTER + (contentW - rowW(items.length)) / 2
    items.forEach((h, k) => {
      pos.set(h.id, { x: startX + k * (NODE_W + GAP_X), y: y + PAD })
      row.set(h.id, i)
    })
  })

  if (side.length > 0) {
    const x = bandW + ROW_GAP
    const height = rows.length * bandH + (rows.length - 1) * ROW_GAP
    bands.push(band(SIDE, SIDE, x, 0, NODE_W + 2 * PAD, height, true))
    side.forEach((h, k) => pos.set(h.id, { x: x + PAD, y: LABEL_H + PAD + k * (NODE_H + GAP_X) }))
  }

  return { pos, row, bands }
}

// Pick handles from where the two nodes sit.
function route(a: Box, b: Box, rowA?: number, rowB?: number) {
  if (rowA !== undefined && rowA === rowB) {
    // Same band: loop underneath so the edge doesn't cross the cards in between.
    return { sourceHandle: `s-${Position.Bottom}`, targetHandle: `t-${Position.Bottom}`, type: 'smoothstep' as const }
  }
  if (rowA === undefined || rowB === undefined) {
    // To/from the side column.
    const right = a.x < b.x
    return {
      sourceHandle: `s-${right ? Position.Right : Position.Left}`,
      targetHandle: `t-${right ? Position.Left : Position.Right}`,
      type: 'default' as const,
    }
  }
  const down = a.y < b.y
  return {
    sourceHandle: `s-${down ? Position.Bottom : Position.Top}`,
    targetHandle: `t-${down ? Position.Top : Position.Bottom}`,
    type: 'default' as const,
  }
}

// ---------- component ----------

type Props = {
  habilitators: Habilitator[]
  relations: Relation[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onDeleteRelation: (relation: Relation) => void
}

export default function Canvas({ habilitators, relations, selectedId, onSelect, onDeleteRelation }: Props) {
  const { nodes, edges } = useMemo(() => {
    const ids = new Set(habilitators.map((h) => h.id))
    const visible = relations.filter((r) => ids.has(r.sourceId) && ids.has(r.targetId))

    const layoutEdges = visible.map((r) => [r.sourceId, r.targetId, r.id] as [string, string, string])
    const layout = layeredLayout(habilitators, layoutEdges)

    const cards: CardNode[] = habilitators.map((h) => ({
      id: h.id,
      type: 'card',
      position: layout.pos.get(h.id)!,
      data: { habilitator: h },
      selected: h.id === selectedId,
    }))

    const edges: BuiltInEdge[] = []
    let sameRow = 0
    for (const r of visible) {
      const { sourceId: source, targetId: target } = r
      const s = KIND_STYLE[r.kind] ?? OTHER_KIND
      const handles = route(layout.pos.get(source)!, layout.pos.get(target)!, layout.row.get(source), layout.row.get(target))
      const style: CSSProperties = { stroke: s.stroke, strokeWidth: 1.5, strokeDasharray: s.dash }
      const common = {
        id: r.id,
        source,
        target,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
        data: { relation: r },
        style,
        markerEnd: s.arrow ? { type: MarkerType.ArrowClosed, color: s.stroke } : undefined,
      }
      if (handles.type === 'smoothstep') {
        // Stagger same-band loops so they don't sit on top of each other.
        edges.push({ ...common, type: 'smoothstep', pathOptions: { offset: 16 + 12 * sameRow++ } })
      } else {
        edges.push({ ...common, type: 'default' })
      }
    }

    return {
      nodes: [...layout.bands, ...cards] as Node[],
      edges,
    }
  }, [habilitators, relations, selectedId])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      deleteKeyCode={null}
      fitView
      onNodeClick={(_, node) => node.type === 'card' && onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      onEdgeClick={(_, edge) => onDeleteRelation((edge.data as { relation: Relation }).relation)}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
