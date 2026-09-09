/**
 * `kb_graph_query` / `kb_graph_add` through the real registries over the
 * real SQLite graph store: the closed-ontology validation, the three query
 * actions, idempotent adds, and the structured refusal when the seam is
 * absent. The composition carries the kb seam too because tool-kb injects it
 * (its document tools share the plugin).
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as ToolKb from '../src/index.ts'
import { formatGraphQueryOutput, graphOntologySnapshot, parseGraphAddArgs, parseGraphQueryArgs, presentGraphQueryCall, presentGraphQueryResult } from '../src/index.ts'
import type { KbGraphAddArgs, KbGraphQueryToolValue } from '../src/index.ts'

const ontology = graphOntologySnapshot(undefined)

const signal = new AbortController().signal
let counter = 0

async function call(ctx: Context, name: string, args: unknown): Promise<{ isError: boolean; text: string; value: unknown }> {
  const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return { isError: result.isError, text: text?.type === 'text' ? text.text : '', value: result.value }
}

describe('graph argument validation', () => {
  it('rejects unknown entity types and predicates', () => {
    expect(parseGraphQueryArgs({ action: 'neighbors', entity_type: 'planet', entity_id: 'mars' }, ontology).kind).toBe('invalid')
    expect(parseGraphAddArgs({ triples: [{ subject_type: 'company', subject_id: 'a', predicate: 'orbits', object_type: 'planet', object_id: 'mars' }] }, ontology)).toHaveProperty('invalid')
  })

  it('accepts a well-formed neighbors query', () => {
    expect(parseGraphQueryArgs({ action: 'neighbors', entity_type: 'company', entity_id: '宏发食品' }, ontology))
      .toEqual({ kind: 'neighbors', entity: { type: 'company', id: '宏发食品' } })
  })

  it('rejects an unknown action', () => {
    expect(parseGraphQueryArgs({ action: 'delete' }, ontology))
      .toEqual({ kind: 'invalid', reason: 'kb_graph_query: action must be one of neighbors, paths, search' })
  })

  it('rejects a search without a query and with a foreign entity type', () => {
    expect(parseGraphQueryArgs({ action: 'search' }, ontology))
      .toEqual({ kind: 'invalid', reason: 'kb_graph_query: search requires a non-empty query' })
    expect(parseGraphQueryArgs({ action: 'search', query: '   ' }, ontology))
      .toEqual({ kind: 'invalid', reason: 'kb_graph_query: search requires a non-empty query' })
    const foreignType = parseGraphQueryArgs({ action: 'search', query: '酱油', entity_type: 'planet' }, ontology)
    expect(foreignType).toHaveProperty('kind', 'invalid')
    // The enumeration is registry-driven: three layers, food 7×7 included.
    expect((foreignType as { reason: string }).reason).toContain('Object, Process, Event, Role, Concept')
    expect((foreignType as { reason: string }).reason).toContain('company, product, ingredient, additive, standard, process, risk')
  })

  it('accepts a search, trimming the query and clamping the limit', () => {
    expect(parseGraphQueryArgs({ action: 'search', query: '  酱油  ', limit: 99 }, ontology))
      .toEqual({ kind: 'search', query: '酱油', type: undefined, limit: 20 })
    expect(parseGraphQueryArgs({ action: 'search', query: '酱油', limit: 0 }, ontology))
      .toEqual({ kind: 'search', query: '酱油', type: undefined, limit: 1 })
  })

  it('rejects neighbors and paths without entity identification', () => {
    expect(parseGraphQueryArgs({ action: 'neighbors', entity_type: 'company' }, ontology).kind).toBe('invalid')
    expect(parseGraphQueryArgs({ action: 'neighbors', entity_type: 'company', entity_id: '  ' }, ontology).kind).toBe('invalid')
    expect(parseGraphQueryArgs({ action: 'paths', entity_type: 'company', entity_id: '宏发食品' }, ontology).kind).toBe('invalid')
    expect(parseGraphQueryArgs({ action: 'paths', entity_type: 'company', entity_id: '宏发食品', target_type: 'standard' }, ontology).kind).toBe('invalid')
  })

  it('accepts a well-formed paths query', () => {
    expect(parseGraphQueryArgs({ action: 'paths', entity_type: 'company', entity_id: '宏发食品', target_type: 'standard', target_id: 'GB 2760' }, ontology))
      .toEqual({ kind: 'paths', entity: { type: 'company', id: '宏发食品' }, target: { type: 'standard', id: 'GB 2760' } })
  })

  it('rejects empty, oversized, and blank-id add batches', () => {
    expect(parseGraphAddArgs({ triples: [] }, ontology)).toEqual({ invalid: 'kb_graph_add: triples must not be empty' })
    const many = Array.from({ length: 51 }, () => ({ subject_type: 'company', subject_id: 'a', predicate: 'supplies', object_type: 'company', object_id: 'b' }))
    expect(parseGraphAddArgs({ triples: many }, ontology)).toEqual({ invalid: 'kb_graph_add: at most 50 triples per call' })
    expect(parseGraphAddArgs({ triples: [{ subject_type: 'company', subject_id: ' ', predicate: 'supplies', object_type: 'company', object_id: 'b' }] }, ontology))
      .toEqual({ invalid: 'kb_graph_add: subject_id and object_id must be non-empty' })
  })

  it('keeps a trimmed source path on parsed triples', () => {
    const parsed = parseGraphAddArgs({ triples: [{ subject_type: 'company', subject_id: ' 宏发食品 ', predicate: 'produces', object_type: 'product', object_id: '老抽酱油', source_path: '  workspace/data/profiles/hongfa-food.md  ' }] }, ontology)
    expect(parsed).toEqual({
      triples: [{
        subject: { type: 'company', id: '宏发食品' },
        predicate: 'produces',
        object: { type: 'product', id: '老抽酱油' },
        sourcePath: 'workspace/data/profiles/hongfa-food.md',
      }],
    })
  })
})

describe('graph output formatting and presentation', () => {
  it('formats empty and populated outcomes for both actions', () => {
    expect(formatGraphQueryOutput({ action: 'search', entities: [], triples: [] }))
      .toBe('No matching entities. Try a different substring or entity type.')
    expect(formatGraphQueryOutput({ action: 'search', entities: [{ type: 'company', id: '宏发食品' }], triples: [] } as unknown as KbGraphQueryToolValue))
      .toBe('[1] company:宏发食品')
    expect(formatGraphQueryOutput({ action: 'neighbors', triples: [], entities: [] }))
      .toBe('No triples found. Use kb_graph_add to store extracted facts first.')
    expect(formatGraphQueryOutput({
      action: 'paths',
      triples: [
        { subject_type: 'company', subject_id: '宏发食品', predicate: 'produces', object_type: 'product', object_id: '老抽酱油' },
        { subject_type: 'product', subject_id: '老抽酱油', predicate: 'contains', object_type: 'additive', object_id: '苯甲酸钠', source_path: 'workspace/data/regulations/gb2760-excerpt.md' },
      ],
    } as unknown as KbGraphQueryToolValue)).toBe(
      '[1] company:宏发食品 —produces→ product:老抽酱油\n[2] product:老抽酱油 —contains→ additive:苯甲酸钠 (source: workspace/data/regulations/gb2760-excerpt.md)',
    )
  })

  it('presents the pending call as a generic card titled by the action', () => {
    expect(presentGraphQueryCall({ action: 'search', query: '酱油' }))
      .toEqual({ card: 'generic', title: 'kb_graph_query search', kind: 'search', rawInput: 'search' })
  })

  it('presents the completed call from the counts meta, and declines failures and missing meta', () => {
    expect(presentGraphQueryResult({ action: 'search' }, { isError: true } as never)).toBeUndefined()
    expect(presentGraphQueryResult({ action: 'search' }, { isError: false } as never)).toBeUndefined()
    expect(presentGraphQueryResult({ action: 'search' }, { isError: false, meta: {} } as never)).toBeUndefined()
    expect(presentGraphQueryResult({ action: 'search' }, { isError: false, meta: { action: 'search', entities: 3 } } as never))
      .toEqual({ card: 'generic', title: 'kb_graph_query search', content: [{ type: 'text', text: '3 entities' }] })
    expect(presentGraphQueryResult({ action: 'neighbors' }, { isError: false, meta: { action: 'neighbors', triples: 2 } } as never))
      .toEqual({ card: 'generic', title: 'kb_graph_query neighbors', content: [{ type: 'text', text: '2 triples' }] })
  })
})

describe('kb_graph tools through the real seam', () => {
  let ctx: Context
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'kb-graph-tools-'))
    ctx = new Context()
    await ctx.plugin(SystemPrompt, { persona: '' })
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(KbRuntime)
    await ctx.plugin(KbSqlite, { path: join(root, 'kb.sqlite') })
    await ctx.plugin(LocalFileSystem, { cwd: root })
    await ctx.plugin(KbGraphRuntime)
    await ctx.plugin(KbGraphSqlite, { path: join(root, 'graph.sqlite') })
    await ctx.plugin(ToolKb, { tenant: 'demo-food-co' })
  })

  afterEach(async () => {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })

  it('answers the concurrency mode, invalid-arg refusals, and presentation wrappers through the registry', async () => {
    // Graph queries never mutate agent state: the scheduler may run them parallel.
    const registered = ctx.tools.get('kb_graph_query')
    expect(registered?.isConcurrencySafe?.({ action: 'search', query: '酱油' })).toBe(true)
    const invalid = await call(ctx, 'kb_graph_query', { action: 'delete' })
    expect(invalid.isError).toBe(true)
    expect(invalid.text).toContain('action must be one of neighbors, paths, search')
    const tool = ctx.tools.get('kb_graph_query')
    expect(tool?.presentCall?.({ action: 'search', query: '酱油' })).toMatchObject({ title: 'kb_graph_query search' })
    const resultOf = (meta: unknown): { content: Array<{ type: 'text'; text: string }>; isError: boolean; meta?: unknown } =>
      ({ content: [{ type: 'text', text: 'ok' }], isError: false, meta })
    expect(tool?.presentResult?.({ action: 'search' }, resultOf({ action: 'search', entities: 3 }) as never))
      .toMatchObject({ content: [{ type: 'text', text: '3 entities' }] })
    // A meta without counts still renders zero.
    expect(tool?.presentResult?.({ action: 'search' }, resultOf({ action: 'search' }) as never))
      .toMatchObject({ content: [{ type: 'text', text: '0 entities' }] })
    expect(tool?.presentResult?.({ action: 'neighbors' }, resultOf({ action: 'neighbors' }) as never))
      .toMatchObject({ content: [{ type: 'text', text: '0 triples' }] })
    // The add tool: invalid batches refuse through execute, and both wrappers render.
    const invalidAdd = await call(ctx, 'kb_graph_add', { triples: [] })
    expect(invalidAdd.isError).toBe(true)
    expect(invalidAdd.text).toContain('triples must not be empty')
    const addTool = ctx.tools.get('kb_graph_add')
    const oneTriple = { subject_type: 'company', subject_id: 'a', predicate: 'supplies', object_type: 'company', object_id: 'b' }
    expect(addTool?.presentCall?.({ triples: [oneTriple, oneTriple] })).toMatchObject({ title: 'kb_graph_add 2 triples', kind: 'edit' })
    expect(addTool?.presentResult?.({ triples: [oneTriple, oneTriple] }, resultOf({ inserted: 1, total: 2 }) as never))
      .toMatchObject({ content: [{ type: 'text', text: '1 new / 2 submitted' }] })
    expect(addTool?.presentResult?.({ triples: [oneTriple] }, { content: [], isError: true })).toBeUndefined()
    expect(addTool?.presentResult?.({ triples: [oneTriple] }, resultOf(undefined) as never)).toBeUndefined()
    // A meta without counts still renders zeros.
    expect(addTool?.presentResult?.({ triples: [oneTriple] }, resultOf({}) as never))
      .toMatchObject({ content: [{ type: 'text', text: '0 new / 0 submitted' }] })
  })

  it('adds triples idempotently and answers neighbors, paths, and search', async () => {
    const triples: KbGraphAddArgs['triples'] = [
      { subject_type: 'company', subject_id: '宏发食品', predicate: 'produces', object_type: 'product', object_id: '老抽酱油', source_path: 'workspace/data/profiles/hongfa-food.md' },
      { subject_type: 'product', subject_id: '老抽酱油', predicate: 'contains', object_type: 'additive', object_id: '苯甲酸钠' },
    ]
    const first = await call(ctx, 'kb_graph_add', { triples })
    expect(first.isError).toBe(false)
    expect(first.value).toEqual({ inserted: 2, total: 2 })
    const again = await call(ctx, 'kb_graph_add', { triples })
    expect(again.value).toEqual({ inserted: 0, total: 2 })

    const neighbors = await call(ctx, 'kb_graph_query', { action: 'neighbors', entity_type: 'company', entity_id: '宏发食品' })
    expect(neighbors.text).toContain('宏发食品')
    expect(neighbors.text).toContain('produces')

    const paths = await call(ctx, 'kb_graph_query', { action: 'paths', entity_type: 'company', entity_id: '宏发食品', target_type: 'additive', target_id: '苯甲酸钠' })
    expect(paths.text).toContain('produces')
    expect(paths.text).toContain('contains')

    const search = await call(ctx, 'kb_graph_query', { action: 'search', query: '酱油' })
    expect(search.text).toContain('product:老抽酱油')
  })

  it('fails with a structured error when no graph seam is composed', async () => {
    const bare = new Context()
    await bare.plugin(SystemPrompt, { persona: '' })
    await bare.plugin(ToolRuntime)
    await bare.plugin(KbRuntime)
    await bare.plugin(KbSqlite, { path: ':memory:' })
    await bare.plugin(LocalFileSystem, { cwd: root })
    await bare.plugin(ToolKb, { tenant: 'demo-food-co' })
    const refusal = await call(bare, 'kb_graph_query', { action: 'search', query: 'x' })
    expect(refusal.isError).toBe(true)
    expect(refusal.text).toContain('no knowledge-graph service')
    await bare.fiber.dispose()
  })
})
