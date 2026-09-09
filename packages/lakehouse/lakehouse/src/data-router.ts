/**
 * The single upload-routing discriminator shared by the apiproxy `data`
 * domain and (from N3 on) the connector transfer pipeline: classify one
 * uploaded file as a lakehouse load (csv/xlsx/json) or a kb document
 * (md/txt/pdf/docx) from its file name, declared mime type, and magic
 * number. Pure and synchronous, so both call sites share one routing truth.
 * @module @deepseek-ai/dsh-lakehouse/data-router
 */

/** Structured formats the lakehouse load path accepts today. */
export type LakehouseLoadFormat = 'csv' | 'xlsx' | 'json'

/** One classification outcome. */
export interface DataRoute {
  /** Where the file lands: the lakehouse load path or the kb ingest path. */
  readonly destination: 'kb' | 'lakehouse'
  /** The structured format, present on every lakehouse route. */
  readonly format?: LakehouseLoadFormat
  /** The lowercased document extension, present on every kb route. */
  readonly extension?: string
}

/** Why a classification refused the file. */
export type DataRouteRefusal = 'unsupported-type' | 'type-mismatch' | 'empty-file'

/**
 * A loud classification refusal carrying the machine-routable reason. The
 * message names the supported set for `unsupported-type` so the caller can
 * surface it verbatim.
 */
export class DataRouterError extends Error {
  constructor(message: string, readonly reason: DataRouteRefusal, readonly filename: string) {
    super(message)
    this.name = 'DataRouterError'
  }
}

/** Extension → lakehouse format. */
const STRUCTURED_EXTENSIONS: Readonly<Record<string, LakehouseLoadFormat>> = {
  '.csv': 'csv',
  '.xlsx': 'xlsx',
  '.json': 'json',
}

/** Extension → kb document extension (the value restates the key). */
const DOCUMENT_EXTENSIONS: readonly string[] = ['.md', '.txt', '.pdf', '.docx']

/** Mime type → lakehouse format (the extension-less fallback). */
const STRUCTURED_MIME: Readonly<Record<string, LakehouseLoadFormat>> = {
  'text/csv': 'csv',
  'application/json': 'json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

/** Mime type → kb document extension (the extension-less fallback). */
const DOCUMENT_MIME: Readonly<Record<string, string>> = {
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
}

/** Every extension the router admits, for the refusal message. */
const SUPPORTED_EXTENSIONS = [...Object.keys(STRUCTURED_EXTENSIONS), ...DOCUMENT_EXTENSIONS]

/** The PDF leading signature. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const // %PDF-

/** The ZIP local-file-header signature shared by xlsx and docx containers. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const // PK\x03\x04

/** True when `bytes` starts with the given leading bytes. */
function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false
  return prefix.every((byte, index) => bytes[index] === byte)
}

/**
 * Reject a file whose magic number contradicts its classified kind. Csv,
 * markdown, and plain text have no magic number to check; the json array's
 * bracket is the only text-level signature worth gating (a single json
 * object has no tabular reading).
 */
function assertMagicAgrees(filename: string, bytes: Uint8Array, kind: { format?: LakehouseLoadFormat; extension?: string }): void {
  if (kind.extension === '.pdf' && !startsWith(bytes, PDF_MAGIC)) {
    throw new DataRouterError(`"${filename}" does not start with the PDF signature %PDF-`, 'type-mismatch', filename)
  }
  if ((kind.extension === '.docx' || kind.format === 'xlsx') && !startsWith(bytes, ZIP_MAGIC)) {
    throw new DataRouterError(`"${filename}" is not a ZIP container (xlsx/docx bodies must start with PK\\x03\\x04)`, 'type-mismatch', filename)
  }
  if (kind.format === 'json') {
    let index = 0
    while (index < bytes.length && (bytes[index] === 0x20 || bytes[index] === 0x09
      || bytes[index] === 0x0a || bytes[index] === 0x0d)) index += 1
    if (bytes[index] !== 0x5b) {
      throw new DataRouterError(`"${filename}" is not a JSON array of row objects (the body must start with '[')`, 'type-mismatch', filename)
    }
  }
}

/**
 * Classify one uploaded file.
 * @param filename - the sanitized upload file name; only its extension is read.
 * @param bytes - the decoded file body (non-empty).
 * @param mime - the uploader's declared content type, consulted only when the
 *   extension is missing or outside the whitelist.
 * @returns the destination and its format or document extension.
 * @throws {DataRouterError} on an empty body (`empty-file`), an unrecognized
 *   name and mime (`unsupported-type`), or a magic number contradicting the
 *   classified kind (`type-mismatch`).
 */
export function resolveDataRoute(filename: string, bytes: Uint8Array, mime?: string): DataRoute {
  if (bytes.length === 0) {
    throw new DataRouterError(`"${filename}" is empty; a routed file must carry bytes`, 'empty-file', filename)
  }
  const extension = filename.includes('.')
    ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
    : undefined
  const fromExtension = extension === undefined
    ? undefined
    : extension in STRUCTURED_EXTENSIONS
      ? { destination: 'lakehouse', format: STRUCTURED_EXTENSIONS[extension] as LakehouseLoadFormat } as const
      : DOCUMENT_EXTENSIONS.includes(extension)
        ? { destination: 'kb', extension } as const
        : undefined
  const fromMime = mime === undefined
    ? undefined
    : mime in STRUCTURED_MIME
      ? { destination: 'lakehouse', format: STRUCTURED_MIME[mime] as LakehouseLoadFormat } as const
      : mime in DOCUMENT_MIME
        ? { destination: 'kb', extension: DOCUMENT_MIME[mime] as string } as const
        : undefined
  const route: DataRoute | undefined = fromExtension ?? fromMime
  if (route === undefined) {
    throw new DataRouterError(
      `cannot route "${filename}"${mime === undefined ? '' : ` (mime ${mime})`}; supported extensions: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      'unsupported-type',
      filename,
    )
  }
  assertMagicAgrees(filename, bytes, route)
  return route
}
