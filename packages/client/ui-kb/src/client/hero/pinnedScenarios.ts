/**
 * The overview portal's pinned-scenario set: the scenario ids the user pinned
 * to the front of the overview home, capped at six, persisted whole-value to
 * localStorage (the recent-searches pattern). Storage failures only disable
 * persistence — the in-memory set still serves the session.
 * @module @deepseek-ai/dsh-client-ui-kb/client/hero/pinnedScenarios
 */

import { KB_SCENARIOS } from './scenarios.ts'

/** How many scenarios the pinned rail keeps. */
export const PINNED_SCENARIO_LIMIT = 6

/** localStorage entry the pin set persists to. */
const STORAGE_KEY = 'dsh-kb-pinned-scenarios'

/** The in-memory fallback when localStorage is unavailable or corrupted. */
let memory: string[] = []

/** Read the persisted set, dropping ids the catalog no longer knows. */
function readPersisted(): string[] {
  let raw: string[]
  if (typeof localStorage === 'undefined') {
    raw = memory
  } else {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const parsed: unknown = stored === null ? undefined : JSON.parse(stored)
      raw = Array.isArray(parsed) && parsed.every(item => typeof item === 'string')
        ? parsed
        : memory
    } catch {
      raw = memory
    }
  }
  const known = new Set(KB_SCENARIOS.map(scenario => scenario.id))
  return raw.filter(id => known.has(id)).slice(0, PINNED_SCENARIO_LIMIT)
}

/** Persist the set; a storage failure keeps the in-memory copy. */
function writePersisted(next: string[]): void {
  memory = next
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota or private mode: persistence silently disables.
  }
}

/**
 * List the pinned scenario ids in pin order.
 * @returns the capped, catalog-filtered id list.
 */
export function pinnedScenarios(): string[] {
  return readPersisted()
}

/**
 * Pin or unpin one scenario: pinning moves the id to the front (dropping the
 * oldest past the cap), unpinning removes it.
 * @param id - the scenario id.
 * @param pinned - true to pin, false to unpin.
 * @returns the updated id list.
 */
export function setScenarioPinned(id: string, pinned: boolean): string[] {
  const current = readPersisted().filter(item => item !== id)
  const next = pinned ? [id, ...current].slice(0, PINNED_SCENARIO_LIMIT) : current
  writePersisted(next)
  return next
}
