// EmptyState: the shared empty/unbuilt placeholder — icon glyph in a tinted
// squircle, primary line, hint line, and an action slot. Replaces the six
// tabs' two-line-text placeholders.

import type { JSX, ReactNode } from 'react'
import clsx from 'clsx'
import css from './EmptyState.module.css'

/**
 * Render the shared empty-state placeholder.
 * @param props.title - the primary line (what is empty).
 * @param props.hint - the secondary line (why, or what to do next).
 * @param props.icon - line-icon glyph (an ic_ds_* icon element, 14–16px).
 * @param props.children - action slot (buttons/links rendered under the hint).
 * @param props.className - extra class for layout placement.
 * @returns the empty-state section.
 */
export function EmptyState({ title, hint, icon, children, className }: {
  title: string
  hint?: string | undefined
  icon?: ReactNode | undefined
  children?: ReactNode | undefined
  className?: string | undefined
}): JSX.Element {
  return (
    <section className={clsx(css.emptyState, className)}>
      {icon !== undefined && <span className={css.iconBox} aria-hidden="true">{icon}</span>}
      <p className={css.title}>{title}</p>
      {hint !== undefined && <p className={css.hint}>{hint}</p>}
      {children !== undefined && <div className={css.actions}>{children}</div>}
    </section>
  )
}
