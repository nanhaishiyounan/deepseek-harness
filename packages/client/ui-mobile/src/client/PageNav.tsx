/**
 * The shared secondary-page header: the 52px antd-mobile NavBar with the one
 * back affordance — `backIcon` + `onBack`, never a hand-rolled `left`-slot
 * button (antd renders its default back area whenever `back !== null`, so a
 * `left` button duplicates the arrow). The back affordance itself is a real
 * button with aria-label 返回 riding the 44px touch target; antd-mobile
 * hardcodes role='button' on its left container without an accessible name and
 * offers no prop to override that, so the container stays a redundant
 * anonymous role around the labeled button.
 */

import type { JSX, ReactNode } from 'react'
import { NavBar } from 'antd-mobile'
import { ChevronLeft } from 'lucide-react'
import css from './page-nav.module.css'

/** PageNav props: the title node, the back action, the optional right slot. */
export interface PageNavProps {
  /** The center title: plain text, or the chat header's composite node. */
  readonly title: ReactNode
  /** The back action (`goBackOr` at call sites). */
  readonly onBack: () => void
  /** The right slot (page-level actions). */
  readonly right?: ReactNode
}

/**
 * Render the page header with the single back affordance.
 * @param props - title, back action, optional right slot.
 * @returns the NavBar tree.
 */
export function PageNav({ title, onBack, right }: PageNavProps): JSX.Element {
  return (
    <NavBar
      className={css.pageNav as string}
      back=""
      backIcon={(
        <button type="button" aria-label="返回" className={css.backHit}>
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
      )}
      onBack={onBack}
      right={right}
    >
      {/* Every secondary page's title is the page's one h1 (W8-B2); the
       * metrics keep the old span face, so the tree only gains semantics. */}
      <h1 className={css.pageTitle}>{title}</h1>
    </NavBar>
  )
}
