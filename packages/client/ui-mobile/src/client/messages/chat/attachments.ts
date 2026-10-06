/**
 * The composer's attachment lane (W11-B2): the draft-attachment model and the
 * pick-to-quote pipeline. An image pick compresses in-page, uploads through
 * `data.describeImage` (the server admits it durably and answers a VLM
 * description), and lands as a ready chip whose quote block carries the
 * description; a pdf/md/txt pick goes through `data.extractText` and quotes
 * the extracted text. The quote block is the only thing that ever reaches
 * the message — `send(text)` keeps its plain-text contract, and the user can
 * see and delete the whole citation before it goes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Toast } from 'antd-mobile'
import { rpc } from '../../rpc.ts'
import { uid } from '../../uid.ts'

/** The composer's draft-attachment row (the chip strip above the input row). */
export interface DraftAttachment {
  readonly id: string
  /** `image` picks rode the describe lane; `doc` picks the extract lane. */
  readonly kind: 'image' | 'doc'
  readonly name: string
  readonly sizeBytes: number
  /** The in-page preview URL (images only), revoked on removal. */
  readonly thumbUrl: string | undefined
  readonly status: 'uploading' | 'ready' | 'failed'
  /** The full quote block spliced into the sent text (ready only). */
  readonly quote: string | undefined
  /** The failure's human sentence (failed only). */
  readonly error: string | undefined
}

/** The wire media types the describe lane accepts. */
const IMAGE_MEDIA = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** Prefix of one session's persisted ready-attachment strip (W11-R1). */
const PERSIST_PREFIX = 'dsh-mobile-attachments-'

/** The extensions the extract lane accepts (the picker filters the same set). */
export const DOC_ACCEPT = '.pdf,.md,.txt'

/** The image accept string the camera and album pickers filter on. */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

/** Per-draft image cap: the composer strip's own bound (the server admits 20 per message). */
const MAX_IMAGES = 6

/** Uploads above this pass through canvas re-encoding; smaller ones ship verbatim. */
const REENCODE_THRESHOLD_BYTES = 2 * 1024 * 1024

/** The longest side a re-encoded image is normalized to. */
const REENCODE_MAX_EDGE = 2048

/** The error messages by gateway code; anything else surfaces verbatim. */
const FAILURE_HINTS: Readonly<Record<string, string>> = {
  'data-vision-disabled': '管理员未开启图片识别通道',
  'data-vision-unavailable': '服务端未配置视觉模型密钥',
  'data-vision-failed': '图片识别失败，请重试',
  'data-extract-unsupported': '仅支持 PDF、Markdown、TXT 文件',
  'data-extract-failed': '未能提取文本（扫描件可能没有文字层）',
  'attachment-error': '图片校验未通过（格式或大小超限）',
  'data-upload-too-large': '文件超过大小限制',
}

/** One human sentence for a gateway refusal. */
function hintOf(code: string | undefined, message: string): string {
  if (code !== undefined && FAILURE_HINTS[code] !== undefined) return FAILURE_HINTS[code]
  return message
}

/** Read one blob as canonical base64 (no data-url prefix; the wire wants bare). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // readAsDataURL always completes with a data-url string.
      const result = reader.result
      if (typeof result !== 'string') { reject(new Error('read failed')); return }
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => { reject(reader.error ?? new Error('read failed')) }
    reader.readAsDataURL(blob)
  })
}

/**
 * Re-encode one oversized image through the canvas: the longest side clamps
 * to 2048px at jpeg quality 0.85 — small enough for the wire, sharp enough
 * for a VLM to read ticket text.
 * @returns the re-encoded blob, or the original when the browser cannot
 * decode it (letting the server's admission give the loud verdict).
 */
async function reencodeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => undefined)
  if (bitmap === undefined) return file
  try {
    const scale = Math.min(1, REENCODE_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
    return await new Promise<Blob>((resolve) => { canvas.toBlob((blob) => { resolve(blob ?? file) }, 'image/jpeg', 0.85) })
  } finally {
    bitmap.close()
  }
}

/** The quote block one ready attachment contributes to the sent text. */
function quoteOf(kind: 'image' | 'doc', name: string, body: string, truncated: boolean): string {
  const tag = kind === 'image' ? '图片内容' : '文件内容'
  return `📎 ${name}\n【${tag}】${body}${truncated ? '\n（原文过长，已截断）' : ''}`
}

/** The persisted ready-row descriptor: the quote rides along — it is the only
 * recoverable form of the content once the page let go of the File. */
interface PersistedRow {
  readonly id: string
  readonly kind: 'image' | 'doc'
  readonly name: string
  readonly sizeBytes: number
  readonly quote: string
}

/** The persisted strip's storage shape. `savedAt` ranks eviction (W11-R2). */
interface PersistedShape {
  readonly version: 2
  readonly savedAt: number
  readonly rows: readonly PersistedRow[]
}

/** The durable-boundary shape check (a corrupt strip is an empty strip). */
function isPersistedShape(value: unknown): value is PersistedShape {
  if (typeof value !== 'object' || value === null) return false
  const shape = value as Record<string, unknown>
  if (shape['version'] !== 2 || !Array.isArray(shape['rows']) || typeof shape['savedAt'] !== 'number') return false
  return shape['rows'].every((row) => {
    if (typeof row !== 'object' || row === null) return false
    const typed = row as Record<string, unknown>
    return typeof typed['id'] === 'string' && (typed['kind'] === 'image' || typed['kind'] === 'doc')
      && typeof typed['name'] === 'string' && typeof typed['sizeBytes'] === 'number'
      && typeof typed['quote'] === 'string'
  })
}

/** One structured persistence trace an operator can grep (outboxStore's style). */
function warnPersist(kind: 'attachments.persist-failed' | 'attachments.persist-quota' | 'attachments.persist-corrupt', key: string, detail: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({ type: kind, key, ...detail, at: new Date().toISOString() }))
}

/**
 * Whether a storage write failure is quota exhaustion: the spec's
 * `QuotaExceededError` DOMException is not an `Error` subclass, and older
 * WebKit surfaces it as a plain Error whose message names the quota.
 */
function isQuotaExceeded(cause: unknown): boolean {
  const name = typeof cause === 'object' && cause !== null ? (cause as { readonly name?: unknown }).name : undefined
  return name === 'QuotaExceededError' || (cause instanceof Error && /quota/i.test(cause.message))
}

/** One message string for a caught cause. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Remove the oldest other session's persisted strip and return its key: the
 * `savedAt` field ranks the candidates (a strip that fails to parse counts
 * as the oldest — eviction clears the residue). Returns undefined when no
 * other strip exists.
 */
function evictOldestStrip(current: string): string | undefined {
  let oldestKey: string | undefined
  let oldestAt = Number.POSITIVE_INFINITY
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (key === null || !key.startsWith(PERSIST_PREFIX) || key === current) continue
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    let savedAt: unknown
    try { savedAt = (JSON.parse(raw) as Record<string, unknown>)['savedAt'] } catch { savedAt = 0 }
    const at = typeof savedAt === 'number' ? savedAt : 0
    if (at < oldestAt) {
      oldestAt = at
      oldestKey = key
    }
  }
  if (oldestKey !== undefined) localStorage.removeItem(oldestKey)
  return oldestKey
}

/** Read one session's persisted ready rows back as live ready chips. */
function loadPersisted(key: string): readonly DraftAttachment[] {
  const raw = localStorage.getItem(key)
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isPersistedShape(parsed)) {
      localStorage.removeItem(key)
      warnPersist('attachments.persist-corrupt', key)
      return []
    }
    return parsed.rows.map(row => ({
      ...row, thumbUrl: undefined, status: 'ready' as const, error: undefined,
    }))
  } catch {
    localStorage.removeItem(key)
    warnPersist('attachments.persist-corrupt', key)
    return []
  }
}

/** Write one session's ready rows (an empty strip removes the key). A
 * quota-exceeded write evicts the oldest other session's strip and retries
 * once; any other write failure only warns — the in-memory chips keep
 * working and the next commit tries again. */
function savePersisted(key: string, rows: readonly DraftAttachment[]): void {
  const ready = rows
    .filter(row => row.status === 'ready' && row.quote !== undefined)
    .map(row => ({ id: row.id, kind: row.kind, name: row.name, sizeBytes: row.sizeBytes, quote: row.quote as string }))
  if (ready.length === 0) {
    localStorage.removeItem(key)
    return
  }
  const encoded = JSON.stringify({ version: 2, savedAt: Date.now(), rows: ready } satisfies PersistedShape)
  try {
    localStorage.setItem(key, encoded)
  } catch (cause) {
    if (!isQuotaExceeded(cause)) {
      warnPersist('attachments.persist-failed', key, { message: messageOf(cause) })
      return
    }
    const evicted = evictOldestStrip(key)
    try {
      localStorage.setItem(key, encoded)
      warnPersist('attachments.persist-quota', key, { evicted: evicted ?? null })
    } catch (retryCause) {
      warnPersist('attachments.persist-failed', key, { evicted: evicted ?? null, message: messageOf(retryCause) })
    }
  }
}

/** The attachment lane's state and pick sinks (what `useAttachments` returns). */
export interface UseAttachmentsResult {
  readonly attachments: readonly DraftAttachment[]
  readonly pickImage: (file: File) => Promise<void>
  readonly pickDoc: (file: File) => Promise<void>
  readonly remove: (id: string) => void
  readonly clear: () => void
  readonly disposeThumbs: () => void
}

/**
 * The attachment lane's state and pick sinks. With a session id the ready
 * rows survive a refresh: backgrounding (`visibilitychange`→hidden) and
 * `pagehide` persist the ready descriptors under the session's own key, the
 * mount rehydrates them, and a clear (the post-send reset) drops the key so
 * a sent attachment never resurrects.
 * @param sessionId - the owning session, when the strip should persist.
 * @returns the draft rows plus the image/document pick handlers and removal.
 */
export function useAttachments(sessionId?: string): UseAttachmentsResult {
  const persistKey = sessionId === undefined ? undefined : `${PERSIST_PREFIX}${sessionId}`
  const [attachments, setAttachments] = useState<readonly DraftAttachment[]>(
    () => (persistKey === undefined ? [] : loadPersisted(persistKey)),
  )
  // The rows' mirror: picks read the current list synchronously (the image
  // cap check) without racing the state commit — a setState updater must stay
  // pure, so the upload side effects live outside it.
  const rowsRef = useRef<readonly DraftAttachment[]>(attachments)
  /** One commit: mirror + state + the persisted strip move together. */
  const commit = useCallback((rows: readonly DraftAttachment[]) => {
    rowsRef.current = rows
    setAttachments(rows)
    if (persistKey !== undefined) savePersisted(persistKey, rows)
  }, [persistKey])
  // Persist on the page's own hiding events (a plain reload may never turn
  // the visibility state before it goes).
  useEffect(() => {
    if (persistKey === undefined) return
    const flush = (): void => { savePersisted(persistKey, rowsRef.current) }
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [persistKey])
  const thumbs = useRef<readonly string[]>([])
  // Revoke every preview URL when the composer unmounts.
  const disposeThumbs = useCallback(() => {
    for (const url of thumbs.current) URL.revokeObjectURL(url)
    thumbs.current = []
  }, [])
  const remove = useCallback((id: string) => {
    const doomed = rowsRef.current.find(row => row.id === id)
    if (doomed?.thumbUrl !== undefined) {
      URL.revokeObjectURL(doomed.thumbUrl)
      thumbs.current = thumbs.current.filter(url => url !== doomed.thumbUrl)
    }
    commit(rowsRef.current.filter(row => row.id !== id))
  }, [commit])
  const clear = useCallback(() => {
    commit([])
    for (const url of thumbs.current) URL.revokeObjectURL(url)
    thumbs.current = []
  }, [commit])

  /** One image file through describe: compress, upload, quote the description. */
  const pickImage = useCallback(async (file: File) => {
    if (!IMAGE_MEDIA.has(file.type)) {
      Toast.show({ content: `不支持的图片格式（${file.type === '' ? '未知' : file.type}）` })
      return
    }
    if (rowsRef.current.filter(row => row.kind === 'image').length >= MAX_IMAGES) {
      Toast.show({ content: `一次最多带 ${MAX_IMAGES} 张图片` })
      return
    }
    const id = uid()
    const thumbUrl = URL.createObjectURL(file)
    thumbs.current = [...thumbs.current, thumbUrl]
    commit([...rowsRef.current, {
      id, kind: 'image' as const, name: file.name, sizeBytes: file.size, thumbUrl,
      status: 'uploading' as const, quote: undefined, error: undefined,
    }])
    try {
      const payload = file.size > REENCODE_THRESHOLD_BYTES
        ? await reencodeImage(file)
        : file
      const mediaType = payload === file ? file.type : 'image/jpeg'
      const value = await rpc('data.describeImage', {
        image: await blobToBase64(payload),
        mediaType: mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
        name: file.name,
      })
      commit(rowsRef.current.map(row => row.id === id
        ? { ...row, status: 'ready' as const, quote: quoteOf('image', file.name, value.description, false) }
        : row))
    } catch (cause) {
      const failure = cause as { code?: string; message?: string }
      commit(rowsRef.current.map(row => row.id === id
        ? { ...row, status: 'failed' as const, error: hintOf(failure.code, failure.message ?? '上传失败，请重试') }
        : row))
    }
  }, [commit])

  /** One pdf/md/txt file through extract: quote the text layer. */
  const pickDoc = useCallback(async (file: File) => {
    const id = uid()
    commit([...rowsRef.current, {
      id, kind: 'doc' as const, name: file.name, sizeBytes: file.size,
      thumbUrl: undefined, status: 'uploading' as const, quote: undefined, error: undefined,
    }])
    try {
      const value = await rpc('data.extractText', {
        filename: file.name,
        data: await blobToBase64(file),
      })
      commit(rowsRef.current.map(row => row.id === id
        ? { ...row, status: 'ready' as const, quote: quoteOf('doc', file.name, value.text, value.truncated) }
        : row))
    } catch (cause) {
      const failure = cause as { code?: string; message?: string }
      commit(rowsRef.current.map(row => row.id === id
        ? { ...row, status: 'failed' as const, error: hintOf(failure.code, failure.message ?? '提取失败，请重试') }
        : row))
    }
  }, [commit])

  return { attachments, pickImage, pickDoc, remove, clear, disposeThumbs }
}

/**
 * Compose the outgoing text: the ready attachments' quote blocks lead, the
 * typed text follows. A pending or failed attachment never reaches the wire —
 * the caller blocks the send on `uploading` and surfaces `failed` on the chip.
 * @param attachments - the composer's current rows.
 * @param text - the typed draft text.
 * @returns the composed message text ('' when nothing to send).
 */
export function composeWithAttachments(attachments: readonly DraftAttachment[], text: string): string {
  const quotes = attachments
    .filter(row => row.status === 'ready' && row.quote !== undefined)
    .map(row => row.quote)
  const typed = text.trim()
  if (quotes.length === 0) return typed
  if (typed === '') return quotes.join('\n\n')
  return `${quotes.join('\n\n')}\n\n${typed}`
}
