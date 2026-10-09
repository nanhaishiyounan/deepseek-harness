// @vitest-environment jsdom
/**
 * The shared protocol-token denylist (W23-R3 F2): the body pass strips the
 * closed protocol families on top of the business-term mapping, the subtitle
 * pass additionally strips tool names, and the report render site consumes
 * the sanitized subtitle so a persona miss (the live `wfl_approval_todos`
 * leak) never reaches a subtitle text node.
 */

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChatItem } from '../src/client/fold.ts'
import { FlowItem } from '../src/client/messages/chat/FlowItem.tsx'
import { sanitizeBody, sanitizeReportPayload, sanitizeSubtitle } from '../src/client/sanitize.ts'
import type { ReportAction, ReportPayload } from '../src/client/protocol.ts'
import { SUPPLIER_LIFECYCLE_STATES } from '../src/client/fieldControls.ts'
import { SUPPLIER_STATE_WORDS } from '../src/client/docsCatalog.ts'

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

describe('sanitizeReportPayload object-graph traversal (W24-R1)', () => {
  it('sanitizes the faces the per-key enumeration missed: metric values and action text faces', () => {
    const payload: ReportPayload = {
      v: 3,
      type: 'report',
      id: 'r-2',
      title: '采购订单状态',
      subtitle: '收货进度 receiving=none',
      metrics: [
        { label: '收货进度', value: 'receiving=none', kind: 'count' },
        { label: '供应商状态', value: 'potential', kind: 'count' },
      ],
      actions: [
        { kind: 'view', label: 'WFL_Approval_Todos查看明细', route: '/pur_orders/12' },
        { kind: 'send', label: '通知', text: 'supplier 4 已对账' },
      ],
    }
    const clean = sanitizeReportPayload(payload)
    expect(clean.subtitle).toBe('收货进度 尚未收货')
    expect(clean.metrics[0]?.value).toBe('尚未收货')
    expect(clean.metrics[1]?.value).toBe('潜在')
    expect(clean.actions?.[0]?.label).toBe('查看明细')
    const send = clean.actions?.[1]
    expect(send?.kind === 'send' ? send.text : '').toBe('某供应商 4 号 已对账')
    const view = clean.actions?.[0]
    expect(view?.kind).toBe('view')
    if (view?.kind === 'view') expect(view.route).toBe('/pur_orders/12')
    // The verbatim identity set rides through untouched.
    expect(clean.id).toBe('r-2')
    expect(clean.type).toBe('report')
    // The stored artifact keeps its verbatim bytes.
    expect(payload.metrics[0]?.value).toBe('receiving=none')
    expect(payload.actions?.[0]?.label).toBe('WFL_Approval_Todos查看明细')
  })

  it('covers the lifecycle value domain through the traversal: no raw enum or snake residue survives', () => {
    const payload: ReportPayload = {
      v: 3,
      type: 'report',
      id: 'r-states',
      title: '供应商状态盘点',
      metrics: SUPPLIER_LIFECYCLE_STATES.map((state, index) =>
        ({ label: `状态${String(index + 1)}`, value: state, kind: 'count' as const })),
      rows: [{ label: 'lifecycle_status 明细', hint: 'receiving_status=none', level: 'high' }],
    }
    const clean = sanitizeReportPayload(payload)
    for (const [index, state] of SUPPLIER_LIFECYCLE_STATES.entries()) {
      const rendered = clean.metrics[index]?.value ?? ''
      expect(rendered).toBe(SUPPLIER_STATE_WORDS[state])
      expect(rendered).not.toMatch(/[a-z_]/)
    }
    expect(clean.rows?.[0]?.label).toBe('生命周期状态 明细')
    expect(clean.rows?.[0]?.hint).toBe('尚未收货')
  })
})

describe('the English-prose face (W24-R2)', () => {
  it('round-trips the three guarded English sentences through every display leaf kind', () => {
    const sentences = [
      'The preferred supplier list is attached',
      'The potential risk is high',
      'we are reviewing the order',
    ]
    for (const sentence of sentences) {
      const payload: ReportPayload = {
        v: 3,
        type: 'report',
        id: 'r-en-roundtrip',
        title: '供应商年报',
        subtitle: sentence,
        metrics: [{ label: sentence, value: '1', kind: 'count' }],
        rows: [{ label: sentence, hint: sentence, level: 'high' }],
      }
      const clean = sanitizeReportPayload(payload)
      expect(clean.subtitle).toBe(sentence)
      expect(clean.metrics[0]?.label).toBe(sentence)
      expect(clean.rows?.[0]?.label).toBe(sentence)
      expect(clean.rows?.[0]?.hint).toBe(sentence)
    }
  })

  it('keeps the English card face clean: protocol tokens strip, enum words never gain Chinese mid-word (jargon-scan English fixture)', () => {
    const payload: ReportPayload = {
      v: 3,
      type: 'report',
      id: 'r-en-jargon',
      title: 'Supplier status review',
      subtitle: 'wfl_approval_todos cleared · the preferred supplier list is attached',
      metrics: [{ label: 'we are reviewing the order', value: 'potential', kind: 'count' }],
      rows: [{ label: 'The potential risk is high', hint: 'rejected lots recorded', level: 'high' }],
    }
    const clean = sanitizeReportPayload(payload)
    // The protocol token strips whole; no casing residue survives anywhere.
    expect(clean.subtitle).toBe('cleared · the preferred supplier list is attached')
    expect(/wfl_approval_todos/i.test(JSON.stringify(clean))).toBe(false)
    // The English prose leaves keep their enum words verbatim and gain no
    // Han characters mid-word; the bare-leaf enum value still maps whole.
    expect(clean.metrics[0]?.label).toBe('we are reviewing the order')
    expect(clean.rows?.[0]?.label).toBe('The potential risk is high')
    expect(clean.rows?.[0]?.hint).toBe('rejected lots recorded')
    expect(clean.metrics[0]?.value).toBe('潜在')
    expect(/[\u4e00-\u9fff]/.test(clean.subtitle ?? '')).toBe(false)
    expect(/[\u4e00-\u9fff]/.test(clean.metrics[0]?.label ?? '')).toBe(false)
    expect(/[\u4e00-\u9fff]/.test(clean.rows?.[0]?.label ?? '')).toBe(false)
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

  const renderFlow = (item: ChatItem, onReportAction: (action: ReportAction, seq: number) => void = () => {}): void => {
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
        onReportAction={onReportAction}
        localPending={new Map()}
      />,
    )
  }

  it('renders metrics values and action labels sanitized in the DOM, with the dispatch route verbatim (W24-R1)', () => {
    const dispatched: ReportAction[] = []
    const item: ChatItem = {
      kind: 'report',
      seq: 2,
      time: 1000,
      payload: {
        v: 3,
        type: 'report',
        id: 'r_dom',
        title: '采购订单状态',
        metrics: [
          { label: '供应商状态', value: 'potential', kind: 'count' },
          { label: '收货进度', value: 'receiving=none', kind: 'count' },
        ],
        actions: [{ kind: 'view', label: 'WFL_Approval_Todos查看明细', route: '/pur_orders/12' }],
      },
    }
    renderFlow(item, (action) => { dispatched.push(action) })
    const values = [...document.querySelectorAll('[class*="metricMiniValue"]')].map(node => node.textContent)
    expect(values).toEqual(['潜在', '尚未收货'])
    const button = document.querySelector('[class*="reportActions"] button')
    expect(button?.textContent).toBe('查看明细')
    expect(/wfl_approval_todos/i.test(document.body.textContent ?? '')).toBe(false)
    expect(/receiving=none/i.test(document.body.textContent ?? '')).toBe(false)
    fireEvent.click(button as HTMLElement)
    expect(dispatched.length).toBe(1)
    expect(dispatched[0]?.kind).toBe('view')
    if (dispatched[0]?.kind === 'view') expect(dispatched[0].route).toBe('/pur_orders/12')
  })

  it('renders the sanitized subtitle: the protocol token never appears in the DOM text', () => {
    renderFlow(reportItem('实时查询 · 待办表 wfl_approval_todos 已清空'))
    const node = document.querySelector('[class*="reportSubtitle"]')
    expect(node?.textContent).toBe('实时查询 · 待办表 已清空')
    expect(document.body.textContent).not.toContain('wfl_approval_todos')
  })

  it('renders a mixed leaf with its English half verbatim and its CJK half intact (W24-R2)', () => {
    renderFlow(reportItem('frozen goods 已冻结'))
    const node = document.querySelector('[class*="reportSubtitle"]')
    expect(node?.textContent).toBe('frozen goods 已冻结')
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
