/**
 * Wire-contract mirrors the connector page renders: the `connectors.list` /
 * `connectors.connections` / `connectors.transfers` rows as the gateway
 * returns them. Snake_case on purpose — these are the wire's own field names.
 * @module @deepseek-ai/dsh-client-ui-connectors/client/connectorTypes
 */

/** One provider catalog card row. */
export interface ConnectorProviderRow {
  readonly id: string
  readonly available: boolean
  readonly capabilities: readonly ('discover' | 'fetch' | 'transfer')[]
}

/** One provider's delivery aggregate (the connection row). */
export interface ConnectorConnectionRow {
  readonly provider_id: string
  readonly transfers: number
  readonly rows: number
  readonly last_transfer_at?: string
}

/** One delivery-trail record (the timeline row). */
export interface ConnectorTransferRow {
  readonly transfer_id: number
  readonly source: string
  readonly destination: 'kb' | 'lakehouse'
  readonly dataset_id: string
  readonly rows: number
  readonly transferred_at: string
}
