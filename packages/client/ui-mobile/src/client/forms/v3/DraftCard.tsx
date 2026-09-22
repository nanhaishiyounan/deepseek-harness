/**
 * The v3 draft card: the three-tier form ledger (需要你定 / 请确认·AI 推导 /
 * 系统生成) with the phase stamp and the 确认写入 / 驳回 double action.
 * Derived values rest as read-only rows carrying their rationale (a user may
 * tap one open to override the derivation — the assistant never asks); the
 * re-edit diff marks the user-touched fields with the ink bar and tint.
 */

import { useState, type JSX } from 'react'
import { Button } from 'antd-mobile'
import type { CardPhase } from '../../cardState.ts'
import type { FormDraftPayload } from '../../protocol.ts'
import css from './v3.module.css'
import { PhaseStamp } from './PhaseStamp.tsx'

/** v3 draft-card props: the payload, edits, phase, and the action sinks. */
export interface DraftCardProps {
  readonly payload: FormDraftPayload
  /** Current edit values keyed by field name (hydrated over payload values). */
  readonly values: Readonly<Record<string, string>>
  readonly phase: CardPhase
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
 * @param props - the payload, edits, phase, action sinks, busy gate.
 * @returns the draft card.
 */
export function DraftCard(props: DraftCardProps): JSX.Element {
  const { payload, values, phase, onEdit, disabled } = props
  const [openDerived, setOpenDerived] = useState<ReadonlySet<string>>(new Set())
  const required = payload.fields.filter(field => field.tier === 'required')
  const derived = payload.fields.filter(field => field.tier === 'derived')
  const system = payload.fields.filter(field => field.tier === 'system')
  const openDerivedField = (name: string): void => {
    setOpenDerived(current => new Set(current).add(name))
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
        <section className={css.tier}>
          <h4 className={css.tierHead}>需要你定</h4>
          {required.map(field => (
            <label key={field.name} className={`${css.fieldRow}${fieldClasses(field.edited)}`}>
              <span className={css.fieldLabel}>{field.label}</span>
              <input
                className={css.fieldInput}
                aria-label={field.label}
                value={values[field.name] ?? ''}
                disabled={disabled}
                onChange={(event) => { onEdit(field.name, event.target.value) }}
              />
            </label>
          ))}
        </section>
      )}
      {derived.length > 0 && (
        <section className={css.tier}>
          <h4 className={css.tierHead}>请确认 · AI 推导</h4>
          {derived.map(field => openDerived.has(field.name)
            ? (
              <label key={field.name} className={`${css.fieldRow}${fieldClasses(field.edited)}`}>
                <span className={css.fieldLabel}>{field.label}</span>
                <input
                  className={css.fieldInput}
                  aria-label={field.label}
                  value={values[field.name] ?? ''}
                  disabled={disabled}
                  onChange={(event) => { onEdit(field.name, event.target.value) }}
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
                <span className={css.fieldLabel}>
                  {field.label}
                  {field.rationale !== undefined && <span className={css.rationale}> · {field.rationale}</span>}
                </span>
                <span
                  className={`${css.derivedValue}${field.edited === true ? ` ${css.fieldValueEdited}` : ''}`}
                >
                  {values[field.name] ?? field.value ?? ''}
                </span>
              </button>
            ))}
        </section>
      )}
      {system.length > 0 && (
        <details className={css.systemFold}>
          <summary className={css.tierHead}>系统生成（{String(system.length)}）</summary>
          {system.map(field => (
            <div key={field.name} className={css.fieldRow}>
              <span className={css.fieldLabel}>{field.label}</span>
              <span className={css.systemValue}>{values[field.name] ?? field.value ?? ''}</span>
            </div>
          ))}
        </details>
      )}
      <footer className={css.actions}>
        {phase === 'draft' && (
          <>
            <Button size="large" disabled={disabled} onClick={props.onReject} className={css.ghostButton}>
              驳回
            </Button>
            <Button color="primary" size="large" disabled={disabled} onClick={props.onConfirm} className={css.primaryButton}>
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
