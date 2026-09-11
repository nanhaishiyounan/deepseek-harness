// ErrorStrip: the shared structured failure row — warning glyph, the failure
// message, and an action slot (the retry button). One component so the six
// view tabs present load failures identically in both themes.

import type { JSX, ReactNode } from 'react'
import clsx from 'clsx'
import { IconWarningOutline16 } from './icons/index.tsx'
import css from './ErrorStrip.module.css'

/**
 * Render the shared failure strip.
 * @param props.message - the failure text (context prefix plus the error).
 * @param props.action - trailing action slot (usually the retry button).
 * @param props.className - extra class for layout placement.
 * @returns the alert row.
 */
export function ErrorStrip({ message, action, className }: {
  message: ReactNode
  action?: ReactNode | undefined
  className?: string | undefined
}): JSX.Element {
  return (
    <div className={clsx(css.errorStrip, className)} role="alert">
      <IconWarningOutline16 className={css.icon} />
      <span className={css.message}>{message}</span>
      {action !== undefined && <span className={css.action}>{action}</span>}
    </div>
  )
}
