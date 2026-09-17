/**
 * The quality-metrics projection: the coverage denominator sums every
 * observed source row (collections + lakehouse + connector + corpus), the
 * ratio rounds to three decimals with a zero-denominator guard, and the
 * corpus-process counters fall back to zero when a leg did not run.
 */

import { describe, expect, it } from 'vitest'
import { computeQualityMetrics } from '../src/quality.ts'
import type { KgBuildRunReport } from '../src/types.ts'

function reportOf(overrides: Partial<KgBuildRunReport> = {}): KgBuildRunReport {
  return {
    collections: [
      { scope: 'experts', rows: 10, nodesUpserted: 10, edgesUpserted: 0, newRows: 10, tombstoned: 0, skipped: false, watermark: 'w1', contentHash: 'c1', skippedRelationFields: [] },
      { scope: 'orders', rows: 5, nodesUpserted: 5, edgesUpserted: 3, newRows: 5, tombstoned: 0, skipped: false, watermark: 'w2', contentHash: 'c2', skippedRelationFields: ['orders.note'] },
    ],
    lakehouse: { scope: 'catalog', items: 4, nodesUpserted: 4, edgesUpserted: 0, skipped: false, contentHash: 'h1' },
    connector: { scope: 'datasets', items: 2, nodesUpserted: 2, edgesUpserted: 0, skipped: false, contentHash: 'h2' },
    corpus: {
      documents: 3, chunks: 6, extractionCalls: 3, extractedEntities: 9, extractedRelations: 7,
      degradedEntities: 1, droppedRelations: 2, mergedEntities: 1, tombstonedEdges: 0, tombstonedScopes: 0,
    },
    persistedTypes: 2,
    persistedRelations: 0,
    ruleHits: { R01: 2 },
    startedAt: '2026-09-15T00:00:00.000Z',
    finishedAt: '2026-09-15T00:01:00.000Z',
    ...overrides,
  }
}

describe('computeQualityMetrics', () => {
  it('carries the structural counters and the corpus-process tallies', () => {
    const metrics = computeQualityMetrics(
      { nodes: 40, edges: 12, islands: 3, conflicts: 1 },
      reportOf(),
      20,
    )
    expect(metrics.nodes).toBe(40)
    expect(metrics.edges).toBe(12)
    expect(metrics.islands).toBe(3)
    expect(metrics.conflicts).toBe(1)
    expect(metrics.degraded).toBe(1)
    expect(metrics.droppedRelations).toBe(2)
    expect(metrics.mergedEntities).toBe(1)
    expect(metrics.tombstonedEdges).toBe(0)
  })

  it('divides derived nodes by every observed source row and rounds the ratio', () => {
    // 10 + 5 collection rows + 4 lakehouse + 2 connector + 3 corpus documents.
    const metrics = computeQualityMetrics({ nodes: 0, edges: 0, islands: 0, conflicts: 0 }, reportOf(), 21)
    expect(metrics.nodeCoverage).toEqual({ numerator: 21, denominator: 24, ratio: 0.875 })
  })

  it('guards the zero-denominator corpus-only graph', () => {
    const corpusOnly: KgBuildRunReport = {
      collections: [],
      corpus: {
        documents: 3, chunks: 6, extractionCalls: 3, extractedEntities: 9, extractedRelations: 7,
        degradedEntities: 1, droppedRelations: 2, mergedEntities: 1, tombstonedEdges: 0, tombstonedScopes: 0,
      },
      persistedTypes: 2,
      persistedRelations: 0,
      ruleHits: { R01: 2 },
      startedAt: '2026-09-15T00:00:00.000Z',
      finishedAt: '2026-09-15T00:01:00.000Z',
    }
    const metrics = computeQualityMetrics({ nodes: 9, edges: 4, islands: 2, conflicts: 0 }, corpusOnly, 0)
    expect(metrics.nodeCoverage).toEqual({ numerator: 0, denominator: 3, ratio: 0 })
    const { corpus: _corpus, ...noCorpus } = corpusOnly
    const empty = computeQualityMetrics({ nodes: 0, edges: 0, islands: 0, conflicts: 0 }, noCorpus, 0)
    expect(empty.nodeCoverage.ratio).toBe(0)
  })
})
