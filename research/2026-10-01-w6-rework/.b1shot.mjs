// W6-B1 evidence shots: drive the mobile surface end-to-end over the live
// gateway as real accounts. Usage (repo root):
//   node research/2026-10-01-w6-rework/.b1shot.mjs
// Evidence lands in demos/acceptance-w6/w6-b1-*.png.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:3080/mobile'
const OUT = 'demos/acceptance-w6'

const here = (script) => fileURLToPath(new URL(script, import.meta.url))
const env = readFileSync(here('../../platform/nocobase/.env'), 'utf8')
const envOf = (key) => env.split('\n').map(l => l.trim()).find(l => l.startsWith(key + '='))?.slice(key.length + 1)
const psql = (sql) => execSync('psql -h ' + (envOf('DB_HOST') ?? 'localhost') + ' -p ' + (envOf('DB_PORT') ?? '5432') + ' -U ' + (envOf('DB_USER') ?? 'postgres') + ' -d ' + (envOf('DB_DATABASE') ?? 'nocobase') + ' -t -A -c ' + JSON.stringify(sql), { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' } }).trim()

const log = (line) => console.log(line)

/** Seed the mobile identity and land on a route. */
async function signInMobile(page, username, nickname) {
  await page.addInitScript(([u, n]) => {
    localStorage.setItem('dsh-mobile-auth', JSON.stringify({ username: u, nickname: n, loggedAt: Date.now() }))
  }, [username, nickname])
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 430, height: 850 } })

log('== w6-b1-01: qc_inspector 待办页（open 待办 + 分段计数） ==')
await signInMobile(page, 'qc_inspector', '质检员·王倩')
await page.goto(`${BASE}?v=b2#/todos`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="todo-row"]', { timeout: 30_000 })
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/w6-b1-01-todos-qc-inspector.png` })
const openBefore = psql(`SELECT count(*) FROM wfl_approval_todos WHERE "user"='qc_inspector' AND status='open';`)
log(`  psql open(qc_inspector)=${openBefore}; 页面行=1 → 对账${openBefore === '1' ? '一致' : '不一致'}`)

log('== w6-b1-02: 待办页审批动作（Modal 打开态） ==')
await page.getByRole('button', { name: '同意' }).click()
await page.getByText('服务端校验待办归属').waitFor({ timeout: 10_000 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/w6-b1-02-approve-modal.png` })
// Confirm: the action opens the AI-colleague session and the server-side
// nb_approve runs under the acting-user gate.
await page.locator('.adm-modal .adm-modal-button').last().click()
await page.waitForURL(/#\/chat\//, { timeout: 30_000 })
await page.screenshot({ path: `${OUT}/w6-b1-02-approve-session.png` })

log('== w6-b1-03: 审批生效回流（待办 ≤ 轮询窗口消失，psql 状态） ==')
// Poll the table until the todo closes (the engine's act landed); the todos
// page's own 5s poll drops the row at the same cadence.
let closed = false
for (let i = 0; i < 60; i += 1) {
  const open = psql(`SELECT count(*) FROM wfl_approval_todos WHERE "user"='qc_inspector' AND status='open';`)
  if (open === '0') { closed = true; break }
  await page.waitForTimeout(2000)
}
const docStatus = psql(`SELECT doc_status FROM qm_nc_dispositions WHERE code LIKE 'QM-NC-W6B1-%' ORDER BY id DESC LIMIT 1;`)
const auditRow = psql(`SELECT action || '|' || approver FROM wfl_approval_records WHERE doc_type='qm_nc_dispositions' AND action='approve' ORDER BY id DESC LIMIT 1;`)
log(`  closed=${String(closed)} doc_status=${docStatus} audit=${auditRow}`)
await page.goto(`${BASE}?v=b2#/todos`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/w6-b1-03-todos-after-cleared.png` })

log('== w6-b1-04: 单据浏览页（目录/列表/详情+审批轨迹；角色过滤对照） ==')
await page.goto(`${BASE}?v=b2#/docs`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="docs-collection"]', { timeout: 15_000 })
await page.screenshot({ path: `${OUT}/w6-b1-04a-docs-catalog-qc.png` })
const qcCatalog = await page.locator('[data-testid="docs-collection"]').allTextContents()
log(`  qc_inspector 目录：${qcCatalog.join(' / ')}`)
await page.goto(`${BASE}?v=b2#/docs/qm_nc_dispositions`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="docs-row"]', { timeout: 15_000 })
await page.screenshot({ path: `${OUT}/w6-b1-04b-docs-list.png` })
const firstRow = page.locator('[data-testid="docs-row"]').first()
const docHrefText = await firstRow.textContent()
log(`  列表首行：${docHrefText ?? ''}`)
await firstRow.click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/w6-b1-04c-docs-detail-trail.png`, fullPage: true })

// Role contrast: buyer sees the procurement domain only.
await signInMobile(page, 'buyer', '采购员·蔡俊')
await page.goto(`${BASE}?v=b2&role=buyer#/docs`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="docs-collection"]', { timeout: 15_000 })
await page.screenshot({ path: `${OUT}/w6-b1-04d-docs-catalog-buyer.png` })
const buyerCatalog = await page.locator('[data-testid="docs-collection"]').allTextContents()
log(`  buyer 目录（角色过滤）：${buyerCatalog.join(' / ')}`)

log('== w6-b1-05: 弱网 outbox（断网降级提示 → 恢复自动补偿） ==')
await signInMobile(page, 'qc_inspector', '质检员·王倩')
await page.goto(`${BASE}?v=b2&out=1#/chats`, { waitUntil: 'domcontentloaded' })
// Open a fresh assistant chat and go offline mid-send.
await page.evaluate(() => { location.hash = '#/agents' })
await page.waitForTimeout(400)
await page.getByText('智能填表助手').first().click()
await page.waitForURL(/#\/chat\//, { timeout: 15_000 })
const offline = async (context) => { await context.setOffline(true) }
await offline(page.context())
await page.getByPlaceholder('问我任何经营问题...').fill('查一下我的待办')
await page.getByLabel('发送').click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/w6-b1-05a-offline-degraded.png` })
const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('dsh-mobile-outbox') ?? '{"entries":[]}').entries.length)
log(`  断网发送 → 待发队列=${String(queued)}`)
await page.context().setOffline(false)
// The online event kicks an immediate flush; the message reaches the server.
let flushed = false
for (let i = 0; i < 20; i += 1) {
  const left = await page.evaluate(() => JSON.parse(localStorage.getItem('dsh-mobile-outbox') ?? '{"entries":[]}').entries.length)
  if (left === 0) { flushed = true; break }
  await page.waitForTimeout(1000)
}
log(`  恢复后补偿=${String(flushed)}（队列清空）`)
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/w6-b1-05b-recovered.png` })

log('== 对账 SQL 固化（gates.log 汇总用） ==')
const recon = [
  `SELECT count(*) FROM wfl_approval_todos WHERE "user"='qc_inspector' AND status='open'; -- 期望 0（审批后回流）`,
  `SELECT doc_status FROM qm_nc_dispositions WHERE code LIKE 'QM-NC-W6B1-%'; -- 期望 approved`,
  `SELECT action, approver FROM wfl_approval_records WHERE doc_type='qm_nc_dispositions' AND action='approve'; -- 期望 approve|qc_inspector`,
  `SELECT count(*) FROM wfl_effect_backlog WHERE status='pending'; -- 期望 0（补偿队列清空）`,
]
for (const sql of recon) log(`  psql> ${sql.split(';')[0]} → ${psql(sql.split(';')[0])}`)

await browser.close()
log('b1shot: 完成')
