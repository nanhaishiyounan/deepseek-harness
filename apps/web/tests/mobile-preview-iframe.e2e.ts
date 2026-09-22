/**
 * PC mobile-preview e2e (keyless): the conversation view ring's 移动端预览
 * tab mounts the phone bezel with the same-origin /mobile iframe, and the
 * embedded page is fully interactive — the scenario logs into the mobile
 * client INSIDE the iframe and lands on its messages tab. Same seeded session
 * the aria lane uses; zero model calls.
 * Run: pnpm run test:web -- mobile-preview-iframe
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { launchWebScaffold, seedSession, watchConsole, webSnapshotMode, compareOrRefreshGolden } from './scaffold.ts'
import type { WebScaffold } from './scaffold.ts'

const OVERLAY = fileURLToPath(new URL('./mobile.overlay.yml', import.meta.url))
const GOLDEN_DIR = fileURLToPath(new URL('./snapshots/mobile-preview-iframe', import.meta.url))
const SEED_FIXTURE = fileURLToPath(new URL('./snapshots/navigation-panes/seed.jsonl', import.meta.url))
const SEED_ID = 'mobile-preview-seed'

describe('PC mobile-preview view (iframe over /mobile)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    await seedSession(scaffold, await readFile(SEED_FIXTURE, 'utf8'), SEED_ID)
    browser = await chromium.launch()
  }, 180_000)

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    const welcome = page.locator('[class*="onboardingOverlay"]')
    if (await welcome.count() > 0) {
      await welcome.getByRole('button').click()
      await welcome.waitFor({ state: 'detached', timeout: 15_000 })
    }
    // Open the seeded session through content search (the navigation-panes
    // lane's pattern): the view ring lives on a session.
    const searchButton = page.getByRole('button', { name: 'Search sessions' })
    if (await searchButton.getAttribute('aria-expanded') !== 'true') await searchButton.click()
    const search = page.getByPlaceholder('Search sessions', { exact: false })
    await search.fill('NAVIGATION_OK')
    const result = page.getByRole('tree', { name: 'Search results' }).getByRole('treeitem')
    await expect.poll(() => result.count(), { timeout: 15_000 }).toBe(1)
    await result.click()
    await page.getByText('FIRST_DONE', { exact: true }).waitFor({ timeout: 15_000 })
    await search.fill('')
  }, 120_000)

  afterEach(async () => {
    await page.close()
  })

  afterAll(async () => {
    await browser.close()
    await scaffold.close()
  }, 120_000)

  it('embeds the interactive mobile page in the phone bezel', async () => {
    await page.getByRole('tab', { name: /移动端预览|Mobile preview/ }).click()
    const frame = page.frameLocator('iframe[title*="mobile preview" i], iframe[title="移动端预览"]')
    // Complete a full mobile flow INSIDE the iframe: login → messages tab.
    await frame.getByPlaceholder('6 位验证码').fill('123456')
    await frame.getByRole('button', { name: /登录/ }).click()
    await frame.getByRole('heading', { name: '消息' }).waitFor({ timeout: 20_000 })
    expect(tripwire.pageErrors).toEqual([])
  })

  it('keeps the preview view golden stable (aria snapshot of the bezel)', async () => {
    await page.getByRole('tab', { name: /移动端预览|Mobile preview/ }).click()
    const frame = page.frameLocator('iframe[title*="mobile preview" i], iframe[title="移动端预览"]')
    await frame.getByPlaceholder('6 位验证码').waitFor({ timeout: 20_000 })
    const mode = webSnapshotMode()
    const aria = (await page.locator('body').ariaSnapshot())
      .replaceAll(SEED_ID, '{{sessionId}}')
    await compareOrRefreshGolden(join(GOLDEN_DIR, 'view.expected.md'), aria, mode)
  })
})
