/**
 * The knowledge-base settings section: the settings panel's `kb` page, one
 * registration of the shared usage card (the same component the workbench's
 * usage zone renders) over the shared client-session stats cache. The
 * empty-state guidance closes the panel — from settings, "go ask in chat"
 * means leaving settings, which is the one shell affordance the owner passes.
 * @module @deepseek-ai/dsh-client-ui-kb/client/KbSettingsSection
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-settings slot declaration the section rides.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { KbClientState } from './kbStore.ts'
import { KbUsageCard } from './workbench/KbUsageCard.tsx'

/** Registration-side business face for the settings section. */
export interface KbSettingsSectionInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useKb. */
    kb: SnapshotStore<KbClientState>
  }
  /** Load or reload the shared stats cache. */
  refresh: () => void
}

/** Full component props: the section owner share plus the inject face and locale seat. */
export type KbSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'kb'>
  & InjectFace<KbSettingsSectionInjected>

/**
 * Render the knowledge-base settings page.
 * @param props - the shell's close affordance plus the shared store hook.
 * @returns the usage card as the section body.
 */
export function KbSettingsSection({ close, useKb, refresh, t }: KbSettingsSectionProps): JSX.Element {
  const state = useKb(snapshot => snapshot)

  useEffect(() => {
    if (state.stats === undefined) refresh()
  }, [state.stats, refresh])

  return <KbUsageCard t={t} state={state} refresh={refresh} requestChatView={close} />
}
