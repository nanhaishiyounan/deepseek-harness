// @vitest-environment jsdom
/**
 * The report card's render mapping (03 §6.4): the section-by-section rendering
 * conditions, the tone/level class wiring, the stamp character derivation, and
 * the action row's ordering rule (create-task last as the primary; three
 * buttons max) with the dispatch callback and the read-only preview mode.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReportCard, metricValueText, orderedActionsOf, stampCharOf } from '../src/client/messages/ReportCard.tsx'
import type { ReportAction, ReportPayload } from '../src/client/protocol.ts'

afterEach(cleanup)

/** One legal payload with every section present. */
function fullPayload(): ReportPayload {
  return {
    v: 3,
    type: 'report',
    id: 'r_1',
    title: '项目风险汇总',
    subtitle: '截至今天 · 数据来自湖仓指标',
    metrics: [
      { label: '高风险', value: '3', kind: 'count', tone: 'danger' },
      { label: '中风险', value: '1', kind: 'count', tone: 'warning' },
      { label: '按期交付率', value: '96%', kind: 'percent', tone: 'positive' },
    ],
    rows: [
      { label: '接口联调延期', hint: '预计影响测试开始 1～2 天', level: 'high' },
      { label: '测试资源不足', hint: '4 个任务等待测试', level: 'medium' },
      { label: '需求待确认', level: 'low' },
    ],
    table: {
      columns: [{ label: '能力' }, { label: 'A 平台', kind: 'text' }, { label: 'B 平台' }],
      rows: [['交付', '强', '中']],
    },
    actions: [
      { kind: 'view', label: '查看工作', route: '#/work' },
      { kind: 'send', label: '生成周报', text: '帮我生成周报' },
      { kind: 'create-task', label: '创建处理任务', title: '接口联调延期处理', suggestion: '今天确认联调时间' },
    ],
  }
}

describe('ReportCard sections', () => {
  it('renders the head, stamp, metrics, rows, table, and the action row', () => {
    const { container } = render(<ReportCard payload={fullPayload()} onAction={() => {}} />)
    expect(screen.getByText('项目风险汇总')).toBeTruthy()
    expect(screen.getByText('截至今天 · 数据来自湖仓指标')).toBeTruthy()
    // The stamp character rides the title's risk word.
    expect(container.querySelector('[class*="reportStamp"]')?.textContent).toBe('险')
    // Every metric value and label renders with its tone class.
    expect(screen.getByText('3').className).toContain('metricToneDanger')
    expect(screen.getByText('1').className).toContain('metricToneWarning')
    expect(screen.getByText('96%').className).toContain('metricTonePositive')
    expect(screen.getByText('按期交付率')).toBeTruthy()
    // The bare numeric count gains the thousands separators (W8-B2 §10);
    // every pre-formatted face stays verbatim.
    expect(metricValueText('1042')).toBe('1,042')
    expect(metricValueText('1234567.89')).toBe('1,234,567.89')
    expect(metricValueText('96%')).toBe('96%')
    expect(metricValueText('¥6,400')).toBe('¥6,400')
    expect(metricValueText('200 箱')).toBe('200 箱')
    expect(metricValueText('999')).toBe('999')
    // Rows: label + hint pairs and the level dots.
    expect(screen.getByText('接口联调延期')).toBeTruthy()
    expect(screen.getByText('预计影响测试开始 1～2 天')).toBeTruthy()
    expect(screen.getByText('需求待确认').closest('li')?.querySelector('[class*="rowDotLow"]')).toBeTruthy()
    // The compact table.
    expect(screen.getByText('A 平台').tagName).toBe('TH')
    expect(screen.getByText('强').tagName).toBe('TD')
    // The action row: create-task renders last.
    const buttons = screen.getAllByRole('button').map(button => button.textContent)
    expect(buttons).toEqual(['查看工作', '生成周报', '创建处理任务'])
  })

  it('renders the primary class only on create-task and omits absent sections', () => {
    const full = fullPayload()
    const payload: ReportPayload = {
      v: full.v, type: full.type, id: full.id, title: full.title, metrics: full.metrics,
    }
    const { container } = render(<ReportCard payload={payload} />)
    // No rows/table/actions and no subtitle: nothing renders but head+metrics.
    expect(screen.getByText('项目风险汇总')).toBeTruthy()
    expect(screen.queryByText('接口联调延期')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.querySelector('table')).toBeNull()
    expect(container.textContent).not.toContain('·')
  })

  it('renders read-only without the action row when onAction is absent', () => {
    render(<ReportCard payload={fullPayload()} />)
    expect(screen.getByText('项目风险汇总')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('dispatches the clicked action through the callback', () => {
    const onAction = vi.fn()
    render(<ReportCard payload={fullPayload()} onAction={onAction} />)
    fireEvent.click(screen.getByRole('button', { name: '生成周报' }))
    expect(onAction).toHaveBeenCalledWith({ kind: 'send', label: '生成周报', text: '帮我生成周报' })
  })
})

describe('stampCharOf', () => {
  it('maps the title keywords to the seal characters', () => {
    expect(stampCharOf('项目风险')).toBe('险')
    expect(stampCharOf('供应商对比')).toBe('比')
    expect(stampCharOf('本周周报')).toBe('报')
    expect(stampCharOf('本月经营概览')).toBe('报')
    expect(stampCharOf('冷链月报')).toBe('报')
    expect(stampCharOf('库存盘点')).toBe('库')
    expect(stampCharOf('')).toBe('报')
  })
})

describe('orderedActionsOf', () => {
  it('puts create-task last as the primary and keeps at most two secondaries', () => {
    const actions: ReportAction[] = [
      { kind: 'create-task', label: '创建', title: 't' },
      { kind: 'view', label: 'v1', route: '#/work' },
      { kind: 'view', label: 'v2', route: '#/tasks' },
      { kind: 'view', label: 'v3', route: '#/files' },
    ]
    const { row, primaryIndex } = orderedActionsOf(actions)
    expect(row.map(action => action.label)).toEqual(['v1', 'v2', '创建'])
    expect(primaryIndex).toBe(2)
  })

  it('keeps the first action primary without a create-task', () => {
    const actions: ReportAction[] = [
      { kind: 'view', label: 'v1', route: '#/work' },
      { kind: 'view', label: 'v2', route: '#/tasks' },
      { kind: 'view', label: 'v3', route: '#/files' },
      { kind: 'view', label: 'v4', route: '#/chats' },
    ]
    const { row, primaryIndex } = orderedActionsOf(actions)
    expect(row.map(action => action.label)).toEqual(['v1', 'v2', 'v3'])
    expect(primaryIndex).toBe(0)
  })
})
