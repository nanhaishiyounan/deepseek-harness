/**
 * R2-04: the script-domain NocoBase client's fetch timeout works.
 * Boots a local server that accepts a request and never responds, points the
 * flow-page lib at it with NOCOBASE_TIMEOUT_MS=150 (far below the 30s
 * default), and asserts call() aborts with the named timeout error quickly.
 */
import { createServer } from 'node:http'

process.env.NOCOBASE_BASE_URL = 'http://127.0.0.1'
process.env.NOCOBASE_TIMEOUT_MS = '150'

const server = createServer(() => { /* hang forever: the client must abort */ })
await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
const port = (server.address() as { port: number }).port
process.env.NOCOBASE_BASE_URL = `http://127.0.0.1:${port}`

const { call, requestTimeoutMs } = await import('../../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts')

if (requestTimeoutMs !== 150) throw new Error(`env override not honored: requestTimeoutMs=${String(requestTimeoutMs)}`)

const startedAt = Date.now()
let refused: string | undefined
try {
  await call('token', 'GET', '/api/hang')
  refused = 'NO_ERROR'
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
const elapsed = Date.now() - startedAt
server.close()

console.log(`requestTimeoutMs=${String(requestTimeoutMs)} elapsed=${String(elapsed)}ms`)
console.log(`refusal: ${refused ?? ''}`)
if (refused === undefined || !refused.includes('timed out after 150ms') || !refused.includes('NOCOBASE_TIMEOUT_MS')) {
  throw new Error(`timeout refusal missing or wrong: ${refused ?? ''}`)
}
if (elapsed >= 2000) throw new Error(`abort came too late: ${String(elapsed)}ms`)
console.log('R2-04 timeout path OK: hung endpoint aborted at 150ms with the named refusal')
