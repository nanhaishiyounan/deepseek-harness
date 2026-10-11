/**
 * The main nav's governance menu row: a shield icon (wide row shows the
 * label too; the collapsed rail shows the icon alone). The click rides the
 * seat's shared activation channel; the active mark follows the resolved
 * navigation screen.
 * @module @deepseek-ai/dsh-client-ui-governance/client/GovernanceEntry
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { IconCodeOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import clsx from 'clsx'
import type { GovernanceClientState } from './governanceStore.ts'
import css from './entry.module.css'

/** The conversation view id this row activates. */
const GOVERNANCE_VIEW = 'governance'

/** Registration-side business face for the nav menu row. */
export interface GovernanceEntryInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useGovernance. */
    governance: SnapshotStore<GovernanceClientState>
  }
  /** Load or reload the shared inventory cache. */
  refresh: () => void
}

/** Full component props: the sidebar.nav owner share plus the inject face and locale seat. */
export type GovernanceEntryProps =
  PropsRuntime<'sidebar.nav'>
  & PropsLocale<'governance'>
  & InjectFace<GovernanceEntryInjected>

/**
 * Render the nav menu row.
 * @param props - the nav column state, the shared store hook, and the seat's activation machinery.
 * @returns the menu row (icon + label, or the rail icon).
 */
export function GovernanceEntry({ wide, useNavState, activate, useGovernance, refresh, t }: GovernanceEntryProps): JSX.Element {
  const state = useGovernance(snapshot => snapshot)
  const active = useNavState(nav => nav.screen?.view === GOVERNANCE_VIEW)

  useEffect(() => {
    if (state.assets === undefined) refresh()
  }, [state.assets, refresh])

  return (
    <Tooltip label={t('view.governance')} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={clsx(css.item, !wide && css.rail)}
        data-active={active || undefined}
        aria-current={active ? 'page' : undefined}
        aria-label={t('view.governance')}
        onClick={() => { activate(GOVERNANCE_VIEW) }}
      >
        <IconCodeOutline16 size={16} />
        {wide && <span className={css.label}>{t('view.governance')}</span>}
      </button>
    </Tooltip>
  )
}
