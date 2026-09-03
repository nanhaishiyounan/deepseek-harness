// Web e2e scenario: the New Session lifecycle. Two lanes over the shipped
// composition:
//
// 1. The healthy loop — connect a workspace, grow the blank session through
//    the real composer (one deterministic replay turn), press the sidebar's
//    New Session button to mint a fresh blank, grow that one too, then switch
//    back through the session tree and watch the earlier turn's history load.
//    This is the click path the kb-agent workbench broke: every New Session
//    press died server-side and the shell showed nothing.
// 2. The failure lane — a composition whose default preset no roster root
//    supplies (the exact kb-agent regression shape). The host still fails
//    loud on session.create, and the assertion is the user-visible half of
//    the fix: the workspace list state's action-error cell drives a transient
//    alert toast naming the business error, from both the adoption flow and
//    the sidebar button.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ReplayEntry, ReplayOverrideDoc } from '@deepseek-ai/dsh-llm-replay'
import {
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

/** The shipped roster, beside the composition that names it. */
const SHIPPED_PRESETS = fileURLToPath(new URL('../../cli/config/agent-presets', import.meta.url))
const MODE = webSnapshotMode()

interface TurnSpec {
  readonly userMarker: string
  readonly doneMarker: string
  readonly prompt: string
}

const TURNS: readonly TurnSpec[] = [
  {
    userMarker: 'NEW_SESSION_LIFECYCLE_USER_1',
    doneMarker: 'NEW_SESSION_LIFECYCLE_DONE_1',
    prompt: 'NEW_SESSION_LIFECYCLE_USER_1 Only turn: settle, then leave the blank state.',
  },
]

function turnStream(spec: TurnSpec): StreamChunk[] {
  const response = `${spec.doneMarker} settled.`
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: response },
    { type: 'block-end', index: 0, block: { type: 'text', text: response } },
    { type: 'usage', usage: { inputTokens: 24, outputTokens: 8 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function replayScript(specs: readonly TurnSpec[]): ReplayOverrideDoc {
  return specs.flatMap((spec): ReplayEntry[] => [{ kind: 'chunks', chunks: turnStream(spec) }])
}

/** The sidebar's shared New Session button (rail and expanded states share the label). */
function newSessionButton(page: Page) {
  return page.getByRole('button', { name: 'New session', exact: true }).first()
}

async function sendTurn(scaffold: WebScaffold, page: Page, spec: TurnSpec): Promise<void> {
  const composer = page.locator('textarea:enabled').last()
  await composer.waitFor({ timeout: 15_000 })
  await composer.fill(spec.prompt)
  // The fill must survive the fill-then-render race: a navigation that swaps
  // the composer instance mid-flight drops the draft instead of sending it.
  await expect.poll(() => composer.inputValue(), { timeout: 5_000 }).toBe(spec.prompt)
  const settled = scaffold.whenTurnSettled(60_000)
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.getByText(spec.userMarker, { exact: false }).last().waitFor({ timeout: 15_000 })
  await page.getByText(spec.doneMarker, { exact: false }).last().waitFor({ timeout: 15_000 })
  await settled
}

describe('web e2e: New Session lifecycle (create → message → switch)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let replayDir: string
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    replayDir = await mkdtemp(join(tmpdir(), 'dsh-new-session-replay-'))
    const replayOverride = join(replayDir, 'replay.override.json')
    await writeFile(replayOverride, JSON.stringify(replayScript(TURNS)))
    scaffold = await launchWebScaffold({
      replayFixture: join(replayDir, 'override-only.jsonl'),
      replayOverride,
    })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd, 'new-session-lifecycle')
  }, 120_000)

  afterAll(async () => {
    const failures: unknown[] = []
    await browser?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (replayDir !== undefined) {
      await rm(replayDir, { recursive: true, force: true })
        .catch((error: unknown) => failures.push(error))
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'new-session lifecycle e2e cleanup failed')
  })

  it.skipIf(MODE === 'record')('grows the connected blank session through the composer', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-new-session-first-turn'))
    await sendTurn(scaffold, page, TURNS[0]!)
  })

  it.skipIf(MODE === 'record')('mints a fresh session from the sidebar New Session button', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-new-session-mint'))
    // The first turn left no blank session to reuse, so the press must create
    // one. The host-side agent count is the mint proof; the empty enabled
    // composer is the switched view's face.
    const agentsBefore = scaffold.ctx.agents.list().length
    await newSessionButton(page).click()
    await expect.poll(() => scaffold.ctx.agents.list().length, { timeout: 15_000 })
      .toBeGreaterThan(agentsBefore)
    const composer = page.locator('textarea:enabled').last()
    await expect.poll(() => composer.inputValue(), { timeout: 15_000 }).toBe('')
    expect(await composer.isEnabled()).toBe(true)
  })

  it.skipIf(MODE === 'record')('switches back through the session tree and loads the earlier history', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-new-session-switch-back'))
    await newSessionButton(page).click()
    await page.locator('textarea:enabled').last().waitFor({ timeout: 15_000 })

    // The first session lists under the workspace group with its turn title;
    // opening it must load turn one's markers from persisted history.
    const tree = page.getByRole('tree', { name: 'Sessions' })
    await tree.waitFor({ timeout: 15_000 })
    await tree.getByRole('treeitem').filter({ hasText: TURNS[0]!.userMarker }).first().click()
    await page.getByText(TURNS[0]!.userMarker, { exact: false }).first().waitFor({ timeout: 15_000 })
    await page.getByText(TURNS[0]!.doneMarker, { exact: false }).first().waitFor({ timeout: 15_000 })
  })

  it.skipIf(MODE === 'record')('drove every surface without a page error or a stream warning', () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})

describe('web e2e: New Session failure surfaces to the user', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    // The kb-agent regression shape: the deployment default names a preset
    // no roster root supplies, so every session.create fails loud host-side.
    scaffold = await launchWebScaffold({
      agentPresets: { roots: [{ path: SHIPPED_PRESETS, trust: 'system' }], default: 'no-such-preset' },
    })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('announces the failed create as a transient alert, from the button and the adoption flow', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-new-session-failure'))
    // Register a workspace through the region header's dialog (adoption ends
    // in the same New Session action, so the failure fires twice over one
    // flow; the toast is keyed per failure and re-presents either way).
    await page.getByRole('button', { name: 'Add workspace' }).click()
    const dialog = page.getByRole('dialog', { name: 'Select Workspace Directory' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Edit path' }).click()
    const pathInput = dialog.locator('input[aria-label="Edit path"]')
    await pathInput.fill(scaffold.workspaceCwd)
    await pathInput.press('Enter')
    await dialog.getByRole('button', { name: 'Open', exact: true }).click()

    const alert = page.getByRole('alert').filter({ hasText: 'New session failed' })
    await alert.first().waitFor({ timeout: 15_000 })
    await expect.poll(async () => alert.first().textContent(), { timeout: 15_000 })
      .toContain('agent-preset-not-found')

    // The sidebar button reports the same failure on its own press.
    await newSessionButton(page).click()
    await alert.first().waitFor({ timeout: 15_000 })
    expect(await alert.first().textContent()).toContain('agent-preset-not-found')
  })
})
