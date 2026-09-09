/**
 * The file-set connector provider: one local directory of data files exposed
 * as `file`-kind datasets. Discovery lists the router-admitted extensions
 * flat (no recursion); fetch reads one file's bytes with a traversal-proof
 * id check. Classification stays with the seam — the provider hands over raw
 * bytes and the shared data router decides kb or lakehouse at transfer time.
 * @module @deepseek-ai/dsh-connector-file/provider
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ConnectorError } from '@deepseek-ai/dsh-connector'
import type { ConnectorDataset, ConnectorDatasetRef, ConnectorDatasetSummary, ConnectorDiscoverRequest, ConnectorProvider } from '@deepseek-ai/dsh-connector'

/** Provider id, also the lakehouse provenance namespace (`connector:connector-file`). */
export const FILE_PROVIDER_ID = 'connector-file'

/** Every extension the shared data router admits — the provider's discovery whitelist. */
const ROUTED_EXTENSIONS = ['.csv', '.xlsx', '.json', '.md', '.txt', '.pdf', '.docx']

/** A dataset id must be one plain file name — no separators, no parent segments. */
const PLAIN_FILENAME = /^[^\\/:]+$/u

/**
 * The file-set provider. `available()` is a constant `true`: the root's
 * existence was proven at plugin load (fail-loud composition), so no I/O
 * happens in the usability check.
 */
export class FileConnectorProvider implements ConnectorProvider {
  readonly id = FILE_PROVIDER_ID
  readonly capabilities = ['discover', 'fetch'] as const
  private readonly root: string
  private readonly maxFileBytes: number

  constructor(root: string, maxFileBytes: number) {
    this.root = resolve(root)
    this.maxFileBytes = maxFileBytes
  }

  available(): boolean {
    return true
  }

  /**
   * List the directory's router-admitted files, newest first, matching the
   * request's query against file names and honoring the kind restriction
   * (every dataset here is `file` kind).
   * @param request - query text and optional kind restriction.
   * @param signal - cancellation signal.
   */
  async discover(request: ConnectorDiscoverRequest, signal?: AbortSignal): Promise<readonly ConnectorDatasetSummary[]> {
    if (request.kinds !== undefined && !request.kinds.includes('file')) return []
    const entries = await readdir(this.root, { withFileTypes: true })
    const summaries: ConnectorDatasetSummary[] = []
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile()) continue
      if (!ROUTED_EXTENSIONS.some(extension => entry.name.toLowerCase().endsWith(extension))) continue
      if (request.query !== undefined && !entry.name.toLowerCase().includes(request.query.toLowerCase())) continue
      const info = await stat(join(this.root, entry.name))
      summaries.push({
        id: entry.name,
        title: entry.name,
        kind: 'file',
        manifest: { providerId: this.id, updatedAt: info.mtime.toISOString() },
      })
      signal?.throwIfAborted()
    }
    return summaries
  }

  /**
   * Read one file's bytes. The id must be a plain file name inside the root —
   * anything carrying separators refuses before any filesystem work.
   * @param ref - the dataset address; `providerId` must name this provider.
   * @param signal - cancellation signal.
   */
  async fetch(ref: ConnectorDatasetRef, _signal?: AbortSignal): Promise<ConnectorDataset> {
    if (!PLAIN_FILENAME.test(ref.datasetId)) {
      throw new ConnectorError(
        `dataset id "${ref.datasetId}" is not a plain file name (no directory segments)`,
        'CONNECTOR_DATASET_MISSING',
      )
    }
    const path = join(this.root, ref.datasetId)
    let bytes: Uint8Array
    try {
      bytes = await readFile(path)
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code
      /* v8 ignore next 4 -- only ENOENT/EISDIR reach here in practice; any
         other errno rethrows untouched for the operator. */
      if (code !== 'ENOENT' && code !== 'EISDIR') throw error
      throw new ConnectorError(`file "${ref.datasetId}" is not in the connector root`, 'CONNECTOR_DATASET_MISSING')
    }
    if (bytes.byteLength > this.maxFileBytes) {
      throw new ConnectorError(
        `file "${ref.datasetId}" is ${bytes.byteLength} bytes; this provider caps fetches at ${this.maxFileBytes}`,
        'CONNECTOR_FILE_TOO_LARGE',
      )
    }
    return {
      kind: 'file',
      id: ref.datasetId,
      title: ref.datasetId,
      manifest: { providerId: this.id },
      file: { filename: ref.datasetId, bytes },
    }
  }
}
