/**
 * Keyless F-series regression specs over the shared flow-page library and
 * the F2 heal logic: the prefix/ownership scoping that keeps truncated-page
 * detection honest, the interrupted-rerun teardown path, and the rollback
 * record merge. All NocoBase traffic is a recorded fetch stub, so the specs
 * run without a server or key.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  batchScopedRows, blockOwnedByPage, gridOwnerRoutes, loadRollbackRecords, writeRollbackRecord,
} from '../scripts/nocobase-flow-page-lib.mts'
import type { FlowModelRow, RouteRow } from '../scripts/nocobase-flow-page-lib.mts'
import { CRM_PAGES, healTruncatedPages } from '../scripts/nocobase-f2-crm-v2.mts'


/** Minimal flowModel rows: the 销售仪表盘 table lives in another page's tree; 回款 owns none. */
const table = (uid: string, parentGrid: string, collection: string) => ({
  uid,
  use: 'TableBlockModel',
  parentId: parentGrid,
  stepParams: { resourceSettings: { init: { collectionName: collection, dataSourceKey: 'main' } } },
})
const grid = (uid: string, parentTab: string) => ({ uid, use: 'BlockGridModel', parentId: parentTab })
const addNew = (uid: string, parentUid: string, collection: string) => ({
  uid,
  use: 'AddNewActionModel',
  parentId: parentUid,
  stepParams: { resourceSettings: { init: { collectionName: collection, dataSourceKey: 'main' } } },
})

describe('batch scoping keeps the completeness check inside this batch and page', () => {
  const ROUTE_HUIKUAN = { id: 1, title: '回款', parentId: null, type: 'flowPage', schemaUid: 'n17f2route1' }
  const ROUTE_DASH = { id: 2, title: '销售仪表盘', parentId: null, type: 'flowPage', schemaUid: 'n17f2route2' }
  const ROUTES = [
    ROUTE_HUIKUAN, ROUTE_DASH,
    { id: 11, title: null, parentId: 1, type: 'tabs', schemaUid: 'n17f2tab1' },
    { id: 22, title: null, parentId: 2, type: 'tabs', schemaUid: 'n17f2tab2' },
  ]
  const ROWS = [
    // 销售仪表盘's own table (same batch, same collection, DIFFERENT page)
    grid('n17f2g2', 'n17f2tab2'),
    table('n17f2tb2', 'n17f2g2', 'crm_payments'),
    // E1's 客户 table on crm_customers (no n17f2 prefix)
    grid('n17g1', 'n17tab0'),
    table('n17tb1', 'n17g1', 'crm_customers'),
    // F3's table on crm_payments (wrong prefix)
    table('n17f3tb1', 'n17f3g1', 'crm_payments'),
  ]

  it('batchScopedRows returns only this batch-prefixed rows for the collection', () => {
    const rows = batchScopedRows(ROWS, { use: 'TableBlockModel', collection: 'crm_payments', uidPrefix: 'n17f2' })
    expect(rows.map(row => String(row.uid))).toEqual(['n17f2tb2'])
    const crmCustomers = batchScopedRows(ROWS, { use: 'TableBlockModel', collection: 'crm_customers', uidPrefix: 'n17f2' })
    expect(crmCustomers).toEqual([])
  })

  it('blockOwnedByPage rejects a same-collection sibling page table (the 回款 false-complete trap)', () => {
    const owners = gridOwnerRoutes(ROWS, ROUTES)
    expect(owners.get('n17f2g2')).toBe('n17f2route2')
    // 回款's spine check must NOT accept 销售仪表盘's table even though it is n17f2 + crm_payments.
    expect(blockOwnedByPage(table('n17f2tb2', 'n17f2g2', 'crm_payments'), owners, 'n17f2route1')).toBe(false)
    expect(blockOwnedByPage(table('n17f2tb2', 'n17f2g2', 'crm_payments'), owners, 'n17f2route2')).toBe(true)
  })

  it('gridOwnerRoutes maps a grid to its owning flowPage route schemaUid via the tabs row', () => {
    const owners = gridOwnerRoutes(
      [grid('n17f2g1', 'n17f2tab1'), grid('n17f2g2', 'n17f2tab2')],
      ROUTES,
    )
    expect(owners.get('n17f2g1')).toBe('n17f2route1')
    expect(owners.get('n17f2g2')).toBe('n17f2route2')
  })
})

describe('an interrupted rerun tears the batch down instead of keeping the truncated page', () => {
  interface RecordedCall { readonly method: string; readonly path: string; readonly body?: unknown }

  /** Mutable server double: flowModels rows/routes plus every recorded mutation. */
  function stubServer(startRows: FlowModelRow[], startRoutes: RouteRow[]): { calls: () => RecordedCall[] } {
    const calls: RecordedCall[] = []
    let nextId = 100
    const popupTree = {
      uid: 'popup1', use: 'ChildPageModel',
      subModels: { tabs: [{ use: 'ChildPageTabModel', subModels: { grid: { use: 'BlockGridModel', subModels: { items: [{
        uid: 'form1', use: 'CreateFormModel',
        subModels: { actions: [{ uid: 'submit-form1', use: 'FormSubmitActionModel' }] },
      } ] } } } }] },
    }
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(typeof input === 'string' ? input : input.href)
      const path = url.pathname
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined
      calls.push({ method: init?.method ?? 'GET', path, body })
      const json = (data: unknown, meta?: Record<string, unknown>) =>
        new Response(JSON.stringify({ data, ...(meta === undefined ? {} : { meta }) }), { status: 200 })
      if (path === '/api/flowModels:list') return json(startRows, { total: startRows.length })
      if (path === '/api/desktopRoutes:list') return json(startRoutes, { total: startRoutes.length })
      if (path === '/api/flowModels:findOne') return json(popupTree)
      if (path === '/api/flowModels:destroy') {
        const uid = url.searchParams.get('filterByTk')
        const index = startRows.findIndex(row => row.uid === uid)
        if (index >= 0) startRows.splice(index, 1)
        return json('ok')
      }
      if (path === '/api/desktopRoutes:destroy') {
        const id = Number(url.searchParams.get('filterByTk'))
        const index = startRoutes.findIndex(row => row.id === id)
        if (index >= 0) startRoutes.splice(index, 1)
        return json('ok')
      }
      if (path === '/api/desktopRoutes:create') return json({ id: nextId++ })
      throw new Error(`unexpected fetch ${init?.method ?? 'GET'} ${path}`)
    }))
    return { calls: () => calls }
  }

  afterEach(() => vi.unstubAllGlobals())

  it('heals a truncated 回款 while 销售仪表盘 keeps its crm_payments table', async () => {
    // Server state: both flowPages exist; only 销售仪表盘 has a crm_payments
    // table — the exact interrupted-first-run shape that used to false-pass.
    const routes: RouteRow[] = [
      { id: 2, title: '销售仪表盘', parentId: null, type: 'flowPage', schemaUid: 'n17f2r2' },
      { id: 3, title: '回款', parentId: null, type: 'flowPage', schemaUid: 'n17f2r1' },
      { id: 20, title: null, parentId: 2, type: 'tabs', schemaUid: 'n17f2t2' },
      { id: 30, title: null, parentId: 3, type: 'tabs', schemaUid: 'n17f2t1' },
    ]
    const models: FlowModelRow[] = [
      grid('n17f2g2', 'n17f2t2'),
      table('n17f2tb2', 'n17f2g2', 'crm_payments'),
      addNew('n17f2an2', 'n17f2tb2', 'crm_payments'),
    ]
    const server = stubServer(models, routes)

    const tore = await healTruncatedPages('token', CRM_PAGES)

    expect(tore).toBe(true)
    const all = server.calls()
    // The truncated page was detected (not kept as already-complete) and the
    // teardown destroyed the surviving n17f2 tree, then rebuilt the v1 rows.
    expect(all.filter(call => call.method === 'POST' && call.path === '/api/flowModels:destroy').length)
      .toBeGreaterThanOrEqual(1)
    const creates = all.filter(call => call.method === 'POST' && call.path === '/api/desktopRoutes:create')
    expect(creates.length).toBeGreaterThanOrEqual(CRM_PAGES.length)
  })
})

describe('rollback records carry every page title of the batch', () => {
  let dir: string
  let recordsPath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'f6-rollback-'))
    recordsPath = join(dir, 'rollback-records.json')
    // A pre-existing unrelated record must survive the batch's merges.
    await writeFile(recordsPath, JSON.stringify([
      { title: '任务看板', parentId: 7, icon: null, sort: 2, schemaUid: 'legacy' },
    ]))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps all five CRM page titles plus the unrelated record, and re-upserts do not duplicate', () => {
    for (const [index, spec] of CRM_PAGES.entries()) {
      writeRollbackRecord(recordsPath, { title: spec.title, parentId: 1, icon: null, sort: index, schemaUid: `u${index}` })
    }
    // A second pass over the same batch is the rerun contract: merge by title.
    const firstPage = CRM_PAGES[0] as { title: string }
    writeRollbackRecord(recordsPath, { title: firstPage.title, parentId: 1, icon: null, sort: 99, schemaUid: 'u0-new' })

    const records = loadRollbackRecords(recordsPath)
    const titles = records.map(record => record.title)
    expect(titles).toEqual(['任务看板', ...CRM_PAGES.map(spec => spec.title)])
    expect(records.find(record => record.title === firstPage.title)?.schemaUid).toBe('u0-new')
  })

  it('writes one trailing newline and readable JSON', async () => {
    writeRollbackRecord(recordsPath, { title: '回款', parentId: null, icon: null, sort: 0, schemaUid: 'x' })
    const raw = await readFile(recordsPath, 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(JSON.parse(raw)).toBeInstanceOf(Array)
  })
})
