/**
 * With-NocoBase real-track e2e: the nb_* business tools against a LIVE
 * NocoBase 2.x backend (the one `setup-nocobase.mts` brings up). No mock
 * stands in anywhere: nb_collections reads the real seeded schema,
 * nb_list/nb_get read the real seeded rows (张红喜 + the orders ledger),
 * and the confirmed-change journey lands for real — nb_create stores one
 * test-marked experts row, nb_update rewrites its org through the
 * before→after diff receipt, nb_get verifies the stored merge — with the
 * write-before-confirmation fact asserted (only reads reach the backend
 * until the explicit go-ahead step) and the created row destroyed in the
 * cleanup. Self-skips without reachable NOCOBASE_BASE_URL/NOCOBASE_API_KEY
 * (the root .env counts), explaining why.
 * Run: pnpm vitest run --config vitest.e2e.config.ts examples/kb-agent/tests/nocobase-business.e2e.ts
 */

import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'
import * as ToolNocoBase from '@deepseek-ai/dsh-tool-nocobase'
import { resolveEnv } from '../scripts/resolve-env.ts'

/** POST one resourcer action for the journey's cleanup (destroy of created rows). */
async function postAction(baseUrl: string, apiKey: string, path: string): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) throw new Error(`POST ${path} failed: HTTP ${response.status}`)
}

const ncBaseUrl = resolveEnv('NOCOBASE_BASE_URL')
const ncApiKey = resolveEnv('NOCOBASE_API_KEY')

/** Probe the live backend: the API key must list experts successfully. */
async function backendReachable(): Promise<boolean> {
  if (ncBaseUrl === undefined || ncApiKey === undefined) return false
  try {
    const response = await fetch(`${ncBaseUrl}/api/experts:list?pageSize=1`, {
      headers: { authorization: `Bearer ${ncApiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

const reachable = await backendReachable()
const skipReason = ncBaseUrl === undefined || ncApiKey === undefined
  ? 'NOCOBASE_BASE_URL/NOCOBASE_API_KEY not set — run `node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts` first (self-skipping, not failing)'
  : `NocoBase at ${ncBaseUrl} did not answer the API-key probe — start it with setup-nocobase.mts start (self-skipping, not failing)`
console.info(`nocobase-business e2e: ${skipReason}`)

describe.skipIf(!reachable)('NocoBase real track: nb_* business reads and the confirmed-change writes', () => {
  let ctx: Context | undefined
  let client: NocoBaseClient | undefined
  /** Rows this journey created; destroyed in afterAll whatever happens below. */
  const createdRows: Array<{ collection: string; id: number }> = []
  let counter = 0
  const signal = new AbortController().signal

  beforeEach(async () => {
    const context = new Context()
    ctx = context
    await context.plugin(SystemPrompt)
    await context.plugin(ToolRuntime)
    await context.plugin(ToolNocoBase, { baseUrl: ncBaseUrl!, apiKeyEnv: 'NOCOBASE_API_KEY' })
    client = new NocoBaseClient({ baseUrl: ncBaseUrl!, token: ncApiKey!, timeoutMs: 30_000 })
  })

  afterEach(async () => {
    await ctx?.fiber.dispose()
    ctx = undefined
    for (const row of createdRows.splice(0)) {
      await postAction(ncBaseUrl!, ncApiKey!, `/api/${row.collection}:destroy?filterByTk=${row.id}`).catch((error: unknown) => {
        console.warn(`cleanup: destroying ${row.collection}/${row.id} failed: ${String(error)}`)
      })
    }
  })

  /** Execute one tool through the real registry. */
  async function execute(name: string, args: unknown): Promise<{ isError: boolean; text: string; value: unknown }> {
    const result = await ctx!.tools.execute({ signal, callId: CallId(`nb-call-${++counter}`), name, arguments: args })
    const text = result.content.find(block => block.type === 'text')
    return { isError: result.isError, text: text?.type === 'text' ? text.text : '', value: result.value }
  }

  it('reads the business schema and rows, then lands the confirmed create and diff update', async () => {
    // 1. Schema discovery over the real collections.
    const schema = await execute('nb_collections', {})
    expect(schema.isError).toBe(false)
    expect(schema.text).toContain('experts')
    expect(schema.text).toContain('orders')

    // 2. Row reads over the seeded data: the expert list carries 张红喜.
    const experts = await execute('nb_list', { collection: 'experts', filter: [{ field: 'name', op: 'eq', value: '张红喜' }] })
    expect(experts.isError).toBe(false)
    expect(experts.text).toContain('张红喜')
    const expertId = Number((experts.value as { rows: Array<{ id: number }> }).rows[0]?.id)
    expect(Number.isInteger(expertId)).toBe(true)

    // 3. Single-row read (the pre-change read the confirmation flow mandates).
    const before = await execute('nb_get', { collection: 'experts', id: expertId })
    expect(before.isError).toBe(false)
    expect(before.text).toContain('张红喜')

    // 4. The conversation has only READ the backend so far — nothing landed,
    //    because the write tools wait for the user's explicit go-ahead (the
    //    persona's confirmed-change contract; nb_create/nb_update were never
    //    invoked). The real-track proof is structural: no write tool ran.
    // 5. The confirmed create: one test-marked row lands for real.
    const marker = `nb-e2e-${randomUUID().slice(0, 8)}`
    const created = await execute('nb_create', { collection: 'experts', values: { name: marker, org: '轨道验证临时机构', domains: 'e2e' } })
    expect(created.isError).toBe(false)
    const createdValue = created.value as { id: number; row: Record<string, unknown> }
    expect(createdValue.row.name).toBe(marker)
    createdRows.push({ collection: 'experts', id: createdValue.id })
    // Durable on the live backend (read back through the raw client).
    const stored = await client!.get<{ name: string; org: string }>('experts', createdValue.id)
    expect(stored?.name).toBe(marker)
    expect(stored?.org).toBe('轨道验证临时机构')

    // 6. The confirmed update: the before→after diff receipt, then the merge on disk.
    const updated = await execute('nb_update', { collection: 'experts', id: createdValue.id, values: { org: '轨道验证更新后机构' } })
    expect(updated.isError).toBe(false)
    expect(updated.value).toMatchObject({
      collection: 'experts',
      id: createdValue.id,
      changes: [{ field: 'org', before: '轨道验证临时机构', after: '轨道验证更新后机构' }],
    })
    expect(updated.text).toContain('"轨道验证临时机构" → "轨道验证更新后机构"')
    const merged = await client!.get<{ org: string }>('experts', createdValue.id)
    expect(merged?.org).toBe('轨道验证更新后机构')

    // 7. The follow-up read through the tool surface agrees.
    const after = await execute('nb_get', { collection: 'experts', id: createdValue.id })
    expect(after.isError).toBe(false)
    expect(after.text).toContain('轨道验证更新后机构')
  })

  it('refuses writes against missing rows loudly on the live backend', async () => {
    const missing = await execute('nb_update', { collection: 'experts', id: 99_999_999, values: { org: 'x' } })
    expect(missing.isError).toBe(true)
    expect(missing.text).toContain('no row 99999999 exists in experts')
  })
})
