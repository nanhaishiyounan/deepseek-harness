/**
 * The main nav's scenario-portal menu row: a compass/gauge glyph with the
 * 场景门户 label (wide) or the icon alone (rail). The click rides the seat's
 * shared activation channel; the active mark follows the resolved navigation
 * screen.
 * @module @deepseek-ai/dsh-client-ui-kb/client/scenarios/ScenarioNavItem
 */

import type { JSX } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-nav/client'
import clsx from 'clsx'
import css from './scenarioNav.module.css'

/** The conversation view id this row activates. */
const SCENARIOS_VIEW = 'scenarios'

/** Full component props: the sidebar.nav owner share, the seat's common inject, and the locale seat. */
export type ScenarioNavItemProps =
  PropsRuntime<'sidebar.nav'>
  & PropsLocale<'kb'>

/** A portal glyph drawn inline — the icon seat stays dependency-free. */
function PortalGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" className={css.glyph}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 10.5 8 5.5l3 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Render the scenario-portal nav row.
 * @param props - the nav column state, the seat's activation machinery, and copy.
 * @returns the menu row (icon + label, or the rail icon).
 */
export function ScenarioNavItem({ wide, useNavState, activate, t }: ScenarioNavItemProps): JSX.Element {
  const active = useNavState(nav => nav.screen?.view === SCENARIOS_VIEW)
  return (
    <Tooltip label={t('view.scenarios')} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={clsx(css.item, !wide && css.rail)}
        data-active={active || undefined}
        aria-current={active ? 'page' : undefined}
        aria-label={t('view.scenarios')}
        onClick={() => { activate(SCENARIOS_VIEW) }}
      >
        <PortalGlyph />
        {wide && <span className={css.label}>{t('view.scenarios')}</span>}
      </button>
    </Tooltip>
  )
}
