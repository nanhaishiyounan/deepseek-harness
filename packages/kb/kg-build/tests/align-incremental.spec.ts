/**
 * Alignment and incremental-scheduling tests: normalization, Jaro-Winkler
 * thresholds, gray-zone LLM adjudication, snapshot fingerprints, skip plans,
 * new-row watermarks, and disappeared-key tombstone targets.
 */

import { describe, expect, it, vi } from 'vitest'
import { kgNodeTypeId } from '@deepseek-ai/dsh-kb-graph'
import { DEFAULT_AUTO_THRESHOLD, alignEntity, jaroWinkler, normalizeName } from '../src/align.ts'
import type { AlignGraphFace } from '../src/align.ts'
import { fingerprintRows, planScopeRun, priorStateOf, sha256Hex } from '../src/incremental.ts'

const TYPE = kgNodeTypeId('experts')

/** A scripted alignment graph face over an in-memory canonical roster. */
function graphFace(nodes: Array<{ id: string; name: string }>): AlignGraphFace & { aliases: Array<[string, string]> } {
  const aliases: Array<[string, string]> = []
  return {
    aliases,
    searchNodes: async (tenant, query, type, limit) => {
      expect(tenant).toBe('t')
      expect(String(type)).toBe('experts')
      return nodes
        .filter(node => node.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit)
        .map(node => ({ id: node.id, type: TYPE, name: node.name }))
    },
    putAlias: async (_tenant, _type, alias, nodeId) => {
      aliases.push([alias, nodeId])
    },
  }
}

describe('normalizeName', () => {
  it('folds width, case, whitespace, parentheticals, and company suffixes', () => {
    expect(normalizeName('宏发食品（香港）有限公司')).toBe('宏发食品')
    expect(normalizeName('  ＭａｃｒｏＦｏｏｄ  ')).toBe('macrofood')
    expect(normalizeName('珠海华丰食品股份有限公司')).toBe('珠海华丰食品')
  })
})

describe('jaroWinkler', () => {
  it('handles empty inputs, transpositions, and later weaker candidates', () => {
    expect(jaroWinkler('', 'x')).toBe(0)
    // A matched-but-swapped pair accrues transpositions on the 92-line.
    const swapped = jaroWinkler('abcd', 'zbadc')
    expect(swapped).toBeGreaterThan(0.5)
    expect(swapped).toBeLessThan(1)
  })

  it('keeps the stronger candidate when a later one scores lower', async () => {
    const face = graphFace([
      { id: 'nocobase:experts:1', name: '张红喜会长' },
      { id: 'nocobase:experts:2', name: '张红喜ZZZZ' },
    ])
    const decision = await alignEntity(face, 't', TYPE, '张红喜会', { autoThreshold: 0.99, grayFloor: 0.3 })
    expect(decision.canonicalId).toBeUndefined()
    expect(face.aliases).toHaveLength(0)
  })

  it('scores identity, disjoint, and near-miss pairs monotonically', () => {
    expect(jaroWinkler('宏发食品', '宏发食品')).toBe(1)
    expect(jaroWinkler('宏发食品', '完全不相干')).toBeLessThan(0.5)
    const near = jaroWinkler('宏发食品', '宏发食品货运代理服务')
    expect(near).toBeGreaterThan(0.7)
    expect(near).toBeLessThan(DEFAULT_AUTO_THRESHOLD)
  })
})

describe('alignEntity', () => {
  it('merges an exact normalized name without a fuzzy pass', async () => {
    const face = graphFace([{ id: 'nocobase:experts:1', name: '张红喜' }])
    const decision = await alignEntity(face, 't', TYPE, '张红喜')
    expect(decision.canonicalId).toBe('nocobase:experts:1')
    expect(decision.llmAdjudicated).toBe(false)
    expect(face.aliases).toHaveLength(0)
  })

  it('auto-merges above the threshold and binds the alias', async () => {
    const face = graphFace([{ id: 'nocobase:experts:1', name: '张红喜会长' }])
    const decision = await alignEntity(face, 't', TYPE, '张红喜会', { autoThreshold: 0.75 })
    expect(decision.canonicalId).toBe('nocobase:experts:1')
    expect(face.aliases).toEqual([['张红喜会', 'nocobase:experts:1']])
  })

  it('leaves gray-zone names unmerged without an adjudicator', async () => {
    const face = graphFace([{ id: 'nocobase:experts:1', name: '张红喜会长' }])
    const decision = await alignEntity(face, 't', TYPE, '张红喜会', { autoThreshold: 0.99, grayFloor: 0.3 })
    expect(decision.canonicalId).toBeUndefined()
    expect(face.aliases).toHaveLength(0)
  })

  it('routes gray-zone names through the adjudicating LLM', async () => {
    const face = graphFace([{ id: 'nocobase:experts:1', name: '张红喜会长' }])
    const adjudicateSame = vi.fn(async () => true)
    const decision = await alignEntity(face, 't', TYPE, '张红喜会', {
      autoThreshold: 0.99,
      grayFloor: 0.3,
      llm: { adjudicateSame },
    })
    expect(adjudicateSame).toHaveBeenCalledTimes(1)
    expect(decision.canonicalId).toBe('nocobase:experts:1')
    expect(decision.llmAdjudicated).toBe(true)
  })

  it('keeps gray-zone names separate when the adjudicator refuses', async () => {
    const face = graphFace([{ id: 'nocobase:experts:1', name: '张红喜会长' }])
    const adjudicateSame = vi.fn(async () => false)
    const decision = await alignEntity(face, 't', TYPE, '张红喜会', {
      autoThreshold: 0.99,
      grayFloor: 0.3,
      llm: { adjudicateSame },
    })
    expect(adjudicateSame).toHaveBeenCalledTimes(1)
    expect(decision.canonicalId).toBeUndefined()
    expect(decision.llmAdjudicated).toBe(false)
    expect(face.aliases).toHaveLength(0)
  })

  it('returns nothing for an empty normalized name or no candidates', async () => {
    const empty = await alignEntity(graphFace([]), 't', TYPE, '（空）')
    expect(empty.canonicalId).toBeUndefined()
    const none = await alignEntity(graphFace([{ id: 'x', name: '完全不同' }]), 't', TYPE, '张红喜')
    expect(none.canonicalId).toBeUndefined()
  })
})

describe('incremental planning', () => {
  const ROWS = [
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: 5, name: 'e' },
  ]

  it('fingerprints snapshots stably and order-independently over the pk', () => {
    expect(fingerprintRows(ROWS, 'id')).toBe(fingerprintRows([...ROWS].reverse(), 'id'))
    expect(fingerprintRows(ROWS, 'id')).not.toBe(fingerprintRows([...ROWS, { id: 9, name: 'x' }], 'id'))
    expect(sha256Hex('x')).toHaveLength(64)
  })

  it('reads prior state from a run row, degrading on unreadable config', () => {
    const state = priorStateOf({
      sourceSystem: 'nocobase', scope: 'experts', watermark: '5',
      contentHash: 'h', runConfig: JSON.stringify({ knownIds: ['1', '2'] }),
      lastRunAt: 'now',
    })
    expect(state).toEqual({ watermark: '5', contentHash: 'h', knownIds: ['1', '2'] })
    expect(priorStateOf(undefined)).toEqual({ knownIds: [] })
    const degraded = priorStateOf({
      sourceSystem: 'nocobase', scope: 'experts', runConfig: 'not json', lastRunAt: 'now',
    })
    expect(degraded.knownIds).toEqual([])
  })

  it('plans a skip when nothing changed since the prior run', () => {
    const prior = {
      watermark: '5',
      contentHash: fingerprintRows(ROWS, 'id'),
      knownIds: ['1', '2', '5'],
    }
    const plan = planScopeRun(ROWS, 'id', prior)
    expect(plan.skip).toBe(true)
    expect(plan.newRows).toBe(0)
    expect(plan.disappeared).toEqual([])
  })

  it('counts new rows over the watermark and tombstones disappeared keys', () => {
    const prior = {
      watermark: '2',
      contentHash: 'stale',
      knownIds: ['1', '2', '5', '7'],
    }
    const plan = planScopeRun(ROWS, 'id', prior)
    expect(plan.skip).toBe(false)
    expect(plan.newRows).toBe(1)
    expect(plan.watermark).toBe('5')
    expect(plan.disappeared).toEqual(['7'])
    expect(JSON.parse(plan.runConfig)).toEqual({ knownIds: ['1', '2', '5'] })
  })

  it('covers fingerprint and plan edge branches', () => {
    expect(fingerprintRows([{ noPk: 1 }], 'id')).toHaveLength(64)
    // A non-numeric prior watermark falls back to counting every row as new.
    const weird = planScopeRun(ROWS, 'id', { watermark: 'abc', contentHash: 'x', knownIds: [] })
    expect(weird.newRows).toBe(3)
    // Same hash and ids but a stale watermark: the skip verdict stays false.
    const stale = planScopeRun(ROWS, 'id', {
      watermark: '2',
      contentHash: fingerprintRows(ROWS, 'id'),
      knownIds: ['1', '2', '5'],
    })
    expect(stale.skip).toBe(false)
    expect(stale.watermark).toBe('5')
  })

  it('handles string primary keys without digits', () => {
    const rows = [{ code: 'b' }, { code: 'a' }]
    const plan = planScopeRun(rows, 'code', { knownIds: ['a', 'z'] })
    expect(plan.watermark).toBe('b')
    expect(plan.disappeared).toEqual(['z'])
  })
})
