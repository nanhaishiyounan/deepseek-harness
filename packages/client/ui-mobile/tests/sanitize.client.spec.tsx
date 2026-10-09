// @vitest-environment jsdom
/**
 * The shared protocol-token denylist (W23-R3 F2): the body pass strips the
 * closed protocol families on top of the business-term mapping, the subtitle
 * pass additionally strips tool names, and the report render site consumes
 * the sanitized subtitle so a persona miss (the live `wfl_approval_todos`
 * leak) never reaches a subtitle text node.
 */

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChatItem } from '../src/client/fold.ts'
import { FlowItem } from '../src/client/messages/chat/FlowItem.tsx'
import { sanitizeBody, sanitizeReportPayload, sanitizeSubtitle } from '../src/client/sanitize.ts'
import type { ReportPayload } from '../src/client/protocol.ts'

afterEach(cleanup)

describe('sanitizeBody (W23-R3 F2)', () => {
  it('strips the wfl_* table family an unmappped leak carries', () => {
    expect(sanitizeBody('待办表 wfl_approval_todos 已清空')).toBe('待办表 已清空')
  })

  it('strips the ask_* family and the suggestions field name', () => {
    expect(sanitizeBody('先走 ask_field，字段来自 suggestions')).toBe('先走，字段来自')
  })

  it('keeps the business-term mapping pass intact', () => {
    expect(sanitizeBody('pur_orders 采购入库')).toBe('采购订单 采购入库')
  })
})

describe('sanitizeSubtitle (W23-R3 F2)', () => {
  it('strips the live-leaked subtitle shape to people language', () => {
    expect(sanitizeSubtitle('实时查询 · 待办表 wfl_approval_todos 已清空')).toBe('实时查询 · 待办表 已清空')
  })

  it('renders the W24 entity/AQL fallbacks on the report faces (W24)', () => {
    expect(sanitizeSubtitle('supplier 4 · 物料 product 1 与 product 8 各涉及 · AQL 抽样 d≥Re 拒收')).toBe('某供应商 4 号 · 物料 某物料 1 号 与 某物料 8 号 各涉及 · 按抽检标准判定拒收（不合格数达到拒收线）')
  })
})

describe('sanitizeReportPayload (W24 all-faces)', () => {
  const payload: ReportPayload = {
    v: 3,
    type: 'report',
    id: 'r-1',
    title: '供应商质检风险排行',
    subtitle: 'supplier 4 · 连续拒收 streak≥3',
    metrics: [{ label: '连续拒收 streak≥3', value: '2', kind: 'count' }],
    rows: [
      { label: '味之源 reject_streak=5', hint: 'supplier 4 · AQL 抽样 d≥Re 拒收', level: 'high' },
    ],
    table: {
      columns: [{ label: '供应商' }, { label: '可用库存 product 11' }],
      rows: [['味之源调味食品', 'product 11 ATP=0']],
    },
  }

  it('sanitizes every user-visible face of the card, not just title/subtitle', () => {
    const clean = sanitizeReportPayload(payload)
    expect(clean.title).toBe('供应商质检风险排行')
    expect(clean.subtitle).toBe('某供应商 4 号 · 连续拒收 3 次及以上')
    expect(clean.metrics[0]?.label).toBe('连续拒收 3 次及以上')
    expect(clean.rows?.[0]?.label).toBe('味之源 连续拒收批数=5')
    expect(clean.rows?.[0]?.hint).toBe('某供应商 4 号 · 按抽检标准判定拒收（不合格数达到拒收线）')
    expect(clean.table?.columns[1]?.label).toBe('可用库存 某物料 11 号')
    expect(clean.table?.rows[0]?.[1]).toBe('某物料 11 号 可用库存=0')
  })

  it('never mutates the stored artifact (the copy path keeps verbatim bytes)', () => {
    sanitizeReportPayload(payload)
    expect(payload.subtitle).toBe('supplier 4 · 连续拒收 streak≥3')
    expect(payload.rows?.[0]?.hint).toBe('supplier 4 · AQL 抽样 d≥Re 拒收')
  })

  it('strips tool names the subtitle pass adds on top of the body pass', () => {
    expect(sanitizeSubtitle('近30天 · nb_list 直查 · kg_query 走查')).toBe('近30天 · 直查 · 走查')
  })

  it('empties a subtitle that was nothing but protocol tokens', () => {
    expect(sanitizeSubtitle('wfl_approval_todos')).toBe('')
  })

  it('keeps legitimate measurement words untouched', () => {
    expect(sanitizeSubtitle('OTIF 96% · GB 2760 合规')).toBe('OTIF 96% · GB 2760 合规')
  })
})

describe('the report render site (W23-R3 F2)', () => {
  const reportItem = (subtitle: string, title = '待办概览'): ChatItem => ({
    kind: 'report',
    seq: 2,
    time: 1000,
    payload: {
      v: 3,
      type: 'report',
      id: 'r_leak',
      title,
      subtitle,
      metrics: [{ label: '待办', value: '3', kind: 'count' }],
    },
  })

  const renderFlow = (item: ChatItem): void => {
    render(
      <FlowItem
        item={item}
        previous={undefined}
        preset="business-advisor"
        name="经营参谋"
        cardStates={new Map()}
        reopened={new Set()}
        draftValues={new Map()}
        systemValues={new Map()}
        meta={undefined}
        sending={false}
        approvalExternalStates={new Map()}
        onDraftEdit={() => () => {}}
        onSubmitReview={() => () => {}}
        onConfirm={() => () => {}}
        onReject={() => () => {}}
        onConfirmV3={() => () => {}}
        onRejectV3={() => () => {}}
        onRedraft={() => () => {}}
        onSend={() => {}}
        onFill={() => {}}
        onFreeText={() => {}}
        onReportAction={() => {}}
        localPending={new Map()}
      />,
    )
  }

  it('renders the sanitized subtitle: the protocol token never appears in the DOM text', () => {
    renderFlow(reportItem('实时查询 · 待办表 wfl_approval_todos 已清空'))
    const node = document.querySelector('[class*="reportSubtitle"]')
    expect(node?.textContent).toBe('实时查询 · 待办表 已清空')
    expect(document.body.textContent).not.toContain('wfl_approval_todos')
  })

  it('renders no casing variant of the leaked token in any subtitle text node (W23-R4)', () => {
    renderFlow(reportItem('实时查询 · 待办表 WFL_Approval_Todos 已清空'))
    const node = document.querySelector('[class*="reportSubtitle"]')
    expect(node?.textContent).toBe('实时查询 · 待办表 已清空')
    expect(/wfl_approval_todos/i.test(document.body.textContent ?? '')).toBe(false)
  })

  it('renders no casing variant of the leaked token in the title face (W23-R6)', () => {
    renderFlow(reportItem('近30天 · 实时查询', 'WFL_Approval_Todos 待办概览'))
    // The outer wrapper class is `reportTitles`; :not skips it for the title
    // span itself.
    const node = document.querySelector('[class*="reportTitle"]:not([class*="reportTitles"])')
    expect(node?.textContent).toBe('待办概览')
    expect(/wfl_approval_todos/i.test(document.body.textContent ?? '')).toBe(false)
  })

  it('drops a subtitle that sanitizes to empty', () => {
    renderFlow(reportItem('wfl_approval_todos'))
    expect(document.querySelector('[class*="reportSubtitle"]')).toBeNull()
  })

  it('keeps a clean subtitle verbatim', () => {
    renderFlow(reportItem('近30天 · 实时查询'))
    expect(document.querySelector('[class*="reportSubtitle"]')?.textContent).toBe('近30天 · 实时查询')
  })
})
