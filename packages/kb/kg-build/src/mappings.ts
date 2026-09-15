/**
 * The declarative mapping file (`kg-mappings.yml`): the versioned source of
 * truth for which external collections map onto the graph and how their
 * references become edges. Files are the industry rule — a UI may edit the
 * file later, but code only reads it. The parser is strict (fail loud on the
 * first structural surprise; no silent defaults inside the parse).
 * @module @deepseek-ai/dsh-kg-build/mappings
 */

import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { KgBuildError } from './error.ts'
import type { KgMappingCollection, KgMappingsFile } from './types.ts'

/** The mappings-file format this build owns; any other version is rejected. */
const SUPPORTED_MAPPINGS_VERSION = 1

/** The rule toggles a mappings file declares (R10/R11/R12 switches). */
export interface KgMappingRules {
  readonly skipHiddenCollections: boolean
  readonly emptyFkNoEdge: boolean
  readonly derivesTitle: boolean
}

/** Field-wise expectation for one collection entry (the strict reader). */
interface CollectionShape {
  readonly name: 'string'
  readonly anchor?: 'string'
  readonly titleField?: 'string'
  readonly fkLinks?: 'array'
}

/** Reject a malformed mappings document with the offending path named. */
function fail(path: string, detail: string): never {
  throw new KgBuildError(
    `kg-mappings: ${path}: ${detail}`,
    'KG_BUILD_MAPPINGS_INVALID',
  )
}

/** Read one required-or-optional scalar field under the strict shape. */
function readString(entry: Record<string, unknown>, field: string, path: string, required: boolean): string | undefined {
  const value = entry[field]
  if (value === undefined) {
    if (required) fail(`${path}.${field}`, 'required field missing')
    return undefined
  }
  if (typeof value !== 'string' || value.length === 0) fail(`${path}.${field}`, 'expected a non-empty string')
  return value
}

/** Read one fk-link map under the strict shape. */
function readFkLink(raw: unknown, path: string): NonNullable<KgMappingCollection['fkLinks']>[number] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail(path, 'expected a mapping object')
  const entry = raw as Record<string, unknown>
  const field = readString(entry, 'field', path, true)
  const target = readString(entry, 'target', path, true)
  const relation = readString(entry, 'relation', path, true)
  const styleRaw = entry.style
  if (styleRaw !== undefined && styleRaw !== 'plain-id' && styleRaw !== 'collection-address') {
    fail(`${path}.style`, `expected plain-id or collection-address, got ${JSON.stringify(styleRaw)}`)
  }
  return {
    field: field as string,
    target: target as string,
    relation: relation as string,
    ...(styleRaw === undefined ? {} : { style: styleRaw }),
  }
}

/**
 * Parse one mappings document (YAML text) into the typed file shape.
 * @param text - the raw file contents.
 * @param origin - the file path or label for error messages.
 * @returns the validated mappings file.
 */
export function parseMappings(text: string, origin: string): KgMappingsFile {
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
  if (root.version !== SUPPORTED_MAPPINGS_VERSION) {
    fail(`${origin}.version`, `expected ${String(SUPPORTED_MAPPINGS_VERSION)}, got ${JSON.stringify(root.version)}`)
  }
  if (!Array.isArray(root.sources)) fail(`${origin}.sources`, 'expected an array')
  const collections: KgMappingCollection[] = []
  const seen = new Set<string>()
  for (const [sourceIndex, sourceRaw] of root.sources.entries()) {
    const sourcePath = `${origin}.sources[${String(sourceIndex)}]`
    if (typeof sourceRaw !== 'object' || sourceRaw === null || Array.isArray(sourceRaw)) fail(sourcePath, 'expected a mapping object')
    const source = sourceRaw as Record<string, unknown>
    if (source.system !== 'nocobase') {
      fail(`${sourcePath}.system`, `expected "nocobase", got ${JSON.stringify(source.system)}`)
    }
    if (!Array.isArray(source.collections)) fail(`${sourcePath}.collections`, 'expected an array')
    for (const [index, collectionRaw] of (source.collections as unknown[]).entries()) {
      const collectionPath = `${sourcePath}.collections[${String(index)}]`
      if (typeof collectionRaw !== 'object' || collectionRaw === null || Array.isArray(collectionRaw)) fail(collectionPath, 'expected a mapping object')
      const entry = collectionRaw as Record<string, unknown>
      const shape: CollectionShape = { name: 'string' }
      for (const key of Object.keys(entry)) {
        if (!(key in shape) && key !== 'anchor' && key !== 'titleField' && key !== 'fkLinks') {
          fail(`${collectionPath}.${key}`, 'unknown collection key')
        }
      }
      const name = readString(entry, 'name', collectionPath, true) as string
      if (seen.has(name)) fail(collectionPath, `duplicate collection "${name}"`)
      seen.add(name)
      const fkLinksRaw = entry.fkLinks
      if (fkLinksRaw !== undefined && !Array.isArray(fkLinksRaw)) fail(`${collectionPath}.fkLinks`, 'expected an array')
      const anchor = readString(entry, 'anchor', collectionPath, false)
      const titleField = readString(entry, 'titleField', collectionPath, false)
      collections.push({
        name,
        ...(anchor === undefined ? {} : { anchor }),
        ...(titleField === undefined ? {} : { titleField }),
        ...(fkLinksRaw === undefined ? {} : {
          fkLinks: (fkLinksRaw as unknown[]).map((link, linkIndex) => readFkLink(link, `${collectionPath}.fkLinks[${String(linkIndex)}]`)),
        }),
      })
    }
  }
  const rulesRaw: unknown = root.rules ?? {}
  if (typeof rulesRaw !== 'object' || rulesRaw === null || Array.isArray(rulesRaw)) fail(`${origin}.rules`, 'expected a mapping object')
  const rules = rulesRaw as Record<string, unknown>
  for (const key of Object.keys(rules)) {
    if (key !== 'skipHiddenCollections' && key !== 'emptyFkNoEdge' && key !== 'derivesTitle') {
      fail(`${origin}.rules.${key}`, 'unknown rule key')
    }
    if (typeof rules[key] !== 'boolean') fail(`${origin}.rules.${key}`, 'expected a boolean')
  }
  return {
    version: SUPPORTED_MAPPINGS_VERSION,
    sources: [{ system: 'nocobase', collections }],
    rules: {
      skipHiddenCollections: rules.skipHiddenCollections !== false,
      emptyFkNoEdge: rules.emptyFkNoEdge !== false,
      derivesTitle: rules.derivesTitle !== false,
    },
  }
}

/**
 * Load and validate one mappings file from disk (fail loud at load).
 * @param path - the file location (absolute or cwd-relative).
 * @returns the validated mappings file.
 */
export function loadMappingsFile(path: string): KgMappingsFile {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error: unknown) {
    throw new KgBuildError(
      `kg-mappings: cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`,
      'KG_BUILD_MAPPINGS_INVALID',
    )
  }
  return parseMappings(text, path)
}
