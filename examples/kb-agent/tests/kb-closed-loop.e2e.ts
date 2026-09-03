/**
 * With-key closed loop against the real MiniMax endpoint: hybrid ingest with
 * live embo-01 embeddings, hybrid retrieval, and one real MiniMax-M3 answer
 * grounded in the retrieved citations. Self-skips without MINIMAX_API_KEY.
 * Run: MINIMAX_API_KEY=... pnpm vitest run --config vitest.e2e.config.ts examples/kb-agent
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { BlockAssembler, CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import * as KbEmbedMiniMax from '@deepseek-ai/dsh-kb-embed-minimax'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as WebFetchHttp from '@deepseek-ai/dsh-web-fetch-http'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'

const here = dirname(fileURLToPath(import.meta.url))
const exampleRoot = join(here, '..')
const configPath = join(here, 'fixtures/kb-closed-loop.cordis.yml')
const apiKey = process.env.MINIMAX_API_KEY

let root: string | undefined
let ctx: Context | undefined
let counter = 0

afterEach(async () => {
  delete process.env.KB_TEST_ROOT
  delete process.env.KB_TEST_DB
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function user(text: string): Message {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'kb-agent-e2e' } })
}

async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'kb-agent-e2e-'))
  process.env.KB_TEST_ROOT = exampleRoot
  process.env.KB_TEST_DB = join(root, 'kb.sqlite')
  const context = new Context()
  ctx = context
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
    ['@deepseek-ai/dsh-credentials-local', LocalCredentialProvider],
    ['@deepseek-ai/dsh-llm', LlmRuntime],
    ['@deepseek-ai/dsh-llm-minimax', LlmMiniMax],
    ['@deepseek-ai/dsh-kb', KbRuntime],
    ['@deepseek-ai/dsh-kb-sqlite', KbSqlite],
    ['@deepseek-ai/dsh-kb-embed-minimax', KbEmbedMiniMax],
    ['@deepseek-ai/dsh-web', WebRuntime],
    ['@deepseek-ai/dsh-web-fetch-http', WebFetchHttp],
    ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tool-kb', ToolKb],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

async function callText(name: string, args: unknown): Promise<{ text: string; value: unknown }> {
  const result = await ctx!.tools.execute({ signal: new AbortController().signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return { text: text?.type === 'text' ? text.text : '', value: result.value }
}

describe.skipIf(apiKey === undefined)('kb-agent closed loop (with key, hybrid mode + real answer)', () => {
  it('ingests with embeddings, retrieves hybrid, and answers with citations through MiniMax-M3', async () => {
    const context = await boot()
    for (const path of [
      'workspace/data/meetings/2026-08-20-supplier-visit-hongfa.md',
      'workspace/data/profiles/hongfa-food.md',
      'workspace/data/regulations/gb2760-excerpt.md',
    ]) {
      const { text } = await callText('kb_ingest', { path })
      expect(text).toMatch(/embedded via minimax:embo-01/u)
    }
    const stats = (await callText('kb_stats', {})).value as { embed_available: boolean; documents: number }
    expect(stats.embed_available).toBe(true)
    expect(stats.documents).toBe(3)

    const question = '调味品企业的食品添加剂合规要点是什么？'
    const search = await callText('kb_search', { query: question })
    expect((search.value as { mode: string }).mode).toBe('hybrid')
    expect(search.text).toMatch(/\[1\]/u)

    // One real grounded answer: the retrieved citations ride in the user turn.
    const assembler = new BlockAssembler()
    for await (const chunk of context.llm.stream({
      provider: 'minimax',
      model: 'MiniMax-M3',
      system: '你是食品行业知识助手。只依据用户提供的检索结果回答，并以 [n] 引用来源（文档名+标题路径）。',
      messages: [user(`检索结果：\n\n${search.text}\n\n问题：${question}`)],
    })) assembler.push(chunk)
    expect(assembler.finish.kind).toBe('stop')
    const answer = assembler.message({
      kind: 'model', provider: 'minimax', model: 'MiniMax-M3',
    })
    const visible = answer.content.filter(block => block.type === 'text').map(block => block.type === 'text' ? block.text : '').join('')
    expect(visible).toMatch(/\[\d+\]/u)
    expect(visible).toMatch(/GB ?2760|添加剂/u)
  }, 180_000)
})
