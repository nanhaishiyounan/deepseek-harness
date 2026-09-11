// PageSkeleton: the shared loading placeholder — structured rows/cards that
// preview the content shape instead of one flat block, phase-opposed so
// adjacent units differ (the ui-theme skeleton keyframes).

import type { JSX } from 'react'
import clsx from 'clsx'
import css from './PageSkeleton.module.css'

/** The loading shapes the view tabs use. */
export type PageSkeletonVariant = 'list' | 'grid' | 'block'

/** Default unit count per variant. */
const DEFAULT_ROWS: Record<PageSkeletonVariant, number> = { list: 3, grid: 6, block: 1 }

/**
 * Render the shared loading skeleton.
 * @param props.variant - the content shape: stacked list rows, a card grid, or one tall block.
 * @param props.rows - unit count (default 3 list / 6 grid / 1 block).
 * @param props.className - extra class for layout placement.
 * @returns the skeleton container (aria-hidden; purely decorative).
 */
export function PageSkeleton({ variant, rows, className }: {
  variant: PageSkeletonVariant
  rows?: number | undefined
  className?: string | undefined
}): JSX.Element {
  const count = Math.max(1, rows ?? DEFAULT_ROWS[variant])
  return (
    <div className={clsx(css.skeleton, css[variant], className)} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={clsx(css.unit, index % 2 === 1 ? css.shimmer : css.pulse)}
        />
      ))}
    </div>
  )
}
