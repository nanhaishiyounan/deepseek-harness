/**
 * The seed script's seeding logic over a local mock NocoBase backend: rows
 * from the authoritative fixture source (workspace/data/experts/dataset.json)
 * land collection by collection through `:create` with the fields at the
 * body's top level (the v2 wire — no `{values}` wrapper, no client-side id)
 * and expert_services rows remap their expertId onto the server-assigned
 * expert id. The mock backend starts empty and assigns ids from 100 so the
 * remapping is observable, and the fixture source is the committed 张红喜
 * dataset the connector mock also serves.
 */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'
import { seedExpertDataset } from '../scripts/seed-experts.mts'
import type { ExpertFixtureSource } from '../scripts/seed-experts.mts'

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = join(here, '../workspace/data/experts/dataset.json')

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
})

/** One recorded create for wire-shape assertions. */
interface CreatedCall {
  readonly path: string
  readonly body: unknown
}

/**
 * A minimal NocoBase stand-in with empty collections; `:create` assigns ids
 * from 100 so server-assigned ids never collide with the fixture ids.
 */
interface SeedBackend {
  readonly url: string
  readonly collections: {
    experts: Array<Record<string, unknown>>
    expert_services: Array<Record<string, unknown>>
    datasets: Array<Record<string, unknown>>
    customs_export: Array<Record<string, unknown>>
  }
  readonly created: CreatedCall[]
}

async function mockBackend(): Promise<SeedBackend> {
  const collections: SeedBackend['collections'] = {
    experts: [],
    expert_services: [],
    datasets: [],
    customs_export: [],
  }
  const created: CreatedCall[] = []
  const server = createServer((request, response) => {
    // The handler indexes by the matched collection name; the seeded shape stays concrete.
    const byName: Record<string, Array<Record<string, unknown>>> = collections
    let raw = ''
    request.on('data', (chunk: Buffer) => { raw += chunk.toString('utf8') })
    request.on('end', () => {
      const url = new URL(request.url ?? '/', 'http://mock-nocobase')
      const finish = (status: number, payload: unknown): void => {
        response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload))
      }
      const match = /^\/api\/([^/:]+):create$/u.exec(url.pathname)
      if (request.method !== 'POST' || match === null) {
        finish(404, { error: { code: 'NOT_FOUND' } })
        return
      }
      const rows = byName[match[1] as string]
      if (rows === undefined) {
        finish(404, { error: { code: 'NOT_FOUND' } })
        return
      }
      // v2 wire: the POST body's top level IS the values; the answer wraps
      // the stored row in `data`.
      const body = JSON.parse(raw) as Record<string, unknown>
      const assignedId = 100 + created.length
      created.push({ path: url.pathname, body })
      const row = { ...body, id: assignedId }
      rows.push(row)
      finish(200, { data: row })
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock backend has no address')
  return { url: `http://127.0.0.1:${address.port}`, collections, created }
}

describe('seed-experts', () => {
  it('seeds the authoritative fixture source row by row, remapping expert ids onto server-assigned ids', async () => {
    const backend = await mockBackend()
    const client = new NocoBaseClient({ baseUrl: backend.url, token: 'seed-token' })
    const fixtures = JSON.parse(await readFile(fixturePath, 'utf8')) as ExpertFixtureSource
    const experts = backend.collections.experts
    const services = backend.collections.expert_services
    const datasets = backend.collections.datasets
    const sourceRows = backend.collections.customs_export

    const report = await seedExpertDataset(client, fixtures)

    // The report counts the fixture source.
    expect(report).toEqual({ experts: 1, expertServices: 3, datasets: 3, sourceRows: 3 })

    // Every create posts the row fields at the body's top level, without a
    // client-side id and without a values wrapper.
    expect(backend.created).toHaveLength(10)
    for (const call of backend.created) {
      expect(call.path).toMatch(/^\/api\/(experts|expert_services|datasets|customs_export):create$/u)
      expect((call.body as Record<string, unknown>).values).toBeUndefined()
      expect((call.body as Record<string, unknown>).id).toBeUndefined()
    }

    // The expert landed with the server-assigned id and the fixture content.
    expect(experts).toHaveLength(1)
    expect(experts[0]).toMatchObject({ id: 100, name: '张红喜', org: '漯河市电子商务协会（会长）' })

    // The services remapped expertId onto the server-assigned expert id and
    // carry deliverable and pricing.
    expect(services).toHaveLength(3)
    for (const service of services) {
      expect(service.expertId).toBe(100)
    }
    expect(services.map(service => service.name)).toEqual(['中亚货运动线方案', '海外仓风险应对咨询', '食品出海合规咨询'])
    expect(services[0]).toMatchObject({ deliverable: 'PDF 方案', price: '¥8,800/份' })

    // The dataset registrations and the source-collection rows landed too.
    expect(datasets.map(row => row.title)).toEqual([
      '海关出口台账（中亚）',
      '中亚市场准入指南',
      '俄罗斯·中亚海外仓风险应对手册（专家知识资产）',
    ])
    expect(sourceRows).toHaveLength(3)
  })

  it('leaves an unresolved expert reference untouched when the fixture expert is absent', async () => {
    const backend = await mockBackend()
    const client = new NocoBaseClient({ baseUrl: backend.url, token: 'seed-token' })
    const fixtures = JSON.parse(await readFile(fixturePath, 'utf8')) as ExpertFixtureSource
    // Drop the experts entirely: the service rows keep their fixture expertId.
    await seedExpertDataset(client, { ...fixtures, experts: [] })
    expect(backend.collections.expert_services[0]?.expertId).toBe(1)
  })
})
