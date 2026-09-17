/**
 * Ingest the corpus directories the versioned kb-corpus.yml manifests (the
 * single source of truth seed-kb, setup-dsh-data, and the kg-build corpus leg
 * share) into the kb-agent knowledge base with real MiniMax embo-01
 * embeddings — the same kb.ingest seam the workbench upload channel rides.
 * Idempotent by construction: the store keys documents on (tenantId,
 * sourcePath) and re-ingesting replaces, never duplicates. Without
 * MINIMAX_API_KEY the script refuses loudly (these documents are useless
 * unembedded to the retrieval surface).
 *
 * Usage (repo root, tsx loader, loads the gitignored root .env):
 *   node --import tsx/esm examples/kb-agent/scripts/seed-kb.mts
 */
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import * as KbEmbedMiniMax from '@deepseek-ai/dsh-kb-embed-minimax'
import { loadCorpusManifest } from '@deepseek-ai/dsh-kg-build'

/** The corpus manifest: every directory the KB and the KG corpus leg share. */
const MANIFEST = loadCorpusManifest(fileURLToPath(new URL('../kb-corpus.yml', import.meta.url)))

/** The manifest's dirs as workspace-relative roots (the sourcePath prefix every corpus consumer uses). */
const CORPUS_DIRS: ReadonlyArray<{ dir: string; kind: string }> = MANIFEST.dirs
  .map(entry => ({ dir: `workspace/data/${entry.dir}`, kind: entry.kind }))

const tenant = process.env.DSH_KB_TENANT ?? 'demo-food-co'

// The app bin loads the gitignored root .env; a bare tsx run must do the same.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)))
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

  const exampleRoot = fileURLToPath(new URL('..', import.meta.url))
  if (!existsSync(exampleRoot)) {
    throw new Error(`seed-kb: example root does not exist: ${exampleRoot}`)
  }
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
