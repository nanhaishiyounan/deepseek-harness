/**
 * Mobile-shell e2e (keyless): the /mobile entry — the mobile client's own
 * surface — boots, gates on the demo login, and walks the v6 four-tab shell
 * (消息/同事/工作台/我的) at the 390×844 viewport: the tab bar shows on the
 * four whitelisted pages and hides on every full-screen layer or secondary
 * route (chats, chat, work detail, tasks, files). The all-chats list is a
 * full-screen layer with the PageNav back header (v6 IA). The legacy v1/v2
 * tab hashes fold onto their landings. Assertions use the lane's waitFor/poll
 * vocabulary (the web config carries no web-first matchers).
 * Run: pnpm run test:web -- mobile-shell
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { launchWebScaffold, seedSession, watchConsole } from './scaffold.ts'
import type { WebScaffold } from './scaffold.ts'
import { ZH_BROWSER_LOCALE } from './support.ts'

const OVERLAY = new URL('./mobile.overlay.yml', import.meta.url).pathname
const SEED_FIXTURE = fileURLToPath(new URL('./snapshots/navigation-panes/seed.jsonl', import.meta.url))
const SEED_ID = 'mobile-shell-seed'

/** Log in through the demo card and wait for the home landing. */
async function login(page: Page): Promise<void> {
  await page.getByPlaceholder('6 位验证码').fill('123456')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByLabel('今日台账').waitFor({ timeout: 20_000 })
}

describe('mobile v6 shell (login + four tabs, 390×844)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    // One seeded session gives the chat layer a real log to render.
    await seedSession(scaffold, await readFile(SEED_FIXTURE, 'utf8'), SEED_ID)
    browser = await chromium.launch()
  }, 180_000)

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(`${scaffold.baseUrl}/mobile`, { waitUntil: 'load' })
    await page.getByText('食链通 · AI 员工').waitFor({ timeout: 20_000 })
  }, 60_000)

  afterEach(async () => {
    await page.close()
  })

  afterAll(async () => {
    await browser.close()
    await scaffold.close()
  }, 120_000)

  it('serves the mobile page at /mobile with the demo login card', async () => {
    expect(page.url()).toContain('/mobile')
    expect(await page.getByText('演示环境 · 数据仅限内测').first().textContent()).toBeTruthy()
    await page.getByRole('button', { name: '获取', exact: true }).click()
    await page.getByRole('button', { name: /^\d+s$/ }).waitFor({ timeout: 5_000 })
  })

  it('logs in through the demo code onto the four-tab home shell', async () => {
    await login(page)
    const nav = page.getByRole('navigation', { name: '底部导航' })
    await nav.waitFor()
    // The v6 tab set: 消息 / 同事 / 工作台 / 我的.
    await nav.getByText('消息', { exact: true }).waitFor()
    await nav.getByText('同事', { exact: true }).waitFor()
    await nav.getByText('工作台', { exact: true }).waitFor()
    await nav.getByText('我的', { exact: true }).waitFor()
    expect(await nav.getByRole('button').count()).toBe(0) // the TabBar renders divs, not buttons
    // The home landing: the today-ledger stats card and the quick chips.
    await page.getByLabel('今日台账').waitFor({ timeout: 10_000 })
    await page.getByText('登记一条单据').waitFor()
  })

  it('keeps the tab bar on the four whitelisted pages', async () => {
    await login(page)
    const nav = page.getByRole('navigation', { name: '底部导航' })
    // 同事 lands on the agents directory.
    await nav.getByText('同事', { exact: true }).click()
    await page.getByLabel('AI 同事目录').waitFor({ timeout: 10_000 })
    await nav.waitFor()
    // 工作台 lands on the work list.
    await nav.getByText('工作台', { exact: true }).click()
    await page.getByRole('heading', { name: '工作' }).waitFor({ timeout: 10_000 })
    await page.getByLabel('工作列表').waitFor()
    await nav.waitFor()
    // 我的 lands on the profile page.
    await nav.getByText('我的', { exact: true }).click()
    await page.getByRole('heading', { name: '我的' }).waitFor({ timeout: 10_000 })
    await nav.waitFor()
    // 消息 returns home.
    await nav.getByText('消息', { exact: true }).click()
    await page.getByLabel('今日台账').waitFor({ timeout: 10_000 })
    await nav.waitFor()
  })

  it('hides the tab bar on the chats/chat layers and the secondary routes', async () => {
    await login(page)
    const nav = page.getByRole('navigation', { name: '底部导航' })
    await nav.waitFor()
    // The all-chats layer: the PageNav back header renders over the list and
    // the tab bar is gone (v6 IA — chats left the whitelist).
    await page.evaluate(() => { location.hash = '#/chats' })
    await page.getByRole('heading', { name: '消息' }).waitFor({ timeout: 10_000 })
    await page.getByLabel('返回').waitFor({ timeout: 10_000 })
    await expect.poll(async () => await nav.count(), { timeout: 10_000 }).toBe(0)
    // The chat layer: a real seeded session renders with its back button.
    await page.evaluate((sessionId) => { location.hash = `#/chat/${sessionId}` }, SEED_ID)
    await page.getByLabel('返回').waitFor({ timeout: 15_000 })
    await expect.poll(async () => await nav.count(), { timeout: 10_000 }).toBe(0)
    // The secondary pages: tasks, files.
    await page.evaluate(() => { location.hash = '#/tasks' })
    await page.getByText('我的任务').waitFor({ timeout: 10_000 })
    await expect.poll(async () => await nav.count(), { timeout: 10_000 }).toBe(0)
    await page.evaluate(() => { location.hash = '#/files' })
    await page.getByLabel('文件').waitFor({ timeout: 10_000 })
    await expect.poll(async () => await nav.count(), { timeout: 10_000 }).toBe(0)
    // The work tab shows the bar; opening one work item hides it (the
    // first-run demo seed supplies the doing list's cards).
    await page.evaluate(() => { location.hash = '#/work' })
    await page.getByRole('heading', { name: '工作' }).waitFor({ timeout: 10_000 })
    await nav.waitFor()
    await page.getByText(/^进行中/).click()
    await page.getByLabel('打开 供应商资质到期提醒').click()
    await page.getByLabel('工作票头').waitFor({ timeout: 10_000 })
    await expect.poll(async () => await nav.count(), { timeout: 10_000 }).toBe(0)
  })

  it('walks the new-chat sheet from the chats layer and the me tab', async () => {
    await login(page)
    await page.evaluate(() => { location.hash = '#/chats' })
    await page.getByRole('heading', { name: '消息' }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '新建会话' }).click()
    await page.getByRole('heading', { name: '新建会话' }).waitFor({ timeout: 10_000 })
    // The sheet carries its roster list and the close entry (02 §4.2).
    await page.getByRole('list', { name: 'AI 同事' }).waitFor()
    await page.getByRole('button', { name: '关闭' }).click()
    await page.getByRole('heading', { name: '新建会话' }).waitFor({ state: 'detached', timeout: 10_000 })

    // The layer's back header returns home; the me tab rides the bar there.
    await page.getByLabel('返回').click()
    await page.getByLabel('今日台账').waitFor({ timeout: 10_000 })
    await page.getByRole('navigation', { name: '底部导航' }).getByText('我的', { exact: true }).click()
    await page.getByRole('heading', { name: '我的' }).waitFor({ timeout: 10_000 })
    await page.getByRole('switch', { name: '深色模式' }).waitFor()
    await page.getByText('本月登记').first().waitFor()
    expect(tripwire.pageErrors).toEqual([])
  })

  it('redirects the v1/v2 tab hashes onto the v6 landings', async () => {
    await login(page)
    await page.evaluate(() => { location.hash = '#/workbench' })
    await page.getByRole('heading', { name: '工作' }).waitFor({ timeout: 10_000 })
    await page.evaluate(() => { location.hash = '#/contacts' })
    await page.getByLabel('AI 同事目录').waitFor({ timeout: 10_000 })
    await page.evaluate(() => { location.hash = '#/messages' })
    await page.getByRole('heading', { name: '消息' }).waitFor({ timeout: 10_000 })
    await page.evaluate(() => { location.hash = '#/profile' })
    await page.getByRole('heading', { name: '我的' }).waitFor({ timeout: 10_000 })
  })
})
