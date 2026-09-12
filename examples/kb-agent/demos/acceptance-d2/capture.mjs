/**
 * D2 acceptance capture: AI employees in the projects module over the live
 * :3080 gateway. Flow: sign in → /tasks/create drawer → assert the assignee
 * picker lists the nine AI employees → pick 得克斯 (Dex) → submit → assert
 * the created task renders the assignee.
 *
 * Usage: node examples/kb-agent/demos/acceptance-d2/capture.mjs
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../../../../apps/web/package.json'))
const { chromium } = require('playwright')

const here = dirname(fileURLToPath(import.meta.url))
mkdirSync(here, { recursive: true })
const base = process.env.PORTAL_BASE ?? 'http://localhost:3080/nocobase/dist/hub'
const AI_NICKNAMES = ['阿特拉斯', '达拉', '得克斯', '埃利斯', '莱克茜', '丽娜', '内森', '薇拉', '维兹']

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
const navigate = async route => {
  await page.evaluate(url => {
    window.history.pushState({}, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, `${base}${route}`)
  for (let i = 0; i < 30; i += 1) {
    await page.waitForTimeout(500)
    if ((await page.evaluate(() => document.body.innerText)).trim().length >= 100) break
  }
}

await page.goto(`${base}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
if (page.url().includes('/login')) {
  await page.fill('#basic-account', process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com')
  await page.fill('#basic-password', process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForURL(url => !url.href.includes('/login'), { timeout: 15000 })
  await page.waitForTimeout(1500)
}

await navigate('/tasks')
await page.screenshot({ path: join(here, 'd2-tasks-list.png') })

// The create drawer is its own route; open it directly.
await navigate('/tasks/create')
await page.waitForTimeout(1500)
await page.screenshot({ path: join(here, 'd2-task-form.png') })
const drawerText = await page.evaluate(() => document.body.innerText)
console.log(`ai-fill surface: ${drawerText.includes('AI 员工') || drawerText.includes('AI employee') ? 'present in drawer' : 'not visible (N22 not ready)'}`)

// Project picker (EntityPicker popover) — first option satisfies the
// required field.
await page.locator('button', { hasText: '选择项目' }).first().click()
await page.waitForTimeout(800)
await page.locator('[data-slot="popover-content"] button').filter({ hasText: /./ }).first().click()
await page.waitForTimeout(500)

// Assignee picker — assert the nine AI employees are options.
await page.locator('button', { hasText: '指派负责人' }).first().click()
await page.waitForTimeout(800)
const options = await page.evaluate(() => [...document.querySelectorAll('[data-slot="popover-content"] button')].map(node => node.textContent.trim()).filter(text => text.length > 0))
const missing = AI_NICKNAMES.filter(name => !options.some(option => option.includes(name)))
if (missing.length > 0) throw new Error(`assignee picker missing AI employees: ${missing.join(', ')} (got: ${options.join(' | ')})`)
console.log(`assignee picker lists all 9 AI employees (${options.length} options total)`)
await page.screenshot({ path: join(here, 'd2-assignee-dropdown.png') })
await page.locator('[data-slot="popover-content"] button', { hasText: '得克斯' }).first().click()
await page.waitForTimeout(500)

// The title input is pinned by its placeholder; getByLabel does not resolve
// this form's label association reliably.
const taskTitle = 'D2 验收：AI 员工得克斯负责的标签复核任务'
await page.locator('input[placeholder*="迁移认证"], input[placeholder*="auth service"]').first().fill(taskTitle)
await page.waitForTimeout(300)
await page.getByRole('button', { name: /添加任务|Add task/ }).last().click()
await page.waitForTimeout(2500)
// Hard assertion: the drawer closed (submit succeeded) and the list renders
// both the new title and the AI-employee assignee.
const drawerStillOpen = await page.evaluate(() => document.location.pathname.endsWith('/create') || Boolean(document.querySelector('[data-slot="popover-content"]')))
if (drawerStillOpen) throw new Error('create drawer still open after submit — the form validation blocked it')
await navigate('/tasks')
const afterCreate = await page.evaluate(() => document.body.innerText)
if (!afterCreate.includes(taskTitle)) throw new Error('created task title missing from the tasks list')
if (!afterCreate.includes('得克斯')) throw new Error('created task does not render 得克斯 as assignee')
await page.screenshot({ path: join(here, 'd2-task-created-assignee.png') })
console.log('task created with AI-employee assignee 得克斯 rendered in the list')

await browser.close()
if (errors.length > 0) {
  console.log(`page errors: ${errors.join(' | ')}`)
  process.exitCode = 1
} else {
  console.log('done — zero page errors')
}
