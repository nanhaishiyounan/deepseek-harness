/**
 * The main nav's mobile-preview menu row: a phone glyph with the 移动端预览
 * label (wide) or the icon alone (rail). The click rides the seat's shared
 * activation channel; the active mark follows the resolved navigation
 * screen.
 * @module @deepseek-ai/dsh-client-ui-mobile-preview/client/MobilePreviewNavItem
 */

import type { JSX } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-nav/client'
import clsx from 'clsx'
import css from './navItem.module.css'

/** The conversation view id this row activates. */
const MOBILE_PREVIEW_VIEW = 'mobile-preview'

/** Full component props: the sidebar.nav owner share, the seat's common inject, and the locale seat. */
export type MobilePreviewNavItemProps =
  PropsRuntime<'sidebar.nav'>
  & PropsLocale<'mobilePreview'>

/** A phone glyph drawn inline — the icon seat stays dependency-free. */
function PhoneGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" className={css.glyph}>
      <rect x="4.5" y="1.5" width="7" height="13" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <line x1="6.8" y1="12.2" x2="9.2" y2="12.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Render the mobile-preview nav row.
 * @param props - the nav column state, the seat's activation machinery, and copy.
 * @returns the menu row (icon + label, or the rail icon).
 */
export function MobilePreviewNavItem(
  { wide, useNavState, activate, t }: MobilePreviewNavItemProps,
): JSX.Element {
  const active = useNavState(nav => nav.screen?.view === MOBILE_PREVIEW_VIEW)
  return (
    <Tooltip label={t('view.label')} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={clsx(css.item, !wide && css.rail)}
        data-active={active || undefined}
        aria-current={active ? 'page' : undefined}
        aria-label={t('view.label')}
        onClick={() => { activate(MOBILE_PREVIEW_VIEW) }}
      >
        <PhoneGlyph />
        {wide && <span className={css.label}>{t('view.label')}</span>}
      </button>
    </Tooltip>
  )
}
