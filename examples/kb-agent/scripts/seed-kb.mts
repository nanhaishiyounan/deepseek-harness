/**
 * Ingest the batch-5 corpus directories (trade-finance, export-compliance,
 * quality, ecommerce, cold-chain under workspace/data) into the kb-agent
 * knowledge base with real MiniMax embo-01 embeddings — the same kb.ingest
 * seam the workbench upload channel rides. Idempotent by construction: the
 * store keys documents on (tenantId, sourcePath) and re-ingesting replaces,
 * never duplicates. Without MINIMAX_API_KEY the script refuses loudly (these
 * documents are useless unembedded to the retrieval surface).
 *
 * Usage (repo root, tsx loader, loads the gitignored root .env):
 *   node --import tsx/esm examples/kb-agent/scripts/seed-kb.mts
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import * as KbEmbedMiniMax from '@deepseek-ai/dsh-kb-embed-minimax'

/** The corpus directories this seeder owns, with their doc kinds. */
const CORPUS_DIRS: ReadonlyArray<{ dir: string; kind: 'report' | 'regulation' }> = [
  { dir: 'workspace/data/trade-finance', kind: 'report' },
  { dir: 'workspace/data/export-compliance', kind: 'regulation' },
  { dir: 'workspace/data/quality', kind: 'report' },
  { dir: 'workspace/data/ecommerce', kind: 'report' },
  { dir: 'workspace/data/cold-chain', kind: 'report' },
]

const tenant = process.env.DSH_KB_TENANT ?? 'demo-food-co'

// The app bin loads the gitignored root .env; a bare tsx run must do the same.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname)
} catch {
  // No .env: the embed provider below fails loud with the credential error.
}

const minimaxKey = process.env.MINIMAX_API_KEY
if (typeof minimaxKey !== 'string' || minimaxKey.length === 0) {
  console.error('seed-kb: MINIMAX_API_KEY must be set (ambient or root .env) — corpus ingestion needs real embo-01 embeddings')
  process.exit(1)
}

const ctx = new Context()
try {
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmMiniMax, {})
  await ctx.plugin(KbRuntime, { minRelevanceScore: 0.015 })
  await ctx.plugin(KbSqlite, { path: 'examples/kb-agent/workspace/kb.sqlite' })
  await ctx.plugin(KbEmbedMiniMax, {})
  const kb = ctx.get('kb')
  if (kb === undefined) throw new Error('kb service did not compose')

  const exampleRoot = new URL('..', import.meta.url).pathname
  let ingested = 0
  let embedded = 0
  for (const corpus of CORPUS_DIRS) {
    // Disk reads resolve against the example root; the kb sourcePath stays in
    // the workspace-relative form every other corpus consumer uses.
    const dirOnDisk = join(exampleRoot, corpus.dir)
    const files = (await readdir(dirOnDisk)).filter(file => file.endsWith('.md')).sort()
    if (files.length === 0) throw new Error(`no .md files under ${dirOnDisk}`)
    for (const file of files) {
      const sourcePath = `${corpus.dir}/${file}`
      const content = await readFile(join(dirOnDisk, file), 'utf8')
      const { mtime } = await stat(join(dirOnDisk, file))
      const result = await kb.ingest({
        tenantId: tenant,
        sourcePath,
        title: file.replace(/\.md$/u, ''),
        docKind: corpus.kind,
        collectedAt: mtime.toISOString(),
        content,
      })
      ingested += 1
      if (result.embedded) embedded += 1
      console.log(`seed-kb: ${sourcePath} — chunks=${String(result.chunks)} embedded=${String(result.embedded)}`)
    }
  }
  const stats = await kb.stats(tenant)
  console.log(`seed-kb: ingested ${String(ingested)} documents (${String(embedded)} embedded); tenant documents now = ${String(stats.documents)}`)
} finally {
  await ctx.fiber.dispose()
}
