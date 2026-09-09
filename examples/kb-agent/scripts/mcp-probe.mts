/**
 * MCP channel probe: the V6 evaluation's minimal comparative implementation
 * (plans/nocobase-native-integration, decision B-6). Speaks the MCP
 * streamable-HTTP transport against a live NocoBase plugin-mcp-server
 * endpoint the way the nb_* tools' REST channel speaks `:list`/`:get`, and
 * prints the same business question answered through both channels — the
 * tool-description surface, the error normalization, and the wire overhead
 * side by side. Evaluation copy: the 2026-09-07 agent note
 * (.agents/notes/implemented/process/…-mcp-channel-evaluation.md); this
 * script is the rerunnable evidence, not the decision record.
 *
 * Preconditions (self-skip like every kb-agent script): NOCOBASE_BASE_URL +
 * NOCOBASE_API_KEY resolve, and the MCP endpoint answers the initialize
 * handshake. Run from the repo root:
 *   node --import tsx/esm examples/kb-agent/scripts/mcp-probe.mts
 */
import { resolveEnv } from './resolve-env.ts'

const PROBE_TOOL = 'resource_list'

interface McpTool { name: string; description?: string; inputSchema?: unknown }

/** One JSON-RPC call over the streamable-HTTP transport (single-shot POST). */
async function mcpCall(baseUrl: string, apiKey: string, method: string, params: Record<string, unknown>, sessionId?: string): Promise<{ result?: unknown; error?: { message: string } }> {
  const response = await fetch(`${baseUrl.replace(/\/$/u, '')}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${apiKey}`,
      ...(sessionId === undefined ? {} : { 'mcp-session-id': sessionId }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(10_000),
  })
  const text = await response.text()
  // Streamable HTTP answers either JSON or one SSE frame; parse whichever.
  const json = text.startsWith('event:') || text.startsWith('data:')
    ? JSON.parse((/^data: (.+)$/mu.exec(text)?.[1]) ?? '{}')
    : JSON.parse(text)
  if (json.error !== undefined) throw new Error(json.error.message)
  const headerSession = response.headers.get('mcp-session-id') ?? undefined
  return { result: json.result, ...(headerSession === undefined ? {} : { error: undefined }) }
}

async function main(): Promise<void> {
  const baseUrl = resolveEnv('NOCOBASE_BASE_URL')
  const apiKey = resolveEnv('NOCOBASE_API_KEY')
  if (baseUrl === undefined || apiKey === undefined) {
    console.log('SKIP: NOCOBASE_BASE_URL/NOCOBASE_API_KEY not set')
    return
  }
  // 1) REST channel reference: the shared client's business read.
  const restStarted = Date.now()
  const rest = await fetch(`${baseUrl.replace(/\/$/u, '')}/api/orders:list?pageSize=1`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  })
  const restMs = Date.now() - restStarted
  // 2) MCP channel: initialize (protocol version) → tools/list → one call.
  let mcpTools: McpTool[] = []
  let mcpMs = -1
  let mcpNote = ''
  try {
    const init = await mcpCall(baseUrl, apiKey, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'dsh-mcp-probe', version: '0.1.0' },
    })
    void init
    const list = await mcpCall(baseUrl, apiKey, 'tools/list', {}) as { result?: { tools?: McpTool[] } }
    mcpTools = list.result?.tools ?? []
    const callStarted = Date.now()
    const tool = mcpTools.find(entry => entry.name === PROBE_TOOL)
    if (tool === undefined) {
      mcpNote = `tool ${PROBE_TOOL} absent from the ${mcpTools.length}-tool list`
    } else {
      const called = await mcpCall(baseUrl, apiKey, 'tools/call', { name: tool.name, arguments: { resource: 'orders', pageSize: 1 } })
      void called
    }
    mcpMs = Date.now() - callStarted
  } catch (error: unknown) {
    mcpNote = error instanceof Error ? error.message : String(error)
  }

  console.log('— MCP channel probe —')
  console.log(`REST  /api/orders:list → HTTP ${rest.status} in ${restMs}ms`)
  console.log(`MCP   tools=${mcpTools.length} names=[${mcpTools.map(tool => tool.name).join(', ')}]`)
  if (mcpNote !== '') console.log(`MCP   call failed: ${mcpNote}`)
  else console.log(`MCP   ${PROBE_TOOL} → ok in ${mcpMs}ms`)
  console.log('Evaluation record: .agents/notes/implemented/process/2026-09-07-mcp-channel-evaluation.md')
}

void main()
