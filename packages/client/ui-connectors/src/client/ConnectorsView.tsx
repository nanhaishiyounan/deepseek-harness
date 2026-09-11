/**
 * The connectors view tab: the provider catalog (availability badges with the
 * credentials-missing explanation), the per-provider delivery aggregates
 * (connection rows), the delivery timeline, and the AI-assisted connect
 * guidance — the "wizard" is a conversation handoff (no form): the button
 * pre-fills the composer draft and switches to the chat tab.
 * @module @deepseek-ai/dsh-client-ui-connectors/client/ConnectorsView
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  Button, EmptyState, ErrorStrip, IconLinkOutline14, PageHero, PageSkeleton,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the view seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ConnectorClientState } from './connectorStore.ts'
import { providerLabelOf } from './presentation.ts'
import css from './connectors.module.css'

/** Registration-side business face for the connectors view. */
export interface ConnectorsViewInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useConnectors. */
    connectors: SnapshotStore<ConnectorClientState>
  }
  /** Load or reload the shared caches. */
  refresh: () => void
  /** Best-effort view switch through the header bridge. */
  requestView: (view: string) => void
}

/** Full component props: the view-seat runtime share plus the inject face and locale seat. */
export type ConnectorsViewProps =
  PropsRuntime<'conversation.view'>
  & PropsLocale<'connectors'>
  & InjectFace<ConnectorsViewInjected>

/**
 * Render the connectors view tab.
 * @param props - the standard view kit plus the page's inject face.
 * @returns the connectors column.
 */
export function ConnectorsView({ inputActions, useConnectors, refresh, requestView, t }: ConnectorsViewProps): JSX.Element {
  const state = useConnectors(snapshot => snapshot)

  useEffect(() => {
    if (state.providers === undefined) refresh()
  }, [state.providers, refresh])

  const providers = state.providers
  const connections = state.connections
  const timeline = state.timeline

  /** Hand the connect request to the conversation (the AI-assisted wizard). */
  const startWizard = (): void => {
    inputActions.setDraft(t('wizard.prompt'))
    requestView('chat')
  }

  return (
    <div className={css.page}>
      {providers !== undefined && providers.status === 'error' && (
        <ErrorStrip
          message={<>{t('error.unavailable')} — {providers.error}</>}
          action={<Button variant="ghost" size="sm" onClick={refresh}>{t('error.retry')}</Button>}
        />
      )}

      <PageHero eyebrow={t('view.connectors')} title={t('page.title')} tagline={t('page.tagline')} />

      <section className={css.zone}>
        <div className={css.zoneHead}>
          <h3 className={css.zoneTitle}>{t('catalog.title')}</h3>
          <Button variant="ghost" size="sm" onClick={startWizard}>{t('catalog.connectNew')}</Button>
        </div>
        {providers === undefined || providers.status === 'loading' ? (
          <PageSkeleton variant="list" rows={3} />
        ) : providers.status === 'ready' && providers.value.length === 0 ? (
          <EmptyState title={t('catalog.noProviders')} hint={t('catalog.noProvidersHint')} icon={<IconLinkOutline14 />} />
        ) : providers.status === 'ready' && (
          <ul className={css.providerList}>
            {providers.value.map(provider => (
              <li key={provider.id} className={css.providerRow} data-available={provider.available}>
                <span className={css.providerDot} aria-hidden="true" />
                <span className={css.providerName}>{providerLabelOf(provider.id)}</span>
                <span className={provider.available ? css.stateOk : css.stateWarn}>
                  {provider.available ? t('catalog.available') : t('catalog.unavailable')}
                </span>
                {!provider.available && <span className={css.providerHint}>{t('catalog.unavailableHint')}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={css.zone}>
        <h3 className={css.zoneTitle}>{t('delivery.title')}</h3>
        {connections !== undefined && connections.status === 'ready' && connections.value.length > 0 ? (
          <ul className={css.connectionList}>
            {connections.value.map(connection => (
              <li key={connection.provider_id} className={css.connectionRow}>
                <span className={css.connectionName}>{providerLabelOf(connection.provider_id)}</span>
                <span className={css.connectionMeta}>
                  {connection.transfers} {t('delivery.transfers')} · {connection.rows} {t('delivery.rows')}
                </span>
                <span className={css.connectionMeta}>
                  {t('delivery.lastAt')} {connection.last_transfer_at?.slice(0, 16).replace('T', ' ') ?? t('delivery.never')}
                </span>
              </li>
            ))}
          </ul>
        ) : connections !== undefined && connections.status === 'error' ? (
          <ErrorStrip
            message={<>{t('error.unavailable')} — {connections.error}</>}
            action={<Button variant="ghost" size="sm" onClick={refresh}>{t('error.retry')}</Button>}
          />
        ) : connections !== undefined && connections.status === 'loading' ? (
          <PageSkeleton variant="list" rows={2} />
        ) : (
          <EmptyState title={t('delivery.empty')} hint={t('delivery.emptyHint')} />
        )}

        {timeline !== undefined && timeline.status === 'ready' && timeline.value.length > 0 && (
          <div className={css.timeline}>
            <h4 className={css.timelineTitle}>{t('timeline.title')}</h4>
            <ol className={css.timelineList}>
              {timeline.value.map(entry => (
                <li key={entry.transfer_id} className={css.timelineRow}>
                  <span className={css.timelineDot} aria-hidden="true" />
                  <span className={css.timelineMeta}>
                    {entry.transferred_at.slice(0, 16).replace('T', ' ')} · {providerLabelOf(entry.source)} · {t(`timeline.destination.${entry.destination}`)}
                  </span>
                  <span className={css.timelineDataset}>{entry.dataset_id} · {entry.rows} {t('delivery.rows')}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <section className={css.wizard}>
        <h3 className={css.zoneTitle}>{t('wizard.title')}</h3>
        <p className={css.wizardBody}>{t('wizard.body')}</p>
        <Button variant="primary" size="sm" onClick={startWizard}>{t('wizard.action')}</Button>
      </section>
    </div>
  )
}
