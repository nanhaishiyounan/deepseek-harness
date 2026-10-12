// @vitest-environment jsdom
/**
 * FieldWidget: every control kind's rendering and edit path — the
 * Picker/DatePicker popup contract: the functional-children span binds
 * `actions.open`, so a click mounts the popup layer and its confirm button
 * feeds `onChange`.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FieldControlSpec } from '../src/client/fieldControls.ts'
import { FieldWidget } from '../src/client/forms/FieldWidget.tsx'

/** One widget spec of the given kind. */
function specOf(kind: FieldControlSpec['kind'], overrides: Partial<FieldControlSpec> = {}): FieldControlSpec {
  return { kind, name: 'f', label: '字段', options: [], ...overrides }
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
