/**
 * W5-B1 acceptance screenshot capture: the publish chain's four user-visible
 * moments, driven against the real serve (:13110) and the real NocoBase
 * (:13000) — no mocks.
 *
 *   b1-01  designer publish success — the derived-stats modal (N states /
 *          M transitions) plus the topbar published-version Tag
 *   b1-02  publish refusal — the readable gate-error list (an orphan-cc graph
 *          saved through the same channel the SPA uses)
 *   b1-03  the real run's open approval todo (GET /todos?user=… on a real
 *          submitted RFQ, before the approve lands)
 *   b1-04  the config center after the textarea retirement — the row-edit
 *          popup carries no approver_map/extras JSON textarea anymore
 *
 * The run cleans up after itself: the test RFQ + its todos/records are
 * destroyed (counts disclosed), and the stored graph is restored + republished.
 *
 * Usage: node examples/kb-agent/demos/acceptance-w5/b1-capture.mjs
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
const docType = 'pur_rfqs'
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
// Only designer-origin errors count: the negative-matrix publish answers 400 by
// design, and the NocoBase sign-in page fires its own 401 resource noise.
page.on('console', (message) => {
  if (message.type() !== 'error') return
  const text = message.text()
  if (!page.url().startsWith(serve)) return
  if (text.includes('status of 400')) return
  consoleErrors.push(text)
})
const shot = async (name) => { await page.screenshot({ path: path.join(here, `${name}.png`) }); console.log(`captured ${name}.png`) }

// ── baseline: the stored graph and its version ──
const before = await getJson(`/flow-graph?doc_type=${docType}`)
const goodGraph = before.graph
let version = Number(before.graph_version)

// ── b1-01: publish success modal + published tag ──
await page.goto(`${serve}/designer?doc_type=${docType}`)
await page.getByTestId('btn-publish').click()
await page.locator('.ant-modal').filter({ hasText: '发布成功' }).waitFor({ timeout: 15_000 })
await shot('b1-01-publish-success')
await page.locator('.ant-modal .ant-btn').last().click()
await page.waitForTimeout(300)

// ── b1-02: publish refusal — the readable gate list (an orphan cc node) ──
const illegal = structuredClone(goodGraph)
const stamp = Date.now().toString(36)
illegal.nodes.push({ id: `n_loose_${stamp}`, type: 'cc', position: { x: 40, y: 40 }, data: { title: '游离抄送节点', cc: { assignees: ['admin'] } } })
// The in-browser publish bumped the CAS counter — re-read before the scripted save.
version = Number((await getJson(`/flow-graph?doc_type=${docType}`)).graph_version)
const savedIllegal = await postJson('/flow-graph', { doc_type: docType, graph: illegal, base_version: version })
if (savedIllegal.status !== 200) throw new Error(`illegal save failed: HTTP ${String(savedIllegal.status)}`)
version = Number(savedIllegal.body.graph_version)
await page.goto(`${serve}/designer?doc_type=${docType}`)
await page.getByTestId('btn-publish').click()
await page.locator('.ant-modal').filter({ hasText: '发布被拒' }).waitFor({ timeout: 15_000 })
await shot('b1-02-publish-error-list')
await page.locator('.ant-modal .ant-btn').last().click()

// restore the good graph and republish (the capture leaves the flow healthy).
const restored = await postJson('/flow-graph', { doc_type: docType, graph: goodGraph, base_version: version })
if (restored.status !== 200) throw new Error(`restore save failed: HTTP ${String(restored.status)}`)
version = Number(restored.body.graph_version)
const republished = await postJson('/flow-graph/publish', { doc_type: docType, base_version: version })
if (republished.status !== 200) throw new Error(`restore publish failed: HTTP ${String(republished.status)}`)
version = Number(republished.body.graph_version)

// ── b1-03: the real run's open todo (a real submitted RFQ) ──
const token = await rootToken()
const code = `RFQ-W5B1-C-${stamp}`
const createResponse = await fetch(`${noco}/api/pur_rfqs:create`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ code, doc_status: 'draft' }) })
const created = await createResponse.json()
const docId = Number(created?.data?.id ?? created?.id)
if (!Number.isInteger(docId) || docId < 1) throw new Error(`pur_rfqs:create failed: ${JSON.stringify(created).slice(0, 200)}`)
const submitted = await postJson('/submit', { doc_type: docType, doc_id: docId, approver: 'wangyifan' })
if (submitted.status !== 200) throw new Error(`submit failed: ${JSON.stringify(submitted.body).slice(0, 200)}`)
const todoUser = String(submitted.body.result.to_state === 'pending' ? 'admin' : '')
await page.goto(`${serve}/todos?user=${todoUser}`)
await page.waitForTimeout(400)
await shot('b1-03-run-open-todo')
const acted = await postJson('/act', { doc_type: docType, doc_id: docId, action: 'approve', approver: todoUser, comment: 'W5-B1 取证跑单' })
if (acted.status !== 200 || acted.body.result.to_state !== 'approved') throw new Error(`approve failed: ${JSON.stringify(acted.body).slice(0, 200)}`)

// cleanup: the evidence RFQ + its workflow rows (counts disclosed).
let destroyed = 0
for (const collection of ['wfl_approval_todos', 'wfl_approval_records']) {
  const list = await (await fetch(`${noco}/api/${collection}:list?pageSize=50&filter=${encodeURIComponent(JSON.stringify({ doc_type: docType, doc_id: docId }))}`, { headers: { authorization: `Bearer ${token}` } })).json()
  for (const row of list?.data ?? []) {
    await fetch(`${noco}/api/${collection}:destroy?filterByTk=${row.id}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
    destroyed += 1
  }
}
await fetch(`${noco}/api/pur_rfqs:destroy?filterByTk=${docId}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
destroyed += 1
console.log(`cleanup: destroyed ${String(destroyed)} rows (RFQ ${code} + todos/records); graph restored at v${String(version)} (published)`)

// ── b1-04: the config center after the textarea retirement ──
await page.goto(`${noco}/signin`)
await page.locator('input').first().fill(process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com')
await page.locator('input[type="password"]').fill(process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123')
await page.locator('button[type="submit"], .ant-btn-primary').first().click()
await page.waitForTimeout(3500)
// Navigate straight to the row-edit ChildPage (the same view the row 编辑
// button opens — w3b4ea99… is the wfl_flow_configs edit popup tree).
await page.goto(`${noco}/admin/w3b4u2r9nnjqvi/view/w3b4ea99q6bz0fevu/filterbytk/1`)
await page.locator('text=配置变更留痕').first().waitFor({ timeout: 30_000 })
await page.waitForTimeout(1200)
const editBody = await page.locator('body').innerText()
if (editBody.includes('审批人映射') || editBody.includes('扩展配置')) {
  throw new Error(`textarea retirement leak: the edit form still shows 审批人映射/扩展配置 — ${editBody.slice(0, 160)}`)
}
if (!editBody.includes('流程名') || !editBody.includes('激活')) {
  throw new Error(`edit form missing its kept fields (流程名/激活) — ${editBody.slice(0, 160)}`)
}
console.log('edit form fields: 流程名/激活/配置变更留痕（审批人映射与扩展配置 textarea 已退役 ✓）')
await shot('b1-04-config-center-textarea-retired')

await browser.close()
if (consoleErrors.length > 0) {
  console.error(`console errors on the designer pages:\n  - ${consoleErrors.join('\n  - ')}`)
  process.exitCode = 1
} else {
  console.log('b1-capture OK — 4 screenshots, zero console errors, flow restored + republished')
}
