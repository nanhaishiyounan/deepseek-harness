// @vitest-environment jsdom
// Assembled answer-source trail snapshot: boots the real built client
// bundles through AppWebEntry's ModuleLoader path against the keyless
// FixtureApiClient transport, opens the fixture session, and pins turns
// 77-78 — the answer-source trail under the closing answers. Turn 77's kb
// bucket expands its citation list with the open-source actions; turn 78's
// answer names its lakehouse table. The four-surface aggregation itself is
// pinned by the ui-conversation unit suite over the same frozen wire shape.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installAssembledBootEnv, mountAssembledApp, REFRESHING_GOLDEN } from './assembled-boot.ts'

const CHIPS_EXPECTED = join(process.cwd(), 'apps/web/tests/snapshots/source-trail/chips.expected.md')
const LAKEHOUSE_CHIP_EXPECTED = join(process.cwd(), 'apps/web/tests/snapshots/source-trail/lakehouse-chip.expected.md')

installAssembledBootEnv()

describe('assembled answer-source trail', () => {
  it('renders the trail chips under the closing answers and expands the kb citations', async () => {
    mountAssembledApp()

    const tree = await screen.findByRole('tree', { name: 'Sessions' }, { timeout: 30_000 })
    fireEvent.click(await within(tree).findByText('Fixture 历史会话'))

    // Turns 77-78 each carry a trail; the first is turn 77's kb row.
    const trails = await screen.findAllByTestId('source-trail', {}, { timeout: 30_000 })
    const trail77 = trails[0]
    if (trail77 === undefined) throw new Error('the source trails missing')
    const chips = await waitFor(() => {
      const found = [...trail77.querySelectorAll('[data-source-kind]')]
      expect(found.length).toBeGreaterThanOrEqual(1)
      return found
    }, { timeout: 30_000 })
    const chipShape = chips.map(chip => `${chip.getAttribute('data-source-kind')}=${chip.textContent?.trim()}`).join('\n')

    fireEvent.click(trail77.querySelector('[data-source-kind="kb"]')!)
    const kbDetail = await screen.findByTestId('source-trail-kb')
    const kbShape = [...kbDetail.querySelectorAll('li')].map(row => row.textContent?.trim() ?? '').join('\n')
    const openActions = [...kbDetail.querySelectorAll('button')].map(button => button.textContent?.trim() ?? '').join(',')

    const chipsGolden = ['## chips', chipShape, '', '## kb detail', kbShape, '', '## open actions', openActions].join('\n')
    if (REFRESHING_GOLDEN) {
      mkdirSync(dirname(CHIPS_EXPECTED), { recursive: true })
      writeFileSync(CHIPS_EXPECTED, chipsGolden)
    }
    await expect(chipsGolden).toMatchFileSnapshot(CHIPS_EXPECTED)

    // Turn 78's tail: the lakehouse chip carries the source table by name.
    await waitFor(() => {
      if (document.querySelectorAll('[data-testid="source-trail"]').length < 2) {
        throw new Error('both source trails missing')
      }
    }, { timeout: 30_000 })
    const foundTrails = [...document.querySelectorAll('[data-testid="source-trail"]')]
    const lakehouseGolden = `lakehouse chip: ${foundTrails.at(-1)?.querySelector('[data-source-kind="lakehouse"]')?.textContent?.trim() ?? '<absent>'}`
    if (REFRESHING_GOLDEN) {
      mkdirSync(dirname(LAKEHOUSE_CHIP_EXPECTED), { recursive: true })
      writeFileSync(LAKEHOUSE_CHIP_EXPECTED, lakehouseGolden)
    }
    await expect(lakehouseGolden).toMatchFileSnapshot(LAKEHOUSE_CHIP_EXPECTED)
  })
})
