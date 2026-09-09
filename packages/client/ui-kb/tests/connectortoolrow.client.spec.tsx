// @vitest-environment jsdom
// The connector_discover toolview row: the render matrix over frozen call
// slices — the running query summary, the settled counts-and-experts summary
// off the presentation meta, the error row's first result line, the expanded
// raw listing (the expert card text), and the degraded rows when the wire
// material does not parse.

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { ConnectorToolRow } from '../src/client/toolviews/ConnectorToolRow.tsx'
import { connectorDiscoverRowModel } from '../src/client/toolviews/connector-tool-model.ts'
import { zh } from '../src/client/locales.ts'
import { SESSION_KIT } from './kb-fixture.client.ts'

/** The zh dictionary as the row's t (params rendered the way the runtime does). */
const t = ((key: string, params?: Record<string, string | number>) => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}) as never

/** A running connector_discover call. */
function running(argsRaw: string): ToolCallBlock {
  return {
    callId: 'c1', name: 'connector_discover', argsRaw, turn: 1, step: 1, time: 1,
    callView: null, subCalls: [],
  }
}

/** A settled connector_discover result. */
function settled(options: {
  argsRaw?: string
  content?: readonly { type: 'text'; text: string }[]
  isError?: boolean
  error?: { name: string; code: string }
  meta?: unknown
}): ToolCallBlock {
  return {
    kind: 'tool-result', seq: 2, time: 2, callId: 'c1',
    call: options.argsRaw === undefined ? null : { name: 'connector_discover', argsRaw: options.argsRaw },
    callTime: 1,
    content: options.content ?? [],
    isError: options.isError ?? false,
    ...options.error === undefined ? {} : { error: options.error },
    ...options.meta === undefined ? {} : { meta: options.meta },
    callView: null, resultView: null, subCalls: [],
  }
}

/** The discovery listing exactly as formatDiscoverOutput renders it. */
const DISCOVER_OUTPUT = [
  '## Experts',
  '### 张红喜 — 漯河市电子商务协会（会长）',
  '- dataset id `experts/1` (expert-profile) — provider `connector-nocobase`',
  '- 可服务项（可下单）:',
  '  - 海外仓风险应对咨询（PDF 方案，¥6,800/份） — dataset id `expert_services/2`',
  '',
  'Providers answering: connector-nocobase.',
].join('\n')

function mount(block: ToolCallBlock): void {
  render(<ConnectorToolRow {...SESSION_KIT} toolName="connector_discover" callId="c1" block={block} openFile={() => {}} t={t} />)
}

afterEach(cleanup)

describe('connectorDiscoverRowModel', () => {
  it('derives the settled counts and expert names off the presentation meta', () => {
    const model = connectorDiscoverRowModel(settled({
      argsRaw: '{"query":"海外仓"}',
      content: [{ type: 'text', text: DISCOVER_OUTPUT }],
      meta: { datasets: 2, providers: ['connector-nocobase'], experts: [{ name: '张红喜', org: '漯河市电子商务协会（会长）' }] },
    }))
    expect(model).toMatchObject({
      state: 'ok', query: '海外仓', datasets: 2, providers: ['connector-nocobase'],
      experts: ['张红喜（漯河市电子商务协会（会长））'], errorSummary: null,
    })
  })

  it('degrades to the query alone when the meta does not validate', () => {
    const model = connectorDiscoverRowModel(settled({
      argsRaw: '{"query":"中亚"}',
      content: [{ type: 'text', text: DISCOVER_OUTPUT }],
      meta: { datasets: 'x' },
    }))
    expect(model.datasets).toBeUndefined()
    expect(model.providers).toBeUndefined()
    expect(model.experts).toEqual([])
    expect(model.query).toBe('中亚')
  })

  it('rejects malformed meta shapes and keeps org-less expert names', () => {
    expect(connectorDiscoverRowModel(settled({ meta: { datasets: 1, providers: 'p' } })).datasets).toBeUndefined()
    expect(connectorDiscoverRowModel(settled({ meta: { datasets: 1, providers: [1] } })).datasets).toBeUndefined()
    expect(connectorDiscoverRowModel(settled({ meta: { datasets: 1, providers: ['p'], experts: [{ org: '缺名字' }] } })).datasets).toBeUndefined()
    expect(connectorDiscoverRowModel(settled({ meta: { datasets: 1, providers: ['p'], experts: [{ name: '' }] } })).datasets).toBeUndefined()
    expect(connectorDiscoverRowModel(settled({ meta: { datasets: 1.5, providers: ['p'] } })).datasets).toBeUndefined()
    expect(connectorDiscoverRowModel(settled({ meta: { datasets: -1, providers: ['p'] } })).datasets).toBeUndefined()
    expect(connectorDiscoverRowModel(settled({ meta: { datasets: 1, providers: ['p'], experts: [{ name: '张红喜' }] } })).experts).toEqual(['张红喜'])
  })

  it('carries the error state with the first result line and a null summary when the content is empty', () => {
    const empty = connectorDiscoverRowModel(settled({ isError: true }))
    expect(empty.state).toBe('error')
    expect(empty.output).toBeNull()
    expect(empty.errorSummary).toBeNull()
    const withText = connectorDiscoverRowModel(settled({
      isError: true,
      content: [{ type: 'text', text: 'CONNECTOR_PROVIDER_UNAVAILABLE: no base url\nsecond line' }],
    }))
    expect(withText.errorSummary).toBe('CONNECTOR_PROVIDER_UNAVAILABLE: no base url')
  })

  it('renders a stopped row without expanding', () => {
    mount(settled({ isError: true, error: { name: 'ToolError', code: 'interrupted' } }))
    expect(screen.getByRole('button', { name: /连接器数据集发现/u })).toBeTruthy()
  })
})

describe('ConnectorToolRow', () => {
  it('shows the query while running and the counts with experts once settled', () => {
    mount(running('{"query":"海外仓"}'))
    expect(screen.getByText('海外仓')).toBeTruthy()
    cleanup()
    mount(settled({
      argsRaw: '{"query":"海外仓"}',
      content: [{ type: 'text', text: DISCOVER_OUTPUT }],
      meta: { datasets: 2, providers: ['connector-nocobase'], experts: [{ name: '张红喜', org: '漯河市电子商务协会（会长）' }] },
    }))
    expect(screen.getByText('2 个数据集 · connector-nocobase · 张红喜（漯河市电子商务协会（会长））')).toBeTruthy()
  })

  it('expands to the raw listing with the expert card text', () => {
    mount(settled({
      argsRaw: '{"query":"海外仓"}',
      content: [{ type: 'text', text: DISCOVER_OUTPUT }],
      meta: { datasets: 2, providers: ['connector-nocobase'] },
    }))
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/### 张红喜 — 漯河市电子商务协会（会长）/u)).toBeTruthy()
    expect(screen.getByText(/海外仓风险应对咨询（PDF 方案/u)).toBeTruthy()
  })

  it('shows the error summary on a failed call', () => {
    mount(settled({ isError: true, content: [{ type: 'text', text: 'CONNECTOR_PROVIDER_UNAVAILABLE: no base url' }] }))
    expect(screen.getByText(/CONNECTOR_PROVIDER_UNAVAILABLE/u)).toBeTruthy()
  })
})
