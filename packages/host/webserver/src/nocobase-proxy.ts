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
 * asset URLs gain the prefix (href/src plus the og:image meta's content
 * attribute), and the runtime base-path globals the NocoBase client reads
 * (webpack public path, app public path, API base, websocket path, portal
 * base) re-root onto the proxy so in-frame fetches and lazy chunks ride it.
 * @param html - the upstream index.html body (uncompressed).
 * @param prefix - the proxy prefix without a trailing slash (e.g. `/nocobase`).
 * @returns the rewritten HTML.
 */
export function rewriteNocobaseHtml(html: string, prefix: string): string {
  return html
    // (href|src)="/x" → (href|src)="<prefix>/x"; `//` (protocol-relative) stays.
    .replace(/((?:href|src)=")\/(?!\/)/gu, `$1${prefix}/`)
    // The portal entries' `<meta property="og:image" content="/x">` and
    // `<meta name="twitter:image" content="/x">` carry the root-absolute
    // preview image (the overlaid logo-mark) in the content attribute, which
    // the href/src rewrite does not reach; the matched tag re-roots its own
    // content value while other meta content keeps its bytes.
    .replace(/<meta\b[^>]*\b(?:property="og:image"|name="twitter:image")[^>]*>/gu, tag => tag.replace(/(\bcontent=")\/(?!\/)/u, `$1${prefix}/`))
    // The deployed portal entries inline `window.NOCOBASE_PORTAL_BASE="/dist/<name>/"`
    // and `window.NOCOBASE_API_URL="/api"` (the deploy script's defines). Under
    // the prefix the portal is mounted at `<prefix>/dist/<name>/` and its API
    // rides `<prefix>/api`, so root-absolute values gain the prefix — the
    // entry's router basename, every runtime asset resolution, and the portal
    // runtime gate's API probes follow them.
    .replace(/window\.NOCOBASE_PORTAL_BASE="\/([^"]*)"/gu, `window.NOCOBASE_PORTAL_BASE="${prefix}/$1"`)
    .replace(/window\.NOCOBASE_API_URL="\/([^"]*)"/gu, `window.NOCOBASE_API_URL="${prefix}/$1"`)
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
 * The portal deep-link prefixes the webserver registers ahead of the plain
 * `/nocobase` route (longest prefix wins). Adding a portal here is the whole
 * wiring for its SPA fallback.
 */
export const NOCOBASE_PORTAL_PREFIXES = {
  crm: '/nocobase/dist/crm',
  hub: '/nocobase/dist/hub',
} as const

export type NocobasePortalName = keyof typeof NOCOBASE_PORTAL_PREFIXES

/**
 * Options for {@link createNocobaseProxyHandler}.
 */
export interface NocobaseProxyOptions {
  /**
   * SPA fallback for deep links: when the upstream answers 404 to a
   * navigation request (GET/HEAD whose Accept includes text/html) and this
   * path is set, the proxy fetches it instead — the portal entries are
   * history-mode SPAs whose routes exist only client-side, and the NocoBase
   * gateway serves `/dist/*` with no rewrites. Asset and API requests keep
   * their 404.
   */
  spaFallbackIndex?: string
}

/**
 * Create the portal deep-link handler for one deployed portal: the plain
 * proxy behavior plus the SPA fallback to the portal entry. The gateway's
 * static handler answers `/dist/<portal>/` with the index (a cleanUrls
 * `/dist/<portal>/index.html` only 301s to it), so the fallback path is the
 * directory form.
 * @param origin - the NocoBase origin (scheme + host + port, no trailing slash).
 * @param portal - the portal name (a key of {@link NOCOBASE_PORTAL_PREFIXES}).
 * @returns the WebRoute handler.
 */
/** Handler shape every proxy factory below returns. */
type ProxyHandler = (req: IncomingMessage, res: ServerResponse) => void

export function createNocobasePortalHandler(origin: string, portal: NocobasePortalName): ProxyHandler {
  return createNocobaseProxyHandler(origin, { spaFallbackIndex: `/dist/${portal}/` })
}

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
 * @param options - see {@link NocobaseProxyOptions}.
 * @returns the WebRoute handler.
 */
export function createNocobaseProxyHandler(origin: string, options: NocobaseProxyOptions = {}): ProxyHandler {
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
    // A navigation request is the SPA-fallback candidate: browsers ask for
    // text/html on document loads; asset and API fetches carry other types.
    const accept = req.headers.accept
    const isNavigation = (req.method === 'GET' || req.method === 'HEAD') && typeof accept === 'string' && accept.includes('text/html')
    const serveRewrittenBody = (status: number, body: string, resHeaders: IncomingMessage['headers']): void => {
      for (const [name, value] of Object.entries(resHeaders)) {
        const lower = name.toLowerCase()
        if (value === undefined || STRIP_RESPONSE_HEADERS.has(lower)) continue
        // Rewriting changes the length; the buffered body carries its own.
        if (lower === 'content-length' || lower === 'transfer-encoding') continue
        res.setHeader(name, value)
      }
      res.setHeader('content-length', String(Buffer.byteLength(body)))
      res.writeHead(status)
      res.end(req.method === 'HEAD' ? undefined : body)
    }
    const upstream = httpRequest(
      `${origin}${upstreamPath}`,
      { method: req.method, headers },
      (upstreamRes) => {
        // The static gateway redirects inside the deployment with origin-root
        // Locations (e.g. /dist/hub → /dist/hub/); re-root them onto the
        // proxy prefix — the symmetric opposite of stripping it above.
        const location = upstreamRes.headers.location
        const status = upstreamRes.statusCode ?? 0
        if (location !== undefined && location.startsWith('/') && !location.startsWith('//') && upstreamPath.startsWith('/dist/') && status >= 300 && status < 400) {
          upstreamRes.headers.location = `${NOCOBASE_PROXY_PREFIX}${location}`
        }
        const contentType = upstreamRes.headers['content-type'] ?? ''
        const isHtml = contentType.includes('text/html')
        const isPluginManifest = contentType.includes('application/json') && upstreamPath.split('?')[0] === '/api/pm:listEnabled'
        // SPA deep link: the gateway has no rewrites for /dist/* routes, so a
        // missing file is a client-side route, not a broken link — answer with
        // the portal entry (rewritten) instead of the 404 shell.
        if (options.spaFallbackIndex !== undefined && status === 404 && isNavigation) {
          upstreamRes.resume()
          const indexRequest = httpRequest(
            `${origin}${options.spaFallbackIndex}`,
            { method: 'GET', headers: { ...headers, accept: 'text/html' } },
            (indexRes) => {
              const chunks: Buffer[] = []
              indexRes.on('data', (chunk: Buffer) => { chunks.push(chunk) })
              indexRes.on('end', () => {
                if ((indexRes.statusCode ?? 502) !== 200) {
                  serveRewrittenBody(502, 'nocobase proxy: portal index unavailable', {})
                  return
                }
                serveRewrittenBody(200, rewriteNocobaseHtml(Buffer.concat(chunks).toString('utf8'), NOCOBASE_PROXY_PREFIX), indexRes.headers)
              })
              indexRes.on('error', (error) => { res.destroy(error) })
            },
          )
          indexRequest.on('error', (error) => {
            if (res.headersSent) { res.destroy(error); return }
            res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
            res.end(`nocobase proxy: upstream unreachable (${error instanceof Error ? error.message : String(error)})`)
          })
          indexRequest.end()
          return
        }
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
          serveRewrittenBody(upstreamRes.statusCode ?? 502, body, upstreamRes.headers)
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
