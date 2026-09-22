/**
 * The user-action badge row: the lightweight marker a 确认写入 / 驳回 action
 * message renders as (never a full protocol-text bubble).
 */

import type { JSX } from 'react'
import css from './messages.module.css'

/** Action-badge props: the action kind and the form's business label. */
export interface ActionBadgeProps {
  readonly action: 'confirm' | 'reject'
  /** The form's bizName (采购单…); the generic copy renders without one. */
  readonly formLabel?: string | undefined
}

/**
 * The action badge row.
 * @param props - the action kind and the form label.
 * @returns the badge row.
 */
export function ActionBadge({ action, formLabel }: ActionBadgeProps): JSX.Element {
  const text = action === 'confirm'
    ? formLabel === undefined ? '你确认了这份草稿' : `你确认了这张${formLabel}`
    : '你驳回了这张草稿'
  return (
    <div className={`${css.actionBadge} ${action === 'reject' ? css.actionBadgeReject : ''}`} data-testid="action-badge">
      <span aria-hidden="true">{action === 'confirm' ? '✓' : '✕'}</span>
      {text}
    </div>
  )
}
