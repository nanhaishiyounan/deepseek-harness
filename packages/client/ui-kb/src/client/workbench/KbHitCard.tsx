/**
 * One numbered retrieval result card: citation badge, business-language source
 * line (document label — heading path, full path on hover), highlighted
 * passage with a four-line clamp and expand toggle, and the carry-to-chat
 * action. Pure presentation — every fact arrives as props.
 * @module @deepseek-ai/dsh-client-ui-kb/client/workbench/KbHitCard
 */

import { useState } from 'react'
import type { JSX } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { KbHitState } from '../KbTypes.ts'
import { documentLabelOf, highlightSegments } from './source.ts'
import css from './workbench.module.css'

/** Props of one hit card. */
export interface KbHitCardProps extends PropsLocale<'kb'> {
  /** 1-based citation number shown in the badge. */
  readonly index: number
  /** The retrieval hit. */
  readonly hit: KbHitState
  /** The raw query terms driving the highlight. */
  readonly terms: readonly string[]
  /** Carry the source into the conversation draft. */
  readonly onCarryToChat: () => void
}

/**
 * Render one result card.
 * @param props - see {@link KbHitCardProps}.
 * @returns the card element.
 */
export function KbHitCard({ index, hit, terms, onCarryToChat, t }: KbHitCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const label = documentLabelOf(hit.source_path)
  const segments = highlightSegments(hit.content, terms)
  return (
    <article className={css.hit}>
      <header className={css.hitHead}>
        <span className={css.hitBadge}>[{index}]</span>
        <span className={css.hitSource} title={hit.source_path}>
          {label}
          {hit.heading_path === undefined ? '' : ` — ${hit.heading_path}`}
        </span>
        {hit.score === undefined ? null : <span className={css.hitScore}>score {hit.score.toFixed(3)}</span>}
        <Button variant="ghost" size="sm" className={css.hitCarry} onClick={onCarryToChat}>
          {t('result.carryToChat')}
        </Button>
      </header>
      <p className={expanded ? css.hitPassage : css.hitPassageClamped}>
        {segments.map((segment, at) =>
          segment.mark
            ? <mark key={at} className={css.hitMark}>{segment.text}</mark>
            : <span key={at}>{segment.text}</span>)}
      </p>
      <button type="button" className={css.hitToggle} onClick={() => { setExpanded(open => !open) }}>
        {expanded ? t('result.collapse') : t('result.expand')}
      </button>
    </article>
  )
}
