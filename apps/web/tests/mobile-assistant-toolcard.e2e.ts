/**
 * Mobile assistant toolcard e2e (keyless): the same v3 form-assistant journey
 * as mobile-assistant.e2e — fork pick → draft → 确认写入 → receipt → report —
 * but every structured card rides a `present_card` tool/call instead of a
 * ```dsh fence (the P2 dual-render tool source). The payloads are byte-equal
 * to the legacy seed's fence payloads, so the rendered cards are the same
 * components the fence source produces; the assertions pin that equivalence,
 * the answered replay state, and the absence of any tool row or protocol
 * leakage for the present_card calls. The legacy fence e2e stays untouched as
 * the replay-regression anchor.
 * Run: pnpm run test:web -- mobile-assistant-toolcard
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest'
import { chromium } from 'playwright'
import type { Browser, Page, Route } from 'playwright'
import { launchWebScaffold, seedSession, watchConsole, webSnapshotMode, compareOrRefreshGolden } from './scaffold.ts'
import type { WebScaffold } from './scaffold.ts'
import { ZH_BROWSER_LOCALE } from './support.ts'

const OVERLAY = fileURLToPath(new URL('./mobile.overlay.yml', import.meta.url))
const GOLDEN_DIR = fileURLToPath(new URL('./snapshots/mobile-assistant-toolcard', import.meta.url))
const SEED_PATH = fileURLToPath(new URL('./snapshots/mobile-assistant-toolcard/session.jsonl', import.meta.url))
const SEED_ID = 'mobile-assistant-toolcard-seed'
const W22R2_SEED_PATH = fileURLToPath(new URL('./snapshots/mobile-assistant-toolcard-w22r2/session.jsonl', import.meta.url))
const W22R2_SEED_ID = 'mobile-assistant-toolcard-w22r2-seed'

describe('mobile assistant present_card tool source (seeded session → cards without fences)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    await seedSession(scaffold, await readFile(SEED_PATH, 'utf8'), SEED_ID)
    await seedSession(scaffold, await readFile(W22R2_SEED_PATH, 'utf8'), W22R2_SEED_ID)
    browser = await chromium.launch()
  }, 180_000)

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
  }, 60_000)

  afterEach(async () => {
    await page.close()
  })

  afterAll(async () => {
    await browser.close()
    await scaffold.close()
  }, 120_000)

  /**
   * Answer one intercepted gateway call with a minimal ok value, echoing the
   * wire rpcId the mobile rpc() caller requires.
   */
  async function fulfillOk(route: Route, value: unknown): Promise<void> {
    const rpcId = (route.request().postDataJSON() as { rpcId?: string }).rpcId ?? ''
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: true, value } }) })
  }

  /**
   * Open the seeded tool-card chat as an already-signed-in user. The login
   * handshake (nocobase.signIn) needs a real NocoBase this keyless scaffold
   * does not compose, so the page identity is preset through the same
   * localStorage slot a prior sign-in persists, and the identity-gated
   * nocobase reads are stubbed at the network layer — the preset token is not
   * a gateway-issued session, and its `nocobase-unauthorized` would bounce
   * the shell back to the login gate. The chat rendering under test rides
   * session.* only; those calls keep hitting the real scaffold gateway.
   */
  async function openChat(sessionId: string = SEED_ID): Promise<void> {
    await page.addInitScript(() => {
      localStorage.setItem('dsh-mobile-auth', JSON.stringify({
        username: 'buyer', nickname: '采购员·蔡俊', token: 'e2e-toolcard-token', loggedAt: Date.now(),
      }))
    })
    await page.route('**/api/nocobase.list', async (route) => { await fulfillOk(route, { rows: [], total: 0 }) })
    await page.route('**/api/nocobase.get', async (route) => { await fulfillOk(route, { row: null }) })
    await page.route('**/api/nocobase.update', async (route) => { await fulfillOk(route, { row: null }) })
    await page.route('**/api/nocobase.alertAct', async (route) => { await fulfillOk(route, {}) })
    await page.route('**/api/nocobase.mobileWorkSave', async (route) => {
      const clientId = (route.request().postDataJSON() as { payload?: { clientId?: string } }).payload?.clientId ?? ''
      await fulfillOk(route, { clientId, user: 'buyer' })
    })
    await page.route('**/api/nocobase.mobileWorkDelete', async (route) => {
      const clientId = (route.request().postDataJSON() as { payload?: { clientId?: string } }).payload?.clientId ?? ''
      await fulfillOk(route, { clientId, user: 'buyer' })
    })
    await page.goto(`${scaffold.baseUrl}/mobile#/chat/${sessionId}`, { waitUntil: 'load' })
    try {
      await page.locator('main').waitFor({ timeout: 20_000 })
    } catch (error) {
      throw new Error(`mobile chat did not render session ${SEED_ID}. body: ${await page.locator('body').innerText()}`, { cause: error })
    }
  }

  it('renders the present_card ask, draft, receipt, and report cards from the tool source', async () => {
    await openChat()
    await page.getByTestId('ask-choice').waitFor({ timeout: 15_000 })
    // The journey is post-confirm, so the draft card has folded into its
    // confirmed summary line (the same card-state fold the fence source rides).
    await page.getByText('你确认了这张采购单').waitFor({ timeout: 15_000 })
    await page.locator('[data-testid="receipt-card-v3"]').waitFor({ timeout: 15_000 })
    await page.getByTestId('report-card').waitFor({ timeout: 15_000 })
    // The answered fork greys out and highlights the picked card, same as the
    // fence source's replay state.
    await expect.poll(async () => page.locator('[data-testid="ask-choice"]').getAttribute('class'), { timeout: 10_000 })
      .toContain('askAnswered')
    // The flow virtualizes, so the assertions ride the same aria snapshot the
    // golden lane takes (the full a11y tree, not just the visible viewport).
    const body = await page.locator('main').ariaSnapshot()
    // The narrative carries the fork pick as the small capsule.
    expect(body).toContain('是采购单，我们从鲜丰买进')
    // The cards carry their business surfaces: receipt anchor and report title.
    expect(body).toContain('采购单已登记')
    expect(body).toContain('¥6,400')
    expect(body).toContain('1042')
    expect(body).toContain('项目风险')
    expect(body).toContain('鲜丰冷链箱交期推迟')
    expect(body).toContain('创建处理任务')
    expect(tripwire.pageErrors).toEqual([])
  })

  it('leaks no protocol material and renders no tool row for present_card', async () => {
    await openChat()
    await page.getByTestId('ask-choice').waitFor({ timeout: 15_000 })
    await page.getByTestId('report-card').waitFor({ timeout: 15_000 })
    const body = await page.locator('main').ariaSnapshot()
    // Protocol invisibility: no fences, no raw JSON, no collection names, and
    // no neutral tool row naming the present_card calls (the card is the
    // call's whole presentation).
    expect(body.includes('```dsh')).toBe(false)
    expect(body.includes('present_card')).toBe(false)
    expect(body.includes('{"v":3')).toBe(false)
    expect(body.includes('"payload"')).toBe(false)
    expect(body.includes('hub_po_purchase_orders')).toBe(false)
    expect(body.includes('hub_wms_outbound')).toBe(false)
    // The only tool row left is the real nb_create write behind the receipt.
    expect(body).toContain('写入业务记录')
    expect(tripwire.pageErrors).toEqual([])
  })

  it('renders the W21-R1 lenient cards: numeric leaves and a stringified payload', async () => {
    await openChat()
    await page.getByTestId('ask-choice').waitFor({ timeout: 15_000 })
    // Turn 5: an approval_pending whose id/docId/summary values are bare
    // numbers — coerced and rendered, never folded.
    await page.getByTestId('approval-card').waitFor({ timeout: 15_000 })
    // Turn 6: a plan_suggest arriving as a JSON string (the double-serialization
    // shape) with numeric id/suggestionId/qty — parsed, coerced, rendered.
    await page.getByTestId('plan-card').waitFor({ timeout: 15_000 })
    const body = await page.locator('main').ariaSnapshot()
    // The coerced numbers render in their business surfaces.
    expect(body).toContain('鲜丰冷链箱采购')
    expect(body).toContain('糯米粉')
    // Neither lenient card degraded to the collapsed notice, and no protocol
    // material leaked with the stringified payload.
    expect(body.includes('已折叠')).toBe(false)
    expect(body.includes('"payload"')).toBe(false)
    expect(tripwire.pageErrors).toEqual([])
  })

  it('keeps the mobile toolcard golden stable (aria snapshot of the tool-source flow)', async () => {
    await openChat()
    await page.getByTestId('ask-choice').waitFor({ timeout: 15_000 })
    await page.locator('[data-testid="receipt-card-v3"]').waitFor({ timeout: 15_000 })
    await page.getByTestId('report-card').waitFor({ timeout: 15_000 })
    const mode = webSnapshotMode()
    const aria = await page.locator('main').ariaSnapshot()
    const normalized = aria.replaceAll(SEED_ID, '{{sessionId}}')
    await compareOrRefreshGolden(join(GOLDEN_DIR, 'chat.expected.md'), normalized, mode)
  })

  it('renders the deterministic widget rewrite: text-declared quantity rolls the decimal keypad, text-declared date rolls the DatePicker (W22-R2 P4 probes)', async () => {
    await openChat(W22R2_SEED_ID)
    try {
      await page.locator('[data-testid="draft-card-v3"]').waitFor({ timeout: 20_000 })
    } catch (error) {
      throw new Error(`W22R2 chat body: ${await page.locator('main').innerText()}`, { cause: error })
    }
    const card = page.locator('[data-testid="draft-card-v3"]')
    // The model declared quantity/need_date as text and the system's contract
    // rejected the first (product_name-less) card; the corrected card still
    // carries the text declarations, and the render fold classifies them.
    await expect.poll(async () => card.locator('input[inputmode="decimal"]').count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(1)
    await expect.poll(async () => card.locator('[data-testid="date-trigger"]').count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(1)
    // The note-family field keeps its declared text: its label quotes 单价 in
    // prose, and the derived row never gains a numeric control.
    const body = await page.locator('main').ariaSnapshot()
    expect(body).toContain('按合同')
    expect(tripwire.pageErrors).toEqual([])
  })

  it('collapses the rejected present_card card instead of rendering an interactive draft (W22-R2 P0-2 probe)', async () => {
    await openChat(W22R2_SEED_ID)
    await page.locator('[data-testid="draft-card-v3"]').waitFor({ timeout: 20_000 })
    const body = await page.locator('main').ariaSnapshot()
    // The rejected revision-1 card (product_name missing, isError tool result)
    // folds to the collapsed notice: no card face, no 确认写入 of its own.
    // The notice body hides inside a closed <details>, so the cause text is
    // asserted on the raw DOM while the summary line rides the aria tree.
    expect(body).toContain('结构化消息（格式异常，已折叠）')
    expect(await page.content()).toContain('参数校验未通过')
    expect(body.includes('采购单草稿（缺品名）')).toBe(false)
    // Exactly one interactive draft card remains — the corrected revision.
    const cards = page.locator('[data-testid="draft-card-v3"]')
    expect(await cards.count()).toBe(1)
    expect(await cards.first().getByText('确认写入').count()).toBeGreaterThanOrEqual(1)
    expect(tripwire.pageErrors).toEqual([])
  })
})
