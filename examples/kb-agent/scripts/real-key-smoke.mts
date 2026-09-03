/**
 * Real-key smoke: PDF + URL ingest through the real MiniMax embed provider
 * and the real HTTP fetch provider, then hybrid retrieval with citations and
 * the usage counters. Run with the repository's tsx loader from the repo root:
 *   node --import tsx/esm examples/kb-agent/scripts/real-key-smoke.mts
 */
import { mkdtemp, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import * as KbEmbedMiniMax from '@deepseek-ai/dsh-kb-embed-minimax'
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as WebFetchHttp from '@deepseek-ai/dsh-web-fetch-http'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'

const signal = new AbortController().signal
const root = await mkdtemp(join(tmpdir(), 'kb-smoke-'))
const ctx = new Context()
let counter = 0

async function call(name: string, args: unknown): Promise<{ isError: boolean; text: string; value: unknown }> {
  const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return { isError: result.isError, text: text?.type === 'text' ? text.text : '', value: result.value }
}

try {
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(KbRuntime)
  await ctx.plugin(KbSqlite, { path: join(root, 'kb.sqlite') })
  await ctx.plugin(KbEmbedMiniMax, {})
  await ctx.plugin(WebRuntime)
  await ctx.plugin(WebFetchHttp, {})
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(ToolKb, { tenant: 'demo-food-co' })

  await copyFile(new URL('../../../packages/kb/tool-kb/tests/fixtures/docs/sample.pdf', import.meta.url).pathname, join(root, 'visit.pdf'))
  await copyFile(new URL('../../../packages/kb/tool-kb/tests/fixtures/docs/sample.docx', import.meta.url).pathname, join(root, 'audit.docx'))

  console.log('== kb_ingest PDF ==')
  console.log((await call('kb_ingest', { path: 'visit.pdf', doc_kind: 'meeting' })).text)

  console.log('== kb_ingest docx ==')
  console.log((await call('kb_ingest', { path: 'audit.docx', doc_kind: 'report' })).text)

  console.log('== kb_ingest_url (public page) ==')
  console.log((await call('kb_ingest_url', { url: 'https://example.com/', doc_kind: 'other' })).text)

  console.log('== kb_search (hybrid, PDF channel) ==')
  const pdfSearch = await call('kb_search', { query: 'white sugar procurement price' })
  console.log(pdfSearch.text.split('\n').slice(0, 4).join('\n'))

  console.log('== kb_search (hybrid, URL channel) ==')
  const urlSearch = await call('kb_search', { query: 'illustrative examples in documents' })
  console.log(urlSearch.text.split('\n').slice(0, 4).join('\n'))

  console.log('== kb_stats (usage counters) ==')
  console.log((await call('kb_stats', {})).text)

  console.log('== SSRF guard (private URL refused) ==')
  const blocked = await call('kb_ingest_url', { url: 'http://127.0.0.1:9/never' })
  console.log(`isError=${blocked.isError}: ${blocked.text.slice(0, 120)}`)
} finally {
  await ctx.fiber.dispose()
  await rm(root, { recursive: true, force: true })
}
