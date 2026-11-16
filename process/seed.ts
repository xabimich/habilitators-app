// Loads a process YAML into the Process/Phase/Step/Gate/Transition tables of a backend.
//
//   npm run seed:process -- [process/desenvolupament.yaml] [--outputs amplify_outputs.json] [--dry-run]
//
// The GraphQL API is read-only for these models, so this writes straight to DynamoDB through the
// AWS CLI (current credentials). It is idempotent: ids are derived from the YAML keys, unchanged items
// are left alone, changed ones are overwritten and items of this process no longer in the YAML are
// deleted. Other processes and the Habilitator/Relation tables are never touched.
// Runs on Node >= 23.6 (native TypeScript stripping).

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'

// ---------- arguments ----------

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  if (i < 0) return undefined
  const value = args[i + 1]
  args.splice(i, 2)
  return value
}
const dryRun = args.includes('--dry-run')
if (dryRun) args.splice(args.indexOf('--dry-run'), 1)
const outputsPath = flag('--outputs') ?? 'amplify_outputs.json'
const yamlPath = args[0] ?? 'process/desenvolupament.yaml'

// ---------- YAML -> items ----------

type Value = string | number | boolean | null | Value[]
type Item = Record<string, Value>

type StepYaml = {
  key: string
  name: string
  optional?: boolean
  aim?: string | null
  actors?: string[] | null
  referent?: string | null
  deliverables?: string[] | null
  time?: string | null
  // A repeated cycle of sub-steps (e.g. sprints); iterations is how many repetitions the screen shows.
  cycle?: { iterations?: number; steps: StepYaml[] }
}
type GateYaml = { name?: string | null; criteria?: string[] | null }
type ProcessYaml = {
  key: string
  name: string
  description?: string | null
  phases: { key: string; name: string; description?: string | null; gates?: { dor?: GateYaml; dod?: GateYaml }; steps: StepYaml[] }[]
  transitions?: { from: string; to: string; kind: 'return' | 'loop'; label?: string | null }[]
}

function fail(message: string): never {
  console.error(`Error: ${message}`)
  process.exit(1)
}

const KEY = /^[a-z0-9][a-z0-9-]*$/
function checkKey(key: unknown, what: string, seen: Set<string>) {
  if (typeof key !== 'string' || !KEY.test(key)) fail(`${what}: invalid key ${JSON.stringify(key)}`)
  if (seen.has(key)) fail(`${what}: duplicate key "${key}"`)
  seen.add(key)
}
const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((s) => s.trim()) : [])
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

function buildItems(doc: ProcessYaml): Record<string, Item[]> {
  checkKey(doc.key, 'process', new Set())
  if (!doc.name) fail('process: name is required')
  if (!Array.isArray(doc.phases) || doc.phases.length === 0) fail('process: at least one phase is required')

  const pid = doc.key
  const id = (type: string, key: string) => `${pid}:${type}:${key}`
  const items: Record<string, Item[]> = { Process: [], Phase: [], Step: [], Gate: [], Transition: [] }

  items.Process.push({ id: pid, key: pid, name: doc.name, description: text(doc.description) })

  const phaseKeys = new Set<string>()
  const stepKeys = new Set<string>()
  let stepOrder = 0
  doc.phases.forEach((phase, i) => {
    checkKey(phase.key, 'phase', phaseKeys)
    if (!phase.name) fail(`phase ${phase.key}: name is required`)
    const phaseId = id('phase', phase.key)
    items.Phase.push({
      id: phaseId,
      processId: pid,
      key: phase.key,
      name: phase.name,
      order: i + 1,
      description: text(phase.description),
    })

    for (const [kind, gate] of Object.entries(phase.gates ?? {})) {
      if (kind !== 'dor' && kind !== 'dod') fail(`phase ${phase.key}: unknown gate "${kind}" (dor | dod)`)
      if (!gate) continue
      items.Gate.push({
        id: id('gate', `${phase.key}-${kind}`),
        processId: pid,
        phaseId,
        kind,
        name: text(gate.name),
        criteria: list(gate.criteria),
      })
    }

    const addStep = (step: StepYaml, order: number, parent?: StepYaml) => {
      checkKey(step.key, `step in ${phase.key}`, stepKeys)
      if (!step.name) fail(`step ${step.key}: name is required`)
      const cycle = step.cycle
      if (cycle && parent) fail(`step ${step.key}: cycles can't be nested`)
      if (cycle && (!Array.isArray(cycle.steps) || cycle.steps.length === 0)) fail(`step ${step.key}: cycle needs steps`)
      items.Step.push({
        id: id('step', step.key),
        processId: pid,
        phaseId,
        key: step.key,
        name: step.name,
        order,
        optional: step.optional === true,
        parentStepId: parent ? id('step', parent.key) : null,
        iterations: cycle ? (cycle.iterations ?? 3) : null,
        aim: text(step.aim),
        actors: list(step.actors),
        referent: text(step.referent),
        deliverables: list(step.deliverables),
        time: text(step.time),
      })
      cycle?.steps.forEach((sub, j) => addStep(sub, j + 1, step))
    }
    for (const step of phase.steps ?? []) addStep(step, ++stepOrder)
  })

  const transitionKeys = new Set<string>()
  for (const t of doc.transitions ?? []) {
    for (const end of [t.from, t.to]) if (!stepKeys.has(end)) fail(`transition ${t.from} -> ${t.to}: unknown step "${end}"`)
    if (t.kind !== 'return' && t.kind !== 'loop') fail(`transition ${t.from} -> ${t.to}: kind must be return | loop`)
    checkKey(`${t.from}--${t.to}`, 'transition', transitionKeys)
    items.Transition.push({
      id: id('transition', `${t.from}--${t.to}`),
      processId: pid,
      fromStepId: id('step', t.from),
      toStepId: id('step', t.to),
      kind: t.kind,
      label: text(t.label),
    })
  }
  return items
}

// ---------- DynamoDB through the AWS CLI ----------

type Attr = { S?: string; N?: string; BOOL?: boolean; NULL?: boolean; L?: Attr[] }

const marshal = (v: Value): Attr =>
  v === null
    ? { NULL: true }
    : Array.isArray(v)
      ? { L: v.map(marshal) }
      : typeof v === 'number'
        ? { N: String(v) }
        : typeof v === 'boolean'
          ? { BOOL: v }
          : { S: v }

const unmarshal = (a: Attr): Value =>
  a.S !== undefined ? a.S : a.N !== undefined ? Number(a.N) : a.BOOL !== undefined ? a.BOOL : a.L ? a.L.map(unmarshal) : null

const outputs = JSON.parse(readFileSync(outputsPath, 'utf8'))
const region: string = outputs.data?.aws_region ?? fail(`${outputsPath}: no data.aws_region`)
const apiUrl: string = outputs.data?.url ?? fail(`${outputsPath}: no data.url`)

function aws(...cmd: string[]) {
  const out = execFileSync('aws', [...cmd, '--region', region, '--output', 'json'], { encoding: 'utf8', maxBuffer: 64 << 20 })
  return out.trim() ? JSON.parse(out) : {}
}

// Amplify names model tables <Model>-<apiId>-NONE.
const apis: { apiId: string; uris?: { GRAPHQL?: string } }[] = aws('appsync', 'list-graphql-apis').graphqlApis
const apiId = apis.find((a) => a.uris?.GRAPHQL === apiUrl)?.apiId ?? fail(`no AppSync API with url ${apiUrl} in ${region}`)
const table = (model: string) => `${model}-${apiId}-NONE`

function scan(model: string): Item[] {
  const res = aws('dynamodb', 'scan', '--table-name', table(model))
  return (res.Items as Record<string, Attr>[]).map((raw) =>
    Object.fromEntries(Object.entries(raw).map(([k, a]) => [k, unmarshal(a)])),
  )
}

// Compare only our fields; Amplify bookkeeping and timestamps are ignored.
const SYSTEM = new Set(['__typename', 'createdAt', 'updatedAt', 'owner'])
const canonical = (item: Item) =>
  JSON.stringify(
    Object.keys(item)
      .filter((k) => !SYSTEM.has(k) && item[k] !== null && item[k] !== undefined)
      .sort()
      .map((k) => [k, item[k]]),
  )

const dir = mkdtempSync(join(tmpdir(), 'process-seed-'))
function batchWrite(model: string, requests: object[]) {
  for (let i = 0; i < requests.length; i += 25) {
    let pending: object = { [table(model)]: requests.slice(i, i + 25) }
    for (let attempt = 0; Object.keys(pending).length > 0; attempt++) {
      if (attempt > 5) fail(`${model}: items still unprocessed after retries`)
      const file = join(dir, 'batch.json')
      writeFileSync(file, JSON.stringify(pending))
      pending = aws('dynamodb', 'batch-write-item', '--request-items', `file://${file}`).UnprocessedItems ?? {}
    }
  }
}

// ---------- run ----------

const doc = parse(readFileSync(yamlPath, 'utf8')) as ProcessYaml
const desired = buildItems(doc)
const now = new Date().toISOString()
console.log(`Process "${doc.key}" -> API ${apiId} (${region})${dryRun ? ' [dry run]' : ''}`)

for (const [model, items] of Object.entries(desired)) {
  const existing = scan(model).filter((it) => (model === 'Process' ? it.id === doc.key : it.processId === doc.key))
  const byId = new Map(existing.map((it) => [it.id as string, it]))
  const wanted = new Set(items.map((it) => it.id as string))

  const puts: object[] = []
  let created = 0
  let updated = 0
  for (const item of items) {
    const old = byId.get(item.id as string)
    if (old && canonical(old) === canonical(item)) continue
    if (old) updated++
    else created++
    const full: Item = {
      ...Object.fromEntries(Object.entries(item).filter(([, v]) => v !== null)),
      __typename: model,
      createdAt: (old?.createdAt as string) ?? now,
      updatedAt: now,
    }
    puts.push({ PutRequest: { Item: Object.fromEntries(Object.entries(full).map(([k, v]) => [k, marshal(v)])) } })
  }
  const deletes = existing
    .filter((it) => !wanted.has(it.id as string))
    .map((it) => ({ DeleteRequest: { Key: { id: { S: it.id as string } } } }))

  if (!dryRun) batchWrite(model, [...puts, ...deletes])
  const unchanged = items.length - created - updated
  console.log(`  ${model.padEnd(10)} ${created} created, ${updated} updated, ${deletes.length} deleted, ${unchanged} unchanged`)
}
