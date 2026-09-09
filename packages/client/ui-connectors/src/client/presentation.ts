/**
 * Pure presentation helpers for the connector page: the human-facing
 * provider label. No state, no IO.
 * @module @deepseek-ai/dsh-client-ui-connectors/client/presentation
 */

/**
 * The human-facing label for a provider id. Known ids map to business names;
 * an unknown id stays as-is (it is user-facing copy from that provider's own
 * registration, not an internal path).
 * @param providerId - the connector seam's provider id.
 * @returns the business-facing label.
 */
export function providerLabelOf(providerId: string): string {
  if (providerId === 'connector-nocobase') return 'NocoBase 业务后台'
  if (providerId === 'connector-file') return '文件投递目录'
  return providerId
}
