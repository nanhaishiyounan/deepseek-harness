/**
 * The user-action badge row: the lightweight marker a 确认写入 / 驳回 action
 * message renders as (never a full protocol-text bubble) — antd-mobile Tag on
 * the token track.
 */

import type { JSX } from 'react'
import { Tag } from 'antd-mobile'
import css from './messages.module.css'

/** Action-badge props: the action kind, the form's business label, and an optional copy override. */
export interface ActionBadgeProps {
  readonly action: 'confirm' | 'reject'
  /** The form's bizName (采购单…); the generic copy renders without one. */
  readonly formLabel?: string | undefined
  /** Full copy override (the approval actions' 你同意了/你驳回了 phrasing). */
  readonly text?: string | undefined
}

/**
 * The action badge row.
 * @param props - the action kind and the form label.
 * @returns the badge row.
 */
export function ActionBadge({ action, formLabel, text: override }: ActionBadgeProps): JSX.Element {
  const text = override ?? (action === 'confirm'
    ? formLabel === undefined ? '你确认了这份草稿' : `你确认了这张${formLabel}`
    : '你驳回了这张草稿')
  // Tag owns its colors through inline CSS variables (a class declaration
  // would lose to the component's own inline defaults): the confirm arm rides
  // the brand-10 wash, the reject arm the destructive wash.
  const face = action === 'reject'
    ? {
      '--background-color': 'var(--dshm-destructive-10)',
      '--text-color': 'var(--dshm-destructive)',
      '--border-color': 'transparent',
    }
    : {
      '--background-color': 'var(--dshm-primary-10)',
      '--text-color': 'var(--dshm-on-soft)',
      '--border-color': 'transparent',
    }
  return (
    <Tag round className={css.actionBadge as string} data-testid="action-badge" style={face}>
      <span aria-hidden="true">{action === 'confirm' ? '✓' : '✕'}</span>
      {text}
    </Tag>
  )
}
