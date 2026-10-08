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
import { sanitizeBody, sanitizeSubtitle } from '../src/client/sanitize.ts'

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
  const reportItem = (subtitle: string): ChatItem => ({
    kind: 'report',
    seq: 2,
    time: 1000,
    payload: {
      v: 3,
      type: 'report',
      id: 'r_leak',
      title: '待办概览',
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

  it('drops a subtitle that sanitizes to empty', () => {
    renderFlow(reportItem('wfl_approval_todos'))
    expect(document.querySelector('[class*="reportSubtitle"]')).toBeNull()
  })

  it('keeps a clean subtitle verbatim', () => {
    renderFlow(reportItem('近30天 · 实时查询'))
    expect(document.querySelector('[class*="reportSubtitle"]')?.textContent).toBe('近30天 · 实时查询')
  })
})
