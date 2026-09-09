/**
 * Real-key upload smoke: the gateway's kb.upload channel over the real MiniMax
 * embed provider — browser-shaped base64 PDF bytes land under
 * `workspace/data/uploads/` in an independent temp library, ingest through the
 * real chunker + embedder, then hybrid retrieval answers with citations and
 * the usage counters move. A second, keyless world then lands one 12 MiB
 * markdown upload (text-only ingest, no embed provider — debt #8 keeps large
 * batch embed unbatched) and re-uploads the same name to observe the
 * replacement fact. Independent of the developer's dev server and
 * workspace/kb.sqlite; run from the repo root with the tsx loader (the root
 * .env supplies MINIMAX_API_KEY):
 *   node --env-file=.env --import tsx/esm examples/kb-agent/scripts/upload-real-key-smoke.mts
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import * as KbEmbedMiniMax from '@deepseek-ai/dsh-kb-embed-minimax'
import { createApiProxy, type ApiProxyDefaults } from '@deepseek-ai/dsh-host-apiproxy'

const root = await mkdtemp(join(tmpdir(), 'kb-upload-smoke-'))
const ctx = new Context()

/** One typed RPC request envelope (the rpcId is branded on the wire contract). */
function request<P>(payload: P): { rpcId: never; payload: P } {
  return { rpcId: 'kb-upload-smoke' as never, payload }
}

try {
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(KbRuntime)
  await ctx.plugin(KbSqlite, { path: join(root, 'kb.sqlite') })
  await ctx.plugin(KbEmbedMiniMax, {})
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-chat' }),
    saveDefaultModelSelection: async () => {},
    cwd: root,
    kbTenant: 'demo-food-co',
    kbWriteEnabled: true,
  } satisfies ApiProxyDefaults)

  const pdf = await readFile(new URL('../../../packages/kb/tool-kb/tests/fixtures/docs/sample.pdf', import.meta.url))
  console.log('== kb.upload (browser PDF bytes → real embedder) ==')
  const uploaded = await api.kb.upload(request({ filename: 'visit-report.pdf', data: pdf.toString('base64') }))
  console.log(JSON.stringify(uploaded.result))

  console.log('== kb.search (hybrid over the uploaded PDF) ==')
  const searched = await api.kb.search(request({ query: 'white sugar procurement price' }))
  if (!searched.result.ok) {
    console.error(JSON.stringify(searched.result))
    process.exitCode = 1
  } else {
    console.log(`mode=${searched.result.value.mode} embed_model=${searched.result.value.embed_model ?? ''} results=${searched.result.value.results.length}`)
    for (const hit of searched.result.value.results.slice(0, 3)) {
      console.log(`[${hit.chunk_id}] ${hit.source_path}${hit.heading_path === undefined ? '' : ` — ${hit.heading_path}`}`)
      console.log(`    ${hit.content.slice(0, 120)}`)
    }
  }

  console.log('== kb.stats (usage counters) ==')
  const stats = await api.kb.stats(request({}))
  console.log(JSON.stringify(stats.result.ok ? stats.result.value.usage : stats.result))
  await ctx.fiber.dispose()

  // Keyless second world: one 12 MiB markdown upload through the same
  // kb.upload decode → chunk → store path (text-only — debt #8 keeps large
  // batch embed unbatched, so the big-file leg stays keyless by design),
  // then a same-name re-upload to observe the replacement fact.
  console.log('== kb.upload 12 MiB markdown + same-name re-upload (text-only world) ==')
  const bigCtx = new Context()
  const header = '# 大文件上传冒烟\n\n琥珀麦芽烘焙曲线探针。\n\n'
  // Assemble by counted line bytes, not by re-scanning a growing string.
  const lineBytes = Buffer.byteLength('bulk upload smoke line: sugar futures hedging ledger record 0\n', 'utf8')
  const lineCount = Math.ceil((12 * 1024 * 1024 - Buffer.byteLength(header, 'utf8')) / lineBytes)
  const parts: string[] = [header]
  for (let n = 0; n < lineCount; n++) parts.push(`bulk upload smoke line: sugar futures hedging ledger record ${n}\n`)
  const filler = parts.join('')
  try {
    await bigCtx.plugin(SessionStore)
    await bigCtx.plugin(SystemPrompt, { persona: '' })
    await bigCtx.plugin(UserQuestionService)
    await bigCtx.plugin(AgentRegistry)
    await bigCtx.plugin(KbRuntime)
    await bigCtx.plugin(KbSqlite, { path: join(root, 'kb-text-only.sqlite') })
    const textApi = createApiProxy(bigCtx, {
      defaultModelSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-chat' }),
      saveDefaultModelSelection: async () => {},
      cwd: root,
      kbTenant: 'demo-food-co',
      kbWriteEnabled: true,
    } satisfies ApiProxyDefaults)
    const first = await textApi.kb.upload(request({ filename: 'big-smoke.md', data: Buffer.from(filler, 'utf8').toString('base64') }))
    console.log(JSON.stringify(first.result))
    if (!first.result.ok || first.result.value.replaced !== false) process.exitCode = 1
    const second = await textApi.kb.upload(request({ filename: 'big-smoke.md', data: Buffer.from(`${filler}\n（第二版）\n`, 'utf8').toString('base64') }))
    console.log(JSON.stringify(second.result))
    if (!second.result.ok || second.result.value.replaced !== true) process.exitCode = 1
  } finally {
    await bigCtx.fiber.dispose()
  }
} finally {
  await ctx.fiber.dispose()
  await rm(root, { recursive: true, force: true })
}
