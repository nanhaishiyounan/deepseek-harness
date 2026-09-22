/**
 * KGCL-style change primitives over the graph and the ontology registry: a
 * closed discriminated union of {@link KgGraphChangeOp} (the instance-level
 * ops the `kg_edit` tool plans and applies) and {@link KgOntologyChangeOp}
 * (the schema-level ops a future ontology-editing surface plans), plus the
 * preview document both render. Op semantics follow the KGCL paper's
 * EdgeCreation/EdgeDeletion/NodeObsoletion naming, reduced to what this
 * store can execute transactionally; nothing here touches state — planning,
 * validation, and application stay separate steps.
 * @module @deepseek-ai/dsh-kb-graph/kgcl
 */

import type { KgRelationId } from './types.ts'

/** One node the diff names, with before/after snapshots where meaningful. */
export interface KgDiffNodeRef {
  /** Minted node id (resolved before apply; the plan phase may still carry names). */
  readonly id: string
  readonly name: string
  /** Claimed registry type id, when the plan names one for a node that must be created. */
  readonly type?: string
}

/** One planned edge addition (KGCL EdgeCreation). */
export interface KgAddEdgeOp {
  readonly op: 'add_edge'
  readonly relation: KgRelationId
  readonly src: KgDiffNodeRef
  readonly dst: KgDiffNodeRef
  /** Human-readable fact sentence stored on the edge. */
  readonly fact?: string
}

/** One planned edge removal (KGCL EdgeDeletion — semantically: invalidate). */
export interface KgRemoveEdgeOp {
  readonly op: 'remove_edge'
  readonly relation: KgRelationId
  readonly src: KgDiffNodeRef
  readonly dst: KgDiffNodeRef
}

/** One planned property overwrite on a node. */
export interface KgSetNodePropsOp {
  readonly op: 'set_node_props'
  readonly target: KgDiffNodeRef
  readonly props: Readonly<Record<string, unknown>>
}

/** The closed instance-graph change vocabulary `kg_edit` can plan. */
export type KgGraphChangeOp = KgAddEdgeOp | KgRemoveEdgeOp | KgSetNodePropsOp

/**
 * The closed ontology-registry change vocabulary (schema level). One op names
 * one registry-row transition: `add_node` registers a fresh domain class
 * (optionally under a parent), `rename_node` retargets the display label,
 * `set_parent` re-hangs a class in the subClassOf tree, `deprecate_node` is
 * the KGCL NodeObsoletion (instances and history survive), and
 * `change_cardinality` rewrites one legal (domain, range) pair's bounds.
 */
export type KgOntologyChangeOp =
  | { readonly op: 'add_node'; readonly targetId: string; readonly label: string; readonly parentId?: string }
  | { readonly op: 'rename_node'; readonly targetId: string; readonly label: string }
  | { readonly op: 'set_parent'; readonly targetId: string; readonly newParentId: string }
  | { readonly op: 'deprecate_node'; readonly targetId: string; readonly replacedBy?: string }
  | { readonly op: 'change_cardinality'; readonly relationId: KgRelationId; readonly domainId: string; readonly rangeId: string; readonly min?: number; readonly max?: number }

/** One rendered diff entry: the op plus its preview text and direction marker. */
export interface KgChangeDiffEntry {
  readonly op: KgGraphChangeOp
  /** `+` for additions, `−` for removals, `~` for mutations. */
  readonly marker: '+' | '−' | '~'
  readonly preview: string
}

/** The full diff preview a proposal renders (what the confirmation gate shows). */
export interface KgChangeDiff {
  readonly entries: readonly KgChangeDiffEntry[]
}

/**
 * Render one change op as its preview sentence.
 * @param op - the planned op.
 * @returns the human-readable one-liner.
 */
export function previewOfOp(op: KgGraphChangeOp): string {
  switch (op.op) {
    case 'add_edge':
      return `新增关系 ${op.src.name} —[${String(op.relation)}]→ ${op.dst.name}`
    case 'remove_edge':
      return `移除关系 ${op.src.name} —[${String(op.relation)}]→ ${op.dst.name}`
    case 'set_node_props':
      return `更新实体 ${op.target.name} 的属性：${JSON.stringify(op.props)}`
  }
}

/**
 * Build the diff preview document for a change set.
 * @param ops - the planned ops.
 * @returns the diff with one rendered entry per op.
 */
export function buildChangeDiff(ops: readonly KgGraphChangeOp[]): KgChangeDiff {
  return {
    entries: ops.map((op) => {
      const marker: KgChangeDiffEntry['marker'] = op.op === 'add_edge' ? '+' : op.op === 'remove_edge' ? '−' : '~'
      return { op, marker, preview: previewOfOp(op) }
    }),
  }
}

/**
 * Render the diff as the plain-text block the confirmation UI and the model
 * transcript show (one line per entry, markers preserved).
 * @param diff - the diff document.
 * @returns the preview text.
 */
export function formatChangeDiff(diff: KgChangeDiff): string {
  return diff.entries.map(entry => `${entry.marker} ${entry.preview}`).join('\n')
}

/**
 * Render one ontology change op as its preview sentence (the ontology
 * editor's confirm step and the episode ledger share the wording).
 * @param op - the planned schema-level op.
 * @returns the human-readable one-liner.
 */
export function previewOfOntologyOp(op: KgOntologyChangeOp): string {
  switch (op.op) {
    case 'add_node':
      return op.parentId === undefined
        ? `新增类 ${op.targetId}（${op.label}）`
        : `新增类 ${op.targetId}（${op.label}）挂在 ${op.parentId} 下`
    case 'rename_node':
      return `类 ${op.targetId} 改名为「${op.label}」`
    case 'set_parent':
      return `类 ${op.targetId} 的父类改为 ${op.newParentId}`
    case 'deprecate_node':
      return op.replacedBy === undefined
        ? `废弃类 ${op.targetId}`
        : `废弃类 ${op.targetId}（替代 ${op.replacedBy}）`
    case 'change_cardinality': {
      const bounds = `${String(op.min ?? 0)}..${op.max === undefined ? 'n' : String(op.max)}`
      return `关系 ${String(op.relationId)} 的 ${op.domainId}→${op.rangeId} 基数改为 ${bounds}`
    }
  }
}

/**
 * Render an ontology change set as the plain-text block the confirmation
 * gate shows and the human-edit episode stores.
 * @param ops - the planned schema-level ops.
 * @returns one preview line per op.
 */
export function formatOntologyChange(ops: readonly KgOntologyChangeOp[]): string {
  return ops.map(op => `~ ${previewOfOntologyOp(op)}`).join('\n')
}
