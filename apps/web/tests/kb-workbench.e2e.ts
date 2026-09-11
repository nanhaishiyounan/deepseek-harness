/**
 * KB workbench e2e over the real web composition, one scaffold world per file
 * (the lane's standing constraint: the fs backend's config schema snapshots
 * process.cwd() at module load, so a second booted world would still resolve
 * ingest paths against the first one's temp root). There is no fixture file:
 * the shipped base + web-app bundle patches boot first, then the kb seam and
 * an in-memory SQLite store mount in-process through `ctx.plugin` (text-only
 * degraded mode — no embed provider, so the lane stays keyless), and the
 * gateway's kb write methods are opted in through the scenario overlay.
 *
 * Two faces over that one world, in order:
 * - the gateway's own `apiProxy.kb` face — exactly what the browser surfaces
 *   drive — ingests one corpus document, retrieves a cited passage, and
 *   observes the usage counters;
 * - a real Chromium drives the redesigned UI end to end in Chinese: the
 *   blank-session portal hero (product headline, usage chips, sample
 *   questions, scenario rail), the seeded session's kb_search toolview row,
 *   the workbench view tab's search-and-carry flow, the ingest wizard's
 *   browsed-file path, and the sidebar entry's document badge. The seeded
 *   session is synthesized through the Session API (one closed turn with a
 *   kb_search call/result pair), so the whole lane issues zero model calls.
 */

import { homedir } from 'node:os'
import { copyFile, mkdir, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFailed } from 'vitest'
import {
  CallId, createAssistantMessage, createToolResultMessage, createUserMessage,
} from '@deepseek-ai/dsh-llm'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import { launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { ZH_BROWSER_LOCALE, connectFreshWorkspaceZh, saveFailureShot } from './support.ts'

/** Opts the gateway's kb write methods in for this scenario (they ship opt-in). */
const OVERLAY = fileURLToPath(new URL('./kb-workbench.overlay.yml', import.meta.url))

const CORPUS = fileURLToPath(new URL('../../../examples/kb-agent/workspace/data/regulations/gb2760-excerpt.md', import.meta.url))

/** The corpus's workspace-relative path (both the gateway ingest and the seed cite it). */
const CORPUS_PATH = 'workspace/data/regulations/gb2760-excerpt.md'

/** The wizard's ingest target: a second document staged beside the corpus. */
const SUPPLIER_PATH = 'workspace/data/suppliers/suppliers-note.md'

const SEED_ID = 'kb-workbench-web-e2e'
const SEED_TITLE = '知识库问询'
const SEED_QUERY = '酱油 山梨酸钾'

/** The kb_search result text exactly as the tool renders it (the toolview parses it). */
const SEED_SEARCH_TEXT = [
  '[1] workspace/data/regulations/gb2760-excerpt.md — 三、调味品行业常见关注项 — regulation — chunk 0',
  '  酱油中山梨酸钾最大使用量为 0.5 g/kg（以山梨酸计）。',
  'Cite the sources above as [n] — document name and heading path — in your answer.',
].join('\n')

/**
 * Synthesize the seeded session's log: one closed turn whose assistant step
 * carries a kb_search call/result pair, so the browser renders the toolview
 * row purely from the log.
 * @returns canonical JSONL (placeholder ids, realized by seedSession).
 */
function createSeedLog(): string {
  const session = Session.create(SessionId('kb-workbench-seed-template'))
  session.append('turn/start', { turn: 1 })
  const user = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: '帮我查一下酱油中山梨酸钾的最大使用量。' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('session/title', {
    title: SEED_TITLE,
    messageSeqs: [user.seq],
    source: { kind: 'fallback' },
  })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('request/header', {
    header: {
      config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      system: 'Synthetic kb workbench seed.',
    },
    reason: 'initial',
  })
  const callId = CallId('kb-workbench-seed-call-1')
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: createAssistantMessage({
      content: [{ type: 'tool-call', id: callId, name: 'kb_search', arguments: JSON.stringify({ query: SEED_QUERY }) }],
      source: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    }),
    usage: { inputTokens: 100, outputTokens: 20 },
  }, { surfaceOp: 'append' })
  const call = session.append('tool/call', {
    turn: 1,
    step: 1,
    callId,
    name: 'kb_search',
    arguments: JSON.stringify({ query: SEED_QUERY }),
  })
  session.append('tool/result', {
    turn: 1,
    step: 1,
    message: createToolResultMessage({
      callId,
      content: [{ type: 'text', text: SEED_SEARCH_TEXT }],
      isError: false,
    }),
    meta: { query: SEED_QUERY, mode: 'text', truncated: false, hits: 1 },
  }, { surfaceOp: 'append', sourceEventSeqs: [call.seq] })
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: createAssistantMessage({
      content: [{ type: 'text', text: '根据知识库检索结果，酱油中山梨酸钾的最大使用量为 0.5 g/kg（以山梨酸计）[1]。' }],
      source: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    }),
    usage: { inputTokens: 120, outputTokens: 40 },
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  return [
    JSON.stringify({
      type: 'session',
      version: SESSION_FORMAT_VERSION,
      id: '{{sessionId}}',
      createdAt: Date.now() - 60_000,
      cwd: '{{cwd}}',
      delegationDepth: 0,
    }),
    ...session.events.map(event => JSON.stringify(event)),
    '',
  ].join('\n')
}

/** Dismiss the first-run welcome notice when it renders (zh copy). */
async function dismissWelcome(page: Page): Promise<void> {
  const welcome = page.locator('[class*="onboardingOverlay"]')
  if (await welcome.count() > 0) {
    await welcome.getByRole('button').click()
    await welcome.waitFor({ state: 'detached', timeout: 15_000 })
  }
}

/** The seeded turn's user message, the marker that the session is open. */
const SEED_USER_MESSAGE = '帮我查一下酱油中山梨酸钾的最大使用量。'

/**
 * Open the seeded session from the sidebar. These cases run before any
 * workspace is connected, so the tree lists the ungrouped bucket and the
 * seeded session beneath it (group row first, session row second) — the
 * seeded-history pattern.
 * @param page - the page under test.
 */
async function openSeededSession(page: Page): Promise<void> {
  const groupRow = page.locator('[role="treeitem"]').first()
  await groupRow.waitFor({ timeout: 30_000 })
  await groupRow.click()
  await page.locator('[role="treeitem"]').nth(1).click()
  await page.getByText(SEED_USER_MESSAGE).first().waitFor({ timeout: 15_000 })
}

/**
 * Walk the ingest wizard's directory browser from the host home to an
 * absolute target: jump to the filesystem-root crumb, then descend through
 * one directory-row click per path segment.
 * @param page - the page under test (the wizard's file tab already open).
 * @param target - the absolute directory path to reach.
 */
async function browseTo(page: Page, target: string): Promise<void> {
  await page.getByRole('button', { name: '/', exact: true }).click()
  for (const segment of target.split('/').filter(part => part !== '')) {
    // The folder row's accessible name folds in its leading/trailing icon
    // glyphs, so match on the row's own text, anchored to the full name.
    const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const row = page.locator('[role="listitem"]').filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) })
    await row.click({ timeout: 15_000 })
  }
}

describe('kb workbench (text-only degraded mode, Chinese UI)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  /** Host-home symlink to the temp workspace root (the wizard's browse shortcut). */
  let browseLink: string
  let tripwire: ReturnType<typeof watchConsole> = { warnings: [], pageErrors: [] }
  let slotErrors: string[] = []

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      extraOverlayPath: OVERLAY,
      // The portal's scenario cards select roster presets. Mount the
      // food-industry scenario library beside the shipped presets so a
      // newly synced card (cold-chain) starts a session through the real
      // selection path — the same roots cordis.patch.yml gives the
      // deployment, minus the example's writable authoring root.
      agentPresets: {
        roots: [
          { path: fileURLToPath(new URL('../../../apps/cli/config/agent-presets', import.meta.url)), trust: 'system' },
          { path: fileURLToPath(new URL('../../../examples/kb-agent/scenarios', import.meta.url)), trust: 'user' },
        ],
        default: 'standard',
      },
    })
    // The kb capability is a product overlay, not a web-app default: mount it
    // in-process exactly as an overlay row would (seam + store, no embed).
    await scaffold.ctx.plugin(KbRuntime)
    await scaffold.ctx.plugin(KbSqlite, { path: ':memory:' })
    await mkdir(join(scaffold.workspaceCwd, 'workspace/data/regulations'), { recursive: true })
    await mkdir(join(scaffold.workspaceCwd, 'workspace/data/suppliers'), { recursive: true })
    await copyFile(CORPUS, join(scaffold.workspaceCwd, CORPUS_PATH))
    await writeFile(join(scaffold.workspaceCwd, SUPPLIER_PATH), [
      '# 供应商走访纪要',
      '',
      '宏达塑业近十二个月交付准时率为 96%，批次合格率 99.2%。',
      '',
    ].join('\n'))
    await seedSession(scaffold, createSeedLog(), SEED_ID)
    // The wizard's directory browser starts at the host home and lists one
    // level per round-trip with a name-sorted window; the system temp tree
    // holds thousands of entries, so the temp root itself sits beyond the
    // window. A home-level symlink keeps the browse path short (and the
    // ingest still resolves through it — the fs backend follows symlinks).
    browseLink = join(homedir(), `dsh-kb-e2e-link-${process.pid}`)
    await symlink(scaffold.workspaceCwd, browseLink)
    browser = await chromium.launch()
  }, 180_000)

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    slotErrors = []
    page.on('console', (message) => {
      if (message.type() === 'error' && /slot entry crashed/i.test(message.text())) {
        slotErrors.push(message.text())
      }
    })
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await dismissWelcome(page)
  }, 120_000)

  afterEach(async () => {
    const failures: unknown[] = []
    try {
      expect({
        pageErrors: tripwire.pageErrors,
        slotErrors,
        warnings: tripwire.warnings,
      }).toEqual({
        pageErrors: [],
        slotErrors: [],
        warnings: [],
      })
    } catch (error) {
      failures.push(error)
    }
    await page?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'kb workbench case cleanup failed')
  })

  afterAll(async () => {
    const failures: unknown[] = []
    await unlink(browseLink).catch((error: unknown) => failures.push(error))
    await browser?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'kb workbench cleanup failed')
  })

  it('ingests a document, retrieves a cited passage, and meters usage through the gateway face', async () => {
    const kb = scaffold.ctx.apiProxy.kb

    const ingested = await kb.ingest({ rpcId: 'kb-e2e-ingest' as never, payload: { path: CORPUS_PATH, doc_kind: 'regulation' } })
    expect(ingested.result.ok, `ingest failed: ${JSON.stringify(ingested.result)}`).toBe(true)
    if (ingested.result.ok) expect(ingested.result.value.chunks).toBeGreaterThan(0)

    const searched = await kb.search({ rpcId: 'kb-e2e-search' as never, payload: { query: '调味品 防腐剂 使用' } })
    expect(searched.result.ok).toBe(true)
    if (searched.result.ok) {
      // No embed provider is mounted: the degraded mode is observable here too.
      expect(searched.result.value.mode).toBe('text')
      expect(searched.result.value.results.length).toBeGreaterThan(0)
      expect(searched.result.value.results[0]!.source_path).toBe(CORPUS_PATH)
    }

    const stats = await kb.stats({ rpcId: 'kb-e2e-stats' as never, payload: {} })
    expect(stats.result.ok).toBe(true)
    if (stats.result.ok) {
      expect(stats.result.value.documents).toBe(1)
      expect(stats.result.value.embed_available).toBe(false)
      expect(stats.result.value.usage.searches).toBe(1)
      expect(stats.result.value.usage.ingested_documents).toBe(1)
    }
  })

  it('renders the seeded kb_search toolview row with numbered sources', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-kb-toolview'))
    await openSeededSession(page)
    // The toolview row's collapsed summary: query + source count.
    const row = page.getByRole('button', { name: new RegExp(`知识库检索.*${SEED_QUERY}.*1 条来源`) })
    await row.waitFor({ timeout: 15_000 })
    await row.click()
    // Expanded: numbered badge, business-language source line, highlighted term.
    await page.getByText('[1]').first().waitFor()
    await page.getByText(/gb2760 excerpt — 三、调味品行业常见关注项/u).waitFor()
    expect(await page.locator('mark').filter({ hasText: '山梨酸' }).count()).toBeGreaterThan(0)
  }, 120_000)

  it('searches in the workbench tab and carries the hit back to the chat draft', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-kb-workbench-search'))
    await openSeededSession(page)
    // Open the workbench view tab.
    await page.getByRole('tab', { name: '知识库', exact: true }).click()
    await page.getByPlaceholder('检索知识库，如：山梨酸 酱油 限量').waitFor({ timeout: 15_000 })
    // The sidebar entry shows the ingested document count as its badge.
    await expect.poll(
      () => page.getByRole('button', { name: '知识库文档数' }).textContent(),
      { timeout: 15_000 },
    ).toContain('1')
    // Run one search over the real gateway face.
    await page.getByPlaceholder('检索知识库，如：山梨酸 酱油 限量').fill('山梨酸')
    await page.getByRole('button', { name: '检索', exact: true }).click()
    await page.getByText('[1]').first().waitFor({ timeout: 15_000 })
    await page.getByText(/gb2760 excerpt/u).first().waitFor()
    expect(await page.locator('mark').filter({ hasText: '山梨酸' }).count()).toBeGreaterThan(0)
    // Carry the hit into the conversation draft and land back on the chat tab.
    await page.getByRole('button', { name: '引用并提问' }).first().click()
    await expect.poll(
      () => page.locator('textarea:enabled').first().inputValue(),
      { timeout: 15_000 },
    ).toContain('关于「gb2760 excerpt」：山梨酸')
    await expect.poll(
      () => page.getByRole('tab', { name: '对话', exact: true }).getAttribute('aria-selected'),
      { timeout: 15_000 },
    ).toBe('true')
  }, 120_000)

  it('ingests a workspace file through the wizard and updates the badge', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-kb-ingest-wizard'))
    await openSeededSession(page)
    await page.getByRole('tab', { name: '知识库', exact: true }).click()
    await page.getByRole('button', { name: '添加文档' }).first().click()
    const dialog = page.getByRole('dialog', { name: '添加文档' })
    await dialog.waitFor({ timeout: 15_000 })
    await dialog.getByRole('tab', { name: '服务器文件' }).click()
    await browseTo(page, join(browseLink, 'workspace/data/suppliers'))
    await dialog.getByRole('textbox', { name: /文件名/ }).fill('suppliers-note.md')
    await dialog.getByRole('button', { name: '入库', exact: true }).click()
    // The receipt toast names the document and its passage count.
    await page.getByText(/已入库：suppliers-note\.md · \d+ 个片段/u).waitFor({ timeout: 15_000 })
    // The sidebar badge follows the refreshed stats (two documents now).
    await expect.poll(
      () => page.getByRole('button', { name: '知识库文档数' }).textContent(),
      { timeout: 15_000 },
    ).toContain('2')
  }, 180_000)

  /**
   * Land on the blank hero of a freshly connected workspace: the seeded
   * session may have auto-selected, so a fresh blank session carries the
   * portal. Leaves the page on the blank hero with the recent log cleared.
   * @param page - the page under test.
   */
  async function openBlankHero(page: Page): Promise<void> {
    // Clear before anything mounts: earlier cases in this one-world lane
    // record searches, and each cross-view case asserts its own full history.
    await page.evaluate(() => { localStorage.removeItem('dsh-kb-recent-searches') })
    // A workspace is already connected when an earlier case in this one-world
    // lane connected one — then the composer is live and only the session
    // needs refreshing. Otherwise the composer is still the Workspace-picker
    // trigger, which is the cold start connectFreshWorkspaceZh serves.
    const coldTrigger = page.getByRole('textbox', { name: '选择工作区' })
    if (await coldTrigger.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
      await connectFreshWorkspaceZh(page, scaffold.workspaceCwd)
    } else {
      // Startup auto-selection may have opened the seeded session; a fresh
      // blank session is what carries the portal. The button's accessible
      // name is its aria-label; the visible "新会话" text is not the a11y
      // name, and two mounted buttons share it.
      await page.getByRole('button', { name: '新建会话', exact: true }).first().click()
    }
    // The no-session hero shows the headline too (the seat is root-scoped);
    // the session-backed blank hero is what carries the view ring, so wait
    // for its live composer.
    await page.locator('textarea:enabled[placeholder="问一个问题，或描述你的任务"]').waitFor({ timeout: 15_000 })
    await page.getByText('食品产业知识库问答').first().waitFor({ timeout: 15_000 })
  }

  it('renders the portal hero on the blank session: headline, usage chips, samples, scenarios', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-kb-hero'))
    await connectFreshWorkspaceZh(page, scaffold.workspaceCwd)
    // Startup auto-selection may have opened the seeded session; a fresh
    // blank session is what carries the portal.
    const newSession = page.getByRole('button', { name: '新会话' })
    if (await newSession.count() > 0) await newSession.click()
    // The headline seat renders icon + name + tagline (+ preview badge) as one
    // composite node, so the assertions match on contained text, not exact nodes.
    const heroHeadline = page.locator('[class*="headline"]').first()
    await heroHeadline.waitFor({ timeout: 15_000 })
    await expect.poll(() => heroHeadline.innerText()).toContain('食品产业知识库问答')
    await expect.poll(() => heroHeadline.innerText()).toContain('检索企业文档 · 带编号引用回答 · 覆盖合规/工艺/成本/供应链')
    // Both ingests (the gateway case's corpus and the wizard's supplier
    // note) drive the document chip.
    await page.getByText('文档 2').first().waitFor({ timeout: 15_000 })
    // The usage chip keeps the whole-catalog count; the browse heading
    // restates it over the folded categories.
    await page.getByText('30 个场景', { exact: true }).first().waitFor({ timeout: 15_000 })
    await page.getByText('30 个场景 · 分类浏览').first().waitFor({ timeout: 15_000 })
    // Sample questions fill the composer; the scenario portal leads with the
    // featured row (both named leads are featured picks).
    await page.getByRole('button', { name: '酱油中山梨酸钾的最大使用量？' }).click()
    await expect.poll(() => page.locator('textarea:enabled').first().inputValue()).toContain('酱油中山梨酸钾')
    await page.getByText('AI 营销洞察主管').waitFor()
    await page.getByText('AI 食安服务主管').waitFor()
    // IA assertion: the default viewport renders at most ten scenario cards —
    // exactly the featured six in the DOM (every category folded), and none
    // of the rendered cards clipped outside the viewport box.
    expect(await page.locator('[class*="scenarioCard"]').count()).toBe(6)
    const visibleCards = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="scenarioCard"]'))
      .filter((card) => {
        const rect = card.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
          && rect.bottom > 0 && rect.top < window.innerHeight
          && rect.right > 0 && rect.left < window.innerWidth
      }).length)
    expect(visibleCards).toBeLessThanOrEqual(10)
  }, 120_000)

  it('starts a new session from a newly synced featured card through the real preset selection', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-kb-scenario-card'))
    await openBlankHero(page)
    // cold-chain joined the catalog with the thirty-card sync and is one of
    // the six featured picks, so it sits on the default viewport: the confirm
    // modal states the probe, and starting applies the preset and fills that
    // probe into the composer.
    await page.getByText('30 个场景 · 分类浏览').first().waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: /AI 冷链管理主管/ }).click()
    await page.getByText('示例问题：冷链 断链处置').waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: '开始会话' }).click()
    await expect.poll(() => page.locator('textarea:enabled').first().inputValue()).toContain('冷链 断链处置')
    expect(await page.getByText('场景切换失败').count()).toBe(0)
  }, 120_000)

  it('filters the scenario portal through the live search and recovers the browse view', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-kb-scenario-search'))
    await openBlankHero(page)
    const search = page.getByRole('searchbox', { name: '搜索场景' })
    await search.waitFor({ timeout: 15_000 })
    // The default view folds everything but the featured six.
    expect(await page.locator('[class*="scenarioCard"]').count()).toBe(6)
    // A keyword filters the whole catalog: 0 < visible < 30, with the
    // hit-count summary naming both numbers.
    await search.fill('食安')
    await page.getByText('匹配 4 / 30 个场景').waitFor({ timeout: 15_000 })
    await expect.poll(() => page.locator('[class*="scenarioCard"]').count()).toBe(4)
    await page.getByText('AI 食安服务主管').waitFor()
    // A keyword the featured market lead does not carry drops it from view.
    expect(await page.getByText('AI 营销洞察主管').count()).toBe(0)
    // A miss renders the empty state with zero cards.
    await search.fill('不存在的关键词')
    await page.getByText('没有匹配的场景 — 换个关键词试试').waitFor({ timeout: 15_000 })
    expect(await page.locator('[class*="scenarioCard"]').count()).toBe(0)
    // Clearing the query restores the featured row plus the folded browse
    // (all thirty scenarios stay reachable).
    await search.fill('')
    expect(await page.locator('[class*="scenarioCard"]').count()).toBe(6)
    await page.getByText('精选场景').waitFor()
  }, 120_000)

  it('reaches a folded scenario by expanding its category and starts it from the card', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-kb-scenario-foldout'))
    await openBlankHero(page)
    // label-review is neither featured nor matched by the portal search's
    // obvious food-safety keywords: the folded category row is its path.
    const row = page.getByRole('button', { name: /食品安全/ })
    await row.waitFor({ timeout: 15_000 })
    expect(await row.getAttribute('aria-expanded')).toBe('false')
    await row.click()
    await expect.poll(() => row.getAttribute('aria-expanded')).toBe('true')
    // Featured six plus the bucket's four cards, still within the cap.
    await expect.poll(() => page.locator('[class*="scenarioCard"]').count()).toBe(10)
    await page.getByRole('button', { name: /AI 标签合规审查员/ }).click()
    await page.getByText('示例问题：营养标签 修约规则').waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: '开始会话' }).click()
    await expect.poll(() => page.locator('textarea:enabled').first().inputValue()).toContain('营养标签 修约规则')
    expect(await page.getByText('场景切换失败').count()).toBe(0)
  }, 120_000)

  it('opens the workbench from the blank hero through the sidebar entry and returns to the hero', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-kb-blank-entry'))
    await openBlankHero(page)
    // The blank session keeps its view ring (the shell's additive rule), so
    // the kb tab renders before the first message.
    await page.getByRole('tab', { name: '知识库', exact: true }).waitFor({ timeout: 15_000 })
    // The sidebar entry jumps straight to the workbench view.
    await page.getByRole('button', { name: '知识库文档数' }).click()
    await page.getByPlaceholder('检索知识库，如：山梨酸 酱油 限量').waitFor({ timeout: 15_000 })
    // While the workbench owns the column, the hero chrome and its portal
    // step aside (the headline seat only renders under the hero phase).
    await page.getByText('食品产业知识库问答').first().waitFor({ state: 'detached', timeout: 15_000 })
    // One real search over the gateway face.
    await page.getByPlaceholder('检索知识库，如：山梨酸 酱油 限量').fill('山梨酸')
    await page.getByRole('button', { name: '检索', exact: true }).click()
    await page.getByText('[1]').first().waitFor({ timeout: 15_000 })
    // Back on the chat tab, the still-blank hero returns with its portal
    // (browse heading restating the catalog count over the folded rows).
    await page.getByRole('tab', { name: '对话', exact: true }).click()
    await page.getByText('食品产业知识库问答').first().waitFor({ timeout: 15_000 })
    await page.getByText('30 个场景 · 分类浏览').first().waitFor({ timeout: 15_000 })
  }, 120_000)

  it('syncs the hero recent-search rail with the workbench history across views', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-kb-recent-sync'))
    await openBlankHero(page)
    await page.getByRole('tab', { name: '知识库', exact: true }).click()
    const input = page.getByPlaceholder('检索知识库，如：山梨酸 酱油 限量')
    await input.waitFor({ timeout: 15_000 })
    // Three distinct queries over the real gateway face (all three hit the
    // corpus the gateway case ingested).
    for (const query of ['山梨酸', '调味品', '添加剂']) {
      await input.fill(query)
      await page.getByRole('button', { name: '检索', exact: true }).click()
      await page.getByText('[1]').first().waitFor({ timeout: 15_000 })
    }
    // Back on the chat tab, the hero's recent rail lists the same queries
    // newest-first (the clear action rides the same row).
    await page.getByRole('tab', { name: '对话', exact: true }).click()
    const rail = page.locator('[class*="recentRow"]')
    await rail.waitFor({ timeout: 15_000 })
    await expect.poll(() => rail.locator('button').allInnerTexts()).toEqual([
      '添加剂', '调味品', '山梨酸', '清空',
    ])
    // Hard assertion on the persisted log itself, not just the rendered copy.
    const stored = await page.evaluate(() => localStorage.getItem('dsh-kb-recent-searches'))
    expect(JSON.parse(stored ?? '[]')).toEqual(['添加剂', '调味品', '山梨酸'])
  }, 120_000)

  it('caps the hero recent-search chip width for very long queries', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-kb-recent-truncate'))
    await openBlankHero(page)
    await page.getByRole('tab', { name: '知识库', exact: true }).click()
    const input = page.getByPlaceholder('检索知识库，如：山梨酸 酱油 限量')
    await input.waitFor({ timeout: 15_000 })
    // An 81-character query: recorded whole, but rendered as one clipped chip.
    const longQuery = '山梨酸'.repeat(27)
    await input.fill(longQuery)
    await page.getByRole('button', { name: '检索', exact: true }).click()
    await expect.poll(
      () => page.evaluate(() => localStorage.getItem('dsh-kb-recent-searches')),
      { timeout: 15_000 },
    ).toContain('山梨酸')
    await page.getByRole('tab', { name: '对话', exact: true }).click()
    const chip = page.locator('[class*="recentRow"] button').first()
    await chip.waitFor({ timeout: 15_000 })
    // The full query is stored whole while the chip clips it geometrically:
    // single-line (nowrap), capped at the row width, ellipsized. The Button's
    // anonymous flex text does not grow scrollWidth, so the proof is the
    // geometry: the whole text cannot fit the capped single line.
    const clipped = await chip.evaluate((el) => {
      const button = el as HTMLElement
      const row = button.parentElement as HTMLElement
      return {
        ellipsis: getComputedStyle(button).textOverflow === 'ellipsis',
        nowrap: getComputedStyle(button).whiteSpace === 'nowrap',
        withinRow: button.getBoundingClientRect().width <= row.getBoundingClientRect().width,
      }
    })
    expect(clipped.ellipsis).toBe(true)
    expect(clipped.nowrap).toBe(true)
    expect(clipped.withinRow).toBe(true)
    expect(await chip.textContent()).toBe(longQuery)
  }, 120_000)

  it('uploads local files through the browser picker and retrieves them with citations', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-kb-upload'))
    // Deterministic local fixtures: one markdown note staged beside the home
    // symlink, and the tool-suite's own sample PDF (parsed through the same
    // unpdf extractor the file channel uses).
    const notePath = join(browseLink, 'upload-note.md')
    await writeFile(notePath, '# 上传通道验证\n\n白糖采购的期货对冲策略由集团财务部统一制定。\n')
    const pdfPath = fileURLToPath(new URL('../../../packages/kb/tool-kb/tests/fixtures/docs/sample.pdf', import.meta.url))
    // Earlier cases in this one-world lane connected a workspace, so the
    // sidebar tree no longer lists the seeded session where this late case
    // can reach it; the blank session keeps the view ring, and its kb tab is
    // the same workbench.
    await page.getByRole('tab', { name: '知识库', exact: true }).click()
    await page.getByPlaceholder('检索知识库，如：山梨酸 酱油 限量').waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: '添加文档' }).first().click()
    const dialog = page.getByRole('dialog', { name: '添加文档' })
    await dialog.waitFor({ timeout: 15_000 })
    // The upload tab opens first; pick both files in one chooser round.
    await dialog.locator('input[type="file"]').setInputFiles([notePath, pdfPath])
    // Each file lands its own done row with a passage count.
    await expect.poll(
      () => dialog.getByRole('listitem').filter({ hasText: /已入库 · \d+ 个片段/u }).count(),
      { timeout: 30_000 },
    ).toBe(2)
    // The document badge follows the refreshed stats (the gateway case's
    // corpus + the wizard case's supplier note + these two uploads).
    await expect.poll(
      () => page.getByRole('button', { name: '知识库文档数' }).textContent(),
      { timeout: 15_000 },
    ).toContain('4')
    // The wizard stays open so the rows remain readable; close it before the
    // retrieval probes (the modal mask intercepts workbench pointers).
    await dialog.getByRole('button', { name: '取消' }).click()
    await dialog.waitFor({ state: 'detached', timeout: 15_000 })
    // Retrieval reaches the uploaded PDF with a numbered citation...
    const input = page.getByPlaceholder('检索知识库，如：山梨酸 酱油 限量')
    await input.fill('sugar procurement')
    await page.getByRole('button', { name: '检索', exact: true }).click()
    await page.getByText('[1]').first().waitFor({ timeout: 15_000 })
    await page.getByText(/sample/u).first().waitFor({ timeout: 15_000 })
    // ...and the uploaded markdown note answers its own probe term.
    await input.fill('期货对冲')
    await page.getByRole('button', { name: '检索', exact: true }).click()
    await page.getByText('[1]').first().waitFor({ timeout: 15_000 })
    await page.getByText(/上传通道验证|upload-note/u).first().waitFor({ timeout: 15_000 })
  }, 180_000)

  it('re-uploads a same-name document through the browser and toasts the replacement', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-kb-replace'))
    const twinPath = join(browseLink, 'replace-note.md')
    await writeFile(twinPath, '# 替换验证 v1\n\n麦芽采购的供应商评审由品控部牵头。\n')
    await page.getByRole('tab', { name: '知识库', exact: true }).click()
    await page.getByPlaceholder('检索知识库，如：山梨酸 酱油 限量').waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: '添加文档' }).first().click()
    const dialog = page.getByRole('dialog', { name: '添加文档' })
    await dialog.waitFor({ timeout: 15_000 })
    await dialog.locator('input[type="file"]').setInputFiles([twinPath])
    await expect.poll(
      () => dialog.getByRole('listitem').filter({ hasText: /已入库 · \d+ 个片段/u }).count(),
      { timeout: 30_000 },
    ).toBe(1)
    // Re-pick the same name with different bytes: the overwrite is the seam's
    // same-path semantics, and the toast must now report the replacement
    // fact instead of a plain ingest.
    await writeFile(twinPath, '# 替换验证 v2\n\n麦芽采购的供应商评审改由采购部牵头。\n')
    await dialog.locator('input[type="file"]').setInputFiles([twinPath])
    await page.getByText(/已替换同名文档：replace-note\.md · \d+ 个片段/u).first().waitFor({ timeout: 30_000 })
    await expect.poll(
      () => dialog.getByRole('listitem').filter({ hasText: /已入库 · \d+ 个片段/u }).count(),
      { timeout: 30_000 },
    ).toBe(2)
  }, 120_000)

  it('uploads a 12 MiB markdown file through the browser picker without breaking the wire gate', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-kb-big-upload'))
    // The whole-string canonical-base64 check used to exhaust the validation
    // stack from ~3.5 MB; this case drives a multi-megabyte pick through the
    // real browser → wire gate → decode → chunker → store path.
    const filler = 'bulk upload channel stress line: sugar futures hedging ledger record. '
    const probe = '琥珀麦芽烘焙曲线探针'
    const header = `# 大文件上传验证\n\n${probe}\n\n`
    // Assemble by counted line bytes, not by re-scanning a growing string.
    const lineBytes = Buffer.byteLength(`${filler}0\n`, 'utf8')
    const lineCount = Math.ceil((12 * 1024 * 1024 - Buffer.byteLength(header, 'utf8')) / lineBytes)
    const parts: string[] = [header]
    for (let n = 0; n < lineCount; n++) parts.push(`${filler}${n}\n`)
    const body = parts.join('')
    const bigPath = join(browseLink, 'big-upload.md')
    await writeFile(bigPath, body)
    await page.getByRole('tab', { name: '知识库', exact: true }).click()
    await page.getByPlaceholder('检索知识库，如：山梨酸 酱油 限量').waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: '添加文档' }).first().click()
    const dialog = page.getByRole('dialog', { name: '添加文档' })
    await dialog.waitFor({ timeout: 15_000 })
    await dialog.locator('input[type="file"]').setInputFiles([bigPath])
    await expect.poll(
      () => dialog.getByRole('listitem').filter({ hasText: /已入库 · \d+ 个片段/u }).count(),
      { timeout: 120_000 },
    ).toBe(1)
    await dialog.getByRole('button', { name: '取消' }).click()
    await dialog.waitFor({ state: 'detached', timeout: 15_000 })
    // The stored corpus answers its own probe term with a numbered citation.
    const input = page.getByPlaceholder('检索知识库，如：山梨酸 酱油 限量')
    await input.fill('琥珀麦芽')
    await page.getByRole('button', { name: '检索', exact: true }).click()
    await page.getByText('[1]').first().waitFor({ timeout: 15_000 })
    await page.getByText(/big-upload/u).first().waitFor({ timeout: 15_000 })
  }, 240_000)

  // [skip-multitab] Placeholder, intentionally not a runnable case: running
  // the same origin in two concurrent browser contexts would let both tabs'
  // workbench sessions write `dsh-kb-recent-searches` concurrently. The log
  // persists whole-value, so a rare interleaving is last-write-wins and can
  // drop one recorded query; single-tab use is unaffected. A deterministic
  // reproduction would need cross-tab storage coordination this lane's one
  // world does not offer — the degradation is documented in
  // examples/kb-agent/README.md "Known Limitations" instead.
})
