/**
 * Shared mobile UI atoms: the flat stamp avatar, the badge chip, the running
 * spinner row, and the empty/error states (antd-mobile Empty / ErrorBlock on
 * this app's token track). Presentation only; no data paths.
 */

import type { JSX, ReactNode } from 'react'
import { DotLoading, ErrorBlock } from 'antd-mobile'
import css from './ui.module.css'

/** Avatar props: the flat background css, the acronym block, and an optional glyph. */
export interface AvatarProps {
  readonly background: string
  readonly acronym?: string
  readonly size?: number
  readonly children?: ReactNode
}

/** One flat stamp avatar (colleague identity block, v3: no gradients). */
export function Avatar({ background, acronym, size = 40, children }: AvatarProps): JSX.Element {
  return (
    <span
      className={css.avatar}
      style={{ width: `${size}px`, height: `${size}px`, background, fontSize: `${Math.round(size * 0.36)}px` }}
      aria-hidden="true"
    >
      {children !== undefined ? children : acronym}
    </span>
  )
}

/** Badge tone vocabulary (semantic colors from the token set). */
export type BadgeTone = 'primary' | 'success' | 'warning' | 'muted' | 'destructive'

/** One small pill badge (`AI`/`在线`/`紧急`…). */
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }): JSX.Element {
  return <span className={`${css.badge} ${css[tone]}`}>{children}</span>
}

/** The in-progress status row (「正在处理…」). */
export function RunningRow({ text }: { text: string }): JSX.Element {
  return (
    <div className={css.runningRow} role="status">
      <span className={css.runningDot} aria-hidden="true"><DotLoading color="currentColor" /></span>
      <span>{text}</span>
    </div>
  )
}

/** Load-failure / empty state card (antd ErrorBlock faces on this track). */
export function NoticeCard({ kind, text }: { kind: 'empty' | 'error'; text: string }): JSX.Element {
  if (kind === 'error') {
    return (
      <div className={css.notice} role="error">
        <ErrorBlock status="disconnected" title={text} className={css.noticeBlock as string} />
      </div>
    )
  }
  return (
    <div className={css.notice} role="empty">
      <ErrorBlock status="empty" title={text} className={css.noticeBlock as string} />
    </div>
  )
}
