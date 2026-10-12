// @vitest-environment jsdom
// Assembled business-navigator snapshot over the carbon fixture: the grouped
// module navigator (frecency rail + carbon master/sales buckets over the
// three-table catalog), and the row read's structured refusal (the fixture
// composes no carbon row capability — `carbon.list` keeps the
// not-composed refusal, the exact degrade a read-only deployment renders).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installAssembledBootEnv, mountAssembledApp, REFRESHING_GOLDEN } from './assembled-boot.ts'

const EXPECTED = join(process.cwd(), 'apps/web/tests/snapshots/biz-navigator/groups.expected.md')

installAssembledBootEnv()

describe('assembled business navigator', () => {
  it('groups the carbon roster and surfaces the row read refusal inline', async () => {
    mountAssembledApp()
    localStorage.removeItem('dsh-biz-recent-collections')

    const businessTab = await waitFor(() => {
      const tab = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Business')
      if (tab === undefined) throw new Error('the business tab missing')
      return tab
    }, { timeout: 30_000 })
    fireEvent.click(businessTab)

    // The navigator: open the panel and pin the module groups.
    const toggle = await screen.findByTestId('biz-nav-toggle', {}, { timeout: 30_000 })
    fireEvent.click(toggle)
    const panel = await screen.findByTestId('biz-nav-panel')
    const groups = [...panel.querySelectorAll('[class*="navGroupLabel"]')].map(node => node.textContent ?? '')
    const items = [...panel.querySelectorAll('[class*="navItem"]')].map(node => node.textContent ?? '')

    // The auto-selected first table's row read: the fixture's carbon
    // not-composed refusal lands in the page's inline error strip.
    const errorLine = await waitFor(() => {
      const strip = document.querySelector('[class*="errorStrip"], [role="alert"]')
      if (strip === null) throw new Error('the row-read refusal missing')
      return strip.textContent ?? ''
    }, { timeout: 30_000 })

    localStorage.removeItem('dsh-biz-recent-collections')
    const golden = [
      '## groups', groups.join(','),
      '', '## items', items.join(','),
      '', '## row refusal', errorLine,
    ].join('\n')
    if (REFRESHING_GOLDEN) {
      mkdirSync(dirname(EXPECTED), { recursive: true })
      writeFileSync(EXPECTED, golden)
    }
    await expect(golden).toMatchFileSnapshot(EXPECTED)
  })
})
