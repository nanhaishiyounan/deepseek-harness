/**
 * Real-key graph smoke: read the example corpus, ask MiniMax-M3 to extract
 * entity-relation triples (the P2-F scenario pattern — extraction is an
 * agent-driven step, never a built-in LLM call inside the seam), store them
 * through the graph seam, then answer neighbors / paths / search queries.
 * Run from the repo root:
 *   node --import tsx/esm examples/kb-agent/scripts/graph-smoke.mts
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import { KB_GRAPH_ENTITY_TYPES, KB_GRAPH_PREDICATES } from '@deepseek-ai/dsh-kb-graph'
import type { KbGraphTriple } from '@deepseek-ai/dsh-kb-graph'

// The app bin loads the gitignored root .env; a bare tsx run must do the same.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname)
} catch {
  // No .env: the LLM call below fails loud with the credential error.
}

const exampleRoot = new URL('..', import.meta.url).pathname
const ctx = new Context()
const tenant = 'demo-food-co'

/** One raw triple as the extraction prompt asks for (wire-shaped). */
interface RawTriple {
  subject_type: string
  subject_id: string
  predicate: string
  object_type: string
  object_id: string
}

const signal = new AbortController().signal

/** Ask MiniMax-M3 to extract triples from one document's text. */
async function extractTriples(document: string, content: string): Promise<RawTriple[]> {
  const system = [
    '你是实体关系抽取器。从给定文档中抽取最多 8 条实体-关系三元组。',
    `实体类型闭集：${KB_GRAPH_ENTITY_TYPES.join(', ')}。`,
    `关系谓词闭集：${KB_GRAPH_PREDICATES.join(', ')}。`,
    '只输出 JSON 数组，每项形如 {"subject_type":"...","subject_id":"...","predicate":"...","object_type":"...","object_id":"..."}，不要输出其他文字。',
  ].join('')
  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: `文档：${document}\n\n${content.slice(0, 4_000)}` }],
    source: { kind: 'plugin', plugin: 'graph-smoke' },
  })]
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream({ provider: 'minimax', model: 'MiniMax-M3', messages, system })) {
    assembler.push(chunk)
  }
  const text = assembler.message({ kind: 'model', provider: 'minimax', model: 'MiniMax-M3' })
    .content.filter(block => block.type === 'text').map(block => block.type === 'text' ? block.text : '').join('')
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1) return []
  return JSON.parse(text.slice(start, end + 1)) as RawTriple[]
}

try {
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmMiniMax, {})
  await ctx.plugin(KbGraphRuntime)
  await ctx.plugin(KbGraphSqlite, { path: ':memory:' })

  // Extract from three representative corpus documents.
  const documents = [
    'workspace/data/profiles/hongfa-food.md',
    'workspace/data/regulations/gb2760-excerpt.md',
    'workspace/data/supply/2026-08-supply-sugar.md',
  ]
  const triples: KbGraphTriple[] = []
  for (const document of documents) {
    const content = await readFile(join(exampleRoot, document), 'utf8')
    const extracted = await extractTriples(document, content)
    console.log(`== extract ${document}: ${String(extracted.length)} triples ==`)
    for (const raw of extracted) {
      console.log(`  ${raw.subject_type}:${raw.subject_id} —${raw.predicate}→ ${raw.object_type}:${raw.object_id}`)
      triples.push({
        subject: { type: raw.subject_type as KbGraphTriple['subject']['type'], id: raw.subject_id },
        predicate: raw.predicate as KbGraphTriple['predicate'],
        object: { type: raw.object_type as KbGraphTriple['object']['type'], id: raw.object_id },
        sourcePath: document,
      })
    }
  }

  const inserted = await ctx.kbGraph.putTriples(tenant, triples, signal)
  const stats = await ctx.kbGraph.stats(tenant, signal)
  console.log(`\n== stored ${String(inserted)} triples (${String(stats.triples)} rows, ${String(stats.entities)} entities) ==`)

  console.log('\n== kb_graph neighbors: company 宏发食品 ==')
  for (const triple of await ctx.kbGraph.neighbors(tenant, { type: 'company', id: '宏发食品' }, signal)) {
    console.log(`  ${triple.subject.id} —${triple.predicate}→ ${triple.object.id}${triple.sourcePath === undefined ? '' : ` (${triple.sourcePath})`}`)
  }

  console.log('\n== entity search: 酱油 ==')
  for (const entity of await ctx.kbGraph.searchEntities(tenant, '酱油', undefined, 10, signal)) {
    console.log(`  ${entity.type}:${entity.id}`)
  }
} finally {
  await ctx.fiber.dispose()
}
