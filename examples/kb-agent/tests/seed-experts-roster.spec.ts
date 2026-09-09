/**
 * The roster seeder's residue cleanup over a local mock NocoBase backend:
 * only rows carrying a marker prefix AND blank provenance (org and domains)
 * are destroyed — a same-prefix row with provenance and an ordinary row
 * survive — while the seeding itself stays idempotent against existing
 * natural keys.
 */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'
import { seedExpertRoster } from '../scripts/seed-experts-roster.mts'
import type { RosterFixture } from '../scripts/seed-experts-roster.mts'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
})

/** One roster expert row shape as the backend serves it. */
interface ExpertRow {
  id: number
  name: string
  org?: string | null
  domains?: string | null
}

/**
 * A minimal NocoBase stand-in with pre-seeded rows: `:list` answers the paged
 * envelope, `:destroy` removes the addressed row, `:create` stores the body.
 */
async function mockBackend(experts: ExpertRow[]): Promise<{ url: string; experts: ExpertRow[]; created: number }> {
  let created = 0
  const server = createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk: Buffer) => { raw += chunk.toString('utf8') })
    request.on('end', () => {
      const url = new URL(request.url ?? '/', 'http://mock-nocobase')
      const finish = (status: number, payload: unknown): void => {
        response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload))
      }
      if (request.method === 'GET' && url.pathname === '/api/experts:list') {
        finish(200, { data: experts, meta: { count: experts.length, page: 1, pageSize: 200 } })
        return
      }
      if (request.method === 'GET' && (url.pathname === '/api/expert_services:list' || url.pathname === '/api/datasets:list')) {
        finish(200, { data: [], meta: { count: 0, page: 1, pageSize: 300 } })
        return
      }
      const destroy = /^\/api\/([^/:]+):destroy$/u.exec(url.pathname)
      if (request.method === 'POST' && destroy !== null) {
        const id = Number(url.searchParams.get('filterByTk'))
        const index = experts.findIndex(row => row.id === id)
        if (index >= 0) experts.splice(index, 1)
        finish(200, { data: null })
        return
      }
      const create = /^\/api\/([^/:]+):create$/u.exec(url.pathname)
      if (request.method === 'POST' && create !== null) {
        created += 1
        finish(200, { data: { ...(JSON.parse(raw) as Record<string, unknown>), id: 100 + created } })
        return
      }
      finish(404, { error: { code: 'NOT_FOUND' } })
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock backend has no address')
  return { url: `http://127.0.0.1:${address.port}`, experts, created }
}

const FIXTURE: RosterFixture = {
  experts: [{ id: 1, name: '罗盘专家', org: '测试机构', domains: '测试领域', bio: '' }],
  expert_services: [],
  knowledge_assets: [],
}

describe('seed-experts-roster residue cleanup', () => {
  it('destroys only provenance-blank rows carrying a marker prefix', async () => {
    const backend = await mockBackend([
      { id: 53, name: '演示专家-162528-改', org: null, domains: null },
      { id: 54, name: '演示专家-170110-改', org: '', domains: '' },
      { id: 90, name: '演示专家-带机构', org: '真实机构', domains: '真实领域' },
      // Mixed: marker prefix + org present + domains blank — one populated
      // provenance field is already enough to keep the row. Widening the
      // guard to either-field-blank would destroy this row and fail below.
      { id: 91, name: '演示专家-混合', org: '真实机构', domains: null },
      { id: 1, name: '张红喜', org: '漯河市电子商务协会（会长）', domains: '食品出海' },
    ])
    const client = new NocoBaseClient({ baseUrl: backend.url, token: 'roster-token' })

    const report = await seedExpertRoster(client, FIXTURE, { baseUrl: backend.url, token: 'roster-token' })

    // The two blank residue rows are gone; the same-prefix provenance-carrying
    // rows (the fully populated one and the mixed one) and the real expert
    // survive the narrow guard. (The roster expert goes through :create,
    // which this mock acknowledges without storing.)
    expect(report.residueRemoved).toBe(2)
    expect(report.expertsCreated).toBe(1)
    expect(backend.experts.map(row => row.name).sort()).toEqual(['张红喜', '演示专家-带机构', '演示专家-混合'])
  })

  it('keeps the seeding idempotent when the roster expert already exists', async () => {
    const backend = await mockBackend([{ id: 7, name: '罗盘专家', org: '既有机构', domains: '既有领域' }])
    const client = new NocoBaseClient({ baseUrl: backend.url, token: 'roster-token' })

    const report = await seedExpertRoster(client, FIXTURE, { baseUrl: backend.url, token: 'roster-token' })

    expect(report.expertsCreated).toBe(0)
    expect(report.expertsSkipped).toBe(1)
    expect(backend.created).toBe(0)
    expect(backend.experts).toHaveLength(1)
  })
})
