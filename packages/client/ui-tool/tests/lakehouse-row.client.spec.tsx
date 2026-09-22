// @vitest-environment jsdom
// The lakehouse_query toolview: the pure model derivation over the tool's
// documented result text (markdown table + Data-source attribution line +
// truncation note), the chart plan choice (temporal line vs categorical
// bars), the CSV projection, and the row render — collapsed summary, expanded
// number cards + chart + view toggle + SQL disclosure + export entry.

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import { zh } from '@deepseek-ai/dsh-client-ui-conversation/src/client/locales.ts'
import {
  chartPlanOf, csvOf, lakehouseQueryView, numericColumnOf, statCardsOf,
} from '../src/client/tool/models/lakehouse-card-model.ts'
import { LakehouseRow } from '../src/client/tool/toolviews/lakehouse-row.tsx'

/** Full row props cast (the session kit rides the slot runtime, not the unit render). */
type LakehouseRowFullProps = Parameters<typeof LakehouseRow>[0]
const rowProps = (block: Parameters<typeof LakehouseRow>[0]['block']): LakehouseRowFullProps => ({
  callId: 'c1',
  toolName: 'lakehouse_query',
  block,
  openFile: () => {},
  sessionId: 's1',
  t,
} as unknown as LakehouseRowFullProps)

afterEach(cleanup)

/** Conversation-locale translate for the row's `t` seat. */
const t = makeTranslate(zh, commonZh)

/** A settled lakehouse_query result with the given text. */
function settled(resultText: string, args = '{"sql":"SELECT month, total FROM import_export_monthly"}'): ToolCallBlock {
  const node: ToolResultNode = {
    kind: 'tool-result',
    seq: 1,
    time: 0,
    callId: 'c1',
    call: { name: 'lakehouse_query', argsRaw: args },
    callTime: null,
    content: [{ type: 'text', text: resultText }],
    isError: false,
    callView: null,
    resultView: null,
    subCalls: [],
  }
  return node
}

const TREND_TEXT = [
  '| month | total |',
  '| --- | --- |',
  '| 2026-03 | 100 |',
  '| 2026-04 | 118 |',
  '| 2026-05 | 96 |',
  '',
  'Data source: lakehouse table import_export_monthly',
  'Answer from the rows above; name the source table(s) in your answer.',
].join('\n')

const CATEGORY_TEXT = [
  '| dest_country | export_value_10kusd |',
  '| --- | --- |',
  '| 日本 | 320 |',
  '| 韩国 | 210 |',
  '| 美国 | 180 |',
  '',
  'Data source: lakehouse tables import_export_monthly, other_table',
].join('\n')

describe('lakehouseQueryView', () => {
  it('parses the markdown table, attribution, and sql', () => {
    const view = lakehouseQueryView(settled(TREND_TEXT))
    expect(view).toBeDefined()
    /* v8 ignore next - the settled block above always parses. */
    if (view === undefined) return
    expect(view.columns).toEqual(['month', 'total'])
    expect(view.rows).toEqual([['2026-03', 100], ['2026-04', 118], ['2026-05', 96]])
    expect(view.tables).toEqual(['import_export_monthly'])
    expect(view.sql).toBe('SELECT month, total FROM import_export_monthly')
    expect(view.truncated).toBe(false)
  })

  it('marks truncation and stays empty on a no-table result', () => {
    const truncated = lakehouseQueryView(settled(`${TREND_TEXT}\n\n(Result truncated at 3 rows by the row cap; refine the query — aggregate or filter — for exact totals.)`))
    expect(truncated?.truncated).toBe(true)
    const empty = lakehouseQueryView(settled('(0 rows returned)\n\nData source: lakehouse (no registered table named by the statement)'))
    expect(empty?.rows).toEqual([])
    expect(empty?.columns).toEqual([])
  })

  it('returns undefined while running', () => {
    const running: ToolCallBlock = {
      callId: 'c1', name: 'lakehouse_query', argsRaw: '{"sql":"SELECT 1"}',
      turn: 0, step: 0, time: 0, callView: null, subCalls: [],
    }
    expect(lakehouseQueryView(running)).toBeUndefined()
  })
})

describe('chart plan and stats', () => {
  it('plans a temporal line for a month column', () => {
    const view = lakehouseQueryView(settled(TREND_TEXT))
    /* v8 ignore next */
    if (view === undefined) throw new Error('view missing')
    expect(numericColumnOf(view)).toBe(1)
    expect(chartPlanOf(view)).toEqual({
      kind: 'line',
      labels: ['2026-03', '2026-04', '2026-05'],
      values: [100, 118, 96],
      valueColumn: 'total',
    })
    expect(statCardsOf(view, 1).map(card => card.id)).toEqual(['rows', 'sum', 'mean', 'max', 'min'])
  })

  it('plans descending bars for a categorical column', () => {
    const view = lakehouseQueryView(settled(CATEGORY_TEXT))
    /* v8 ignore next */
    if (view === undefined) throw new Error('view missing')
    expect(chartPlanOf(view)).toEqual({
      kind: 'bar',
      items: [
        { label: '日本', value: 320 },
        { label: '韩国', value: 210 },
        { label: '美国', value: 180 },
      ],
      valueColumn: 'export_value_10kusd',
    })
  })

  it('renders the CSV with header and rows', () => {
    const view = lakehouseQueryView(settled(CATEGORY_TEXT))
    /* v8 ignore next */
    if (view === undefined) throw new Error('view missing')
    expect(csvOf(view)).toBe('dest_country,export_value_10kusd\n日本,320\n韩国,210\n美国,180')
  })
})

describe('LakehouseRow', () => {
  it('renders the collapsed summary and expands into cards, chart, sql, and export', () => {
    const { container, getByTestId, queryByTestId } = render(
      <LakehouseRow {...rowProps(settled(TREND_TEXT))} />,
    )
    expect(container.querySelector('[data-tool="lakehouse_query"]')).not.toBeNull()
    expect(queryByTestId('lakehouse-query-body')).toBeNull()
    fireEvent.click(container.querySelector('button')!)
    expect(getByTestId('lakehouse-number-cards').textContent).toContain('3')
    expect(getByTestId('lakehouse-line-chart')).not.toBeNull()
    expect(container.textContent).toContain(t('lakehouse.sqlTitle'))
    expect(container.textContent).toContain(t('lakehouse.exportCsv'))
    // The table view replaces the chart on toggle.
    fireEvent.click([...container.querySelectorAll('button')].find(button => button.textContent === t('lakehouse.tableView'))!)
    expect(queryByTestId('lakehouse-line-chart')).toBeNull()
    expect(container.querySelectorAll('table tbody tr')).toHaveLength(3)
  })

  it('stays collapsed-only for a running call', () => {
    const running: ToolCallBlock = {
      callId: 'c1', name: 'lakehouse_query', argsRaw: '{"sql":"SELECT 1"}',
      turn: 0, step: 0, time: 0, callView: null, subCalls: [],
    }
    const { container } = render(<LakehouseRow {...rowProps(running)} />)
    expect(container.querySelector('button')?.hasAttribute('disabled')).toBe(true)
  })
})
