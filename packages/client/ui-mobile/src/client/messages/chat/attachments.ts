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

import { useCallback, useRef, useState } from 'react'
import { Toast } from 'antd-mobile'
import { rpc } from '../../rpc.ts'

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
 * The attachment lane's state and pick sinks.
 * @returns the draft rows plus the image/document pick handlers and removal.
 */
export function useAttachments(): UseAttachmentsResult {
  const [attachments, setAttachments] = useState<readonly DraftAttachment[]>([])
  // The rows' mirror: picks read the current list synchronously (the image
  // cap check) without racing the state commit — a setState updater must stay
  // pure, so the upload side effects live outside it.
  const rowsRef = useRef<readonly DraftAttachment[]>([])
  /** One commit: mirror + state move together. */
  const commit = useCallback((rows: readonly DraftAttachment[]) => {
    rowsRef.current = rows
    setAttachments(rows)
  }, [])
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
    const id = crypto.randomUUID()
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
    const id = crypto.randomUUID()
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
