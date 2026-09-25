/**
 * Mobile assistant e2e (keyless): the seeded v3+v5 form-assistant sessions
 * render on the mobile chat view from the SAME session store the PC client
 * reads — the ask_choice fork (two-form disambiguation) with its answered
 * replay state, the three-tier v3 draft card, the fenced 确认写入 action, the
 * receipt metric card, the KG evidence section, the v5 report card (the
 * seeded ```dsh report fence with its M1/M3 action messages), and the
 * fresh-session welcome that never sends a message as the user. Picks and
 * confirms ride the durable session log through the real gateway.
 * Run: pnpm run test:web -- mobile-assistant
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import KbGraphRuntime, { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import { launchWebScaffold, seedSession, watchConsole, webSnapshotMode, compareOrRefreshGolden } from './scaffold.ts'
import type { WebScaffold } from './scaffold.ts'
import { ZH_BROWSER_LOCALE } from './support.ts'

const OVERLAY = fileURLToPath(new URL('./mobile.overlay.yml', import.meta.url))
const GOLDEN_DIR = fileURLToPath(new URL('./snapshots/mobile-assistant', import.meta.url))
const seedPath = (name: string): string => fileURLToPath(new URL(`./snapshots/mobile-assistant/${name}`, import.meta.url))
const SEED_ID = 'mobile-assistant-seed'
const ASK_SEED_ID = 'mobile-assistant-ask'
const CONFIRM_SEED_ID = 'mobile-assistant-confirm'
const BLANK_SEED_ID = 'mobile-assistant-blank'

/** The persisted-log window of one session, read through the real gateway. */
interface LogWindow {
  readonly events: readonly { readonly event: { readonly type: string; readonly data: unknown } }[]
}

/** Read one session's log window through the gateway the page itself uses. */
async function readLog(baseUrl: string, sessionId: string): Promise<LogWindow | undefined> {
  const response = await fetch(`${baseUrl}/api/session.history`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'm3-e2e', method: 'session.history', payload: { sessionId, maxMessages: 50 } }),
  })
  const full = await response.json() as { result: { ok: boolean; value?: LogWindow } }
  if (!full.result.ok || full.result.value === undefined) return undefined
  return full.result.value
}

/** The first user/message JSON carrying the needle, or ''. */
async function userMessageWith(baseUrl: string, sessionId: string, needle: string): Promise<string> {
  const log = await readLog(baseUrl, sessionId)
  if (log === undefined) return ''
  return log.events
    .map(entry => entry.event)
    .filter(event => event.type === 'user/message')
    .map(event => JSON.stringify(event.data))
    .find(text => text.includes(needle)) ?? ''
}

/** Count one session's genuinely-user messages (-1 on a failed read). */
async function userMessageCount(baseUrl: string, sessionId: string): Promise<number> {
  const log = await readLog(baseUrl, sessionId)
  if (log === undefined) return -1
  return log.events.filter((entry) => {
    if (entry.event.type !== 'user/message') return false
    const source = (entry.event.data as { source?: { kind?: unknown } } | undefined)?.source
    return source?.kind === 'user'
  }).length
}

describe('mobile v3+v5 assistant (seeded sessions → fork pick + draft + confirm + receipt + report + welcome)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    // In-memory graph store seeded the kg-graph-page way: the evidence card's
    // one-hop re-walk resolves 鲜丰 through the same seam the PC KG view reads.
    const ctx = scaffold.ctx
    await ctx.plugin(KbGraphRuntime)
    await ctx.plugin(KbGraphSqlite, { path: ':memory:' })
    const graph = ctx.get('kbGraph')
    if (graph === undefined) throw new Error('kbGraph did not compose')
    const now = new Date().toISOString()
    await graph.upsertNode({ id: 'e2e:company:xianfeng', tenantId: 'default', type: kgNodeTypeId('company'), name: '鲜丰', naturalKey: '鲜丰', createdAt: now, updatedAt: now })
    await graph.upsertNode({ id: 'e2e:product:coldbox', tenantId: 'default', type: kgNodeTypeId('product'), name: '冷链箱', naturalKey: '冷链箱', createdAt: now, updatedAt: now })
    await graph.upsertEdges([{
      id: 'e2e:v3:supplies',
      tenantId: 'default',
      srcId: 'e2e:company:xianfeng',
      dstId: 'e2e:product:coldbox',
      relation: kgRelationId('produces'),
      fact: '鲜丰供应冷链箱',
      confidence: 1,
      provenance: { sourceSystem: 'kb', sourceId: 'mobile-assistant-e2e', extractedAt: now },
      validFrom: now,
    }])
    // The interaction seeds stay preset-unbound: their clicks must land in the
    // durable log even though this scaffold has no model key to resume the
    // preset's agent turn. The welcome seed binds the preset because the
    // fresh-session rendering reads it.
    await seedSession(scaffold, await readFile(seedPath('seed.jsonl'), 'utf8'), SEED_ID)
    await seedSession(scaffold, await readFile(seedPath('ask-seed.jsonl'), 'utf8'), ASK_SEED_ID)
    await seedSession(scaffold, await readFile(seedPath('confirm-seed.jsonl'), 'utf8'), CONFIRM_SEED_ID)
    await seedSession(scaffold, await readFile(seedPath('blank-seed.jsonl'), 'utf8'), BLANK_SEED_ID, 'mobile-form-assistant')
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

  /** Open one seeded chat through the demo login gate. */
  async function openChat(sessionId: string): Promise<void> {
    await page.goto(`${scaffold.baseUrl}/mobile#/chat/${sessionId}`, { waitUntil: 'load' })
    await page.getByPlaceholder('6 位验证码').fill('123456')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    try {
      await page.locator('main').waitFor({ timeout: 20_000 })
    } catch (error) {
      throw new Error(`mobile chat did not render session ${sessionId}. body: ${await page.locator('body').innerText()}`, { cause: error })
    }
  }

  it('keeps the mobile chat golden stable (aria snapshot of the folded v3+v5 flow)', async () => {
    await openChat(SEED_ID)
    await page.getByTestId('ask-choice').waitFor({ timeout: 15_000 })
    await page.locator('[data-testid="receipt-card-v3"]').waitFor({ timeout: 15_000 })
    // The v5 report card lands after the form flow (the seeded risk turn).
    await page.getByTestId('report-card').waitFor({ timeout: 15_000 })
    // The M1/M3 action messages render as ordinary user bubbles (the seeded
    // create/done notices after the report turn).
    await page.getByText('已创建处理任务：跟进鲜丰冷链箱交期').waitFor({ timeout: 15_000 })
    await page.getByText('工作已完成：跟进鲜丰冷链箱交期').waitFor({ timeout: 15_000 })
    // The KG evidence collapsed into its single entry row (02 §4.5).
    await page.getByRole('button', { name: 'KG 证据入口' }).waitFor({ timeout: 15_000 })
    const mode = webSnapshotMode()
    const aria = await page.locator('main').ariaSnapshot()
    const normalized = aria.replaceAll(SEED_ID, '{{sessionId}}')
    await compareOrRefreshGolden(join(GOLDEN_DIR, 'chat.expected.md'), normalized, mode)
  })

  it('renders the folded v3+v5 flows without any protocol leakage', async () => {
    await openChat(SEED_ID)
    await page.getByText('这笔要登记成什么单据？').first().waitFor({ timeout: 15_000 })
    // The answered fork greys out and highlights the picked card (01 ⑤D1/D2).
    await expect.poll(async () => page.locator('[data-testid="ask-choice"]').getAttribute('class'), { timeout: 10_000 })
      .toContain('askAnswered')
    await page.locator('[data-testid="receipt-card-v3"]').waitFor({ timeout: 15_000 })
    await page.getByTestId('report-card').waitFor({ timeout: 15_000 })
    const body = await page.locator('main').innerText()
    // The narrative carries the fork pick as the small capsule (D3 replay).
    expect(body).toContain('是采购单，我们从鲜丰买进')
    // Protocol invisibility (01 ⑤C2/C4): no fences, no table names.
    expect(body.includes('```dsh')).toBe(false)
    expect(body.includes('hub_po_purchase_orders')).toBe(false)
    expect(body.includes('hub_wms_outbound')).toBe(false)
    // Protocol invisibility (04 §7.3): no bare JSON, no report field names.
    expect(body.includes('{"v":3')).toBe(false)
    expect(body.includes('"kind"')).toBe(false)
    expect(body.includes('"tone"')).toBe(false)
    expect(body.includes('"payload"')).toBe(false)
    expect(body.includes('"metrics"')).toBe(false)
    expect(body.includes('"rows"')).toBe(false)
    expect(body.includes('"subtitle"')).toBe(false)
    // The landed card hides behind its receipt; the action badge and the
    // metric card carry the landing anchor (E1/C3).
    expect(body).toContain('你确认了这张采购单')
    expect(body).toContain('已登记 · 采购单')
    expect(body).toContain('¥6,400')
    expect(body).toContain('1042')
    // The v5 report card carries its business-language surface only: title,
    // metric cells, severity rows, and the action buttons (04 §7.3 #6).
    expect(body).toContain('项目风险')
    expect(body).toContain('鲜丰冷链箱交期推迟')
    expect(body).toContain('创建处理任务')
    // The M1/M3 action messages are human-readable chat lines, never fences
    // (04 §7.3 #7).
    expect(body).toContain('已创建处理任务：跟进鲜丰冷链箱交期')
    expect(body).toContain('工作已完成：跟进鲜丰冷链箱交期')
    // The seeded kg walk feeds the evidence sheet behind the entry row.
    await page.getByRole('button', { name: 'KG 证据入口' }).click()
    await page.getByRole('region', { name: 'KG 证据卡' }).waitFor({ timeout: 15_000 })
    await page.getByText('鲜丰').first().waitFor()
    expect(tripwire.pageErrors).toEqual([])
  })

  it('answers the fork by picking an option (the pick rides the durable log verbatim)', async () => {
    await openChat(ASK_SEED_ID)
    await page.getByText('这笔要登记成什么单据？').first().waitFor({ timeout: 15_000 })
    await page.getByRole('radio', { name: /采购单/ }).click()
    // The pick sends the option's send-text as the user's own message (D3).
    await expect.poll(
      async () => await userMessageWith(scaffold.baseUrl, ASK_SEED_ID, '是采购单，我们从鲜丰买进'),
      { timeout: 15_000 },
    ).toContain('是采购单，我们从鲜丰买进')
    // The UI replays the answer: greyed group, highlighted pick, capsule reply
    // (the capsule carries the send-text verbatim; the check mark is a lucide
    // glyph since the v4 visual batch).
    await expect.poll(async () => page.locator('[data-testid="ask-choice"]').getAttribute('class'), { timeout: 10_000 })
      .toContain('askAnswered')
    await page.getByText('是采购单，我们从鲜丰买进').first().waitFor({ timeout: 10_000 })
    expect(tripwire.pageErrors).toEqual([])
  })

  it('confirms the three-tier draft through the fenced action, never the v2 protocol text', async () => {
    await openChat(CONFIRM_SEED_ID)
    const card = page.locator('[data-testid="draft-card-v3"]')
    await card.waitFor({ timeout: 15_000 })
    // The three tiers render by their business names with the rationale
    // annotations (01 ⑤B1/B2) before the decision — the rationale rides under
    // its value without a separator glyph since the v4 visual batch.
    const tiers = await card.innerText()
    expect(tiers).toContain('需要你定')
    expect(tiers).toContain('请确认 · AI 推导')
    expect(tiers).toContain('系统生成（1）')
    expect(tiers).toContain('今天')
    expect(tiers).toContain('200×32')
    // Field-level edit before deciding: the required quantity (the antd Input
    // names itself through the enclosing field-row label).
    await card.getByLabel('数量').fill('260')
    await card.getByRole('button', { name: '确认写入' }).click()
    // The action rides the wire as 确认写入 + the form_confirm fence (E1).
    await expect.poll(
      async () => await userMessageWith(scaffold.baseUrl, CONFIRM_SEED_ID, 'form_confirm'),
      { timeout: 15_000 },
    ).toContain('确认写入')
    // The card flips to the pending phase note; the v2 protocol text is gone.
    await expect.poll(async () => card.innerText(), { timeout: 10_000 }).toContain('正在写入')
    const body = await page.locator('main').innerText()
    expect(body.includes('确认推送')).toBe(false)
    expect(body.includes('nb_create')).toBe(false)
    expect(tripwire.pageErrors).toEqual([])
  })

  it('renders the fresh-session welcome with zero user messages in the log', async () => {
    await openChat(BLANK_SEED_ID)
    await page.getByTestId('welcome-card').waitFor({ timeout: 15_000 })
    // The welcome card carries the identity, capabilities, and starters (01 ⑤A2).
    const card = await page.getByTestId('welcome-card').innerText()
    expect(card).toContain('我是智能填表助手')
    expect(card).toContain('说一句话就能登记：采购单、供应商登记、质检记录、入库单、出库单、回款记录')
    expect(card).toContain('登记一条采购单')
    expect(card).toContain('登记一条出库单')
    // The composer waits empty; no user bubble exists (A1).
    const main = await page.locator('main').innerText()
    expect(main.includes('帮我登记一下')).toBe(false)
    expect(await userMessageCount(scaffold.baseUrl, BLANK_SEED_ID)).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  })
})
