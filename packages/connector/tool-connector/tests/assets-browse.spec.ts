/**
 * `assets_browse` over the real runtime with a scripted provider: the three
 * actions' projections (list cards with pricing anchors, one asset's detail
 * card, stats' per-kind counts and provider totals), the detail id contract
 * (missing ids and unknown assets fail model-readably), and the
 * deployment-side tenant binding (model-supplied tenant rejected).
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import type { ConnectorDataset, ConnectorDatasetRef, ConnectorDatasetSummary, ConnectorProvider } from '@deepseek-ai/dsh-connector'
import * as ToolConnector from '../src/index.ts'

const signal = new AbortController().signal

/** A scripted provider with one dataset of every catalog kind. */
class ScriptedProvider implements ConnectorProvider {
  readonly id = 'alpha'
  readonly capabilities = ['discover', 'fetch'] as const

  constructor(private readonly summaries: ConnectorDatasetSummary[]) {}

  available(): boolean {
    return true
  }

  async discover(): Promise<readonly ConnectorDatasetSummary[]> {
    return this.summaries
  }

  async fetch(_ref: ConnectorDatasetRef): Promise<ConnectorDataset> {
    throw new Error('assets_browse never fetches')
  }
}

function provider(): ScriptedProvider {
  return new ScriptedProvider([
    { id: 'ledger', title: '出口台账', kind: 'tabular', manifest: { providerId: 'alpha' } },
    {
      id: 'experts/1',
      title: '张红喜',
      kind: 'expert-profile',
      manifest: { providerId: 'alpha', updatedAt: '2026-09-01T08:00:00.000Z', description: '漯河市电子商务协会（会长） · 食品出海,中亚五国' },
    },
    {
      id: 'services/1',
      title: '中亚货运动线方案',
      kind: 'service',
      manifest: { providerId: 'alpha', description: 'PDF 方案' },
      service: { serviceId: 'services/1', expertId: 'experts/1', name: '中亚货运动线方案', deliverable: 'PDF 方案', price: '¥8,800/份' },
    },
  ])
}

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

let counter = 0

interface ExecuteResult {
  isError: boolean
  value: unknown
  text: string
}

/** Mount the tool suite over one scripted provider. */
async function mount(config: object = {}): Promise<(name: string, args: unknown) => Promise<ExecuteResult>> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(ConnectorRuntime)
  ctx.connector.registerProvider(provider())
  await ctx.plugin(ToolConnector, { tenant: 'bound-tenant', ...config })
  return async (name, args) => {
    const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
    const text = result.content.find(block => block.type === 'text')
    return { isError: result.isError, value: result.value, text: text?.type === 'text' ? text.text : '' }
  }
}

describe('assets_browse', () => {
  it('registers by default and disappears when disabled in config', async () => {
    await mount()
    const enabled = contexts.at(-1)!
    expect(enabled.tools.schemas().map(schema => schema.name)).toContain('assets_browse')
    await mount({ assets: false })
    const disabled = contexts.at(-1)!
    expect(disabled.tools.schemas().map(schema => schema.name)).not.toContain('assets_browse')
  })

  it('lists asset cards with provider, kind, and pricing anchors', async () => {
    const execute = await mount()
    const result = await execute('assets_browse', { action: 'list' })
    expect(result.isError).toBe(false)
    const value = result.value as { action: string; assets: Array<{ title: string; kind: string; price?: string }> }
    expect(value.action).toBe('list')
    expect(value.assets).toHaveLength(3)
    expect(result.text).toContain('出口台账')
    expect(result.text).toContain('张红喜')
    expect(result.text).toContain('中亚货运动线方案')
    expect(result.text).toContain('¥8,800/份')
    expect(result.text).toContain('`alpha`')
    expect(result.text).toContain('`services/1`')
  })

  it('details one asset and fails model-readably on unknown ids', async () => {
    const execute = await mount()
    const detail = await execute('assets_browse', { action: 'detail', provider_id: 'alpha', dataset_id: 'experts/1' })
    expect(detail.isError).toBe(false)
    const value = detail.value as { action: string; asset: { title: string; updated_at?: string } }
    expect(value.asset.title).toBe('张红喜')
    expect(value.asset.updated_at).toBe('2026-09-01T08:00:00.000Z')
    expect(detail.text).toContain('connector_fetch')

    const unknown = await execute('assets_browse', { action: 'detail', provider_id: 'alpha', dataset_id: 'nope' })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toContain('no asset "nope"')

    const incomplete = await execute('assets_browse', { action: 'detail', provider_id: 'alpha' })
    expect(incomplete.isError).toBe(true)
    expect(incomplete.text).toContain('provider_id and dataset_id')
  })

  it('stats counts assets per kind and providers', async () => {
    const execute = await mount()
    const result = await execute('assets_browse', { action: 'stats' })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      action: 'stats',
      products: 3,
      providers: 1,
      kinds: [
        { kind: 'expert-profile', count: 1 },
        { kind: 'service', count: 1 },
        { kind: 'tabular', count: 1 },
      ],
    })
    expect(result.text).toContain('3 个资产')
    expect(result.text).toContain('1 个提供方')
  })

  it('rejects a model-supplied tenant', async () => {
    const execute = await mount()
    const result = await execute('assets_browse', { action: 'list', tenant: 'other-co' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('tenant is bound by the deployment')
  })
})
