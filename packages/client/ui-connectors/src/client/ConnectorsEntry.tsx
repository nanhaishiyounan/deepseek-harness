/**
 * The sidebar's connector-page entry: a link icon with the provider-count
 * badge (wide row shows the label too; the collapsed rail shows the icon
 * alone). The click dispatches on the session state — any session, blank
 * included, asks the view bridge to switch to the connectors tab, while no
 * session at all just refreshes the caches.
 * @module @deepseek-ai/dsh-client-ui-connectors/client/ConnectorsEntry
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { IconLinkOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConnectorClientState } from './connectorStore.ts'
import css from './entry.module.css'

/** Registration-side business face for the sidebar entry. */
export interface ConnectorsEntryInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useConnectors. */
    connectors: SnapshotStore<ConnectorClientState>
  }
  /** Load or reload the shared caches. */
  refresh: () => void
  /** Best-effort switch to the connectors view tab. */
  requestConnectorsView: () => void
}

/** Full component props: the footer-action owner share plus the inject face and locale seat. */
export type ConnectorsEntryProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'connectors'>
  & InjectFace<ConnectorsEntryInjected>

/**
 * Render the sidebar entry.
 * @param props - the sidebar column state, the shared store hook, and the actions.
 * @returns the entry row (icon + label + badge, or the rail icon).
 */
export function ConnectorsEntry(
  { wide, useSessions, useConnectors, refresh, requestConnectorsView, t }: ConnectorsEntryProps,
): JSX.Element {
  const state = useConnectors(snapshot => snapshot)
  // No session at all leaves the page unreachable through a view ring; every
  // session — blank or active — owns its ring.
  const noSession = useSessions(snapshot => snapshot.current === undefined)

  useEffect(() => {
    if (state.providers === undefined) refresh()
  }, [state.providers, refresh])

  const providers = state.providers
  const badge = providers === undefined || providers.status === 'loading'
    ? undefined
    : providers.status === 'error'
      ? '?'
      : String(providers.value.length)

  return (
    <button
      type="button"
      className={css.entry}
      aria-label={t('entry.providersBadge')}
      onClick={() => {
        if (noSession) refresh()
        else requestConnectorsView()
      }}
    >
      <IconLinkOutline16 size={16} />
      {wide && <span className={css.label}>{t('entry.label')}</span>}
      {badge !== undefined && <span className={css.badge}>{badge}</span>}
    </button>
  )
}
