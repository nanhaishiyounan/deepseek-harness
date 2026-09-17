/**
 * Corpus-manifest parser tests: the strict fail-loud reader for the versioned
 * kb-corpus.yml (the single source of truth seed-kb, setup-dsh-data, and the
 * kg-build corpus leg share), plus the load wrapper's own failure modes.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadCorpusManifest, normalizeCorpusDir, parseCorpusManifest } from '../src/corpus-manifest.ts'

const VALID = [
  'version: 1',
  'dirs:',
  '  - dir: trade-finance',
  '    kind: report',
  '  - dir: regulations',
  '    kind: regulation',
].join('\n')

describe('parseCorpusManifest', () => {
  it('parses the versioned manifest into dir/kind entries', () => {
    const manifest = parseCorpusManifest(VALID, 'kb-corpus.yml')
    expect(manifest.version).toBe(1)
    expect(manifest.dirs).toEqual([
      { dir: 'trade-finance', kind: 'report' },
      { dir: 'regulations', kind: 'regulation' },
    ])
  })

  it('rejects an unsupported version', () => {
    expect(() => parseCorpusManifest('version: 2\ndirs: []\n', 'kb-corpus.yml'))
      .toThrow(/version.*expected 1, got 2/u)
  })

  it('rejects an empty dirs list', () => {
    expect(() => parseCorpusManifest('version: 1\ndirs: []\n', 'kb-corpus.yml'))
      .toThrow(/dirs.*expected a non-empty array/u)
  })

  it('rejects a duplicate directory', () => {
    const text = [
      'version: 1',
      'dirs:',
      '  - dir: quality',
      '    kind: report',
      '  - dir: quality',
      '    kind: report',
    ].join('\n')
    expect(() => parseCorpusManifest(text, 'kb-corpus.yml'))
      .toThrow(/duplicate.*quality/u)
  })

  it('rejects unknown entry keys and root keys', () => {
    expect(() => parseCorpusManifest('version: 1\ndirs:\n  - dir: quality\n    kind: report\n    depth: 2\n', 'kb-corpus.yml'))
      .toThrow(/unknown/u)
    expect(() => parseCorpusManifest('version: 1\nroot: /tmp\ndirs:\n  - dir: quality\n    kind: report\n', 'kb-corpus.yml'))
      .toThrow(/unknown/u)
  })

  it('rejects a missing or non-scalar dir/kind', () => {
    expect(() => parseCorpusManifest('version: 1\ndirs:\n  - kind: report\n', 'kb-corpus.yml'))
      .toThrow(/dir.*expected a non-empty string/u)
    expect(() => parseCorpusManifest('version: 1\ndirs:\n  - dir: quality\n', 'kb-corpus.yml'))
      .toThrow(/kind.*expected a non-empty string/u)
  })

  it('rejects malformed YAML and non-object documents', () => {
    expect(() => parseCorpusManifest('version: [1\ndirs:\n', 'kb-corpus.yml')).toThrow(/YAML parse failed/u)
    expect(() => parseCorpusManifest('- a\n- b\n', 'kb-corpus.yml')).toThrow(/top-level/u)
  })

  it('parses ./kb/, kb/, and ./kb onto the same canonical dir key', () => {
    for (const spelling of ['./kb/', 'kb/', './kb']) {
      const manifest = parseCorpusManifest(`version: 1\ndirs:\n  - dir: ${spelling}\n    kind: report\n`, 'kb-corpus.yml')
      expect(manifest.dirs).toEqual([{ dir: 'kb', kind: 'report' }])
    }
  })

  it('rejects two spellings of one directory as a duplicate', () => {
    const text = [
      'version: 1',
      'dirs:',
      '  - dir: kb',
      '    kind: report',
      '  - dir: ./kb/',
      '    kind: report',
    ].join('\n')
    expect(() => parseCorpusManifest(text, 'kb-corpus.yml')).toThrow(/duplicate/u)
  })

  it('rejects a dir that normalizes to empty', () => {
    expect(() => parseCorpusManifest('version: 1\ndirs:\n  - dir: ./\n    kind: report\n', 'kb-corpus.yml'))
      .toThrow(/normalizes to empty/u)
  })

  it('rejects dir values that escape the corpus root', () => {
    for (const dir of ['../kb', '/kb', 'kb/../x', './../kb', '//kb']) {
      const parse = () => parseCorpusManifest(`version: 1\ndirs:\n  - dir: ${dir}\n    kind: report\n`, 'kb-corpus.yml')
      expect(parse).toThrow(/must stay under the corpus root/u)
      expect(parse).toThrow(`directory "${dir}"`)
    }
  })

  it('keeps dir case untouched so wrong directory names stay visible', () => {
    expect(normalizeCorpusDir('KB')).toBe('KB')
  })

  it('hits node paths through the same shared normalizer the lookup uses', () => {
    // The kg-build consumer builds its scope-prefix lookup from this exported
    // normalizer; a `kb/...` node scope under a `./kb/`-spelled entry must hit.
    const manifest = parseCorpusManifest('version: 1\ndirs:\n  - dir: ./kb/\n    kind: report\n', 'kb-corpus.yml')
    const prefix = `${normalizeCorpusDir(manifest.dirs[0]!.dir)}/`
    expect('kb/corpus/note.md'.startsWith(prefix)).toBe(true)
  })
})

describe('loadCorpusManifest', () => {
  let dir = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kb-corpus-manifest-'))
  })

  afterEach(async () => {
    if (dir !== '') await rm(dir, { recursive: true, force: true })
    dir = ''
  })

  it('loads and parses a file from disk', async () => {
    const path = join(dir, 'kb-corpus.yml')
    await writeFile(path, `${VALID}\n`, 'utf8')
    const manifest = loadCorpusManifest(path)
    expect(manifest.dirs.map(entry => entry.dir)).toEqual(['trade-finance', 'regulations'])
  })

  it('fails loud on an unreadable file', () => {
    expect(() => loadCorpusManifest(join(dir, 'absent.yml')))
      .toThrow(/read failed/u)
  })
})
