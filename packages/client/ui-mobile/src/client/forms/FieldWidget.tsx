/**
 * The draft card's field widget: one field rendered per its resolved control
 * spec — Input/TextArea for text, Stepper for number, Switch for bool,
 * Picker for enum, DatePicker for date, and the shared RelationSelect for
 * relations. Read-only phases render the same spec as a locked label:value
 * row.
 */

import { type JSX } from 'react'
import { DatePicker, Input, Picker, Stepper, Switch, TextArea } from 'antd-mobile'
import type { FieldControlSpec } from '../fieldControls.ts'
import { RelationSelect } from './RelationSelect.tsx'
import css from './field-widget.module.css'

/** One editable field row's props. */
export interface FieldWidgetProps {
  readonly spec: FieldControlSpec
  readonly value: string
  readonly locked: boolean
  readonly onChange: (value: string) => void
}

/**
 * Render one draft field with its typed widget (or the locked value row).
 * @param props - the field spec, current value, lock state, and change sink.
 * @returns the field row.
 */
export function FieldWidget({ spec, value, locked, onChange }: FieldWidgetProps): JSX.Element {
  if (locked) {
    return (
      <div className={css.row}>
        <span className={css.label}>{spec.label}</span>
        <span className={css.lockedValue}>{value === '' ? '—' : value}</span>
      </div>
    )
  }
  switch (spec.kind) {
    case 'bool':
      return (
        <div className={css.row}>
          <span className={css.label}>{spec.label}</span>
          <Switch
            checked={value === 'true'}
            aria-label={spec.label}
            onChange={(checked) => { onChange(checked ? 'true' : 'false') }}
          />
        </div>
      )
    case 'number': {
      const parsed = Number(value)
      const numeric = value !== '' && Number.isFinite(parsed) ? parsed : 0
      return (
        <div className={css.row}>
          <span className={css.label}>{spec.label}</span>
          <Stepper
            value={numeric}
            digits={Number.isInteger(numeric) ? 0 : 2}
            aria-label={spec.label}
            onChange={(next) => { onChange(String(next)) }}
          />
        </div>
      )
    }
    case 'date':
      return (
        <div className={css.row}>
          <span className={css.label}>{spec.label}</span>
          <DatePicker
            value={parseDate(value)}
            precision="day"
            aria-label={spec.label}
            onConfirm={(date) => { onChange(formatDate(date)) }}
          >
            {(picked, actions) => (
              <span className={css.pickerValue} data-testid="date-value" onClick={actions.open}>
                {picked === null ? (value === '' ? '请选择日期' : value) : formatDate(picked)}
              </span>
            )}
          </DatePicker>
        </div>
      )
    case 'enum':
      return (
        <div className={css.row}>
          <span className={css.label}>{spec.label}</span>
          <Picker
            columns={[spec.options.map(option => ({ value: option, label: option }))]}
            value={[value]}
            aria-label={spec.label}
            onConfirm={(choice) => { onChange(confirmedValue(choice, value)) }}
          >
            {(items, actions) => (
              <span className={css.pickerValue} data-testid="enum-value" onClick={actions.open}>
                {pickerText(items[0], value === '' ? '请选择' : value)}
              </span>
            )}
          </Picker>
        </div>
      )
    case 'relation':
      return (
        <div className={css.row}>
          <span className={css.label}>{spec.label}</span>
          <RelationSelect
            target={spec.target}
            value={value}
            placeholder="请选择"
            ariaLabel={spec.label}
            triggerClassName={css.pickerValue}
            testId="relation-value"
            onChange={onChange}
          />
        </div>
      )
    case 'textarea':
      return (
        <div className={css.rowStack}>
          <span className={css.label}>{spec.label}</span>
          <TextArea
            className={css.textArea}
            aria-label={spec.label}
            value={value}
            autoSize={{ minRows: 2, maxRows: 4 }}
            placeholder="请输入"
            onChange={(next) => { onChange(next) }}
          />
        </div>
      )
    default:
      return (
        <div className={css.row}>
          <span className={css.label}>{spec.label}</span>
          <Input
            className={css.input}
            aria-label={spec.label}
            value={value}
            placeholder="请输入"
            onChange={(next) => { onChange(next) }}
          />
        </div>
      )
  }
}

/**
 * The text a picker's confirm feeds the change sink; an empty choice keeps
 * the current value.
 * @param choice - the confirm callback's chosen values.
 * @param fallback - the current value an empty choice keeps.
 * @returns the confirmed field text.
 */
function confirmedValue(choice: readonly (string | number | boolean | null | undefined)[], fallback: string): string {
  /* v8 ignore next -- the confirm carries the chosen item or a null slot. */
  return String(choice[0] ?? fallback)
}

/** The antd-mobile picker's column item (the children callback's argument). */
interface PickerItem {
  readonly label?: unknown
}

/**
 * The display text of a picker's current item — its label. Both column
 * builders give every option a string label (enum options repeat the value,
 * relation options carry the target-row name), keeping the display text and
 * the submitted value separate vocabularies. The unmatched item shows the
 * fallback (the placeholder or the raw value).
 * @param item - the children callback's first column item.
 * @param fallback - the text an unmatched item shows.
 * @returns the item's label text, or the fallback.
 */
function pickerText(item: PickerItem | null | undefined, fallback: string): string {
  if (item === null || item === undefined) return fallback
  return String(item.label)
}

/** Parse a draft's date string (YYYY-MM-DD or epoch) into a Date. */
function parseDate(value: string): Date | null {
  if (value === '') return null
  const epoch = Number(value)
  if (Number.isFinite(epoch) && value.trim() !== '') {
    const fromEpoch = new Date(epoch)
    if (!Number.isNaN(fromEpoch.getTime())) return fromEpoch
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Format a Date back to the draft's YYYY-MM-DD string. */
function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(date.getFullYear())}-${month}-${day}`
}
