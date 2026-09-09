/**
 * The NocoBase provider's mapping over the real mock server: discover fans
 * across the three collections with translated `$includes` filters and kind
 * restrictions; fetch assembles the expert profile document, the tabular
 * dataset (source-collection rows through the shared row-array parser), the
 * inline document, and the service reference; missing addresses and foreign
 * shapes refuse with distinct codes; the plugin degrades to unavailable
 * without credentials while still registering.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import { ConnectorError } from '@deepseek-ai/dsh-connector'
import { NocoBaseClient } from '../src/client.ts'
import { NocoBaseConnectorProvider } from '../src/provider.ts'
import * as NocoBasePlugin from '../src/index.ts'
import { closeMockServers, CUSTOMS_EXPORT_ROWS, DATASET_ROWS, EXPERT_ROWS, mockNocoBaseServer, MOCK_TOKEN, SERVICE_ROWS } from './mock-server.ts'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'

afterEach(async () => {
  await closeMockServers()
  delete process.env.NOCOBASE_TEST_URL
  delete process.env.NOCOBASE_TEST_TOKEN
})

/** One mocked server plus the provider wired to it. */
interface MockPair {
  provider: NocoBaseConnectorProvider
  server: Awaited<ReturnType<typeof mockNocoBaseServer>>
}

async function providerAgainstMock(): Promise<MockPair> {
  const server = await mockNocoBaseServer()
  const provider = new NocoBaseConnectorProvider({
    client: new NocoBaseClient({ baseUrl: server.url, token: MOCK_TOKEN }),
    available: true,
    listPageSize: 100,
    fetchRowsCap: 1000,
  })
  return { provider, server }
}

describe('NocoBaseConnectorProvider discover', () => {
  it('lists datasets, services, and experts with their mapped kinds, manifests, and card details', async () => {
    const { provider } = await providerAgainstMock()
    const found = await provider.discover({})
    const kinds = found.map(summary => summary.kind).sort()
    expect(kinds).toEqual(['document', 'document', 'expert-profile', 'service', 'service', 'service', 'tabular'])
    const expert = found.find(summary => summary.kind === 'expert-profile')
    expect(expert).toMatchObject({
      id: 'experts/1',
      title: '张红喜',
      manifest: { providerId: 'connector-nocobase', updatedAt: '2026-09-01T08:00:00.000Z', description: '漯河市电子商务协会（会长） · 食品出海 · 中亚五国 · 俄罗斯 · 跨境电商 · 海外仓' },
      expert: { org: '漯河市电子商务协会（会长）', domains: ['食品出海', '中亚五国', '俄罗斯', '跨境电商', '海外仓'] },
    })
    const tabular = found.find(summary => summary.kind === 'tabular')
    expect(tabular).toMatchObject({ id: 'datasets/1', title: '海关出口台账（中亚）' })
    const service = found.find(summary => summary.id === 'expert_services/2')
    expect(service).toMatchObject({
      kind: 'service',
      title: '海外仓风险应对咨询',
      service: { serviceId: 'expert_services/2', expertId: 'experts/1', name: '海外仓风险应对咨询', deliverable: 'PDF 方案', price: '¥6,800/份' },
    })
  })

  it('translates the query into $includes filters over each collection\'s searchable fields', async () => {
    const { provider, server } = await providerAgainstMock()
    const found = await provider.discover({ query: '中亚' })
    expect(found.map(summary => summary.id)).toEqual(['datasets/1', 'datasets/2', 'datasets/3', 'expert_services/1', 'expert_services/3', 'experts/1'])
    const expertsList = server.served.find(request => request.path === '/api/experts:list')
    expect(JSON.parse(expertsList?.query.get('filter') ?? '{}')).toEqual({
      $or: [
        { name: { $includes: '中亚' } },
        { org: { $includes: '中亚' } },
        { domains: { $includes: '中亚' } },
        { bio: { $includes: '中亚' } },
      ],
    })
  })

  it('honors kind restrictions, including the datasets split across tabular and document', async () => {
    const { provider } = await providerAgainstMock()
    expect((await provider.discover({ kinds: ['expert-profile'] })).map(summary => summary.id)).toEqual(['experts/1'])
    const datasetKinds = (await provider.discover({ kinds: ['tabular', 'document'] })).map(summary => summary.id).sort()
    expect(datasetKinds).toEqual(['datasets/1', 'datasets/2', 'datasets/3'])
    expect(await provider.discover({ kinds: ['file'] })).toEqual([])
  })
})

describe('NocoBaseConnectorProvider fetch', () => {
  it('assembles the expert profile as a kb-landing markdown document with the service catalog', async () => {
    const { provider, server } = await providerAgainstMock()
    const dataset = await provider.fetch({ providerId: 'connector-nocobase', datasetId: 'experts/1' })
    expect(dataset.kind).toBe('expert-profile')
    if (dataset.kind !== 'expert-profile') throw new Error('unreachable')
    expect(dataset.ingest).toMatchObject({ sourcePath: 'workspace/data/connectors/connector-nocobase/experts/1.md', docKind: 'profile', title: '张红喜' })
    expect(dataset.ingest.content).toContain('漯河市电子商务协会')
    expect(dataset.ingest.content).toContain('会长')
    expect(dataset.ingest.content).toContain('## 可服务项（可下单）')
    expect(dataset.ingest.content).toContain('中亚货运动线方案（PDF 方案，¥8,800/份）')
    expect(dataset.ingest.content).toContain('海外仓风险应对咨询（PDF 方案，¥6,800/份）')
    expect(dataset.ingest.content).toContain('食品出海合规咨询（PDF 方案，¥12,000/份）')
    // The service lookup filters the expert_services collection by expert id.
    const servicesList = server.served.find(request => request.path === 'expert_services:list' || request.path === '/api/expert_services:list')
    expect(JSON.parse(servicesList?.query.get('filter') ?? '{}')).toEqual({ expertId: { $eq: 1 } })
  })

  it('pulls the tabular dataset source-collection rows as parsed tabular data', async () => {
    const { provider } = await providerAgainstMock()
    const dataset = await provider.fetch({ providerId: 'connector-nocobase', datasetId: 'datasets/1' })
    expect(dataset.kind).toBe('tabular')
    if (dataset.kind !== 'tabular') throw new Error('unreachable')
    expect(dataset.tableName).toBe('customs_export')
    expect(dataset.tabular.columns.map(column => column.name)).toEqual(['region', 'month', 'amount_t'])
    expect(dataset.tabular.rows[0]).toEqual(['中亚', '2026-07', 120.5])
  })

  it('returns the inline document dataset with its full text', async () => {
    const { provider } = await providerAgainstMock()
    const dataset = await provider.fetch({ providerId: 'connector-nocobase', datasetId: 'datasets/2' })
    expect(dataset.kind).toBe('document')
    if (dataset.kind !== 'document') throw new Error('unreachable')
    expect(dataset.ingest.content).toContain('卫生证书互认')
  })

  it('returns the service dataset referencing its expert with deliverable and pricing', async () => {
    const { provider } = await providerAgainstMock()
    const dataset = await provider.fetch({ providerId: 'connector-nocobase', datasetId: 'expert_services/1' })
    expect(dataset.kind).toBe('service')
    if (dataset.kind !== 'service') throw new Error('unreachable')
    expect(dataset.service).toEqual({
      serviceId: 'expert_services/1',
      expertId: 'experts/1',
      name: '中亚货运动线方案',
      deliverable: 'PDF 方案',
      price: '¥8,800/份',
      summary: '中亚方向铁运/海运动线设计与备选切换方案：口岸选择（霍尔果斯/阿拉山口/满洲里/二连浩特）、班列舱位与拼柜方案、时效与成本测算、受阻后的公路 TIR 与海运改道预案。',
    })
  })

  it('refuses missing rows, foreign shapes, and unmapped collections with distinct messages', async () => {
    const { provider } = await providerAgainstMock()
    for (const datasetId of ['experts/99', 'unknown/1', 'experts', 'experts/1/extra']) {
      const error = await provider.fetch({ providerId: 'connector-nocobase', datasetId }).then(
        () => { throw new Error(`expected a refusal for ${datasetId}`) },
        (thrown: unknown) => thrown,
      )
      expect(error).toBeInstanceOf(ConnectorError)
      expect((error as ConnectorError).code).toBe('CONNECTOR_DATASET_MISSING')
    }
  })
})

describe('NocoBaseConnectorProvider fetch guards', () => {
  it('refuses fetch when the provider is constructed unavailable', async () => {
    const provider = new NocoBaseConnectorProvider({
      client: new NocoBaseClient({ baseUrl: 'http://unused', token: 't' }),
      available: false,
      listPageSize: 100,
      fetchRowsCap: 1000,
    })
    await expect(provider.fetch({ providerId: 'connector-nocobase', datasetId: 'experts/1' })).rejects.toMatchObject({ code: 'CONNECTOR_PROVIDER_UNAVAILABLE' })
  })

  it('surfaces non-404 HTTP failures untouched through the taxonomy boundary', async () => {
    const fetch500 = (async () => new Response('{"error":"boom"}', { status: 500 })) as typeof fetch
    const provider = new NocoBaseConnectorProvider({
      client: new NocoBaseClient({ baseUrl: 'http://mock', token: 't', fetch: fetch500 }),
      available: true,
      listPageSize: 100,
      fetchRowsCap: 1000,
    })
    await expect(provider.fetch({ providerId: 'connector-nocobase', datasetId: 'datasets/1' })).rejects.toMatchObject({ code: 'NOCOBASE_HTTP_ERROR', status: 500 })
  })

  it('assembles a minimal expert profile with every optional field absent', async () => {
    const { provider } = await providerAgainstMock()
    EXPERT_ROWS.push({ id: 2, name: '李顾问' })
    try {
      const dataset = await provider.fetch({ providerId: 'connector-nocobase', datasetId: 'experts/2' })
      if (dataset.kind !== 'expert-profile') throw new Error('unreachable')
      expect(dataset.ingest.content).toBe('# 李顾问\n')
      expect(dataset.manifest.updatedAt).toBeUndefined()
      expect(dataset.manifest.description).toBeUndefined()
    } finally {
      EXPERT_ROWS.pop()
    }
  })

  it('covers the absent-field arms of document, tabular, and service rows', async () => {
    const { provider } = await providerAgainstMock()
    // Ids stay above the fixture source's occupied range (experts 1,
    // expert_services 1-3, datasets 1-3) so the REST get finds the pushed row.
    DATASET_ROWS.push(
      { id: 26, kind: 'document', title: '' , content: '' },
      { id: 27, kind: 'tabular', title: '裸表', collection: 'customs_export' },
    )
    SERVICE_ROWS.push({ id: 22, name: '出海合规咨询' })
    try {
      const listed = await provider.discover({})
      expect(listed.find(summary => summary.id === 'datasets/26')?.title).toBe('datasets/26')
      const doc = await provider.fetch({ providerId: 'connector-nocobase', datasetId: 'datasets/26' })
      if (doc.kind !== 'document') throw new Error('unreachable')
      expect(doc.ingest.content).toBe('')
      const tab = await provider.fetch({ providerId: 'connector-nocobase', datasetId: 'datasets/27' })
      if (tab.kind !== 'tabular') throw new Error('unreachable')
      expect(tab.tableName).toBe('customs_export')
      expect(tab.manifest.updatedAt).toBeUndefined()
      const svc = await provider.fetch({ providerId: 'connector-nocobase', datasetId: 'expert_services/22' })
      if (svc.kind !== 'service') throw new Error('unreachable')
      expect(svc.manifest.updatedAt).toBeUndefined()
      expect(svc.manifest.description).toBeUndefined()
      expect(svc.service.expertId).toBeUndefined()
      expect(svc.service.deliverable).toBeUndefined()
      expect(svc.service.price).toBeUndefined()
      expect(svc.service.summary).toBeUndefined()
    } finally {
      DATASET_ROWS.pop()
      DATASET_ROWS.pop()
      SERVICE_ROWS.pop()
    }
  })

  it('renders the expert card from partial service rows and non-string card cells', async () => {
    const { provider } = await providerAgainstMock()
    // One service without deliverable/price (empty spec arm) and one with a
    // price only; a blank org and a non-string domains cell (list-path rows
    // stay opaque) yield no card detail.
    EXPERT_ROWS.push({ id: 30, name: '李顾问', org: '' })
    EXPERT_ROWS.push({ id: 31, name: '钱顾问', domains: 123 } as unknown as (typeof EXPERT_ROWS)[number])
    EXPERT_ROWS.push({ id: 32, name: '孙顾问', domains: '合规' })
    SERVICE_ROWS.push({ id: 33, expertId: 30, name: '裸服务' })
    SERVICE_ROWS.push({ id: 34, expertId: 30, name: '定价服务', price: '¥1/次' })
    try {
      const profile = await provider.fetch({ providerId: 'connector-nocobase', datasetId: 'experts/30' })
      if (profile.kind !== 'expert-profile') throw new Error('unreachable')
      expect(profile.ingest.content).toContain('## 可服务项（可下单）')
      expect(profile.ingest.content).toContain('- 裸服务')
      expect(profile.ingest.content).not.toContain('裸服务（')
      expect(profile.ingest.content).toContain('- 定价服务（¥1/次）')
      const listed = await provider.discover({})
      expect(listed.find(summary => summary.id === 'experts/30')?.expert).toBeUndefined()
      expect(listed.find(summary => summary.id === 'experts/31')?.expert).toBeUndefined()
      expect(listed.find(summary => summary.id === 'experts/32')?.expert).toEqual({ domains: ['合规'] })
    } finally {
      EXPERT_ROWS.pop()
      EXPERT_ROWS.pop()
      EXPERT_ROWS.pop()
      SERVICE_ROWS.pop()
      SERVICE_ROWS.pop()
    }
  })

  it('skips a dataset row whose kind sits outside the closed union', async () => {
    const { provider } = await providerAgainstMock()
    const weird = { id: 8, kind: 'weird', title: '异类' } as unknown as (typeof DATASET_ROWS)[number]
    const bare = { id: 9, kind: 'document', title: '无正文' } as (typeof DATASET_ROWS)[number]
    DATASET_ROWS.push(weird, bare)
    try {
      const found = await provider.discover({})
      expect(found.some(summary => summary.id === 'datasets/8')).toBe(false)
      const doc = await provider.fetch({ providerId: 'connector-nocobase', datasetId: 'datasets/9' })
      if (doc.kind !== 'document') throw new Error('unreachable')
      expect(doc.ingest.content).toBe('')
    } finally {
      DATASET_ROWS.pop()
      DATASET_ROWS.pop()
    }
  })

  it('falls back to the dataset address when a listed title is blank', async () => {
    const { provider } = await providerAgainstMock()
    DATASET_ROWS.push({ id: 5, kind: 'document', title: '', content: 'x' })
    try {
      const found = await provider.discover({})
      expect(found.find(summary => summary.id === 'datasets/5')?.title).toBe('datasets/5')
    } finally {
      DATASET_ROWS.pop()
    }
  })

  it('flattens a nested source-row value into JSON text in the tabular payload', async () => {
    const { provider } = await providerAgainstMock()
    CUSTOMS_EXPORT_ROWS.push({ region: '中亚', month: '2026-09', amount_t: 1, meta: { lane: 'rail' } })
    try {
      const dataset = await provider.fetch({ providerId: 'connector-nocobase', datasetId: 'datasets/1' })
      if (dataset.kind !== 'tabular') throw new Error('unreachable')
      const metaIndex = dataset.tabular.columns.findIndex(column => column.name === 'meta')
      expect(dataset.tabular.columns[metaIndex]?.sqlType).toBe('TEXT')
      const metaCell = dataset.tabular.rows.at(-1)?.[metaIndex]
      expect(metaCell).toBe('{"lane":"rail"}')
    } finally {
      CUSTOMS_EXPORT_ROWS.pop()
    }
  })

  it('refuses a tabular dataset row that names no source collection', async () => {
    const { provider } = await providerAgainstMock()
    DATASET_ROWS.push({ id: 23, kind: 'tabular', title: '悬空台账' })
    try {
      await expect(provider.fetch({ providerId: 'connector-nocobase', datasetId: 'datasets/23' })).rejects.toMatchObject({ code: 'CONNECTOR_DATASET_MISSING' })
    } finally {
      DATASET_ROWS.pop()
    }
  })

  it('lists a document row without updatedAt', async () => {
    const { provider } = await providerAgainstMock()
    DATASET_ROWS.push({ id: 4, kind: 'document', title: '补充指南', content: '数字标题文档。' })
    try {
      const found = await provider.discover({})
      const entry = found.find(summary => summary.id === 'datasets/4')
      expect(entry?.title).toBe('补充指南')
      expect(entry?.manifest.updatedAt).toBeUndefined()
      const dataset = await provider.fetch({ providerId: 'connector-nocobase', datasetId: 'datasets/4' })
      if (dataset.kind !== 'document') throw new Error('unreachable')
      expect(dataset.ingest.content).toContain('数字标题')
    } finally {
      DATASET_ROWS.pop()
    }
  })

  it('refuses dataset ids with a leading, trailing, or extra slash before any request', async () => {
    const { provider } = await providerAgainstMock()
    for (const datasetId of ['/1', 'experts/', 'a/b/c']) {
      await expect(provider.fetch({ providerId: 'connector-nocobase', datasetId })).rejects.toMatchObject({ code: 'CONNECTOR_DATASET_MISSING' })
    }
  })

  it('answers kinds-restricted discovery across the datasets split and a service-only filter', async () => {
    const { provider } = await providerAgainstMock()
    const serviceOnly = await provider.discover({ kinds: ['service'] })
    expect(serviceOnly.map(summary => summary.id)).toEqual(['expert_services/1', 'expert_services/2', 'expert_services/3'])
    const documentOnly = await provider.discover({ kinds: ['document'] })
    expect(documentOnly.map(summary => summary.id)).toEqual(['datasets/2', 'datasets/3'])
    expect(await provider.discover({ kinds: ['file'] })).toEqual([])
  })
})

describe('connector-nocobase plugin', () => {
  it('registers an unavailable provider when no credentials resolve, and discovery skips it', async () => {
    const ctx = new Context()
    await ctx.plugin(ConnectorRuntime)
    await ctx.plugin(NocoBasePlugin, {})
    expect(ctx.connector.providerIds()).toEqual(['connector-nocobase'])
    expect(await ctx.connector.discover({})).toEqual([])
    await expect(ctx.connector.fetch({ providerId: 'connector-nocobase', datasetId: 'experts/1' })).rejects.toMatchObject({ code: 'CONNECTOR_PROVIDER_UNAVAILABLE' })
    await ctx.fiber.dispose()
  })

  it('fills every optional budget from its default when the config carries none', async () => {
    const ctx = new Context()
    await ctx.plugin(ConnectorRuntime)
    process.env.NOCOBASE_TEST_TOKEN = 'any-token'
    try {
      await ctx.plugin(NocoBasePlugin, { apiKeyEnv: 'NOCOBASE_TEST_TOKEN' })
      expect(ctx.connector.providerIds()).toEqual(['connector-nocobase'])
    } finally {
      delete process.env.NOCOBASE_TEST_TOKEN
      await ctx.fiber.dispose()
    }
  })

  it('resolves the base url from the environment and the token from the credential seam', async () => {
    const server = await mockNocoBaseServer()
    const ctx = new Context()
    await ctx.plugin(LocalCredentialProvider)
    await ctx.plugin(ConnectorRuntime)
    process.env.NOCOBASE_BASE_URL = server.url
    process.env.NOCOBASE_API_KEY = MOCK_TOKEN
    try {
      await ctx.plugin(NocoBasePlugin, {})
      const found = await ctx.connector.discover({ kinds: ['expert-profile'] })
      expect(found.map(summary => summary.id)).toEqual(['experts/1'])
    } finally {
      delete process.env.NOCOBASE_BASE_URL
      delete process.env.NOCOBASE_API_KEY
      await ctx.fiber.dispose()
    }
  })

  it('fills every defaulted budget when config carries only the credential reference', async () => {
    const ctx = new Context()
    await ctx.plugin(ConnectorRuntime)
    await ctx.plugin(NocoBasePlugin, { apiKeyEnv: 'NOCOBASE_TEST_TOKEN' })
    expect(ctx.connector.providerIds()).toEqual(['connector-nocobase'])
    await ctx.fiber.dispose()
  })

  it('resolves the token from the credential environment against the config-pinned base url', async () => {
    const server = await mockNocoBaseServer()
    process.env.NOCOBASE_TEST_TOKEN = MOCK_TOKEN
    const ctx = new Context()
    await ctx.plugin(ConnectorRuntime)
    await ctx.plugin(NocoBasePlugin, { baseUrl: server.url, apiKeyEnv: 'NOCOBASE_TEST_TOKEN' })
    const found = await ctx.connector.discover({ kinds: ['expert-profile'] })
    expect(found.map(summary => summary.id)).toEqual(['experts/1'])
    await ctx.fiber.dispose()
  })
})
