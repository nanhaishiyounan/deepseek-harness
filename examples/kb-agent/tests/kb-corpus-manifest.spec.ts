/**
 * The example's corpus-manifest data assertions: kb-corpus.yml is the single
 * source of truth for corpus directories, so every manifest directory must
 * exist on disk with at least one ingestible document, and every disk
 * directory holding markdown must be either a manifest entry or the one
 * declared non-corpus drop-in (connector-files) — a freshly added corpus
 * directory that forgets the manifest fails here, which is exactly the
 * KB-vs-KG drift the manifest exists to prevent.
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadCorpusManifest } from '@deepseek-ai/dsh-kg-build'

const here = dirname(fileURLToPath(import.meta.url))
const exampleRoot = join(here, '..')
const manifestPath = join(exampleRoot, 'kb-corpus.yml')
const dataRoot = join(exampleRoot, 'workspace/data')

/** The one disk directory under workspace/data that carries .md files but is deliberately not corpus. */
const NON_CORPUS_DIRS = ['connector-files'] as const

describe('kb-corpus.yml single source of truth', () => {
  it('loads and names at least the five seeded batch-5 directories plus export-risk', () => {
    const manifest = loadCorpusManifest(manifestPath)
    const dirs = manifest.dirs.map(entry => entry.dir)
    for (const seeded of ['trade-finance', 'export-compliance', 'quality', 'ecommerce', 'cold-chain']) {
      expect(dirs).toContain(seeded)
    }
    // The P0-2 regression target: export-risk must be retrievable from the KB.
    expect(dirs).toContain('export-risk')
  })

  it('has every manifest directory on disk with at least one document', () => {
    const manifest = loadCorpusManifest(manifestPath)
    for (const entry of manifest.dirs) {
      const onDisk = join(dataRoot, entry.dir)
      expect(existsSync(onDisk), `${entry.dir} missing on disk`).toBe(true)
      const docs = readdirSync(onDisk).filter(file => file.endsWith('.md'))
      expect(docs.length, `${entry.dir} carries no .md documents`).toBeGreaterThan(0)
    }
  })

  it('covers every disk directory holding markdown (non-corpus drop-ins excluded)', () => {
    const manifest = loadCorpusManifest(manifestPath)
    const listed = new Set(manifest.dirs.map(entry => entry.dir))
    for (const name of readdirSync(dataRoot, { withFileTypes: true })) {
      if (!name.isDirectory()) continue
      const docs = readdirSync(join(dataRoot, name.name)).filter(file => file.endsWith('.md'))
      if (docs.length === 0) continue
      if (NON_CORPUS_DIRS.includes(name.name as (typeof NON_CORPUS_DIRS)[number])) continue
      expect(listed, `${name.name} holds markdown but is absent from kb-corpus.yml`).toContain(name.name)
    }
  })
})
