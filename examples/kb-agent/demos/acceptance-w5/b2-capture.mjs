/**
 * W5-B2 acceptance screenshot capture: the advanced nodes' five user-visible
 * moments, driven against the real serve (:13110) and the real NocoBase
 * (:13000) — no mocks.
 *
 *   b2-00  the countersign node's property panel (mode=会签， two assignees)
 *   b2-01  the countersign run mid-tier — one todo completed-equivalent state:
 *          the co-signer's open todo while the document stays pending
 *   b2-02  the sequential run — the second assignee's todo opened after the
 *          first signed (one open todo at a time)
 *   b2-03  the rejectTo run — the level-2 reject routed the document back to
 *          tier 1 and its todo reopened
 *   b2-04  the cc todo — the approve fired a read-only kind='cc' row
 *   b2-05  the multi-row condition panel — two structured rows with mixed
 *          operators on the designer canvas
 *
 * The run cleans up after itself: every evidence PO + its todos/records are
 * destroyed (counts disclosed), and the canonical baseline graph is restored
 * + republished.
 *
 * Usage: node examples/kb-agent/demos/acceptance-w5/b2-capture.mjs
 * Needs: approval-engine --serve 13110 running, NocoBase on 13000.
 */
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../apps/web/package.json'))
const { chromium } = require('playwright')

const here = path.dirname(fileURLToPath(import.meta.url))
const serve = 'http://127.0.0.1:13110'
const noco = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const docType = 'hub_po_purchase_orders'
const consoleErrors = []

const getJson = async (urlPath) => await (await fetch(`${serve}${urlPath}`)).json()
const postJson = async (urlPath, body) => {
  const response = await fetch(`${serve}${urlPath}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

/** Root REST token (the same credentials signInWithRetry defaults to). */
const rootToken = async () => {
  const response = await fetch(`${noco}/api/auth:signIn`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com', password: process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123' }),
  })
  const payload = await response.json()
  if (typeof payload?.data?.token !== 'string') throw new Error(`sign-in failed: ${JSON.stringify(payload).slice(0, 200)}`)
  return payload.data.token
}

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
page.on('console', (message) => {
  if (message.type() !== 'error') return
  if (!page.url().startsWith(serve)) return
  consoleErrors.push(message.text())
})
const shot = async (name) => { await page.screenshot({ path: path.join(here, `${name}.png`) }); console.log(`captured ${name}.png`) }

/** Save + publish one graph over the HTTP channel; answers the new version. */
const publishGraph = async (graph) => {
  const before = await getJson(`/flow-graph?doc_type=${docType}`)
  const saved = await postJson('/flow-graph', { doc_type: docType, graph, base_version: Number(before.graph_version) })
  if (saved.status !== 200) throw new Error(`save failed: ${JSON.stringify(saved.body).slice(0, 200)}`)
  const published = await postJson('/flow-graph/publish', { doc_type: docType, base_version: Number(saved.body.graph_version) })
  if (published.status !== 200) throw new Error(`publish failed: ${JSON.stringify(published.body).slice(0, 300)}`)
  return Number(published.body.graph_version)
}

/** Create one draft PO and answer its id. */
const createDraftPo = async (token, code, total) => {
  const response = await fetch(`${noco}/api/hub_po_purchase_orders:create`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ po_number: code, total, order_date: '2026-09-29', doc_status: 'draft' }),
  })
  const payload = await response.json()
  const id = Number(payload?.data?.id ?? payload?.id)
  if (!Number.isInteger(id) || id < 1) throw new Error(`PO create failed: ${JSON.stringify(payload).slice(0, 200)}`)
  return id
}

const node = (id, type, x, y, data) => ({ id, type, position: { x, y }, data })
const edge = (id, source, target) => ({ id, source, target })
const countersignGraph = {
  version: 1,
  nodes: [
    node('s', 'start', 40, 160, { title: '发起人' }),
    node('a1', 'approval', 320, 160, { title: '采购会签', approval: { assigneeType: 'user', assignees: ['admin', 'quality_lead'], mode: 'countersign', emptyPolicy: 'transferAdmin' } }),
    node('e', 'end', 1160, 160, { title: '结束' }),
  ],
  edges: [edge('e1', 's', 'a1'), edge('e2', 'a1', 'e')],
}
const sequentialGraph = {
  version: 1,
  nodes: [
    node('s', 'start', 40, 160, { title: '发起人' }),
    node('a1', 'approval', 320, 160, { title: '依次审批', approval: { assigneeType: 'user', assignees: ['chenliqun', 'admin'], mode: 'sequential', emptyPolicy: 'transferAdmin' } }),
    node('e', 'end', 1160, 160, { title: '结束' }),
  ],
  edges: [edge('e1', 's', 'a1'), edge('e2', 'a1', 'e')],
}
const rejectToGraph = {
  version: 1,
  nodes: [
    node('s', 'start', 40, 160, { title: '发起人' }),
    node('a1', 'approval', 200, 160, { title: '一级审批', approval: { assigneeType: 'user', assignees: ['admin'], mode: 'or', emptyPolicy: 'transferAdmin' } }),
    node('c', 'condition', 480, 60, { title: '金额条件', condition: { join: 'and', rows: [{ field: 'total', op: '>', value: '100' }] } }),
    node('a2', 'approval', 760, 260, { title: '二级审批', approval: { assigneeType: 'user', assignees: ['quality_lead'], mode: 'or', emptyPolicy: 'transferAdmin', rejectTo: 'a1' } }),
    node('e', 'end', 1160, 60, { title: '结束' }),
  ],
  edges: [edge('e1', 's', 'a1'), edge('e2', 'a1', 'c'), edge('e3', 'c', 'a2'), edge('e4', 'c', 'e'), edge('e5', 'a2', 'e')],
}
const ccGraph = {
  version: 1,
  nodes: [
    node('s', 'start', 40, 160, { title: '发起人' }),
    node('a1', 'approval', 320, 160, { title: '采购审批', approval: { assigneeType: 'user', assignees: ['admin'], mode: 'or', emptyPolicy: 'transferAdmin' } }),
    node('ncc', 'cc', 640, 160, { title: '抄送质检', cc: { assignees: ['quality_lead'] } }),
    node('e', 'end', 1160, 160, { title: '结束' }),
  ],
  edges: [edge('e1', 's', 'a1'), edge('e2', 'a1', 'ncc'), edge('e3', 'ncc', 'e')],
}
const multiRowConditionGraph = {
  version: 1,
  nodes: [
    node('s', 'start', 40, 200, { title: '发起人' }),
    node('a1', 'approval', 200, 200, { title: '一级审批', approval: { assigneeType: 'user', assignees: ['admin'], mode: 'or', emptyPolicy: 'transferAdmin' } }),
    node('c', 'condition', 480, 80, { title: '金额区间条件', condition: { join: 'and', rows: [{ field: 'total', op: '>', value: '500' }, { field: 'total', op: '<=', value: '10000' }] } }),
    node('a2', 'approval', 760, 280, { title: '二级审批', approval: { assigneeType: 'user', assignees: ['quality_lead'], mode: 'or', emptyPolicy: 'transferAdmin' } }),
    node('e', 'end', 1160, 80, { title: '结束' }),
  ],
  edges: [edge('e1', 's', 'a1'), edge('e2', 'a1', 'c'), edge('e3', 'c', 'a2'), edge('e4', 'c', 'e'), edge('e5', 'a2', 'e')],
}

// ── baseline: the canonical migrated graph (restored at the end) ──
const baselineGraph = (await getJson(`/flow-graph?doc_type=${docType}`)).graph
const token = await rootToken()
const stamp = Date.now().toString(36)
const evidenceDocs = []

// ── b2-00 + b2-01: countersign — panel shot, then the mid-tier run ──
await publishGraph(countersignGraph)
await page.goto(`${serve}/designer?doc_type=${docType}`)
await page.waitForTimeout(1200)
await page.locator('.react-flow__node', { hasText: '采购会签' }).click()
await page.waitForTimeout(500)
await shot('b2-00-countersign-panel')
const csId = await createDraftPo(token, `PO-W5B2-${stamp}-CS`, 1000)
evidenceDocs.push(csId)
await postJson('/submit', { doc_type: docType, doc_id: csId, approver: 'chenliqun' })
const firstSign = await postJson('/act', { doc_type: docType, doc_id: csId, action: 'approve', approver: 'admin', comment: '会签第一签' })
if (firstSign.body.result?.to_state !== 'pending') throw new Error(`countersign first sign did not hold: ${JSON.stringify(firstSign.body).slice(0, 200)}`)
await page.goto(`${serve}/todos?user=quality_lead`)
await page.waitForTimeout(400)
await shot('b2-01-countersign-run')

// ── b2-02: sequential — the second assignee's todo after the first signed ──
await publishGraph(sequentialGraph)
const seqId = await createDraftPo(token, `PO-W5B2-${stamp}-SEQ`, 1000)
evidenceDocs.push(seqId)
await postJson('/submit', { doc_type: docType, doc_id: seqId, approver: 'qc_inspector' })
const seqFirst = await postJson('/act', { doc_type: docType, doc_id: seqId, action: 'approve', approver: 'chenliqun', comment: '依次第一序' })
if (seqFirst.body.result?.to_state !== 'pending') throw new Error(`sequential first step did not hold: ${JSON.stringify(seqFirst.body).slice(0, 200)}`)
await page.goto(`${serve}/todos?user=admin`)
await page.waitForTimeout(400)
await shot('b2-02-sequential-run')

// ── b2-03: rejectTo — the level-2 reject reopened tier 1 ──
await publishGraph(rejectToGraph)
const rjId = await createDraftPo(token, `PO-W5B2-${stamp}-RJ`, 5000)
evidenceDocs.push(rjId)
await postJson('/submit', { doc_type: docType, doc_id: rjId, approver: 'chenliqun' })
await postJson('/act', { doc_type: docType, doc_id: rjId, action: 'approve', approver: 'admin', comment: '进二级' })
const rejected = await postJson('/act', { doc_type: docType, doc_id: rjId, action: 'reject', approver: 'quality_lead', comment: '退回一级修改' })
if (rejected.body.result?.to_state !== 'pending') throw new Error(`rejectTo did not route back: ${JSON.stringify(rejected.body).slice(0, 200)}`)
await page.goto(`${serve}/todos?user=admin`)
await page.waitForTimeout(400)
await shot('b2-03-reject-to-run')

// ── b2-04: cc — the approve fired the read-only kind='cc' todo ──
await publishGraph(ccGraph)
const ccId = await createDraftPo(token, `PO-W5B2-${stamp}-CC`, 1000)
evidenceDocs.push(ccId)
await postJson('/submit', { doc_type: docType, doc_id: ccId, approver: 'chenliqun' })
const ccApproved = await postJson('/act', { doc_type: docType, doc_id: ccId, action: 'approve', approver: 'admin', comment: '通过并抄送质检' })
if (ccApproved.body.result?.to_state !== 'approved') throw new Error(`cc run did not land approved: ${JSON.stringify(ccApproved.body).slice(0, 200)}`)
await page.goto(`${serve}/todos?user=quality_lead`)
await page.waitForTimeout(400)
await shot('b2-04-cc-todo')

// ── b2-05: the multi-row condition panel on the canvas ──
const before = await getJson(`/flow-graph?doc_type=${docType}`)
const saved = await postJson('/flow-graph', { doc_type: docType, graph: multiRowConditionGraph, base_version: Number(before.graph_version) })
if (saved.status !== 200) throw new Error(`multi-row save failed: ${JSON.stringify(saved.body).slice(0, 200)}`)
await page.goto(`${serve}/designer?doc_type=${docType}`)
await page.waitForTimeout(1200)
await page.locator('.react-flow__node', { hasText: '金额区间条件' }).click()
await page.waitForTimeout(500)
await shot('b2-05-condition-multirow-panel')

// ── cleanup: destroy the evidence POs + their workflow rows, restore + republish the baseline ──
let destroyed = 0
for (const docId of evidenceDocs) {
  for (const collection of ['wfl_approval_todos', 'wfl_approval_records']) {
    const list = await (await fetch(`${noco}/api/${collection}:list?pageSize=50&filter=${encodeURIComponent(JSON.stringify({ doc_type: docType, doc_id: docId }))}`, { headers: { authorization: `Bearer ${token}` } })).json()
    for (const row of list?.data ?? []) {
      await fetch(`${noco}/api/${collection}:destroy?filterByTk=${row.id}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
      destroyed += 1
    }
  }
  await fetch(`${noco}/api/hub_po_purchase_orders:destroy?filterByTk=${docId}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
}
const after = await getJson(`/flow-graph?doc_type=${docType}`)
const restored = await postJson('/flow-graph', { doc_type: docType, graph: baselineGraph, base_version: Number(after.graph_version) })
if (restored.status !== 200) throw new Error(`restore save failed: ${JSON.stringify(restored.body).slice(0, 200)}`)
const republished = await postJson('/flow-graph/publish', { doc_type: docType, base_version: Number(restored.body.graph_version) })
if (republished.status !== 200) throw new Error(`restore publish failed: ${JSON.stringify(republished.body).slice(0, 300)}`)

await browser.close()
console.log(`b2-capture: done — ${String(evidenceDocs.length)} 张取证单销毁（${String(destroyed)} 行待办/记录），基线图已恢复并重发布 v${String(republished.body.graph_version)}`)
if (consoleErrors.length > 0) {
  console.error(`b2-capture: designer-origin console errors:\n - ${consoleErrors.join('\n - ')}`)
  process.exitCode = 1
}
