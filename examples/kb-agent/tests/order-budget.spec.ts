/**
 * Keyless guard for the order_create budget relation across every kb-agent
 * composition that mounts the order tools: the tool-connector
 * `orderCreateTimeoutMs` must clear expert-orders' `draftTimeoutMs` by the
 * pipeline's non-draft steps (NocoBase reads/writes, kb retrieval, PDF
 * rendering, attachment upload). An under-sized budget surfaces as
 * `TOOL_TIMEOUT` mid-draft and strands a `generating` order — the failure
 * this guard pins. Compositions without the tool-connector entry (the
 * nocobase-track fixture drives `orders.fulfill` directly) are out of scope.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'

const here = dirname(fileURLToPath(import.meta.url))
const exampleRoot = join(here, '..')

/** Every composition that registers `order_create` through tool-connector. */
const COMPOSITIONS = [
  'cordis.patch.yml',
  'scripts/demo-full-journey.cordis.yml',
  'tests/fixtures/expert-order-e2e.cordis.yml',
]

/** The budget the non-draft pipeline steps need beyond the draft deadline. */
const NON_DRAFT_MARGIN_MS = 30_000

interface Entry {
  id?: string
  config?: Record<string, unknown>
  [key: string]: unknown
}

/** Depth-first every entry node, descending through container shapes. */
function* walk(node: unknown): Generator<Entry> {
  if (Array.isArray(node)) {
    for (const child of node) yield* walk(child)
  } else if (typeof node === 'object' && node !== null) {
    const entry = node as Entry
    if (typeof entry.id === 'string') yield entry
    for (const child of Object.values(entry)) yield* walk(child)
  }
}

/** Parse one composition, neutralizing `!!js` tagged values into plain strings. */
async function parseComposition(relative: string): Promise<Entry[]> {
  const text = await readFile(join(exampleRoot, relative), 'utf8')
  return load(text.replace(/!!js /gu, ''), { json: true }) as Entry[]
}

describe('order_create budget relation (keyless)', () => {
  for (const relative of COMPOSITIONS) {
    it(`${relative}: orderCreateTimeoutMs clears draftTimeoutMs plus the non-draft margin`, async () => {
      const entries = [...walk(await parseComposition(relative))]
      const configOf = (id: string): Record<string, unknown> => {
        const entry = entries.find(candidate => candidate.id === id)
        expect(entry, `${relative} must carry the ${id} entry`).toBeDefined()
        return entry!.config ?? {}
      }
      const toolBudget = configOf('tool-connector').orderCreateTimeoutMs
      const draftBudget = configOf('expert-orders').draftTimeoutMs
      expect(toolBudget, `${relative}: tool-connector must pin orderCreateTimeoutMs`).toBeTypeOf('number')
      expect(draftBudget, `${relative}: expert-orders must pin draftTimeoutMs`).toBeTypeOf('number')
      expect(toolBudget as number).toBeGreaterThanOrEqual((draftBudget as number) + NON_DRAFT_MARGIN_MS)
    })
  }
})
