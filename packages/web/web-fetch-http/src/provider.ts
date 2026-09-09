/**
 * Safe HTTP(S) retrieval for `ctx.web`: validates URLs, follows only same-origin redirects,
 * enforces time and size limits, classifies and decodes text, and leaves presentation to
 * `@deepseek-ai/dsh-tool-web`. Requests carry no browser cookies or ambient credentials.
 * A request's `pinnedAddresses` (from the caller's SSRF policy) connect directly, keeping
 * the URL's Host header and TLS SNI, so DNS cannot re-answer between the policy check
 * and the connect.
 *
 * Admission policy itself is not implemented: the provider resolves hostnames normally
 * for unpinned requests, so callers that need a private-network gate must run one and
 * send its admitted addresses.
 * @module @deepseek-ai/dsh-web-fetch-http/provider
 */

import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'
import { WebError } from '@deepseek-ai/dsh-web'
import type { WebFetchBody, WebFetchProvider, WebFetchRequest, WebFetchResult } from '@deepseek-ai/dsh-web'
import { deadline, timeoutOf } from '@deepseek-ai/dsh-timeout'
import { classifyContentType, decoderForCharset, isSameOrigin, parseCharset, validateFetchUrl } from './policy.ts'

/** Resolved provider limits (the plugin's schemastery Config supplies defaults). */
export interface HttpFetchLimits {
  /** Maximum accepted request URL length. */
  maxUrlLength: number
  /** Maximum response body size in bytes (read is aborted past this). */
  maxResponseBytes: number
  /** Maximum decoded body length in characters (truncated past this). */
  maxBodyChars: number
  /** Default fetch timeout in milliseconds. */
  timeoutMs: number
  /** Maximum number of (same-origin) redirect hops to follow. */
  maxRedirects: number
  /** `User-Agent` header sent on every request. */
  userAgent: string
}

/** The fixed `Accept` face every outbound request carries. */
const ACCEPT_HEADER = 'text/html,application/xhtml+xml,text/*;q=0.9,application/json;q=0.8'

/** Stable id this provider registers under. */
export const LOCAL_FETCH_PROVIDER_ID = 'http'

/** The anonymous public HTTP(S) fetch provider. */
export class HttpFetchProvider implements WebFetchProvider {
  readonly id = LOCAL_FETCH_PROVIDER_ID

  constructor(private readonly limits: HttpFetchLimits) {}

  /** No credentials to check — an anonymous public fetcher is always usable. */
  available(): boolean {
    return true
  }

  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    if (signal?.aborted) throw new WebError('web fetch aborted', 'WEB_ABORTED')

    // One signal stops both the request and body read. The deadline's TimeoutReason later
    // distinguishes this provider's timeout from caller or outer-deadline cancellation.
    using d = deadline(signal, this.limits.timeoutMs, 'WEB_FETCH_TIMEOUT')
    return await this.followAndRead(request.url, d.signal, request.pinnedAddresses)
  }

  /** Follow same-origin redirects up to the hop cap, then read the final response. */
  private async followAndRead(
    initialUrl: string,
    signal: AbortSignal,
    pinnedAddresses: readonly string[] | undefined,
  ): Promise<WebFetchResult> {
    let currentUrl = validateFetchUrl(initialUrl, this.limits.maxUrlLength)
    let redirectsFollowed = 0

    for (;;) {
      const response = await this.requestOnce(currentUrl, signal, pinnedAddresses)

      if (isRedirectStatus(response.status)) {
        // Enforce the redirect budget before resolving or validating the next hop.
        if (redirectsFollowed >= this.limits.maxRedirects) {
          await response.body?.cancel()
          throw new WebError(`exceeded the maximum of ${this.limits.maxRedirects} redirects`, 'WEB_REDIRECT_BLOCKED')
        }
        const location = response.headers.get('location')
        if (location === null) {
          // A redirect status with no Location is not a usable resource. Cancel
          // the (possibly streaming) body before throwing so no socket leaks.
          await response.body?.cancel()
          throw new WebError(`redirect response (HTTP ${response.status}) without a Location header`, 'WEB_PROVIDER_ERROR')
        }
        const target = resolveRedirect(location, currentUrl)
        // Re-validate the target against the same transport hygiene a direct request gets: a
        // redirect must not be a back door to a credentialed, non-http(s), or over-long URL
        // that validateFetchUrl would reject.
        let validatedTarget: URL
        try {
          validatedTarget = validateFetchUrl(target.toString(), this.limits.maxUrlLength)
          if (!isSameOrigin(validatedTarget, currentUrl)) {
            throw new WebError(
              `cross-origin redirect to ${validatedTarget.origin} is not followed automatically; retry against that URL directly`,
              'WEB_REDIRECT_BLOCKED',
            )
          }
        } catch (error: unknown) {
          await response.body?.cancel()
          throw error
        }
        await response.body?.cancel()
        currentUrl = validatedTarget
        redirectsFollowed++
        continue
      }

      return await this.readBody(response, currentUrl, signal)
    }
  }

  private async requestOnce(url: URL, signal: AbortSignal, pinnedAddresses: readonly string[] | undefined): Promise<Response> {
    const pins = pinnedAddresses ?? []
    if (pins.length === 0) {
      try {
        return await fetch(url, {
          method: 'GET',
          redirect: 'manual',
          headers: { 'user-agent': this.limits.userAgent, 'accept': ACCEPT_HEADER },
          signal,
        })
      } catch (error: unknown) {
        throw translateAbortOrNetwork(error, signal)
      }
    }
    return await this.pinnedRequest(url, pins, signal)
  }

  /**
   * Connect to the caller-admitted addresses directly, trying the next
   * address when one refuses the connection. DNS is never consulted, so a
   * re-answer between the caller's SSRF check and this connect cannot
   * redirect the request to a host the check never saw.
   */
  private async pinnedRequest(url: URL, addresses: readonly string[], signal: AbortSignal): Promise<Response> {
    let failure: unknown
    for (const address of addresses) {
      try {
        return await this.connectPinned(url, address, signal)
      } catch (error: unknown) {
        failure = error
        if (signal.aborted) break
      }
    }
    throw translateAbortOrNetwork(failure, signal)
  }

  /**
   * One pinned attempt: TCP to `address` while the Host header and TLS SNI
   * keep the URL's own hostname (so virtual hosting and certificate
   * verification stay truthful), wrapped into the same `Response` shape the
   * fetch path produces.
   */
  private connectPinned(url: URL, address: string, signal: AbortSignal): Promise<Response> {
    const secure = url.protocol === 'https:'
    return new Promise<Response>((resolve, reject) => {
      const send = secure ? httpsRequest : httpRequest
      const request = send({
        host: address,
        /* v8 ignore next -- the default-port arms need a listener on privileged port 80/443; every pinned test binds an ephemeral port. */
        port: url.port === '' ? (secure ? 443 : 80) : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        ...secure ? { servername: url.hostname } : {},
        headers: { host: url.host, 'user-agent': this.limits.userAgent, 'accept': ACCEPT_HEADER },
        signal,
      }, (incoming) => {
        const headers = new Headers()
        for (const [name, value] of Object.entries(incoming.headers)) {
          /* v8 ignore next -- Node omits absent headers instead of undefined-ing them; the index signature still allows undefined. */
          if (value === undefined) continue
          for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item)
        }
        /* v8 ignore next -- a completed client response always carries statusCode; the property type stays optional. */
        const status = incoming.statusCode ?? 200
        // Null-body statuses reject a `Response` stream body outright; every
        // other status streams so caps and decoding run on the live socket.
        const bodyless = status === 204 || status === 205 || status === 304
        resolve(new Response(bodyless ? null : Readable.toWeb(incoming) as unknown as ReadableStream<Uint8Array>, { status, headers }))
      })
      request.on('error', reject)
      request.end()
    })
  }

  /** Read, byte-cap, classify, and decode the final response body. */
  private async readBody(response: Response, finalUrl: URL, signal: AbortSignal): Promise<WebFetchResult> {
    const contentType = response.headers.get('content-type')
    const kind = classifyContentType(contentType)
    if (kind === undefined) {
      await response.body?.cancel()
      throw new WebError(`unsupported content type "${contentType ?? 'unknown'}"`, 'WEB_UNSUPPORTED_CONTENT_TYPE')
    }

    // Resolve the decoder BEFORE reading the body so an unsupported charset
    // fails without consuming the stream — but cancel the body on that failure
    // so the socket does not leak (matching the unsupported-content-type path).
    let decoder: TextDecoder
    try {
      decoder = decoderForCharset(parseCharset(contentType))
    } catch (error: unknown) {
      await response.body?.cancel()
      throw error
    }
    const { bytes, truncatedByBytes } = await this.readCapped(response, signal)
    const decoded = decoder.decode(bytes)
    const truncatedByChars = decoded.length > this.limits.maxBodyChars
    const content = truncatedByChars ? decoded.slice(0, this.limits.maxBodyChars) : decoded
    const body: WebFetchBody = kind === 'html' ? { kind: 'html', content } : { kind: 'text', content }

    return {
      url: finalUrl.toString(),
      statusCode: response.status,
      body,
      truncated: truncatedByBytes || truncatedByChars,
    }
  }

  /**
   * Read the response stream up to `maxResponseBytes`. A `Content-Length` over
   * the cap rejects immediately with `WEB_FETCH_TOO_LARGE`; a stream that grows
   * past the cap is cut short (`truncatedByBytes`) rather than rejected, so a
   * server that under-reports still yields a bounded usable body.
   */
  private async readCapped(response: Response, signal: AbortSignal): Promise<{ bytes: Uint8Array; truncatedByBytes: boolean }> {
    const declared = response.headers.get('content-length')
    if (declared !== null) {
      const length = Number(declared)
      if (Number.isFinite(length) && length > this.limits.maxResponseBytes) {
        await response.body?.cancel()
        throw new WebError(`response exceeds the maximum of ${this.limits.maxResponseBytes} bytes`, 'WEB_FETCH_TOO_LARGE')
      }
    }

    /* v8 ignore next -- a 2xx Response from fetch always exposes a body stream; the null guard is defensive. */
    if (response.body === null) return { bytes: new Uint8Array(0), truncatedByBytes: false }

    const chunks: Uint8Array[] = []
    let total = 0
    let truncatedByBytes = false
    const reader = response.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const remaining = this.limits.maxResponseBytes - total
        // Only DROPPED bytes count as truncation: a chunk that exactly fills the
        // remaining capacity keeps all its bytes and we read on to observe EOF,
        // so an exactly-at-cap body is not falsely flagged truncated.
        if (value.byteLength > remaining) {
          chunks.push(value.subarray(0, remaining))
          total += remaining
          truncatedByBytes = true
          break
        }
        chunks.push(value)
        total += value.byteLength
      }
    } catch (error: unknown) {
      /* v8 ignore next -- mid-stream read fault needs a network drop after headers; translate path covered by request-phase tests. */
      throw translateAbortOrNetwork(error, signal)
    } finally {
      /* v8 ignore next 4 -- cancel() after a completed/broken read settles without rejecting; unobserved best-effort cleanup. */
      await reader.cancel().catch(() => {
        // Cancel after a successful read (or after we broke past the cap) is
        // best-effort cleanup; the bytes we need are already collected.
      })
    }

    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { bytes, truncatedByBytes }
  }
}

/** HTTP redirect status codes that carry a `Location`. */
function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

/** Resolve a (possibly relative) `Location` against the current URL. */
function resolveRedirect(location: string, base: URL): URL {
  try {
    return new URL(location, base)
  } catch (error: unknown) {
    /* v8 ignore next 2 -- URL resolution against a valid absolute base effectively never throws; defensive guard. */
    throw new WebError(`invalid redirect Location "${location}"`, 'WEB_PROVIDER_ERROR', { cause: error })
  }
}

/**
 * Translate a thrown fetch/stream error into a `WebError`, classified by the
 * deadline signal rather than the thrown value (which differs by phase: the
 * request-phase `fetch` rejects with the abort reason, while the read-phase
 * reader surfaces a bare `AbortError`). `timeoutOf(signal, 'WEB_FETCH_TIMEOUT')`
 * recovering OUR reason means our timeout fired (`WEB_FETCH_TIMEOUT`); any other
 * abort — an upstream cancel, or a foreign/outer deadline's timeout under
 * nesting — is `WEB_ABORTED`; a throw with the signal NOT aborted is a
 * transport/network failure (`WEB_PROVIDER_ERROR`).
 */
function translateAbortOrNetwork(error: unknown, signal: AbortSignal): WebError {
  const timeout = timeoutOf(signal, 'WEB_FETCH_TIMEOUT')
  if (timeout !== undefined) return new WebError('web fetch timed out', 'WEB_FETCH_TIMEOUT', { cause: timeout })
  if (signal.aborted) return new WebError('web fetch aborted', 'WEB_ABORTED', { cause: error })
  return new WebError(`web fetch failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
}
