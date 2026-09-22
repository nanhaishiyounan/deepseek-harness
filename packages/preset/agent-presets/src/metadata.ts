/**
 * A preset's display metadata: the name and description a picker shows.
 *
 * It lives in its own file because the composition is a top-level list of
 * plugin rows — YAML cannot carry sibling keys beside it, and faking a
 * metadata row would hand the Loader something to load. Keeping it separate
 * also keeps the composition exactly what its name says: a Cordis file the
 * loader owns and the cordis preset can author.
 *
 * The file carries display text ONLY. `id` is the directory name and `trust`
 * comes from the root a preset was discovered under, so neither is writable
 * here — otherwise a locally authored preset could claim to be a shipped one.
 *
 * Every read failure degrades to no metadata. A preset whose display text is
 * missing, malformed, or unreadable still mounts: presentation is not a
 * capability, and a broken name must never become an agent that cannot start.
 * @module @deepseek-ai/dsh-agent-presets/metadata
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import yaml from 'js-yaml'

/** The optional display-metadata file beside a preset's composition. */
export const METADATA_FILE = 'preset.yml'

/** One starter chip of the welcome block: shown label and sent text. */
export interface PresetWelcomeStarter {
  /** Chip label the surface renders. */
  readonly label: string
  /** Message text picking the chip sends as the user's own message. */
  readonly send: string
}

/**
 * The welcome block a preset may publish: what a new session's empty state
 * renders locally. Display text only — it never becomes a logged message, so
 * publishing it grants no capability.
 */
export interface PresetWelcome {
  /** One-line identity (the welcome card's title). */
  readonly greeting: string
  /** Capability lines (2-4). */
  readonly capabilities: readonly string[]
  /** Starter chips; picking one sends it as the user's own message. */
  readonly starters: readonly PresetWelcomeStarter[]
}

/** Display text a preset may publish about itself. */
export interface PresetMetadata {
  /** Human-facing name; falls back to the preset id when absent. */
  readonly name?: string
  /** One sentence on what this preset is for. */
  readonly description?: string
  /**
   * Position within its group; lower comes first. A preset that declares
   * none sorts after every preset that does, then by id — so the shipped set
   * can read in capability order while authored ones stay alphabetical.
   */
  readonly order?: number
  /** The new-session welcome block, when the preset publishes one. */
  readonly welcome?: PresetWelcome
}

/** Parse the welcome block: greeting required, lines and starters sanitized. */
function welcomeOf(value: unknown): PresetWelcome | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const block = value as Record<string, unknown>
  const greeting = text(block.greeting)
  if (greeting === undefined) return undefined
  const capabilities = Array.isArray(block.capabilities)
    ? block.capabilities.map(text).filter((line): line is string => line !== undefined)
    : []
  const starters: PresetWelcomeStarter[] = []
  if (Array.isArray(block.starters)) {
    for (const raw of block.starters) {
      if (typeof raw !== 'object' || raw === null) continue
      const starter = raw as Record<string, unknown>
      const label = text(starter.label)
      const send = text(starter.send)
      if (label === undefined || send === undefined) continue
      starters.push({ label, send })
    }
  }
  return { greeting, capabilities, starters }
}

/** A non-empty trimmed string, or undefined for anything else. */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Read one preset directory's display metadata.
 *
 * Absent, unparsable, and wrongly-shaped files are all the same answer —
 * empty metadata — because the caller renders a picker, not a diagnostic.
 * @param directory - the preset directory.
 * @returns the display text the preset published, possibly empty.
 */
export async function readPresetMetadata(directory: string): Promise<PresetMetadata> {
  let raw: string
  try {
    raw = await readFile(join(directory, METADATA_FILE), 'utf8')
  } catch {
    // Absent is the common case: metadata is optional and most presets,
    // including every one authored by duplicating another, carry none.
    return {}
  }
  let parsed: unknown
  try {
    parsed = yaml.load(raw)
  } catch {
    // Malformed display text is not worth failing discovery over; the picker
    // falls back to the id, and the composition still mounts.
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const record = parsed as Record<string, unknown>
  const name = text(record.name)
  const description = text(record.description)
  const order = typeof record.order === 'number' && Number.isFinite(record.order)
    ? record.order
    : undefined
  const welcome = welcomeOf(record.welcome)
  return {
    ...name === undefined ? {} : { name },
    ...description === undefined ? {} : { description },
    ...order === undefined ? {} : { order },
    ...welcome === undefined ? {} : { welcome },
  }
}

/**
 * Render display metadata as the file's contents.
 *
 * Absent fields are omitted rather than written empty, so a preset with no
 * description does not ship a key that reads as an intentional blank.
 * @param metadata - the display text to store.
 * @returns the YAML document, or undefined when there is nothing to store.
 */
export function renderPresetMetadata(metadata: PresetMetadata): string | undefined {
  const name = text(metadata.name)
  const description = text(metadata.description)
  const { order, welcome } = metadata
  if (name === undefined && description === undefined && order === undefined && welcome === undefined) return undefined
  return yaml.dump({
    ...name === undefined ? {} : { name },
    ...description === undefined ? {} : { description },
    ...order === undefined ? {} : { order },
    ...welcome === undefined ? {} : { welcome },
  }, { lineWidth: -1 })
}
