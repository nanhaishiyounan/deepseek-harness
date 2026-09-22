/**
 * Mobile-shell e2e (keyless): the /mobile entry — the mobile client's own
 * surface — boots, gates on the demo login, and walks the v2 two-tab shell
 * (chats, contacts, me) at the 390×844 viewport. Assertions use the lane's
 * waitFor/poll vocabulary (the web config carries no web-first matchers).
 * Run: pnpm run test:web -- mobile-shell
 */

import { describe, beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import type { WebScaffold } from './scaffold.ts'
import { ZH_BROWSER_LOCALE } from './support.ts'

const OVERLAY = new URL('./mobile.overlay.yml', import.meta.url).pathname

/** Log in through the demo card and wait for the chats landing. */
async function login(page: Page): Promise<void> {
  await page.getByPlaceholder('6 位验证码').fill('123456')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('heading', { name: '消息' }).waitFor({ timeout: 20_000 })
}

describe('mobile v3 shell (login + two tabs, 390×844)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
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

  it('logs in through the mock code onto the two-tab chats shell', async () => {
    await login(page)
    const nav = page.getByRole('navigation', { name: '底部导航' })
    await nav.getByText('消息', { exact: true }).waitFor()
    await nav.getByText('我的', { exact: true }).waitFor()
    expect(await nav.getByRole('button').count()).toBe(0) // the TabBar renders divs, not buttons
    // The v3 chrome: search box, filter chips, the new-chat plus button.
    await page.getByPlaceholder('搜索会话/同事').waitFor({ timeout: 10_000 })
    await page.getByRole('tab', { name: '待审核' }).waitFor()
    await page.getByRole('button', { name: '新建会话' }).waitFor()
  })

  it('walks the new-chat sheet and the me tab', async () => {
    await login(page)
    await page.getByRole('button', { name: '新建会话' }).click()
    await page.getByRole('heading', { name: '新建会话' }).waitFor({ timeout: 10_000 })
    // The sheet carries its roster list and the close entry (02 §4.2).
    await page.getByRole('list', { name: 'AI 同事' }).waitFor()
    await page.getByRole('button', { name: '关闭' }).click()
    await page.getByRole('heading', { name: '新建会话' }).waitFor({ state: 'detached', timeout: 10_000 })

    await page.getByText('我的', { exact: true }).last().click()
    await page.getByRole('heading', { name: '我的' }).waitFor({ timeout: 10_000 })
    await page.getByRole('switch', { name: '深色模式' }).waitFor()
    await page.getByText('本月登记').first().waitFor()
    expect(tripwire.pageErrors).toEqual([])
  })

  it('redirects the v1 tab hashes onto the v2 tabs', async () => {
    await login(page)
    await page.evaluate(() => { location.hash = '#/workbench' })
    await page.getByRole('heading', { name: '消息' }).waitFor({ timeout: 10_000 })
    await page.evaluate(() => { location.hash = '#/profile' })
    await page.getByRole('heading', { name: '我的' }).waitFor({ timeout: 10_000 })
  })
})
