/**
 * Shared mobile UI atoms: the flat stamp avatar (the identity-stamp design
 * language; antd-mobile's Avatar is img-only with a required string `src`, so
 * the acronym block stays this app's own span), the badge chip (antd-mobile
 * Tag on the token track), the running spinner row, the loading skeletons
 * (antd-mobile Skeleton — list rows with the timestamp slot, cards, and the
 * chat thread), the unified empty state (icon + title + description + one
 * solid CTA, W7-M2), and the empty/error notice cards (antd-mobile
 * ErrorBlock on this app's token track). Presentation only; no data paths.
 */

import type { JSX, ReactNode } from 'react'
import { Button, DotLoading, ErrorBlock, Skeleton, Tag } from 'antd-mobile'
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

/** The unified empty state's CTA (one solid primary action, never outlined). */
export interface EmptyStateAction {
  readonly label: string
  readonly onClick: () => void
}

/** EmptyState props: the linear icon, the two copy lines, the optional CTA, the density. */
export interface EmptyStateProps {
  /** A lucide glyph (stroke 1.8) — the single visual anchor, no emoji. */
  readonly icon: ReactNode
  readonly title: string
  /** The second line distinguishing 未设筛选 vs 筛选无结果 (Fiori copy rule). */
  readonly description?: string
  readonly action?: EmptyStateAction
  /** `section` = the in-card compact row (files/home strips); default `page`. */
  readonly variant?: 'page' | 'section'
}

/**
 * The unified empty state (W7-M2, audit 04 TOP-5): icon block + title +
 * description + one solid CTA. `page` centers the stack in the scroll body;
 * `section` rides one compact in-card row.
 * @param props - icon, title, optional description, optional action, variant.
 * @returns the empty-state block.
 */
export function EmptyState({ icon, title, description, action, variant = 'page' }: EmptyStateProps): JSX.Element {
  const root = variant === 'section' ? `${css.emptyState} ${css.emptyStateSection}` : css.emptyState
  return (
    <div className={root} role="empty" data-testid="empty-state">
      <span className={css.emptyIcon} aria-hidden="true">{icon}</span>
      <span className={css.emptyTexts}>
        <span className={css.emptyTitle}>{title}</span>
        {description !== undefined && <span className={css.emptyDesc}>{description}</span>}
        {action !== undefined && (
          <Button
            type="button"
            color="primary"
            fill="solid"
            size="small"
            className={css.emptyAction as string}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        )}
      </span>
    </div>
  )
}

/**
 * One skeleton placeholder row (list-shaped loading state): avatar disc, a
 * title bar with the trailing timestamp slot, and one summary bar — matching
 * the real row's structure (W7-M2, audit 04 TOP-4: the skeleton mirrors what
 * lands). Purely visual — the wrapping page group carries the role="status"
 * announcement.
 * @returns the skeleton row.
 */
export function SkelRow(): JSX.Element {
  return (
    <div className={css.skelRow} aria-hidden="true">
      <Skeleton animated className={css.skelAvatar as string} />
      <span className={css.skelTexts}>
        <span className={css.skelTop}>
          <Skeleton animated className={css.skelTitle as string} />
          <Skeleton animated className={css.skelTime as string} />
        </span>
        <Skeleton animated className={css.skelLine as string} />
      </span>
    </div>
  )
}

/**
 * One skeleton placeholder card (card-shaped loading state): head row (a
 * 24px stamp disc plus a title bar) over two body bars, breathing on the
 * same shimmer — the todo/doc/alert card silhouette.
 * @returns the skeleton card.
 */
export function SkelCard(): JSX.Element {
  return (
    <div className={css.skelCard} aria-hidden="true">
      <span className={css.skelHead}>
        <Skeleton animated className={css.skelStamp as string} />
        <span className={css.skelTexts}>
          <Skeleton animated className={css.skelTitle as string} />
        </span>
      </span>
      <Skeleton animated className={css.skelLine as string} />
      <Skeleton animated className={css.skelLineShort as string} />
    </div>
  )
}

/**
 * The chat thread's first-paint skeleton (W7-M2, audit 04 §07): an AI bubble
 * block, a wider reply block, then a short user bubble on the trailing right
 * — the shape the loaded thread lands in, replacing the one-line「会话加载中」
 * over 750px of blank flow.
 * @returns the thread skeleton.
 */
export function SkelThread(): JSX.Element {
  return (
    <div className={css.skelThread} aria-hidden="true">
      <Skeleton animated className={`${css.skelBubble} ${css.skelBubbleAi}` as string} />
      <Skeleton animated className={`${css.skelBubble} ${css.skelBubbleAi} ${css.skelBubbleWide}` as string} />
      <Skeleton animated className={`${css.skelBubble} ${css.skelBubbleUser}` as string} />
    </div>
  )
}
