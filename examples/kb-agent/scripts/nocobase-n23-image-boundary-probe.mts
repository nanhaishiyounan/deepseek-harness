/**
 * N23 image-support boundary probe (self-cleaning, fail-loud): measures the
 * M3 multimodal `image_url` path against three boundaries the N21 baseline
 * cell did not cover — several images in ONE message (each carrying its own
 * marker string), a format matrix (png/jpg/webp; jpg and webp are transcoded
 * from the bitmap-font PNG through the host `ffmpeg`, which doubles as the
 * structural decode check), and an oversized (>10MB) noise PNG whose only
 * legal outcomes are an explicit rejection (recorded, passing) or visibility
 * — a silent drop is the sole failing outcome.
 *
 * This is a separate script rather than an n21 `--images` mode because the
 * N21 probe is the frozen acceptance baseline for the N22 proxy flip (its
 * evidence doc narrates one five-cell matrix over one wiring state); the
 * boundary verdicts here have a different taxonomy (per-marker multi-image
 * matching, rejection-layer classification) and a distinct evidence doc. All
 * wire-layer helpers are imported from the n21 module (which only runs its
 * main under a direct-entry guard), so the upload/send/cleanup behavior stays
 * byte-identical with the acceptance probe.
 *
 * Usage:
 * `node --env-file=.env --import tsx/esm examples/kb-agent/scripts/nocobase-n23-image-boundary-probe.mts`
 */
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertNoResidue,
  buildPngImage,
  call,
  cleanup,
  createConversation,
  excerpt,
  fetchAssistantReply,
  localDate,
  matchMarker,
  renderMarkerBitmap,
  sendWithAttachments,
  signIn,
  uploadFile,
} from './nocobase-n21-attachment-probe.mts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const fixturesDir = join(here, 'fixtures', 'n23')
const evidencePath = join(here, '..', 'demos', 'nocobase-full-features', 'N23-image-boundary.md')
/** MiniMax's documented per-image ceiling; the oversized cell must exceed it. */
const MINIMAX_IMAGE_LIMIT_BYTES = 10 * 1024 * 1024

const MARKERS = {
  multi1: 'N23PROBE-M1A-7201',
  multi2: 'N23PROBE-M2B-8302',
  multi3: 'N23PROBE-M3C-9403',
  png: 'N23PROBE-PNG-5104',
  jpg: 'N23PROBE-JPG-6205',
  webp: 'N23PROBE-WBP-7306',
  oversize: 'N23PROBE-OVR-8407',
} as const

const failures: string[] = []

function fail(message: string): void {
  failures.push(message)
  console.error(`nocobase-n23: FAIL ${message}`)
}

type Boundary = 'multi-image' | 'format-matrix' | 'oversized'

type Outcome =
  | 'visible'
  | 'visible-partial'
  | 'rejected-at-upload'
  | 'rejected-at-send'
  | 'invisible-explicit'
  | 'invisible-silent'
  | 'error'

interface CellResult {
  id: string
  boundary: Boundary
  markerSummary: string
  outcome: Outcome
  /** Per-marker match detail for the multi-image cell; single entry elsewhere. */
  markerMatches: Array<{ marker: string, matched: boolean, approximate: boolean }>
  uploads: Array<{ id: number, filename: string, size: number }>
  question: string
  reply: string | null
  sendMs: number | null
  error: string | null
  cleanup: { conversation: string, file: string }
}

// --- image builders -------------------------------------------------------------

/** Deterministic grayscale noise so deflate cannot shrink the oversized cell under the limit. */
function noiseByte(state: { value: number }): number {
  let x = state.value
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  state.value = x
  return (x >>> 0) & 0xff
}

/**
 * One PNG whose top band carries the marker bitmap centered on white and
 * whose remainder is incompressible noise — the raw scanline size targets
 * ~11MB so the encoded file safely clears MiniMax's 10MB per-image limit.
 */
function buildOversizedPng(): Uint8Array {
  const width = 3600
  const { width: markerWidth, height: markerHeight, raw: markerRaw } = renderMarkerBitmap(MARKERS.oversize, 6, 14)
  const topRows = 30
  const state = { value: 0x9e3779b9 }
  const markerStride = markerWidth + 1
  const offsetX = Math.floor((width - markerWidth) / 2)
  const rows: Uint8Array[] = []
  const whiteRow = () => {
    const row = new Uint8Array(width + 1)
    row.fill(255, 1)
    return row
  }
  for (let y = 0; y < topRows; y += 1) rows.push(whiteRow())
  for (let y = 0; y < markerHeight; y += 1) {
    const row = new Uint8Array(width + 1)
    row.fill(255, 1)
    row.set(markerRaw.subarray(y * markerStride + 1, (y + 1) * markerStride), 1 + offsetX)
    rows.push(row)
  }
  const targetRawBytes = 11_400_000
  const noiseRowCount = Math.ceil((targetRawBytes - rows.length * (width + 1)) / (width + 1))
  for (let y = 0; y < noiseRowCount; y += 1) {
    const row = new Uint8Array(width + 1)
    for (let x = 1; x <= width; x += 1) row[x] = noiseByte(state)
    rows.push(row)
  }
  const raw = new Uint8Array(rows.length * (width + 1))
  rows.forEach((row, index) => raw.set(row, index * (width + 1)))
  // Reuse the n21 PNG chunk framing through a private minimal encoder: the
  // shared builder only renders full marker images, not composed canvases.
  const crcTable = (() => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
    return table
  })()
  const crc32 = (bytes: Uint8Array): number => {
    let crc = 0xffffffff
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const typed = new Uint8Array(data.length + 12)
    const view = new DataView(typed.buffer)
    view.setUint32(0, data.length)
    typed.set(new TextEncoder().encode(type), 4)
    typed.set(data, 8)
    view.setUint32(typed.length - 4, crc32(typed.subarray(4, typed.length - 4)))
    return typed
  }
  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, width)
  ihdrView.setUint32(4, rows.length)
  ihdr[8] = 8
  ihdr[9] = 0
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ]
  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    png.set(part, offset)
    offset += part.length
  }
  if (png.length <= MINIMAX_IMAGE_LIMIT_BYTES) {
    throw new Error(`oversized png came out at ${png.length} bytes (≤ the ${MINIMAX_IMAGE_LIMIT_BYTES} limit); the noise budget failed`)
  }
  return png
}

/**
 * Transcode the marker PNG into jpg/webp and return the encoded bytes; the
 * transcoder's decode doubles as the structural check — a corrupt input fails
 * the command. jpg goes through the host ffmpeg; webp through cwebp (this
 * host's ffmpeg build ships without the libwebp encoder). Throws a readable
 * error when the tool is missing or fails.
 */
async function transcodeImage(source: Uint8Array, format: 'jpg' | 'webp'): Promise<Uint8Array> {
  const sourcePath = join(fixturesDir, `n23-source-${format}.png`)
  const outPath = join(fixturesDir, `n23-probe.${format}`)
  await writeFile(sourcePath, source)
  if (format === 'jpg') {
    const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', sourcePath, '-q:v', '2', outPath], { encoding: 'buffer' })
    if (result.error !== undefined || result.status !== 0) {
      throw new Error(`ffmpeg jpg transcode failed (exit ${String(result.status)}): ${String(result.stderr?.toString('utf8').slice(0, 200))}`)
    }
  } else {
    // Lossless: a q80 webp visibly degrades the bitmap glyphs (observed
    // WBP→HWP misreads beyond the tolerance); lossless keeps the marker
    // pixel-identical to the png cell while staying a real webp.
    const result = spawnSync('cwebp', ['-quiet', '-lossless', sourcePath, '-o', outPath], { encoding: 'buffer' })
    if (result.error !== undefined || result.status !== 0) {
      throw new Error(`cwebp transcode failed (exit ${String(result.status)}): ${String(result.stderr?.toString('utf8').slice(0, 200))}`)
    }
  }
  return new Uint8Array(await readFile(outPath))
}

// --- probe groups -----------------------------------------------------------------

async function runMultiImage(token: string): Promise<CellResult> {
  const result: CellResult = {
    id: 'multi-image',
    boundary: 'multi-image',
    markerSummary: [MARKERS.multi1, MARKERS.multi2, MARKERS.multi3].join('、'),
    outcome: 'error',
    markerMatches: [],
    uploads: [],
    question: '',
    reply: null,
    sendMs: null,
    error: null,
    cleanup: { conversation: 'not-created', file: 'not-created' },
  }
  let sessionId: string | undefined
  const fileIds: number[] = []
  try {
    const specs = [
      { marker: MARKERS.multi1, filename: 'n23-probe-multi-1.png' },
      { marker: MARKERS.multi2, filename: 'n23-probe-multi-2.png' },
      { marker: MARKERS.multi3, filename: 'n23-probe-multi-3.png' },
    ] as const
    const uploads = []
    for (const spec of specs) {
      const bytes = buildPngImage(spec.marker, 6, 14)
      await writeFile(join(fixturesDir, spec.filename), bytes)
      const upload = await uploadFile(token, { id: spec.filename, mimetype: 'image/png', filename: spec.filename }, bytes)
      uploads.push(upload)
      fileIds.push(upload.id)
    }
    result.uploads = uploads.map((upload) => ({ id: upload.id, filename: upload.filename, size: upload.size }))
    sessionId = await createConversation(token)
    result.question = `N23PROBE 多图探针：我上传了3张图片《${uploads.map((upload) => upload.filename).join('》《')}》。请逐字转写每张图片中显示的标记串（形如 N23PROBE-XXX-9999），按顺序每行一个，只输出标记串；如果你看不到图片，请直接回答“看不到图片”。`
    const startedAt = Date.now()
    try {
      result.reply = await sendWithAttachments(token, sessionId, result.question, uploads.map((upload) => upload.wire))
    } catch (error) {
      console.log(`nocobase-n23: [multi-image] stream failed (${String(error).slice(0, 120)}); falling back to reply polling`)
      result.reply = await fetchAssistantReply(token, sessionId)
    }
    result.sendMs = Date.now() - startedAt
    for (const marker of [MARKERS.multi1, MARKERS.multi2, MARKERS.multi3]) {
      result.markerMatches.push({ marker, ...matchMarker(result.reply, marker) })
    }
    const matched = result.markerMatches.filter((entry) => entry.matched).length
    result.outcome = matched === 3 ? 'visible' : matched > 0 ? 'visible-partial' : 'invisible-silent'
    if (result.outcome !== 'visible') fail(`multi-image outcome=${result.outcome} (matched ${matched}/3)`)
    console.log(`nocobase-n23: [multi-image] outcome=${result.outcome} matched=${matched}/3`)
  } catch (error) {
    result.error = String(error).slice(0, 400)
    result.outcome = result.uploads.length < 3 ? 'rejected-at-upload' : 'error'
    fail(`multi-image: ${result.error}`)
  } finally {
    result.cleanup = await cleanupGroup(token, sessionId, fileIds)
  }
  return result
}

async function runFormatCell(token: string, format: 'png' | 'jpg' | 'webp'): Promise<CellResult> {
  const marker = MARKERS[format]
  const mimetype = format === 'png' ? 'image/png' : format === 'jpg' ? 'image/jpeg' : 'image/webp'
  const filename = `n23-probe.${format}`
  const result: CellResult = {
    id: `format:${format}`,
    boundary: 'format-matrix',
    markerSummary: marker,
    outcome: 'error',
    markerMatches: [],
    uploads: [],
    question: '',
    reply: null,
    sendMs: null,
    error: null,
    cleanup: { conversation: 'not-created', file: 'not-created' },
  }
  let sessionId: string | undefined
  let fileId: number | undefined
  try {
    // A larger scale keeps the glyphs legible after jpg/webp lossy compression.
    const source = buildPngImage(marker, 8, 18)
    const bytes = format === 'png' ? source : await transcodeImage(source, format)
    await writeFile(join(fixturesDir, filename), bytes)
    const upload = await uploadFile(token, { id: format, mimetype, filename }, bytes)
    result.uploads = [{ id: upload.id, filename: upload.filename, size: upload.size }]
    fileId = upload.id
    sessionId = await createConversation(token)
    result.question = `N23PROBE ${format} 图片探针：我上传了一张图片《${upload.filename}》。请逐字转写图片中显示的全部文字（标记串形如 N23PROBE-XXX-9999），只输出图片里的文字；如果你看不到图片，请直接回答“看不到图片”。`
    const startedAt = Date.now()
    try {
      result.reply = await sendWithAttachments(token, sessionId, result.question, [upload.wire])
    } catch (error) {
      console.log(`nocobase-n23: [format:${format}] stream failed (${String(error).slice(0, 120)}); falling back to reply polling`)
      result.reply = await fetchAssistantReply(token, sessionId)
    }
    result.sendMs = Date.now() - startedAt
    const match = matchMarker(result.reply, marker)
    result.markerMatches = [{ marker, ...match }]
    result.outcome = match.matched ? 'visible' : 'invisible-silent'
    if (result.outcome !== 'visible') fail(`format ${format} outcome=${result.outcome} (reply misses ${marker})`)
    console.log(`nocobase-n23: [format:${format}] outcome=${result.outcome} (${upload.filename}, ${bytes.length} bytes)`)
  } catch (error) {
    result.error = String(error).slice(0, 400)
    result.outcome = fileId === undefined ? 'rejected-at-upload' : 'error'
    fail(`format ${format}: ${result.error}`)
  } finally {
    result.cleanup = await cleanup(token, sessionId, fileId)
  }
  return result
}

async function runOversized(token: string): Promise<CellResult> {
  const result: CellResult = {
    id: 'oversized',
    boundary: 'oversized',
    markerSummary: MARKERS.oversize,
    outcome: 'error',
    markerMatches: [],
    uploads: [],
    question: '',
    reply: null,
    sendMs: null,
    error: null,
    cleanup: { conversation: 'not-created', file: 'not-created' },
  }
  let sessionId: string | undefined
  let fileId: number | undefined
  try {
    const bytes = buildOversizedPng()
    await writeFile(join(fixturesDir, 'n23-probe-oversize.png'), bytes)
    console.log(`nocobase-n23: [oversized] probe is ${bytes.length} bytes (limit ${MINIMAX_IMAGE_LIMIT_BYTES})`)
    const upload = await uploadFile(token, { id: 'oversize', mimetype: 'image/png', filename: 'n23-probe-oversize.png' }, bytes)
    result.uploads = [{ id: upload.id, filename: upload.filename, size: upload.size }]
    fileId = upload.id
    sessionId = await createConversation(token)
    result.question = `N23PROBE 超大图探针：我上传了一张大图片《${upload.filename}》。请逐字转写图片顶部显示的标记串（形如 N23PROBE-XXX-9999），只输出标记串；如果你看不到图片，请直接回答“看不到图片”。`
    const startedAt = Date.now()
    try {
      result.reply = await sendWithAttachments(token, sessionId, result.question, [upload.wire])
      result.sendMs = Date.now() - startedAt
      const match = matchMarker(result.reply, MARKERS.oversize)
      result.markerMatches = [{ marker: MARKERS.oversize, ...match }]
      result.outcome = match.matched ? 'visible' : /看不到|无法|不能/.test(result.reply) ? 'invisible-explicit' : 'invisible-silent'
    } catch (error) {
      // A rejected oversized image is the expected boundary behavior — as
      // long as the rejection is explicit (transport error, not silence).
      result.sendMs = Date.now() - startedAt
      result.error = String(error).slice(0, 400)
      result.outcome = 'rejected-at-send'
      console.log(`nocobase-n23: [oversized] send rejected explicitly: ${result.error}`)
    }
    console.log(`nocobase-n23: [oversized] outcome=${result.outcome}`)
  } catch (error) {
    result.error = String(error).slice(0, 400)
    result.outcome = fileId === undefined ? 'rejected-at-upload' : 'error'
    console.log(`nocobase-n23: [oversized] upload rejected explicitly: ${result.error}`)
  } finally {
    result.cleanup = await cleanup(token, sessionId, fileId)
  }
  return result
}

async function cleanupGroup(token: string, sessionId: string | undefined, fileIds: number[]): Promise<{ conversation: string, file: string }> {
  let conversation = 'not-created'
  if (sessionId !== undefined) {
    try {
      await call(token, 'POST', `/api/aiConversations:destroy?filterByTk=${encodeURIComponent(sessionId)}`)
      conversation = 'destroyed'
    } catch (error) {
      conversation = `destroy-failed: ${String(error).slice(0, 120)}`
      fail(`cleanup conversation ${sessionId}: ${String(error).slice(0, 200)}`)
    }
  }
  let file = 'not-created'
  if (fileIds.length > 0) {
    const statuses: string[] = []
    for (const id of fileIds) {
      try {
        await call(token, 'POST', `/api/aiFiles:destroy?filterByTk=${id}`)
        statuses.push('destroyed')
      } catch (error) {
        statuses.push(`destroy-failed: ${String(error).slice(0, 80)}`)
        fail(`cleanup aiFile ${id}: ${String(error).slice(0, 200)}`)
      }
    }
    file = statuses.join(',')
  }
  return { conversation, file }
}

// --- verdict + evidence -------------------------------------------------------------

/** Boundary acceptance: every cell must end visible or explicitly rejected; silence is the only failure. */
function cellVerdict(cell: CellResult): 'pass' | 'fail' {
  if (cell.outcome === 'visible' || cell.outcome === 'rejected-at-upload' || cell.outcome === 'rejected-at-send') return 'pass'
  if (cell.boundary === 'oversized' && cell.outcome === 'invisible-explicit') return 'pass'
  return 'fail'
}

async function writeEvidenceDoc(results: CellResult[], wiringNote: string, residueStart: string, residueEnd: string): Promise<void> {
  const now = new Date()
  const stamp = `${localDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const outcomeText = (cell: CellResult) => {
    switch (cell.outcome) {
      case 'visible': return '✅ 可见'
      case 'visible-partial': return '⚠️ 部分可见'
      case 'rejected-at-upload': return '🚫 上传层显式拒绝'
      case 'rejected-at-send': return '🚫 发送/模型层显式拒绝'
      case 'invisible-explicit': return '👁️ 模型明确说看不到'
      case 'invisible-silent': return '❌ 静默不可见'
      default: return '⚠️ 探测失败'
    }
  }
  const lines: string[] = []
  lines.push('# N23 图片支持边界探针证据（M3 原生 image_url 多模态路径）')
  lines.push('')
  lines.push(`> 探测时间 ${stamp} | 脚本 [nocobase-n23-image-boundary-probe.mts](../../scripts/nocobase-n23-image-boundary-probe.mts) | ${wiringNote} | 上游 MiniMax 文档口径：单图 ≤10MB、请求体 ≤64MB、JPEG/PNG/GIF/WEBP。`)
  lines.push('')
  lines.push('判定规则：图片内嵌位图字体标记串（N21 同款渲染器），经 `aiFiles:create` 上传后随 `aiConversations:sendMessages`（SSE 流式）发送给 AI 雇员 dex；模型回复（normalize 后容差 ≤2）含标记串 → 可见。多图格要求 3 个标记串全部复述；格式矩阵 png/jpg/webp 经宿主 ffmpeg 转码（转码即解码校验）；超大图（>10MB 噪声 PNG）允许的结局是「显式拒绝（记录行为）」或「可见」，静默丢弃判 FAIL。等待预算 150s，串行执行。')
  lines.push('')
  lines.push('## 1. 边界 × 行为矩阵')
  lines.push('')
  lines.push('| 边界 | 格/组 | 标记串 | 行为 | 验收 | 模型回复摘录 |')
  lines.push('|---|---|---|---|---|---|')
  for (const cell of results) {
    const stripThink = (text: string) => text.replace(/<think>[\s\S]*?<\/think>/gu, '').trim()
    const quote = cell.reply === null
      ? (cell.error ?? '（无回复）')
      : (stripThink(cell.reply).replace(/\|/g, '\\|').slice(0, 90) || cell.reply.replace(/\|/g, '\\|').slice(0, 90))
    lines.push(`| ${cell.boundary} | ${cell.id} | \`${cell.markerSummary.replace(/\|/g, '\\|')}\` | ${outcomeText(cell)} | ${cellVerdict(cell) === 'pass' ? '✅' : '❌'} | ${quote} |`)
  }
  lines.push('')
  lines.push('## 2. 每格证据')
  for (const cell of results) {
    lines.push('')
    lines.push(`### ${cell.id}（${outcomeText(cell)}）`)
    for (const upload of cell.uploads) {
      lines.push(`- 上传记录：aiFiles id=${upload.id}，服务端文件名 \`${upload.filename}\`，size=${upload.size}`)
    }
    if (cell.question !== '') lines.push(`- 提问原文：${cell.question}`)
    for (const match of cell.markerMatches) {
      lines.push(`- 标记 \`${match.marker}\`：${match.matched ? `复述命中${match.approximate ? '（字形容差内）' : '（逐字）'}` : '未复述'}`)
    }
    if (cell.reply !== null) {
      lines.push('- 模型回复（原文）：')
      lines.push('')
      lines.push('```text')
      lines.push(excerpt(cell.reply, 1200))
      lines.push('```')
    }
    if (cell.error !== null) lines.push(`- 错误/拒绝信息：${cell.error}`)
    if (cell.sendMs !== null) lines.push(`- 发送耗时：${(cell.sendMs / 1000).toFixed(1)}s`)
    lines.push(`- 清理：会话 ${cell.cleanup.conversation}；上传文件 ${cell.cleanup.file}`)
  }
  lines.push('')
  lines.push('## 3. 清理与幂等')
  lines.push('')
  lines.push(`- 运行开始残留断言：${residueStart}`)
  lines.push(`- 运行结束残留断言：${residueEnd}`)
  lines.push('- 每格会话经 `aiConversations:destroy` 销毁、上传文件经 `aiFiles:destroy` 删除（try/finally 保证）；二次运行开始时残留断言为 0 即为幂等证据。')
  lines.push('')
  lines.push('## 4. 结论（对代理的影响）')
  lines.push('')
  const silentCells = results.filter((cell) => cellVerdict(cell) === 'fail')
  if (silentCells.length === 0) {
    lines.push('- 全部边界格以「可见」或「显式拒绝」收尾，无静默丢弃：图片路径维持 N21 结论（M3 原生 `image_url` 直连已支持），**N22 代理无需 image part 改写，图片支持零改动**。')
  } else {
    lines.push(`- 静默不可见格：${silentCells.map((cell) => cell.id).join('、')} —— 需要代理扩展 image part 改写（本批次预期零改动，出现即为偏差，见 FAIL 输出）。`)
  }
  lines.push('')
  lines.push('## 5. webp 转码质量注记')
  lines.push('')
  lines.push('webp 探针经宿主 `cwebp -lossless` 生成：本机 ffmpeg 构建未带 libwebp 编码器，而 `cwebp -q 80` 有损压缩会损伤位图字形（实测模型将 `N23PROBE-WBP-7306` 转写为 `N23PROBE-HWP-7396`，Levenshtein 偏差 3 超出容差 2，但模型 think 链明确描述了图像内容——是字形降级而非不可见）。无损转码后像素与 png 格一致，判定回到与 png 对称的口径。')
  lines.push('')
  await writeFile(evidencePath, `${lines.join('\n')}\n`)
}

// --- main ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('nocobase-n23: signing in and reading the llmService wiring')
  const token = await signIn()
  const servicesPayload = await call(token, 'GET', '/api/llmServices:list?pageSize=10')
  const services = ((servicesPayload?.data ?? []) as Array<Record<string, any>>).map((row) => ({
    title: String(row.title ?? '?'),
    baseURL: String(row.options?.baseURL ?? '?'),
  }))
  const wiringNote = services.some((service) => service.baseURL.includes('127.0.0.1'))
    ? `llmService ${services.map((service) => `"${service.title}" → ${service.baseURL}`).join('、')}（经 N22 本地代理）`
    : `llmService ${services.map((service) => `"${service.title}" → ${service.baseURL}`).join('、')}（直连）`
  await assertNoResidue(token, 'start', { title: 'N23PROBE', filename: 'n23-probe' }, fail)
  const residueStartNote = failures.length === 0 ? '0 会话 / 0 文件（干净）' : '存在残留（见 FAIL 输出）'
  await mkdir(fixturesDir, { recursive: true })
  const results: CellResult[] = []
  results.push(await runMultiImage(token))
  await new Promise((resolve) => setTimeout(resolve, 3000))
  for (const format of ['png', 'jpg', 'webp'] as const) {
    results.push(await runFormatCell(token, format))
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  results.push(await runOversized(token))
  await assertNoResidue(token, 'end', { title: 'N23PROBE', filename: 'n23-probe' }, fail)
  const residueEndNote = failures.length === 0 ? '0 会话 / 0 文件（干净）' : '存在残留（见 FAIL 输出）'
  await writeEvidenceDoc(results, wiringNote, residueStartNote, residueEndNote)
  console.log('')
  console.log('nocobase-n23: matrix')
  for (const cell of results) {
    console.log(`  ${cell.id.padEnd(14)} ${cell.outcome.padEnd(20)} verdict=${cellVerdict(cell)}`)
  }
  console.log(`nocobase-n23: evidence at ${evidencePath}`)
  if (failures.length > 0) {
    console.error(`nocobase-n23: ${failures.length} failure(s), exit 1`)
    process.exitCode = 1
    return
  }
  console.log('nocobase-n23: done')
}

await main()
