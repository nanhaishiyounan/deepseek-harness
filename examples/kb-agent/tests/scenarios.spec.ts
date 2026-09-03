/**
 * Keyless scenario-set snapshot: every directory under scenarios/ must be a
 * complete scenario (preset metadata, composition, SKILL, corpus), its
 * composition must mount through the real Loader as a preset (retrieval-only
 * tool surface, persona shadowing), and its corpus must be retrievable with
 * a numbered citation through the real seam in text-only degraded mode.
 * Hermetic by construction (the fixture pins the embed credential reference
 * to a name nothing sets). Refresh with `DSH_SNAPSHOT=refresh pnpm vitest
 * run <this file>`.
 */

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { load } from 'js-yaml'
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
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import * as Persona from '@deepseek-ai/dsh-persona'
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'

const here = dirname(fileURLToPath(import.meta.url))
const exampleRoot = join(here, '..')
const scenariosRoot = join(exampleRoot, 'scenarios')
const configPath = join(here, 'fixtures/kb-presets.cordis.yml')
const snapshotsDir = join(here, 'snapshots/scenarios')
const expectedPath = join(snapshotsDir, 'expected.md')
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

const signal = new AbortController().signal

let root: string | undefined
let ctx: Context | undefined
let counter = 0

beforeEach(() => {
  process.env.KB_TEST_ROOT = exampleRoot
  process.env.KB_TEST_EMBED_ENV = 'KB_TEST_EMBED_ENV_ABSENT'
})

afterEach(async () => {
  delete process.env.KB_TEST_ROOT
  delete process.env.KB_TEST_DB
  delete process.env.KB_TEST_EMBED_ENV
  delete process.env.KB_TEST_PRESET_ROOT
  // Disposal and scratch-root removal are independent: one failing must not
  // skip the other (the kb-workbench.e2e.ts cleanup pattern).
  const failures: unknown[] = []
  await ctx?.fiber.dispose().catch((error: unknown) => failures.push(error))
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
  root = undefined
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'kb scenario case cleanup failed')
})

/** This run's scratch root: one temp dir per test, removed by afterEach. */
async function ensureRoot(): Promise<string> {
  root ??= await mkdtemp(join(tmpdir(), 'kb-scenarios-'))
  return root
}

/** Boot the fixture composition through the real Loader with an in-process import map. */
async function boot(presetRoot: string): Promise<Context> {
  const rootDir = await ensureRoot()
  process.env.KB_TEST_DB = join(rootDir, 'kb.sqlite')
  process.env.KB_TEST_PRESET_ROOT = presetRoot
  const context = new Context()
  ctx = context
  context.baseUrl = pathToFileURL(rootDir).href + '/'
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

/** One scenario's declared metadata (preset.yml). */
interface ScenarioMeta {
  name?: string
  category?: string
  probe?: string
}

describe('kb-agent scenario set (keyless, text-only degraded mode)', () => {
  it('every scenario is complete, mounts as a preset, and retrieves its corpus with citations', async () => {
    const out: string[] = ['# kb-agent scenario set (text-only degraded mode)', '']
    const scenarioDirs = (await readdir(scenariosRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
    // Thirty scenarios ship today; the portal catalog, the scenarios READMEs,
    // and this count move together (the portal side is gated by
    // scripts/scenario-catalog-sync.spec.ts).
    expect(scenarioDirs).toHaveLength(30)

    // Stage every scenario into one preset root inside this run's temp dir —
    // never inside the repository (they are plain preset dirs).
    const staged = join(await ensureRoot(), 'scenarios-staged')
    await mkdir(staged, { recursive: true })
    for (const slug of scenarioDirs) {
      await mkdir(join(staged, slug), { recursive: true })
      for (const file of ['preset.yml', 'agent.cordis.yml']) {
        await writeFile(join(staged, slug, file), await readFile(join(scenariosRoot, slug, file), 'utf8'))
      }
    }

    const context = await boot(staged)

    // Ingest every scenario corpus under its own source path, remembering
    // each ingest's doc identity so the retrieval assertions below can prove
    // cited chunk ids belong to this run's real corpus documents.
    const corpusBySlug = new Map<string, string>()
    const ingestedDocs = new Map<number, { slug: string; chunks: number }>()
    for (const slug of scenarioDirs) {
      const content = await readFile(join(scenariosRoot, slug, 'data', 'corpus.md'), 'utf8')
      corpusBySlug.set(slug, content)
      const ingested = await context.kb.ingest({
        tenantId: 'demo-food-co',
        sourcePath: `scenarios/${slug}/data/corpus.md`,
        docKind: 'report',
        content,
      })
      ingestedDocs.set(ingested.docId, { slug, chunks: ingested.chunks })
    }

    const roster = await context.agentPresets.list()
    const byId = new Map(roster.map(preset => [preset.id, preset]))
    for (const slug of scenarioDirs) {
      out.push(`## ${slug}`)
      // Structure: all four files present, metadata parses with a name.
      const meta = load(await readFile(join(scenariosRoot, slug, 'preset.yml'), 'utf8')) as ScenarioMeta
      expect(meta.name, `${slug} preset.yml name`).toBeTruthy()
      expect(meta.probe, `${slug} preset.yml probe`).toBeTruthy()
      const skill = await readFile(join(scenariosRoot, slug, 'SKILL.md'), 'utf8')
      expect(skill.length, `${slug} SKILL.md non-empty`).toBeGreaterThan(50)
      out.push(`- preset: ${meta.name}`)

      // Mount: the composition loads as a preset with the retrieval-only surface.
      const preset = byId.get(slug)
      expect(preset, `${slug} on roster`).toBeDefined()
      expect(preset!.broken, `${slug} composes`).toBeUndefined()
      const handle = await context.agents.create({
        sessionId: SessionId(`scenario-${slug}`),
        meta: { cwd: exampleRoot },
        agentOptions: { provider: 'minimax', model: 'MiniMax-M3' },
        setup: async (agentCtx: Context) => void await context.agentPresets.mount(agentCtx, slug),
      })
      const agent: Agent = handle.agent
      const names = context.tools.schemas(agent).map(schema => schema.name).sort()
      expect(names, `${slug} tool surface`).toEqual(['kb_graph_add', 'kb_graph_query', 'kb_ingest', 'kb_ingest_url', 'kb_search', 'kb_stats'])
      out.push(`- tools: ${String(names.length)} kb tools`)

      // Retrieve: the scenario's own corpus answers its probe query with a citation.
      const keyword = meta.probe ?? meta.name!
      const result = await context.tools.execute({
        signal,
        callId: CallId(`call-${++counter}`),
        name: 'kb_search',
        arguments: { query: keyword },
        agent,
      })
      const text = result.content.find(block => block.type === 'text')?.text ?? ''
      const cited = result.value as {
        mode: string
        results: Array<{ chunk_id: number; doc_id: number; source_path: string; chunk_idx: number }>
      }
      // Hard retrieval contract: every probe cites at least one chunk, its
      // own corpus among them, and every cited chunk id stays inside this
      // run's ingested chunk space — DSH_SNAPSHOT=refresh cannot legalize a
      // degraded roster.
      expect(cited.results.length, `${slug} cites at least one chunk`).toBeGreaterThan(0)
      const ownCorpus = cited.results.some(hit => hit.source_path === `scenarios/${slug}/data/corpus.md`)
      expect(ownCorpus, `${slug} cites its own corpus`).toBe(true)
      for (const hit of cited.results) {
        const doc = ingestedDocs.get(hit.doc_id)
        expect(doc, `${slug} citation doc ${hit.doc_id} is an ingested scenario corpus`).toBeDefined()
        expect(hit.source_path, `${slug} citation path`).toBe(`scenarios/${doc!.slug}/data/corpus.md`)
        expect(hit.chunk_idx, `${slug} cited chunk index inside document`).toBeLessThan(doc!.chunks)
      }
      out.push(`- retrieval "${keyword}": own corpus cited`)
      out.push('')
      expect((result.value as { mode: string }).mode).toBe('text')
      expect(text).toMatch(/\[\d+\]/u)
      await handle.dispose()
    }

    while (out.at(-1) === '') out.pop()
    const actual = `${out.join('\n')}\n`
    if (refreshing) {
      await mkdir(snapshotsDir, { recursive: true })
      await writeFile(expectedPath, actual)
    }
    const expected = await readFile(expectedPath, 'utf8')
    expect(actual).toBe(expected)
  }, 60_000)
})
