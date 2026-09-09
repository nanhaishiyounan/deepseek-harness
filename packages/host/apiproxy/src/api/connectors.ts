/**
 * connectors domain contract: the connector page's read surface — the
 * provider catalog (the seam's registry with live availability) and the
 * delivery trail (the lakehouse catalog's transfer records, aggregated per
 * provider for connection rows and listed raw for the run timeline). Read-only;
 * `connectors.list` fails with the structured `connectors-not-composed` error
 * when no connector capability is composed or `connectorsEnabled` has not
 * opted the domain in; a deployment without the lakehouse seam answers the
 * transfer reads with empty lists (the documented catalog-only degradation).
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** Closed provider-capability vocabulary on the wire. */
export type ConnectorCapabilityView = 'discover' | 'fetch' | 'transfer'

/** One registered provider as the wire projects it (the catalog card). */
export interface ConnectorProviderWireView {
  readonly id: string
  /** Live local usability (credential presence) — an unavailable card explains itself inline. */
  readonly available: boolean
  readonly capabilities: readonly ConnectorCapabilityView[]
}

/** One provider's delivery aggregate (the connection row). */
export interface ConnectorConnectionView {
  readonly provider_id: string
  /** Transfer records recorded for the provider. */
  readonly transfers: number
  /** Rows landed across those transfers. */
  readonly rows: number
  /** ISO-8601 timestamp of the newest transfer, when one exists. */
  readonly last_transfer_at?: string
}

/** One delivery-trail record as the wire projects it (the timeline row). */
export interface ConnectorTransferWireView {
  readonly transfer_id: number
  /** Source provider id. */
  readonly source: string
  /** Destination the dataset landed in. */
  readonly destination: 'kb' | 'lakehouse'
  readonly dataset_id: string
  readonly rows: number
  /** ISO-8601 completion timestamp. */
  readonly transferred_at: string
}

/** Connector-page methods. */
export interface ConnectorsApi {
  /** List the provider catalog with live availability. */
  list(
    request: RpcRequest<Record<string, never>>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ providers: readonly ConnectorProviderWireView[] }>>

  /**
   * Read per-provider delivery aggregates, newest activity first; providers
   * without records stay absent (the wizard guidance owns them).
   */
  connections(
    request: RpcRequest<Record<string, never>>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ connections: readonly ConnectorConnectionView[] }>>

  /** Read the delivery trail (newest first, capped). */
  transfers(
    request: RpcRequest<Record<string, never>>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ transfers: readonly ConnectorTransferWireView[] }>>
}
