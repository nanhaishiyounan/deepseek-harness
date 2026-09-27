/**
 * The approval engine's tool-side behavior: the shared rules module's full
 * transition table (amount-threshold routing, anchors, the illegal-transition
 * and gate refusal messages), parseNbApproveArgs' refusals, and — over the
 * mock NocoBase with the pilot wfl_* tables seeded — the nb_approve full
 * chain (submit → pending with todo + audit record → approve → effective
 * write-back), the level-2 routing, reject→resubmit attempt+1, the repeat-act
 * refusal, the nb_create downstream gate, and the nb_update edit lock.
 */

import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolNocoBase from '../src/index.ts'
import {
  DOC_STATUS_ANCHORS,
  DEFAULT_AMOUNT_THRESHOLD,
  conditionApplies,
  illegalTransitionMessage,
  nextStateOf,
  parseNbApproveArgs,
  thresholdOf,
} from '../src/index.ts'

const signal = new AbortController().signal
const NC_TOKEN = 'approval-spec-token'
const KEY_ENV = 'TOOL_NC_APPROVAL_KEY'

interface MockServer {
  url: string
  readonly rows: Map<string, Array<Record<string, unknown>>>
  close: () => Promise<void>
}

/**
 * Boot the mock NocoBase with the pilot approval world: the wfl_* tables
 * (seeded like nocobase-w1-approval.mts plants them), two purchase orders,
 * and the receipts collection the gate binds.
 */
async function bootMock(): Promise<MockServer> {
  const rows = new Map<string, Array<Record<string, unknown>>>([
    ['wfl_flow_configs', [
      { id: 1, doc_type: 'hub_po_purchase_orders', title: '采购订单审批', state_field: 'doc_status', is_active: true, approver_map: '{"manager":"admin","gm":"admin"}', extras: '{"approved_by_field":"approved_by","approved_at_field":"approved_at"}' },
      { id: 2, doc_type: 'srm_suppliers', title: '供应商准入审批', state_field: 'lifecycle_status', is_active: true, approver_map: '{"srm_manager":"admin"}', extras: '{"approved_at_field":"admitted_at"}' },
      { id: 3, doc_type: 'pur_orders', title: '采购订单审批(B5)', state_field: 'doc_status', is_active: true, approver_map: '{"manager":["admin","quality_lead"],"gm":"admin"}', extras: '{"approved_by_field":"approved_by","approved_at_field":"approved_at","amount_field":"amount","amount_threshold":200000}' },
    ]],
    ['wfl_flow_states', []],
    ['wfl_flow_transitions', [
      { id: 1, flow_id: 1, state: 'draft', action: 'submit', next_state: 'pending', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
      { id: 2, flow_id: 1, state: 'rejected', action: 'resubmit', next_state: 'pending', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
      { id: 3, flow_id: 1, state: 'pending', action: 'approve', next_state: 'approved', allowed_role: 'manager', condition_expr: `total <= ${DEFAULT_AMOUNT_THRESHOLD}`, allow_self_approval: true },
      { id: 4, flow_id: 1, state: 'pending', action: 'approve', next_state: 'pending_level2', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
      { id: 5, flow_id: 1, state: 'pending_level2', action: 'approve', next_state: 'approved', allowed_role: 'gm', condition_expr: '', allow_self_approval: true },
      { id: 6, flow_id: 1, state: 'pending', action: 'reject', next_state: 'rejected', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
      { id: 7, flow_id: 1, state: 'pending_level2', action: 'reject', next_state: 'rejected', allowed_role: 'gm', condition_expr: '', allow_self_approval: true },
      { id: 8, flow_id: 1, state: 'approved', action: 'void', next_state: 'void', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
      { id: 9, flow_id: 2, state: 'potential', action: 'submit', next_state: 'reviewing', allowed_role: 'srm_manager', condition_expr: '', allow_self_approval: true },
      { id: 10, flow_id: 2, state: 'rejected', action: 'resubmit', next_state: 'reviewing', allowed_role: 'srm_manager', condition_expr: '', allow_self_approval: true },
      { id: 11, flow_id: 2, state: 'reviewing', action: 'approve', next_state: 'qualified', allowed_role: 'srm_manager', condition_expr: '', allow_self_approval: true },
      { id: 12, flow_id: 2, state: 'reviewing', action: 'reject', next_state: 'rejected', allowed_role: 'srm_manager', condition_expr: '', allow_self_approval: true },
      // The B5 configured flow: amount routing on the pur_orders amount column
      // with a 200_000 threshold from extras and a two-person manager tier.
      { id: 13, flow_id: 3, state: 'draft', action: 'submit', next_state: 'pending', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
      { id: 14, flow_id: 3, state: 'rejected', action: 'resubmit', next_state: 'pending', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
      { id: 15, flow_id: 3, state: 'pending', action: 'approve', next_state: 'approved', allowed_role: 'manager', condition_expr: 'amount <= 200000', allow_self_approval: true },
      { id: 16, flow_id: 3, state: 'pending', action: 'approve', next_state: 'pending_level2', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
      { id: 17, flow_id: 3, state: 'pending_level2', action: 'approve', next_state: 'approved', allowed_role: 'gm', condition_expr: '', allow_self_approval: true },
      { id: 18, flow_id: 3, state: 'pending', action: 'reject', next_state: 'rejected', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
      { id: 19, flow_id: 3, state: 'pending_level2', action: 'reject', next_state: 'rejected', allowed_role: 'gm', condition_expr: '', allow_self_approval: true },
      { id: 20, flow_id: 3, state: 'approved', action: 'void', next_state: 'void', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
    ]],
    ['wfl_approval_records', []],
    ['wfl_approval_todos', []],
    ['users', [
      { id: 1, username: 'admin', nickname: '管理员' },
      { id: 2, username: 'quality_lead', nickname: '质量主管' },
    ]],
    ['wfl_gate_configs', [
      { id: 1, downstream_collection: 'wms_receipts', upstream_collection: 'hub_po_purchase_orders', upstream_field: 'source_no', upstream_ref_field: 'po_number', upstream_label: '采购单', required_status: 'approved' },
      { id: 2, downstream_collection: 'hub_po_purchase_orders', upstream_collection: 'srm_suppliers', upstream_field: 'supplier_id', upstream_ref_field: null, upstream_label: '供应商', upstream_state_field: 'lifecycle_status', required_status: 'qualified,preferred' },
    ]],
    ['hub_po_purchase_orders', [
      { id: 21, po_number: 'PO-TEST-1', total: 16_000, doc_status: 'draft', approved_by: null, approved_at: null },
      { id: 22, po_number: 'PO-TEST-2', total: 250_000, doc_status: 'draft', approved_by: null, approved_at: null },
    ]],
    ['pur_orders', [
      { id: 41, code: 'PO-B5-A', amount: 150_000, doc_status: 'draft', approved_by: null, approved_at: null },
      { id: 42, code: 'PO-B5-B', amount: 250_000, doc_status: 'draft', approved_by: null, approved_at: null },
    ]],
    ['wms_receipts', []],
    ['srm_suppliers', [
      { id: 31, name: '新味源', code: 'SUP-2026-0001', lifecycle_status: 'potential', source: 'internal', admitted_at: null },
      { id: 32, name: '珠海鲜丰水产科技有限公司', code: 'SUP-001', lifecycle_status: 'qualified', source: 'invited', admitted_at: '2026-07-01' },
      { id: 33, name: '优选包材厂', code: 'SUP-002', lifecycle_status: 'preferred', source: 'invited', admitted_at: '2026-08-01' },
    ]],
  ])
  let idSeq = 100
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://mock-nocobase')
    const finish = (status: number, payload: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload))
    }
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const raw = Buffer.concat(chunks)
      const body = raw.length === 0 ? undefined : JSON.parse(raw.toString('utf8')) as unknown
      if (request.headers.authorization !== `Bearer ${NC_TOKEN}`) {
        finish(401, { error: { code: 'INVALID_TOKEN' } })
        return
      }
      const listMatch = /^\/api\/([^/:]+):list$/u.exec(url.pathname)
      if (request.method === 'GET' && listMatch !== null) {
        const collection = rows.get(listMatch[1] ?? '')
        if (collection === undefined) {
          finish(404, { error: { code: 'NOT_FOUND' } })
          return
        }
        let filtered = [...collection]
        const filterRaw = url.searchParams.get('filter')
        if (filterRaw !== null) {
          const filter = JSON.parse(filterRaw) as Record<string, unknown>
          filtered = filtered.filter(row => Object.entries(filter).every(([field, cell]) => row[field] === cell))
        }
        const pageSize = Number(url.searchParams.get('pageSize') ?? 20)
        finish(200, { data: filtered.slice(0, pageSize), meta: { count: filtered.length, page: 1, pageSize } })
        return
      }
      const createMatch = /^\/api\/([^/:]+):create$/u.exec(url.pathname)
      if (request.method === 'POST' && createMatch !== null) {
        const collection = rows.get(createMatch[1] ?? '')
        if (collection === undefined || typeof body !== 'object' || body === null) {
          finish(404, { error: { code: 'NOT_FOUND' } })
          return
        }
        const created = { ...(body as Record<string, unknown>), id: ++idSeq }
        collection.push(created)
        finish(200, { data: created })
        return
      }
      const updateMatch = /^\/api\/([^/:]+):update$/u.exec(url.pathname)
      if (request.method === 'POST' && updateMatch !== null) {
        const collection = rows.get(updateMatch[1] ?? '')
        const byTk = url.searchParams.get('filterByTk')
        const row = collection?.find(entry => String(entry.id) === byTk)
        if (row === undefined || typeof body !== 'object' || body === null) {
          finish(404, { error: { code: 'NOT_FOUND' } })
          return
        }
        Object.assign(row, body as Record<string, unknown>)
        finish(200, { data: [row] })
        return
      }
      const getMatch = /^\/api\/([^/]+)\/([^/]+)$/u.exec(url.pathname)
      if (request.method === 'GET' && getMatch !== null) {
        const collection = rows.get(getMatch[1] ?? '')
        const row = collection?.find(entry => String(entry.id) === getMatch[2])
        finish(200, { data: row ?? null })
        return
      }
      finish(404, { error: { code: 'NOT_FOUND' } })
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock server has no address')
  return { url: `http://127.0.0.1:${address.port}`, rows, close: () => new Promise<void>((resolve) => { server.close(() => { resolve() }) }) }
}

const contexts: Context[] = []
const servers: Array<{ close: () => Promise<void> }> = []

afterEach(async () => {
  Reflect.deleteProperty(process.env, KEY_ENV)
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(servers.splice(0).map(server => server.close()))
})

let counter = 0

/** Mount the suite over one fresh mock world. */
interface ExecuteResult {
  isError: boolean
  value: unknown
  text: string
}

/** One mounted suite: the execute sink and the mock world it runs over. */
interface Mount {
  execute: (name: string, args: unknown) => Promise<ExecuteResult>
  mock: MockServer
}

async function mount(): Promise<Mount> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const mock = await bootMock()
  servers.push(mock)
  process.env[KEY_ENV] = NC_TOKEN
  await ctx.plugin(ToolNocoBase, { baseUrl: mock.url, apiKeyEnv: KEY_ENV })
  const execute = async (name: string, args: unknown) => {
    const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
    const text = result.content.find(block => block.type === 'text')
    return { isError: result.isError, value: result.value, text: text?.type === 'text' ? text.text : '' }
  }
  return { execute, mock }
}

describe('approval rules (the shared single source)', () => {
  it('resolves the full transition table including the amount-threshold route', () => {
    expect(nextStateOf('draft', 'submit', undefined)).toBe('pending')
    expect(nextStateOf('pending', 'approve', 90_000)).toBe('approved')
    expect(nextStateOf('pending', 'approve', DEFAULT_AMOUNT_THRESHOLD)).toBe('approved')
    expect(nextStateOf('pending', 'approve', DEFAULT_AMOUNT_THRESHOLD + 1)).toBe('pending_level2')
    expect(nextStateOf('pending_level2', 'approve', 900_000)).toBe('approved')
    expect(nextStateOf('pending', 'reject', 1)).toBe('rejected')
    expect(nextStateOf('pending_level2', 'reject', 1)).toBe('rejected')
    expect(nextStateOf('rejected', 'resubmit', undefined)).toBe('pending')
    expect(nextStateOf('approved', 'void', 1)).toBe('void')
  })

  it('refuses illegal transitions and maps the anchors', () => {
    expect(nextStateOf('draft', 'approve', 1)).toBeUndefined()
    expect(nextStateOf('approved', 'submit', undefined)).toBeUndefined()
    expect(nextStateOf('void', 'approve', 1)).toBeUndefined()
    expect(illegalTransitionMessage('approved', 'submit')).toContain('非法审批转移')
    expect(DOC_STATUS_ANCHORS.draft).toBe(0)
    expect(DOC_STATUS_ANCHORS.pending_level2).toBe(0)
    expect(DOC_STATUS_ANCHORS.approved).toBe(1)
    expect(DOC_STATUS_ANCHORS.void).toBe(2)
  })

  it('evaluates the restricted condition DSL and fails loud on anything else', () => {
    expect(conditionApplies('total <= 100000', { total: 99_999 })).toBe(true)
    expect(conditionApplies('total <= 100000', { total: 100_001 })).toBe(false)
    expect(conditionApplies('total > 100000', { total: 100_001 })).toBe(true)
    expect(conditionApplies(undefined, {})).toBe(true)
    expect(() => conditionApplies('total >= 1', { total: 5 })).toThrow('审批条件表达式不支持')
    expect(() => conditionApplies('total <= 100000', { total: 'abc' })).toThrow('不是数字')
  })

  it('parses nb_approve arguments with refusals and the approver default', () => {
    expect(() => parseNbApproveArgs({ doc_type: 'hub_po_purchase_orders', doc_id: 1, action: 'approve', tenant: 'x' })).toThrow('not accepted')
    expect(() => parseNbApproveArgs({ doc_type: '', doc_id: 1, action: 'approve' })).toThrow('non-empty')
    expect(() => parseNbApproveArgs({ doc_type: 'x', doc_id: 0, action: 'approve' })).toThrow('positive integer')
    expect(() => parseNbApproveArgs({ doc_type: 'x', doc_id: 1, action: 'destroy' as never })).toThrow('submit/approve/reject/void')
    expect(parseNbApproveArgs({ doc_type: 'x', doc_id: 1, action: 'approve' })).toMatchObject({ approver: 'admin' })
    expect(parseNbApproveArgs({ doc_type: 'x', doc_id: 1, action: 'reject', comment: ' 资质不全 ', approver: 'chenliqun' }))
      .toMatchObject({ comment: '资质不全', approver: 'chenliqun' })
  })
})

describe('nb_approve over the mock engine world', () => {
  it('runs submit → approve with the todo, audit record, and effective write-back', async () => {
    const { execute, mock } = await mount()
    const submit = await execute('nb_approve', { doc_type: 'hub_po_purchase_orders', doc_id: 21, action: 'submit', approver: 'chenliqun' })
    expect(submit.isError).toBe(false)
    expect(submit.value).toMatchObject({ from_state: 'draft', to_state: 'pending', attempt_no: 1, effective: false })
    expect(mock.rows.get('hub_po_purchase_orders')?.find(row => row.id === 21)).toMatchObject({ doc_status: 'pending' })
    expect(mock.rows.get('wfl_approval_todos')).toHaveLength(1)
    expect(mock.rows.get('wfl_approval_todos')?.[0]).toMatchObject({ doc_id: 21, user: 'admin', state: 'pending', status: 'open' })

    const approve = await execute('nb_approve', { doc_type: 'hub_po_purchase_orders', doc_id: 21, action: 'approve', approver: 'admin', comment: '同意，按合同执行' })
    expect(approve.isError).toBe(false)
    expect(approve.value).toMatchObject({ from_state: 'pending', to_state: 'approved', to_anchor: 1, effective: true, doc_status: 'approved' })
    expect(approve.text).toContain('待审批 → 已生效')
    expect(mock.rows.get('hub_po_purchase_orders')?.find(row => row.id === 21)).toMatchObject({ doc_status: 'approved', approved_by: 'admin' })
    expect(mock.rows.get('wfl_approval_todos')?.[0]).toMatchObject({ status: 'completed' })
    const records = mock.rows.get('wfl_approval_records') ?? []
    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({ action: 'submit', approver: 'chenliqun', attempt_no: 1, from_anchor: 0, to_anchor: 0, source: 'engine' })
    expect(records[1]).toMatchObject({ action: 'approve', approver: 'admin', comment: '同意，按合同执行', to_anchor: 1 })

    // The repeat act refuses (state-anchored idempotence) without a third record.
    const repeat = await execute('nb_approve', { doc_type: 'hub_po_purchase_orders', doc_id: 21, action: 'approve' })
    expect(repeat.isError).toBe(true)
    expect(repeat.text).toContain('非法审批转移')
    expect(mock.rows.get('wfl_approval_records')).toHaveLength(2)
  })

  it('routes over-threshold approvals to the level-2 sign-off', async () => {
    const { execute, mock } = await mount()
    await execute('nb_approve', { doc_type: 'hub_po_purchase_orders', doc_id: 22, action: 'submit' })
    const first = await execute('nb_approve', { doc_type: 'hub_po_purchase_orders', doc_id: 22, action: 'approve', comment: '金额超限，报总经理加签' })
    expect(first.value).toMatchObject({ to_state: 'pending_level2', to_anchor: 0, effective: false })
    expect(mock.rows.get('wfl_approval_todos')?.filter(todo => todo.status === 'open')).toHaveLength(1)
    expect(mock.rows.get('wfl_approval_todos')?.find(todo => todo.status === 'open')).toMatchObject({ state: 'pending_level2', user: 'admin' })
    const second = await execute('nb_approve', { doc_type: 'hub_po_purchase_orders', doc_id: 22, action: 'approve', comment: '二级通过' })
    expect(second.value).toMatchObject({ from_state: 'pending_level2', to_state: 'approved', to_anchor: 1, effective: true })
  })

  it('rejects then resubmits with attempt_no+1, and locks edits on pending/approved rows', async () => {
    const { execute, mock } = await mount()
    await execute('nb_approve', { doc_type: 'hub_po_purchase_orders', doc_id: 21, action: 'submit' })
    const reject = await execute('nb_approve', { doc_type: 'hub_po_purchase_orders', doc_id: 21, action: 'reject', comment: '供应商资质不全' })
    expect(reject.value).toMatchObject({ to_state: 'rejected', to_anchor: 0 })
    expect(mock.rows.get('hub_po_purchase_orders')?.find(row => row.id === 21)).toMatchObject({ doc_status: 'rejected' })
    // Rejected rows stay editable (the revise-and-resubmit path).
    const editRejected = await execute('nb_update', { collection: 'hub_po_purchase_orders', id: 21, values: { total: 15_000 } })
    expect(editRejected.isError).toBe(false)
    const resubmit = await execute('nb_approve', { doc_type: 'hub_po_purchase_orders', doc_id: 21, action: 'submit' })
    expect(resubmit.value).toMatchObject({ to_state: 'pending', attempt_no: 2 })
    // Pending locks edits; a plain field change refuses with the lock message.
    const editPending = await execute('nb_update', { collection: 'hub_po_purchase_orders', id: 21, values: { total: 1 } })
    expect(editPending.isError).toBe(true)
    expect(editPending.text).toContain('锁定编辑')
  })

  it('gates downstream nb_create on the upstream document being effective', async () => {
    const { execute, mock } = await mount()
    const blocked = await execute('nb_create', { collection: 'wms_receipts', values: { receipt_no: 'RCV-GATE-1', source_no: 'PO-TEST-1', qty: 10 } })
    expect(blocked.isError).toBe(true)
    expect(blocked.text).toContain('未生效')
    expect(mock.rows.get('wms_receipts')).toHaveLength(0)
    const missing = await execute('nb_create', { collection: 'wms_receipts', values: { receipt_no: 'RCV-GATE-2', source_no: 'PO-TEST-404', qty: 10 } })
    expect(missing.isError).toBe(true)
    expect(missing.text).toContain('未生效')
    // A receipt without a source reference does not bind the gate.
    const unbound = await execute('nb_create', { collection: 'wms_receipts', values: { receipt_no: 'RCV-GATE-3', qty: 5 } })
    expect(unbound.isError).toBe(false)
    // Approving the purchase order opens the gate.
    await execute('nb_approve', { doc_type: 'hub_po_purchase_orders', doc_id: 21, action: 'submit' })
    await execute('nb_approve', { doc_type: 'hub_po_purchase_orders', doc_id: 21, action: 'approve' })
    const pass = await execute('nb_create', { collection: 'wms_receipts', values: { receipt_no: 'RCV-GATE-4', source_no: 'PO-TEST-1', qty: 10 } })
    expect(pass.isError).toBe(false)
    expect(mock.rows.get('wms_receipts')?.find(row => row.receipt_no === 'RCV-GATE-4')).toMatchObject({ source_no: 'PO-TEST-1' })
  })
})

describe('the supplier-admission flow (B2)', () => {
  it('runs potential → reviewing → qualified with admitted_at, locking edits under review', async () => {
    const { execute, mock } = await mount()
    const submit = await execute('nb_approve', { doc_type: 'srm_suppliers', doc_id: 31, action: 'submit', approver: 'chenliqun' })
    expect(submit.isError).toBe(false)
    expect(submit.value).toMatchObject({ from_state: 'potential', to_state: 'reviewing', to_anchor: 0, effective: false })
    expect(mock.rows.get('srm_suppliers')?.find(row => row.id === 31)).toMatchObject({ lifecycle_status: 'reviewing' })
    expect(mock.rows.get('wfl_approval_todos')?.[0]).toMatchObject({ doc_type: 'srm_suppliers', doc_id: 31, user: 'admin', state: 'reviewing', status: 'open' })
    // The档案 is locked while under review.
    const editReviewing = await execute('nb_update', { collection: 'srm_suppliers', id: 31, values: { contact: '王五' } })
    expect(editReviewing.isError).toBe(true)
    expect(editReviewing.text).toContain('锁定编辑')
    const approve = await execute('nb_approve', { doc_type: 'srm_suppliers', doc_id: 31, action: 'approve', approver: 'admin', comment: '资质齐全，同意准入' })
    expect(approve.isError).toBe(false)
    expect(approve.value).toMatchObject({ from_state: 'reviewing', to_state: 'qualified', to_anchor: 1, effective: true })
    expect(approve.text).toContain('准入评审中 → 合格')
    expect(mock.rows.get('srm_suppliers')?.find(row => row.id === 31)).toMatchObject({ lifecycle_status: 'qualified' })
    expect(typeof (mock.rows.get('srm_suppliers')?.find(row => row.id === 31) as { admitted_at?: unknown }).admitted_at).toBe('string')
    const records = (mock.rows.get('wfl_approval_records') ?? []).filter(record => record.doc_type === 'srm_suppliers')
    expect(records).toHaveLength(2)
    expect(records[1]).toMatchObject({ action: 'approve', approver: 'admin', to_state: 'qualified', to_anchor: 1 })
    // Qualified suppliers stay editable (档案维护 is lifecycle management, not the doc lock).
    const editQualified = await execute('nb_update', { collection: 'srm_suppliers', id: 31, values: { contact: '王五' } })
    expect(editQualified.isError).toBe(false)
  })

  it('refuses an illegal admission action with the admission vocabulary message', async () => {
    const { execute } = await mount()
    const denied = await execute('nb_approve', { doc_type: 'srm_suppliers', doc_id: 31, action: 'void' })
    expect(denied.isError).toBe(true)
    expect(denied.text).toContain('非法准入转移')
  })

  it('gates PO creation on the supplier lifecycle set (qualified/preferred)', async () => {
    const { execute, mock } = await mount()
    const blocked = await execute('nb_create', { collection: 'hub_po_purchase_orders', values: { po_number: 'PO-SUP-GATE-1', supplier_id: 31, total: 9_000 } })
    expect(blocked.isError).toBe(true)
    expect(blocked.text).toContain('未准入')
    expect(blocked.text).toContain('不合格供方')
    expect(mock.rows.get('hub_po_purchase_orders')?.find(row => row.po_number === 'PO-SUP-GATE-1')).toBeUndefined()
    const qualified = await execute('nb_create', { collection: 'hub_po_purchase_orders', values: { po_number: 'PO-SUP-GATE-2', supplier_id: 32, total: 9_000 } })
    expect(qualified.isError).toBe(false)
    const preferred = await execute('nb_create', { collection: 'hub_po_purchase_orders', values: { po_number: 'PO-SUP-GATE-3', supplier_id: 33, total: 9_000 } })
    expect(preferred.isError).toBe(false)
    // Admitting the potential supplier opens the gate.
    await execute('nb_approve', { doc_type: 'srm_suppliers', doc_id: 31, action: 'submit' })
    await execute('nb_approve', { doc_type: 'srm_suppliers', doc_id: 31, action: 'approve' })
    const admitted = await execute('nb_create', { collection: 'hub_po_purchase_orders', values: { po_number: 'PO-SUP-GATE-4', supplier_id: 31, total: 9_000 } })
    expect(admitted.isError).toBe(false)
  })
})

describe('approval config: thresholds and multi-approver routing (B5)', () => {
  it('resolves the amount threshold from flow extras with the default fallback', () => {
    expect(thresholdOf({ amount_threshold: 200_000 })).toBe(200_000)
    expect(thresholdOf({ amount_threshold: 0.5 })).toBe(0.5)
    expect(thresholdOf({})).toBe(DEFAULT_AMOUNT_THRESHOLD)
    expect(thresholdOf(null)).toBe(DEFAULT_AMOUNT_THRESHOLD)
    expect(thresholdOf(undefined)).toBe(DEFAULT_AMOUNT_THRESHOLD)
    expect(thresholdOf({ approved_by_field: 'approved_by' })).toBe(DEFAULT_AMOUNT_THRESHOLD)
  })

  it('fails loud on an invalid amount_threshold value', () => {
    expect(() => thresholdOf({ amount_threshold: 'abc' })).toThrow('amount_threshold')
    expect(() => thresholdOf({ amount_threshold: '200000' })).toThrow('amount_threshold')
    expect(() => thresholdOf({ amount_threshold: 0 })).toThrow('amount_threshold')
    expect(() => thresholdOf({ amount_threshold: -1 })).toThrow('amount_threshold')
    expect(() => thresholdOf({ amount_threshold: Number.NaN })).toThrow('amount_threshold')
  })

  it('routes approve by the configured threshold, keeping the default behavior unchanged', () => {
    expect(nextStateOf('pending', 'approve', 150_000, 200_000)).toBe('approved')
    expect(nextStateOf('pending', 'approve', 200_000, 200_000)).toBe('approved')
    expect(nextStateOf('pending', 'approve', 200_001, 200_000)).toBe('pending_level2')
    // Omitted threshold = the DEFAULT_AMOUNT_THRESHOLD fallback (the W-round behavior).
    expect(nextStateOf('pending', 'approve', 150_000)).toBe('pending_level2')
    expect(nextStateOf('pending', 'approve', DEFAULT_AMOUNT_THRESHOLD)).toBe('approved')
    expect(nextStateOf('pending', 'approve', DEFAULT_AMOUNT_THRESHOLD + 1)).toBe('pending_level2')
  })

  it('routes the configured pur_orders flow: 150k lands one round, 250k routes to the level-2 sign-off', async () => {
    const { execute, mock } = await mount()
    // The 150k document: one approval round on the 200k threshold.
    await execute('nb_approve', { doc_type: 'pur_orders', doc_id: 41, action: 'submit', approver: '陈立群' })
    const first = await execute('nb_approve', { doc_type: 'pur_orders', doc_id: 41, action: 'approve', approver: 'quality_lead', comment: '15 万 ≤ 20 万阈值，一审生效' })
    expect(first.isError).toBe(false)
    expect(first.value).toMatchObject({ from_state: 'pending', to_state: 'approved', effective: true })
    expect(mock.rows.get('pur_orders')?.find(row => row.id === 41)).toMatchObject({ doc_status: 'approved', approved_by: 'quality_lead' })
    // The 250k document: the first approval routes to pending_level2, gm signs off.
    await execute('nb_approve', { doc_type: 'pur_orders', doc_id: 42, action: 'submit', approver: '陈立群' })
    const routed = await execute('nb_approve', { doc_type: 'pur_orders', doc_id: 42, action: 'approve', approver: 'admin', comment: '25 万超阈值，报总经理加签' })
    expect(routed.value).toMatchObject({ to_state: 'pending_level2', effective: false })
    const second = await execute('nb_approve', { doc_type: 'pur_orders', doc_id: 42, action: 'approve', approver: 'admin', comment: '二级通过' })
    expect(second.value).toMatchObject({ from_state: 'pending_level2', to_state: 'approved', effective: true })
  })

  it('expands the two-person manager tier into one todo per approver and closes both on either act', async () => {
    const { execute, mock } = await mount()
    await execute('nb_approve', { doc_type: 'pur_orders', doc_id: 41, action: 'submit', approver: '陈立群' })
    const open = mock.rows.get('wfl_approval_todos')?.filter(todo => todo.status === 'open' && todo.doc_id === 41) ?? []
    expect(open).toHaveLength(2)
    expect(open.map(todo => todo.user).sort()).toEqual(['admin', 'quality_lead'])
    expect(open.every(todo => todo.state === 'pending')).toBe(true)
    // Either approver's act completes the whole tier's todos and records that approver.
    const approve = await execute('nb_approve', { doc_type: 'pur_orders', doc_id: 41, action: 'approve', approver: 'quality_lead' })
    expect(approve.value).toMatchObject({ to_state: 'approved' })
    const tierTodos = mock.rows.get('wfl_approval_todos')?.filter(todo => todo.doc_id === 41) ?? []
    expect(tierTodos.every(todo => todo.status === 'completed')).toBe(true)
    const records = mock.rows.get('wfl_approval_records')?.filter(record => record.doc_type === 'pur_orders' && record.doc_id === 41) ?? []
    expect(records).toHaveLength(2)
    expect(records[1]).toMatchObject({ action: 'approve', approver: 'quality_lead', to_state: 'approved' })
  })

  it('fails loud on an approver_map naming a user the users table lacks', async () => {
    const { execute, mock } = await mount()
    const flow = mock.rows.get('wfl_flow_configs')?.find(row => row.doc_type === 'pur_orders')
    if (flow === undefined) throw new Error('pur_orders flow config missing from the mock world')
    flow['approver_map'] = '{"manager":["admin","ghost"],"gm":"admin"}'
    const refused = await execute('nb_approve', { doc_type: 'pur_orders', doc_id: 41, action: 'submit', approver: '陈立群' })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('不存在的用户')
    expect(refused.text).toContain('ghost')
    expect(mock.rows.get('wfl_approval_todos')).toHaveLength(0)
  })

  it('fails loud on a malformed amount_threshold in flow extras', async () => {
    const { execute, mock } = await mount()
    const flow = mock.rows.get('wfl_flow_configs')?.find(row => row.doc_type === 'pur_orders')
    if (flow === undefined) throw new Error('pur_orders flow config missing from the mock world')
    flow['extras'] = '{"approved_by_field":"approved_by","approved_at_field":"approved_at","amount_field":"amount","amount_threshold":"abc"}'
    const refused = await execute('nb_approve', { doc_type: 'pur_orders', doc_id: 41, action: 'submit', approver: '陈立群' })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('amount_threshold')
    expect(mock.rows.get('wfl_approval_todos')).toHaveLength(0)
  })
})
