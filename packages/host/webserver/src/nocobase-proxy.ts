/**
 * The optional `/nocobase` reverse proxy: a debugging and same-origin entry
 * carrier that forwards everything under the prefix to the deployment's
 * NocoBase origin (default `http://127.0.0.1:13000`), stripping the framing
 * headers (`x-frame-options`, CSP `frame-ancestors`) so the business page's
 * external entry can open the admin UI on the gateway's domain (login state
 * included). HTML entry responses are rewritten onto the proxy prefix — the
 * built index.html references every asset and runtime base path from the
 * origin root, which would 404 under the proxy prefix. Off unless
 * `nocobaseProxyOrigin` is set — the unauthenticated gateway must not proxy
 * a business backend by default.
 * @module @deepseek-ai/dsh-host-webserver/nocobase-proxy
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { request as httpRequest } from 'node:http'

/** The proxy's route prefix (matched by the webserver's longest-prefix rule). */
export const NOCOBASE_PROXY_PREFIX = '/nocobase'

/** Headers the proxy strips from upstream responses (framing guards only). */
const STRIP_RESPONSE_HEADERS = new Set(['x-frame-options', 'content-security-policy'])

/**
 * Request headers the proxy never forwards: the hop-by-hop set, plus
 * accept-encoding — the HTML rewrite needs the plain-text body, and identity
 * encoding on the loopback hop costs nothing measurable.
 */
const STRIP_REQUEST_HEADERS = new Set(['host', 'connection', 'transfer-encoding', 'keep-alive', 'upgrade', 'accept-encoding'])

/**
 * Rewrite one upstream HTML entry to serve under the proxy prefix: root-absolute
 * asset URLs gain the prefix, and the runtime base-path globals the NocoBase
 * client reads (webpack public path, app public path, API base, websocket
 * path) re-root onto the proxy so in-frame fetches and lazy chunks ride it.
 * @param html - the upstream index.html body (uncompressed).
 * @param prefix - the proxy prefix without a trailing slash (e.g. `/nocobase`).
 * @returns the rewritten HTML.
 */
export function rewriteNocobaseHtml(html: string, prefix: string): string {
  return html
    // (href|src)="/x" → (href|src)="<prefix>/x"; `//` (protocol-relative) stays.
    .replace(/((?:href|src)=")\/(?!\/)/gu, `$1${prefix}/`)
    .replace('window[\'__webpack_public_path__\'] = \'\';', `window['__webpack_public_path__'] = '${prefix}/';`)
    .replace('window[\'__nocobase_public_path__\'] = \'/\';', `window['__nocobase_public_path__'] = '${prefix}/';`)
    .replace('window[\'__nocobase_api_base_url__\'] = \'/api/\';', `window['__nocobase_api_base_url__'] = '${prefix}/api/';`)
    .replace('window[\'__nocobase_ws_path__\'] = \'/ws\';', `window['__nocobase_ws_path__'] = '${prefix}/ws';`)
}

/**
 * Rewrite the plugin manifest (`/api/pm:listEnabled`) onto the proxy prefix:
 * the client's module loader fetches every plugin bundle at the manifest's
 * root-absolute `url`/`clientV2Url`, which would 404 under the proxy
 * prefix. Structural, not a string splice — a body that is not the expected
 * JSON `{data: [...]}` shape passes through unchanged.
 * @param json - the upstream manifest body.
 * @param prefix - the proxy prefix without a trailing slash.
 * @returns the rewritten manifest JSON, or the body unchanged.
 */
export function rewriteNocobasePluginManifest(json: string, prefix: string): string {
  try {
    const parsed = JSON.parse(json) as { data?: Array<{ url?: unknown; clientV2Url?: unknown }> }
    if (!Array.isArray(parsed.data)) return json
    for (const entry of parsed.data) {
      if (typeof entry.url === 'string' && entry.url.startsWith('/')) entry.url = `${prefix}${entry.url}`
      if (typeof entry.clientV2Url === 'string' && entry.clientV2Url.startsWith('/')) entry.clientV2Url = `${prefix}${entry.clientV2Url}`
    }
    return JSON.stringify(parsed)
  } catch {
    // A non-JSON body (or one that does not parse) is not ours to rewrite.
    return json
  }
}

/** The upgrade route path the rewritten `__nocobase_ws_path__` points at. */
export const NOCOBASE_WS_PATH = '/nocobase/ws'

/**
 * Create the WebSocket upgrade forwarding handler for one upstream origin.
 * The browser handshake keeps its `connection`/`upgrade`/`sec-websocket-*`
 * headers through the proxy; the upstream 101 (or refusal) is written back
 * verbatim and the sockets are piped both ways for the frame stream.
 * @param origin - the NocoBase origin (scheme + host + port, no trailing slash).
 * @returns the WebUpgradeRoute handler.
 */
export function createNocobaseWsUpgradeHandler(origin: string): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  return (req, socket, head) => {
    const upstreamPath = req.url?.replace(/^\/nocobase(?=\/|$)/u, '') ?? '/'
    const headers: Record<string, string | string[]> = {}
    for (const [name, value] of Object.entries(req.headers)) {
      // Everything but Host rides through: the hop-by-hop upgrade pair and the
      // sec-websocket-* handshake fields are exactly what must reach upstream.
      if (value === undefined || name.toLowerCase() === 'host') continue
      headers[name] = value
    }
    if (req.headers.host !== undefined) headers['x-forwarded-host'] = req.headers.host
    headers['x-forwarded-proto'] = 'http'
    const upstream = httpRequest(`${origin}${upstreamPath}`, { method: 'GET', headers })
    const writeHead = (statusCode: number | undefined, statusMessage: string | undefined, resHeaders: IncomingMessage['headers']): void => {
      const lines = [
        `HTTP/1.1 ${statusCode ?? 200} ${statusMessage ?? ''}`.trimEnd(),
        ...Object.entries(resHeaders).flatMap(([name, value]) =>
          value === undefined ? [] : [`${name}: ${Array.isArray(value) ? value.join(', ') : value}`]),
      ]
      socket.write(`${lines.join('\r\n')}\r\n\r\n`)
    }
    upstream.once('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
      writeHead(upstreamRes.statusCode, upstreamRes.statusMessage, upstreamRes.headers)
      if (upstreamHead.length > 0) socket.write(upstreamHead)
      if (head.length > 0) upstreamSocket.write(head)
      upstreamSocket.pipe(socket)
      socket.pipe(upstreamSocket)
      // Either side ending tears down the pair: a half-open pipe would
      // otherwise leave the peer waiting on a socket that never closes.
      upstreamSocket.on('close', () => { socket.destroy() })
      socket.on('close', () => { upstreamSocket.destroy() })
    })
    // An upstream that answers the upgrade with a normal response (auth
    // failure, no ws route): relay the status line and headers, then the body.
    upstream.once('response', (res) => {
      writeHead(res.statusCode, res.statusMessage, res.headers)
      res.pipe(socket)
    })
    upstream.once('error', () => { socket.destroy() })
    upstream.end()
  }
}

/**
 * Create the forwarding handler for one upstream origin.
 * @param origin - the NocoBase origin (scheme + host + port, no trailing slash).
 * @returns the WebRoute handler.
 */
export function createNocobaseProxyHandler(origin: string): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    // Strip the route prefix: /nocobase/api/x → /api/x on the upstream.
    const upstreamPath = req.url?.replace(/^\/nocobase(?=\/|$)/u, '') ?? '/'
    const headers: Record<string, string | string[]> = {}
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || STRIP_REQUEST_HEADERS.has(name.toLowerCase())) continue
      headers[name] = value
    }
    // Declare the original request's origin: NocoBase's sign-in origin check
    // (and any same-origin logic) resolves the request origin from these
    // forwarding headers, so the proxied origin stays trusted.
    if (req.headers.host !== undefined) headers['x-forwarded-host'] = req.headers.host
    headers['x-forwarded-proto'] = 'http'
    const upstream = httpRequest(
      `${origin}${upstreamPath}`,
      { method: req.method, headers },
      (upstreamRes) => {
        const contentType = upstreamRes.headers['content-type'] ?? ''
        const isHtml = contentType.includes('text/html')
        const isPluginManifest = contentType.includes('application/json') && upstreamPath.split('?')[0] === '/api/pm:listEnabled'
        if (!isHtml && !isPluginManifest) {
          for (const [name, value] of Object.entries(upstreamRes.headers)) {
            if (value === undefined || STRIP_RESPONSE_HEADERS.has(name.toLowerCase())) continue
            res.setHeader(name, value)
          }
          res.writeHead(upstreamRes.statusCode ?? 502)
          upstreamRes.pipe(res)
          return
        }
        const chunks: Buffer[] = []
        upstreamRes.on('data', (chunk: Buffer) => { chunks.push(chunk) })
        upstreamRes.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          const body = isHtml
            ? rewriteNocobaseHtml(raw, NOCOBASE_PROXY_PREFIX)
            : rewriteNocobasePluginManifest(raw, NOCOBASE_PROXY_PREFIX)
          for (const [name, value] of Object.entries(upstreamRes.headers)) {
            const lower = name.toLowerCase()
            if (value === undefined || STRIP_RESPONSE_HEADERS.has(lower)) continue
            // Rewriting changes the length; the buffered body carries its own.
            if (lower === 'content-length' || lower === 'transfer-encoding') continue
            res.setHeader(name, value)
          }
          res.setHeader('content-length', String(Buffer.byteLength(body)))
          res.writeHead(upstreamRes.statusCode ?? 502)
          res.end(body)
        })
        upstreamRes.on('error', (error) => { res.destroy(error) })
      },
    )
    upstream.on('error', (error) => {
      if (res.headersSent) { res.destroy(error); return }
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`nocobase proxy: upstream unreachable (${error instanceof Error ? error.message : String(error)})`)
    })
    req.pipe(upstream)
  }
}
