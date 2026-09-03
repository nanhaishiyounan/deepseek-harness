/**
 * Retrieval-quality evaluation harness over the 100-question set
 * (../eval/questions.json). Two metrics, both re-runnable:
 *
 * 1. Top5 hit rate — for each question, whether the gold document appears in
 *    the top-5 `kb_search` hits. Keyless by default (text-only degraded mode);
 *    set DSH_EVAL_HYBRID=1 with a real MINIMAX_API_KEY to run hybrid mode.
 *
 * 2. Citation validity rate (--answers, real key only) — for each question,
 *    retrieve top-5, hand the numbered passages to MiniMax-M3 with the
 *    enterprise-data-assistant persona rules, then check the answer's [n]
 *    citations. A question passes when at least one [n] citation resolves to
 *    the gold document (the citation must point at retrieved material — a
 *    number outside 1..5 is invalid).
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/eval-retrieval.mts            # text mode
 *   DSH_EVAL_HYBRID=1 node --import tsx/esm examples/kb-agent/scripts/eval-retrieval.mts
 *   node --import tsx/esm examples/kb-agent/scripts/eval-retrieval.mts --answers  # + citation metric
 */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import KbRuntime from '@deepseek-ai/dsh-kb'
import type { KbDocKind } from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import * as KbEmbedMiniMax from '@deepseek-ai/dsh-kb-embed-minimax'

const exampleRoot = new URL('..', import.meta.url).pathname
const hybrid = process.env.DSH_EVAL_HYBRID === '1'
const withAnswers = process.argv.includes('--answers')
const signal = new AbortController().signal

// The app bin loads the gitignored root .env; a bare tsx run must do the same
// before any provider resolves its credential from the environment.
if (hybrid || withAnswers) {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname)
  } catch {
    // No .env: providers stay unavailable and the run degrades or fails loud.
  }
}

interface EvalQuestion {
  id: number
  category: string
  query: string
  gold: string
}

/** Directory name → ingested doc kind; every corpus directory is covered. */
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

const ctx = new Context()
const root = await mkdtemp(join(tmpdir(), 'kb-eval-'))

try {
  await ctx.plugin(KbRuntime)
  await ctx.plugin(KbSqlite, { path: join(root, 'kb.sqlite') })
  if (hybrid) {
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmMiniMax, {})
    await ctx.plugin(KbEmbedMiniMax, {})
  }

  // Ingest every .md corpus document under workspace/data.
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

  const questions = (JSON.parse(await readFile(join(exampleRoot, 'eval/questions.json'), 'utf8')) as { questions: EvalQuestion[] }).questions
  interface Row {
    id: number
    category: string
    query: string
    gold: string
    top5: string[]
    hit: boolean
    citationValid?: boolean
    citedNumbers?: number[]
  }
  const rows: Row[] = []

  const answerSystem = [
    '你是「企业数据助手」，面向食品企业内部数据问答与统计建议。',
    '依据下面编号检索材料回答问题；结论以 [n] 编号引用来源，引用必须指向材料编号（1-5）。',
    '材料中没有的内容如实说明，不得编造。回答保持简洁。',
  ].join('')

  for (const question of questions) {
    const result = await ctx.kb.search({ query: question.query, tenantId: 'demo-food-co', maxResults: 5 }, signal)
    const top5 = result.results.map(hit => hit.sourcePath)
    const hit = top5.includes(question.gold)
    const row: Row = { id: question.id, category: question.category, query: question.query, gold: question.gold, top5, hit }
    if (withAnswers) {
      const material = result.results.map((hit, index) =>
        `[${index + 1}] ${hit.sourcePath}${hit.headingPath === undefined ? '' : ` — ${hit.headingPath}`}\n${hit.content}`,
      ).join('\n\n')
      const messages: Message[] = [
        createUserMessage({
          content: [{ type: 'text', text: `检索材料：\n${material}\n\n问题：${question.query}` }],
          source: { kind: 'plugin', plugin: 'eval' },
        }),
      ]
      const assembler = new BlockAssembler()
      for await (const chunk of ctx.llm.stream({ provider: 'minimax', model: 'MiniMax-M3', messages, system: answerSystem })) {
        assembler.push(chunk)
      }
      const text = assembler.message({ kind: 'model', provider: 'minimax', model: 'MiniMax-M3' })
        .content.filter(block => block.type === 'text').map(block => block.type === 'text' ? block.text : '').join('')
      // Citation rule: every [n] must be within 1..5; the question passes when
      // at least one cited number resolves to a retrieved passage whose source
      // is the gold document.
      const cited = [...text.matchAll(/\[(\d+)\]/gu)].map(match => Number(match[1]))
      const inRange = cited.filter(n => n >= 1 && n <= top5.length)
      row.citedNumbers = cited
      row.citationValid = inRange.some(n => top5[n - 1] === question.gold)
    }
    rows.push(row)
    process.stderr.write(`\r${rows.length}/${questions.length} evaluated`)
  }
  process.stderr.write('\n')

  const byCategory = new Map<string, { total: number; hits: number }>()
  for (const row of rows) {
    const bucket = byCategory.get(row.category) ?? { total: 0, hits: 0 }
    bucket.total += 1
    if (row.hit) bucket.hits += 1
    byCategory.set(row.category, bucket)
  }
  const hits = rows.filter(row => row.hit).length
  const summary = {
    mode: hybrid ? 'hybrid' : 'text',
    questions: rows.length,
    top5HitRate: Number((hits / rows.length * 100).toFixed(1)),
    byCategory: Object.fromEntries([...byCategory.entries()].sort().map(([category, bucket]) =>
      [category, `${(bucket.hits / bucket.total * 100).toFixed(1)}% (${bucket.hits}/${bucket.total})`])),
    ...(withAnswers ? {
      citationValidRate: Number((rows.filter(row => row.citationValid === true).length / rows.length * 100).toFixed(1)),
    } : {}),
  }
  console.log(JSON.stringify(summary, null, 2))
  const outFile = join(exampleRoot, `eval/results-${hybrid ? 'hybrid' : 'text'}${withAnswers ? '-answers' : ''}.json`)
  await writeFile(outFile, `${JSON.stringify({ summary, rows }, null, 2)}\n`)
  console.log(`details: ${outFile}`)
} finally {
  await ctx.fiber.dispose()
  await rm(root, { recursive: true, force: true })
}
