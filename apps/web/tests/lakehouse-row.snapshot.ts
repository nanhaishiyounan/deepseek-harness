// @vitest-environment jsdom
// Assembled lakehouse_query toolview snapshot: the built bundles over the
// keyless fixture transport, turn 77's query row expanded — the number-card
// strip, the temporal line chart, the table toggle fallback, the CSV export
// entry, and the executed-SQL disclosure.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installAssembledBootEnv, mountAssembledApp, REFRESHING_GOLDEN } from './assembled-boot.ts'

const EXPECTED = join(process.cwd(), 'apps/web/tests/snapshots/lakehouse-row/expanded.expected.md')

installAssembledBootEnv()

describe('assembled lakehouse toolview', () => {
  it('expands into number cards, the line chart, and the sql disclosure', async () => {
    mountAssembledApp()

    const tree = await screen.findByRole('tree', { name: 'Sessions' }, { timeout: 30_000 })
    fireEvent.click(await within(tree).findByText('Fixture 历史会话'))

    const row = await waitFor(() => {
      const found = document.querySelector('[data-tool="lakehouse_query"]')
      if (found === null) throw new Error('the lakehouse_query row missing')
      return found
    }, { timeout: 30_000 })
    fireEvent.click(row.querySelector('button')!)

    const body = await screen.findByTestId('lakehouse-query-body', {}, { timeout: 30_000 })
    const cards = await screen.findByTestId('lakehouse-number-cards')
    const chart = await screen.findByTestId('lakehouse-line-chart')
    const sqlText = body.querySelector('details')?.textContent ?? ''
    const exportLabel = [...body.querySelectorAll('button')].map(button => button.textContent?.trim() ?? '')
    const shape = [
      '## cards', cards.textContent?.trim() ?? '',
      '', '## chart', chart.querySelector('svg') === null ? '<no svg>' : 'svg-present',
      '', '## sql', sqlText,
      '', '## actions', exportLabel.join(','),
    ].join('\n')

    // The table toggle swaps the chart for the plain markdown table view.
    fireEvent.click([...body.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Table')!)
    const tableRows = body.querySelectorAll('table tbody tr').length
    const withTable = `${shape}\n\n## table rows\n${String(tableRows)}`

    if (REFRESHING_GOLDEN) {
      mkdirSync(dirname(EXPECTED), { recursive: true })
      writeFileSync(EXPECTED, withTable)
    }
    await expect(withTable).toMatchFileSnapshot(EXPECTED)
  })
})
