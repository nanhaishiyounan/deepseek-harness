// @vitest-environment jsdom
// Assembled overview-home snapshot: the scenarios portal leads with the KPI
// band (the fixture's deterministic lakehouse.overview chips) and the
// recent-deliverables rail, and a featured scenario pinned through the ★
// control lands in the pinned rail — the two live tiers plus the pin
// persistence journey, over the built bundles and the keyless fixture.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installAssembledBootEnv, mountAssembledApp, REFRESHING_GOLDEN } from './assembled-boot.ts'

const EXPECTED = join(process.cwd(), 'apps/web/tests/snapshots/overview-home/band.expected.md')

installAssembledBootEnv()

describe('assembled overview home', () => {
  it('renders the KPI band and pins a featured scenario into the front rail', async () => {
    mountAssembledApp()

    // Open the scenarios portal through the view ring's tab.
    const scenariosTab = await waitFor(() => {
      const tab = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Scenarios')
      if (tab === undefined) throw new Error('the scenarios tab missing')
      return tab
    }, { timeout: 30_000 })
    fireEvent.click(scenariosTab)

    const band = await screen.findByTestId('overview-band', {}, { timeout: 30_000 })
    const bandShape = await waitFor(() => {
      const kpis = [...band.querySelectorAll('[data-testid="overview-kpi"]')]
      expect(kpis.length).toBe(3)
      return kpis.map(kpi => kpi.textContent?.trim() ?? '').join('\n')
    }, { timeout: 30_000 })
    const deliverables = band.textContent?.includes('No deliverables yet.') ? 'deliverables: empty' : 'deliverables: rows'

    // Pin the first featured card through its ★ control.
    localStorage.removeItem('dsh-kb-pinned-scenarios')
    const pin = await screen.findAllByRole('button', { name: 'Pin scenario' })
    fireEvent.click(pin[0]!)
    const pinnedRail = await screen.findByRole('region', { name: 'Pinned scenarios' })
    const pinnedShape = [...pinnedRail.querySelectorAll('[class*="scenarioName"]')].map(node => node.textContent ?? '').join(',')
    localStorage.removeItem('dsh-kb-pinned-scenarios')

    const golden = ['## kpis', bandShape, '', '## rail', deliverables, '', '## pinned', pinnedShape].join('\n')
    if (REFRESHING_GOLDEN) {
      mkdirSync(dirname(EXPECTED), { recursive: true })
      writeFileSync(EXPECTED, golden)
    }
    await expect(golden).toMatchFileSnapshot(EXPECTED)
  })
})
