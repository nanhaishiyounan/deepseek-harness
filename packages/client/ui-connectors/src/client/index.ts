/**
 * Connector-page surface plugin, browser half: the sidebar first-class entry
 * and the `connectors` conversation view tab (provider catalog with
 * availability, per-provider delivery aggregates, the delivery timeline, and
 * the conversation-handoff connect guidance). All data rides the
 * connection's `api.connectors` face; a deployment without the domain shows
 * the structured refusal inline.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-slots SlotMap merges (every seat this plugin rides).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-sidebar slot declaration the entry rides.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the ui-conversation slot declarations (view ring, header actions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {
  ConnectorConnectionRow, ConnectorProviderRow, ConnectorTransferRow,
} from './connectorTypes.ts'
import { createConnectorClientStore } from './connectorStore.ts'
import { createConnectorsViewBridge } from './connectorsBridge.ts'
import { ConnectorsEntry } from './ConnectorsEntry.tsx'
import { ConnectorsHeaderButton } from './ConnectorsHeaderButton.tsx'
import { ConnectorsView } from './ConnectorsView.tsx'
import { en, zh } from './locales.ts'
import type { ConnectorsKey } from './locales.ts'

export type { ConnectorsEntryInjected, ConnectorsEntryProps } from './ConnectorsEntry.tsx'
export type { ConnectorsHeaderButtonInjected, ConnectorsHeaderButtonProps } from './ConnectorsHeaderButton.tsx'
export type { ConnectorsViewInjected, ConnectorsViewProps } from './ConnectorsView.tsx'
export type { ConnectorsViewBridge } from './connectorsBridge.ts'
export type {
  ConnectorCache, ConnectorClientState, ConnectorClientStore,
} from './connectorStore.ts'
export type {
  ConnectorConnectionRow, ConnectorProviderRow, ConnectorTransferRow,
} from './connectorTypes.ts'
export { providerLabelOf } from './presentation.ts'
export type { ConnectorsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The connector page's copy. */
    connectors: ConnectorsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'connectors'

/** Required services: the slot registry, the locale dictionaries, and the connection's api face. */
export const inject = ['slots', 'locale', 'connection']

/** Unwrap a unary response or rethrow its error text (the inline failure path). */
function unwrap<T>(response: { result: { ok: true; value: T } | { ok: false; error: { message: string } } }): T {
  if (response.result.ok) return response.result.value
  throw new Error(response.result.error.message)
}

/** Failure text for any thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Client plugin body: register the dictionaries and the page's seats over one
 * shared client-session store and one view bridge.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-connectors: dictionaries')
  const api = (ctx.get('connection') as ConnectionHandle).api
  const store = createConnectorClientStore()
  const bridge = createConnectorsViewBridge()
  const bound = ctx.locale.bind(NS)

  /** Load or reload the shared caches (each load is a no-op while one is in flight). */
  const refresh = (): void => {
    const snapshot = store.store.getSnapshot()
    if (snapshot.providers?.status !== 'loading') {
      store.beginProviders()
      api.connectors.list({}).then((response) => {
        store.setProviders(unwrap<{ providers: readonly ConnectorProviderRow[] }>(response).providers)
      }).catch((error: unknown) => {
        store.failProviders(messageOf(error))
      })
    }
    if (snapshot.connections?.status !== 'loading') {
      store.beginDelivery()
      Promise.all([
        api.connectors.connections({}),
        api.connectors.transfers({}),
      ]).then(([connectionsResponse, transfersResponse]) => {
        store.setDelivery(
          unwrap<{ connections: readonly ConnectorConnectionRow[] }>(connectionsResponse).connections,
          unwrap<{ transfers: readonly ConnectorTransferRow[] }>(transfersResponse).transfers,
        )
      }).catch((error: unknown) => {
        store.failDelivery(messageOf(error))
      })
    }
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'connectors',
    order: 7,
    locale: NS,
    inject: () => ({
      hooks: { connectors: store.store },
      refresh,
      requestConnectorsView: () => { bridge.request('connectors') },
    }),
  }, ConnectorsEntry))

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'connectors',
    order: 12,
    locale: NS,
    label: () => bound('view.connectors'),
    inject: () => ({
      hooks: { connectors: store.store },
      refresh,
      requestView: (view: string) => { bridge.request(view) },
    }),
  }, ConnectorsView))

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'connectors',
    order: 12,
    locale: NS,
    inject: () => ({
      hooks: { connectors: store.store },
      publishViewSwitch: (setView: (view: string) => void) => bridge.provide(setView),
    }),
  }, ConnectorsHeaderButton))
}
