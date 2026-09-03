/**
 * Relevance-threshold calibration harness for `kb_search` scoring. Runs the
 * same two retrieval paths the seam runs (FTS5 text via `SqliteKbStore`,
 * MiniMax embo-01 vectors) over the 100-question eval set plus a garbage-query
 * probe set, records every RRF fused score with its path membership
 * (dual-path vs single-path), and simulates candidate `minRelevanceScore`
 * thresholds against the eval Top5 baseline. Real key required
 * (MINIMAX_API_KEY); the corpus is re-ingested into a throwaway database.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/calibrate-relevance.mts
 */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import KbRuntime from '@deepseek-ai/dsh-kb'
import { fuseRrf } from '@deepseek-ai/dsh-kb'
import type { KbDocKind } from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import { SqliteKbStore } from '@deepseek-ai/dsh-kb-sqlite'
import { MiniMaxEmbedProvider, DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_DIMENSIONS } from '@deepseek-ai/dsh-kb-embed-minimax'

const exampleRoot = new URL('..', import.meta.url).pathname
const signal = new AbortController().signal

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname)
} catch {
  // No .env: the run fails loud at the first embed call.
}

const ctx = new Context()
const root = await mkdtemp(join(tmpdir(), 'kb-calib-'))

/** Directory name → ingested doc kind; mirrors eval-retrieval.mts. */
const DOC_KIND_BY_DIR: Record<string, KbDocKind> = {
  meetings: 'meeting',
  profiles: 'profile',
  regulations: 'regulation',
  market: 'report',
  process: 'report',
  supply: 'report',
  cost: 'table',
  'food-safety': 'report',
}

/** Garbage / unrelated query probes: RRF-scored like real queries. */
const GARBAGE_PROBES = [
  'qwfpzxcvbnm',
  '锟斤拷烫烫烫屯',
  'zzzzzzzzzzzzz',
  'asdf jkl; qwerty uiop',
  'тест на релевантность',
  '？！……——***',
  'αβγδε ζηθικ λμν',
  '随机乱码测试字符串无意义',
  'foobarbazqux quux corge grault',
  '0912837465 5091827364',
]

/** Candidate `minRelevanceScore` thresholds simulated against the baseline. */
const THRESHOLDS = [0, 0.01, 0.011, 0.012, 0.013, 0.014, 0.015, 0.016, 0.016393443, 0.0164, 0.017, 0.018, 0.019, 0.02, 0.022, 0.025, 0.028, 0.03]

const RRF_K = 60
const TOPK = 32

const sqlite = await import('node:sqlite')

const embed = new MiniMaxEmbedProvider({
  baseURL: process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  dimensions: DEFAULT_DIMENSIONS,
  batchSize: 32,
  timeoutMs: 30_000,
  maxRetries: 3,
  backoffBaseMs: 500,
  backoffMaxMs: 10_000,
  resolveKey: () => process.env.MINIMAX_API_KEY,
  fetch: globalThis.fetch,
  debug: () => {},
})

try {
  await ctx.plugin(KbRuntime)
  await ctx.plugin(KbSqlite, { path: join(root, 'kb.sqlite') })
  // Registered on the seam so ingest embeds chunks; the calibration reads
  // below reuse the same provider instance for query vectors.
  ctx.kb.registerEmbedProvider(embed)

  const dataRoot = join(exampleRoot, 'workspace/data')
  const corpus: Array<{ path: string; docKind: KbDocKind; content: string }> = []
  for (const dir of await readdir(dataRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const docKind = DOC_KIND_BY_DIR[dir.name]
    if (docKind === undefined) continue
    for (const file of (await readdir(join(dataRoot, dir.name))).filter(name => name.endsWith('.md')).sort()) {
      const path = `workspace/data/${dir.name}/${file}`
      corpus.push({ path, docKind, content: await readFile(join(dataRoot, dir.name, file), 'utf8') })
    }
  }
  for (const doc of corpus) {
    await ctx.kb.ingest({ tenantId: 'demo-food-co', sourcePath: doc.path, docKind: doc.docKind, content: doc.content }, signal)
  }
  process.stderr.write(`ingested ${corpus.length} documents\n`)

  // A second read-only connection over the same file: the calibration reads
  // through the same SqliteKbStore the seam resolves, without touching ctx.kb.
  const store = new SqliteKbStore({ path: join(root, 'kb.sqlite'), busyTimeoutMs: 5000 }, sqlite.DatabaseSync)

  const questions = (JSON.parse(await readFile(join(exampleRoot, 'eval/questions.json'), 'utf8')) as {
    questions: Array<{ id: number; category: string; query: string; gold: string }>
  }).questions

  const queries: Array<{ query: string; gold?: string; id?: number; category?: string }> = [
    ...questions.map(question => ({ query: question.query, gold: question.gold, id: question.id, category: question.category })),
    ...GARBAGE_PROBES.map(query => ({ query })),
  ]
  process.stderr.write(`embedding ${queries.length} queries...\n`)
  const vectors = await embed.embed(queries.map(entry => entry.query), signal)

  interface FusedTop {
    score: number
    sourcePath: string
    dual: boolean
  }
  interface Record_ {
    query: string
    id?: number
    category?: string
    gold?: string
    textHits: number
    vectorHits: number
    top: FusedTop[]
    goldInTop5: boolean
    goldScore: number | null
    goldDual: boolean | null
    goldRank: number | null
  }
  const records: Record_[] = []

  for (const [index, entry] of queries.entries()) {
    const vector = vectors[index]
    if (vector === undefined) throw new Error(`missing vector for query ${index}`)
    const textHits = await store.textSearch(entry.query, 'demo-food-co', TOPK, undefined, signal)
    const vectorHits = await store.vectorSearch(vector, 'demo-food-co', TOPK, undefined, signal)
    const textIds = textHits.map(hit => hit.chunkId)
    const vectorIds = vectorHits.map(hit => hit.chunkId)
    const fused = fuseRrf(textIds, vectorIds, RRF_K)
    const textSet = new Set(textIds)
    const vectorSet = new Set(vectorIds)
    const pathById = new Map([...textHits, ...vectorHits].map(hit => [hit.chunkId, hit.sourcePath]))
    const top: FusedTop[] = fused.slice(0, 8).map(fusedEntry => ({
      score: Number(fusedEntry.score.toFixed(6)),
      sourcePath: pathById.get(fusedEntry.id) ?? `chunk-${fusedEntry.id}`,
      dual: textSet.has(fusedEntry.id) && vectorSet.has(fusedEntry.id),
    }))
    const goldRank = entry.gold === undefined
      ? null
      : fused.findIndex(fusedEntry => pathById.get(fusedEntry.id) === entry.gold)
    records.push({
      query: entry.query,
      ...(entry.id === undefined ? {} : { id: entry.id, category: entry.category, gold: entry.gold }),
      textHits: textHits.length,
      vectorHits: vectorHits.length,
      top,
      goldInTop5: goldRank !== null && goldRank >= 0 && goldRank < 5,
      goldScore: goldRank !== null && goldRank >= 0 ? Number((fused[goldRank] as { score: number }).score.toFixed(6)) : null,
      goldDual: goldRank !== null && goldRank >= 0
        ? textSet.has((fused[goldRank] as { id: number }).id) && vectorSet.has((fused[goldRank] as { id: number }).id)
        : null,
      goldRank,
    })
    process.stderr.write(`\r${records.length}/${queries.length} scored`)
  }
  process.stderr.write('\n')

  const questionRecords = records.filter(record => record.gold !== undefined)
  const probeRecords = records.filter(record => record.gold === undefined)

  // Baseline check: the recorded fused Top5 must reproduce the eval baseline
  // (99% hybrid Top5) before any threshold is simulated.
  const baselineHits = questionRecords.filter(record => record.goldInTop5).length

  const simulations = THRESHOLDS.map(threshold => {
    const kept = (record: Record_) => record.top.filter(entry => entry.score >= threshold)
    const top5Hits = questionRecords.filter(record => kept(record).slice(0, 5).some(entry => entry.sourcePath === record.gold)).length
    const emptyProbes = probeRecords.filter(record => kept(record).length === 0).length
    const avgResults = questionRecords.reduce((sum, record) => sum + Math.min(kept(record).length, 5), 0) / questionRecords.length
    return {
      threshold,
      top5HitRate: Number((top5Hits / questionRecords.length * 100).toFixed(1)),
      emptyGarbageProbes: `${emptyProbes}/${probeRecords.length}`,
      avgTop5Results: Number(avgResults.toFixed(2)),
    }
  })

  const summary = {
    rrfK: RRF_K,
    questions: questionRecords.length,
    baselineTop5HitRate: Number((baselineHits / questionRecords.length * 100).toFixed(1)),
    garbageProbes: probeRecords.length,
    scoreBounds: {
      singlePathMax: Number((1 / (RRF_K + 1)).toFixed(6)),
      dualPathMax: Number((2 / (RRF_K + 1)).toFixed(6)),
    },
    garbageProbeTop1Scores: probeRecords.map(record => ({ query: record.query, textHits: record.textHits, top1Score: record.top[0]?.score ?? null, top1Dual: record.top[0]?.dual ?? null })),
    goldSinglePathInTop5: questionRecords.filter(record => record.goldInTop5 && record.goldDual === false).length,
    goldInTop5: questionRecords.filter(record => record.goldInTop5).length,
    minGoldScoreInTop5: Math.min(...questionRecords.filter(record => record.goldScore !== null).map(record => record.goldScore as number)),
    simulations,
  }
  console.log(JSON.stringify(summary, null, 2))
  const outFile = join(exampleRoot, 'eval/calibration-hybrid.json')
  await writeFile(outFile, `${JSON.stringify({ summary, records }, null, 2)}\n`)
  console.log(`details: ${outFile}`)
  store.close()
} finally {
  await ctx.fiber.dispose()
  await rm(root, { recursive: true, force: true })
}
