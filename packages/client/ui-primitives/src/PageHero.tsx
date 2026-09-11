// PageHero: the shared view-tab page header — eyebrow label, title, tagline,
// a meta row (counters/chips), and a trailing content slot. One component so
// the six view tabs cannot drift apart in type scale or spacing again.

import type { JSX, ReactNode } from 'react'
import clsx from 'clsx'
import css from './PageHero.module.css'

/**
 * Render the view-tab page header.
 * @param props.title - the page title (an `h2`; the tab strip owns the `h1`).
 * @param props.eyebrow - small-caps label above the title (page role/domain).
 * @param props.tagline - one-line description under the title.
 * @param props.meta - counters or chips row under the tagline.
 * @param props.children - trailing content slot (featured rail, call-outs).
 * @param props.className - extra class for layout placement.
 * @returns the page-header section.
 */
export function PageHero({ title, eyebrow, tagline, meta, children, className }: {
  title: string
  eyebrow?: string | undefined
  tagline?: string | undefined
  meta?: ReactNode | undefined
  children?: ReactNode | undefined
  className?: string | undefined
}): JSX.Element {
  return (
    <section className={clsx(css.pageHero, className)}>
      {eyebrow !== undefined && <p className={css.eyebrow}>{eyebrow}</p>}
      <h2 className={css.title}>{title}</h2>
      {tagline !== undefined && <p className={css.tagline}>{tagline}</p>}
      {meta !== undefined && <div className={css.meta}>{meta}</div>}
      {children}
    </section>
  )
}
