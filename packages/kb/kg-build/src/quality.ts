/**
 * Build-quality metrics: the pure projection of one pipeline run plus the
 * store's structural readouts into the self-documenting metrics document
 * persisted with every `kg_build_runs` row. Coverage denominators state
 * their own caliber — node coverage divides the tenant's nocobase-derived
 * nodes by the source rows the run observed (collections + lakehouse +
 * connector + corpus documents); edge coverage has no trustworthy
 * denominator in the sources yet (declared fk wiring is per-collection
 * config, not observable per row), so it stays null rather than invented.
 * @module @deepseek-ai/dsh-kg-build/quality
 */

import type { KgBuildRunReport } from './types.ts'

/** The quality metrics document persisted beside every build run. */
export interface KgQualityMetrics {
  /** Live nodes under the tenant at compute time. */
  readonly nodes: number
  /** Live edges under the tenant at compute time. */
  readonly edges: number
  /** Live nodes with zero live edges (both directions) — the island count. */
  readonly islands: number
  /** (src, dst, relation) groups whose live rows assert more than one distinct fact. */
  readonly conflicts: number
  /**
   * Node coverage: nocobase-derived nodes / observed source rows. The
   * denominator sums every collection row, lakehouse table, connector
   * dataset, and corpus document the run saw — each maps to at most one
   * canonical node, so 1.0 means every observed source row landed.
   */
  readonly nodeCoverage: { readonly numerator: number; readonly denominator: number; readonly ratio: number }
  /** Corpus-process counters carried from the run report. */
  readonly degraded: number
  readonly droppedRelations: number
  readonly mergedEntities: number
  readonly tombstonedEdges: number
  readonly computedAt: string
}

/**
 * Compute the quality metrics document.
 * @param structural - the store's live node/edge/island/conflict counts.
 * @param report - the run report the metrics accompany.
 * @param derivedNodes - the tenant's nocobase-derived live node count (the
 * coverage numerator; corpus-only graphs keep coverage at zero).
 * @returns the metrics document.
 */
export function computeQualityMetrics(
  structural: { nodes: number; edges: number; islands: number; conflicts: number },
  report: KgBuildRunReport,
  derivedNodes: number,
): KgQualityMetrics {
  const denominator = report.collections.reduce((sum, entry) => sum + entry.rows, 0)
    + (report.lakehouse?.items ?? 0)
    + (report.connector?.items ?? 0)
    + (report.corpus?.documents ?? 0)
  return {
    nodes: structural.nodes,
    edges: structural.edges,
    islands: structural.islands,
    conflicts: structural.conflicts,
    nodeCoverage: {
      numerator: derivedNodes,
      denominator,
      ratio: denominator === 0 ? 0 : Math.round((derivedNodes / denominator) * 1000) / 1000,
    },
    degraded: report.corpus?.degradedEntities ?? 0,
    droppedRelations: report.corpus?.droppedRelations ?? 0,
    mergedEntities: report.corpus?.mergedEntities ?? 0,
    tombstonedEdges: report.corpus?.tombstonedEdges ?? 0,
    computedAt: new Date().toISOString(),
  }
}
