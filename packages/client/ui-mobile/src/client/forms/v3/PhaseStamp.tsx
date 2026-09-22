/**
 * The phase stamp: the 44px circular lifecycle seal every v3 form card
 * carries (draft=待确认 / pending=提交中 / submitted=已登记 / rejected=已驳回),
 * the v3 signature element. The submitted seal embeds the landing row number
 * in the ticket monospace face; the pending seal breathes with DotLoading.
 */

import type { JSX } from 'react'
import { DotLoading } from 'antd-mobile'
import type { CardPhase } from '../../cardState.ts'
import css from './v3.module.css'

/** Phase-stamp props: the phase and the landing row id (submitted). */
export interface PhaseStampProps {
  readonly phase: CardPhase
  /** The landing-row number the submitted stamp shows. */
  readonly rowId?: string
}

/** The stamp copy per phase. */
const STAMP_TEXT: Readonly<Record<CardPhase, string>> = {
  draft: '待确认',
  pending: '提交中',
  submitted: '已登记',
  rejected: '已驳回',
}

/**
 * The phase stamp seal.
 * @param props - the phase and optional row id.
 * @returns the stamp element.
 */
export function PhaseStamp({ phase, rowId }: PhaseStampProps): JSX.Element {
  return (
    <span className={`${css.stamp} ${css[`stamp_${phase}`]}`} data-phase={phase} data-testid="phase-stamp">
      {phase === 'submitted' && rowId !== undefined
        ? (
          <>
            <span className={css.stampNo}>№</span>
            <span className={css.stampRow}>{rowId}</span>
          </>
        )
        : (
          <>
            {STAMP_TEXT[phase]}
            {phase === 'pending' && <DotLoading color="currentColor" />}
          </>
        )}
    </span>
  )
}
