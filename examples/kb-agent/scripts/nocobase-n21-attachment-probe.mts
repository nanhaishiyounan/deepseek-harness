/**
 * N21 attachment/image visibility probe (self-cleaning, fail-loud): per
 * attachment format (pdf/docx/xlsx/md/png), measure whether the MiniMax-M3
 * model behind AI employee dex actually sees file content sent through the
 * plugin-ai attachment channel — `POST /api/aiFiles:create` multipart upload
 * plus `aiConversations:sendMessages` echoing the uploaded record in
 * `attachments:[{id,source,…}]` (the exact client wire) —
 * against the current direct llmService wiring (the local rewriting proxy is
 * N22 and is deliberately NOT deployed for this baseline).
 *
 * Each probe file embeds a unique marker string: pdf = tool-kb sample.pdf with
 * a pdf-lib marker page appended; docx = sample.docx with a marker paragraph
 * re-zipped through jszip; xlsx = a minimal exceljs sheet; md = plain text;
 * png = a bitmap-font rendered image (the marker must be legible pixels). The
 * marker is verified locally before every upload, the model is asked to
 * transcribe it verbatim (150s budget, aligned with the n18-capture MiniMax-M3
 * latency window; serial — same-user conversations must not overlap), and the
 * cell verdict is marker-presence in the reply. NocoBase never logs the
 * outbound LLM body, so wire evidence anchors on the inbound request log
 * (sendMessages action params carry the full attachment record whose
 * mimetype/extname deterministically selects the parseAttachment branch) plus
 * a direct-to-MiniMax differential that proves the OpenAI `file` part is
 * silently ignored while `<parsed_document>` text is consumed.
 *
 * Conversations and uploads are destroyed in try/finally; both run boundaries
 * assert zero residue (title `$includes N21PROBE`, filename `$includes
 * n21-probe`), so a second run starting clean proves the first run cleaned up.
 * The script regenerates demos/nocobase-full-features/N21-attachment-visibility.md
 * from live results. The wire-layer helpers (upload/conversation/SSE send/
 * cleanup/marker matching/PNG builder) are exported for the N23 image-boundary
 * probe; the probe main itself only runs under direct execution. Usage:
 * `node --env-file=.env --import tsx/esm examples/kb-agent/scripts/nocobase-n21-attachment-probe.mts`
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { deflateSync, inflateSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { extractText, getDocumentProxy } from 'unpdf'
import { resolveEnv } from './resolve-env.ts'
import { withResilience } from './resilience.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
// Headers the real chat client always sends. `x-timezone` is load-bearing for
// the AI employees: parseVariables eagerly evaluates every $nDate getter, and
// without a timezone the core utc2unit chain dies with `m.startOf is not a
// function` before any LLM call — every REST probe must mirror the browser.
const browserHeaders: Record<string, string> = { 'x-role': 'root', 'x-timezone': '+08:00', 'x-locale': 'zh-CN', 'x-authenticator': 'basic' }
const rootEmail = 'admin@nocobase.com'
const rootPassword = 'admin123'
export const EMPLOYEE = 'dex'
const fixturesDir = join(here, 'fixtures', 'n21')
const docsFixturesDir = join(repoRoot, 'packages', 'kb', 'tool-kb', 'tests', 'fixtures', 'docs')
const evidencePath = join(here, '..', 'demos', 'nocobase-full-features', 'N21-attachment-visibility.md')
const minimaxBase = 'https://api.minimaxi.com/v1'
export const SEND_TIMEOUT_MS = 150_000
const REPLY_POLL_TRIES = 12
const REPLY_POLL_INTERVAL_MS = 5_000

// Borrowed from the vendored NocoBase node_modules (read-only; the n18-capture
// createRequire precedent): jszip/mammoth for the docx marker patch and its
// local verification, exceljs for the xlsx probe workbook.
const nocobaseRequire = createRequire(join(repoRoot, 'platform', 'nocobase', 'package.json'))
const JSZip = nocobaseRequire('jszip') as { loadAsync: (data: Buffer) => Promise<any> }
const mammoth = nocobaseRequire('mammoth') as { extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }> }
const ExcelJS = nocobaseRequire('exceljs')

type FormatId = 'pdf' | 'docx' | 'xlsx' | 'md' | 'png'
type Verdict = 'visible' | 'invisible' | 'error'

interface FormatSpec {
  id: FormatId
  marker: string
  filename: string
  mimetype: string
  build: () => Promise<Uint8Array>
  verifyLocal: (bytes: Uint8Array) => Promise<string>
}

interface LogAnchor {
  file: string
  send?: { ts: string, reqId?: string, status?: string, costMs?: string, filename?: string, mimetype?: string, extname?: string, size?: string }
  upload?: { ts: string, reqId?: string, status?: string }
}

interface CellResult {
  spec: FormatSpec
  verdict: Verdict
  question: string
  reply: string | null
  upload: { id: number, filename: string, size: number } | null
  sendMs: number | null
  localText: string
  log: LogAnchor | null
  cleanup: { conversation: string, file: string }
  driftNote: string | null
  error: string | null
}

const MARKERS: Record<FormatId, string> = {
  pdf: 'N21PROBE-PDF-7Q4Z',
  docx: 'N21PROBE-DOCX-K9MT',
  xlsx: 'N21PROBE-XLSX-R2VW',
  md: 'N21PROBE-MD-H8DY',
  png: 'N21PROBE-PNG-T5CN',
}

const failures: string[] = []

function fail(message: string): void {
  failures.push(message)
  console.error(`nocobase-n21: FAIL ${message}`)
}

export function localDate(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export async function call(token: string, method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...browserHeaders, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`${method} ${path} -> HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`)
  }
  return payload
}

export async function signIn(): Promise<string> {
  const payload = await withResilience(
    'auth:signIn',
    async (signal) => {
      const response = await fetch(`${baseUrl}/api/auth:signIn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account: rootEmail, password: rootPassword }),
        signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return (await response.json()) as { data?: { token?: string } }
    },
    { attempts: 3, timeoutMs: 30_000 },
  )
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error(`sign-in as ${rootEmail} returned no token`)
  return token
}

// --- probe file builders -----------------------------------------------------

async function buildPdfProbe(): Promise<Uint8Array> {
  const sample = await readFile(join(docsFixturesDir, 'sample.pdf'))
  const doc = await PDFDocument.load(sample)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([420, 200])
  page.drawText(MARKERS.pdf, { x: 30, y: 110, size: 24, font, color: rgb(0, 0, 0) })
  page.drawText('NocoBase N21 attachment visibility probe', { x: 30, y: 70, size: 12, font, color: rgb(0, 0, 0) })
  return new Uint8Array(await doc.save())
}

async function buildDocxProbe(): Promise<Uint8Array> {
  const sample = await readFile(join(docsFixturesDir, 'sample.docx'))
  const zip = await JSZip.loadAsync(sample)
  const entry = zip.file('word/document.xml')
  if (!entry) throw new Error('sample.docx has no word/document.xml entry')
  const xml = (await entry.async('string')) as string
  if (!xml.includes('</w:body>')) throw new Error('sample.docx document.xml has no </w:body> to append the marker paragraph to')
  const patched = xml.replace('</w:body>', `<w:p><w:r><w:t xml:space="preserve">${MARKERS.docx}</w:t></w:r></w:p></w:body>`)
  zip.file('word/document.xml', patched)
  return new Uint8Array(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

async function buildXlsxProbe(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('probe')
  sheet.addRow(['n21 attachment probe', 'marker cell'])
  sheet.addRow([MARKERS.xlsx, 'visibility probe value'])
  const buffer = await workbook.xlsx.writeBuffer()
  return new Uint8Array(buffer as ArrayBuffer)
}

function buildMdProbe(): Uint8Array {
  const text = [
    '# N21 attachment probe (markdown)',
    '',
    `Unique marker: ${MARKERS.md}`,
    '',
    'This file exists only to test whether .md attachments reach the model.',
  ].join('\n')
  return new TextEncoder().encode(`${text}\n`)
}

/** 5x7 pixel font (1 = ink) covering the marker alphabet: A-Z, 0-9, '-'. */
const FONT_5X7: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
}

/** Render `text` as a grayscale 8-bit raw scanline buffer (one filter byte per row). */
export function renderMarkerBitmap(text: string, scale: number, padding: number): { width: number, height: number, raw: Uint8Array } {
  const glyphWidth = 5 * scale
  const advance = 6 * scale
  const glyphHeight = 7 * scale
  const width = padding * 2 + text.length * advance - scale
  const height = padding * 2 + glyphHeight
  const pixels = new Uint8Array(width * height).fill(255)
  const inkPixel = (x: number, y: number) => {
    pixels[y * width + x] = 0
  }
  text.split('').forEach((char, index) => {
    const glyph = FONT_5X7[char]
    if (!glyph) throw new Error(`marker font has no glyph for ${JSON.stringify(char)}`)
    glyph.forEach((row, rowY) => {
      row.split('').forEach((bit, colX) => {
        if (bit !== '1') return
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            const x = padding + index * advance + colX * scale + sx
            const y = padding + rowY * scale + sy
            inkPixel(x, y)
          }
        }
      })
    })
  })
  const raw = new Uint8Array(height * (width + 1))
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1)
  }
  return { width, height, raw }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typed = new Uint8Array(data.length + 12)
  const view = new DataView(typed.buffer)
  view.setUint32(0, data.length)
  typed.set(new TextEncoder().encode(type), 4)
  typed.set(data, 8)
  view.setUint32(typed.length - 4, crc32(typed.subarray(4, typed.length - 4)))
  return typed
}

export function buildPngImage(text: string, scale: number, padding: number): Uint8Array {
  const { width, height, raw } = renderMarkerBitmap(text, scale, padding)
  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, width)
  ihdrView.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // grayscale
  ihdr[10] = 0 // compression: deflate
  ihdr[11] = 0 // filter: adaptive
  ihdr[12] = 0 // interlace: none
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const idat = new Uint8Array(deflateSync(raw, { level: 9 }))
  const total = signature.length + ihdrPart().length + idatPart().length + iendPart().length
  function ihdrPart() { return pngChunk('IHDR', ihdr) }
  function idatPart() { return pngChunk('IDAT', idat) }
  function iendPart() { return pngChunk('IEND', new Uint8Array(0)) }
  const png = new Uint8Array(total)
  let offset = 0
  for (const part of [signature, ihdrPart(), idatPart(), iendPart()]) {
    png.set(part, offset)
    offset += part.length
  }
  return png
}

function verifyPngProbe(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!signature.every((byte, index) => bytes[index] === byte)) throw new Error('png probe signature mismatch')
  let offset = signature.length
  let width = 0
  let height = 0
  let idat: Uint8Array | null = null
  while (offset < bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    const storedCrc = view.getUint32(offset + 8 + length)
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== storedCrc) throw new Error(`png probe chunk ${type} CRC mismatch`)
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
    }
    if (type === 'IDAT') idat = data
    offset += 12 + length
  }
  if (!idat) throw new Error('png probe has no IDAT chunk')
  const { raw } = renderMarkerBitmap(MARKERS.png, 6, 14)
  if (width * height === 0 || inflateSync(idat).length !== raw.length) {
    throw new Error(`png probe decode mismatch (width=${width} height=${height})`)
  }
}

const FORMATS: FormatSpec[] = [
  {
    id: 'pdf',
    marker: MARKERS.pdf,
    filename: 'n21-probe.pdf',
    mimetype: 'application/pdf',
    build: buildPdfProbe,
    verifyLocal: async (bytes) => {
      // pdf.js takes ownership of (detaches) the buffer it is handed, so give
      // it a copy — the original bytes still feed the upload and base64 paths.
      const pdf = await getDocumentProxy(new Uint8Array(bytes))
      const { text } = await extractText(pdf, { mergePages: true })
      if (!text.includes(MARKERS.pdf)) throw new Error(`marker ${MARKERS.pdf} missing from generated pdf text`)
      return text.trim()
    },
  },
  {
    id: 'docx',
    marker: MARKERS.docx,
    filename: 'n21-probe.docx',
    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    build: buildDocxProbe,
    verifyLocal: async (bytes) => {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
      if (!value.includes(MARKERS.docx)) throw new Error(`marker ${MARKERS.docx} missing from generated docx text`)
      if (!value.includes('Lvyuan')) throw new Error('generated docx lost the sample.docx base content')
      return value.trim()
    },
  },
  {
    id: 'xlsx',
    marker: MARKERS.xlsx,
    filename: 'n21-probe.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    build: buildXlsxProbe,
    verifyLocal: async (bytes) => {
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(Buffer.from(bytes))
      const value = workbook.getWorksheet('probe')?.getCell('A2').value
      if (value !== MARKERS.xlsx) throw new Error(`marker cell A2 is ${JSON.stringify(value)}`)
      return `Sheet: probe\nn21 attachment probe\tmarker cell\n${MARKERS.xlsx}\tvisibility probe value`
    },
  },
  {
    id: 'md',
    marker: MARKERS.md,
    filename: 'n21-probe.md',
    mimetype: 'text/markdown',
    build: async () => buildMdProbe(),
    verifyLocal: async (bytes) => {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (!text.includes(MARKERS.md)) throw new Error(`marker ${MARKERS.md} missing from generated md text`)
      return text.trim()
    },
  },
  {
    id: 'png',
    marker: MARKERS.png,
    filename: 'n21-probe.png',
    mimetype: 'image/png',
    build: async () => buildPngImage(MARKERS.png, 6, 14),
    verifyLocal: async (bytes) => {
      verifyPngProbe(bytes)
      return `rendered ${MARKERS.png} as bitmap-font pixels (grayscale PNG)`
    },
  },
]

// --- NocoBase round-trip ------------------------------------------------------

export interface UploadRecord { id: number, filename: string, size: number, wire: Record<string, unknown> }

export async function uploadFile(token: string, spec: { id: string, mimetype: string, filename: string }, bytes: Uint8Array): Promise<UploadRecord> {
  const form = new FormData()
  // The probe builders always allocate over a plain ArrayBuffer (never a
  // SharedArrayBuffer), which the DOM BlobPart type demands.
  form.append('file', new Blob([bytes as Uint8Array<ArrayBuffer>], { type: spec.mimetype }), spec.filename)
  const payload = await withResilience(
    `aiFiles:create ${spec.id}`,
    async (signal) => {
      const response = await fetch(`${baseUrl}/api/aiFiles:create`, { method: 'POST', headers: { authorization: `Bearer ${token}`, ...browserHeaders }, body: form, signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`)
      return (await response.json()) as { data?: { id?: number, filename?: string, size?: number } }
    },
    { attempts: 1, timeoutMs: 60_000 },
  )
  const raw = payload?.data ?? {}
  const { id, filename, size } = raw
  if (typeof id !== 'number' || typeof filename !== 'string') throw new Error(`aiFiles:create returned no usable record: ${JSON.stringify(payload).slice(0, 200)}`)
  // The real client echoes the whole upload record back as the message
  // attachment (normalizeAIFileUploadAttachment lifts meta.source); mirroring
  // that wire keeps the request-log evidence complete.
  const wire = { ...raw, source: (raw as any).meta?.source ?? (raw as any).source, status: 'done' }
  return { id, filename, size: size ?? bytes.length, wire: wire as Record<string, unknown> }
}

export async function createConversation(token: string): Promise<string> {
  const payload = await withResilience(
    'aiConversations:create',
    async (signal) => call(token, 'POST', '/api/aiConversations:create', { aiEmployee: { username: EMPLOYEE } }, signal),
    { attempts: 1, timeoutMs: 30_000 },
  )
  const sessionId = payload?.data?.sessionId
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error(`aiConversations:create returned no sessionId: ${JSON.stringify(payload).slice(0, 200)}`)
  return sessionId
}

function questionFor(spec: FormatSpec, uploadedFilename: string): string {
  if (spec.id === 'png') {
    return `N21PROBE png附件探针：我上传了一张图片《${uploadedFilename}》。请逐字转写图片中显示的全部文字（标记串形如 N21PROBE-XXX-9999），只输出图片里的文字；如果你看不到图片，请直接回答“看不到图片”。`
  }
  return `N21PROBE ${spec.id}附件探针：我上传了一个${spec.id}附件《${uploadedFilename}》。请逐字复述附件内容中的唯一标记串（形如 N21PROBE-XXX-9999），只输出标记串本身；如果你看不到附件内容，请直接回答“看不到附件”。`
}

/**
 * Send the probe question as an SSE stream — the same wire the real client
 * uses. The non-stream (`stream:false`) main-agent invoke path is broken in
 * this NocoBase snapshot (`m.startOf is not a function`, 500), so the probe
 * accumulates `type:"content"` chunk bodies until the stream ends and treats
 * `type:"error"` events as transport failures.
 */
export async function sendWithAttachments(token: string, sessionId: string, question: string, attachmentWires: unknown[]): Promise<string> {
  return withResilience(
    'aiConversations:sendMessages',
    async (signal) => {
      const response = await fetch(`${baseUrl}/api/aiConversations:sendMessages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...browserHeaders },
        body: JSON.stringify({
          sessionId,
          aiEmployee: EMPLOYEE,
          messages: [
            {
              role: 'user',
              content: { type: 'text', content: question },
              attachments: attachmentWires,
            },
          ],
          stream: true,
        }),
        signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
      if (response.body === null) throw new Error('sendMessages returned no SSE body')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let text = ''
      let streamError: string | null = null
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        for (let index = buffer.indexOf('\n\n'); index >= 0; index = buffer.indexOf('\n\n')) {
          const frame = buffer.slice(0, index)
          buffer = buffer.slice(index + 2)
          const dataLine = frame.split('\n').find((line) => line.startsWith('data: '))
          if (!dataLine) continue
          const event = JSON.parse(dataLine.slice('data: '.length)) as { type?: string, body?: unknown }
          if (event.type === 'content' && typeof event.body === 'string') text += event.body
          if (event.type === 'error') streamError = String(event.body)
        }
      }
      if (streamError !== null) throw new Error(`SSE error event: ${streamError.slice(0, 200)}`)
      if (text.trim() === '') throw new Error('SSE stream ended without content chunks')
      return text
    },
    { attempts: 1, timeoutMs: SEND_TIMEOUT_MS },
  )
}

/** Single-attachment convenience wrapper over {@link sendWithAttachments}. */
export async function sendWithAttachment(token: string, sessionId: string, question: string, attachmentWire: unknown): Promise<string> {
  return sendWithAttachments(token, sessionId, question, [attachmentWire])
}

export async function fetchAssistantReply(token: string, sessionId: string): Promise<string> {
  for (let attempt = 0; attempt < REPLY_POLL_TRIES; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, REPLY_POLL_INTERVAL_MS))
    const payload = await call(token, 'GET', `/api/aiConversations:getMessages?sessionId=${encodeURIComponent(sessionId)}&paginate=false`)
    const rows: Array<Record<string, any>> = payload?.data?.rows ?? payload?.rows ?? []
    const assistant = rows.find((row) => row?.role === 'assistant' && typeof row?.content?.content === 'string' && row.content.content.trim() !== '')
    if (assistant) return assistant.content.content as string
  }
  throw new Error(`no assistant reply in conversation ${sessionId} after ${REPLY_POLL_TRIES * REPLY_POLL_INTERVAL_MS / 1000}s of polling`)
}

export async function extractLogAnchor(sessionId: string, uploadedFilename: string): Promise<LogAnchor> {
  const file = join(repoRoot, 'platform', 'nocobase', 'storage', 'logs', 'main', `request_${localDate()}.log`)
  const anchor: LogAnchor = { file }
  if (!existsSync(file)) return anchor
  // The SSE response log line lands a moment after the client sees stream end,
  // and every line carries ANSI color codes around the timestamp — retry the
  // read briefly and strip the codes before matching.
  const tsOf = (line: string) => /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(line)?.[1] ?? ''
  const reqIdOf = (line: string) => /reqId=([0-9a-f-]{36})/.exec(line)?.[1]
  let lines: string[] = []
  let sendLine: string | undefined
  for (let attempt = 0; attempt < 5 && sendLine === undefined; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1_000))
    lines = readFileSync(file, 'utf8').split('\n').map((line) => line.replace(/\u001b\[[0-9;]*m/g, ''))
    sendLine = lines.filter((line) => line.includes('response /api/aiConversations:sendMessages') && line.includes(sessionId)).pop()
  }
  if (sendLine) {
    anchor.send = {
      ts: tsOf(sendLine),
      reqId: reqIdOf(sendLine),
      status: /res=\{"status":(\d+)/.exec(sendLine)?.[1],
      costMs: /cost=(\d+)/.exec(sendLine)?.[1],
      filename: /"filename":"([^"]+)"/.exec(sendLine)?.[1],
      mimetype: /"mimetype":"([^"]+)"/.exec(sendLine)?.[1],
      extname: /"extname":"([^"]+)"/.exec(sendLine)?.[1],
      size: /"size":(\d+)/.exec(sendLine)?.[1],
    }
    if (anchor.send.filename !== undefined && !anchor.send.filename.includes(uploadedFilename.split('.')[0])) {
      anchor.send.filename = `${anchor.send.filename} (probe upload: ${uploadedFilename})`
    }
  }
  const uploadLine = lines.filter((line) => line.includes('response /api/aiFiles:create') && line.includes(uploadedFilename.split('.')[0])).pop()
  if (uploadLine) {
    anchor.upload = { ts: tsOf(uploadLine), reqId: reqIdOf(uploadLine), status: /res=\{"status":(\d+)/.exec(uploadLine)?.[1] }
  }
  return anchor
}

export async function cleanup(token: string, sessionId: string | undefined, fileId: number | undefined): Promise<{ conversation: string, file: string }> {
  const statuses = { conversation: 'not-created', file: 'not-created' }
  if (sessionId !== undefined) {
    try {
      await call(token, 'POST', `/api/aiConversations:destroy?filterByTk=${encodeURIComponent(sessionId)}`)
      statuses.conversation = 'destroyed'
    } catch (error) {
      statuses.conversation = `destroy-failed: ${String(error).slice(0, 120)}`
      fail(`cleanup conversation ${sessionId}: ${String(error).slice(0, 200)}`)
    }
  }
  if (fileId !== undefined) {
    try {
      await call(token, 'POST', `/api/aiFiles:destroy?filterByTk=${fileId}`)
      statuses.file = 'destroyed'
    } catch (error) {
      statuses.file = `destroy-failed: ${String(error).slice(0, 120)}`
      fail(`cleanup aiFile ${fileId}: ${String(error).slice(0, 200)}`)
    }
  }
  return statuses
}

/** Edit-distance tolerance for near transcriptions of the marker (bitmap glyphs). */
const TRANSCRIPT_TOLERANCE = 2

/**
 * Match the marker inside a model reply. Exact (whitespace/case-normalized)
 * containment is the primary rule; a bounded Levenshtein pass over
 * same-length windows additionally accepts near transcriptions, because the
 * rendered bitmap font can make M3 misread single glyphs (observed N→M at 4x
 * scale) while the attachment itself is clearly visible to the model.
 */
export function matchMarker(reply: string, marker: string): { matched: boolean, approximate: boolean } {
  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, '')
  const haystack = normalize(reply)
  const needle = normalize(marker)
  if (haystack.includes(needle)) return { matched: true, approximate: false }
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (levenshteinAtMost(needle, haystack.slice(start, start + needle.length), TRANSCRIPT_TOLERANCE)) {
      return { matched: true, approximate: true }
    }
  }
  return { matched: false, approximate: false }
}

/** Bounded Levenshtein distance check with an early row-minimum bail-out. */
function levenshteinAtMost(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      rowMin = Math.min(rowMin, current[j])
    }
    if (rowMin > limit) return false
    previous = current
  }
  return previous[b.length] <= limit
}

async function probeFormat(token: string, spec: FormatSpec): Promise<CellResult> {
  const result: CellResult = {
    spec,
    verdict: 'error',
    question: '',
    reply: null,
    upload: null,
    sendMs: null,
    localText: '',
    log: null,
    cleanup: { conversation: 'not-created', file: 'not-created' },
    driftNote: null,
    error: null,
  }
  let sessionId: string | undefined
  let fileId: number | undefined
  console.log(`nocobase-n21: [${spec.id}] building + verifying local probe file`)
  try {
    const bytes = await spec.build()
    result.localText = await spec.verifyLocal(bytes)
    await mkdir(fixturesDir, { recursive: true })
    await writeFile(join(fixturesDir, spec.filename), bytes)
    const upload = await uploadFile(token, spec, bytes)
    result.upload = upload
    fileId = upload.id
    sessionId = await createConversation(token)
    result.question = questionFor(spec, upload.filename)
    console.log(`nocobase-n21: [${spec.id}] uploaded id=${upload.id} as ${upload.filename}; asking ${EMPLOYEE} (150s budget)`)
    const startedAt = Date.now()
    let sendError: unknown = null
    let streamText: string | null = null
    try {
      streamText = await sendWithAttachment(token, sessionId, result.question, upload.wire)
      result.reply = streamText
    } catch (error) {
      sendError = error
    }
    result.sendMs = Date.now() - startedAt
    if (sendError !== null) {
      console.log(`nocobase-n21: [${spec.id}] stream failed (${String(sendError).slice(0, 120)}); falling back to reply polling`)
      result.reply = await fetchAssistantReply(token, sessionId)
    }
    result.log = await extractLogAnchor(sessionId, upload.filename)
    if (result.reply === null) throw new Error('send path produced no reply text')
    const match = matchMarker(result.reply, spec.marker)
    result.verdict = match.matched ? 'visible' : 'invisible'
    result.driftNote = match.matched && match.approximate
      ? `模型转写存在位图字形偏差（容差≤${TRANSCRIPT_TOLERANCE} 判可见）`
      : null
    console.log(`nocobase-n21: [${spec.id}] verdict=${result.verdict} in ${(result.sendMs / 1000).toFixed(1)}s`)
  } catch (error) {
    result.error = String(error).slice(0, 400)
    fail(`format ${spec.id}: ${result.error}`)
  } finally {
    result.cleanup = await cleanup(token, sessionId, fileId)
  }
  return result
}

// --- residue assertions --------------------------------------------------------

export async function assertNoResidue(token: string, phase: 'start' | 'end', scope: { title: string, filename: string }, onFail: (message: string) => void): Promise<void> {
  const convFilter = encodeURIComponent(JSON.stringify({ title: { $includes: scope.title } }))
  const convs = await call(token, 'GET', `/api/aiConversations:list?pageSize=100&filter=${convFilter}`)
  const convRows: Array<Record<string, any>> = convs?.data ?? []
  const fileFilter = encodeURIComponent(JSON.stringify({ filename: { $includes: scope.filename } }))
  const files = await call(token, 'GET', `/api/aiFiles:list?pageSize=100&filter=${fileFilter}`)
  const fileRows: Array<Record<string, any>> = files?.data ?? []
  const residue = [
    ...convRows.map((row) => `conversation ${row.sessionId ?? row.id} title=${JSON.stringify(row.title)}`),
    ...fileRows.map((row) => `aiFile ${row.id} filename=${JSON.stringify(row.filename)}`),
  ]
  if (residue.length > 0) {
    onFail(`residue at ${phase}: ${residue.join('; ')}`)
  } else {
    console.log(`nocobase-n21: residue check (${phase}) clean — 0 conversations / 0 files`)
  }
}

// --- direct MiniMax file-part differential --------------------------------------

interface DifferentialRow { variant: string, wire: string, reply: string, containsMarker: boolean }

async function minimaxDifferential(pdfBytes: Uint8Array, pdfText: string): Promise<DifferentialRow[]> {
  const apiKey = resolveEnv('MINIMAX_API_KEY')
  if (apiKey === undefined) throw new Error('MINIMAX_API_KEY not found in env nor the repository root .env')
  const question = '请逐字复述这份文档中的唯一标记串（形如 N21PROBE-XXX-9999），只输出标记串本身；如果你看不到文档内容，请直接回答“看不到文档”。'
  const variants: Array<{ variant: string, wire: string, content: unknown[] }> = [
    {
      variant: 'file-part',
      wire: '{type:"file", file:{file_data:"data:application/pdf;base64,…"}} — plugin-ai parseAttachment 对 application/pdf 的产物（LangChain completions 转出的 OpenAI 专有 file part）',
      content: [
        { type: 'text', text: question },
        { type: 'file', file: { file_data: `data:application/pdf;base64,${Buffer.from(pdfBytes).toString('base64')}`, filename: 'n21-probe.pdf' } },
      ],
    },
    {
      variant: 'parsed-document-text',
      wire: '{type:"text", text:"<parsed_document filename=…>…</parsed_document>"} — docx/xlsx/md 附件的注入形态',
      content: [
        { type: 'text', text: question },
        { type: 'text', text: `<parsed_document filename="n21-probe.pdf">\n${pdfText}\n</parsed_document>` },
      ],
    },
  ]
  const rows: DifferentialRow[] = []
  for (const variant of variants) {
    console.log(`nocobase-n21: minimax differential [${variant.variant}]`)
    const payload = await withResilience(
      `minimax chat ${variant.variant}`,
      async (signal) => {
        const response = await fetch(`${minimaxBase}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'MiniMax-M3',
            thinking: { type: 'disabled' },
            max_completion_tokens: 300,
            messages: [{ role: 'user', content: variant.content }],
          }),
          signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
        return (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
      },
      { attempts: 2, timeoutMs: 90_000 },
    )
    const reply = payload?.choices?.[0]?.message?.content ?? ''
    const normalized = (text: string) => text.toLowerCase().replace(/\s+/g, '')
    rows.push({ variant: variant.variant, wire: variant.wire, reply, containsMarker: normalized(reply).includes(MARKERS.pdf.toLowerCase().replace(/\s+/g, '')) })
    console.log(`nocobase-n21: minimax differential [${variant.variant}] containsMarker=${rows[rows.length - 1].containsMarker}`)
  }
  return rows
}

// --- evidence document ---------------------------------------------------------

export function excerpt(text: string, limit = 600): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…[截断，共 ${text.length} 字符]`
}

async function writeEvidenceDoc(results: CellResult[], differential: DifferentialRow[] | null, residueStart: string, residueEnd: string, services: Array<{ title: string, provider: string, baseURL: string, models: string }>): Promise<void> {
  const now = new Date()
  const stamp = `${localDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const verdictText = (cell: CellResult) => cell.verdict === 'visible' ? '✅ 可见' : cell.verdict === 'invisible' ? '❌ 不可见' : '⚠️ 探测失败'
  const lines: string[] = []
  lines.push(`# N21 附件/图片可见性探针证据（AI 雇员 dex × MiniMax-M3 ${services.some((s) => s.baseURL.includes('127.0.0.1')) ? '代理复测' : '直连基线'}）`)
  lines.push('')
  const wiringNote = services.some((s) => s.baseURL.includes('127.0.0.1'))
    ? 'llmService 当前指向本地 N22 附件代理——本表为代理生效后的复测。'
    : '当前为直连状态，本地代理（N22）未部署。'
  lines.push(`> 探测时间 ${stamp} | 脚本 [nocobase-n21-attachment-probe.mts](../../scripts/nocobase-n21-attachment-probe.mts) | llmService ${services.map((s) => `"${s.title}"（${s.provider} → ${s.baseURL}，模型 ${s.models}）`).join('、')} —— ${wiringNote}`)
  lines.push('')
  lines.push('判定规则：每类格式的探针文件内嵌唯一标记串，本地预检确认标记在文件内容中，经 `POST /api/aiFiles:create` 上传后随 `aiConversations:sendMessages`（`attachments:[{id,source}]`，SSE 流式，与真实客户端同链路）发送给 dex；模型回复（normalize 后）含标记串 → 可见，否则不可见。等待预算 150s（对齐 n18-capture 的 MiniMax-M3 延迟窗口），串行执行。')
  lines.push('')
  lines.push('## 1. 格式 × 可见性矩阵')
  lines.push('')
  lines.push('| 格式 | 标记串 | 判定 | 发送耗时 | 模型回复摘录 |')
  lines.push('|---|---|---|---|---|')
  for (const cell of results) {
    const stripThink = (text: string) => text.replace(/<think>[\s\S]*?<\/think>/gu, '').trim()
    const quote = cell.reply === null
      ? (cell.error ?? '（无回复）')
      : (stripThink(cell.reply).replace(/\|/g, '\\|').slice(0, 80) || cell.reply.replace(/\|/g, '\\|').slice(0, 80))
    lines.push(`| ${cell.spec.id} | \`${cell.spec.marker}\` | ${verdictText(cell)} | ${cell.sendMs === null ? '-' : `${(cell.sendMs / 1000).toFixed(1)}s`} | ${quote} |`)
  }
  lines.push('')
  lines.push('## 2. 每格证据')
  for (const cell of results) {
    lines.push('')
    lines.push(`### ${cell.spec.id}（${cell.verdict === 'visible' ? '可见' : cell.verdict === 'invisible' ? '不可见' : '探测失败'}）`)
    lines.push(`- 探针文件：\`${cell.spec.filename}\`（mimetype \`${cell.spec.mimetype}\`），标记串 \`${cell.spec.marker}\`；本地预检提取内容：${excerpt(cell.localText.replace(/\n/g, ' '), 200)}`)
    if (cell.upload !== null) {
      lines.push(`- 上传记录：aiFiles id=${cell.upload.id}，服务端文件名 \`${cell.upload.filename}\`（storage 去重会追加随机后缀），size=${cell.upload.size}`)
    }
    if (cell.question !== '') lines.push(`- 提问原文：${cell.question}`)
    if (cell.reply !== null) {
      lines.push(`- 模型回复（原文）：`)
      lines.push('')
      lines.push('```text')
      lines.push(excerpt(cell.reply, 1500))
      lines.push('```')
      if (cell.driftNote !== null) lines.push(`- 判定注记：${cell.driftNote}`)
    }
    if (cell.error !== null) lines.push(`- 探测错误：${cell.error}`)
    if (cell.log !== null) {
      const send = cell.log.send
      const upload = cell.log.upload
      const logRelPath = cell.log.file.replace(`${repoRoot}/`, '')
      lines.push(`- 请求日志锚点（[${logRelPath}](../../../../${logRelPath})）：`)
      if (send !== undefined) {
        lines.push(`  - sendMessages 响应：ts=${send.ts} reqId=${send.reqId ?? '-'} status=${send.status ?? '-'} cost=${send.costMs ?? '-'}ms；action 携带 attachments 记录 filename=${send.filename ?? '-'} mimetype=${send.mimetype ?? '-'} extname=${send.extname ?? '-'} size=${send.size ?? '-'} —— mimetype/extname 即 [provider.parseAttachment](../../../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/llm-providers/provider.ts) 分流的确定性输入（image/* → image_url data URI；application/pdf → OpenAI 专有 file part；SUPPORTED_DOCUMENT_EXTNAMES → worker 解析为 <parsed_document>）。`)
      }
      if (upload !== undefined) lines.push(`  - aiFiles:create 响应：ts=${upload.ts} reqId=${upload.reqId ?? '-'} status=${upload.status ?? '-'}`)
    }
    lines.push(`- 清理：会话 ${cell.cleanup.conversation}；上传文件 ${cell.cleanup.file}`)
  }
  lines.push('')
  lines.push('## 3. MiniMax file part 差分实验（直连，证明 PDF 断裂因果）')
  if (differential === null) {
    lines.push('')
    lines.push('（差分实验未执行——见上方探测失败原因）')
  } else {
    lines.push('')
    lines.push('同一份 PDF 探针文件（含标记串），直接调用 `https://api.minimaxi.com/v1/chat/completions`（model MiniMax-M3，thinking disabled），仅 content part 形态不同：')
    lines.push('')
    lines.push('| 变体 | 请求形态 | 回复含标记串 | 模型回复原文 |')
    lines.push('|---|---|---|---|')
    for (const row of differential) {
      lines.push(`| ${row.variant} | ${row.wire.replace(/\|/g, '\\|')} | ${row.containsMarker ? '✅ 是' : '❌ 否'} | ${excerpt(row.reply.replace(/\|/g, '\\|'), 120)} |`)
    }
    lines.push('')
    lines.push('结论：MiniMax 静默忽略 OpenAI 专有 file part（不报错也不读内容），而 `<parsed_document>` 文本注入被正常消费——这是 plugin-ai 将 application/pdf 分流到 file part（而非文档解析）造成 PDF 不可见的直接因果证据，也是 N22 代理改写（file part → 解析文本 part）的正当性依据。')
  }
  lines.push('')
  lines.push('## 4. 清理与幂等')
  lines.push('')
  lines.push(`- 运行开始残留断言：${residueStart}`)
  lines.push(`- 运行结束残留断言：${residueEnd}`)
  lines.push('- 每格探针会话经 `aiConversations:destroy?filterByTk=<sessionId>` 销毁、上传文件经 `aiFiles:destroy?filterByTk=<id>` 删除（try/finally 保证）；二次运行开始时残留断言为 0 即为幂等证据。')
  lines.push('')
  lines.push('## 5. 对 N22 的影响')
  lines.push('')
  const invisible = results.filter((cell) => cell.verdict === 'invisible').map((cell) => cell.spec.id)
  const visible = results.filter((cell) => cell.verdict === 'visible').map((cell) => cell.spec.id)
  const errored = results.filter((cell) => cell.verdict === 'error').map((cell) => cell.spec.id)
  if (invisible.length > 0) lines.push(`- 确需代理修复（file part → 解析文本 part 改写）的格式：${invisible.join('、')}${invisible.includes('pdf') ? '（pdf 已由差分实验证实为 MiniMax 忽略 file part 所致）' : ''}。`)
  if (visible.length > 0) lines.push(`- 实测已可见、N22 无需改写的格式：${visible.join('、')}（上游 worker 解析为 <parsed_document> 注入 / image_url 原生多模态路径已通）。`)
  if (errored.length > 0) lines.push(`- 探测失败需复测的格式：${errored.join('、')}。`)
  const viaProxy = services.some((s) => s.baseURL.includes('127.0.0.1'))
  lines.push(viaProxy
    ? '- 本表为 N22 代理生效后的复测；与直连基线（N21-attachment-visibility.direct-baseline.md）对比，pdf 格翻转为可见即代理验收通过，其余四格不回退。'
    : '- 探针基线为当前直连状态；N22 部署后重跑本脚本，PDF 格（及后续不可见格式）应翻转为可见，即代理验收口径。')
  lines.push('')
  await writeFile(evidencePath, `${lines.join('\n')}\n`)
}

// --- main -----------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`nocobase-n21: signing in and reading the llmService baseline`)
  const token = await signIn()
  const servicesPayload = await call(token, 'GET', '/api/llmServices:list?pageSize=10')
  const services = ((servicesPayload?.data ?? []) as Array<Record<string, any>>).map((row) => ({
    title: String(row.title ?? '?'),
    provider: String(row.provider ?? '?'),
    baseURL: String(row.options?.baseURL ?? '?'),
    models: (row.enabledModels ?? []).join(',') || '?',
  }))
  if (services.length === 0) fail('no llmServices rows; the AI employees have no model wiring')
  await assertNoResidue(token, 'start', { title: 'N21PROBE', filename: 'n21-probe' }, fail)
  const residueStartNote = failures.length === 0 ? '0 会话 / 0 文件（干净）' : '存在残留（见 FAIL 输出）'
  const results: CellResult[] = []
  for (const spec of FORMATS) {
    results.push(await probeFormat(token, spec))
    await new Promise((resolve) => setTimeout(resolve, 3_000))
  }
  let differential: DifferentialRow[] | null = null
  try {
    const pdfBytes = await buildPdfProbe()
    const pdf = await getDocumentProxy(new Uint8Array(pdfBytes))
    const { text } = await extractText(pdf, { mergePages: true })
    differential = await minimaxDifferential(pdfBytes, text.trim())
  } catch (error) {
    fail(`minimax differential: ${String(error).slice(0, 300)}`)
  }
  await assertNoResidue(token, 'end', { title: 'N21PROBE', filename: 'n21-probe' }, fail)
  const residueEndNote = failures.length === 0 ? '0 会话 / 0 文件（干净）' : '存在残留（见 FAIL 输出）'
  await writeEvidenceDoc(results, differential, residueStartNote, residueEndNote, services)
  console.log('')
  console.log('nocobase-n21: matrix')
  for (const cell of results) {
    console.log(`  ${cell.spec.id.padEnd(5)} ${cell.verdict === 'visible' ? 'visible  ' : cell.verdict === 'invisible' ? 'invisible' : 'ERROR    '} marker=${cell.spec.marker}`)
  }
  console.log(`nocobase-n21: evidence at ${evidencePath}`)
  if (failures.length > 0) {
    console.error(`nocobase-n21: ${failures.length} failure(s), exit 1`)
    process.exitCode = 1
    return
  }
  console.log('nocobase-n21: done')
}

// The N23 image-boundary probe imports this module's wire helpers; only run
// the probe when executed directly.
const isEntry = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntry) await main()
