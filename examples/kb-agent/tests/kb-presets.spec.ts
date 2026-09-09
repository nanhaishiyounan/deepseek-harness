/**
 * Keyless snapshot for the two shipped role presets (AI 食安合规官 /
 * 企业数据助手): boot the real Loader composition with the preset roster,
 * mount each preset on a real agent, and assert the retrieval-only tool
 * surface, the persona-shadowed system prompt, and a live text-mode
 * `kb_search` with numbered citations through the preset agent's own scope.
 * Hermetic by construction: the fixture's embed credential reference is
 * pinned to `KB_TEST_EMBED_ENV` (a name nothing sets), so a host
 * MINIMAX_API_KEY can neither flip the snapshot to hybrid mode nor trigger
 * real network calls. Refresh with `DSH_SNAPSHOT=refresh pnpm vitest run
 * <this file>`.
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
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry, { assembleContextFor, type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import * as Persona from '@deepseek-ai/dsh-persona'
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as LakehouseSqliteCatalog from '@deepseek-ai/dsh-lakehouse-sqlite-catalog'
import * as LakehouseDuckDb from '@deepseek-ai/dsh-lakehouse-duckdb'
import * as ToolLakehouse from '@deepseek-ai/dsh-tool-lakehouse'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import * as ToolConnector from '@deepseek-ai/dsh-tool-connector'
import * as ToolNocoBase from '@deepseek-ai/dsh-tool-nocobase'

const here = dirname(fileURLToPath(import.meta.url))
const exampleRoot = join(here, '..')
const configPath = join(here, 'fixtures/kb-presets.cordis.yml')
const snapshotsDir = join(here, 'snapshots/kb-presets')
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

let root: string | undefined
let ctx: Context | undefined
let counter = 0

beforeEach(() => {
  process.env.KB_TEST_ROOT = exampleRoot
  // Pin the embed credential reference to a name nothing supplies: the run
  // stays keyless even when the host exports a real MINIMAX_API_KEY.
  process.env.KB_TEST_EMBED_ENV = 'KB_TEST_EMBED_ENV_ABSENT'
  process.env.KB_TEST_PRESET_ROOT = join(exampleRoot, 'agent-presets')
})

afterEach(async () => {
  delete process.env.KB_TEST_ROOT
  delete process.env.KB_TEST_DB
  delete process.env.KB_TEST_EMBED_ENV
  delete process.env.LH_TEST_ROOT
  delete process.env.LH_TEST_DB
  delete process.env.KB_TEST_PRESET_ROOT
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot the fixture composition through the real Loader with an in-process import map. */
async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'kb-agent-presets-'))
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
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-agent', AgentRegistry],
    ['@deepseek-ai/dsh-agent-loop', AgentLoop],
    ['@deepseek-ai/dsh-agent-presets', AgentPresets],
    ['@deepseek-ai/dsh-persona', Persona],
    ['@deepseek-ai/dsh-tool-kb', ToolKb],
    ['@deepseek-ai/dsh-lakehouse', LakehouseRuntime],
    ['@deepseek-ai/dsh-lakehouse-sqlite-catalog', LakehouseSqliteCatalog],
    ['@deepseek-ai/dsh-lakehouse-duckdb', LakehouseDuckDb],
    ['@deepseek-ai/dsh-tool-lakehouse', ToolLakehouse],
    ['@deepseek-ai/dsh-connector', ConnectorRuntime],
    ['@deepseek-ai/dsh-tool-connector', ToolConnector],
    ['@deepseek-ai/dsh-tool-nocobase', ToolNocoBase],
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

/** Create one agent composed from `presetId`, exactly as a factory `setup` would. */
async function agentOn(id: string, presetId: string): Promise<Agent> {
  const handle = await ctx!.agents.create({
    sessionId: SessionId(id),
    meta: { cwd: exampleRoot },
    agentOptions: { provider: 'minimax', model: 'MiniMax-M3' },
    setup: async (agentCtx: Context) => void await ctx!.agentPresets.mount(agentCtx, presetId),
  })
  return handle.agent
}

/** Sorted tool names one agent's scope resolves. */
const toolNames = (agent: Agent): string[] =>
  ctx!.tools.schemas(agent).map(schema => schema.name).sort()

describe('kb-agent role presets (keyless, text-only degraded mode)', () => {
  it('rosters both role presets with metadata, retrieval-only tools, persona prompts, and cited retrieval', async () => {
    await boot()
    const out: string[] = ['# kb-agent role presets (text-only degraded mode)', '']

    out.push('## roster')
    const roster = await ctx!.agentPresets.list()
    const byId = new Map(roster.map(preset => [preset.id, preset]))
    for (const id of ['enterprise-data-assistant', 'food-compliance-officer']) {
      const preset = byId.get(id)
      expect(preset, `preset ${id} on the roster`).toBeDefined()
      expect(preset!.broken, `preset ${id} composes`).toBeUndefined()
      out.push(`- ${id}: name=${preset!.name ?? '(id)'} order=${preset!.order ?? '(none)'}`)
      out.push(`  ${preset!.description ?? '(no description)'}`)
    }
    out.push('')

    const context = ctx!
    for (const doc of documents) {
      await context.kb.ingest({
        tenantId: 'demo-food-co',
        sourcePath: doc.path,
        docKind: doc.docKind as Parameters<NonNullable<Context['kb']>['ingest']>[0]['docKind'],
        title: doc.title,
        collectedAt: doc.collectedAt,
        content: await readFile(join(exampleRoot, doc.path), 'utf8'),
      })
    }

    const cases: Array<{ id: string; sessionId: string; personaMark: string; query: string }> = [
      {
        id: 'food-compliance-officer',
        sessionId: 'kb-preset-compliance',
        personaMark: 'AI 食安合规官',
        query: '调味品 防腐剂 使用限量',
      },
      {
        id: 'enterprise-data-assistant',
        sessionId: 'kb-preset-data-assistant',
        personaMark: '企业数据助手',
        query: '宏发食品 成本测算 原材料',
      },
    ]
    for (const preset of cases) {
      out.push(`## ${preset.id}`)
      const agent = await agentOn(preset.sessionId, preset.id)

      const names = toolNames(agent)
      out.push(`- tools: ${names.join(', ')}`)
      // The compliance officer stays kb-only; the data assistant adds the
      // lakehouse, connector, and NocoBase business suites (its persona
      // routes all four surfaces).
      const kbTools = ['kb_graph_add', 'kb_graph_query', 'kb_ingest', 'kb_ingest_url', 'kb_search', 'kb_stats', 'kg_schema', 'kg_subgraph']
      const expectedTools = preset.id === 'enterprise-data-assistant'
        ? [...kbTools, 'lakehouse_query', 'lakehouse_tables', 'connector_discover', 'connector_fetch', 'connector_transfer', 'order_create', 'order_status', 'nb_collections', 'nb_list', 'nb_get', 'nb_create', 'nb_update'].sort()
        : kbTools
      expect(names).toEqual(expectedTools)

      const assembly = await ctx!.systemPrompt.assemble(assembleContextFor(agent))
      const prompt = renderPrompt(assembly)
      out.push(`- persona: ${prompt.includes(preset.personaMark) ? `contains "${preset.personaMark}"` : 'MISSING'}`)
      expect(prompt).toContain(preset.personaMark)
      // The persona template's variables resolved, not leaked literally.
      expect(prompt).not.toContain('{{model}}')
      expect(prompt).not.toContain('{{cwd}}')

      const result = await ctx!.tools.execute({
        signal,
        callId: CallId(`call-${++counter}`),
        name: 'kb_search',
        arguments: { query: preset.query },
        agent,
      })
      const text = result.content.find(block => block.type === 'text')?.text ?? ''
      out.push(`- kb_search "${preset.query}":`)
      for (const line of text.split('\n').slice(0, 6)) out.push(line === '' ? '' : `  ${line}`)
      out.push('')
      expect((result.value as { mode: string }).mode).toBe('text')
      expect(text).toMatch(/\[1\]/u)
    }

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
