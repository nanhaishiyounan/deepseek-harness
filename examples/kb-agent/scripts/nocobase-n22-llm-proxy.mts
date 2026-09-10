/**
 * N22 local attachment proxy for the kb-agent NocoBase snapshot: a stateless
 * loopback-only OpenAI-compatible reverse proxy that makes PDF attachments
 * model-visible and keeps MiniMax-M3's inline `<think>…</think>` reasoning
 * out of user-facing replies. NocoBase's plugin-ai parses `application/pdf`
 * attachments into the OpenAI-proprietary `{type:'file', file:{file_data:…}}`
 * part (LangChain completions conversion), which MiniMax silently ignores —
 * the direct causal evidence is the N21 differential. This proxy rewrites
 * exactly that part shape on the wire: it decodes the base64 data URI,
 * extracts the PDF text layer through unpdf (the same channel as
 * packages/kb/tool-kb/src/extract.ts `extractPdfText`; zero new dependencies),
 * and replaces the part with a `{type:'text'}` part wrapped in the same
 * `<parsed_document filename="…">…</parsed_document>` envelope the upstream
 * document-loader path injects for docx/xlsx/md, so model behavior stays
 * uniform across attachment formats.
 *
 * Contract (fail-loud, never silently dropping content):
 * - Only `POST …/chat/completions` is forwarded (upstream base from
 *   MINIMAX_BASE_URL, default https://api.minimaxi.com/v1). Requests carry the
 *   caller's Authorization header verbatim; the key is validated against the
 *   repository-resolved MINIMAX_API_KEY and never logged.
 * - Request bodies are rewritten for PDF file parts; every other request byte
 *   passes through untouched.
 * - Response filtering (N25): MiniMax-M3 emits its reasoning inline in
 *   `choices[].delta.content` as `<think>…</think>` before the answer (no
 *   separate reasoning field exists on this wire — verified against a full
 *   captured stream). With filtering on (default), both SSE streams and
 *   non-streamed JSON bodies have think segments stripped by a per-stream
 *   state machine that buffers partial tag prefixes across chunk boundaries;
 * frames whose content is unchanged are forwarded byte-identical, and a
 * frame the filter cannot parse passes through verbatim (fail-open on
 * shape, never dropping non-think text). A stream truncated without
 * finish frames still releases each choice's held partial-tag answer
 * text as one synthesized delta frame. Per-stream statistics (segment
 * count, stripped characters) are logged; reply text is never logged.
 * - Filter rollback: set `N22_FILTER_THINK=0` (or `false`/`off`) and restart
 *   with `ai-proxy stop && ai-proxy start` — response bytes then pass through
 *   untouched. Full proxy rollback stays `ai-proxy stop` / `ai-direct`
 *   (llmService baseURL back to the direct upstream).
 * - PDF text extraction failure or an unsupported file-part MIME fails loud
 *   with an explicit HTTP error naming the file; a silently-ignored attachment
 *   is exactly the failure mode this proxy exists to remove.
 * - Extracted text longer than 200,000 characters is truncated with an
 *   explicit marker (keeps requests clear of MiniMax-M3's >512k-token
 *   doubled-price tier).
 * - `GET /healthz` answers keylessly with liveness, rewrite counters, and the
 *   think-filter switch state for the verify gate (`setup-nocobase.mts`
 *   verify).
 *
 * Lifecycle is owned by setup-nocobase.mts (`ai-proxy start|stop`), which
 * spawns this script detached; running it directly from a terminal is also
 * supported (Ctrl-C stops it). Usage:
 * `node --env-file=.env --import tsx/esm examples/kb-agent/scripts/nocobase-n22-llm-proxy.mts`
 */
import http from 'node:http'
import { Readable, Transform } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { extractText, getDocumentProxy } from 'unpdf'
import { resolveEnv } from './resolve-env.ts'
import { withResilience } from './resilience.ts'

const HOST = '127.0.0.1'
const PORT = Number(process.env.NOCOBASE_AI_PROXY_PORT ?? 13_100)
const UPSTREAM_BASE = (process.env.MINIMAX_BASE_URL ?? 'https://api.minimaxi.com/v1').replace(/\/+$/, '')
/** Matches MiniMax's 64MB request-body ceiling with headroom for base64 inflation of one attachment. */
const MAX_BODY_BYTES = 100 * 1024 * 1024
/** Truncation ceiling for one extracted document, in characters. */
const MAX_DOC_CHARS = 200_000
/** One attempt only (a retried completion would double-bill); the budget runs to the first response byte — it covers MiniMax-M3's 15–100s pre-stream inference, and withResilience clears its timer once fetch resolves, so the streamed body download afterwards has no timeout. */
const UPSTREAM_BUDGET = { attempts: 1, timeoutMs: 300_000 } as const
/**
 * Strip `<think>…</think>` reasoning from responses unless N22_FILTER_THINK is
 * 0/false/off (the rollback switch documented above and in QUICKSTART.zh.md).
 */
const FILTER_THINK = !['0', 'false', 'off'].includes((process.env.N22_FILTER_THINK ?? '').trim().toLowerCase())
const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'

interface FilePartRewrite {
  filename: string
  bytesIn: number
  textChars: number
  truncated: boolean
}

interface RewriteOutcome {
  body: string
  rewrites: FilePartRewrite[]
  partsBefore: number
  partsAfter: number
}

class ProxyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const startedAt = Date.now()
let requestsForwarded = 0
let requestsRewritten = 0
let partsRewritten = 0

/** One structured single-line log event; authorization values never appear here. */
function logEvent(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }))
}

/** Length of the longest suffix of `text` that is a proper prefix of `tag`. */
function partialTagSuffixLength(text: string, tag: string): number {
  const max = Math.min(tag.length - 1, text.length)
  for (let k = max; k > 0; k -= 1) {
    if (text.endsWith(tag.slice(0, k))) return k
  }
  return 0
}

/**
 * Per-stream `<think>` segment stripper. `push` folds one delta's content and
 * returns what is safe to emit now: a partial tag prefix (`<th` split across
 * chunks) is held back until the next push either completes the tag or proves
 * the text literal. `flush` runs at the finish frame / body end: a held
 * prefix outside think is real text, inside think it is dropped reasoning.
 */
export class ThinkFilter {
  private insideThink = false
  private hold = ''
  segments = 0
  charsStripped = 0

  push(content: string): string {
    const text = this.hold + content
    this.hold = ''
    let out = ''
    let i = 0
    while (i < text.length) {
      const tag = this.insideThink ? THINK_CLOSE : THINK_OPEN
      const at = text.indexOf(tag, i)
      if (at === -1) {
        const rest = text.slice(i)
        const keep = partialTagSuffixLength(rest, tag)
        this.hold = rest.slice(rest.length - keep)
        if (this.insideThink) this.charsStripped += rest.length - keep
        else out += rest.slice(0, rest.length - keep)
        return out
      }
      if (this.insideThink) {
        this.charsStripped += at - i + tag.length
      } else {
        out += text.slice(i, at)
        this.charsStripped += tag.length
        this.segments += 1
      }
      this.insideThink = !this.insideThink
      i = at + tag.length
    }
    return out
  }

  flush(): string {
    const held = this.hold
    this.hold = ''
    if (this.insideThink) {
      this.charsStripped += held.length
      return ''
    }
    return held
  }

  get unterminated(): boolean {
    return this.insideThink
  }
}

interface FilterStats {
  segments: number
  charsStripped: number
  unterminated: boolean
  changed: boolean
}

function aggregateStats(stats: FilterStats, filter: ThinkFilter, changed: boolean): void {
  stats.segments += filter.segments
  stats.charsStripped += filter.charsStripped
  stats.unterminated ||= filter.unterminated
  stats.changed ||= changed
}

/**
 * SSE transform that rewrites `choices[].delta.content` through one ThinkFilter
 * per choice index. Frames are split on the `\n\n` event boundary; a frame
 * that is not a single parseable `data: {json}` event passes through
 * byte-identical, and so does any frame whose content the filter left
 * unchanged. The finish frame absorbs any held partial-tag text via flush()
 * so ordering stays content-before-stop; a stream that ends without finish
 * frames releases held text the same way (one synthesized frame per choice).
 */
export class SseThinkRewriter extends Transform {
  private frame = ''
  // Multibyte UTF-8 can split across socket chunks; StringDecoder keeps
  // partial sequences intact instead of emitting replacement characters.
  private readonly decoder = new StringDecoder('utf8')
  private readonly filters = new Map<number, ThinkFilter>()
  readonly stats: FilterStats = { segments: 0, charsStripped: 0, unterminated: false, changed: false }
  framesTotal = 0
  framesRewritten = 0

  private filterFor(index: number): ThinkFilter {
    let filter = this.filters.get(index)
    if (filter === undefined) {
      filter = new ThinkFilter()
      this.filters.set(index, filter)
    }
    return filter
  }

  override _transform(chunk: Buffer, _encoding: string, callback: (error?: Error | null, data?: string) => void): void {
    this.frame += this.decoder.write(chunk)
    for (;;) {
      const at = this.frame.indexOf('\n\n')
      if (at === -1) break
      const event = this.frame.slice(0, at + 2)
      this.frame = this.frame.slice(at + 2)
      this.push(this.rewriteEvent(event))
    }
    callback()
  }

  override _flush(callback: (error?: Error | null, data?: string) => void): void {
    const tail = this.decoder.end()
    if (tail !== '') this.frame += tail
    if (this.frame !== '') {
      // A trailing event without its final blank line still deserves one pass.
      this.push(this.rewriteEvent(this.frame))
      this.frame = ''
    }
    this.releaseHeldText()
    for (const filter of this.filters.values()) aggregateStats(this.stats, filter, false)
    this.stats.changed = this.framesRewritten > 0
    callback()
  }

  /**
   * End-of-stream release for upstream truncation: when no finish frame ever
   * arrived, each choice's held partial-tag text is still flushed — outside
   * think it is real answer text, re-emitted as one synthesized delta frame so
   * it cannot be silently dropped; inside think it is dropped reasoning and
   * only counts into charsStripped.
   */
  private releaseHeldText(): void {
    for (const [index, filter] of this.filters) {
      const released = filter.flush()
      if (released === '') continue
      this.framesRewritten += 1
      this.push(`data: ${JSON.stringify({ choices: [{ index, delta: { role: 'assistant', content: released } }] })}\n\n`)
    }
  }

  /** One SSE event in, the same event (verbatim or content-rewritten) out. */
  private rewriteEvent(event: string): string {
    this.framesTotal += 1
    if (!event.startsWith('data: ') || !event.endsWith('\n\n')) return event
    let parsed: {
      choices?: Array<{ index?: number, finish_reason?: string | null, delta?: { content?: unknown } }>
    }
    try {
      parsed = JSON.parse(event.slice(6, -2)) as typeof parsed
    } catch {
      return event
    }
    let changed = false
    for (const choice of parsed.choices ?? []) {
      const delta = choice?.delta
      if (delta === null || typeof delta !== 'object') continue
      const filter = this.filterFor(choice.index ?? 0)
      const hadContent = typeof delta.content === 'string'
      let next = hadContent ? filter.push(delta.content as string) : ''
      if (choice.finish_reason != null && choice.finish_reason !== '') next += filter.flush()
      if (next !== (hadContent ? (delta.content as string) : '')) {
        delta.content = next
        changed = true
      }
    }
    if (!changed) return event
    this.framesRewritten += 1
    return `data: ${JSON.stringify(parsed)}\n\n`
  }
}

/**
 * Strip think segments from one non-streamed chat-completions body. Any parse
 * or shape surprise returns the original bytes verbatim (fail-open).
 */
export function filterNonStreamBody(raw: Buffer): { body: Buffer, stats: FilterStats } {
  const stats: FilterStats = { segments: 0, charsStripped: 0, unterminated: false, changed: false }
  try {
    const parsed = JSON.parse(raw.toString('utf8')) as {
      choices?: Array<{ index?: number, message?: { content?: unknown } }>
    }
    for (const choice of parsed.choices ?? []) {
      const message = choice?.message
      if (message === null || typeof message !== 'object') continue
      if (typeof message.content !== 'string') continue
      const filter = new ThinkFilter()
      const next = `${filter.push(message.content)}${filter.flush()}`
      aggregateStats(stats, filter, next !== message.content)
      if (next !== message.content) message.content = next
    }
    return { body: stats.changed ? Buffer.from(JSON.stringify(parsed), 'utf8') : raw, stats }
  } catch {
    return { body: raw, stats }
  }
}

function sendJson(res: http.ServerResponse, status: number, payload: Record<string, unknown>): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        reject(new ProxyError(413, `request body exceeds ${MAX_BODY_BYTES} bytes`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** Extract the PDF text layer through unpdf; mirrors extract.ts's boundary handling. */
async function extractPdfText(bytes: Buffer): Promise<string> {
  // unpdf rejects Buffer instances (a Uint8Array subclass) at its boundary;
  // copy into a plain Uint8Array so the decoder accepts every input shape.
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

/**
 * Replace every OpenAI file part inside one chat-completions request body
 * with a `<parsed_document>` text part. Only `application/pdf` file parts
 * exist on this wire (plugin-ai routes every other document format through
 * the upstream document-loader); any other MIME fails loud instead of being
 * forwarded into MiniMax's silent-ignore path.
 */
async function rewriteFileParts(raw: string): Promise<RewriteOutcome> {
  let body: { messages?: Array<{ content?: unknown }> }
  try {
    body = JSON.parse(raw) as { messages?: Array<{ content?: unknown }> }
  } catch {
    // An unparseable body is not ours to fix: forward it verbatim and let the
    // upstream surface its own error.
    return { body: raw, rewrites: [], partsBefore: 0, partsAfter: 0 }
  }
  const rewrites: FilePartRewrite[] = []
  let partsBefore = 0
  let partsAfter = 0
  for (const message of body.messages ?? []) {
    if (!Array.isArray(message.content)) continue
    partsBefore += message.content.length
    const nextParts: unknown[] = []
    for (const part of message.content) {
      const filePart = part as { type?: unknown, file?: { file_data?: unknown, filename?: unknown } }
      if (filePart?.type !== 'file' || typeof filePart.file?.file_data !== 'string') {
        nextParts.push(part)
        continue
      }
      const filename = typeof filePart.file.filename === 'string' && filePart.file.filename !== '' ? filePart.file.filename : 'attachment.pdf'
      const match = /^data:([^;,]+);base64,([\s\S]*)$/u.exec(filePart.file.file_data)
      if (match === null || match[1] === undefined || match[2] === undefined) {
        throw new ProxyError(400, `attachment "${filename}" carries a file part without a base64 data URI; the N22 proxy cannot rewrite it`)
      }
      const [, mime, base64] = match
      if (mime !== 'application/pdf') {
        throw new ProxyError(400, `attachment "${filename}" has unsupported file-part MIME "${mime}"; only application/pdf is rewritten (other document formats must stay on the upstream document-loader path)`)
      }
      const bytes = Buffer.from(base64, 'base64')
      if (bytes.length === 0) {
        throw new ProxyError(400, `attachment "${filename}" decoded to zero bytes`)
      }
      let text: string
      try {
        text = await extractPdfText(bytes)
      } catch (cause) {
        throw new ProxyError(502, `PDF text extraction failed for attachment "${filename}" (${bytes.length} bytes): ${String(cause).slice(0, 300)}`)
      }
      if (text.trim() === '') {
        throw new ProxyError(502, `PDF attachment "${filename}" has no extractable text layer (scanned/image-only PDFs are unsupported)`)
      }
      const truncated = text.length > MAX_DOC_CHARS
      if (truncated) text = `${text.slice(0, MAX_DOC_CHARS)}\n[附件文本超过 ${MAX_DOC_CHARS} 字符，已截断（原文共 ${text.length} 字符）]`
      rewrites.push({ filename, bytesIn: bytes.length, textChars: text.length, truncated })
      nextParts.push({ type: 'text', text: `<parsed_document filename="${filename}">\n${text}\n</parsed_document>` })
    }
    // Every file part becomes exactly one text part, so the before/after
    // counts only diverge if the replacement rule itself ever changes.
    partsAfter += nextParts.length
    message.content = nextParts
  }
  return { body: JSON.stringify(body), rewrites, partsBefore, partsAfter }
}

async function handleCompletions(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
  const expectedKey = resolveEnv('MINIMAX_API_KEY')
  if (expectedKey === undefined) {
    throw new ProxyError(500, 'MINIMAX_API_KEY not found in env nor the repository root .env; the proxy cannot validate callers')
  }
  const authorization = req.headers.authorization
  if (authorization !== `Bearer ${expectedKey}`) {
    logEvent({ event: 'reject', reason: 'authorization-mismatch', path: pathname })
    sendJson(res, 401, { error: { message: 'invalid or missing Authorization bearer (expected the configured MINIMAX_API_KEY)' } })
    return
  }
  const raw = (await readBody(req)).toString('utf8')
  const rewritten = await rewriteFileParts(raw)
  for (const rewrite of rewritten.rewrites) {
    logEvent({
      event: 'rewrite',
      file: rewrite.filename,
      bytesIn: rewrite.bytesIn,
      textChars: rewrite.textChars,
      truncated: rewrite.truncated,
      partsBefore: rewritten.partsBefore,
      partsAfter: rewritten.partsAfter,
    })
  }
  const started = Date.now()
  const upstream = await withResilience(
    'ai-proxy upstream chat/completions',
    async (signal) => {
      const response = await fetch(`${UPSTREAM_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization,
          accept: typeof req.headers.accept === 'string' ? req.headers.accept : '*/*',
        },
        body: rewritten.body,
        signal,
        // Neither undici nor Node follows redirects for fetch by default;
        // keep it that way so an upstream redirect can never silently move
        // the authorization header to a different origin.
        redirect: 'error',
      })
      if (response.body === null) {
        throw new ProxyError(502, `upstream ${UPSTREAM_BASE}/chat/completions returned no body (HTTP ${response.status})`)
      }
      return response
    },
    UPSTREAM_BUDGET,
  )
  requestsForwarded += 1
  if (rewritten.rewrites.length > 0) {
    requestsRewritten += 1
    partsRewritten += rewritten.rewrites.length
  }
  const model = /"model"\s*:\s*"([^"]*)"/.exec(raw)?.[1] ?? null
  logEvent({
    event: 'forward',
    model: model ?? null,
    stream: /"stream"\s*:\s*true/.test(raw),
    upstreamStatus: upstream.status,
    ms: Date.now() - started,
    rewrites: rewritten.rewrites.length,
  })
  const contentType = upstream.headers.get('content-type') ?? 'application/json; charset=utf-8'
  // Readable.fromWeb locks the body reader; create it only on streaming
  // paths so the buffered non-stream branch can still read arrayBuffer().
  const pipeUpstream = (): void => {
    const nodeStream = Readable.fromWeb(upstream.body as unknown as WebReadableStream<Uint8Array>)
    nodeStream.on('error', (error) => {
      logEvent({ event: 'upstream-stream-error', error: String(error).slice(0, 200) })
      res.destroy()
    })
    nodeStream.pipe(res)
  }
  if (FILTER_THINK && contentType.includes('text/event-stream')) {
    res.writeHead(upstream.status, { 'content-type': contentType })
    const rewriter = new SseThinkRewriter()
    rewriter.on('error', (error) => {
      logEvent({ event: 'upstream-stream-error', error: String(error).slice(0, 200) })
      res.destroy()
    })
    rewriter.on('finish', () => {
      logEvent({
        event: 'think-filter',
        stream: true,
        segments: rewriter.stats.segments,
        charsStripped: rewriter.stats.charsStripped,
        framesRewritten: rewriter.framesRewritten,
        framesTotal: rewriter.framesTotal,
        unterminatedThink: rewriter.stats.unterminated,
      })
    })
    const nodeStream = Readable.fromWeb(upstream.body as unknown as WebReadableStream<Uint8Array>)
    nodeStream.on('error', (error) => {
      logEvent({ event: 'upstream-stream-error', error: String(error).slice(0, 200) })
      res.destroy()
    })
    nodeStream.pipe(rewriter).pipe(res)
    return
  }
  if (FILTER_THINK) {
    // Non-streamed JSON, including upstream error bodies (which carry no
    // choices[].message.content and fail open to verbatim bytes).
    const raw = Buffer.from(await upstream.arrayBuffer())
    const { body, stats } = filterNonStreamBody(raw)
    res.writeHead(upstream.status, { 'content-type': contentType, 'content-length': body.length })
    res.end(body)
    logEvent({
      event: 'think-filter',
      stream: false,
      segments: stats.segments,
      charsStripped: stats.charsStripped,
      unterminatedThink: stats.unterminated,
    })
    return
  }
  // Filter off: stream the upstream body through untouched — SSE chunk
  // boundaries and ordering survive because nothing inspects or buffers the bytes.
  res.writeHead(upstream.status, { 'content-type': contentType })
  pipeUpstream()
}

const server = http.createServer((req, res) => {
  const pathname = (req.url ?? '/').split('?')[0] ?? '/'
  void (async () => {
    try {
      if (req.method === 'GET' && pathname === '/healthz') {
        sendJson(res, 200, {
          ok: true,
          upstream: UPSTREAM_BASE,
          filterThink: FILTER_THINK,
          uptimeSec: Math.round((Date.now() - startedAt) / 1000),
          requestsForwarded,
          requestsRewritten,
          partsRewritten,
        })
        return
      }
      if (req.method === 'POST' && pathname.endsWith('/chat/completions')) {
        await handleCompletions(req, res, pathname)
        return
      }
      sendJson(res, 404, { error: { message: `no route for ${req.method} ${pathname} (expected GET /healthz or POST */chat/completions)` } })
    } catch (error) {
      const status = error instanceof ProxyError ? error.status : 500
      const message = error instanceof Error ? error.message : String(error)
      logEvent({ event: 'error', status, error: message.slice(0, 300) })
      if (!res.headersSent) sendJson(res, status, { error: { message: `n22-ai-proxy: ${message}` } })
      else res.destroy()
    }
  })()
})

// The N25 think-filter tests import this module's filter machinery; only bind
// the listener when executed directly.
const isEntry = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntry) {
  server.listen(PORT, HOST, () => {
    logEvent({ event: 'listening', host: HOST, port: PORT, upstream: UPSTREAM_BASE, filterThink: FILTER_THINK, maxDocChars: MAX_DOC_CHARS })
  })
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logEvent({ event: 'shutdown', signal })
      server.close(() => process.exit(0))
      // In-flight SSE pipes close with the server; do not hang on them.
      setTimeout(() => process.exit(0), 2000).unref()
    })
  }
}
