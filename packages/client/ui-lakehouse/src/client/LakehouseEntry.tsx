/**
 * The main nav's lakehouse menu row: a database icon with the table-count
 * badge (wide row shows the label too; the collapsed rail shows the icon
 * alone). The click rides the seat's shared activation channel; the active
 * mark follows the resolved navigation screen.
 * @module @deepseek-ai/dsh-client-ui-lakehouse/client/LakehouseEntry
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { IconCodeOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import clsx from 'clsx'
import type { LakehouseClientState } from './lakehouseStore.ts'
import css from './entry.module.css'

/** The conversation view id this row activates. */
const LAKEHOUSE_VIEW = 'lakehouse'

/** Registration-side business face for the nav menu row. */
export interface LakehouseEntryInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useLakehouse. */
    lakehouse: SnapshotStore<LakehouseClientState>
  }
  /** Load or reload the shared catalog cache. */
  refresh: () => void
}

/** Full component props: the sidebar.nav owner share plus the inject face and locale seat. */
export type LakehouseEntryProps =
  PropsRuntime<'sidebar.nav'>
  & PropsLocale<'lakehouse'>
  & InjectFace<LakehouseEntryInjected>

/**
 * Render the nav menu row.
 * @param props - the nav column state, the shared store hook, and the seat's activation machinery.
 * @returns the menu row (icon + label + badge, or the rail icon).
 */
export function LakehouseEntry({ wide, useNavState, activate, useLakehouse, refresh, t }: LakehouseEntryProps): JSX.Element {
  const state = useLakehouse(snapshot => snapshot)
  const active = useNavState(nav => nav.screen?.view === LAKEHOUSE_VIEW)

  useEffect(() => {
    if (state.tables === undefined) refresh()
  }, [state.tables, refresh])

  const tables = state.tables
  const badge = tables === undefined || tables.status === 'loading'
    ? undefined
    : tables.status === 'error'
      ? '?'
      : String(tables.value.length)

  return (
    <Tooltip label={t('view.lakehouse')} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={clsx(css.item, !wide && css.rail)}
        data-active={active || undefined}
        aria-current={active ? 'page' : undefined}
        aria-label={t('view.lakehouse')}
        onClick={() => { activate(LAKEHOUSE_VIEW) }}
      >
        <IconCodeOutline16 size={16} />
        {wide && <span className={css.label}>{t('entry.label')}</span>}
        {badge !== undefined && <span className={css.badge}>{badge}</span>}
      </button>
    </Tooltip>
  )
}
