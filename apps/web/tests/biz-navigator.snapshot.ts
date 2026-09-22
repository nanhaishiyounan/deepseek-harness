// @vitest-environment jsdom
// Assembled business-navigator snapshot: the grouped collection navigator
// (domain buckets + the fixture's three collections), the supplier-360 zone
// with its expiry-warning cert chips, and the inline-edit fast path's
// structured refusal (the fixture keeps nocobase.update behind
// nocobaseWriteEnabled — the save surfaces the gateway's refusal inline,
// the exact degrade the deployment without the opt-in renders).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installAssembledBootEnv, mountAssembledApp, REFRESHING_GOLDEN } from './assembled-boot.ts'

const EXPECTED = join(process.cwd(), 'apps/web/tests/snapshots/biz-navigator/groups.expected.md')

installAssembledBootEnv()

describe('assembled business navigator', () => {
  it('groups the roster, opens suppliers with the 360 zone, and refuses the inline write inline', async () => {
    mountAssembledApp()
    localStorage.removeItem('dsh-biz-recent-collections')

    const businessTab = await waitFor(() => {
      const tab = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Business')
      if (tab === undefined) throw new Error('the business tab missing')
      return tab
    }, { timeout: 30_000 })
    fireEvent.click(businessTab)

    // The navigator: open the panel and pin the domain groups.
    const toggle = await screen.findByTestId('biz-nav-toggle', {}, { timeout: 30_000 })
    fireEvent.click(toggle)
    const panel = await screen.findByTestId('biz-nav-panel')
    const groups = [...panel.querySelectorAll('[class*="navGroupLabel"]')].map(node => node.textContent ?? '')
    const items = [...panel.querySelectorAll('[class*="navItem"]')].map(node => node.textContent ?? '')

    // Open the suppliers collection through the navigator.
    fireEvent.click(within(panel).getByRole('button', { name: '供应商' }))
    const supplierZone = await screen.findByTestId('biz-supplier-360', {}, { timeout: 30_000 })
    const certs = [...supplierZone.querySelectorAll('[class*="certChip"]')].map(node => node.textContent ?? '')

    // The inline edit on the whitelisted remark field: open, type, save —
    // the fixture's write-disabled refusal lands in the card's error line.
    const edit = await screen.findAllByTestId('biz-inline-edit').then(edits => edits[0]!)
    fireEvent.click(edit)
    const input = document.querySelector<HTMLInputElement>('[class*="inlineInput"]')
    if (input === null) throw new Error('the inline edit input missing')
    fireEvent.change(input, { target: { value: '包材主力（已核对）' } })
    fireEvent.click([...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Save')!)
    const errorLine = await waitFor(() => {
      const error = document.querySelector('[class*="inlineError"]')
      if (error === null) throw new Error('the inline write refusal missing')
      return error.textContent ?? ''
    }, { timeout: 30_000 })

    localStorage.removeItem('dsh-biz-recent-collections')
    const golden = [
      '## groups', groups.join(','),
      '', '## items', items.join(','),
      '', '## supplier 360', certs.join(' | '),
      '', '## inline refusal', errorLine,
    ].join('\n')
    if (REFRESHING_GOLDEN) {
      mkdirSync(dirname(EXPECTED), { recursive: true })
      writeFileSync(EXPECTED, golden)
    }
    await expect(golden).toMatchFileSnapshot(EXPECTED)
  })
})
