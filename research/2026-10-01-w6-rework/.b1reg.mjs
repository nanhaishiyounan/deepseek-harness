// W6-B1 G5 live evidence: register one PO through the real model turn as
// buyer, land the receipt, and prove the server-assigned number (the card's
// preview and the landing row's code come from different sources now).
// Usage: node research/2026-10-01-w6-rework/.b1reg.mjs
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

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 430, height: 850 } })
await page.addInitScript(([u, n]) => {
  localStorage.setItem('dsh-mobile-auth', JSON.stringify({ username: u, nickname: n, loggedAt: Date.now() }))
}, ['buyer', '采购员·蔡俊'])

// The max PO number before the turn (the server draw must exceed it).
const maxBefore = psql(`SELECT max(substring(code from '(\\d{4})$')) FROM pur_orders WHERE code LIKE 'PO-2026-%';`)
console.log(`号段基线 max(PO-2026-*)=${maxBefore}`)

await page.goto(`${BASE}?v=b2&reg=1#/agents`, { waitUntil: 'domcontentloaded' })
await page.getByText('智能填表助手').first().click()
await page.waitForURL(/#\/chat\//, { timeout: 15_000 })
await page.getByPlaceholder('问我任何经营问题...').fill('向宏发食品登记一张采购单：高筋面粉 500 公斤，单价 4.1')
await page.getByLabel('发送').click()

// The draft card lands within a model turn; capture its preview number.
await page.waitForSelector('[data-testid="draft-card-v3"]', { timeout: 180_000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/w6-b1-06a-draft-preview-number.png`, fullPage: true })
const cardText = await page.locator('[data-testid="draft-card-v3"]').textContent()
const preview = /PO-2026-\d{4}/.exec(cardText ?? '')?.[0] ?? '(卡上未见预估号)'
console.log(`草稿卡预估号（仅展示）=${preview}`)

await page.getByRole('button', { name: '确认写入' }).click()
// The receipt card needs the model's nb_create + the fenced receipt after it.
await page.waitForSelector('[data-testid="receipt-card-v3"]', { timeout: 240_000 })
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/w6-b1-06b-receipt-server-number.png`, fullPage: true })
const receiptText = await page.locator('[data-testid="receipt-card-v3"]').textContent()
const landed = /PO-2026-\d{4}/.exec(receiptText ?? '')?.[0] ?? '(回执未见号)'
console.log(`回执卡服务端号=${landed}`)

const row = psql(`SELECT code || '|' || doc_status FROM pur_orders WHERE code LIKE 'PO-2026-%' ORDER BY id DESC LIMIT 1;`)
const [code, status] = row.split('|')
const dup = psql(`SELECT count(*) FROM pur_orders WHERE code='${code}';`)
console.log(`psql 落库=${row}；同号行数=${dup}`)
console.log(`判定：回执号=落库号 ${landed === code}；唯一 ${dup === '1'}；非预号 ${landed !== preview || '(预估号与服务端号巧合同段)'}`)
await browser.close()
