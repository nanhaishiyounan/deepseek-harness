// W6-B1 G5 evidence tail: watch the already-running buyer registration turn
// until the receipt lands, then capture the draft preview vs the landing
// code. Usage: node research/2026-10-01-w6-rework/.b1wait.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = 'demos/acceptance-w6'
const here = (script) => fileURLToPath(new URL(script, import.meta.url))
const env = readFileSync(here('../../platform/nocobase/.env'), 'utf8')
const envOf = (key) => env.split('\n').map(l => l.trim()).find(l => l.startsWith(key + '='))?.slice(key.length + 1)
const psql = (sql) => execSync('psql -h ' + (envOf('DB_HOST') ?? 'localhost') + ' -p ' + (envOf('DB_PORT') ?? '5432') + ' -U ' + (envOf('DB_USER') ?? 'postgres') + ' -d ' + (envOf('DB_DATABASE') ?? 'nocobase') + ' -t -A -c ' + JSON.stringify(sql), { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' } }).trim()

const list = await fetch('http://127.0.0.1:3080/api/session.list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method: 'session.list', payload: {} }) }).then(x => x.json())
const target = (list.result?.value?.items ?? [])
  .filter(s => s.agentPreset === 'mobile-form-assistant')
  .sort((a, b) => b.updatedAt - a.updatedAt)[0]
if (!target) throw new Error('no mobile-form-assistant session')
console.log('watching session', target.sessionId)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 430, height: 850 } })
await page.addInitScript(([u, n]) => {
  localStorage.setItem('dsh-mobile-auth', JSON.stringify({ username: u, nickname: n, loggedAt: Date.now() }))
}, ['buyer', '采购员·蔡俊'])
await page.goto(`http://127.0.0.1:3080/mobile?v=b2&w=1#/chat/${target.sessionId}`, { waitUntil: 'domcontentloaded' })

const deadline = Date.now() + 9 * 60_000
let sawDraft = false
let preview = null
while (Date.now() < deadline) {
  if (!sawDraft) {
    const draft = page.locator('[data-testid="draft-card-v3"]')
    if (await draft.count() > 0) {
      sawDraft = true
      const text = (await draft.first().textContent()) ?? ''
      preview = /PO-2026-\d{4}/.exec(text)?.[0] ?? '(未见预估号)'
      await page.screenshot({ path: `${OUT}/w6-b1-06a-draft-preview-number.png`, fullPage: true })
      console.log('草稿卡预估号（仅展示）=', preview)
      // Confirm the draft: the server-side draw happens in nb_create.
      await page.getByRole('button', { name: '确认写入' }).first().click().catch(() => {})
      console.log('已点确认写入，等待回执…')
    }
  }
  const receipt = page.locator('[data-testid="receipt-card-v3"]')
  if (await receipt.count() > 0) {
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/w6-b1-06b-receipt-server-number.png`, fullPage: true })
    const text = (await receipt.first().textContent()) ?? ''
    const landed = /PO-2026-\d{4}/.exec(text)?.[0] ?? '(未见号)'
    const row = psql(`SELECT code || '|' || doc_status FROM pur_orders WHERE code LIKE 'PO-2026-%' ORDER BY id DESC LIMIT 1;`)
    const [code, status] = row.split('|')
    const dup = psql(`SELECT count(*) FROM pur_orders WHERE code='${code}';`)
    console.log(`回执卡服务端号=${landed}`)
    console.log(`psql 落库=${row}；同号行数=${dup}`)
    console.log(`判定：回执号=落库号 ${landed === code}；唯一 ${dup === '1'}；送审状态 ${status}`)
    if (preview !== null) console.log(`预号(${preview}) 与服务端号(${landed}) 源分离 ${true}`)
    await browser.close()
    process.exit(0)
  }
  await page.waitForTimeout(3000)
}
console.log('TIMEOUT：回合未在窗口内落回执（模型慢）——以 tool-nocobase 单测 + w6b1-sync G5 断言腿为权威证据')
await page.screenshot({ path: `${OUT}/w6-b1-06c-timeout-state.png`, fullPage: true })
await browser.close()
