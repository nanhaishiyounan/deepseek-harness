// The optional /nocobase reverse proxy: the prefix strip on the upstream
// path, the framing-guard header strip (x-frame-options, CSP), request-body
// forwarding, the HTML-entry rewrite onto the proxy prefix, the 502 when the
// upstream is unreachable, and that the constructor registers the route only
// when the origin config is set.

import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { connect } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '../src/index.ts'
import { createNocobaseProxyHandler, NOCOBASE_PROXY_PREFIX, rewriteNocobaseHtml, rewriteNocobasePluginManifest } from '../src/nocobase-proxy.ts'

/** One recorded proxied request the fake upstream saw. */
interface UpstreamHit {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body: string
}

let upstream: Server | undefined

afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (upstream === undefined) { resolve(); return }
    upstream.close(() => { resolve() })
    upstream.closeAllConnections()
    upstream = undefined
  })
})

/** Boot a fake NocoBase on an OS-assigned port answering one scripted hit. */
async function fakeUpstream(hits: UpstreamHit[], respond: (res: import('node:http').ServerResponse) => void): Promise<string> {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += String(chunk) })
    req.on('end', () => {
      hits.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body })
      respond(res)
    })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  upstream = server
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no address')
  return `http://127.0.0.1:${address.port}`
}

/** Drive the handler with one raw request. */
async function call(handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void, path: string, init: RequestInit = {}): Promise<Response> {
  const transport = createServer((req, res) => { handler(req, res) })
  await new Promise<void>((resolve) => { transport.listen(0, '127.0.0.1', () => { resolve() }) })
  const address = transport.address()
  if (address === null || typeof address === 'string') throw new Error('no address')
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init)
  await new Promise<void>((resolve) => { transport.close(() => { resolve() }); transport.closeAllConnections() })
  return response
}

describe('nocobase proxy handler', () => {
  it('strips the prefix, forwards method/body/headers, and drops framing guards', async () => {
    const hits: UpstreamHit[] = []
    const origin = await fakeUpstream(hits, (res) => {
      res.setHeader('x-frame-options', 'SAMEORIGIN')
      res.setHeader('content-security-policy', "frame-ancestors 'self'")
      res.setHeader('content-type', 'text/html')
      res.end('<html>admin</html>')
    })
    const handler = createNocobaseProxyHandler(origin)
    const response = await call(handler, '/nocobase/api/x?a=1', {
      method: 'POST',
      headers: { 'x-custom': 'v' },
      body: 'payload',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-frame-options')).toBeNull()
    expect(response.headers.get('content-security-policy')).toBeNull()
    expect(response.headers.get('content-type')).toBe('text/html')
    expect(await response.text()).toBe('<html>admin</html>')
    expect(hits[0]?.url).toBe('/api/x?a=1')
    expect(hits[0]?.method).toBe('POST')
    expect(hits[0]?.body).toBe('payload')
    expect(hits[0]?.headers['x-custom']).toBe('v')
    // node re-mints Host to the upstream origin (the stripped client Host
    // never leaks); the visible value is the upstream address, not the proxy's.
    expect(String(hits[0]?.headers.host)).toContain(new URL(origin).port)
  })

  it('rewrites HTML entries onto the proxy prefix (assets, runtime globals, API base) and length-honors the result', async () => {
    const entry = [
      '<link rel="stylesheet" href="/global.css"><script>',
      'window[\'__webpack_public_path__\'] = \'\';',
      'window[\'__nocobase_public_path__\'] = \'/\';',
      'window[\'__nocobase_api_base_url__\'] = \'/api/\';',
      'window[\'__nocobase_ws_path__\'] = \'/ws\';',
      '</script>',
      '<script src="/browser-checker.js?v=1"></script>',
      '<script type="module" src="/assets/index-6f4405c1.js"></script>',
      '<link href="//cdn.example.com/x.css" rel="stylesheet">',
      '<script>window.NOCOBASE_PORTAL_BASE="/dist/crm/";window.NOCOBASE_API_URL="/api"</script>',
    ].join('\n')
    const hits: UpstreamHit[] = []
    const origin = await fakeUpstream(hits, (res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(entry)
    })
    const handler = createNocobaseProxyHandler(origin)
    const response = await call(handler, '/nocobase/')
    const body = await response.text()
    expect(body).toContain('href="/nocobase/global.css"')
    expect(body).toContain('window[\'__webpack_public_path__\'] = \'/nocobase/\';')
    expect(body).toContain('window[\'__nocobase_public_path__\'] = \'/nocobase/\';')
    expect(body).toContain('window[\'__nocobase_api_base_url__\'] = \'/nocobase/api/\';')
    expect(body).toContain('window[\'__nocobase_ws_path__\'] = \'/nocobase/ws\';')
    expect(body).toContain('src="/nocobase/browser-checker.js?v=1"')
    expect(body).toContain('src="/nocobase/assets/index-6f4405c1.js"')
    // Protocol-relative URLs keep their scheme-host form.
    expect(body).toContain('href="//cdn.example.com/x.css"')
    // The deployed portal entry's inline base define re-roots onto the proxy
    // so the portal router basename and runtime asset URLs ride the prefix.
    expect(body).toContain('window.NOCOBASE_PORTAL_BASE="/nocobase/dist/crm/"')
    // The entry's API define follows, so the runtime gate's API probes and
    // sign-in ride the proxy instead of the gateway's own root.
    expect(body).toContain('window.NOCOBASE_API_URL="/nocobase/api"')
    // The stale upstream length is dropped; the response is valid and complete.
    expect(response.headers.get('content-length')).toBe(String(body.length))
  })

  it('passes non-HTML bodies through untouched', async () => {
    const hits: UpstreamHit[] = []
    const origin = await fakeUpstream(hits, (res) => {
      res.setHeader('content-type', 'application/javascript')
      res.end('export const href = "/x"')
    })
    const handler = createNocobaseProxyHandler(origin)
    const response = await call(handler, '/nocobase/assets/index-1.js')
    expect(await response.text()).toBe('export const href = "/x"')
  })

  it('rewrites the plugin manifest urls onto the proxy prefix and passes foreign JSON through', () => {
    const manifest = JSON.stringify({ data: [
      { name: 'acl', packageName: '@nocobase/plugin-acl', url: '/static/plugins/@nocobase/plugin-acl/dist/client/index.js?hash=4d06b168', clientV2Url: '/static/plugins/@nocobase/plugin-acl/dist/client-v2/index.js?hash=565bf67a' },
      { name: 'plain', url: 'https://cdn.example.com/x.js' },
    ] })
    const rewritten = JSON.parse(rewriteNocobasePluginManifest(manifest, '/nocobase')) as { data: Array<{ url?: string; clientV2Url?: string }> }
    expect(rewritten.data[0]?.url).toBe('/nocobase/static/plugins/@nocobase/plugin-acl/dist/client/index.js?hash=4d06b168')
    expect(rewritten.data[0]?.clientV2Url).toBe('/nocobase/static/plugins/@nocobase/plugin-acl/dist/client-v2/index.js?hash=565bf67a')
    // Absolute urls and non-manifest bodies keep their bytes.
    expect(rewritten.data[1]?.url).toBe('https://cdn.example.com/x.js')
    const foreign = '{"data":{"name":"orders"}}'
    expect(rewriteNocobasePluginManifest(foreign, '/nocobase')).toBe(foreign)
    expect(rewriteNocobasePluginManifest('not json', '/nocobase')).toBe('not json')
  })

  it('rewriteNocobaseHtml leaves values that do not match the built-entry shape alone', () => {
    const html = 'window[\'__nocobase_api_base_url__\'] = \'https://api.example.com/api/\';<a href="/keep"><script>window.NOCOBASE_PORTAL_BASE="dist/crm/"</script>'
    const rewritten = rewriteNocobaseHtml(html, '/nocobase')
    // A configured absolute API base is not a proxy-relative form; only asset URLs gain the prefix.
    expect(rewritten).toContain('\'https://api.example.com/api/\'')
    expect(rewritten).toContain('<a href="/nocobase/keep">')
    // A portal base define without a leading slash is not root-absolute; it keeps its bytes.
    expect(rewritten).toContain('window.NOCOBASE_PORTAL_BASE="dist/crm/"')
  })

  it('answers 502 with the cause when the upstream is unreachable', async () => {
    const handler = createNocobaseProxyHandler('http://127.0.0.1:1')
    const response = await call(handler, '/nocobase/')
    expect(response.status).toBe(502)
    expect(await response.text()).toMatch(/upstream unreachable/u)
  })
})

describe('webserver config wiring', () => {
  it('registers the proxy route only when the origin is configured', async () => {
    const off = new Context()
    const offServer = new WebServer(off, { host: '127.0.0.1', port: 0 })
    const on = new Context()
    const onServer = new WebServer(on, { host: '127.0.0.1', port: 0, nocobaseProxyOrigin: 'http://127.0.0.1:13000' })
    const saw = vi.fn()
    const probe = { kind: 'prefix' as const, path: NOCOBASE_PROXY_PREFIX, handler: () => { saw() } }
    // The duplicate-route contract proves registration: the probe throws only
    // when the constructor already claimed the prefix.
    expect(() => { offServer.register(probe) }).not.toThrow()
    expect(() => { onServer.register(probe) }).toThrow(/duplicate/u)
    await off.fiber.dispose()
    await on.fiber.dispose()
  })
})

describe('nocobase websocket upgrade forwarding', () => {
  const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

  /** Minimal RFC6455 echo: unmask one small client frame, echo it back unmasked. */
  const echoFrame = (buf: Buffer): Buffer | undefined => {
    if (buf.length < 2) return undefined
    const masked = (buf[1]! & 0x80) !== 0
    const len = buf[1]! & 0x7f
    if (len === 126 || len === 127) return undefined
    const payloadStart = masked ? 6 : 2
    if (buf.length < payloadStart + len) return undefined
    const payload = buf.subarray(payloadStart, payloadStart + len)
    if (masked) {
      const key = buf.subarray(2, 6)
      for (let i = 0; i < payload.length; i++) payload[i] = payload[i]! ^ key[i % 4]!
    }
    return Buffer.concat([Buffer.from([0x81, len]), payload])
  }

  /** Boot a real WebServer with the proxy pointed at a 101-echo ws upstream. */
  const boot = async (): Promise<{ port: number; seenKeys: string[]; dispose: () => Promise<void> }> => {
    const wsUpstream = createServer()
    const seenKeys: string[] = []
    wsUpstream.on('upgrade', (req, socket) => {
      const key = req.headers['sec-websocket-key']
      if (typeof key !== 'string') {
        socket.write('HTTP/1.1 400 missing key\r\n\r\n')
        socket.destroy()
        return
      }
      seenKeys.push(key)
      const accept = createHash('sha1').update(key + WS_GUID).digest('base64')
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
      socket.on('data', (chunk: Buffer) => {
        const reply = echoFrame(chunk)
        if (reply !== undefined) socket.write(reply)
      })
      // A real ws server closes its side after the client's close frame; this
      // bare echo answers the half-close so both sockets finish cleanly.
      socket.on('end', () => { socket.end() })
    })
    await new Promise<void>((resolve) => { wsUpstream.listen(0, '127.0.0.1', () => { resolve() }) })
    const wsAddress = wsUpstream.address()
    if (wsAddress === null || typeof wsAddress === 'string') throw new Error('no ws upstream address')
    const proxyOrigin = `http://127.0.0.1:${wsAddress.port}`

    const ctx = new Context()
    const fiber = ctx.plugin(WebServer, { host: '127.0.0.1', port: 0, nocobaseProxyOrigin: proxyOrigin })
    await fiber.await()
    const port = ctx.webServer.port
    return {
      seenKeys,
      port,
      dispose: async () => {
        await ctx.fiber.dispose()
        await new Promise<void>((resolve) => {
          wsUpstream.close(() => { resolve() })
          wsUpstream.closeAllConnections()
        })
      },
    }
  }

  /** One raw WebSocket session through the proxy: handshake + one frame round trip. */
  const wsRoundTrip = (port: number, message: string): Promise<{ statusLine: string; headers: string; echoed: string }> =>
    new Promise((resolve, reject) => {
      const socket = connect(port, '127.0.0.1')
      const fail = (error: Error): void => { socket.destroy(); reject(error) }
      socket.on('error', fail)
      socket.on('connect', () => {
        const key = createHash('sha1').update(`dsh-${Date.now()}`).digest('base64')
        socket.write(`GET /nocobase/ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`)
      })
      let buffer = Buffer.alloc(0)
      let handshakeDone = false
      let statusLine = ''
      let headers = ''
      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk])
        if (!handshakeDone) {
          const at = buffer.indexOf('\r\n\r\n')
          if (at === -1) return
          const head = buffer.subarray(0, at).toString('utf8')
          buffer = buffer.subarray(at + 4)
          const lines = head.split('\r\n')
          statusLine = lines[0] ?? ''
          headers = lines.slice(1).join('\r\n')
          handshakeDone = true
          const payload = Buffer.from(message, 'utf8')
          const mask = Buffer.from([0x11, 0x22, 0x33, 0x44])
          const masked = Buffer.from(payload)
          for (let i = 0; i < masked.length; i++) masked[i] = masked[i]! ^ mask[i % 4]!
          socket.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]))
        }
        if (handshakeDone && buffer.length >= 2) {
          const len = buffer[1]! & 0x7f
          if (buffer.length < 2 + len) return
          const echoed = buffer.subarray(2, 2 + len).toString('utf8')
          socket.end()
          resolve({ statusLine, headers, echoed })
        }
      })
    })

  it('forwards the upgrade to 101 and echoes a frame through the proxy', async () => {
    const app = await boot()
    try {
      const { statusLine, headers, echoed } = await wsRoundTrip(app.port, 'ping-through-proxy')
      // The handshake reached the upstream as a real upgrade request.
      expect(app.seenKeys.length).toBe(1)
      expect(app.seenKeys[0]).toMatch(/^[A-Za-z0-9+/]{20,}={0,2}$/u)
      expect(statusLine).toBe('HTTP/1.1 101 Switching Protocols')
      expect(headers.toLowerCase()).toContain('upgrade: websocket')
      expect(headers.toLowerCase()).toContain('connection: upgrade')
      expect(headers.toLowerCase()).toContain('sec-websocket-accept:')
      expect(echoed).toBe('ping-through-proxy')
    } finally {
      await app.dispose()
    }
  })
})
