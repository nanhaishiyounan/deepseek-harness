/**
 * The optional `/carbon` reverse proxy: the same-origin entry that forwards
 * everything under the prefix to the deployment's carbon ERP origin
 * (default `http://127.0.0.1:3000`), stripping the framing headers
 * (`x-frame-options`, CSP `frame-ancestors`) so the business page's external
 * entry can open the ERP UI on the gateway's domain. HTML entry responses
 * are rewritten onto the proxy prefix — the dev-stack ERP (React Router v7
 * over Vite) references every asset, module, and runtime path from the
 * origin root, which would 404 under the prefix. Off unless
 * `carbonProxyOrigin` is set — the unauthenticated gateway must not proxy a
 * business backend by default.
 *
 * Dev-stack boundary: the ERP's vite HMR socket and its client-side data
 * channel (`/_data`) address the origin root from browser-resolved
 * JavaScript, beyond HTML-rewrite reach; whole-document navigation (each
 * route renders server-side through the proxy) is the supported path here,
 * and a production build's asset base closes the gap at deploy time.
 * @module @deepseek-ai/dsh-host-webserver/carbon-proxy
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { request as httpRequest } from 'node:http'

/** The proxy's route prefix (matched by the webserver's longest-prefix rule). */
export const CARBON_PROXY_PREFIX = '/carbon'

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
 * asset and module URLs gain the prefix (`href`/`src` and the modulepreload
 * link's `href` attribute are the same attribute shape), so the entry's
 * scripts and styles ride the proxy.
 * @param html - the upstream HTML body (uncompressed).
 * @param prefix - the proxy prefix without a trailing slash (e.g. `/carbon`).
 * @returns the rewritten HTML.
 */
export function rewriteCarbonHtml(html: string, prefix: string): string {
  return html
    // (href|src)="/x" → (href|src)="<prefix>/x"; `//` (protocol-relative) stays.
    .replace(/((?:href|src)=")\/(?!\/)/gu, `$1${prefix}/`)
}

/** Handler shape the proxy factories return. */
type ProxyHandler = (req: IncomingMessage, res: ServerResponse) => void

/**
 * Create the WebSocket upgrade forwarding handler for the upstream origin
 * (the dev stack's vite HMR socket): the browser handshake keeps its
 * `connection`/`upgrade`/`sec-websocket-*` headers through the proxy; the
 * upstream 101 (or refusal) is written back verbatim and the sockets are
 * piped both ways for the frame stream.
 * @param origin - the carbon ERP origin (scheme + host + port, no trailing slash).
 * @returns the WebUpgradeRoute handler.
 */
export function createCarbonWsUpgradeHandler(origin: string): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  return (req, socket, head) => {
    const upstreamPath = req.url?.replace(/^\/carbon(?=\/|$)/u, '') ?? '/'
    const headers: Record<string, string | string[]> = {}
    for (const [name, value] of Object.entries(req.headers)) {
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
    // An upstream that answers the upgrade with a normal response: relay the
    // status line and headers, then the body.
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
 * @param origin - the carbon ERP origin (scheme + host + port, no trailing slash).
 * @returns the WebRoute handler.
 */
export function createCarbonProxyHandler(origin: string): ProxyHandler {
  return (req, res) => {
    // Strip the route prefix: /carbon/sales-orders → /sales-orders upstream.
    const upstreamPath = req.url?.replace(/^\/carbon(?=\/|$)/u, '') ?? '/'
    const headers: Record<string, string | string[]> = {}
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || STRIP_REQUEST_HEADERS.has(name.toLowerCase())) continue
      headers[name] = value
    }
    // Declare the original request's origin so same-origin logic upstream
    // resolves the request from these forwarding headers.
    if (req.headers.host !== undefined) headers['x-forwarded-host'] = req.headers.host
    headers['x-forwarded-proto'] = 'http'
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
        // The dev server redirects inside the origin with root-absolute
        // Locations (e.g. /login); re-root them onto the proxy prefix.
        const location = upstreamRes.headers.location
        const status = upstreamRes.statusCode ?? 0
        if (location !== undefined && location.startsWith('/') && !location.startsWith('//') && status >= 300 && status < 400) {
          upstreamRes.headers.location = `${CARBON_PROXY_PREFIX}${location}`
        }
        const contentType = upstreamRes.headers['content-type'] ?? ''
        const isHtml = contentType.includes('text/html')
        if (!isHtml) {
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
          serveRewrittenBody(upstreamRes.statusCode ?? 502, rewriteCarbonHtml(Buffer.concat(chunks).toString('utf8'), CARBON_PROXY_PREFIX), upstreamRes.headers)
        })
        upstreamRes.on('error', (error) => { res.destroy(error) })
      },
    )
    upstream.on('error', (error) => {
      if (res.headersSent) { res.destroy(error); return }
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`carbon proxy: upstream unreachable (${error instanceof Error ? error.message : String(error)})`)
    })
    req.pipe(upstream)
  }
}
