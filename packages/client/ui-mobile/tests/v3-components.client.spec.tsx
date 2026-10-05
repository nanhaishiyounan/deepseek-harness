// @vitest-environment jsdom
/** The v3 scaffolding components: ask bubbles, action badge, phase stamp, three-tier draft, receipt metric card. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NocobaseFieldView } from '@deepseek-ai/dsh-host-apiproxy/api'

afterEach(cleanup)
import { ChoiceBubble } from '../src/client/messages/ChoiceBubble.tsx'
import { FieldAskBubble } from '../src/client/messages/FieldAskBubble.tsx'
import { ActionBadge } from '../src/client/messages/ActionBadge.tsx'
import { RichContent } from '../src/client/messages/RichContent.tsx'
import { WelcomeCard } from '../src/client/messages/WelcomeCard.tsx'
import { PhaseStamp } from '../src/client/forms/v3/PhaseStamp.tsx'
import { DraftCard } from '../src/client/forms/v3/DraftCard.tsx'
import { ReceiptCard } from '../src/client/forms/v3/ReceiptCard.tsx'
import type { ChatAsk, ChatFieldAsk } from '../src/client/fold.ts'
import type { FormDraftPayload, SubmitReceiptPayload } from '../src/client/protocol.ts'
import type { CollectionFieldMeta } from '../src/client/forms/task-cards.tsx'

/** One ask item helper. */
function askOf(overrides: Partial<ChatAsk['payload']> = {}, answered?: ChatAsk['answered']): ChatAsk {
  return {
    kind: 'ask',
    seq: 1,
    time: 1,
    ...(answered === undefined ? {} : { answered }),
    payload: {
      v: 3,
      type: 'ask_choice',
      id: 'choice_1',
      mode: 'single',
      variant: 'cards',
      question: '这笔要登记成什么单据？',
      options: [
        { label: '采购单', value: 'hub_po_purchase_orders', hint: '我们向鲜丰买进', send: '是采购单，我们从鲜丰买进' },
        { label: '出库单', value: 'hub_wms_outbound' },
      ],
      allowFreeText: true,
      ...overrides,
    },
  }
}

/** One field-ask item helper. */
function fieldAskOf(answered?: ChatFieldAsk['answered']): ChatFieldAsk {
  return {
    kind: 'field-ask',
    seq: 1,
    time: 1,
    ...(answered === undefined ? {} : { answered }),
    payload: {
      v: 3,
      type: 'ask_field',
      id: 'field_1',
      question: '这批冷链箱的数量是多少？',
      field: {
        name: 'quantity',
        label: '数量',
        widget: 'number',
        unit: '箱',
        suggestions: [{ label: '200 箱', value: '200', hint: 'AI 猜测' }],
      },
    },
  }
}

describe('ChoiceBubble', () => {
  it('renders the cards variant with hints and sends the picked send-text', () => {
    const onSend = vi.fn()
    render(<ChoiceBubble ask={askOf()} onSend={onSend} onFreeText={() => {}} disabled={false} />)
    expect(screen.getByText('我们向鲜丰买进')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /采购单/ }))
    expect(onSend).toHaveBeenCalledWith('是采购单，我们从鲜丰买进')
    // The option without a hint renders without one.
    expect(screen.getByRole('radio', { name: '出库单' }).textContent).not.toContain('向鲜丰')
  })

  it('renders the chips and buttons variants', () => {
    const { unmount } = render(<ChoiceBubble ask={askOf({ variant: 'chips' })} onSend={() => {}} onFreeText={() => {}} disabled={false} />)
    expect(screen.getByText('采购单').className).toContain('askChip')
    unmount()
    render(<ChoiceBubble ask={askOf({ variant: 'buttons', allowFreeText: false })} onSend={() => {}} onFreeText={() => {}} disabled={false} />)
    expect(screen.getByText('出库单').className).toContain('askButton')
    // Without allowFreeText the free-text entry stays hidden.
    expect(screen.queryByText('自己打字说明')).toBeNull()
  })

  it('greys and disables the group once answered, highlighting the pick', () => {
    render(<ChoiceBubble ask={askOf(undefined, { selected: 'hub_po_purchase_orders' })} onSend={() => {}} onFreeText={() => {}} disabled={false} />)
    expect(screen.getByTestId('ask-choice').className).toContain('askAnswered')
    const picked = screen.getByRole('radio', { name: /采购单/ })
    expect(picked.getAttribute('aria-checked')).toBe('true')
    expect((picked as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText('自己打字说明')).toBeNull()
  })

  it('focuses the composer through the free-text entry', () => {
    const onFreeText = vi.fn()
    render(<ChoiceBubble ask={askOf()} onSend={() => {}} onFreeText={onFreeText} disabled={false} />)
    fireEvent.click(screen.getByText('自己打字说明'))
    expect(onFreeText).toHaveBeenCalledOnce()
  })
})

describe('FieldAskBubble', () => {
  it('shows the unit and fills the composer with a picked suggestion', () => {
    const onFill = vi.fn()
    render(<FieldAskBubble ask={fieldAskOf()} onFill={onFill} disabled={false} />)
    expect(screen.getByText('数量（箱）')).toBeTruthy()
    fireEvent.click(screen.getByText('200 箱'))
    expect(onFill).toHaveBeenCalledWith('200 箱')
  })

  it('greys once answered with the picked suggestion highlighted', () => {
    render(<FieldAskBubble ask={fieldAskOf({ selected: '200' })} onFill={() => {}} disabled={false} />)
    expect(screen.getByTestId('field-ask').className).toContain('askAnswered')
    expect(screen.getByText<HTMLButtonElement>('200 箱').disabled).toBe(true)
  })
})

describe('ActionBadge and RichContent', () => {
  it('names the confirmed form and the bare reject', () => {
    render(<><ActionBadge action="confirm" formLabel="采购单" /><ActionBadge action="reject" /></>)
    expect(screen.getByText('你确认了这张采购单')).toBeTruthy()
    expect(screen.getByText('你驳回了这张草稿')).toBeTruthy()
  })

  it('renders the narrative through the markdown pipeline', () => {
    const { container } = render(<RichContent text={'第一段\n\n第二段'} />)
    expect(container.querySelectorAll('p')).toHaveLength(2)
  })

  it('promotes numeric conclusion lines to metric minis and keeps prose as markdown', () => {
    const { container } = render(<RichContent text={'本月采购额 ¥182,400\n¥6,400 本月回款\n\n**采购单** 已登记。'} />)
    const minis = container.querySelectorAll('[class*="metricMiniValue"]')
    expect(minis).toHaveLength(2)
    expect(container.querySelector('strong')?.textContent).toBe('采购单')
  })
})

describe('WelcomeCard', () => {
  it('renders greeting, capabilities, and starter chips that fill the draft', () => {
    const onFill = vi.fn()
    render(
      <WelcomeCard
        welcome={{
          greeting: '我是智能填表助手',
          capabilities: ['登记六类单据'],
          starters: [{ label: '登记一条采购单', send: '向宏发采购' }],
        }}
        onFill={onFill}
        disabled={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '登记一条采购单' }))
    expect(onFill).toHaveBeenCalledWith('向宏发采购')
  })

  it('renders without starters', () => {
    render(<WelcomeCard welcome={{ greeting: '你好', capabilities: [], starters: [] }} onFill={() => {}} disabled />)
    expect(screen.getByText('你好')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('PhaseStamp', () => {
  it('labels each phase and carries the row id on submitted', () => {
    const { unmount } = render(<PhaseStamp phase="draft" />)
    expect(screen.getByText('待确认')).toBeTruthy()
    unmount()
    render(<PhaseStamp phase="pending" />)
    expect(screen.getByText('提交中')).toBeTruthy()
    unmount()
    render(<PhaseStamp phase="rejected" />)
    expect(screen.getByText('已驳回')).toBeTruthy()
    unmount()
    const { container } = render(<PhaseStamp phase="submitted" rowId="1042" />)
    expect(container.querySelector('[data-testid="phase-stamp"]')?.textContent).toBe('№1042')
  })

  it('carries no row id in the plain submitted seal', () => {
    render(<PhaseStamp phase="submitted" />)
    expect(screen.getByText('已登记')).toBeTruthy()
  })
})

const DRAFT: FormDraftPayload = {
  v: 3,
  type: 'form_draft',
  draftId: 'd_1',
  revision: 1,
  form: { collection: 'hub_po_purchase_orders', label: '采购单' },
  title: '鲜丰 · 冷链箱采购',
  fields: [
    { name: 'quantity', label: '数量', value: null, tier: 'required', widget: 'number' },
    { name: 'order_date', label: '日期', value: '2026-09-21', tier: 'derived', rationale: '今天', widget: 'date' },
    { name: 'po_number', label: '单号', value: 'PO-2026-0042', tier: 'system', widget: 'text' },
  ],
}

describe('DraftCard v3', () => {
  it('renders the three tiers with rationale and routes edits', () => {
    const onEdit = vi.fn()
    render(
      <DraftCard payload={DRAFT} values={{}} phase="draft" onEdit={onEdit} onConfirm={() => {}} onReject={() => {}} onRedraft={() => {}} disabled={false} />,
    )
    expect(screen.getByText('需要你定')).toBeTruthy()
    expect(screen.getByText('请确认 · AI 推导')).toBeTruthy()
    expect(screen.getByText('系统生成（1）')).toBeTruthy()
    // The rationale rests under the value in its own right-aligned line.
    expect(screen.getByText('今天').className).toContain('rationale')
    // The derived row rests read-only with its settled value.
    expect(screen.getByText('2026-09-21').className).toContain('derivedValue')
    // The system tier folds by default; opening it reveals the value.
    expect(screen.queryByText('PO-2026-0042')).toBeNull()
    fireEvent.click(screen.getByText('系统生成（1）'))
    expect(screen.getByText('PO-2026-0042')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('数量'), { target: { value: '260' } })
    expect(onEdit).toHaveBeenCalledWith('quantity', '260')
  })

  it('fires the double action on draft and offers re-edit on rejected', () => {
    const onConfirm = vi.fn()
    const onReject = vi.fn()
    // W8-B2: the required quantity carries a value, so the confirm passes
    // the blank-required gate.
    const { unmount } = render(
      <DraftCard payload={DRAFT} values={{ quantity: '200' }} phase="draft" onEdit={() => {}} onConfirm={onConfirm} onReject={onReject} onRedraft={() => {}} disabled={false} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '驳回' }))
    fireEvent.click(screen.getByRole('button', { name: '确认写入' }))
    expect(onReject).toHaveBeenCalledOnce()
    expect(onConfirm).toHaveBeenCalledOnce()
    unmount()
    const onRedraft = vi.fn()
    render(
      <DraftCard payload={DRAFT} values={{}} phase="rejected" onEdit={() => {}} onConfirm={() => {}} onReject={() => {}} onRedraft={onRedraft} disabled={false} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '重新编辑' }))
    expect(onRedraft).toHaveBeenCalledOnce()
  })

  it('blocks the confirm on a blank required field with the nearby error and focus (W8-B2)', () => {
    const onConfirm = vi.fn()
    const onEdit = vi.fn()
    const blocked = render(
      <DraftCard payload={DRAFT} values={{}} phase="draft" onEdit={onEdit} onConfirm={onConfirm} onReject={() => {}} onRedraft={() => {}} disabled={false} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '确认写入' }))
    // The blank gate: no confirm, the nearby live-region error, and the
    // first blank control holds focus.
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getAllByText('此项必填').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    expect(blocked.container.querySelector('label .adm-input-element')).toEqual(document.activeElement)
    // The edit sink still routes the fill.
    fireEvent.change(screen.getByLabelText('数量'), { target: { value: '260' } })
    expect(onEdit).toHaveBeenCalledWith('quantity', '260')
    blocked.unmount()
    // With the blank closed the confirm goes through.
    render(
      <DraftCard payload={DRAFT} values={{ quantity: '260' }} phase="draft" onEdit={() => {}} onConfirm={onConfirm} onReject={() => {}} onRedraft={() => {}} disabled={false} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '确认写入' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('shows the pending note instead of the decision actions', () => {
    render(
      <DraftCard payload={DRAFT} values={{}} phase="pending" onEdit={() => {}} onConfirm={() => {}} onReject={() => {}} onRedraft={() => {}} disabled={false} />,
    )
    expect(screen.getByText('正在写入…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '确认写入' })).toBeNull()
    expect(screen.queryByRole('button', { name: '驳回' })).toBeNull()
  })

  it('renders without a required section when no field is required', () => {
    const decided: FormDraftPayload = {
      ...DRAFT,
      fields: DRAFT.fields.map(field => field.tier === 'required'
        ? { ...field, value: '200', tier: 'derived' as const, rationale: '用户已定' }
        : field),
    }
    render(
      <DraftCard payload={decided} values={{}} phase="draft" onEdit={() => {}} onConfirm={() => {}} onReject={() => {}} onRedraft={() => {}} disabled={false} />,
    )
    expect(screen.queryByText('需要你定')).toBeNull()
  })
})

describe('ReceiptCard v3', () => {
  const RECEIPT: SubmitReceiptPayload = {
    v: 3,
    type: 'submit_receipt',
    draftId: 'd_1',
    form: { collection: 'hub_po_purchase_orders', label: '采购单' },
    rowId: '1042',
    summary: [
      { label: '合计金额', value: '¥6,400', kind: 'money' },
      { label: '数量', value: '200 箱', kind: 'count' },
      { label: '日期', value: '2026-09-21', kind: 'date' },
    ],
  }

  it('renders the money hero, the metric grid, the steps, and the stamp', () => {
    render(<ReceiptCard payload={RECEIPT} />)
    expect(screen.getByText('¥6,400')).toBeTruthy()
    expect(screen.getByText('合计金额')).toBeTruthy()
    expect(screen.getByText('200 箱')).toBeTruthy()
    expect(screen.getByText('采购单已登记')).toBeTruthy()
    // W9-B5: the 收讫 sign-off stamp floats off the receipt's corner.
    expect(screen.getByText('收讫')).toBeTruthy()
    expect(screen.getByText('收')).toBeTruthy()
    expect(screen.getByTestId('phase-stamp').textContent).toBe('№1042')
    expect(screen.getByText('已落库')).toBeTruthy()
  })

  it('fires the view-record entry when offered', () => {
    const onView = vi.fn()
    render(<ReceiptCard payload={RECEIPT} onView={onView} />)
    fireEvent.click(screen.getByRole('button', { name: '查看这条记录' }))
    expect(onView).toHaveBeenCalledOnce()
  })

  it('falls back to the grid when the first summary is not money', () => {
    render(<ReceiptCard payload={{ ...RECEIPT, summary: [{ label: '日期', value: '2026-09-21', kind: 'date' }] }} />)
    expect(screen.getByText('2026-09-21')).toBeTruthy()
    // No hero block renders.
    expect(screen.queryByText('¥6,400')).toBeNull()
  })

  it('renders the ticket strip when the summary carries an id row', () => {
    render(<ReceiptCard payload={{
      ...RECEIPT,
      summary: [...RECEIPT.summary, { label: '入库单号', value: 'IN-2026-0042', kind: 'id' }],
    }} />)
    // The id row rides both the metric grid and its ticket strip.
    expect(screen.getAllByText('入库单号').length).toBeGreaterThan(1)
    expect(screen.getAllByText('IN-2026-0042').length).toBeGreaterThan(1)
  })

  it('renders relation fields as the picker trigger on the edit row and the derived face on the derived tier', async () => {
    // The gateway stub carries the suppliers' option page for the picker and the label reads.
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const body = JSON.parse((init?.body ?? '{}') as string) as { rpcId?: string }
      const method = url.replace('/api/', '')
      const value = method === 'nocobase.list' ? { rows: [{ id: 42, name: '宏发食品' }] } : {}
      return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value } }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const meta = new Map<string, CollectionFieldMeta>([['hub_po_purchase_orders', new Map<string, NocobaseFieldView>([
      ['supplier_id', { name: 'supplier_id', type: 'belongsTo', target: 'hub_po_suppliers' }],
      ['customer_id', { name: 'customer_id', type: 'belongsTo', target: 'crm_customers' }],
    ])]])
    const onEdit = vi.fn()
    const payload: FormDraftPayload = {
      ...DRAFT,
      fields: [
        { name: 'supplier_id', label: '供应商', value: '42', tier: 'required', widget: 'relation' },
        { name: 'customer_id', label: '客户', value: 'C-9', tier: 'derived', widget: 'relation' },
      ],
    }
    render(
      <DraftCard
        payload={payload} values={{ supplier_id: '42', customer_id: 'C-9' }} phase="draft"
        meta={meta.get('hub_po_purchase_orders')}
        onEdit={onEdit} onConfirm={() => {}} onReject={() => {}} onRedraft={() => {}} disabled={false}
      />,
    )
    // The required relation renders the picker trigger (not a bare input); the
    // prefilled id resolves its target-row label over the stubbed read.
    await waitFor(() => { expect(screen.getByRole('button', { name: '供应商' }).textContent).toContain('宏发食品') })
    // The derived relation rides the resolved face (a non-numeric value stays the raw text).
    expect(screen.getByText('C-9')).toBeTruthy()
    // A relation field with no metadata falls back to the bare input (the
    // enclosing field-row label names the antd Input's element).
    const bare = render(
      <DraftCard
        payload={{ ...payload, fields: [{ name: 'owner_id', label: '经办人', value: '7', tier: 'required', widget: 'relation' }] }}
        values={{ owner_id: '7' }} phase="draft"
        onEdit={() => {}} onConfirm={() => {}} onReject={() => {}} onRedraft={() => {}} disabled={false}
      />,
    )
    expect((bare.container.querySelector('label .adm-input-element') as HTMLInputElement).value).toBe('7')
    bare.unmount()
    // Opening the picker and confirming routes the picked id as the edit.
    fireEvent.click(screen.getByRole('button', { name: '供应商' }))
    await waitFor(() => { expect(document.querySelector('.adm-picker')).toBeTruthy() })
    await new Promise((resolve) => { setTimeout(resolve, 30) })
    fireEvent.click(screen.getByText('确定'))
    await waitFor(() => { expect(onEdit).toHaveBeenCalledWith('supplier_id', '42') })
  })

  it('ignores rich taps that did not land on an image', () => {
    render(<RichContent text="一段普通叙述文字，没有图片。" />)
    fireEvent.click(screen.getByText('一段普通叙述文字，没有图片。'))
    // The tap never armed the viewer; the narrative keeps rendering.
    expect(screen.getByText('一段普通叙述文字，没有图片。')).toBeTruthy()
  })
})

describe('colleagues welcome metadata', () => {
  it('prefers the wire welcome and falls back to the local table', async () => {
    const { welcomeOf, colleagueOf, colleagueColor } = await import('../src/client/colleagues.ts')
    const wire = { greeting: '部署文案', capabilities: ['部署能力'], starters: [{ label: '起点', send: '发这句' }] }
    expect(welcomeOf('mobile-form-assistant', wire)).toEqual(wire)
    expect(welcomeOf('mobile-form-assistant', undefined).greeting).toBe('我是智能填表助手')
    expect(welcomeOf(undefined, undefined).greeting).toBe('你好，我是 AI 同事')
    expect(welcomeOf('unknown-preset', undefined).greeting).toBe('你好，我是 AI 同事')
    expect(colleagueOf('business-advisor').duty).toBe('经营洞察问答（只读）')
    expect(colleagueOf('unknown-preset').acronym).toBe('AI')
    // W10: the stamp faces resolve through the token dials (no hex leaks).
    expect(colleagueColor('mobile-form-assistant')).toBe('var(--dshm-stamp-avatar-1)')
    expect(colleagueColor('business-advisor')).toBe('var(--dshm-stamp-avatar-2)')
  })

  it('borrows the name leading pair for the fallback stamp without cutting a word', async () => {
    const { stampAcronymOf } = await import('../src/client/colleagues.ts')
    // A space after the prefix used to make slice(2,4) return one char of the
    // two-char word (「AI 食安合规官」 → 食); the trim-first pair keeps 食安.
    expect(stampAcronymOf('unknown-preset', 'AI 食安合规官')).toBe('食安')
    // A name without the AI prefix keeps the visual's own stamp word.
    expect(stampAcronymOf('unknown-preset', '张师傅')).toBe('AI')
    expect(stampAcronymOf('mobile-form-assistant', '张师傅')).toBe('表单')
    // Short names never crash: a bare prefix falls back, a single char stays.
    expect(stampAcronymOf('unknown-preset', 'AI')).toBe('AI')
    expect(stampAcronymOf('unknown-preset', 'AI 张')).toBe('张')
  })
})

describe('ChoiceBubble remaining branches', () => {
  it('sends a chips pick and a buttons pick', () => {
    const onSend = vi.fn()
    const { unmount } = render(<ChoiceBubble ask={askOf({ variant: 'chips' })} onSend={onSend} onFreeText={() => {}} disabled={false} />)
    fireEvent.click(screen.getByRole('radio', { name: '出库单' }))
    expect(onSend).toHaveBeenCalledWith('出库单')
    unmount()
    render(<ChoiceBubble ask={askOf({ variant: 'buttons' })} onSend={onSend} onFreeText={() => {}} disabled={false} />)
    fireEvent.click(screen.getByRole('radio', { name: '采购单' }))
    expect(onSend).toHaveBeenCalledWith('是采购单，我们从鲜丰买进')
  })

  it('marks the picked chip through aria-checked', () => {
    render(<ChoiceBubble ask={askOf({ variant: 'chips' }, { selected: 'hub_wms_outbound' })} onSend={() => {}} onFreeText={() => {}} disabled={false} />)
    expect(screen.getByRole('radio', { name: '出库单' }).getAttribute('aria-checked')).toBe('true')
  })

  it('renders a chip hint when the option carries one', () => {
    render(<ChoiceBubble ask={askOf({ variant: 'chips' })} onSend={() => {}} onFreeText={() => {}} disabled={false} />)
    expect(screen.getByText('我们向鲜丰买进')).toBeTruthy()
  })
})

describe('DraftCard v3 derived edit', () => {
  it('opens the derived row on tap and routes the override edit', () => {
    const onEdit = vi.fn()
    render(
      <DraftCard payload={DRAFT} values={{}} phase="draft" onEdit={onEdit} onConfirm={() => {}} onReject={() => {}} onRedraft={() => {}} disabled={false} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '展开编辑 日期' }))
    fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-09-25' } })
    expect(onEdit).toHaveBeenCalledWith('order_date', '2026-09-25')
  })
})

describe('DraftCard v3 edited diff', () => {
  it('marks the user-edited fields with the diff classes', () => {
    const edited: FormDraftPayload = {
      ...DRAFT,
      fields: DRAFT.fields.map((field, index) => index < 2 ? { ...field, edited: true } : field),
    }
    render(
      <DraftCard payload={edited} values={{ quantity: '300' }} phase="draft" onEdit={() => {}} onConfirm={() => {}} onReject={() => {}} onRedraft={() => {}} disabled={false} />,
    )
    expect(screen.getByLabelText('数量').closest('label')?.className).toContain('fieldEdited')
    expect(screen.getByText('2026-09-21').className).toContain('fieldValueEdited')
  })
})

describe('remaining component branches', () => {
  it('marks the picked buttons-option through aria-checked', () => {
    render(<ChoiceBubble ask={askOf({ variant: 'buttons' }, { selected: 'hub_po_purchase_orders' })} onSend={() => {}} onFreeText={() => {}} disabled={false} />)
    expect(screen.getByRole('radio', { name: '采购单' }).getAttribute('aria-checked')).toBe('true')
  })

  it('renders a field-ask without unit and without suggestions', () => {
    const bare: ChatFieldAsk = {
      kind: 'field-ask',
      seq: 1,
      time: 1,
      payload: { v: 3, type: 'ask_field', id: 'f', question: '备注写什么？', field: { name: 'note', label: '备注', widget: 'text', suggestions: [] } },
    }
    render(<FieldAskBubble ask={bare} onFill={() => {}} disabled={false} />)
    expect(screen.getByText('备注')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('DraftCard v3 hydrated values', () => {
  it('prefers the hydrated edit values over the payload values', () => {
    render(
      <DraftCard payload={DRAFT} values={{ quantity: '300', order_date: '2026-10-01' }} phase="draft" onEdit={() => {}} onConfirm={() => {}} onReject={() => {}} onRedraft={() => {}} disabled={false} />,
    )
    expect(screen.getByLabelText<HTMLInputElement>('数量').value).toBe('300')
    expect(screen.getByText('2026-10-01').className).toContain('derivedValue')
  })
})

describe('DraftCard v3 null-derived tolerance', () => {
  it('renders an empty resting value when a derived field carries null', () => {
    const withNull: FormDraftPayload = {
      ...DRAFT,
      fields: [...DRAFT.fields, { name: 'note', label: '备注', value: null, tier: 'derived', widget: 'text' }],
    }
    render(
      <DraftCard payload={withNull} values={{}} phase="draft" onEdit={() => {}} onConfirm={() => {}} onReject={() => {}} onRedraft={() => {}} disabled={false} />,
    )
    expect(screen.getByRole('button', { name: '展开编辑 备注' }).textContent).toBe('备注')
  })
})

describe('DraftCard v3 null-system tolerance', () => {
  it('renders an empty system value when a payload slips a null through', () => {
    const withNull: FormDraftPayload = {
      ...DRAFT,
      fields: [...DRAFT.fields, { name: 'note', label: '备注', value: null, tier: 'system', widget: 'text' }],
    }
    render(
      <DraftCard payload={withNull} values={{}} phase="draft" onEdit={() => {}} onConfirm={() => {}} onReject={() => {}} onRedraft={() => {}} disabled={false} />,
    )
    expect(screen.getByText('系统生成（2）')).toBeTruthy()
  })
})
