/**
 * Keyless closed-loop snapshot over the real Loader composition: ingest the
 * example's three document kinds through `kb_ingest`, observe coverage with
 * `kb_stats`, and retrieve with `kb_search` — all in the documented
 * text-only degraded mode, with numbered citations and tenant isolation
 * asserted and snapshotted. Hermetic by construction: the fixture's embed
 * credential reference is pinned to `KB_TEST_EMBED_ENV` (a name nothing
 * sets), so a host MINIMAX_API_KEY can neither flip the snapshot to hybrid
 * mode nor trigger real network calls. Refresh with
 * `DSH_SNAPSHOT=refresh pnpm vitest run <this file>`.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
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
const snapshotsDir = join(here, 'snapshots/kb-closed-loop')
const expectedPath = join(snapshotsDir, 'expected.md')
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

const signal = new AbortController().signal

const documents: Array<{ path: string; docKind: string; title: string; collectedAt: string }> = [
  { path: 'workspace/data/meetings/2026-08-27-project-kickoff.md', docKind: 'meeting', title: '项目启动会纪要', collectedAt: '2026-08-27' },
  { path: 'workspace/data/meetings/2026-08-20-supplier-visit-hongfa.md', docKind: 'meeting', title: '宏发食品走访纪要', collectedAt: '2026-08-20' },
  { path: 'workspace/data/profiles/hongfa-food.md', docKind: 'profile', title: '宏发食品企业档案', collectedAt: '2026-08-20' },
  { path: 'workspace/data/profiles/lvyuan-ingredients.md', docKind: 'profile', title: '绿源配料企业档案', collectedAt: '2026-08-22' },
  { path: 'workspace/data/regulations/gb2760-excerpt.md', docKind: 'regulation', title: 'GB 2760 要点摘录', collectedAt: '2026-08-25' },
  { path: 'workspace/data/regulations/gb14881-excerpt.md', docKind: 'regulation', title: 'GB 14881 要点摘录', collectedAt: '2026-08-25' },
]

const queries = [
  '调味品企业的食品添加剂合规要点',
  '成本测算的原材料口径',
  '微生物监测必检项目',
]

let root: string | undefined
let ctx: Context | undefined
let counter = 0

beforeEach(() => {
  process.env.KB_TEST_ROOT = exampleRoot
  // Pin the embed credential reference to a name nothing supplies: the run
  // stays keyless even when the host exports a real MINIMAX_API_KEY.
  process.env.KB_TEST_EMBED_ENV = 'KB_TEST_EMBED_ENV_ABSENT'
})

afterEach(async () => {
  delete process.env.KB_TEST_ROOT
  delete process.env.KB_TEST_DB
  delete process.env.KB_TEST_EMBED_ENV
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot the fixture composition through the real Loader with an in-process import map. */
async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'kb-agent-closed-loop-'))
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

/** Execute one kb tool through the real registry and return its model-facing text. */
async function callText(name: string, args: unknown): Promise<{ text: string; value: unknown }> {
  const result = await ctx!.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return { text: text?.type === 'text' ? text.text : '', value: result.value }
}

describe('kb-agent closed loop (keyless, text-only degraded mode)', () => {
  it('ingests the corpus, reports coverage, and retrieves with numbered citations', async () => {
    const context = await boot()
    const out: string[] = ['# kb-agent closed loop (text-only degraded mode)', '']

    out.push('## kb_ingest')
    for (const doc of documents) {
      const { text } = await callText('kb_ingest', {
        path: doc.path,
        doc_kind: doc.docKind,
        title: doc.title,
        collected_at: doc.collectedAt,
      })
      out.push(`- ${doc.path}: ${text}`)
    }
    out.push('')

    out.push('## kb_stats')
    const stats = await callText('kb_stats', {})
    out.push(stats.text)
    out.push('')

    out.push('## kb_search')
    for (const query of queries) {
      const { text, value } = await callText('kb_search', { query })
      out.push(`### ${query}`)
      out.push(text)
      out.push('')
      // The degraded mode is observable in the canonical value, not just prose.
      expect((value as { mode: string }).mode).toBe('text')
    }

    // Tenant isolation: another tenant's corpus stays invisible.
    await context.kb.ingest({
      tenantId: 'other-co', sourcePath: 'workspace/data/isolated.md', docKind: 'other', content: '隔离租户专用文档，含独特关键词茋藄。',
    })
    const isolated = await callText('kb_search', { query: '茋藄' })
    expect(isolated.text).toMatch(/no results/iu)

    // The degraded mode is observable in stats too.
    const statsValue = (await callText('kb_stats', {})).value as { embed_available: boolean }
    expect(statsValue.embed_available).toBe(false)

    while (out.at(-1) === '') out.pop()
    const actual = `${out.join('\n')}\n`
    if (refreshing) {
      await mkdir(snapshotsDir, { recursive: true })
      await writeFile(expectedPath, actual)
    }
    const expected = await readFile(expectedPath, 'utf8')
    expect(actual).toBe(expected)
  })
})
