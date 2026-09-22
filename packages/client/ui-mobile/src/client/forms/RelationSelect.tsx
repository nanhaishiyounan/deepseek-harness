/**
 * The shared relation picker: one relation field rendered as an antd-mobile
 * Picker whose trigger shows the target-row name — options read from the
 * target table on first mount, and an id the options page does not carry
 * (AI-prefilled beyond the first page, or a failed read) falls back to the
 * shared relation-label read, degrading to the raw id. Every confirm submits
 * the option's value (the target-row id); the display text stays a name.
 */

import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import { Picker } from 'antd-mobile'
import type { NocobaseRowView } from '@deepseek-ai/dsh-host-apiproxy/api'
import { relationLabelColumn } from '../fieldControls.ts'
import { rpc } from '../rpc.ts'
import { useRelationLabel } from './relation-label.ts'

/** Relation-select props: the target table, the value, and the change sink. */
export interface RelationSelectProps {
  readonly target: string | undefined
  readonly value: string
  /** Placeholder the empty trigger shows. */
  readonly placeholder: string
  /** The picker's accessible name. */
  readonly ariaLabel: string
  /** The trigger's extra class (the card styles the trigger face). */
  readonly triggerClassName?: string | undefined
  /** Test hook for the trigger element. */
  readonly testId?: string | undefined
  readonly style?: CSSProperties | undefined
  readonly onChange: (value: string) => void
}

/** Render one opaque row cell as picker text (numbers pass through, objects show empty). */
function cellText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

/**
 * The relation picker with name-resolved trigger.
 * @param props - the target table, the current id value, the change sink.
 * @returns the picker trigger bound to its popup columns.
 */
export function RelationSelect(props: RelationSelectProps): JSX.Element {
  const { target, value, placeholder, ariaLabel, onChange } = props
  const [options, setOptions] = useState<{ value: string; label: string }[] | undefined>(undefined)
  const resolved = useRelationLabel({ kind: 'relation', target }, value)
  const labelColumn = target === undefined ? 'name' : relationLabelColumn(target)
  useEffect(() => {
    let alive = true
    if (target === undefined) return
    rpc('nocobase.list', { collection: target, page: 1, page_size: 50, sort: ['id'] }).then((page) => {
      if (!alive) return
      setOptions(page.rows.map((row: NocobaseRowView) => ({
        value: cellText(row['id']),
        label: cellText(row[labelColumn] ?? row['id']),
      })))
    }, () => {
      // A failed option read keeps the row usable as plain text.
      if (alive) setOptions([])
    })
    return () => { alive = false }
  }, [target, labelColumn])
  const matched = options?.find(option => option.value === value)?.label
  const display = matched ?? resolved ?? (value === '' ? placeholder : value)
  return (
    <Picker
      columns={[options ?? []]}
      value={[value]}
      aria-label={ariaLabel}
      onConfirm={(choice) => {
        // An empty choice keeps the current value.
        /* v8 ignore next -- the confirm carries the chosen item or a null slot. */
        onChange(String(choice[0] ?? value))
      }}
    >
      {(_items, actions) => (
        <span
          className={props.triggerClassName}
          data-testid={props.testId}
          style={props.style}
          role="button"
          tabIndex={0}
          aria-label={ariaLabel}
          onClick={actions.open}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              actions.open()
            }
          }}
        >
          {display}
        </span>
      )}
    </Picker>
  )
}
