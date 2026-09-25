/**
 * Shared mobile UI atoms: the flat stamp avatar (the identity-stamp design
 * language; antd-mobile's Avatar is img-only with a required string `src`, so
 * the acronym block stays this app's own span), the badge chip (antd-mobile
 * Tag on the token track), the running spinner row, the loading skeletons
 * (antd-mobile Skeleton), and the empty/error states (antd-mobile Empty /
 * ErrorBlock on this app's token track). Presentation only; no data paths.
 */

import type { JSX, ReactNode } from 'react'
import { DotLoading, ErrorBlock, Skeleton, Tag } from 'antd-mobile'
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

/**
 * The tone faces: Tag owns its color through inline CSS variables (a class
 * declaration would lose to the component's own inline defaults), so each
 * tone resolves to its token dials.
 */
const TONE_FACES = {
  primary: {
    '--background-color': 'var(--dshm-primary-10)',
    '--text-color': 'var(--dshm-primary)',
    '--border-color': 'transparent',
  },
  success: {
    '--background-color': 'var(--dshm-success-10)',
    '--text-color': 'var(--dshm-success)',
    '--border-color': 'transparent',
  },
  warning: {
    '--background-color': 'var(--dshm-warning-10)',
    '--text-color': 'var(--dshm-warning)',
    '--border-color': 'transparent',
  },
  muted: {
    '--background-color': 'var(--dshm-muted)',
    '--text-color': 'var(--dshm-muted-foreground)',
    '--border-color': 'transparent',
  },
  destructive: {
    '--background-color': 'var(--dshm-destructive-10)',
    '--text-color': 'var(--dshm-destructive)',
    '--border-color': 'transparent',
  },
} as const

/** One small pill badge (`AI`/`在线`/`紧急`…) — antd-mobile Tag on the token track. */
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }): JSX.Element {
  return <Tag round className={css.badge as string} style={TONE_FACES[tone]}>{children}</Tag>
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

/**
 * One skeleton placeholder row (list-shaped loading state): avatar disc plus
 * two text bars, breathing on antd-mobile's shimmer. Purely visual — the
 * wrapping page group carries the role="status" announcement.
 * @returns the skeleton row.
 */
export function SkelRow(): JSX.Element {
  return (
    <div className={css.skelRow} aria-hidden="true">
      <Skeleton animated className={css.skelAvatar as string} />
      <span className={css.skelTexts}>
        <Skeleton.Paragraph animated lineCount={2} className={css.skelParagraph as string} />
      </span>
    </div>
  )
}

/**
 * One skeleton placeholder card (card-shaped loading state): head row (avatar
 * disc plus a title bar) over two body bars, breathing on the same shimmer.
 * @returns the skeleton card.
 */
export function SkelCard(): JSX.Element {
  return (
    <div className={css.skelCard} aria-hidden="true">
      <span className={css.skelHead}>
        <Skeleton animated className={css.skelAvatar as string} />
        <span className={css.skelTexts}>
          <Skeleton.Title animated className={css.skelTitle as string} />
        </span>
      </span>
      <Skeleton.Paragraph animated lineCount={2} className={css.skelParagraph as string} />
    </div>
  )
}
