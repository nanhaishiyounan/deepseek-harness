// @vitest-environment jsdom
/**
 * FieldWidget: every control kind's rendering and edit path, including the
 * Picker/DatePicker/Relation popup contract — the functional-children span
 * binds `actions.open`, so a click mounts the popup layer and its confirm
 * button feeds `onChange`.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FieldControlSpec } from '../src/client/fieldControls.ts'
import { FieldWidget } from '../src/client/forms/FieldWidget.tsx'

/** One gateway call's payload. */
interface RecordedCall {
  readonly url: string
  readonly payload: Record<string, unknown>
}

let calls: RecordedCall[]

/**
 * Install the gateway fetch stub. `routes` maps `nocobase.list`-style method
 * names to a value, a per-call producer, or a deferred-capture producer;
 * an unmapped method answers ok:false.
 */
function stubGateway(
  routes: Record<string, unknown>,
): void {
  calls = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const body = JSON.parse((init?.body ?? '{}') as string) as { rpcId?: string; payload?: Record<string, unknown> }
    calls.push({ url, payload: body.payload ?? {} })
    const method = url.replace('/api/', '')
    const route = routes[method]
    if (route === undefined) {
      return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: false, error: { message: `no stub for ${method}` } } }), { status: 200 })
    }
    const value = typeof route === 'function'
      ? await (route as (payload: Record<string, unknown>) => Promise<unknown>)(body.payload ?? {})
      : route
    return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value } }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
}

/** One widget spec of the given kind. */
function specOf(kind: FieldControlSpec['kind'], overrides: Partial<FieldControlSpec> = {}): FieldControlSpec {
  return { kind, name: 'f', label: '字段', options: [], target: undefined, ...overrides }
}

/**
 * Let the mounted PickerView settle its wheel selection before confirming:
 * an unmatched value re-selects the first item through a zero-wait debounce,
 * and confirming inside that window would read the stale inner value.
 */
async function settleWheel(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 30) })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  cleanup()
})

describe('FieldWidget locked row', () => {
  it('shows the em dash for an empty value and the raw value otherwise', () => {
    const { rerender } = render(<FieldWidget spec={specOf('text')} value="" locked onChange={() => {}} />)
    expect(screen.getByText('—')).toBeTruthy()
    rerender(<FieldWidget spec={specOf('text')} value="PO-9" locked onChange={() => {}} />)
    expect(screen.getByText('PO-9')).toBeTruthy()
  })
})

describe('FieldWidget direct controls', () => {
  it('edits text through the Input', () => {
    const onChange = vi.fn()
    const view = render(<FieldWidget spec={specOf('text')} value="甲" locked={false} onChange={onChange} />)
    fireEvent.change(view.container.querySelector('input') as HTMLInputElement, { target: { value: '乙' } })
    expect(onChange).toHaveBeenCalledWith('乙')
  })

  it('edits long text through the TextArea', () => {
    const onChange = vi.fn()
    const view = render(<FieldWidget spec={specOf('textarea')} value="备注" locked={false} onChange={onChange} />)
    fireEvent.change(view.container.querySelector('textarea') as HTMLTextAreaElement, { target: { value: '新备注' } })
    expect(onChange).toHaveBeenCalledWith('新备注')
  })

  it('toggles the bool Switch in both directions', () => {
    const onChange = vi.fn()
    const { rerender } = render(<FieldWidget spec={specOf('bool')} value="true" locked={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenLastCalledWith('false')
    rerender(<FieldWidget spec={specOf('bool')} value="false" locked={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenLastCalledWith('true')
  })

  it('steps integer and decimal numbers, defaulting unparsable values to 0', () => {
    const onChange = vi.fn()
    const plus = (): void => {
      fireEvent.click(document.querySelector('.adm-stepper-plus') as HTMLElement)
    }
    const minus = (): void => {
      fireEvent.click(document.querySelector('.adm-stepper-minus') as HTMLElement)
    }
    const { rerender } = render(<FieldWidget spec={specOf('number')} value="3" locked={false} onChange={onChange} />)
    plus()
    expect(onChange).toHaveBeenLastCalledWith('4')
    minus()
    expect(onChange).toHaveBeenLastCalledWith('2')
    rerender(<FieldWidget spec={specOf('number')} value="3.5" locked={false} onChange={onChange} />)
    plus()
    expect(onChange).toHaveBeenLastCalledWith('4.5')
    rerender(<FieldWidget spec={specOf('number')} value="abc" locked={false} onChange={onChange} />)
    plus()
    expect(onChange).toHaveBeenLastCalledWith('1')
    rerender(<FieldWidget spec={specOf('number')} value="" locked={false} onChange={onChange} />)
    minus()
    expect(onChange).toHaveBeenLastCalledWith('-1')
  })
})

describe('FieldWidget enum Picker', () => {
  const enumSpec = specOf('enum', { options: ['draft', 'sent'] })

  it('renders the placeholder, the matched value, and the unmatched raw value', () => {
    const { rerender } = render(<FieldWidget spec={enumSpec} value="" locked={false} onChange={() => {}} />)
    expect(screen.getByTestId('enum-value').textContent).toBe('请选择')
    rerender(<FieldWidget spec={enumSpec} value="sent" locked={false} onChange={() => {}} />)
    expect(screen.getByTestId('enum-value').textContent).toBe('sent')
    rerender(<FieldWidget spec={enumSpec} value="幽灵值" locked={false} onChange={() => {}} />)
    expect(screen.getByTestId('enum-value').textContent).toBe('幽灵值')
  })

  it('opens the popup through actions.open and confirms the chosen option', async () => {
    const onChange = vi.fn()
    render(<FieldWidget spec={enumSpec} value="" locked={false} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('enum-value'))
    await waitFor(() => { expect(document.querySelector('.adm-picker')).toBeTruthy() })
    await settleWheel()
    fireEvent.click(screen.getByText('确定'))
    await waitFor(() => { expect(onChange).toHaveBeenCalledWith('draft') })
  })

  it('keeps the current value when confirming an empty vocabulary', async () => {
    const onChange = vi.fn()
    render(<FieldWidget spec={specOf('enum', { options: [] })} value="kept" locked={false} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('enum-value'))
    await waitFor(() => { expect(document.querySelector('.adm-picker')).toBeTruthy() })
    await settleWheel()
    fireEvent.click(screen.getByText('确定'))
    await waitFor(() => { expect(onChange).toHaveBeenCalledWith('kept') })
  })
})

describe('FieldWidget date DatePicker', () => {
  it('renders placeholder, formatted dates, epoch strings, and unparseable values', () => {
    const { rerender } = render(<FieldWidget spec={specOf('date')} value="" locked={false} onChange={() => {}} />)
    expect(screen.getByTestId('date-value').textContent).toBe('请选择日期')
    rerender(<FieldWidget spec={specOf('date')} value="2026-01-05" locked={false} onChange={() => {}} />)
    expect(screen.getByTestId('date-value').textContent).toBe('2026-01-05')
    rerender(<FieldWidget spec={specOf('date')} value="2026-11-15" locked={false} onChange={() => {}} />)
    expect(screen.getByTestId('date-value').textContent).toBe('2026-11-15')
    // An epoch string parses through the epoch arm and formats back.
    rerender(<FieldWidget spec={specOf('date')} value="5" locked={false} onChange={() => {}} />)
    expect(screen.getByTestId('date-value').textContent).toBe('1970-01-01')
    // An out-of-range epoch falls through to string parsing, which also fails.
    rerender(<FieldWidget spec={specOf('date')} value="99999999999999999" locked={false} onChange={() => {}} />)
    expect(screen.getByTestId('date-value').textContent).toBe('99999999999999999')
    rerender(<FieldWidget spec={specOf('date')} value="甲子日" locked={false} onChange={() => {}} />)
    expect(screen.getByTestId('date-value').textContent).toBe('甲子日')
  })

  it('opens the popup through actions.open and confirms a YYYY-MM-DD choice', async () => {
    const onChange = vi.fn()
    render(<FieldWidget spec={specOf('date')} value="" locked={false} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('date-value'))
    await waitFor(() => { expect(document.querySelector('.adm-picker')).toBeTruthy() })
    await settleWheel()
    fireEvent.click(screen.getByText('确定'))
    await waitFor(() => { expect(onChange).toHaveBeenCalledTimes(1) })
    expect(onChange.mock.calls[0]?.[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('FieldWidget relation Picker', () => {
  const relationSpec = specOf('relation', { target: 'hub_po_suppliers' })

  /** The stubbed target-table page the widget reads options from. */
  const supplierPage = { rows: [
    { id: 42, name: '宏发食品' },
    { id: 7, nickname: '备用列' },
  ] }

  it('loads target rows into the popup and confirms a picked id', async () => {
    stubGateway({ 'nocobase.list': supplierPage })
    const onChange = vi.fn()
    render(<FieldWidget spec={relationSpec} value="" locked={false} onChange={onChange} />)
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(1) })
    expect(screen.getByTestId('relation-value').textContent).toBe('请选择')
    fireEvent.click(screen.getByTestId('relation-value'))
    await waitFor(() => { expect(document.querySelector('.adm-picker')).toBeTruthy() })
    await waitFor(() => { expect(document.querySelector('.adm-picker')?.textContent).toContain('宏发食品') })
    await settleWheel()
    fireEvent.click(screen.getByText('确定'))
    await waitFor(() => { expect(onChange).toHaveBeenCalledWith('42') })
  })

  it('shows the matched option label for an AI-prefilled id and still confirms the id', async () => {
    stubGateway({ 'nocobase.list': supplierPage })
    const onChange = vi.fn()
    render(<FieldWidget spec={relationSpec} value="42" locked={false} onChange={onChange} />)
    // The options page read and the prefilled id's single-row label read both fire.
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(2) })
    // The prefilled id resolves to its option's label once the vocabulary loads.
    expect(screen.getByTestId('relation-value').textContent).toBe('宏发食品')
    fireEvent.click(screen.getByTestId('relation-value'))
    await waitFor(() => { expect(document.querySelector('.adm-picker')).toBeTruthy() })
    await settleWheel()
    fireEvent.click(screen.getByText('确定'))
    await waitFor(() => { expect(onChange).toHaveBeenCalledWith('42') })
  })

  it('shows the raw id while the option read is in flight, then resolves the label and confirms the id', async () => {
    let release: (page: unknown) => void = () => {}
    const gate = new Promise<unknown>((resolve) => { release = resolve })
    stubGateway({ 'nocobase.list': () => gate })
    const onChange = vi.fn()
    render(<FieldWidget spec={relationSpec} value="6" locked={false} onChange={onChange} />)
    // The AI-prefilled id shows raw until the option read resolves.
    expect(screen.getByTestId('relation-value').textContent).toBe('6')
    release({ rows: [{ id: 6, name: '速达冷链设备' }] })
    await waitFor(() => { expect(screen.getByTestId('relation-value').textContent).toBe('速达冷链设备') })
    fireEvent.click(screen.getByTestId('relation-value'))
    await waitFor(() => { expect(document.querySelector('.adm-picker')).toBeTruthy() })
    await settleWheel()
    fireEvent.click(screen.getByText('确定'))
    await waitFor(() => { expect(onChange).toHaveBeenCalledWith('6') })
  })

  it('shows the raw value while unmatched and falls back to the id column when the label misses', async () => {
    stubGateway({ 'nocobase.list': (payload: Record<string, unknown>) => {
      return payload['filter'] === undefined
        ? { rows: [{ id: 9 }] }
        : { rows: [{ id: 1, nickname: '业务员甲' }] }
    } })
    const { rerender } = render(
      <FieldWidget spec={relationSpec} value="未知id" locked={false} onChange={() => {}} />,
    )
    expect(screen.getByTestId('relation-value').textContent).toBe('未知id')
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(1) })
    // The row carries no name column, so the option label falls back to the id.
    fireEvent.click(screen.getByTestId('relation-value'))
    await waitFor(() => { expect(document.querySelector('.adm-picker')?.textContent).toContain('9') })
    fireEvent.click(screen.getByText('确定'))
    // An object-valued cell renders empty, but the id still confirms.
    rerender(<FieldWidget spec={specOf('relation', { target: 'users' })} value="1" locked={false} onChange={vi.fn()} />)
    // The re-edit phase labels the row through the options match or the shared
    // single-row read, not the bare id.
    await screen.findByText('业务员甲')
  })

  it('labels the users target by nickname and renders object cells empty', async () => {
    stubGateway({ 'nocobase.list': { rows: [
      { id: 1, nickname: '业务员甲' },
      // An object-valued id cell renders empty instead of a label.
      { id: { opaque: true }, nickname: '对象行' },
    ] } })
    const onChange = vi.fn()
    render(
      <FieldWidget spec={specOf('relation', { target: 'users' })} value="1" locked={false} onChange={onChange} />,
    )
    // The options page read and the prefilled id's single-row label read both fire.
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(2) })
    fireEvent.click(screen.getByTestId('relation-value'))
    await waitFor(() => { expect(document.querySelector('.adm-picker')?.textContent).toContain('业务员甲') })
    await settleWheel()
    fireEvent.click(screen.getByText('确定'))
    await waitFor(() => { expect(onChange).toHaveBeenCalledWith('1') })
  })

  it('keeps the row usable as an empty vocabulary when the option read fails', async () => {
    stubGateway({ 'nocobase.list': () => { throw new Error('目标表 502') } })
    const onChange = vi.fn()
    render(<FieldWidget spec={relationSpec} value="kept" locked={false} onChange={onChange} />)
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(1) })
    fireEvent.click(screen.getByTestId('relation-value'))
    await waitFor(() => { expect(document.querySelector('.adm-picker')).toBeTruthy() })
    fireEvent.click(screen.getByText('确定'))
    await waitFor(() => { expect(onChange).toHaveBeenCalledWith('kept') })
  })

  it('renders an empty vocabulary without a target and skips the option read', () => {
    stubGateway({})
    const onChange = vi.fn()
    render(<FieldWidget spec={specOf('relation', { target: undefined })} value="raw" locked={false} onChange={onChange} />)
    expect(screen.getByTestId('relation-value').textContent).toBe('raw')
    expect(calls).toHaveLength(0)
  })

  it('ignores a late option read after unmount', async () => {
    let release: (page: unknown) => void = () => {}
    const gate = new Promise<unknown>((resolve) => { release = resolve })
    stubGateway({ 'nocobase.list': () => gate })
    const view = render(<FieldWidget spec={relationSpec} value="" locked={false} onChange={() => {}} />)
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(1) })
    view.unmount()
    release({ rows: [{ id: 1, name: '迟到' }] })
    await Promise.resolve()
    expect(document.querySelector('.adm-picker')).toBeNull()
  })

  it('ignores a late option-read failure after unmount', async () => {
    let fail: () => void = () => {}
    const gate = new Promise<unknown>((_, reject) => { fail = reject })
    stubGateway({ 'nocobase.list': () => gate })
    const view = render(<FieldWidget spec={relationSpec} value="" locked={false} onChange={() => {}} />)
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(1) })
    view.unmount()
    fail()
    await Promise.resolve()
    expect(document.querySelector('.adm-picker')).toBeNull()
  })

  it('labels an unmatched prefilled id through the single-row read', async () => {
    // The options page's rows do not carry the prefilled id 6 (beyond the
    // first page); the shared label read resolves it so the re-edit phase
    // shows the target row's name, matching the review phase.
    stubGateway({ 'nocobase.list': (payload: Record<string, unknown>) => {
      return payload['filter'] === undefined
        ? { rows: [{ id: 42, name: '宏发食品' }] }
        : { rows: [{ id: 6, name: '速达冷链设备' }] }
    } })
    render(<FieldWidget spec={relationSpec} value="6" locked={false} onChange={() => {}} />)
    await waitFor(() => { expect(screen.getByTestId('relation-value').textContent).toBe('速达冷链设备') })
  })

  it('degrades an unmatched prefilled id to the raw id when both reads fail', async () => {
    vi.useFakeTimers()
    stubGateway({ 'nocobase.list': () => { throw new Error('目标表 502') } })
    render(<FieldWidget spec={relationSpec} value="6" locked={false} onChange={() => {}} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    // The options read failed (empty vocabulary) and the label read degraded;
    // the span keeps the raw id instead of a name it cannot verify.
    expect(screen.getByTestId('relation-value').textContent).toBe('6')
  })
})
