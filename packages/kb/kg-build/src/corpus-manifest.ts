/**
 * The declarative corpus manifest (`kb-corpus.yml`): the versioned single
 * source of truth for which corpus-root directories are corpus. The KB seeder,
 * the setup chain's watermark probe, and the kg-build corpus leg all read this
 * one file, so the KB document set and the KG extraction scan cannot drift
 * apart. The parser is strict (fail loud on the first structural surprise; no
 * silent defaults inside the parse).
 * @module @deepseek-ai/dsh-kg-build/corpus-manifest
 */

import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { KgBuildError } from './error.ts'

/** The manifest format this build owns; any other version is rejected. */
const SUPPORTED_CORPUS_MANIFEST_VERSION = 1

/** One manifest directory entry: the directory name and its document kind. */
export interface KbCorpusDir {
  /** Directory name under the configured corpus root (no nesting; `..` segments and a leading `/` are rejected at parse). */
  readonly dir: string
  /** Document kind stamped onto every document the directory contributes. */
  readonly kind: string
}

/** The parsed corpus manifest. */
export interface KbCorpusManifest {
  /** The manifest format version this build owns. */
  readonly version: 1
  /** The corpus directories, in declaration order. */
  readonly dirs: readonly KbCorpusDir[]
}

/** Reject a malformed manifest with the offending path named. */
function fail(path: string, detail: string): never {
  throw new KgBuildError(
    `kb-corpus: ${path}: ${detail}`,
    'KG_BUILD_CORPUS_MANIFEST_INVALID',
  )
}

/** Read one required non-empty string field under the strict shape. */
function readString(entry: Record<string, unknown>, field: 'dir' | 'kind', path: string): string {
  const value = entry[field]
  if (typeof value !== 'string' || value.length === 0) fail(`${path}.${field}`, 'expected a non-empty string')
  return value
}

/**
 * Canonicalize one manifest `dir` value for key comparison and scope-prefix
 * matching: strip leading `./` segments and trailing `/` characters. Case
 * stays untouched — corpus roots live on case-sensitive file systems, and
 * silently lowercasing would mask a genuinely wrong directory name.
 * @param dir - the raw manifest directory string.
 * @returns the canonical directory key (empty when the input is nothing but separators).
 */
export function normalizeCorpusDir(dir: string): string {
  return dir.replace(/^(?:\.\/)+/u, '').replace(/\/+$/u, '')
}

/**
 * Parse one corpus-manifest document (YAML text) into the typed shape.
 * @param text - the raw file contents.
 * @param origin - the file path or label for error messages.
 * @returns the validated manifest.
 */
export function parseCorpusManifest(text: string, origin: string): KbCorpusManifest {
  let document: unknown
  try {
    document = parse(text)
  } catch (error: unknown) {
    fail(origin, `YAML parse failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    fail(origin, 'expected a top-level mapping object')
  }
  const root = document as Record<string, unknown>
  for (const key of Object.keys(root)) {
    if (key !== 'version' && key !== 'dirs') fail(`${origin}.${key}`, 'unknown manifest key')
  }
  if (root.version !== SUPPORTED_CORPUS_MANIFEST_VERSION) {
    fail(`${origin}.version`, `expected ${String(SUPPORTED_CORPUS_MANIFEST_VERSION)}, got ${JSON.stringify(root.version)}`)
  }
  if (!Array.isArray(root.dirs) || root.dirs.length === 0) fail(`${origin}.dirs`, 'expected a non-empty array')
  const dirs: KbCorpusDir[] = []
  const seen = new Set<string>()
  for (const [index, raw] of (root.dirs as unknown[]).entries()) {
    const path = `${origin}.dirs[${String(index)}]`
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail(path, 'expected a mapping object')
    const entry = raw as Record<string, unknown>
    for (const key of Object.keys(entry)) {
      if (key !== 'dir' && key !== 'kind') fail(`${path}.${key}`, 'unknown directory key')
    }
    const rawDir = readString(entry, 'dir', path)
    const dir = normalizeCorpusDir(rawDir)
    if (dir.length === 0) fail(`${path}.dir`, 'the directory name normalizes to empty')
    if (dir.startsWith('/')) {
      fail(`${path}.dir`, `directory "${rawDir}" must stay under the corpus root: a leading "/" is not allowed`)
    }
    if (dir.split('/').includes('..')) {
      fail(`${path}.dir`, `directory "${rawDir}" must stay under the corpus root: ".." segments are not allowed`)
    }
    if (seen.has(dir)) fail(path, `duplicate directory "${dir}"`)
    seen.add(dir)
    dirs.push({ dir, kind: readString(entry, 'kind', path) })
  }
  return { version: SUPPORTED_CORPUS_MANIFEST_VERSION, dirs }
}

/**
 * Load and parse one corpus manifest from disk.
 * @param path - the manifest file path.
 * @returns the validated manifest.
 */
export function loadCorpusManifest(path: string): KbCorpusManifest {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error: unknown) {
    throw new KgBuildError(
      `kb-corpus: manifest read failed (${path}): ${error instanceof Error ? error.message : String(error)}`,
      'KG_BUILD_CORPUS_MANIFEST_INVALID',
    )
  }
  return parseCorpusManifest(text, path)
}
