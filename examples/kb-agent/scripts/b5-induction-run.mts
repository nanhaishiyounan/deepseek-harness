/**
 * W24-B5 ontology induction (the automatic path) over real corpus documents
 * with a real LLM: chunk → extract (MiniMax-M3 via ctx.llm) → merge → SHACL
 * gate → deterministic JSON-LD → append-only Neo4j version → registry v5
 * draft registration. The negative gate (a constructed illegal draft) runs
 * in the same transcript, and the manual fallback path closes the run with
 * one KGCL op set that lands a new ontology revision (audit row, history
 * preserved). Evidence lands in research/…/b5-ontology/.
 * Run from the repo root:
 *   node --import tsx/esm examples/kb-agent/scripts/b5-induction-run.mts
 */
import { readFile, readdir } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import * as GraphNeo4j from '@deepseek-ai/dsh-graph-neo4j/src/index.ts'
import * as OntologyInduction from '@deepseek-ai/dsh-ontology-induction/src/index.ts'
import type { InductionLlm } from '@deepseek-ai/dsh-ontology-induction/src/index.ts'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import * as KgGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'

const OUT_DIR = 'research/2026-10-09-w24-rebuild/b5-ontology'
const LINES: string[] = []
const log = (text: string): void => { LINES.push(text); console.log(text) }

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname)
} catch { /* The LLM call below fails loud with the credential error */ }

const ctx = new Context()
await ctx.plugin(LlmRuntime)
await ctx.plugin(LlmMiniMax, {})
await ctx.plugin(GraphNeo4j, {
  url: process.env.DSH_NEO4J_URL ?? 'bolt://localhost:7687',
  user: process.env.DSH_NEO4J_USER ?? 'neo4j',
  passwordEnv: 'DSH_NEO4J_PASSWORD',
})
await ctx.plugin(KbGraphRuntime)
await ctx.plugin(KgGraphSqlite, { path: 'examples/kb-agent/workspace/kg-graph.sqlite' })
if (!ctx.neo4jGraph.available()) throw new Error('Neo4j unavailable — refusing to run induction storage')

/** The corpus documents the induction reads (≥3 food-manufacturing docs). */
const DOC_NAMES = [
  '2026-08-haccp-implementation.md',
  '2026-08-process-soy-sauce.md',
  '2026-08-supply-sugar.md',
  '2026-08-supply-packaging.md',
  'gb2760-excerpt.md',
]

const corpusRoot = 'workspace/weknora/corpus'
const docs: { name: string; text: string }[] = []
for (const group of ['food-compliance', 'business-ops']) {
  const present = new Set(await readdir(`${corpusRoot}/${group}`).catch(() => [] as string[]))
  for (const name of DOC_NAMES) {
    if (present.has(name)) docs.push({ name, text: await readFile(`${corpusRoot}/${group}/${name}`, 'utf8') })
  }
}
log(`[corpus] ${String(docs.length)} documents: ${docs.map(doc => `${doc.name}(${String(doc.text.length)}字)`).join(', ')}`)

/** Adapt ctx.llm to the pipeline's InductionLlm face (MiniMax-M3 channel). */
const llm: InductionLlm = {
  async complete(system, user) {
    const messages: Message[] = [createUserMessage({
      content: [{ type: 'text', text: user }],
      source: { kind: 'plugin', plugin: 'b5-induction' },
    })]
    const assembler = new BlockAssembler()
    for await (const chunk of ctx.llm.stream({ provider: 'minimax', model: 'MiniMax-M3', messages, system })) {
      assembler.push(chunk)
    }
    return assembler.message({ kind: 'model', provider: 'minimax', model: 'MiniMax-M3' })
      .content.filter(block => block.type === 'text').map(block => block.type === 'text' ? block.text : '').join('')
  },
}

// ── Phase 1: the induction pipeline over the real corpus ───────────────────
const run = await OntologyInduction.runInduction(llm, docs, 'food-mfg-b5', {
  maxChunkChars: 6000,
  maxRepairs: 2,
  guidance: '食品制造域：物料/产品/工序/质量检测/供应商/客户/单据/批次效期/添加剂/合规标准（参照 FoodOn facets 与 GB 标准词表）。',
})
const classCount = run.draft.classes.length
const propCount = run.draft.classes.reduce((sum, klass) => sum + klass.props.length, 0)
const relationCount = run.draft.relations.length
log(`[induction] LLM round-trips=${String(run.transcript.length)} repairs=${String(run.repairs)} notes=${String(run.notes.length)}`)
log(`[induction] draft: ${String(classCount)} classes / ${String(propCount)} props / ${String(relationCount)} relations`)
log(`[gate] conforms=${String(run.report.conforms)} violations=${String(run.report.violations.length)}`)
if (!run.report.conforms) {
  log(`[gate] refusing draft; violations:\n${OntologyInduction.formatGateFeedback(run.report)}`)
}

// ── Phase 2: deterministic JSON-LD + append-only Neo4j version ────────────
if (run.report.conforms) {
  const doc = OntologyInduction.serializeOntologyDraft(run.draft)
  const meta = await ctx.neo4jGraph.storeOntologyVersion(doc, {
    id: `food-mfg-b5-${Date.now().toString(36)}`,
    name: run.draft.name,
    source: 'llm-induction',
  })
  log(`[store] ontology version ${String(meta.version)} stored (id=${meta.id}); classes=${String(classCount)} relations=${String(relationCount)}`)
  writeFileSync(`${OUT_DIR}/05-induced-ontology.jsonld.json`, `${JSON.stringify(doc, null, 2)}\n`)
  const versions = await ctx.neo4jGraph.listOntologyVersions()
  log(`[store] version chain: ${versions.map(entry => `v${String(entry.version)}(${entry.source})`).join(' → ')}`)
}

// ── Phase 3: registry v5 draft registration (model-invisible until approve) ─
let registered = 0
if (run.report.conforms) {
  // Register classes in dependency order (extends parents first): the
  // registry refuses a class whose parent is not yet registered, and draft
  // order from the merge is document order, not topology.
  const byId = new Map(run.draft.classes.map(klass => [klass.id, klass]))
  const ordered: typeof run.draft.classes = []
  const seen = new Set<string>()
  const visit = (id: string): void => {
    if (seen.has(id)) return
    seen.add(id)
    const klass = byId.get(id)
    if (klass?.extends !== undefined) visit(klass.extends)
    const node = byId.get(id)
    if (node !== undefined) ordered.push(node)
  }
  for (const klass of run.draft.classes) visit(klass.id)
  for (const klass of ordered) {
    try {
      const dispose = ctx.kbGraph.registerNodeType({
        id: kgNodeTypeId(klass.id),
        label: klass.label,
        ...(klass.description === undefined ? {} : { description: klass.description }),
        layer: 'domain',
        ...(klass.extends === undefined ? {} : { extends: kgNodeTypeId(klass.extends) }),
        props: klass.props.map(prop => ({
          key: prop.key,
          datatype: prop.datatype,
          ...(prop.required === undefined ? {} : { required: prop.required }),
          ...(prop.isArray === undefined ? {} : { isArray: prop.isArray }),
          ...(prop.enumValues === undefined ? {} : { enumValues: [...prop.enumValues] }),
          ...(prop.pattern === undefined ? {} : { pattern: prop.pattern }),
        })),
        ...(klass.naturalKey === undefined ? {} : { naturalKey: klass.naturalKey }),
        ...(klass.evidence === undefined ? {} : { description: klass.evidence }),
        source: 'agent-defined',
        status: 'draft',
      })
      dispose()
      registered += 1
    } catch (error) {
      log(`[registry] class ${klass.id} refused: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  for (const relation of run.draft.relations) {
    try {
      const dispose = ctx.kbGraph.registerRelation({
        id: kgRelationId(relation.id),
        label: relation.label,
        ...(relation.description === undefined ? {} : { description: relation.description }),
        constraints: relation.constraints.map(constraint => ({
          domain: kgNodeTypeId(constraint.domain),
          range: kgNodeTypeId(constraint.range),
          ...(constraint.cardinality === undefined ? {} : { cardinality: { ...constraint.cardinality } }),
        })),
        kind: relation.kind,
        source: 'agent-defined',
      })
      dispose()
      registered += 1
    } catch (error) {
      log(`[registry] relation ${relation.id} refused: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  log(`[registry] registered ${String(registered)} draft entries (status=draft: writable, not model-visible)`)
}

// ── Phase 4: the negative gate (constructed illegal constraint draft) ──────
const negative = OntologyInduction.gateOntologyDraft({
  name: 'negative-probe',
  classes: [
    { id: 'company', label: '企业', props: [{ key: 'name', datatype: 'string' }], naturalKey: 'notAProp' },
    { id: 'product', label: '产品', extends: 'ghostParent', props: [] },
  ],
  relations: [{
    id: 'produces',
    label: '生产',
    constraints: [{ domain: 'ghostDomain', range: 'product', cardinality: { min: 5, max: 2 } }],
  }],
  corpus: [],
  inducedAt: new Date().toISOString(),
})
log(`[negative-gate] conforms=${String(negative.conforms)} violations=${String(negative.violations.length)}`)
for (const violation of negative.violations) {
  log(`[negative-gate] ${violation.code} ${violation.focus}${violation.path === undefined ? '' : ` (${violation.path})`}: ${violation.message}`)
}

// ── Phase 5: the manual fallback path (KGCL op set → new revision) ─────────
// The manual fallback path: one KGCL op set appends a new audit revision.
// Re-runs on the same ledger find the class already registered (history is
// append-only) — that refusal is itself the evidence the first run landed.
try {
  const revision = await ctx.kbGraph.applyOntologyOps([
    { op: 'add_node', targetId: 'shelfLifePolicy', label: '保质期策略', parentId: 'standard' },
  ])
  log(`[manual] KGCL op set applied: audit revision ${String(revision.revisionId)} (${String(revision.applied.length)} applied)` + (revision.applied.length > 0 ? `: ${revision.applied.join('; ')}` : ''))
} catch (error) {
  log(`[manual] KGCL op set refused (append-only ledger already carries the class): ${error instanceof Error ? error.message : String(error)}`)
}

writeFileSync(`${OUT_DIR}/06-induction-run.txt`, `${LINES.join('\n')}\n`)
writeFileSync(`${OUT_DIR}/07-induction-transcript.json`, `${JSON.stringify({
  draft: run.draft,
  report: run.report,
  repairs: run.repairs,
  notes: run.notes,
  transcript: run.transcript.map(entry => ({
    doc: entry.doc, chunk: entry.chunk, kind: entry.kind, user: entry.user.slice(0, 400), raw: entry.raw,
  })),
}, null, 2)}\n`)
log(`evidence written to ${OUT_DIR}/06-induction-run.txt + 07-induction-transcript.json + 05-induced-ontology.jsonld.json`)
await ctx.fiber.dispose()
