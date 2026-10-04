/**
 * The v3 draft card: the three-tier form ledger (需要你定 / 请确认·AI 推导 /
 * 系统生成) with the 44px phase stamp and the 确认写入 / 驳回 double action.
 * Each tier rides its own material — the required tier stays on the card
 * face with boxed controls, the derived tier sits in a washed read-only
 * panel with the rationale under the value, and the system tier folds into
 * a Collapse strip. Derived values rest as name-resolved rows (a user may
 * tap one open to override the derivation — the assistant never asks); the
 * re-edit diff marks the user-touched fields with the ink bar and tint.
 */

import { useRef, useState, type JSX } from 'react'
import { Button, Collapse, Input } from 'antd-mobile'
import type { CardPhase } from '../../cardState.ts'
import type { NocobaseFieldView } from '@deepseek-ai/dsh-host-apiproxy/api'
import { fieldControlOf } from '../../fieldControls.ts'
import type { FormDraftPayload, FormField } from '../../protocol.ts'
import { useRelationLabel } from '../relation-label.ts'
import { RelationSelect } from '../RelationSelect.tsx'
import css from './v3.module.css'
import { PhaseStamp } from './PhaseStamp.tsx'

/** v3 draft-card props: the payload, edits, phase, and the action sinks. */
export interface DraftCardProps {
  readonly payload: FormDraftPayload
  /** Current edit values keyed by field name (hydrated over payload values). */
  readonly values: Readonly<Record<string, string>>
  readonly phase: CardPhase
  /** The collection's field metadata (relation targets); absent fields fall back to text. */
  readonly meta?: ReadonlyMap<string, NocobaseFieldView> | undefined
  readonly onEdit: (name: string, value: string) => void
  readonly onConfirm: () => void
  readonly onReject: () => void
  readonly onRedraft: () => void
  readonly disabled: boolean
}

/** The per-field class pair: the diff mark when the user edited the field. */
function fieldClasses(edited: boolean | undefined): string {
  return edited === true ? ` ${css.fieldEdited}` : ''
}

/**
 * The v3 three-tier draft card.
 * @param props - the payload, edits, phase, field metadata, action sinks, busy gate.
 * @returns the draft card.
 */
/**
 * The required field's current text (edits over the payload's own value).
 * @param field - the required-tier field.
 * @param values - the card's merged edit values.
 * @returns the field's text (empty string when still blank).
 */
function requiredTextOf(field: FormField, values: Readonly<Record<string, string>>): string {
  return values[field.name] ?? field.value ?? ''
}

export function DraftCard(props: DraftCardProps): JSX.Element {
  const { payload, values, phase, onEdit, disabled } = props
  const [openDerived, setOpenDerived] = useState<ReadonlySet<string>>(new Set())
  /** Whether a 确认写入 attempt already met a blank required field (W8-B2). */
  const [attempted, setAttempted] = useState(false)
  const requiredRows = useRef(new Map<string, HTMLLabelElement>())
  const required = payload.fields.filter(field => field.tier === 'required')
  const derived = payload.fields.filter(field => field.tier === 'derived')
  const system = payload.fields.filter(field => field.tier === 'system')
  const openDerivedField = (name: string): void => {
    setOpenDerived(current => new Set(current).add(name))
  }
  /** The 确认写入 gate (W8-B2): blank required fields stay the gate — the
   * nearby 此项必填 line appears, the first blank control takes focus, and
   * the confirm never reaches the send lane until the gaps close. */
  const onConfirmClick = (): void => {
    const missing = required.filter(field => requiredTextOf(field, values).trim() === '')
    const first = missing[0]
    if (missing.length > 0 && first !== undefined) {
      setAttempted(true)
      const row = requiredRows.current.get(first.name)
      const focusable = row?.querySelector('input, button')
      if (focusable instanceof HTMLElement) focusable.focus()
      return
    }
    props.onConfirm()
  }
  return (
    <section className={css.card} data-testid="draft-card-v3" aria-label={`${payload.form.label}草稿卡`}>
      <header className={css.cardHeader}>
        <div className={css.cardTitles}>
          <span className={css.cardBiz}>{payload.form.label}</span>
          <span className={css.cardTitle}>{payload.title}</span>
        </div>
        <PhaseStamp phase={phase} />
      </header>
      {required.length > 0 && (
        <section className={css.tier} aria-label="需要你定">
          <div className={css.tierHead}>需要你定</div>
          {required.map(field => (
            <span key={field.name} className={css.fieldCell}>
              <label
                ref={(node) => {
                  if (node === null) requiredRows.current.delete(field.name)
                  else requiredRows.current.set(field.name, node)
                }}
                className={`${css.fieldRow}${fieldClasses(field.edited)}`}
              >
                <span className={css.fieldLabel}>{field.label}</span>
                <EditableValue
                  field={field}
                  payload={payload}
                  values={values}
                  meta={props.meta}
                  disabled={disabled}
                  onEdit={onEdit}
                />
              </label>
              {attempted && requiredTextOf(field, values).trim() === '' && (
                <span className={css.fieldError} role="alert">此项必填</span>
              )}
            </span>
          ))}
        </section>
      )}
      {derived.length > 0 && (
        <section className={`${css.tier} ${css.tierDerived}`} aria-label="请确认·AI 推导">
          <div className={css.tierHead}>请确认 · AI 推导</div>
          {derived.map(field => openDerived.has(field.name)
            ? (
              <label key={field.name} className={`${css.fieldRow}${fieldClasses(field.edited)}`}>
                <span className={css.fieldLabel}>{field.label}</span>
                <EditableValue
                  field={field}
                  payload={payload}
                  values={values}
                  meta={props.meta}
                  disabled={disabled}
                  onEdit={onEdit}
                />
              </label>
            )
            : (
              <button
                key={field.name}
                type="button"
                className={`${css.fieldRow} ${css.derivedRow}${fieldClasses(field.edited)}`}
                aria-label={`展开编辑 ${field.label}`}
                disabled={disabled}
                onClick={() => { openDerivedField(field.name) }}
              >
                <span className={css.fieldLabel}>{field.label}</span>
                <span className={css.derivedMain}>
                  <span
                    className={`${css.derivedValue}${field.edited === true ? ` ${css.fieldValueEdited}` : ''}`}
                  >
                    <DerivedFace field={field} value={values[field.name] ?? field.value ?? ''} payload={payload} meta={props.meta} />
                  </span>
                  {field.rationale !== undefined && <span className={css.rationale}>{field.rationale}</span>}
                </span>
              </button>
            ))}
        </section>
      )}
      {system.length > 0 && (
        <Collapse className={css.systemFold as string} defaultActiveKey={[]} accordion={false}>
          <Collapse.Panel key="system" title={<span className={css.tierHead}>系统生成（{String(system.length)}）</span>}>
            {system.map(field => (
              <div key={field.name} className={css.fieldRow}>
                <span className={css.fieldLabel}>{field.label}</span>
                <span className={css.systemValue}>{values[field.name] ?? field.value ?? ''}</span>
              </div>
            ))}
          </Collapse.Panel>
        </Collapse>
      )}
      <footer className={css.actions}>
        {phase === 'draft' && (
          <>
            <Button size="large" disabled={disabled} onClick={props.onReject} className={css.ghostButton}>
              驳回
            </Button>
            <Button color="primary" size="large" disabled={disabled} onClick={onConfirmClick} className={css.primaryButton}>
              确认写入
            </Button>
          </>
        )}
        {phase === 'pending' && <span className={css.phaseNote}>正在写入…</span>}
        {phase === 'rejected' && (
          <Button size="large" disabled={disabled} onClick={props.onRedraft} className={css.ghostButton}>
            重新编辑
          </Button>
        )}
      </footer>
    </section>
  )
}

/**
 * One editable field's control: relations pick names (the id never shows),
 * everything else stays the boxed text input.
 * @param props - the field, its payload context, edits, metadata, busy gate.
 * @returns the control element.
 */
function EditableValue(
  props: {
    readonly field: FormField
    readonly payload: FormDraftPayload
    readonly values: Readonly<Record<string, string>>
    readonly meta: ReadonlyMap<string, NocobaseFieldView> | undefined
    readonly disabled: boolean
    readonly onEdit: (name: string, value: string) => void
  },
): JSX.Element {
  const { field, payload, values, meta, disabled, onEdit } = props
  const value = values[field.name] ?? ''
  if (field.widget === 'relation' && !disabled) {
    const spec = fieldControlOf(payload.form.collection, field.name, meta?.get(field.name))
    if (spec.kind === 'relation') {
      return (
        <RelationSelect
          target={spec.target}
          value={value}
          placeholder="请选择"
          ariaLabel={field.label}
          triggerClassName={css.fieldPicker}
          onChange={(next) => { onEdit(field.name, next) }}
        />
      )
    }
  }
  // antd-mobile Input: the enclosing fieldRow label names the control (the
  // component's prop face does not carry aria-label through to the element).
  return (
    <Input
      className={css.fieldInput}
      value={value}
      disabled={disabled}
      inputMode={field.widget === 'number' ? 'decimal' : undefined}
      onChange={(next) => { onEdit(field.name, next) }}
    />
  )
}

/**
 * A derived row's resting face: relation ids resolve to the target-row name;
 * every other value shows as-is.
 * @param props - the field, its value, the payload, and the field metadata.
 * @returns the display text element.
 */
function DerivedFace(
  props: {
    readonly field: FormField
    readonly value: string
    readonly payload: FormDraftPayload
    readonly meta: ReadonlyMap<string, NocobaseFieldView> | undefined
  },
): JSX.Element {
  const { field, value, payload, meta } = props
  const spec = field.widget === 'relation'
    ? fieldControlOf(payload.form.collection, field.name, meta?.get(field.name))
    : undefined
  return <DerivedFaceResolved kind={spec?.kind} target={spec?.target} value={value} />
}

/** The name-resolved arm of the derived face (hook isolation per row). */
function DerivedFaceResolved(
  props: { readonly kind: string | undefined; readonly target: string | undefined; readonly value: string },
): JSX.Element {
  const resolved = useRelationLabel(
    props.kind === 'relation' ? { kind: props.kind, target: props.target } : undefined,
    props.value,
  )
  return <>{resolved ?? props.value}</>
}
