// @vitest-environment jsdom
// Assembled order_create toolview snapshot: boots the real built
// `packages/client/*/lib/client.js` bundles through AppWebEntry's ModuleLoader
// path against the keyless FixtureApiClient transport, opens the fixture
// session, and pins the two order_create rows the fixture's replay pair
// reaches — turn 72's full current meta (order_id + deliverable_path), whose
// row carries the「View order」entry, and turn 73's pre-projection replay,
// whose row renders the receipt only. Clicking the entry switches the view
// ring to the market tab, whose orders section anchors at #market-orders.
//
// The rows are pinned as separate fields on purpose: `title=` and `summary=`
// pin the collapsed chrome, `viewOrder=` pins the jump entry's presence and
// label, so a regression that drops the entry or rewords it changes this file
// even though the receipt text would read the same; the jsdom package suites
// bench over src and cannot see the bundled registration or the injected
// view-bridge face.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { hasClass, installAssembledBootEnv, mountAssembledApp, REFRESHING_GOLDEN } from './assembled-boot.ts'

const EXPECTED = join(process.cwd(), 'apps/web/tests/snapshots/order-tool-row/create-replay.expected.txt')

installAssembledBootEnv()

/** Normalize one order_create row to stable text fields: the row's title,
 * its truncatable summary, and the「View order」entry's label or absence. */
function orderShape(row: Element): string {
  const first = (name: string): string => {
    const found = [...row.querySelectorAll('*')].filter(el => hasClass(el, name))[0]
    return found?.textContent?.trim() ?? '<absent>'
  }
  const action = [...row.querySelectorAll('button')].find(button => hasClass(button, 'action'))
  return [
    `title=${first('title')}`,
    `summary=${first('summary')}`,
    `viewOrder=${action?.textContent?.trim() ?? '<absent>'}`,
  ].join('\n')
}

describe('assembled order tool surfaces', () => {
  it('renders the receipt pair with the jump entry on the current meta only and switches to the market orders section', async () => {
    mountAssembledApp()

    const tree = await screen.findByRole('tree', { name: 'Sessions' }, { timeout: 10_000 })
    fireEvent.click(await within(tree).findByText('Fixture 历史会话'))
    // The fixture's two order_create turns render two keyed rows; wait for
    // both rather than for chat content in general.
    const rows = await waitFor(() => {
      const found = [...document.querySelectorAll('[data-tool="order_create"]')]
      expect(found).toHaveLength(2)
      return found
    }, { timeout: 10_000 })

    const shape = rows.map(row => orderShape(row)).join('\n')
    if (REFRESHING_GOLDEN) {
      mkdirSync(dirname(EXPECTED), { recursive: true })
      writeFileSync(EXPECTED, shape)
    }
    await expect(shape).toMatchFileSnapshot(EXPECTED)

    // The entry on the current-meta row rides the injected view-bridge face:
    // clicking it switches the view ring to the market tab, whose orders
    // section (its error state included — the fixture transport composes no
    // orders seam) carries the #market-orders anchor.
    const firstRow = rows[0]
    if (firstRow === undefined) throw new Error('the order_create rows missing')
    const entry = [...firstRow.querySelectorAll('button')].find(button => hasClass(button, 'action'))
    if (entry === undefined) throw new Error('the current-meta row must carry the View order entry')
    fireEvent.click(entry)
    await waitFor(() => {
      if (document.getElementById('market-orders') === null) {
        throw new Error('the market orders section anchor missing after the view switch')
      }
    }, { timeout: 10_000 })
  })
})
